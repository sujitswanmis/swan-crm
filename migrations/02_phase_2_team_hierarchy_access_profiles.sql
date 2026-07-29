-- ====================================================================
-- PHASE 2 MIGRATION: TEAM HIERARCHY, ACCESS PROFILES & APPROVAL ROUTING
-- Multi-Tenant SaaS WMS Infrastructure
-- ====================================================================

-- 1. ACCESS PROFILES TABLE
CREATE TABLE IF NOT EXISTS access_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  profile_code text NOT NULL,
  profile_name text NOT NULL,
  description text,
  module_access jsonb DEFAULT '{}'::jsonb,
  data_visibility_scope text DEFAULT 'Own Records Only' CHECK (data_visibility_scope IN (
    'Own Records Only', 'Assigned Records', 'Direct Reports', 'Recursive Subordinates',
    'Functional Team', 'Department', 'Sub-Department', 'Territory', 'State',
    'Company', 'Business Unit', 'Workflow', 'All Records'
  )),
  can_import_export boolean DEFAULT false,
  can_approve boolean DEFAULT false,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, profile_code)
);

-- Seed standard default profiles
INSERT INTO access_profiles (tenant_id, profile_code, profile_name, data_visibility_scope, can_import_export, can_approve)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'PROF-ADMIN', 'System Administrator', 'All Records', true, true),
  ('00000000-0000-0000-0000-000000000001', 'PROF-HOD', 'Head of Department', 'Department', true, true),
  ('00000000-0000-0000-0000-000000000001', 'PROF-MGR', 'Sales Manager', 'Recursive Subordinates', true, true),
  ('00000000-0000-0000-0000-000000000001', 'PROF-TL', 'Team Leader Access', 'Direct Reports', false, true),
  ('00000000-0000-0000-0000-000000000001', 'PROF-EXEC', 'Field Executive', 'Assigned Records', false, false),
  ('00000000-0000-0000-0000-000000000001', 'PROF-TCALL', 'Telecaller Workspace', 'Own Records Only', false, false)
ON CONFLICT (tenant_id, profile_code) DO NOTHING;

-- 2. USER ACCESS OVERRIDES TABLE (User Restrictions have highest priority)
CREATE TABLE IF NOT EXISTS user_access_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  override_type text NOT NULL CHECK (override_type IN ('GRANT', 'RESTRICT')),
  module_key text NOT NULL,
  permission_action text NOT NULL CHECK (permission_action IN ('view', 'create', 'edit', 'delete', 'export', 'approve')),
  reason text,
  granted_by uuid,
  effective_from timestamp with time zone DEFAULT now(),
  effective_to timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. APPROVAL ROUTING RULES TABLE
CREATE TABLE IF NOT EXISTS approval_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  rule_name text NOT NULL,
  module_name text NOT NULL,
  workflow_type text,
  stage_name text,
  approval_level integer DEFAULT 1,
  approver_designation_id uuid REFERENCES designations(id) ON DELETE SET NULL,
  approver_employee_override_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  department_id uuid REFERENCES departments_wms(id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  min_value numeric(14,2) DEFAULT 0.00,
  max_value numeric(14,2),
  tat_hours integer DEFAULT 24,
  escalation_designation_id uuid REFERENCES designations(id) ON DELETE SET NULL,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, rule_code)
);

-- 4. RECURSIVE SUBORDINATES POSTGRES FUNCTION
CREATE OR REPLACE FUNCTION get_recursive_subordinates(mgr_emp_id uuid)
RETURNS TABLE (
  subordinate_id uuid,
  emp_code text,
  emp_name text,
  designation_name text,
  depth integer
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE team_tree AS (
    -- Anchor member
    SELECT 
      e.id AS subordinate_id,
      e.emp_code,
      e.emp_name,
      e.designation_name,
      1 AS depth
    FROM employees e
    WHERE e.reporting_manager_id = mgr_emp_id AND e.emp_status = 'Active'

    UNION ALL

    -- Recursive member
    SELECT 
      e.id AS subordinate_id,
      e.emp_code,
      e.emp_name,
      e.designation_name,
      tt.depth + 1 AS depth
    FROM employees e
    INNER JOIN team_tree tt ON e.reporting_manager_id = tt.subordinate_id
    WHERE e.emp_status = 'Active'
  )
  SELECT * FROM team_tree;
END;
$$ LANGUAGE plpgsql;
