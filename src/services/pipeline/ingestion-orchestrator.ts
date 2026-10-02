import { randomUUID } from 'crypto';
import { imagePipelineService } from '../image/image-pipeline.service';
import { visionService } from '../vision/vision.service';
import { metaCatalogService } from '../meta/meta-catalog.service';
import { productRepository } from '../db/product-repository';
import { IngestionInputDTO, IngestionResponseDTO } from '../../types/ingestion.types';
import { MetaProductPayload } from '../../types/meta.types';
import { ProductRecord } from '../../types/product.types';
import { config } from '../../config/env';

export class IngestionOrchestrator {
  /**
   * Orchestrates the complete automated asset processing & catalog sync pipeline
   */
  async ingestSupplierProduct(
    imageBuffer: Buffer,
    fileMetadata: { originalname: string; mimetype: string; size: number },
    input: IngestionInputDTO
  ): Promise<IngestionResponseDTO> {
    const startTime = Date.now();
    const productId = `prod_${randomUUID()}`;
    const retailerId = input.retailerId || `SKU-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    const brand = input.brand || config.DEFAULT_BRAND_NAME;
    const currency = input.currency || config.DEFAULT_CURRENCY;

    // STEP 1: Image Processing Pipeline (Sharp + Cloudinary AI bg-removal, 1024x1024 white canvas & corner branding)
    const imageResult = await imagePipelineService.processProductImage(imageBuffer, retailerId, {
      brandName: brand,
      cornerPosition: 'top-right',
    });

    // STEP 2: AI Vision Model (GPT-4o or Claude 3.5 Sonnet) Attribute Extraction
    // Extracts: [Dimensions, Material, Unit of Measure, Color]
    const extractedAttributes = await visionService.extractAttributes({
      title: input.title,
      rawDescription: input.description,
      imageBuffer: imageResult.enhancedBuffer,
      imageUrl: imageResult.enhancedUrl,
      mimeType: fileMetadata.mimetype,
    });

    // STEP 3: Meta Commerce Integration (Meta Graph API v19.0)
    const metaPayload: MetaProductPayload = {
      retailer_id: retailerId,
      name: extractedAttributes.enrichedTitle || input.title,
      description: extractedAttributes.enrichedDescription || input.description,
      availability: input.availability || 'in stock',
      condition: input.condition || 'new',
      price: input.unitPrice,
      currency,
      image_url: imageResult.enhancedUrl,
      url: `${config.DEFAULT_COMMERCE_BASE_URL}/${retailerId}`,
      brand,
      category: input.category || extractedAttributes.suggestedCategory,
      custom_data: {
        dimensions: extractedAttributes.dimensions,
        material: extractedAttributes.material,
        unit_of_measure: extractedAttributes.unitOfMeasure,
        color: extractedAttributes.color,
        supplier_id: input.supplierId,
      },
    };

    // Upsert directly to Meta Commerce Manager Catalog endpoint via POST /v19.0/{catalog_id}/products
    const metaSync = await metaCatalogService.upsertProduct(metaPayload);

    // STEP 4: Persist structured record to Database
    const productRecord: ProductRecord = {
      id: productId,
      retailerId,
      supplierId: input.supplierId || 'supplier_default',
      originalTitle: input.title,
      originalDescription: input.description,
      unitPrice: input.unitPrice,
      currency,
      brand,
      status: metaSync.syncStatus === 'SYNCED' ? 'SYNCED' : 'FAILED',
      images: {
        originalUrl: imageResult.originalUrl,
        backgroundRemovedUrl: imageResult.backgroundRemovedUrl,
        enhancedUrl: imageResult.enhancedUrl,
        width: imageResult.finalDimensions.width,
        height: imageResult.finalDimensions.height,
      },
      attributes: extractedAttributes,
      metaSync,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await productRepository.save(productRecord);

    const duration = Date.now() - startTime;

    return {
      success: metaSync.syncStatus === 'SYNCED',
      message:
        metaSync.syncStatus === 'SYNCED'
          ? 'Product successfully ingested, enhanced, and synced to WhatsApp Commerce Catalog'
          : `Product ingested and enhanced, but Meta Commerce Catalog sync reported an issue: ${metaSync.errorMessage}`,
      productId,
      retailerId,
      status: metaSync.syncStatus === 'SYNCED' ? 'SUCCESS' : 'PARTIAL_SUCCESS',
      images: {
        originalUrl: imageResult.originalUrl,
        backgroundRemovedUrl: imageResult.backgroundRemovedUrl,
        enhancedUrl: imageResult.enhancedUrl,
        aspectRatio: '1:1',
        resolution: '1024x1024',
      },
      extractedAttributes,
      metaSync,
      whatsappCatalogDetails: {
        catalogId: metaSync.catalogId,
        liveProductId: metaSync.liveWhatsAppProductId,
        whatsappDeepLink: metaSync.whatsAppCommerceUrl,
        syncedAt: metaSync.syncedAt,
      },
      processingDurationMs: duration,
    };
  }
}

export const ingestionOrchestrator = new IngestionOrchestrator();
