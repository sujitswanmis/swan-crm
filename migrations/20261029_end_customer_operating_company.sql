-- Additive operating-company field for End Customer registration/import.
-- Existing records and Customer ID counters are preserved.
BEGIN;
ALTER TABLE IF EXISTS public.end_customers
  ADD COLUMN IF NOT EXISTS our_company varchar(100);
NOTIFY pgrst, 'reload schema';
COMMIT;
