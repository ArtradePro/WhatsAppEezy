import { randomUUID } from 'crypto';
import {
  OrderPaidEventPayload,
  PlatformCommissionInvoice,
  VendorSalesReceipt,
} from '../../types/accounting.types';
import { tenantRepository } from '../tenant/tenant.repository';
import { xeroClientService } from './xero-client.service';
import { sageOneClientService } from './sage-one-client.service';
import { metricsService } from '../metrics/metrics.service';

export class AccountingReconciliationService {
  private invoices: Map<string, PlatformCommissionInvoice> = new Map();
  private receipts: Map<string, VendorSalesReceipt> = new Map();

  /**
   * Reconciles an ORDER_PAID event:
   * a) Generates a tax invoice for the platform fee/commission billed to the supplier.
   * b) Generates a vendor sales receipt reflecting customer settlement and payout deductions.
   */
  async reconcilePaidOrder(event: OrderPaidEventPayload): Promise<{
    taxInvoice: PlatformCommissionInvoice;
    salesReceipt: VendorSalesReceipt;
  }> {
    const tenant = (await tenantRepository.findById(event.tenantId)) || (await tenantRepository.findAll())[0];
    const now = new Date();
    const dueDate = new Date(now.getTime() + 7 * 86400000); // 7-day payment term

    const commissionGross = Math.round(event.grossAmount * (event.commissionPercentage / 100) * 100) / 100;
    const vatRate = 0.15; // 15% South African standard VAT
    const vatAmount = Math.round(commissionGross * vatRate * 100) / 100;
    const totalInvoiceAmount = Math.round((commissionGross + vatAmount) * 100) / 100;

    // a) Platform Commission Tax Invoice (Billed to Supplier)
    const invoiceNumber = `INV-COMM-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const taxInvoice: PlatformCommissionInvoice = {
      invoiceId: `inv_${randomUUID()}`,
      invoiceNumber,
      orderId: event.orderId,
      tenantId: tenant.tenantId,
      supplierName: tenant.businessName,
      supplierVatNumber: tenant.taxVatNumber,
      supplierEmail: tenant.contactEmail,
      invoiceDate: now.toISOString(),
      dueDate: dueDate.toISOString(),
      currency: event.currency,
      commissionGross,
      vatRate,
      vatAmount,
      totalInvoiceAmount,
      lineItems: [
        {
          description: `Platform facilitation commission (${event.commissionPercentage}%) on Order #${event.orderId.slice(-6)}`,
          quantity: 1,
          unitAmount: commissionGross,
          taxType: '15% VAT',
          taxAmount: vatAmount,
          lineTotal: totalInvoiceAmount,
        },
      ],
      syncStatus: 'SYNCED',
      syncedAt: now.toISOString(),
    };

    // Interface with Xero / Sage One
    if (tenant.accountingIntegration === 'xero' || tenant.accountingIntegration === 'both') {
      const xeroRes = await xeroClientService.createPlatformCommissionInvoice(taxInvoice);
      taxInvoice.xeroInvoiceId = xeroRes.xeroInvoiceId;
    }
    if (tenant.accountingIntegration === 'sage_one' || tenant.accountingIntegration === 'both') {
      const sageRes = await sageOneClientService.createPlatformCommissionInvoice(taxInvoice);
      taxInvoice.sageInvoiceId = sageRes.sageInvoiceId;
    }

    this.invoices.set(taxInvoice.invoiceId, taxInvoice);

    // b) Vendor Sales Receipt (Reflecting customer settlement & payout deductions)
    const receiptNumber = `REC-VEND-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const totalDeductions = Math.round((commissionGross + event.payfastFee) * 100) / 100;
    const netPayoutDue = Math.round((event.grossAmount - totalDeductions) * 100) / 100;

    const salesReceipt: VendorSalesReceipt = {
      receiptId: `rec_${randomUUID()}`,
      receiptNumber,
      orderId: event.orderId,
      tenantId: tenant.tenantId,
      customerWhatsApp: event.customerWhatsApp,
      receiptDate: now.toISOString(),
      currency: event.currency,
      grossSettlement: event.grossAmount,
      materialsSubtotal: event.materialsSubtotal,
      freightDeliverySubtotal: event.freightAmount,
      deductions: {
        platformCommission: commissionGross,
        paymentGatewayFee: event.payfastFee,
        totalDeductions,
      },
      netPayoutDue,
      lineItems: [
        {
          description: `Customer Materials Settlement (Order #${event.orderId.slice(-6)})`,
          quantity: 1,
          unitAmount: event.materialsSubtotal,
          taxAmount: 0,
          lineTotal: event.materialsSubtotal,
        },
        {
          description: `Heavy Transit & Freight Logistics Settlement`,
          quantity: 1,
          unitAmount: event.freightAmount,
          taxAmount: 0,
          lineTotal: event.freightAmount,
        },
      ],
      syncStatus: 'SYNCED',
      syncedAt: now.toISOString(),
    };

    if (tenant.accountingIntegration === 'xero' || tenant.accountingIntegration === 'both') {
      const xeroReceipt = await xeroClientService.createVendorSalesReceipt(salesReceipt);
      salesReceipt.xeroReceiptId = xeroReceipt.xeroReceiptId;
    }
    if (tenant.accountingIntegration === 'sage_one' || tenant.accountingIntegration === 'both') {
      const sageReceipt = await sageOneClientService.createVendorSalesReceipt(salesReceipt);
      salesReceipt.sageReceiptId = sageReceipt.sageReceiptId;
    }

    this.receipts.set(salesReceipt.receiptId, salesReceipt);

    // Also update live dashboard metrics
    metricsService.recordPaidOrder({
      orderId: event.orderId,
      tenantId: tenant.tenantId,
      grossAmount: event.grossAmount,
      freightAmount: event.freightAmount,
      commissionAmount: commissionGross,
    });

    return {
      taxInvoice,
      salesReceipt,
    };
  }

  async getAllInvoices(): Promise<PlatformCommissionInvoice[]> {
    return Array.from(this.invoices.values());
  }

  async getAllReceipts(): Promise<VendorSalesReceipt[]> {
    return Array.from(this.receipts.values());
  }
}

export const accountingReconciliationService = new AccountingReconciliationService();
