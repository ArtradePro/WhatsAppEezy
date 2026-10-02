export interface PayFastCheckoutRequest {
  merchant_id: string;
  merchant_key: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  m_payment_id: string;
  amount: string; // e.g. '1250.00'
  item_name: string;
  item_description: string;
  custom_str1?: string; // Customer WhatsApp Number
  custom_str2?: string; // Vendor WhatsApp Number
  custom_str3?: string; // Order ID
  signature?: string;
  [key: string]: string | undefined;
}

export interface PayFastITNPayload {
  m_payment_id: string;
  pf_payment_id: string;
  payment_status: 'COMPLETE' | 'FAILED' | 'PENDING' | 'CANCELLED';
  item_name?: string;
  item_description?: string;
  amount_gross: string;
  amount_fee?: string;
  amount_net?: string;
  custom_str1?: string; // customer WhatsApp
  custom_str2?: string; // vendor WhatsApp
  custom_str3?: string; // orderId
  name_first?: string;
  name_last?: string;
  email_address?: string;
  merchant_id?: string;
  token?: string;
  signature: string;
  [key: string]: string | undefined;
}

export interface SplitLedgerEntry {
  id: string;
  orderId: string;
  mPaymentId: string;
  pfPaymentId: string;
  grossAmount: number;
  payfastFee: number;
  platformCommissionPercentage: number;
  platformCommissionAmount: number;
  vendorPayoutNet: number;
  currency: string;
  customerWhatsApp: string;
  vendorWhatsApp: string;
  status: 'SETTLED' | 'PENDING';
  processedAt: string;
}
