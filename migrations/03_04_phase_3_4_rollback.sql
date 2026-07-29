-- ====================================================================
-- PHASE 3 & 4 ROLLBACK SCRIPT
-- ====================================================================

DROP TABLE IF EXISTS lead_duplicate_matches CASCADE;
DROP TABLE IF EXISTS lead_bulk_assignment_batches CASCADE;
DROP FUNCTION IF EXISTS normalize_mobile_digits(text);
DROP FUNCTION IF EXISTS generate_atomic_lead_id();
DROP SEQUENCE IF EXISTS lead_id_seq;
DROP TABLE IF EXISTS navigation_cache_versions CASCADE;
DROP TABLE IF EXISTS team_cache_versions CASCADE;
