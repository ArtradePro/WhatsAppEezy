export type OrderStatus = 'draft' | 'pending_payment' | 'paid' | 'dispatched' | 'delivered' | 'cancelled';

export type VendorSubscriptionTier = 'starter' | 'pro' | 'enterprise';

export type VendorBusinessType = 'retail_delivery' | 'service_booking';

export interface Vendor {
  id: string;
  business_name: string;
  slug: string;
  whatsapp_number: string;
  meta_phone_number_id?: string;
  meta_catalog_id?: string;
  business_type?: VendorBusinessType;
  contact_email: string;
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
  commission_rate: number;
  subscription_tier?: VendorSubscriptionTier;
  subscription_monthly_fee?: number;
  processing_fee_billed_pct?: number;
  processing_fee_billed_fixed?: number;
  processing_fee_actual_pct?: number;
  processing_fee_actual_fixed?: number;
  auto_ledger_setoff?: boolean;
  is_active: boolean;
  created_at?: string;
}

export interface Product {
  id: string;
  vendor_id: string;
  title: string;
  category:
    | 'sand_stone'
    | 'bricks_blocks'
    | 'cement'
    | 'aluminium'
    | 'hardware'
    | 'hair_styling'
    | 'wellness_massage'
    | 'woodfired_pizza'
    | 'gourmet_burger'
    | 'hygiene_cleaning';
  unit_of_measure: string;
  unit_price: number;
  vat_inclusive?: boolean;
  is_available: boolean;
  image_url: string;
  raw_image_url?: string;
  enhanced_image_url?: string;
  meta_retailer_id?: string | null;
  description?: string;
  created_at?: string;
}

export interface ServiceAppointment {
  id: string;
  vendor_id: string;
  customer_name: string;
  customer_phone: string;
  service_title: string;
  unit_price: number;
  scheduled_start: string;
  scheduled_end: string;
  status: 'hold' | 'confirmed' | 'completed' | 'cancelled';
  hold_expires_at?: string;
  payfast_pf_payment_id?: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product_title?: string;
}

export interface Order {
  id: string;
  order_ref: string;
  vendor_id: string;
  customer_phone: string;
  customer_name: string;
  delivery_address: string;
  delivery_lon?: number;
  delivery_lat?: number;
  distance_km: number;
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  platform_fee: number;
  vendor_payout: number;
  payment_status: 'unpaid' | 'paid' | 'refunded';
  payfast_pf_payment_id?: string;
  current_status: OrderStatus;
  materials_breakdown?: string;
  created_at: string;
  items?: OrderItem[];
}

export interface LedgerEntry {
  id: string;
  order_id: string;
  order_ref?: string;
  vendor_id: string;
  entry_type:
    | 'customer_payment_received'
    | 'platform_commission_earned'
    | 'payment_spread_retained'
    | 'gateway_fee_disbursed'
    | 'gateway_fee_deducted'
    | 'vendor_payout_disbursed'
    | 'saas_subscription_setoff'
    | 'refund_reversed';
  debit: number;
  credit: number;
  balance_after: number;
  reference?: string;
  created_at: string;
}

export interface DashboardMetrics {
  gmvMonth: number;
  netPayableBalance: number;
  activeOrdersCount: number;
  conversionRatePct: number;
  payoutDate: string;
  totalOrdersCount: number;
}
