-- Migration 41: Create Missing CRM Tables and Columns
-- Executed on Supabase project: qosmckbxvzpdccbrttkd
-- Timestamp: 2026-10-28T19:00:00Z / 2026-10-29T00:30:00+05:30 (IST)

-- 1. party_product_authorizations
CREATE TABLE IF NOT EXISTS public.party_product_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    party_id UUID,
    product_group VARCHAR(100),
    product_category VARCHAR(100),
    authorized_status VARCHAR(50) DEFAULT 'ACTIVE',
    effective_from DATE,
    effective_to DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_party_product_auth_tenant ON public.party_product_authorizations (tenant_id, party_id);

-- 2. party_territory_allocations
CREATE TABLE IF NOT EXISTS public.party_territory_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    party_id UUID,
    state VARCHAR(100),
    district VARCHAR(100),
    tehsil VARCHAR(100),
    pincode VARCHAR(20),
    is_primary BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_party_territory_tenant ON public.party_territory_allocations (tenant_id, party_id);

-- 3. party_team_assignments
CREATE TABLE IF NOT EXISTS public.party_team_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    party_id UUID,
    assigned_user_id UUID,
    assigned_user_name VARCHAR(150),
    role VARCHAR(50) DEFAULT 'EXECUTIVE',
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_party_team_tenant ON public.party_team_assignments (tenant_id, party_id);

-- 4. end_customers
CREATE TABLE IF NOT EXISTS public.end_customers (
    id TEXT PRIMARY KEY,
    customer_code VARCHAR(100),
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'TNT00002',
    full_name VARCHAR(255) NOT NULL,
    mobile_1 VARCHAR(20) NOT NULL,
    mobile_2 VARCHAR(20),
    alternate_mobile_1 VARCHAR(20),
    alternate_mobile_2 VARCHAR(20),
    email_1 VARCHAR(150),
    alternate_email_1 VARCHAR(150),
    state_name VARCHAR(100),
    district_name VARCHAR(100),
    pin_code VARCHAR(20),
    landmark VARCHAR(255),
    block_area_name VARCHAR(150),
    full_address TEXT,
    linked_party_id VARCHAR(100),
    linked_party_code VARCHAR(100),
    linked_party_name VARCHAR(255),
    dealer_city_district VARCHAR(100),
    purchase_invoice_no VARCHAR(100),
    purchase_date DATE,
    product_id VARCHAR(100),
    product_name VARCHAR(255),
    chassis_serial_number VARCHAR(100),
    warranty_months INTEGER DEFAULT 12,
    invoice_document_url TEXT,
    chassis_plate_photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_end_customers_tenant ON public.end_customers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_end_customers_mobile ON public.end_customers (mobile_1);
CREATE INDEX IF NOT EXISTS idx_end_customers_chassis ON public.end_customers (chassis_serial_number);

-- 5. tenant_configurations
CREATE TABLE IF NOT EXISTS public.tenant_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    config_key VARCHAR(100) NOT NULL,
    config_value JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_config UNIQUE (tenant_id, config_key)
);
CREATE INDEX IF NOT EXISTS idx_tenant_config_tenant ON public.tenant_configurations (tenant_id, config_key);

-- 6. location_requests.request_status column alignment
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'location_requests' 
        AND column_name = 'request_status'
    ) THEN
        ALTER TABLE public.location_requests ADD COLUMN request_status VARCHAR(50) DEFAULT 'PENDING';
        -- Sync existing status values if present
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'location_requests' 
            AND column_name = 'status'
        ) THEN
            UPDATE public.location_requests SET request_status = UPPER(status) WHERE request_status IS NULL OR request_status = 'PENDING';
        END IF;
    END IF;
END $$;
