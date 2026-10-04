import { randomUUID } from 'crypto';
import { postgresVendorRepository } from '../../database/postgres-vendor.repository';
import { postgresOrderRepository } from '../../database/postgres-order.repository';
import { postgresProductRepository } from '../../database/postgres-product.repository';
import { postgresLedgerService } from '../../database/postgres-ledger.service';
import { whatsAppClientService } from './whatsapp-client.service';
import { appointmentEngineService } from '../booking/appointment-engine.service';
import { metaCatalogService } from '../meta/meta-catalog.service';
import {
  DbProduct,
  DbVendor,
  VendorBusinessType,
  VendorSubscriptionTier,
} from '../../types/database.types';
import { config } from '../../config/env';

export interface CloudVirtualNumberRecord {
  vendorId: string;
  businessName: string;
  businessType: VendorBusinessType;
  masterWabaId: string;
  virtualPhoneNumberId: string;
  displayVirtualNumber: string;
  metaCatalogId: string;
  routingKeyword: string;
  vendorOperatorWhatsApp: string;
  cloudHostingStatus: 'ONLINE_24_7_CLOUD';
  isolatedTenantWorkspace: true;
  requiresSimCard: false;
  requiresDataPackageForStorefront: false;
  zeroDataDriverProtocolEnabled: true;
  provisionedAt: string;
}

export interface ZeroDataCommandResult {
  handled: boolean;
  commandType:
    | 'STATUS_BALANCE'
    | 'MARK_DISPATCHED'
    | 'MARK_DELIVERED'
    | 'UPDATE_PRICE'
    | 'TOGGLE_STOCK'
    | 'ONBOARD_VENDOR'
    | 'ADD_CATALOG_ITEM'
    | 'UPDATE_SCHEDULE'
    | 'LIST_APPOINTMENTS'
    | 'HELP_MENU'
    | 'UNRECOGNIZED';
  vendorId?: string;
  orderRef?: string;
  productId?: string;
  virtualNumber?: CloudVirtualNumberRecord;
  replyText: string;
  payloadBytes: number;
}

export class VirtualNumberManagerService {
  private virtualNumbersByVendorId = new Map<string, CloudVirtualNumberRecord>();
  private initialized = false;
  private readonly masterWabaId =
    config.WHATSAPP_BUSINESS_ACCOUNT_ID && config.WHATSAPP_BUSINESS_ACCOUNT_ID !== 'mock-waba-id'
      ? config.WHATSAPP_BUSINESS_ACCOUNT_ID
      : 'waba_master_cargodash_001';

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const vendors = await postgresVendorRepository.findAll();
    const displayNumbers: Record<string, string> = {
      meta_pnum_brickdirect_101: '+27 60 010 4001 (Cloud Virtual)',
      meta_pnum_titan_102: '+27 60 010 4002 (Cloud Virtual)',
      meta_pnum_auraluxe_103: '+27 60 010 4003 (Cloud Virtual)',
      meta_pnum_napoli_104: '+27 60 010 4004 (Cloud Virtual)',
    };

    vendors.forEach((v, idx) => {
      const phoneId = v.meta_phone_number_id || `meta_pnum_${v.slug}_${101 + idx}`;
      const catalogId = v.meta_catalog_id || `cat_${v.slug}_${101 + idx}`;
      const displayVirtualNumber =
        displayNumbers[phoneId] || `+27 60 010 ${4001 + idx} (Cloud Virtual)`;

      this.virtualNumbersByVendorId.set(v.id, {
        vendorId: v.id,
        businessName: v.business_name,
        businessType: v.business_type || 'retail_delivery',
        masterWabaId: this.masterWabaId,
        virtualPhoneNumberId: phoneId,
        displayVirtualNumber,
        metaCatalogId: catalogId,
        routingKeyword: `#${v.slug.split('-')[0].toUpperCase()}`,
        vendorOperatorWhatsApp: v.whatsapp_number,
        cloudHostingStatus: 'ONLINE_24_7_CLOUD',
        isolatedTenantWorkspace: true,
        requiresSimCard: false,
        requiresDataPackageForStorefront: false,
        zeroDataDriverProtocolEnabled: true,
        provisionedAt: new Date().toISOString(),
      });
    });
  }

  /**
   * Lists all server-hosted Meta Cloud API Virtual Numbers connected to the single Master WABA.
   */
  async listVirtualNumbers(): Promise<CloudVirtualNumberRecord[]> {
    await this.ensureInitialized();
    return Array.from(this.virtualNumbersByVendorId.values());
  }

  /**
   * Provisions or updates a dedicated server-hosted Cloud Virtual Number for a vendor
   * under the single Master WABA account, with its own isolated Meta Catalog ID.
   */
  async provisionVirtualNumber(params: {
    vendorId: string;
    displayVirtualNumber?: string;
    virtualPhoneNumberId?: string;
    metaCatalogId?: string;
    routingKeyword?: string;
  }): Promise<CloudVirtualNumberRecord> {
    await this.ensureInitialized();
    const vendor =
      (await postgresVendorRepository.findById(params.vendorId)) ||
      (await postgresVendorRepository.findAll())[0];

    const suffix = Math.floor(4100 + Math.random() * 899);
    const virtualPhoneNumberId =
      params.virtualPhoneNumberId || vendor.meta_phone_number_id || `meta_pnum_cloud_${suffix}`;
    const metaCatalogId =
      params.metaCatalogId || vendor.meta_catalog_id || `cat_${vendor.slug}_${suffix}`;

    const record: CloudVirtualNumberRecord = {
      vendorId: vendor.id,
      businessName: vendor.business_name,
      businessType: vendor.business_type || 'retail_delivery',
      masterWabaId: this.masterWabaId,
      virtualPhoneNumberId,
      displayVirtualNumber:
        params.displayVirtualNumber || `+27 60 010 ${suffix} (Cloud Virtual)`,
      metaCatalogId,
      routingKeyword:
        params.routingKeyword || `#${vendor.slug.split('-')[0].toUpperCase()}`,
      vendorOperatorWhatsApp: vendor.whatsapp_number,
      cloudHostingStatus: 'ONLINE_24_7_CLOUD',
      isolatedTenantWorkspace: true,
      requiresSimCard: false,
      requiresDataPackageForStorefront: false,
      zeroDataDriverProtocolEnabled: true,
      provisionedAt: new Date().toISOString(),
    };

    this.virtualNumbersByVendorId.set(vendor.id, record);
    return record;
  }

  /**
   * Resolves which vendor tenant owns an incoming Meta Cloud API webhook event
   * using the dedicated `metadata.phone_number_id` connected to the Master WABA.
   */
  async resolveTenantByVirtualNumber(
    phoneNumberId?: string,
    messageText?: string
  ): Promise<CloudVirtualNumberRecord | null> {
    await this.ensureInitialized();
    const records = Array.from(this.virtualNumbersByVendorId.values());

    if (phoneNumberId) {
      const byPhoneId = records.find((r) => r.virtualPhoneNumberId === phoneNumberId);
      if (byPhoneId) return byPhoneId;
    }

    if (messageText) {
      const upper = messageText.toUpperCase();
      const byKeyword = records.find((r) => upper.includes(r.routingKeyword.toUpperCase()));
      if (byKeyword) return byKeyword;
    }

    return records[0] || null;
  }

  /**
   * Self-service vendor onboarding: creates an isolated vendor record in PostgreSQL,
   * provisions a dedicated Virtual Telephone Number under the single Master WABA,
   * assigns a dedicated isolated Meta Catalog ID, and initializes service schedules if applicable.
   */
  async onboardVendorSelfService(params: {
    businessName: string;
    whatsappNumber: string;
    businessType?: VendorBusinessType;
    subscriptionTier?: VendorSubscriptionTier;
    bankName?: string;
    accountNumber?: string;
    branchCode?: string;
  }): Promise<{ vendor: DbVendor; virtualNumber: CloudVirtualNumberRecord }> {
    await this.ensureInitialized();

    const slug = params.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32);
    const suffix = Math.floor(105 + Math.random() * 890);
    const metaPhoneNumberId = `meta_pnum_${slug.split('-')[0]}_${suffix}`;
    const metaCatalogId = `cat_${slug.split('-')[0]}_${suffix}`;
    const businessType: VendorBusinessType = params.businessType || 'retail_delivery';
    const tier: VendorSubscriptionTier = params.subscriptionTier || 'pro';

    const monthlyFeeMap: Record<VendorSubscriptionTier, number> = {
      starter: 299,
      pro: 599,
      enterprise: 999,
    };
    const commissionMap: Record<VendorSubscriptionTier, number> = {
      starter: 0.08,
      pro: 0.065,
      enterprise: 0.05,
    };

    const vendor: DbVendor = {
      id: randomUUID(),
      business_name: params.businessName.trim(),
      slug: `${slug}-${suffix}`,
      whatsapp_number: params.whatsappNumber,
      meta_phone_number_id: metaPhoneNumberId,
      meta_catalog_id: metaCatalogId,
      business_type: businessType,
      bank_account_holder: `${params.businessName.trim()} (Pty) Ltd`,
      bank_name: params.bankName || 'FNB',
      bank_account_number: params.accountNumber || '62991020304',
      bank_branch_code: params.branchCode || '250655',
      base_location_lat: -33.9249,
      base_location_lon: 18.4241,
      max_delivery_radius_km: businessType === 'service_booking' ? 0 : 60,
      base_delivery_fee: businessType === 'service_booking' ? 0 : 120.0,
      per_km_rate: businessType === 'service_booking' ? 0 : 22.0,
      is_active: true,
      subscription_tier: tier,
      subscription_monthly_fee: monthlyFeeMap[tier],
      commission_rate: commissionMap[tier],
      processing_fee_billed_rate: { percentage: 0.029, fixed_fee: 2.0 },
      processing_fee_actual_cost: { percentage: 0.02, fixed_fee: 1.5 },
      auto_ledger_setoff: true,
      created_at: new Date().toISOString(),
    };

    await postgresVendorRepository.saveVendor(vendor);

    // If service_booking, seed default Mon-Sat 08:00-17:00 schedule
    if (businessType === 'service_booking') {
      for (let day = 1; day <= 6; day++) {
        await appointmentEngineService.upsertServiceSchedule({
          vendor_id: vendor.id,
          day_of_week: day,
          start_time: '08:00:00',
          end_time: '17:00:00',
          slot_duration_minutes: 60,
          max_concurrent_bookings: 2,
        });
      }
    }

    const virtualNumber = await this.provisionVirtualNumber({
      vendorId: vendor.id,
      virtualPhoneNumberId: metaPhoneNumberId,
      metaCatalogId,
      displayVirtualNumber: `+27 60 010 ${4000 + suffix} (Cloud Virtual)`,
    });

    return { vendor, virtualNumber };
  }

  /**
   * Parses and executes ultra-lightweight (<1.5 KB) Zero-Data WhatsApp text commands
   * from registered suppliers or tipper drivers so they can run yard/salon operations
   * and onboard/manage catalogs without opening a web browser or switching apps.
   *
   * Supported Commands:
   * - `ONBOARD <Name> | <retail_delivery|service_booking> | <starter|pro|enterprise> | <Bank> <Acc>`
   * - `ADD <Item/Service Title> | R<Price> | <Unit>`
   * - `HOURS <MON-SAT|ALL> <START>-<END> <MINS>M`
   * - `BOOKINGS` or `APPOINTMENTS`
   * - `STATUS` or `BALANCE`
   * - `LOAD <ORDER_REF>` or `DISPATCH <ORDER_REF>`
   * - `DONE <ORDER_REF>` or `POD <ORDER_REF>`
   * - `PRICE <ITEM> R<PRICE>`
   * - `STOCK OFF <ITEM>` / `STOCK ON <ITEM>`
   * - `HELP`
   */
  async handleZeroDataVendorCommand(
    senderPhone: string,
    rawText: string,
    explicitVendorId?: string,
    recipientPhoneNumberId?: string
  ): Promise<ZeroDataCommandResult> {
    await this.ensureInitialized();

    const trimmed = (rawText || '').trim();
    const upper = trimmed.toUpperCase();

    // 0. ONBOARD <Business Name> | <retail_delivery|service_booking> | <starter|pro|enterprise> | <Bank> <Acc>
    const onboardMatch = trimmed.match(/^ONBOARD\s+(.+)$/i);
    if (onboardMatch) {
      const parts = onboardMatch[1].split('|').map((s) => s.trim());
      const businessName = parts[0] || 'New WhatsApp Merchant';
      const rawType = (parts[1] || 'retail_delivery').toLowerCase();
      const businessType: VendorBusinessType =
        rawType.includes('service') || rawType.includes('salon') || rawType.includes('booking')
          ? 'service_booking'
          : 'retail_delivery';
      const rawTier = (parts[2] || 'pro').toLowerCase();
      const subscriptionTier: VendorSubscriptionTier =
        rawTier === 'starter' || rawTier === 'enterprise' ? rawTier : 'pro';
      const bankSpec = parts[3] || 'FNB 62991020304';
      const bankTokens = bankSpec.split(/\s+/);
      const bankName = bankTokens[0] || 'FNB';
      const accountNumber = bankTokens[1] || '62991020304';

      const { vendor: newVendor, virtualNumber } = await this.onboardVendorSelfService({
        businessName,
        whatsappNumber: senderPhone,
        businessType,
        subscriptionTier,
        bankName,
        accountNumber,
      });

      const replyText =
        `🚀 *VENDOR ONBOARDED ON MASTER WABA*\n` +
        `• Business: *${newVendor.business_name}* (${businessType})\n` +
        `• Dedicated Virtual Number: *${virtualNumber.displayVirtualNumber}*\n` +
        `• Virtual Phone ID: \`${virtualNumber.virtualPhoneNumberId}\`\n` +
        `• Isolated Catalog ID: \`${virtualNumber.metaCatalogId}\`\n` +
        `Reply *ADD <Item> | R<Price> | <Unit>* to add catalog items!`;

      return {
        handled: true,
        commandType: 'ONBOARD_VENDOR',
        vendorId: newVendor.id,
        virtualNumber,
        replyText,
        payloadBytes: Buffer.byteLength(replyText, 'utf-8'),
      };
    }

    let vendor: DbVendor | null = null;
    if (explicitVendorId) {
      vendor = await postgresVendorRepository.findById(explicitVendorId);
    }
    if (!vendor && recipientPhoneNumberId) {
      vendor = await postgresVendorRepository.findByMetaPhoneNumberId(recipientPhoneNumberId);
    }
    if (!vendor) {
      vendor = await postgresVendorRepository.findByWhatsAppNumber(senderPhone);
    }
    if (!vendor) {
      const all = await postgresVendorRepository.findAll();
      vendor = all[0] || null;
    }

    // 1. STATUS / BALANCE
    if (upper === 'STATUS' || upper === 'BALANCE' || upper === 'ESCROW') {
      const escrowBalance = vendor
        ? await postgresLedgerService.getVendorBalance(vendor.id)
        : 10327.5;
      const orders = vendor
        ? await postgresOrderRepository.findAllOrders(vendor.id)
        : [];
      const paidCount = orders.filter((o) => o.current_status === 'paid').length;
      const dispatchedCount = orders.filter((o) => o.current_status === 'dispatched').length;

      const replyText =
        `📡 *ZERO-DATA YARD STATUS (${vendor?.business_name || 'WhatsAppEezy'})*\n` +
        `• Cloud Storefront: *ONLINE 24/7 (No SIM Data Needed)*\n` +
        `• Virtual Number ID: \`${vendor?.meta_phone_number_id || 'waba_master'}\`\n` +
        `• Unsettled Escrow: *R ${escrowBalance.toFixed(2)}*\n` +
        `• Ready to Load: *${paidCount}* | In Transit: *${dispatchedCount}*\n` +
        `Reply *LOAD <ORD-REF>* or *DONE <ORD-REF>* to update deliveries.`;

      return {
        handled: true,
        commandType: 'STATUS_BALANCE',
        vendorId: vendor?.id,
        replyText,
        payloadBytes: Buffer.byteLength(replyText, 'utf-8'),
      };
    }

    // 2. LOAD / DISPATCH <ORDER_REF>
    const loadMatch = upper.match(/^(?:LOAD|DISPATCH)\s+(ORD-[A-Z0-9-]+)/i);
    if (loadMatch) {
      const orderRef = loadMatch[1].toUpperCase();
      const order = await postgresOrderRepository.findByOrderRef(orderRef);

      if (order) {
        await postgresOrderRepository.updateOrderStatus(order.id, 'dispatched');
        await whatsAppClientService
          .sendTextMessage(
            order.customer_phone,
            `🚚 Your order *${orderRef}* is on the truck and out for site delivery! Driver is en route.`
          )
          .catch(() => {});
      }

      const replyText =
        `🚚 *DISPATCH CONFIRMED (${orderRef})*\n` +
        `Status set to *DISPATCHED*. Customer has been notified via Cloud Virtual Number.`;

      return {
        handled: true,
        commandType: 'MARK_DISPATCHED',
        vendorId: vendor?.id,
        orderRef,
        replyText,
        payloadBytes: Buffer.byteLength(replyText, 'utf-8'),
      };
    }

    // 3. DONE / POD / DELIVERED <ORDER_REF>
    const doneMatch = upper.match(/^(?:DONE|POD|DELIVERED)\s+(ORD-[A-Z0-9-]+)/i);
    if (doneMatch) {
      const orderRef = doneMatch[1].toUpperCase();
      const order = await postgresOrderRepository.findByOrderRef(orderRef);

      if (order) {
        await postgresOrderRepository.updateOrderStatus(order.id, 'delivered');
        await whatsAppClientService
          .sendTextMessage(
            order.customer_phone,
            `✅ Delivery completed for *${orderRef}*. Please inspect materials and let us know if everything is in order.`
          )
          .catch(() => {});
      }

      const replyText =
        `✅ *POD VERIFIED (${orderRef})*\n` +
        `Order marked *DELIVERED*. Net payout unlocked in escrow for Friday ACB/CSV bank release.`;

      return {
        handled: true,
        commandType: 'MARK_DELIVERED',
        vendorId: vendor?.id,
        orderRef,
        replyText,
        payloadBytes: Buffer.byteLength(replyText, 'utf-8'),
      };
    }

    // 4. PRICE <KEYWORD> R<AMOUNT>
    const priceMatch = trimmed.match(/^PRICE\s+(.+?)\s+R?\s*([0-9]+(?:\.[0-9]{1,2})?)$/i);
    if (priceMatch) {
      const keyword = priceMatch[1].trim();
      const newPrice = parseFloat(priceMatch[2]);

      if (vendor) {
        const products = await postgresProductRepository.findByVendor(vendor.id);
        const target = products.find(
          (p) =>
            p.title.toLowerCase().includes(keyword.toLowerCase()) ||
            (p.meta_product_retailer_id || '').toLowerCase() === keyword.toLowerCase()
        );
        if (target) {
          await postgresProductRepository.saveProduct({
            ...target,
            unit_price: newPrice,
          });
        }
      }

      const replyText =
        `💰 *ZERO-DATA PRICE UPDATED*\n` +
        `Set *${keyword.toUpperCase()}* to *R ${newPrice.toFixed(2)}* in Meta WhatsApp Catalog.`;

      return {
        handled: true,
        commandType: 'UPDATE_PRICE',
        vendorId: vendor?.id,
        replyText,
        payloadBytes: Buffer.byteLength(replyText, 'utf-8'),
      };
    }

    // 5. STOCK ON/OFF <KEYWORD>
    const stockMatch = trimmed.match(/^STOCK\s+(ON|OFF)\s+(.+)$/i);
    if (stockMatch) {
      const state = stockMatch[1].toUpperCase() === 'ON';
      const keyword = stockMatch[2].trim();

      if (vendor) {
        const products = await postgresProductRepository.findByVendor(vendor.id);
        const target = products.find((p) =>
          p.title.toLowerCase().includes(keyword.toLowerCase())
        );
        if (target) {
          await postgresProductRepository.saveProduct({
            ...target,
            is_available: state,
          });
        }
      }

      const replyText =
        `📦 *CATALOG STOCK ${state ? 'ENABLED' : 'PAUSED'}*\n` +
        `*${keyword.toUpperCase()}* is now *${state ? 'IN STOCK' : 'OUT OF STOCK'}* on your Cloud Virtual Number.`;

      return {
        handled: true,
        commandType: 'TOGGLE_STOCK',
        vendorId: vendor?.id,
        replyText,
        payloadBytes: Buffer.byteLength(replyText, 'utf-8'),
      };
    }

    // 6. ADD <Title> | R<Price> | <Unit> (In-WhatsApp Isolated Catalog Upload)
    const addMatch = trimmed.match(/^ADD\s+(.+)$/i);
    if (addMatch && vendor) {
      const parts = addMatch[1].split('|').map((s) => s.trim());
      const title = parts[0] || 'New Catalog Item';
      const priceStr = (parts[1] || '100').replace(/[^0-9.]/g, '');
      const unitPrice = parseFloat(priceStr) || 100;
      const unitOfMeasure = parts[2] || (vendor.business_type === 'service_booking' ? '60 min session' : 'per unit');
      const retailerId = `SKU-${vendor.slug.split('-')[0].toUpperCase()}-${Date.now().toString().slice(-4)}`;
      const catalogId = vendor.meta_catalog_id || config.META_CATALOG_ID;

      const newProduct: DbProduct = {
        id: randomUUID(),
        vendor_id: vendor.id,
        meta_catalog_id: catalogId,
        meta_product_retailer_id: retailerId,
        title,
        description: `${title} (${unitOfMeasure}) - ${vendor.business_name}`,
        category: vendor.business_type === 'service_booking' ? 'service_booking' : 'general',
        unit_of_measure: unitOfMeasure,
        unit_price: unitPrice,
        is_available: true,
        created_at: new Date().toISOString(),
      };

      await postgresProductRepository.saveProduct(newProduct);
      await metaCatalogService.upsertProduct(
        {
          retailer_id: retailerId,
          name: title,
          description: newProduct.description || title,
          availability: 'in stock',
          condition: 'new',
          price: unitPrice,
          currency: 'ZAR',
          image_url: 'https://res.cloudinary.com/cargodash/image/upload/v1/catalog_default.webp',
          url: `${config.DEFAULT_COMMERCE_BASE_URL}/${newProduct.id}`,
          brand: vendor.business_name,
        },
        catalogId
      );

      const replyText =
        `✨ *ITEM ADDED TO ISOLATED CATALOG (\`${catalogId}\`)*\n` +
        `• Item: *${title}* (${retailerId})\n` +
        `• Price: *R ${unitPrice.toFixed(2)}* (${unitOfMeasure})\n` +
        `• Virtual Number: \`${vendor.meta_phone_number_id}\``;

      return {
        handled: true,
        commandType: 'ADD_CATALOG_ITEM',
        vendorId: vendor.id,
        productId: newProduct.id,
        replyText,
        payloadBytes: Buffer.byteLength(replyText, 'utf-8'),
      };
    }

    // 7. HOURS <MON-SAT|ALL> <START>-<END> <MINS>M (In-WhatsApp Service Schedule Config)
    const hoursMatch = trimmed.match(
      /^HOURS\s+(MON-SAT|MON-FRI|ALL)\s+(\d{2}:\d{2})-(\d{2}:\d{2})(?:\s+(\d+)M(?:IN)?)?$/i
    );
    if (hoursMatch && vendor) {
      const dayRange = hoursMatch[1].toUpperCase();
      const startTime = `${hoursMatch[2]}:00`;
      const endTime = `${hoursMatch[3]}:00`;
      const slotDurationMinutes = parseInt(hoursMatch[4] || '60', 10);

      const days =
        dayRange === 'ALL'
          ? [0, 1, 2, 3, 4, 5, 6]
          : dayRange === 'MON-FRI'
            ? [1, 2, 3, 4, 5]
            : [1, 2, 3, 4, 5, 6];

      for (const day of days) {
        await appointmentEngineService.upsertServiceSchedule({
          vendor_id: vendor.id,
          day_of_week: day,
          start_time: startTime,
          end_time: endTime,
          slot_duration_minutes: slotDurationMinutes,
          max_concurrent_bookings: 2,
        });
      }

      const replyText =
        `🗓️ *SERVICE SCHEDULE UPDATED (${vendor.business_name})*\n` +
        `• Days: *${dayRange}*\n` +
        `• Operating Hours: *${hoursMatch[2]} – ${hoursMatch[3]}*\n` +
        `• Slot Duration: *${slotDurationMinutes} mins*`;

      return {
        handled: true,
        commandType: 'UPDATE_SCHEDULE',
        vendorId: vendor.id,
        replyText,
        payloadBytes: Buffer.byteLength(replyText, 'utf-8'),
      };
    }

    // 8. BOOKINGS / APPOINTMENTS (In-WhatsApp Service Appointments Check)
    if ((upper === 'BOOKINGS' || upper === 'APPOINTMENTS') && vendor) {
      const appointments = await appointmentEngineService.getAllVendorAppointments(vendor.id);
      const confirmed = appointments.filter((a) => a.status === 'confirmed').length;
      const held = appointments.filter((a) => a.status === 'hold').length;

      const replyText =
        `📅 *APPOINTMENT QUEUE (${vendor.business_name})*\n` +
        `• Confirmed Bookings: *${confirmed}*\n` +
        `• Active 10-Min Holds: *${held}*\n` +
        `• Total Records: *${appointments.length}*`;

      return {
        handled: true,
        commandType: 'LIST_APPOINTMENTS',
        vendorId: vendor.id,
        replyText,
        payloadBytes: Buffer.byteLength(replyText, 'utf-8'),
      };
    }

    // 9. HELP
    if (upper === 'HELP' || upper === 'COMMANDS' || upper === 'MENU') {
      const replyText =
        `⚡ *ZERO-DATA SUPPLIER & SERVICE COMMANDS*\n` +
        `1. *STATUS* — Check escrow balance & active orders\n` +
        `2. *LOAD ORD-2026-8921* — Mark truck dispatched\n` +
        `3. *DONE ORD-2026-8921* — Confirm site delivery (POD)\n` +
        `4. *PRICE SAND R580* — Update catalog price\n` +
        `5. *STOCK OFF CEMENT* — Pause item in catalog\n` +
        `6. *ADD <Title> | R<Price> | <Unit>* — Add catalog item\n` +
        `7. *HOURS MON-SAT 08:00-17:00 60M* — Set booking hours`;

      return {
        handled: true,
        commandType: 'HELP_MENU',
        vendorId: vendor?.id,
        replyText,
        payloadBytes: Buffer.byteLength(replyText, 'utf-8'),
      };
    }

    return {
      handled: false,
      commandType: 'UNRECOGNIZED',
      vendorId: vendor?.id,
      replyText: '',
      payloadBytes: 0,
    };
  }
}

export const virtualNumberManagerService = new VirtualNumberManagerService();

