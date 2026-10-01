-- Run this migration outside a transaction so the concurrent index does not
-- block normal lead writes. Existing columns and rows remain intact.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.crm_touch_lead_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.leads'::regclass
      AND tgname = 'crm_touch_lead_updated_at_trigger'
  ) THEN
    CREATE TRIGGER crm_touch_lead_updated_at_trigger
    BEFORE INSERT OR UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.crm_touch_lead_updated_at();
  END IF;
END;
$$;

CREATE INDEX CONCURRENTLY IF NOT EXISTS crm_leads_updated_at_id_idx
  ON public.leads (updated_at DESC, id);
