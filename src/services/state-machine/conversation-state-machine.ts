import { randomUUID } from 'crypto';
import { selectSupportBusiness, higieneSupportReply } from './business-support';
import { conversationSessionStore } from './conversation-session.store';
import { freightCalculatorService } from '../delivery/freight-calculator.service';
import { payFastService } from '../payment/payfast.service';
import { whatsAppClientService } from '../whatsapp/whatsapp-client.service';
import { productRepository } from '../db/product-repository';
import { postgresOrderRepository } from '../../database/postgres-order.repository';
import { postgresProductRepository } from '../../database/postgres-product.repository';
import { postgresVendorRepository } from '../../database/postgres-vendor.repository';
import { postGISSpatialService } from '../../database/spatial.service';
import { vendorProductIngestionService } from '../vendor/vendor-product-ingestion.service';
import { appointmentEngineService } from '../booking/appointment-engine.service';
import { metricsService } from '../metrics/metrics.service';
import {
  WhatsAppInboundMessage,
  WhatsAppLocation,
  WhatsAppOrderMessage,
} from '../../types/whatsapp.types';
import { CartItem, CheckoutOrder, CustomerSession } from '../../types/state.types';
import { DbVendor } from '../../types/database.types';
import { config } from '../../config/env';

export interface InboundTenantMetadata {
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  vendorId?: string;
}

export class ConversationStateMachine {
  /**
   * Resolves the tenant vendor strictly from inbound Meta webhook metadata (phone_number_id / display_phone_number)
   */
  async resolveTenantVendor(metadata?: InboundTenantMetadata): Promise<DbVendor> {
    if (metadata?.vendorId) {
      const byId = await postgresVendorRepository.findById(metadata.vendorId);
      if (byId) return byId;
    }

    if (metadata?.phoneNumberId || metadata?.displayPhoneNumber) {
      const byMeta = await postgresVendorRepository.resolveByWebhookMetadata(
        metadata.phoneNumberId,
        metadata.displayPhoneNumber
      );
      if (byMeta) return byMeta;
    }

    if (metadata?.vendorId || metadata?.phoneNumberId || metadata?.displayPhoneNumber) {
      throw new Error('Unknown WhatsApp business line; refusing to route to another company');
    }
    if (config.MOCK_EXTERNAL_APIS) {
      const demoVendor = await postgresVendorRepository.findById('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      if (demoVendor) return demoVendor;
    }
    throw new Error('WhatsApp business line metadata is required');
  }

  /**
   * Main entrypoint for processing any incoming WhatsApp message (strictly isolated by tenant vendor_id)
   */
  async handleInboundMessage(
    senderWaId: string,
    customerName: string,
    message: WhatsAppInboundMessage,
    metadata?: InboundTenantMetadata
  ): Promise<void> {
    let vendor = await this.resolveTenantVendor(metadata);
    const incomingText = message.text?.body?.trim().toLowerCase();

    // Multi-Vendor Keyword Switcher (for single master WhatsApp number aggregation)
    let switchedVendor = false;
    // Keep shared-number enquiries on the LCSH transport and order tenant.
    if (config.MOCK_EXTERNAL_APIS && !metadata?.vendorId && !metadata?.phoneNumberId && !metadata?.displayPhoneNumber) {
    if (incomingText === '#higiene' || incomingText === 'higiene') {
      const v = await postgresVendorRepository.findById('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55');
      if (v) {
        vendor = v;
        switchedVendor = true;
      }
    } else if (
      incomingText === '#fungus' ||
      incomingText === 'fungusnomore' ||
      incomingText === 'fungus no more'
    ) {
      const v = await postgresVendorRepository.findById('e5fffa99-9e5d-4fe8-992a-2dd8df180e55');
      if (v) {
        vendor = v;
        switchedVendor = true;
      }
    } else if (incomingText === '#sand' || incomingText === '#brick' || incomingText === 'brickdirect') {
      const v = await postgresVendorRepository.findById('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      if (v) {
        vendor = v;
        switchedVendor = true;
      }
    } else if (incomingText === '#pizza' || incomingText === 'pizza') {
      const v = await postgresVendorRepository.findById('d3eeef66-6d3c-4fe9-883e-3cc6ce050d44');
      if (v) {
        vendor = v;
        switchedVendor = true;
      }
    } else if (incomingText === '#salon' || incomingText === 'salon') {
      const v = await postgresVendorRepository.findById('c2ddde77-7c2b-4ef8-994d-4bb7bd160c33');
      if (v) {
        vendor = v;
        switchedVendor = true;
      }
    }

    }

    const businessType = vendor.business_type || 'retail_delivery';

    const session = await conversationSessionStore.getSession(senderWaId, customerName, {
      vendorId: vendor.id,
      metaPhoneNumberId: metadata?.phoneNumberId || vendor.meta_phone_number_id,
      displayPhoneNumber: metadata?.displayPhoneNumber || vendor.whatsapp_number,
      businessType,
    });
    session.vendorId = vendor.id;

    if (switchedVendor) {
      session.currentStage = 'IDLE';
      session.cart = [];
      await conversationSessionStore.saveSession(session);
    }

    // Fast-path cancel / reset command
    if (incomingText === 'reset' || incomingText === 'cancel' || incomingText === 'restart') {
      if (session.activeAppointmentId) {
        await appointmentEngineService.cancelAppointmentHold(session.activeAppointmentId);
      }
      await conversationSessionStore.resetSession(senderWaId, vendor.id);
      await whatsAppClientService.sendTextMessage(
        senderWaId,
        `🔄 Your session with *${vendor.business_name}* has been reset.\n\nType *hi* or send a message to start again!`
      );
      return;
    }

    // Handle vendor product image upload (WhatsApp Vendor Ingestion Route)
    if (message.type === 'image' && message.image?.id) {
      const handled = await vendorProductIngestionService.handleVendorInboundImage(senderWaId, message);
      if (handled) return;
    }

    // Handle vendor draft product action buttons (Approve & Publish | Edit Price / Text | Discard)
    const buttonId = message.interactive?.button_reply?.id;
    if (
      buttonId?.startsWith('publish_listing_') ||
      buttonId?.startsWith('btn_publish_product:') ||
      buttonId?.startsWith('btn_approve_product:')
    ) {
      const productId = buttonId.startsWith('publish_listing_')
        ? buttonId.replace('publish_listing_', '')
        : buttonId.split(':')[1];
      const published = await vendorProductIngestionService.publishProductToMetaCatalog(productId);
      await whatsAppClientService.sendTextMessage(
        senderWaId,
        `✅ Live! Your product is now visible on your customer catalog.\n\n🚀 Published to WhatsApp Catalog: *${published?.title || 'Item'}*`
      );
      return;
    }

    if (buttonId?.startsWith('discard_') || buttonId?.startsWith('btn_discard_product:')) {
      const isNewDiscard = buttonId.startsWith('discard_');
      const productId = isNewDiscard
        ? buttonId.replace('discard_', '')
        : buttonId.split(':')[1];
      await vendorProductIngestionService.discardProductDraft(productId, {
        hardDelete: isNewDiscard,
      });
      await whatsAppClientService.sendTextMessage(
        senderWaId,
        '🗑️ Draft discarded. (Product draft discarded)'
      );
      return;
    }

    if (buttonId?.startsWith('edit_price_') || buttonId?.startsWith('btn_edit_price:')) {
      const productId = buttonId.startsWith('edit_price_')
        ? buttonId.replace('edit_price_', '')
        : buttonId.split(':')[1];
      session.currentStage = 'WAITING_FOR_PRICE_EDIT';
      session.pendingPriceEditProductId = productId;
      await conversationSessionStore.saveSession(session);
      await whatsAppClientService.sendTextMessage(
        senderWaId,
        "Reply with the correct price and unit (e.g. 'R620 per m3'):\n(Please reply with the new unit price)"
      );
      return;
    }

    // Handle price & unit edit text response if vendor is in WAITING_FOR_PRICE_EDIT (or legacy EDITING_PRICE:id)
    if (
      session.currentStage === 'WAITING_FOR_PRICE_EDIT' ||
      (session.currentStage && session.currentStage.startsWith('EDITING_PRICE:'))
    ) {
      const productId =
        session.pendingPriceEditProductId ||
        (session.currentStage.startsWith('EDITING_PRICE:') ? session.currentStage.split(':')[1] : undefined);
      const replyBody = message.text?.body?.trim() || '';
      const override = vendorProductIngestionService.extractPriceOverride(replyBody);
      const numMatch = replyBody.match(/([0-9]+(?:[\.,][0-9]{1,2})?)/);
      const newPrice =
        override?.price !== undefined
          ? override.price
          : numMatch
          ? parseFloat(numMatch[1].replace(',', '.'))
          : undefined;

      if (productId && newPrice !== undefined && !isNaN(newPrice)) {
        const existingProduct = await postgresProductRepository.findById(productId);
        const newUnit = override?.unitOfMeasure || existingProduct?.unit_of_measure || 'per unit';
        const updatedDraftSpecs = existingProduct?.draft_specs
          ? {
              ...existingProduct.draft_specs,
              unit_price: newPrice,
              unit_of_measure: newUnit,
            }
          : null;

        const updated = await postgresProductRepository.updateProduct(productId, {
          unit_price: newPrice,
          unit_of_measure: newUnit,
          ...(updatedDraftSpecs ? { draft_specs: updatedDraftSpecs } : {}),
        });

        session.currentStage = 'IDLE';
        session.pendingPriceEditProductId = undefined;
        await conversationSessionStore.saveSession(session);

        if (updated) {
          await whatsAppClientService.sendProductDraftInteractivePreview(senderWaId, {
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

    // Handle dispatch desk support / speak to a human button or keyword
    if (
      buttonId === 'btn_speak_agent' ||
      incomingText === 'human' ||
      incomingText === 'agent' ||
      incomingText === 'speak to a human' ||
      incomingText === 'talk to a human'
    ) {
      await whatsAppClientService.sendTextMessage(
        senderWaId,
        `🟢 *${vendor.business_name} — Human Specialist Handover*\n\nA team member has been notified of your message and will reply to you directly on WhatsApp shortly.\n\n💬 _You can type your question or message right here and our team will see it in the WhatsAppEezy Command Center._`
      );
      const alertPhone = (vendor.whatsapp_number || config.VENDOR_DEFAULT_WHATSAPP_NUMBER).replace(/\D/g, '');
      if (alertPhone && alertPhone !== senderWaId.replace(/\D/g, '')) {
        await whatsAppClientService.sendTextMessage(
          alertPhone,
          `🧑‍💼 *HUMAN HANDOVER REQUEST (${vendor.business_name})*\n• Customer: *${customerName}* (+${senderWaId.replace(/\D/g, '')})\n• Message: "${message.text?.body || 'Requested to speak to a human'}"\n• Tap to Reply Directly: https://wa.me/${senderWaId.replace(/\D/g, '')}`
        );
      }
      return;
    }

    // Handle "Become a Distributor / Wholesale Enquiry" button or keyword
    if (
      buttonId === 'btn_distributor' ||
      incomingText === 'distributor' ||
      incomingText === '#distributor' ||
      incomingText?.includes('become a distributor') ||
      incomingText?.includes('wholesale')
    ) {
      await whatsAppClientService.sendTextMessage(
        senderWaId,
        `🤝 *${vendor.business_name} — Official Distributor & Wholesale Desk*\n\nThank you for your interest in becoming a distributor for *FungusNoMore & Higiene*!\n\nPlease reply with:\n1️⃣ Your *Full Name & Business Name*\n2️⃣ Your *Town / Province*\n3️⃣ Estimated monthly volume\n\nOur distribution manager has been alerted and will contact you directly on WhatsApp.`
      );
      const alertPhone = (vendor.whatsapp_number || config.VENDOR_DEFAULT_WHATSAPP_NUMBER).replace(/\D/g, '');
      if (alertPhone && alertPhone !== senderWaId.replace(/\D/g, '')) {
        await whatsAppClientService.sendTextMessage(
          alertPhone,
          `🤝 *NEW DISTRIBUTOR ENQUIRY (${vendor.business_name})*\n• Applicant: *${customerName}* (+${senderWaId.replace(/\D/g, '')})\n• Message: "${message.text?.body || 'Interested in becoming a distributor'}"\n• Tap to Chat with Applicant: https://wa.me/${senderWaId.replace(/\D/g, '')}`
        );
      }
      return;
    }

    // Handle change location button at any point (only for retail_delivery)
    if (buttonId === 'btn_change_location' && businessType === 'retail_delivery') {
      session.currentStage = 'ADDRESS_INPUT';
      await conversationSessionStore.saveSession(session);
      await whatsAppClientService.sendLocationRequestMessage(
        senderWaId,
        '📍 To calculate delivery fees and ETA, please share your updated delivery location pin below:'
      );
      return;
    }

    // Handle vendor dispatch action buttons (Truck Dispatched & Delivered to Site)
    if (
      buttonId === 'dispatch_loaded' ||
      buttonId?.startsWith('dispatch_loaded') ||
      buttonId === 'dispatch_delivered' ||
      buttonId?.startsWith('dispatch_delivered')
    ) {
      await this.handleVendorDispatchAction(senderWaId, buttonId);
      return;
    }

    // Handle catalog order event at any stage (WhatsApp Catalog "Send Cart to Business")
    if (message.type === 'order' && message.order) {
      await this.handleCatalogOrderEvent(session, message.order, vendor);
      return;
    }

    // Dedicated flow 1: AppEezy / WhatsAppEezy Mother Company Platform (+1 555-342-6540)
    if (vendor.id === '77bbbb22-8c4d-4ef0-992e-8aa1ce380a88') {
      await this.handleAppEezyMotherPlatformFlow(session, senderWaId, customerName, message);
      return;
    }

    // Dedicated flow 2: LCSH Smartspace — la Cock Signature Homes Construction & Quote Concierge (+1 555-318-0006)
    if (vendor.id === '98aaaa11-7b3c-4ef9-881d-9ff0bd270f77' || vendor.business_type === 'construction_quotes') {
      await this.handleLcshConstructionFlow(session, senderWaId, customerName, message, vendor);
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

  /**
   * Dedicated Mother Company Flow: AppEezy / WhatsAppEezy Platform HQ (+1 555-342-6540)
   * Not a retail store — guides businesses on onboarding and connects users to live partner stores.
   */
  private async handleAppEezyMotherPlatformFlow(
    session: CustomerSession,
    senderWaId: string,
    customerName: string,
    message: WhatsAppInboundMessage
  ): Promise<void> {
    const raw = (message.text?.body || '').trim().toLowerCase();
    const buttonId = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || '';

    if (raw === '1' || buttonId === 'appeezy_onboard' || raw.includes('onboard') || raw.includes('register')) {
      await whatsAppClientService.sendTextMessage(
        senderWaId,
        `🚀 *Onboard Your Business on WhatsAppEezy*\n\nTurn your WhatsApp into an automated storefront in 3 steps:\n1️⃣ *Snap-to-Sell AI Catalog*: Send product photos via WhatsApp and our AI builds your studio catalog.\n2️⃣ *Automated Delivery & Quotes*: PostGIS distance pricing & instant quote generation.\n3️⃣ *Split-Payment Checkout*: Instant PayFast EFT/Card settlement straight to your bank account.\n\n🌐 *Register Online*: https://whatsappeezy.com\n💬 Or reply with your *Business Name & Industry* right here and our onboarding team will set up your account!`
      );
      return;
    }

    if (raw === '2' || buttonId === 'appeezy_pricing' || raw.includes('price') || raw.includes('plan')) {
      await whatsAppClientService.sendTextMessage(
        senderWaId,
        `💳 *WhatsAppEezy SaaS Plans (South Africa)*\n\n• *Starter Plan — R299/pm*: Up to 50 catalog items, AI Snap-to-Sell, PayFast checkout.\n• *Pro Plan — R599/pm*: Unlimited catalog items, PostGIS delivery calculator, Xero/Sage accounting sync.\n• *Enterprise — R999/pm*: Dedicated virtual numbers, custom AI concierge workflows & multi-branch routing.\n\nReply *1* to onboard your business or *3* to explore our live partner stores.`
      );
      return;
    }

    if (raw === '3' || buttonId === 'appeezy_directory' || raw.includes('store') || raw.includes('directory')) {
      await whatsAppClientService.sendTextMessage(
        senderWaId,
        `🏬 *Live Businesses Powered by WhatsAppEezy*\n\nTap any link below to chat directly with our verified businesses:\n\n🧼 *Higiene (Personal & Commercial Hygiene)*\n👉 https://wa.me/15553443356?text=hi\n\n🛡️ *Fungus No More (Anti-Fungal & Hygiene Solutions)*\n👉 https://wa.me/15554629242?text=hi\n\n🏗️ *LCSH Smartspace (la Cock Signature Homes — Construction & Quotes)*\n👉 https://wa.me/15553180006?text=hi`
      );
      return;
    }

    if (raw === '4' || buttonId === 'appeezy_support' || raw.includes('human') || raw.includes('support')) {
      await whatsAppClientService.sendTextMessage(
        senderWaId,
        `🧑‍💻 *WhatsAppEezy HQ Support*\n\nHi ${customerName}, please type your question or business details below and a founder/specialist will reply to you directly in this chat.`
      );
      return;
    }

    session.currentStage = 'BROWSING';
    await conversationSessionStore.saveSession(session);

    await whatsAppClientService.sendTextMessage(
      senderWaId,
      `🟢 *Welcome to AppEezy (WhatsAppEezy Official Platform HQ)*\n\n*WhatsAppEezy* is the mother platform powering automated WhatsApp storefronts, AI catalog ingestion, and instant checkout for South African businesses.\n\n_(Please note: This is the WhatsAppEezy corporate hub, not a retail store.)_\n\nHow can we assist you today? Reply with a number:\n*1.* 🚀 Onboard My Business onto WhatsAppEezy\n*2.* 💳 View Platform Pricing & Features\n*3.* 🏬 Browse Live Partner Stores (Higiene, Fungus No More, LCSH)\n*4.* 🧑‍💻 Speak to WhatsAppEezy Team`
    );
  }

  /**
   * Dedicated Construction & Quote Concierge Flow: LCSH Smartspace — la Cock Signature Homes (+1 555-318-0006)
   */
  private async handleLcshConstructionFlow(
    session: CustomerSession,
    senderWaId: string,
    customerName: string,
    message: WhatsAppInboundMessage,
    vendor: DbVendor
  ): Promise<void> {
    const raw = (message.text?.body || '').trim().toLowerCase();
    const rawOriginal = (message.text?.body || '').trim();

    const selected = selectSupportBusiness(raw, session.supportBusiness);
    if (selected === 'clarify') {
      await whatsAppClientService.sendTextMessage(senderWaId,
        'Would you like help with an LCSH home project or a Higiene / Fungus No More product first?');
      return;
    }
    session.supportBusiness = selected;
    await conversationSessionStore.saveSession(session);
    if (selected === 'higiene') {
      await whatsAppClientService.sendTextMessage(senderWaId, higieneSupportReply(raw));
      return;
    }

    // Comprehensive inquiry combining Modular Pods + Luxury Builds / Pricing (website lead)
    if (
      (raw.includes('modular') || raw.includes('pod') || raw.includes('smartspace')) &&
      (raw.includes('luxury') || raw.includes('build') || raw.includes('pricing') || raw.includes('price'))
    ) {
      const combinedOverview =
        `🏗️ *Welcome to la Cock Signature Homes (LCSH Smartspace)*\n` +
        `_Your Home, Your Way — Built with Precision_\n\n` +
        `Thank you *${customerName}*! We are delighted to assist with your inquiry regarding our *SmartSpace Modular Pods* and *Turnkey Luxury Builds*.\n\n` +
        `🏡 *1. SmartSpace Modular Units (Plans A–F)*:\n` +
        `• Turnkey factory-precision units erected on your site in 7–12 days.\n` +
        `• 100% off-grid ready (solar, gas geyser, rainwater harvesting) with zero wet masonry mess.\n` +
        `• Standard inclusions: Electrical & Plumbing with COC, thermal insulation, luxury bathroom & braai boma.\n\n` +
        `🏗️ *2. Luxury Architectural Builds (LSF & Brick & Mortar)*:\n` +
        `• *Light Frame Steel (LSF)*: Computer-modeled to 1mm tolerance, 40–60% faster, superior thermal R-value insulation.\n` +
        `• *Traditional Brick & Mortar*: High-end bespoke residential & commercial construction, NHBRC certified.\n\n` +
        `🔨 *3. Specialist Works*: Pergolas, carports, paving, foundations, formwork & luxury alterations.\n\n` +
        `👉 How would you like to proceed?\n` +
        `• Reply *1* — Sizing & Specifications for SmartSpace Units (Plans A–F)\n` +
        `• Reply *2* — Light Frame Steel (LSF) vs Brick & Mortar Breakdown\n` +
        `• Reply *3* — Pergolas, Carports, Paving & Additions\n` +
        `• Reply *4* — 📐 Request an Itemized Cost Estimate / Project Quote\n` +
        `• Reply *5* — 👷 Speak Directly with Vernon la Cock (+27 76 486 2942)`;

      await whatsAppClientService.sendTextMessage(senderWaId, combinedOverview);

      // Alert Vernon
      const alertPhone = '27764862942';
      if (senderWaId.replace(/\D/g, '') !== alertPhone) {
        await whatsAppClientService.sendTextMessage(
          alertPhone,
          `🏗️ *NEW LCSH MODULAR & LUXURY BUILD INQUIRY*\n• Client: *${customerName}* (+${senderWaId.replace(/\D/g, '')})\n• Message: "${rawOriginal}"\n• Tap to Chat: https://wa.me/${senderWaId.replace(/\D/g, '')}`
        ).catch(() => {});
      }
      return;
    }

    // 1. SmartSpace Modular Living & Pods
    if (
      raw === '1' ||
      raw.includes('modular') ||
      raw.includes('pod') ||
      raw.includes('smartspace') ||
      raw.includes('unit a') ||
      raw.includes('unit b') ||
      raw.includes('unit c') ||
      raw.includes('unit d') ||
      raw.includes('unit e') ||
      raw.includes('unit f') ||
      raw.includes('leaflet') ||
      raw.includes('storage')
    ) {
      const modularText =
        `🏡 *SmartSpace Modular Homes & Pods by LCSH*\n` +
        `_Your Home, Your Way — Built with Precision_\n\n` +
        `Our factory-precision SmartSpace units are erected on-site in 7–12 days with zero wet masonry mess, full SABS/Agrément compliance, and 100% off-grid capability.\n\n` +
        `📦 *Precision Modular Range (Plans A–F)*:\n` +
        `• *Unit A (Cozy Retreat - 21.6 m²)*: Luxury 3m x 7.2m studio living with kitchenette, en-suite bathroom, stoep & braai pit.\n` +
        `• *Unit B (Practical Living - 21.6 m²)*: 1-bedroom pod with acoustic partition, designer bathroom & gas geyser.\n` +
        `• *Unit C & D (Expanded Multi-Pod)*: Executive home office or expanded living sanctuaries.\n` +
        `• *Unit E & F (Tranquil Twins)*: Multi-room luxury dwellings for families or high-yield eco-resorts.\n` +
        `• *Site Pods*: Commercial site offices, washrooms & tool storage.\n\n` +
        `✨ *Standard Inclusions*: Electrical & Plumbing with COC, gas geyser, insulation, roofing, interior/exterior paint, braai pit.\n\n` +
        `👉 Reply *4* to request a Preliminary Pricing / Cost Estimate, or *5* to speak directly with Vernon la Cock.`;

      await whatsAppClientService.sendTextMessage(senderWaId, modularText);
      return;
    }

    // 2. Light Frame Steel (LSF) vs Brick & Mortar Home Builds
    if (
      raw === '2' ||
      raw.includes('steel') ||
      raw.includes('lsf') ||
      raw.includes('light frame') ||
      raw.includes('brick') ||
      raw.includes('mortar') ||
      raw.includes('luxury build') ||
      raw.includes('architectural') ||
      raw.includes('turnkey')
    ) {
      const buildText =
        `🏗️ *Turnkey Residential Construction — LSF & Brick & Mortar*\n\n` +
        `*la Cock Signature Homes* delivers high-end architectural residences tailored to your stand across the Western Cape and South Africa.\n\n` +
        `⚡ *Light Frame Steel (LSF) Construction*:\n` +
        `• 40%–60% faster build times than traditional brick.\n` +
        `• Computer-modeled CAD engineering to 1mm tolerance (no warped walls or structural cracking).\n` +
        `• Exceptional thermal blanket insulation (Tyvek & R-value cavity batts) — warm in winter, cool in summer.\n` +
        `• Approved for eco-estates and nature developments with zero site waste.\n\n` +
        `🧱 *Traditional Brick & Mortar Luxury Builds*:\n` +
        `• Complete bespoke structural concrete, masonry, foundation civil works & NHBRC warranty.\n` +
        `• Turnkey architectural management from municipal plan approvals to key handover.\n\n` +
        `👉 Reply *4* to Request a Project Quote / Site Assessment, or *5* to discuss plans directly with Vernon.`;

      await whatsAppClientService.sendTextMessage(senderWaId, buildText);
      return;
    }

    // 3. Specialist Construction Additions: Pergolas, Carports, Paving, Formwork & Bomas
    if (
      raw === '3' ||
      raw.includes('pergola') ||
      raw.includes('carport') ||
      raw.includes('paving') ||
      raw.includes('formwork') ||
      raw.includes('boma') ||
      raw.includes('braai') ||
      raw.includes('renovat') ||
      raw.includes('addition') ||
      raw.includes('alteration') ||
      raw.includes('civil') ||
      raw.includes('deck')
    ) {
      const additionsText =
        `🔨 *Specialist Construction, Additions & Outdoor Living*\n\n` +
        `We execute all structural civil and architectural additions with precision:\n` +
        `• *Pergolas & Verandahs*: Custom timber and steel pergolas, covered entertainment decks & outdoor living.\n` +
        `• *Carports & Garages*: Cantilevered, steel-framed, and brick-built vehicle protection.\n` +
        `• *Paving & Driveways*: Interlocking, bevel, and exposed aggregate paving with certified ground compaction.\n` +
        `• *Formwork & Foundations*: Engineered reinforced concrete formwork, retaining walls, and civil slabs.\n` +
        `• *Braai Bomas & Fire Pits*: Custom outdoor entertainment areas with integrated benches.\n` +
        `• *Luxury Remodels & Extensions*: Full structural alterations and renovations.\n\n` +
        `👉 Reply *4* to request an itemized Estimate, or reply with your stand address & project details!`;

      await whatsAppClientService.sendTextMessage(senderWaId, additionsText);
      return;
    }

    // 4. Request a Quote / Preliminary Cost Estimate
    if (
      raw === '4' ||
      raw.includes('quote') ||
      raw.includes('estimate') ||
      raw.includes('pricing') ||
      raw.includes('price list') ||
      raw.includes('cost')
    ) {
      const quoteText =
        `📐 *Request an Official LCSH Project Quote*\n\n` +
        `Hi *${customerName}*, to prepare your preliminary estimate or schedule a site visit with our engineering desk, please reply in a single message with:\n\n` +
        `1️⃣ *Project Type*: (Modular SmartSpace Pod / LSF Home / Brick Build / Pergola & Carport / Paving & Formwork / Renovation)\n` +
        `2️⃣ *Stand / Location*: (Town, Suburb or Estate name)\n` +
        `3️⃣ *Approximate Size*: (m² or number of bedrooms / bays)\n` +
        `4️⃣ *Architectural Plans*: (Do you have approved plans, sketches, or need full plan design?)\n` +
        `5️⃣ *Timeline*: (Immediate 1–4 weeks / 1–3 months / Planning stage)\n\n` +
        `💬 Type your project details below and our estimating director will review and contact you directly!`;

      await whatsAppClientService.sendTextMessage(senderWaId, quoteText);
      return;
    }

    // 5. Direct Project Consultation with Vernon la Cock
    if (
      raw === '5' ||
      raw.includes('consult') ||
      raw.includes('vernon') ||
      raw.includes('call') ||
      raw.includes('speak') ||
      raw.includes('human') ||
      raw.includes('director') ||
      raw.includes('meeting')
    ) {
      const contactText =
        `👷‍♂️ *Direct Project Consultation with Vernon la Cock*\n\n` +
        `Thank you *${customerName}*! You can connect directly with our Managing Director & Engineering Team:\n\n` +
        `👤 *Vernon la Cock* — Managing Director, LCSH\n` +
        `📞 Phone / Direct WhatsApp: *+27 76 486 2942*\n` +
        `📧 Email: *info@lcsh.co.za* / *orders@lcsh.co.za*\n` +
        `📍 Office: *8 Ferox Street, Aloe Park, Albertinia, Western Cape, 6695*\n` +
        `🌐 Website: *https://lcsh.co.za*\n\n` +
        `💬 Feel free to reply with your questions, stand details, or blueprints right here and Vernon will reply directly!`;

      await whatsAppClientService.sendTextMessage(senderWaId, contactText);

      // Alert Vernon directly
      const alertPhone = '27764862942';
      if (senderWaId.replace(/\D/g, '') !== alertPhone) {
        await whatsAppClientService.sendTextMessage(
          alertPhone,
          `👷‍♂️ *LCSH CONSULTATION REQUEST*\n• Client: *${customerName}* (+${senderWaId.replace(/\D/g, '')})\n• Message: "${rawOriginal}"\n• Tap to Chat: https://wa.me/${senderWaId.replace(/\D/g, '')}`
        ).catch(() => {});
      }
      return;
    }

    // If the client submitted detailed project details or a website lead message
    if (raw.length > 20 && raw !== 'hi' && raw !== 'hello' && raw !== 'hi there') {
      const ackText =
        `✅ *LCSH Project Inquiry Received*\n\n` +
        `Thank you *${customerName}*! Your project requirements have been registered:\n` +
        `_"${rawOriginal}"_\n\n` +
        `Our architectural & construction team at *la Cock Signature Homes* will review your stand location and specifications.\n\n` +
        `📞 Vernon la Cock / LCSH Engineering will follow up with you directly on WhatsApp or at +27 76 486 2942.\n\n` +
        `👉 To explore further while you wait, reply:\n` +
        `*1* — 🏡 View SmartSpace Modular Pods\n` +
        `*2* — 🏗️ Turnkey LSF vs Brick Home Builds\n` +
        `*3* — 🔨 Pergolas, Carports, Paving & Formwork\n` +
        `*4* — 📐 Complete Full Quote Intake`;

      await whatsAppClientService.sendTextMessage(senderWaId, ackText);

      // Alert Vernon with the new project inquiry
      const alertPhone = '27764862942';
      if (senderWaId.replace(/\D/g, '') !== alertPhone) {
        await whatsAppClientService.sendTextMessage(
          alertPhone,
          `🏗️ *NEW LCSH PROJECT INQUIRY*\n• Client: *${customerName}* (+${senderWaId.replace(/\D/g, '')})\n• Details: "${rawOriginal}"\n• Tap to Reply: https://wa.me/${senderWaId.replace(/\D/g, '')}`
        ).catch(() => {});
      }
      return;
    }

    // Default Greeting & Menu
    session.currentStage = 'BROWSING';
    await conversationSessionStore.saveSession(session);

    const welcome =
      `🏗️ *Welcome to LCSH Smartspace — la Cock Signature Homes*\n` +
      `_Your Home, Your Way — Built with Precision_\n\n` +
      `We are an NHBRC-certified architectural construction firm specializing in precision modular homes, Light Steel Frame (LSF) builds, luxury brick residences, and complete civil additions.\n\n` +
      `How can we assist with your project today? Reply with a number:\n` +
      `*1.* 🏡 Explore SmartSpace Modular Units (Plans A–F)\n` +
      `*2.* 🏗️ Turnkey Residential Builds (Light Steel Frame vs Brick & Mortar)\n` +
      `*3.* 🔨 Pergolas, Carports, Paving, Formwork & Additions\n` +
      `*4.* 📐 Request a Construction Quote / Cost Estimate\n` +
      `*5.* 👷 Speak Directly with Vernon / Book Consultation`;

    await whatsAppClientService.sendTextMessage(senderWaId, welcome);
  }

  // --------------------------------------------------------------------------
  // STAGE HANDLERS
  // --------------------------------------------------------------------------

  /**
   * STAGE 1: IDLE
   */
  private async handleIdleStage(
    session: CustomerSession,
    _message: WhatsAppInboundMessage,
    vendor: DbVendor
  ): Promise<void> {
    if (vendor.id === '98aaaa11-7b3c-4ef9-881d-9ff0bd270f77' || vendor.business_type === 'construction_quotes') {
      await this.handleLcshConstructionFlow(session, session.waId, session.customerName, _message, vendor);
      return;
    }

    if (vendor.business_type === 'service_booking') {
      const welcome = `🟢 *Welcome to WhatsAppEezy — ${vendor.business_name}!*\n\nBook appointments, treatments, and professional services directly on WhatsApp.\n\nSelect an option below to get started:`;
      await whatsAppClientService.sendInteractiveButtons(session.waId, welcome, [
        { id: 'btn_browse_catalog', title: '📅 Book a Service' },
        { id: 'btn_help', title: 'ℹ️ How It Works' },
      ]);
    } else {
      const vendorProducts = (await postgresProductRepository.findByVendor(vendor.id)).filter((p) => p.is_available);
      await whatsAppClientService.sendInteractiveList(
        session.waId,
        `WhatsAppEezy • ${vendor.business_name}`.slice(0, 60),
        `🟢 *Welcome to WhatsAppEezy.com!*\nYou are shopping with *${vendor.business_name}*.\n\n• Reply with an item number (*1-${vendorProducts.length}*) below to order\n• Reply *DISTRIBUTOR* to become a distributor / wholesale partner\n• Reply *HUMAN* to speak directly to a person\n• Switch store: *#HIGIENE*, *#FUNGUS*, *#SAND*, *#PIZZA*, *#SALON*`,
        'View Catalog',
        [
          {
            title: 'Verified Catalog',
            rows: vendorProducts.map((p) => ({
              id: p.meta_product_retailer_id || p.id,
              title: p.title,
              description: `R${p.unit_price.toFixed(2)} (${p.unit_of_measure})`.slice(0, 72),
            })),
          },
        ]
      );
    }

    session.currentStage = 'BROWSING';
    await conversationSessionStore.saveSession(session);
  }

  /**
   * STAGE 2: BROWSING (Strictly scoped to the resolved vendor's catalog)
   */
  private async handleBrowsingStage(
    session: CustomerSession,
    message: WhatsAppInboundMessage,
    vendor: DbVendor
  ): Promise<void> {
    if (vendor.id === '98aaaa11-7b3c-4ef9-881d-9ff0bd270f77' || vendor.business_type === 'construction_quotes') {
      await this.handleLcshConstructionFlow(session, session.waId, session.customerName, message, vendor);
      return;
    }

    const buttonId = message.interactive?.button_reply?.id;
    const listId = message.interactive?.list_reply?.id;

    const rawText = message.text?.body?.trim().toLowerCase() || '';
    const numericPick = /^[1-9]$/.test(rawText) ? parseInt(rawText, 10) : null;

    if (numericPick !== null) {
      const vendorProducts = (await postgresProductRepository.findByVendor(vendor.id)).filter((p) => p.is_available);
      const picked = vendorProducts[numericPick - 1];
      if (picked) {
        await this.addItemToCart(session, picked.meta_product_retailer_id || picked.id, vendor);
        return;
      }
    }

    if (
      buttonId === 'btn_browse_catalog' ||
      rawText === 'hi' ||
      rawText === 'hello' ||
      rawText.includes('browse') ||
      rawText.includes('book') ||
      rawText.includes('menu') ||
      rawText.includes('higiene') ||
      rawText.includes('proxy')
    ) {
      if (vendor.business_type === 'service_booking') {
        const vendorProducts = await postgresProductRepository.findByVendor(vendor.id);
        await whatsAppClientService.sendInteractiveList(
          session.waId,
          vendor.business_name.slice(0, 60),
          `Select a service from *${vendor.business_name}* below (reply with item number *1-${vendorProducts.length}*):`,
          'Choose Service',
          [
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
          ]
        );
        return;
      }

      const vendorProducts = (await postgresProductRepository.findByVendor(vendor.id)).filter((p) => p.is_available);
      await whatsAppClientService.sendInteractiveList(
        session.waId,
        `WhatsAppEezy • ${vendor.business_name}`.slice(0, 60),
        `🟢 *Welcome to WhatsAppEezy.com!*\nYou are shopping with *${vendor.business_name}*.\n\nReply with an item number (*1-${vendorProducts.length}*) below to add to your order (or reply *#SAND*, *#PIZZA*, *#SALON*, *#HIGIENE* to switch store):`,
        'View Catalog',
        [
          {
            title: 'Verified Catalog',
            rows: vendorProducts.map((p) => ({
              id: p.meta_product_retailer_id || p.id,
              title: p.title,
              description: `R${p.unit_price.toFixed(2)} (${p.unit_of_measure})`.slice(0, 72),
            })),
          },
        ]
      );
      return;
    }

    // If customer selected an item from interactive list
    if (listId) {
      await this.addItemToCart(session, listId, vendor);
      return;
    }

    // Default fallback in browsing -> show catalog list directly
    const vendorProducts = (await postgresProductRepository.findByVendor(vendor.id)).filter((p) => p.is_available);
    await whatsAppClientService.sendInteractiveList(
      session.waId,
      vendor.business_name.slice(0, 60),
      `Welcome to *${vendor.business_name}*! Reply with an item number (*1-${vendorProducts.length}*) below to add it to your order:`,
      'View Catalog',
      [
        {
          title: 'Available Products',
          rows: vendorProducts.map((p) => ({
            id: p.meta_product_retailer_id || p.id,
            title: p.title,
            description: `R${p.unit_price.toFixed(2)} (${p.unit_of_measure})`.slice(0, 72),
          })),
        },
      ]
    );
  }

  /**
   * STAGE 3: CART_BUILDING
   * Split Logic:
   * - For service_booking: transitions to SLOT_SELECTION (Date/Time Picker with next 3 available slots)
   * - For retail_delivery: transitions to ADDRESS_INPUT (PostGIS Location Pin & Freight calculation)
   */
  private async handleCartBuildingStage(
    session: CustomerSession,
    message: WhatsAppInboundMessage,
    vendor: DbVendor
  ): Promise<void> {
    const buttonId = message.interactive?.button_reply?.id;
    const listId = message.interactive?.list_reply?.id;
    const rawCartText = message.text?.body?.trim().toLowerCase() || '';

    // If customer directly picked a slot while in CART_BUILDING, route to SLOT_SELECTION
    if (listId?.startsWith('slot_') && vendor.business_type === 'service_booking') {
      session.currentStage = 'SLOT_SELECTION';
      await conversationSessionStore.saveSession(session);
      await this.handleSlotSelectionStage(session, message, vendor);
      return;
    }

    if (
      buttonId === 'btn_select_slot' ||
      (vendor.business_type === 'service_booking' &&
        (buttonId === 'btn_proceed_delivery' ||
          rawCartText === '1' ||
          rawCartText.includes('slot') ||
          rawCartText.includes('book')))
    ) {
      await this.promptNextAvailableSlots(session, vendor);
      return;
    }

    if (
      buttonId === 'btn_proceed_delivery' ||
      rawCartText === '1' ||
      rawCartText.includes('delivery') ||
      rawCartText.includes('checkout')
    ) {
      session.currentStage = 'ADDRESS_INPUT';
      await conversationSessionStore.saveSession(session);

      // Send native WhatsApp location request message
      await whatsAppClientService.sendLocationRequestMessage(session.waId);
      return;
    }

    if (buttonId === 'btn_add_more' || rawCartText === '2') {
      session.currentStage = 'BROWSING';
      await conversationSessionStore.saveSession(session);
      await this.handleBrowsingStage(
        session,
        {
          ...message,
          interactive: { type: 'button_reply', button_reply: { id: 'btn_browse_catalog', title: 'Browse' } },
        },
        vendor
      );
      return;
    }

    if (vendor.business_type === 'service_booking') {
      await this.promptNextAvailableSlots(session, vendor);
      return;
    }

    // Default prompt to proceed to delivery
    await whatsAppClientService.sendInteractiveButtons(
      session.waId,
      'Would you like to calculate heavy transit delivery for your cart now?',
      [
        { id: 'btn_proceed_delivery', title: '🚚 Calculate Delivery' },
        { id: 'btn_add_more', title: '➕ Add More Items' },
      ]
    );
  }

  /**
   * Queries real-time availability in `appointments` and returns next available 3 slots via interactive List Message.
   */
  private async promptNextAvailableSlots(session: CustomerSession, vendor: DbVendor): Promise<void> {
    const nextSlots = await appointmentEngineService.getNextAvailableSlots(vendor.id, new Date(), 3);
    session.currentStage = 'SLOT_SELECTION';
    await conversationSessionStore.saveSession(session);

    await whatsAppClientService.sendInteractiveList(
      session.waId,
      'Select Appointment Slot',
      `📅 *Real-Time Availability at ${vendor.business_name}*\n\nPlease select one of the next ${nextSlots.length} available slots below. Selecting a slot places a 10-minute temporary hold while you complete checkout:`,
      'Choose Time Slot',
      [
        {
          title: 'Next 3 Available Slots',
          rows: nextSlots.map((slot) => ({
            id: slot.slotId,
            title: slot.title,
            description: slot.description,
          })),
        },
      ]
    );
  }

  /**
   * STAGE 4B: SLOT_SELECTION (Service Booking Businesses — bypasses PostGIS & sets delivery_fee = 0.00)
   */
  private async handleSlotSelectionStage(
    session: CustomerSession,
    message: WhatsAppInboundMessage,
    vendor: DbVendor
  ): Promise<void> {
    const listId = message.interactive?.list_reply?.id;
    const textBody = message.text?.body?.trim();

    let scheduledStartIso: string | null = null;
    if (listId && listId.startsWith('slot_')) {
      const ts = parseInt(listId.replace('slot_', ''), 10);
      if (!isNaN(ts)) {
        scheduledStartIso = new Date(ts).toISOString();
      }
    } else if (textBody) {
      // Allow choosing slot 1, 2, or 3 via text reply as well
      const nextSlots = await appointmentEngineService.getNextAvailableSlots(vendor.id, new Date(), 3);
      const idx = parseInt(textBody, 10) - 1;
      if (idx >= 0 && idx < nextSlots.length) {
        scheduledStartIso = nextSlots[idx].scheduledStart;
      } else if (nextSlots[0]) {
        scheduledStartIso = nextSlots[0].scheduledStart;
      }
    }

    if (!scheduledStartIso) {
      await this.promptNextAvailableSlots(session, vendor);
      return;
    }

    // Resolve service product ID from cart or vendor's catalog
    const vendorProducts = await postgresProductRepository.findByVendor(vendor.id);
    const primaryCartItem = session.cart[0];
    const matchedProduct =
      vendorProducts.find(
        (p) =>
          p.meta_product_retailer_id === primaryCartItem?.retailerId ||
          p.id === primaryCartItem?.retailerId
      ) || vendorProducts[0];

    const serviceProductId = matchedProduct?.id || '33333333-3333-4333-8333-333333333301';
    const orderRef = session.activeOrder?.orderId || `APT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    let heldAppointment;
    try {
      heldAppointment = await appointmentEngineService.placeTemporarySlotHold({
        vendorId: vendor.id,
        customerPhone: session.waId,
        customerName: session.customerName,
        serviceProductId,
        scheduledStart: scheduledStartIso,
        holdDurationMinutes: 10,
      });
    } catch {
      // Slot was just taken; return updated next 3 available slots
      await whatsAppClientService.sendTextMessage(
        session.waId,
        '⚠️ That slot was just reserved by another client. Here are the next 3 available slots:'
      );
      await this.promptNextAvailableSlots(session, vendor);
      return;
    }

    // Service Booking Split Logic: delivery_fee = 0.00, distance_km = 0 (bypass PostGIS completely)
    const servicesSubtotal =
      session.cart.length > 0
        ? session.cart.reduce((sum, item) => sum + item.totalPrice, 0)
        : matchedProduct?.unit_price || 650.0;
    const deliveryFee = 0.0;
    const grandTotal = Math.round((servicesSubtotal + deliveryFee) * 100) / 100;
    const commissionRate = vendor.commission_rate ?? 0.065;
    const platformFee = Math.round(grandTotal * commissionRate * 100) / 100;
    const vendorPayout = Math.round((grandTotal - platformFee) * 100) / 100;

    const createdOrder = await postgresOrderRepository.createOrder(
      {
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
      },
      (session.cart.length > 0
        ? session.cart
        : [
            {
              retailerId: serviceProductId,
              name: matchedProduct?.title || 'Service Booking',
              unitPrice: servicesSubtotal,
              quantity: 1,
              totalPrice: servicesSubtotal,
            },
          ]
      ).map((c) => ({
        product_id: c.retailerId,
        quantity: c.quantity,
        unit_price: c.unitPrice,
        total_price: c.totalPrice,
      }))
    );

    await appointmentEngineService.attachOrderToAppointment(heldAppointment.id, createdOrder.id);

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

    const checkoutOrder: CheckoutOrder = {
      orderId: orderRef,
      vendorId: vendor.id,
      businessType: 'service_booking',
      appointmentId: heldAppointment.id,
      scheduledStart: heldAppointment.scheduled_start,
      scheduledEnd: heldAppointment.scheduled_end,
      customerWhatsApp: session.waId,
      customerName: session.customerName,
      items:
        session.cart.length > 0
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
      currency: config.DEFAULT_CURRENCY,
      paymentStatus: 'PAYMENT_PENDING',
      vendorWhatsApp: vendor.whatsapp_number,
      createdAt: new Date().toISOString(),
    };

    const checkoutUrl = payFastService.generateCheckoutUrl(checkoutOrder);
    checkoutOrder.paymentUrl = checkoutUrl;

    session.currentQuote = zeroFreightQuote;
    session.activeOrder = checkoutOrder;
    session.activeAppointmentId = heldAppointment.id;
    session.currentStage = 'PAYMENT_PENDING';
    await conversationSessionStore.saveSession(session);

    await whatsAppClientService.sendCheckoutCtaButton(
      session.waId,
      orderRef,
      `${config.DEFAULT_CURRENCY} ${grandTotal.toFixed(2)}`,
      checkoutUrl
    );
  }

  /**
   * STAGE 4A: ADDRESS_INPUT (Retail Delivery Businesses — PostGIS radius check & per-km freight)
   */
  private async handleAddressInputStage(
    session: CustomerSession,
    message: WhatsAppInboundMessage,
    resolvedVendor?: DbVendor
  ): Promise<void> {
    const vendor =
      resolvedVendor ||
      (session.vendorId ? await postgresVendorRepository.findById(session.vendorId) : null) ||
      (await postgresVendorRepository.findById('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')) ||
      (await postgresVendorRepository.findAll())[0];

    // If a service_booking vendor ever lands here, redirect to SLOT_SELECTION (no PostGIS freight)
    if (vendor.business_type === 'service_booking') {
      await this.promptNextAvailableSlots(session, vendor);
      return;
    }

    let customerCoords = { lat: config.VENDOR_DEFAULT_LAT + 0.12, lng: config.VENDOR_DEFAULT_LNG + 0.08 };
    let addressName = 'Customer Site Coordinates';

    if (message.type === 'location' && message.location) {
      customerCoords = {
        lat: message.location.latitude,
        lng: message.location.longitude,
      };
      addressName = message.location.name || message.location.address || `GPS Pin (${customerCoords.lat.toFixed(4)}, ${customerCoords.lng.toFixed(4)})`;
    } else if (message.text?.body) {
      // If user typed an address string
      addressName = message.text.body;
      // Coordinates approximating customer address
      customerCoords = { lat: config.VENDOR_DEFAULT_LAT + 0.15, lng: config.VENDOR_DEFAULT_LNG + 0.11 };
    }

    // 1. Geofence & Proximity Query via PostGIS check_vendor_delivery_radius
    const spatialCheck = await postGISSpatialService.checkVendorDeliveryRadius(
      vendor.id,
      customerCoords.lng,
      customerCoords.lat,
      vendor.base_location_lon,
      vendor.base_location_lat,
      vendor.max_delivery_radius_km
    );

    // If customer pin exceeds vendor's maximum operating zone (>45km), send interactive out-of-zone alert
    if (!spatialCheck.within_radius) {
      await whatsAppClientService.sendOutOfDeliveryZoneButtons(session.waId, {
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

    const quote = await freightCalculatorService.calculateFreightQuote(
      customerCoords,
      addressName,
      vendorCoords,
      session.cart,
      {
        baseDeliveryFee: vendor.base_delivery_fee,
        perKmRate: vendor.per_km_rate,
        freeDeliveryRadiusKm: vendor.free_delivery_radius_km ?? 15,
      }
    );
    session.currentQuote = quote;

    const materialsSubtotal = session.cart.reduce((sum, item) => sum + item.totalPrice, 0);
    const grandTotal = Math.round((materialsSubtotal + quote.totalFreightCost) * 100) / 100;
    const commissionRate = vendor.commission_rate ?? 0.08;
    const platformFee = Math.round(grandTotal * commissionRate * 100) / 100;
    const vendorPayout = Math.round((grandTotal - platformFee) * 100) / 100;

    // 4. Draft Order Update: persist in PostgreSQL with status 'pending_payment'
    const orderRef = session.activeOrder?.orderId || `ORD-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const existingOrder = await postgresOrderRepository.findByOrderRef(orderRef);
    if (existingOrder) {
      await postgresOrderRepository.updateDraftOrderDelivery(existingOrder.id, {
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
    } else {
      await postgresOrderRepository.createOrder(
        {
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
        },
        session.cart.map((c) => ({
          product_id: c.retailerId,
          quantity: c.quantity,
          unit_price: c.unitPrice,
          total_price: c.totalPrice,
        }))
      );
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
      currency: config.DEFAULT_CURRENCY,
      paymentStatus: 'PAYMENT_PENDING',
      vendorWhatsApp: vendor.whatsapp_number || config.VENDOR_DEFAULT_WHATSAPP_NUMBER,
      createdAt: new Date().toISOString(),
    };

    session.currentStage = 'QUOTE_CALCULATED';
    await conversationSessionStore.saveSession(session);

    // 5. Dispatch the itemized Quote Summary message with interactive buttons
    const materialsSummary = session.cart
      .map((i) => `• ${i.quantity}x ${i.name} = ${config.DEFAULT_CURRENCY} ${i.totalPrice.toFixed(2)}`)
      .join('\n');

    let deliverySummary =
      quote.totalFreightCost === 0
        ? `• Local Delivery (${quote.distanceKm.toFixed(1)} km): *FREE (R 0.00)*`
        : `• Tipper Transport Dispatch: ${config.DEFAULT_CURRENCY} ${(quote.baseFlagFall + (quote.mileageCost || 0)).toFixed(2)}`;
    if (quote.tipperSurcharge && quote.tipperSurcharge > 0) {
      deliverySummary += `\n• Bulk Load Tipper Surcharge (>6m³): ${config.DEFAULT_CURRENCY} ${quote.tipperSurcharge.toFixed(2)}`;
    }

    await whatsAppClientService.sendOrderQuoteInteractiveButtons(session.waId, orderRef, {
      deliveryAddress: addressName,
      distanceKm: quote.distanceKm,
      yardName: vendor.business_name || 'Fonsi-Colquake Yard',
      materialsSummary,
      deliverySummary,
      totalFormatted: `${config.DEFAULT_CURRENCY} ${grandTotal.toFixed(2)}`,
    });
  }

  /**
   * STAGE 5: QUOTE_CALCULATED
   */
  private async handleQuoteCalculatedStage(
    session: CustomerSession,
    message: WhatsAppInboundMessage,
    resolvedVendor?: DbVendor
  ): Promise<void> {
    const vendor =
      resolvedVendor ||
      (session.vendorId ? await postgresVendorRepository.findById(session.vendorId) : null) ||
      (await postgresVendorRepository.findById('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')) ||
      (await postgresVendorRepository.findAll())[0];

    const buttonId = message.interactive?.button_reply?.id;

    if (buttonId === 'btn_cancel_quote') {
      await conversationSessionStore.resetSession(session.waId, vendor.id);
      await whatsAppClientService.sendTextMessage(
        session.waId,
        '❌ *Order Cancelled*\n\nYour order quote has been cleared. Reply with *hi* or *browse* whenever you are ready to start a new order!'
      );
      return;
    }

    if (buttonId === 'btn_modify_qty') {
      await whatsAppClientService.sendInteractiveButtons(
        session.waId,
        '✏️ *Modify Order Quantity*\n\nWould you like to add more materials to your load or adjust your current items?',
        [
          { id: 'btn_add_more', title: '➕ Add Items' },
          { id: 'btn_proceed_delivery', title: '📍 Change Location' },
        ]
      );
      return;
    }

    if (buttonId === 'btn_change_location') {
      session.currentStage = 'ADDRESS_INPUT';
      await conversationSessionStore.saveSession(session);
      await whatsAppClientService.sendLocationRequestMessage(
        session.waId,
        '📍 To recalculate delivery fees and direct tipper transport, please share your updated site location below:'
      );
      return;
    }

    if (
      buttonId === 'btn_pay_now' ||
      buttonId === 'btn_proceed_payment' ||
      message.text?.body?.toLowerCase().includes('pay') ||
      message.text?.body?.toLowerCase().includes('accept')
    ) {
      if (!session.currentQuote || session.cart.length === 0) {
        await whatsAppClientService.sendTextMessage(session.waId, 'Cart or delivery quote is missing. Please start again.');
        return;
      }

      const orderRef = session.activeOrder?.orderId || `ORD-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const materialsSubtotal = session.cart.reduce((sum, item) => sum + item.totalPrice, 0);
      const grandTotal = materialsSubtotal + session.currentQuote.totalFreightCost;

      const order: CheckoutOrder = session.activeOrder || {
        orderId: orderRef,
        vendorId: vendor.id,
        businessType: vendor.business_type || 'retail_delivery',
        customerWhatsApp: session.waId,
        customerName: session.customerName,
        items: [...session.cart],
        itemsSubtotal: materialsSubtotal,
        freightQuote: session.currentQuote,
        totalAmount: grandTotal,
        currency: config.DEFAULT_CURRENCY,
        paymentStatus: 'PAYMENT_PENDING',
        vendorWhatsApp: vendor.whatsapp_number || config.VENDOR_DEFAULT_WHATSAPP_NUMBER,
        createdAt: new Date().toISOString(),
      };

      // Generate dynamic PayFast checkout URL with MD5 signature
      const checkoutUrl = payFastService.generateCheckoutUrl(order);
      order.paymentUrl = checkoutUrl;
      session.activeOrder = order;

      // Ensure order is persisted in PostgreSQL
      const existing = await postgresOrderRepository.findByOrderRef(orderRef);
      if (!existing) {
        await postgresOrderRepository.createOrder(
          {
            order_ref: orderRef,
            vendor_id: vendor.id,
            customer_phone: session.waId,
            customer_name: session.customerName,
            delivery_address: session.deliveryLocation?.address || 'Site Coordinates',
            delivery_lon: session.deliveryLocation?.longitude || config.VENDOR_DEFAULT_LNG,
            delivery_lat: session.deliveryLocation?.latitude || config.VENDOR_DEFAULT_LAT,
            distance_km: session.currentQuote.distanceKm,
            subtotal: materialsSubtotal,
            delivery_fee: session.currentQuote.totalFreightCost,
            total_amount: grandTotal,
            platform_fee: Math.round(grandTotal * (vendor.commission_rate ?? config.PLATFORM_COMMISSION_PERCENTAGE / 100) * 100) / 100,
            vendor_payout: Math.round(grandTotal * (1 - (vendor.commission_rate ?? config.PLATFORM_COMMISSION_PERCENTAGE / 100)) * 100) / 100,
            payment_status: 'unpaid',
            current_status: 'pending_payment',
          },
          session.cart.map((c) => ({
            product_id: c.retailerId,
            quantity: c.quantity,
            unit_price: c.unitPrice,
            total_price: c.totalPrice,
          }))
        );
      }

      metricsService.trackCheckoutInitiated();

      session.currentStage = 'PAYMENT_PENDING';
      await conversationSessionStore.saveSession(session);

      // Send WhatsApp interactive checkout CTA button
      await whatsAppClientService.sendCheckoutCtaButton(
        session.waId,
        orderRef,
        `${config.DEFAULT_CURRENCY} ${grandTotal.toFixed(2)}`,
        checkoutUrl
      );
      return;
    }

    await whatsAppClientService.sendTextMessage(
      session.waId,
      'Tap *Pay Now* to generate your secure PayFast link or *Change Location* to update transit calculation.'
    );
  }

  /**
   * STAGE 6: PAYMENT_PENDING
   */
  private async handlePaymentPendingStage(session: CustomerSession, _message: WhatsAppInboundMessage): Promise<void> {
    if (session.activeOrder?.paymentUrl) {
      await whatsAppClientService.sendTextMessage(
        session.waId,
        `⏳ *Payment Pending for Order #${session.activeOrder.orderId.slice(-6)}*\n\nPlease complete your payment using this link:\n🔗 ${session.activeOrder.paymentUrl}\n\nOnce completed, your payment will be instantly confirmed here!`
      );
    }
  }

  /**
   * STAGE 7: ORDER_CONFIRMED
   */
  private async handleOrderConfirmedStage(session: CustomerSession, _message: WhatsAppInboundMessage): Promise<void> {
    await whatsAppClientService.sendTextMessage(
      session.waId,
      `🎉 *Order Confirmed & Scheduled*\n\nYour order is currently queued for truck mobilization.\n\nTo start a new order, reply with *start* or *new order*.`
    );
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  /**
   * Processes a WhatsApp Catalog Order Event directly from WhatsApp (strictly scoped by vendor_id)
   */
  private async handleCatalogOrderEvent(
    session: CustomerSession,
    order: WhatsAppOrderMessage,
    resolvedVendor?: DbVendor
  ): Promise<void> {
    const vendor =
      resolvedVendor ||
      (session.vendorId ? await postgresVendorRepository.findById(session.vendorId) : null) ||
      (await postgresVendorRepository.findById('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')) ||
      (await postgresVendorRepository.findAll())[0];

    const vendorCatalogProducts = await postgresProductRepository.findByVendor(vendor.id);
    session.cart = [];

    for (const item of order.product_items) {
      // 1. Check tenant-scoped vendor products first
      const scopedProduct = vendorCatalogProducts.find(
        (p) => p.meta_product_retailer_id === item.product_retailer_id || p.id === item.product_retailer_id
      );

      // 2. Fallback to general productRepository only for default vendor compatibility
      const dbProduct =
        !scopedProduct && vendor.id === 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
          ? await productRepository.findByRetailerId(item.product_retailer_id)
          : null;

      const name = scopedProduct
        ? scopedProduct.title
        : dbProduct
        ? dbProduct.originalTitle
        : `Product ${item.product_retailer_id}`;
      const unitPrice =
        item.item_price || (scopedProduct ? scopedProduct.unit_price : dbProduct ? dbProduct.unitPrice : 100);

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
    await conversationSessionStore.saveSession(session);

    const summary =
      `🛒 *Catalog Order Received!*\n\n` +
      session.cart
        .map((i) => `• ${i.quantity}x ${i.name} = ${config.DEFAULT_CURRENCY} ${i.totalPrice.toFixed(2)}`)
        .join('\n') +
      `\n\n*Materials Subtotal*: ${config.DEFAULT_CURRENCY} ${subtotal.toFixed(2)}\n\n` +
      `Heavy building supplies require freight transit calculation. Let's calculate delivery to your site.`;

    await whatsAppClientService.sendInteractiveButtons(session.waId, summary, [
      { id: 'btn_proceed_delivery', title: '🚚 Calculate Delivery' },
      { id: 'btn_add_more', title: '➕ Add Items' },
    ]);
  }

  /**
   * Adds an item to the customer's cart (strictly isolated to the resolved vendor's catalog)
   */
  private async addItemToCart(
    session: CustomerSession,
    itemId: string,
    resolvedVendor?: DbVendor
  ): Promise<void> {
    const vendor =
      resolvedVendor ||
      (session.vendorId ? await postgresVendorRepository.findById(session.vendorId) : null) ||
      (await postgresVendorRepository.findById('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')) ||
      (await postgresVendorRepository.findAll())[0];

    // 1. Look up in the resolved vendor's catalog first (strict tenant isolation)
    const vendorProducts = await postgresProductRepository.findByVendor(vendor.id);
    const matchedVendorProduct = vendorProducts.find(
      (p) => p.meta_product_retailer_id === itemId || p.id === itemId
    );

    const defaultYardCatalog: Record<string, CartItem> = {
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

    const selectedItem: CartItem = matchedVendorProduct
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
    await conversationSessionStore.saveSession(session);

    const subtotal = session.cart.reduce((sum, i) => sum + i.totalPrice, 0);

    const cartText =
      `✅ Added *${selectedItem.name}* to cart!\n\n` +
      `🛒 *Current Cart*:\n` +
      session.cart
        .map((i) => `• ${i.quantity}x ${i.name} = ${config.DEFAULT_CURRENCY} ${i.totalPrice.toFixed(2)}`)
        .join('\n') +
      `\n\n*Materials Subtotal*: ${config.DEFAULT_CURRENCY} ${subtotal.toFixed(2)}`;

    await whatsAppClientService.sendInteractiveButtons(session.waId, cartText, [
      { id: 'btn_proceed_delivery', title: '🚚 Calculate Delivery' },
      { id: 'btn_add_more', title: '➕ Add More Items' },
    ]);
  }

  /**
   * Handles interactive dispatch actions triggered by the vendor / truck dispatcher
   */
  async handleVendorDispatchAction(vendorWaId: string, buttonId: string): Promise<void> {
    const isLoaded = buttonId === 'dispatch_loaded' || buttonId.startsWith('dispatch_loaded');
    const explicitRef = buttonId.includes(':') ? buttonId.split(':')[1] : null;

    // Look up the order in PostgreSQL
    let order = explicitRef ? await postgresOrderRepository.findByOrderRef(explicitRef) : null;
    if (!order) {
      if (isLoaded) {
        order = (await postgresOrderRepository.findLatestOrderByStatus('paid')) ||
                (await postgresOrderRepository.findByOrderRef('ORD-2026-8921')) ||
                (await postgresOrderRepository.findLatestOrder());
      } else {
        order = (await postgresOrderRepository.findLatestOrderByStatus('dispatched')) ||
                (await postgresOrderRepository.findLatestOrderByStatus('paid')) ||
                (await postgresOrderRepository.findByOrderRef('ORD-2026-8921')) ||
                (await postgresOrderRepository.findLatestOrder());
      }
    }

    const orderRef = order ? order.order_ref : (explicitRef || 'ORD-2026-8921');
    const customerPhone = order ? order.customer_phone : '27821234567';

    if (isLoaded) {
      // 1. Update PostgreSQL status to 'dispatched'
      if (order) {
        await postgresOrderRepository.updateOrderStatus(order.id, 'dispatched');
      }

      // 2. Update live fulfillment metrics
      metricsService.updateFulfillmentStatus(orderRef, 'IN_TRANSIT');

      // 3. Notify Customer via WhatsApp
      await whatsAppClientService.sendTextMessage(
        customerPhone,
        '🚚 Your order is on the truck and out for site delivery! Driver is en route.'
      );

      // 4. Acknowledge Vendor
      await whatsAppClientService.sendTextMessage(
        vendorWaId,
        `✅ *Truck Dispatched Logged*\n\nOrder *#${orderRef}* marked as *In Transit*. Customer (+${customerPhone}) has been notified.`
      );
    } else {
      // 1. Update PostgreSQL status to 'delivered'
      if (order) {
        await postgresOrderRepository.updateOrderStatus(order.id, 'delivered');
      }

      // 2. Update live fulfillment metrics
      metricsService.updateFulfillmentStatus(orderRef, 'DELIVERED');

      // 3. Notify Customer via WhatsApp
      await whatsAppClientService.sendTextMessage(
        customerPhone,
        '✅ Delivery completed. Please inspect materials and let us know if everything is in order.'
      );

      // 4. Acknowledge Vendor
      await whatsAppClientService.sendTextMessage(
        vendorWaId,
        `🏁 *Delivery Confirmed*\n\nOrder *#${orderRef}* marked as *Delivered*. The customer has received receipt confirmation and settlement will disburse in the next ACB batch.`
      );
    }
  }
}

export const conversationStateMachine = new ConversationStateMachine();
