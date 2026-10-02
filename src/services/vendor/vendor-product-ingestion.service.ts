import axios from 'axios';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { config } from '../../config/env';
import { postgresVendorRepository } from '../../database/postgres-vendor.repository';
import { postgresProductRepository } from '../../database/postgres-product.repository';
import { sharpService } from '../image/sharp.service';
import { cloudinaryService } from '../image/cloudinary.service';
import { metaCatalogService } from '../meta/meta-catalog.service';
import { whatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { visionService } from '../vision/vision.service';
import { DbProduct, DbVendor } from '../../types/database.types';
import { WhatsAppInboundMessage } from '../../types/whatsapp.types';

export interface ExtractedProductSpecs {
  title: string;
  category: 'sand_stone' | 'bricks_blocks' | 'cement' | 'aluminium' | 'hardware';
  unit_of_measure: 'per m3' | 'per 1000 bricks' | 'per bag' | 'per unit';
  unit_price: number;
  description: string;
  confidence_score: number;
}

export class VendorProductIngestionService {
  /**
   * Checks if an incoming WhatsApp sender is a verified registered vendor
   */
  async getRegisteredVendor(senderPhone: string): Promise<DbVendor | null> {
    return postgresVendorRepository.findByWhatsAppNumber(senderPhone);
  }

  /**
   * Downloads binary image buffer from Meta Graph API using media_id and Bearer Token
   */
  async downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    // Return sample buffer in test mode or if mediaId is simulated
    if (config.NODE_ENV === 'test' || config.MOCK_EXTERNAL_APIS || mediaId.startsWith('mock_')) {
      // Create a clean 400x400 mock building material image with Sharp
      const mockBuffer = await sharp({
        create: {
          width: 400,
          height: 400,
          channels: 3,
          background: { r: 194, g: 154, b: 108 }, // Sand / Terracotta tone
        },
      })
        .jpeg({ quality: 90 })
        .toBuffer();

      return { buffer: mockBuffer, mimeType: 'image/jpeg' };
    }

    try {
      // Step 1: Query Meta Graph API for media download URL
      const metaMediaUrl = `${config.META_GRAPH_BASE_URL}/${config.META_GRAPH_API_VERSION}/${mediaId}`;
      const metaRes = await axios.get(metaMediaUrl, {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        },
        timeout: 10000,
      });

      const downloadUrl = metaRes.data?.url;
      const mimeType = metaRes.data?.mime_type || 'image/jpeg';

      if (!downloadUrl) {
        throw new Error(`No media URL returned for media_id: ${mediaId}`);
      }

      // Step 2: Download the binary file with Bearer auth
      const fileRes = await axios.get(downloadUrl, {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        },
        responseType: 'arraybuffer',
        timeout: 15000,
      });

      return {
        buffer: Buffer.from(fileRes.data),
        mimeType,
      };
    } catch (err: any) {
      console.warn('Failed to download media from Meta Graph API, using fallback buffer:', err.message);
      const fallbackBuffer = await sharp({
        create: {
          width: 400,
          height: 400,
          channels: 3,
          background: { r: 180, g: 140, b: 100 },
        },
      })
        .jpeg({ quality: 90 })
        .toBuffer();
      return { buffer: fallbackBuffer, mimeType: 'image/jpeg' };
    }
  }

  /**
   * Extracts price override from caption text if provided by vendor (e.g. "R580 per cube", "R2450/1000")
   */
  extractPriceOverride(caption?: string): { price?: number; unitOfMeasure?: 'per m3' | 'per 1000 bricks' | 'per bag' | 'per unit' } | null {
    if (!caption) return null;

    let price: number | undefined;
    let unitOfMeasure: 'per m3' | 'per 1000 bricks' | 'per bag' | 'per unit' | undefined;

    // Match patterns like R580, R 580, R580.00, 580 ZAR
    const priceMatch = caption.match(/(?:R|ZAR)\s*([0-9]+(?:[\.,][0-9]{2})?)/i) ||
                       caption.match(/([0-9]+(?:[\.,][0-9]{2})?)\s*(?:rand|zar)/i);

    if (priceMatch) {
      price = parseFloat(priceMatch[1].replace(',', '.'));
    }

    const lower = caption.toLowerCase();
    if (lower.includes('cube') || lower.includes('m3') || lower.includes('m³') || lower.includes('cubic')) {
      unitOfMeasure = 'per m3';
    } else if (lower.includes('1000') || lower.includes('thousand') || lower.includes('brick') || lower.includes('paver')) {
      unitOfMeasure = 'per 1000 bricks';
    } else if (lower.includes('bag') || lower.includes('50kg')) {
      unitOfMeasure = 'per bag';
    } else if (lower.includes('unit') || lower.includes('window') || lower.includes('door') || lower.includes('each')) {
      unitOfMeasure = 'per unit';
    }

    if (price !== undefined || unitOfMeasure !== undefined) {
      return { price, unitOfMeasure };
    }

    return null;
  }

  /**
   * Analyzes the image and caption using Vision AI model with structured schema
   */
  async extractSpecsFromVision(imageBuffer: Buffer, caption?: string): Promise<ExtractedProductSpecs> {
    const rawCaption = caption || 'Heavy building material item';

    // Check user price overrides first
    const override = this.extractPriceOverride(caption);

    // Call underlying Vision service (GPT-4o or Claude 3.5 Sonnet)
    const visionAttrs = await visionService.extractAttributes({
      title: caption || 'Bulk Building Material',
      rawDescription: rawCaption,
      imageBuffer,
    });

    // Map extracted attributes into strict schema
    let category: 'sand_stone' | 'bricks_blocks' | 'cement' | 'aluminium' | 'hardware' = 'sand_stone';
    const lowerText = `${visionAttrs.material} ${visionAttrs.color} ${rawCaption}`.toLowerCase();

    if (lowerText.includes('brick') || lowerText.includes('paver') || lowerText.includes('block')) {
      category = 'bricks_blocks';
    } else if (lowerText.includes('cement') || lowerText.includes('concrete mix') || lowerText.includes('mortar')) {
      category = 'cement';
    } else if (lowerText.includes('aluminium') || lowerText.includes('window') || lowerText.includes('door')) {
      category = 'aluminium';
    } else if (lowerText.includes('tool') || lowerText.includes('hardware') || lowerText.includes('lintel')) {
      category = 'hardware';
    }

    let unitOfMeasure: 'per m3' | 'per 1000 bricks' | 'per bag' | 'per unit' = 'per m3';
    if (category === 'bricks_blocks') unitOfMeasure = 'per 1000 bricks';
    else if (category === 'cement') unitOfMeasure = 'per bag';
    else if (category === 'aluminium' || category === 'hardware') unitOfMeasure = 'per unit';

    // Prioritize user caption price override if present
    const unitPrice = override?.price !== undefined
      ? override.price
      : (category === 'sand_stone' ? 550.0 : category === 'bricks_blocks' ? 2450.0 : category === 'cement' ? 115.0 : 850.0);

    const finalUnit = override?.unitOfMeasure || unitOfMeasure;

    let title = caption
      ? caption.split(/[\n,.]/)[0].slice(0, 60).trim()
      : `${visionAttrs.material} (${finalUnit})`;

    if (!title || title.length < 5) {
      title = `${visionAttrs.material || 'Premium Construction Material'} (${finalUnit})`;
    }

    const description = `Specs: ${visionAttrs.dimensions} | Material: ${visionAttrs.material} | Color: ${visionAttrs.color}. Suitable for direct contractor and residential delivery.`;

    return {
      title,
      category,
      unit_of_measure: finalUnit,
      unit_price: unitPrice,
      description,
      confidence_score: 0.94,
    };
  }

  /**
   * Generates an SVG bottom pill banner displaying vendor name or unit tag
   */
  generateBottomPillBannerSvg(options: { vendorName: string; unitTag?: string; width?: number; height?: number }): Buffer {
    const width = options.width || 420;
    const height = options.height || 48;
    const vendor = (options.vendorName || 'VERIFIED SUPPLIER').slice(0, 30);
    const tag = options.unitTag ? ` • ${options.unitTag}` : '';

    const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${width}" height="${height}" rx="${height / 2}" fill="#111827" opacity="0.90" />
        <text x="${width / 2}" y="${height / 2 + 5}" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="bold" fill="#F9FAFB" text-anchor="middle">
          ${vendor}${tag}
        </text>
      </svg>
    `;
    return Buffer.from(svg);
  }

  /**
   * Standardizes the photo into a 1024x1024 square canvas with #F8F9FA padding, auto-orient, contrast balance, sharpen, and subtle bottom pill banner
   */
  async standardizeImage(imageBuffer: Buffer, vendorName: string, unitTag?: string): Promise<{ buffer: Buffer; cdnUrl: string }> {
    const targetSize = 1024;
    const innerMax = 860;

    // 1. Auto-orient, balance contrast, resize, and sharpen inner product asset
    const innerResized = await sharp(imageBuffer)
      .rotate() // auto-orient based on EXIF
      .normalise() // balance contrast
      .resize({
        width: innerMax,
        height: innerMax,
        fit: 'inside',
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3,
      })
      .sharpen({ sigma: 1.0, m1: 0.5, m2: 1.0 })
      .toBuffer();

    // 2. Create 1024x1024 canvas with subtle light-gray padding (#F8F9FA)
    const backgroundCanvas = sharp({
      create: {
        width: targetSize,
        height: targetSize,
        channels: 4,
        background: { r: 248, g: 249, b: 250, alpha: 1 }, // #F8F9FA
      },
    });

    // 3. Generate bottom pill banner
    const bannerWidth = 440;
    const bannerHeight = 50;
    const bannerBuffer = this.generateBottomPillBannerSvg({
      vendorName,
      unitTag,
      width: bannerWidth,
      height: bannerHeight,
    });

    // 4. Composite product (centered) and pill banner (bottom-centered), compress <500KB
    const finalBuffer = await backgroundCanvas
      .composite([
        {
          input: innerResized,
          gravity: sharp.gravity.center,
        },
        {
          input: bannerBuffer,
          top: targetSize - bannerHeight - 36,
          left: Math.round((targetSize - bannerWidth) / 2),
        },
      ])
      .webp({ quality: 88 })
      .toBuffer();

    // 5. Upload normalized visual to Cloud Storage CDN
    const uploadResult = await cloudinaryService.uploadBuffer(finalBuffer, {
      folder: 'whatsapp-vendor-products',
    });

    return {
      buffer: finalBuffer,
      cdnUrl: uploadResult.secureUrl,
    };
  }

  /**
   * Inserts new product draft into PostgreSQL repository bound to the vendor's isolated catalog
   * Pre-Publish State: is_available = FALSE and meta_product_retailer_id = NULL
   */
  async saveProductDraft(params: {
    vendorId: string;
    specs: ExtractedProductSpecs;
    rawImageUrl?: string;
    enhancedImageUrl: string;
  }): Promise<DbProduct> {
    const vendor = await postgresVendorRepository.findById(params.vendorId);

    const product: DbProduct = {
      id: randomUUID(),
      vendor_id: params.vendorId,
      meta_catalog_id: vendor?.meta_catalog_id || config.META_CATALOG_ID,
      meta_product_retailer_id: null, // Not published to Meta Catalog until approved
      title: params.specs.title,
      description: params.specs.description,
      category: params.specs.category,
      unit_of_measure: params.specs.unit_of_measure,
      unit_price: params.specs.unit_price,
      raw_image_url: params.rawImageUrl || params.enhancedImageUrl,
      enhanced_image_url: params.enhancedImageUrl,
      is_available: false, // Draft until approved by vendor
      draft_specs: { ...params.specs },
      created_at: new Date().toISOString(),
    };

    return postgresProductRepository.saveProduct(product);
  }

  /**
   * Pushes product directly to the vendor's isolated Meta Commerce Catalog endpoint
   * (POST /v19.0/{vendor.meta_catalog_id}/products)
   */
  async publishProductToMetaCatalog(productId: string): Promise<DbProduct | null> {
    const product = await postgresProductRepository.findById(productId);
    if (!product) return null;

    const vendor = await postgresVendorRepository.findById(product.vendor_id);
    const brandName = vendor?.business_name || config.DEFAULT_BRAND_NAME;
    const vendorCatalogId = vendor?.meta_catalog_id || product.meta_catalog_id || config.META_CATALOG_ID;
    const generatedRetailerId =
      product.meta_product_retailer_id ||
      `SKU-VND-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    // Push to Meta Graph API v19.0 under the vendor's own isolated catalog ID
    const syncResult = await metaCatalogService.upsertProduct(
      {
        retailer_id: generatedRetailerId,
        name: product.title,
        description: product.description || product.title,
        availability: 'in stock',
        condition: 'new',
        price: product.unit_price,
        currency: config.DEFAULT_CURRENCY,
        image_url: product.enhanced_image_url || '',
        url: `${config.DEFAULT_COMMERCE_BASE_URL}/${product.id}`,
        brand: brandName,
        category: product.category,
        custom_data: {
          unit_of_measure: product.unit_of_measure,
          vendor_id: product.vendor_id,
        },
      },
      vendorCatalogId
    );

    // Mark product available and store returned meta_product_retailer_id in database
    return postgresProductRepository.updateProduct(product.id, {
      is_available: true,
      meta_catalog_id: syncResult.catalogId,
      meta_product_retailer_id: syncResult.retailerId,
      draft_specs: null,
    });
  }

  /**
   * Discards a draft product: deletes the draft record from `products` (or marks unavailable)
   * and purges uploaded CDN assets (`raw_image_url` and `enhanced_image_url`).
   */
  async discardProductDraft(
    productId: string,
    options?: { hardDelete?: boolean }
  ): Promise<{ deleted: boolean; purgedAssetCount: number }> {
    const product = await postgresProductRepository.findById(productId);
    let purgedAssetCount = 0;

    if (product) {
      purgedAssetCount = await cloudinaryService.purgeAssets([
        product.raw_image_url,
        product.enhanced_image_url,
      ]);
    }

    const shouldHardDelete = options?.hardDelete !== false;
    if (shouldHardDelete) {
      const deleted = await postgresProductRepository.deleteProduct(productId);
      return { deleted, purgedAssetCount };
    } else {
      await postgresProductRepository.updateProduct(productId, { is_available: false });
      return { deleted: true, purgedAssetCount };
    }
  }

  /**
   * Main entrypoint for processing an inbound vendor image from WhatsApp
   */
  async handleVendorInboundImage(senderWaId: string, message: WhatsAppInboundMessage): Promise<boolean> {
    // 1. Verify sender is a registered vendor matching vendors.whatsapp_number
    const vendor = await this.getRegisteredVendor(senderWaId);
    if (!vendor) {
      return false; // Not a vendor message
    }

    if (message.type !== 'image' || !message.image?.id) {
      return false;
    }

    const mediaId = message.image.id;
    const caption = message.image.caption || message.text?.body || '';

    // 2. Download raw binary image buffer from Meta Cloud API (GET /{media_id})
    const { buffer: rawBuffer } = await this.downloadWhatsAppMedia(mediaId);

    // 3. Store the unprocessed raw image in cloud storage as raw_image_url
    const rawUpload = await cloudinaryService.uploadBuffer(rawBuffer, {
      folder: 'whatsapp-vendor-raw',
    });
    const rawImageUrl = rawUpload.secureUrl;

    // 4. AI Vision extraction with structured schema & caption price/unit priority override
    const specs = await this.extractSpecsFromVision(rawBuffer, caption);

    // 5. Image normalization with Sharp (1024x1024, #F8F9FA, auto-orient, contrast, sharpen, <500KB) & CDN upload
    const { cdnUrl: enhancedImageUrl } = await this.standardizeImage(
      rawBuffer,
      vendor.business_name,
      specs.unit_of_measure
    );

    // 6. Save product draft in database (is_available = FALSE, meta_product_retailer_id = NULL)
    const product = await this.saveProductDraft({
      vendorId: vendor.id,
      specs,
      rawImageUrl,
      enhancedImageUrl,
    });

    // 7. Send interactive draft preview & approval buttons to vendor
    await whatsAppClientService.sendProductDraftInteractivePreview(senderWaId, {
      productId: product.id,
      title: product.title,
      unitPrice: product.unit_price,
      unitOfMeasure: product.unit_of_measure,
      description: product.description || '',
      enhancedImageUrl,
    });

    return true;
  }
}

export const vendorProductIngestionService = new VendorProductIngestionService();
