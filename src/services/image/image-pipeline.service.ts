import { sharpService } from './sharp.service';
import { cloudinaryService } from './cloudinary.service';
import { CanvasProcessingOptions, ImageProcessingResult } from '../../types/image.types';

export class ImagePipelineService {
  /**
   * Complete image processing lifecycle:
   * 1. Inspect original image buffer
   * 2. Upload raw image to Cloudinary
   * 3. Apply background removal (via Cloudinary AI)
   * 4. Downstream processing via Sharp.js:
   *    - Center product inside 1024x1024 canvas
   *    - Apply pure white background (#FFFFFF)
   *    - Upscale / sharpen image resolution
   *    - Overlay standard corner branding badge
   * 5. Upload master commerce asset to Cloudinary
   * 6. Return all asset URLs and metadata
   */
  async processProductImage(
    rawBuffer: Buffer,
    retailerId: string,
    options: CanvasProcessingOptions = {}
  ): Promise<ImageProcessingResult> {
    // Step 1: Read metadata of original upload
    const meta = await sharpService.getImageMetadata(rawBuffer);
    const originalMeta = {
      format: meta.format || 'unknown',
      width: meta.width || 0,
      height: meta.height || 0,
      sizeBytes: rawBuffer.length,
    };

    // Step 2: Upload raw asset to Cloudinary
    const rawUpload = await cloudinaryService.uploadImage(rawBuffer, {
      publicId: `raw_${retailerId}_${Date.now()}`,
      removeBackground: false,
    });

    // Step 3: Trigger Cloudinary AI Background Removal
    const bgRemovedUpload = await cloudinaryService.uploadImage(rawBuffer, {
      publicId: `bg_removed_${retailerId}_${Date.now()}`,
      removeBackground: true,
    });

    // Step 4: Obtain transparent buffer for local Sharp compositing
    let transparentBuffer: Buffer = rawBuffer;
    if (bgRemovedUpload.bgRemovedUrl && !bgRemovedUpload.bgRemovedUrl.includes('mock-cloud')) {
      try {
        transparentBuffer = await cloudinaryService.downloadImageBuffer(bgRemovedUpload.bgRemovedUrl);
      } catch (err) {
        // Fallback to local raw buffer if remote download fails
        transparentBuffer = rawBuffer;
      }
    }

    // Step 5: Run Sharp.js Canvas Centering + Upscale + 1024x1024 White Padding + Corner Branding
    const enhancedBuffer = await sharpService.processCanvas(transparentBuffer, {
      targetWidth: 1024,
      targetHeight: 1024,
      innerMaxDimension: 880,
      backgroundColor: { r: 255, g: 255, b: 255, alpha: 1 },
      brandName: options.brandName || 'WHATSAPPEEZY',
      cornerPosition: options.cornerPosition || 'top-right',
    });

    // Step 6: Upload Final Enhanced Master Asset to Cloudinary
    const enhancedUpload = await cloudinaryService.uploadImage(enhancedBuffer, {
      publicId: `master_1024_${retailerId}_${Date.now()}`,
      removeBackground: false,
    });

    return {
      originalBuffer: rawBuffer,
      originalMeta,
      originalUrl: rawUpload.secureUrl,
      backgroundRemovedUrl: bgRemovedUpload.bgRemovedUrl,
      enhancedBuffer,
      enhancedUrl: enhancedUpload.secureUrl,
      finalDimensions: {
        width: 1024,
        height: 1024,
      },
    };
  }
}

export const imagePipelineService = new ImagePipelineService();
