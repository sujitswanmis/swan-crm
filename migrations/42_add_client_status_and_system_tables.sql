-- Migration 42: Add client_status, missed call tracking columns, and system tables
-- Executed on Supabase on 2026-10-31

-- 1. Add client_status to leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS client_status TEXT DEFAULT 'None';

-- 2. Add missed call columns to call_sessions table
ALTER TABLE public.call_sessions 
ADD COLUMN IF NOT EXISTS call_direction TEXT DEFAULT 'inbound',
ADD COLUMN IF NOT EXISTS provider_call_id TEXT,
ADD COLUMN IF NOT EXISTS remarks TEXT;

-- 3. Create system_settings table (Email config & system settings)
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create crm_configurations table
CREATE TABLE IF NOT EXISTS public.crm_configurations (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create tenant_message_templates table
CREATE TABLE IF NOT EXISTS public.tenant_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT,
  tenant_id UUID,
  templates JSONB,
  sender_phone TEXT,
  sender_email TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Enable RLS and grant service_role / authenticated access
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access to system_settings" ON public.system_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated read to system_settings" ON public.system_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service_role full access to crm_configurations" ON public.crm_configurations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated read to crm_configurations" ON public.crm_configurations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service_role full access to tenant_message_templates" ON public.tenant_message_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated read to tenant_message_templates" ON public.tenant_message_templates FOR SELECT TO authenticated USING (true);
