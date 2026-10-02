import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createFastifyApp } from '../src/fastify-app';
import { morRevenueEngineService } from '../src/services/revenue/mor-revenue-engine.service';
import { saasSubscriptionBillingService } from '../src/services/revenue/saas-subscription-billing.service';
import { postgresVendorRepository } from '../src/database/postgres-vendor.repository';
import { postgresLedgerService } from '../src/database/postgres-ledger.service';
import { orderQueueManager } from '../src/services/queue/order-queue.worker';

describe('Multi-Tenant Revenue Engine with PayFast MoR Fee Arbitrage & SaaS Set-Off', () => {
  let app: FastifyInstance;
  const starterVendorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; // BrickDirect (Starter R299/mo, 8%)
  const proVendorId = 'b1ffcd88-8b1a-3de7-aa5c-5aa8ac270b22';     // Titan Quarry (Pro R599/mo, 7.5%)

  beforeAll(async () => {
    app = createFastifyApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    saasSubscriptionBillingService.clearHistoryForTest();
  });

  describe('1. Dynamic Rate & Fee Arbitrage Engine', () => {
    it('accurately computes MoR settlement & interchange arbitrage spread (2.9% + R2.00 billed vs 2.0% + R1.50 wholesale)', () => {
      // Order: R4,000.00 subtotal + R1,000.00 haulage/freight = R5,000.00 gross_amount
      const settlement = morRevenueEngineService.calculateOrderSettlement({
        subtotal: 4000.0,
        deliveryFee: 1000.0,
        commissionRate: 0.08, // 8% take-rate
        processingFeeBilledRate: '2.9% + R2.00',
        processingFeeActualCost: '2.0% + R1.50',
      });

      // gross_amount = 4000 + 1000 = 5000.00
      expect(settlement.gross_amount).toBe(5000.0);

      // platform_commission = 5000 * 0.08 = 400.00
      expect(settlement.platform_commission).toBe(400.0);

      // payment_fee_charged = (5000 * 0.029) + 2.00 = 145.00 + 2.00 = 147.00
      expect(settlement.payment_fee_charged).toBe(147.0);

      // payment_fee_actual = (5000 * 0.020) + 1.50 = 100.00 + 1.50 = 101.50
      expect(settlement.payment_fee_actual).toBe(101.5);

      // gateway_margin_spread = 147.00 - 101.50 = 45.50
      expect(settlement.gateway_margin_spread).toBe(45.5);

      // net_vendor_payout = 5000.00 - (400.00 + 147.00) = 4453.00
      expect(settlement.net_vendor_payout).toBe(4453.0);

      // total_platform_yield = 400.00 + 45.50 = 445.50
      expect(settlement.total_platform_yield).toBe(445.5);

      // Verify zero-leakage accounting identity:
      // net_vendor_payout + platform_commission + gateway_margin_spread + payment_fee_actual === gross_amount
      const sumOfParts =
        settlement.net_vendor_payout +
        settlement.platform_commission +
        settlement.gateway_margin_spread +
        settlement.payment_fee_actual;
      expect(sumOfParts).toBe(settlement.gross_amount);
    });

    it('supports subscription_tier presets (starter R299, pro R599, enterprise R999) and dynamic commission rates (5% to 8%)', async () => {
      const enterpriseVendor = await postgresVendorRepository.saveVendor({
        id: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c33',
        business_name: 'Cape Bulk Cement & Aggregates',
        slug: 'cape-bulk-cement',
        whatsapp_number: '+27820000099',
        contact_email: 'accounts@capebulk.co.za',
        vat_number: '4112233445',
        bank_account_holder: 'Cape Bulk Cement (Pty) Ltd',
        bank_name: 'Nedbank',
        bank_account_number: '1928374650',
        bank_branch_code: '198765',
        base_location_lon: 18.4241,
        base_location_lat: -33.9249,
        max_delivery_radius_km: 80.0,
        base_delivery_fee: 400.0,
        per_km_rate: 20.0,
        subscription_tier: 'enterprise',
        subscription_monthly_fee: 999.0,
        commission_rate: 0.05, // 5% enterprise take-rate
        processing_fee_billed_rate: { percentage: 0.029, fixed_fee: 2.0 },
        processing_fee_actual_cost: { percentage: 0.02, fixed_fee: 1.5 },
        payfast_subscription_token: 'pf_token_capebulk_003',
        auto_ledger_setoff: true,
        is_active: true,
      });

      expect(morRevenueEngineService.getVendorMonthlySubscriptionFee(enterpriseVendor)).toBe(999.0);

      const settlement = morRevenueEngineService.calculateOrderSettlement({
        subtotal: 10000.0,
        deliveryFee: 0.0,
        vendor: enterpriseVendor,
      });

      expect(settlement.commission_rate).toBe(0.05);
      expect(settlement.platform_commission).toBe(500.0); // 5% of R10,000
      expect(settlement.payment_fee_charged).toBe(292.0); // 2.9% + R2.00
      expect(settlement.payment_fee_actual).toBe(201.5);  // 2.0% + R1.50
      expect(settlement.gateway_margin_spread).toBe(90.5); // R90.50 spread retained
      expect(settlement.net_vendor_payout).toBe(9208.0);   // 10000 - (500 + 292)
      expect(settlement.total_platform_yield).toBe(590.5); // 500 + 90.50
    });
  });

  describe('2. Double-Entry Ledger Extension (5 Isolated Margin Components)', () => {
    it('records all 5 isolated MoR margin components in ledger_entries with balanced running balance_after', async () => {
      const orderId = 'd4eebc99-9c0b-4ef8-bb6d-6bb9bd380d44';
      const orderRef = 'ORD-MOR-ARBITRAGE-01';
      const balanceBefore = await postgresLedgerService.getVendorBalance(starterVendorId);

      const result = await morRevenueEngineService.settleOrderWithArbitrage({
        orderId,
        orderRef,
        vendorId: starterVendorId,
        subtotal: 3000.0,
        deliveryFee: 500.0, // gross_amount = 3500.00
        commissionRate: 0.08,
        processingFeeBilledRate: '2.9% + R2.00',
        processingFeeActualCost: '2.0% + R1.50',
      });

      // Verify all 5 ledger entry types were recorded for this order
      const orderEntries = await postgresLedgerService.getEntriesByOrder(orderId);
      expect(orderEntries).toHaveLength(5);

      const eCustomerPayment = orderEntries.find((e) => e.entry_type === 'customer_payment_received')!;
      const eCommission = orderEntries.find((e) => e.entry_type === 'platform_commission_earned')!;
      const eSpread = orderEntries.find((e) => e.entry_type === 'payment_spread_retained')!;
      const eGatewayCost = orderEntries.find((e) => e.entry_type === 'gateway_fee_disbursed')!;
      const eVendorPayout = orderEntries.find((e) => e.entry_type === 'vendor_payout_disbursed')!;

      // 1. customer_payment_received: +3500.00
      expect(eCustomerPayment.credit_amount).toBe(3500.0);
      expect(eCustomerPayment.debit_amount).toBe(0.0);

      // 2. platform_commission_earned: +280.00 (8% of 3500)
      expect(eCommission.credit_amount).toBe(280.0);
      expect(eCommission.debit_amount).toBe(0.0);

      // 3. payment_spread_retained: +32.00 ((3500*0.029+2=103.50) - (3500*0.020+1.50=71.50) = 32.00)
      expect(eSpread.credit_amount).toBe(32.0);
      expect(eSpread.debit_amount).toBe(0.0);

      // 4. gateway_fee_disbursed: -71.50 (PayFast debited wholesale cost)
      expect(eGatewayCost.debit_amount).toBe(71.5);
      expect(eGatewayCost.credit_amount).toBe(0.0);

      // 5. vendor_payout_disbursed: +3116.50 (3500 - 280 - 103.50)
      expect(eVendorPayout.credit_amount).toBe(3116.5);
      expect(eVendorPayout.debit_amount).toBe(0.0);

      // Verify vendor running balance increased by exactly net_vendor_payout
      const expectedBalanceAfter = Math.round((balanceBefore + 3116.5) * 100) / 100;
      expect(result.finalVendorEscrowBalance).toBe(expectedBalanceAfter);
      expect(await postgresLedgerService.getVendorBalance(starterVendorId)).toBe(expectedBalanceAfter);
    });
  });

  describe('3. Monthly SaaS Subscription Billing & Automated Ledger Set-Off', () => {
    it('deducts monthly SaaS subscription fee (R299 Starter / R599 Pro) directly from unsettled vendor order balances before weekly bank EFT payout', async () => {
      // Ensure Pro vendor (Titan Quarry, R599/mo) has unsettled order balance in ledger
      await morRevenueEngineService.settleOrderWithArbitrage({
        orderId: 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380f55',
        orderRef: 'ORD-PRO-VENDOR-01',
        vendorId: proVendorId,
        subtotal: 4000.0,
        deliveryFee: 500.0, // gross = 4500
      });

      const unsettledBefore = await postgresLedgerService.getVendorBalance(proVendorId);
      expect(unsettledBefore).toBeGreaterThan(599.0);

      // Apply automated ledger set-off before releasing weekly EFT payout
      const setoffSummary = await saasSubscriptionBillingService.applyPrePayoutLedgerSetoff(
        proVendorId,
        '2026-10'
      );

      expect(setoffSummary.setoffApplied).toBe(true);
      expect(setoffSummary.subscriptionTier).toBe('pro');
      expect(setoffSummary.subscriptionSetoffDeducted).toBe(599.0);
      expect(setoffSummary.netEftPayoutAmount).toBe(
        Math.round((unsettledBefore - 599.0) * 100) / 100
      );
      expect(setoffSummary.chargeRecord?.collectionMethod).toBe('LEDGER_SETOFF');
      expect(setoffSummary.chargeRecord?.status).toBe('SETTLED');
      expect(setoffSummary.chargeRecord?.ledgerEntry?.entry_type).toBe('saas_subscription_setoff');
      expect(setoffSummary.chargeRecord?.ledgerEntry?.debit_amount).toBe(599.0);
    });

    it('supports PayFast tokenized ad-hoc subscription charge when forced or when unsettled balance is zero', async () => {
      const chargeRecord = await saasSubscriptionBillingService.billVendorMonthlySubscription({
        vendorId: starterVendorId,
        billingCycle: '2026-11',
        forceCollectionMethod: 'PAYFAST_TOKENIZED_ADHOC',
      });

      expect(chargeRecord.subscriptionTier).toBe('starter');
      expect(chargeRecord.monthlyFeeZar).toBe(299.0);
      expect(chargeRecord.collectionMethod).toBe('PAYFAST_TOKENIZED_ADHOC');
      expect(chargeRecord.gatewayChargedAmount).toBe(299.0);
      expect(chargeRecord.ledgerSetoffDeducted).toBe(0.0);
      expect(chargeRecord.payfastAdhocChargeId).toContain('PF-SUB-ADHOC');
      expect(chargeRecord.status).toBe('SETTLED');
    });

    it('processes BILL_SAAS_SUBSCRIPTION jobs via BullMQ OrderQueueManager and exposes HTTP revenue endpoints', async () => {
      const workerRes = await orderQueueManager.processJob('BILL_SAAS_SUBSCRIPTION', {
        billingCycle: '2026-12',
      });
      expect(workerRes.success).toBe(true);
      expect(workerRes.count).toBeGreaterThanOrEqual(2);

      // Test HTTP API: POST /api/v1/revenue/calculate-settlement
      const calcRes = await app.inject({
        method: 'POST',
        url: '/api/v1/revenue/calculate-settlement',
        payload: {
          subtotal: 2000,
          deliveryFee: 500,
          commissionRate: 0.08,
          processingFeeBilledRate: '2.9% + R2.00',
          processingFeeActualCost: '2.0% + R1.50',
        },
      });
      expect(calcRes.statusCode).toBe(200);
      const calcJson = JSON.parse(calcRes.body);
      expect(calcJson.settlement.gross_amount).toBe(2500);
      expect(calcJson.settlement.gateway_margin_spread).toBe(23); // (74.50 - 51.50)

      // Test HTTP API: GET /api/v1/revenue/summary
      const summaryRes = await app.inject({
        method: 'GET',
        url: '/api/v1/revenue/summary',
      });
      expect(summaryRes.statusCode).toBe(200);
      const summaryJson = JSON.parse(summaryRes.body);
      expect(summaryJson.success).toBe(true);
      expect(summaryJson.summary.paymentSpreadRetained).toBeGreaterThan(0);
      expect(summaryJson.summary.takeRateCommissionEarned).toBeGreaterThan(0);
      expect(summaryJson.summary.contractedMonthlySaasMrr).toBeGreaterThanOrEqual(898);
    });
  });
});
