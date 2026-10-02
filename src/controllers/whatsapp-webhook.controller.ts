import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/env';
import { WhatsAppWebhookPayload } from '../types/whatsapp.types';
import { validateMetaSignature } from '../utils/meta-signature.util';
import { whatsAppQueueWorker } from '../services/queue/whatsapp-queue.worker';

export class WhatsAppWebhookController {
  /**
   * Meta Webhook Verification Challenge (GET /api/webhooks/whatsapp & GET /webhook)
   *
   * Query params: hub.mode, hub.verify_token, hub.challenge
   */
  async verifyWebhook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = req.query as {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    };

    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const validTokens = [config.META_WEBHOOK_VERIFY_TOKEN, config.WHATSAPP_VERIFY_TOKEN].filter(Boolean);

    if (mode === 'subscribe' && token && validTokens.includes(token)) {
      console.log('✅ Meta WhatsApp Webhook verified successfully');
      reply.status(200).type('text/plain').send(challenge);
      return;
    }

    console.warn('❌ Meta WhatsApp Webhook verification failed: Invalid verify token');
    reply.status(403).type('text/plain').send('Forbidden: Verification token mismatch');
  }

  /**
   * Meta Webhook Events Ingestion (POST /api/webhooks/whatsapp & POST /webhook)
   *
   * 1. Validates x-hub-signature-256 HMAC-SHA256 signature against raw request buffer
   * 2. Immediately responds HTTP 200 { status: 'EVENT_RECEIVED' } (<500ms SLA)
   * 3. Asynchronously enqueues payload to worker queue for routing
   */
  async handleInboundEvents(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;
    const isProductionPath = req.url.startsWith('/api/webhooks/whatsapp');

    // Cryptographic Signature Verification
    // Required on /api/webhooks/whatsapp or when header is provided
    if (isProductionPath || signatureHeader) {
      const rawBody = (req as any).rawBody;
      const isValid = validateMetaSignature(rawBody, signatureHeader, config.META_APP_SECRET);

      if (!isValid) {
        console.warn('🚨 Meta Webhook signature verification failed: Rejected with 401');
        reply.status(401).send({ error: 'Unauthorized: Invalid x-hub-signature-256' });
        return;
      }
    }

    // Immediate non-blocking response to satisfy Meta <500ms requirement
    reply.status(200).send({ status: 'EVENT_RECEIVED' });

    const payload = req.body as WhatsAppWebhookPayload;
    if (payload?.object === 'whatsapp_business_account') {
      // Hand off to queue worker asynchronously
      await whatsAppQueueWorker.enqueueWebhook(payload);
    }
  }
}

export const whatsAppWebhookController = new WhatsAppWebhookController();
