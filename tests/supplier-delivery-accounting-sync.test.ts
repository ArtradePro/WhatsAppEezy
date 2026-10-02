import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createFastifyApp } from '../src/fastify-app';
import { conversationStateMachine } from '../src/services/state-machine/conversation-state-machine';
import { conversationSessionStore } from '../src/services/state-machine/conversation-session.store';
import { whatsAppClientService } from '../src/services/whatsapp/whatsapp-client.service';
import { postgresOrderRepository } from '../src/database/postgres-order.repository';
import { postgresLedgerService } from '../src/database/postgres-ledger.service';
import { postgresVendorRepository } from '../src/database/postgres-vendor.repository';
import { accountingQueueWorker } from '../src/services/queue/accounting-queue.worker';
import { accountingReconciliationService } from '../src/services/accounting/accounting-reconciliation.service';
import { eodReconciliationService } from '../src/services/cron/eod-reconciliation.service';
import { payoutBatchService } from '../src/services/payout/payout-batch.service';
import { payFastService } from '../src/services/payment/payfast.service';

describe('Supplier Delivery Status Transitions & Automated Accounting Sync', () => {
  let app: FastifyInstance;
  const customerWaId = '27821234567';
  const vendorWaId = '27829876543';
  const orderRef = 'ORD-2026-SYNC-9988';
  const vendorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  beforeAll(async () => {
    app = createFastifyApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await eodReconciliationService.close();
  });

  beforeEach(async () => {
    await conversationSessionStore.resetSession(customerWaId);
  });

  describe('1. Vendor Dispatch State Machine via WhatsApp', () => {
    it('should transition order to "dispatched" and send exact truck en-route ping to customer upon dispatch_loaded', async () => {
      // 1. Seed paid order in repository
      const order = await postgresOrderRepository.createOrder(
        {
          order_ref: orderRef,
          vendor_id: vendorId,
          customer_phone: customerWaId,
          customer_name: 'Vernon Contractor',
          delivery_address: 'Stand 402, Albertinia Industrial',
          delivery_lon: 28.0473,
          delivery_lat: -26.2041,
          distance_km: 14.2,
          subtotal: 3300.0,
          delivery_fee: 562.4,
          total_amount: 3862.4,
          platform_fee: 308.99,
          vendor_payout: 3553.41,
          payment_status: 'paid',
          current_status: 'paid',
        },
        []
      );

      const sendTextSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage');

      // 2. Vendor taps "Truck Dispatched" (dispatch_loaded)
      await conversationStateMachine.handleInboundMessage(vendorWaId, 'Yard Dispatcher', {
        from: vendorWaId,
        id: 'wamid_dispatch_loaded_test',
        timestamp: `${Date.now()}`,
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: {
            id: `dispatch_loaded:${orderRef}`,
            title: 'Truck Dispatched',
          },
        },
      });

      // 3. Verify order status in PostgreSQL is 'dispatched'
      const updatedOrder = await postgresOrderRepository.findById(order.id);
      expect(updatedOrder?.current_status).toBe('dispatched');

      // 4. Verify customer received exact requested WhatsApp notification
      expect(sendTextSpy).toHaveBeenCalledWith(
        customerWaId,
        '🚚 Your order is on the truck and out for site delivery! Driver is en route.'
      );

      sendTextSpy.mockRestore();
    });

    it('should transition order to "delivered" and send exact delivery completed confirmation to customer upon dispatch_delivered', async () => {
      const order = await postgresOrderRepository.findByOrderRef(orderRef);
      expect(order).toBeDefined();

      const sendTextSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage');

      // Vendor taps "Delivered to Site" (dispatch_delivered)
      await conversationStateMachine.handleInboundMessage(vendorWaId, 'Yard Dispatcher', {
        from: vendorWaId,
        id: 'wamid_dispatch_delivered_test',
        timestamp: `${Date.now()}`,
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: {
            id: `dispatch_delivered:${orderRef}`,
            title: 'Delivered to Site',
          },
        },
      });

      // Verify order status in PostgreSQL is 'delivered'
      const updatedOrder = await postgresOrderRepository.findById(order!.id);
      expect(updatedOrder?.current_status).toBe('delivered');

      // Verify customer received exact requested delivery completion message
      expect(sendTextSpy).toHaveBeenCalledWith(
        customerWaId,
        '✅ Delivery completed. Please inspect materials and let us know if everything is in order.'
      );

      sendTextSpy.mockRestore();
    });
  });

  describe('2. Automated Invoice & Payout Sync (BullMQ & Xero / Sage)', () => {
    it('should automatically queue BullMQ job when order is paid and generate Platform Invoice (8%) and Vendor Settlement Line', async () => {
      const queueSpy = vi.spyOn(accountingQueueWorker, 'publishOrderPaid');

      const testPaidOrderRef = `ORD-ACCT-SYNC-${Date.now()}`;
      await postgresOrderRepository.createOrder(
        {
          order_ref: testPaidOrderRef,
          vendor_id: vendorId,
          customer_phone: customerWaId,
          customer_name: 'Vernon Contractor',
          delivery_address: 'Stand 402, Albertinia Industrial',
          delivery_lon: 28.0473,
          delivery_lat: -26.2041,
          distance_km: 14.2,
          subtotal: 3300.0,
          delivery_fee: 562.4,
          total_amount: 3862.4,
          platform_fee: 308.99,
          vendor_payout: 3553.41,
          payment_status: 'unpaid',
          current_status: 'pending_payment',
        },
        []
      );

      // Simulate PayFast ITN processing confirming payment
      await payFastService.processPaymentNotification({
        m_payment_id: testPaidOrderRef,
        pf_payment_id: `PF-SYNC-${Date.now()}`,
        payment_status: 'COMPLETE',
        amount_gross: '3862.40',
        amount_fee: '77.25',
        custom_str1: customerWaId,
        custom_str2: vendorWaId,
        custom_str3: testPaidOrderRef,
        signature: 'mock_signature',
      });

      // 1. Verify BullMQ queue publish was called
      expect(queueSpy).toHaveBeenCalled();
      const jobPayload = queueSpy.mock.calls[0][0];
      expect(jobPayload.orderId).toBe(testPaidOrderRef);
      expect(jobPayload.grossAmount).toBe(3862.4);

      // 2. Wait for worker processing tick
      await new Promise((resolve) => setTimeout(resolve, 80));

      // 3. Verify Platform Invoice generated for 8% commission + 15% VAT
      const invoices = await accountingReconciliationService.getAllInvoices();
      const invoice = invoices.find((i) => i.orderId === testPaidOrderRef);
      expect(invoice).toBeDefined();
      expect(invoice?.commissionGross).toBe(308.99); // 8% of 3862.40
      expect(invoice?.vatRate).toBe(0.15); // 15% SARS VAT
      expect(invoice?.vatAmount).toBe(46.35); // 15% of 308.99
      expect(invoice?.totalInvoiceAmount).toBe(355.34);
      expect(invoice?.syncStatus).toBe('SYNCED');

      // 4. Verify Vendor Settlement Line (Credit Note / Receipt) reflecting gross payment minus deductions
      const receipts = await accountingReconciliationService.getAllReceipts();
      const receipt = receipts.find((r) => r.orderId === testPaidOrderRef);
      expect(receipt).toBeDefined();
      expect(receipt?.grossSettlement).toBe(3862.4);
      expect(receipt?.deductions.platformCommission).toBe(308.99);
      expect(receipt?.deductions.paymentGatewayFee).toBe(77.25);
      expect(receipt?.netPayoutDue).toBe(3476.16); // 3862.40 - 308.99 - 77.25
      expect(receipt?.syncStatus).toBe('SYNCED');

      queueSpy.mockRestore();
    });
  });

  describe('3. Automated End-of-Day Reconciliation & South African Banking CSV Batch', () => {
    it('should compile ledger entries for the day and generate compliant CSV payout batch for SA online banking', async () => {
      // Seed a ledger entry for today's vendor payout
      await postgresLedgerService.recordEntry({
        order_id: orderRef,
        vendor_id: vendorId,
        entry_type: 'vendor_payout_disbursed',
        debit_amount: 0.0,
        credit_amount: 3553.41,
        reference: `Customer payment settled via PayFast: ${orderRef}`,
      });

      // Run daily EOD reconciliation
      const batch = await eodReconciliationService.runDailyEodReconciliation(new Date());

      expect(batch).toBeDefined();
      expect(batch.settlementCycle).toBe('DAILY_EOD');
      expect(batch.status).toBe('APPROVED');
      expect(batch.totalTransactions).toBeGreaterThan(0);
      expect(batch.totalAmount).toBeGreaterThan(0);

      // 1. Verify CSV file content formatting for South African online banking
      expect(batch.csvFileContent).toBeDefined();
      expect(batch.csvFilename).toContain('.csv');

      const csvLines = batch.csvFileContent!.split('\r\n');
      // Header check
      expect(csvLines[0]).toBe(
        'Recipient Name,Bank Name,Branch Code,Account Number,Account Type,Amount,Beneficiary Reference,Payer Reference,Status'
      );

      // Data row check (Standard Bank, 051001, etc.)
      const brickDirectRow = csvLines.find((l) => l.includes('BrickDirect Industrial Supplies'));
      expect(brickDirectRow).toBeDefined();
      expect(brickDirectRow).toContain('"Standard Bank"');
      expect(brickDirectRow).toContain('"051001"');
      expect(brickDirectRow).toContain('"023456789"');
      expect(brickDirectRow).toContain('"APPROVED"');

      // 2. Verify ACB Magtape 80-character fixed-width file content is also generated
      expect(batch.acbFileContent).toBeDefined();
      expect(batch.acbFilename).toContain('.ACB');
      const acbLines = batch.acbFileContent.split('\r\n');
      expect(acbLines[0].startsWith('02')).toBe(true); // User Header
      expect(acbLines[acbLines.length - 1].startsWith('99')).toBe(true); // User Trailer
    });

    it('should expose POST /api/v1/payouts/reconciliation/eod endpoint to trigger EOD batch on demand', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/payouts/reconciliation/eod',
        payload: {
          date: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);
      expect(data.success).toBe(true);
      expect(data.batch).toBeDefined();
      expect(data.batch.settlementCycle).toBe('DAILY_EOD');
      expect(data.batch.status).toBe('APPROVED');
    });

    it('should serve downloadable CSV batch file on GET /api/v1/payouts/batches/:batchId/csv', async () => {
      const batch = await eodReconciliationService.runDailyEodReconciliation(new Date());

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/payouts/batches/${batch.batchId}/csv`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain(`filename="${batch.csvFilename}"`);
      expect(response.body).toContain('Recipient Name,Bank Name,Branch Code,Account Number');
      expect(response.body).toContain('"BrickDirect Industrial Supplies"');
    });
  });
});
