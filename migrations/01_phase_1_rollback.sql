-- ====================================================================
-- PHASE 1 ROLLBACK SCRIPT
-- Reverts Phase 1 DDL Changes Safely
-- ====================================================================

DROP TRIGGER IF EXISTS trigger_sync_employee_to_user_roles ON employees;
DROP FUNCTION IF EXISTS sync_employee_to_user_roles();

DROP TRIGGER IF EXISTS trigger_prevent_circular_reporting ON employee_reporting_relations;
DROP FUNCTION IF EXISTS check_circular_reporting();

DROP TABLE IF EXISTS employee_reporting_relations CASCADE;
DROP TABLE IF EXISTS employee_designation_history CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS designations CASCADE;

DROP TABLE IF EXISTS work_locations CASCADE;
DROP TABLE IF EXISTS cost_centres CASCADE;
DROP TABLE IF EXISTS work_centres CASCADE;
DROP TABLE IF EXISTS sections CASCADE;
DROP TABLE IF EXISTS sub_departments CASCADE;
DROP TABLE IF EXISTS departments_wms CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS plants CASCADE;
DROP TABLE IF EXISTS business_units CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS group_companies CASCADE;

DROP TABLE IF EXISTS tenant_usage_meters CASCADE;
DROP TABLE IF EXISTS tenant_entitlements CASCADE;
DROP TABLE IF EXISTS tenant_subscriptions CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
