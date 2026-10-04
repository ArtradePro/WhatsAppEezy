"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountingQueueWorker = exports.AccountingQueueWorker = exports.JOB_ORDER_PAID = exports.QUEUE_NAME = void 0;
const bullmq_1 = require("bullmq");
const events_1 = require("events");
const accounting_reconciliation_service_1 = require("../accounting/accounting-reconciliation.service");
const xero_engine_service_1 = require("../accounting/xero-engine.service");
const postgres_order_repository_1 = require("../../database/postgres-order.repository");
const postgres_vendor_repository_1 = require("../../database/postgres-vendor.repository");
const payfast_events_1 = require("../events/payfast-events");
exports.QUEUE_NAME = 'accounting-reconciliation-queue';
exports.JOB_ORDER_PAID = 'ORDER_PAID';
class AccountingQueueWorker {
    queue;
    worker;
    eventEmitter = new events_1.EventEmitter();
    isRedisConnected = false;
    constructor() {
        this.initQueue();
        this.initEventListeners();
    }
    initQueue() {
        const redisHost = process.env.REDIS_HOST;
        const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;
        if (redisHost) {
            try {
                const connection = { host: redisHost, port: redisPort, maxRetriesPerRequest: null };
                this.queue = new bullmq_1.Queue(exports.QUEUE_NAME, { connection });
                this.worker = new bullmq_1.Worker(exports.QUEUE_NAME, async (job) => {
                    if (job.name === exports.JOB_ORDER_PAID) {
                        await this.processOrderPaid(job.data);
                    }
                }, { connection });
                this.worker.on('completed', (job) => {
                    console.log(`[BullMQ] Accounting Job ${job.id} (${job.name}) completed successfully`);
                });
                this.worker.on('failed', (job, err) => {
                    console.error(`[BullMQ] Accounting Job ${job?.id} failed:`, err);
                });
                this.isRedisConnected = true;
            }
            catch (err) {
                console.warn('[BullMQ] Redis connection unavailable, running with in-memory resilient event bus fallback');
                this.setupFallback();
            }
        }
        else {
            this.setupFallback();
        }
    }
    setupFallback() {
        this.eventEmitter.on(exports.JOB_ORDER_PAID, async (payload) => {
            try {
                await this.processOrderPaid(payload);
            }
            catch (error) {
                console.error('[AccountingWorker Fallback] Failed to process order paid:', error);
            }
        });
    }
    initEventListeners() {
        // Listen directly to PayFast typed event emitter for real-time accounting triggers
        payfast_events_1.payFastEventEmitter.onOrderPaid(async (event) => {
            try {
                await xero_engine_service_1.xeroEngineService.syncOrderPaid({
                    order: event.order,
                    vendor: event.vendor,
                });
            }
            catch (err) {
                console.warn('[AccountingWorker] payFastEventEmitter Xero sync warning:', err);
            }
        });
    }
    /**
     * Processes Order Paid event:
     * 1. Reconciles via internal double-entry reconciliation service
     * 2. Synchronizes invoice and vendor bill to Xero engine
     */
    async processOrderPaid(payload) {
        // 1. Reconcile with internal double-entry reconciliation service
        await accounting_reconciliation_service_1.accountingReconciliationService.reconcilePaidOrder(payload);
        // 2. Sync with dedicated Xero Accounting Engine
        try {
            let order = await postgres_order_repository_1.postgresOrderRepository.findById(payload.orderId);
            if (!order) {
                order = await postgres_order_repository_1.postgresOrderRepository.findByOrderRef(payload.orderId);
            }
            let vendor = null;
            if (order) {
                vendor = await postgres_vendor_repository_1.postgresVendorRepository.findById(order.vendor_id);
            }
            const commissionAmount = Math.round(payload.grossAmount * (payload.commissionPercentage / 100) * 100) / 100;
            const vendorPayout = Math.round((payload.grossAmount - commissionAmount - (payload.payfastFee || 0)) * 100) / 100;
            const orderToSync = order || {
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
            await xero_engine_service_1.xeroEngineService.syncOrderPaid({
                order: orderToSync,
                vendor,
            });
        }
        catch (err) {
            console.error('[AccountingWorker] Xero engine sync error:', err);
        }
    }
    /**
     * Publishes an ORDER_PAID event to the background worker
     */
    async publishOrderPaid(payload) {
        if (this.isRedisConnected && this.queue) {
            await this.queue.add(exports.JOB_ORDER_PAID, payload, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
            });
        }
        else {
            // Async emission in-memory
            setImmediate(() => {
                this.eventEmitter.emit(exports.JOB_ORDER_PAID, payload);
            });
        }
    }
    async close() {
        if (this.worker)
            await this.worker.close();
        if (this.queue)
            await this.queue.close();
    }
}
exports.AccountingQueueWorker = AccountingQueueWorker;
exports.accountingQueueWorker = new AccountingQueueWorker();
//# sourceMappingURL=accounting-queue.worker.js.map