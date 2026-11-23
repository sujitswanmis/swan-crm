-- Recruiter-only change tracking and transactional offline replay.
BEGIN;

ALTER TABLE public.recruitment_positions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.recruitment_candidates ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.recruitment_candidate_notes ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS recruitment_positions_sync_snapshot
  ON public.recruitment_positions (tenant_id, id);
CREATE INDEX IF NOT EXISTS recruitment_candidates_sync_snapshot
  ON public.recruitment_candidates (position_id, id);
CREATE INDEX IF NOT EXISTS recruitment_notes_sync_snapshot
  ON public.recruitment_candidate_notes (candidate_id, id);

-- Updating a tenant's counter in the same transaction as its events gives
-- the cursor commit order. Rollbacks cannot leave late events behind it.
CREATE TABLE IF NOT EXISTS public.recruiter_sync_clock (
  tenant_id uuid PRIMARY KEY,
  revision bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS public.recruiter_sync_changes (
  tenant_id uuid NOT NULL,
  revision bigint NOT NULL,
  entity text NOT NULL CHECK (entity IN ('positions', 'candidates', 'notes')),
  row_id uuid NOT NULL,
  position_id uuid,
  candidate_id uuid,
  scope_changed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, revision)
);
CREATE INDEX IF NOT EXISTS recruiter_sync_changes_notes
  ON public.recruiter_sync_changes (tenant_id, candidate_id, revision)
  WHERE entity = 'notes';

CREATE TABLE IF NOT EXISTS public.recruiter_mutation_receipts (
  user_id uuid NOT NULL,
  mutation_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  entity text NOT NULL,
  row_id uuid NOT NULL,
  PRIMARY KEY (user_id, mutation_id)
);
ALTER TABLE public.recruiter_sync_clock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruiter_sync_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruiter_mutation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recruiter_sync_clock, public.recruiter_sync_changes, public.recruiter_mutation_receipts FROM anon, authenticated;
GRANT SELECT ON public.recruiter_sync_clock, public.recruiter_sync_changes, public.recruiter_mutation_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.recruiter_record_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  before_row jsonb;
  after_row jsonb;
  before_tenant uuid;
  after_tenant uuid;
  position_key uuid;
  candidate_key uuid;
  entity_name text := TG_ARGV[0];
  scope_tenant uuid;
  next_rev bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN before_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN after_row := to_jsonb(NEW); END IF;

  IF entity_name = 'positions' THEN
    position_key := COALESCE(after_row->>'id', before_row->>'id')::uuid;
    before_tenant := (before_row->>'tenant_id')::uuid;
    after_tenant := (after_row->>'tenant_id')::uuid;
  ELSIF entity_name = 'candidates' THEN
    candidate_key := COALESCE(after_row->>'id', before_row->>'id')::uuid;
    position_key := COALESCE(after_row->>'position_id', before_row->>'position_id')::uuid;
    SELECT tenant_id INTO before_tenant FROM public.recruitment_positions WHERE id = (before_row->>'position_id')::uuid;
    SELECT tenant_id INTO after_tenant FROM public.recruitment_positions WHERE id = (after_row->>'position_id')::uuid;
    before_tenant := COALESCE(before_tenant, (before_row->>'tenant_id')::uuid);
    after_tenant := COALESCE(after_tenant, (after_row->>'tenant_id')::uuid);
  ELSE
    candidate_key := COALESCE(after_row->>'candidate_id', before_row->>'candidate_id')::uuid;
    SELECT p.tenant_id, p.id INTO after_tenant, position_key
      FROM public.recruitment_candidates c
      JOIN public.recruitment_positions p ON p.id = c.position_id
      WHERE c.id = candidate_key;
  END IF;

  FOR scope_tenant IN
    SELECT DISTINCT tenant FROM unnest(ARRAY[before_tenant, after_tenant]) AS scopes(tenant)
    WHERE tenant IS NOT NULL ORDER BY tenant
  LOOP
    INSERT INTO public.recruiter_sync_clock AS clock (tenant_id, revision)
      VALUES (scope_tenant, 1)
      ON CONFLICT (tenant_id) DO UPDATE SET revision = clock.revision + 1
      RETURNING revision INTO next_rev;
    INSERT INTO public.recruiter_sync_changes (tenant_id, revision, entity, row_id, position_id, candidate_id, scope_changed)
      VALUES (scope_tenant, next_rev, entity_name, COALESCE(after_row->>'id', before_row->>'id')::uuid, position_key, candidate_key,
        entity_name = 'positions' AND TG_OP = 'UPDATE' AND
          (before_tenant IS DISTINCT FROM after_tenant
           OR before_row->>'branch_code' IS DISTINCT FROM after_row->>'branch_code'));
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER recruiter_sync_positions BEFORE INSERT OR UPDATE OR DELETE
  ON public.recruitment_positions FOR EACH ROW EXECUTE FUNCTION public.recruiter_record_change('positions');
CREATE OR REPLACE TRIGGER recruiter_sync_candidates BEFORE INSERT OR UPDATE OR DELETE
  ON public.recruitment_candidates FOR EACH ROW EXECUTE FUNCTION public.recruiter_record_change('candidates');
CREATE OR REPLACE TRIGGER recruiter_sync_notes BEFORE INSERT OR UPDATE OR DELETE
  ON public.recruitment_candidate_notes FOR EACH ROW EXECUTE FUNCTION public.recruiter_record_change('notes');

-- The server authorizes and normalizes the record before calling this
-- service-role-only function. The receipt and data write commit together.
CREATE OR REPLACE FUNCTION public.recruiter_apply_mutation(
  p_user uuid, p_mutation uuid, p_tenant uuid, p_entity text, p_operation text,
  p_id uuid, p_payload jsonb, p_expected timestamptz DEFAULT NULL,
  p_note text DEFAULT NULL, p_actor text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  table_name text;
  fields text;
  expressions text;
  result jsonb;
  existing public.recruiter_mutation_receipts%ROWTYPE;
  current_row jsonb;
BEGIN
  table_name := CASE p_entity
    WHEN 'positions' THEN 'recruitment_positions'
    WHEN 'candidates' THEN 'recruitment_candidates'
    WHEN 'notes' THEN 'recruitment_candidate_notes'
  END;
  IF table_name IS NULL OR p_operation NOT IN ('insert', 'update', 'delete') THEN
    RAISE EXCEPTION 'Invalid recruiter sync operation';
  END IF;

  INSERT INTO public.recruiter_mutation_receipts (user_id, mutation_id, tenant_id, entity, row_id)
    VALUES (p_user, p_mutation, p_tenant, p_entity, p_id)
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO existing FROM public.recruiter_mutation_receipts
      WHERE user_id = p_user AND mutation_id = p_mutation;
    IF existing.tenant_id <> p_tenant OR existing.entity <> p_entity OR existing.row_id <> p_id THEN
      RAISE EXCEPTION 'Recruiter sync request does not match its original record';
    END IF;
    RETURN jsonb_build_object('id', p_id);
  END IF;

  IF p_operation <> 'insert' THEN
    EXECUTE format('SELECT to_jsonb(target) FROM public.%I target WHERE id = $1 FOR UPDATE', table_name)
      INTO current_row USING p_id;
    IF current_row IS NULL OR (current_row->>'updated_at')::timestamptz IS DISTINCT FROM p_expected THEN
      RAISE EXCEPTION 'Recruiter record changed. Refresh before retrying.' USING ERRCODE = '40001';
    END IF;
  END IF;

  IF p_operation = 'delete' THEN
    IF p_entity = 'positions' THEN
      DELETE FROM public.recruitment_candidate_notes
        WHERE candidate_id IN (SELECT id FROM public.recruitment_candidates WHERE position_id = p_id);
      DELETE FROM public.recruitment_candidates WHERE position_id = p_id;
    ELSIF p_entity = 'candidates' THEN
      DELETE FROM public.recruitment_candidate_notes WHERE candidate_id = p_id;
    END IF;
    EXECUTE format('DELETE FROM public.%I target WHERE id = $1 RETURNING to_jsonb(target)', table_name)
      INTO result USING p_id;
  ELSE
    p_payload := COALESCE(p_payload, '{}'::jsonb) - 'created_at' - 'updated_at' - 'id';
    IF p_operation = 'insert' THEN
      p_payload := p_payload || jsonb_build_object('id', p_id);
    END IF;
    SELECT string_agg(format('%I', key), ', ' ORDER BY key),
           string_agg(format('data.%I', key), ', ' ORDER BY key)
      INTO fields, expressions FROM jsonb_object_keys(p_payload) AS keys(key);
    IF fields IS NULL THEN
      RAISE EXCEPTION 'No recruiter fields to save';
    END IF;
    IF p_operation = 'insert' THEN
      EXECUTE format(
        'INSERT INTO public.%1$I AS target (%2$s) SELECT %3$s FROM jsonb_populate_record(NULL::public.%1$I, $1) data RETURNING to_jsonb(target)',
        table_name, fields, expressions
      ) INTO result USING p_payload;
    ELSE
      EXECUTE format(
        'UPDATE public.%1$I AS target SET (%2$s) = (SELECT %3$s FROM jsonb_populate_record(NULL::public.%1$I, $1) data) WHERE id = $2 RETURNING to_jsonb(target)',
        table_name, fields, expressions
      ) INTO result USING p_payload, p_id;
    END IF;
  END IF;

  IF p_entity = 'candidates' AND p_operation <> 'delete' AND NULLIF(btrim(p_note), '') IS NOT NULL THEN
    INSERT INTO public.recruitment_candidate_notes (candidate_id, note_text, created_by)
      VALUES (p_id, p_note, p_actor);
  END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.recruiter_record_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recruiter_apply_mutation(uuid, uuid, uuid, text, text, uuid, jsonb, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruiter_apply_mutation(uuid, uuid, uuid, text, text, uuid, jsonb, timestamptz, text, text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
