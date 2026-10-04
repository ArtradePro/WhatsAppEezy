export type DbOrderStatus =
  | 'draft'
  | 'pending_payment'
  | 'paid'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export type DbLedgerEntryType =
  | 'customer_payment_received'
  | 'platform_commission_earned'
  | 'payment_spread_retained'
  | 'gateway_fee_disbursed'
  | 'gateway_fee_deducted'
  | 'vendor_payout_disbursed'
  | 'saas_subscription_setoff'
  | 'refund_reversed';

export type VendorSubscriptionTier = 'starter' | 'pro' | 'enterprise';

export type VendorBusinessType = 'retail_delivery' | 'service_booking';

export type DbAppointmentStatus = 'hold' | 'confirmed' | 'cancelled' | 'completed';

export interface ProcessingFeeRateConfig {
  percentage: number; // e.g. 0.029 (2.9%) or 0.020 (2.0%)
  fixed_fee: number;  // e.g. 2.00 (R2.00) or 1.50 (R1.50)
}

export interface DbVendor {
  id: string; // UUID
  business_name: string;
  slug: string;
  whatsapp_number: string;
  meta_phone_number_id?: string; // Unique Meta Cloud API Phone Number ID
  meta_catalog_id?: string;
  business_type?: VendorBusinessType; // 'retail_delivery' | 'service_booking'
  contact_email?: string;
  vat_number?: string;
  bank_account_holder: string;
  bank_name: string;
  bank_account_number: string;
  bank_branch_code: string;
  base_location_lon: number;
  base_location_lat: number;
  depot_address?: string;
  max_delivery_radius_km: number;
  free_delivery_radius_km?: number;
  base_delivery_fee: number;
  per_km_rate: number;
  vat_inclusive?: boolean;
  subscription_tier?: VendorSubscriptionTier;
  subscription_monthly_fee?: number;
  commission_rate: number;
  processing_fee_billed_rate?: ProcessingFeeRateConfig | string;
  processing_fee_actual_cost?: ProcessingFeeRateConfig | string;
  payfast_subscription_token?: string;
  auto_ledger_setoff?: boolean;
  is_active: boolean;
  created_at?: string;
}

export interface DbVendorServiceSchedule {
  id: string;
  vendor_id: string;
  day_of_week: number; // 0 = Sunday .. 6 = Saturday
  start_time: string;  // e.g. '08:00:00'
  end_time: string;    // e.g. '17:00:00'
  slot_duration_minutes: number;
  max_concurrent_bookings: number;
  created_at?: string;
}

export interface DbAppointment {
  id: string;
  vendor_id: string;
  customer_phone: string;
  customer_name?: string;
  service_product_id: string;
  order_id?: string;
  scheduled_start: string; // ISO TIMESTAMPTZ
  scheduled_end: string;   // ISO TIMESTAMPTZ
  status: DbAppointmentStatus;
  hold_expires_at?: string;
  payfast_pf_payment_id?: string;
  created_at?: string;
}

export interface DbProduct {
  id: string; // UUID
  vendor_id: string; // UUID
  meta_catalog_id?: string;
  meta_product_retailer_id?: string | null;
  title: string;
  description?: string;
  category: string;
  unit_of_measure: string;
  unit_price: number;
  vat_inclusive?: boolean;
  raw_image_url?: string;
  enhanced_image_url?: string;
  draft_specs?: Record<string, any> | null;
  is_available: boolean;
  created_at?: string;
}

export interface DbOrder {
  id: string; // UUID
  order_ref: string;
  vendor_id: string; // UUID
  customer_phone: string;
  customer_name?: string;
  delivery_address: string;
  delivery_lon: number;
  delivery_lat: number;
  distance_km: number;
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  platform_fee: number;
  vendor_payout: number;
  payment_status: string;
  payfast_pf_payment_id?: string;
  current_status: DbOrderStatus;
  created_at?: string;
}

export interface DbOrderItem {
  id?: string; // UUID
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface DbLedgerEntry {
  id?: string; // UUID
  order_id?: string;
  vendor_id: string;
  entry_type: DbLedgerEntryType;
  debit_amount: number;
  credit_amount: number;
  balance_after: number;
  reference?: string;
  created_at?: string;
}

export interface SpatialDeliveryCheckResult {
  within_radius: boolean;
  distance_km: number;
}

