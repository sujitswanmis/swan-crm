-- ====================================================================
-- PHASE 31 MIGRATION: MULTI-SHIFT ATTENDANCE & EMPLOYEE SHIFT ASSIGNMENT
-- Multi-Tenant SaaS WMS Infrastructure
-- Safety: Non-destructive, idempotent (IF NOT EXISTS)
-- ====================================================================

-- 1. Add shifts JSONB column to attendance_shift_policies
ALTER TABLE IF EXISTS attendance_shift_policies 
  ADD COLUMN IF NOT EXISTS shifts jsonb DEFAULT '[]'::jsonb;

-- 2. Add assigned_shift column to user_roles so employees can have a default/assigned shift
ALTER TABLE IF EXISTS user_roles
  ADD COLUMN IF NOT EXISTS assigned_shift text DEFAULT NULL;

-- 3. Populate multi-shift defaults for New Swan Group / NSMLR
UPDATE attendance_shift_policies
SET shifts = '[
  {
    "id": "shift_gen",
    "shift_code": "GEN",
    "shift_name": "Regular / General Shift (NSMLR)",
    "is_default": true,
    "start_time": "09:00",
    "end_time": "18:30",
    "grace_minutes": 5,
    "short_leave_1_name": "20-Minute Short Leave",
    "short_leave_1_minutes": 20,
    "short_leave_1_quota": 2,
    "short_leave_2_name": "2-Hour Short Leave",
    "short_leave_2_minutes": 120,
    "short_leave_2_quota": 2,
    "min_half_day_minutes": 270,
    "min_full_day_minutes": 450
  },
  {
    "id": "shift_a",
    "shift_code": "SHIFT_A",
    "shift_name": "Shift A (Morning Production)",
    "is_default": false,
    "start_time": "06:00",
    "end_time": "14:30",
    "grace_minutes": 5,
    "short_leave_1_name": "20-Minute Short Leave",
    "short_leave_1_minutes": 20,
    "short_leave_1_quota": 2,
    "short_leave_2_name": "2-Hour Short Leave",
    "short_leave_2_minutes": 120,
    "short_leave_2_quota": 2,
    "min_half_day_minutes": 240,
    "min_full_day_minutes": 450
  },
  {
    "id": "shift_b",
    "shift_code": "SHIFT_B",
    "shift_name": "Shift B (Evening Production)",
    "is_default": false,
    "start_time": "14:30",
    "end_time": "23:00",
    "grace_minutes": 5,
    "short_leave_1_name": "20-Minute Short Leave",
    "short_leave_1_minutes": 20,
    "short_leave_1_quota": 2,
    "short_leave_2_name": "2-Hour Short Leave",
    "short_leave_2_minutes": 120,
    "short_leave_2_quota": 2,
    "min_half_day_minutes": 240,
    "min_full_day_minutes": 450
  },
  {
    "id": "shift_c",
    "shift_code": "SHIFT_C",
    "shift_name": "Shift C (Night Production)",
    "is_default": false,
    "start_time": "23:00",
    "end_time": "07:30",
    "grace_minutes": 5,
    "short_leave_1_name": "20-Minute Short Leave",
    "short_leave_1_minutes": 20,
    "short_leave_1_quota": 2,
    "short_leave_2_name": "2-Hour Short Leave",
    "short_leave_2_minutes": 120,
    "short_leave_2_quota": 2,
    "min_half_day_minutes": 240,
    "min_full_day_minutes": 450
  }
]'::jsonb
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND (shifts IS NULL OR shifts = '[]'::jsonb);
