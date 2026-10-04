"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsAppWebhookController = exports.WhatsAppWebhookController = void 0;
const env_1 = require("../config/env");
const meta_signature_util_1 = require("../utils/meta-signature.util");
const whatsapp_queue_worker_1 = require("../services/queue/whatsapp-queue.worker");
class WhatsAppWebhookController {
    /**
     * Meta Webhook Verification Challenge (GET /api/webhooks/whatsapp & GET /webhook)
     *
     * Query params: hub.mode, hub.verify_token, hub.challenge
     */
    async verifyWebhook(req, reply) {
        const query = req.query;
        const mode = query['hub.mode'];
        const token = query['hub.verify_token'];
        const challenge = query['hub.challenge'];
        const validTokens = [env_1.config.META_WEBHOOK_VERIFY_TOKEN, env_1.config.WHATSAPP_VERIFY_TOKEN].filter(Boolean);
        if (mode === 'subscribe' && token && validTokens.includes(token)) {
            console.log('✅ Meta WhatsApp Webhook verified successfully');
            reply.status(200).type('text/plain').send(challenge);
            return;
        }
        console.warn('❌ Meta WhatsApp Webhook verification failed: Invalid verify token');
        reply.status(403).type('text/plain').send('Forbidden: Verification token mismatch');
    }
    /**
     * Meta Webhook Events Ingestion (POST /api/webhooks/whatsapp & POST /webhook)
     *
     * 1. Validates x-hub-signature-256 HMAC-SHA256 signature against raw request buffer
     * 2. Immediately responds HTTP 200 { status: 'EVENT_RECEIVED' } (<500ms SLA)
     * 3. Asynchronously enqueues payload to worker queue for routing
     */
    async handleInboundEvents(req, reply) {
        const signatureHeader = req.headers['x-hub-signature-256'];
        const isProductionPath = req.url.startsWith('/api/webhooks/whatsapp');
        // Cryptographic Signature Verification
        // Required on /api/webhooks/whatsapp or when header is provided
        if (isProductionPath || signatureHeader) {
            const rawBody = req.rawBody;
            const isValid = (0, meta_signature_util_1.validateMetaSignature)(rawBody, signatureHeader, env_1.config.META_APP_SECRET);
            if (!isValid) {
                console.warn('🚨 Meta Webhook signature verification failed: Rejected with 401');
                reply.status(401).send({ error: 'Unauthorized: Invalid x-hub-signature-256' });
                return;
            }
        }
        // Immediate non-blocking response to satisfy Meta <500ms requirement
        reply.status(200).send({ status: 'EVENT_RECEIVED' });
        const payload = req.body;
        if (payload?.object === 'whatsapp_business_account') {
            // Hand off to queue worker asynchronously
            await whatsapp_queue_worker_1.whatsAppQueueWorker.enqueueWebhook(payload);
        }
        else if (payload?.app && payload?.type === 'message') {
            const normalized = this.normalizeGupshupPayload(payload);
            if (normalized) {
                await whatsapp_queue_worker_1.whatsAppQueueWorker.enqueueWebhook(normalized);
            }
        }
    }
    /**
     * Gupshup Webhook Handshake & Event Ingestion (GET/POST /api/webhooks/gupshup)
     * Supports both Gupshup v2 JSON format and Gupshup v3 Meta Cloud Pass-Through format
     */
    async handleGupshupWebhook(req, reply) {
        reply.status(200).send({ status: 'GUPSHUP_EVENT_RECEIVED' });
        const body = req.body;
        if (!body)
            return;
        if (body.object === 'whatsapp_business_account') {
            await whatsapp_queue_worker_1.whatsAppQueueWorker.enqueueWebhook(body);
            return;
        }
        if (body.type === 'message' && body.payload) {
            const normalized = this.normalizeGupshupPayload(body);
            if (normalized) {
                await whatsapp_queue_worker_1.whatsAppQueueWorker.enqueueWebhook(normalized);
            }
        }
    }
    normalizeGupshupPayload(gupshupBody) {
        try {
            const p = gupshupBody.payload || {};
            const fromPhone = String(p.source || p.sender?.phone || '').replace(/^\+/, '');
            const senderName = p.sender?.name || 'WhatsApp Customer';
            const destinationPhone = String(p.destination || env_1.config.WHATSAPP_PHONE_NUMBER_ID || '27600104005').replace(/^\+/, '');
            const msgId = p.id || `gup_${Date.now()}`;
            const msgType = p.type || 'text';
            const messageObj = {
                from: fromPhone,
                id: msgId,
                timestamp: String(Math.floor((gupshupBody.timestamp || Date.now()) / 1000)),
                type: msgType === 'location' ? 'location' : 'text',
            };
            if (msgType === 'location' && p.payload) {
                messageObj.location = {
                    latitude: Number(p.payload.latitude || -26.1467),
                    longitude: Number(p.payload.longitude || 28.0416),
                    name: p.payload.name || 'Pinned Delivery Site',
                    address: p.payload.address || '',
                };
            }
            else {
                messageObj.text = {
                    body: p.payload?.text || p.payload?.title || String(p.payload?.body || 'hi'),
                };
            }
            return {
                object: 'whatsapp_business_account',
                entry: [
                    {
                        id: gupshupBody.app || 'whatsappeezy-gupshup',
                        changes: [
                            {
                                field: 'messages',
                                value: {
                                    messaging_product: 'whatsapp',
                                    metadata: {
                                        display_phone_number: destinationPhone,
                                        phone_number_id: destinationPhone,
                                    },
                                    contacts: [
                                        {
                                            profile: { name: senderName },
                                            wa_id: fromPhone,
                                        },
                                    ],
                                    messages: [messageObj],
                                },
                            },
                        ],
                    },
                ],
            };
        }
        catch (err) {
            console.error('⚠️ Failed to normalize Gupshup webhook payload:', err);
            return null;
        }
    }
}
exports.WhatsAppWebhookController = WhatsAppWebhookController;
exports.whatsAppWebhookController = new WhatsAppWebhookController();
//# sourceMappingURL=whatsapp-webhook.controller.js.map