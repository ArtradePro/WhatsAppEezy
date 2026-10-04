"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payoutController = exports.PayoutController = void 0;
const payout_batch_service_1 = require("../services/payout/payout-batch.service");
const eod_reconciliation_service_1 = require("../services/cron/eod-reconciliation.service");
const csv_payout_generator_service_1 = require("../services/payout/csv-payout-generator.service");
class PayoutController {
    async generateBatch(req, reply) {
        const body = (req.body || {});
        const batch = await payout_batch_service_1.payoutBatchService.generateWeeklyBatch(body);
        reply.status(201).send({
            success: true,
            message: 'Weekly net settlement payout batch compiled successfully',
            batch,
        });
    }
    async listBatches(req, reply) {
        const batches = await payout_batch_service_1.payoutBatchService.getAllBatches();
        reply.status(200).send({
            success: true,
            count: batches.length,
            batches,
        });
    }
    async downloadAcbFile(req, reply) {
        const { batchId } = req.params;
        const batch = await payout_batch_service_1.payoutBatchService.getBatchById(batchId);
        if (!batch) {
            reply.status(404).send({
                success: false,
                error: 'NotFound',
                message: `Payout batch '${batchId}' not found`,
            });
            return;
        }
        await payout_batch_service_1.payoutBatchService.markBatchExported(batchId);
        reply
            .header('Content-Type', 'text/plain')
            .header('Content-Disposition', `attachment; filename="${batch.acbFilename}"`)
            .send(batch.acbFileContent);
    }
    async downloadCsvFile(req, reply) {
        const { batchId } = req.params;
        const query = (req.query || {});
        const requestedFormat = (query.format || query.bank || 'universal').toLowerCase();
        const batch = await payout_batch_service_1.payoutBatchService.getBatchById(batchId);
        if (!batch) {
            reply.status(404).send({
                success: false,
                error: 'NotFound',
                message: `Payout batch '${batchId}' not found`,
            });
            return;
        }
        let csvContent = batch.csvFileContent || '';
        let filename = batch.csvFilename || `${batch.batchNumber}.csv`;
        // Dynamic bank-specific formatting
        if (batch.items && batch.items.length > 0 && requestedFormat !== 'universal') {
            const bankResult = csv_payout_generator_service_1.csvPayoutGeneratorService.generateBankSpecificCsv(requestedFormat, batch.items);
            csvContent = bankResult.content;
            filename = `${batch.batchNumber}-${bankResult.filename}`;
        }
        await payout_batch_service_1.payoutBatchService.markBatchExported(batchId);
        reply
            .header('Content-Type', 'text/csv')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(csvContent);
    }
    async runEodReconciliation(req, reply) {
        const body = (req.body || {});
        const targetDate = body.date ? new Date(body.date) : new Date();
        const batch = await eod_reconciliation_service_1.eodReconciliationService.runDailyEodReconciliation(targetDate);
        reply.status(201).send({
            success: true,
            message: 'Daily EOD reconciliation compiled successfully',
            batch,
        });
    }
}
exports.PayoutController = PayoutController;
exports.payoutController = new PayoutController();
//# sourceMappingURL=payout.controller.js.map