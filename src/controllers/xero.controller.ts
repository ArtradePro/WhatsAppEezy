import { FastifyRequest, FastifyReply } from 'fastify';
import { xeroEngineService } from '../services/accounting/xero-engine.service';
import { postgresOrderRepository } from '../database/postgres-order.repository';
import { postgresVendorRepository } from '../database/postgres-vendor.repository';
import { xeroTokenStore } from '../services/accounting/xero-token-store';

export class XeroController {
  /**
   * POST /api/accounting/xero/create-batch-payment
   * Gathers all AUTHORISED unpaid vendor bills for a given settlement cycle
   * and bundles them into a Xero Batch Payment file for one-click banking reconciliation
   */
  async createBatchPayment(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const body = (req.body || {}) as {
        settlementDate?: string;
        bankAccountId?: string;
      };

      const result = await xeroEngineService.createBatchPayment(body);

      reply.status(201).send({
        success: true,
        message: 'Xero Batch Payment created successfully',
        batchPayment: result,
      });
    } catch (error: any) {
      console.error('[XeroController] createBatchPayment error:', error);
      reply.status(500).send({
        success: false,
        error: 'XeroBatchPaymentFailed',
        message: error.message || 'Failed to create Xero batch payment',
      });
    }
  }

  /**
   * POST /api/accounting/xero/sync-order
   * On-demand sync of a paid order to Xero (tax invoice + vendor settlement bill)
   */
  async syncOrder(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const body = (req.body || {}) as {
        orderId?: string;
        orderRef?: string;
      };

      const orderRef = body.orderRef || body.orderId;
      if (!orderRef) {
        reply.status(400).send({
          success: false,
          error: 'BadRequest',
          message: 'Either orderId or orderRef is required',
        });
        return;
      }

      let order = await postgresOrderRepository.findByOrderRef(orderRef);
      if (!order && body.orderId) {
        order = await postgresOrderRepository.findById(body.orderId);
      }

      if (!order) {
        reply.status(404).send({
          success: false,
          error: 'OrderNotFound',
          message: `Order '${orderRef}' not found`,
        });
        return;
      }

      const vendor = await postgresVendorRepository.findById(order.vendor_id);
      const result = await xeroEngineService.syncOrderPaid({ order, vendor });

      reply.status(200).send({
        success: true,
        message: `Order '${order.order_ref}' synced to Xero successfully`,
        result,
      });
    } catch (error: any) {
      console.error('[XeroController] syncOrder error:', error);
      reply.status(500).send({
        success: false,
        error: 'XeroOrderSyncFailed',
        message: error.message || 'Failed to sync order to Xero',
      });
    }
  }

  /**
   * GET /api/accounting/xero/status
   * Reports Xero OAuth2 token status and connection state
   */
  async getStatus(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const tenantId = process.env.XERO_TENANT_ID || 'xero-tenant-cargodash-prod';
    const tokens = await xeroTokenStore.getTokens(tenantId);

    const isTokenValid = tokens ? tokens.expiresAt > Date.now() : false;
    const expiresInSeconds = tokens ? Math.max(0, Math.floor((tokens.expiresAt - Date.now()) / 1000)) : 0;

    reply.status(200).send({
      success: true,
      service: 'Xero Dedicated Accounting Engine',
      tenantId,
      connected: isTokenValid || Boolean(process.env.XERO_CLIENT_ID),
      token: {
        hasToken: Boolean(tokens),
        isValid: isTokenValid,
        expiresInSeconds,
        tokenType: tokens?.tokenType || 'Bearer',
      },
      mockMode: Boolean(process.env.NODE_ENV === 'test' || !process.env.XERO_CLIENT_ID),
      mockStats: {
        contactsCount: xeroEngineService.getMockContacts().length,
        invoicesCount: xeroEngineService.getMockInvoices().length,
        batchPaymentsCount: xeroEngineService.getMockBatchPayments().length,
      },
    });
  }
}

export const xeroController = new XeroController();
