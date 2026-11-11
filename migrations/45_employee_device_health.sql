-- ============================================================================
-- MIGRATION 45: EMPLOYEE DEVICE, PERMISSION & APP VERSION HEALTH AUDIT
-- Additive-only, idempotent (IF NOT EXISTS), strict IST (Asia/Kolkata)
-- Supports 5-6 year dynamic APK version governance & background GPS audit
-- ============================================================================

BEGIN;
SET LOCAL timezone = 'Asia/Kolkata';

-- 1. Live Device & Permission Health Snapshot per Employee / Company
CREATE TABLE IF NOT EXISTS public.employee_device_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    tenant_id UUID,
    tenant_code VARCHAR(32),
    branch_code VARCHAR(64),
    company VARCHAR(100) NOT NULL DEFAULT 'TNT00001',
    platform VARCHAR(64) NOT NULL DEFAULT 'Web App',
    platform_details TEXT,
    app_version_code INTEGER,
    app_version_name VARCHAR(64),
    os_version VARCHAR(64),
    sdk_int INTEGER,
    device_manufacturer VARCHAR(100),
    device_model VARCHAR(120),
    location_mode VARCHAR(32) NOT NULL DEFAULT 'unknown', -- 'all_the_time' | 'while_using' | 'denied' | 'browser' | 'unknown'
    has_foreground_location BOOLEAN,
    has_background_location BOOLEAN,
    battery_unrestricted BOOLEAN,
    notifications_enabled BOOLEAN,
    gps_provider_enabled BOOLEAN,
    service_running BOOLEAN DEFAULT FALSE,
    pending_queue_count INTEGER DEFAULT 0,
    health_status VARCHAR(40) NOT NULL DEFAULT 'UNKNOWN', -- 'HEALTHY' | 'NEEDS_PERMISSION_FIX' | 'OUTDATED_APK' | 'FORCE_UPGRADE' | 'BROWSER_ONLY' | 'OFFLINE'
    issue_summary TEXT,
    last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_employee_device_health_user_company UNIQUE (user_id, company)
);

CREATE INDEX IF NOT EXISTS idx_emp_device_health_company_status
    ON public.employee_device_health (company, health_status, last_checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_emp_device_health_tenant_branch
    ON public.employee_device_health (tenant_code, branch_code, last_checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_emp_device_health_user
    ON public.employee_device_health (user_id, last_checked_at DESC);

-- 2. Dynamic App Release & Governance Policy (Editable from CRM without redeploy)
CREATE TABLE IF NOT EXISTS public.app_release_policies (
    platform VARCHAR(32) PRIMARY KEY DEFAULT 'android',
    latest_version_code INTEGER NOT NULL DEFAULT 4,
    latest_version_name VARCHAR(64) NOT NULL DEFAULT '2.5.1114',
    min_supported_version_code INTEGER NOT NULL DEFAULT 4,
    download_url TEXT NOT NULL DEFAULT '/api/public/android-apk',
    release_notes TEXT,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_release_policies (
    platform,
    latest_version_code,
    latest_version_name,
    min_supported_version_code,
    download_url,
    release_notes
)
VALUES (
    'android',
    4,
    '2.5.1114',
    4,
    '/api/public/android-apk',
    'Includes Android background GPS & battery optimization diagnostics, 1-tap phone self-heal controls, and improved foreground service reliability.'
)
ON CONFLICT (platform) DO NOTHING;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
