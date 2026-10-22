-- Isolated, workspace-scoped permission templates for User Management.
-- Apply in the Supabase SQL Editor before using Add Role.
BEGIN;
SET LOCAL timezone = 'Asia/Kolkata';

CREATE TABLE IF NOT EXISTS public.crm_role_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_key text NOT NULL CHECK (length(workspace_key) BETWEEN 3 AND 180),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 240),
  permissions jsonb NOT NULL CHECK (jsonb_typeof(permissions) = 'object'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_role_templates_workspace_name
  ON public.crm_role_templates (workspace_key, lower(name));

ALTER TABLE public.crm_role_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_role_templates FROM anon, authenticated;
GRANT ALL ON public.crm_role_templates TO service_role;

COMMIT;
