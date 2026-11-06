-- ====================================================================
-- PHASE 43 MIGRATION: TENANT & BRANCH ATTENDANCE GEOFENCING & GPS RULES
-- Multi-Tenant SaaS WMS / CRM Infrastructure
-- Safety: Non-destructive, idempotent (IF NOT EXISTS)
-- ====================================================================

-- 1. Add geofencing columns to attendance_shift_policies
ALTER TABLE IF EXISTS attendance_shift_policies 
  ADD COLUMN IF NOT EXISTS enable_geofence boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_gps text DEFAULT 'OFF',
  ADD COLUMN IF NOT EXISTS geofence_mode text DEFAULT 'STRICT_BLOCK',
  ADD COLUMN IF NOT EXISTS geofence_locations jsonb DEFAULT '[]'::jsonb;

-- 2. Add composite index for tenant_id and branch_name lookup
CREATE INDEX IF NOT EXISTS idx_attendance_shift_policies_tenant_branch 
  ON attendance_shift_policies (tenant_id, branch_name);

-- 3. Comments for documentation
COMMENT ON COLUMN attendance_shift_policies.enable_geofence IS 'Master toggle to verify punches against configured office GPS perimeter';
COMMENT ON COLUMN attendance_shift_policies.require_gps IS 'GPS device requirement mode: OFF, AUTO (recommended), or ON (strict mandatory)';
COMMENT ON COLUMN attendance_shift_policies.geofence_mode IS 'Outside perimeter violation behavior: STRICT_BLOCK or FLAG_OUTSIDE';
COMMENT ON COLUMN attendance_shift_policies.geofence_locations IS 'List of configured office campus GPS coordinates, radii, and status';
