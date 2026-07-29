-- ====================================================================
-- PHASE 9 & 10 ROLLBACK SCRIPT
-- ====================================================================

DROP TABLE IF EXISTS stage_instances CASCADE;
DROP TABLE IF EXISTS workflow_instances CASCADE;
DROP TABLE IF EXISTS stage_field_mappings CASCADE;
DROP TABLE IF EXISTS workflow_stages CASCADE;
DROP TABLE IF EXISTS workflow_versions CASCADE;
DROP TABLE IF EXISTS workflow_definitions CASCADE;
DROP TABLE IF EXISTS territory_market_potential CASCADE;
DROP TABLE IF EXISTS territory_network_targets CASCADE;
