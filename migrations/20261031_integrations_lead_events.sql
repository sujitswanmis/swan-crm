-- Optional capture of employee-originated changes. Created DISABLED; measure in staging before enabling.
-- No existing trigger is replaced. No external HTTP occurs inside an employee transaction.
SET lock_timeout='2s';
CREATE OR REPLACE FUNCTION public.integration_capture_lead_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tenant uuid; branch text; data jsonb;
BEGIN
  IF current_setting('crm.integration_write',true)='on' OR NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  tenant:=NEW.tenant_id;
  IF NOT EXISTS(SELECT 1 FROM public.integration_connections WHERE tenant_id=tenant AND type='outgoing' AND status='enabled') THEN RETURN NEW; END IF;
  SELECT branch_code INTO branch FROM public.integration_record_scopes WHERE tenant_id=tenant AND resource_type='lead' AND record_id=NEW.id::text;
  data:=(SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(to_jsonb(NEW))
    WHERE key IN ('lead_ref_id','name','phone','email','company','city_name','district_name','state_name','address','pin_code','requirement','source','source_name','priority','status','assigned_to','created_at','updated_at'));
  INSERT INTO public.integration_events(tenant_id,branch_code,event_type,payload)
    VALUES(tenant,branch,CASE WHEN TG_OP='INSERT' THEN 'lead.created' ELSE 'lead.updated' END,jsonb_build_object('data',data));
  IF TG_OP='UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.integration_events(tenant_id,branch_code,event_type,payload) VALUES(tenant,branch,'lead.stage_changed',jsonb_build_object('data',data));
    END IF;
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      INSERT INTO public.integration_events(tenant_id,branch_code,event_type,payload) VALUES(tenant,branch,'lead.assigned',jsonb_build_object('data',data));
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- This auxiliary feature must not make an employee lead save fail. Never log payloads.
  RAISE LOG 'Integration event capture unavailable (SQLSTATE %)',SQLSTATE;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.integration_capture_lead_change() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.leads'::regclass AND tgname='crm_integrations_lead_events') THEN
    CREATE TRIGGER crm_integrations_lead_events AFTER INSERT OR UPDATE ON public.leads
      FOR EACH ROW EXECUTE FUNCTION public.integration_capture_lead_change();
    ALTER TABLE public.leads DISABLE TRIGGER crm_integrations_lead_events;
  END IF;
END $$;
RESET lock_timeout;
-- Activation, after load verification: ALTER TABLE public.leads ENABLE TRIGGER crm_integrations_lead_events;
-- Pause without removing anything: ALTER TABLE public.leads DISABLE TRIGGER crm_integrations_lead_events;
