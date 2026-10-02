import { Request, Response, NextFunction } from 'express';
import { productRepository } from '../services/db/product-repository';
import { metaCatalogService } from '../services/meta/meta-catalog.service';

export class CatalogController {
  async listProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const products = await productRepository.findAll();
      res.json({
        success: true,
        count: products.length,
        products,
      });
    } catch (error) {
      next(error);
    }
  }

  async getProductById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      const product = (await productRepository.findById(id)) || (await productRepository.findByRetailerId(id));

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
    } catch (error) {
      next(error);
    }
  }

  async resyncProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
      const product = await productRepository.findById(id);

      if (!product) {
        res.status(404).json({
          success: false,
          error: 'NotFound',
          message: `Product with ID '${id}' was not found.`,
        });
        return;
      }

      // Re-trigger Meta sync
      const metaSync = await metaCatalogService.upsertProduct({
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

      const updated = await productRepository.update(product.id, {
        status: metaSync.syncStatus === 'SYNCED' ? 'SYNCED' : 'FAILED',
        metaSync,
      });

      res.json({
        success: metaSync.syncStatus === 'SYNCED',
        product: updated,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const catalogController = new CatalogController();
