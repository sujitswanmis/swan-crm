-- =========================================================================
-- MIGRATION 40: ORDER PIPELINE ALL ORDERS & 13 STAGES (S01-S13) PERMISSIONS
-- Automatically initializes granular stage permissions for Admins and Roles
-- in Supabase user_roles and crm_role_templates.
-- =========================================================================

BEGIN;

-- 1. Ensure channel_ops exists in user_roles.module_access for Admins
UPDATE public.user_roles
SET module_access = jsonb_set(
  COALESCE(module_access, '{}'::jsonb),
  '{channel_ops}',
  COALESCE(module_access->'channel_ops', '{"view": true, "add": true, "edit": true, "delete": true}'::jsonb),
  true
)
WHERE lower(coalesce(role, '')) IN ('admin', 'master_admin', 'superadmin', 'masteradmin', 'crm')
   OR email IN ('admin@newswangroup.com', 'supujacreations@gmail.com');

-- 2. Populate All Orders & 13 Stages (S01 to S13) into channel_ops.sub_items
UPDATE public.user_roles
SET module_access = jsonb_set(
  module_access,
  '{channel_ops,sub_items}',
  COALESCE(module_access->'channel_ops'->'sub_items', '{}'::jsonb) || '{
    "frequency_rules": {"view": true, "add": true, "edit": true, "delete": true},
    "order_followup": {"view": true, "add": true, "edit": true, "delete": true},
    "order_pipeline": {"view": true, "add": true, "edit": true, "delete": true},
    "all_orders": {"view": true, "add": true, "edit": true, "delete": true},
    "s01": {"view": true, "add": true, "edit": true, "delete": true},
    "s02": {"view": true, "add": true, "edit": true, "delete": true},
    "s03": {"view": true, "add": true, "edit": true, "delete": true},
    "s04": {"view": true, "add": true, "edit": true, "delete": true},
    "s05": {"view": true, "add": true, "edit": true, "delete": true},
    "s06": {"view": true, "add": true, "edit": true, "delete": true},
    "s07": {"view": true, "add": true, "edit": true, "delete": true},
    "s08": {"view": true, "add": true, "edit": true, "delete": true},
    "s09": {"view": true, "add": true, "edit": true, "delete": true},
    "s10": {"view": true, "add": true, "edit": true, "delete": true},
    "s11": {"view": true, "add": true, "edit": true, "delete": true},
    "s12": {"view": true, "add": true, "edit": true, "delete": true},
    "s13": {"view": true, "add": true, "edit": true, "delete": true},
    "order_feedback": {"view": true, "add": true, "edit": true, "delete": true},
    "monthly_feedback": {"view": true, "add": true, "edit": true, "delete": true},
    "complaints": {"view": true, "add": true, "edit": true, "delete": true}
  }'::jsonb,
  true
)
WHERE lower(coalesce(role, '')) IN ('admin', 'master_admin', 'superadmin', 'masteradmin', 'crm')
   OR email IN ('admin@newswangroup.com', 'supujacreations@gmail.com');

-- 3. If crm_role_templates table exists, also backfill into Admin templates
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'crm_role_templates'
  ) THEN
    UPDATE public.crm_role_templates
    SET permissions = jsonb_set(
      permissions,
      '{channel_ops,sub_items}',
      COALESCE(permissions->'channel_ops'->'sub_items', '{}'::jsonb) || '{
        "all_orders": {"view": true, "add": true, "edit": true, "delete": true},
        "s01": {"view": true, "add": true, "edit": true, "delete": true},
        "s02": {"view": true, "add": true, "edit": true, "delete": true},
        "s03": {"view": true, "add": true, "edit": true, "delete": true},
        "s04": {"view": true, "add": true, "edit": true, "delete": true},
        "s05": {"view": true, "add": true, "edit": true, "delete": true},
        "s06": {"view": true, "add": true, "edit": true, "delete": true},
        "s07": {"view": true, "add": true, "edit": true, "delete": true},
        "s08": {"view": true, "add": true, "edit": true, "delete": true},
        "s09": {"view": true, "add": true, "edit": true, "delete": true},
        "s10": {"view": true, "add": true, "edit": true, "delete": true},
        "s11": {"view": true, "add": true, "edit": true, "delete": true},
        "s12": {"view": true, "add": true, "edit": true, "delete": true},
        "s13": {"view": true, "add": true, "edit": true, "delete": true}
      }'::jsonb,
      true
    )
    WHERE lower(name) IN ('admin', 'master admin', 'crm');
  END IF;
END $$;

COMMIT;

-- Verification Query to check current permissions:
-- SELECT email, role, module_access->'channel_ops'->'sub_items' AS pipeline_stages FROM public.user_roles WHERE lower(role) LIKE '%admin%' LIMIT 5;
