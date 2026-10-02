import { FastifyRequest, FastifyReply } from 'fastify';
import { virtualNumberManagerService } from '../services/whatsapp/virtual-number-manager.service';

export class VirtualNumberController {
  /**
   * GET /api/v1/virtual-numbers
   * Lists all server-hosted Cloud Virtual WhatsApp Numbers across vendor tenants.
   */
  async listVirtualNumbers(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const numbers = await virtualNumberManagerService.listVirtualNumbers();
    reply.status(200).send({
      success: true,
      architecture: 'META_CLOUD_API_SERVER_HOSTED',
      requiresPhysicalSimOrDataPackage: false,
      virtualNumbers: numbers,
    });
  }

  /**
   * POST /api/v1/virtual-numbers/provision
   * Provisions or updates a dedicated server-hosted Cloud Virtual Number for a vendor tenant.
   */
  async provisionVirtualNumber(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = (request.body as Record<string, any>) || {};
    if (!body.vendorId) {
      reply.status(400).send({
        success: false,
        error: 'vendorId is required to provision a Cloud Virtual Number',
      });
      return;
    }

    const record = await virtualNumberManagerService.provisionVirtualNumber({
      vendorId: String(body.vendorId),
      displayVirtualNumber: body.displayVirtualNumber,
      virtualPhoneNumberId: body.virtualPhoneNumberId,
      routingKeyword: body.routingKeyword,
    });

    reply.status(200).send({
      success: true,
      virtualNumber: record,
    });
  }

  /**
   * POST /api/v1/virtual-numbers/onboard-vendor
   * Self-service vendor onboarding: creates vendor, provisions dedicated virtual phone number
   * under the single Master WABA, and assigns an isolated Meta Catalog ID.
   */
  async onboardVendor(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = (request.body as Record<string, any>) || {};
    if (!body.businessName) {
      reply.status(400).send({
        success: false,
        error: 'businessName is required to onboard a vendor',
      });
      return;
    }

    const result = await virtualNumberManagerService.onboardVendorSelfService({
      businessName: String(body.businessName),
      whatsappNumber: String(body.whatsappNumber || '+27820001122'),
      businessType: body.businessType,
      subscriptionTier: body.subscriptionTier,
      bankName: body.bankName,
      accountNumber: body.accountNumber,
      branchCode: body.branchCode,
    });

    reply.status(201).send({
      success: true,
      ...result,
    });
  }

  /**
   * POST /api/v1/virtual-numbers/zero-data-command
   * Executes or simulates a Zero-Data In-WhatsApp Supplier/Driver command (<1.5 KB payload).
   */
  async executeZeroDataCommand(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = (request.body as Record<string, any>) || {};
    const senderPhone = String(body.senderPhone || '+27829876543');
    const commandText = String(body.command || body.text || 'STATUS');
    const vendorId = body.vendorId ? String(body.vendorId) : undefined;
    const recipientPhoneNumberId = body.recipientPhoneNumberId
      ? String(body.recipientPhoneNumberId)
      : undefined;

    const result = await virtualNumberManagerService.handleZeroDataVendorCommand(
      senderPhone,
      commandText,
      vendorId,
      recipientPhoneNumberId
    );

    reply.status(200).send({
      success: true,
      ...result,
    });
  }
}

export const virtualNumberController = new VirtualNumberController();

