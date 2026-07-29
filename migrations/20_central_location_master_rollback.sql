-- ====================================================================
-- MIGRATION 20 ROLLBACK SCRIPT: CENTRAL LOCATION MASTER
-- ====================================================================

-- 1. Remove Foreign Key Columns from Leads table
ALTER TABLE leads 
  DROP COLUMN IF EXISTS location_mapping_status,
  DROP COLUMN IF EXISTS post_office_id,
  DROP COLUMN IF EXISTS settlement_id,
  DROP COLUMN IF EXISTS block_id,
  DROP COLUMN IF EXISTS subdistrict_id,
  DROP COLUMN IF EXISTS district_id,
  DROP COLUMN IF EXISTS state_id,
  DROP COLUMN IF EXISTS country_id;

-- 2. Drop Triggers and Functions
DROP TRIGGER IF EXISTS trigger_verify_district_country ON location_districts;
DROP FUNCTION IF EXISTS verify_district_state_country();
DROP FUNCTION IF EXISTS normalize_location_text(text);

-- 3. Drop Location Master Tables
DROP TABLE IF EXISTS location_change_history CASCADE;
DROP TABLE IF EXISTS location_requests CASCADE;
DROP TABLE IF EXISTS location_import_staging CASCADE;
DROP TABLE IF EXISTS location_import_batches CASCADE;
DROP TABLE IF EXISTS location_aliases CASCADE;
DROP TABLE IF EXISTS location_post_offices CASCADE;
DROP TABLE IF EXISTS location_settlements CASCADE;
DROP TABLE IF EXISTS location_subdistrict_block_mappings CASCADE;
DROP TABLE IF EXISTS location_blocks CASCADE;
DROP TABLE IF EXISTS location_subdistricts CASCADE;
DROP TABLE IF EXISTS location_districts CASCADE;
DROP TABLE IF EXISTS location_states CASCADE;
DROP TABLE IF EXISTS location_countries CASCADE;
