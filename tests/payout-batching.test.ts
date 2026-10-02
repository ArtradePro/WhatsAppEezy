import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFastifyApp } from '../src/fastify-app';
import { FastifyInstance } from 'fastify';
import { acbGeneratorService } from '../src/services/payout/acb-generator.service';
import { payoutBatchService } from '../src/services/payout/payout-batch.service';
import { csvPayoutGeneratorService } from '../src/services/payout/csv-payout-generator.service';
import { PayoutBatchItem } from '../src/types/payout.types';

describe('Payout Batching & South African ACB EFT File Generation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = createFastifyApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should generate valid fixed-width ACB Magtape EFT file matching SA clearing bank format', () => {
    const items: PayoutBatchItem[] = [
      {
        payoutItemId: 'item_1',
        orderId: 'ORD-001',
        tenantId: 'tenant_brickdirect',
        recipientName: 'BrickDirect Industrial',
        bankName: 'Standard Bank',
        accountNumber: '023456789',
        branchCode: '051001',
        accountType: 'CURRENT',
        amount: 2500.5,
        statementReference: 'CARGO-SETTLE01',
      },
      {
        payoutItemId: 'item_2',
        orderId: 'ORD-002',
        tenantId: 'tenant_titan',
        recipientName: 'Titan Aggregate Quarries',
        bankName: 'FNB',
        accountNumber: '62849302918',
        branchCode: '250655',
        accountType: 'CHEQUE',
        amount: 4120.0,
        statementReference: 'CARGO-SETTLE02',
      },
    ];

    const batchNumber = 'BATCH-202609-101';
    const actionDate = new Date();
    const acbText = acbGeneratorService.generateAcbFile(batchNumber, actionDate, items);

    expect(acbText).toBeDefined();
    const lines = acbText.split('\r\n');
    expect(lines.length).toBe(4); // Header + 2 items + Trailer

    // Verify Header (Record 02)
    const headerLine = lines[0];
    expect(headerLine.startsWith('02')).toBe(true);
    expect(headerLine).toContain('CARGODASH');

    // Verify Detail 1 (Record 10)
    const detailLine1 = lines[1];
    expect(detailLine1.startsWith('10')).toBe(true);
    expect(detailLine1).toContain('051001'); // Branch code
    expect(detailLine1).toContain('BRICKDIRECT');

    // Verify Trailer (Record 99)
    const trailerLine = lines[3];
    expect(trailerLine.startsWith('99')).toBe(true);
    expect(trailerLine).toContain('END-OF-BATCH');
  });

  it('should compile a net-weekly payout batch via PayoutBatchService', async () => {
    const batch = await payoutBatchService.generateWeeklyBatch();

    expect(batch).toBeDefined();
    expect(batch.batchId).toBeDefined();
    expect(batch.settlementCycle).toBe('NET_WEEKLY');
    expect(batch.items.length).toBeGreaterThan(0);
    expect(batch.totalAmount).toBeGreaterThan(0);
    expect(batch.acbFileContent).toContain('CARGODASH');
  });

  it('POST /api/v1/payouts/batches/generate compiles batch via Fastify API', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/payouts/batches/generate',
      payload: {},
    });

    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.batch.batchId).toBeDefined();
    expect(json.batch.acbFilename).toContain('.ACB');

    // Test GET /api/v1/payouts/batches
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/payouts/batches',
    });
    expect(listRes.statusCode).toBe(200);
    const listJson = JSON.parse(listRes.body);
    expect(listJson.count).toBeGreaterThan(0);

    // Test GET /api/v1/payouts/batches/:batchId/download
    const downloadRes = await app.inject({
      method: 'GET',
      url: `/api/v1/payouts/batches/${json.batch.batchId}/download`,
    });
    expect(downloadRes.statusCode).toBe(200);
    expect(downloadRes.headers['content-type']).toContain('text/plain');
    expect(downloadRes.body).toContain('CARGODASH');
  });

  it('GET /api/v1/dashboard/metrics returns live multi-tenant KPIs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/metrics?period=live',
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.data.grossMerchandiseValue).toBeGreaterThan(0);
    expect(json.data.fulfillmentStatus).toBeDefined();
    expect(json.data.aiQueryResolution).toBeDefined();
  });

  it('GET /api/v1/dashboard/tenants returns merchant directory with verified bank accounts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/tenants',
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.count).toBeGreaterThanOrEqual(2);
    expect(json.tenants[0].bankAccount.isVerified).toBe(true);
  });

  describe('Multi-Bank Specific Online Banking CSV Exports (FNB, Standard Bank, Nedbank, Absa)', () => {
    const sampleItems: PayoutBatchItem[] = [
      {
        payoutItemId: 'item_fnb_1',
        orderId: 'ORD-2026-FNB-01',
        tenantId: 'tenant_brickdirect',
        recipientName: 'BrickDirect Industrial Supplies',
        bankName: 'FNB',
        accountNumber: '62849302918',
        branchCode: '250655',
        accountType: 'CURRENT',
        amount: 3553.41,
        statementReference: 'CARGO-FNB01',
      },
      {
        payoutItemId: 'item_sb_2',
        orderId: 'ORD-2026-SB-02',
        tenantId: 'tenant_fonsi',
        recipientName: 'Fonsi-Colquake Transport',
        bankName: 'Standard Bank',
        accountNumber: '023456789',
        branchCode: '051001',
        accountType: 'CHEQUE',
        amount: 7114.36,
        statementReference: 'CARGO-SB02',
      },
    ];

    it('should generate compliant FNB Online Banking CSV format', () => {
      const csv = csvPayoutGeneratorService.generateFnbCsv(sampleItems);
      const lines = csv.split('\r\n');
      expect(lines[0]).toBe(
        'Recipient Name,Recipient Account Number,Branch Code,Account Type,Amount,Own Reference,Their Reference'
      );
      expect(lines[1]).toContain('BrickDirect Industrial');
      expect(lines[1]).toContain('"62849302918"');
      expect(lines[1]).toContain('"250655"');
      expect(lines[1]).toContain('3553.41');
    });

    it('should generate compliant Standard Bank Business Online CSV format', () => {
      const csv = csvPayoutGeneratorService.generateStandardBankCsv(sampleItems);
      const lines = csv.split('\r\n');
      expect(lines[0]).toBe(
        'Branch Code,Account Number,Account Type,Amount,Beneficiary Name,Beneficiary Statement Description,My Statement Description'
      );
      expect(lines[2]).toContain('"051001"');
      expect(lines[2]).toContain('"023456789"');
      expect(lines[2]).toContain('"Fonsi-Colquake Transport"');
      expect(lines[2]).toContain('7114.36');
    });

    it('should generate compliant Nedbank NetBank Business CSV format', () => {
      const csv = csvPayoutGeneratorService.generateNedbankCsv(sampleItems);
      const lines = csv.split('\r\n');
      expect(lines[0]).toBe(
        'Account Number,Branch Code,Account Type,Amount,Beneficiary Name,Their Reference,Own Reference'
      );
      expect(lines[1]).toContain('"62849302918"');
      expect(lines[1]).toContain('3553.41');
    });

    it('should generate compliant Absa Business Integrator CSV format', () => {
      const csv = csvPayoutGeneratorService.generateAbsaCsv(sampleItems);
      const lines = csv.split('\r\n');
      expect(lines[0]).toBe(
        'Beneficiary Name,Beneficiary Account,Branch Code,Account Type,Amount,Beneficiary Reference,Own Reference'
      );
      expect(lines[1]).toContain('BrickDirect Industrial');
      expect(lines[1]).toContain('"62849302918"');
    });

    it('GET /api/v1/payouts/batches/:batchId/csv supports ?format=fnb and ?format=standard_bank', async () => {
      const batch = await payoutBatchService.generateWeeklyBatch();

      // Download FNB format
      const fnbRes = await app.inject({
        method: 'GET',
        url: `/api/v1/payouts/batches/${batch.batchId}/csv?format=fnb`,
      });
      expect(fnbRes.statusCode).toBe(200);
      expect(fnbRes.headers['content-type']).toContain('text/csv');
      expect(fnbRes.headers['content-disposition']).toContain('FNB-PAYOUT');
      expect(fnbRes.body).toContain('Recipient Account Number');

      // Download Standard Bank format
      const sbRes = await app.inject({
        method: 'GET',
        url: `/api/v1/payouts/batches/${batch.batchId}/csv?format=standard_bank`,
      });
      expect(sbRes.statusCode).toBe(200);
      expect(sbRes.headers['content-disposition']).toContain('STANDARD-BANK');
      expect(sbRes.body).toContain('Branch Code,Account Number');

      // Download Nedbank format
      const nedRes = await app.inject({
        method: 'GET',
        url: `/api/v1/payouts/batches/${batch.batchId}/csv?format=nedbank`,
      });
      expect(nedRes.statusCode).toBe(200);
      expect(nedRes.headers['content-disposition']).toContain('NEDBANK');
    });
  });
});
