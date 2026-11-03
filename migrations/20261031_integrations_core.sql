-- Additive integration infrastructure. Apply in staging first; no existing CRM data is changed.
-- All instants use timestamptz; business dates/ref codes use explicit Asia/Kolkata.
CREATE SEQUENCE IF NOT EXISTS public.integration_lead_ref_seq;

CREATE TABLE IF NOT EXISTS public.integration_connections (
  code text PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_code text, name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  type text NOT NULL CHECK (type IN ('external','incoming','outgoing','meta')),
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('enabled','paused','reconnect','archived')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb, credentials text, provider_subject_hash text,
  last_run_at timestamptz, next_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (branch_code IS NULL OR branch_code ~ '^TNT[0-9]{5,}-B[0-9]{4,}$')
);
CREATE INDEX IF NOT EXISTS integration_connections_scope_idx ON public.integration_connections(tenant_id,branch_code,status);
CREATE TABLE IF NOT EXISTS public.integration_api_keys (
  code text PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id), branch_code text,
  name text NOT NULL, key_hash text NOT NULL UNIQUE, key_prefix text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb, expires_at timestamptz, revoked_at timestamptz,
  last_used_at timestamptz, requests_per_minute integer NOT NULL DEFAULT 120 CHECK (requests_per_minute BETWEEN 1 AND 600),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (branch_code IS NULL OR branch_code ~ '^TNT[0-9]{5,}-B[0-9]{4,}$')
);
CREATE INDEX IF NOT EXISTS integration_keys_scope_idx ON public.integration_api_keys(tenant_id,branch_code);
CREATE TABLE IF NOT EXISTS public.integration_record_scopes (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), resource_type text NOT NULL DEFAULT 'lead',
  record_id text NOT NULL, branch_code text, source_key text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,resource_type,record_id), UNIQUE(tenant_id,source_key),
  CHECK (branch_code IS NULL OR branch_code ~ '^TNT[0-9]{5,}-B[0-9]{4,}$')
);
CREATE INDEX IF NOT EXISTS integration_record_branch_idx ON public.integration_record_scopes(tenant_id,branch_code,record_id);
CREATE TABLE IF NOT EXISTS public.integration_events (
  code text PRIMARY KEY DEFAULT ('EVT_' || replace(gen_random_uuid()::text,'-','')),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), branch_code text, event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, occurred_at timestamptz NOT NULL DEFAULT now(), dispatched_at timestamptz
);
CREATE INDEX IF NOT EXISTS integration_events_pending_idx ON public.integration_events(occurred_at) WHERE dispatched_at IS NULL;
CREATE TABLE IF NOT EXISTS public.integration_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE DEFAULT ('JOB_' || replace(gen_random_uuid()::text,'-','')),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), branch_code text,
  connection_code text REFERENCES public.integration_connections(code),
  kind text NOT NULL CHECK (kind IN ('incoming','delivery','pull','meta_lead','meta_sync','receipt')),
  dedupe_key text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, result jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','archived')),
  attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid, lease_until timestamptz, error_code text,
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE(tenant_id,dedupe_key)
);
CREATE INDEX IF NOT EXISTS integration_jobs_pending_idx ON public.integration_jobs(available_at,tenant_id) WHERE status IN ('pending','running');
CREATE INDEX IF NOT EXISTS integration_jobs_scope_idx ON public.integration_jobs(tenant_id,branch_code,created_at DESC);
CREATE TABLE IF NOT EXISTS public.integration_delivery_attempts (
  code text PRIMARY KEY DEFAULT ('TRY_' || replace(gen_random_uuid()::text,'-','')),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), branch_code text,
  job_code text NOT NULL, connection_code text, status text NOT NULL,
  http_status integer, attempt integer NOT NULL, error_code text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_attempts_scope_idx ON public.integration_delivery_attempts(tenant_id,branch_code,created_at DESC);
CREATE TABLE IF NOT EXISTS public.integration_oauth_states (
  state_hash text PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_code text, user_id uuid NOT NULL, connection_code text REFERENCES public.integration_connections(code),
  expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.integration_rate_limits (
  identity text PRIMARY KEY, period timestamptz NOT NULL, requests integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS public.integration_audit_logs (
  code text PRIMARY KEY DEFAULT ('AUD_' || replace(gen_random_uuid()::text,'-','')),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), branch_code text, actor_code text NOT NULL,
  operation text NOT NULL, resource_code text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_audit_scope_idx ON public.integration_audit_logs(tenant_id,branch_code,created_at DESC);

-- No direct browser access, including to ciphertext, job payloads, or hashes.
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['integration_connections','integration_api_keys','integration_record_scopes','integration_events','integration_jobs','integration_delivery_attempts','integration_oauth_states','integration_rate_limits','integration_audit_logs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',tbl);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO service_role',tbl);
  END LOOP;
END $$;
GRANT USAGE,SELECT ON SEQUENCE public.integration_lead_ref_seq TO service_role;

CREATE OR REPLACE FUNCTION public.integration_take_rate_limit(p_identity text,p_limit integer DEFAULT 120)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE amount integer;
BEGIN
  IF length(p_identity)>200 OR p_limit<1 OR p_limit>600 THEN RETURN false; END IF;
  INSERT INTO public.integration_rate_limits(identity,period) VALUES(p_identity,date_trunc('minute',now()))
  ON CONFLICT(identity) DO UPDATE SET period=excluded.period,
    requests=CASE WHEN integration_rate_limits.period=excluded.period THEN integration_rate_limits.requests+1 ELSE 1 END RETURNING requests INTO amount;
  RETURN amount<=p_limit;
END $$;

CREATE OR REPLACE FUNCTION public.integration_consume_oauth_state(p_hash text,p_user uuid)
RETURNS SETOF public.integration_oauth_states LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  UPDATE public.integration_oauth_states SET used_at=now()
  WHERE state_hash=p_hash AND user_id=p_user AND used_at IS NULL AND expires_at>now() RETURNING *;
$$;

CREATE OR REPLACE FUNCTION public.integration_claim_jobs(p_limit integer DEFAULT 5)
RETURNS SETOF public.integration_jobs LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  WITH candidates AS (
    SELECT id FROM public.integration_jobs
    WHERE ((status='pending' AND available_at<=now()) OR (status='running' AND lease_until<now()))
      AND kind<>'receipt' AND attempts<6
    ORDER BY available_at,created_at LIMIT least(greatest(p_limit,1),5)*5 FOR UPDATE SKIP LOCKED
  ), fair AS (
    SELECT id FROM (SELECT j.id,j.available_at,row_number() OVER(PARTITION BY j.tenant_id ORDER BY j.available_at) AS rn
      FROM public.integration_jobs j JOIN candidates c USING(id)) ranked
    WHERE rn<=2 ORDER BY available_at LIMIT least(greatest(p_limit,1),5)
  )
  UPDATE public.integration_jobs j SET status='running',attempts=j.attempts+1,
    lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  FROM fair WHERE j.id=fair.id RETURNING j.*;
$$;

CREATE OR REPLACE FUNCTION public.integration_finish_job(p_id uuid,p_lease uuid,p_success boolean,p_result jsonb,p_error text,p_retryable boolean DEFAULT true)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE public.integration_jobs SET
    status=CASE WHEN p_success THEN 'completed' WHEN p_retryable AND attempts<6 THEN 'pending' ELSE 'failed' END,
    result=coalesce(p_result,'{}'::jsonb),error_code=left(p_error,80),
    completed_at=CASE WHEN p_success OR NOT p_retryable OR attempts>=6 THEN now() ELSE NULL END,
    available_at=now()+make_interval(secs=>least(900,30*power(2,attempts)::integer)),lease_token=NULL,lease_until=NULL
  WHERE id=p_id AND lease_token=p_lease AND status='running';
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.integration_phone_key(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN length(digits)=12 AND left(digits,2)='91' THEN right(digits,10) ELSE digits END
  FROM (SELECT regexp_replace(coalesce(p_value,''),'[^0-9]','','g') AS digits) normalized;
$$;

-- Atomic save, ownership mapping and idempotency receipt. Only the authenticated server boundary calls this RPC.
CREATE OR REPLACE FUNCTION public.integration_write_lead(
  p_tenant_id uuid,p_branch_code text,p_actor text,p_payload jsonb,p_identity text,p_request_hash text,
  p_lead_code text DEFAULT NULL,p_operating_company text DEFAULT NULL,p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_lead public.leads%ROWTYPE; saved jsonb; receipt public.integration_jobs%ROWTYPE;
  ref text; matched boolean:=false; action text:='created'; scoped_branch text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND upper(coalesce(status,'ACTIVE')) NOT IN ('SUSPENDED','ARCHIVED','DRAFT','READ_ONLY')) THEN RAISE EXCEPTION 'tenant_unavailable'; END IF;
  IF p_identity IS NULL OR length(p_identity)>200 OR p_request_hash IS NULL OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'invalid_request'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':request:'||p_identity,0));
  SELECT * INTO receipt FROM public.integration_jobs WHERE tenant_id=p_tenant_id AND dedupe_key='write:'||p_identity;
  IF FOUND THEN
    IF receipt.payload->>'request_hash'<>p_request_hash THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
    RETURN receipt.result;
  END IF;
  IF p_lead_code IS NOT NULL THEN
    IF (SELECT count(*) FROM public.leads WHERE tenant_id=p_tenant_id AND lead_ref_id=p_lead_code)<>1 THEN RAISE EXCEPTION 'lead_not_found'; END IF;
    SELECT * INTO current_lead FROM public.leads l WHERE l.tenant_id=p_tenant_id AND l.lead_ref_id=p_lead_code
      AND (p_branch_code IS NULL OR EXISTS(SELECT 1 FROM public.integration_record_scopes s WHERE s.tenant_id=p_tenant_id AND s.resource_type='lead' AND s.record_id=l.id::text AND s.branch_code=p_branch_code)) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_found'; END IF;
    matched:=true; action:='updated';
  ELSIF coalesce(p_payload->>'phone','')<>'' OR coalesce(p_payload->>'email','')<>'' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':contact:'||coalesce(nullif(p_payload->>'phone',''),p_payload->>'email'),0));
    SELECT * INTO current_lead FROM public.leads l WHERE l.tenant_id=p_tenant_id
      AND ((coalesce(p_payload->>'phone','')<>'' AND (public.integration_phone_key(l.phone)=p_payload->>'phone' OR public.integration_phone_key(l.business_contact_1)=p_payload->>'phone'))
        OR (coalesce(p_payload->>'email','')<>'' AND lower(l.email)=lower(p_payload->>'email')))
      AND (p_branch_code IS NULL OR EXISTS(SELECT 1 FROM public.integration_record_scopes s WHERE s.tenant_id=p_tenant_id AND s.resource_type='lead' AND s.record_id=l.id::text AND s.branch_code=p_branch_code))
      ORDER BY l.created_at,l.id LIMIT 1 FOR UPDATE;
    matched:=FOUND;
    IF matched THEN action:='duplicate'; END IF;
  END IF;
  PERFORM set_config('crm.integration_write','on',true);
  IF action='updated' THEN
    UPDATE public.leads SET
      name=CASE WHEN p_payload?'name' THEN p_payload->>'name' ELSE name END,
      phone=CASE WHEN p_payload?'phone' THEN p_payload->>'phone' ELSE phone END,
      email=CASE WHEN p_payload?'email' THEN nullif(p_payload->>'email','') ELSE email END,
      company=CASE WHEN p_payload?'company' THEN p_payload->>'company' ELSE company END,
      city_name=CASE WHEN p_payload?'city_name' THEN p_payload->>'city_name' ELSE city_name END,
      district_name=CASE WHEN p_payload?'district_name' THEN p_payload->>'district_name' ELSE district_name END,
      state_name=CASE WHEN p_payload?'state_name' THEN p_payload->>'state_name' ELSE state_name END,
      address=CASE WHEN p_payload?'address' THEN p_payload->>'address' ELSE address END,
      pin_code=CASE WHEN p_payload?'pin_code' THEN p_payload->>'pin_code' ELSE pin_code END,
      requirement=CASE WHEN p_payload?'requirement' THEN p_payload->>'requirement' ELSE requirement END,
      source=CASE WHEN p_payload?'source' THEN p_payload->>'source' ELSE source END,
      source_name=CASE WHEN p_payload?'source_name' THEN p_payload->>'source_name' ELSE source_name END,
      priority=CASE WHEN p_payload?'priority' THEN p_payload->>'priority' ELSE priority END,
      status=CASE WHEN p_payload?'status' THEN p_payload->>'status' ELSE status END,
      assigned_to=CASE WHEN p_payload?'assigned_to' THEN p_payload->>'assigned_to' ELSE assigned_to END,
      updated_at=now()
    WHERE id=current_lead.id AND tenant_id=p_tenant_id RETURNING to_jsonb(leads) INTO saved;
  ELSIF NOT matched THEN
    IF to_regprocedure('public.generate_atomic_lead_id()') IS NOT NULL THEN
      BEGIN EXECUTE 'SELECT public.generate_atomic_lead_id()::text' INTO ref; EXCEPTION WHEN OTHERS THEN ref:=NULL; END;
    END IF;
    IF length(ref)>20 THEN ref:=NULL; END IF;
    ref:=coalesce(nullif(ref,''),'I'||to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYYMMDD')||'-'||nextval('public.integration_lead_ref_seq')::text);
    IF length(ref)>20 THEN RAISE EXCEPTION 'lead_reference_exhausted'; END IF;
    INSERT INTO public.leads(tenant_id,lead_ref_id,lead_date,name,phone,email,company,our_company,city_name,district_name,state_name,address,pin_code,requirement,source,source_name,priority,status,assigned_to,created_by,entry_by,created_at,updated_at)
    VALUES(p_tenant_id,ref,(now() AT TIME ZONE 'Asia/Kolkata')::date,p_payload->>'name',p_payload->>'phone',nullif(p_payload->>'email',''),p_payload->>'company',p_operating_company,
      p_payload->>'city_name',p_payload->>'district_name',p_payload->>'state_name',p_payload->>'address',p_payload->>'pin_code',p_payload->>'requirement',
      p_payload->>'source',p_payload->>'source_name',p_payload->>'priority',p_payload->>'status',p_payload->>'assigned_to',p_actor,p_actor,now(),now()) RETURNING to_jsonb(leads) INTO saved;
  ELSE saved:=to_jsonb(current_lead);
  END IF;
  IF action='created' THEN
    INSERT INTO public.integration_record_scopes(tenant_id,resource_type,record_id,branch_code,source_key,metadata)
    VALUES(p_tenant_id,'lead',saved->>'id',p_branch_code,p_identity,coalesce(p_metadata,'{}'::jsonb));
  END IF;
  SELECT branch_code INTO scoped_branch FROM public.integration_record_scopes WHERE tenant_id=p_tenant_id AND resource_type='lead' AND record_id=saved->>'id';
  -- Capture only the allowlisted external fields. No internal UUIDs or authentication data.
  saved:=(SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(saved)
    WHERE key IN ('lead_ref_id','name','phone','email','company','city_name','district_name','state_name','address','pin_code','requirement','source','source_name','priority','status','assigned_to','created_at','updated_at'));
  IF action<>'duplicate' THEN
    INSERT INTO public.integration_events(tenant_id,branch_code,event_type,payload)
    VALUES(p_tenant_id,scoped_branch,CASE WHEN action='created' THEN 'lead.created' ELSE 'lead.updated' END,jsonb_build_object('data',saved));
    IF action='updated' AND current_lead.status IS DISTINCT FROM saved->>'status' THEN
      INSERT INTO public.integration_events(tenant_id,branch_code,event_type,payload) VALUES(p_tenant_id,scoped_branch,'lead.stage_changed',jsonb_build_object('data',saved));
    END IF;
    IF action='updated' AND current_lead.assigned_to IS DISTINCT FROM saved->>'assigned_to' THEN
      INSERT INTO public.integration_events(tenant_id,branch_code,event_type,payload) VALUES(p_tenant_id,scoped_branch,'lead.assigned',jsonb_build_object('data',saved));
    END IF;
  END IF;
  saved:=jsonb_build_object('status',action,'data',saved);
  INSERT INTO public.integration_jobs(tenant_id,branch_code,kind,dedupe_key,payload,result,status,completed_at)
    VALUES(p_tenant_id,p_branch_code,'receipt','write:'||p_identity,jsonb_build_object('request_hash',p_request_hash),saved,'completed',now());
  PERFORM set_config('crm.integration_write','off',true);
  RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.integration_list_branch_leads(p_tenant_id uuid,p_branch_code text,p_code text DEFAULT NULL,p_page integer DEFAULT 1,p_size integer DEFAULT 25,p_search text DEFAULT '',p_status text DEFAULT NULL,p_from timestamptz DEFAULT NULL,p_until timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE rows jsonb; total bigint;
BEGIN
  IF p_page<1 OR p_page>10000 OR p_size NOT IN (10,25,50,100) OR length(p_search)>100 THEN RAISE EXCEPTION 'invalid_pagination'; END IF;
  SELECT count(*) INTO total FROM public.leads l JOIN public.integration_record_scopes s
    ON s.tenant_id=l.tenant_id AND s.record_id=l.id::text AND s.resource_type='lead'
    WHERE l.tenant_id=p_tenant_id AND s.branch_code=p_branch_code AND (p_code IS NULL OR l.lead_ref_id=p_code)
      AND (p_status IS NULL OR l.status=p_status)
      AND (p_from IS NULL OR l.created_at>=p_from) AND (p_until IS NULL OR l.created_at<p_until)
      AND (p_search='' OR l.name ILIKE '%'||p_search||'%' OR l.phone ILIKE '%'||p_search||'%' OR l.lead_ref_id ILIKE '%'||p_search||'%');
  SELECT coalesce(jsonb_agg(to_jsonb(page)),'[]'::jsonb) INTO rows FROM (
    SELECT l.* FROM public.leads l JOIN public.integration_record_scopes s
      ON s.tenant_id=l.tenant_id AND s.record_id=l.id::text AND s.resource_type='lead'
    WHERE l.tenant_id=p_tenant_id AND s.branch_code=p_branch_code AND (p_code IS NULL OR l.lead_ref_id=p_code)
      AND (p_status IS NULL OR l.status=p_status)
      AND (p_from IS NULL OR l.created_at>=p_from) AND (p_until IS NULL OR l.created_at<p_until)
      AND (p_search='' OR l.name ILIKE '%'||p_search||'%' OR l.phone ILIKE '%'||p_search||'%' OR l.lead_ref_id ILIKE '%'||p_search||'%')
    ORDER BY l.created_at DESC,l.id DESC LIMIT p_size OFFSET (p_page-1)*p_size
  ) page;
  RETURN jsonb_build_object('rows',rows,'total',total);
END $$;

CREATE OR REPLACE FUNCTION public.integration_dispatch_events(p_limit integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE event public.integration_events%ROWTYPE; amount integer:=0;
BEGIN
  FOR event IN SELECT * FROM public.integration_events WHERE dispatched_at IS NULL ORDER BY occurred_at LIMIT least(greatest(p_limit,1),50) FOR UPDATE SKIP LOCKED LOOP
    INSERT INTO public.integration_jobs(tenant_id,branch_code,connection_code,kind,dedupe_key,payload)
      SELECT event.tenant_id,event.branch_code,c.code,'delivery','event:'||event.code||':'||c.code,jsonb_build_object('event_code',event.code)
      FROM public.integration_connections c WHERE c.tenant_id=event.tenant_id AND c.type='outgoing' AND c.status='enabled'
        AND c.created_at<=event.occurred_at AND (c.branch_code IS NULL OR c.branch_code=event.branch_code) AND c.config->'events' ? event.event_type
      ON CONFLICT(tenant_id,dedupe_key) DO NOTHING;
    UPDATE public.integration_events SET dispatched_at=now() WHERE code=event.code;
    amount:=amount+1;
  END LOOP;
  RETURN amount;
END $$;

CREATE OR REPLACE FUNCTION public.integration_create_key(p_row jsonb,p_actor text,p_revoke_code text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_key public.integration_api_keys%ROWTYPE;
BEGIN
  IF p_revoke_code IS NOT NULL THEN
    SELECT * INTO old_key FROM public.integration_api_keys WHERE code=p_revoke_code AND tenant_id=(p_row->>'tenant_id')::uuid AND revoked_at IS NULL FOR UPDATE;
    IF NOT FOUND OR old_key.branch_code IS DISTINCT FROM p_row->>'branch_code' THEN RAISE EXCEPTION 'key_unavailable'; END IF;
    UPDATE public.integration_api_keys SET revoked_at=now() WHERE code=p_revoke_code;
  END IF;
  INSERT INTO public.integration_api_keys(code,tenant_id,branch_code,name,key_hash,key_prefix,scopes,expires_at,requests_per_minute)
    VALUES(p_row->>'code',(p_row->>'tenant_id')::uuid,p_row->>'branch_code',p_row->>'name',p_row->>'key_hash',p_row->>'key_prefix',p_row->'scopes',(p_row->>'expires_at')::timestamptz,(p_row->>'requests_per_minute')::integer);
  INSERT INTO public.integration_audit_logs(tenant_id,branch_code,actor_code,operation,resource_code)
    VALUES((p_row->>'tenant_id')::uuid,p_row->>'branch_code',p_actor,CASE WHEN p_revoke_code IS NULL THEN 'key_created' ELSE 'key_rotated' END,p_row->>'code');
  RETURN p_row->>'code';
END $$;

CREATE OR REPLACE FUNCTION public.integration_save_connection(p_row jsonb,p_actor text,p_expected timestamptz DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing public.integration_connections%ROWTYPE;
BEGIN
  -- Serialize overlapping Meta form mappings across all tenants; ownership was verified against Meta by the server.
  IF p_row->>'type'='meta' AND p_row->>'status'='enabled' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('integration_meta_page:'||(p_row->'config'->>'page_id'),0));
    IF EXISTS(SELECT 1 FROM public.integration_connections c WHERE c.type='meta' AND c.status='enabled' AND c.code<>p_row->>'code'
      AND c.config->>'page_id'=p_row->'config'->>'page_id'
      AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(c.config->'form_ids') f WHERE p_row->'config'->'form_ids' ? f.value)) THEN RAISE EXCEPTION 'meta_form_already_mapped'; END IF;
  END IF;
  SELECT * INTO existing FROM public.integration_connections WHERE code=p_row->>'code' FOR UPDATE;
  IF FOUND THEN
    IF existing.tenant_id<>(p_row->>'tenant_id')::uuid OR existing.branch_code IS DISTINCT FROM p_row->>'branch_code' OR existing.type<>p_row->>'type' THEN RAISE EXCEPTION 'scope_denied'; END IF;
    IF p_expected IS NULL OR existing.updated_at<>p_expected THEN RAISE EXCEPTION 'configuration_changed'; END IF;
    UPDATE public.integration_connections SET name=p_row->>'name',status=p_row->>'status',config=p_row->'config',credentials=p_row->>'credentials',updated_at=now(),next_run_at=NULL WHERE code=existing.code;
  ELSE
    IF p_expected IS NOT NULL THEN RAISE EXCEPTION 'configuration_changed'; END IF;
    INSERT INTO public.integration_connections(code,tenant_id,branch_code,name,type,status,config,credentials)
      VALUES(p_row->>'code',(p_row->>'tenant_id')::uuid,p_row->>'branch_code',p_row->>'name',p_row->>'type',p_row->>'status',p_row->'config',p_row->>'credentials');
  END IF;
  INSERT INTO public.integration_audit_logs(tenant_id,branch_code,actor_code,operation,resource_code)
    VALUES((p_row->>'tenant_id')::uuid,p_row->>'branch_code',p_actor,'connection_saved',p_row->>'code');
  RETURN p_row->>'code';
END $$;

CREATE OR REPLACE FUNCTION public.integration_map_lead(p_tenant_id uuid,p_branch_code text,p_lead_code text,p_actor text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE record public.leads%ROWTYPE; previous public.integration_record_scopes%ROWTYPE;
BEGIN
  IF (SELECT count(*) FROM public.leads WHERE tenant_id=p_tenant_id AND lead_ref_id=p_lead_code)<>1 THEN RAISE EXCEPTION 'lead_not_found'; END IF;
  SELECT * INTO record FROM public.leads WHERE tenant_id=p_tenant_id AND lead_ref_id=p_lead_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_found'; END IF;
  SELECT * INTO previous FROM public.integration_record_scopes WHERE tenant_id=p_tenant_id AND resource_type='lead' AND record_id=record.id::text;
  IF FOUND THEN
    IF previous.branch_code IS DISTINCT FROM p_branch_code THEN RAISE EXCEPTION 'already_mapped'; END IF;
    RETURN true;
  END IF;
  INSERT INTO public.integration_record_scopes(tenant_id,resource_type,record_id,branch_code) VALUES(p_tenant_id,'lead',record.id::text,p_branch_code);
  INSERT INTO public.integration_audit_logs(tenant_id,branch_code,actor_code,operation,resource_code) VALUES(p_tenant_id,p_branch_code,p_actor,'lead_branch_mapped',p_lead_code);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.integration_revoke_key(p_tenant_id uuid,p_branch_code text,p_code text,p_actor text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE changed public.integration_api_keys%ROWTYPE;
BEGIN
  UPDATE public.integration_api_keys SET revoked_at=now()
    WHERE tenant_id=p_tenant_id AND code=p_code AND revoked_at IS NULL AND (p_branch_code IS NULL OR branch_code=p_branch_code) RETURNING * INTO changed;
  IF NOT FOUND THEN RAISE EXCEPTION 'key_unavailable'; END IF;
  INSERT INTO public.integration_audit_logs(tenant_id,branch_code,actor_code,operation,resource_code)
    VALUES(p_tenant_id,changed.branch_code,p_actor,'key_revoked',changed.code);
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.integration_retry_job(p_tenant_id uuid,p_branch_code text,p_code text,p_actor text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE changed public.integration_jobs%ROWTYPE;
BEGIN
  UPDATE public.integration_jobs SET status='pending',attempts=0,error_code=NULL,available_at=now(),completed_at=NULL,lease_token=NULL,lease_until=NULL
    WHERE tenant_id=p_tenant_id AND code=p_code AND status='failed' AND kind<>'receipt' AND (p_branch_code IS NULL OR branch_code=p_branch_code) RETURNING * INTO changed;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_unavailable'; END IF;
  INSERT INTO public.integration_audit_logs(tenant_id,branch_code,actor_code,operation,resource_code)
    VALUES(p_tenant_id,changed.branch_code,p_actor,'job_retry',changed.code);
  RETURN true;
END $$;

-- SECURITY DEFINER functions are never callable by public/anonymous/authenticated users.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('integration_take_rate_limit','integration_consume_oauth_state','integration_claim_jobs','integration_finish_job','integration_write_lead','integration_list_branch_leads','integration_dispatch_events','integration_create_key','integration_save_connection','integration_map_lead','integration_phone_key','integration_revoke_key','integration_retry_job') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
