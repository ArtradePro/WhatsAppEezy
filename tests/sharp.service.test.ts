import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { sharpService } from '../src/services/image/sharp.service';
import { generateCornerBrandingSvg } from '../src/assets/corner-branding';

describe('SharpService Image Processing Pipeline', () => {
  it('should generate valid corner branding SVG badge buffer', () => {
    const svgBuffer = generateCornerBrandingSvg({
      brandName: 'BrickDirect Pro',
      badgeLabel: 'VERIFIED SUPPLIER',
    });

    expect(svgBuffer).toBeInstanceOf(Buffer);
    const svgContent = svgBuffer.toString('utf-8');
    expect(svgContent).toContain('<svg');
    expect(svgContent).toContain('BRICKDIRECT PRO');
    expect(svgContent).toContain('VERIFIED SUPPLIER');
  });

  it('should resize, center, and output exact 1024x1024 white padded canvas with corner branding', async () => {
    // Generate a test raw input image with non-square aspect ratio (e.g. 500x300)
    const testInputBuffer = await sharp({
      create: {
        width: 500,
        height: 300,
        channels: 4,
        background: { r: 180, g: 50, b: 30, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const resultBuffer = await sharpService.processCanvas(testInputBuffer, {
      targetWidth: 1024,
      targetHeight: 1024,
      innerMaxDimension: 880,
      brandName: 'CARGODASH',
      cornerPosition: 'top-right',
    });

    expect(resultBuffer).toBeInstanceOf(Buffer);
    expect(resultBuffer.length).toBeGreaterThan(0);

    const meta = await sharp(resultBuffer).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
    expect(meta.format).toBe('jpeg');
  });
});
