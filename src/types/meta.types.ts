export interface MetaProductPayload {
  /** Supplier's unique SKU or product code */
  retailer_id: string;
  /** Product title displayed in WhatsApp commerce catalog (max 150 chars) */
  name: string;
  /** Detailed product description including standardized specifications */
  description: string;
  /** Stock availability status */
  availability: 'in stock' | 'out of stock' | 'preorder' | 'available for order' | 'discontinued';
  /** Product condition */
  condition: 'new' | 'refurbished' | 'used';
  /** Price in minor units or formatted float */
  price: number;
  /** 3-letter ISO Currency code (e.g., USD, ZAR, EUR) */
  currency: string;
  /** Publicly accessible HTTPS URL of the enhanced 1024x1024 image */
  image_url: string;
  /** Product landing page or WhatsApp direct chat link */
  url: string;
  /** Brand or manufacturer name */
  brand: string;
  /** Commerce taxonomy category */
  category?: string;
  /** Additional structured custom attributes */
  custom_data?: {
    dimensions?: string;
    material?: string;
    unit_of_measure?: string;
    color?: string;
    supplier_id?: string;
    [key: string]: any;
  };
}

export interface MetaGraphProductResponse {
  /** Meta Graph Catalog Product ID (fbid) */
  id: string;
  /** Retailer SKU mapped */
  retailer_id?: string;
  /** Success status */
  success?: boolean;
}

export interface MetaCatalogSyncResult {
  catalogId: string;
  metaProductId: string;
  retailerId: string;
  liveWhatsAppProductId: string;
  whatsAppCommerceUrl: string;
  syncStatus: 'SYNCED' | 'FAILED';
  syncedAt: string;
  rawResponse: Record<string, any>;
  errorMessage?: string;
}
