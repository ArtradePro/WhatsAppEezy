"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationSessionStore = exports.ConversationSessionStore = exports.DEFAULT_TENANT_VENDOR_ID = void 0;
exports.DEFAULT_TENANT_VENDOR_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
class ConversationSessionStore {
    sessions = new Map();
    buildKey(waId, vendorId) {
        const resolvedVendorId = vendorId || exports.DEFAULT_TENANT_VENDOR_ID;
        return `${resolvedVendorId}::${waId}`;
    }
    async getSession(waId, customerName, vendorContext) {
        const vendorId = vendorContext?.vendorId || exports.DEFAULT_TENANT_VENDOR_ID;
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
        }
        else if (vendorContext) {
            if (vendorContext.metaPhoneNumberId)
                session.metaPhoneNumberId = vendorContext.metaPhoneNumberId;
            if (vendorContext.displayPhoneNumber)
                session.displayPhoneNumber = vendorContext.displayPhoneNumber;
            if (vendorContext.businessType)
                session.businessType = vendorContext.businessType;
        }
        return session;
    }
    async saveSession(session) {
        session.lastActiveAt = new Date().toISOString();
        const vendorId = session.vendorId || exports.DEFAULT_TENANT_VENDOR_ID;
        session.vendorId = vendorId;
        const key = this.buildKey(session.waId, vendorId);
        this.sessions.set(key, { ...session });
        return session;
    }
    async setStage(waId, stage, vendorId) {
        const session = await this.getSession(waId, undefined, { vendorId });
        session.currentStage = stage;
        return this.saveSession(session);
    }
    async resetSession(waId, vendorId) {
        const targetVendorId = vendorId || exports.DEFAULT_TENANT_VENDOR_ID;
        const key = this.buildKey(waId, targetVendorId);
        const existing = this.sessions.get(key);
        const session = {
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
    async findByOrderId(orderId) {
        for (const session of this.sessions.values()) {
            if (session.activeOrder?.orderId === orderId) {
                return session;
            }
        }
        return null;
    }
    async getAllTenantSessions(vendorId) {
        const all = Array.from(this.sessions.values());
        if (!vendorId)
            return all;
        return all.filter((s) => s.vendorId === vendorId);
    }
}
exports.ConversationSessionStore = ConversationSessionStore;
exports.conversationSessionStore = new ConversationSessionStore();
//# sourceMappingURL=conversation-session.store.js.map