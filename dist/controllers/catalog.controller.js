"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalogController = exports.CatalogController = void 0;
const product_repository_1 = require("../services/db/product-repository");
const meta_catalog_service_1 = require("../services/meta/meta-catalog.service");
class CatalogController {
    async listProducts(req, res, next) {
        try {
            const products = await product_repository_1.productRepository.findAll();
            res.json({
                success: true,
                count: products.length,
                products,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getProductById(req, res, next) {
        try {
            const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
            const product = (await product_repository_1.productRepository.findById(id)) || (await product_repository_1.productRepository.findByRetailerId(id));
            if (!product) {
                res.status(404).json({
                    success: false,
                    error: 'NotFound',
                    message: `Product with ID or SKU '${id}' was not found.`,
                });
                return;
            }
            res.json({
                success: true,
                product,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async resyncProduct(req, res, next) {
        try {
            const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
            const product = await product_repository_1.productRepository.findById(id);
            if (!product) {
                res.status(404).json({
                    success: false,
                    error: 'NotFound',
                    message: `Product with ID '${id}' was not found.`,
                });
                return;
            }
            // Re-trigger Meta sync
            const metaSync = await meta_catalog_service_1.metaCatalogService.upsertProduct({
                retailer_id: product.retailerId,
                name: product.attributes.enrichedTitle,
                description: product.attributes.enrichedDescription,
                availability: 'in stock',
                condition: 'new',
                price: product.unitPrice,
                currency: product.currency,
                image_url: product.images.enhancedUrl,
                url: product.metaSync?.whatsAppCommerceUrl || `https://wa.me/c/product/${product.retailerId}`,
                brand: product.brand,
                custom_data: {
                    dimensions: product.attributes.dimensions,
                    material: product.attributes.material,
                    unit_of_measure: product.attributes.unitOfMeasure,
                    color: product.attributes.color,
                    supplier_id: product.supplierId,
                },
            });
            const updated = await product_repository_1.productRepository.update(product.id, {
                status: metaSync.syncStatus === 'SYNCED' ? 'SYNCED' : 'FAILED',
                metaSync,
            });
            res.json({
                success: metaSync.syncStatus === 'SYNCED',
                product: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.CatalogController = CatalogController;
exports.catalogController = new CatalogController();
//# sourceMappingURL=catalog.controller.js.map