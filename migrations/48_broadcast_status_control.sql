-- Migration 48: Broadcast status control (Play, Pause, Cancel)
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'crm_broadcasts' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.crm_broadcasts 
    ADD COLUMN status text NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'paused', 'cancelled', 'expired'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_broadcasts_status ON public.crm_broadcasts(status, expires_at);

COMMIT;
