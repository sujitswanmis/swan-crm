-- Additive registration metadata only. Existing updated_at delta index is reused.
-- Deleted drafts retain status DRAFT, so existing operational lead filters stay unchanged.
-- No existing records are backfilled or removed.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS registration_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_submitted_by text,
  ADD COLUMN IF NOT EXISTS registration_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_deleted_by text,
  ADD COLUMN IF NOT EXISTS registration_delete_reason text;
NOTIFY pgrst, 'reload schema';
COMMIT;
