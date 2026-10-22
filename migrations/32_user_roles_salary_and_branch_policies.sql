-- ====================================================================
-- PHASE 32 MIGRATION: USER ROLES SALARY AMOUNT & BRANCH SHIFT POLICIES
-- Multi-Tenant SaaS WMS / CRM Infrastructure
-- Safety: Non-destructive, idempotent (IF NOT EXISTS)
-- ====================================================================

-- 1. Add salary_amount column to user_roles
ALTER TABLE IF EXISTS user_roles 
  ADD COLUMN IF NOT EXISTS salary_amount numeric(12,2) DEFAULT NULL;

-- 2. Add branch_name column to attendance_shift_policies
ALTER TABLE IF EXISTS attendance_shift_policies 
  ADD COLUMN IF NOT EXISTS branch_name text DEFAULT NULL;

-- 3. Index for quick employee salary lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_salary ON user_roles (salary_amount) WHERE salary_amount IS NOT NULL;
