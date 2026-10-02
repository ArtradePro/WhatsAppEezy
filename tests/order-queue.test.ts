import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { orderQueueManager } from '../src/services/queue/order-queue.worker';
import { vendorProductIngestionService } from '../src/services/vendor/vendor-product-ingestion.service';
import { xeroEngineService } from '../src/services/accounting/xero-engine.service';
import { whatsAppClientService } from '../src/services/whatsapp/whatsapp-client.service';
import { postgresOrderRepository } from '../src/database/postgres-order.repository';
import { postgresVendorRepository } from '../src/database/postgres-vendor.repository';

describe('Unified BullMQ Order Queue & Background Worker Engine', () => {
  const vendorWaId = '27820000001';
  const customerWaId = '27829998877';

  afterAll(async () => {
    await orderQueueManager.close();
  });

  describe('1. PROCESS_IMAGE_CATALOG Job Execution', () => {
    it('executes Sharp image normalizer and Vision AI catalog intake', async () => {
      const vendorSpy = vi.spyOn(vendorProductIngestionService, 'handleVendorInboundImage');

      const result = await orderQueueManager.processJob('PROCESS_IMAGE_CATALOG', {
        senderWaId: vendorWaId,
        mediaId: 'mock_media_sand_001',
        caption: 'High grade plaster sand R580 per cube',
      });

      expect(vendorSpy).toHaveBeenCalledWith(
        vendorWaId,
        expect.objectContaining({
          type: 'image',
          image: expect.objectContaining({
            id: 'mock_media_sand_001',
            caption: 'High grade plaster sand R580 per cube',
          }),
        })
      );
      expect(result.success).toBe(true);

      vendorSpy.mockRestore();
    });
  });

  describe('2. SYNC_XERO_TRANSACTION Job Execution', () => {
    it('generates Xero commission tax invoice and supplier bill for paid order', async () => {
      const vendor = (await postgresVendorRepository.findByWhatsAppNumber(vendorWaId))!;
      const testOrder = await postgresOrderRepository.createOrder(
        {
          order_ref: 'ORD-BULLMQ-XERO-001',
          vendor_id: vendor.id,
          customer_phone: customerWaId,
          customer_name: 'Railway Contractor',
          delivery_address: 'Stand 101, Industrial Park',
          delivery_lon: 28.0,
          delivery_lat: -26.0,
          distance_km: 15,
          subtotal: 5000,
          delivery_fee: 600,
          total_amount: 5600,
          platform_fee: 448,
          vendor_payout: 5152,
          payment_status: 'paid',
          current_status: 'paid',
        },
        []
      );

      const xeroSpy = vi.spyOn(xeroEngineService, 'syncOrderPaid');

      const result = await orderQueueManager.processJob('SYNC_XERO_TRANSACTION', {
        orderId: testOrder.id,
      });

      expect(xeroSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.objectContaining({ id: testOrder.id }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.platformInvoice).toBeDefined();
      expect(result.settlementBill).toBeDefined();

      xeroSpy.mockRestore();
    });
  });

  describe('3. DISPATCH_WHATSAPP_ALERT Job Execution', () => {
    it('dispatches interactive WhatsApp button alerts via Meta Cloud API', async () => {
      const buttonSpy = vi.spyOn(whatsAppClientService, 'sendInteractiveButtons');

      await orderQueueManager.processJob('DISPATCH_WHATSAPP_ALERT', {
        recipientPhone: customerWaId,
        messageType: 'interactive_buttons',
        interactive: {
          headerText: 'Delivery Update',
          bodyText: 'Your building materials are en route to your site.',
          buttons: [{ id: 'track_driver', title: 'Track Driver' }],
        },
      });

      expect(buttonSpy).toHaveBeenCalledWith(
        customerWaId,
        'Your building materials are en route to your site.',
        [{ id: 'track_driver', title: 'Track Driver' }]
      );

      buttonSpy.mockRestore();
    });

    it('dispatches product draft interactive preview to vendor', async () => {
      const previewSpy = vi.spyOn(whatsAppClientService, 'sendProductDraftInteractivePreview');

      await orderQueueManager.processJob('DISPATCH_WHATSAPP_ALERT', {
        recipientPhone: vendorWaId,
        messageType: 'draft_preview',
        draftPreview: {
          productId: 'prod-uuid-1234',
          title: 'River Sand Load',
          unitPrice: 580,
          unitOfMeasure: 'per m3',
          description: 'High grade plaster sand',
          enhancedImageUrl: 'https://cdn.cargodash.com/image.webp',
        },
      });

      expect(previewSpy).toHaveBeenCalledWith(
        vendorWaId,
        expect.objectContaining({
          productId: 'prod-uuid-1234',
          title: 'River Sand Load',
          unitPrice: 580,
        })
      );

      previewSpy.mockRestore();
    });
  });

  describe('4. In-Memory Resilient Event Bus Enqueue Fallback', () => {
    it('enqueues and processes task asynchronously through event fallback', async () => {
      const textSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage');

      const completedPromise = new Promise<void>((resolve) => {
        const handler = (event: any) => {
          if (event.name === 'DISPATCH_WHATSAPP_ALERT') {
            orderQueueManager.eventEmitter.off('job_completed', handler);
            resolve();
          }
        };
        orderQueueManager.eventEmitter.on('job_completed', handler);
      });

      await orderQueueManager.enqueue('DISPATCH_WHATSAPP_ALERT', {
        recipientPhone: customerWaId,
        messageType: 'text',
        text: 'Testing asynchronous queue dispatch',
      });

      await completedPromise;

      expect(textSpy).toHaveBeenCalledWith(customerWaId, 'Testing asynchronous queue dispatch');
      textSpy.mockRestore();
    });
  });
});
