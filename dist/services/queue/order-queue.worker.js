"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderWorker = exports.orderQueueManager = exports.OrderQueueManager = exports.orderQueue = exports.redisConnection = exports.ORDER_QUEUE_NAME = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const events_1 = require("events");
const vendor_product_ingestion_service_1 = require("../vendor/vendor-product-ingestion.service");
const xero_engine_service_1 = require("../accounting/xero-engine.service");
const whatsapp_client_service_1 = require("../whatsapp/whatsapp-client.service");
const postgres_order_repository_1 = require("../../database/postgres-order.repository");
const postgres_vendor_repository_1 = require("../../database/postgres-vendor.repository");
const saas_subscription_billing_service_1 = require("../revenue/saas-subscription-billing.service");
exports.ORDER_QUEUE_NAME = 'order-tasks';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const hasLiveRedis = Boolean(process.env.REDIS_URL);
// Connect to Railway internal Redis using REDIS_URL
exports.redisConnection = new ioredis_1.default(redisUrl, {
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
exports.redisConnection.on('error', () => {
    // Gracefully absorb connection issues when Redis server is offline
});
exports.orderQueue = new bullmq_1.Queue(exports.ORDER_QUEUE_NAME, {
    connection: exports.redisConnection,
});
exports.orderQueue.on('error', () => { });
class OrderQueueManager {
    eventEmitter = new events_1.EventEmitter();
    constructor() {
        this.setupFallback();
    }
    setupFallback() {
        this.eventEmitter.on('dispatch_local', async ({ name, data }) => {
            try {
                const result = await this.processJob(name, data);
                this.eventEmitter.emit('job_completed', { name, data, result });
            }
            catch (err) {
                this.eventEmitter.emit('job_failed', { name, data, error: err });
            }
        });
    }
    /**
     * Core Background Job Processor
     */
    async processJob(jobName, data) {
        switch (jobName) {
            case 'PROCESS_CATALOG_INGESTION':
            case 'PROCESS_IMAGE_CATALOG': {
                // Run Sharp image normalizer (1024x1024 #F8F9FA) & Vision AI attribute extraction
                const payload = data;
                console.log(`🖼️ [OrderWorker:${jobName}] Processing image catalog upload for vendor ${payload.senderWaId}`);
                const result = await vendor_product_ingestion_service_1.vendorProductIngestionService.handleVendorInboundImage(payload.senderWaId, {
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
                const payload = data;
                console.log(`📑 [OrderWorker] Synchronizing Xero transaction for order ${payload.orderId}`);
                let order = await postgres_order_repository_1.postgresOrderRepository.findById(payload.orderId);
                if (!order) {
                    order = await postgres_order_repository_1.postgresOrderRepository.findByOrderRef(payload.orderId);
                }
                let vendor = null;
                if (order?.vendor_id) {
                    vendor = await postgres_vendor_repository_1.postgresVendorRepository.findById(order.vendor_id);
                }
                else if (payload.vendorId) {
                    vendor = await postgres_vendor_repository_1.postgresVendorRepository.findById(payload.vendorId);
                }
                if (order) {
                    const syncResult = await xero_engine_service_1.xeroEngineService.syncOrderPaid({ order, vendor });
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
                const payload = data;
                console.log(`📲 [OrderWorker] Dispatching WhatsApp alert to ${payload.recipientPhone}`);
                if (payload.messageType === 'text' && payload.text) {
                    const messageId = await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(payload.recipientPhone, payload.text);
                    return { success: true, messageId };
                }
                else if (payload.messageType === 'interactive_buttons' && payload.interactive) {
                    const messageId = await whatsapp_client_service_1.whatsAppClientService.sendInteractiveButtons(payload.recipientPhone, payload.interactive.bodyText, payload.interactive.buttons);
                    return { success: true, messageId };
                }
                else if (payload.messageType === 'draft_preview' && payload.draftPreview) {
                    const messageId = await whatsapp_client_service_1.whatsAppClientService.sendProductDraftInteractivePreview(payload.recipientPhone, payload.draftPreview);
                    return { success: true, messageId };
                }
                return { success: false, status: 'SKIPPED' };
            }
            case 'BILL_SAAS_SUBSCRIPTION': {
                // Monthly SaaS Subscription Billing (Xero recurring invoice / Ledger Set-Off / PayFast Tokenized Ad-Hoc)
                const payload = (data || {});
                if (payload.vendorId) {
                    const record = await saas_subscription_billing_service_1.saasSubscriptionBillingService.billVendorMonthlySubscription({
                        vendorId: payload.vendorId,
                        billingCycle: payload.billingCycle,
                        forceCollectionMethod: payload.forceCollectionMethod,
                    });
                    return { success: true, record };
                }
                else {
                    const records = await saas_subscription_billing_service_1.saasSubscriptionBillingService.runMonthlySubscriptionCycleForAllVendors(payload.billingCycle);
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
    async enqueue(name, data) {
        if (hasLiveRedis) {
            try {
                await exports.orderQueue.add(name, data, {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 1000 },
                });
                return;
            }
            catch {
                // Fall back to local execution
            }
        }
        setImmediate(() => {
            this.eventEmitter.emit('dispatch_local', { name, data });
        });
    }
    async close() {
        try {
            await exports.orderWorker.close();
        }
        catch {
            // ignore
        }
        try {
            await exports.orderQueue.close();
        }
        catch {
            // ignore
        }
        try {
            if (exports.redisConnection.status === 'ready' || exports.redisConnection.status === 'connecting') {
                await exports.redisConnection.quit();
            }
        }
        catch {
            // ignore
        }
    }
}
exports.OrderQueueManager = OrderQueueManager;
exports.orderQueueManager = new OrderQueueManager();
// Async Background Processor matching requested signature
exports.orderWorker = new bullmq_1.Worker(exports.ORDER_QUEUE_NAME, async (job) => {
    return exports.orderQueueManager.processJob(job.name, job.data);
}, {
    connection: exports.redisConnection,
    concurrency: 5,
    autorun: Boolean(hasLiveRedis && process.env.NODE_ENV !== 'test'),
});
exports.orderWorker.on('error', () => { });
//# sourceMappingURL=order-queue.worker.js.map