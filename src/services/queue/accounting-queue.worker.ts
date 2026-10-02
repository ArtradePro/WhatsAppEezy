import { Queue, Worker, Job } from 'bullmq';
import { EventEmitter } from 'events';
import { OrderPaidEventPayload } from '../../types/accounting.types';
import { accountingReconciliationService } from '../accounting/accounting-reconciliation.service';
import { xeroEngineService } from '../accounting/xero-engine.service';
import { postgresOrderRepository } from '../../database/postgres-order.repository';
import { postgresVendorRepository } from '../../database/postgres-vendor.repository';
import { DbOrder, DbVendor } from '../../types/database.types';
import { payFastEventEmitter } from '../events/payfast-events';

export const QUEUE_NAME = 'accounting-reconciliation-queue';
export const JOB_ORDER_PAID = 'ORDER_PAID';

export class AccountingQueueWorker {
  private queue?: Queue;
  private worker?: Worker;
  private eventEmitter = new EventEmitter();
  private isRedisConnected = false;

  constructor() {
    this.initQueue();
    this.initEventListeners();
  }

  private initQueue() {
    const redisHost = process.env.REDIS_HOST;
    const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;

    if (redisHost) {
      try {
        const connection = { host: redisHost, port: redisPort, maxRetriesPerRequest: null };
        this.queue = new Queue(QUEUE_NAME, { connection });
        this.worker = new Worker(
          QUEUE_NAME,
          async (job: Job) => {
            if (job.name === JOB_ORDER_PAID) {
              await this.processOrderPaid(job.data as OrderPaidEventPayload);
            }
          },
          { connection }
        );

        this.worker.on('completed', (job) => {
          console.log(`[BullMQ] Accounting Job ${job.id} (${job.name}) completed successfully`);
        });

        this.worker.on('failed', (job, err) => {
          console.error(`[BullMQ] Accounting Job ${job?.id} failed:`, err);
        });

        this.isRedisConnected = true;
      } catch (err) {
        console.warn('[BullMQ] Redis connection unavailable, running with in-memory resilient event bus fallback');
        this.setupFallback();
      }
    } else {
      this.setupFallback();
    }
  }

  private setupFallback() {
    this.eventEmitter.on(JOB_ORDER_PAID, async (payload: OrderPaidEventPayload) => {
      try {
        await this.processOrderPaid(payload);
      } catch (error) {
        console.error('[AccountingWorker Fallback] Failed to process order paid:', error);
      }
    });
  }

  private initEventListeners() {
    // Listen directly to PayFast typed event emitter for real-time accounting triggers
    payFastEventEmitter.onOrderPaid(async (event) => {
      try {
        await xeroEngineService.syncOrderPaid({
          order: event.order,
          vendor: event.vendor,
        });
      } catch (err) {
        console.warn('[AccountingWorker] payFastEventEmitter Xero sync warning:', err);
      }
    });
  }

  /**
   * Processes Order Paid event:
   * 1. Reconciles via internal double-entry reconciliation service
   * 2. Synchronizes invoice and vendor bill to Xero engine
   */
  async processOrderPaid(payload: OrderPaidEventPayload): Promise<void> {
    // 1. Reconcile with internal double-entry reconciliation service
    await accountingReconciliationService.reconcilePaidOrder(payload);

    // 2. Sync with dedicated Xero Accounting Engine
    try {
      let order = await postgresOrderRepository.findById(payload.orderId);
      if (!order) {
        order = await postgresOrderRepository.findByOrderRef(payload.orderId);
      }
      let vendor: DbVendor | null = null;
      if (order) {
        vendor = await postgresVendorRepository.findById(order.vendor_id);
      }

      const commissionAmount = Math.round(payload.grossAmount * (payload.commissionPercentage / 100) * 100) / 100;
      const vendorPayout = Math.round((payload.grossAmount - commissionAmount - (payload.payfastFee || 0)) * 100) / 100;

      const orderToSync: DbOrder = order || {
        id: payload.orderId,
        order_ref: payload.orderId,
        vendor_id: payload.tenantId,
        customer_phone: payload.customerWhatsApp,
        customer_name: payload.customerName,
        delivery_address: 'Stand 402, Albertinia Industrial',
        delivery_lon: 28.0,
        delivery_lat: -26.0,
        distance_km: 10,
        subtotal: payload.materialsSubtotal,
        delivery_fee: payload.freightAmount,
        total_amount: payload.grossAmount,
        platform_fee: commissionAmount,
        vendor_payout: vendorPayout,
        payment_status: 'paid',
        current_status: 'paid',
        created_at: payload.timestamp,
      };

      await xeroEngineService.syncOrderPaid({
        order: orderToSync,
        vendor,
      });
    } catch (err) {
      console.error('[AccountingWorker] Xero engine sync error:', err);
    }
  }

  /**
   * Publishes an ORDER_PAID event to the background worker
   */
  async publishOrderPaid(payload: OrderPaidEventPayload): Promise<void> {
    if (this.isRedisConnected && this.queue) {
      await this.queue.add(JOB_ORDER_PAID, payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      });
    } else {
      // Async emission in-memory
      setImmediate(() => {
        this.eventEmitter.emit(JOB_ORDER_PAID, payload);
      });
    }
  }

  async close(): Promise<void> {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
  }
}

export const accountingQueueWorker = new AccountingQueueWorker();
