-- ====================================================================
-- PHASE 5 & 6 MIGRATION: LOCATION MASTER & TERRITORY BUILDER
-- Multi-Tenant SaaS WMS Infrastructure
-- ====================================================================

-- 1. LOCATION MASTER TABLES
CREATE TABLE IF NOT EXISTS location_countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

INSERT INTO location_countries (code, name)
VALUES ('IND', 'India')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS location_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid REFERENCES location_countries(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  UNIQUE(country_id, code)
);

CREATE TABLE IF NOT EXISTS location_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id uuid NOT NULL REFERENCES location_states(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  UNIQUE(state_id, name)
);

CREATE TABLE IF NOT EXISTS location_subdistricts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id uuid NOT NULL REFERENCES location_districts(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  UNIQUE(district_id, name)
);

CREATE TABLE IF NOT EXISTS location_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id uuid NOT NULL REFERENCES location_districts(id) ON DELETE CASCADE,
  subdistrict_id uuid REFERENCES location_subdistricts(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE IF NOT EXISTS location_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id uuid NOT NULL REFERENCES location_districts(id) ON DELETE CASCADE,
  subdistrict_id uuid REFERENCES location_subdistricts(id) ON DELETE SET NULL,
  block_id uuid REFERENCES location_blocks(id) ON DELETE SET NULL,
  name text NOT NULL,
  pincode text,
  settlement_type text DEFAULT 'VILLAGE' CHECK (settlement_type IN ('CITY', 'TOWN', 'VILLAGE'))
);

CREATE TABLE IF NOT EXISTS location_post_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id uuid REFERENCES location_districts(id) ON DELETE CASCADE,
  office_name text NOT NULL,
  pincode text NOT NULL
);

-- Location Aliases (Gurgaon -> Gurugram, etc.)
CREATE TABLE IF NOT EXISTS location_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_alias text UNIQUE NOT NULL,
  official_name text NOT NULL,
  target_district_id uuid REFERENCES location_districts(id) ON DELETE SET NULL,
  status text DEFAULT 'ACTIVE'
);

-- Location Request Queue
CREATE TABLE IF NOT EXISTS location_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  requested_location_name text NOT NULL,
  requested_state text,
  requested_district text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_at timestamp with time zone DEFAULT now()
);

-- 2. TERRITORY BUILDER TABLES
CREATE TABLE IF NOT EXISTS territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  territory_code text NOT NULL,
  territory_name text NOT NULL,
  territory_type text NOT NULL DEFAULT 'TERRITORY' CHECK (territory_type IN (
    'ZONE', 'REGION', 'TERRITORY', 'SALES_AREA', 'ROUTE', 'MICRO_TERRITORY'
  )),
  parent_territory_id uuid REFERENCES territories(id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, territory_code)
);

CREATE TABLE IF NOT EXISTS territory_location_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id uuid NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
  mapping_type text DEFAULT 'PRIMARY' CHECK (mapping_type IN ('PRIMARY', 'SECONDARY', 'SHARED', 'PRODUCT_SPECIFIC', 'SERVICE_TERRITORY')),
  state_id uuid REFERENCES location_states(id) ON DELETE CASCADE,
  district_id uuid REFERENCES location_districts(id) ON DELETE CASCADE,
  subdistrict_id uuid REFERENCES location_subdistricts(id) ON DELETE CASCADE,
  block_id uuid REFERENCES location_blocks(id) ON DELETE CASCADE,
  pincode text,
  created_at timestamp with time zone DEFAULT now()
);

-- Primary Territory Overlap Function
CREATE OR REPLACE FUNCTION check_primary_territory_overlap()
RETURNS TRIGGER AS $$
DECLARE
  overlap_count integer;
BEGIN
  IF NEW.mapping_type = 'PRIMARY' THEN
    SELECT COUNT(*) INTO overlap_count
    FROM territory_location_mappings
    WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND mapping_type = 'PRIMARY'
      AND district_id = NEW.district_id
      AND (
        (NEW.subdistrict_id IS NULL AND subdistrict_id IS NULL) OR
        (NEW.subdistrict_id IS NOT NULL AND subdistrict_id = NEW.subdistrict_id)
      );
      
    IF overlap_count > 0 THEN
      RAISE EXCEPTION 'Primary Territory overlap detected! This location is already assigned to another primary territory.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_territory_overlap ON territory_location_mappings;
CREATE TRIGGER trigger_prevent_territory_overlap
BEFORE INSERT OR UPDATE ON territory_location_mappings
FOR EACH ROW EXECUTE PROCEDURE check_primary_territory_overlap();

CREATE TABLE IF NOT EXISTS territory_employee_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  territory_id uuid NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  role_in_territory text DEFAULT 'RSM' CHECK (role_in_territory IN ('RSM', 'ASM', 'SALES_COORDINATOR', 'FIELD_PERSON', 'SERVICE_PERSON', 'COLLECTION_PERSON')),
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  status text DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamp with time zone DEFAULT now()
);

-- Seed Location Aliases
INSERT INTO location_aliases (raw_alias, official_name)
VALUES 
  ('Gurgaon', 'Gurugram'),
  ('Dist Sirsa', 'Sirsa'),
  ('Mohali', 'Sahibzada Ajit Singh Nagar')
ON CONFLICT (raw_alias) DO NOTHING;
