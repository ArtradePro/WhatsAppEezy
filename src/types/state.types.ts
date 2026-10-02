import { WhatsAppLocation } from './whatsapp.types';
import { VendorBusinessType } from './database.types';

export type ConversationStage =
  | 'IDLE'
  | 'BROWSING'
  | 'CART_BUILDING'
  | 'ADDRESS_INPUT'
  | 'SLOT_SELECTION'
  | 'QUOTE_CALCULATED'
  | 'PAYMENT_PENDING'
  | 'ORDER_CONFIRMED'
  | 'WAITING_FOR_PRICE_EDIT';

export interface CartItem {
  retailerId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  unitOfMeasure?: string;
  totalPrice: number;
}

export interface FreightDeliveryQuote {
  distanceKm: number;
  durationMinutes: number;
  durationText: string;
  freightTier: string;
  baseFlagFall: number;
  ratePerKm: number;
  mileageCost?: number;
  totalCubicMeters?: number;
  tipperSurcharge?: number;
  totalFreightCost: number;
  customerCoordinates?: { lat: number; lng: number };
  deliveryAddress?: string;
  vendorDepotCoordinates: { lat: number; lng: number };
}

export interface CheckoutOrder {
  orderId: string;
  vendorId?: string;
  businessType?: VendorBusinessType;
  appointmentId?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  customerWhatsApp: string;
  customerName: string;
  items: CartItem[];
  itemsSubtotal: number;
  freightQuote: FreightDeliveryQuote;
  totalAmount: number;
  currency: string;
  paymentUrl?: string;
  paymentStatus: 'UNPAID' | 'PAYMENT_PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  vendorWhatsApp: string;
  createdAt: string;
  paidAt?: string;
}

export interface CustomerSession {
  waId: string;
  vendorId?: string;
  metaPhoneNumberId?: string;
  displayPhoneNumber?: string;
  businessType?: VendorBusinessType;
  customerName: string;
  currentStage: ConversationStage;
  cart: CartItem[];
  deliveryLocation?: WhatsAppLocation;
  currentQuote?: FreightDeliveryQuote;
  activeOrder?: CheckoutOrder;
  activeAppointmentId?: string;
  pendingPriceEditProductId?: string;
  lastActiveAt: string;
}


