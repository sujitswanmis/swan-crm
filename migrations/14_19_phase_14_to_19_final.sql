-- ====================================================================
-- PHASE 14 TO 19 MIGRATION: PRODUCTS, BOM, DEMAND FLOWS & IMPORT TOOL
-- Multi-Tenant SaaS WMS Infrastructure
-- ====================================================================

-- 1. UOM MASTER & CONVERSIONS
CREATE TABLE IF NOT EXISTS uom_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  uom_code text NOT NULL,
  uom_name text NOT NULL,
  status text DEFAULT 'ACTIVE',
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, uom_code)
);

INSERT INTO uom_master (tenant_id, uom_code, uom_name)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'NOS', 'Numbers'),
  ('00000000-0000-0000-0000-000000000001', 'SET', 'Set'),
  ('00000000-0000-0000-0000-000000000001', 'KG', 'Kilogram'),
  ('00000000-0000-0000-0000-000000000001', 'BOX', 'Box')
ON CONFLICT (tenant_id, uom_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS uom_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  from_uom_id uuid NOT NULL REFERENCES uom_master(id) ON DELETE CASCADE,
  to_uom_id uuid NOT NULL REFERENCES uom_master(id) ON DELETE CASCADE,
  conversion_factor numeric(12,6) NOT NULL DEFAULT 1.000000,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. PRODUCTS & ITEM MASTER
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  product_code text NOT NULL,
  product_name text NOT NULL,
  category_name text NOT NULL,
  model text,
  variant text,
  hsn_code text,
  uom_code text DEFAULT 'NOS',
  gst_rate numeric(5,2) DEFAULT 18.00,
  standard_price numeric(14,2) DEFAULT 0.00,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  plant_id uuid REFERENCES plants(id) ON DELETE SET NULL,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, product_code)
);

-- Seed sample products
INSERT INTO products (tenant_id, product_code, product_name, category_name, standard_price)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'PRD-ROTAVATOR-6FT', 'Swan Agro Rotavator 6 Feet', 'Rotavator', 115000.00),
  ('00000000-0000-0000-0000-000000000001', 'PRD-SEEDDRILL-9R', 'Swan Agro Seed Drill 9 Row', 'Seed Drill', 85000.00)
ON CONFLICT (tenant_id, product_code) DO NOTHING;

-- 3. BILL OF MATERIALS (BOM)
CREATE TABLE IF NOT EXISTS product_bom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_item_code text NOT NULL,
  component_item_name text NOT NULL,
  required_qty_per_unit numeric(12,4) NOT NULL DEFAULT 1.0000,
  uom text DEFAULT 'Nos',
  is_critical boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- 4. SALES ORDERS & DEMAND FLOWS
CREATE TABLE IF NOT EXISTS sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  order_number text UNIQUE NOT NULL,
  party_id uuid NOT NULL REFERENCES party_master(id) ON DELETE CASCADE,
  dealer_party_id uuid REFERENCES party_master(id) ON DELETE SET NULL,
  distributor_party_id uuid REFERENCES party_master(id) ON DELETE SET NULL,
  demand_flow_type text DEFAULT 'MAKE_TO_ORDER' CHECK (demand_flow_type IN ('MAKE_TO_STOCK', 'MAKE_TO_ORDER', 'HYBRID')),
  total_ordered_qty numeric(14,4) DEFAULT 0.00,
  total_amount numeric(14,2) DEFAULT 0.00,
  order_status text DEFAULT 'CONFIRMED' CHECK (order_status IN ('DRAFT', 'CONFIRMED', 'ALLOCATED', 'IN_PRODUCTION', 'BILLED', 'DISPATCHED', 'CANCELLED')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 5. DATA IMPORT BATCHES (Dry-run & Rollback Log)
CREATE TABLE IF NOT EXISTS data_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  batch_ref_code text UNIQUE NOT NULL,
  import_module text NOT NULL,
  total_records integer DEFAULT 0,
  successful_records integer DEFAULT 0,
  failed_records integer DEFAULT 0,
  is_dry_run boolean DEFAULT true,
  status text DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DRY_RUN_PASSED', 'COMPLETED', 'ROLLED_BACK', 'FAILED')),
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error_report_json jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);
