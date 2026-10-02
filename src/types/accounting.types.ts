export interface AccountingLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  taxType?: string;
  taxAmount: number;
  lineTotal: number;
}

export interface PlatformCommissionInvoice {
  invoiceId: string;
  invoiceNumber: string;
  orderId: string;
  tenantId: string;
  supplierName: string;
  supplierVatNumber?: string;
  supplierEmail: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  commissionGross: number;
  vatRate: number; // e.g. 0.15 (15% VAT)
  vatAmount: number;
  totalInvoiceAmount: number;
  lineItems: AccountingLineItem[];
  xeroInvoiceId?: string;
  sageInvoiceId?: string;
  syncStatus: 'SYNCED' | 'PENDING' | 'FAILED';
  syncedAt?: string;
}

export interface VendorSalesReceipt {
  receiptId: string;
  receiptNumber: string;
  orderId: string;
  tenantId: string;
  customerWhatsApp: string;
  receiptDate: string;
  currency: string;
  grossSettlement: number;
  materialsSubtotal: number;
  freightDeliverySubtotal: number;
  deductions: {
    platformCommission: number;
    paymentGatewayFee: number;
    totalDeductions: number;
  };
  netPayoutDue: number;
  lineItems: AccountingLineItem[];
  xeroReceiptId?: string;
  sageReceiptId?: string;
  syncStatus: 'SYNCED' | 'PENDING' | 'FAILED';
  syncedAt?: string;
}

export interface OrderPaidEventPayload {
  orderId: string;
  tenantId: string;
  customerWhatsApp: string;
  customerName: string;
  grossAmount: number;
  materialsSubtotal: number;
  freightAmount: number;
  currency: string;
  payfastFee: number;
  commissionPercentage: number;
  timestamp: string;
}
