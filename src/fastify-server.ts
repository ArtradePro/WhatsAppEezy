import { createFastifyApp } from './fastify-app';
import { config } from './config/env';

const app = createFastifyApp();
const PORT = process.env.FASTIFY_PORT ? parseInt(process.env.FASTIFY_PORT, 10) : (config.PORT || 3000);
const HOST = '0.0.0.0';

async function start() {
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`=======================================================`);
    console.log(`⚡ WhatsApp Business API Fastify Webhook Handler Active`);
    console.log(`📡 Listening on: http://localhost:${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 Webhook URL:  http://localhost:${PORT}/webhook`);
    console.log(`💳 PayFast ITN:  POST http://localhost:${PORT}/api/v1/payments/payfast/itn`);
    console.log(`📊 Split Ledger: GET http://localhost:${PORT}/api/v1/ledger`);
    console.log(`=======================================================`);
  } catch (err) {
    console.error('Error starting Fastify server:', err);
    process.exit(1);
  }
}

start();
