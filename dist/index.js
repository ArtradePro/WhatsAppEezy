"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const db_1 = require("./database/db");
const order_queue_worker_1 = require("./services/queue/order-queue.worker");
const accounting_queue_worker_1 = require("./services/queue/accounting-queue.worker");
const whatsapp_queue_worker_1 = require("./services/queue/whatsapp-queue.worker");
const app = (0, app_1.createApp)();
const PORT = env_1.config.PORT || 3000;
const HOST = '0.0.0.0';
async function bootstrap() {
    if (env_1.config.AUTO_MIGRATE_ON_STARTUP) {
        console.log('⚡ AUTO_MIGRATE_ON_STARTUP enabled: applying Supabase / PostgreSQL migrations...');
        await db_1.db.runMigrations();
    }
    const dbProfile = db_1.db.getProfile();
    const server = app.listen(PORT, HOST, () => {
        console.log(`=======================================================`);
        console.log(`🚀 WhatsApp Commerce Aggregator & Settlement Engine`);
        console.log(`📡 Listening on:   http://${HOST}:${PORT}`);
        console.log(`🌐 Health check:   http://localhost:${PORT}/health`);
        console.log(`🗄️  Database Mode:  ${dbProfile.mode.toUpperCase()} (SSL: ${dbProfile.sslEnabled ? 'ON' : 'OFF'})`);
        console.log(`💬 Meta Webhook:   GET/POST http://localhost:${PORT}/api/webhooks/whatsapp`);
        console.log(`💳 PayFast ITN:    POST http://localhost:${PORT}/api/webhooks/payfast/itn`);
        console.log(`💰 Revenue API:    POST http://localhost:${PORT}/api/v1/revenue/calculate-settlement`);
        console.log(`📥 Intake API:     POST http://localhost:${PORT}/api/v1/products/ingest`);
        console.log(`📑 Xero Engine:    POST http://localhost:${PORT}/api/accounting/xero/sync-order`);
        console.log(`🏷️  Meta Catalog:   Version ${env_1.config.META_GRAPH_API_VERSION} (ID: ${env_1.config.META_CATALOG_ID})`);
        console.log(`👁️  Vision AI:      ${env_1.config.VISION_PROVIDER.toUpperCase()}`);
        console.log(`⚡ Mock Mode:      ${env_1.config.MOCK_EXTERNAL_APIS ? 'ENABLED (Safe Local Dev)' : 'DISABLED (Live APIs)'}`);
        console.log(`=======================================================`);
    });
    if (Number(PORT) !== 3000) {
        const port3000Server = app.listen(3000, HOST, () => {
            console.log(`📡 Railway Dual-Port Listener active on http://${HOST}:3000`);
        });
        port3000Server.on('error', () => {
            // Ignore if 3000 is already bound
        });
    }
    process.on('SIGTERM', async () => {
        console.log('SIGTERM signal received: closing workers, DB pool, and HTTP server');
        await Promise.allSettled([
            order_queue_worker_1.orderQueueManager.close(),
            accounting_queue_worker_1.accountingQueueWorker.close(),
            whatsapp_queue_worker_1.whatsAppQueueWorker.close(),
            db_1.db.close(),
        ]);
        server.close(() => {
            console.log('HTTP server closed');
        });
    });
}
bootstrap().catch((err) => {
    console.error('❌ Fatal bootstrap error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map