-- ====================================================================
-- PostgreSQL + PostGIS Schema Migration: WhatsApp Commerce Aggregator
-- Vendors, Spatial Delivery Radius, Products, Orders & Double-Entry Ledger
-- Compatible with Supabase (PostGIS + Supavisor) & Self-Hosted PostgreSQL
-- ====================================================================

-- Ensure Supabase `extensions` schema is in search_path
SET search_path TO public, extensions;

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. Vendors Table (Suppliers, Yards & Service Businesses)
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    whatsapp_number VARCHAR(20) NOT NULL UNIQUE,
    meta_phone_number_id VARCHAR(100) UNIQUE NOT NULL,
    meta_catalog_id VARCHAR(100),
    business_type VARCHAR(50) NOT NULL DEFAULT 'retail_delivery', -- 'retail_delivery' | 'service_booking'
    contact_email VARCHAR(255),
    vat_number VARCHAR(50),
    bank_account_holder VARCHAR(255) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    bank_account_number VARCHAR(50) NOT NULL,
    bank_branch_code VARCHAR(20) NOT NULL,
    base_location GEOGRAPHY(Point, 4326) NOT NULL, -- Longitude/Latitude coords
    max_delivery_radius_km NUMERIC(6, 2) NOT NULL DEFAULT 45.00,
    base_delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 250.00,
    per_km_rate NUMERIC(10, 2) NOT NULL DEFAULT 22.00,
    subscription_tier VARCHAR(30) NOT NULL DEFAULT 'starter', -- 'starter' | 'pro' | 'enterprise'
    subscription_monthly_fee NUMERIC(10, 2) NOT NULL DEFAULT 299.00,
    commission_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0800, -- e.g. 5% to 8%
    processing_fee_billed_pct NUMERIC(5, 4) NOT NULL DEFAULT 0.0290, -- e.g. 2.9%
    processing_fee_billed_fixed NUMERIC(10, 2) NOT NULL DEFAULT 2.00, -- e.g. R2.00
    processing_fee_actual_pct NUMERIC(5, 4) NOT NULL DEFAULT 0.0200, -- e.g. 2.0% PayFast wholesale
    processing_fee_actual_fixed NUMERIC(10, 2) NOT NULL DEFAULT 1.50, -- e.g. R1.50 PayFast wholesale
    payfast_subscription_token VARCHAR(100),
    auto_ledger_setoff BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column upgrades for pre-existing Supabase `vendors` tables
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS meta_phone_number_id VARCHAR(100);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS meta_catalog_id VARCHAR(100);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS business_type VARCHAR(50) NOT NULL DEFAULT 'retail_delivery';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(30) NOT NULL DEFAULT 'starter';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS subscription_monthly_fee NUMERIC(10, 2) NOT NULL DEFAULT 299.00;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS processing_fee_billed_pct NUMERIC(5, 4) NOT NULL DEFAULT 0.0290;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS processing_fee_billed_fixed NUMERIC(10, 2) NOT NULL DEFAULT 2.00;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS processing_fee_actual_pct NUMERIC(5, 4) NOT NULL DEFAULT 0.0200;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS processing_fee_actual_fixed NUMERIC(10, 2) NOT NULL DEFAULT 1.50;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payfast_subscription_token VARCHAR(100);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS auto_ledger_setoff BOOLEAN NOT NULL DEFAULT TRUE;

-- Index yard coordinates for spatial lookups
CREATE INDEX IF NOT EXISTS idx_vendors_location ON vendors USING GIST(base_location);
CREATE INDEX IF NOT EXISTS idx_vendors_meta_phone_number_id ON vendors(meta_phone_number_id);

-- 3. Products Catalog Table (Synced to Meta WhatsApp Catalog)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    meta_catalog_id VARCHAR(100),
    meta_product_retailer_id VARCHAR(100) UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL, -- e.g. 'sand_stone', 'paving', 'cement'
    unit_of_measure VARCHAR(50) NOT NULL, -- 'per m3', 'per 1000 bricks', 'per bag'
    unit_price NUMERIC(10, 2) NOT NULL,
    raw_image_url TEXT,
    enhanced_image_url TEXT,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Customer Sessions & Ordering States
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
        'draft', 
        'pending_payment', 
        'paid', 
        'dispatched', 
        'delivered', 
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_ref VARCHAR(20) UNIQUE NOT NULL, -- e.g. 'ORD-2026-8921'
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    customer_phone VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255),
    delivery_address TEXT NOT NULL,
    delivery_point GEOGRAPHY(Point, 4326) NOT NULL,
    distance_km NUMERIC(6, 2) NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    delivery_fee NUMERIC(12, 2) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    platform_fee NUMERIC(12, 2) NOT NULL,     -- Aggregator cut
    vendor_payout NUMERIC(12, 2) NOT NULL,    -- Net payable to supplier
    payment_status VARCHAR(50) DEFAULT 'unpaid',
    payfast_pf_payment_id VARCHAR(100),
    current_status order_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL
);

-- 5. Financial Ledger (Double-Entry Escrow, MoR Arbitrage & Automated Payout Engine)
DO $$ BEGIN
    CREATE TYPE ledger_entry_type AS ENUM (
        'customer_payment_received',
        'platform_commission_earned',
        'payment_spread_retained',
        'gateway_fee_disbursed',
        'gateway_fee_deducted',
        'vendor_payout_disbursed',
        'saas_subscription_setoff',
        'refund_reversed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'payment_spread_retained';
ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'gateway_fee_disbursed';
ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'saas_subscription_setoff';

CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    entry_type ledger_entry_type NOT NULL,
    debit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    balance_after NUMERIC(12, 2) NOT NULL,
    reference VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helper Spatial Function: Check if customer is within delivery radius
CREATE OR REPLACE FUNCTION check_vendor_delivery_radius(
    p_vendor_id UUID,
    p_customer_lon DOUBLE PRECISION,
    p_customer_lat DOUBLE PRECISION
)
RETURNS TABLE (
    within_radius BOOLEAN,
    distance_km NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ST_DWithin(
            v.base_location, 
            ST_SetSRID(ST_MakePoint(p_customer_lon, p_customer_lat), 4326)::geography, 
            v.max_delivery_radius_km * 1000
        ) AS within_radius,
        ROUND((ST_Distance(
            v.base_location, 
            ST_SetSRID(ST_MakePoint(p_customer_lon, p_customer_lat), 4326)::geography
        ) / 1000.0)::numeric, 2) AS distance_km
    FROM vendors v
    WHERE v.id = p_vendor_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Service Schedules & Appointments (Service Businesses: Salons, Massage, Trade Services)
CREATE TABLE IF NOT EXISTS vendor_service_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration_minutes INT NOT NULL DEFAULT 60,
    max_concurrent_bookings INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vendor_id, day_of_week)
);

DO $$ BEGIN
    CREATE TYPE appointment_status AS ENUM (
        'hold',
        'confirmed',
        'cancelled',
        'completed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    customer_phone VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255),
    service_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    status appointment_status NOT NULL DEFAULT 'hold',
    hold_expires_at TIMESTAMPTZ,
    payfast_pf_payment_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

