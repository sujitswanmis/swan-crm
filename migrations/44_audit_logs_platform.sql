-- ====================================================================
-- PHASE 44 MIGRATION: AUDIT LOGS PLATFORM TRACKING
-- Multi-Platform CRM (Web App, Windows Desktop App, Android App)
-- Safety: Non-destructive, additive-only, idempotent (IF NOT EXISTS)
-- ====================================================================

-- 1. Add platform and platform_details columns to public.audit_logs
ALTER TABLE IF EXISTS public.audit_logs
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS platform_details TEXT;

-- 2. Add index for fast filtering by platform in User Management -> Audit Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_platform
  ON public.audit_logs (platform);

-- 3. Documentation comments
COMMENT ON COLUMN public.audit_logs.platform IS 'Client application platform: Web App, Windows App, Android App, iOS App, or System';
COMMENT ON COLUMN public.audit_logs.platform_details IS 'Browser/OS/App client metadata (e.g., Chrome 156 • Windows, Electron • Windows Desktop, Capacitor • Android APK)';
