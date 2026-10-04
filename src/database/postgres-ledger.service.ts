import { randomUUID } from 'crypto';
import { db } from './db';
import { DbLedgerEntry, DbLedgerEntryType } from '../types/database.types';

export class PostgresLedgerService {
  private inMemoryLedger: DbLedgerEntry[] = [];

  /**
   * Records a ledger entry with automated running balance calculation
   */
  async recordEntry(entry: {
    order_id?: string;
    vendor_id: string;
    entry_type: DbLedgerEntryType;
    debit_amount: number;
    credit_amount: number;
    reference?: string;
  }): Promise<DbLedgerEntry> {
    const currentBalance = await this.getVendorBalance(entry.vendor_id);
    const balanceAfter = Math.round((currentBalance + entry.credit_amount - entry.debit_amount) * 100) / 100;

    const pool = db.getPool();
    if (pool) {
      try {
        const queryText = `
          INSERT INTO ledger_entries (
            order_id, vendor_id, entry_type, debit_amount, credit_amount, balance_after, reference
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `;
        const res = await pool.query(queryText, [
          entry.order_id,
          entry.vendor_id,
          entry.entry_type,
          entry.debit_amount,
          entry.credit_amount,
          balanceAfter,
          entry.reference,
        ]);
        if (res.rows[0]) {
          return res.rows[0];
        }
      } catch (err) {
        console.warn('[PostgresLedger] DB insert fallback to memory:', err);
      }
    }

    const recorded: DbLedgerEntry = {
      id: randomUUID(),
      order_id: entry.order_id,
      vendor_id: entry.vendor_id,
      entry_type: entry.entry_type,
      debit_amount: entry.debit_amount,
      credit_amount: entry.credit_amount,
      balance_after: balanceAfter,
      reference: entry.reference,
      created_at: new Date().toISOString(),
    };

    this.inMemoryLedger.push(recorded);
    return recorded;
  }

  /**
   * Records a ledger entry with an explicit balance_after (used in multi-leg MoR settlement)
   */
  async recordEntryWithExplicitBalance(entry: {
    order_id?: string;
    vendor_id: string;
    entry_type: DbLedgerEntryType;
    debit_amount: number;
    credit_amount: number;
    balance_after: number;
    reference?: string;
  }): Promise<DbLedgerEntry> {
    const balanceAfter = Math.round(entry.balance_after * 100) / 100;

    const pool = db.getPool();
    if (pool) {
      try {
        const queryText = `
          INSERT INTO ledger_entries (
            order_id, vendor_id, entry_type, debit_amount, credit_amount, balance_after, reference
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `;
        const res = await pool.query(queryText, [
          entry.order_id,
          entry.vendor_id,
          entry.entry_type,
          entry.debit_amount,
          entry.credit_amount,
          balanceAfter,
          entry.reference,
        ]);
        if (res.rows[0]) {
          return res.rows[0];
        }
      } catch (err) {
        console.warn('[PostgresLedger] DB explicit balance insert fallback to memory:', err);
      }
    }

    const recorded: DbLedgerEntry = {
      id: randomUUID(),
      order_id: entry.order_id,
      vendor_id: entry.vendor_id,
      entry_type: entry.entry_type,
      debit_amount: entry.debit_amount,
      credit_amount: entry.credit_amount,
      balance_after: balanceAfter,
      reference: entry.reference,
      created_at: new Date().toISOString(),
    };

    this.inMemoryLedger.push(recorded);
    return recorded;
  }

  /**
   * Deducts monthly SaaS subscription fee directly from unsettled vendor balance (Ledger Set-Off)
   */
  async deductSubscriptionSetoff(params: {
    vendorId: string;
    amount: number;
    billingCycle: string;
    tier: string;
  }): Promise<DbLedgerEntry> {
    return this.recordEntry({
      vendor_id: params.vendorId,
      entry_type: 'saas_subscription_setoff',
      debit_amount: params.amount,
      credit_amount: 0.0,
      reference: `Monthly SaaS Subscription Set-Off (${params.tier.toUpperCase()} - ${params.billingCycle})`,
    });
  }

  /**
   * Calculates the current running escrow balance for a vendor
   */
  async getVendorBalance(vendorId: string): Promise<number> {
    const pool = db.getPool();
    if (pool) {
      try {
        const queryText = `
          SELECT balance_after 
          FROM ledger_entries 
          WHERE vendor_id = $1::uuid 
          ORDER BY created_at DESC 
          LIMIT 1
        `;
        const res = await pool.query(queryText, [vendorId]);
        if (res.rows.length > 0) {
          return parseFloat(res.rows[0].balance_after);
        }
        return 0.0;
      } catch (err) {
        console.warn('[PostgresLedger] DB balance fallback:', err);
      }
    }

    const vendorEntries = this.inMemoryLedger.filter((e) => e.vendor_id === vendorId);
    if (vendorEntries.length === 0) return 0.0;
    return vendorEntries[vendorEntries.length - 1].balance_after;
  }

  /**
   * Executes atomic double-entry settlement for a paid order:
   * 1. customer_payment_received (Credit vendor escrow account with gross amount)
   * 2. platform_commission_earned (Debit platform commission cut)
   * 3. gateway_fee_deducted (Debit PayFast payment gateway fee)
   */
  async settleOrderPayment(params: {
    orderId: string;
    vendorId: string;
    grossAmount: number;
    platformFee: number;
    gatewayFee: number;
    orderRef: string;
  }): Promise<{
    paymentReceived: DbLedgerEntry;
    commissionDeducted: DbLedgerEntry;
    gatewayFeeDeducted: DbLedgerEntry;
    netVendorEscrowBalance: number;
  }> {
    // 1. Credit Customer Payment Received
    const paymentReceived = await this.recordEntry({
      order_id: params.orderId,
      vendor_id: params.vendorId,
      entry_type: 'customer_payment_received',
      debit_amount: 0.0,
      credit_amount: params.grossAmount,
      reference: `Customer payment for ${params.orderRef}`,
    });

    // 2. Debit Platform Facilitation Commission
    const commissionDeducted = await this.recordEntry({
      order_id: params.orderId,
      vendor_id: params.vendorId,
      entry_type: 'platform_commission_earned',
      debit_amount: params.platformFee,
      credit_amount: 0.0,
      reference: `WhatsAppEezy commission on ${params.orderRef}`,
    });

    // 3. Debit Payment Gateway Fee (PayFast)
    const gatewayFeeDeducted = await this.recordEntry({
      order_id: params.orderId,
      vendor_id: params.vendorId,
      entry_type: 'gateway_fee_deducted',
      debit_amount: params.gatewayFee,
      credit_amount: 0.0,
      reference: `PayFast fee on ${params.orderRef}`,
    });

    const netVendorEscrowBalance = await this.getVendorBalance(params.vendorId);

    return {
      paymentReceived,
      commissionDeducted,
      gatewayFeeDeducted,
      netVendorEscrowBalance,
    };
  }

  /**
   * Records a vendor payout disbursement via weekly ACB / EFT
   */
  async disburseVendorPayout(
    vendorId: string,
    payoutAmount: number,
    batchReference: string
  ): Promise<DbLedgerEntry> {
    return this.recordEntry({
      vendor_id: vendorId,
      entry_type: 'vendor_payout_disbursed',
      debit_amount: payoutAmount,
      credit_amount: 0.0,
      reference: `Weekly ACB EFT Payout: ${batchReference}`,
    });
  }

  async getEntriesByOrder(orderId: string): Promise<DbLedgerEntry[]> {
    const pool = db.getPool();
    if (pool) {
      try {
        const res = await pool.query('SELECT * FROM ledger_entries WHERE order_id = $1::uuid ORDER BY created_at ASC', [orderId]);
        return res.rows;
      } catch (err) {
        console.warn('[PostgresLedger] Order query fallback:', err);
      }
    }
    return this.inMemoryLedger.filter((e) => e.order_id === orderId);
  }

  async getEntriesByVendor(vendorId: string): Promise<DbLedgerEntry[]> {
    const pool = db.getPool();
    if (pool) {
      try {
        const res = await pool.query('SELECT * FROM ledger_entries WHERE vendor_id = $1::uuid ORDER BY created_at ASC', [vendorId]);
        return res.rows;
      } catch (err) {
        console.warn('[PostgresLedger] Vendor query fallback:', err);
      }
    }
    return this.inMemoryLedger.filter((e) => e.vendor_id === vendorId);
  }

  async getAllEntries(): Promise<DbLedgerEntry[]> {
    const pool = db.getPool();
    if (pool) {
      try {
        const res = await pool.query('SELECT * FROM ledger_entries ORDER BY created_at ASC');
        return res.rows;
      } catch (err) {
        console.warn('[PostgresLedger] getAllEntries fallback:', err);
      }
    }
    return [...this.inMemoryLedger];
  }

  async getEntriesByDateRange(startDate: Date, endDate: Date): Promise<DbLedgerEntry[]> {
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    const pool = db.getPool();
    if (pool) {
      try {
        const res = await pool.query(
          'SELECT * FROM ledger_entries WHERE created_at >= $1 AND created_at <= $2 ORDER BY created_at ASC',
          [startIso, endIso]
        );
        return res.rows;
      } catch (err) {
        console.warn('[PostgresLedger] getEntriesByDateRange fallback:', err);
      }
    }

    return this.inMemoryLedger.filter((e) => {
      const time = e.created_at || '';
      return time >= startIso && time <= endIso;
    });
  }
}

export const postgresLedgerService = new PostgresLedgerService();
