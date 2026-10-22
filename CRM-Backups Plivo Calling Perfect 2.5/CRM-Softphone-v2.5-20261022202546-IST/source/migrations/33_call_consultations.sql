-- Additive, isolated storage for attended Add Call / Merge operations.
-- Run in the Supabase SQL editor before enabling consultation calls.
BEGIN;
SET LOCAL TIME ZONE 'Asia/Kolkata';

CREATE TABLE IF NOT EXISTS public.call_consultations (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL UNIQUE REFERENCES public.call_sessions(id),
  room_name text NOT NULL UNIQUE,
  agent_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  company text NOT NULL DEFAULT '',
  mpc_name text NOT NULL UNIQUE,
  attempt_id uuid NOT NULL,
  phase text NOT NULL CHECK (phase IN (
    'preparing', 'dialing', 'ringing', 'consulting', 'merging',
    'cancelling', 'active', 'merged', 'failed', 'ended'
  )),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only authenticated server-side controls use the service role. Browsers have
-- no direct access to call UUIDs, private consultation state, or webhook URLs.
ALTER TABLE public.call_consultations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.call_consultations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.call_consultations TO service_role;
COMMENT ON TABLE public.call_consultations IS
  'Attended call state; timestamps are instants, displayed in Asia/Kolkata. Existing call tables and RLS policies are unchanged.';
COMMIT;

NOTIFY pgrst, 'reload schema';
