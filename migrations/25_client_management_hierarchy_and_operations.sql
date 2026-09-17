-- ====================================================================
-- MIGRATION 25: CLIENT MANAGEMENT PROCESS & HIERARCHY ENGINE
-- Distributor -> Dealer -> Sub-Dealer Strict Hierarchy & Operations
-- ====================================================================

-- 1. ATOMIC SEQUENCES & GENERATORS
CREATE SEQUENCE IF NOT EXISTS pty_code_seq START WITH 100001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS dist_code_seq START WITH 100001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS dlr_code_seq START WITH 100001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS sdl_code_seq START WITH 100001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS complaint_ticket_seq START WITH 1001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS sales_order_seq START WITH 1001 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION generate_atomic_distributor_code()
RETURNS text AS $$
BEGIN
  RETURN 'DIS-' || lpad(nextval('dist_code_seq')::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_atomic_dealer_code()
RETURNS text AS $$
BEGIN
  RETURN 'DLR-' || lpad(nextval('dlr_code_seq')::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_atomic_sub_dealer_code()
RETURNS text AS $$
BEGIN
  RETURN 'SDL-' || lpad(nextval('sdl_code_seq')::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_atomic_complaint_number()
RETURNS text AS $$
BEGIN
  RETURN 'CMP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('complaint_ticket_seq')::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 2. EXTEND PARTY MASTER WITH HIERARCHY & BILLING COLUMNS
ALTER TABLE party_master 
  ADD COLUMN IF NOT EXISTS party_type text DEFAULT 'Dealer',
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS mobile_no text,
  ADD COLUMN IF NOT EXISTS whatsapp_no text,
  ADD COLUMN IF NOT EXISTS email_id text,
  ADD COLUMN IF NOT EXISTS gst_no text,
  ADD COLUMN IF NOT EXISTS pan_no text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS state_name text,
  ADD COLUMN IF NOT EXISTS district_name text,
  ADD COLUMN IF NOT EXISTS tehsil text,
  ADD COLUMN IF NOT EXISTS block_name text,
  ADD COLUMN IF NOT EXISTS city_village text,
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS order_category text,
  ADD COLUMN IF NOT EXISTS product_interest text,
  ADD COLUMN IF NOT EXISTS security_deposit_status text DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS workflow_status text DEFAULT 'S00_Party_Master',
  ADD COLUMN IF NOT EXISTS next_step text DEFAULT 'S02_Dealer_Registration',
  ADD COLUMN IF NOT EXISTS final_status text DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS distributor_code text,
  ADD COLUMN IF NOT EXISTS dealer_code text,
  ADD COLUMN IF NOT EXISTS sub_dealer_code text,
  ADD COLUMN IF NOT EXISTS parent_distributor_id uuid REFERENCES party_master(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_dealer_id uuid REFERENCES party_master(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_route_type text DEFAULT 'DIRECT_COMPANY_BILLING',
  ADD COLUMN IF NOT EXISTS dispatch_source text DEFAULT 'COMPANY_FACTORY',
  ADD COLUMN IF NOT EXISTS distributor_commission_percent numeric(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS monthly_business_potential numeric(14,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS annual_business_potential numeric(14,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS registration_status text DEFAULT 'In_Progress',
  ADD COLUMN IF NOT EXISTS biz_contact_no_1 text,
  ADD COLUMN IF NOT EXISTS biz_contact_no_2 text,
  ADD COLUMN IF NOT EXISTS biz_alt_no_1 text,
  ADD COLUMN IF NOT EXISTS biz_alt_no_2 text,
  ADD COLUMN IF NOT EXISTS biz_email_1 text,
  ADD COLUMN IF NOT EXISTS biz_email_2 text,
  ADD COLUMN IF NOT EXISTS biz_alt_email_1 text,
  ADD COLUMN IF NOT EXISTS biz_alt_email_2 text,
  ADD COLUMN IF NOT EXISTS contact_person_name_1 text,
  ADD COLUMN IF NOT EXISTS contact_mobile_1_1 text,
  ADD COLUMN IF NOT EXISTS contact_mobile_1_2 text,
  ADD COLUMN IF NOT EXISTS contact_alt_mobile_1_1 text,
  ADD COLUMN IF NOT EXISTS contact_alt_mobile_1_2 text,
  ADD COLUMN IF NOT EXISTS contact_email_1_2 text,
  ADD COLUMN IF NOT EXISTS contact_alt_email_1_1 text,
  ADD COLUMN IF NOT EXISTS contact_person_name_2 text,
  ADD COLUMN IF NOT EXISTS contact_mobile_2_1 text,
  ADD COLUMN IF NOT EXISTS contact_mobile_2_2 text,
  ADD COLUMN IF NOT EXISTS contact_alt_mobile_2_1 text,
  ADD COLUMN IF NOT EXISTS contact_alt_mobile_2_2 text,
  ADD COLUMN IF NOT EXISTS contact_email_2_2 text,
  ADD COLUMN IF NOT EXISTS contact_alt_email_2_1 text,
  ADD COLUMN IF NOT EXISTS territory_coverage text[] DEFAULT ARRAY[]::text[];

-- 3. PARTY RELATIONSHIPS (FOR PRESERVING RELATIONSHIP HISTORY)
CREATE TABLE IF NOT EXISTS party_relationship_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  party_type text NOT NULL, -- 'Dealer' or 'Sub-Dealer'
  parent_type text NOT NULL, -- 'Distributor' or 'Dealer'
  parent_party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  auto_derived_distributor_id uuid REFERENCES party_master(id) ON DELETE SET NULL,
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  transfer_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- 4. PARTY PRODUCT AUTHORIZATIONS (S05)
CREATE TABLE IF NOT EXISTS party_product_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  order_category text,
  product_category text,
  product_name text NOT NULL,
  spare_part_category text,
  is_authorized boolean DEFAULT true,
  opening_stock_required integer DEFAULT 0,
  effective_date date DEFAULT CURRENT_DATE,
  authorization_status text DEFAULT 'Active' CHECK (authorization_status IN ('Active', 'Inactive')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 5. PARTY TERRITORY ALLOCATIONS (S05.1)
CREATE TABLE IF NOT EXISTS party_territory_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  zone text,
  state text,
  district text,
  tehsil_area text,
  market_coverage_area text,
  territory_type text DEFAULT 'Exclusive' CHECK (territory_type IN ('Exclusive', 'Shared', 'Open')),
  effective_date date DEFAULT CURRENT_DATE,
  territory_status text DEFAULT 'Active' CHECK (territory_status IN ('Active', 'Inactive')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 6. PARTY CLIENT TEAM ASSIGNMENT (S06)
CREATE TABLE IF NOT EXISTS party_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  employee_name text,
  role_in_party text NOT NULL CHECK (role_in_party IN (
    'NSM', 'RSM', 'ASM', 'Sales Executive', 'Telecaller', 'Sales Coordinator', 'CRM'
  )),
  assignment_type text DEFAULT 'Primary' CHECK (assignment_type IN ('Primary', 'Secondary')),
  status text DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at timestamp with time zone DEFAULT now()
);

-- 7. COMMERCIAL DETAILS EXTENSION (S04)
ALTER TABLE party_commercial_terms
  ADD COLUMN IF NOT EXISTS price_list_applicable text DEFAULT 'Standard Price List',
  ADD COLUMN IF NOT EXISTS security_deposit_amount numeric(14,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS security_deposit_date date,
  ADD COLUMN IF NOT EXISTS security_mode text DEFAULT 'Cheque',
  ADD COLUMN IF NOT EXISTS receipt_no text,
  ADD COLUMN IF NOT EXISTS agreement_status text DEFAULT 'Pending_Signature',
  ADD COLUMN IF NOT EXISTS commercial_status text DEFAULT 'Pending' CHECK (commercial_status IN ('Pending', 'Completed', 'Hold'));

-- 8. OPERATIONAL ENGINE 1: DAILY ORDER TAKING FOLLOWUP
CREATE TABLE IF NOT EXISTS party_order_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  assigned_caller_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  assigned_caller_name text,
  call_status text DEFAULT 'PENDING' CHECK (call_status IN ('PENDING', 'CONNECTED', 'NOT_REACHABLE', 'BUSY', 'RESCHEDULED')),
  current_outstanding numeric(14,2) DEFAULT 0.00,
  available_credit numeric(14,2) DEFAULT 0.00,
  last_order_date date,
  is_order_placed boolean DEFAULT false,
  generated_order_no text,
  order_line_items jsonb DEFAULT '[]'::jsonb,
  billing_route text DEFAULT 'DIRECT_COMPANY_BILLING',
  tagged_distributor_id uuid REFERENCES party_master(id) ON DELETE SET NULL,
  preferred_dispatch_date date,
  no_order_reason text,
  rescheduled_time timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- 9. OPERATIONAL ENGINE 2: POST-ORDER FEEDBACK CALLING
CREATE TABLE IF NOT EXISTS party_order_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  order_id text NOT NULL,
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  telecaller_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  telecaller_name text,
  call_datetime timestamp with time zone DEFAULT now(),
  rating_delivery_time integer CHECK (rating_delivery_time BETWEEN 1 AND 5),
  rating_packaging_finish integer CHECK (rating_packaging_finish BETWEEN 1 AND 5),
  has_transit_damage_shortage boolean DEFAULT false,
  damage_details text,
  damage_photo_urls text[] DEFAULT ARRAY[]::text[],
  rating_billing_accuracy integer CHECK (rating_billing_accuracy BETWEEN 1 AND 5),
  rating_driver_behavior integer CHECK (rating_driver_behavior BETWEEN 1 AND 5),
  overall_satisfaction integer CHECK (overall_satisfaction BETWEEN 1 AND 5),
  dealer_comments text,
  auto_complaint_triggered boolean DEFAULT false,
  linked_ticket_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

-- 10. OPERATIONAL ENGINE 3: MONTHLY DEFAULT FEEDBACK CALLING
CREATE TABLE IF NOT EXISTS party_monthly_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  evaluation_period text NOT NULL, -- e.g. '2026-09'
  telecaller_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  telecaller_name text,
  days_inactive integer DEFAULT 0,
  is_dormant_risk boolean DEFAULT false,
  market_sentiment text DEFAULT 'STEADY',
  competitor_schemes text,
  tse_support_rating integer CHECK (tse_support_rating BETWEEN 1 AND 5),
  service_support_rating integer CHECK (service_support_rating BETWEEN 1 AND 5),
  next_month_demand_plan text,
  dealer_suggestions text,
  created_at timestamp with time zone DEFAULT now()
);

-- 11. OPERATIONAL ENGINE 4: COMPLAINT MANAGEMENT SYSTEM
CREATE TABLE IF NOT EXISTS party_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  ticket_number text UNIQUE NOT NULL,
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  complaint_source text DEFAULT 'FEEDBACK_CALL_AUTO' CHECK (complaint_source IN (
    'FEEDBACK_CALL_AUTO', 'MONTHLY_CALL_AUTO', 'DIRECT_PHONE', 'WHATSAPP', 'FIELD_VISIT'
  )),
  category text NOT NULL CHECK (category IN (
    'MANUFACTURING_DEFECT', 'TRANSIT_DAMAGE', 'SHORTAGE_MISSING_PARTS',
    'BILLING_DISPUTE', 'DELIVERY_DELAY', 'SERVICE_WARRANTY'
  )),
  priority text DEFAULT 'MEDIUM' CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  issue_description text NOT NULL,
  attachments text[] DEFAULT ARRAY[]::text[],
  assigned_department text DEFAULT 'QUALITY_ASSURANCE' CHECK (assigned_department IN (
    'QUALITY_ASSURANCE', 'LOGISTICS_DISPATCH', 'ACCOUNTS_FINANCE', 'SERVICE_ENGINEERING'
  )),
  assigned_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  assigned_employee_name text,
  sla_deadline timestamp with time zone,
  resolution_type text,
  resolution_notes text,
  action_reference_no text,
  closure_otp text,
  dealer_satisfaction_rating integer,
  ticket_status text DEFAULT 'OPEN' CHECK (ticket_status IN ('OPEN', 'IN_PROGRESS', 'ACTION_TAKEN', 'RESOLVED_CLOSED', 'REJECTED')),
  created_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone
);
