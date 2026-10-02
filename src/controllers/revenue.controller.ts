import { FastifyRequest, FastifyReply } from 'fastify';
import {
  morRevenueEngineService,
  SUBSCRIPTION_TIER_PRESETS,
} from '../services/revenue/mor-revenue-engine.service';
import { saasSubscriptionBillingService } from '../services/revenue/saas-subscription-billing.service';
import { postgresVendorRepository } from '../database/postgres-vendor.repository';
import { postgresLedgerService } from '../database/postgres-ledger.service';
import { ProcessingFeeRateConfig } from '../types/database.types';

export class RevenueController {
  /**
   * POST /api/v1/revenue/calculate-settlement
   * Computes MoR settlement & interchange fee arbitrage breakdown for an order
   */
  async calculateSettlement(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = (req.body || {}) as {
      vendorId?: string;
      subtotal?: number;
      deliveryFee?: number;
      grossAmount?: number;
      commissionRate?: number;
      processingFeeBilledRate?: ProcessingFeeRateConfig | string;
      processingFeeActualCost?: ProcessingFeeRateConfig | string;
    };

    const vendor = body.vendorId
      ? await postgresVendorRepository.findById(body.vendorId)
      : null;

    const calculation = morRevenueEngineService.calculateOrderSettlement({
      subtotal: body.subtotal,
      deliveryFee: body.deliveryFee,
      grossAmount: body.grossAmount,
      vendor,
      commissionRate: body.commissionRate,
      processingFeeBilledRate: body.processingFeeBilledRate,
      processingFeeActualCost: body.processingFeeActualCost,
    });

    reply.status(200).send({
      success: true,
      settlement: calculation,
    });
  }

  /**
   * POST /api/v1/revenue/settle-order
   * Executes 5-row Double-Entry MoR Ledger Settlement for an order
   */
  async settleOrder(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = (req.body || {}) as {
      orderId: string;
      orderRef?: string;
      vendorId: string;
      subtotal?: number;
      deliveryFee?: number;
      grossAmount?: number;
      commissionRate?: number;
      processingFeeBilledRate?: ProcessingFeeRateConfig | string;
      processingFeeActualCost?: ProcessingFeeRateConfig | string;
    };

    if (!body.orderId || !body.vendorId) {
      reply.status(400).send({
        success: false,
        error: 'BadRequest',
        message: 'orderId and vendorId are required',
      });
      return;
    }

    const result = await morRevenueEngineService.settleOrderWithArbitrage({
      orderId: body.orderId,
      orderRef: body.orderRef || body.orderId,
      vendorId: body.vendorId,
      subtotal: body.subtotal,
      deliveryFee: body.deliveryFee,
      grossAmount: body.grossAmount,
      commissionRate: body.commissionRate,
      processingFeeBilledRate: body.processingFeeBilledRate,
      processingFeeActualCost: body.processingFeeActualCost,
    });

    reply.status(201).send({
      success: true,
      ...result,
    });
  }

  /**
   * POST /api/v1/revenue/subscriptions/bill
   * Triggers monthly SaaS subscription billing (with automated ledger set-off or PayFast tokenized charge)
   */
  async billSubscription(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const body = (req.body || {}) as {
        vendorId?: string;
        billingCycle?: string;
        forceCollectionMethod?: 'LEDGER_SETOFF' | 'PAYFAST_TOKENIZED_ADHOC' | 'XERO_RECURRING_INVOICE';
        forceRebill?: boolean;
      };

      if (body.vendorId) {
        const record = await saasSubscriptionBillingService.billVendorMonthlySubscription({
          vendorId: body.vendorId,
          billingCycle: body.billingCycle,
          forceCollectionMethod: body.forceCollectionMethod,
          forceRebill: body.forceRebill,
        });

        reply.status(201).send({
          success: true,
          record,
        });
        return;
      }

      const records = await saasSubscriptionBillingService.runMonthlySubscriptionCycleForAllVendors(
        body.billingCycle
      );

      reply.status(201).send({
        success: true,
        count: records.length,
        records,
      });
    } catch (err: any) {
      reply.status(400).send({
        success: false,
        error: 'SubscriptionBillingFailed',
        message: err.message || 'Failed to process SaaS subscription billing',
      });
    }
  }

  /**
   * POST /api/v1/revenue/subscriptions/pre-payout-setoff
   * Deducts monthly SaaS subscription fee directly from unsettled vendor balance before EFT release
   */
  async applyPrePayoutSetoff(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const body = (req.body || {}) as {
        vendorId: string;
        billingCycle?: string;
      };

      if (!body.vendorId) {
        reply.status(400).send({
          success: false,
          error: 'BadRequest',
          message: 'vendorId is required',
        });
        return;
      }

      const summary = await saasSubscriptionBillingService.applyPrePayoutLedgerSetoff(
        body.vendorId,
        body.billingCycle
      );

      reply.status(200).send({
        success: true,
        summary,
      });
    } catch (err: any) {
      reply.status(400).send({
        success: false,
        error: 'PrePayoutSetoffFailed',
        message: err.message || 'Failed to apply pre-payout ledger set-off',
      });
    }
  }

  /**
   * GET /api/v1/revenue/subscriptions
   * Lists SaaS subscription billing records and tier pricing presets
   */
  async listSubscriptions(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = (req.query || {}) as { vendor_id?: string };
    const records = query.vendor_id
      ? saasSubscriptionBillingService.getVendorBillingRecords(query.vendor_id)
      : saasSubscriptionBillingService.getAllBillingRecords();

    reply.status(200).send({
      success: true,
      tierPresets: SUBSCRIPTION_TIER_PRESETS,
      count: records.length,
      records,
    });
  }

  /**
   * GET /api/v1/revenue/summary
   * Aggregates platform yield across all 3 monetization streams:
   * 1. SaaS Platform Subscription MRR
   * 2. Take-Rate Commission Earned
   * 3. Payment Processing Spread (Interchange Arbitrage)
   */
  async getRevenueSummary(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const entries = await postgresLedgerService.getAllEntries();
    const vendors = await postgresVendorRepository.findAll();

    const totalGmvSettled = entries
      .filter((e) => e.entry_type === 'customer_payment_received')
      .reduce((sum, e) => sum + e.credit_amount, 0);

    const totalTakeRateCommission = entries
      .filter((e) => e.entry_type === 'platform_commission_earned')
      .reduce((sum, e) => sum + (e.credit_amount || e.debit_amount), 0);

    const totalPaymentSpreadRetained = entries
      .filter((e) => e.entry_type === 'payment_spread_retained')
      .reduce((sum, e) => sum + e.credit_amount, 0);

    const totalGatewayWholesaleCost = entries
      .filter((e) => e.entry_type === 'gateway_fee_disbursed')
      .reduce((sum, e) => sum + e.debit_amount, 0);

    const totalSaasSetoffCollected = entries
      .filter((e) => e.entry_type === 'saas_subscription_setoff')
      .reduce((sum, e) => sum + e.debit_amount, 0);

    const contractedMonthlySaasMrr = vendors
      .filter((v) => v.is_active)
      .reduce(
        (sum, v) => sum + morRevenueEngineService.getVendorMonthlySubscriptionFee(v),
        0
      );

    const totalPlatformTransactionYield =
      Math.round((totalTakeRateCommission + totalPaymentSpreadRetained) * 100) / 100;

    reply.status(200).send({
      success: true,
      summary: {
        totalGmvSettled: Math.round(totalGmvSettled * 100) / 100,
        takeRateCommissionEarned: Math.round(totalTakeRateCommission * 100) / 100,
        paymentSpreadRetained: Math.round(totalPaymentSpreadRetained * 100) / 100,
        gatewayWholesaleDisbursed: Math.round(totalGatewayWholesaleCost * 100) / 100,
        totalPlatformTransactionYield,
        saasSubscriptionSetoffCollected: Math.round(totalSaasSetoffCollected * 100) / 100,
        contractedMonthlySaasMrr: Math.round(contractedMonthlySaasMrr * 100) / 100,
        totalPlatformRevenue:
          Math.round(
            (totalPlatformTransactionYield + totalSaasSetoffCollected) * 100
          ) / 100,
      },
    });
  }
}

export const revenueController = new RevenueController();
