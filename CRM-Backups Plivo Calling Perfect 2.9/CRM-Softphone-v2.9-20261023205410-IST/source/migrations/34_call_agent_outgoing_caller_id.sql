-- Dedicated, non-unique caller ID: multiple employees may use the same number.
-- Existing calling rows, SIP credentials and call history are preserved.
SET lock_timeout = '3s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'call_agents'
      AND column_name = 'outgoing_caller_id'
  ) THEN
    ALTER TABLE public.call_agents ADD COLUMN outgoing_caller_id text;

    -- Copy legacy overrides only on the first run. Re-running this migration
    -- must not restore an override an administrator subsequently cleared.
    UPDATE public.call_agents
      SET outgoing_caller_id = trim(agent_code)
      WHERE user_id IS NOT NULL AND trim(agent_code) ~ '^\+?[0-9]{8,15}$';
  END IF;
END
$$;

COMMENT ON COLUMN public.call_agents.outgoing_caller_id IS
  'Outgoing caller ID override; NULL uses the workspace default. Not unique.';

NOTIFY pgrst, 'reload schema';
RESET lock_timeout;
