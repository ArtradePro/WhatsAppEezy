import { EventEmitter } from 'events';
import { DbOrder, DbVendor, DbLedgerEntry } from '../../types/database.types';

export interface PayFastOrderPaidEvent {
  order: DbOrder;
  vendor: DbVendor | null;
  entries: DbLedgerEntry[];
  pfPaymentId: string;
  grossAmount: number;
  timestamp: string;
}

export class PayFastEventEmitter extends EventEmitter {
  emitOrderPaid(event: PayFastOrderPaidEvent): boolean {
    return this.emit('ORDER_PAID', event);
  }

  onOrderPaid(listener: (event: PayFastOrderPaidEvent) => void): this {
    return this.on('ORDER_PAID', listener);
  }
}

export const payFastEventEmitter = new PayFastEventEmitter();
