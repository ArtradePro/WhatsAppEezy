import { describe, it, expect } from 'vitest';
import { metaCatalogService } from '../src/services/meta/meta-catalog.service';
import { MetaProductPayload } from '../src/types/meta.types';

describe('MetaCatalogService v19.0 Integration', () => {
  it('should construct valid payload and return live WhatsApp product ID and commerce URL', async () => {
    const payload: MetaProductPayload = {
      retailer_id: 'SKU-BRICK-001',
      name: 'Solid Red Facing Bricks',
      description: 'Standard facing bricks. Dimensions: 222mm x 106mm x 73mm. Material: Clay.',
      availability: 'in stock',
      condition: 'new',
      price: 450.0,
      currency: 'USD',
      image_url: 'https://res.cloudinary.com/demo/image/upload/v1/master_1024_SKU-BRICK-001.jpg',
      url: 'https://wa.me/c/product/SKU-BRICK-001',
      brand: 'BrickDirect',
      custom_data: {
        dimensions: '222mm x 106mm x 73mm',
        material: 'Clay / Terracotta',
        unit_of_measure: 'per 1000 bricks',
        color: 'Terracotta Red',
      },
    };

    const result = await metaCatalogService.upsertProduct(payload);

    expect(result).toBeDefined();
    expect(result.syncStatus).toBe('SYNCED');
    expect(result.retailerId).toBe('SKU-BRICK-001');
    expect(result.metaProductId).toBeDefined();
    expect(result.liveWhatsAppProductId).toContain('SKU-BRICK-001');
    expect(result.whatsAppCommerceUrl).toContain('https://wa.me');
  });
});
