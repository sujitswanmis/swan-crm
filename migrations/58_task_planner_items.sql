-- ====================================================================
-- PHASE 58 MIGRATION: SMART TASK PLANNER & DAILY SCHEDULER
-- Multi-Tenant SaaS WMS / CRM Infrastructure
-- Safety: Non-destructive, idempotent (IF NOT EXISTS)
-- ====================================================================

CREATE TABLE IF NOT EXISTS task_planner_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Multi-Tenant & Branch Scoping
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_code varchar(20) NOT NULL,
  branch_code varchar(50) NOT NULL DEFAULT 'All',
  
  -- Employee Context
  employee_id text,
  employee_name text NOT NULL,
  employee_email text NOT NULL,
  department text,
  
  -- Task Details
  title text NOT NULL,
  description text,
  source_type text NOT NULL DEFAULT 'STANDALONE' 
    CHECK (source_type IN ('STANDALONE', 'DELEGATION', 'CHECKLIST', 'LEAD_FOLLOWUP', 'FIELD_TASK')),
  source_ref_id text,
  
  -- Scheduling (IST Indian Standard Time)
  planned_date date NOT NULL,
  time_slot_start text, -- e.g. '09:30'
  time_slot_end text,   -- e.g. '10:30'
  estimated_minutes integer DEFAULT 30,
  actual_minutes integer DEFAULT 0,
  
  -- Prioritization & Status
  priority text NOT NULL DEFAULT 'IMPORTANT_NOT_URGENT' 
    CHECK (priority IN ('URGENT_IMPORTANT', 'IMPORTANT_NOT_URGENT', 'URGENT_NOT_IMPORTANT', 'LOW')),
  status text NOT NULL DEFAULT 'PLANNED' 
    CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CARRIED_FORWARD', 'CANCELLED')),
  completed_at timestamp with time zone,
  carry_forward_count integer DEFAULT 0,
  notes text,
  
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Performance Indexes for high-speed multi-tenant & scoped queries
CREATE INDEX IF NOT EXISTS idx_task_planner_tenant_branch 
  ON task_planner_items (tenant_id, tenant_code, branch_code);

CREATE INDEX IF NOT EXISTS idx_task_planner_emp_date 
  ON task_planner_items (tenant_id, employee_email, planned_date);

CREATE INDEX IF NOT EXISTS idx_task_planner_status 
  ON task_planner_items (tenant_id, status);
