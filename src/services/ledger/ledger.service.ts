import { SplitLedgerEntry } from '../../types/payfast.types';
import { randomUUID } from 'crypto';

export interface ILedgerService {
  recordPaymentSplit(entry: Omit<SplitLedgerEntry, 'id' | 'processedAt'>): Promise<SplitLedgerEntry>;
  getEntryByOrderId(orderId: string): Promise<SplitLedgerEntry | null>;
  getAllEntries(): Promise<SplitLedgerEntry[]>;
}

export class LedgerService implements ILedgerService {
  private ledger: Map<string, SplitLedgerEntry> = new Map();

  async recordPaymentSplit(entry: Omit<SplitLedgerEntry, 'id' | 'processedAt'>): Promise<SplitLedgerEntry> {
    const record: SplitLedgerEntry = {
      ...entry,
      id: `led_${randomUUID()}`,
      processedAt: new Date().toISOString(),
    };

    this.ledger.set(record.orderId, record);
    return record;
  }

  async getEntryByOrderId(orderId: string): Promise<SplitLedgerEntry | null> {
    return this.ledger.get(orderId) || null;
  }

  async getAllEntries(): Promise<SplitLedgerEntry[]> {
    return Array.from(this.ledger.values());
  }
}

export const ledgerService = new LedgerService();
