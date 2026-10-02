import {
  DbLedgerEntry,
  DbVendor,
  ProcessingFeeRateConfig,
  VendorSubscriptionTier,
} from '../../types/database.types';
import { postgresLedgerService } from '../../database/postgres-ledger.service';
import { postgresVendorRepository } from '../../database/postgres-vendor.repository';

export interface TierPricingConfig {
  tier: VendorSubscriptionTier;
  monthly_fee_zar: number;
  default_commission_rate: number;
  default_billed_rate: ProcessingFeeRateConfig;
  default_actual_cost: ProcessingFeeRateConfig;
}

export interface MoRSettlementCalculation {
  order_subtotal: number;
  haulage_freight: number;
  gross_amount: number;
  commission_rate: number;
  processing_fee_billed_rate: ProcessingFeeRateConfig;
  processing_fee_actual_cost: ProcessingFeeRateConfig;
  platform_commission: number;
  payment_fee_charged: number;
  payment_fee_actual: number;
  gateway_margin_spread: number;
  net_vendor_payout: number;
  total_platform_yield: number;
}

export interface MoRSettlementLedgerResult {
  settlement: MoRSettlementCalculation;
  entries: {
    customer_payment_received: DbLedgerEntry;
    platform_commission_earned: DbLedgerEntry;
    payment_spread_retained: DbLedgerEntry;
    gateway_fee_disbursed: DbLedgerEntry;
    vendor_payout_disbursed: DbLedgerEntry;
  };
  allEntries: DbLedgerEntry[];
  finalVendorEscrowBalance: number;
}

export const SUBSCRIPTION_TIER_PRESETS: Record<VendorSubscriptionTier, TierPricingConfig> = {
  starter: {
    tier: 'starter',
    monthly_fee_zar: 299.0,
    default_commission_rate: 0.08, // 8.0%
    default_billed_rate: { percentage: 0.029, fixed_fee: 2.0 }, // 2.9% + R2.00
    default_actual_cost: { percentage: 0.02, fixed_fee: 1.5 },  // 2.0% + R1.50
  },
  pro: {
    tier: 'pro',
    monthly_fee_zar: 599.0,
    default_commission_rate: 0.065, // 6.5%
    default_billed_rate: { percentage: 0.027, fixed_fee: 2.0 }, // 2.7% + R2.00
    default_actual_cost: { percentage: 0.02, fixed_fee: 1.5 },  // 2.0% + R1.50
  },
  enterprise: {
    tier: 'enterprise',
    monthly_fee_zar: 999.0,
    default_commission_rate: 0.05, // 5.0%
    default_billed_rate: { percentage: 0.025, fixed_fee: 1.5 }, // 2.5% + R1.50
    default_actual_cost: { percentage: 0.02, fixed_fee: 1.5 },  // 2.0% + R1.50
  },
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export class MoRRevenueEngineService {
  /**
   * Parses a processing fee rate from either a structured object or string expression
   * e.g. { percentage: 0.029, fixed_fee: 2.00 } or "2.9% + R2.00"
   */
  parseFeeRate(
    rateInput: ProcessingFeeRateConfig | string | undefined,
    fallback: ProcessingFeeRateConfig
  ): ProcessingFeeRateConfig {
    if (!rateInput) {
      return fallback;
    }

    if (typeof rateInput === 'object') {
      const rawPct = Number(rateInput.percentage ?? fallback.percentage);
      const normalizedPct = rawPct > 1 ? rawPct / 100 : rawPct;
      const fixedFee = Number(rateInput.fixed_fee ?? fallback.fixed_fee);
      return {
        percentage: normalizedPct,
        fixed_fee: round2(fixedFee),
      };
    }

    if (typeof rateInput === 'string') {
      // Parse string format like "2.9% + R2.00" or "2.0% + R1.50"
      const pctMatch = rateInput.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
      const fixedMatch = rateInput.match(/R\s*([0-9]+(?:\.[0-9]+)?)/i);

      const percentage = pctMatch ? parseFloat(pctMatch[1]) / 100 : fallback.percentage;
      const fixed_fee = fixedMatch ? parseFloat(fixedMatch[1]) : fallback.fixed_fee;

      return {
        percentage,
        fixed_fee: round2(fixed_fee),
      };
    }

    return fallback;
  }

  /**
   * Normalizes commission rate (e.g., 0.08 or 8 -> 0.08)
   */
  normalizeCommissionRate(rate: number | undefined, fallback = 0.08): number {
    if (rate === undefined || rate === null || isNaN(rate)) {
      return fallback;
    }
    return rate > 1 ? rate / 100 : rate;
  }

  /**
   * Calculates gateway processing fee for a given gross amount and rate configuration:
   * fee = (gross_amount * percentage) + fixed_fee
   */
  calculate_fee(grossAmount: number, rate: ProcessingFeeRateConfig | string): number {
    const parsed = this.parseFeeRate(rate, { percentage: 0.029, fixed_fee: 2.0 });
    return round2(grossAmount * parsed.percentage + parsed.fixed_fee);
  }

  calculateFee(grossAmount: number, rate: ProcessingFeeRateConfig | string): number {
    return this.calculate_fee(grossAmount, rate);
  }

  /**
   * Resolves the effective monthly SaaS subscription fee (R299 - R999/mo) for a vendor
   */
  getVendorMonthlySubscriptionFee(vendor: Partial<DbVendor>): number {
    if (vendor.subscription_monthly_fee !== undefined && vendor.subscription_monthly_fee > 0) {
      return round2(vendor.subscription_monthly_fee);
    }
    const tier = vendor.subscription_tier || 'starter';
    return SUBSCRIPTION_TIER_PRESETS[tier]?.monthly_fee_zar ?? 299.0;
  }

  /**
   * Computes the full Merchant-of-Record (MoR) settlement & interchange arbitrage breakdown for an order:
   * - gross_amount = order subtotal + haulage/freight
   * - platform_commission = gross_amount * commission_rate
   * - payment_fee_charged = calculate_fee(gross_amount, processing_fee_billed_rate)
   * - payment_fee_actual = calculate_fee(gross_amount, processing_fee_actual_cost)
   * - gateway_margin_spread = payment_fee_charged - payment_fee_actual
   * - net_vendor_payout = gross_amount - (platform_commission + payment_fee_charged)
   * - total_platform_yield = platform_commission + gateway_margin_spread
   */
  calculateOrderSettlement(params: {
    subtotal?: number;
    deliveryFee?: number;
    grossAmount?: number;
    vendor?: Partial<DbVendor> | null;
    commissionRate?: number;
    processingFeeBilledRate?: ProcessingFeeRateConfig | string;
    processingFeeActualCost?: ProcessingFeeRateConfig | string;
    actualGatewayFeeOverride?: number;
  }): MoRSettlementCalculation {
    const tier: VendorSubscriptionTier = params.vendor?.subscription_tier || 'starter';
    const preset = SUBSCRIPTION_TIER_PRESETS[tier] || SUBSCRIPTION_TIER_PRESETS.starter;

    const subtotal =
      params.subtotal !== undefined
        ? round2(params.subtotal)
        : round2(params.grossAmount ?? 0);
    const haulageFreight =
      params.deliveryFee !== undefined ? round2(params.deliveryFee) : 0.0;

    const gross_amount =
      params.grossAmount !== undefined
        ? round2(params.grossAmount)
        : round2(subtotal + haulageFreight);

    const commission_rate = this.normalizeCommissionRate(
      params.commissionRate ?? params.vendor?.commission_rate,
      preset.default_commission_rate
    );

    const processing_fee_billed_rate = this.parseFeeRate(
      params.processingFeeBilledRate ?? params.vendor?.processing_fee_billed_rate,
      preset.default_billed_rate
    );

    const processing_fee_actual_cost = this.parseFeeRate(
      params.processingFeeActualCost ?? params.vendor?.processing_fee_actual_cost,
      preset.default_actual_cost
    );

    const platform_commission = round2(gross_amount * commission_rate);
    const payment_fee_charged = this.calculate_fee(gross_amount, processing_fee_billed_rate);
    const payment_fee_actual =
      params.actualGatewayFeeOverride !== undefined && params.actualGatewayFeeOverride > 0
        ? round2(params.actualGatewayFeeOverride)
        : this.calculate_fee(gross_amount, processing_fee_actual_cost);

    const gateway_margin_spread = round2(payment_fee_charged - payment_fee_actual);
    const net_vendor_payout = round2(gross_amount - (platform_commission + payment_fee_charged));
    const total_platform_yield = round2(platform_commission + gateway_margin_spread);

    return {
      order_subtotal: subtotal,
      haulage_freight: haulageFreight,
      gross_amount,
      commission_rate,
      processing_fee_billed_rate,
      processing_fee_actual_cost,
      platform_commission,
      payment_fee_charged,
      payment_fee_actual,
      gateway_margin_spread,
      net_vendor_payout,
      total_platform_yield,
    };
  }

  /**
   * Records the 5 isolated Merchant-of-Record (MoR) double-entry ledger rows in `ledger_entries`:
   * 1. `customer_payment_received`: +gross_amount (Escrow clearing)
   * 2. `platform_commission_earned`: +platform_commission
   * 3. `payment_spread_retained`: +gateway_margin_spread (Net processing profit)
   * 4. `gateway_fee_disbursed`: -payment_fee_actual (PayFast debited cost)
   * 5. `vendor_payout_disbursed`: +net_vendor_payout (Payable to supplier)
   */
  async settleOrderWithArbitrage(params: {
    orderId: string;
    orderRef: string;
    vendorId: string;
    subtotal?: number;
    deliveryFee?: number;
    grossAmount?: number;
    commissionRate?: number;
    processingFeeBilledRate?: ProcessingFeeRateConfig | string;
    processingFeeActualCost?: ProcessingFeeRateConfig | string;
    actualGatewayFeeOverride?: number;
  }): Promise<MoRSettlementLedgerResult> {
    const vendor = await postgresVendorRepository.findById(params.vendorId);
    const settlement = this.calculateOrderSettlement({
      subtotal: params.subtotal,
      deliveryFee: params.deliveryFee,
      grossAmount: params.grossAmount,
      vendor,
      commissionRate: params.commissionRate,
      processingFeeBilledRate: params.processingFeeBilledRate,
      processingFeeActualCost: params.processingFeeActualCost,
      actualGatewayFeeOverride: params.actualGatewayFeeOverride,
    });

    const previousVendorBalance = await postgresLedgerService.getVendorBalance(params.vendorId);

    // 1. customer_payment_received: +gross_amount (Escrow clearing)
    const entryCustomerPayment = await postgresLedgerService.recordEntryWithExplicitBalance({
      order_id: params.orderId,
      vendor_id: params.vendorId,
      entry_type: 'customer_payment_received',
      debit_amount: 0.0,
      credit_amount: settlement.gross_amount,
      balance_after: round2(previousVendorBalance + settlement.gross_amount),
      reference: `Customer payment settled via PayFast (${params.orderRef})`,
    });

    // 2. platform_commission_earned: +platform_commission
    const balanceAfterCommission = round2(
      entryCustomerPayment.balance_after - settlement.platform_commission
    );
    const entryPlatformCommission = await postgresLedgerService.recordEntryWithExplicitBalance({
      order_id: params.orderId,
      vendor_id: params.vendorId,
      entry_type: 'platform_commission_earned',
      debit_amount: 0.0,
      credit_amount: settlement.platform_commission,
      balance_after: balanceAfterCommission,
      reference: `Platform commission earned (${round2(settlement.commission_rate * 100)}%) on ${params.orderRef}`,
    });

    // 3. payment_spread_retained: +gateway_margin_spread (Net processing profit / interchange arbitrage)
    const balanceAfterSpread = round2(
      balanceAfterCommission - settlement.gateway_margin_spread
    );
    const entryPaymentSpread = await postgresLedgerService.recordEntryWithExplicitBalance({
      order_id: params.orderId,
      vendor_id: params.vendorId,
      entry_type: 'payment_spread_retained',
      debit_amount: 0.0,
      credit_amount: settlement.gateway_margin_spread,
      balance_after: balanceAfterSpread,
      reference: `MoR payment processing spread retained on ${params.orderRef}`,
    });

    // 4. gateway_fee_disbursed: -payment_fee_actual (PayFast wholesale debited cost)
    const balanceAfterGatewayWholesale = round2(
      balanceAfterSpread - settlement.payment_fee_actual
    );
    const entryGatewayFeeDisbursed = await postgresLedgerService.recordEntryWithExplicitBalance({
      order_id: params.orderId,
      vendor_id: params.vendorId,
      entry_type: 'gateway_fee_disbursed',
      debit_amount: settlement.payment_fee_actual,
      credit_amount: 0.0,
      balance_after: balanceAfterGatewayWholesale,
      reference: `PayFast wholesale processing fee disbursed on ${params.orderRef}`,
    });

    // 5. vendor_payout_disbursed: +net_vendor_payout (Payable to supplier)
    // Note: previousVendorBalance + gross_amount - platform_commission - gateway_margin_spread - payment_fee_actual
    //     === previousVendorBalance + net_vendor_payout
    const finalVendorEscrowBalance = round2(
      previousVendorBalance + settlement.net_vendor_payout
    );
    const entryVendorPayout = await postgresLedgerService.recordEntryWithExplicitBalance({
      order_id: params.orderId,
      vendor_id: params.vendorId,
      entry_type: 'vendor_payout_disbursed',
      debit_amount: 0.0,
      credit_amount: settlement.net_vendor_payout,
      balance_after: finalVendorEscrowBalance,
      reference: `Net vendor payable balance credited for ${params.orderRef}`,
    });

    const allEntries = [
      entryCustomerPayment,
      entryPlatformCommission,
      entryPaymentSpread,
      entryGatewayFeeDisbursed,
      entryVendorPayout,
    ];

    return {
      settlement,
      entries: {
        customer_payment_received: entryCustomerPayment,
        platform_commission_earned: entryPlatformCommission,
        payment_spread_retained: entryPaymentSpread,
        gateway_fee_disbursed: entryGatewayFeeDisbursed,
        vendor_payout_disbursed: entryVendorPayout,
      },
      allEntries,
      finalVendorEscrowBalance,
    };
  }
}

export const morRevenueEngineService = new MoRRevenueEngineService();
