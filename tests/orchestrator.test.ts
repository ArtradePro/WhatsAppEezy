import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { ingestionOrchestrator } from '../src/services/pipeline/ingestion-orchestrator';
import { productRepository } from '../src/services/db/product-repository';

describe('IngestionOrchestrator End-to-End Pipeline', () => {
  it('should process supplier raw image, extract standardized attributes, sync to Meta Catalog, and save to database', async () => {
    // Generate realistic test image buffer
    const testImage = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 190, g: 60, b: 40, alpha: 1 },
      },
    })
      .jpeg()
      .toBuffer();

    const input = {
      title: 'High-Strength Concrete Pavers',
      unitPrice: 185.5,
      currency: 'USD',
      description:
        'Interlocking precast concrete paving blocks measuring 200mm x 100mm x 60mm. Priced per m3. Natural charcoal gray finish.',
      supplierId: 'supplier_industrial_01',
      brand: 'Titan Concrete',
    };

    const result = await ingestionOrchestrator.ingestSupplierProduct(
      testImage,
      { originalname: 'paver_raw.jpg', mimetype: 'image/jpeg', size: testImage.length },
      input
    );

    // Assertions on the ingestion response
    expect(result.success).toBe(true);
    expect(result.productId).toBeDefined();
    expect(result.retailerId).toBeDefined();

    // Verify 1024x1024 enhanced image
    expect(result.images.resolution).toBe('1024x1024');
    expect(result.images.enhancedUrl).toBeDefined();
    expect(result.images.backgroundRemovedUrl).toBeDefined();

    // Verify standardized attributes
    expect(result.extractedAttributes.dimensions).toContain('200mm x 100mm x 60mm');
    expect(result.extractedAttributes.material).toContain('Concrete');
    expect(result.extractedAttributes.unitOfMeasure).toBe('per m3');
    expect(result.extractedAttributes.color).toBe('Charcoal Gray');

    // Verify Meta Commerce Catalog sync
    expect(result.metaSync.syncStatus).toBe('SYNCED');
    expect(result.metaSync.liveWhatsAppProductId).toBeDefined();
    expect(result.whatsappCatalogDetails.whatsappDeepLink).toContain('https://wa.me');

    // Verify database record
    const savedProduct = await productRepository.findById(result.productId);
    expect(savedProduct).not.toBeNull();
    expect(savedProduct?.id).toBe(result.productId);
    expect(savedProduct?.status).toBe('SYNCED');
    expect(savedProduct?.attributes.material).toContain('Concrete');
  });
});
