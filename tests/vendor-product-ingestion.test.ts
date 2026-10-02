import { describe, it, expect, beforeEach, vi } from 'vitest';
import sharp from 'sharp';
import { vendorProductIngestionService } from '../src/services/vendor/vendor-product-ingestion.service';
import { conversationStateMachine } from '../src/services/state-machine/conversation-state-machine';
import { conversationSessionStore } from '../src/services/state-machine/conversation-session.store';
import { postgresVendorRepository } from '../src/database/postgres-vendor.repository';
import { postgresProductRepository } from '../src/database/postgres-product.repository';
import { whatsAppClientService } from '../src/services/whatsapp/whatsapp-client.service';
import { metaCatalogService } from '../src/services/meta/meta-catalog.service';

describe('WhatsApp Vendor Image Ingestion, Vision AI & Meta Catalog Push Engine', () => {
  const vendorWaId = '27820000001'; // BrickDirect Industrial Supplies (+27820000001)
  const vendorName = 'BrickDirect Industrial Supplies';

  beforeEach(async () => {
    await conversationSessionStore.resetSession(vendorWaId);
  });

  it('1. Correctly verifies registered vendor by WhatsApp phone number', async () => {
    const vendorWithPlus = await vendorProductIngestionService.getRegisteredVendor('+27820000001');
    expect(vendorWithPlus).toBeDefined();
    expect(vendorWithPlus?.business_name).toContain('BrickDirect');

    const vendorWithoutPlus = await vendorProductIngestionService.getRegisteredVendor('27820000001');
    expect(vendorWithoutPlus).toBeDefined();
    expect(vendorWithoutPlus?.id).toBe(vendorWithPlus?.id);

    const nonVendor = await vendorProductIngestionService.getRegisteredVendor('27829999999');
    expect(nonVendor).toBeNull();
  });

  it('2. Extracts price override and unit of measure from vendor caption', () => {
    const override1 = vendorProductIngestionService.extractPriceOverride('High grade plaster sand R580 per cube');
    expect(override1).toBeDefined();
    expect(override1?.price).toBe(580);
    expect(override1?.unitOfMeasure).toBe('per m3');

    const override2 = vendorProductIngestionService.extractPriceOverride('Cement stock bricks R2450 per 1000 bricks');
    expect(override2).toBeDefined();
    expect(override2?.price).toBe(2450);
    expect(override2?.unitOfMeasure).toBe('per 1000 bricks');

    const override3 = vendorProductIngestionService.extractPriceOverride('Portland cement 50kg bag R125.50');
    expect(override3).toBeDefined();
    expect(override3?.price).toBe(125.5);
    expect(override3?.unitOfMeasure).toBe('per bag');
  });

  it('3. Standardizes uploaded photo to 1024x1024 #F8F9FA canvas with bottom pill banner under 500KB', async () => {
    // Generate a test raw product image buffer
    const testRawBuffer = await sharp({
      create: {
        width: 600,
        height: 450,
        channels: 3,
        background: { r: 210, g: 105, b: 30 }, // Terracotta
      },
    })
      .jpeg()
      .toBuffer();

    const { buffer: enhancedBuffer, cdnUrl } = await vendorProductIngestionService.standardizeImage(
      testRawBuffer,
      'BrickDirect Industrial',
      'per 1000 bricks'
    );

    expect(enhancedBuffer).toBeDefined();
    expect(cdnUrl).toBeDefined();
    expect(cdnUrl).toContain('cloudinary');

    const meta = await sharp(enhancedBuffer).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
    expect(enhancedBuffer.length).toBeLessThan(500 * 1024); // Under 500KB
  });

  it('4. Processes inbound vendor image message, extracts specs, creates product draft, and dispatches interactive preview', async () => {
    const sendPreviewSpy = vi.spyOn(whatsAppClientService, 'sendProductDraftInteractivePreview');

    // Simulate inbound WhatsApp webhook message with image
    await conversationStateMachine.handleInboundMessage(vendorWaId, vendorName, {
      from: vendorWaId,
      id: 'wamid_vendor_img_01',
      timestamp: `${Date.now()}`,
      type: 'image',
      image: {
        id: 'mock_media_sand_cube_123',
        caption: 'Plaster Sand direct tipper load R580 per cube',
        mime_type: 'image/jpeg',
      },
    });

    expect(sendPreviewSpy).toHaveBeenCalled();
    const callArgs = sendPreviewSpy.mock.calls[0];
    expect(callArgs[0]).toBe(vendorWaId);
    expect(callArgs[1].unitPrice).toBe(580);
    expect(callArgs[1].unitOfMeasure).toBe('per m3');
    expect(callArgs[1].enhancedImageUrl).toBeDefined();

    // Verify draft was saved in products repository
    const draft = await postgresProductRepository.findById(callArgs[1].productId);
    expect(draft).toBeDefined();
    expect(draft?.unit_price).toBe(580);
    expect(draft?.unit_of_measure).toBe('per m3');
    expect(draft?.is_available).toBe(false); // Unapproved draft

    sendPreviewSpy.mockRestore();
  });

  it('5. Handles vendor approval [Approve & Publish] -> publishes to Meta Commerce Catalog', async () => {
    const upsertSpy = vi.spyOn(metaCatalogService, 'upsertProduct');
    const sendTextSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage');

    // Create draft product in repository
    const vendor = (await vendorProductIngestionService.getRegisteredVendor(vendorWaId))!;
    const draft = await vendorProductIngestionService.saveProductDraft({
      vendorId: vendor.id,
      specs: {
        title: 'Cement Stock Bricks',
        category: 'bricks_blocks',
        unit_of_measure: 'per 1000 bricks',
        unit_price: 2450.0,
        description: 'Standard clay and cement masonry bricks',
        confidence_score: 0.95,
      },
      enhancedImageUrl: 'https://res.cloudinary.com/mock-cloud/image/upload/sample_brick.webp',
    });

    // Vendor taps [Approve & Publish]
    await conversationStateMachine.handleInboundMessage(vendorWaId, vendorName, {
      from: vendorWaId,
      id: 'wamid_approve_draft_01',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: `btn_publish_product:${draft.id}`,
          title: 'Approve & Publish',
        },
      },
    });

    expect(upsertSpy).toHaveBeenCalled();
    expect(sendTextSpy).toHaveBeenCalled();
    const replyText = sendTextSpy.mock.calls[0][1];
    expect(replyText).toContain('Published to WhatsApp Catalog');

    // Verify product is marked available in database
    const published = await postgresProductRepository.findById(draft.id);
    expect(published?.is_available).toBe(true);
    expect(published?.meta_catalog_id).toBeDefined();

    upsertSpy.mockRestore();
    sendTextSpy.mockRestore();
  });

  it('6. Handles vendor [Edit Price] interactive flow and updates unit price', async () => {
    const sendPreviewSpy = vi.spyOn(whatsAppClientService, 'sendProductDraftInteractivePreview');
    const sendTextSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage');

    const vendor = (await vendorProductIngestionService.getRegisteredVendor(vendorWaId))!;
    const draft = await vendorProductIngestionService.saveProductDraft({
      vendorId: vendor.id,
      specs: {
        title: 'River Sand Load',
        category: 'sand_stone',
        unit_of_measure: 'per m3',
        unit_price: 500.0,
        description: 'Clean washed river sand',
        confidence_score: 0.92,
      },
      enhancedImageUrl: 'https://res.cloudinary.com/mock-cloud/image/upload/sample_sand.webp',
    });

    // 1. Vendor taps [Edit Price]
    await conversationStateMachine.handleInboundMessage(vendorWaId, vendorName, {
      from: vendorWaId,
      id: 'wamid_btn_edit_price',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: `btn_edit_price:${draft.id}`,
          title: 'Edit Price',
        },
      },
    });

    expect(sendTextSpy).toHaveBeenCalledWith(vendorWaId, expect.stringContaining('Please reply with the new unit price'));

    // 2. Vendor replies with new price: "R560"
    await conversationStateMachine.handleInboundMessage(vendorWaId, vendorName, {
      from: vendorWaId,
      id: 'wamid_vendor_new_price',
      timestamp: `${Date.now()}`,
      type: 'text',
      text: {
        body: 'R560',
      },
    });

    // Verify price updated
    const updated = await postgresProductRepository.findById(draft.id);
    expect(updated?.unit_price).toBe(560.0);
    expect(sendPreviewSpy).toHaveBeenCalled();

    sendPreviewSpy.mockRestore();
    sendTextSpy.mockRestore();
  });

  it('7. Handles vendor [Discard] -> cancels draft product', async () => {
    const sendTextSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage');

    const vendor = (await vendorProductIngestionService.getRegisteredVendor(vendorWaId))!;
    const draft = await vendorProductIngestionService.saveProductDraft({
      vendorId: vendor.id,
      specs: {
        title: 'Temporary Discard Test',
        category: 'hardware',
        unit_of_measure: 'per unit',
        unit_price: 150.0,
        description: 'Temporary item',
        confidence_score: 0.9,
      },
      enhancedImageUrl: 'https://res.cloudinary.com/mock-cloud/image/upload/sample_temp.webp',
    });

    // Vendor taps [Discard]
    await conversationStateMachine.handleInboundMessage(vendorWaId, vendorName, {
      from: vendorWaId,
      id: 'wamid_btn_discard',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: `btn_discard_product:${draft.id}`,
          title: 'Discard',
        },
      },
    });

    expect(sendTextSpy).toHaveBeenCalledWith(vendorWaId, expect.stringContaining('Product draft discarded'));

    const discarded = await postgresProductRepository.findById(draft.id);
    expect(discarded?.is_available).toBe(false);

    sendTextSpy.mockRestore();
  });

  it('8. Executes PROCESS_CATALOG_INGESTION background worker task, stores raw_image_url & enhanced_image_url, sets meta_product_retailer_id = NULL, and sends Listing Preview buttons', async () => {
    const { orderQueueManager } = await import('../src/services/queue/order-queue.worker');
    const sendPayloadSpy = vi.spyOn(whatsAppClientService as any, 'sendPayload');

    const jobResult = await orderQueueManager.processJob('PROCESS_CATALOG_INGESTION', {
      senderWaId: vendorWaId,
      mediaId: 'mock_media_river_sand_999',
      caption: 'Washed River Sand R595 per m3',
    });

    expect(jobResult.success).toBe(true);
    expect(jobResult.jobName).toBe('PROCESS_CATALOG_INGESTION');
    expect(sendPayloadSpy).toHaveBeenCalled();

    const sentPayload = sendPayloadSpy.mock.calls[0][1] as any;
    expect(sentPayload.interactive.header.type).toBe('image');
    expect(sentPayload.interactive.body.text).toContain('📦 *Listing Preview:*');
    expect(sentPayload.interactive.body.text).toContain('💰 Price: R595 per m3');
    expect(sentPayload.interactive.body.text).toContain('Review the enhanced card above. Tap an option below to confirm or edit:');

    const buttons = sentPayload.interactive.action.buttons;
    expect(buttons[0].reply.id).toMatch(/^publish_listing_/);
    expect(buttons[0].reply.title).toBe('Approve & Publish');
    expect(buttons[1].reply.id).toMatch(/^edit_price_/);
    expect(buttons[1].reply.title).toBe('Edit Price / Text');
    expect(buttons[2].reply.id).toMatch(/^discard_/);
    expect(buttons[2].reply.title).toBe('Discard');

    const productId = buttons[0].reply.id.replace('publish_listing_', '');
    const draft = await postgresProductRepository.findById(productId);
    expect(draft).toBeDefined();
    expect(draft?.is_available).toBe(false);
    expect(draft?.meta_product_retailer_id).toBeNull();
    expect(draft?.raw_image_url).toContain('whatsapp-vendor-raw');
    expect(draft?.enhanced_image_url).toContain('whatsapp-vendor-products');
    expect(draft?.draft_specs?.unit_price).toBe(595);

    sendPayloadSpy.mockRestore();
  });

  it('9. Handles [publish_listing_{product_id}] -> pushes to Meta Graph API v19.0, stores meta_product_retailer_id, and sets is_available = TRUE', async () => {
    const sendTextSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage');
    const vendor = (await vendorProductIngestionService.getRegisteredVendor(vendorWaId))!;

    const draft = await vendorProductIngestionService.saveProductDraft({
      vendorId: vendor.id,
      specs: {
        title: '19mm Concrete Stone Aggregate',
        category: 'sand_stone',
        unit_of_measure: 'per m3',
        unit_price: 640.0,
        description: 'Crushed 19mm structural stone aggregate',
        confidence_score: 0.96,
      },
      rawImageUrl: 'https://res.cloudinary.com/mock-cloud/image/upload/v1/whatsapp-vendor-raw/raw_stone.jpg',
      enhancedImageUrl: 'https://res.cloudinary.com/mock-cloud/image/upload/v1/whatsapp-vendor-products/enh_stone.jpg',
    });

    expect(draft.meta_product_retailer_id).toBeNull();
    expect(draft.is_available).toBe(false);

    await conversationStateMachine.handleInboundMessage(vendorWaId, vendorName, {
      from: vendorWaId,
      id: 'wamid_publish_listing_btn',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: `publish_listing_${draft.id}`,
          title: 'Approve & Publish',
        },
      },
    });

    expect(sendTextSpy).toHaveBeenCalledWith(
      vendorWaId,
      expect.stringContaining('✅ Live! Your product is now visible on your customer catalog.')
    );

    const published = await postgresProductRepository.findById(draft.id);
    expect(published?.is_available).toBe(true);
    expect(published?.meta_product_retailer_id).toBeTruthy();
    expect(published?.meta_product_retailer_id).toMatch(/^SKU-VND-/);
    expect(published?.draft_specs).toBeNull();

    sendTextSpy.mockRestore();
  });

  it("10. Handles [edit_price_{product_id}] -> sets WAITING_FOR_PRICE_EDIT state and applies 'R620 per m3' override", async () => {
    const sendTextSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage');
    const sendPreviewSpy = vi.spyOn(whatsAppClientService, 'sendProductDraftInteractivePreview');
    const vendor = (await vendorProductIngestionService.getRegisteredVendor(vendorWaId))!;

    const draft = await vendorProductIngestionService.saveProductDraft({
      vendorId: vendor.id,
      specs: {
        title: 'Building Sand Bulk Load',
        category: 'sand_stone',
        unit_of_measure: 'per unit',
        unit_price: 550.0,
        description: 'Screened pit building sand',
        confidence_score: 0.91,
      },
      enhancedImageUrl: 'https://res.cloudinary.com/mock-cloud/image/upload/v1/whatsapp-vendor-products/sand_550.jpg',
    });

    // Step 1: Vendor taps [edit_price_{product_id}]
    await conversationStateMachine.handleInboundMessage(vendorWaId, vendorName, {
      from: vendorWaId,
      id: 'wamid_edit_price_new',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: `edit_price_${draft.id}`,
          title: 'Edit Price / Text',
        },
      },
    });

    const sessionInEdit = await conversationSessionStore.getSession(vendorWaId);
    expect(sessionInEdit.currentStage).toBe('WAITING_FOR_PRICE_EDIT');
    expect(sessionInEdit.pendingPriceEditProductId).toBe(draft.id);
    expect(sendTextSpy).toHaveBeenCalledWith(
      vendorWaId,
      expect.stringContaining("Reply with the correct price and unit (e.g. 'R620 per m3'):")
    );

    // Step 2: Vendor replies "R620 per m3"
    await conversationStateMachine.handleInboundMessage(vendorWaId, vendorName, {
      from: vendorWaId,
      id: 'wamid_reply_r620',
      timestamp: `${Date.now()}`,
      type: 'text',
      text: {
        body: 'R620 per m3',
      },
    });

    const updated = await postgresProductRepository.findById(draft.id);
    expect(updated?.unit_price).toBe(620);
    expect(updated?.unit_of_measure).toBe('per m3');
    expect(sendPreviewSpy).toHaveBeenCalledWith(
      vendorWaId,
      expect.objectContaining({
        productId: draft.id,
        unitPrice: 620,
        unitOfMeasure: 'per m3',
      })
    );

    sendTextSpy.mockRestore();
    sendPreviewSpy.mockRestore();
  });

  it('11. Handles [discard_{product_id}] -> deletes draft record from products and purges uploaded CDN assets', async () => {
    const { cloudinaryService } = await import('../src/services/image/cloudinary.service');
    const sendTextSpy = vi.spyOn(whatsAppClientService, 'sendTextMessage');
    const vendor = (await vendorProductIngestionService.getRegisteredVendor(vendorWaId))!;

    const rawUrl = 'https://res.cloudinary.com/mock-cloud/image/upload/v1/whatsapp-vendor-raw/discard_raw_01.jpg';
    const enhUrl = 'https://res.cloudinary.com/mock-cloud/image/upload/v1/whatsapp-vendor-products/discard_enh_01.jpg';

    const draft = await vendorProductIngestionService.saveProductDraft({
      vendorId: vendor.id,
      specs: {
        title: 'Draft To Be Deleted & Purged',
        category: 'cement',
        unit_of_measure: 'per bag',
        unit_price: 110.0,
        description: 'Test draft for hard delete and CDN purge',
        confidence_score: 0.89,
      },
      rawImageUrl: rawUrl,
      enhancedImageUrl: enhUrl,
    });

    await conversationStateMachine.handleInboundMessage(vendorWaId, vendorName, {
      from: vendorWaId,
      id: 'wamid_discard_hard',
      timestamp: `${Date.now()}`,
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: {
          id: `discard_${draft.id}`,
          title: 'Discard',
        },
      },
    });

    expect(sendTextSpy).toHaveBeenCalledWith(vendorWaId, expect.stringContaining('🗑️ Draft discarded.'));

    // Verify record was deleted from products table
    const deletedRecord = await postgresProductRepository.findById(draft.id);
    expect(deletedRecord).toBeNull();

    // Verify both raw and enhanced CDN assets were purged
    expect(cloudinaryService.hasAssetBeenPurged(rawUrl)).toBe(true);
    expect(cloudinaryService.hasAssetBeenPurged(enhUrl)).toBe(true);

    sendTextSpy.mockRestore();
  });
});
