"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFastifyApp = createFastifyApp;
const fastify_1 = __importDefault(require("fastify"));
const formbody_1 = __importDefault(require("@fastify/formbody"));
const cors_1 = __importDefault(require("@fastify/cors"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const whatsapp_webhook_controller_1 = require("./controllers/whatsapp-webhook.controller");
const payfast_webhook_controller_1 = require("./controllers/payfast-webhook.controller");
const dashboard_controller_1 = require("./controllers/dashboard.controller");
const payout_controller_1 = require("./controllers/payout.controller");
const xero_controller_1 = require("./controllers/xero.controller");
const vendor_orders_controller_1 = require("./controllers/vendor-orders.controller");
const revenue_controller_1 = require("./controllers/revenue.controller");
const ai_bridge_controller_1 = require("./controllers/ai-bridge.controller");
const virtual_number_controller_1 = require("./controllers/virtual-number.controller");
const conversation_session_store_1 = require("./services/state-machine/conversation-session.store");
const env_1 = require("./config/env");
const db_1 = require("./database/db");
function createFastifyApp() {
    const app = (0, fastify_1.default)({
        logger: false,
    });
    // Register custom JSON content type parser to preserve raw buffer for HMAC-SHA256 signature verification
    app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
        try {
            const rawBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
            req.rawBody = rawBuffer;
            if (rawBuffer.length === 0) {
                done(null, {});
                return;
            }
            const json = JSON.parse(rawBuffer.toString('utf-8'));
            done(null, json);
        }
        catch (err) {
            err.statusCode = 400;
            done(err, undefined);
        }
    });
    // Enable URL-encoded form parsing for PayFast ITN webhook
    app.register(formbody_1.default);
    // Enable Cross-Origin Resource Sharing
    app.register(cors_1.default, {
        origin: '*',
    });
    // Health check endpoint (Railway & Docker Healthcheck + Supabase Pooler diagnostics)
    app.get('/health', async (request, _reply) => {
        const query = request.query || {};
        const deep = query.deep === 'true';
        const dbHealth = await db_1.db.checkHealth(deep);
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            service: 'WhatsApp State Machine & PayFast Checkout',
            environment: env_1.config.NODE_ENV,
            version: '1.0.0',
            database: dbHealth,
            redis: {
                configured: Boolean(env_1.config.REDIS_URL),
                mode: env_1.config.MOCK_EXTERNAL_APIS ? 'in-memory-fallback' : 'railway-redis',
            },
            whatsapp: {
                phoneNumberId: env_1.config.WHATSAPP_PHONE_NUMBER_ID,
                verifyTokenConfigured: Boolean(env_1.config.WHATSAPP_VERIFY_TOKEN),
            },
            payfast: {
                merchantId: env_1.config.PAYFAST_MERCHANT_ID,
                env: env_1.config.PAYFAST_ENV,
                commissionPct: env_1.config.PLATFORM_COMMISSION_PERCENTAGE,
            },
        };
    });
    // System Database Profile & On-Demand Migration Endpoints
    app.get('/api/v1/system/database-profile', async (_request, _reply) => {
        const profile = db_1.db.getProfile();
        const health = await db_1.db.checkHealth(true);
        return {
            success: true,
            profile: {
                mode: profile.mode,
                isSupabase: profile.isSupabase,
                isSupavisorTransactionPooler: profile.isSupavisorTransactionPooler,
                sslEnabled: profile.sslEnabled,
                maxConnections: profile.maxConnections,
            },
            health,
        };
    });
    app.post('/api/v1/system/migrate', async (_request, _reply) => {
        const result = await db_1.db.runMigrations();
        return {
            success: true,
            ...result,
        };
    });
    // Meta Cloud API Webhook Handshake & Cryptographic Ingestion (Production Paths)
    app.get('/api/webhooks/whatsapp', async (request, reply) => {
        await whatsapp_webhook_controller_1.whatsAppWebhookController.verifyWebhook(request, reply);
    });
    app.post('/api/webhooks/whatsapp', async (request, reply) => {
        await whatsapp_webhook_controller_1.whatsAppWebhookController.handleInboundEvents(request, reply);
    });
    // Meta WhatsApp Business API Webhook routes (Legacy Aliases)
    app.get('/webhook', async (request, reply) => {
        await whatsapp_webhook_controller_1.whatsAppWebhookController.verifyWebhook(request, reply);
    });
    app.post('/webhook', async (request, reply) => {
        await whatsapp_webhook_controller_1.whatsAppWebhookController.handleInboundEvents(request, reply);
    });
    // PayFast Instant Transaction Notification (ITN) webhook (Primary Route)
    app.post('/api/webhooks/payfast/itn', async (request, reply) => {
        await payfast_webhook_controller_1.payFastWebhookController.handleITN(request, reply);
    });
    // PayFast Instant Transaction Notification (ITN) webhook (API v1 Alias)
    app.post('/api/v1/payments/payfast/itn', async (request, reply) => {
        await payfast_webhook_controller_1.payFastWebhookController.handleITN(request, reply);
    });
    // PayFast Live Sandbox End-to-End Runner
    app.post('/api/v1/payments/payfast/sandbox-run', async (request, reply) => {
        await payfast_webhook_controller_1.payFastWebhookController.runSandboxEndToEnd(request, reply);
    });
    // Railway Go-Live Status & B2B Vendor Acquisition Collateral Routes
    app.get('/api/v1/system/go-live-status', async (_request, _reply) => {
        const dbHealth = await db_1.db.checkHealth(false);
        return {
            success: true,
            railwayContainer: {
                builder: 'DOCKERFILE (node:20-bookworm-slim + libvips42)',
                healthcheckPath: '/health',
                autoMigrateOnStartup: env_1.config.AUTO_MIGRATE_ON_STARTUP,
                aiRuntime: 'gemini-2.5-flash (AI_CROSS_BUILD_ENABLED=false)',
            },
            metaWebhookHandshake: {
                callbackPath: '/api/webhooks/whatsapp',
                legacyAliasPath: '/webhook',
                verifyTokenConfigured: Boolean(env_1.config.META_WEBHOOK_VERIFY_TOKEN || env_1.config.WHATSAPP_VERIFY_TOKEN),
                hmacSha256SignatureEnforced: true,
            },
            payfastSandbox: {
                env: env_1.config.PAYFAST_ENV,
                merchantId: env_1.config.PAYFAST_MERCHANT_ID,
                itnWebhookPath: '/api/webhooks/payfast/itn',
                sandboxRunnerPath: '/api/v1/payments/payfast/sandbox-run',
            },
            vendorAcquisitionCollateral: {
                sellSheetHtmlPath: '/sell-sheet',
                dashboardSellSheetPath: '/sell-sheet',
                qrDemoLinks: {
                    materialsYardDemo: 'https://wa.me/27600104001?text=hi',
                    salonBookingDemo: 'https://wa.me/27600104003?text=hi',
                    vendorSelfOnboarding: 'https://wa.me/27600104001?text=ONBOARD%20My%20Business%20%7C%20retail_delivery%20%7C%20pro%20%7C%20Capitec%201688990011',
                },
            },
            database: dbHealth,
        };
    });
    app.get('/sell-sheet', async (_request, reply) => {
        const sheetPath = path_1.default.resolve(process.cwd(), 'public', 'b2b-vendor-sell-sheet.html');
        if (fs_1.default.existsSync(sheetPath)) {
            reply.status(200).type('text/html; charset=utf-8').send(fs_1.default.readFileSync(sheetPath, 'utf-8'));
            return;
        }
        reply.status(404).send('Sell-sheet file not found');
    });
    app.get('/api/v1/collateral/sell-sheet', async (_request, reply) => {
        const sheetPath = path_1.default.resolve(process.cwd(), 'public', 'b2b-vendor-sell-sheet.html');
        if (fs_1.default.existsSync(sheetPath)) {
            reply.status(200).type('text/html; charset=utf-8').send(fs_1.default.readFileSync(sheetPath, 'utf-8'));
            return;
        }
        reply.status(404).send('Sell-sheet file not found');
    });
    // Split-Checkout Ledger review endpoint
    app.get('/api/v1/ledger', async (request, reply) => {
        await payfast_webhook_controller_1.payFastWebhookController.getLedgerEntries(request, reply);
    });
    // Multi-Tenant Dashboard KPIs
    app.get('/api/v1/dashboard/metrics', async (request, reply) => {
        await dashboard_controller_1.dashboardController.getMetrics(request, reply);
    });
    app.get('/api/v1/dashboard/tenants', async (request, reply) => {
        await dashboard_controller_1.dashboardController.getTenants(request, reply);
    });
    // Accounting Automation (Tax Invoices & Vendor Sales Receipts)
    app.get('/api/v1/accounting/invoices', async (request, reply) => {
        await dashboard_controller_1.dashboardController.getAccountingInvoices(request, reply);
    });
    app.get('/api/v1/accounting/receipts', async (request, reply) => {
        await dashboard_controller_1.dashboardController.getAccountingReceipts(request, reply);
    });
    // Payout Batching (ACB / EFT Generation & Downloads)
    app.post('/api/v1/payouts/batches/generate', async (request, reply) => {
        await payout_controller_1.payoutController.generateBatch(request, reply);
    });
    app.post('/api/v1/payouts/reconciliation/eod', async (request, reply) => {
        await payout_controller_1.payoutController.runEodReconciliation(request, reply);
    });
    app.get('/api/v1/payouts/batches', async (request, reply) => {
        await payout_controller_1.payoutController.listBatches(request, reply);
    });
    app.get('/api/v1/payouts/batches/:batchId/download', async (request, reply) => {
        await payout_controller_1.payoutController.downloadAcbFile(request, reply);
    });
    app.get('/api/v1/payouts/batches/:batchId/csv', async (request, reply) => {
        await payout_controller_1.payoutController.downloadCsvFile(request, reply);
    });
    // Dedicated Xero Accounting Engine Endpoints
    app.post('/api/accounting/xero/create-batch-payment', async (request, reply) => {
        await xero_controller_1.xeroController.createBatchPayment(request, reply);
    });
    app.post('/api/v1/accounting/xero/create-batch-payment', async (request, reply) => {
        await xero_controller_1.xeroController.createBatchPayment(request, reply);
    });
    app.post('/api/accounting/xero/sync-order', async (request, reply) => {
        await xero_controller_1.xeroController.syncOrder(request, reply);
    });
    app.post('/api/v1/accounting/xero/sync-order', async (request, reply) => {
        await xero_controller_1.xeroController.syncOrder(request, reply);
    });
    app.get('/api/accounting/xero/status', async (request, reply) => {
        await xero_controller_1.xeroController.getStatus(request, reply);
    });
    app.get('/api/v1/accounting/xero/status', async (request, reply) => {
        await xero_controller_1.xeroController.getStatus(request, reply);
    });
    // Vendor Dashboard Orders & Dispatch Status Transitions
    app.get('/api/vendor/orders', async (request, reply) => {
        await vendor_orders_controller_1.vendorOrdersController.listOrders(request, reply);
    });
    app.patch('/api/vendor/orders/:id/status', async (request, reply) => {
        await vendor_orders_controller_1.vendorOrdersController.updateStatus(request, reply);
    });
    app.patch('/api/orders/:id/status', async (request, reply) => {
        await vendor_orders_controller_1.vendorOrdersController.updateStatus(request, reply);
    });
    // Multi-Tenant MoR Revenue Engine & PayFast Fee Arbitrage Endpoints
    app.post('/api/v1/revenue/calculate-settlement', async (request, reply) => {
        await revenue_controller_1.revenueController.calculateSettlement(request, reply);
    });
    app.post('/api/v1/revenue/settle-order', async (request, reply) => {
        await revenue_controller_1.revenueController.settleOrder(request, reply);
    });
    app.post('/api/v1/revenue/subscriptions/bill', async (request, reply) => {
        await revenue_controller_1.revenueController.billSubscription(request, reply);
    });
    app.post('/api/v1/revenue/subscriptions/pre-payout-setoff', async (request, reply) => {
        await revenue_controller_1.revenueController.applyPrePayoutSetoff(request, reply);
    });
    app.get('/api/v1/revenue/subscriptions', async (request, reply) => {
        await revenue_controller_1.revenueController.listSubscriptions(request, reply);
    });
    app.get('/api/v1/revenue/summary', async (request, reply) => {
        await revenue_controller_1.revenueController.getRevenueSummary(request, reply);
    });
    // OpenAI GPT-4o Cross-Build & Operations Bridge Endpoints
    app.get('/api/v1/ai/status', async (request, reply) => {
        await ai_bridge_controller_1.aiBridgeController.getBridgeStatus(request, reply);
    });
    app.post('/api/v1/ai/configure-key', async (request, reply) => {
        await ai_bridge_controller_1.aiBridgeController.configureApiKey(request, reply);
    });
    app.post('/api/v1/ai/bridge', async (request, reply) => {
        await ai_bridge_controller_1.aiBridgeController.executeBridge(request, reply);
    });
    // Cloud Virtual WhatsApp Numbers & Zero-Data Vendor/Driver Command Endpoints
    app.get('/api/v1/virtual-numbers', async (request, reply) => {
        await virtual_number_controller_1.virtualNumberController.listVirtualNumbers(request, reply);
    });
    app.post('/api/v1/virtual-numbers/provision', async (request, reply) => {
        await virtual_number_controller_1.virtualNumberController.provisionVirtualNumber(request, reply);
    });
    app.post('/api/v1/virtual-numbers/onboard-vendor', async (request, reply) => {
        await virtual_number_controller_1.virtualNumberController.onboardVendor(request, reply);
    });
    app.post('/api/v1/virtual-numbers/zero-data-command', async (request, reply) => {
        await virtual_number_controller_1.virtualNumberController.executeZeroDataCommand(request, reply);
    });
    // Active Session Inspector (for debugging & monitoring customer stage)
    app.get('/api/v1/sessions/:waId', async (request, reply) => {
        const { waId } = request.params;
        const session = await conversation_session_store_1.conversationSessionStore.getSession(waId);
        return {
            success: true,
            session,
        };
    });
    return app;
}
//# sourceMappingURL=fastify-app.js.map