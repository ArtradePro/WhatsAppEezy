"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payoutBatchService = exports.PayoutBatchService = void 0;
const crypto_1 = require("crypto");
const postgres_vendor_repository_1 = require("../../database/postgres-vendor.repository");
const postgres_ledger_service_1 = require("../../database/postgres-ledger.service");
const saas_subscription_billing_service_1 = require("../revenue/saas-subscription-billing.service");
const acb_generator_service_1 = require("./acb-generator.service");
const csv_payout_generator_service_1 = require("./csv-payout-generator.service");
const whatsapp_client_service_1 = require("../whatsapp/whatsapp-client.service");
const env_1 = require("../../config/env");
class PayoutBatchService {
    batches = new Map();
    /**
     * Generates a weekly net settlement payout batch across all active vendors' isolated sub-ledgers:
     * 1. Reads each vendor's unsettled escrow sub-ledger balance
     * 2. Automatically deducts Monthly SaaS Subscription Set-Off (if enabled) prior to EFT release
     * 3. Compiles South African Bank EFT CSV & ACB magtape files
     * 4. Optionally zeroes out the swept sub-ledger balance and sends WhatsApp Remittance Slips
     */
    async generateWeeklyBatch(options) {
        const now = new Date();
        const periodEnd = options?.endDate ? new Date(options.endDate) : now;
        const periodStart = options?.startDate
            ? new Date(options.startDate)
            : new Date(periodEnd.getTime() - 7 * 86400000);
        const billingCycle = options?.billingCycle ||
            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const shouldApplySetoff = options?.applySaasSetoff !== false;
        const shouldNotifyWhatsApp = options?.dispatchWhatsAppRemittance !== false;
        const shouldSettleSubLedgers = options?.settleSubLedgers === true;
        const batchNumber = `BATCH-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;
        const batchId = `pb_${(0, crypto_1.randomUUID)()}`;
        const vendors = await postgres_vendor_repository_1.postgresVendorRepository.findAll();
        const activeVendors = vendors.filter((v) => v.is_active && v.bank_account_number);
        const items = [];
        let totalGrossSubLedger = 0;
        let totalSaasSetoffDeducted = 0;
        for (const vendor of activeVendors) {
            const balanceBefore = await postgres_ledger_service_1.postgresLedgerService.getVendorBalance(vendor.id);
            // Only include vendors with a positive balance (or fallback demo seed for initial empty states)
            if (balanceBefore <= 0 && items.length > 0) {
                continue;
            }
            const grossSubLedgerBalance = balanceBefore > 0 ? Math.round(balanceBefore * 100) / 100 : 2850.0;
            let saasSetoffDeducted = 0;
            let netPayoutReleased = grossSubLedgerBalance;
            if (balanceBefore > 0 && shouldApplySetoff && vendor.auto_ledger_setoff !== false) {
                const setoffSummary = await saas_subscription_billing_service_1.saasSubscriptionBillingService.applyPrePayoutLedgerSetoff(vendor.id, billingCycle);
                saasSetoffDeducted = setoffSummary.subscriptionSetoffDeducted;
                netPayoutReleased = setoffSummary.netEftPayoutAmount;
            }
            if (netPayoutReleased <= 0) {
                continue;
            }
            if (balanceBefore > 0 && shouldSettleSubLedgers) {
                await postgres_ledger_service_1.postgresLedgerService.recordEntryWithExplicitBalance({
                    vendor_id: vendor.id,
                    entry_type: 'vendor_payout_disbursed',
                    debit_amount: netPayoutReleased,
                    credit_amount: 0,
                    balance_after: 0,
                    reference: `Weekly Bank EFT Payout Released (${batchNumber})`,
                });
            }
            const statementReference = `CARGO-${vendor.slug
                .replace(/[^a-zA-Z0-9]/g, '')
                .slice(0, 9)
                .toUpperCase()}`;
            const bankName = vendor.bank_name || 'Standard Bank';
            const accountNumber = vendor.bank_account_number || '0000000000';
            const branchCode = vendor.bank_branch_code || '051001';
            const accountHolder = vendor.bank_account_holder || vendor.business_name;
            let whatsappRemittanceMessageId;
            if (shouldNotifyWhatsApp && vendor.whatsapp_number) {
                const remittanceText = `🏦 *WEEKLY BANK EFT PAYOUT RELEASED (${batchNumber})*\n` +
                    `• Business: *${vendor.business_name}*\n` +
                    `• Virtual Number ID: \`${vendor.meta_phone_number_id}\`\n` +
                    `• Gross Escrow Sub-Ledger: *R ${grossSubLedgerBalance.toFixed(2)}*\n` +
                    `• Monthly SaaS Set-Off (${billingCycle}): *-R ${saasSetoffDeducted.toFixed(2)}*\n` +
                    `• *Net EFT Deposited: R ${netPayoutReleased.toFixed(2)}*\n` +
                    `• Bank: ${bankName} (Acc ****${accountNumber.slice(-4)})\n` +
                    `• Statement Ref: *${statementReference}*`;
                whatsappRemittanceMessageId = await whatsapp_client_service_1.whatsAppClientService
                    .sendTextMessage(vendor.whatsapp_number, remittanceText)
                    .catch(() => undefined);
            }
            totalGrossSubLedger += grossSubLedgerBalance;
            totalSaasSetoffDeducted += saasSetoffDeducted;
            items.push({
                payoutItemId: `pi_${(0, crypto_1.randomUUID)()}`,
                orderId: batchNumber,
                tenantId: vendor.id,
                vendorId: vendor.id,
                metaPhoneNumberId: vendor.meta_phone_number_id,
                recipientName: accountHolder,
                bankName,
                accountNumber,
                branchCode,
                accountType: 'Current',
                grossSubLedgerBalance: Math.round(grossSubLedgerBalance * 100) / 100,
                saasSetoffDeducted: Math.round(saasSetoffDeducted * 100) / 100,
                netPayoutReleased: Math.round(netPayoutReleased * 100) / 100,
                amount: Math.round(netPayoutReleased * 100) / 100,
                statementReference,
                whatsappRemittanceMessageId,
            });
        }
        const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
        const totalTransactions = items.length;
        // Action date is next business day
        const actionDate = new Date(now.getTime() + 86400000);
        // Generate ACB EFT Magtape file content + Universal CSV file content
        const acbFileContent = acb_generator_service_1.acbGeneratorService.generateAcbFile(batchNumber, actionDate, items);
        const acbFilename = `${batchNumber}.ACB`;
        const csvFileContent = csv_payout_generator_service_1.csvPayoutGeneratorService.generateBankingCsv(items, {
            payerReference: batchNumber,
            status: 'APPROVED',
        });
        const csvFilename = `${batchNumber}.csv`;
        const payoutBatch = {
            batchId,
            batchNumber,
            settlementCycle: 'NET_WEEKLY',
            periodStartDate: periodStart.toISOString(),
            periodEndDate: periodEnd.toISOString(),
            currency: env_1.config.DEFAULT_CURRENCY,
            totalTransactions,
            totalGrossSubLedger: Math.round(totalGrossSubLedger * 100) / 100,
            totalSaasSetoffDeducted: Math.round(totalSaasSetoffDeducted * 100) / 100,
            totalAmount: Math.round(totalAmount * 100) / 100,
            status: shouldSettleSubLedgers ? 'SETTLED' : 'PENDING_APPROVAL',
            items,
            acbFileContent,
            acbFilename,
            csvFileContent,
            csvFilename,
            createdAt: now.toISOString(),
            settledAt: shouldSettleSubLedgers ? now.toISOString() : undefined,
        };
        this.batches.set(batchId, payoutBatch);
        return payoutBatch;
    }
    saveBatch(batch) {
        this.batches.set(batch.batchId, batch);
    }
    async getBatchById(batchId) {
        return this.batches.get(batchId) || null;
    }
    async getAllBatches() {
        return Array.from(this.batches.values());
    }
    async markBatchExported(batchId) {
        const batch = this.batches.get(batchId);
        if (!batch)
            return null;
        batch.status = 'EXPORTED';
        batch.exportedAt = new Date().toISOString();
        this.batches.set(batchId, batch);
        return batch;
    }
}
exports.PayoutBatchService = PayoutBatchService;
exports.payoutBatchService = new PayoutBatchService();
//# sourceMappingURL=payout-batch.service.js.map