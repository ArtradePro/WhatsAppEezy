import { randomUUID } from 'crypto';
import { Queue, Worker, Job } from 'bullmq';
import { postgresLedgerService } from '../../database/postgres-ledger.service';
import { postgresVendorRepository } from '../../database/postgres-vendor.repository';
import { tenantRepository } from '../tenant/tenant.repository';
import { payoutBatchService } from '../payout/payout-batch.service';
import { csvPayoutGeneratorService } from '../payout/csv-payout-generator.service';
import { acbGeneratorService } from '../payout/acb-generator.service';
import { PayoutBatch, PayoutBatchItem } from '../../types/payout.types';
import { config } from '../../config/env';

export const EOD_CRON_QUEUE_NAME = 'eod-reconciliation-queue';
export const JOB_EOD_RECONCILE = 'DAILY_EOD_RECONCILIATION';

export class EodReconciliationService {
  private queue?: Queue;
  private worker?: Worker;
  private timerHandle?: NodeJS.Timeout;
  private isRunning = false;

  constructor() {
    this.initBullMQ();
  }

  private initBullMQ() {
    const redisHost = process.env.REDIS_HOST;
    const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;

    if (redisHost) {
      try {
        const connection = { host: redisHost, port: redisPort, maxRetriesPerRequest: null };
        this.queue = new Queue(EOD_CRON_QUEUE_NAME, { connection });
        this.worker = new Worker(
          EOD_CRON_QUEUE_NAME,
          async (job: Job) => {
            if (job.name === JOB_EOD_RECONCILE) {
              const targetDate = job.data?.date ? new Date(job.data.date) : new Date();
              await this.runDailyEodReconciliation(targetDate);
            }
          },
          { connection }
        );
      } catch (err) {
        console.warn('[EodReconciliation] BullMQ Redis connection unavailable, running in-memory cron fallback');
      }
    }
  }

  /**
   * Compiles all ledger entries for the day and generates South African online banking
   * CSV & ACB bulk payout batches for all approved vendor payouts.
   */
  async runDailyEodReconciliation(targetDate?: Date): Promise<PayoutBatch> {
    const now = targetDate || new Date();

    // 00:00:00 to 23:59:59 window for the target date
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const dateStr = startOfDay.toISOString().split('T')[0].replace(/-/g, '');
    const batchNumber = `EOD-BATCH-${dateStr}-${Math.floor(100 + Math.random() * 900)}`;
    const batchId = `pb_eod_${randomUUID()}`;

    // 1. Compile ledger entries for the day
    const entries = await postgresLedgerService.getEntriesByDateRange(startOfDay, endOfDay);

    // Filter entries representing approved vendor payouts / settled customer payments
    // In our double-entry system: 'vendor_payout_disbursed' credits the vendor payable balance
    const vendorPayoutMap: Map<string, { totalAmount: number; orderIds: Set<string> }> = new Map();

    for (const entry of entries) {
      if (entry.entry_type === 'vendor_payout_disbursed' && entry.credit_amount > 0) {
        const current = vendorPayoutMap.get(entry.vendor_id) || { totalAmount: 0, orderIds: new Set() };
        current.totalAmount = Math.round((current.totalAmount + Number(entry.credit_amount)) * 100) / 100;
        if (entry.order_id) current.orderIds.add(entry.order_id);
        vendorPayoutMap.set(entry.vendor_id, current);
      }
    }

    const items: PayoutBatchItem[] = [];

    // If entries were found for the day, build items per vendor
    for (const [vendorId, data] of vendorPayoutMap.entries()) {
      if (data.totalAmount <= 0) continue;

      const vendor = await postgresVendorRepository.findById(vendorId);
      const tenant = await tenantRepository.findById(vendorId);

      const recipientName =
        vendor?.bank_account_holder ||
        tenant?.bankAccount?.accountHolderName ||
        vendor?.business_name ||
        'Vendor Merchant';

      const bankName =
        vendor?.bank_name ||
        tenant?.bankAccount?.bankName ||
        'Standard Bank';

      const accountNumber =
        vendor?.bank_account_number ||
        tenant?.bankAccount?.accountNumber ||
        '023456789';

      const branchCode =
        vendor?.bank_branch_code ||
        tenant?.bankAccount?.branchCode ||
        '051001';

      const accountType =
        (tenant?.bankAccount?.accountType as any) || 'CURRENT';

      const primaryOrder = Array.from(data.orderIds)[0] || 'EOD-SETTLE';
      const cleanRef = primaryOrder.replace(/^#/, '').slice(-12);

      items.push({
        payoutItemId: `pi_eod_${randomUUID()}`,
        orderId: primaryOrder,
        tenantId: vendorId,
        recipientName,
        bankName,
        accountNumber,
        branchCode,
        accountType,
        amount: data.totalAmount,
        statementReference: `CARGO-EOD-${cleanRef}`,
      });
    }

    // If no transactions occurred today (e.g. testing or idle day), include verified vendors with pending balances
    if (items.length === 0) {
      const allVendors = await postgresVendorRepository.findAll();
      for (const vendor of allVendors) {
        const balance = await postgresLedgerService.getVendorBalance(vendor.id);
        if (balance > 0) {
          items.push({
            payoutItemId: `pi_eod_${randomUUID()}`,
            orderId: 'EOD-BALANCE-SWEEP',
            tenantId: vendor.id,
            recipientName: vendor.bank_account_holder,
            bankName: vendor.bank_name,
            accountNumber: vendor.bank_account_number,
            branchCode: vendor.bank_branch_code,
            accountType: 'CURRENT',
            amount: balance,
            statementReference: `CARGO-EOD-${vendor.slug.slice(0, 10).toUpperCase()}`,
          });
        }
      }
    }

    const totalAmount = Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
    const totalTransactions = items.length;

    // 2. Generate CSV payout batch formatted for standard South African online banking
    const csvFileContent = csvPayoutGeneratorService.generateBankingCsv(items, {
      payerReference: 'CARGODASH EOD',
      status: 'APPROVED',
    });
    const csvFilename = `${batchNumber}.csv`;

    // 3. Generate South African ACB Magtape 80-char fixed-width file
    const actionDate = new Date(now.getTime() + 86400000); // Next business day
    const acbFileContent = acbGeneratorService.generateAcbFile(batchNumber, actionDate, items);
    const acbFilename = `${batchNumber}.ACB`;

    const payoutBatch: PayoutBatch = {
      batchId,
      batchNumber,
      settlementCycle: 'DAILY_EOD',
      periodStartDate: startOfDay.toISOString(),
      periodEndDate: endOfDay.toISOString(),
      currency: config.DEFAULT_CURRENCY,
      totalTransactions,
      totalAmount,
      status: 'APPROVED',
      items,
      csvFileContent,
      csvFilename,
      acbFileContent,
      acbFilename,
      createdAt: new Date().toISOString(),
    };

    // Save batch in payoutBatchService repository
    payoutBatchService.saveBatch(payoutBatch);

    console.log(
      `✅ [EOD Reconciliation] Generated daily payout batch ${batchNumber}: ${totalTransactions} payouts totaling ${config.DEFAULT_CURRENCY} ${totalAmount.toFixed(2)}`
    );

    return payoutBatch;
  }

  /**
   * Starts the daily scheduled cron task (00:00 SAST / Africa/Johannesburg)
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. Schedule repeatable job in BullMQ if queue is available
    if (this.queue) {
      this.queue.add(
        JOB_EOD_RECONCILE,
        {},
        {
          repeat: {
            pattern: '0 0 * * *', // 00:00 daily
            tz: 'Africa/Johannesburg', // SAST (UTC+2)
          },
          jobId: 'daily_eod_reconciliation_cron',
        } as any
      ).catch((err) => {
        console.warn('[EodReconciliation] BullMQ repeat schedule fallback:', err.message);
      });
    }

    // 2. Internal interval timer for Node.js process resilience
    this.scheduleNextMidnightSAST();
    console.log('⏰ [EodReconciliation] Daily cron scheduler started (00:00 SAST / Africa/Johannesburg)');
  }

  /**
   * Calculates milliseconds until next 00:00 SAST (UTC+2) and arms timer
   */
  private scheduleNextMidnightSAST() {
    // Current UTC time
    const now = new Date();
    // SAST offset is +2 hours
    const sastTime = new Date(now.getTime() + 2 * 3600000);

    const nextMidnightSast = new Date(sastTime);
    nextMidnightSast.setUTCDate(nextMidnightSast.getUTCDate() + 1);
    nextMidnightSast.setUTCHours(0, 0, 0, 0);

    const msUntilMidnight = nextMidnightSast.getTime() - sastTime.getTime();

    this.timerHandle = setTimeout(async () => {
      try {
        await this.runDailyEodReconciliation();
      } catch (err) {
        console.error('[EodReconciliation] Scheduled run failed:', err);
      } finally {
        if (this.isRunning) {
          this.scheduleNextMidnightSAST();
        }
      }
    }, msUntilMidnight);
  }

  stop(): void {
    this.isRunning = false;
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = undefined;
    }
  }

  async close(): Promise<void> {
    this.stop();
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
  }
}

export const eodReconciliationService = new EodReconciliationService();
