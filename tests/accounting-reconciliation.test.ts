import { describe, it, expect } from 'vitest';
import { accountingReconciliationService } from '../src/services/accounting/accounting-reconciliation.service';
import { accountingQueueWorker } from '../src/services/queue/accounting-queue.worker';
import { OrderPaidEventPayload } from '../src/types/accounting.types';

describe('Automated Accounting Reconciliation (Xero & Sage One)', () => {
  const samplePaidOrder: OrderPaidEventPayload = {
    orderId: 'ORD-ACCT-TEST-1234',
    tenantId: 'tenant_brickdirect',
    customerWhatsApp: '27821234567',
    customerName: 'Sipho Ndlovu',
    grossAmount: 2300.0,
    materialsSubtotal: 1650.0,
    freightAmount: 650.0,
    currency: 'ZAR',
    payfastFee: 46.0,
    commissionPercentage: 8.0,
    timestamp: new Date().toISOString(),
  };

  it('should generate a platform commission tax invoice billed to supplier with 15% VAT', async () => {
    const { taxInvoice } = await accountingReconciliationService.reconcilePaidOrder(samplePaidOrder);

    expect(taxInvoice).toBeDefined();
    expect(taxInvoice.orderId).toBe(samplePaidOrder.orderId);
    expect(taxInvoice.supplierName).toContain('BrickDirect');
    // 8% commission on 2300 = 184.00
    expect(taxInvoice.commissionGross).toBe(184.0);
    // 15% VAT on 184 = 27.60
    expect(taxInvoice.vatAmount).toBe(27.6);
    // Total invoice amount = 184 + 27.60 = 211.60
    expect(taxInvoice.totalInvoiceAmount).toBe(211.6);
    expect(taxInvoice.syncStatus).toBe('SYNCED');
    expect(taxInvoice.xeroInvoiceId).toBeDefined();
  });

  it('should generate a vendor sales receipt reflecting customer settlement and payout deductions', async () => {
    const { salesReceipt } = await accountingReconciliationService.reconcilePaidOrder(samplePaidOrder);

    expect(salesReceipt).toBeDefined();
    expect(salesReceipt.orderId).toBe(samplePaidOrder.orderId);
    expect(salesReceipt.grossSettlement).toBe(2300.0);
    expect(salesReceipt.materialsSubtotal).toBe(1650.0);
    expect(salesReceipt.freightDeliverySubtotal).toBe(650.0);

    // Deductions: 184.00 commission + 46.00 gateway fee = 230.00
    expect(salesReceipt.deductions.platformCommission).toBe(184.0);
    expect(salesReceipt.deductions.paymentGatewayFee).toBe(46.0);
    expect(salesReceipt.deductions.totalDeductions).toBe(230.0);

    // Net Payout Due: 2300 - 230 = 2070.00
    expect(salesReceipt.netPayoutDue).toBe(2070.0);
    expect(salesReceipt.syncStatus).toBe('SYNCED');
  });

  it('should accept ORDER_PAID event via accounting queue worker', async () => {
    await accountingQueueWorker.publishOrderPaid({
      orderId: 'ORD-QUEUE-TEST-99',
      tenantId: 'tenant_titan',
      customerWhatsApp: '27829990000',
      customerName: 'Queue Customer',
      grossAmount: 3000.0,
      materialsSubtotal: 2200.0,
      freightAmount: 800.0,
      currency: 'ZAR',
      payfastFee: 60.0,
      commissionPercentage: 7.5,
      timestamp: new Date().toISOString(),
    });

    // Wait short tick for worker event execution
    await new Promise((resolve) => setTimeout(resolve, 100));

    const invoices = await accountingReconciliationService.getAllInvoices();
    expect(invoices.some((inv) => inv.orderId === 'ORD-QUEUE-TEST-99')).toBe(true);
  });
});
