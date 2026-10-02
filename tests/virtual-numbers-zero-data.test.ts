import { describe, it, expect } from 'vitest';
import { createFastifyApp } from '../src/fastify-app';

describe('Cloud Virtual WhatsApp Numbers & Zero-Data Vendor/Driver Operations', () => {
  it('1. GET /api/v1/virtual-numbers returns server-hosted Cloud Virtual Numbers requiring zero SIM data', async () => {
    const app = createFastifyApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/virtual-numbers',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.architecture).toBe('META_CLOUD_API_SERVER_HOSTED');
    expect(body.requiresPhysicalSimOrDataPackage).toBe(false);
    expect(body.virtualNumbers.length).toBeGreaterThanOrEqual(2);
    expect(body.virtualNumbers[0].cloudHostingStatus).toBe('ONLINE_24_7_CLOUD');
    expect(body.virtualNumbers[0].requiresSimCard).toBe(false);
    expect(body.virtualNumbers[0].requiresDataPackageForStorefront).toBe(false);

    await app.close();
  });

  it('2. POST /api/v1/virtual-numbers/provision provisions a dedicated Cloud Virtual Number for a vendor', async () => {
    const app = createFastifyApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/virtual-numbers/provision',
      payload: {
        vendorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        displayVirtualNumber: '+27 60 010 4999 (Cloud Virtual)',
        routingKeyword: '#ALBERTINIA',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.virtualNumber.displayVirtualNumber).toBe('+27 60 010 4999 (Cloud Virtual)');
    expect(body.virtualNumber.requiresSimCard).toBe(false);

    await app.close();
  });

  it('3. Executes Zero-Data WhatsApp commands (STATUS, LOAD, DONE, PRICE, STOCK, HELP) under 1 KB payload', async () => {
    const app = createFastifyApp();
    await app.ready();

    // STATUS command
    const statusRes = await app.inject({
      method: 'POST',
      url: '/api/v1/virtual-numbers/zero-data-command',
      payload: {
        senderPhone: '+27829876543',
        command: 'STATUS',
      },
    });
    expect(statusRes.statusCode).toBe(200);
    const statusBody = statusRes.json();
    expect(statusBody.handled).toBe(true);
    expect(statusBody.commandType).toBe('STATUS_BALANCE');
    expect(statusBody.replyText).toContain('ONLINE 24/7 (No SIM Data Needed)');
    expect(statusBody.payloadBytes).toBeLessThan(1024);

    // LOAD <ORDER_REF> command
    const loadRes = await app.inject({
      method: 'POST',
      url: '/api/v1/virtual-numbers/zero-data-command',
      payload: {
        senderPhone: '+27829876543',
        command: 'LOAD ORD-2026-8921',
      },
    });
    expect(loadRes.statusCode).toBe(200);
    expect(loadRes.json().commandType).toBe('MARK_DISPATCHED');
    expect(loadRes.json().orderRef).toBe('ORD-2026-8921');

    // DONE <ORDER_REF> command
    const doneRes = await app.inject({
      method: 'POST',
      url: '/api/v1/virtual-numbers/zero-data-command',
      payload: {
        senderPhone: '+27829876543',
        command: 'DONE ORD-2026-8921',
      },
    });
    expect(doneRes.statusCode).toBe(200);
    expect(doneRes.json().commandType).toBe('MARK_DELIVERED');

    // PRICE <ITEM> R<PRICE> command
    const priceRes = await app.inject({
      method: 'POST',
      url: '/api/v1/virtual-numbers/zero-data-command',
      payload: {
        senderPhone: '+27829876543',
        command: 'PRICE SAND R580',
      },
    });
    expect(priceRes.statusCode).toBe(200);
    expect(priceRes.json().commandType).toBe('UPDATE_PRICE');
    expect(priceRes.json().replyText).toContain('R 580.00');

    // STOCK OFF <ITEM> command
    const stockRes = await app.inject({
      method: 'POST',
      url: '/api/v1/virtual-numbers/zero-data-command',
      payload: {
        senderPhone: '+27829876543',
        command: 'STOCK OFF CEMENT',
      },
    });
    expect(stockRes.statusCode).toBe(200);
    expect(stockRes.json().commandType).toBe('TOGGLE_STOCK');
    expect(stockRes.json().replyText).toContain('OUT OF STOCK');

    await app.close();
  });

  it('4. Self-Service WhatsApp Vendor Onboarding (ONBOARD), Isolated Catalog Upload (ADD), and Service Schedule (HOURS)', async () => {
    const app = createFastifyApp();
    await app.ready();

    // 1. ONBOARD a new service_booking business via WhatsApp command
    const onboardRes = await app.inject({
      method: 'POST',
      url: '/api/v1/virtual-numbers/zero-data-command',
      payload: {
        senderPhone: '+27823334455',
        command: 'ONBOARD Glow Mobile Barber | service_booking | pro | Capitec 1544332211',
      },
    });
    expect(onboardRes.statusCode).toBe(200);
    const onboardBody = onboardRes.json();
    expect(onboardBody.handled).toBe(true);
    expect(onboardBody.commandType).toBe('ONBOARD_VENDOR');
    expect(onboardBody.virtualNumber.masterWabaId).toBe('waba_master_cargodash_001');
    expect(onboardBody.virtualNumber.businessType).toBe('service_booking');
    expect(onboardBody.virtualNumber.isolatedTenantWorkspace).toBe(true);

    const newVendorId = onboardBody.vendorId;

    // 2. ADD a service item directly into the vendor's isolated catalog via WhatsApp
    const addRes = await app.inject({
      method: 'POST',
      url: '/api/v1/virtual-numbers/zero-data-command',
      payload: {
        senderPhone: '+27823334455',
        vendorId: newVendorId,
        command: 'ADD Executive Fade & Beard Trim | R320 | 45 min session',
      },
    });
    expect(addRes.statusCode).toBe(200);
    const addBody = addRes.json();
    expect(addBody.commandType).toBe('ADD_CATALOG_ITEM');
    expect(addBody.replyText).toContain(onboardBody.virtualNumber.metaCatalogId);

    // 3. Configure operating hours via WhatsApp HOURS command
    const hoursRes = await app.inject({
      method: 'POST',
      url: '/api/v1/virtual-numbers/zero-data-command',
      payload: {
        senderPhone: '+27823334455',
        vendorId: newVendorId,
        command: 'HOURS MON-SAT 08:00-17:00 45M',
      },
    });
    expect(hoursRes.statusCode).toBe(200);
    expect(hoursRes.json().commandType).toBe('UPDATE_SCHEDULE');

    await app.close();
  });

  it('5. Automated Weekly Batch EFT Payout Engine sweeps vendor sub-ledgers after SaaS Set-Off and exports FNB & Capitec CSVs', async () => {
    const app = createFastifyApp();
    await app.ready();

    // Seed a settled order on BrickDirect so its sub-ledger has a positive balance
    await app.inject({
      method: 'POST',
      url: '/api/v1/revenue/settle-order',
      payload: {
        orderId: 'ord_batch_test_01',
        orderRef: 'ORD-BATCH-01',
        vendorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        subtotal: 5000.0,
        deliveryFee: 450.0,
      },
    });

    // Generate weekly batch EFT payout with automated SaaS set-off
    const batchRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payouts/batches/generate',
      payload: {
        billingCycle: '2026-11',
        applySaasSetoff: true,
        dispatchWhatsAppRemittance: true,
      },
    });

    expect(batchRes.statusCode).toBe(201);
    const batchBody = batchRes.json();
    expect(batchBody.success).toBe(true);
    expect(batchBody.batch.items.length).toBeGreaterThanOrEqual(1);
    expect(batchBody.batch.totalSaasSetoffDeducted).toBeGreaterThan(0);

    const batchId = batchBody.batch.batchId;

    // Download Capitec Business CSV
    const capitecCsvRes = await app.inject({
      method: 'GET',
      url: `/api/v1/payouts/batches/${batchId}/csv?format=capitec`,
    });
    expect(capitecCsvRes.statusCode).toBe(200);
    expect(capitecCsvRes.payload).toContain('Beneficiary Name,Bank Name,Branch Code,Account Number');

    // Download FNB Bulk Payment CSV
    const fnbCsvRes = await app.inject({
      method: 'GET',
      url: `/api/v1/payouts/batches/${batchId}/csv?format=fnb`,
    });
    expect(fnbCsvRes.statusCode).toBe(200);
    expect(fnbCsvRes.payload).toContain('Recipient Name,Recipient Account Number,Branch Code');

    await app.close();
  });
});

