-- Requires Supabase Cron, pg_net and Vault already enabled by the database owner.
-- This migration never installs an active schedule or changes any existing schedule.
CREATE OR REPLACE FUNCTION public.integration_install_scheduler(p_worker_url text,p_worker_secret text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE secret_id uuid; job_id bigint; command text;
BEGIN
  IF p_worker_url !~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]+/api/integrations/worker$' OR length(p_worker_secret)<32 THEN RAISE EXCEPTION 'Invalid integration worker configuration'; END IF;
  IF to_regnamespace('cron') IS NULL OR to_regnamespace('net') IS NULL OR to_regclass('vault.decrypted_secrets') IS NULL THEN RAISE EXCEPTION 'Enable Supabase Cron, pg_net and Vault first'; END IF;
  EXECUTE 'SELECT vault.create_secret($1,$2,$3)' INTO secret_id USING p_worker_secret,'crm_integrations_worker_'||replace(gen_random_uuid()::text,'-',''),'Dedicated integration worker secret';
  command:=format('SELECT net.http_post(url := %L, headers := jsonb_build_object(''Content-Type'',''application/json'',''Authorization'',''Bearer ''||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id=%L::uuid)), body := ''{}''::jsonb, timeout_milliseconds := 55000);',p_worker_url,secret_id::text);
  EXECUTE 'SELECT cron.schedule($1,$2,$3)' INTO job_id USING 'crm-integrations-worker','* * * * *',command;
  EXECUTE 'UPDATE cron.job SET active=false WHERE jobid=$1' USING job_id;
  RETURN job_id;
END $$;
CREATE OR REPLACE FUNCTION public.integration_scheduler_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF to_regnamespace('cron') IS NULL THEN RETURN jsonb_build_object('installed',false,'active',false); END IF;
  EXECUTE 'SELECT jsonb_build_object(''installed'',true,''active'',coalesce(bool_or(active),false)) FROM cron.job WHERE jobname=''crm-integrations-worker''' INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.integration_install_scheduler(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.integration_scheduler_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.integration_install_scheduler(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.integration_scheduler_status() TO service_role;
