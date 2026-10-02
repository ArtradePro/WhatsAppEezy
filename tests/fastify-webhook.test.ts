import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFastifyApp } from '../src/fastify-app';
import { FastifyInstance } from 'fastify';
import { config } from '../src/config/env';
import { payFastService } from '../src/services/payment/payfast.service';

describe('Fastify Webhook Handler Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = createFastifyApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /webhook responds to Meta challenge verification handshake', async () => {
    const verifyToken = config.WHATSAPP_VERIFY_TOKEN;
    const challenge = '1122334455';

    const response = await app.inject({
      method: 'GET',
      url: `/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(challenge);
  });

  it('GET /webhook rejects handshake with incorrect verify token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=123',
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('Verification token mismatch');
  });

  it('POST /webhook accepts WhatsApp incoming message payload and returns 200 EVENT_RECEIVED', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '123456789',
                  phone_number_id: 'mock-phone-number-id',
                },
                contacts: [
                  {
                    profile: { name: 'Alice Contractor' },
                    wa_id: '27829998877',
                  },
                ],
                messages: [
                  {
                    from: '27829998877',
                    id: 'wamid.HBgLMTIzNDU2Nw==',
                    timestamp: `${Date.now()}`,
                    type: 'text',
                    text: { body: 'Hi, I need building materials' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const response = await app.inject({
      method: 'POST',
      url: '/webhook',
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'EVENT_RECEIVED' });
  });

  it('POST /api/v1/payments/payfast/itn processes form-urlencoded ITN with valid signature', async () => {
    const itnData: Record<string, string> = {
      m_payment_id: 'ORD-ITN-FASTIFY-01',
      pf_payment_id: 'PF-TX-776655',
      payment_status: 'COMPLETE',
      item_name: 'CargoDash Bulk Order',
      amount_gross: '2000.00',
      amount_fee: '40.00',
      amount_net: '1960.00',
      custom_str1: '27829998877',
      custom_str2: '27820000001',
      custom_str3: 'ORD-ITN-FASTIFY-01',
    };

    // Generate valid MD5 signature
    const signature = payFastService.generateSignature(itnData, config.PAYFAST_PASSPHRASE);
    itnData.signature = signature;

    // Convert to application/x-www-form-urlencoded string
    const formBody = new URLSearchParams(itnData).toString();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/payfast/itn',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: formBody,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('OK');

    // Verify record in ledger endpoint
    const ledgerRes = await app.inject({
      method: 'GET',
      url: '/api/v1/ledger',
    });

    expect(ledgerRes.statusCode).toBe(200);
    const ledgerJson = JSON.parse(ledgerRes.body);
    expect(ledgerJson.success).toBe(true);
    expect(ledgerJson.entries.some((e: any) => e.orderId === 'ORD-ITN-FASTIFY-01')).toBe(true);
  });
});
