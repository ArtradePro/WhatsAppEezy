"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revenueController = exports.RevenueController = void 0;
const mor_revenue_engine_service_1 = require("../services/revenue/mor-revenue-engine.service");
const saas_subscription_billing_service_1 = require("../services/revenue/saas-subscription-billing.service");
const postgres_vendor_repository_1 = require("../database/postgres-vendor.repository");
const postgres_ledger_service_1 = require("../database/postgres-ledger.service");
class RevenueController {
    /**
     * POST /api/v1/revenue/calculate-settlement
     * Computes MoR settlement & interchange fee arbitrage breakdown for an order
     */
    async calculateSettlement(req, reply) {
        const body = (req.body || {});
        const vendor = body.vendorId
            ? await postgres_vendor_repository_1.postgresVendorRepository.findById(body.vendorId)
            : null;
        const calculation = mor_revenue_engine_service_1.morRevenueEngineService.calculateOrderSettlement({
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
    async settleOrder(req, reply) {
        const body = (req.body || {});
        if (!body.orderId || !body.vendorId) {
            reply.status(400).send({
                success: false,
                error: 'BadRequest',
                message: 'orderId and vendorId are required',
            });
            return;
        }
        const result = await mor_revenue_engine_service_1.morRevenueEngineService.settleOrderWithArbitrage({
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
    async billSubscription(req, reply) {
        try {
            const body = (req.body || {});
            if (body.vendorId) {
                const record = await saas_subscription_billing_service_1.saasSubscriptionBillingService.billVendorMonthlySubscription({
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
            const records = await saas_subscription_billing_service_1.saasSubscriptionBillingService.runMonthlySubscriptionCycleForAllVendors(body.billingCycle);
            reply.status(201).send({
                success: true,
                count: records.length,
                records,
            });
        }
        catch (err) {
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
    async applyPrePayoutSetoff(req, reply) {
        try {
            const body = (req.body || {});
            if (!body.vendorId) {
                reply.status(400).send({
                    success: false,
                    error: 'BadRequest',
                    message: 'vendorId is required',
                });
                return;
            }
            const summary = await saas_subscription_billing_service_1.saasSubscriptionBillingService.applyPrePayoutLedgerSetoff(body.vendorId, body.billingCycle);
            reply.status(200).send({
                success: true,
                summary,
            });
        }
        catch (err) {
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
    async listSubscriptions(req, reply) {
        const query = (req.query || {});
        const records = query.vendor_id
            ? saas_subscription_billing_service_1.saasSubscriptionBillingService.getVendorBillingRecords(query.vendor_id)
            : saas_subscription_billing_service_1.saasSubscriptionBillingService.getAllBillingRecords();
        reply.status(200).send({
            success: true,
            tierPresets: mor_revenue_engine_service_1.SUBSCRIPTION_TIER_PRESETS,
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
    async getRevenueSummary(_req, reply) {
        const entries = await postgres_ledger_service_1.postgresLedgerService.getAllEntries();
        const vendors = await postgres_vendor_repository_1.postgresVendorRepository.findAll();
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
            .reduce((sum, v) => sum + mor_revenue_engine_service_1.morRevenueEngineService.getVendorMonthlySubscriptionFee(v), 0);
        const totalPlatformTransactionYield = Math.round((totalTakeRateCommission + totalPaymentSpreadRetained) * 100) / 100;
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
                totalPlatformRevenue: Math.round((totalPlatformTransactionYield + totalSaasSetoffCollected) * 100) / 100,
            },
        });
    }
}
exports.RevenueController = RevenueController;
exports.revenueController = new RevenueController();
//# sourceMappingURL=revenue.controller.js.map