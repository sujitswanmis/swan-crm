-- ====================================================================
-- PHASE 2 ROLLBACK SCRIPT
-- ====================================================================

DROP FUNCTION IF EXISTS get_recursive_subordinates(uuid);
DROP TABLE IF EXISTS approval_rules CASCADE;
DROP TABLE IF EXISTS user_access_overrides CASCADE;
DROP TABLE IF EXISTS access_profiles CASCADE;
