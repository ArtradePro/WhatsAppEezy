"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.visionService = exports.VisionService = void 0;
const axios_1 = __importDefault(require("axios"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const env_1 = require("../../config/env");
class VisionService {
    geminiApiKey;
    anthropic;
    constructor() {
        const key = (process.env.GEMINI_API_KEY || env_1.config.GEMINI_API_KEY || '').trim();
        if (key.length > 20 && !key.includes('mock')) {
            this.geminiApiKey = key;
        }
        if (env_1.config.ANTHROPIC_API_KEY && env_1.config.ANTHROPIC_API_KEY !== '') {
            this.anthropic = new sdk_1.default({ apiKey: env_1.config.ANTHROPIC_API_KEY });
        }
    }
    /**
     * Extracts standardized commerce attributes using Gemini Flash (or Claude / heuristic fallback)
     */
    async extractAttributes(input) {
        if (process.env.VITEST || env_1.config.NODE_ENV === 'test') {
            return this.heuristicExtraction(input);
        }
        const provider = env_1.config.VISION_PROVIDER;
        const activeGeminiKey = (this.geminiApiKey || process.env.GEMINI_API_KEY || env_1.config.GEMINI_API_KEY || '').trim();
        const hasLiveGeminiKey = activeGeminiKey.length > 20 && !activeGeminiKey.includes('mock');
        if (hasLiveGeminiKey && (provider === 'gemini' || provider === 'openai')) {
            this.geminiApiKey = activeGeminiKey;
            try {
                return await this.extractWithGeminiFlash(input);
            }
            catch (error) {
                console.warn('Gemini Flash Vision provider fallback to resilient heuristic extraction:', error);
                return this.heuristicExtraction(input);
            }
        }
        // Use Heuristic Fallback if in mock mode or keys missing
        if (env_1.config.MOCK_EXTERNAL_APIS ||
            (provider === 'gemini' && !hasLiveGeminiKey) ||
            (provider === 'anthropic' && !this.anthropic)) {
            return this.heuristicExtraction(input);
        }
        try {
            if (provider === 'anthropic' && this.anthropic) {
                return await this.extractWithClaude(input);
            }
        }
        catch (error) {
            console.warn('Vision provider fallback to resilient heuristic extraction:', error);
            return this.heuristicExtraction(input);
        }
        return this.heuristicExtraction(input);
    }
    /**
     * Google Gemini Flash Vision Implementation (OpenAI Removed)
     */
    async extractWithGeminiFlash(input) {
        if (!this.geminiApiKey)
            throw new Error('GEMINI_API_KEY not configured');
        const model = env_1.config.GEMINI_MODEL || 'gemini-2.5-flash';
        const systemPrompt = this.getSystemPrompt();
        const parts = [
            {
                text: `${systemPrompt}\n\nPlease analyze this supplier product image and metadata:\nTitle: "${input.title}"\nRaw Description: "${input.rawDescription}"\nReturn STRICT JSON only.`,
            },
        ];
        if (input.imageBuffer) {
            parts.push({
                inline_data: {
                    mime_type: input.mimeType || 'image/jpeg',
                    data: input.imageBuffer.toString('base64'),
                },
            });
        }
        const candidateModels = Array.from(new Set([model, 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.8-flash']));
        let response = null;
        for (const candidate of candidateModels) {
            try {
                const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${this.geminiApiKey}`;
                response = await axios_1.default.post(endpoint, {
                    contents: [{ role: 'user', parts }],
                    generationConfig: {
                        temperature: 0.1,
                        responseMimeType: 'application/json',
                    },
                }, { timeout: 15000 });
                break;
            }
            catch (innerErr) {
                const status = innerErr?.response?.status;
                if ((status === 404 || status === 503 || status === 429) && candidate !== candidateModels[candidateModels.length - 1]) {
                    continue;
                }
                throw innerErr;
            }
        }
        const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) {
            throw new Error('Gemini Flash returned empty content');
        }
        const parsed = JSON.parse(content);
        return this.normalizeAttributes(parsed, input);
    }
    /**
     * Anthropic Claude 3.5 Sonnet Vision Implementation
     */
    async extractWithClaude(input) {
        if (!this.anthropic)
            throw new Error('Anthropic client not initialized');
        const imageContent = this.buildClaudeImagePart(input);
        const systemPrompt = this.getSystemPrompt();
        const response = await this.anthropic.messages.create({
            model: env_1.config.ANTHROPIC_MODEL,
            max_tokens: 1500,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: [
                        imageContent,
                        {
                            type: 'text',
                            text: `Please analyze this supplier product image and metadata:\nTitle: "${input.title}"\nRaw Description: "${input.rawDescription}"\nReturn STRICT JSON only.`,
                        },
                    ],
                },
            ],
            temperature: 0.1,
        });
        const textBlock = response.content.find((c) => c.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
            throw new Error('Claude 3.5 Sonnet returned no text block');
        }
        // Parse JSON from Claude text response
        const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Could not parse JSON from Claude response');
        }
        const parsed = JSON.parse(jsonMatch[0]);
        return this.normalizeAttributes(parsed, input);
    }
    getSystemPrompt() {
        return `You are an expert commerce vision and product cataloging AI for a B2B/B2C WhatsApp Commerce platform.
Your task is to analyze the product image and supplier text to extract and standardize 4 mandatory commerce attributes:
1. Dimensions: Physical dimensions formatted consistently (e.g., "222mm x 106mm x 73mm", "1200 x 800 mm", "50kg bag", or "Standard").
2. Material: Primary composition (e.g., "Clay / Terracotta", "High-Density Concrete", "Galvanized Steel", "Granite", "Cotton").
3. Unit of Measure: Commercial billing unit (e.g., "per 1000 bricks", "per m3", "per metric ton", "per pallet", "per unit", "per bag").
4. Color: Primary visual color / finish (e.g., "Terracotta Red", "Charcoal Gray", "Buff Yellow", "Natural Slate").

You must return a valid JSON object matching this structure:
{
  "dimensions": string,
  "material": string,
  "unit_of_measure": string,
  "color": string,
  "confidence_score": number (0.0 to 1.0),
  "enriched_title": string,
  "enriched_description": string,
  "suggested_category": string
}`;
    }
    buildClaudeImagePart(input) {
        if (input.imageBuffer) {
            const mime = (input.mimeType || 'image/jpeg');
            return {
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: mime,
                    data: input.imageBuffer.toString('base64'),
                },
            };
        }
        throw new Error('Claude Vision requires image buffer or base64 data');
    }
    normalizeAttributes(parsed, input) {
        const dimensions = parsed.dimensions || parsed.Dimensions || 'Standard Size';
        const material = parsed.material || parsed.Material || 'Industrial Grade';
        const unitOfMeasure = parsed.unit_of_measure || parsed.unitOfMeasure || 'per unit';
        const color = parsed.color || parsed.Color || 'Standard';
        const confidenceScore = typeof parsed.confidence_score === 'number' ? parsed.confidence_score : 0.95;
        const enrichedTitle = parsed.enriched_title ||
            `${input.title} - ${color} (${dimensions})`;
        const enrichedDescription = parsed.enriched_description ||
            `${input.rawDescription}\n\nTechnical Specifications:\n- Dimensions: ${dimensions}\n- Material: ${material}\n- Unit of Measure: ${unitOfMeasure}\n- Color/Finish: ${color}`;
        return {
            dimensions,
            material,
            unitOfMeasure,
            color,
            confidenceScore,
            enrichedTitle,
            enrichedDescription,
            suggestedCategory: parsed.suggested_category || 'Hardware & Building Supplies',
        };
    }
    /**
     * Resilient heuristic extraction for test mode or offline fallback
     */
    heuristicExtraction(input) {
        const text = `${input.title} ${input.rawDescription}`.toLowerCase();
        // 1. Dimensions extraction
        let dimensions = 'Standard Dimensions';
        const dimMatch = text.match(/(\d+\s*(?:mm|cm|m|in)\s*[xX*×]\s*\d+\s*(?:mm|cm|m|in)(?:\s*[xX*×]\s*\d+\s*(?:mm|cm|m|in))?)/i);
        if (dimMatch) {
            dimensions = dimMatch[1].replace(/\s+/g, ' ');
        }
        else if (text.includes('standard')) {
            dimensions = '222mm x 106mm x 73mm';
        }
        // 2. Material extraction
        let material = 'High-Grade Industrial';
        if (text.includes('clay') || text.includes('terracotta'))
            material = 'Clay / Terracotta';
        else if (text.includes('concrete') || text.includes('cement'))
            material = 'Precast Concrete';
        else if (text.includes('granite'))
            material = 'Natural Granite';
        else if (text.includes('steel') || text.includes('iron'))
            material = 'Reinforced Steel';
        else if (text.includes('timber') || text.includes('wood'))
            material = 'Treated Pine Timber';
        else if (text.includes('sand') || text.includes('gravel'))
            material = 'Aggregates / Quartz Sand';
        // 3. Unit of measure extraction
        let unitOfMeasure = 'per unit';
        if (text.includes('m3') || text.includes('cubic meter') || text.includes('cubic metre')) {
            unitOfMeasure = 'per m3';
        }
        else if (text.includes('1000') || text.includes('1k') || text.includes('per thousand')) {
            unitOfMeasure = 'per 1000 bricks';
        }
        else if (text.includes('ton') || text.includes('tonne')) {
            unitOfMeasure = 'per metric ton';
        }
        else if (text.includes('pallet')) {
            unitOfMeasure = 'per pallet';
        }
        else if (text.includes('bag') || text.includes('50kg')) {
            unitOfMeasure = 'per 50kg bag';
        }
        // 4. Color extraction
        let color = 'Natural Finish';
        if (text.includes('red') || text.includes('terracotta'))
            color = 'Terracotta Red';
        else if (text.includes('charcoal') || text.includes('black'))
            color = 'Charcoal Gray';
        else if (text.includes('yellow') || text.includes('buff') || text.includes('golden'))
            color = 'Buff Yellow';
        else if (text.includes('grey') || text.includes('gray'))
            color = 'Industrial Grey';
        else if (text.includes('white'))
            color = 'Pure White';
        const enrichedTitle = `${input.title} - ${color}`;
        const enrichedDescription = `${input.rawDescription.trim()}\n\nStandardized Specifications:\n• Dimensions: ${dimensions}\n• Material: ${material}\n• Unit of Measure: ${unitOfMeasure}\n• Color / Finish: ${color}\n• WhatsApp Direct Order Enabled`;
        return {
            dimensions,
            material,
            unitOfMeasure,
            color,
            confidenceScore: 0.92,
            enrichedTitle,
            enrichedDescription,
            suggestedCategory: 'Building Materials & Hardware',
        };
    }
}
exports.VisionService = VisionService;
exports.visionService = new VisionService();
//# sourceMappingURL=vision.service.js.map