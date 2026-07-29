-- ====================================================================
-- PHASE 1 MIGRATION: UNIVERSAL ORGANIZATION, DESIGNATION & EMPLOYEE MASTER
-- Multi-Tenant SaaS WMS Infrastructure
-- Safety: Non-destructive, idempotent (IF NOT EXISTS), dual-write enabled
-- ====================================================================

-- 1. Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- 2. SAAS MULTI-TENANT ENGINE
-- ====================================================================

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_code text UNIQUE NOT NULL,
  name text NOT NULL,
  domain text,
  custom_domain text,
  logo_url text,
  primary_contact_email text,
  primary_contact_mobile text,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'READ_ONLY', 'SUSPENDED', 'ARCHIVED')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Seed default tenant for single-tenant / backward compatibility
INSERT INTO tenants (id, tenant_code, name, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'SWAN_DEFAULT', 'Swan Agro Default Tenant', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_name text DEFAULT 'ENTERPRISE',
  user_seat_limit integer DEFAULT 100,
  valid_from timestamp with time zone DEFAULT now(),
  valid_until timestamp with time zone DEFAULT (now() + interval '1 year'),
  status text DEFAULT 'ACTIVE',
  billing_cycle text DEFAULT 'ANNUAL',
  amount numeric(12,2) DEFAULT 0.00,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  is_enabled boolean DEFAULT true,
  config_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, module_key)
);

CREATE TABLE IF NOT EXISTS tenant_usage_meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  current_value integer DEFAULT 0,
  max_limit integer DEFAULT 10000,
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, metric_key)
);

-- ====================================================================
-- 3. UNIVERSAL ORGANIZATION MASTER
-- ====================================================================

-- Group Company
CREATE TABLE IF NOT EXISTS group_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, code)
);

-- Company Master
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  group_company_id uuid REFERENCES group_companies(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  legal_name text,
  gstin text,
  pan text,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, code)
);

-- Business Unit Master
CREATE TABLE IF NOT EXISTS business_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, company_id, code)
);

-- Plant Master
CREATE TABLE IF NOT EXISTS plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  business_unit_id uuid REFERENCES business_units(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  address text,
  state text,
  district text,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, code)
);

-- Branch Master
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  branch_type text DEFAULT 'SALES_BRANCH',
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, company_id, code)
);

-- Department Master (Enhanced WMS version)
CREATE TABLE IF NOT EXISTS departments_wms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  head_employee_id uuid,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- Sub-Department Master
CREATE TABLE IF NOT EXISTS sub_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES departments_wms(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(department_id, name)
);

-- Section Master
CREATE TABLE IF NOT EXISTS sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  sub_department_id uuid NOT NULL REFERENCES sub_departments(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now()
);

-- Work Centre Master
CREATE TABLE IF NOT EXISTS work_centres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  plant_id uuid REFERENCES plants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now()
);

-- Cost Centre Master
CREATE TABLE IF NOT EXISTS cost_centres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now()
);

-- Work Location Master
CREATE TABLE IF NOT EXISTS work_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  location_type text DEFAULT 'OFFICE',
  state text,
  district text,
  address text,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now()
);

-- ====================================================================
-- 4. DEDICATED DESIGNATION MASTER
-- ====================================================================

CREATE TABLE IF NOT EXISTS designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  designation_code text NOT NULL,
  designation_name text NOT NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  business_unit_id uuid REFERENCES business_units(id) ON DELETE SET NULL,
  department_id uuid REFERENCES departments_wms(id) ON DELETE SET NULL,
  sub_department_id uuid REFERENCES sub_departments(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'Executive' CHECK (category IN (
    'Management', 'Head of Department', 'Senior Manager', 'Manager',
    'Assistant Manager', 'Team Leader', 'Coordinator', 'Executive',
    'Telecaller', 'Operator', 'Worker', 'Trainee', 'Consultant', 'Contract Employee'
  )),
  designation_level text NOT NULL DEFAULT 'L08' CHECK (designation_level IN (
    'L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10'
  )),
  hierarchy_rank integer DEFAULT 50,
  reports_to_designation_id uuid REFERENCES designations(id) ON DELETE SET NULL,
  management_level integer DEFAULT 1,
  is_manager_eligible boolean DEFAULT false,
  is_functional_manager_eligible boolean DEFAULT false,
  is_team_lead_eligible boolean DEFAULT false,
  is_approval_authority boolean DEFAULT false,
  is_assignment_eligible boolean DEFAULT true,
  is_workflow_owner_eligible boolean DEFAULT true,
  default_access_profile text DEFAULT 'Standard User',
  default_data_visibility text DEFAULT 'Own Records Only',
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  active_status text DEFAULT 'ACTIVE' CHECK (active_status IN ('ACTIVE', 'INACTIVE')),
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, designation_code)
);

-- ====================================================================
-- 5. EMPLOYEE MASTER & HISTORY
-- ====================================================================

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  emp_code text NOT NULL,
  emp_name text NOT NULL,
  user_type text DEFAULT 'Internal Employee' CHECK (user_type IN ('Internal Employee', 'External Contractor', 'Consultant', 'System Service')),
  email text,
  mobile text,
  gender text,
  dob date,
  doj date,
  designation_id uuid REFERENCES designations(id) ON DELETE SET NULL,
  designation_name text,
  department_id uuid REFERENCES departments_wms(id) ON DELETE SET NULL,
  department_name text,
  sub_department_id uuid REFERENCES sub_departments(id) ON DELETE SET NULL,
  sub_department_name text,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  company_name text,
  business_unit_id uuid REFERENCES business_units(id) ON DELETE SET NULL,
  plant_id uuid REFERENCES plants(id) ON DELETE SET NULL,
  work_location_id uuid REFERENCES work_locations(id) ON DELETE SET NULL,
  sales_location_state text,
  sales_location_name text,
  reporting_manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  reporting_manager_name text,
  functional_manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  functional_manager_name text,
  employment_type text DEFAULT 'Permanent' CHECK (employment_type IN ('Permanent', 'Probation', 'Contract', 'Consultant', 'Trainee', 'Apprentice', 'Work From Home', 'Temporary')),
  emp_status text DEFAULT 'Active' CHECK (emp_status IN ('Draft', 'Active', 'On Notice', 'Suspended', 'Inactive', 'Resigned', 'Terminated', 'Retired', 'Transferred')),
  login_status boolean DEFAULT true,
  last_gps text,
  last_heartbeat timestamp with time zone,
  latitude numeric(10,8),
  longitude numeric(11,8),
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, emp_code)
);

CREATE TABLE IF NOT EXISTS employee_designation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  old_designation_id uuid REFERENCES designations(id),
  new_designation_id uuid REFERENCES designations(id),
  old_department_id uuid REFERENCES departments_wms(id),
  new_department_id uuid REFERENCES departments_wms(id),
  old_reporting_manager_id uuid REFERENCES employees(id),
  new_reporting_manager_id uuid REFERENCES employees(id),
  old_work_location_id uuid REFERENCES work_locations(id),
  new_work_location_id uuid REFERENCES work_locations(id),
  change_type text NOT NULL CHECK (change_type IN (
    'New Joining', 'Promotion', 'Demotion', 'Transfer', 'Department Change',
    'Designation Correction', 'Temporary Assignment', 'Acting Charge',
    'Reporting Change', 'Location Transfer'
  )),
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  change_reason text,
  approved_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_reporting_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  manager_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  relationship_type text DEFAULT 'PRIMARY' CHECK (relationship_type IN ('PRIMARY', 'FUNCTIONAL', 'DOTTED_LINE', 'PROJECT', 'ACTING', 'DELEGATION')),
  scope text DEFAULT 'ALL',
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT check_no_self_reporting CHECK (employee_id <> manager_employee_id)
);

-- Circular Reporting Prevent Function
CREATE OR REPLACE FUNCTION check_circular_reporting()
RETURNS TRIGGER AS $$
DECLARE
  curr_mgr uuid;
BEGIN
  curr_mgr := NEW.manager_employee_id;
  
  WHILE curr_mgr IS NOT NULL LOOP
    IF curr_mgr = NEW.employee_id THEN
      RAISE EXCEPTION 'Circular reporting relationship detected! Employee % cannot report to Manager % directly or indirectly.', NEW.employee_id, NEW.manager_employee_id;
    END IF;
    
    SELECT manager_employee_id INTO curr_mgr
    FROM employee_reporting_relations
    WHERE employee_id = curr_mgr AND status = 'ACTIVE' AND relationship_type = 'PRIMARY'
    LIMIT 1;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_circular_reporting ON employee_reporting_relations;
CREATE TRIGGER trigger_prevent_circular_reporting
BEFORE INSERT OR UPDATE ON employee_reporting_relations
FOR EACH ROW EXECUTE PROCEDURE check_circular_reporting();

-- ====================================================================
-- 6. DUAL-WRITE SYNC TRIGGER: EMPLOYEES <-> USER_ROLES
-- Ensures 100% Backward Compatibility with Existing Application Code
-- ====================================================================

CREATE OR REPLACE FUNCTION sync_employee_to_user_roles()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO user_roles (
      user_id,
      emp_id,
      emp_name,
      emp_department,
      emp_designation,
      company,
      emp_mobile,
      role,
      is_approved,
      created_at
    )
    VALUES (
      NEW.user_id,
      NEW.emp_code,
      NEW.emp_name,
      COALESCE(NEW.department_name, 'Sales & Marketing'),
      COALESCE(NEW.designation_name, 'Executive'),
      COALESCE(NEW.company_name, 'Swan Agro'),
      NEW.mobile,
      'agent',
      true,
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      emp_id = EXCLUDED.emp_id,
      emp_name = EXCLUDED.emp_name,
      emp_department = EXCLUDED.emp_department,
      emp_designation = EXCLUDED.emp_designation,
      company = EXCLUDED.company,
      emp_mobile = EXCLUDED.emp_mobile;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_employee_to_user_roles ON employees;
CREATE TRIGGER trigger_sync_employee_to_user_roles
AFTER INSERT OR UPDATE ON employees
FOR EACH ROW EXECUTE PROCEDURE sync_employee_to_user_roles();

-- Seed initial default departments if empty
INSERT INTO departments_wms (tenant_id, code, name)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'DEPT-SALES', 'Sales & Marketing'),
  ('00000000-0000-0000-0000-000000000001', 'DEPT-PURCHASE', 'Purchase'),
  ('00000000-0000-0000-0000-000000000001', 'DEPT-PROD', 'Production'),
  ('00000000-0000-0000-0000-000000000001', 'DEPT-HR', 'Human Resource'),
  ('00000000-0000-0000-0000-000000000001', 'DEPT-FIN', 'Accounts & Finance'),
  ('00000000-0000-0000-0000-000000000001', 'DEPT-DISP', 'Dispatch & Logistics')
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Seed default company if empty
INSERT INTO companies (tenant_id, code, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'CMP-SWAN', 'Swan Agro')
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Seed standard designations
INSERT INTO designations (tenant_id, designation_code, designation_name, category, designation_level, hierarchy_rank, is_manager_eligible)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'DESIG-DIR', 'Director', 'Management', 'L01', 10, true),
  ('00000000-0000-0000-0000-000000000001', 'DESIG-HOD', 'Head of Department', 'Head of Department', 'L03', 30, true),
  ('00000000-0000-0000-0000-000000000001', 'DESIG-SMGR', 'Senior Manager', 'Senior Manager', 'L04', 40, true),
  ('00000000-0000-0000-0000-000000000001', 'DESIG-MGR', 'Manager', 'Manager', 'L04', 45, true),
  ('00000000-0000-0000-0000-000000000001', 'DESIG-TL', 'Team Leader', 'Team Leader', 'L06', 60, true),
  ('00000000-0000-0000-0000-000000000001', 'DESIG-EXEC', 'Sales Executive', 'Executive', 'L08', 80, false),
  ('00000000-0000-0000-0000-000000000001', 'DESIG-TCALL', 'Telecaller', 'Telecaller', 'L08', 85, false)
ON CONFLICT (tenant_id, designation_code) DO NOTHING;
