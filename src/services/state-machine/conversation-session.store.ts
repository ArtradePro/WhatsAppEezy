import { CustomerSession, ConversationStage } from '../../types/state.types';
import { VendorBusinessType } from '../../types/database.types';

export const DEFAULT_TENANT_VENDOR_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

export class ConversationSessionStore {
  private sessions: Map<string, CustomerSession> = new Map();

  private buildKey(waId: string, vendorId?: string): string {
    const resolvedVendorId = vendorId || DEFAULT_TENANT_VENDOR_ID;
    return `${resolvedVendorId}::${waId}`;
  }

  async getSession(
    waId: string,
    customerName?: string,
    vendorContext?: {
      vendorId?: string;
      metaPhoneNumberId?: string;
      displayPhoneNumber?: string;
      businessType?: VendorBusinessType;
    }
  ): Promise<CustomerSession> {
    const vendorId = vendorContext?.vendorId || DEFAULT_TENANT_VENDOR_ID;
    const key = this.buildKey(waId, vendorId);

    let session = this.sessions.get(key);
    if (!session) {
      session = {
        waId,
        vendorId,
        metaPhoneNumberId: vendorContext?.metaPhoneNumberId,
        displayPhoneNumber: vendorContext?.displayPhoneNumber,
        businessType: vendorContext?.businessType || 'retail_delivery',
        customerName: customerName || 'Valued Customer',
        currentStage: 'IDLE',
        cart: [],
        lastActiveAt: new Date().toISOString(),
      };
      this.sessions.set(key, session);
    } else if (vendorContext) {
      if (vendorContext.metaPhoneNumberId) session.metaPhoneNumberId = vendorContext.metaPhoneNumberId;
      if (vendorContext.displayPhoneNumber) session.displayPhoneNumber = vendorContext.displayPhoneNumber;
      if (vendorContext.businessType) session.businessType = vendorContext.businessType;
    }
    return session;
  }

  async saveSession(session: CustomerSession): Promise<CustomerSession> {
    session.lastActiveAt = new Date().toISOString();
    const vendorId = session.vendorId || DEFAULT_TENANT_VENDOR_ID;
    session.vendorId = vendorId;
    const key = this.buildKey(session.waId, vendorId);
    this.sessions.set(key, { ...session });
    return session;
  }

  async setStage(
    waId: string,
    stage: ConversationStage,
    vendorId?: string
  ): Promise<CustomerSession> {
    const session = await this.getSession(waId, undefined, { vendorId });
    session.currentStage = stage;
    return this.saveSession(session);
  }

  async resetSession(waId: string, vendorId?: string): Promise<CustomerSession> {
    const targetVendorId = vendorId || DEFAULT_TENANT_VENDOR_ID;
    const key = this.buildKey(waId, targetVendorId);
    const existing = this.sessions.get(key);
    const session: CustomerSession = {
      waId,
      vendorId: targetVendorId,
      metaPhoneNumberId: existing?.metaPhoneNumberId,
      displayPhoneNumber: existing?.displayPhoneNumber,
      businessType: existing?.businessType || 'retail_delivery',
      customerName: existing?.customerName || 'Valued Customer',
      currentStage: 'IDLE',
      cart: [],
      lastActiveAt: new Date().toISOString(),
    };
    this.sessions.set(key, session);
    return session;
  }

  async findByOrderId(orderId: string): Promise<CustomerSession | null> {
    for (const session of this.sessions.values()) {
      if (session.activeOrder?.orderId === orderId) {
        return session;
      }
    }
    return null;
  }

  async getAllTenantSessions(vendorId?: string): Promise<CustomerSession[]> {
    const all = Array.from(this.sessions.values());
    if (!vendorId) return all;
    return all.filter((s) => s.vendorId === vendorId);
  }
}

export const conversationSessionStore = new ConversationSessionStore();

