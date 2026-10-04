"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payFastWebhookController = exports.PayFastWebhookController = void 0;
const payfast_service_1 = require("../services/payment/payfast.service");
const conversation_session_store_1 = require("../services/state-machine/conversation-session.store");
const ledger_service_1 = require("../services/ledger/ledger.service");
const postgres_order_repository_1 = require("../database/postgres-order.repository");
const postgres_ledger_service_1 = require("../database/postgres-ledger.service");
const appointment_engine_service_1 = require("../services/booking/appointment-engine.service");
const env_1 = require("../config/env");
class PayFastWebhookController {
    /**
     * Handles PayFast Instant Transaction Notification (ITN)
     * POST /api/webhooks/payfast/itn & POST /api/v1/payments/payfast/itn
     */
    async handleITN(req, reply) {
        const itnData = (req.body || {});
        // 1. PayFast Host / IP Check
        const clientIp = (req.ip ||
            req.headers['x-forwarded-for'] ||
            req.socket.remoteAddress ||
            '').split(',')[0].trim();
        if (!payfast_service_1.payFastService.isValidPayFastIp(clientIp)) {
            console.error(`🚨 SECURITY ALERT: Unauthorized PayFast ITN attempt from IP: ${clientIp}`);
            reply.status(400).send('Unauthorized host IP');
            return;
        }
        // 2. Verify PayFast MD5 signature (extracts variables, preserves sequence or sorts, appends passphrase)
        const isSignatureValid = payfast_service_1.payFastService.verifySignature(itnData);
        if (!isSignatureValid) {
            console.warn('⚠️ PayFast ITN signature mismatch rejected:', itnData);
            reply.status(400).send('Invalid signature');
            return;
        }
        // 3. Server Validation Ping (POST back to PayFast validate endpoint)
        const isServerValid = await payfast_service_1.payFastService.validateServerPostback(itnData);
        if (!isServerValid) {
            console.error('🚨 SECURITY ALERT: PayFast ITN server validation postback ping failed:', itnData);
            reply.status(400).send('Validation ping failed');
            return;
        }
        // 4. Validate Payment Status
        if (itnData.payment_status !== 'COMPLETE') {
            console.log(`ℹ️ PayFast ITN status is not COMPLETE (${itnData.payment_status})`);
            reply.status(200).send('Status logged');
            return;
        }
        try {
            // 5. Execute atomic database transaction & double-entry ledger settlement
            const ledgerEntry = await payfast_service_1.payFastService.processPaymentNotification(itnData);
            // 6. Update conversation state machine stage to ORDER_CONFIRMED
            const orderId = itnData.custom_str3 || itnData.m_payment_id;
            const session = await conversation_session_store_1.conversationSessionStore.findByOrderId(orderId);
            if (session) {
                session.currentStage = 'ORDER_CONFIRMED';
                if (session.activeOrder) {
                    session.activeOrder.paymentStatus = 'PAID';
                    session.activeOrder.paidAt = new Date().toISOString();
                }
                await conversation_session_store_1.conversationSessionStore.saveSession(session);
            }
            console.log(`✅ PayFast Payment Verified & Split Settled for Order ${orderId}:`, {
                gross: ledgerEntry.grossAmount,
                commission: ledgerEntry.platformCommissionAmount,
                vendorNet: ledgerEntry.vendorPayoutNet,
            });
            // 7. Acknowledge receipt to PayFast immediately with HTTP 200
            reply.status(200).send('OK');
        }
        catch (error) {
            console.error('Error handling PayFast ITN notification:', error);
            reply.status(500).send('Internal server error');
        }
    }
    /**
     * Executes a full End-to-End PayFast Sandbox Checkout + Signed Capitec Pay / Instant EFT ITN Run
     * POST /api/v1/payments/payfast/sandbox-run
     */
    async runSandboxEndToEnd(req, reply) {
        const body = (req.body || {});
        const paymentMethod = body.paymentMethod || 'Capitec Pay / Instant EFT';
        const isService = body.businessType === 'service_booking';
        const timestampSuffix = Date.now().toString().slice(-6);
        const vendorId = isService
            ? 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33' // Aura Luxe Hair & Wellness Studio
            : 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; // BrickDirect Supply Yard
        const vendorPhone = isService ? '+27820000003' : '+27820000001';
        const customerPhone = '+27825550199';
        const orderRef = isService
            ? `ORD-PF-SVC-${timestampSuffix}`
            : `ORD-PF-YRD-${timestampSuffix}`;
        const subtotal = isService ? 650.0 : 3300.0;
        const deliveryFee = isService ? 0.0 : 562.4;
        const totalAmount = Math.round((subtotal + deliveryFee) * 100) / 100;
        const platformFee = Math.round(totalAmount * 0.05 * 100) / 100; // Pro tier 5%
        const chargedGatewayFee = Math.round((totalAmount * 0.029 + 2.0) * 100) / 100;
        const vendorPayout = Math.round((totalAmount - platformFee - chargedGatewayFee) * 100) / 100;
        let heldAppointmentId;
        if (isService) {
            const slots = await appointment_engine_service_1.appointmentEngineService.getNextAvailableSlots(vendorId, new Date(), 1);
            const targetSlot = slots[0]?.scheduledStart || new Date(Date.now() + 86400000).toISOString();
            const heldAppt = await appointment_engine_service_1.appointmentEngineService.placeTemporarySlotHold({
                vendorId,
                customerPhone,
                customerName: 'Capitec Pay Sandbox Tester',
                serviceProductId: '33333333-3333-4333-8333-333333333301',
                scheduledStart: targetSlot,
                holdDurationMinutes: 10,
            });
            heldAppointmentId = heldAppt.id;
        }
        // 1. Create pending order in database / repository
        const createdOrder = await postgres_order_repository_1.postgresOrderRepository.createOrder({
            order_ref: orderRef,
            vendor_id: vendorId,
            customer_phone: customerPhone,
            customer_name: 'Capitec Pay Sandbox Tester',
            delivery_address: isService
                ? 'In-Studio Booking (Aura Luxe Studio, Sandton)'
                : 'Stand 402, Albertinia Industrial Site',
            delivery_lon: 21.58,
            delivery_lat: -34.2056,
            distance_km: isService ? 0 : 12.4,
            subtotal,
            delivery_fee: deliveryFee,
            total_amount: totalAmount,
            platform_fee: platformFee,
            vendor_payout: vendorPayout,
            payment_status: 'unpaid',
            payfast_pf_payment_id: undefined,
            current_status: 'pending_payment',
        }, [
            {
                product_id: isService
                    ? '33333333-3333-4333-8333-333333333301'
                    : '11111111-1111-4111-8111-111111111101',
                quantity: isService ? 1 : 6,
                unit_price: isService ? 650.0 : 550.0,
                total_price: subtotal,
            },
        ]);
        // 2. Generate signed PayFast Sandbox Checkout URL
        const checkoutUrl = payfast_service_1.payFastService.generateCheckoutUrl({
            orderId: orderRef,
            customerWhatsApp: customerPhone,
            customerName: 'Capitec Pay Sandbox Tester',
            vendorWhatsApp: vendorPhone,
            vendorId,
            businessType: isService ? 'service_booking' : 'retail_delivery',
            appointmentId: heldAppointmentId,
            items: [
                {
                    retailerId: isService ? 'SVC-BRAID-01' : 'MAT-SAND-01',
                    name: isService ? 'Knotless Box Braids (60m Slot)' : 'Building Sand (6m³ Tipper Load)',
                    quantity: isService ? 1 : 6,
                    unitPrice: isService ? 650.0 : 550.0,
                    totalPrice: subtotal,
                },
            ],
            itemsSubtotal: subtotal,
            freightQuote: {
                distanceKm: isService ? 0 : 12.4,
                durationMinutes: isService ? 60 : 28,
                durationText: isService ? '60 mins' : '28 mins',
                freightTier: isService ? 'IN_STUDIO_SERVICE' : '6M3_TIPPER',
                baseFlagFall: isService ? 0 : 250,
                ratePerKm: isService ? 0 : 25.19,
                totalFreightCost: deliveryFee,
                deliveryAddress: createdOrder.delivery_address,
                vendorDepotCoordinates: { lat: -34.2056, lng: 21.58 },
            },
            totalAmount,
            currency: 'ZAR',
            paymentStatus: 'PAYMENT_PENDING',
            createdAt: new Date().toISOString(),
        });
        // 3. Construct & Sign PayFast Sandbox ITN Payload (Capitec Pay / Instant EFT)
        const pfPaymentId = `PF-CAPITEC-${timestampSuffix}`;
        const wholesaleGatewayFee = Math.round((totalAmount * 0.0195 + 1.5) * 100) / 100;
        const netAfterGateway = Math.round((totalAmount - wholesaleGatewayFee) * 100) / 100;
        const unsignedItn = {
            m_payment_id: orderRef,
            pf_payment_id: pfPaymentId,
            payment_status: 'COMPLETE',
            item_name: `CargoDash: Order #${orderRef.slice(-6)}`,
            item_description: `${paymentMethod} Settlement`,
            amount_gross: totalAmount.toFixed(2),
            amount_fee: wholesaleGatewayFee.toFixed(2),
            amount_net: netAfterGateway.toFixed(2),
            custom_str1: customerPhone,
            custom_str2: vendorPhone,
            custom_str3: orderRef,
            custom_str4: vendorId,
            ...(heldAppointmentId ? { custom_str5: heldAppointmentId } : {}),
            merchant_id: env_1.config.PAYFAST_MERCHANT_ID,
        };
        const md5Signature = payfast_service_1.payFastService.generateSignature(unsignedItn);
        const signedItnPayload = {
            ...unsignedItn,
            signature: md5Signature,
        };
        // 4. Verify signature & process atomic ITN settlement + WhatsApp dispatch alert
        const signatureVerified = payfast_service_1.payFastService.verifySignature(signedItnPayload);
        const splitLedgerEntry = await payfast_service_1.payFastService.processPaymentNotification(signedItnPayload);
        const dbLedgerEntries = await postgres_ledger_service_1.postgresLedgerService.getEntriesByOrder(createdOrder.id);
        const updatedOrder = await postgres_order_repository_1.postgresOrderRepository.findByOrderRef(orderRef);
        reply.status(200).send({
            success: true,
            sandboxEnv: env_1.config.PAYFAST_ENV,
            paymentMethod,
            businessType: isService ? 'service_booking' : 'retail_delivery',
            orderRef,
            pfPaymentId,
            checkoutUrl,
            signatureVerified,
            md5Signature,
            orderStatusAfterItn: updatedOrder?.payment_status || 'paid',
            appointmentId: heldAppointmentId || null,
            splitSummary: splitLedgerEntry,
            atomicLedgerEntries: dbLedgerEntries,
            whatsappAlertsDispatched: {
                customerReceiptSentTo: customerPhone,
                vendorDispatchAlertSentTo: vendorPhone,
                alertType: isService ? 'APPOINTMENT_SLOT_CONFIRMED' : 'HEAVY_VEHICLE_DISPATCH_ALERT',
            },
        });
    }
    /**
     * Retrieves all recorded ledger split transactions
     * GET /api/v1/ledger
     */
    async getLedgerEntries(req, reply) {
        const entries = await ledger_service_1.ledgerService.getAllEntries();
        reply.status(200).send({
            success: true,
            count: entries.length,
            entries,
        });
    }
}
exports.PayFastWebhookController = PayFastWebhookController;
exports.payFastWebhookController = new PayFastWebhookController();
//# sourceMappingURL=payfast-webhook.controller.js.map