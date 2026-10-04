"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardController = exports.DashboardController = void 0;
const metrics_service_1 = require("../services/metrics/metrics.service");
const tenant_repository_1 = require("../services/tenant/tenant.repository");
const accounting_reconciliation_service_1 = require("../services/accounting/accounting-reconciliation.service");
class DashboardController {
    async getMetrics(req, reply) {
        const query = req.query;
        const metrics = await metrics_service_1.metricsService.getDashboardKPIs(query.tenant_id, query.period || 'live');
        reply.status(200).send({
            success: true,
            data: metrics,
        });
    }
    async getTenants(req, reply) {
        const tenants = await tenant_repository_1.tenantRepository.findAll();
        reply.status(200).send({
            success: true,
            count: tenants.length,
            tenants,
        });
    }
    async getAccountingInvoices(req, reply) {
        const invoices = await accounting_reconciliation_service_1.accountingReconciliationService.getAllInvoices();
        reply.status(200).send({
            success: true,
            count: invoices.length,
            invoices,
        });
    }
    async getAccountingReceipts(req, reply) {
        const receipts = await accounting_reconciliation_service_1.accountingReconciliationService.getAllReceipts();
        reply.status(200).send({
            success: true,
            count: receipts.length,
            receipts,
        });
    }
}
exports.DashboardController = DashboardController;
exports.dashboardController = new DashboardController();
//# sourceMappingURL=dashboard.controller.js.map