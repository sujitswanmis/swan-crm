-- Bring the existing complaint table up to date with the complaint form and pipeline.
-- All additions are optional: existing rows, constraints, indexes and callers are preserved.
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.party_complaints
  ADD COLUMN IF NOT EXISTS complaint_type text,
  ADD COLUMN IF NOT EXISTS customer_id text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS stage_id text,
  ADD COLUMN IF NOT EXISTS stage_history jsonb,
  ADD COLUMN IF NOT EXISTS technician_name text,
  ADD COLUMN IF NOT EXISTS technician_phone text,
  ADD COLUMN IF NOT EXISTS scheduled_visit_date date,
  ADD COLUMN IF NOT EXISTS action_taken_type text,
  ADD COLUMN IF NOT EXISTS action_notes text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by text;

NOTIFY pgrst, 'reload schema';

COMMIT;
