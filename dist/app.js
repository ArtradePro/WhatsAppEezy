"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ingest_routes_1 = require("./routes/ingest.routes");
const catalog_routes_1 = require("./routes/catalog.routes");
const error_middleware_1 = require("./middleware/error.middleware");
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
/**
 * Lightweight adapter allowing Fastify-typed controllers to execute natively inside Express
 */
function adaptFastifyController(handler) {
    return async (req, res) => {
        const fastifyReq = {
            query: req.query,
            body: req.body,
            params: req.params,
            headers: req.headers,
            url: req.originalUrl || req.url,
            ip: req.ip,
            socket: req.socket,
            rawBody: req.rawBody,
        };
        const fastifyReply = {
            status(code) {
                res.status(code);
                return this;
            },
            type(contentType) {
                res.type(contentType);
                return this;
            },
            header(key, value) {
                res.setHeader(key, value);
                return this;
            },
            send(payload) {
                if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
                    res.send(payload);
                }
                else {
                    res.json(payload);
                }
                return this;
            },
        };
        await handler(fastifyReq, fastifyReply);
    };
}
function createApp() {
    const app = (0, express_1.default)();
    // Basic Middleware with raw body capture for Meta HMAC-SHA256 verification
    app.use((0, cors_1.default)());
    app.use(express_1.default.json({
        limit: '10mb',
        verify: (req, _res, buf) => {
            req.rawBody = buf;
        },
    }));
    app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
    // Health check endpoint (Railway & Docker Healthcheck + Supabase Pooler diagnostics)
    app.get('/health', async (req, res) => {
        const deep = req.query.deep === 'true';
        const dbHealth = await db_1.db.checkHealth(deep);
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            service: 'WhatsApp Commerce Aggregator & Settlement Engine',
            environment: env_1.config.NODE_ENV,
            version: '1.0.0',
            database: dbHealth,
            redis: {
                configured: Boolean(env_1.config.REDIS_URL),
                mode: env_1.config.MOCK_EXTERNAL_APIS ? 'in-memory-fallback' : 'railway-redis',
            },
            whatsapp: {
                phoneNumberId: env_1.config.WHATSAPP_PHONE_NUMBER_ID,
                verifyTokenConfigured: Boolean(env_1.config.META_WEBHOOK_VERIFY_TOKEN || env_1.config.WHATSAPP_VERIFY_TOKEN),
            },
            payfast: {
                merchantId: env_1.config.PAYFAST_MERCHANT_ID,
                env: env_1.config.PAYFAST_ENV,
                commissionPct: env_1.config.PLATFORM_COMMISSION_PERCENTAGE,
            },
            integrations: {
                cloudinary: env_1.config.CLOUDINARY_CLOUD_NAME !== 'mock-cloud' ? 'configured' : 'mock-mode',
                visionProvider: env_1.config.VISION_PROVIDER,
                metaGraphApi: {
                    version: env_1.config.META_GRAPH_API_VERSION,
                    catalogId: env_1.config.META_CATALOG_ID,
                    configured: env_1.config.META_ACCESS_TOKEN !== 'mock-meta-access-token',
                },
            },
        });
    });
    // System Database Profile & On-Demand Migration Endpoints
    app.get('/api/v1/system/database-profile', async (_req, res) => {
        const profile = db_1.db.getProfile();
        const health = await db_1.db.checkHealth(true);
        res.json({
            success: true,
            profile: {
                mode: profile.mode,
                isSupabase: profile.isSupabase,
                isSupavisorTransactionPooler: profile.isSupavisorTransactionPooler,
                sslEnabled: profile.sslEnabled,
                maxConnections: profile.maxConnections,
            },
            health,
        });
    });
    app.post('/api/v1/system/migrate', async (_req, res) => {
        const result = await db_1.db.runMigrations();
        res.json({
            success: true,
            ...result,
        });
    });
    // Product Ingestion & Catalog Routes
    app.use('/api/v1/products', ingest_routes_1.ingestRouter);
    app.use('/api/v1/products', catalog_routes_1.catalogRouter);
    // Meta Cloud API Webhook Handshake & Cryptographic Ingestion (Production & Legacy Paths)
    app.get('/api/webhooks/whatsapp', adaptFastifyController((req, reply) => whatsapp_webhook_controller_1.whatsAppWebhookController.verifyWebhook(req, reply)));
    app.post('/api/webhooks/whatsapp', adaptFastifyController((req, reply) => whatsapp_webhook_controller_1.whatsAppWebhookController.handleInboundEvents(req, reply)));
    app.get('/webhook', adaptFastifyController((req, reply) => whatsapp_webhook_controller_1.whatsAppWebhookController.verifyWebhook(req, reply)));
    app.post('/webhook', adaptFastifyController((req, reply) => whatsapp_webhook_controller_1.whatsAppWebhookController.handleInboundEvents(req, reply)));
    // Gupshup WhatsApp API Webhook Handshake & Normalized Ingestion (v2 JSON & v3 Meta Pass-Through)
    app.get('/api/webhooks/gupshup', adaptFastifyController((req, reply) => whatsapp_webhook_controller_1.whatsAppWebhookController.handleGupshupWebhook(req, reply)));
    app.post('/api/webhooks/gupshup', adaptFastifyController((req, reply) => whatsapp_webhook_controller_1.whatsAppWebhookController.handleGupshupWebhook(req, reply)));
    // PayFast Instant Transaction Notification (ITN) Webhook & Live Sandbox Runner
    app.post('/api/webhooks/payfast/itn', adaptFastifyController((req, reply) => payfast_webhook_controller_1.payFastWebhookController.handleITN(req, reply)));
    app.post('/api/v1/payments/payfast/itn', adaptFastifyController((req, reply) => payfast_webhook_controller_1.payFastWebhookController.handleITN(req, reply)));
    app.post('/api/v1/payments/payfast/sandbox-run', adaptFastifyController((req, reply) => payfast_webhook_controller_1.payFastWebhookController.runSandboxEndToEnd(req, reply)));
    // Railway Go-Live Status & B2B Vendor Acquisition Collateral Routes
    app.get('/api/v1/system/go-live-status', async (_req, res) => {
        const dbHealth = await db_1.db.checkHealth(false);
        res.json({
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
        });
    });
    const serveSellSheet = (_req, res) => {
        const sheetPath = path_1.default.resolve(process.cwd(), 'public', 'b2b-vendor-sell-sheet.html');
        if (fs_1.default.existsSync(sheetPath)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(fs_1.default.readFileSync(sheetPath, 'utf-8'));
            return;
        }
        res.status(404).send('Sell-sheet file not found');
    };
    app.get('/sell-sheet', serveSellSheet);
    app.get('/api/v1/collateral/sell-sheet', serveSellSheet);
    // Double-Entry Ledger Endpoints
    app.get('/api/v1/ledger', adaptFastifyController((req, reply) => payfast_webhook_controller_1.payFastWebhookController.getLedgerEntries(req, reply)));
    // Multi-Tenant Dashboard KPIs & Accounting Views
    app.get('/api/v1/dashboard/metrics', adaptFastifyController((req, reply) => dashboard_controller_1.dashboardController.getMetrics(req, reply)));
    app.get('/api/v1/dashboard/tenants', adaptFastifyController((req, reply) => dashboard_controller_1.dashboardController.getTenants(req, reply)));
    app.get('/api/v1/accounting/invoices', adaptFastifyController((req, reply) => dashboard_controller_1.dashboardController.getAccountingInvoices(req, reply)));
    app.get('/api/v1/accounting/receipts', adaptFastifyController((req, reply) => dashboard_controller_1.dashboardController.getAccountingReceipts(req, reply)));
    // Payout Batching (ACB / EFT / Multi-Bank CSV)
    app.post('/api/v1/payouts/batches/generate', adaptFastifyController((req, reply) => payout_controller_1.payoutController.generateBatch(req, reply)));
    app.post('/api/v1/payouts/reconciliation/eod', adaptFastifyController((req, reply) => payout_controller_1.payoutController.runEodReconciliation(req, reply)));
    app.get('/api/v1/payouts/batches', adaptFastifyController((req, reply) => payout_controller_1.payoutController.listBatches(req, reply)));
    app.get('/api/v1/payouts/batches/:batchId/download', adaptFastifyController((req, reply) => payout_controller_1.payoutController.downloadAcbFile(req, reply)));
    app.get('/api/v1/payouts/batches/:batchId/csv', adaptFastifyController((req, reply) => payout_controller_1.payoutController.downloadCsvFile(req, reply)));
    // Dedicated Xero Accounting Engine
    app.post('/api/accounting/xero/create-batch-payment', adaptFastifyController((req, reply) => xero_controller_1.xeroController.createBatchPayment(req, reply)));
    app.post('/api/v1/accounting/xero/create-batch-payment', adaptFastifyController((req, reply) => xero_controller_1.xeroController.createBatchPayment(req, reply)));
    app.post('/api/accounting/xero/sync-order', adaptFastifyController((req, reply) => xero_controller_1.xeroController.syncOrder(req, reply)));
    app.post('/api/v1/accounting/xero/sync-order', adaptFastifyController((req, reply) => xero_controller_1.xeroController.syncOrder(req, reply)));
    app.get('/api/accounting/xero/status', adaptFastifyController((req, reply) => xero_controller_1.xeroController.getStatus(req, reply)));
    app.get('/api/v1/accounting/xero/status', adaptFastifyController((req, reply) => xero_controller_1.xeroController.getStatus(req, reply)));
    // Vendor Orders, Live Customer ETA Tracking & Service Appointment Reminders
    app.get('/api/vendor/orders', adaptFastifyController((req, reply) => vendor_orders_controller_1.vendorOrdersController.listOrders(req, reply)));
    app.patch('/api/vendor/orders/:id/status', adaptFastifyController((req, reply) => vendor_orders_controller_1.vendorOrdersController.updateStatus(req, reply)));
    app.patch('/api/orders/:id/status', adaptFastifyController((req, reply) => vendor_orders_controller_1.vendorOrdersController.updateStatus(req, reply)));
    app.post('/api/vendor/orders/:id/eta', adaptFastifyController((req, reply) => vendor_orders_controller_1.vendorOrdersController.sendEtaNotification(req, reply)));
    app.get('/api/v1/appointments', adaptFastifyController((req, reply) => vendor_orders_controller_1.vendorOrdersController.listAppointments(req, reply)));
    app.post('/api/v1/appointments/:id/remind', adaptFastifyController((req, reply) => vendor_orders_controller_1.vendorOrdersController.sendAppointmentReminder(req, reply)));
    // Multi-Tenant MoR Revenue Engine & PayFast Fee Arbitrage Endpoints
    app.post('/api/v1/revenue/calculate-settlement', adaptFastifyController((req, reply) => revenue_controller_1.revenueController.calculateSettlement(req, reply)));
    app.post('/api/v1/revenue/settle-order', adaptFastifyController((req, reply) => revenue_controller_1.revenueController.settleOrder(req, reply)));
    app.post('/api/v1/revenue/subscriptions/bill', adaptFastifyController((req, reply) => revenue_controller_1.revenueController.billSubscription(req, reply)));
    app.post('/api/v1/revenue/subscriptions/pre-payout-setoff', adaptFastifyController((req, reply) => revenue_controller_1.revenueController.applyPrePayoutSetoff(req, reply)));
    app.get('/api/v1/revenue/subscriptions', adaptFastifyController((req, reply) => revenue_controller_1.revenueController.listSubscriptions(req, reply)));
    app.get('/api/v1/revenue/summary', adaptFastifyController((req, reply) => revenue_controller_1.revenueController.getRevenueSummary(req, reply)));
    // OpenAI GPT-4o Cross-Build & Operations Bridge Endpoints
    app.get('/api/v1/ai/status', adaptFastifyController((req, reply) => ai_bridge_controller_1.aiBridgeController.getBridgeStatus(req, reply)));
    app.post('/api/v1/ai/configure-key', adaptFastifyController((req, reply) => ai_bridge_controller_1.aiBridgeController.configureApiKey(req, reply)));
    app.post('/api/v1/ai/bridge', adaptFastifyController((req, reply) => ai_bridge_controller_1.aiBridgeController.executeBridge(req, reply)));
    // Cloud Virtual WhatsApp Numbers & Zero-Data Vendor/Driver Command Endpoints
    app.get('/api/v1/virtual-numbers', adaptFastifyController((req, reply) => virtual_number_controller_1.virtualNumberController.listVirtualNumbers(req, reply)));
    app.post('/api/v1/virtual-numbers/provision', adaptFastifyController((req, reply) => virtual_number_controller_1.virtualNumberController.provisionVirtualNumber(req, reply)));
    app.post('/api/v1/virtual-numbers/onboard-vendor', adaptFastifyController((req, reply) => virtual_number_controller_1.virtualNumberController.onboardVendor(req, reply)));
    app.post('/api/v1/virtual-numbers/zero-data-command', adaptFastifyController((req, reply) => virtual_number_controller_1.virtualNumberController.executeZeroDataCommand(req, reply)));
    // Active Session Inspector & Gupshup Live Configuration
    app.get('/api/v1/sessions/:waId', async (req, res) => {
        const waId = req.params.waId;
        const session = await conversation_session_store_1.conversationSessionStore.getSession(waId);
        const { whatsAppClientService } = await import('./services/whatsapp/whatsapp-client.service');
        res.json({
            success: true,
            session,
            gupshupConfigured: Boolean(env_1.config.GUPSHUP_API_KEY),
            lastOutboundResult: whatsAppClientService.lastOutboundResult,
        });
    });
    app.post('/api/v1/whatsapp/configure-gupshup', async (req, res) => {
        const { apiKey, appId, testPhone } = req.body || {};
        const { whatsAppClientService } = await import('./services/whatsapp/whatsapp-client.service');
        if (apiKey) {
            whatsAppClientService.configureGupshup(String(apiKey), appId ? String(appId) : undefined);
        }
        let testMessageId = null;
        if (testPhone) {
            testMessageId = await whatsAppClientService.sendTextMessage(String(testPhone), '🟢 *WhatsAppEezy Live!* Your Gupshup + Railway engine is connected.\n\nReply *1* for Higiene Commercial Hygiene & Cleaning or *hi* to browse all catalogs!');
        }
        res.json({
            success: true,
            gupshupConfigured: Boolean(env_1.config.GUPSHUP_API_KEY),
            testMessageId,
            lastOutboundResult: whatsAppClientService.lastOutboundResult,
        });
    });
    // Catch-all 404 handler
    app.use((req, res) => {
        res.status(404).json({
            success: false,
            error: 'NotFound',
            message: `Cannot ${req.method} ${req.originalUrl}`,
        });
    });
    // Global Error Handler
    app.use(error_middleware_1.errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map