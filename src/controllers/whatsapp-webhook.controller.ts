import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/env';
import { WhatsAppWebhookPayload } from '../types/whatsapp.types';
import { validateMetaSignature } from '../utils/meta-signature.util';
import { whatsAppQueueWorker } from '../services/queue/whatsapp-queue.worker';

export class WhatsAppWebhookController {
  public static latestEvents: Array<{ time: string; type: string; app?: string; payload: any }> = [];

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

    const payload = req.body as any;
    if (payload?.object === 'whatsapp_business_account') {
      // Hand off to queue worker asynchronously
      await whatsAppQueueWorker.enqueueWebhook(payload as WhatsAppWebhookPayload);
    } else if (payload?.app && payload?.type === 'message') {
      const normalized = this.normalizeGupshupPayload(payload);
      if (normalized) {
        await whatsAppQueueWorker.enqueueWebhook(normalized);
      }
    }
  }

  /**
   * Gupshup Webhook Handshake & Event Ingestion (GET/POST /api/webhooks/gupshup)
   * Supports both Gupshup v2 JSON format and Gupshup v3 Meta Cloud Pass-Through format
   */
  async handleGupshupWebhook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.status(200).send({ status: 'GUPSHUP_EVENT_RECEIVED' });

    const body = req.body as any;
    if (!body) return;

    WhatsAppWebhookController.latestEvents.unshift({
      time: new Date().toISOString(),
      type: body.type || body.object || 'unknown',
      app: body.app,
      payload: body.payload || body,
    });
    if (WhatsAppWebhookController.latestEvents.length > 50) {
      WhatsAppWebhookController.latestEvents.pop();
    }

    if (body.object === 'whatsapp_business_account') {
      await whatsAppQueueWorker.enqueueWebhook(body as WhatsAppWebhookPayload);
      return;
    }

    if (body.type === 'message' && body.payload) {
      const normalized = this.normalizeGupshupPayload(body);
      if (normalized) {
        await whatsAppQueueWorker.enqueueWebhook(normalized);
      }
    }
  }

  private normalizeGupshupPayload(gupshupBody: any): WhatsAppWebhookPayload | null {
    try {
      const p = gupshupBody.payload || {};
      const fromPhone = String(p.source || p.sender?.phone || '').replace(/^\+/, '');
      const senderName = p.sender?.name || 'WhatsApp Customer';

      let destinationPhone = String(p.destination || '').replace(/^\+/, '');
      let phoneNumberId = destinationPhone;

      const appName = gupshupBody.app || '';
      if (!destinationPhone) {
        if (appName === 'LCSHSmartspace') {
          destinationPhone = '15553180006';
          phoneNumberId = '1124984863821882';
        } else if (appName === 'WhatsAppEezyHQ') {
          destinationPhone = '15553426540';
          phoneNumberId = '1279806698557702';
        } else if (appName === 'Higiene') {
          destinationPhone = '15553443356';
          phoneNumberId = '1465835996503272';
        } else if (appName === 'WhatsAppEezy') {
          destinationPhone = '15554629242';
          phoneNumberId = '1359238143940536';
        } else {
          destinationPhone = String(config.WHATSAPP_PHONE_NUMBER_ID || '15554629242').replace(/^\+/, '');
          phoneNumberId = destinationPhone;
        }
      } else {
        if (destinationPhone === '15553180006') phoneNumberId = '1124984863821882';
        else if (destinationPhone === '15553426540') phoneNumberId = '1279806698557702';
        else if (destinationPhone === '15553443356') phoneNumberId = '1465835996503272';
        else if (destinationPhone === '15554629242') phoneNumberId = '1359238143940536';
      }

      const msgId = p.id || `gup_${Date.now()}`;
      const msgType = p.type || 'text';

      const messageObj: any = {
        from: fromPhone,
        id: msgId,
        timestamp: String(Math.floor((gupshupBody.timestamp || Date.now()) / 1000)),
        type: msgType === 'location' ? 'location' : 'text',
      };

      if (msgType === 'location' && p.payload) {
        messageObj.location = {
          latitude: Number(p.payload.latitude || -26.1467),
          longitude: Number(p.payload.longitude || 28.0416),
          name: p.payload.name || 'Pinned Delivery Site',
          address: p.payload.address || '',
        };
      } else {
        messageObj.text = {
          body: p.payload?.text || p.payload?.title || String(p.payload?.body || 'hi'),
        };
      }

      return {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: gupshupBody.app || 'whatsappeezy-gupshup',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: destinationPhone,
                    phone_number_id: phoneNumberId,
                  },
                  contacts: [
                    {
                      profile: { name: senderName },
                      wa_id: fromPhone,
                    },
                  ],
                  messages: [messageObj],
                },
              },
            ],
          },
        ],
      };
    } catch (err) {
      console.error('⚠️ Failed to normalize Gupshup webhook payload:', err);
      return null;
    }
  }
}

export const whatsAppWebhookController = new WhatsAppWebhookController();
