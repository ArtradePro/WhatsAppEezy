import { Queue, Worker, Job } from 'bullmq';
import { EventEmitter } from 'events';
import { WhatsAppWebhookPayload, WhatsAppInboundMessage } from '../../types/whatsapp.types';
import { conversationStateMachine } from '../state-machine/conversation-state-machine';
import { vendorProductIngestionService } from '../vendor/vendor-product-ingestion.service';
import { virtualNumberManagerService } from '../whatsapp/virtual-number-manager.service';
import { whatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { orderQueueManager } from './order-queue.worker';

export const WHATSAPP_QUEUE_NAME = 'whatsapp-inbound-queue';
export const JOB_PROCESS_WEBHOOK = 'PROCESS_WEBHOOK';

export interface WhatsAppQueueJobData {
  payload: WhatsAppWebhookPayload;
  receivedAt: string;
}

export class WhatsAppQueueWorker {
  private queue?: Queue;
  private worker?: Worker;
  public eventEmitter = new EventEmitter();
  private isRedisConnected = false;

  constructor() {
    this.initQueue();
  }

  private initQueue() {
    const redisHost = process.env.REDIS_HOST;
    const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;

    if (redisHost) {
      try {
        const connection = { host: redisHost, port: redisPort, maxRetriesPerRequest: null };
        this.queue = new Queue(WHATSAPP_QUEUE_NAME, { connection });
        this.worker = new Worker(
          WHATSAPP_QUEUE_NAME,
          async (job: Job) => {
            if (job.name === JOB_PROCESS_WEBHOOK) {
              const data = job.data as WhatsAppQueueJobData;
              await this.processWebhook(data.payload);
            }
          },
          { connection }
        );

        this.worker.on('completed', (job) => {
          console.log(`[BullMQ WhatsApp] Inbound Webhook Job ${job.id} completed successfully`);
        });

        this.worker.on('failed', (job, err) => {
          console.error(`[BullMQ WhatsApp] Inbound Webhook Job ${job?.id} failed:`, err);
        });

        this.isRedisConnected = true;
      } catch (err) {
        console.warn('[BullMQ WhatsApp] Redis unavailable, using in-memory asynchronous worker fallback');
        this.setupFallback();
      }
    } else {
      this.setupFallback();
    }
  }

  private setupFallback() {
    this.eventEmitter.on(JOB_PROCESS_WEBHOOK, async (payload: WhatsAppWebhookPayload) => {
      try {
        await this.processWebhook(payload);
      } catch (error) {
        console.error('[WhatsAppWorker Fallback] Failed to process webhook event:', error);
      }
    });
  }

  /**
   * Enqueues an inbound Meta WhatsApp webhook payload non-blockingly (<500ms response guarantee)
   */
  async enqueueWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
    if (this.isRedisConnected && this.queue) {
      await this.queue.add(
        JOB_PROCESS_WEBHOOK,
        { payload, receivedAt: new Date().toISOString() },
        { attempts: 3, backoff: { type: 'exponential', delay: 500 } }
      );
    } else {
      // Immediate non-blocking emission via microtask/event-loop
      setImmediate(() => {
        this.eventEmitter.emit(JOB_PROCESS_WEBHOOK, payload);
      });
    }
  }

  /**
   * Dispatches and routes unmarshalled WhatsApp payload:
   * - Extracts metadata.phone_number_id & metadata.display_phone_number for strict multi-tenant routing
   * - Supplier Image & Catalog Uploads -> PROCESS_CATALOG_INGESTION (vendorProductIngestionService)
   * - Supplier / Driver Zero-Data Text Commands -> virtualNumberManagerService
   * - Customer Ordering & Interactive Flows -> conversationStateMachine (scoped to resolved vendor_id)
   */
  async processWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
    if (payload?.object !== 'whatsapp_business_account') {
      return;
    }

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value || !value.messages) continue;

        const phoneNumberId = value.metadata?.phone_number_id;
        const displayPhoneNumber = value.metadata?.display_phone_number;

        const contacts = value.contacts || [];
        const contactNameMap = new Map<string, string>();
        for (const c of contacts) {
          contactNameMap.set(c.wa_id, c.profile?.name || 'Customer');
        }

        for (const msg of value.messages) {
          await this.routeMessage(msg, contactNameMap, {
            phoneNumberId,
            displayPhoneNumber,
          });
        }
      }
    }

    this.eventEmitter.emit('webhook_processed', payload);
  }

  /**
   * Routes single message based on recipient virtual phone_number_id, sender type, and content
   */
  private async routeMessage(
    msg: WhatsAppInboundMessage,
    contactNameMap: Map<string, string>,
    metadata?: {
      phoneNumberId?: string;
      displayPhoneNumber?: string;
    }
  ): Promise<void> {
    const senderWaId = msg.from;
    const customerName = contactNameMap.get(senderWaId) || 'Customer';

    try {
      // 1. Supplier route: if sender is a registered vendor matching vendors.whatsapp_number
      const vendor = await vendorProductIngestionService.getRegisteredVendor(senderWaId);
      if (vendor) {
        if (msg.type === 'image') {
          console.log(
            `📸 [WhatsApp Router] Offloading supplier catalog image from registered vendor ${vendor.business_name} (${senderWaId}) to PROCESS_CATALOG_INGESTION`
          );
          await orderQueueManager.processJob('PROCESS_CATALOG_INGESTION', {
            senderWaId,
            mediaId: msg.image?.id || '',
            caption: msg.image?.caption || msg.text?.body,
          });
          this.eventEmitter.emit('message_routed', {
            type: 'vendor_image',
            job: 'PROCESS_CATALOG_INGESTION',
            from: senderWaId,
            messageId: msg.id,
          });
          return;
        }

        if (msg.type === 'text' && msg.text?.body) {
          const cmdResult = await virtualNumberManagerService.handleZeroDataVendorCommand(
            senderWaId,
            msg.text.body,
            vendor.id
          );
          if (cmdResult.handled) {
            await whatsAppClientService.sendTextMessage(senderWaId, cmdResult.replyText).catch(() => {});
            this.eventEmitter.emit('message_routed', {
              type: 'vendor_zero_data_command',
              commandType: cmdResult.commandType,
              from: senderWaId,
              messageId: msg.id,
            });
            return;
          }
        }
      }

      // 2. Customer or standard conversational flow (strictly isolated by metadata.phone_number_id)
      console.log(
        `💬 [WhatsApp Router] Routing conversational message from ${customerName} (${senderWaId}) -> Virtual Phone ID: ${metadata?.phoneNumberId || 'default'}`
      );
      await conversationStateMachine.handleInboundMessage(senderWaId, customerName, msg, {
        phoneNumberId: metadata?.phoneNumberId,
        displayPhoneNumber: metadata?.displayPhoneNumber,
      });
      this.eventEmitter.emit('message_routed', {
        type: 'customer_session',
        from: senderWaId,
        messageId: msg.id,
        phoneNumberId: metadata?.phoneNumberId,
        displayPhoneNumber: metadata?.displayPhoneNumber,
      });
    } catch (err) {
      console.error(`[WhatsApp Router] Error processing message ${msg.id} from ${senderWaId}:`, err);
    }
  }

  async close(): Promise<void> {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
  }
}

export const whatsAppQueueWorker = new WhatsAppQueueWorker();

