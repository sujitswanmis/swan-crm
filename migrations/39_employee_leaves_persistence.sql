-- Run once in the connected Supabase project's SQL Editor before deploying
-- the leave-history update. Safe to run again. Existing attendance/punch,
-- employee, session, and calling tables are not modified.
BEGIN;
SET LOCAL timezone = 'Asia/Kolkata';

CREATE TABLE IF NOT EXISTS public.employee_leaves (
  -- Text IDs preserve existing leave_<timestamp> applications as well as UUIDs.
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id uuid NOT NULL,
  user_id uuid,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND length(email) > 3),
  emp_name text NOT NULL DEFAULT '',
  emp_code text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  leave_type text NOT NULL CHECK (leave_type IN ('CL', 'SL', 'EL', 'CPL', 'HALF_DAY', 'LWP')),
  from_date date NOT NULL,
  to_date date NOT NULL,
  total_days numeric(6, 1) NOT NULL CHECK (total_days > 0 AND total_days <= 366),
  half_day_session text CHECK (half_day_session IN ('FIRST_HALF', 'SECOND_HALF')),
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  applied_at timestamptz NOT NULL DEFAULT now(),
  approver_id uuid,
  approver_name text,
  approver_remarks text,
  action_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date AND to_date - from_date < 366),
  CHECK ((leave_type = 'HALF_DAY' AND from_date = to_date AND total_days = 0.5 AND half_day_session IS NOT NULL)
    OR (leave_type <> 'HALF_DAY' AND total_days = to_date - from_date + 1))
);

CREATE INDEX IF NOT EXISTS employee_leaves_employee_history
  ON public.employee_leaves (tenant_id, email, applied_at DESC);
CREATE INDEX IF NOT EXISTS employee_leaves_approval_queue
  ON public.employee_leaves (tenant_id, status, applied_at DESC);
CREATE INDEX IF NOT EXISTS employee_leaves_date_range
  ON public.employee_leaves (tenant_id, from_date, to_date);
CREATE UNIQUE INDEX IF NOT EXISTS employee_leaves_duplicate_application
  ON public.employee_leaves (tenant_id, email, from_date, to_date, leave_type, coalesce(half_day_session, ''))
  WHERE status IN ('PENDING', 'APPROVED');

-- All access goes through authenticated server actions with employee/team scope.
ALTER TABLE public.employee_leaves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_leaves FROM anon, authenticated;
GRANT ALL ON public.employee_leaves TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
