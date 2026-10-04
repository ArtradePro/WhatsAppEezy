"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestionOrchestrator = exports.IngestionOrchestrator = void 0;
const crypto_1 = require("crypto");
const image_pipeline_service_1 = require("../image/image-pipeline.service");
const vision_service_1 = require("../vision/vision.service");
const meta_catalog_service_1 = require("../meta/meta-catalog.service");
const product_repository_1 = require("../db/product-repository");
const env_1 = require("../../config/env");
class IngestionOrchestrator {
    /**
     * Orchestrates the complete automated asset processing & catalog sync pipeline
     */
    async ingestSupplierProduct(imageBuffer, fileMetadata, input) {
        const startTime = Date.now();
        const productId = `prod_${(0, crypto_1.randomUUID)()}`;
        const retailerId = input.retailerId || `SKU-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
        const brand = input.brand || env_1.config.DEFAULT_BRAND_NAME;
        const currency = input.currency || env_1.config.DEFAULT_CURRENCY;
        // STEP 1: Image Processing Pipeline (Sharp + Cloudinary AI bg-removal, 1024x1024 white canvas & corner branding)
        const imageResult = await image_pipeline_service_1.imagePipelineService.processProductImage(imageBuffer, retailerId, {
            brandName: brand,
            cornerPosition: 'top-right',
        });
        // STEP 2: AI Vision Model (GPT-4o or Claude 3.5 Sonnet) Attribute Extraction
        // Extracts: [Dimensions, Material, Unit of Measure, Color]
        const extractedAttributes = await vision_service_1.visionService.extractAttributes({
            title: input.title,
            rawDescription: input.description,
            imageBuffer: imageResult.enhancedBuffer,
            imageUrl: imageResult.enhancedUrl,
            mimeType: fileMetadata.mimetype,
        });
        // STEP 3: Meta Commerce Integration (Meta Graph API v19.0)
        const metaPayload = {
            retailer_id: retailerId,
            name: extractedAttributes.enrichedTitle || input.title,
            description: extractedAttributes.enrichedDescription || input.description,
            availability: input.availability || 'in stock',
            condition: input.condition || 'new',
            price: input.unitPrice,
            currency,
            image_url: imageResult.enhancedUrl,
            url: `${env_1.config.DEFAULT_COMMERCE_BASE_URL}/${retailerId}`,
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
        const metaSync = await meta_catalog_service_1.metaCatalogService.upsertProduct(metaPayload);
        // STEP 4: Persist structured record to Database
        const productRecord = {
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
        await product_repository_1.productRepository.save(productRecord);
        const duration = Date.now() - startTime;
        return {
            success: metaSync.syncStatus === 'SYNCED',
            message: metaSync.syncStatus === 'SYNCED'
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
exports.IngestionOrchestrator = IngestionOrchestrator;
exports.ingestionOrchestrator = new IngestionOrchestrator();
//# sourceMappingURL=ingestion-orchestrator.js.map