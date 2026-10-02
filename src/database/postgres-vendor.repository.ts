import { randomUUID } from 'crypto';
import { db } from './db';
import { DbVendor } from '../types/database.types';

export class PostgresVendorRepository {
  private inMemoryVendors: Map<string, DbVendor> = new Map();

  constructor() {
    this.seedDefaultVendors();
  }

  private seedDefaultVendors() {
    const v1: DbVendor = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      business_name: 'BrickDirect Industrial Supplies (Pty) Ltd',
      slug: 'brickdirect-jhb',
      whatsapp_number: '+27820000001',
      meta_phone_number_id: 'meta_pnum_brickdirect_101',
      meta_catalog_id: 'cat_brickdirect_001',
      business_type: 'retail_delivery',
      contact_email: 'sales@brickdirect.co.za',
      vat_number: '4920192837',
      bank_account_holder: 'BrickDirect Industrial Supplies',
      bank_name: 'Standard Bank',
      bank_account_number: '023456789',
      bank_branch_code: '051001',
      base_location_lon: 28.0473,
      base_location_lat: -26.2041,
      max_delivery_radius_km: 45.0,
      base_delivery_fee: 250.0,
      per_km_rate: 22.0,
      subscription_tier: 'starter',
      subscription_monthly_fee: 299.0,
      commission_rate: 0.08,
      processing_fee_billed_rate: { percentage: 0.029, fixed_fee: 2.0 },
      processing_fee_actual_cost: { percentage: 0.02, fixed_fee: 1.5 },
      payfast_subscription_token: 'pf_token_brickdirect_001',
      auto_ledger_setoff: true,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    const v2: DbVendor = {
      id: 'b1ffcd88-8b1a-3de7-aa5c-5aa8ac270b22',
      business_name: 'Titan Aggregate & Sand Quarries',
      slug: 'titan-quarry-edenvale',
      whatsapp_number: '+27829990002',
      meta_phone_number_id: 'meta_pnum_titan_102',
      meta_catalog_id: 'cat_titan_002',
      business_type: 'retail_delivery',
      contact_email: 'dispatch@titanquarry.co.za',
      vat_number: '4839201928',
      bank_account_holder: 'Titan Aggregate Quarries',
      bank_name: 'First National Bank',
      bank_account_number: '62849302918',
      bank_branch_code: '250655',
      base_location_lon: 28.18,
      base_location_lat: -26.115,
      max_delivery_radius_km: 60.0,
      base_delivery_fee: 300.0,
      per_km_rate: 25.0,
      subscription_tier: 'pro',
      subscription_monthly_fee: 599.0,
      commission_rate: 0.075,
      processing_fee_billed_rate: { percentage: 0.029, fixed_fee: 2.0 },
      processing_fee_actual_cost: { percentage: 0.02, fixed_fee: 1.5 },
      payfast_subscription_token: 'pf_token_titan_002',
      auto_ledger_setoff: true,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    const v3: DbVendor = {
      id: 'c2ddde77-7c2b-4ef8-994d-4bb7bd160c33',
      business_name: 'Aura Luxe Hair & Wellness Studio',
      slug: 'aura-luxe-wellness',
      whatsapp_number: '+27829990003',
      meta_phone_number_id: 'meta_pnum_auraluxe_103',
      meta_catalog_id: 'cat_auraluxe_003',
      business_type: 'service_booking',
      contact_email: 'bookings@auraluxe.co.za',
      vat_number: '4718293012',
      bank_account_holder: 'Aura Luxe Hair & Wellness',
      bank_name: 'Nedbank',
      bank_account_number: '1928374650',
      bank_branch_code: '198765',
      base_location_lon: 28.056,
      base_location_lat: -26.107,
      max_delivery_radius_km: 0.0,
      base_delivery_fee: 0.0,
      per_km_rate: 0.0,
      subscription_tier: 'pro',
      subscription_monthly_fee: 599.0,
      commission_rate: 0.065,
      processing_fee_billed_rate: { percentage: 0.027, fixed_fee: 2.0 },
      processing_fee_actual_cost: { percentage: 0.02, fixed_fee: 1.5 },
      payfast_subscription_token: 'pf_token_auraluxe_003',
      auto_ledger_setoff: true,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    const v4: DbVendor = {
      id: 'd3eeef66-6d3c-4fe9-883e-3cc6ce050d44',
      business_name: 'Napoli Woodfired Pizza & Kitchen',
      slug: 'napoli-woodfired-pizza',
      whatsapp_number: '+27829990004',
      meta_phone_number_id: 'meta_pnum_napoli_104',
      meta_catalog_id: 'cat_napoli_004',
      business_type: 'retail_delivery',
      contact_email: 'orders@napolipizza.co.za',
      vat_number: '4619203847',
      bank_account_holder: 'Napoli Woodfired Kitchen',
      bank_name: 'Capitec Business',
      bank_account_number: '1059283746',
      bank_branch_code: '450105',
      base_location_lon: 28.034,
      base_location_lat: -26.145,
      max_delivery_radius_km: 15.0,
      base_delivery_fee: 35.0,
      per_km_rate: 6.5,
      subscription_tier: 'starter',
      subscription_monthly_fee: 299.0,
      commission_rate: 0.08,
      processing_fee_billed_rate: { percentage: 0.029, fixed_fee: 2.0 },
      processing_fee_actual_cost: { percentage: 0.02, fixed_fee: 1.5 },
      payfast_subscription_token: 'pf_token_napoli_004',
      auto_ledger_setoff: true,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    this.inMemoryVendors.set(v1.id, v1);
    this.inMemoryVendors.set(v2.id, v2);
    this.inMemoryVendors.set(v3.id, v3);
    this.inMemoryVendors.set(v4.id, v4);
  }

  async saveVendor(vendor: DbVendor): Promise<DbVendor> {
    const id = vendor.id || randomUUID();
    const metaPhoneNumberId = vendor.meta_phone_number_id || `meta_pnum_${id.slice(0, 8)}`;
    const businessType = vendor.business_type || 'retail_delivery';
    const normalized: DbVendor = {
      ...vendor,
      id,
      meta_phone_number_id: metaPhoneNumberId,
      business_type: businessType,
    };

    const pool = db.getPool();
    if (pool) {
      try {
        const queryText = `
          INSERT INTO vendors (
            id, business_name, slug, whatsapp_number, meta_phone_number_id, meta_catalog_id, business_type,
            contact_email, vat_number,
            bank_account_holder, bank_name, bank_account_number, bank_branch_code,
            base_location, max_delivery_radius_km, base_delivery_fee, per_km_rate,
            commission_rate, is_active
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9,
            $10, $11, $12, $13,
            ST_SetSRID(ST_MakePoint($14, $15), 4326)::geography, $16, $17, $18,
            $19, $20
          ) ON CONFLICT (slug) DO UPDATE SET
            business_name = EXCLUDED.business_name,
            whatsapp_number = EXCLUDED.whatsapp_number,
            meta_phone_number_id = EXCLUDED.meta_phone_number_id,
            meta_catalog_id = EXCLUDED.meta_catalog_id,
            business_type = EXCLUDED.business_type
          RETURNING *
        `;
        const res = await pool.query(queryText, [
          normalized.id,
          normalized.business_name,
          normalized.slug,
          normalized.whatsapp_number,
          normalized.meta_phone_number_id,
          normalized.meta_catalog_id || null,
          normalized.business_type,
          normalized.contact_email,
          normalized.vat_number,
          normalized.bank_account_holder,
          normalized.bank_name,
          normalized.bank_account_number,
          normalized.bank_branch_code,
          normalized.base_location_lon,
          normalized.base_location_lat,
          normalized.max_delivery_radius_km,
          normalized.base_delivery_fee,
          normalized.per_km_rate,
          normalized.commission_rate,
          normalized.is_active,
        ]);
        if (res.rows[0]) {
          this.inMemoryVendors.set(normalized.id, normalized);
          return res.rows[0];
        }
      } catch (err) {
        console.warn('[PostgresVendorRepo] DB save fallback:', err);
      }
    }

    this.inMemoryVendors.set(normalized.id, normalized);
    return normalized;
  }

  async updateVendor(id: string, updates: Partial<DbVendor>): Promise<DbVendor | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: DbVendor = {
      ...existing,
      ...updates,
      id: existing.id,
    };

    this.inMemoryVendors.set(id, updated);
    return updated;
  }

  async findById(id: string): Promise<DbVendor | null> {
    const pool = db.getPool();
    if (pool) {
      try {
        const res = await pool.query(
          'SELECT *, ST_X(base_location::geometry) as base_location_lon, ST_Y(base_location::geometry) as base_location_lat FROM vendors WHERE id = $1::uuid',
          [id]
        );
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[PostgresVendorRepo] FindById fallback:', err);
      }
    }
    return this.inMemoryVendors.get(id) || null;
  }

  async findBySlug(slug: string): Promise<DbVendor | null> {
    for (const v of this.inMemoryVendors.values()) {
      if (v.slug === slug) return v;
    }
    return null;
  }

  async findByMetaPhoneNumberId(phoneNumberId: string): Promise<DbVendor | null> {
    if (!phoneNumberId) return null;
    const trimmed = phoneNumberId.trim();

    const pool = db.getPool();
    if (pool) {
      try {
        const res = await pool.query(
          'SELECT *, ST_X(base_location::geometry) as base_location_lon, ST_Y(base_location::geometry) as base_location_lat FROM vendors WHERE meta_phone_number_id = $1',
          [trimmed]
        );
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[PostgresVendorRepo] FindByMetaPhoneNumberId fallback:', err);
      }
    }

    for (const v of this.inMemoryVendors.values()) {
      if (v.meta_phone_number_id === trimmed) {
        return v;
      }
    }
    return null;
  }

  async resolveByWebhookMetadata(
    phoneNumberId?: string,
    displayPhoneNumber?: string
  ): Promise<DbVendor | null> {
    if (phoneNumberId) {
      const byPhoneId = await this.findByMetaPhoneNumberId(phoneNumberId);
      if (byPhoneId) return byPhoneId;
    }
    if (displayPhoneNumber) {
      const byDisplay = await this.findByWhatsAppNumber(displayPhoneNumber);
      if (byDisplay) return byDisplay;
    }
    return null;
  }

  async findByWhatsAppNumber(phoneNumber: string): Promise<DbVendor | null> {
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const pool = db.getPool();
    if (pool) {
      try {
        const res = await pool.query(
          "SELECT *, ST_X(base_location::geometry) as base_location_lon, ST_Y(base_location::geometry) as base_location_lat FROM vendors WHERE REPLACE(whatsapp_number, '+', '') = $1 OR whatsapp_number = $2",
          [cleanPhone, phoneNumber]
        );
        if (res.rows[0]) return res.rows[0];
      } catch (err) {
        console.warn('[PostgresVendorRepo] FindByPhone fallback:', err);
      }
    }

    for (const v of this.inMemoryVendors.values()) {
      const vClean = v.whatsapp_number.replace(/[^0-9]/g, '');
      if (vClean === cleanPhone || v.whatsapp_number === phoneNumber) {
        return v;
      }
    }
    return null;
  }

  async findAll(): Promise<DbVendor[]> {
    return Array.from(this.inMemoryVendors.values());
  }
}

export const postgresVendorRepository = new PostgresVendorRepository();



