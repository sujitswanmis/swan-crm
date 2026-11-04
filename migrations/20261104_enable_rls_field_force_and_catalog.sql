-- ============================================================================
-- SUPUJA WORKSPACE ENTERPRISE - RLS SECURITY POLICIES FOR FIELD FORCE & CATALOG
-- Migration: 20261104_enable_rls_field_force_and_catalog.sql
-- Timezone: Indian Standard Time (IST / Asia/Kolkata / UTC+5:30)
-- Description: Enables Row Level Security (RLS) on public schema tables exposed
--              to PostgREST and grants service_role full access + authenticated read.
-- ============================================================================

BEGIN;

-- 1. Enable Row Level Security (RLS) on tables
ALTER TABLE IF EXISTS public.tenant_custom_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employee_live_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.field_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.field_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_travel_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenant_products ENABLE ROW LEVEL SECURITY;

-- 2. Grant FULL Access to service_role (Used by Next.js Server Actions)
DROP POLICY IF EXISTS "Allow service_role full access to tenant_custom_forms" ON public.tenant_custom_forms;
CREATE POLICY "Allow service_role full access to tenant_custom_forms" 
  ON public.tenant_custom_forms FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access to employee_live_locations" ON public.employee_live_locations;
CREATE POLICY "Allow service_role full access to employee_live_locations" 
  ON public.employee_live_locations FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access to field_tasks" ON public.field_tasks;
CREATE POLICY "Allow service_role full access to field_tasks" 
  ON public.field_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access to field_form_submissions" ON public.field_form_submissions;
CREATE POLICY "Allow service_role full access to field_form_submissions" 
  ON public.field_form_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access to daily_travel_summaries" ON public.daily_travel_summaries;
CREATE POLICY "Allow service_role full access to daily_travel_summaries" 
  ON public.daily_travel_summaries FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access to tenant_products" ON public.tenant_products;
CREATE POLICY "Allow service_role full access to tenant_products" 
  ON public.tenant_products FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Allow authenticated CRM users to read catalog/forms/tasks
DROP POLICY IF EXISTS "Allow authenticated read to tenant_custom_forms" ON public.tenant_custom_forms;
CREATE POLICY "Allow authenticated read to tenant_custom_forms" 
  ON public.tenant_custom_forms FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated read to field_tasks" ON public.field_tasks;
CREATE POLICY "Allow authenticated read to field_tasks" 
  ON public.field_tasks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated read to tenant_products" ON public.tenant_products;
CREATE POLICY "Allow authenticated read to tenant_products" 
  ON public.tenant_products FOR SELECT TO authenticated USING (true);

COMMIT;

-- 4. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
