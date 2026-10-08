-- Workflow-only, additive migration. Run this file in Supabase SQL Editor.
BEGIN;
ALTER TABLE public.workflow_definitions ADD COLUMN IF NOT EXISTS planning_mode text NOT NULL DEFAULT 'ACTUAL_PLUS_TAT';
ALTER TABLE public.workflow_definitions ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.workflow_definitions ADD COLUMN IF NOT EXISTS is_purged boolean NOT NULL DEFAULT false;
ALTER TABLE public.workflow_stages ADD COLUMN IF NOT EXISTS configuration_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.workflow_stages ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.stage_field_mappings ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- Template writes are atomic, tenant-scoped, and reject concurrent stale saves.
CREATE OR REPLACE FUNCTION public.crm_save_workflow(p_tenant_id uuid, p_workflow jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path = public SET timezone = 'Asia/Kolkata' AS $$
DECLARE
  wf_id uuid; ver_id uuid; stg_id uuid; fld_id uuid;
  existing public.workflow_definitions%ROWTYPE;
  stage jsonb; fld jsonb; stage_no integer := 0; field_no integer;
  mode text := COALESCE(p_workflow->>'planning_mode', 'ACTUAL_PLUS_TAT');
BEGIN
  IF mode NOT IN ('ACTUAL_PLUS_TAT', 'PLANNED_PLUS_TAT') THEN RAISE EXCEPTION 'Invalid planning rule'; END IF;
  IF NULLIF(trim(p_workflow->>'workflow_name'), '') IS NULL OR NULLIF(trim(p_workflow->>'workflow_code'), '') IS NULL THEN
    RAISE EXCEPTION 'Workflow name and code are required';
  END IF;
  IF COALESCE(p_workflow->>'id', '') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
    wf_id := (p_workflow->>'id')::uuid;
    SELECT * INTO existing FROM workflow_definitions WHERE id = wf_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND OR existing.is_purged THEN RAISE EXCEPTION 'Workflow not found'; END IF;
    IF NULLIF(p_workflow->>'expected_updated_at','') IS NOT NULL
       AND existing.updated_at IS DISTINCT FROM (p_workflow->>'expected_updated_at')::timestamptz THEN
      RAISE EXCEPTION 'Workflow changed in another session. Refresh and retry.';
    END IF;
    UPDATE workflow_definitions SET workflow_name = p_workflow->>'workflow_name',
      description = COALESCE(p_workflow->>'description',''), planning_mode = mode, updated_at = clock_timestamp()
      WHERE id = wf_id;
  ELSE
    INSERT INTO workflow_definitions(tenant_id, workflow_code, workflow_name, category, description, planning_mode)
      VALUES(p_tenant_id, p_workflow->>'workflow_code', p_workflow->>'workflow_name',
        COALESCE(p_workflow->>'category','PRODUCTION'), COALESCE(p_workflow->>'description',''), mode)
      RETURNING id INTO wf_id;
  END IF;
  SELECT id INTO ver_id FROM workflow_versions WHERE workflow_id = wf_id ORDER BY version_number DESC LIMIT 1 FOR UPDATE;
  IF ver_id IS NULL THEN
    INSERT INTO workflow_versions(workflow_id, version_number, is_published, published_at)
      VALUES(wf_id, 1, true, clock_timestamp()) RETURNING id INTO ver_id;
  END IF;
  -- Leave stages untouched for a metadata-only save.
  IF p_workflow ? 'stages' THEN
    IF jsonb_typeof(p_workflow->'stages') <> 'array' OR jsonb_array_length(p_workflow->'stages') > 100 THEN
      RAISE EXCEPTION 'Invalid stage list (maximum 100 stages)';
    END IF;
    -- Negative temporary positions avoid the existing unique order constraint.
    WITH positions AS (SELECT id, row_number() OVER (ORDER BY stage_order, id) AS n,
      min(stage_order) OVER () AS min_order FROM workflow_stages WHERE workflow_version_id = ver_id)
    UPDATE workflow_stages s SET stage_order = (positions.min_order - positions.n)::integer
      FROM positions WHERE s.id = positions.id;
    UPDATE workflow_stages SET is_archived = true WHERE workflow_version_id = ver_id;
    FOR stage IN SELECT value FROM jsonb_array_elements(p_workflow->'stages') LOOP
      stage_no := stage_no + 1;
      IF NULLIF(trim(stage->>'stage_name'),'') IS NULL THEN RAISE EXCEPTION 'Stage name is required'; END IF;
      IF COALESCE((stage->>'planned_tat_hours')::numeric, 0) <= 0 OR (stage->>'planned_tat_hours')::numeric > 9999.99 THEN
        RAISE EXCEPTION 'Invalid stage TAT';
      END IF;
      stg_id := NULL;
      IF COALESCE(stage->>'id','') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
        SELECT id INTO stg_id FROM workflow_stages WHERE id = (stage->>'id')::uuid AND workflow_version_id = ver_id;
        IF stg_id IS NULL THEN RAISE EXCEPTION 'Stage does not belong to this workflow'; END IF;
      END IF;
      IF stg_id IS NULL THEN
        INSERT INTO workflow_stages(workflow_version_id, stage_order, stage_name, stage_code, execution_type, planned_tat_hours, approval_required, configuration_json)
          VALUES(ver_id, stage_no, stage->>'stage_name', COALESCE(stage->>'stage_code','S'||lpad((stage_no-1)::text,2,'0')),
            COALESCE(stage->>'execution_type','SEQUENTIAL'), (stage->>'planned_tat_hours')::numeric,
            COALESCE((stage->>'approval_required')::boolean,false), stage - 'fields' - 'id') RETURNING id INTO stg_id;
      ELSE
        UPDATE workflow_stages SET stage_order = stage_no, stage_name = stage->>'stage_name',
          stage_code = COALESCE(stage->>'stage_code',stage_code), execution_type = COALESCE(stage->>'execution_type','SEQUENTIAL'),
          planned_tat_hours = (stage->>'planned_tat_hours')::numeric, approval_required = COALESCE((stage->>'approval_required')::boolean,false),
          configuration_json = stage - 'fields' - 'id', is_archived = false WHERE id = stg_id;
      END IF;
      IF stage ? 'fields' THEN
        IF jsonb_typeof(stage->'fields') <> 'array' OR jsonb_array_length(stage->'fields') > 100 THEN RAISE EXCEPTION 'Invalid field list'; END IF;
        UPDATE stage_field_mappings SET is_archived = true WHERE stage_id = stg_id;
        field_no := 0;
        FOR fld IN SELECT value FROM jsonb_array_elements(stage->'fields') LOOP
          field_no := field_no + 1; fld_id := NULL;
          IF COALESCE(fld->>'id','') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
            SELECT id INTO fld_id FROM stage_field_mappings WHERE id = (fld->>'id')::uuid AND stage_id = stg_id;
            IF fld_id IS NULL THEN RAISE EXCEPTION 'Field does not belong to this stage'; END IF;
          END IF;
          IF fld_id IS NULL THEN
            INSERT INTO stage_field_mappings(stage_id, field_key, display_label, data_type, snapshot_mode, is_mandatory, display_order)
              VALUES(stg_id, fld->>'field_key', COALESCE(fld->>'field_name',fld->>'display_label'),
                CASE WHEN fld->>'data_type' = 'TEXT' THEN 'STRING' ELSE COALESCE(fld->>'data_type','STRING') END,
                CASE WHEN fld->>'snapshot_mode' = 'STAGE_SNAPSHOT' THEN 'SNAPSHOT_AT_STAGE_START' ELSE COALESCE(fld->>'snapshot_mode','LIVE_REFERENCE') END,
                COALESCE((fld->>'is_required')::boolean,false),field_no);
          ELSE
            UPDATE stage_field_mappings SET field_key = fld->>'field_key', display_label = COALESCE(fld->>'field_name',fld->>'display_label'),
              data_type = CASE WHEN fld->>'data_type' = 'TEXT' THEN 'STRING' ELSE COALESCE(fld->>'data_type','STRING') END,
              snapshot_mode = CASE WHEN fld->>'snapshot_mode' = 'STAGE_SNAPSHOT' THEN 'SNAPSHOT_AT_STAGE_START' ELSE COALESCE(fld->>'snapshot_mode','LIVE_REFERENCE') END,
              is_mandatory = COALESCE((fld->>'is_required')::boolean,false), display_order = field_no, is_archived = false WHERE id = fld_id;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;
  RETURN wf_id;
END; $$;

-- Starts one independent run with an immutable snapshot of stages and rules.
CREATE OR REPLACE FUNCTION public.crm_start_workflow(p_tenant_id uuid, p_version_id uuid, p_context jsonb, p_party_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SET search_path = public SET timezone = 'Asia/Kolkata' AS $$
DECLARE
  wf public.workflow_definitions%ROWTYPE; snapshot jsonb; stg jsonb;
  instance_id uuid; start_at timestamptz := clock_timestamp(); due_at timestamptz;
  request_key text := p_context->>'request_key';
BEGIN
  SELECT w.* INTO wf FROM workflow_definitions w JOIN workflow_versions v ON v.workflow_id = w.id
    WHERE v.id = p_version_id AND w.tenant_id = p_tenant_id FOR UPDATE OF w;
  IF NOT FOUND OR wf.is_deleted OR wf.is_purged OR wf.status <> 'ACTIVE' THEN RAISE EXCEPTION 'Active workflow not found'; END IF;
  IF wf.planning_mode NOT IN ('ACTUAL_PLUS_TAT','PLANNED_PLUS_TAT') THEN RAISE EXCEPTION 'Invalid planning rule'; END IF;
  IF request_key IS NOT NULL THEN
    SELECT id INTO instance_id FROM workflow_instances WHERE tenant_id = p_tenant_id
      AND workflow_version_id = p_version_id AND s00_context_json->>'request_key' = request_key LIMIT 1;
    IF instance_id IS NOT NULL THEN RETURN instance_id; END IF;
  END IF;
  SELECT jsonb_agg((s.configuration_json || to_jsonb(s) - 'configuration_json' - 'is_archived') || jsonb_build_object('planned_tat_hours', CASE WHEN s.configuration_json ? 'tat_value' THEN
      (s.configuration_json->>'tat_value')::numeric * CASE s.configuration_json->>'tat_unit' WHEN 'MINUTES' THEN 1.0/60 WHEN 'DAYS' THEN 24 ELSE 1 END
      ELSE s.planned_tat_hours END, 'fields',
      COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.display_order) FROM stage_field_mappings f WHERE f.stage_id = s.id AND NOT f.is_archived),'[]'::jsonb)) ORDER BY s.stage_order)
    INTO snapshot FROM workflow_stages s WHERE s.workflow_version_id = p_version_id AND NOT s.is_archived;
  IF snapshot IS NULL THEN RAISE EXCEPTION 'Configure at least one stage before launching'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot) s WHERE s->>'execution_type' <> 'SEQUENTIAL') THEN
    RAISE EXCEPTION 'Live execution currently supports sequential stages. Parallel/conditional execution needs a routing definition.';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot) s WHERE COALESCE((s->>'planned_tat_hours')::numeric,0) <= 0) THEN RAISE EXCEPTION 'Every stage needs a positive TAT'; END IF;
  stg := snapshot->0;
  INSERT INTO workflow_instances(tenant_id,instance_code,workflow_version_id,s00_context_json,party_id,current_stage_id,instance_status,started_at)
    VALUES(p_tenant_id,'INST-'||gen_random_uuid()::text,p_version_id,
      p_context || jsonb_build_object('planning_mode',wf.planning_mode,'workflow_snapshot',snapshot,'workflow_name',wf.workflow_name,'category',wf.category),
      p_party_id,(stg->>'id')::uuid,'RUNNING',start_at) RETURNING id INTO instance_id;
  due_at := start_at + ((stg->>'planned_tat_hours')::double precision * interval '1 hour');
  INSERT INTO stage_instances(workflow_instance_id,stage_id,planned_start,planned_end,actual_start,status)
    VALUES(instance_id,(stg->>'id')::uuid,start_at,due_at,start_at,'IN_PROGRESS');
  -- Planned mode fixes the entire schedule from launch. Actual mode creates each
  -- next deadline at actual handover; pending stages remain without a deadline.
  FOR stg IN SELECT value FROM jsonb_array_elements(snapshot) WITH ORDINALITY s(value,n) WHERE n > 1 LOOP
    INSERT INTO stage_instances(workflow_instance_id,stage_id,planned_start,planned_end,status)
      VALUES(instance_id,(stg->>'id')::uuid,
        CASE WHEN wf.planning_mode = 'PLANNED_PLUS_TAT' THEN due_at ELSE NULL END,
        CASE WHEN wf.planning_mode = 'PLANNED_PLUS_TAT' THEN due_at + ((stg->>'planned_tat_hours')::double precision * interval '1 hour') ELSE NULL END,'PENDING');
    due_at := due_at + ((stg->>'planned_tat_hours')::double precision * interval '1 hour');
  END LOOP;
  RETURN instance_id;
END; $$;

CREATE OR REPLACE FUNCTION public.crm_advance_workflow(p_tenant_id uuid, p_instance_id uuid, p_expected_stage_instance_id uuid, p_values jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path = public SET timezone = 'Asia/Kolkata' AS $$
DECLARE
  inst public.workflow_instances%ROWTYPE; current_run public.stage_instances%ROWTYPE;
  next_run public.stage_instances%ROWTYPE; snapshot jsonb; stg jsonb; next_stg jsonb;
  idx integer; finish_at timestamptz := clock_timestamp(); base_at timestamptz;
BEGIN
  SELECT * INTO inst FROM workflow_instances WHERE id = p_instance_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workflow instance not found'; END IF;
  SELECT * INTO current_run FROM stage_instances WHERE id = p_expected_stage_instance_id AND workflow_instance_id = inst.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stage instance not found'; END IF;
  -- An already completed request is idempotent; never complete the next stage.
  IF current_run.status = 'COMPLETED' THEN RETURN inst.id; END IF;
  IF inst.instance_status <> 'RUNNING' OR current_run.status <> 'IN_PROGRESS' OR current_run.stage_id <> inst.current_stage_id THEN
    RAISE EXCEPTION 'Stage changed in another session. Refresh and retry.';
  END IF;
  IF finish_at < current_run.actual_start THEN RAISE EXCEPTION 'Completion cannot precede stage start'; END IF;
  snapshot := inst.s00_context_json->'workflow_snapshot';
  SELECT (n-1)::integer,value INTO idx,stg FROM jsonb_array_elements(snapshot) WITH ORDINALITY s(value,n) WHERE value->>'id' = current_run.stage_id::text;
  IF stg IS NULL THEN RAISE EXCEPTION 'Workflow snapshot missing'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(stg->'fields') f WHERE COALESCE((f->>'is_mandatory')::boolean,false)
    AND (NOT p_values ? (f->>'field_key') OR p_values->(f->>'field_key') = 'null'::jsonb OR trim(p_values->>(f->>'field_key')) = '')) THEN
    RAISE EXCEPTION 'Complete all required stage fields';
  END IF;
  UPDATE stage_instances SET actual_end = finish_at, status = 'COMPLETED', stage_data_json = p_values WHERE id = current_run.id;
  next_stg := snapshot->(idx+1);
  IF next_stg IS NULL THEN
    UPDATE workflow_instances SET instance_status = 'COMPLETED', completed_at = finish_at WHERE id = inst.id;
  ELSE
    SELECT * INTO next_run FROM stage_instances WHERE workflow_instance_id = inst.id AND stage_id = (next_stg->>'id')::uuid AND status = 'PENDING' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Next stage instance missing'; END IF;
    base_at := CASE WHEN inst.s00_context_json->>'planning_mode' = 'PLANNED_PLUS_TAT' THEN current_run.planned_end ELSE finish_at END;
    UPDATE stage_instances SET actual_start = finish_at, planned_start = base_at,
      planned_end = base_at + ((next_stg->>'planned_tat_hours')::double precision * interval '1 hour'), status = 'IN_PROGRESS' WHERE id = next_run.id;
    UPDATE workflow_instances SET current_stage_id = next_run.stage_id WHERE id = inst.id;
  END IF;
  RETURN inst.id;
END; $$;

-- Only the authenticated/authorized server action may call these RPCs using
-- the server-side service credential. Do not grant direct browser execution.
REVOKE ALL ON FUNCTION public.crm_save_workflow(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_start_workflow(uuid,uuid,jsonb,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_advance_workflow(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_save_workflow(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_start_workflow(uuid,uuid,jsonb,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_advance_workflow(uuid,uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
