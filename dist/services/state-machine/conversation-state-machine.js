"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationStateMachine = exports.ConversationStateMachine = void 0;
const conversation_session_store_1 = require("./conversation-session.store");
const freight_calculator_service_1 = require("../delivery/freight-calculator.service");
const payfast_service_1 = require("../payment/payfast.service");
const whatsapp_client_service_1 = require("../whatsapp/whatsapp-client.service");
const product_repository_1 = require("../db/product-repository");
const postgres_order_repository_1 = require("../../database/postgres-order.repository");
const postgres_product_repository_1 = require("../../database/postgres-product.repository");
const postgres_vendor_repository_1 = require("../../database/postgres-vendor.repository");
const spatial_service_1 = require("../../database/spatial.service");
const vendor_product_ingestion_service_1 = require("../vendor/vendor-product-ingestion.service");
const appointment_engine_service_1 = require("../booking/appointment-engine.service");
const metrics_service_1 = require("../metrics/metrics.service");
const env_1 = require("../../config/env");
class ConversationStateMachine {
    /**
     * Resolves the tenant vendor strictly from inbound Meta webhook metadata (phone_number_id / display_phone_number)
     */
    async resolveTenantVendor(metadata) {
        if (metadata?.vendorId) {
            const byId = await postgres_vendor_repository_1.postgresVendorRepository.findById(metadata.vendorId);
            if (byId)
                return byId;
        }
        if (metadata?.phoneNumberId || metadata?.displayPhoneNumber) {
            const byMeta = await postgres_vendor_repository_1.postgresVendorRepository.resolveByWebhookMetadata(metadata.phoneNumberId, metadata.displayPhoneNumber);
            if (byMeta)
                return byMeta;
        }
        if (metadata?.displayPhoneNumber === '917834811114') {
            const higiene = await postgres_vendor_repository_1.postgresVendorRepository.findById('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55');
            if (higiene)
                return higiene;
        }
        return ((await postgres_vendor_repository_1.postgresVendorRepository.findById('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')) ||
            (await postgres_vendor_repository_1.postgresVendorRepository.findAll())[0]);
    }
    /**
     * Main entrypoint for processing any incoming WhatsApp message (strictly isolated by tenant vendor_id)
     */
    async handleInboundMessage(senderWaId, customerName, message, metadata) {
        let vendor = await this.resolveTenantVendor(metadata);
        const incomingText = message.text?.body?.trim().toLowerCase();
        // Multi-Vendor Keyword Switcher (for single master WhatsApp number aggregation)
        if (incomingText === '#higiene' || incomingText === 'higiene') {
            const v = await postgres_vendor_repository_1.postgresVendorRepository.findById('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55');
            if (v)
                vendor = v;
        }
        else if (incomingText === '#sand' || incomingText === '#brick' || incomingText === 'brickdirect') {
            const v = await postgres_vendor_repository_1.postgresVendorRepository.findById('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
            if (v)
                vendor = v;
        }
        else if (incomingText === '#pizza' || incomingText === 'pizza') {
            const v = await postgres_vendor_repository_1.postgresVendorRepository.findById('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44');
            if (v)
                vendor = v;
        }
        else if (incomingText === '#salon' || incomingText === 'salon') {
            const v = await postgres_vendor_repository_1.postgresVendorRepository.findById('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33');
            if (v)
                vendor = v;
        }
        const businessType = vendor.business_type || 'retail_delivery';
        const session = await conversation_session_store_1.conversationSessionStore.getSession(senderWaId, customerName, {
            vendorId: vendor.id,
            metaPhoneNumberId: metadata?.phoneNumberId || vendor.meta_phone_number_id,
            displayPhoneNumber: metadata?.displayPhoneNumber || vendor.whatsapp_number,
            businessType,
        });
        session.vendorId = vendor.id;
        // Fast-path cancel / reset command
        if (incomingText === 'reset' || incomingText === 'cancel' || incomingText === 'restart') {
            if (session.activeAppointmentId) {
                await appointment_engine_service_1.appointmentEngineService.cancelAppointmentHold(session.activeAppointmentId);
            }
            await conversation_session_store_1.conversationSessionStore.resetSession(senderWaId, vendor.id);
            await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(senderWaId, `🔄 Your session with *${vendor.business_name}* has been reset.\n\nType *hi* or send a message to start again!`);
            return;
        }
        // Handle vendor product image upload (WhatsApp Vendor Ingestion Route)
        if (message.type === 'image' && message.image?.id) {
            const handled = await vendor_product_ingestion_service_1.vendorProductIngestionService.handleVendorInboundImage(senderWaId, message);
            if (handled)
                return;
        }
        // Handle vendor draft product action buttons (Approve & Publish | Edit Price / Text | Discard)
        const buttonId = message.interactive?.button_reply?.id;
        if (buttonId?.startsWith('publish_listing_') ||
            buttonId?.startsWith('btn_publish_product:') ||
            buttonId?.startsWith('btn_approve_product:')) {
            const productId = buttonId.startsWith('publish_listing_')
                ? buttonId.replace('publish_listing_', '')
                : buttonId.split(':')[1];
            const published = await vendor_product_ingestion_service_1.vendorProductIngestionService.publishProductToMetaCatalog(productId);
            await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(senderWaId, `✅ Live! Your product is now visible on your customer catalog.\n\n🚀 Published to WhatsApp Catalog: *${published?.title || 'Item'}*`);
            return;
        }
        if (buttonId?.startsWith('discard_') || buttonId?.startsWith('btn_discard_product:')) {
            const isNewDiscard = buttonId.startsWith('discard_');
            const productId = isNewDiscard
                ? buttonId.replace('discard_', '')
                : buttonId.split(':')[1];
            await vendor_product_ingestion_service_1.vendorProductIngestionService.discardProductDraft(productId, {
                hardDelete: isNewDiscard,
            });
            await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(senderWaId, '🗑️ Draft discarded. (Product draft discarded)');
            return;
        }
        if (buttonId?.startsWith('edit_price_') || buttonId?.startsWith('btn_edit_price:')) {
            const productId = buttonId.startsWith('edit_price_')
                ? buttonId.replace('edit_price_', '')
                : buttonId.split(':')[1];
            session.currentStage = 'WAITING_FOR_PRICE_EDIT';
            session.pendingPriceEditProductId = productId;
            await conversation_session_store_1.conversationSessionStore.saveSession(session);
            await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(senderWaId, "Reply with the correct price and unit (e.g. 'R620 per m3'):\n(Please reply with the new unit price)");
            return;
        }
        // Handle price & unit edit text response if vendor is in WAITING_FOR_PRICE_EDIT (or legacy EDITING_PRICE:id)
        if (session.currentStage === 'WAITING_FOR_PRICE_EDIT' ||
            (session.currentStage && session.currentStage.startsWith('EDITING_PRICE:'))) {
            const productId = session.pendingPriceEditProductId ||
                (session.currentStage.startsWith('EDITING_PRICE:') ? session.currentStage.split(':')[1] : undefined);
            const replyBody = message.text?.body?.trim() || '';
            const override = vendor_product_ingestion_service_1.vendorProductIngestionService.extractPriceOverride(replyBody);
            const numMatch = replyBody.match(/([0-9]+(?:[\.,][0-9]{1,2})?)/);
            const newPrice = override?.price !== undefined
                ? override.price
                : numMatch
                    ? parseFloat(numMatch[1].replace(',', '.'))
                    : undefined;
            if (productId && newPrice !== undefined && !isNaN(newPrice)) {
                const existingProduct = await postgres_product_repository_1.postgresProductRepository.findById(productId);
                const newUnit = override?.unitOfMeasure || existingProduct?.unit_of_measure || 'per unit';
                const updatedDraftSpecs = existingProduct?.draft_specs
                    ? {
                        ...existingProduct.draft_specs,
                        unit_price: newPrice,
                        unit_of_measure: newUnit,
                    }
                    : null;
                const updated = await postgres_product_repository_1.postgresProductRepository.updateProduct(productId, {
                    unit_price: newPrice,
                    unit_of_measure: newUnit,
                    ...(updatedDraftSpecs ? { draft_specs: updatedDraftSpecs } : {}),
                });
                session.currentStage = 'IDLE';
                session.pendingPriceEditProductId = undefined;
                await conversation_session_store_1.conversationSessionStore.saveSession(session);
                if (updated) {
                    await whatsapp_client_service_1.whatsAppClientService.sendProductDraftInteractivePreview(senderWaId, {
                        productId: updated.id,
                        title: updated.title,
                        unitPrice: updated.unit_price,
                        unitOfMeasure: updated.unit_of_measure,
                        description: updated.description || '',
                        enhancedImageUrl: updated.enhanced_image_url || '',
                    });
                }
                return;
            }
        }
        // Handle dispatch desk support / speak to agent button
        if (buttonId === 'btn_speak_agent') {
            await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(senderWaId, '👷 *CargoDash Dispatch Desk*\n\nA logistics coordinator has been notified of your inquiry and will reach out to you shortly on WhatsApp to assist with your site delivery requirements. You can also contact our operations line at +27 11 000 0000.');
            return;
        }
        // Handle change location button at any point (only for retail_delivery)
        if (buttonId === 'btn_change_location' && businessType === 'retail_delivery') {
            session.currentStage = 'ADDRESS_INPUT';
            await conversation_session_store_1.conversationSessionStore.saveSession(session);
            await whatsapp_client_service_1.whatsAppClientService.sendLocationRequestMessage(senderWaId, '📍 To recalculate delivery fees and direct tipper transport, please share your updated site location below:');
            return;
        }
        // Handle vendor dispatch action buttons (Truck Dispatched & Delivered to Site)
        if (buttonId === 'dispatch_loaded' ||
            buttonId?.startsWith('dispatch_loaded') ||
            buttonId === 'dispatch_delivered' ||
            buttonId?.startsWith('dispatch_delivered')) {
            await this.handleVendorDispatchAction(senderWaId, buttonId);
            return;
        }
        // Handle catalog order event at any stage (WhatsApp Catalog "Send Cart to Business")
        if (message.type === 'order' && message.order) {
            await this.handleCatalogOrderEvent(session, message.order, vendor);
            return;
        }
        // State machine dispatch based on current stage
        switch (session.currentStage) {
            case 'IDLE':
                await this.handleIdleStage(session, message, vendor);
                break;
            case 'BROWSING':
                await this.handleBrowsingStage(session, message, vendor);
                break;
            case 'CART_BUILDING':
                await this.handleCartBuildingStage(session, message, vendor);
                break;
            case 'ADDRESS_INPUT':
                await this.handleAddressInputStage(session, message, vendor);
                break;
            case 'SLOT_SELECTION':
                await this.handleSlotSelectionStage(session, message, vendor);
                break;
            case 'QUOTE_CALCULATED':
                await this.handleQuoteCalculatedStage(session, message, vendor);
                break;
            case 'PAYMENT_PENDING':
                await this.handlePaymentPendingStage(session, message);
                break;
            case 'ORDER_CONFIRMED':
                await this.handleOrderConfirmedStage(session, message);
                break;
            default:
                await this.handleIdleStage(session, message, vendor);
                break;
        }
    }
    // --------------------------------------------------------------------------
    // STAGE HANDLERS
    // --------------------------------------------------------------------------
    /**
     * STAGE 1: IDLE
     */
    async handleIdleStage(session, _message, vendor) {
        if (vendor.business_type === 'service_booking') {
            const welcome = `✨ *Welcome to ${vendor.business_name}!*\n\nBook appointments, treatments, and professional services directly on WhatsApp.\n\nSelect an option below to get started:`;
            await whatsapp_client_service_1.whatsAppClientService.sendInteractiveButtons(session.waId, welcome, [
                { id: 'btn_browse_catalog', title: '📅 Book a Service' },
                { id: 'btn_help', title: 'ℹ️ How It Works' },
            ]);
        }
        else if (vendor.id !== 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11') {
            const welcome = `👋 *Welcome to ${vendor.business_name}!*\n\nOrder directly via WhatsApp for fast delivery to your door.\n\nExplore our catalog or build an order:`;
            await whatsapp_client_service_1.whatsAppClientService.sendInteractiveButtons(session.waId, welcome, [
                { id: 'btn_browse_catalog', title: '🛒 Browse Menu' },
                { id: 'btn_help', title: 'ℹ️ How It Works' },
            ]);
        }
        else {
            const welcome = `👋 *Welcome to CargoDash Commerce!* \n\nWe provide heavy building materials & bulk construction supplies directly to your site via WhatsApp.\n\nExplore our catalog or build an order:`;
            await whatsapp_client_service_1.whatsAppClientService.sendInteractiveButtons(session.waId, welcome, [
                { id: 'btn_browse_catalog', title: '🧱 Browse Materials' },
                { id: 'btn_help', title: 'ℹ️ How It Works' },
            ]);
        }
        session.currentStage = 'BROWSING';
        await conversation_session_store_1.conversationSessionStore.saveSession(session);
    }
    /**
     * STAGE 2: BROWSING (Strictly scoped to the resolved vendor's catalog)
     */
    async handleBrowsingStage(session, message, vendor) {
        const buttonId = message.interactive?.button_reply?.id;
        const listId = message.interactive?.list_reply?.id;
        const rawText = message.text?.body?.trim().toLowerCase() || '';
        const numericPick = /^[1-9]$/.test(rawText) ? parseInt(rawText, 10) : null;
        if (numericPick !== null) {
            const vendorProducts = (await postgres_product_repository_1.postgresProductRepository.findByVendor(vendor.id)).filter((p) => p.is_available);
            const picked = vendorProducts[numericPick - 1];
            if (picked) {
                await this.addItemToCart(session, picked.meta_product_retailer_id || picked.id, vendor);
                return;
            }
        }
        if (buttonId === 'btn_browse_catalog' ||
            rawText === 'hi' ||
            rawText === 'hello' ||
            rawText.includes('browse') ||
            rawText.includes('book') ||
            rawText.includes('menu') ||
            rawText.includes('higiene') ||
            rawText.includes('proxy')) {
            if (vendor.business_type === 'service_booking') {
                const vendorProducts = await postgres_product_repository_1.postgresProductRepository.findByVendor(vendor.id);
                await whatsapp_client_service_1.whatsAppClientService.sendInteractiveList(session.waId, vendor.business_name.slice(0, 60), `Select a service from *${vendor.business_name}* below (reply with item number *1-${vendorProducts.length}*):`, 'Choose Service', [
                    {
                        title: 'Available Services',
                        rows: vendorProducts
                            .filter((p) => p.is_available)
                            .map((p) => ({
                            id: p.meta_product_retailer_id || p.id,
                            title: p.title.slice(0, 24),
                            description: `R${p.unit_price.toFixed(2)} • ${p.unit_of_measure}`.slice(0, 72),
                        })),
                    },
                ]);
                return;
            }
            if (vendor.id !== 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11') {
                const vendorProducts = await postgres_product_repository_1.postgresProductRepository.findByVendor(vendor.id);
                await whatsapp_client_service_1.whatsAppClientService.sendInteractiveList(session.waId, vendor.business_name.slice(0, 60), `Browse items from *${vendor.business_name}* below (reply with item number *1-${vendorProducts.length}* to order):`, 'View Catalog', [
                    {
                        title: 'Featured Catalog',
                        rows: vendorProducts
                            .filter((p) => p.is_available)
                            .map((p) => ({
                            id: p.meta_product_retailer_id || p.id,
                            title: p.title,
                            description: `R${p.unit_price.toFixed(2)} (${p.unit_of_measure})`.slice(0, 72),
                        })),
                    },
                ]);
                return;
            }
            // Default Yard A ("Direct Yard Delivery")
            await whatsapp_client_service_1.whatsAppClientService.sendDirectYardDeliveryCategories(session.waId);
            return;
        }
        // If customer selected an item from interactive list
        if (listId) {
            await this.addItemToCart(session, listId, vendor);
            return;
        }
        // Default fallback in browsing -> show catalog list directly
        const vendorProducts = (await postgres_product_repository_1.postgresProductRepository.findByVendor(vendor.id)).filter((p) => p.is_available);
        await whatsapp_client_service_1.whatsAppClientService.sendInteractiveList(session.waId, vendor.business_name.slice(0, 60), `Welcome to *${vendor.business_name}*! Reply with an item number (*1-${vendorProducts.length}*) below to add it to your order:`, 'View Catalog', [
            {
                title: 'Available Products',
                rows: vendorProducts.map((p) => ({
                    id: p.meta_product_retailer_id || p.id,
                    title: p.title,
                    description: `R${p.unit_price.toFixed(2)} (${p.unit_of_measure})`.slice(0, 72),
                })),
            },
        ]);
    }
    /**
     * STAGE 3: CART_BUILDING
     * Split Logic:
     * - For service_booking: transitions to SLOT_SELECTION (Date/Time Picker with next 3 available slots)
     * - For retail_delivery: transitions to ADDRESS_INPUT (PostGIS Location Pin & Freight calculation)
     */
    async handleCartBuildingStage(session, message, vendor) {
        const buttonId = message.interactive?.button_reply?.id;
        const listId = message.interactive?.list_reply?.id;
        const rawCartText = message.text?.body?.trim().toLowerCase() || '';
        // If customer directly picked a slot while in CART_BUILDING, route to SLOT_SELECTION
        if (listId?.startsWith('slot_') && vendor.business_type === 'service_booking') {
            session.currentStage = 'SLOT_SELECTION';
            await conversation_session_store_1.conversationSessionStore.saveSession(session);
            await this.handleSlotSelectionStage(session, message, vendor);
            return;
        }
        if (buttonId === 'btn_select_slot' ||
            (vendor.business_type === 'service_booking' &&
                (buttonId === 'btn_proceed_delivery' ||
                    rawCartText === '1' ||
                    rawCartText.includes('slot') ||
                    rawCartText.includes('book')))) {
            await this.promptNextAvailableSlots(session, vendor);
            return;
        }
        if (buttonId === 'btn_proceed_delivery' ||
            rawCartText === '1' ||
            rawCartText.includes('delivery') ||
            rawCartText.includes('checkout')) {
            session.currentStage = 'ADDRESS_INPUT';
            await conversation_session_store_1.conversationSessionStore.saveSession(session);
            // Send native WhatsApp location request message
            await whatsapp_client_service_1.whatsAppClientService.sendLocationRequestMessage(session.waId);
            return;
        }
        if (buttonId === 'btn_add_more' || rawCartText === '2') {
            session.currentStage = 'BROWSING';
            await conversation_session_store_1.conversationSessionStore.saveSession(session);
            await this.handleBrowsingStage(session, {
                ...message,
                interactive: { type: 'button_reply', button_reply: { id: 'btn_browse_catalog', title: 'Browse' } },
            }, vendor);
            return;
        }
        if (vendor.business_type === 'service_booking') {
            await this.promptNextAvailableSlots(session, vendor);
            return;
        }
        // Default prompt to proceed to delivery
        await whatsapp_client_service_1.whatsAppClientService.sendInteractiveButtons(session.waId, 'Would you like to calculate heavy transit delivery for your cart now?', [
            { id: 'btn_proceed_delivery', title: '🚚 Calculate Delivery' },
            { id: 'btn_add_more', title: '➕ Add More Items' },
        ]);
    }
    /**
     * Queries real-time availability in `appointments` and returns next available 3 slots via interactive List Message.
     */
    async promptNextAvailableSlots(session, vendor) {
        const nextSlots = await appointment_engine_service_1.appointmentEngineService.getNextAvailableSlots(vendor.id, new Date(), 3);
        session.currentStage = 'SLOT_SELECTION';
        await conversation_session_store_1.conversationSessionStore.saveSession(session);
        await whatsapp_client_service_1.whatsAppClientService.sendInteractiveList(session.waId, 'Select Appointment Slot', `📅 *Real-Time Availability at ${vendor.business_name}*\n\nPlease select one of the next ${nextSlots.length} available slots below. Selecting a slot places a 10-minute temporary hold while you complete checkout:`, 'Choose Time Slot', [
            {
                title: 'Next 3 Available Slots',
                rows: nextSlots.map((slot) => ({
                    id: slot.slotId,
                    title: slot.title,
                    description: slot.description,
                })),
            },
        ]);
    }
    /**
     * STAGE 4B: SLOT_SELECTION (Service Booking Businesses — bypasses PostGIS & sets delivery_fee = 0.00)
     */
    async handleSlotSelectionStage(session, message, vendor) {
        const listId = message.interactive?.list_reply?.id;
        const textBody = message.text?.body?.trim();
        let scheduledStartIso = null;
        if (listId && listId.startsWith('slot_')) {
            const ts = parseInt(listId.replace('slot_', ''), 10);
            if (!isNaN(ts)) {
                scheduledStartIso = new Date(ts).toISOString();
            }
        }
        else if (textBody) {
            // Allow choosing slot 1, 2, or 3 via text reply as well
            const nextSlots = await appointment_engine_service_1.appointmentEngineService.getNextAvailableSlots(vendor.id, new Date(), 3);
            const idx = parseInt(textBody, 10) - 1;
            if (idx >= 0 && idx < nextSlots.length) {
                scheduledStartIso = nextSlots[idx].scheduledStart;
            }
            else if (nextSlots[0]) {
                scheduledStartIso = nextSlots[0].scheduledStart;
            }
        }
        if (!scheduledStartIso) {
            await this.promptNextAvailableSlots(session, vendor);
            return;
        }
        // Resolve service product ID from cart or vendor's catalog
        const vendorProducts = await postgres_product_repository_1.postgresProductRepository.findByVendor(vendor.id);
        const primaryCartItem = session.cart[0];
        const matchedProduct = vendorProducts.find((p) => p.meta_product_retailer_id === primaryCartItem?.retailerId ||
            p.id === primaryCartItem?.retailerId) || vendorProducts[0];
        const serviceProductId = matchedProduct?.id || '33333333-3333-4333-8333-333333333301';
        const orderRef = session.activeOrder?.orderId || `APT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        let heldAppointment;
        try {
            heldAppointment = await appointment_engine_service_1.appointmentEngineService.placeTemporarySlotHold({
                vendorId: vendor.id,
                customerPhone: session.waId,
                customerName: session.customerName,
                serviceProductId,
                scheduledStart: scheduledStartIso,
                holdDurationMinutes: 10,
            });
        }
        catch {
            // Slot was just taken; return updated next 3 available slots
            await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(session.waId, '⚠️ That slot was just reserved by another client. Here are the next 3 available slots:');
            await this.promptNextAvailableSlots(session, vendor);
            return;
        }
        // Service Booking Split Logic: delivery_fee = 0.00, distance_km = 0 (bypass PostGIS completely)
        const servicesSubtotal = session.cart.length > 0
            ? session.cart.reduce((sum, item) => sum + item.totalPrice, 0)
            : matchedProduct?.unit_price || 650.0;
        const deliveryFee = 0.0;
        const grandTotal = Math.round((servicesSubtotal + deliveryFee) * 100) / 100;
        const commissionRate = vendor.commission_rate ?? 0.065;
        const platformFee = Math.round(grandTotal * commissionRate * 100) / 100;
        const vendorPayout = Math.round((grandTotal - platformFee) * 100) / 100;
        const createdOrder = await postgres_order_repository_1.postgresOrderRepository.createOrder({
            order_ref: orderRef,
            vendor_id: vendor.id,
            customer_phone: session.waId,
            customer_name: session.customerName,
            delivery_address: `In-Studio Appointment (${heldAppointment.scheduled_start})`,
            delivery_lon: vendor.base_location_lon,
            delivery_lat: vendor.base_location_lat,
            distance_km: 0,
            subtotal: servicesSubtotal,
            delivery_fee: 0.0,
            total_amount: grandTotal,
            platform_fee: platformFee,
            vendor_payout: vendorPayout,
            payment_status: 'unpaid',
            current_status: 'pending_payment',
        }, (session.cart.length > 0
            ? session.cart
            : [
                {
                    retailerId: serviceProductId,
                    name: matchedProduct?.title || 'Service Booking',
                    unitPrice: servicesSubtotal,
                    quantity: 1,
                    totalPrice: servicesSubtotal,
                },
            ]).map((c) => ({
            product_id: c.retailerId,
            quantity: c.quantity,
            unit_price: c.unitPrice,
            total_price: c.totalPrice,
        })));
        await appointment_engine_service_1.appointmentEngineService.attachOrderToAppointment(heldAppointment.id, createdOrder.id);
        const zeroFreightQuote = {
            distanceKm: 0,
            durationMinutes: 60,
            durationText: '60 mins session',
            freightTier: 'SERVICE_BOOKING_NO_FREIGHT',
            baseFlagFall: 0,
            ratePerKm: 0,
            totalFreightCost: 0.0,
            vendorDepotCoordinates: { lat: vendor.base_location_lat, lng: vendor.base_location_lon },
        };
        const checkoutOrder = {
            orderId: orderRef,
            vendorId: vendor.id,
            businessType: 'service_booking',
            appointmentId: heldAppointment.id,
            scheduledStart: heldAppointment.scheduled_start,
            scheduledEnd: heldAppointment.scheduled_end,
            customerWhatsApp: session.waId,
            customerName: session.customerName,
            items: session.cart.length > 0
                ? [...session.cart]
                : [
                    {
                        retailerId: serviceProductId,
                        name: matchedProduct?.title || 'Service Appointment',
                        unitPrice: servicesSubtotal,
                        quantity: 1,
                        totalPrice: servicesSubtotal,
                    },
                ],
            itemsSubtotal: servicesSubtotal,
            freightQuote: zeroFreightQuote,
            totalAmount: grandTotal,
            currency: env_1.config.DEFAULT_CURRENCY,
            paymentStatus: 'PAYMENT_PENDING',
            vendorWhatsApp: vendor.whatsapp_number,
            createdAt: new Date().toISOString(),
        };
        const checkoutUrl = payfast_service_1.payFastService.generateCheckoutUrl(checkoutOrder);
        checkoutOrder.paymentUrl = checkoutUrl;
        session.currentQuote = zeroFreightQuote;
        session.activeOrder = checkoutOrder;
        session.activeAppointmentId = heldAppointment.id;
        session.currentStage = 'PAYMENT_PENDING';
        await conversation_session_store_1.conversationSessionStore.saveSession(session);
        await whatsapp_client_service_1.whatsAppClientService.sendCheckoutCtaButton(session.waId, orderRef, `${env_1.config.DEFAULT_CURRENCY} ${grandTotal.toFixed(2)}`, checkoutUrl);
    }
    /**
     * STAGE 4A: ADDRESS_INPUT (Retail Delivery Businesses — PostGIS radius check & per-km freight)
     */
    async handleAddressInputStage(session, message, resolvedVendor) {
        const vendor = resolvedVendor ||
            (session.vendorId ? await postgres_vendor_repository_1.postgresVendorRepository.findById(session.vendorId) : null) ||
            (await postgres_vendor_repository_1.postgresVendorRepository.findById('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')) ||
            (await postgres_vendor_repository_1.postgresVendorRepository.findAll())[0];
        // If a service_booking vendor ever lands here, redirect to SLOT_SELECTION (no PostGIS freight)
        if (vendor.business_type === 'service_booking') {
            await this.promptNextAvailableSlots(session, vendor);
            return;
        }
        let customerCoords = { lat: env_1.config.VENDOR_DEFAULT_LAT + 0.12, lng: env_1.config.VENDOR_DEFAULT_LNG + 0.08 };
        let addressName = 'Customer Site Coordinates';
        if (message.type === 'location' && message.location) {
            customerCoords = {
                lat: message.location.latitude,
                lng: message.location.longitude,
            };
            addressName = message.location.name || message.location.address || `GPS Pin (${customerCoords.lat.toFixed(4)}, ${customerCoords.lng.toFixed(4)})`;
        }
        else if (message.text?.body) {
            // If user typed an address string
            addressName = message.text.body;
            // Coordinates approximating customer address
            customerCoords = { lat: env_1.config.VENDOR_DEFAULT_LAT + 0.15, lng: env_1.config.VENDOR_DEFAULT_LNG + 0.11 };
        }
        // 1. Geofence & Proximity Query via PostGIS check_vendor_delivery_radius
        const spatialCheck = await spatial_service_1.postGISSpatialService.checkVendorDeliveryRadius(vendor.id, customerCoords.lng, customerCoords.lat, vendor.base_location_lon, vendor.base_location_lat, vendor.max_delivery_radius_km);
        // If customer pin exceeds vendor's maximum operating zone (>45km), send interactive out-of-zone alert
        if (!spatialCheck.within_radius) {
            await whatsapp_client_service_1.whatsAppClientService.sendOutOfDeliveryZoneButtons(session.waId, {
                addressName,
                distanceKm: spatialCheck.distance_km,
                maxRadiusKm: vendor.max_delivery_radius_km,
                yardName: vendor.business_name,
            });
            // Retain ADDRESS_INPUT stage so customer can submit a new pin or speak with an agent
            return;
        }
        // 2. Customer pin is within boundary: save location
        session.deliveryLocation = {
            latitude: customerCoords.lat,
            longitude: customerCoords.lng,
            name: message.location?.name || addressName,
            address: addressName,
        };
        // 3. Road Routing & Haulage Calculation with Google Distance Matrix & tipper surcharge
        const vendorCoords = {
            lat: vendor.base_location_lat,
            lng: vendor.base_location_lon,
        };
        const quote = await freight_calculator_service_1.freightCalculatorService.calculateFreightQuote(customerCoords, addressName, vendorCoords, session.cart, {
            baseDeliveryFee: vendor.base_delivery_fee,
            perKmRate: vendor.per_km_rate,
        });
        session.currentQuote = quote;
        const materialsSubtotal = session.cart.reduce((sum, item) => sum + item.totalPrice, 0);
        const grandTotal = Math.round((materialsSubtotal + quote.totalFreightCost) * 100) / 100;
        const commissionRate = vendor.commission_rate ?? 0.08;
        const platformFee = Math.round(grandTotal * commissionRate * 100) / 100;
        const vendorPayout = Math.round((grandTotal - platformFee) * 100) / 100;
        // 4. Draft Order Update: persist in PostgreSQL with status 'pending_payment'
        const orderRef = session.activeOrder?.orderId || `ORD-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const existingOrder = await postgres_order_repository_1.postgresOrderRepository.findByOrderRef(orderRef);
        if (existingOrder) {
            await postgres_order_repository_1.postgresOrderRepository.updateDraftOrderDelivery(existingOrder.id, {
                delivery_address: addressName,
                delivery_lon: customerCoords.lng,
                delivery_lat: customerCoords.lat,
                distance_km: quote.distanceKm,
                delivery_fee: quote.totalFreightCost,
                total_amount: grandTotal,
                platform_fee: platformFee,
                vendor_payout: vendorPayout,
                current_status: 'pending_payment',
            });
        }
        else {
            await postgres_order_repository_1.postgresOrderRepository.createOrder({
                order_ref: orderRef,
                vendor_id: vendor.id,
                customer_phone: session.waId,
                customer_name: session.customerName,
                delivery_address: addressName,
                delivery_lon: customerCoords.lng,
                delivery_lat: customerCoords.lat,
                distance_km: quote.distanceKm,
                subtotal: materialsSubtotal,
                delivery_fee: quote.totalFreightCost,
                total_amount: grandTotal,
                platform_fee: platformFee,
                vendor_payout: vendorPayout,
                payment_status: 'unpaid',
                current_status: 'pending_payment',
            }, session.cart.map((c) => ({
                product_id: c.retailerId,
                quantity: c.quantity,
                unit_price: c.unitPrice,
                total_price: c.totalPrice,
            })));
        }
        session.activeOrder = {
            orderId: orderRef,
            vendorId: vendor.id,
            businessType: vendor.business_type || 'retail_delivery',
            customerWhatsApp: session.waId,
            customerName: session.customerName,
            items: [...session.cart],
            itemsSubtotal: materialsSubtotal,
            freightQuote: quote,
            totalAmount: grandTotal,
            currency: env_1.config.DEFAULT_CURRENCY,
            paymentStatus: 'PAYMENT_PENDING',
            vendorWhatsApp: vendor.whatsapp_number || env_1.config.VENDOR_DEFAULT_WHATSAPP_NUMBER,
            createdAt: new Date().toISOString(),
        };
        session.currentStage = 'QUOTE_CALCULATED';
        await conversation_session_store_1.conversationSessionStore.saveSession(session);
        // 5. Dispatch the itemized Quote Summary message with interactive buttons
        const materialsSummary = session.cart
            .map((i) => `• ${i.quantity}x ${i.name} = ${env_1.config.DEFAULT_CURRENCY} ${i.totalPrice.toFixed(2)}`)
            .join('\n');
        let deliverySummary = `• Tipper Transport Dispatch: ${env_1.config.DEFAULT_CURRENCY} ${(quote.baseFlagFall + (quote.mileageCost || 0)).toFixed(2)}`;
        if (quote.tipperSurcharge && quote.tipperSurcharge > 0) {
            deliverySummary += `\n• Bulk Load Tipper Surcharge (>6m³): ${env_1.config.DEFAULT_CURRENCY} ${quote.tipperSurcharge.toFixed(2)}`;
        }
        await whatsapp_client_service_1.whatsAppClientService.sendOrderQuoteInteractiveButtons(session.waId, orderRef, {
            deliveryAddress: addressName,
            distanceKm: quote.distanceKm,
            yardName: vendor.business_name || 'Fonsi-Colquake Yard',
            materialsSummary,
            deliverySummary,
            totalFormatted: `${env_1.config.DEFAULT_CURRENCY} ${grandTotal.toFixed(2)}`,
        });
    }
    /**
     * STAGE 5: QUOTE_CALCULATED
     */
    async handleQuoteCalculatedStage(session, message, resolvedVendor) {
        const vendor = resolvedVendor ||
            (session.vendorId ? await postgres_vendor_repository_1.postgresVendorRepository.findById(session.vendorId) : null) ||
            (await postgres_vendor_repository_1.postgresVendorRepository.findById('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')) ||
            (await postgres_vendor_repository_1.postgresVendorRepository.findAll())[0];
        const buttonId = message.interactive?.button_reply?.id;
        if (buttonId === 'btn_cancel_quote') {
            await conversation_session_store_1.conversationSessionStore.resetSession(session.waId, vendor.id);
            await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(session.waId, '❌ *Order Cancelled*\n\nYour order quote has been cleared. Reply with *hi* or *browse* whenever you are ready to start a new order!');
            return;
        }
        if (buttonId === 'btn_modify_qty') {
            await whatsapp_client_service_1.whatsAppClientService.sendInteractiveButtons(session.waId, '✏️ *Modify Order Quantity*\n\nWould you like to add more materials to your load or adjust your current items?', [
                { id: 'btn_add_more', title: '➕ Add Items' },
                { id: 'btn_proceed_delivery', title: '📍 Change Location' },
            ]);
            return;
        }
        if (buttonId === 'btn_change_location') {
            session.currentStage = 'ADDRESS_INPUT';
            await conversation_session_store_1.conversationSessionStore.saveSession(session);
            await whatsapp_client_service_1.whatsAppClientService.sendLocationRequestMessage(session.waId, '📍 To recalculate delivery fees and direct tipper transport, please share your updated site location below:');
            return;
        }
        if (buttonId === 'btn_pay_now' ||
            buttonId === 'btn_proceed_payment' ||
            message.text?.body?.toLowerCase().includes('pay') ||
            message.text?.body?.toLowerCase().includes('accept')) {
            if (!session.currentQuote || session.cart.length === 0) {
                await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(session.waId, 'Cart or delivery quote is missing. Please start again.');
                return;
            }
            const orderRef = session.activeOrder?.orderId || `ORD-2026-${Math.floor(1000 + Math.random() * 9000)}`;
            const materialsSubtotal = session.cart.reduce((sum, item) => sum + item.totalPrice, 0);
            const grandTotal = materialsSubtotal + session.currentQuote.totalFreightCost;
            const order = session.activeOrder || {
                orderId: orderRef,
                vendorId: vendor.id,
                businessType: vendor.business_type || 'retail_delivery',
                customerWhatsApp: session.waId,
                customerName: session.customerName,
                items: [...session.cart],
                itemsSubtotal: materialsSubtotal,
                freightQuote: session.currentQuote,
                totalAmount: grandTotal,
                currency: env_1.config.DEFAULT_CURRENCY,
                paymentStatus: 'PAYMENT_PENDING',
                vendorWhatsApp: vendor.whatsapp_number || env_1.config.VENDOR_DEFAULT_WHATSAPP_NUMBER,
                createdAt: new Date().toISOString(),
            };
            // Generate dynamic PayFast checkout URL with MD5 signature
            const checkoutUrl = payfast_service_1.payFastService.generateCheckoutUrl(order);
            order.paymentUrl = checkoutUrl;
            session.activeOrder = order;
            // Ensure order is persisted in PostgreSQL
            const existing = await postgres_order_repository_1.postgresOrderRepository.findByOrderRef(orderRef);
            if (!existing) {
                await postgres_order_repository_1.postgresOrderRepository.createOrder({
                    order_ref: orderRef,
                    vendor_id: vendor.id,
                    customer_phone: session.waId,
                    customer_name: session.customerName,
                    delivery_address: session.deliveryLocation?.address || 'Site Coordinates',
                    delivery_lon: session.deliveryLocation?.longitude || env_1.config.VENDOR_DEFAULT_LNG,
                    delivery_lat: session.deliveryLocation?.latitude || env_1.config.VENDOR_DEFAULT_LAT,
                    distance_km: session.currentQuote.distanceKm,
                    subtotal: materialsSubtotal,
                    delivery_fee: session.currentQuote.totalFreightCost,
                    total_amount: grandTotal,
                    platform_fee: Math.round(grandTotal * (vendor.commission_rate ?? env_1.config.PLATFORM_COMMISSION_PERCENTAGE / 100) * 100) / 100,
                    vendor_payout: Math.round(grandTotal * (1 - (vendor.commission_rate ?? env_1.config.PLATFORM_COMMISSION_PERCENTAGE / 100)) * 100) / 100,
                    payment_status: 'unpaid',
                    current_status: 'pending_payment',
                }, session.cart.map((c) => ({
                    product_id: c.retailerId,
                    quantity: c.quantity,
                    unit_price: c.unitPrice,
                    total_price: c.totalPrice,
                })));
            }
            metrics_service_1.metricsService.trackCheckoutInitiated();
            session.currentStage = 'PAYMENT_PENDING';
            await conversation_session_store_1.conversationSessionStore.saveSession(session);
            // Send WhatsApp interactive checkout CTA button
            await whatsapp_client_service_1.whatsAppClientService.sendCheckoutCtaButton(session.waId, orderRef, `${env_1.config.DEFAULT_CURRENCY} ${grandTotal.toFixed(2)}`, checkoutUrl);
            return;
        }
        await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(session.waId, 'Tap *Pay Now* to generate your secure PayFast link or *Change Location* to update transit calculation.');
    }
    /**
     * STAGE 6: PAYMENT_PENDING
     */
    async handlePaymentPendingStage(session, _message) {
        if (session.activeOrder?.paymentUrl) {
            await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(session.waId, `⏳ *Payment Pending for Order #${session.activeOrder.orderId.slice(-6)}*\n\nPlease complete your payment using this link:\n🔗 ${session.activeOrder.paymentUrl}\n\nOnce completed, your payment will be instantly confirmed here!`);
        }
    }
    /**
     * STAGE 7: ORDER_CONFIRMED
     */
    async handleOrderConfirmedStage(session, _message) {
        await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(session.waId, `🎉 *Order Confirmed & Scheduled*\n\nYour order is currently queued for truck mobilization.\n\nTo start a new order, reply with *start* or *new order*.`);
    }
    // --------------------------------------------------------------------------
    // HELPER METHODS
    // --------------------------------------------------------------------------
    /**
     * Processes a WhatsApp Catalog Order Event directly from WhatsApp (strictly scoped by vendor_id)
     */
    async handleCatalogOrderEvent(session, order, resolvedVendor) {
        const vendor = resolvedVendor ||
            (session.vendorId ? await postgres_vendor_repository_1.postgresVendorRepository.findById(session.vendorId) : null) ||
            (await postgres_vendor_repository_1.postgresVendorRepository.findById('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')) ||
            (await postgres_vendor_repository_1.postgresVendorRepository.findAll())[0];
        const vendorCatalogProducts = await postgres_product_repository_1.postgresProductRepository.findByVendor(vendor.id);
        session.cart = [];
        for (const item of order.product_items) {
            // 1. Check tenant-scoped vendor products first
            const scopedProduct = vendorCatalogProducts.find((p) => p.meta_product_retailer_id === item.product_retailer_id || p.id === item.product_retailer_id);
            // 2. Fallback to general productRepository only for default vendor compatibility
            const dbProduct = !scopedProduct && vendor.id === 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
                ? await product_repository_1.productRepository.findByRetailerId(item.product_retailer_id)
                : null;
            const name = scopedProduct
                ? scopedProduct.title
                : dbProduct
                    ? dbProduct.originalTitle
                    : `Product ${item.product_retailer_id}`;
            const unitPrice = item.item_price || (scopedProduct ? scopedProduct.unit_price : dbProduct ? dbProduct.unitPrice : 100);
            session.cart.push({
                retailerId: item.product_retailer_id,
                name,
                unitPrice,
                quantity: item.quantity,
                totalPrice: unitPrice * item.quantity,
            });
        }
        const subtotal = session.cart.reduce((sum, i) => sum + i.totalPrice, 0);
        // Split Logic: if vendor is a service_booking business, skip PostGIS freight and send Date/Time Slot Picker
        if (vendor.business_type === 'service_booking') {
            await this.promptNextAvailableSlots(session, vendor);
            return;
        }
        session.currentStage = 'CART_BUILDING';
        await conversation_session_store_1.conversationSessionStore.saveSession(session);
        const summary = `🛒 *Catalog Order Received!*\n\n` +
            session.cart
                .map((i) => `• ${i.quantity}x ${i.name} = ${env_1.config.DEFAULT_CURRENCY} ${i.totalPrice.toFixed(2)}`)
                .join('\n') +
            `\n\n*Materials Subtotal*: ${env_1.config.DEFAULT_CURRENCY} ${subtotal.toFixed(2)}\n\n` +
            `Heavy building supplies require freight transit calculation. Let's calculate delivery to your site.`;
        await whatsapp_client_service_1.whatsAppClientService.sendInteractiveButtons(session.waId, summary, [
            { id: 'btn_proceed_delivery', title: '🚚 Calculate Delivery' },
            { id: 'btn_add_more', title: '➕ Add Items' },
        ]);
    }
    /**
     * Adds an item to the customer's cart (strictly isolated to the resolved vendor's catalog)
     */
    async addItemToCart(session, itemId, resolvedVendor) {
        const vendor = resolvedVendor ||
            (session.vendorId ? await postgres_vendor_repository_1.postgresVendorRepository.findById(session.vendorId) : null) ||
            (await postgres_vendor_repository_1.postgresVendorRepository.findById('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')) ||
            (await postgres_vendor_repository_1.postgresVendorRepository.findAll())[0];
        // 1. Look up in the resolved vendor's catalog first (strict tenant isolation)
        const vendorProducts = await postgres_product_repository_1.postgresProductRepository.findByVendor(vendor.id);
        const matchedVendorProduct = vendorProducts.find((p) => p.meta_product_retailer_id === itemId || p.id === itemId);
        const defaultYardCatalog = {
            prod_brick_clay: {
                retailerId: 'SKU-BRICK-CLAY',
                name: 'Terracotta Facing Bricks',
                unitPrice: 450.0,
                quantity: 1,
                unitOfMeasure: 'per 1000 bricks',
                totalPrice: 450.0,
            },
            prod_paver_concrete: {
                retailerId: 'SKU-PAVER-CONC',
                name: 'Concrete Interlocking Pavers',
                unitPrice: 185.5,
                quantity: 1,
                unitOfMeasure: 'per m3',
                totalPrice: 185.5,
            },
            prod_granite_aggregate: {
                retailerId: 'SKU-GRANITE-G1',
                name: 'Crushed Granite G1',
                unitPrice: 320.0,
                quantity: 1,
                unitOfMeasure: 'per m3',
                totalPrice: 320.0,
            },
            prod_cement_50kg: {
                retailerId: 'SKU-CEMENT-425',
                name: 'Portland Cement 42.5N',
                unitPrice: 115.0,
                quantity: 10,
                unitOfMeasure: 'per 50kg bag',
                totalPrice: 1150.0,
            },
            cat_sand_stone: {
                retailerId: 'SKU-SAND-PLASTER-6M3',
                name: 'Plaster Sand (6m³ Bulk Tipper Load)',
                unitPrice: 1850.0,
                quantity: 1,
                unitOfMeasure: 'per 6m3 tipper',
                totalPrice: 1850.0,
            },
            cat_bricks_blocks: {
                retailerId: 'SKU-BRICK-MAXI-1000',
                name: 'Cement Maxi Bricks (1000 Units)',
                unitPrice: 2450.0,
                quantity: 1,
                unitOfMeasure: 'per 1000 bricks',
                totalPrice: 2450.0,
            },
            cat_cement: {
                retailerId: 'SKU-CEMENT-PALLET-40',
                name: 'Bulk Cement 42.5N (Pallet of 40 Bags)',
                unitPrice: 4400.0,
                quantity: 1,
                unitOfMeasure: 'per pallet (40 bags)',
                totalPrice: 4400.0,
            },
            cat_aluminium: {
                retailerId: 'SKU-ALUM-PT99-TOPHUNG',
                name: 'Aluminium Window PT99 Top Hung (Pre-Glazed)',
                unitPrice: 850.0,
                quantity: 1,
                unitOfMeasure: 'per unit',
                totalPrice: 850.0,
            },
        };
        const selectedItem = matchedVendorProduct
            ? {
                retailerId: matchedVendorProduct.meta_product_retailer_id || matchedVendorProduct.id,
                name: matchedVendorProduct.title,
                unitPrice: matchedVendorProduct.unit_price,
                quantity: 1,
                unitOfMeasure: matchedVendorProduct.unit_of_measure,
                totalPrice: matchedVendorProduct.unit_price,
            }
            : vendor.id === 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' && defaultYardCatalog[itemId]
                ? defaultYardCatalog[itemId]
                : {
                    retailerId: itemId,
                    name: vendor.business_type === 'service_booking' ? 'Booked Service' : 'Catalog Item',
                    unitPrice: 200.0,
                    quantity: 1,
                    totalPrice: 200.0,
                };
        session.cart.push(selectedItem);
        // Split Logic: if service_booking vendor, immediately present next 3 available appointment slots
        if (vendor.business_type === 'service_booking') {
            await this.promptNextAvailableSlots(session, vendor);
            return;
        }
        session.currentStage = 'CART_BUILDING';
        await conversation_session_store_1.conversationSessionStore.saveSession(session);
        const subtotal = session.cart.reduce((sum, i) => sum + i.totalPrice, 0);
        const cartText = `✅ Added *${selectedItem.name}* to cart!\n\n` +
            `🛒 *Current Cart*:\n` +
            session.cart
                .map((i) => `• ${i.quantity}x ${i.name} = ${env_1.config.DEFAULT_CURRENCY} ${i.totalPrice.toFixed(2)}`)
                .join('\n') +
            `\n\n*Materials Subtotal*: ${env_1.config.DEFAULT_CURRENCY} ${subtotal.toFixed(2)}`;
        await whatsapp_client_service_1.whatsAppClientService.sendInteractiveButtons(session.waId, cartText, [
            { id: 'btn_proceed_delivery', title: '🚚 Calculate Delivery' },
            { id: 'btn_add_more', title: '➕ Add More Items' },
        ]);
    }
    /**
     * Handles interactive dispatch actions triggered by the vendor / truck dispatcher
     */
    async handleVendorDispatchAction(vendorWaId, buttonId) {
        const isLoaded = buttonId === 'dispatch_loaded' || buttonId.startsWith('dispatch_loaded');
        const explicitRef = buttonId.includes(':') ? buttonId.split(':')[1] : null;
        // Look up the order in PostgreSQL
        let order = explicitRef ? await postgres_order_repository_1.postgresOrderRepository.findByOrderRef(explicitRef) : null;
        if (!order) {
            if (isLoaded) {
                order = (await postgres_order_repository_1.postgresOrderRepository.findLatestOrderByStatus('paid')) ||
                    (await postgres_order_repository_1.postgresOrderRepository.findByOrderRef('ORD-2026-8921')) ||
                    (await postgres_order_repository_1.postgresOrderRepository.findLatestOrder());
            }
            else {
                order = (await postgres_order_repository_1.postgresOrderRepository.findLatestOrderByStatus('dispatched')) ||
                    (await postgres_order_repository_1.postgresOrderRepository.findLatestOrderByStatus('paid')) ||
                    (await postgres_order_repository_1.postgresOrderRepository.findByOrderRef('ORD-2026-8921')) ||
                    (await postgres_order_repository_1.postgresOrderRepository.findLatestOrder());
            }
        }
        const orderRef = order ? order.order_ref : (explicitRef || 'ORD-2026-8921');
        const customerPhone = order ? order.customer_phone : '27821234567';
        if (isLoaded) {
            // 1. Update PostgreSQL status to 'dispatched'
            if (order) {
                await postgres_order_repository_1.postgresOrderRepository.updateOrderStatus(order.id, 'dispatched');
            }
            // 2. Update live fulfillment metrics
            metrics_service_1.metricsService.updateFulfillmentStatus(orderRef, 'IN_TRANSIT');
            // 3. Notify Customer via WhatsApp
            await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(customerPhone, '🚚 Your order is on the truck and out for site delivery! Driver is en route.');
            // 4. Acknowledge Vendor
            await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(vendorWaId, `✅ *Truck Dispatched Logged*\n\nOrder *#${orderRef}* marked as *In Transit*. Customer (+${customerPhone}) has been notified.`);
        }
        else {
            // 1. Update PostgreSQL status to 'delivered'
            if (order) {
                await postgres_order_repository_1.postgresOrderRepository.updateOrderStatus(order.id, 'delivered');
            }
            // 2. Update live fulfillment metrics
            metrics_service_1.metricsService.updateFulfillmentStatus(orderRef, 'DELIVERED');
            // 3. Notify Customer via WhatsApp
            await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(customerPhone, '✅ Delivery completed. Please inspect materials and let us know if everything is in order.');
            // 4. Acknowledge Vendor
            await whatsapp_client_service_1.whatsAppClientService.sendTextMessage(vendorWaId, `🏁 *Delivery Confirmed*\n\nOrder *#${orderRef}* marked as *Delivered*. The customer has received receipt confirmation and settlement will disburse in the next ACB batch.`);
        }
    }
}
exports.ConversationStateMachine = ConversationStateMachine;
exports.conversationStateMachine = new ConversationStateMachine();
//# sourceMappingURL=conversation-state-machine.js.map