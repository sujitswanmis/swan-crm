-- =========================================================================
-- Migration 56: Add Posting Status and Posting Sources to Recruitment Positions
-- Table affected: recruitment_positions
-- Description: Adds first-class physical columns for tracking job posting
--              status (Draft, Posted, Paused, Closed) and multi-channel
--              distribution sources (Naukri, LinkedIn, Indeed, apna, etc.).
-- =========================================================================

ALTER TABLE recruitment_positions 
  ADD COLUMN IF NOT EXISTS posting_status VARCHAR(50) DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS posting_sources JSONB DEFAULT '[]'::jsonb;

-- Index for filtering by posting status
CREATE INDEX IF NOT EXISTS idx_recruitment_positions_posting_status 
  ON recruitment_positions(posting_status);

-- Backfill from metadata embedded in jd_text if present
DO $$
DECLARE
  pos RECORD;
  meta_json JSONB;
BEGIN
  FOR pos IN SELECT id, jd_text FROM recruitment_positions WHERE jd_text LIKE '%<!--WORKSPACE:%' LOOP
    BEGIN
      meta_json := substring(pos.jd_text from '<!--WORKSPACE:(.*?)-->')::jsonb;
      IF meta_json IS NOT NULL THEN
        IF meta_json->>'posting_status' IS NOT NULL THEN
          UPDATE recruitment_positions
          SET posting_status = meta_json->>'posting_status'
          WHERE id = pos.id AND (posting_status IS NULL OR posting_status = 'Draft');
        END IF;

        IF meta_json->'posting_sources' IS NOT NULL AND jsonb_typeof(meta_json->'posting_sources') = 'array' THEN
          UPDATE recruitment_positions
          SET posting_sources = meta_json->'posting_sources'
          WHERE id = pos.id AND (posting_sources IS NULL OR posting_sources = '[]'::jsonb);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Ignore corrupted metadata and keep default
    END;
  END LOOP;
END $$;
