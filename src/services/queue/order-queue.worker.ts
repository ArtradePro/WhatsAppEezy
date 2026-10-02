import { Worker, Queue, Job } from 'bullmq';
import IORedis from 'ioredis';
import { EventEmitter } from 'events';
import { vendorProductIngestionService } from '../vendor/vendor-product-ingestion.service';
import { xeroEngineService } from '../accounting/xero-engine.service';
import { whatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { postgresOrderRepository } from '../../database/postgres-order.repository';
import { postgresVendorRepository } from '../../database/postgres-vendor.repository';
import { DbVendor } from '../../types/database.types';
import { saasSubscriptionBillingService } from '../revenue/saas-subscription-billing.service';

export const ORDER_QUEUE_NAME = 'order-tasks';

export type OrderJobName =
  | 'PROCESS_CATALOG_INGESTION'
  | 'PROCESS_IMAGE_CATALOG'
  | 'SYNC_XERO_TRANSACTION'
  | 'DISPATCH_WHATSAPP_ALERT'
  | 'BILL_SAAS_SUBSCRIPTION';

export interface ProcessImageCatalogJobData {
  senderWaId: string;
  mediaId: string;
  caption?: string;
}

export interface SyncXeroTransactionJobData {
  orderId: string;
  vendorId?: string;
}

export interface DispatchWhatsAppAlertJobData {
  recipientPhone: string;
  messageType: 'text' | 'interactive_buttons' | 'draft_preview';
  text?: string;
  interactive?: {
    headerText?: string;
    bodyText: string;
    footerText?: string;
    buttons: Array<{ id: string; title: string }>;
  };
  draftPreview?: {
    productId: string;
    title: string;
    unitPrice: number;
    unitOfMeasure: string;
    description: string;
    enhancedImageUrl: string;
  };
}

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const hasLiveRedis = Boolean(process.env.REDIS_URL);

// Connect to Railway internal Redis using REDIS_URL
export const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: (times) => {
    if (process.env.NODE_ENV === 'test' || !hasLiveRedis) {
      return null;
    }
    return Math.min(times * 100, 3000);
  },
});

redisConnection.on('error', () => {
  // Gracefully absorb connection issues when Redis server is offline
});

export const orderQueue = new Queue(ORDER_QUEUE_NAME, {
  connection: redisConnection,
});
orderQueue.on('error', () => {});

export class OrderQueueManager {
  public eventEmitter = new EventEmitter();

  constructor() {
    this.setupFallback();
  }

  private setupFallback() {
    this.eventEmitter.on('dispatch_local', async ({ name, data }: { name: OrderJobName; data: any }) => {
      try {
        const result = await this.processJob(name, data);
        this.eventEmitter.emit('job_completed', { name, data, result });
      } catch (err: any) {
        this.eventEmitter.emit('job_failed', { name, data, error: err });
      }
    });
  }

  /**
   * Core Background Job Processor
   */
  async processJob(jobName: OrderJobName, data: any): Promise<any> {
    switch (jobName) {
      case 'PROCESS_CATALOG_INGESTION':
      case 'PROCESS_IMAGE_CATALOG': {
        // Run Sharp image normalizer (1024x1024 #F8F9FA) & Vision AI attribute extraction
        const payload = data as ProcessImageCatalogJobData;
        console.log(`🖼️ [OrderWorker:${jobName}] Processing image catalog upload for vendor ${payload.senderWaId}`);
        const result = await vendorProductIngestionService.handleVendorInboundImage(payload.senderWaId, {
          from: payload.senderWaId,
          id: `wamid_${Date.now()}`,
          timestamp: `${Date.now()}`,
          type: 'image',
          image: {
            id: payload.mediaId,
            caption: payload.caption,
          },
        });
        return { success: result, jobName };
      }

      case 'SYNC_XERO_TRANSACTION': {
        // Generate Xero commission invoice & supplier payout bill
        const payload = data as SyncXeroTransactionJobData;
        console.log(`📑 [OrderWorker] Synchronizing Xero transaction for order ${payload.orderId}`);
        let order = await postgresOrderRepository.findById(payload.orderId);
        if (!order) {
          order = await postgresOrderRepository.findByOrderRef(payload.orderId);
        }

        let vendor: DbVendor | null = null;
        if (order?.vendor_id) {
          vendor = await postgresVendorRepository.findById(order.vendor_id);
        } else if (payload.vendorId) {
          vendor = await postgresVendorRepository.findById(payload.vendorId);
        }

        if (order) {
          const syncResult = await xeroEngineService.syncOrderPaid({ order, vendor });
          return {
            success: true,
            platformInvoice: syncResult.platformInvoice,
            settlementBill: syncResult.settlementBill,
            vendorContactId: syncResult.vendorContactId,
          };
        }
        return { success: false, status: 'ORDER_NOT_FOUND', orderId: payload.orderId };
      }

      case 'DISPATCH_WHATSAPP_ALERT': {
        // Dispatch Meta Cloud API interactive messages
        const payload = data as DispatchWhatsAppAlertJobData;
        console.log(`📲 [OrderWorker] Dispatching WhatsApp alert to ${payload.recipientPhone}`);

        if (payload.messageType === 'text' && payload.text) {
          const messageId = await whatsAppClientService.sendTextMessage(payload.recipientPhone, payload.text);
          return { success: true, messageId };
        } else if (payload.messageType === 'interactive_buttons' && payload.interactive) {
          const messageId = await whatsAppClientService.sendInteractiveButtons(
            payload.recipientPhone,
            payload.interactive.bodyText,
            payload.interactive.buttons
          );
          return { success: true, messageId };
        } else if (payload.messageType === 'draft_preview' && payload.draftPreview) {
          const messageId = await whatsAppClientService.sendProductDraftInteractivePreview(
            payload.recipientPhone,
            payload.draftPreview
          );
          return { success: true, messageId };
        }
        return { success: false, status: 'SKIPPED' };
      }

      case 'BILL_SAAS_SUBSCRIPTION': {
        // Monthly SaaS Subscription Billing (Xero recurring invoice / Ledger Set-Off / PayFast Tokenized Ad-Hoc)
        const payload = (data || {}) as {
          vendorId?: string;
          billingCycle?: string;
          forceCollectionMethod?: 'LEDGER_SETOFF' | 'PAYFAST_TOKENIZED_ADHOC' | 'XERO_RECURRING_INVOICE';
        };
        if (payload.vendorId) {
          const record = await saasSubscriptionBillingService.billVendorMonthlySubscription({
            vendorId: payload.vendorId,
            billingCycle: payload.billingCycle,
            forceCollectionMethod: payload.forceCollectionMethod,
          });
          return { success: true, record };
        } else {
          const records = await saasSubscriptionBillingService.runMonthlySubscriptionCycleForAllVendors(
            payload.billingCycle
          );
          return { success: true, count: records.length, records };
        }
      }

      default:
        console.warn(`[OrderWorker] Unknown job name: ${jobName}`);
        return { success: false, status: 'UNKNOWN_JOB' };
    }
  }

  /**
   * Helper to dispatch job to BullMQ with instant local fallback
   */
  async enqueue(name: OrderJobName, data: any): Promise<void> {
    if (hasLiveRedis) {
      try {
        await orderQueue.add(name, data, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        });
        return;
      } catch {
        // Fall back to local execution
      }
    }

    setImmediate(() => {
      this.eventEmitter.emit('dispatch_local', { name, data });
    });
  }

  async close(): Promise<void> {
    try {
      await orderWorker.close();
    } catch {
      // ignore
    }
    try {
      await orderQueue.close();
    } catch {
      // ignore
    }
    try {
      if (redisConnection.status === 'ready' || redisConnection.status === 'connecting') {
        await redisConnection.quit();
      }
    } catch {
      // ignore
    }
  }
}

export const orderQueueManager = new OrderQueueManager();

// Async Background Processor matching requested signature
export const orderWorker = new Worker(
  ORDER_QUEUE_NAME,
  async (job: Job) => {
    return orderQueueManager.processJob(job.name as OrderJobName, job.data);
  },
  {
    connection: redisConnection,
    concurrency: 5,
    autorun: Boolean(hasLiveRedis && process.env.NODE_ENV !== 'test'),
  }
);
orderWorker.on('error', () => {});
