import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { ingestRouter } from './routes/ingest.routes';
import { catalogRouter } from './routes/catalog.routes';
import { errorHandler } from './middleware/error.middleware';
import { whatsAppWebhookController } from './controllers/whatsapp-webhook.controller';
import { payFastWebhookController } from './controllers/payfast-webhook.controller';
import { dashboardController } from './controllers/dashboard.controller';
import { payoutController } from './controllers/payout.controller';
import { xeroController } from './controllers/xero.controller';
import { vendorOrdersController } from './controllers/vendor-orders.controller';
import { revenueController } from './controllers/revenue.controller';
import { aiBridgeController } from './controllers/ai-bridge.controller';
import { virtualNumberController } from './controllers/virtual-number.controller';
import { conversationSessionStore } from './services/state-machine/conversation-session.store';
import { config } from './config/env';
import { db } from './database/db';

/**
 * Lightweight adapter allowing Fastify-typed controllers to execute natively inside Express
 */
function adaptFastifyController(handler: (req: any, reply: any) => Promise<void>) {
  return async (req: Request, res: Response) => {
    const fastifyReq = {
      query: req.query,
      body: req.body,
      params: req.params,
      headers: req.headers,
      url: req.originalUrl || req.url,
      ip: req.ip,
      socket: req.socket,
      rawBody: (req as any).rawBody,
    };

    const fastifyReply = {
      status(code: number) {
        res.status(code);
        return this;
      },
      type(contentType: string) {
        res.type(contentType);
        return this;
      },
      header(key: string, value: string) {
        res.setHeader(key, value);
        return this;
      },
      send(payload: any) {
        if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
          res.send(payload);
        } else {
          res.json(payload);
        }
        return this;
      },
    };

    await handler(fastifyReq, fastifyReply);
  };
}

export function createApp(): Application {
  const app = express();

  // Basic Middleware with raw body capture for Meta HMAC-SHA256 verification
  app.use(cors());
  app.use(
    express.json({
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health check endpoint (Railway & Docker Healthcheck + Supabase Pooler diagnostics)
  app.get('/health', async (req: Request, res: Response) => {
    const deep = req.query.deep === 'true';
    const dbHealth = await db.checkHealth(deep);

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'WhatsApp Commerce Aggregator & Settlement Engine',
      environment: config.NODE_ENV,
      version: '1.0.0',
      database: dbHealth,
      redis: {
        configured: Boolean(config.REDIS_URL),
        mode: config.MOCK_EXTERNAL_APIS ? 'in-memory-fallback' : 'railway-redis',
      },
      whatsapp: {
        phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
        verifyTokenConfigured: Boolean(config.META_WEBHOOK_VERIFY_TOKEN || config.WHATSAPP_VERIFY_TOKEN),
      },
      payfast: {
        merchantId: config.PAYFAST_MERCHANT_ID,
        env: config.PAYFAST_ENV,
        commissionPct: config.PLATFORM_COMMISSION_PERCENTAGE,
      },
      integrations: {
        cloudinary: config.CLOUDINARY_CLOUD_NAME !== 'mock-cloud' ? 'configured' : 'mock-mode',
        visionProvider: config.VISION_PROVIDER,
        metaGraphApi: {
          version: config.META_GRAPH_API_VERSION,
          catalogId: config.META_CATALOG_ID,
          configured: config.META_ACCESS_TOKEN !== 'mock-meta-access-token',
        },
      },
    });
  });

  // System Database Profile & On-Demand Migration Endpoints
  app.get('/api/v1/system/database-profile', async (_req: Request, res: Response) => {
    const profile = db.getProfile();
    const health = await db.checkHealth(true);
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

  app.post('/api/v1/system/migrate', async (_req: Request, res: Response) => {
    const result = await db.runMigrations();
    res.json({
      success: true,
      ...result,
    });
  });

  // Product Ingestion & Catalog Routes
  app.use('/api/v1/products', ingestRouter);
  app.use('/api/v1/products', catalogRouter);

  // Meta Cloud API Webhook Handshake & Cryptographic Ingestion (Production & Legacy Paths)
  app.get(
    '/api/webhooks/whatsapp',
    adaptFastifyController((req, reply) => whatsAppWebhookController.verifyWebhook(req, reply))
  );
  app.post(
    '/api/webhooks/whatsapp',
    adaptFastifyController((req, reply) => whatsAppWebhookController.handleInboundEvents(req, reply))
  );
  app.get(
    '/webhook',
    adaptFastifyController((req, reply) => whatsAppWebhookController.verifyWebhook(req, reply))
  );
  app.post(
    '/webhook',
    adaptFastifyController((req, reply) => whatsAppWebhookController.handleInboundEvents(req, reply))
  );

  // Gupshup WhatsApp API Webhook Handshake & Normalized Ingestion (v2 JSON & v3 Meta Pass-Through)
  app.get(
    '/api/webhooks/gupshup',
    adaptFastifyController((req, reply) => whatsAppWebhookController.handleGupshupWebhook(req, reply))
  );
  app.post(
    '/api/webhooks/gupshup',
    adaptFastifyController((req, reply) => whatsAppWebhookController.handleGupshupWebhook(req, reply))
  );

  // PayFast Instant Transaction Notification (ITN) Webhook & Live Sandbox Runner
  app.post(
    '/api/webhooks/payfast/itn',
    adaptFastifyController((req, reply) => payFastWebhookController.handleITN(req, reply))
  );
  app.post(
    '/api/v1/payments/payfast/itn',
    adaptFastifyController((req, reply) => payFastWebhookController.handleITN(req, reply))
  );
  app.post(
    '/api/v1/payments/payfast/sandbox-run',
    adaptFastifyController((req, reply) => payFastWebhookController.runSandboxEndToEnd(req, reply))
  );

  // Railway Go-Live Status & B2B Vendor Acquisition Collateral Routes
  app.get('/api/v1/system/go-live-status', async (_req: Request, res: Response) => {
    const dbHealth = await db.checkHealth(false);
    res.json({
      success: true,
      railwayContainer: {
        builder: 'DOCKERFILE (node:20-bookworm-slim + libvips42)',
        healthcheckPath: '/health',
        autoMigrateOnStartup: config.AUTO_MIGRATE_ON_STARTUP,
        aiRuntime: 'gemini-2.5-flash (AI_CROSS_BUILD_ENABLED=false)',
      },
      metaWebhookHandshake: {
        callbackPath: '/api/webhooks/whatsapp',
        legacyAliasPath: '/webhook',
        verifyTokenConfigured: Boolean(config.META_WEBHOOK_VERIFY_TOKEN || config.WHATSAPP_VERIFY_TOKEN),
        hmacSha256SignatureEnforced: true,
      },
      payfastSandbox: {
        env: config.PAYFAST_ENV,
        merchantId: config.PAYFAST_MERCHANT_ID,
        itnWebhookPath: '/api/webhooks/payfast/itn',
        sandboxRunnerPath: '/api/v1/payments/payfast/sandbox-run',
      },
      vendorAcquisitionCollateral: {
        sellSheetHtmlPath: '/sell-sheet',
        dashboardSellSheetPath: '/sell-sheet',
        qrDemoLinks: {
          materialsYardDemo: 'https://wa.me/27600104001?text=hi',
          salonBookingDemo: 'https://wa.me/27600104003?text=hi',
          vendorSelfOnboarding:
            'https://wa.me/27600104001?text=ONBOARD%20My%20Business%20%7C%20retail_delivery%20%7C%20pro%20%7C%20Capitec%201688990011',
        },
      },
      database: dbHealth,
    });
  });

  const serveSellSheet = (_req: Request, res: Response) => {
    const sheetPath = path.resolve(process.cwd(), 'public', 'b2b-vendor-sell-sheet.html');
    if (fs.existsSync(sheetPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(fs.readFileSync(sheetPath, 'utf-8'));
      return;
    }
    res.status(404).send('Sell-sheet file not found');
  };

  app.get('/sell-sheet', serveSellSheet);
  app.get('/api/v1/collateral/sell-sheet', serveSellSheet);

  // Double-Entry Ledger Endpoints
  app.get(
    '/api/v1/ledger',
    adaptFastifyController((req, reply) => payFastWebhookController.getLedgerEntries(req, reply))
  );

  // Multi-Tenant Dashboard KPIs & Accounting Views
  app.get(
    '/api/v1/dashboard/metrics',
    adaptFastifyController((req, reply) => dashboardController.getMetrics(req, reply))
  );
  app.get(
    '/api/v1/dashboard/tenants',
    adaptFastifyController((req, reply) => dashboardController.getTenants(req, reply))
  );
  app.get(
    '/api/v1/accounting/invoices',
    adaptFastifyController((req, reply) => dashboardController.getAccountingInvoices(req, reply))
  );
  app.get(
    '/api/v1/accounting/receipts',
    adaptFastifyController((req, reply) => dashboardController.getAccountingReceipts(req, reply))
  );

  // Payout Batching (ACB / EFT / Multi-Bank CSV)
  app.post(
    '/api/v1/payouts/batches/generate',
    adaptFastifyController((req, reply) => payoutController.generateBatch(req, reply))
  );
  app.post(
    '/api/v1/payouts/reconciliation/eod',
    adaptFastifyController((req, reply) => payoutController.runEodReconciliation(req, reply))
  );
  app.get(
    '/api/v1/payouts/batches',
    adaptFastifyController((req, reply) => payoutController.listBatches(req, reply))
  );
  app.get(
    '/api/v1/payouts/batches/:batchId/download',
    adaptFastifyController((req, reply) => payoutController.downloadAcbFile(req, reply))
  );
  app.get(
    '/api/v1/payouts/batches/:batchId/csv',
    adaptFastifyController((req, reply) => payoutController.downloadCsvFile(req, reply))
  );

  // Dedicated Xero Accounting Engine
  app.post(
    '/api/accounting/xero/create-batch-payment',
    adaptFastifyController((req, reply) => xeroController.createBatchPayment(req, reply))
  );
  app.post(
    '/api/v1/accounting/xero/create-batch-payment',
    adaptFastifyController((req, reply) => xeroController.createBatchPayment(req, reply))
  );
  app.post(
    '/api/accounting/xero/sync-order',
    adaptFastifyController((req, reply) => xeroController.syncOrder(req, reply))
  );
  app.post(
    '/api/v1/accounting/xero/sync-order',
    adaptFastifyController((req, reply) => xeroController.syncOrder(req, reply))
  );
  app.get(
    '/api/accounting/xero/status',
    adaptFastifyController((req, reply) => xeroController.getStatus(req, reply))
  );
  app.get(
    '/api/v1/accounting/xero/status',
    adaptFastifyController((req, reply) => xeroController.getStatus(req, reply))
  );

  // Vendor Orders, Live Customer ETA Tracking & Service Appointment Reminders
  app.get(
    '/api/vendor/orders',
    adaptFastifyController((req, reply) => vendorOrdersController.listOrders(req, reply))
  );
  app.patch(
    '/api/vendor/orders/:id/status',
    adaptFastifyController((req, reply) => vendorOrdersController.updateStatus(req, reply))
  );
  app.patch(
    '/api/orders/:id/status',
    adaptFastifyController((req, reply) => vendorOrdersController.updateStatus(req, reply))
  );
  app.post(
    '/api/vendor/orders/:id/eta',
    adaptFastifyController((req, reply) => vendorOrdersController.sendEtaNotification(req, reply))
  );
  app.get(
    '/api/v1/appointments',
    adaptFastifyController((req, reply) => vendorOrdersController.listAppointments(req, reply))
  );
  app.post(
    '/api/v1/appointments/:id/remind',
    adaptFastifyController((req, reply) => vendorOrdersController.sendAppointmentReminder(req, reply))
  );

  // Multi-Tenant MoR Revenue Engine & PayFast Fee Arbitrage Endpoints
  app.post(
    '/api/v1/revenue/calculate-settlement',
    adaptFastifyController((req, reply) => revenueController.calculateSettlement(req, reply))
  );
  app.post(
    '/api/v1/revenue/settle-order',
    adaptFastifyController((req, reply) => revenueController.settleOrder(req, reply))
  );
  app.post(
    '/api/v1/revenue/subscriptions/bill',
    adaptFastifyController((req, reply) => revenueController.billSubscription(req, reply))
  );
  app.post(
    '/api/v1/revenue/subscriptions/pre-payout-setoff',
    adaptFastifyController((req, reply) => revenueController.applyPrePayoutSetoff(req, reply))
  );
  app.get(
    '/api/v1/revenue/subscriptions',
    adaptFastifyController((req, reply) => revenueController.listSubscriptions(req, reply))
  );
  app.get(
    '/api/v1/revenue/summary',
    adaptFastifyController((req, reply) => revenueController.getRevenueSummary(req, reply))
  );

  // OpenAI GPT-4o Cross-Build & Operations Bridge Endpoints
  app.get(
    '/api/v1/ai/status',
    adaptFastifyController((req, reply) => aiBridgeController.getBridgeStatus(req, reply))
  );
  app.post(
    '/api/v1/ai/configure-key',
    adaptFastifyController((req, reply) => aiBridgeController.configureApiKey(req, reply))
  );
  app.post(
    '/api/v1/ai/bridge',
    adaptFastifyController((req, reply) => aiBridgeController.executeBridge(req, reply))
  );

  // Cloud Virtual WhatsApp Numbers & Zero-Data Vendor/Driver Command Endpoints
  app.get(
    '/api/v1/virtual-numbers',
    adaptFastifyController((req, reply) => virtualNumberController.listVirtualNumbers(req, reply))
  );
  app.post(
    '/api/v1/virtual-numbers/provision',
    adaptFastifyController((req, reply) => virtualNumberController.provisionVirtualNumber(req, reply))
  );
  app.post(
    '/api/v1/virtual-numbers/onboard-vendor',
    adaptFastifyController((req, reply) => virtualNumberController.onboardVendor(req, reply))
  );
  app.post(
    '/api/v1/virtual-numbers/zero-data-command',
    adaptFastifyController((req, reply) => virtualNumberController.executeZeroDataCommand(req, reply))
  );

  // Active Session Inspector
  app.get('/api/v1/sessions/:waId', async (req: Request, res: Response) => {
    const waId = req.params.waId as string;
    const session = await conversationSessionStore.getSession(waId);
    res.json({
      success: true,
      session,
    });
  });

  // Catch-all 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'NotFound',
      message: `Cannot ${req.method} ${req.originalUrl}`,
    });
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
