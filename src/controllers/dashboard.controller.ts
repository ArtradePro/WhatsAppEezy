import { FastifyRequest, FastifyReply } from 'fastify';
import { metricsService } from '../services/metrics/metrics.service';
import { tenantRepository } from '../services/tenant/tenant.repository';
import { accountingReconciliationService } from '../services/accounting/accounting-reconciliation.service';

export class DashboardController {
  async getMetrics(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = req.query as {
      tenant_id?: string;
      period?: 'live' | 'today' | '7d' | '30d' | 'all_time';
    };

    const metrics = await metricsService.getDashboardKPIs(query.tenant_id, query.period || 'live');
    reply.status(200).send({
      success: true,
      data: metrics,
    });
  }

  async getTenants(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const tenants = await tenantRepository.findAll();
    reply.status(200).send({
      success: true,
      count: tenants.length,
      tenants,
    });
  }

  async getAccountingInvoices(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const invoices = await accountingReconciliationService.getAllInvoices();
    reply.status(200).send({
      success: true,
      count: invoices.length,
      invoices,
    });
  }

  async getAccountingReceipts(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const receipts = await accountingReconciliationService.getAllReceipts();
    reply.status(200).send({
      success: true,
      count: receipts.length,
      receipts,
    });
  }
}

export const dashboardController = new DashboardController();
