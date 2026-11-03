-- ============================================================================
-- SUPUJA WORKSPACE ENTERPRISE FIELD FORCE ERP - MASTER DATABASE SCHEMA
-- Migration: 20261102_field_force_master.sql
-- Timezone: Indian Standard Time (IST / Asia/Kolkata / UTC+5:30)
-- ============================================================================

BEGIN;
SET LOCAL timezone = 'Asia/Kolkata';

-- ----------------------------------------------------------------------------
-- 1. SAAS MULTI-TENANT QUOTAS & USER TRACKING POLICIES
-- ----------------------------------------------------------------------------
-- Tenant Entitlements: Add Quota & Pipeline feature flags
ALTER TABLE IF EXISTS public.tenant_entitlements 
    ADD COLUMN IF NOT EXISTS live_tracking_quota INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS punch_gps_quota INT DEFAULT 50,
    ADD COLUMN IF NOT EXISTS enable_field_force BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS enable_custom_forms BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS enable_lead_pipeline BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS enable_order_pipeline BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS enable_complaint_pipeline BOOLEAN DEFAULT TRUE;

-- User Roles Table (In Supabase, user profiles live in public.user_roles & public.employees)
ALTER TABLE IF EXISTS public.user_roles 
    ADD COLUMN IF NOT EXISTS tracking_policy VARCHAR(50) DEFAULT 'PUNCH_ONLY', -- 'PUNCH_ONLY', 'LIVE_TRACKING'
    ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(20) DEFAULT 'BIKE',          -- 'BIKE', 'CAR', 'PUBLIC_TRANSPORT'
    ADD COLUMN IF NOT EXISTS conveyance_rate_per_km NUMERIC(5, 2) DEFAULT 4.50,
    ADD COLUMN IF NOT EXISTS device_hardware_id VARCHAR(100),                  -- Anti-Proxy Hardware Lock
    ADD COLUMN IF NOT EXISTS device_model VARCHAR(100);

-- Employees Table (Sync mirror)
ALTER TABLE IF EXISTS public.employees 
    ADD COLUMN IF NOT EXISTS tracking_policy VARCHAR(50) DEFAULT 'PUNCH_ONLY',
    ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(20) DEFAULT 'BIKE',
    ADD COLUMN IF NOT EXISTS conveyance_rate_per_km NUMERIC(5, 2) DEFAULT 4.50,
    ADD COLUMN IF NOT EXISTS device_hardware_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS device_model VARCHAR(100);


-- ----------------------------------------------------------------------------
-- 2. DYNAMIC FORM STUDIO (Custom Forms Catalog & JSON Schemas)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_custom_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    company VARCHAR(50) NOT NULL,                           -- e.g. 'TNT00001', 'TNT00002'
    branch_code VARCHAR(50),                                -- e.g. 'TNT00002-B0001'
    form_code VARCHAR(100) NOT NULL,                        -- e.g. 'FORM_ORDER_TAKING', 'FORM_SERVICE_NSMLR'
    title VARCHAR(255) NOT NULL,                            -- e.g. 'Service for NSMLR Product'
    description TEXT,
    data_type VARCHAR(50) DEFAULT 'CUSTOMER',               -- 'CUSTOMER', 'NONE', 'LEAD'
    status VARCHAR(50) DEFAULT 'PUBLISHED',                 -- 'PUBLISHED', 'DRAFT', 'ARCHIVED'
    field_count INT DEFAULT 0,
    has_form_table BOOLEAN DEFAULT TRUE,                    -- Excel / Dynamic table view enable?
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,              -- Array of field objects (Geo, Pic, Signature, Lists)
    stages_config JSONB DEFAULT '{"start": true, "complete": true}'::jsonb,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company, form_code)
);

CREATE INDEX IF NOT EXISTS idx_custom_forms_company ON public.tenant_custom_forms(company, status);


-- ----------------------------------------------------------------------------
-- 3. DEDICATED FIELD TASKS (Separated from Internal Delegation)
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS field_task_seq START 10001;

CREATE TABLE IF NOT EXISTS public.field_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_code VARCHAR(50) UNIQUE DEFAULT ('TSK-' || nextval('field_task_seq')::TEXT),
    tenant_id UUID,
    company VARCHAR(50) NOT NULL,
    branch_code VARCHAR(50),
    
    -- Dynamic Form Reference
    form_id UUID REFERENCES public.tenant_custom_forms(id) ON DELETE SET NULL,
    task_type VARCHAR(100) NOT NULL,                        -- 'Order Taking', 'Service for NSMLR Product', etc.
    
    -- Relations
    customer_id UUID,                                       -- References Party Master
    lead_id UUID,                                           -- References Leads Table
    party_name VARCHAR(255) NOT NULL,
    party_phone VARCHAR(50),
    party_address TEXT,
    party_lat NUMERIC(10, 7),
    party_lng NUMERIC(10, 7),
    
    -- Users Assigned
    assigned_by_user_id UUID,                               -- Telecaller or Manager who assigned
    assigned_to_user_id UUID NOT NULL,                      -- Field Person on ground
    
    -- Scheduling & Status
    priority VARCHAR(20) DEFAULT 'MEDIUM',                  -- 'URGENT', 'HIGH', 'MEDIUM', 'LOW'
    scheduled_start_time TIMESTAMPTZ,
    scheduled_end_time TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'SCHEDULED',                 -- 'SCHEDULED', 'IN_TRANSIT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
    
    -- Dynamic Form Initial Values (if any)
    form_details JSONB DEFAULT '{}'::jsonb,
    additional_fields JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_tasks_assignee ON public.field_tasks(assigned_to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_field_tasks_company_date ON public.field_tasks(company, scheduled_start_time);


-- ----------------------------------------------------------------------------
-- 4. FIELD FORM SUBMISSIONS & VISIT CLOSING (Connectivity & Anti-Cheat)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.field_form_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.field_tasks(id) ON DELETE SET NULL,
    tenant_id UUID,
    company VARCHAR(50) NOT NULL,
    branch_code VARCHAR(50),
    field_user_id UUID NOT NULL,
    customer_id UUID,
    lead_id UUID,
    party_name VARCHAR(255) NOT NULL,
    
    -- 1. CONNECTIVITY / INTERACTION TYPE (Critical Anti-Cheat)
    connectivity_mode VARCHAR(50) NOT NULL DEFAULT 'PHYSICAL_VISIT', 
    -- 'PHYSICAL_VISIT', 'TELEPHONIC_CALL', 'WHATSAPP_CHAT', 'EMAIL_QUOTE'
    
    -- 2. GEOFENCE AUDIT & DISTANCE CHECKS
    is_geofence_verified BOOLEAN DEFAULT FALSE,
    distance_from_party_meters NUMERIC(10, 2),
    is_geofence_flagged BOOLEAN DEFAULT FALSE,              -- TRUE if Physical claimed but >200m away!
    geofence_flag_reason TEXT,
    
    -- 3. CHECK-IN / CHECK-OUT TIMESTAMPS
    check_in_time TIMESTAMPTZ,
    check_in_lat NUMERIC(10, 7),
    check_in_lng NUMERIC(10, 7),
    check_out_time TIMESTAMPTZ,
    check_out_lat NUMERIC(10, 7),
    check_out_lng NUMERIC(10, 7),
    duration_minutes INT DEFAULT 0,
    
    -- 4. CRM PIPELINE STAGES & OUTCOMES
    pipeline_type VARCHAR(50),                              -- 'LEAD_DATA', 'ORDER_DELIVERY', 'COMPLAINT_SERVICE', 'CUSTOM'
    lead_stage_updated VARCHAR(50),                         -- e.g. '08 - Transfer to Party'
    order_pipeline_stage VARCHAR(50),                       -- e.g. 'S01', 'S05', 'S10'
    complaint_ticket_stage VARCHAR(50),                     -- e.g. 'C04', 'C05'
    outcome_status VARCHAR(100),                            -- 'ORDER_PLACED', 'RESOLVED', 'FOLLOWUP_REQUIRED'
    
    -- 5. COMMERCIAL TRANSACTIONS
    order_value NUMERIC(12, 2) DEFAULT 0,
    payment_collected NUMERIC(12, 2) DEFAULT 0,
    payment_mode VARCHAR(50),                               -- 'CHEQUE', 'NEFT', 'UPI', 'CASH'
    cheque_utr_no VARCHAR(100),
    
    -- 6. DYNAMIC FORM SUBMITTED DATA (JSONB)
    form_data JSONB NOT NULL DEFAULT '{}'::jsonb,           -- All custom questions and answers
    
    -- 7. WATERMARKED LIVE PHOTOS & DIGITAL SIGNATURE
    photo_watermark_urls JSONB DEFAULT '[]'::jsonb,         -- Array of photos with burnt-in GPS/Time
    customer_signature_url TEXT,                            -- Digital finger signature on screen
    discussion_notes TEXT,
    next_followup_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_task ON public.field_form_submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_date ON public.field_form_submissions(field_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_customer ON public.field_form_submissions(customer_id);


-- ----------------------------------------------------------------------------
-- 5. EMPLOYEE LIVE LOCATIONS (Continuous GPS Breadcrumbs & Radar)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_live_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company VARCHAR(50) NOT NULL,
    branch_code VARCHAR(50),
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    accuracy_meters NUMERIC(6, 2),
    speed_kmh NUMERIC(5, 2) DEFAULT 0,
    heading NUMERIC(5, 2),
    battery_pct INT,
    is_charging BOOLEAN DEFAULT FALSE,
    is_moving BOOLEAN DEFAULT FALSE,
    is_mock_gps BOOLEAN DEFAULT FALSE,                      -- Anti-fake GPS app flag
    is_offline_synced BOOLEAN DEFAULT FALSE,                -- Queued in basement godown?
    recorded_at TIMESTAMPTZ NOT NULL,                       -- Strict IST device time
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_loc_user_time ON public.employee_live_locations(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_loc_company ON public.employee_live_locations(company, recorded_at DESC);


-- ----------------------------------------------------------------------------
-- 6. DAILY TRAVEL SUMMARIES & TA/DA CONVEYANCE VOUCHERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_travel_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company VARCHAR(50) NOT NULL,
    branch_code VARCHAR(50),
    date DATE NOT NULL,                                     -- IST Date (e.g. '2026-11-02')
    
    punch_in_time TIMESTAMPTZ,
    punch_out_time TIMESTAMPTZ,
    
    -- Travel & Stoppage Calculations
    total_km NUMERIC(8, 2) DEFAULT 0,
    verified_physical_km NUMERIC(8, 2) DEFAULT 0,           -- Genuine road distance
    total_stoppages_count INT DEFAULT 0,
    total_stoppage_mins INT DEFAULT 0,
    
    -- Visits Breakdown
    total_visits_count INT DEFAULT 0,
    physical_visits_count INT DEFAULT 0,
    telephonic_visits_count INT DEFAULT 0,
    geofence_flagged_count INT DEFAULT 0,                   -- Cheating attempts count
    
    -- Financials & Conveyance
    vehicle_type VARCHAR(20) DEFAULT 'BIKE',
    conveyance_rate_per_km NUMERIC(5, 2) DEFAULT 4.50,
    daily_allowance NUMERIC(8, 2) DEFAULT 150.00,
    total_conveyance_amount NUMERIC(8, 2) DEFAULT 0,
    
    approval_status VARCHAR(50) DEFAULT 'PENDING',          -- 'PENDING', 'APPROVED', 'REJECTED'
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_travel_summary_comp_date ON public.daily_travel_summaries(company, date DESC);


-- ----------------------------------------------------------------------------
-- 7. DEFAULT STARTER TEMPLATES (Seed Data for Immediate Use)
-- ----------------------------------------------------------------------------
INSERT INTO public.tenant_custom_forms (company, form_code, title, data_type, status, field_count, fields)
VALUES 
(
    'TNT00001', 
    'FORM_ORDER_TAKING', 
    'Order Taking', 
    'CUSTOMER', 
    'PUBLISHED', 
    4, 
    '[
        {"id": "order_type", "label": "Order Type", "type": "dropdown", "options": ["Regular Stock", "Urgent Batch", "Custom Specs"], "required": true},
        {"id": "order_value", "label": "Order Value (INR)", "type": "number", "required": true},
        {"id": "expected_delivery", "label": "Expected Delivery Date", "type": "date", "required": true},
        {"id": "po_slip", "label": "Signed PO / Order Slip", "type": "picture_geo", "required": true}
    ]'::jsonb
),
(
    'TNT00001', 
    'FORM_SERVICE_NSMLR', 
    'Service for NSMLR Product', 
    'CUSTOMER', 
    'PUBLISHED', 
    4, 
    '[
        {"id": "issues_type", "label": "Issues Type", "type": "dropdown", "options": ["Motor Overheating", "Valve Jam", "Leakage", "Sensor Fault"], "required": true},
        {"id": "issues_write", "label": "Issues Details / Remark", "type": "text", "required": true},
        {"id": "solved_proof", "label": "Solved Proof (Picture with Geo)", "type": "picture_geo", "required": true},
        {"id": "cust_sign", "label": "Customer Sign-off", "type": "signature", "required": true}
    ]'::jsonb
),
(
    'TNT00001', 
    'FORM_NEW_DEALER', 
    'Visit for New Dealer Working', 
    'LEAD', 
    'PUBLISHED', 
    3, 
    '[
        {"id": "shop_board", "label": "Shop Front Board Photo", "type": "picture_geo", "required": true},
        {"id": "business_potential", "label": "Monthly Potential (Lakhs)", "type": "number", "required": true},
        {"id": "competitor_brands", "label": "Current Brands Stocked", "type": "text", "required": false}
    ]'::jsonb
)
ON CONFLICT (company, form_code) DO NOTHING;

-- Grant permissions to Supabase service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
