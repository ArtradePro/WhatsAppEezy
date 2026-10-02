import { describe, it, expect } from 'vitest';
import { visionService } from '../src/services/vision/vision.service';

describe('VisionService AI Extraction', () => {
  it('should extract standardized attributes [Dimensions, Material, Unit of Measure, Color] from raw input', async () => {
    const rawInput = {
      title: 'Terracotta Facing Bricks Solid Red',
      rawDescription:
        'High density kiln-fired clay facing bricks measuring 222mm x 106mm x 73mm. Sold per 1000 bricks in pallets of 500. Rich terracotta red finish with smooth texture.',
    };

    const attributes = await visionService.extractAttributes(rawInput);

    expect(attributes).toBeDefined();
    expect(attributes.dimensions).toContain('222mm x 106mm x 73mm');
    expect(attributes.material).toContain('Clay');
    expect(attributes.unitOfMeasure).toContain('per 1000 bricks');
    expect(attributes.color).toContain('Terracotta Red');
    expect(attributes.confidenceScore).toBeGreaterThan(0.5);
    expect(attributes.enrichedTitle).toBeDefined();
    expect(attributes.enrichedDescription).toContain('Standardized Specifications:');
  });

  it('should extract volumetric unit of measure like per m3', async () => {
    const rawInput = {
      title: 'Crushed Granite Sub-base Aggregate',
      rawDescription:
        'Pre-washed crushed natural granite aggregate G1 base coarse for heavy road paving. Priced per m3. Natural charcoal gray stone.',
    };

    const attributes = await visionService.extractAttributes(rawInput);

    expect(attributes.material).toContain('Granite');
    expect(attributes.unitOfMeasure).toBe('per m3');
    expect(attributes.color).toBe('Charcoal Gray');
  });
});
