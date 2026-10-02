import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createFastifyApp } from '../src/fastify-app';
import { config } from '../src/config/env';
import { generateMetaSignature, validateMetaSignature } from '../src/utils/meta-signature.util';
import { whatsAppQueueWorker } from '../src/services/queue/whatsapp-queue.worker';
import { conversationStateMachine } from '../src/services/state-machine/conversation-state-machine';
import { vendorProductIngestionService } from '../src/services/vendor/vendor-product-ingestion.service';
import { WhatsAppWebhookPayload } from '../src/types/whatsapp.types';

describe('Meta Cloud API Webhook Handshake & Cryptographic Ingestion Engine', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = createFastifyApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await whatsAppQueueWorker.close();
  });

  describe('1. Webhook Handshake (GET /api/webhooks/whatsapp)', () => {
    it('returns HTTP 200 and raw text challenge when token matches META_WEBHOOK_VERIFY_TOKEN', async () => {
      const challenge = 'meta_challenge_random_1122334455';
      const verifyToken = config.META_WEBHOOK_VERIFY_TOKEN;

      const response = await app.inject({
        method: 'GET',
        url: `/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toBe(challenge);
    });

    it('returns HTTP 403 Forbidden when verify token does not match', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=unauthorized_token_xyz&hub.challenge=12345',
      });

      expect(response.statusCode).toBe(403);
      expect(response.body).toContain('Forbidden: Verification token mismatch');
    });

    it('returns HTTP 403 Forbidden when hub.mode is not "subscribe"', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/webhooks/whatsapp?hub.mode=unsubscribe&hub.verify_token=${config.META_WEBHOOK_VERIFY_TOKEN}&hub.challenge=12345`,
      });

      expect(response.statusCode).toBe(403);
      expect(response.body).toContain('Forbidden');
    });

    it('supports legacy alias GET /webhook with verify challenge', async () => {
      const challenge = 'legacy_challenge_9988';
      const response = await app.inject({
        method: 'GET',
        url: `/webhook?hub.mode=subscribe&hub.verify_token=${config.META_WEBHOOK_VERIFY_TOKEN}&hub.challenge=${challenge}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(challenge);
    });
  });

  describe('2. Cryptographic Ingestion & Signature Verification (POST /api/webhooks/whatsapp)', () => {
    const samplePayload: WhatsAppWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA-1234567890',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '27820000000',
                  phone_number_id: 'mock-phone-number-id',
                },
                contacts: [
                  {
                    profile: { name: 'Thabo Mbeki' },
                    wa_id: '27821112233',
                  },
                ],
                messages: [
                  {
                    from: '27821112233',
                    id: 'wamid.HBgLMTIzNDU2Nw==',
                    timestamp: `${Date.now()}`,
                    type: 'text',
                    text: { body: 'I need 12 cubes of building sand' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    it('rejects inbound webhook with HTTP 401 when x-hub-signature-256 is missing', async () => {
      const rawString = JSON.stringify(samplePayload);

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
        },
        payload: rawString,
      });

      expect(response.statusCode).toBe(401);
      const json = JSON.parse(response.body);
      expect(json.error).toContain('Unauthorized: Invalid x-hub-signature-256');
    });

    it('rejects inbound webhook with HTTP 401 when signature hash does not match (tampered payload)', async () => {
      const rawString = JSON.stringify(samplePayload);
      const tamperedString = JSON.stringify({ ...samplePayload, object: 'tampered' });

      // Generate signature for the untampered string, but send the tampered string
      const validSignature = generateMetaSignature(rawString, config.META_APP_SECRET);

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': validSignature,
        },
        payload: tamperedString,
      });

      expect(response.statusCode).toBe(401);
      const json = JSON.parse(response.body);
      expect(json.error).toContain('Unauthorized: Invalid x-hub-signature-256');
    });

    it('rejects inbound webhook with HTTP 401 when signed with wrong secret', async () => {
      const rawString = JSON.stringify(samplePayload);
      const invalidSignature = generateMetaSignature(rawString, 'wrong-app-secret-attacker');

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': invalidSignature,
        },
        payload: rawString,
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects malformed signature header formats', async () => {
      const rawString = JSON.stringify(samplePayload);

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': 'md5=invalid_prefix',
        },
        payload: rawString,
      });

      expect(response.statusCode).toBe(401);
    });

    it('accepts valid HMAC-SHA256 signature and returns 200 EVENT_RECEIVED immediately (<500ms)', async () => {
      const rawString = JSON.stringify(samplePayload);
      const validSignature = generateMetaSignature(rawString, config.META_APP_SECRET);

      const startTime = Date.now();
      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': validSignature,
        },
        payload: rawString,
      });
      const responseTimeMs = Date.now() - startTime;

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ status: 'EVENT_RECEIVED' });
      expect(responseTimeMs).toBeLessThan(500);
    });
  });

  describe('3. Asynchronous Non-Blocking Event Routing Queue', () => {
    it('routes customer session messages to conversationStateMachine', async () => {
      const stateMachineSpy = vi.spyOn(conversationStateMachine, 'handleInboundMessage');

      const customerPayload: WhatsAppWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'ENTRY-CUST-01',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '27820000000',
                    phone_number_id: 'mock-phone-id',
                  },
                  contacts: [{ profile: { name: 'Vernon Customer' }, wa_id: '27829991122' }],
                  messages: [
                    {
                      from: '27829991122',
                      id: 'wamid.customer_msg_test_01',
                      timestamp: `${Date.now()}`,
                      type: 'text',
                      text: { body: 'Hello, need concrete aggregate' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const rawString = JSON.stringify(customerPayload);
      const signature = generateMetaSignature(rawString, config.META_APP_SECRET);

      const routePromise = new Promise<void>((resolve) => {
        const handler = (data: any) => {
          if (data.from === '27829991122') {
            whatsAppQueueWorker.eventEmitter.off('message_routed', handler);
            resolve();
          }
        };
        whatsAppQueueWorker.eventEmitter.on('message_routed', handler);
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signature,
        },
        payload: rawString,
      });

      expect(response.statusCode).toBe(200);

      // Wait for async queue worker to process
      await routePromise;

      expect(stateMachineSpy).toHaveBeenCalledWith(
        '27829991122',
        'Vernon Customer',
        expect.objectContaining({
          id: 'wamid.customer_msg_test_01',
          type: 'text',
        }),
        expect.any(Object)
      );

      stateMachineSpy.mockRestore();
    });

    it('routes supplier catalog image uploads from registered vendors to vendorProductIngestionService', async () => {
      const vendorPhone = '27820000001'; // BrickDirect Industrial Supplies (+27820000001)
      const vendorIngestionSpy = vi.spyOn(vendorProductIngestionService, 'handleVendorInboundImage');

      const supplierImagePayload: WhatsAppWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'ENTRY-SUPPLIER-01',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '27820000000',
                    phone_number_id: 'mock-phone-id',
                  },
                  contacts: [{ profile: { name: 'BrickDirect Yard Manager' }, wa_id: vendorPhone }],
                  messages: [
                    {
                      from: vendorPhone,
                      id: 'wamid.supplier_img_test_01',
                      timestamp: `${Date.now()}`,
                      type: 'image',
                      image: {
                        id: 'mock_media_brick_001',
                        mime_type: 'image/jpeg',
                        caption: 'Cement stock bricks R2450 per 1000',
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const rawString = JSON.stringify(supplierImagePayload);
      const signature = generateMetaSignature(rawString, config.META_APP_SECRET);

      const routePromise = new Promise<void>((resolve) => {
        const handler = (data: any) => {
          if (data.from === vendorPhone) {
            whatsAppQueueWorker.eventEmitter.off('message_routed', handler);
            resolve();
          }
        };
        whatsAppQueueWorker.eventEmitter.on('message_routed', handler);
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signature,
        },
        payload: rawString,
      });

      expect(response.statusCode).toBe(200);

      // Wait for async queue worker to process
      await routePromise;

      expect(vendorIngestionSpy).toHaveBeenCalledWith(
        vendorPhone,
        expect.objectContaining({
          type: 'image',
          image: expect.objectContaining({
            id: 'mock_media_brick_001',
          }),
        })
      );

      vendorIngestionSpy.mockRestore();
    });

    it('routes non-registered vendor image uploads to conversationStateMachine as customer inquiry', async () => {
      const regularCustomerPhone = '27829995544'; // Unregistered customer
      const stateMachineSpy = vi.spyOn(conversationStateMachine, 'handleInboundMessage');

      const nonVendorImagePayload: WhatsAppWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'ENTRY-CUST-IMG-01',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '27820000000',
                    phone_number_id: 'mock-phone-id',
                  },
                  contacts: [{ profile: { name: 'Customer With Photo' }, wa_id: regularCustomerPhone }],
                  messages: [
                    {
                      from: regularCustomerPhone,
                      id: 'wamid.cust_img_test_01',
                      timestamp: `${Date.now()}`,
                      type: 'image',
                      image: {
                        id: 'mock_media_brick_002',
                        mime_type: 'image/jpeg',
                        caption: 'Do you have bricks like these?',
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const rawString = JSON.stringify(nonVendorImagePayload);
      const signature = generateMetaSignature(rawString, config.META_APP_SECRET);

      const routePromise = new Promise<void>((resolve) => {
        const handler = (data: any) => {
          if (data.from === regularCustomerPhone) {
            whatsAppQueueWorker.eventEmitter.off('message_routed', handler);
            resolve();
          }
        };
        whatsAppQueueWorker.eventEmitter.on('message_routed', handler);
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signature,
        },
        payload: rawString,
      });

      expect(response.statusCode).toBe(200);

      await routePromise;

      expect(stateMachineSpy).toHaveBeenCalledWith(
        regularCustomerPhone,
        'Customer With Photo',
        expect.objectContaining({
          id: 'wamid.cust_img_test_01',
          type: 'image',
        }),
        expect.any(Object)
      );

      stateMachineSpy.mockRestore();
    });
  });

  describe('4. Meta Signature Unit Verification', () => {
    const secret = 'super-secret-app-key-12345';
    const payload = '{"object":"whatsapp_business_account","entry":[]}';

    it('validates correct signature using timingSafeEqual', () => {
      const validHeader = generateMetaSignature(payload, secret);
      expect(validateMetaSignature(payload, validHeader, secret)).toBe(true);
    });

    it('rejects tampered payload buffer', () => {
      const validHeader = generateMetaSignature(payload, secret);
      expect(validateMetaSignature(payload + 'tampered', validHeader, secret)).toBe(false);
    });

    it('rejects wrong secret', () => {
      const validHeader = generateMetaSignature(payload, secret);
      expect(validateMetaSignature(payload, validHeader, 'wrong-secret')).toBe(false);
    });

    it('rejects invalid or missing header formats', () => {
      expect(validateMetaSignature(payload, '', secret)).toBe(false);
      expect(validateMetaSignature(payload, undefined, secret)).toBe(false);
      expect(validateMetaSignature(payload, 'sha1=123', secret)).toBe(false);
      expect(validateMetaSignature(payload, 'sha256=too_short', secret)).toBe(false);
    });
  });
});
