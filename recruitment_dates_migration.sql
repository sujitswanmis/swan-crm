-- Migration to add columns to recruitment_candidates and recruitment_positions
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

ALTER TABLE recruitment_candidates ADD COLUMN IF NOT EXISTS joining_date DATE;
ALTER TABLE recruitment_candidates ADD COLUMN IF NOT EXISTS actual_joining_date DATE;

-- For recruitment_positions
ALTER TABLE recruitment_positions ADD COLUMN IF NOT EXISTS salary_min INT;
ALTER TABLE recruitment_positions ADD COLUMN IF NOT EXISTS salary_max INT;

-- For recruitment_candidates
ALTER TABLE recruitment_candidates ADD COLUMN IF NOT EXISTS expected_salary_min INT;
ALTER TABLE recruitment_candidates ADD COLUMN IF NOT EXISTS expected_salary_max INT;
ALTER TABLE recruitment_candidates ADD COLUMN IF NOT EXISTS actual_salary INT;
ALTER TABLE recruitment_candidates ADD COLUMN IF NOT EXISTS candidate_code TEXT;
