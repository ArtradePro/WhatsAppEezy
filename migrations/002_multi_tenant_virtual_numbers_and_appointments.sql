-- ====================================================================
-- Migration 002: Multi-Tenant Virtual Number Routing, Service Schedules & Appointments
-- ====================================================================

SET search_path TO public, extensions;

-- 1. Extend vendors table for Dynamic Virtual Number Ingress Routing & Business Type Split
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS meta_phone_number_id VARCHAR(100);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS meta_catalog_id VARCHAR(100);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS business_type VARCHAR(50) NOT NULL DEFAULT 'retail_delivery';

-- Backfill any existing rows without meta_phone_number_id before enforcing UNIQUE NOT NULL
UPDATE vendors
SET meta_phone_number_id = 'meta_pnum_' || SUBSTRING(id::text, 1, 8)
WHERE meta_phone_number_id IS NULL;

ALTER TABLE vendors ALTER COLUMN meta_phone_number_id SET NOT NULL;

DO $$ BEGIN
    ALTER TABLE vendors ADD CONSTRAINT vendors_meta_phone_number_id_key UNIQUE (meta_phone_number_id);
EXCEPTION
    WHEN duplicate_table THEN null;
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE vendors ADD CONSTRAINT vendors_business_type_check
    CHECK (business_type IN ('retail_delivery', 'service_booking'));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_vendors_meta_phone_number_id ON vendors(meta_phone_number_id);
CREATE INDEX IF NOT EXISTS idx_vendors_business_type ON vendors(business_type);

-- 2. Service Schedules Table (Operating hours, slot duration & concurrency per vendor)
CREATE TABLE IF NOT EXISTS vendor_service_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday .. 6 = Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration_minutes INT NOT NULL DEFAULT 60 CHECK (slot_duration_minutes > 0),
    max_concurrent_bookings INT NOT NULL DEFAULT 1 CHECK (max_concurrent_bookings > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vendor_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_service_schedules_vendor_day ON vendor_service_schedules(vendor_id, day_of_week);

-- 3. Appointments Table (Real-time slot holds, 10-min expiry & PayFast confirmations)
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

CREATE INDEX IF NOT EXISTS idx_appointments_vendor_window ON appointments(vendor_id, scheduled_start, scheduled_end, status);
CREATE INDEX IF NOT EXISTS idx_appointments_hold_expiry ON appointments(status, hold_expires_at);

-- 4. Product Pre-Publish Draft Specs Column (Vendor Self-Service Media Upload & Approval Gate)
ALTER TABLE products ADD COLUMN IF NOT EXISTS draft_specs JSONB;

