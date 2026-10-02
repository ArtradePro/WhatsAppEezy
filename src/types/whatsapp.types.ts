export interface WhatsAppLocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface WhatsAppOrderProductItem {
  product_retailer_id: string;
  quantity: number;
  item_price: number;
  currency: string;
}

export interface WhatsAppOrderMessage {
  catalog_id: string;
  text?: string;
  product_items: WhatsAppOrderProductItem[];
}

export interface WhatsAppInteractiveReply {
  type: 'button_reply' | 'list_reply';
  button_reply?: {
    id: string;
    title: string;
  };
  list_reply?: {
    id: string;
    title: string;
    description?: string;
  };
}

export interface WhatsAppImageMessage {
  id: string; // media_id
  mime_type?: string;
  sha256?: string;
  caption?: string;
}

export interface WhatsAppInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'interactive' | 'order' | 'location' | 'button' | 'image' | 'unknown';
  text?: {
    body: string;
  };
  image?: WhatsAppImageMessage;
  interactive?: WhatsAppInteractiveReply;
  order?: WhatsAppOrderMessage;
  location?: WhatsAppLocation;
}

export interface WhatsAppContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: 'whatsapp';
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: WhatsAppContact[];
      messages?: WhatsAppInboundMessage[];
      statuses?: any[];
    };
    field: string;
  }>;
}

export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WhatsAppWebhookEntry[];
}
