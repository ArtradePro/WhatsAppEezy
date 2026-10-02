import { describe, it, expect } from 'vitest';
import { metricsService } from '../src/services/metrics/metrics.service';

describe('Multi-Tenant Metrics Engine', () => {
  it('should compute live KPIs: GMV, net commission, conversion rate, fulfillment, and AI resolution', async () => {
    const kpis = await metricsService.getDashboardKPIs(undefined, 'live');

    expect(kpis).toBeDefined();
    expect(kpis.grossMerchandiseValue).toBeGreaterThan(0);
    expect(kpis.netCommissionRetained).toBeGreaterThan(0);
    expect(kpis.totalFreightRevenue).toBeGreaterThan(0);
    expect(kpis.successfulPaymentConversions).toBeGreaterThan(0);
    expect(kpis.conversionRatePercentage).toBeGreaterThan(0);
    expect(kpis.averageOrderValue).toBeGreaterThan(0);

    // Delivery fulfillment breakdown
    expect(kpis.fulfillmentStatus).toBeDefined();
    expect(kpis.fulfillmentStatus.pendingDispatch).toBeGreaterThanOrEqual(0);
    expect(kpis.fulfillmentStatus.inTransit).toBeGreaterThanOrEqual(0);
    expect(kpis.fulfillmentStatus.delivered).toBeGreaterThanOrEqual(0);

    // AI Query resolution metrics
    expect(kpis.aiQueryResolution).toBeDefined();
    expect(kpis.aiQueryResolution.totalCustomerInquiries).toBeGreaterThan(0);
    expect(kpis.aiQueryResolution.aiResolvedWithoutEscalation).toBeGreaterThan(0);
    expect(kpis.aiQueryResolution.resolutionRatePercentage).toBeGreaterThanOrEqual(80);
  });

  it('should support tenant-scoped metrics filtering', async () => {
    const tenantKPIs = await metricsService.getDashboardKPIs('tenant_brickdirect', '7d');

    expect(tenantKPIs.tenantId).toBe('tenant_brickdirect');
    expect(tenantKPIs.tenantName).toContain('BrickDirect');
    expect(tenantKPIs.grossMerchandiseValue).toBeGreaterThan(0);
  });

  it('should dynamically update KPIs when a new order is recorded', async () => {
    const beforeKPIs = await metricsService.getDashboardKPIs();

    metricsService.recordPaidOrder({
      orderId: 'ORD-NEW-TEST-01',
      tenantId: 'tenant_titan',
      grossAmount: 5000.0,
      freightAmount: 1000.0,
      commissionAmount: 400.0,
    });

    const afterKPIs = await metricsService.getDashboardKPIs();
    expect(afterKPIs.grossMerchandiseValue).toBe(beforeKPIs.grossMerchandiseValue + 5000.0);
    expect(afterKPIs.netCommissionRetained).toBe(beforeKPIs.netCommissionRetained + 400.0);
  });
});
