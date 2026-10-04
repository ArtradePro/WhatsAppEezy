"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ledgerService = exports.LedgerService = void 0;
const crypto_1 = require("crypto");
class LedgerService {
    ledger = new Map();
    async recordPaymentSplit(entry) {
        const record = {
            ...entry,
            id: `led_${(0, crypto_1.randomUUID)()}`,
            processedAt: new Date().toISOString(),
        };
        this.ledger.set(record.orderId, record);
        return record;
    }
    async getEntryByOrderId(orderId) {
        return this.ledger.get(orderId) || null;
    }
    async getAllEntries() {
        return Array.from(this.ledger.values());
    }
}
exports.LedgerService = LedgerService;
exports.ledgerService = new LedgerService();
//# sourceMappingURL=ledger.service.js.map