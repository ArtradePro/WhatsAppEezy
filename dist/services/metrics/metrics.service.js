"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsService = exports.MetricsService = void 0;
const tenant_repository_1 = require("../tenant/tenant.repository");
class MetricsService {
    orders = [];
    checkoutsInitiatedCount = 0;
    inquiries = [];
    constructor() {
        this.seedHistoricalMetrics();
    }
    seedHistoricalMetrics() {
        // Seed some initial data to showcase rich live dashboard KPIs immediately
        this.checkoutsInitiatedCount = 28;
        this.orders.push({
            orderId: 'ORD-HIST-01',
            tenantId: 'tenant_brickdirect',
            grossAmount: 3200.0,
            freightAmount: 850.0,
            commissionAmount: 256.0,
            paymentStatus: 'PAID',
            fulfillmentStatus: 'DELIVERED',
            createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        }, {
            orderId: 'ORD-HIST-02',
            tenantId: 'tenant_brickdirect',
            grossAmount: 1850.0,
            freightAmount: 600.0,
            commissionAmount: 148.0,
            paymentStatus: 'PAID',
            fulfillmentStatus: 'IN_TRANSIT',
            createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        }, {
            orderId: 'ORD-HIST-03',
            tenantId: 'tenant_titan',
            grossAmount: 4500.0,
            freightAmount: 1200.0,
            commissionAmount: 337.5,
            paymentStatus: 'PAID',
            fulfillmentStatus: 'PENDING_DISPATCH',
            createdAt: new Date(Date.now() - 86400000).toISOString(),
        }, {
            orderId: 'ORD-HIST-04',
            tenantId: 'tenant_brickdirect',
            grossAmount: 950.0,
            freightAmount: 400.0,
            commissionAmount: 76.0,
            paymentStatus: 'PAID',
            fulfillmentStatus: 'PENDING_DISPATCH',
            createdAt: new Date().toISOString(),
        });
        // Seed 42 simulated inquiries with high AI resolution rate
        for (let i = 0; i < 42; i++) {
            const isResolved = i % 10 !== 0; // 90% resolution rate
            this.inquiries.push({
                inquiryId: `inq_${i}`,
                tenantId: i % 2 === 0 ? 'tenant_brickdirect' : 'tenant_titan',
                aiResolvedWithoutEscalation: isResolved,
                confidenceScore: 0.92,
                timestamp: new Date().toISOString(),
            });
        }
    }
    trackCheckoutInitiated() {
        this.checkoutsInitiatedCount++;
    }
    recordPaidOrder(data) {
        this.orders.push({
            orderId: data.orderId,
            tenantId: data.tenantId,
            grossAmount: data.grossAmount,
            freightAmount: data.freightAmount,
            commissionAmount: data.commissionAmount,
            paymentStatus: 'PAID',
            fulfillmentStatus: 'PENDING_DISPATCH',
            createdAt: new Date().toISOString(),
        });
    }
    updateFulfillmentStatus(orderId, status) {
        const order = this.orders.find((o) => o.orderId === orderId);
        if (order) {
            order.fulfillmentStatus = status;
        }
    }
    recordAIInquiry(aiResolvedWithoutEscalation, confidenceScore, tenantId) {
        this.inquiries.push({
            inquiryId: `inq_${Date.now()}`,
            tenantId,
            aiResolvedWithoutEscalation,
            confidenceScore,
            timestamp: new Date().toISOString(),
        });
    }
    async getDashboardKPIs(tenantId, period = 'live') {
        let filteredOrders = this.orders;
        let filteredInquiries = this.inquiries;
        if (tenantId) {
            filteredOrders = this.orders.filter((o) => o.tenantId === tenantId);
            filteredInquiries = this.inquiries.filter((i) => !i.tenantId || i.tenantId === tenantId);
        }
        const paidOrders = filteredOrders.filter((o) => o.paymentStatus === 'PAID');
        const gmv = paidOrders.reduce((sum, o) => sum + o.grossAmount, 0);
        const netCommission = paidOrders.reduce((sum, o) => sum + o.commissionAmount, 0);
        const totalFreight = paidOrders.reduce((sum, o) => sum + o.freightAmount, 0);
        const successfulPayments = paidOrders.length;
        const checkouts = Math.max(successfulPayments, this.checkoutsInitiatedCount);
        const conversionRate = checkouts > 0 ? Math.round((successfulPayments / checkouts) * 1000) / 10 : 0;
        const aov = successfulPayments > 0 ? Math.round((gmv / successfulPayments) * 100) / 100 : 0;
        // Fulfillment Breakdown
        const pendingDispatch = paidOrders.filter((o) => o.fulfillmentStatus === 'PENDING_DISPATCH').length;
        const inTransit = paidOrders.filter((o) => o.fulfillmentStatus === 'IN_TRANSIT').length;
        const delivered = paidOrders.filter((o) => o.fulfillmentStatus === 'DELIVERED').length;
        const cancelled = paidOrders.filter((o) => o.fulfillmentStatus === 'CANCELLED').length;
        const totalFulfillments = paidOrders.length;
        const fulfillmentRate = totalFulfillments > 0 ? Math.round((delivered / totalFulfillments) * 1000) / 10 : 0;
        // AI Query Metrics
        const totalInquiries = filteredInquiries.length;
        const aiResolved = filteredInquiries.filter((i) => i.aiResolvedWithoutEscalation).length;
        const humanEscalated = totalInquiries - aiResolved;
        const aiResolutionRate = totalInquiries > 0 ? Math.round((aiResolved / totalInquiries) * 1000) / 10 : 0;
        const avgConfidence = totalInquiries > 0
            ? Math.round((filteredInquiries.reduce((sum, i) => sum + i.confidenceScore, 0) / totalInquiries) * 100) / 100
            : 0.95;
        let tenantName;
        if (tenantId) {
            const tenant = await tenant_repository_1.tenantRepository.findById(tenantId);
            tenantName = tenant?.tradingName || tenant?.businessName;
        }
        return {
            tenantId,
            tenantName,
            period,
            grossMerchandiseValue: Math.round(gmv * 100) / 100,
            netCommissionRetained: Math.round(netCommission * 100) / 100,
            totalFreightRevenue: Math.round(totalFreight * 100) / 100,
            totalCheckoutsInitiated: checkouts,
            successfulPaymentConversions: successfulPayments,
            conversionRatePercentage: conversionRate,
            averageOrderValue: aov,
            fulfillmentStatus: {
                pendingDispatch,
                inTransit,
                delivered,
                cancelled,
                totalFulfillments,
                fulfillmentRatePercentage: fulfillmentRate,
            },
            aiQueryResolution: {
                totalCustomerInquiries: totalInquiries,
                aiResolvedWithoutEscalation: aiResolved,
                humanEscalated,
                resolutionRatePercentage: aiResolutionRate,
                averageConfidenceScore: avgConfidence,
            },
            generatedAt: new Date().toISOString(),
        };
    }
}
exports.MetricsService = MetricsService;
exports.metricsService = new MetricsService();
//# sourceMappingURL=metrics.service.js.map