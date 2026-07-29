-- ====================================================================
-- PHASE 5 & 6 ROLLBACK SCRIPT
-- ====================================================================

DROP TRIGGER IF EXISTS trigger_prevent_territory_overlap ON territory_location_mappings;
DROP FUNCTION IF EXISTS check_primary_territory_overlap();

DROP TABLE IF EXISTS territory_employee_assignments CASCADE;
DROP TABLE IF EXISTS territory_location_mappings CASCADE;
DROP TABLE IF EXISTS territories CASCADE;

DROP TABLE IF EXISTS location_requests CASCADE;
DROP TABLE IF EXISTS location_aliases CASCADE;
DROP TABLE IF EXISTS location_post_offices CASCADE;
DROP TABLE IF EXISTS location_settlements CASCADE;
DROP TABLE IF EXISTS location_blocks CASCADE;
DROP TABLE IF EXISTS location_subdistricts CASCADE;
DROP TABLE IF EXISTS location_districts CASCADE;
DROP TABLE IF EXISTS location_states CASCADE;
DROP TABLE IF EXISTS location_countries CASCADE;
