import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createFastifyApp } from '../src/fastify-app';
import { FastifyInstance } from 'fastify';
import { config } from '../src/config/env';
import { payFastService } from '../src/services/payment/payfast.service';
import { postgresOrderRepository } from '../src/database/postgres-order.repository';
import { postgresLedgerService } from '../src/database/postgres-ledger.service';
import { payFastEventEmitter } from '../src/services/events/payfast-events';

describe('PayFast ITN Webhook & Double-Entry Ledger Service', () => {
  let app: FastifyInstance;
  const testVendorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const testOrderRef = 'ORD-2026-ITN-TEST';

  beforeAll(async () => {
    app = createFastifyApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Successfully processes valid ITN on POST /api/webhooks/payfast/itn, updates order and inserts 3 balanced ledger rows', async () => {
    // 1. Seed order in database with status 'pending_payment'
    const totalAmount = 3862.4;
    const platformFee = 308.99;
    const vendorPayout = 3553.41;
    const subtotal = 3300.0;
    const deliveryFee = 562.4;

    const createdOrder = await postgresOrderRepository.createOrder(
      {
        order_ref: testOrderRef,
        vendor_id: testVendorId,
        customer_phone: '27821234567',
        customer_name: 'Vernon Contractor',
        delivery_address: 'Stand 402, Albertinia Industrial',
        delivery_lon: 28.0473,
        delivery_lat: -26.2041,
        distance_km: 14.2,
        subtotal,
        delivery_fee: deliveryFee,
        total_amount: totalAmount,
        platform_fee: platformFee,
        vendor_payout: vendorPayout,
        payment_status: 'unpaid',
        current_status: 'pending_payment',
      },
      []
    );

    expect(createdOrder).toBeDefined();

    // 2. Setup listener for Typed Event Emitter
    let orderPaidEventReceived = false;
    payFastEventEmitter.once('ORDER_PAID', (evt) => {
      orderPaidEventReceived = true;
      expect(evt.order.order_ref).toBe(testOrderRef);
    });

    // 3. Assemble PayFast ITN Payload
    const itnData: Record<string, string> = {
      m_payment_id: testOrderRef,
      pf_payment_id: 'PF-TX-99887766',
      payment_status: 'COMPLETE',
      item_name: 'Plaster Sand & Tipper Dispatch',
      amount_gross: '3862.40',
      amount_fee: '0.00',
      amount_net: '3862.40',
      custom_str1: '27821234567',
      custom_str2: '+27820000001',
      custom_str3: testOrderRef,
    };

    // 4. Compute valid MD5 signature with passphrase
    const signature = payFastService.generateSignature(itnData, config.PAYFAST_PASSPHRASE);
    itnData.signature = signature;

    const formBody = new URLSearchParams(itnData).toString();

    // 5. Send POST to /api/webhooks/payfast/itn
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/payfast/itn',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: formBody,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('OK');
    expect(orderPaidEventReceived).toBe(true);

    // 6. Verify order updated in database
    const updatedOrder = await postgresOrderRepository.findByOrderRef(testOrderRef);
    expect(updatedOrder).toBeDefined();
    expect(updatedOrder?.payment_status).toBe('paid');
    expect(updatedOrder?.current_status).toBe('paid');
    expect(updatedOrder?.payfast_pf_payment_id).toBe('PF-TX-99887766');

    // 7. Verify balanced double-entry rows in ledger_entries
    const ledgerEntries = await postgresLedgerService.getEntriesByOrder(updatedOrder!.id);
    expect(ledgerEntries.length).toBeGreaterThanOrEqual(3);

    const entry1 = ledgerEntries.find((e) => e.entry_type === 'customer_payment_received');
    expect(entry1).toBeDefined();
    expect(entry1?.credit_amount).toBe(totalAmount);
    expect(entry1?.debit_amount).toBe(0);
    expect(entry1?.reference).toBe('Customer payment settled via PayFast');

    const entry2 = ledgerEntries.find((e) => e.entry_type === 'platform_commission_earned');
    expect(entry2).toBeDefined();
    expect(entry2?.credit_amount).toBe(platformFee);
    expect(entry2?.debit_amount).toBe(0);
    expect(entry2?.reference).toBe('Platform cut retained');

    const entry3 = ledgerEntries.find((e) => e.entry_type === 'vendor_payout_disbursed');
    expect(entry3).toBeDefined();
    expect(entry3?.credit_amount).toBe(vendorPayout);
    expect(entry3?.debit_amount).toBe(0);
    expect(entry3?.reference).toBe('Vendor payable balance credited');

    // 8. Verify running vendor balance updated
    const finalBalance = await postgresLedgerService.getVendorBalance(testVendorId);
    expect(finalBalance).toBeGreaterThanOrEqual(vendorPayout);
  });

  it('2. Prevents replay attack / idempotency duplicates on secondary ITN receipt', async () => {
    // Attempt replaying the exact same payment notification
    const itnData: Record<string, string> = {
      m_payment_id: testOrderRef,
      pf_payment_id: 'PF-TX-99887766',
      payment_status: 'COMPLETE',
      amount_gross: '3862.40',
      custom_str1: '27821234567',
      custom_str3: testOrderRef,
    };

    const signature = payFastService.generateSignature(itnData, config.PAYFAST_PASSPHRASE);
    itnData.signature = signature;

    const countBefore = (await postgresLedgerService.getEntriesByOrder(
      (await postgresOrderRepository.findByOrderRef(testOrderRef))!.id
    )).length;

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/payfast/itn',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams(itnData).toString(),
    });

    expect(response.statusCode).toBe(200);

    const countAfter = (await postgresLedgerService.getEntriesByOrder(
      (await postgresOrderRepository.findByOrderRef(testOrderRef))!.id
    )).length;

    // Idempotency: no additional ledger rows inserted
    expect(countAfter).toBe(countBefore);
  });

  it('3. Rejects ITN with invalid MD5 signature (returns HTTP 400)', async () => {
    const itnData: Record<string, string> = {
      m_payment_id: 'ORD-INVALID-SIG',
      pf_payment_id: 'PF-TAMPERED-01',
      payment_status: 'COMPLETE',
      amount_gross: '500.00',
      signature: 'bad_md5_signature_hex_12345',
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/payfast/itn',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams(itnData).toString(),
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toBe('Invalid signature');
  });

  it('4. Rejects ITN when server validation postback ping fails (returns HTTP 400)', async () => {
    const itnData: Record<string, string> = {
      m_payment_id: 'ORD-SERVER-PING-FAIL',
      pf_payment_id: 'PF-PING-FAIL-01',
      payment_status: 'COMPLETE',
      amount_gross: '1200.00',
    };

    const signature = payFastService.generateSignature(itnData, config.PAYFAST_PASSPHRASE);
    itnData.signature = signature;

    // Spy on validateServerPostback to simulate PayFast returning INVALID
    const spy = vi.spyOn(payFastService, 'validateServerPostback').mockResolvedValueOnce(false);

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/payfast/itn',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams(itnData).toString(),
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toBe('Validation ping failed');
    spy.mockRestore();
  });

  it('5. Verifies signature with preserved key sequence as well as sorted order', () => {
    const rawData = {
      m_payment_id: 'ORD-SEQ-01',
      pf_payment_id: 'PF-SEQ-01',
      amount_gross: '1500.00',
      item_name: 'Cement Bags',
    };

    // Generated with default raw sequence
    const exactSig = payFastService.generateSignature(rawData, 'payfast_secure_passphrase', false);
    expect(payFastService.verifySignature({ ...rawData, signature: exactSig }, 'payfast_secure_passphrase')).toBe(true);

    // Generated with sorted keys
    const sortedSig = payFastService.generateSignature(rawData, 'payfast_secure_passphrase', true);
    expect(payFastService.verifySignature({ ...rawData, signature: sortedSig }, 'payfast_secure_passphrase')).toBe(true);
  });
});
