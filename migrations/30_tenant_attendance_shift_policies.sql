-- ====================================================================
-- PHASE 30 MIGRATION: TENANT-WISE ATTENDANCE SHIFT RULES & POLICIES
-- Multi-Tenant SaaS WMS Infrastructure
-- Safety: Non-destructive, idempotent (IF NOT EXISTS)
-- ====================================================================

-- 1. Create table for tenant attendance shift policies
CREATE TABLE IF NOT EXISTS attendance_shift_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_name text NOT NULL,
  policy_version text DEFAULT 'v1.0',
  shift_name text DEFAULT 'Regular Shift',
  start_time text DEFAULT '09:00',
  end_time text DEFAULT '18:30',
  grace_minutes integer DEFAULT 5,
  short_leave_total_monthly integer DEFAULT 4,
  max_short_leave_per_day integer DEFAULT 1,
  short_leave_1_name text DEFAULT '20-Minute Short Leave',
  short_leave_1_minutes integer DEFAULT 20,
  short_leave_1_quota integer DEFAULT 2,
  short_leave_2_name text DEFAULT '2-Hour Short Leave',
  short_leave_2_minutes integer DEFAULT 120,
  short_leave_2_quota integer DEFAULT 2,
  min_half_day_minutes integer DEFAULT 270, -- Under 4h 30m is Absent on Mon-Sat
  min_full_day_minutes integer DEFAULT 450, -- 7h 30m standard
  half_day_deduction_credit numeric(3,2) DEFAULT 0.50,
  absent_deduction_credit numeric(3,2) DEFAULT 0.00,
  enable_short_leaves boolean DEFAULT true,
  enable_voice_alerts boolean DEFAULT true,
  policy_notes text,
  updated_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_tenant_attendance_policy UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_shift_policies_tenant ON attendance_shift_policies (tenant_id);

-- 2. Seed default policies for existing tenants
-- Tenant A: New Swan Group / NSMLR (Official Policy v2.4)
INSERT INTO attendance_shift_policies (
  tenant_id,
  company_name,
  policy_version,
  shift_name,
  start_time,
  end_time,
  grace_minutes,
  short_leave_total_monthly,
  max_short_leave_per_day,
  short_leave_1_name,
  short_leave_1_minutes,
  short_leave_1_quota,
  short_leave_2_name,
  short_leave_2_minutes,
  short_leave_2_quota,
  min_half_day_minutes,
  min_full_day_minutes,
  policy_notes,
  updated_by
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'New Swan Group',
  'v2.4',
  'Regular Shift (NSMLR / New Swan Group)',
  '09:00',
  '18:30',
  5,
  4,
  1,
  '20-Minute Short Leave',
  20,
  2,
  '2-Hour Short Leave',
  120,
  2,
  270,
  450,
  'New Swan Group / NSMLR Enterprise Attendance Guidelines, Grace Periods, Short Leave Quotas & Penalties.',
  'system_seed'
)
ON CONFLICT (tenant_id) DO NOTHING;

-- Tenant B: SuPuja Creations
INSERT INTO attendance_shift_policies (
  tenant_id,
  company_name,
  policy_version,
  shift_name,
  start_time,
  end_time,
  grace_minutes,
  short_leave_total_monthly,
  max_short_leave_per_day,
  short_leave_1_name,
  short_leave_1_minutes,
  short_leave_1_quota,
  short_leave_2_name,
  short_leave_2_minutes,
  short_leave_2_quota,
  min_half_day_minutes,
  min_full_day_minutes,
  policy_notes,
  updated_by
)
VALUES (
  '0a37b8e8-1c28-4e19-8891-951fc3f8f8af',
  'SuPuja Creations',
  'v1.0',
  'SuPuja General Shift',
  '09:00',
  '18:30',
  5,
  4,
  1,
  '20-Minute Short Leave',
  20,
  2,
  '2-Hour Short Leave',
  120,
  2,
  270,
  450,
  'SuPuja Creations Enterprise Attendance Guidelines. Customizable by company admin.',
  'system_seed'
)
ON CONFLICT (tenant_id) DO NOTHING;

-- Tenant C: Testing New Swan Group
INSERT INTO attendance_shift_policies (
  tenant_id,
  company_name,
  policy_version,
  shift_name,
  start_time,
  end_time,
  grace_minutes,
  short_leave_total_monthly,
  max_short_leave_per_day,
  short_leave_1_name,
  short_leave_1_minutes,
  short_leave_1_quota,
  short_leave_2_name,
  short_leave_2_minutes,
  short_leave_2_quota,
  min_half_day_minutes,
  min_full_day_minutes,
  policy_notes,
  updated_by
)
VALUES (
  '922d3e72-6588-457f-a562-4f1bdbf10d98',
  'Testing New Swan Group',
  'v1.0',
  'Testing Regular Shift',
  '09:00',
  '18:30',
  5,
  4,
  1,
  '20-Minute Short Leave',
  20,
  2,
  '2-Hour Short Leave',
  120,
  2,
  270,
  450,
  'Testing Sandbox Attendance Policy.',
  'system_seed'
)
ON CONFLICT (tenant_id) DO NOTHING;
