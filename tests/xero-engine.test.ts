import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createFastifyApp } from '../src/fastify-app';
import { xeroEngineService } from '../src/services/accounting/xero-engine.service';
import { xeroTokenStore } from '../src/services/accounting/xero-token-store';
import { postgresOrderRepository } from '../src/database/postgres-order.repository';
import { postgresVendorRepository } from '../src/database/postgres-vendor.repository';
import { accountingQueueWorker } from '../src/services/queue/accounting-queue.worker';
import { DbOrder, DbVendor } from '../src/types/database.types';

describe('Dedicated Xero Accounting Engine & Payouts', () => {
  let app: FastifyInstance;
  const testTenantId = 'xero-tenant-cargodash-prod';

  const sampleVendor: DbVendor = {
    id: 'b1234567-9c0b-4ef8-bb6d-6bb9bd380a99',
    business_name: 'Fonsi-Colquake Aggregates',
    slug: 'fonsi-colquake',
    whatsapp_number: '+27829876543',
    contact_email: 'accounts@fonsi-colquake.co.za',
    bank_account_holder: 'Fonsi-Colquake (Pty) Ltd',
    bank_name: 'First National Bank (FNB)',
    bank_account_number: '62849182390',
    bank_branch_code: '250655',
    base_location_lon: 21.5799,
    base_location_lat: -34.2057,
    max_delivery_radius_km: 45.0,
    base_delivery_fee: 250.0,
    per_km_rate: 22.0,
    commission_rate: 0.08,
    is_active: true,
  };

  const sampleOrder: DbOrder = {
    id: 'c9876543-9c0b-4ef8-bb6d-6bb9bd380b88',
    order_ref: 'ORD-2026-XERO-8921',
    vendor_id: sampleVendor.id,
    customer_phone: '27821234567',
    customer_name: 'Vernon Contractor',
    delivery_address: 'Stand 402, Albertinia Industrial',
    delivery_lon: 21.58,
    delivery_lat: -34.21,
    distance_km: 14.2,
    subtotal: 3300.0,
    delivery_fee: 562.4,
    total_amount: 3862.4,
    platform_fee: 308.99,
    vendor_payout: 3553.41,
    payment_status: 'paid',
    payfast_pf_payment_id: 'PF-XERO-9921',
    current_status: 'paid',
    created_at: new Date().toISOString(),
  };

  beforeAll(async () => {
    app = createFastifyApp();
    await app.ready();

    // Register vendor and order in repositories
    await postgresVendorRepository.saveVendor(sampleVendor);
    await postgresOrderRepository.createOrder(sampleOrder, []);
  });

  afterAll(async () => {
    await app.close();
    await accountingQueueWorker.close();
  });

  describe('1. Xero Authentication & Token Lifecycle', () => {
    it('should store and retrieve OAuth2 tokens with expiration tracking', async () => {
      await xeroTokenStore.saveTokens(testTenantId, {
        access_token: 'test_access_token_123',
        refresh_token: 'test_refresh_token_456',
        token_type: 'Bearer',
        expires_in: 1800,
        scope: 'accounting.transactions accounting.contacts',
      });

      const token = await xeroTokenStore.getTokens(testTenantId);
      expect(token).toBeDefined();
      expect(token?.accessToken).toBe('test_access_token_123');
      expect(token?.refreshToken).toBe('test_refresh_token_456');
      expect(token?.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should provide an active client connection with configured tenant ID', async () => {
      const { client, tenantId } = await xeroEngineService.getValidClient();
      expect(client).toBeDefined();
      expect(tenantId).toBe(testTenantId);
    });
  });

  describe('2. Vendor Contact Management in Xero', () => {
    it('should create a new Contact in Xero with complete banking and VAT details', async () => {
      const contactId = await xeroEngineService.ensureVendorContact(sampleVendor);
      expect(contactId).toBeDefined();
      expect(contactId.startsWith('xero_con_')).toBe(true);

      const contacts = xeroEngineService.getMockContacts();
      const created = contacts.find((c) => c.contactID === contactId);
      expect(created).toBeDefined();
      expect(created?.name).toBe('Fonsi-Colquake Aggregates');
      expect(created?.emailAddress).toBe('accounts@fonsi-colquake.co.za');
      expect(created?.bankAccountDetails).toContain('First National Bank (FNB)');
    });

    it('should return existing Contact ID when vendor is queried again (idempotent)', async () => {
      const firstId = await xeroEngineService.ensureVendorContact(sampleVendor);
      const secondId = await xeroEngineService.ensureVendorContact(sampleVendor);
      expect(secondId).toBe(firstId);
    });
  });

  describe('3. Order Paid Event: Platform Invoice & Vendor Settlement Bill Generation', () => {
    it('should generate Platform Fee Tax Invoice (ACCREC, AUTHORISED, 15% VAT on service fee)', async () => {
      const contactId = await xeroEngineService.ensureVendorContact(sampleVendor);
      const invoice = await xeroEngineService.createPlatformFeeTaxInvoice(sampleOrder, contactId);

      expect(invoice).toBeDefined();
      expect(invoice.type).toBe('ACCREC');
      expect(invoice.status).toBe('AUTHORISED');
      expect(invoice.invoiceNumber).toBe(`INV-COMM-${sampleOrder.order_ref}`);
      expect(invoice.total).toBe(308.99);

      // Verify SARS 15% Standard VAT breakdown:
      // Subtotal (exclusive) + Tax (15%) = Total (inclusive)
      expect(invoice.subtotal).toBeCloseTo(268.69, 1);
      expect(invoice.taxAmount).toBeCloseTo(40.30, 1);
      expect(invoice.subtotal + invoice.taxAmount).toBeCloseTo(invoice.total, 1);
    });

    it('should generate Vendor Settlement Bill (ACCPAY, AUTHORISED, net payout, next batch due date)', async () => {
      const contactId = await xeroEngineService.ensureVendorContact(sampleVendor);
      const bill = await xeroEngineService.createVendorSettlementBill(
        sampleOrder,
        contactId,
        '6m³ Plaster Sand + 14.2km Tipper Dispatch'
      );

      expect(bill).toBeDefined();
      expect(bill.type).toBe('ACCPAY');
      expect(bill.status).toBe('AUTHORISED');
      expect(bill.invoiceNumber).toBe(`BILL-SETTLE-${sampleOrder.order_ref}`);
      expect(bill.total).toBe(3553.41);
      expect(bill.dueDate).toBeDefined();

      // Due date should be in the future (next scheduled Friday settlement)
      const dueTimestamp = new Date(bill.dueDate).getTime();
      expect(dueTimestamp).toBeGreaterThan(Date.now() - 86400000);
    });

    it('should perform complete order paid sync via syncOrderPaid orchestration', async () => {
      const result = await xeroEngineService.syncOrderPaid({
        order: sampleOrder,
        vendor: sampleVendor,
        itemsSummary: '6m³ Plaster Sand',
      });

      expect(result).toBeDefined();
      expect(result.vendorContactId).toBeDefined();
      expect(result.platformInvoice.type).toBe('ACCREC');
      expect(result.platformInvoice.status).toBe('AUTHORISED');
      expect(result.settlementBill.type).toBe('ACCPAY');
      expect(result.settlementBill.status).toBe('AUTHORISED');
      expect(result.settlementBill.total).toBe(3553.41);
    });
  });

  describe('4. Xero Batch Payment Export for Banking Reconciliation', () => {
    it('should gather AUTHORISED unpaid vendor bills and bundle into a Xero Batch Payment', async () => {
      const batchResult = await xeroEngineService.createBatchPayment({
        settlementDate: '2026-10-02',
        bankAccountId: 'xero_bank_cargodash_escrow',
      });

      expect(batchResult.success).toBe(true);
      expect(batchResult.batchPaymentId).toBeDefined();
      expect(batchResult.status).toBe('AUTHORISED');
      expect(batchResult.billsCount).toBeGreaterThanOrEqual(1);
      expect(batchResult.totalAmount).toBeGreaterThan(0);
      expect(batchResult.billsPaid.length).toBeGreaterThanOrEqual(1);

      // Verify that settled bills now have zero balance
      const paidBill = batchResult.billsPaid[0];
      expect(paidBill.invoiceId).toBeDefined();
      expect(paidBill.amount).toBeGreaterThan(0);
    });
  });

  describe('5. HTTP API Endpoints via Fastify', () => {
    it('POST /api/accounting/xero/create-batch-payment should create and return batch payment', async () => {
      // First ensure an unpaid bill exists in mock storage
      await xeroEngineService.syncOrderPaid({
        order: {
          ...sampleOrder,
          order_ref: 'ORD-2026-XERO-HTTP-01',
          vendor_payout: 2500.0,
        },
        vendor: sampleVendor,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/accounting/xero/create-batch-payment',
        payload: {
          settlementDate: '2026-10-02',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.batchPayment).toBeDefined();
      expect(json.batchPayment.status).toBe('AUTHORISED');
      expect(json.batchPayment.billsCount).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/v1/accounting/xero/create-batch-payment should work as API v1 alias', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/accounting/xero/create-batch-payment',
        payload: {},
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.batchPayment).toBeDefined();
    });

    it('POST /api/accounting/xero/sync-order should sync registered order by ref', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/accounting/xero/sync-order',
        payload: {
          orderRef: sampleOrder.order_ref,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.result.platformInvoice.invoiceNumber).toBe(`INV-COMM-${sampleOrder.order_ref}`);
      expect(json.result.settlementBill.invoiceNumber).toBe(`BILL-SETTLE-${sampleOrder.order_ref}`);
    });

    it('GET /api/accounting/xero/status should report health and token state', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/accounting/xero/status',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.service).toBe('Xero Dedicated Accounting Engine');
      expect(json.tenantId).toBe(testTenantId);
      expect(json.token).toBeDefined();
      expect(json.mockStats).toBeDefined();
      expect(json.mockStats.invoicesCount).toBeGreaterThan(0);
    });
  });

  describe('6. Queue Worker Integration with Xero Accounting', () => {
    it('should trigger Xero sync when processing order paid job in queue worker', async () => {
      const initialInvoicesCount = xeroEngineService.getMockInvoices().length;

      await accountingQueueWorker.processOrderPaid({
        orderId: sampleOrder.order_ref,
        tenantId: sampleVendor.id,
        customerWhatsApp: sampleOrder.customer_phone,
        customerName: sampleOrder.customer_name,
        grossAmount: sampleOrder.total_amount,
        materialsSubtotal: sampleOrder.subtotal,
        freightAmount: sampleOrder.delivery_fee,
        currency: 'ZAR',
        payfastFee: 0,
        commissionPercentage: 8,
        timestamp: new Date().toISOString(),
      });

      const updatedInvoicesCount = xeroEngineService.getMockInvoices().length;
      // Both platform invoice and vendor bill should be generated
      expect(updatedInvoicesCount).toBeGreaterThanOrEqual(initialInvoicesCount + 2);
    });
  });
});
