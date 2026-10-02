export type FulfillmentStatus = 'PENDING_DISPATCH' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export interface FulfillmentMetrics {
  pendingDispatch: number;
  inTransit: number;
  delivered: number;
  cancelled: number;
  totalFulfillments: number;
  fulfillmentRatePercentage: number;
}

export interface AIQueryMetrics {
  totalCustomerInquiries: number;
  aiResolvedWithoutEscalation: number;
  humanEscalated: number;
  resolutionRatePercentage: number;
  averageConfidenceScore: number;
}

export interface LiveDashboardKPIs {
  tenantId?: string; // undefined represents aggregate platform metrics
  tenantName?: string;
  period: 'live' | 'today' | '7d' | '30d' | 'all_time';

  /** Total Gross Merchandise Value processed */
  grossMerchandiseValue: number;

  /** Total net platform commission retained */
  netCommissionRetained: number;

  /** Total gross freight & delivery revenue */
  totalFreightRevenue: number;

  /** Successful Payment Conversion stats */
  totalCheckoutsInitiated: number;
  successfulPaymentConversions: number;
  conversionRatePercentage: number;

  /** Average transaction order value */
  averageOrderValue: number;

  /** Delivery fulfillment breakdown */
  fulfillmentStatus: FulfillmentMetrics;

  /** AI Vision and State Machine query resolution efficiency */
  aiQueryResolution: AIQueryMetrics;

  generatedAt: string;
}
