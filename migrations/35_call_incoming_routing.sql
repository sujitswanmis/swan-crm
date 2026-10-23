-- Additive storage for explicit incoming Forward / Next Agent / Decline actions.
-- Run once in Supabase SQL Editor. Existing call tables and policies are untouched.
BEGIN;
SET LOCAL TIME ZONE 'Asia/Kolkata';

CREATE TABLE IF NOT EXISTS public.call_incoming_routing (
  id uuid PRIMARY KEY,
  parent_call_uuid text NOT NULL UNIQUE,
  workspace_key text NOT NULL,
  company text NOT NULL DEFAULT '',
  tenant_id uuid,
  account_id text NOT NULL,
  customer_number text NOT NULL,
  destination_number text NOT NULL,
  eligible_agent_ids uuid[] NOT NULL DEFAULT '{}',
  ringing_agent_ids uuid[] NOT NULL DEFAULT '{}',
  visited_agent_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN (
    'ringing', 'routing', 'forwarded', 'declined', 'connected', 'ended', 'failed'
  )),
  action text CHECK (action IN ('forward', 'next', 'decline', 'timeout')),
  operation_id uuid,
  requested_by uuid,
  next_agent_id uuid,
  invite_revision integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

ALTER TABLE public.call_incoming_routing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.call_incoming_routing FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.call_incoming_routing TO service_role;
CREATE INDEX IF NOT EXISTS call_incoming_routing_workspace_status_idx
  ON public.call_incoming_routing (workspace_key, status);
COMMENT ON TABLE public.call_incoming_routing IS
  'Tenant-scoped incoming routing intentions and revision guards. Timestamps are instants displayed in Asia/Kolkata; no provider credentials are stored.';
COMMIT;

NOTIFY pgrst, 'reload schema';
