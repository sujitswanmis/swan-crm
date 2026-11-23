-- =========================================================================
-- Migration 55: Add Dedicated Physical Columns to Recruitment Module
-- Tables affected: recruitment_positions, recruitment_candidates
-- Description: Upgrades metadata-only fields to first-class physical database
--              columns for maximum query speed, instant indexing, and clean
--              Supabase Table Editor visibility.
-- =========================================================================

-- 1. Add Dedicated Physical Columns to recruitment_positions
ALTER TABLE recruitment_positions 
  ADD COLUMN IF NOT EXISTS job_type VARCHAR(100) DEFAULT 'Full Time (Permanent)',
  ADD COLUMN IF NOT EXISTS vacancy_reason VARCHAR(100) DEFAULT 'New Position',
  ADD COLUMN IF NOT EXISTS experience_required VARCHAR(100) DEFAULT 'Any Experience',
  ADD COLUMN IF NOT EXISTS min_qualification VARCHAR(255) DEFAULT 'Any / Uneducated',
  ADD COLUMN IF NOT EXISTS urgency VARCHAR(100) DEFAULT '🟡 Medium Priority',
  ADD COLUMN IF NOT EXISTS work_mode VARCHAR(100) DEFAULT 'On-Site (Plant / Office)',
  ADD COLUMN IF NOT EXISTS shift_type VARCHAR(100) DEFAULT 'General Shift (Day)',
  ADD COLUMN IF NOT EXISTS gender_preference VARCHAR(100) DEFAULT 'No Preference (Any)',
  ADD COLUMN IF NOT EXISTS key_skills TEXT DEFAULT '';

-- 2. Add Dedicated Physical Columns to recruitment_candidates
ALTER TABLE recruitment_candidates 
  ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(50) DEFAULT '',
  ADD COLUMN IF NOT EXISTS current_city VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS total_experience VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS highest_qualification VARCHAR(255) DEFAULT '',
  ADD COLUMN IF NOT EXISTS notice_period VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS current_salary NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cover_note TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS interview_rating NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS technical_score VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS recommendation VARCHAR(100) DEFAULT '';

-- 3. Create Performance Indexes for Fast Filtering & Sorting
CREATE INDEX IF NOT EXISTS idx_recruitment_positions_urgency 
  ON recruitment_positions(urgency);

CREATE INDEX IF NOT EXISTS idx_recruitment_positions_job_type 
  ON recruitment_positions(job_type);

CREATE INDEX IF NOT EXISTS idx_recruitment_positions_vacancy_reason 
  ON recruitment_positions(vacancy_reason);

CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_city 
  ON recruitment_candidates(current_city);

CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_qualification 
  ON recruitment_candidates(highest_qualification);

-- 4. Automatic Backfill: Extract JSON metadata into physical columns where empty
DO $$
DECLARE
  pos RECORD;
  meta_json JSONB;
BEGIN
  -- Backfill recruitment_positions from jd_text <!--WORKSPACE:{...}-->
  FOR pos IN SELECT id, jd_text FROM recruitment_positions WHERE jd_text LIKE '%<!--WORKSPACE:%' LOOP
    BEGIN
      meta_json := substring(pos.jd_text from '<!--WORKSPACE:(.*?)-->')::jsonb;
      IF meta_json IS NOT NULL THEN
        UPDATE recruitment_positions SET
          job_type = COALESCE(NULLIF(job_type, ''), meta_json->>'job_type', 'Full Time (Permanent)'),
          vacancy_reason = COALESCE(NULLIF(vacancy_reason, ''), meta_json->>'vacancy_reason', 'New Position'),
          experience_required = COALESCE(NULLIF(experience_required, ''), meta_json->>'experience_required', 'Any Experience'),
          min_qualification = COALESCE(NULLIF(min_qualification, ''), meta_json->>'min_qualification', 'Any / Uneducated'),
          urgency = COALESCE(NULLIF(urgency, ''), meta_json->>'urgency', '🟡 Medium Priority'),
          work_mode = COALESCE(NULLIF(work_mode, ''), meta_json->>'work_mode', 'On-Site (Plant / Office)'),
          shift_type = COALESCE(NULLIF(shift_type, ''), meta_json->>'shift_type', 'General Shift (Day)'),
          gender_preference = COALESCE(NULLIF(gender_preference, ''), meta_json->>'gender_preference', 'No Preference (Any)'),
          key_skills = COALESCE(NULLIF(key_skills, ''), meta_json->>'key_skills', '')
        WHERE id = pos.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- ignore malformed JSON tags during backfill
    END;
  END LOOP;
END $$;

DO $$
DECLARE
  cand RECORD;
  details_json JSONB;
  prof JSONB;
  eval_data JSONB;
BEGIN
  -- Backfill recruitment_candidates from joining_details JSON
  FOR cand IN SELECT id, joining_details FROM recruitment_candidates WHERE joining_details IS NOT NULL AND joining_details <> '' LOOP
    BEGIN
      details_json := cand.joining_details::jsonb;
      prof := COALESCE(details_json->'applicant_profile', details_json);
      eval_data := details_json->'evaluation';
      
      UPDATE recruitment_candidates SET
        alternate_phone = COALESCE(NULLIF(alternate_phone, ''), prof->>'alternate_phone', ''),
        current_city = COALESCE(NULLIF(current_city, ''), prof->>'current_city', ''),
        total_experience = COALESCE(NULLIF(total_experience, ''), prof->>'total_experience', ''),
        highest_qualification = COALESCE(NULLIF(highest_qualification, ''), prof->>'highest_qualification', ''),
        notice_period = COALESCE(NULLIF(notice_period, ''), prof->>'notice_period', ''),
        current_salary = COALESCE(current_salary, (prof->>'current_salary')::numeric),
        cover_note = COALESCE(NULLIF(cover_note, ''), prof->>'cover_note', ''),
        interview_rating = COALESCE(interview_rating, (eval_data->>'interview_rating')::numeric),
        technical_score = COALESCE(NULLIF(technical_score, ''), eval_data->>'technical_score', ''),
        recommendation = COALESCE(NULLIF(recommendation, ''), eval_data->>'recommendation', '')
      WHERE id = cand.id;
    EXCEPTION WHEN OTHERS THEN
      -- ignore malformed JSON during backfill
    END;
  END LOOP;
END $$;
