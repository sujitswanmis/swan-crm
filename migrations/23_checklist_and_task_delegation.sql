-- ====================================================================
-- PHASE 23 MIGRATION: RECURRING CHECKLIST & EMP-TO-EMP TASK DELEGATION
-- Multi-Tenant WMS / CRM Infrastructure
-- Safety: Non-destructive, idempotent (IF NOT EXISTS)
-- ====================================================================

-- 1. Checklist Templates Master Table
CREATE TABLE IF NOT EXISTS checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  title text NOT NULL,
  description text,
  frequency text NOT NULL DEFAULT 'DAILY' CHECK (frequency IN ('DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY')),
  department text,
  category text DEFAULT 'GENERAL',
  assigned_type text DEFAULT 'EMPLOYEE' CHECK (assigned_type IN ('EMPLOYEE', 'ROLE', 'DEPARTMENT', 'ALL')),
  assigned_employee_id text,
  assigned_employee_name text,
  assigned_employee_email text,
  due_time text DEFAULT '18:00',
  days_of_week jsonb DEFAULT '[]'::jsonb,
  day_of_month integer DEFAULT 1,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 2. Checklist Submissions / Executions Table
CREATE TABLE IF NOT EXISTS checklist_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  template_id uuid NOT NULL,
  template_title text,
  frequency text NOT NULL,
  period_key text NOT NULL, -- e.g. '2026-08-29', '2026-W35', '2026-08-P1', '2026-08', '2026-Q3', '2026-H2', '2026'
  employee_id text,
  employee_name text NOT NULL,
  employee_email text NOT NULL,
  department text,
  status text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'PARTIAL', 'PENDING', 'OVERDUE', 'REJECTED')),
  items_completed_count integer DEFAULT 0,
  items_total_count integer DEFAULT 0,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamp with time zone DEFAULT now(),
  submission_notes text,
  verification_status text DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'APPROVED', 'REVISION_REQUESTED')),
  verified_by text,
  verified_at timestamp with time zone,
  verification_remarks text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_checklist_submission UNIQUE (template_id, employee_email, period_key)
);

-- 3. Delegation Tasks (Employee-to-Employee Task Management)
CREATE TABLE IF NOT EXISTS delegation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  task_code text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  category text DEFAULT 'GENERAL',
  delegated_by_id text,
  delegated_by_name text NOT NULL,
  delegated_by_email text NOT NULL,
  assigned_to_id text,
  assigned_to_name text NOT NULL,
  assigned_to_email text NOT NULL,
  assigned_to_department text,
  start_date timestamp with time zone DEFAULT now(),
  deadline timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'REOPENED', 'OVERDUE', 'CANCELLED')),
  subtasks jsonb DEFAULT '[]'::jsonb,
  attachments jsonb DEFAULT '[]'::jsonb,
  completion_notes text,
  completion_proof text,
  completed_at timestamp with time zone,
  is_overdue boolean DEFAULT false,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  feedback_remarks text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 4. Delegation Task Activities & Discussion Log
CREATE TABLE IF NOT EXISTS delegation_task_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  task_id uuid NOT NULL REFERENCES delegation_tasks(id) ON DELETE CASCADE,
  actor_name text NOT NULL,
  actor_email text NOT NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('CREATED', 'STATUS_CHANGE', 'COMMENT', 'SUBMISSION', 'VERIFIED', 'REOPENED', 'DEADLINE_EXTENDED', 'UPDATED')),
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Indexes for optimal lookup performance
CREATE INDEX IF NOT EXISTS idx_checklist_templates_freq ON checklist_templates (frequency);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_emp ON checklist_templates (assigned_employee_email);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_active ON checklist_templates (is_active);

CREATE INDEX IF NOT EXISTS idx_checklist_submissions_emp ON checklist_submissions (employee_email, period_key);
CREATE INDEX IF NOT EXISTS idx_checklist_submissions_template ON checklist_submissions (template_id);
CREATE INDEX IF NOT EXISTS idx_checklist_submissions_status ON checklist_submissions (status);

CREATE INDEX IF NOT EXISTS idx_delegation_tasks_assigned_to ON delegation_tasks (assigned_to_email, status);
CREATE INDEX IF NOT EXISTS idx_delegation_tasks_delegated_by ON delegation_tasks (delegated_by_email, status);
CREATE INDEX IF NOT EXISTS idx_delegation_tasks_deadline ON delegation_tasks (deadline);
CREATE INDEX IF NOT EXISTS idx_delegation_tasks_status ON delegation_tasks (status);

CREATE INDEX IF NOT EXISTS idx_delegation_activities_task ON delegation_task_activities (task_id, created_at);

-- Enable RLS & full access policies
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegation_task_activities ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'checklist_templates' AND policyname = 'Allow all access to checklist_templates') THEN
    CREATE POLICY "Allow all access to checklist_templates" ON checklist_templates FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'checklist_submissions' AND policyname = 'Allow all access to checklist_submissions') THEN
    CREATE POLICY "Allow all access to checklist_submissions" ON checklist_submissions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'delegation_tasks' AND policyname = 'Allow all access to delegation_tasks') THEN
    CREATE POLICY "Allow all access to delegation_tasks" ON delegation_tasks FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'delegation_task_activities' AND policyname = 'Allow all access to delegation_task_activities') THEN
    CREATE POLICY "Allow all access to delegation_task_activities" ON delegation_task_activities FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
