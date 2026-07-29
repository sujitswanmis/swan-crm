-- ====================================================================
-- PHASE 7 & 8 ROLLBACK SCRIPT
-- ====================================================================

DROP TABLE IF EXISTS lead_party_handoffs CASCADE;
DROP TABLE IF EXISTS lead_party_field_mappings CASCADE;
DROP TABLE IF EXISTS party_bank_accounts CASCADE;
DROP TABLE IF EXISTS party_commercial_terms CASCADE;
DROP TABLE IF EXISTS party_billing_routes CASCADE;
DROP TABLE IF EXISTS party_relationships CASCADE;
DROP TABLE IF EXISTS party_addresses CASCADE;
DROP TABLE IF EXISTS party_contacts CASCADE;
DROP TABLE IF EXISTS party_roles CASCADE;
DROP TABLE IF EXISTS party_master CASCADE;
DROP FUNCTION IF EXISTS generate_atomic_party_code();
DROP SEQUENCE IF EXISTS party_code_seq;
