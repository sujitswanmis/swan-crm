-- ====================================================================
-- PHASE 11, 12 & 13 MIGRATION: TAT ENGINE, WORK ITEMS & UNIVERSAL QUANTITY LEDGER
-- Multi-Tenant SaaS WMS Infrastructure
-- ====================================================================

-- 1. BUSINESS WORKING CALENDARS TABLE
CREATE TABLE IF NOT EXISTS working_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  calendar_code text NOT NULL,
  calendar_name text NOT NULL,
  calendar_type text DEFAULT 'COMPANY' CHECK (calendar_type IN ('COMPANY', 'PLANT', 'DEPARTMENT', 'SHIFT', 'VENDOR')),
  plant_id uuid REFERENCES plants(id) ON DELETE SET NULL,
  weekly_off_day integer DEFAULT 0, -- 0 = Sunday
  shift_start_time time DEFAULT '09:00:00',
  shift_end_time time DEFAULT '18:00:00',
  break_duration_minutes integer DEFAULT 60,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, calendar_code)
);

CREATE TABLE IF NOT EXISTS holiday_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  calendar_id uuid REFERENCES working_calendars(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  holiday_name text NOT NULL,
  holiday_type text DEFAULT 'NATIONAL' CHECK (holiday_type IN ('NATIONAL', 'FESTIVAL', 'PLANT_SHUTDOWN', 'OPTIONAL')),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, calendar_id, holiday_date)
);

-- 2. STAGE WORK ITEMS & MULTI-EMPLOYEE ASSIGNMENTS
CREATE TABLE IF NOT EXISTS stage_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_instance_id uuid NOT NULL REFERENCES stage_instances(id) ON DELETE CASCADE,
  work_item_code text NOT NULL,
  work_item_type text DEFAULT 'ITEM_WISE' CHECK (work_item_type IN (
    'VENDOR_WISE', 'CLIENT_WISE', 'PRODUCT_WISE', 'ITEM_WISE', 'LOCATION_WISE', 'BATCH_WISE', 'QUANTITY_WISE', 'DEPARTMENT_WISE'
  )),
  item_name text NOT NULL,
  assigned_qty numeric(14,4) DEFAULT 0.00,
  planned_start timestamp with time zone,
  planned_completion timestamp with time zone,
  actual_start timestamp with time zone,
  actual_completion timestamp with time zone,
  status text DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'REJECTED')),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_item_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id uuid NOT NULL REFERENCES stage_work_items(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  role_in_stage text DEFAULT 'OPERATOR',
  assigned_qty numeric(14,4) DEFAULT 0.00,
  status text DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED')),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(work_item_id, employee_id)
);

-- 3. UNIVERSAL QUANTITY LEDGER (Append-Only Transaction History)
CREATE TABLE IF NOT EXISTS quantity_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  transaction_ref_code text UNIQUE NOT NULL,
  workflow_instance_id uuid REFERENCES workflow_instances(id) ON DELETE SET NULL,
  stage_instance_id uuid REFERENCES stage_instances(id) ON DELETE SET NULL,
  module_type text NOT NULL CHECK (module_type IN ('PURCHASE', 'PRODUCTION', 'SALES', 'MAKE_TO_STOCK', 'MAKE_TO_ORDER')),
  product_id text,
  item_code text NOT NULL,
  item_name text NOT NULL,
  uom text DEFAULT 'Nos',
  batch_number text,
  lot_number text,
  serial_number text,
  input_qty numeric(14,4) NOT NULL DEFAULT 0.00,
  planned_qty numeric(14,4) DEFAULT 0.00,
  processed_qty numeric(14,4) DEFAULT 0.00,
  accepted_qty numeric(14,4) DEFAULT 0.00,
  rejected_qty numeric(14,4) DEFAULT 0.00,
  rework_qty numeric(14,4) DEFAULT 0.00,
  hold_qty numeric(14,4) DEFAULT 0.00,
  transferred_qty numeric(14,4) DEFAULT 0.00,
  pending_qty numeric(14,4) GENERATED ALWAYS AS (input_qty - (accepted_qty + rejected_qty + rework_qty + hold_qty + transferred_qty)) STORED,
  remarks text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Quantity Balance Verification Trigger
CREATE OR REPLACE FUNCTION verify_quantity_ledger_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.accepted_qty + NEW.rejected_qty + NEW.rework_qty + NEW.hold_qty + NEW.transferred_qty) > NEW.input_qty THEN
    RAISE EXCEPTION 'Quantity ledger balance violation! Sum of accepted, rejected, rework, hold, and transferred quantity exceeds input quantity.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_verify_quantity_balance ON quantity_transactions;
CREATE TRIGGER trigger_verify_quantity_balance
BEFORE INSERT OR UPDATE ON quantity_transactions
FOR EACH ROW EXECUTE PROCEDURE verify_quantity_ledger_balance();

-- Inventory Reservations
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  item_code text NOT NULL,
  reserved_qty numeric(14,4) NOT NULL DEFAULT 0.00,
  reservation_purpose text NOT NULL CHECK (reservation_purpose IN ('SALES_ORDER', 'PRODUCTION_ORDER', 'REPLENISHMENT')),
  reference_order_id text,
  party_id uuid REFERENCES party_master(id) ON DELETE SET NULL,
  status text DEFAULT 'RESERVED' CHECK (status IN ('RESERVED', 'CONSUMED', 'CANCELLED', 'RELEASED')),
  created_at timestamp with time zone DEFAULT now()
);
