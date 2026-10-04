"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiBridgeController = exports.AiBridgeController = void 0;
const openai_bridge_service_1 = require("../services/ai/openai-bridge.service");
class AiBridgeController {
    /**
     * GET /api/v1/ai/status
     * Returns current OpenAI API Bridge connection status, active model, and masked key source.
     */
    async getBridgeStatus(request, reply) {
        const headerKey = request.headers['x-openai-api-key'] || '';
        const status = openai_bridge_service_1.openAiBridgeService.getStatus(headerKey);
        const tierPreview = openai_bridge_service_1.openAiBridgeService.computeTierArbitrageComparison();
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
    async configureApiKey(request, reply) {
        const body = request.body || {};
        const apiKey = String(body.apiKey || '').trim();
        openai_bridge_service_1.openAiBridgeService.setRuntimeApiKey(apiKey);
        const status = openai_bridge_service_1.openAiBridgeService.getStatus();
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
    async executeBridge(request, reply) {
        try {
            const body = request.body || {};
            const headerKey = request.headers['x-openai-api-key'] || '';
            const validTaskTypes = [
                'REVENUE_ARBITRAGE_ADVISOR',
                'DISPATCH_LOAD_OPTIMIZER',
                'CATALOG_PRODUCT_GENERATOR',
                'UI_COBUILDER_ARCHITECT',
            ];
            const taskType = validTaskTypes.includes(body.taskType)
                ? body.taskType
                : 'REVENUE_ARBITRAGE_ADVISOR';
            const bridgeReq = {
                taskType,
                prompt: String(body.prompt || 'Analyze MoR fee arbitrage and subscription tier efficiency'),
                apiKeyOverride: body.apiKey || headerKey || undefined,
                modelOverride: body.model || undefined,
                context: body.context || undefined,
            };
            const result = await openai_bridge_service_1.openAiBridgeService.executeBridgeTask(bridgeReq);
            reply.status(200).send(result);
        }
        catch (err) {
            reply.status(500).send({
                success: false,
                error: err.message || 'OpenAI Bridge execution error',
            });
        }
    }
}
exports.AiBridgeController = AiBridgeController;
exports.aiBridgeController = new AiBridgeController();
//# sourceMappingURL=ai-bridge.controller.js.map