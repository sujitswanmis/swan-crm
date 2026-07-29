-- ====================================================================
-- PHASE 9 & 10 MIGRATION: TARGET PLANNING & UNIVERSAL WORKFLOW BUILDER
-- Multi-Tenant SaaS WMS Infrastructure
-- ====================================================================

-- 1. CLIENT NETWORK TARGET PLANNING TABLE
CREATE TABLE IF NOT EXISTS territory_network_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  territory_id uuid NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
  period_type text DEFAULT 'FINANCIAL_YEAR' CHECK (period_type IN ('FINANCIAL_YEAR', 'YEAR', 'QUARTER', 'MONTH', 'CAMPAIGN')),
  period_value text NOT NULL,
  target_distributor_count integer DEFAULT 0,
  target_direct_dealer_count integer DEFAULT 0,
  target_under_dealer_count integer DEFAULT 0,
  target_active_party_count integer DEFAULT 0,
  existing_active_party_count integer DEFAULT 0,
  client_gap integer GENERATED ALWAYS AS (target_active_party_count - existing_active_party_count) STORED,
  target_amount numeric(14,2) DEFAULT 0.00,
  achieved_amount numeric(14,2) DEFAULT 0.00,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, territory_id, period_type, period_value)
);

-- 2. TERRITORY MARKET POTENTIAL TABLE
CREATE TABLE IF NOT EXISTS territory_market_potential (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  territory_id uuid NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
  product_category text NOT NULL,
  season text DEFAULT 'KHARIF',
  major_crops text,
  tractor_population integer DEFAULT 0,
  cultivated_area_hectares numeric(10,2) DEFAULT 0.00,
  competitor_presence text,
  market_potential_rating text DEFAULT 'MEDIUM' CHECK (market_potential_rating IN (
    'HIGH', 'MEDIUM', 'LOW', 'DEVELOPMENT', 'SATURATED'
  )),
  created_at timestamp with time zone DEFAULT now()
);

-- 3. UNIVERSAL WORKFLOW DEFINITIONS TABLE
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_code text NOT NULL,
  workflow_name text NOT NULL,
  category text DEFAULT 'SALES' CHECK (category IN (
    'SALES', 'PURCHASE', 'PRODUCTION', 'QUALITY', 'DISPATCH', 'HR', 'PMS', 'FMS'
  )),
  description text,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, workflow_code)
);

-- 4. WORKFLOW VERSIONS TABLE
CREATE TABLE IF NOT EXISTS workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  is_published boolean DEFAULT false,
  published_at timestamp with time zone,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(workflow_id, version_number)
);

-- 5. WORKFLOW STAGES TABLE
CREATE TABLE IF NOT EXISTS workflow_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  stage_order integer NOT NULL,
  stage_name text NOT NULL,
  stage_code text NOT NULL,
  execution_type text DEFAULT 'SEQUENTIAL' CHECK (execution_type IN ('SEQUENTIAL', 'PARALLEL', 'CONDITIONAL_BRANCH')),
  planned_tat_hours numeric(6,2) DEFAULT 24.00,
  approval_required boolean DEFAULT false,
  approver_designation_id uuid REFERENCES designations(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(workflow_version_id, stage_order)
);

-- 6. CANONICAL S00 & STAGE FIELD MAPPINGS TABLE
CREATE TABLE IF NOT EXISTS stage_field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  display_label text NOT NULL,
  source_type text DEFAULT 'S00_FIELD' CHECK (source_type IN (
    'S00_FIELD', 'PREVIOUS_STAGE', 'EARLIER_STAGE_OUTPUT', 'PARTY_MASTER',
    'PRODUCT_MASTER', 'VENDOR_MASTER', 'LOCATION_MASTER', 'FORMULA', 'MANUAL_INPUT'
  )),
  source_field_path text,
  data_type text DEFAULT 'STRING' CHECK (data_type IN ('STRING', 'NUMBER', 'DATE', 'BOOLEAN', 'JSON', 'FILE')),
  snapshot_mode text DEFAULT 'SNAPSHOT_AT_STAGE_START' CHECK (snapshot_mode IN (
    'LIVE_REFERENCE', 'SNAPSHOT_AT_WORKFLOW_START', 'SNAPSHOT_AT_STAGE_START'
  )),
  is_mandatory boolean DEFAULT false,
  is_editable boolean DEFAULT true,
  display_order integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now()
);

-- 7. WORKFLOW INSTANCES TABLE
CREATE TABLE IF NOT EXISTS workflow_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  instance_code text UNIQUE NOT NULL,
  workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  s00_context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  party_id uuid REFERENCES party_master(id) ON DELETE SET NULL,
  current_stage_id uuid REFERENCES workflow_stages(id) ON DELETE SET NULL,
  instance_status text DEFAULT 'RUNNING' CHECK (instance_status IN (
    'RUNNING', 'COMPLETED', 'ON_HOLD', 'CANCELLED', 'REJECTED'
  )),
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- 8. STAGE INSTANCES TABLE
CREATE TABLE IF NOT EXISTS stage_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id uuid NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
  assigned_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  planned_start timestamp with time zone,
  planned_end timestamp with time zone,
  actual_start timestamp with time zone,
  actual_end timestamp with time zone,
  stage_data_json jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'SKIPPED', 'REJECTED'
  )),
  created_at timestamp with time zone DEFAULT now()
);
