-- ====================================================================
-- PHASE 7 & 8 MIGRATION: FULLY MANAGED PARTY MASTER & LEAD HANDOFF
-- Multi-Tenant SaaS WMS Infrastructure
-- ====================================================================

-- 1. PARTY ATOMIC CODE GENERATOR
CREATE SEQUENCE IF NOT EXISTS party_code_seq START WITH 100001 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION generate_atomic_party_code()
RETURNS text AS $$
DECLARE
  next_val bigint;
BEGIN
  next_val := nextval('party_code_seq');
  RETURN 'PTY-' || lpad(next_val::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- 2. PARTY MASTER TABLE
CREATE TABLE IF NOT EXISTS party_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  party_universal_code text UNIQUE NOT NULL,
  firm_name text NOT NULL,
  legal_name text,
  trade_name text,
  constitution_type text DEFAULT 'PROPRIETORSHIP' CHECK (constitution_type IN (
    'PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'INDIVIDUAL_FARMER', 'GOVERNMENT_DEPT'
  )),
  business_nature text,
  gstin text,
  pan text,
  cin text,
  udyam_number text,
  official_email text,
  primary_mobile text NOT NULL,
  website text,
  party_status text DEFAULT 'Draft' CHECK (party_status IN (
    'Draft', 'Draft_From_Lead', 'Verification_Pending', 'Documents_Pending',
    'Commercial_Pending', 'Approval_Pending', 'Approved', 'Active',
    'Hold', 'Inactive', 'Blacklisted', 'Rejected', 'Closed'
  )),
  onboarding_stage text DEFAULT 'S00_Party_Entry' CHECK (onboarding_stage IN (
    'S00_Party_Entry', 'S01_Registration', 'S02_Party_Classification',
    'S03_Dealer_Distributor_Mapping', 'S04_KYC_Commercial_Verification',
    'S05_Product_Authorization', 'S06_Territory_Allocation',
    'S07_Employee_Assignment', 'S08_Party_Activation'
  )),
  acquisition_source text,
  source_lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  external_sap_code text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 3. PARTY ROLES TABLE (One party can have multiple roles)
CREATE TABLE IF NOT EXISTS party_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  role_type text NOT NULL CHECK (role_type IN (
    'DISTRIBUTOR', 'DEALER', 'DIRECT_CUSTOMER', 'END_CUSTOMER_FARMER',
    'VENDOR', 'JOB_WORKER', 'TRANSPORTER', 'CONTRACTOR', 'SERVICE_PROVIDER'
  )),
  role_code text,
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(party_id, role_type)
);

-- 4. PARTY CONTACTS TABLE
CREATE TABLE IF NOT EXISTS party_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  contact_type text DEFAULT 'Primary' CHECK (contact_type IN (
    'Owner', 'Director', 'Order_Contact', 'Purchase_Contact',
    'Accounts_Contact', 'Billing_Contact', 'Service_Contact', 'Collection_Contact', 'Primary'
  )),
  designation text,
  primary_mobile text NOT NULL,
  alternate_mobile text,
  email text,
  is_whatsapp_allowed boolean DEFAULT true,
  is_primary boolean DEFAULT false,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now()
);

-- 5. PARTY ADDRESSES TABLE
CREATE TABLE IF NOT EXISTS party_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  address_type text NOT NULL CHECK (address_type IN (
    'REGISTERED', 'BILLING', 'SHIPPING', 'OFFICE', 'BRANCH', 'DEALER_OUTLET', 'GODOWN', 'WORKSHOP'
  )),
  address_line_1 text NOT NULL,
  address_line_2 text,
  state_id uuid REFERENCES location_states(id) ON DELETE SET NULL,
  state_name text,
  district_id uuid REFERENCES location_districts(id) ON DELETE SET NULL,
  district_name text,
  pincode text,
  is_primary boolean DEFAULT false,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now()
);

-- 6. DEALER-DISTRIBUTOR RELATIONSHIP TABLE
CREATE TABLE IF NOT EXISTS party_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  dealer_party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  distributor_party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  relationship_type text DEFAULT 'DEALER_UNDER_DISTRIBUTOR' CHECK (relationship_type IN (
    'INDEPENDENT_DEALER', 'DIRECT_DEALER', 'DEALER_UNDER_DISTRIBUTOR'
  )),
  is_primary boolean DEFAULT true,
  product_category text,
  territory_id uuid REFERENCES territories(id) ON DELETE SET NULL,
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- 7. PARTY BILLING ROUTE CONFIGURATION
CREATE TABLE IF NOT EXISTS party_billing_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  default_billing_route text DEFAULT 'COMPANY_TO_DISTRIBUTOR' CHECK (default_billing_route IN (
    'COMPANY_TO_DISTRIBUTOR', 'DISTRIBUTOR_TO_DEALER', 'COMPANY_TO_DEALER_DIRECT', 'COMPANY_TO_CUSTOMER_DIRECT'
  )),
  direct_billing_allowed boolean DEFAULT false,
  direct_billing_policy text DEFAULT 'ALLOWED_WITH_APPROVAL' CHECK (direct_billing_policy IN (
    'NOT_ALLOWED', 'ALLOWED', 'ALLOWED_WITH_APPROVAL', 'ORDER_WISE_DECISION'
  )),
  effective_from date DEFAULT CURRENT_DATE,
  updated_at timestamp with time zone DEFAULT now()
);

-- 8. PARTY COMMERCIAL & CREDIT TERMS
CREATE TABLE IF NOT EXISTS party_commercial_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  price_group text DEFAULT 'STANDARD',
  dealer_margin_percent numeric(5,2) DEFAULT 0.00,
  distributor_margin_percent numeric(5,2) DEFAULT 0.00,
  discount_limit_percent numeric(5,2) DEFAULT 0.00,
  payment_terms text DEFAULT 'NET_30',
  credit_days integer DEFAULT 30,
  credit_limit numeric(14,2) DEFAULT 0.00,
  available_credit numeric(14,2) DEFAULT 0.00,
  outstanding_amount numeric(14,2) DEFAULT 0.00,
  overdue_amount numeric(14,2) DEFAULT 0.00,
  credit_block_status boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 9. PARTY BANK ACCOUNTS
CREATE TABLE IF NOT EXISTS party_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  account_holder text NOT NULL,
  account_number text NOT NULL,
  ifsc_code text NOT NULL,
  branch_name text,
  is_primary boolean DEFAULT false,
  is_verified boolean DEFAULT false,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- 10. LEAD TO PARTY FIELD MAPPING BUILDER
CREATE TABLE IF NOT EXISTS lead_party_field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  lead_field text NOT NULL,
  party_field text NOT NULL,
  transformation_rule text DEFAULT 'DIRECT',
  is_mandatory boolean DEFAULT false,
  default_value text,
  status text DEFAULT 'ACTIVE'
);

-- Seed standard lead-to-party default field mappings
INSERT INTO lead_party_field_mappings (tenant_id, lead_field, party_field, is_mandatory)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'company', 'firm_name', true),
  ('00000000-0000-0000-0000-000000000001', 'name', 'primary_contact_name', true),
  ('00000000-0000-0000-0000-000000000001', 'phone', 'primary_mobile', true),
  ('00000000-0000-0000-0000-000000000001', 'email', 'official_email', false),
  ('00000000-0000-0000-0000-000000000001', 'state', 'address_state', false),
  ('00000000-0000-0000-0000-000000000001', 'district', 'address_district', false),
  ('00000000-0000-0000-0000-000000000001', 'address', 'address_line_1', false)
ON CONFLICT DO NOTHING;

-- 11. LEAD TO PARTY HANDOFF LOG
CREATE TABLE IF NOT EXISTS lead_party_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  target_party_id uuid REFERENCES party_master(id) ON DELETE CASCADE,
  transfer_type text DEFAULT 'NEW_PARTY_DRAFT' CHECK (transfer_type IN ('NEW_PARTY_DRAFT', 'LINK_EXISTING_PARTY')),
  handoff_status text DEFAULT 'PENDING_VERIFICATION' CHECK (handoff_status IN (
    'PENDING_VERIFICATION', 'APPROVED', 'ACTIVATED', 'REJECTED'
  )),
  transferred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  transferred_at timestamp with time zone DEFAULT now(),
  rejection_reason text
);
