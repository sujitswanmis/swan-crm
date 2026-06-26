-- Migration to add joining_date and actual_joining_date to recruitment_candidates
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

ALTER TABLE recruitment_candidates ADD COLUMN IF NOT EXISTS joining_date DATE;
ALTER TABLE recruitment_candidates ADD COLUMN IF NOT EXISTS actual_joining_date DATE;
