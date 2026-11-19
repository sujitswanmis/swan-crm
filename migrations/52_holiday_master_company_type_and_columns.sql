-- Migration 52: Allow 'COMPANY' in holiday_master check constraint and add branch_name / description columns
-- Additive, Non-destructive update for multi-branch holiday calendar management

-- 1. Update holiday_type check constraint to include 'COMPANY'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'holiday_master_holiday_type_check'
  ) THEN
    ALTER TABLE holiday_master DROP CONSTRAINT holiday_master_holiday_type_check;
  END IF;
  
  ALTER TABLE holiday_master 
    ADD CONSTRAINT holiday_master_holiday_type_check 
    CHECK (holiday_type IN ('NATIONAL', 'FESTIVAL', 'COMPANY', 'PLANT_SHUTDOWN', 'OPTIONAL'));
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Add branch_name column if not exists
ALTER TABLE IF EXISTS holiday_master 
  ADD COLUMN IF NOT EXISTS branch_name text DEFAULT 'All Branches';

-- 3. Add description column if not exists
ALTER TABLE IF EXISTS holiday_master 
  ADD COLUMN IF NOT EXISTS description text DEFAULT '';

-- 4. Create index on (tenant_id, holiday_date) for fast lookups
CREATE INDEX IF NOT EXISTS idx_holiday_master_tenant_date 
  ON holiday_master(tenant_id, holiday_date);
