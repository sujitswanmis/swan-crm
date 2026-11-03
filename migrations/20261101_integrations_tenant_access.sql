-- Apply after the three 20261031 integration migrations. No tenant is enabled automatically.
BEGIN;
SET LOCAL lock_timeout='2s';
CREATE TABLE IF NOT EXISTS public.integration_tenant_policies (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id), enabled boolean NOT NULL DEFAULT false,
  features jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(features)='object'),
  branches jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(branches)='object'),
  revision bigint NOT NULL DEFAULT 0, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.integration_tenant_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.integration_tenant_policies FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.integration_tenant_policies TO service_role;

CREATE OR REPLACE FUNCTION public.integration_policy_allows(p_tenant_id uuid,p_branch_code text,p_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce((SELECT enabled AND features->p_feature='true'::jsonb AND
    CASE WHEN p_branch_code IS NOT NULL THEN
      coalesce(branches->p_branch_code->'enabled','true'::jsonb)='true'::jsonb AND
      coalesce(branches->p_branch_code->'features'->p_feature,'true'::jsonb)='true'::jsonb
    ELSE NOT EXISTS(SELECT 1 FROM jsonb_each(branches) b WHERE
      coalesce(b.value->'enabled','true'::jsonb)<>'true'::jsonb OR
      coalesce(b.value->'features'->p_feature,'true'::jsonb)<>'true'::jsonb) END
    FROM public.integration_tenant_policies WHERE tenant_id=p_tenant_id),false);
$$;
CREATE OR REPLACE FUNCTION public.integration_set_tenant_policy(
  p_tenant_id uuid,p_tenant_code text,p_branch_code text,p_policy jsonb,p_actor text,p_revision bigint DEFAULT 0)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_policy public.integration_tenant_policies%ROWTYPE; next_revision bigint;
  allowed text[]:=ARRAY['api_read','api_write','incoming','outgoing','external_pull','external_push','meta'];
BEGIN
  IF p_tenant_code !~ '^TNT[0-9]{5,}$' OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id) OR
    (p_branch_code IS NOT NULL AND (p_branch_code !~ '^TNT[0-9]{5,}-B[0-9]{4,}$' OR left(p_branch_code,length(p_tenant_code)+2)<>p_tenant_code||'-B')) THEN RAISE EXCEPTION 'scope_denied'; END IF;
  IF jsonb_typeof(p_policy)<>'object' OR (coalesce(p_policy->>'inherit','false')<>'true' AND
    (jsonb_typeof(p_policy->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_policy->'features') IS DISTINCT FROM 'object')) THEN RAISE EXCEPTION 'invalid_policy'; END IF;
  IF coalesce(p_policy->>'inherit','false')<>'true' AND EXISTS(SELECT 1 FROM jsonb_each(p_policy->'features') f WHERE NOT(f.key=ANY(allowed)) OR jsonb_typeof(f.value)<>'boolean') THEN RAISE EXCEPTION 'invalid_policy'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('integration-policy:'||p_tenant_id::text,0));
  SELECT * INTO current_policy FROM public.integration_tenant_policies WHERE tenant_id=p_tenant_id FOR UPDATE;
  IF coalesce(current_policy.revision,0)<>p_revision THEN RAISE EXCEPTION 'configuration_changed'; END IF;
  IF current_policy.tenant_id IS NULL THEN
    INSERT INTO public.integration_tenant_policies(tenant_id,updated_by) VALUES(p_tenant_id,p_actor) RETURNING * INTO current_policy;
  END IF;
  IF p_branch_code IS NULL THEN
    IF p_policy?'inherit' THEN RAISE EXCEPTION 'invalid_policy'; END IF;
    UPDATE public.integration_tenant_policies SET enabled=(p_policy->>'enabled')::boolean,features=p_policy->'features',
      revision=revision+1,updated_by=p_actor,updated_at=now() WHERE tenant_id=p_tenant_id RETURNING revision INTO next_revision;
  ELSE
    UPDATE public.integration_tenant_policies SET branches=CASE WHEN p_policy->>'inherit'='true' THEN branches-p_branch_code ELSE jsonb_set(branches,ARRAY[p_branch_code],p_policy,true) END,
      revision=revision+1,updated_by=p_actor,updated_at=now() WHERE tenant_id=p_tenant_id RETURNING revision INTO next_revision;
  END IF;
  INSERT INTO public.integration_audit_logs(tenant_id,branch_code,actor_code,operation,resource_code,metadata)
    VALUES(p_tenant_id,p_branch_code,p_actor,'tenant_access_changed',p_tenant_code,jsonb_build_object('policy',p_policy,'revision',next_revision));
  RETURN next_revision;
END $$;

CREATE OR REPLACE FUNCTION public.integration_connection_feature(p_type text,p_config jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN p_type='external' THEN CASE WHEN p_config->>'direction'='push' THEN 'external_push' ELSE 'external_pull' END ELSE p_type END;
$$;
CREATE OR REPLACE FUNCTION public.integration_claim_jobs(p_limit integer DEFAULT 5)
RETURNS SETOF public.integration_jobs LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  WITH candidates AS (
    SELECT j.id FROM public.integration_jobs j
    WHERE ((j.status='pending' AND j.available_at<=now()) OR (j.status='running' AND j.lease_until<now()))
      AND j.kind<>'receipt' AND j.attempts<6 AND EXISTS(SELECT 1 FROM public.integration_connections c
        WHERE c.code=j.connection_code AND c.tenant_id=j.tenant_id AND c.status='enabled'
        AND public.integration_policy_allows(j.tenant_id,coalesce(c.branch_code,j.branch_code),public.integration_connection_feature(c.type,c.config)))
    ORDER BY j.available_at,j.created_at LIMIT least(greatest(p_limit,1),5)*5 FOR UPDATE SKIP LOCKED
  ), fair AS (
    SELECT id FROM (SELECT j.id,j.available_at,row_number() OVER(PARTITION BY j.tenant_id ORDER BY j.available_at) AS rn
      FROM public.integration_jobs j JOIN candidates c USING(id)) ranked
    WHERE rn<=2 ORDER BY available_at LIMIT least(greatest(p_limit,1),5)
  )
  UPDATE public.integration_jobs j SET status='running',attempts=j.attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    FROM fair WHERE j.id=fair.id RETURNING j.*;
$$;
CREATE OR REPLACE FUNCTION public.integration_release_paused_job(p_id uuid,p_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE public.integration_jobs SET status='pending',attempts=greatest(attempts-1,0),error_code='tenant_integration_disabled',
    available_at=now()+interval '1 minute',lease_token=NULL,lease_until=NULL
    WHERE id=p_id AND lease_token=p_lease AND status='running';
  RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.integration_dispatch_events(p_limit integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE event public.integration_events%ROWTYPE; amount integer:=0;
BEGIN
  FOR event IN SELECT * FROM public.integration_events WHERE dispatched_at IS NULL
    AND public.integration_policy_allows(tenant_id,branch_code,'outgoing')
    ORDER BY occurred_at LIMIT least(greatest(p_limit,1),50) FOR UPDATE SKIP LOCKED LOOP
    INSERT INTO public.integration_jobs(tenant_id,branch_code,connection_code,kind,dedupe_key,payload)
      SELECT event.tenant_id,event.branch_code,c.code,'delivery','event:'||event.code||':'||c.code,jsonb_build_object('event_code',event.code)
      FROM public.integration_connections c WHERE c.tenant_id=event.tenant_id AND c.type='outgoing' AND c.status='enabled'
        AND c.created_at<=event.occurred_at AND (c.branch_code IS NULL OR c.branch_code=event.branch_code)
        AND public.integration_policy_allows(c.tenant_id,coalesce(c.branch_code,event.branch_code),'outgoing') AND c.config->'events' ? event.event_type
      ON CONFLICT(tenant_id,dedupe_key) DO NOTHING;
    UPDATE public.integration_events SET dispatched_at=now() WHERE code=event.code;
    amount:=amount+1;
  END LOOP;
  RETURN amount;
END $$;

-- Preserve the established atomic writer privately, then guard its unchanged public contract.
-- Only the owner can execute the private implementation; service_role cannot bypass the guard.
DO $$ BEGIN
  IF to_regprocedure('public.integration_write_lead_base(uuid,text,text,jsonb,text,text,text,text,jsonb)') IS NULL THEN
    EXECUTE replace(pg_get_functiondef('public.integration_write_lead(uuid,text,text,jsonb,text,text,text,text,jsonb)'::regprocedure),
      'FUNCTION public.integration_write_lead(', 'FUNCTION public.integration_write_lead_base(');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.integration_write_lead_base(uuid,text,text,jsonb,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.integration_write_lead(
  p_tenant_id uuid,p_branch_code text,p_actor text,p_payload jsonb,p_identity text,p_request_hash text,
  p_lead_code text DEFAULT NULL,p_operating_company text DEFAULT NULL,p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE feature text;
BEGIN
  SELECT public.integration_connection_feature(type,config) INTO feature FROM public.integration_connections WHERE code=p_actor AND tenant_id=p_tenant_id;
  IF NOT public.integration_policy_allows(p_tenant_id,p_branch_code,coalesce(feature,'api_write')) THEN RAISE EXCEPTION 'tenant_integration_disabled'; END IF;
  RETURN public.integration_write_lead_base(p_tenant_id,p_branch_code,p_actor,p_payload,p_identity,p_request_hash,p_lead_code,p_operating_company,p_metadata);
END $$;
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('integration_policy_allows','integration_set_tenant_policy','integration_connection_feature','integration_claim_jobs','integration_release_paused_job','integration_dispatch_events','integration_write_lead') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
