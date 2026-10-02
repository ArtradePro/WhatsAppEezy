import { randomUUID } from 'crypto';
import { db } from '../../database/db';
import { postgresOrderRepository } from '../../database/postgres-order.repository';
import { postgresLedgerService } from '../../database/postgres-ledger.service';
import { postgresVendorRepository } from '../../database/postgres-vendor.repository';
import { DbOrder, DbVendor, DbLedgerEntry, DbAppointment } from '../../types/database.types';
import { PayFastITNPayload } from '../../types/payfast.types';
import {
  morRevenueEngineService,
  MoRSettlementCalculation,
} from '../revenue/mor-revenue-engine.service';
import { appointmentEngineService } from '../booking/appointment-engine.service';

export interface PayFastTransactionResult {
  success: boolean;
  idempotent?: boolean;
  error?: string;
  message?: string;
  order?: DbOrder;
  vendor?: DbVendor | null;
  confirmedAppointment?: DbAppointment | null;
  entries?: DbLedgerEntry[];
  morSettlement?: MoRSettlementCalculation;
  finalVendorBalance?: number;
}

export class PayFastLedgerTransactionService {
  /**
   * Executes an atomic database transaction to process a verified PayFast ITN payment:
   * 1. Acquires row lock on the order
   * 2. Checks idempotency / replay attack prevention
   * 3. Dynamically resolves vendor slice & computes MoR dynamic rate & interchange fee arbitrage breakdown
   * 4. Updates orders table: payment_status = 'paid', current_status = 'paid', payfast_pf_payment_id
   * 5. Confirms any held service_booking appointment slot
   * 6. Inserts isolated double-entry margin rows into ledger_entries:
   *    - customer_payment_received (+gross_amount)
   *    - platform_commission_earned (+platform_commission)
   *    - payment_spread_retained (+gateway_margin_spread)
   *    - gateway_fee_disbursed (-payment_fee_actual)
   *    - vendor_payout_disbursed (+net_vendor_payout)
   * 7. Resolves vendor record for dispatch / booking notifications
   */
  async processITNTransaction(itnPayload: PayFastITNPayload): Promise<PayFastTransactionResult> {
    const orderIdentifier = (
      itnPayload.m_payment_id ||
      itnPayload.custom_str3 ||
      itnPayload.custom_str1 ||
      ''
    ).trim();

    const pfPaymentId = itnPayload.pf_payment_id || `PF-${Date.now()}`;
    const pool = db.getPool();

    // ------------------------------------------------------------------------
    // PATH A: Native PostgreSQL Atomic Transaction
    // ------------------------------------------------------------------------
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Query the orders record using m_payment_id / custom_str1 / custom_str3 with row-level lock
        const selectOrderSql = `
          SELECT * FROM orders 
          WHERE order_ref = $1 
             OR id::text = $1 
             OR order_ref = $2 
             OR order_ref = $3
          FOR UPDATE
        `;
        const orderRes = await client.query(selectOrderSql, [
          orderIdentifier,
          itnPayload.custom_str1 || '',
          itnPayload.custom_str3 || '',
        ]);

        if (orderRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return {
            success: false,
            error: 'ORDER_NOT_FOUND',
            message: `Order not found in database for identifier: ${orderIdentifier}`,
          };
        }

        const order: DbOrder = orderRes.rows[0];

        // 2. Verify payment_status is not already 'COMPLETE' or 'paid' (Idempotency / Anti-Replay)
        const currentPayStatus = (order.payment_status || '').toUpperCase();
        if (currentPayStatus === 'COMPLETE' || currentPayStatus === 'PAID') {
          await client.query('ROLLBACK');
          return {
            success: true,
            idempotent: true,
            order,
            message: `Order #${order.order_ref} was already processed. Duplicate ITN replay prevented.`,
          };
        }

        // 3. Resolve vendor record and compute MoR arbitrage breakdown
        const vendorId = order.vendor_id;
        const vendorSql = `
          SELECT id, business_name, slug, whatsapp_number, contact_email, vat_number,
                 bank_account_holder, bank_name, bank_account_number, bank_branch_code,
                 max_delivery_radius_km, base_delivery_fee, per_km_rate, commission_rate, is_active
          FROM vendors 
          WHERE id = $1
        `;
        const vendorRes = await client.query(vendorSql, [vendorId]);
        const vendor: DbVendor | null = vendorRes.rows[0] || null;

        const totalAmount = parseFloat(String(order.total_amount));
        const platformFee = parseFloat(String(order.platform_fee));
        const vendorPayout = parseFloat(String(order.vendor_payout));

        const morSettlement = morRevenueEngineService.calculateOrderSettlement({
          subtotal: parseFloat(String(order.subtotal || totalAmount)),
          deliveryFee: parseFloat(String(order.delivery_fee || 0)),
          grossAmount: totalAmount,
          vendor,
        });

        // 4. Update orders table
        const updateOrderSql = `
          UPDATE orders 
          SET payment_status = 'paid',
              current_status = 'paid',
              payfast_pf_payment_id = $2
          WHERE id = $1
          RETURNING *
        `;
        const updatedOrderRes = await client.query(updateOrderSql, [order.id, pfPaymentId]);
        const updatedOrder: DbOrder = updatedOrderRes.rows[0];

        // 5. Query latest vendor balance for running balance_after calculation
        const balanceSql = `
          SELECT balance_after 
          FROM ledger_entries 
          WHERE vendor_id = $1 
          ORDER BY created_at DESC 
          LIMIT 1 
          FOR UPDATE
        `;
        const balanceRes = await client.query(balanceSql, [vendorId]);
        const previousBalance = balanceRes.rows.length > 0
          ? parseFloat(String(balanceRes.rows[0].balance_after))
          : 0.0;

        // 6. Insert 5 isolated double-entry rows into ledger_entries
        const baseTime = Date.now();
        const entries: DbLedgerEntry[] = [];
        const insertEntrySql = `
          INSERT INTO ledger_entries (
            id, order_id, vendor_id, entry_type, debit_amount, credit_amount, balance_after, reference, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `;

        // Entry 1: customer_payment_received (+gross_amount)
        const balanceAfter1 = Math.round((previousBalance + totalAmount) * 100) / 100;
        const entry1Res = await client.query(insertEntrySql, [
          randomUUID(),
          order.id,
          vendorId,
          'customer_payment_received',
          0.0,
          totalAmount,
          balanceAfter1,
          'Customer payment settled via PayFast',
          new Date(baseTime).toISOString(),
        ]);
        entries.push(entry1Res.rows[0]);

        // Entry 2: platform_commission_earned (+platform_commission)
        const balanceAfter2 = Math.round((balanceAfter1 - platformFee) * 100) / 100;
        const entry2Res = await client.query(insertEntrySql, [
          randomUUID(),
          order.id,
          vendorId,
          'platform_commission_earned',
          0.0,
          platformFee,
          balanceAfter2,
          'Platform cut retained',
          new Date(baseTime + 1).toISOString(),
        ]);
        entries.push(entry2Res.rows[0]);

        // Entry 3: payment_spread_retained (+gateway_margin_spread)
        const balanceAfter3 = Math.round((balanceAfter2 - morSettlement.gateway_margin_spread) * 100) / 100;
        const entry3Res = await client.query(insertEntrySql, [
          randomUUID(),
          order.id,
          vendorId,
          'payment_spread_retained',
          0.0,
          morSettlement.gateway_margin_spread,
          balanceAfter3,
          'MoR payment processing spread retained',
          new Date(baseTime + 2).toISOString(),
        ]);
        entries.push(entry3Res.rows[0]);

        // Entry 4: gateway_fee_disbursed (-payment_fee_actual)
        const balanceAfter4 = Math.round((balanceAfter3 - morSettlement.payment_fee_actual) * 100) / 100;
        const entry4Res = await client.query(insertEntrySql, [
          randomUUID(),
          order.id,
          vendorId,
          'gateway_fee_disbursed',
          morSettlement.payment_fee_actual,
          0.0,
          balanceAfter4,
          'PayFast wholesale processing fee disbursed',
          new Date(baseTime + 3).toISOString(),
        ]);
        entries.push(entry4Res.rows[0]);

        // Entry 5: vendor_payout_disbursed (+net_vendor_payout)
        const finalVendorBalance = Math.round((previousBalance + vendorPayout) * 100) / 100;
        const entry5Res = await client.query(insertEntrySql, [
          randomUUID(),
          order.id,
          vendorId,
          'vendor_payout_disbursed',
          0.0,
          vendorPayout,
          finalVendorBalance,
          'Vendor payable balance credited',
          new Date(baseTime + 4).toISOString(),
        ]);
        entries.push(entry5Res.rows[0]);

        await client.query('COMMIT');

        return {
          success: true,
          order: updatedOrder,
          vendor,
          entries,
          morSettlement,
          finalVendorBalance,
        };
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('❌ [PayFastLedgerTransaction] SQL transaction rolled back:', err);
        throw err;
      } finally {
        client.release();
      }
    }

    // ------------------------------------------------------------------------
    // PATH B: Resilient Fallback Transaction (In-Memory / Test Mode)
    // ------------------------------------------------------------------------
    let order = await postgresOrderRepository.findByOrderRef(orderIdentifier);
    if (!order && itnPayload.custom_str1) {
      order = await postgresOrderRepository.findByOrderRef(itnPayload.custom_str1);
    }
    if (!order && itnPayload.custom_str3) {
      order = await postgresOrderRepository.findByOrderRef(itnPayload.custom_str3);
    }

    if (!order) {
      return {
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: `Order not found for identifier: ${orderIdentifier}`,
      };
    }

    // Idempotency check
    const currentPayStatus = (order.payment_status || '').toUpperCase();
    if (currentPayStatus === 'COMPLETE' || currentPayStatus === 'PAID') {
      return {
        success: true,
        idempotent: true,
        order,
        message: `Order #${order.order_ref} was already processed. Duplicate ITN replay prevented.`,
      };
    }

    const totalAmount = order.total_amount;
    const platformFee = order.platform_fee;
    const vendorPayout = order.vendor_payout;

    // Dynamically resolve the target vendor slice from custom variables or order record
    const resolvedVendor =
      (itnPayload.custom_str4 ? await postgresVendorRepository.findById(itnPayload.custom_str4) : null) ||
      (await postgresVendorRepository.findById(order.vendor_id)) ||
      (itnPayload.custom_str2 ? await postgresVendorRepository.findByWhatsAppNumber(itnPayload.custom_str2) : null);

    const vendorId = resolvedVendor?.id || order.vendor_id;
    const vendor = resolvedVendor;

    const morSettlement = morRevenueEngineService.calculateOrderSettlement({
      subtotal: order.subtotal,
      deliveryFee: order.delivery_fee,
      grossAmount: totalAmount,
      vendor,
    });

    // Update order status
    const updatedOrder = await postgresOrderRepository.updateOrderStatus(
      order.id,
      'paid',
      'paid',
      pfPaymentId
    );

    // If this order corresponds to a held service_booking appointment, confirm the slot
    const confirmedAppointment = await appointmentEngineService.confirmAppointmentPayment(
      {
        appointmentId: itnPayload.custom_str5,
        orderId: order.id,
      },
      pfPaymentId
    );

    const previousBalance = await postgresLedgerService.getVendorBalance(vendorId);

    // Entry 1: customer_payment_received (+gross_amount)
    const balanceAfter1 = Math.round((previousBalance + totalAmount) * 100) / 100;
    const entry1 = await postgresLedgerService.recordEntryWithExplicitBalance({
      order_id: order.id,
      vendor_id: vendorId,
      entry_type: 'customer_payment_received',
      debit_amount: 0.0,
      credit_amount: totalAmount,
      balance_after: balanceAfter1,
      reference: 'Customer payment settled via PayFast',
    });

    // Entry 2: platform_commission_earned (+platform_commission)
    const balanceAfter2 = Math.round((balanceAfter1 - platformFee) * 100) / 100;
    const entry2 = await postgresLedgerService.recordEntryWithExplicitBalance({
      order_id: order.id,
      vendor_id: vendorId,
      entry_type: 'platform_commission_earned',
      debit_amount: 0.0,
      credit_amount: platformFee,
      balance_after: balanceAfter2,
      reference: 'Platform cut retained',
    });

    // Entry 3: payment_spread_retained (+gateway_margin_spread)
    const balanceAfter3 = Math.round((balanceAfter2 - morSettlement.gateway_margin_spread) * 100) / 100;
    const entrySpread = await postgresLedgerService.recordEntryWithExplicitBalance({
      order_id: order.id,
      vendor_id: vendorId,
      entry_type: 'payment_spread_retained',
      debit_amount: 0.0,
      credit_amount: morSettlement.gateway_margin_spread,
      balance_after: balanceAfter3,
      reference: 'MoR payment processing spread retained',
    });

    // Entry 4: gateway_fee_disbursed (-payment_fee_actual)
    const balanceAfter4 = Math.round((balanceAfter3 - morSettlement.payment_fee_actual) * 100) / 100;
    const entryGateway = await postgresLedgerService.recordEntryWithExplicitBalance({
      order_id: order.id,
      vendor_id: vendorId,
      entry_type: 'gateway_fee_disbursed',
      debit_amount: morSettlement.payment_fee_actual,
      credit_amount: 0.0,
      balance_after: balanceAfter4,
      reference: 'PayFast wholesale processing fee disbursed',
    });

    // Entry 5: vendor_payout_disbursed (+net_vendor_payout)
    const finalVendorBalance = Math.round((previousBalance + vendorPayout) * 100) / 100;
    const entry3 = await postgresLedgerService.recordEntryWithExplicitBalance({
      order_id: order.id,
      vendor_id: vendorId,
      entry_type: 'vendor_payout_disbursed',
      debit_amount: 0.0,
      credit_amount: vendorPayout,
      balance_after: finalVendorBalance,
      reference: 'Vendor payable balance credited',
    });

    return {
      success: true,
      order: updatedOrder || order,
      vendor,
      confirmedAppointment,
      entries: [entry1, entry2, entrySpread, entryGateway, entry3],
      morSettlement,
      finalVendorBalance,
    };
  }
}

export const payFastLedgerTransactionService = new PayFastLedgerTransactionService();
