import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app';
import { Server } from 'http';
import axios from 'axios';
import sharp from 'sharp';

describe('HTTP API Ingestion & Catalog Endpoints', () => {
  let server: Server;
  let port: number;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 3001;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /health returns 200 and healthy status', async () => {
    const res = await axios.get(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('healthy');
    expect(res.data.integrations).toBeDefined();
  });

  it('POST /api/v1/products/ingest accepts multipart/form-data and executes full pipeline', async () => {
    // Generate dummy test image buffer
    const testImage = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 4,
        background: { r: 100, g: 150, b: 200, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    // Construct FormData using native Node FormData
    const formData = new FormData();
    const blob = new Blob([testImage], { type: 'image/png' });
    formData.append('image', blob, 'test-product.png');
    formData.append('title', 'Heavy Duty Steel Rebar Y12');
    formData.append('unit_price', '42.50');
    formData.append('currency', 'USD');
    formData.append('description', 'High-tensile deformed reinforced steel rebar 12mm x 6000mm. Priced per metric ton.');
    formData.append('brand', 'MegaSteel');
    formData.append('supplier_id', 'supp_009');

    const res = await axios.post(`${baseUrl}/api/v1/products/ingest`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.productId).toBeDefined();
    expect(res.data.retailerId).toBeDefined();
    expect(res.data.images.resolution).toBe('1024x1024');
    expect(res.data.images.enhancedUrl).toBeDefined();
    expect(res.data.extractedAttributes.material).toContain('Steel');
    expect(res.data.extractedAttributes.unitOfMeasure).toBe('per metric ton');
    expect(res.data.metaSync.syncStatus).toBe('SYNCED');
    expect(res.data.whatsappCatalogDetails.whatsappDeepLink).toBeDefined();

    // Verify it is listed in GET /api/v1/products
    const listRes = await axios.get(`${baseUrl}/api/v1/products`);
    expect(listRes.status).toBe(200);
    expect(listRes.data.count).toBeGreaterThan(0);

    // Verify GET /api/v1/products/:id
    const singleRes = await axios.get(`${baseUrl}/api/v1/products/${res.data.productId}`);
    expect(singleRes.status).toBe(200);
    expect(singleRes.data.product.id).toBe(res.data.productId);
  });

  it('POST /api/v1/products/ingest rejects request if image file is missing', async () => {
    const formData = new FormData();
    formData.append('title', 'Product Without Image');
    formData.append('unit_price', '10.0');
    formData.append('description', 'Sample description');

    try {
      await axios.post(`${baseUrl}/api/v1/products/ingest`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      expect.fail('Should have thrown 400 error');
    } catch (err: any) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.message).toContain('Missing product image file');
    }
  });
});
