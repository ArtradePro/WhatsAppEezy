import { FastifyRequest, FastifyReply } from 'fastify';
import { payoutBatchService } from '../services/payout/payout-batch.service';
import { eodReconciliationService } from '../services/cron/eod-reconciliation.service';
import { csvPayoutGeneratorService } from '../services/payout/csv-payout-generator.service';

export class PayoutController {
  async generateBatch(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = (req.body || {}) as {
      startDate?: string;
      endDate?: string;
    };

    const batch = await payoutBatchService.generateWeeklyBatch(body);
    reply.status(201).send({
      success: true,
      message: 'Weekly net settlement payout batch compiled successfully',
      batch,
    });
  }

  async listBatches(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const batches = await payoutBatchService.getAllBatches();
    reply.status(200).send({
      success: true,
      count: batches.length,
      batches,
    });
  }

  async downloadAcbFile(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { batchId } = req.params as { batchId: string };
    const batch = await payoutBatchService.getBatchById(batchId);

    if (!batch) {
      reply.status(404).send({
        success: false,
        error: 'NotFound',
        message: `Payout batch '${batchId}' not found`,
      });
      return;
    }

    await payoutBatchService.markBatchExported(batchId);

    reply
      .header('Content-Type', 'text/plain')
      .header('Content-Disposition', `attachment; filename="${batch.acbFilename}"`)
      .send(batch.acbFileContent);
  }

  async downloadCsvFile(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { batchId } = req.params as { batchId: string };
    const query = (req.query || {}) as { format?: string; bank?: string };
    const requestedFormat = (query.format || query.bank || 'universal').toLowerCase();

    const batch = await payoutBatchService.getBatchById(batchId);

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
      const bankResult = csvPayoutGeneratorService.generateBankSpecificCsv(
        requestedFormat as any,
        batch.items
      );
      csvContent = bankResult.content;
      filename = `${batch.batchNumber}-${bankResult.filename}`;
    }

    await payoutBatchService.markBatchExported(batchId);

    reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csvContent);
  }

  async runEodReconciliation(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = (req.body || {}) as { date?: string };
    const targetDate = body.date ? new Date(body.date) : new Date();

    const batch = await eodReconciliationService.runDailyEodReconciliation(targetDate);

    reply.status(201).send({
      success: true,
      message: 'Daily EOD reconciliation compiled successfully',
      batch,
    });
  }
}

export const payoutController = new PayoutController();
