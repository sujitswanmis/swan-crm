-- Additive, isolated notification storage. Apply in the Supabase SQL Editor.
BEGIN;
SET LOCAL timezone = 'Asia/Kolkata';

CREATE TABLE IF NOT EXISTS public.crm_broadcasts (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 4000),
  duration_seconds integer NOT NULL CHECK (duration_seconds = 0 OR duration_seconds BETWEEN 5 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  audience jsonb NOT NULL,
  request_hash text NOT NULL,
  recipient_count integer NOT NULL CHECK (recipient_count > 0)
);
CREATE TABLE IF NOT EXISTS public.crm_broadcast_recipients (
  broadcast_id uuid NOT NULL REFERENCES public.crm_broadcasts(id),
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  email text NOT NULL,
  workspace_key text NOT NULL,
  workspace_name text NOT NULL,
  location_key text NOT NULL,
  location_name text NOT NULL,
  location_type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  shown_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  PRIMARY KEY (broadcast_id, user_id)
);
CREATE INDEX IF NOT EXISTS crm_broadcast_recipient_unread ON public.crm_broadcast_recipients(user_id, sent_at) WHERE read_at IS NULL;
ALTER TABLE public.crm_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_broadcast_recipients ENABLE ROW LEVEL SECURITY;
-- No client writes. Server actions verify identity and perform narrowly scoped updates.
REVOKE ALL ON public.crm_broadcasts, public.crm_broadcast_recipients FROM anon, authenticated;
GRANT SELECT ON public.crm_broadcast_recipients TO authenticated;
GRANT ALL ON public.crm_broadcasts, public.crm_broadcast_recipients TO service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crm_broadcast_recipients' AND policyname = 'broadcast_own_receipts') THEN
    CREATE POLICY broadcast_own_receipts ON public.crm_broadcast_recipients FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
  END IF;
END $$;

-- One transaction: either every intended recipient is saved or nobody is sent the message.
-- Only the server service role can call this function; recipient IDs never come from browser input.
CREATE OR REPLACE FUNCTION public.crm_send_broadcast(p_message jsonb, p_recipients jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path = public SET timezone = 'Asia/Kolkata' AS $$
DECLARE saved_id uuid; prior public.crm_broadcasts%ROWTYPE;
BEGIN
  saved_id := (p_message->>'id')::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended(saved_id::text, 0));
  SELECT * INTO prior FROM public.crm_broadcasts WHERE id = saved_id;
  IF FOUND THEN
    IF prior.created_by <> (p_message->>'created_by')::uuid OR prior.request_hash <> p_message->>'request_hash' THEN
      RAISE EXCEPTION 'Notification request ID already used';
    END IF;
    RETURN saved_id;
  END IF;
  IF jsonb_typeof(p_recipients) <> 'array' OR jsonb_array_length(p_recipients) NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'Select between 1 and 10000 recipients';
  END IF;
  IF (p_message->>'expires_at')::timestamptz <= now() THEN RAISE EXCEPTION 'Notification validity has expired'; END IF;
  INSERT INTO public.crm_broadcasts(id, created_by, title, message, duration_seconds, expires_at, audience, request_hash, recipient_count)
  VALUES(saved_id, (p_message->>'created_by')::uuid, p_message->>'title', p_message->>'message',
    (p_message->>'duration_seconds')::integer, (p_message->>'expires_at')::timestamptz,
    p_message->'audience', p_message->>'request_hash', jsonb_array_length(p_recipients));
  INSERT INTO public.crm_broadcast_recipients(broadcast_id, user_id, user_name, email, workspace_key, workspace_name, location_key, location_name, location_type)
  SELECT saved_id, r.user_id, r.user_name, r.email, r.workspace_key, r.workspace_name, r.location_key, r.location_name, r.location_type
  FROM jsonb_to_recordset(p_recipients) AS r(user_id uuid, user_name text, email text, workspace_key text, workspace_name text, location_key text, location_name text, location_type text);
  RETURN saved_id;
END $$;
REVOKE ALL ON FUNCTION public.crm_send_broadcast(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_send_broadcast(jsonb, jsonb) TO service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'crm_broadcast_recipients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_broadcast_recipients;
  END IF;
END $$;
COMMIT;
