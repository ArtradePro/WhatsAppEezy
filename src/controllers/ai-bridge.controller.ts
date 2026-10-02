import { FastifyRequest, FastifyReply } from 'fastify';
import {
  openAiBridgeService,
  BridgeTaskType,
  OpenAiBridgeRequest,
} from '../services/ai/openai-bridge.service';

export class AiBridgeController {
  /**
   * GET /api/v1/ai/status
   * Returns current OpenAI API Bridge connection status, active model, and masked key source.
   */
  async getBridgeStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const headerKey = (request.headers['x-openai-api-key'] as string) || '';
    const status = openAiBridgeService.getStatus(headerKey);
    const tierPreview = openAiBridgeService.computeTierArbitrageComparison();

    reply.status(200).send({
      success: true,
      bridge: status,
      defaultTierArbitrage: tierPreview,
    });
  }

  /**
   * POST /api/v1/ai/configure-key
   * Allows setting or updating the runtime OpenAI API key directly from the Vendor Dashboard UI.
   */
  async configureApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = (request.body as Record<string, any>) || {};
    const apiKey = String(body.apiKey || '').trim();

    openAiBridgeService.setRuntimeApiKey(apiKey);
    const status = openAiBridgeService.getStatus();

    reply.status(200).send({
      success: true,
      message: status.configured
        ? 'OpenAI API key configured for live GPT-4o Cross-Build Bridge'
        : 'Cleared runtime key override — using intelligent domain engine fallback',
      bridge: status,
    });
  }

  /**
   * POST /api/v1/ai/bridge
   * Executes a Cross-Build or Vendor Operations task via OpenAI GPT-4o (or domain-engine fallback).
   */
  async executeBridge(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const body = (request.body as Record<string, any>) || {};
      const headerKey = (request.headers['x-openai-api-key'] as string) || '';

      const validTaskTypes: BridgeTaskType[] = [
        'REVENUE_ARBITRAGE_ADVISOR',
        'DISPATCH_LOAD_OPTIMIZER',
        'CATALOG_PRODUCT_GENERATOR',
        'UI_COBUILDER_ARCHITECT',
      ];

      const taskType: BridgeTaskType = validTaskTypes.includes(body.taskType)
        ? body.taskType
        : 'REVENUE_ARBITRAGE_ADVISOR';

      const bridgeReq: OpenAiBridgeRequest = {
        taskType,
        prompt: String(body.prompt || 'Analyze MoR fee arbitrage and subscription tier efficiency'),
        apiKeyOverride: body.apiKey || headerKey || undefined,
        modelOverride: body.model || undefined,
        context: body.context || undefined,
      };

      const result = await openAiBridgeService.executeBridgeTask(bridgeReq);
      reply.status(200).send(result);
    } catch (err: any) {
      reply.status(500).send({
        success: false,
        error: err.message || 'OpenAI Bridge execution error',
      });
    }
  }
}

export const aiBridgeController = new AiBridgeController();
