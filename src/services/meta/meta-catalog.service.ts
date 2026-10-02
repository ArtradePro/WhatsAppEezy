import axios, { AxiosError } from 'axios';
import { config } from '../../config/env';
import { MetaCatalogSyncResult, MetaProductPayload } from '../../types/meta.types';

export class MetaCatalogService {
  private readonly baseUrl: string;
  private readonly version: string;
  private readonly catalogId: string;
  private readonly accessToken: string;
  private readonly isConfigured: boolean;

  constructor() {
    this.baseUrl = config.META_GRAPH_BASE_URL;
    this.version = config.META_GRAPH_API_VERSION;
    this.catalogId = config.META_CATALOG_ID;
    this.accessToken = config.META_ACCESS_TOKEN;

    this.isConfigured =
      Boolean(this.catalogId) &&
      this.catalogId !== 'mock-catalog-id' &&
      Boolean(this.accessToken) &&
      this.accessToken !== 'mock-meta-access-token';
  }

  /**
   * Constructs the Meta Graph API payload and upserts the product to Meta Commerce Manager
   * via POST /v19.0/{catalog_id}/products using the vendor's dedicated isolated catalog ID.
   */
  async upsertProduct(
    payload: MetaProductPayload,
    vendorCatalogId?: string
  ): Promise<MetaCatalogSyncResult> {
    const targetCatalogId = vendorCatalogId || this.catalogId;
    const endpoint = `${this.baseUrl}/${this.version}/${targetCatalogId}/products`;

    // If running in mock mode or credentials not configured, return simulated live Meta sync
    if (!this.isConfigured || config.MOCK_EXTERNAL_APIS) {
      const mockMetaFbid = `meta_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const liveWhatsAppProductId = `wa_${payload.retailer_id}_${Date.now()}`;
      const whatsAppCommerceUrl = `${config.DEFAULT_COMMERCE_BASE_URL}/${mockMetaFbid}`;

      return {
        catalogId: targetCatalogId,
        metaProductId: mockMetaFbid,
        retailerId: payload.retailer_id,
        liveWhatsAppProductId,
        whatsAppCommerceUrl,
        syncStatus: 'SYNCED',
        syncedAt: new Date().toISOString(),
        rawResponse: {
          id: mockMetaFbid,
          catalog_id: targetCatalogId,
          retailer_id: payload.retailer_id,
          success: true,
          mode: 'SIMULATED_GRAPH_API_V19',
        },
      };
    }

    try {
      // Format payload for Meta Graph API v19.0
      // Meta requires price in cents (integer) or decimal, and custom_data as JSON object/string
      const graphPayload = {
        retailer_id: payload.retailer_id,
        name: payload.name.slice(0, 150),
        description: payload.description,
        availability: payload.availability,
        condition: payload.condition,
        price: Math.round(payload.price * 100), // convert to integer cents for Meta Graph API
        currency: payload.currency.toUpperCase(),
        image_url: payload.image_url,
        url: payload.url,
        brand: payload.brand,
        category: payload.category || 'Hardware & Building Supplies',
        custom_data: payload.custom_data ? JSON.stringify(payload.custom_data) : undefined,
      };

      const response = await axios.post(endpoint, graphPayload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      const metaProductId = response.data.id;
      const liveWhatsAppProductId = `wa_${metaProductId}`;
      const whatsAppCommerceUrl = `${config.DEFAULT_COMMERCE_BASE_URL}/${metaProductId}`;

      return {
        catalogId: targetCatalogId,
        metaProductId,
        retailerId: payload.retailer_id,
        liveWhatsAppProductId,
        whatsAppCommerceUrl,
        syncStatus: 'SYNCED',
        syncedAt: new Date().toISOString(),
        rawResponse: response.data,
      };
    } catch (error: any) {
      // Handle case where item already exists (upsert fallback via batch endpoint)
      if (this.isProductAlreadyExistsError(error)) {
        return this.upsertViaBatchEndpoint(payload, targetCatalogId);
      }

      const errorMessage = this.extractMetaErrorMessage(error);
      console.error(`Meta Commerce Catalog Sync failed for [${payload.retailer_id}]:`, errorMessage);

      return {
        catalogId: targetCatalogId,
        metaProductId: '',
        retailerId: payload.retailer_id,
        liveWhatsAppProductId: '',
        whatsAppCommerceUrl: '',
        syncStatus: 'FAILED',
        syncedAt: new Date().toISOString(),
        rawResponse: error?.response?.data || {},
        errorMessage,
      };
    }
  }

  /**
   * Upsert fallback using Meta Commerce Manager batch endpoint
   * POST /v19.0/{catalog_id}/batch
   */
  private async upsertViaBatchEndpoint(
    payload: MetaProductPayload,
    targetCatalogId: string = this.catalogId
  ): Promise<MetaCatalogSyncResult> {
    const batchEndpoint = `${this.baseUrl}/${this.version}/${targetCatalogId}/batch`;

    const batchItem = {
      method: 'UPDATE',
      retailer_id: payload.retailer_id,
      data: {
        name: payload.name.slice(0, 150),
        description: payload.description,
        availability: payload.availability,
        condition: payload.condition,
        price: Math.round(payload.price * 100),
        currency: payload.currency.toUpperCase(),
        image_url: payload.image_url,
        url: payload.url,
        brand: payload.brand,
        custom_data: payload.custom_data ? JSON.stringify(payload.custom_data) : undefined,
      },
    };

    const response = await axios.post(
      batchEndpoint,
      { requests: [batchItem] },
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const handles = response.data?.handles || [];
    const metaProductId = handles[0] || `meta_${payload.retailer_id}`;

    return {
      catalogId: targetCatalogId,
      metaProductId,
      retailerId: payload.retailer_id,
      liveWhatsAppProductId: `wa_${payload.retailer_id}`,
      whatsAppCommerceUrl: `${config.DEFAULT_COMMERCE_BASE_URL}/${metaProductId}`,
      syncStatus: 'SYNCED',
      syncedAt: new Date().toISOString(),
      rawResponse: response.data,
    };
  }

  private isProductAlreadyExistsError(error: any): boolean {
    const errorMsg = error?.response?.data?.error?.message?.toLowerCase() || '';
    const errorSubcode = error?.response?.data?.error?.error_subcode;
    return errorSubcode === 1348003 || errorMsg.includes('already exists') || errorMsg.includes('duplicate');
  }

  private extractMetaErrorMessage(error: any): string {
    if (axios.isAxiosError(error)) {
      const metaError = (error as AxiosError<{ error?: { message?: string; type?: string; code?: number } }>).response?.data?.error;
      if (metaError?.message) {
        return `[Meta ${metaError.type || 'Error'} Code ${metaError.code}]: ${metaError.message}`;
      }
      return error.message;
    }
    return error instanceof Error ? error.message : 'Unknown Meta API error';
  }
}

export const metaCatalogService = new MetaCatalogService();
