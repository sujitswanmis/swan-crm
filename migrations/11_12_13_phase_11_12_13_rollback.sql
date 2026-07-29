-- ====================================================================
-- PHASE 11, 12 & 13 ROLLBACK SCRIPT
-- ====================================================================

DROP TRIGGER IF EXISTS trigger_verify_quantity_balance ON quantity_transactions;
DROP FUNCTION IF EXISTS verify_quantity_ledger_balance();

DROP TABLE IF EXISTS inventory_reservations CASCADE;
DROP TABLE IF EXISTS quantity_transactions CASCADE;
DROP TABLE IF EXISTS work_item_assignments CASCADE;
DROP TABLE IF EXISTS stage_work_items CASCADE;
DROP TABLE IF EXISTS holiday_master CASCADE;
DROP TABLE IF EXISTS working_calendars CASCADE;
