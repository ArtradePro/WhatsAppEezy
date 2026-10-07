import fastify, { FastifyInstance } from 'fastify';
import formbody from '@fastify/formbody';
import cors from '@fastify/cors';
import fs from 'fs';
import path from 'path';
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

export function createFastifyApp(): FastifyInstance {
  const app = fastify({
    logger: false,
  });

  // Register custom JSON content type parser to preserve raw buffer for HMAC-SHA256 signature verification
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
    try {
      const rawBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
      (req as any).rawBody = rawBuffer;
      if (rawBuffer.length === 0) {
        done(null, {});
        return;
      }
      const json = JSON.parse(rawBuffer.toString('utf-8'));
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Enable URL-encoded form parsing for PayFast ITN webhook
  app.register(formbody);

  // Enable Cross-Origin Resource Sharing
  app.register(cors, {
    origin: '*',
  });

  // Health check endpoint (Railway & Docker Healthcheck + Supabase Pooler diagnostics)
  app.get('/health', async (request, _reply) => {
    const query = (request.query as Record<string, string>) || {};
    const deep = query.deep === 'true';
    const dbHealth = await db.checkHealth(deep);

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'WhatsApp State Machine & PayFast Checkout',
      environment: config.NODE_ENV,
      version: '1.0.0',
      database: dbHealth,
      redis: {
        configured: Boolean(config.REDIS_URL),
        mode: config.MOCK_EXTERNAL_APIS ? 'in-memory-fallback' : 'railway-redis',
      },
      whatsapp: {
        phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID,
        verifyTokenConfigured: Boolean(config.WHATSAPP_VERIFY_TOKEN),
      },
      payfast: {
        merchantId: config.PAYFAST_MERCHANT_ID,
        env: config.PAYFAST_ENV,
        commissionPct: config.PLATFORM_COMMISSION_PERCENTAGE,
      },
    };
  });

  // System Database Profile & On-Demand Migration Endpoints
  app.get('/api/v1/system/database-profile', async (_request, _reply) => {
    const profile = db.getProfile();
    const health = await db.checkHealth(true);
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
    const result = await db.runMigrations();
    return {
      success: true,
      ...result,
    };
  });

  // Meta Cloud API Webhook Handshake & Cryptographic Ingestion (Production Paths)
  app.get('/api/webhooks/whatsapp', async (request, reply) => {
    await whatsAppWebhookController.verifyWebhook(request, reply);
  });

  app.post('/api/webhooks/whatsapp', async (request, reply) => {
    await whatsAppWebhookController.handleInboundEvents(request, reply);
  });

  // Meta WhatsApp Business API Webhook routes (Legacy Aliases)
  app.get('/webhook', async (request, reply) => {
    await whatsAppWebhookController.verifyWebhook(request, reply);
  });

  app.post('/webhook', async (request, reply) => {
    await whatsAppWebhookController.handleInboundEvents(request, reply);
  });

  // Gupshup WhatsApp Webhook Handshake & Event Ingestion (v2 & v3 Meta format)
  app.get('/api/webhooks/gupshup', async (request, reply) => {
    await whatsAppWebhookController.handleGupshupWebhook(request, reply);
  });

  app.post('/api/webhooks/gupshup', async (request, reply) => {
    await whatsAppWebhookController.handleGupshupWebhook(request, reply);
  });

  // PayFast Instant Transaction Notification (ITN) webhook (Primary Route)
  app.post('/api/webhooks/payfast/itn', async (request, reply) => {
    await payFastWebhookController.handleITN(request, reply);
  });

  // PayFast Instant Transaction Notification (ITN) webhook (API v1 Alias)
  app.post('/api/v1/payments/payfast/itn', async (request, reply) => {
    await payFastWebhookController.handleITN(request, reply);
  });

  // PayFast Live Sandbox End-to-End Runner
  app.post('/api/v1/payments/payfast/sandbox-run', async (request, reply) => {
    await payFastWebhookController.runSandboxEndToEnd(request, reply);
  });

  // Railway Go-Live Status & B2B Vendor Acquisition Collateral Routes
  app.get('/api/v1/system/go-live-status', async (_request, _reply) => {
    const dbHealth = await db.checkHealth(false);
    return {
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
    };
  });

  app.get('/sell-sheet', async (_request, reply) => {
    const sheetPath = path.resolve(process.cwd(), 'public', 'b2b-vendor-sell-sheet.html');
    if (fs.existsSync(sheetPath)) {
      reply.status(200).type('text/html; charset=utf-8').send(fs.readFileSync(sheetPath, 'utf-8'));
      return;
    }
    reply.status(404).send('Sell-sheet file not found');
  });

  app.get('/api/v1/collateral/sell-sheet', async (_request, reply) => {
    const sheetPath = path.resolve(process.cwd(), 'public', 'b2b-vendor-sell-sheet.html');
    if (fs.existsSync(sheetPath)) {
      reply.status(200).type('text/html; charset=utf-8').send(fs.readFileSync(sheetPath, 'utf-8'));
      return;
    }
    reply.status(404).send('Sell-sheet file not found');
  });

  // Split-Checkout Ledger review endpoint
  app.get('/api/v1/ledger', async (request, reply) => {
    await payFastWebhookController.getLedgerEntries(request, reply);
  });

  // Multi-Tenant Dashboard KPIs
  app.get('/api/v1/dashboard/metrics', async (request, reply) => {
    await dashboardController.getMetrics(request, reply);
  });

  app.get('/api/v1/dashboard/tenants', async (request, reply) => {
    await dashboardController.getTenants(request, reply);
  });

  // Accounting Automation (Tax Invoices & Vendor Sales Receipts)
  app.get('/api/v1/accounting/invoices', async (request, reply) => {
    await dashboardController.getAccountingInvoices(request, reply);
  });

  app.get('/api/v1/accounting/receipts', async (request, reply) => {
    await dashboardController.getAccountingReceipts(request, reply);
  });

  // Payout Batching (ACB / EFT Generation & Downloads)
  app.post('/api/v1/payouts/batches/generate', async (request, reply) => {
    await payoutController.generateBatch(request, reply);
  });

  app.post('/api/v1/payouts/reconciliation/eod', async (request, reply) => {
    await payoutController.runEodReconciliation(request, reply);
  });

  app.get('/api/v1/payouts/batches', async (request, reply) => {
    await payoutController.listBatches(request, reply);
  });

  app.get('/api/v1/payouts/batches/:batchId/download', async (request, reply) => {
    await payoutController.downloadAcbFile(request, reply);
  });

  app.get('/api/v1/payouts/batches/:batchId/csv', async (request, reply) => {
    await payoutController.downloadCsvFile(request, reply);
  });

  // Dedicated Xero Accounting Engine Endpoints
  app.post('/api/accounting/xero/create-batch-payment', async (request, reply) => {
    await xeroController.createBatchPayment(request, reply);
  });

  app.post('/api/v1/accounting/xero/create-batch-payment', async (request, reply) => {
    await xeroController.createBatchPayment(request, reply);
  });

  app.post('/api/accounting/xero/sync-order', async (request, reply) => {
    await xeroController.syncOrder(request, reply);
  });

  app.post('/api/v1/accounting/xero/sync-order', async (request, reply) => {
    await xeroController.syncOrder(request, reply);
  });

  app.get('/api/accounting/xero/status', async (request, reply) => {
    await xeroController.getStatus(request, reply);
  });

  app.get('/api/v1/accounting/xero/status', async (request, reply) => {
    await xeroController.getStatus(request, reply);
  });

  // Vendor Dashboard Orders & Dispatch Status Transitions
  app.get('/api/vendor/orders', async (request, reply) => {
    await vendorOrdersController.listOrders(request, reply);
  });

  app.patch('/api/vendor/orders/:id/status', async (request, reply) => {
    await vendorOrdersController.updateStatus(request, reply);
  });

  app.patch('/api/orders/:id/status', async (request, reply) => {
    await vendorOrdersController.updateStatus(request, reply);
  });

  // Multi-Tenant MoR Revenue Engine & PayFast Fee Arbitrage Endpoints
  app.post('/api/v1/revenue/calculate-settlement', async (request, reply) => {
    await revenueController.calculateSettlement(request, reply);
  });

  app.post('/api/v1/revenue/settle-order', async (request, reply) => {
    await revenueController.settleOrder(request, reply);
  });

  app.post('/api/v1/revenue/subscriptions/bill', async (request, reply) => {
    await revenueController.billSubscription(request, reply);
  });

  app.post('/api/v1/revenue/subscriptions/pre-payout-setoff', async (request, reply) => {
    await revenueController.applyPrePayoutSetoff(request, reply);
  });

  app.get('/api/v1/revenue/subscriptions', async (request, reply) => {
    await revenueController.listSubscriptions(request, reply);
  });

  app.get('/api/v1/revenue/summary', async (request, reply) => {
    await revenueController.getRevenueSummary(request, reply);
  });

  // OpenAI GPT-4o Cross-Build & Operations Bridge Endpoints
  app.get('/api/v1/ai/status', async (request, reply) => {
    await aiBridgeController.getBridgeStatus(request, reply);
  });

  app.post('/api/v1/ai/configure-key', async (request, reply) => {
    await aiBridgeController.configureApiKey(request, reply);
  });

  app.post('/api/v1/ai/bridge', async (request, reply) => {
    await aiBridgeController.executeBridge(request, reply);
  });

  // Cloud Virtual WhatsApp Numbers & Zero-Data Vendor/Driver Command Endpoints
  app.get('/api/v1/virtual-numbers', async (request, reply) => {
    await virtualNumberController.listVirtualNumbers(request, reply);
  });

  app.post('/api/v1/virtual-numbers/provision', async (request, reply) => {
    await virtualNumberController.provisionVirtualNumber(request, reply);
  });

  app.post('/api/v1/virtual-numbers/onboard-vendor', async (request, reply) => {
    await virtualNumberController.onboardVendor(request, reply);
  });

  app.post('/api/v1/virtual-numbers/zero-data-command', async (request, reply) => {
    await virtualNumberController.executeZeroDataCommand(request, reply);
  });

  // Active Session Inspector (for debugging & monitoring customer stage)
  app.get('/api/v1/sessions/:waId', async (request, reply) => {
    const { waId } = request.params as { waId: string };
    const session = await conversationSessionStore.getSession(waId);
    return {
      success: true,
      session,
    };
  });

  return app;
}
