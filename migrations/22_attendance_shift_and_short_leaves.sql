-- ====================================================================
-- PHASE 22 MIGRATION: ATTENDANCE SHIFT RULES & SHORT LEAVES EXTENSION
-- Multi-Tenant WMS / CRM Infrastructure
-- Safety: Non-destructive, idempotent (IF NOT EXISTS)
-- ====================================================================

-- 1. Extend attendance_records with Shift & Short Leave tracking columns
ALTER TABLE IF EXISTS attendance_records 
  ADD COLUMN IF NOT EXISTS short_leave_type text DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS is_grace_applied boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS shift_name text DEFAULT 'Regular Shift';

-- 2. Index for monthly short leave calculation queries
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_month 
  ON attendance_records (email, attendance_date, short_leave_type);
