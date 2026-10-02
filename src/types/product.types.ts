import { StandardizedAttributes } from './attributes.types';
import { MetaCatalogSyncResult } from './meta.types';

export type IngestionStatus = 'PENDING' | 'IMAGE_PROCESSED' | 'VISION_EXTRACTED' | 'SYNCED' | 'FAILED';

export interface ProductRecord {
  id: string;
  retailerId: string;
  supplierId: string;
  originalTitle: string;
  originalDescription: string;
  unitPrice: number;
  currency: string;
  brand: string;
  status: IngestionStatus;

  // Image assets
  images: {
    originalUrl: string;
    backgroundRemovedUrl: string;
    enhancedUrl: string;
    width: number;
    height: number;
  };

  // Standardized AI vision attributes
  attributes: StandardizedAttributes;

  // Meta Commerce sync details
  metaSync?: MetaCatalogSyncResult;

  errorLog?: string;
  createdAt: string;
  updatedAt: string;
}
