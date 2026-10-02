import { StandardizedAttributes } from './attributes.types';
import { MetaCatalogSyncResult } from './meta.types';

export interface IngestionInputDTO {
  title: string;
  unitPrice: number;
  currency?: string;
  description: string;
  supplierId?: string;
  retailerId?: string;
  brand?: string;
  category?: string;
  condition?: 'new' | 'refurbished' | 'used';
  availability?: 'in stock' | 'out of stock' | 'preorder' | 'available for order';
}

export interface IngestionResponseDTO {
  success: boolean;
  message: string;
  productId: string;
  retailerId: string;
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  images: {
    originalUrl: string;
    backgroundRemovedUrl: string;
    enhancedUrl: string;
    aspectRatio: string;
    resolution: string;
  };
  extractedAttributes: StandardizedAttributes;
  metaSync: MetaCatalogSyncResult;
  whatsappCatalogDetails: {
    catalogId: string;
    liveProductId: string;
    whatsappDeepLink: string;
    syncedAt: string;
  };
  processingDurationMs: number;
}
