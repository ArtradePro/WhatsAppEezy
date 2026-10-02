import { describe, it, expect } from 'vitest';
import { createFastifyApp } from '../src/fastify-app';
import { openAiBridgeService } from '../src/services/ai/openai-bridge.service';

describe('OpenAI GPT-4o Cross-Build & Multi-Tenant Operations Bridge', () => {
  it('1. GET /api/v1/ai/status returns bridge status and 3-tier MoR arbitrage comparison', async () => {
    const app = createFastifyApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ai/status',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.bridge).toBeDefined();
    expect(body.defaultTierArbitrage.tiers).toHaveLength(3);
    expect(body.defaultTierArbitrage.tiers.map((t: any) => t.tier)).toEqual([
      'starter',
      'pro',
      'enterprise',
    ]);

    await app.close();
  });

  it('2. POST /api/v1/ai/configure-key sets and masks runtime OpenAI API key override', async () => {
    const app = createFastifyApp();
    await app.ready();

    const setRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/configure-key',
      payload: {
        apiKey: 'sk-proj-test1234567890abcdef',
      },
    });

    expect(setRes.statusCode).toBe(200);
    const setBody = setRes.json();
    expect(setBody.success).toBe(true);
    expect(setBody.bridge.configured).toBe(true);
    expect(setBody.bridge.source).toBe('ui-override');
    expect(setBody.bridge.maskedKey).toBe('sk-proj...cdef');

    // Clear runtime key override so subsequent tests use deterministic fallback without network calls
    openAiBridgeService.setRuntimeApiKey('');
    await app.close();
  });

  it('3. POST /api/v1/ai/bridge executes REVENUE_ARBITRAGE_ADVISOR and returns tier comparison math', async () => {
    const app = createFastifyApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/bridge',
      payload: {
        taskType: 'REVENUE_ARBITRAGE_ADVISOR',
        prompt: 'Analyze R400,000 monthly GMV across 80 orders and recommend best SaaS tier',
        context: {
          monthlyGmvZar: 400000,
          monthlyOrderCount: 80,
          subscriptionTier: 'starter',
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.taskType).toBe('REVENUE_ARBITRAGE_ADVISOR');
    expect(body.tierComparison).toHaveLength(3);

    const starter = body.tierComparison.find((t: any) => t.tier === 'starter');
    const enterprise = body.tierComparison.find((t: any) => t.tier === 'enterprise');
    expect(enterprise.netVendorRetentionZar).toBeGreaterThan(starter.netVendorRetentionZar);

    await app.close();
  });

  it('4. POST /api/v1/ai/bridge executes CATALOG_PRODUCT_GENERATOR and extracts structured SKU', async () => {
    const app = createFastifyApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/bridge',
      payload: {
        taskType: 'CATALOG_PRODUCT_GENERATOR',
        prompt: 'Washed Malmesbury Plaster Sand R580 per cube',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.generatedProduct).toBeDefined();
    expect(body.generatedProduct.unit_price).toBe(580);
    expect(body.generatedProduct.category).toBe('sand_stone');
    expect(body.generatedProduct.meta_retailer_id).toMatch(/^MAT-[A-Z0-9-]+$/i);

    await app.close();
  });

  it('5. POST /api/v1/ai/bridge executes UI_COBUILDER_ARCHITECT and returns React/Tailwind codeArtifact', async () => {
    const app = createFastifyApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/bridge',
      payload: {
        taskType: 'UI_COBUILDER_ARCHITECT',
        prompt: 'Generate an ArbitrageYieldBadge React component',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.codeArtifact).toContain('ArbitrageYieldBadge');

    await app.close();
  });
});
