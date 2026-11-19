-- Migration 53: Add is_holiday status column to holiday_master
-- Distinguishes between official paid holidays (company closed) and festival observances (working days)

ALTER TABLE IF EXISTS holiday_master 
  ADD COLUMN IF NOT EXISTS is_holiday boolean DEFAULT true;

-- Update any existing null values to true (backward compatible)
UPDATE holiday_master 
  SET is_holiday = true 
  WHERE is_holiday IS NULL;
