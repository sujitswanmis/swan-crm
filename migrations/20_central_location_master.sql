-- ====================================================================
-- MIGRATION 20: CENTRAL LOCATION MASTER
-- Reusable Geographic Infrastructure for New Swan CRM
-- ====================================================================

-- 1. SERVER-SIDE NORMALIZATION FUNCTION
CREATE OR REPLACE FUNCTION normalize_location_text(raw_text text)
RETURNS text AS $$
DECLARE
  normalized text;
BEGIN
  IF raw_text IS NULL OR trim(raw_text) = '' THEN
    RETURN '';
  END IF;
  
  normalized := lower(trim(raw_text));
  -- Replace punctuation with spaces
  normalized := regexp_replace(normalized, '[^\w\s]', ' ', 'g');
  -- Handle Dist, Distt, District prefixes/suffixes
  normalized := regexp_replace(normalized, '\b(distt|dist|district)\b', '', 'g');
  -- Replace multiple spaces with a single space
  normalized := regexp_replace(normalized, '\s+', ' ', 'g');
  
  RETURN trim(normalized);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. LOCATION TABLES

-- 2.1 location_countries
CREATE TABLE IF NOT EXISTS location_countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code varchar(10) UNIQUE NOT NULL,
  country_name varchar(100) NOT NULL,
  official_code varchar(50),
  name_normalized varchar(100) NOT NULL,
  is_active boolean DEFAULT true,
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2.2 location_states
CREATE TABLE IF NOT EXISTS location_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES location_countries(id) ON DELETE CASCADE,
  state_code varchar(20) NOT NULL,
  state_name varchar(100) NOT NULL,
  state_type varchar(30) NOT NULL DEFAULT 'STATE' CHECK (state_type IN ('STATE', 'UNION_TERRITORY')),
  official_code varchar(50),
  name_normalized varchar(100) NOT NULL,
  is_active boolean DEFAULT true,
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT unq_state_country_code UNIQUE(country_id, state_code)
);

-- 2.3 location_districts
CREATE TABLE IF NOT EXISTS location_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES location_countries(id) ON DELETE CASCADE,
  state_id uuid NOT NULL REFERENCES location_states(id) ON DELETE CASCADE,
  district_code varchar(20) NOT NULL,
  district_name varchar(100) NOT NULL,
  official_code varchar(50),
  name_normalized varchar(100) NOT NULL,
  is_active boolean DEFAULT true,
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT unq_district_state_code UNIQUE(state_id, district_code)
);

-- State Mismatch Verification Trigger for Districts
CREATE OR REPLACE FUNCTION verify_district_state_country()
RETURNS TRIGGER AS $$
DECLARE
  parent_country_id uuid;
BEGIN
  SELECT country_id INTO parent_country_id FROM location_states WHERE id = NEW.state_id;
  IF parent_country_id IS NULL OR parent_country_id <> NEW.country_id THEN
    RAISE EXCEPTION 'District country_id does not match the state country_id!';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_verify_district_country ON location_districts;
CREATE TRIGGER trigger_verify_district_country
BEFORE INSERT OR UPDATE ON location_districts
FOR EACH ROW EXECUTE PROCEDURE verify_district_state_country();

-- 2.4 location_subdistricts
CREATE TABLE IF NOT EXISTS location_subdistricts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES location_countries(id) ON DELETE CASCADE,
  state_id uuid NOT NULL REFERENCES location_states(id) ON DELETE CASCADE,
  district_id uuid NOT NULL REFERENCES location_districts(id) ON DELETE CASCADE,
  subdistrict_code varchar(30) NOT NULL,
  subdistrict_name varchar(100) NOT NULL,
  subdistrict_type varchar(30) NOT NULL DEFAULT 'TEHSIL' CHECK (subdistrict_type IN (
    'TEHSIL', 'SUB_DISTRICT', 'TALUKA', 'MANDAL', 'CIRCLE', 'REVENUE_DIVISION', 'OTHER'
  )),
  official_code varchar(50),
  name_normalized varchar(100) NOT NULL,
  is_active boolean DEFAULT true,
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2.5 location_blocks
CREATE TABLE IF NOT EXISTS location_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES location_countries(id) ON DELETE CASCADE,
  state_id uuid NOT NULL REFERENCES location_states(id) ON DELETE CASCADE,
  district_id uuid NOT NULL REFERENCES location_districts(id) ON DELETE CASCADE,
  subdistrict_id uuid REFERENCES location_subdistricts(id) ON DELETE SET NULL, -- Optional!
  block_code varchar(30) NOT NULL,
  block_name varchar(100) NOT NULL,
  official_code varchar(50),
  name_normalized varchar(100) NOT NULL,
  is_active boolean DEFAULT true,
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2.6 location_subdistrict_block_mappings
CREATE TABLE IF NOT EXISTS location_subdistrict_block_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subdistrict_id uuid NOT NULL REFERENCES location_subdistricts(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES location_blocks(id) ON DELETE CASCADE,
  mapping_type varchar(30) DEFAULT 'OFFICIAL',
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT unq_subdistrict_block UNIQUE(subdistrict_id, block_id)
);

-- 2.7 location_settlements
CREATE TABLE IF NOT EXISTS location_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES location_countries(id) ON DELETE CASCADE,
  state_id uuid NOT NULL REFERENCES location_states(id) ON DELETE CASCADE,
  district_id uuid NOT NULL REFERENCES location_districts(id) ON DELETE CASCADE, -- Compulsory
  subdistrict_id uuid REFERENCES location_subdistricts(id) ON DELETE SET NULL, -- Nullable
  block_id uuid REFERENCES location_blocks(id) ON DELETE SET NULL, -- Nullable
  settlement_code varchar(30) NOT NULL,
  settlement_name varchar(100) NOT NULL,
  settlement_type varchar(30) NOT NULL DEFAULT 'VILLAGE' CHECK (settlement_type IN (
    'CITY', 'TOWN', 'VILLAGE', 'MUNICIPALITY', 'NAGAR_PANCHAYAT', 'CENSUS_TOWN', 'OTHER'
  )),
  official_code varchar(50),
  name_normalized varchar(100) NOT NULL,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  is_active boolean DEFAULT true,
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2.8 location_post_offices
CREATE TABLE IF NOT EXISTS location_post_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES location_countries(id) ON DELETE CASCADE,
  state_id uuid NOT NULL REFERENCES location_states(id) ON DELETE CASCADE,
  district_id uuid NOT NULL REFERENCES location_districts(id) ON DELETE CASCADE,
  subdistrict_id uuid REFERENCES location_subdistricts(id) ON DELETE SET NULL,
  block_id uuid REFERENCES location_blocks(id) ON DELETE SET NULL,
  settlement_id uuid REFERENCES location_settlements(id) ON DELETE SET NULL,
  pin_code varchar(10) NOT NULL, -- Non-unique index!
  post_office_name varchar(100) NOT NULL,
  post_office_type varchar(50),
  delivery_status varchar(30),
  official_code varchar(50),
  name_normalized varchar(100) NOT NULL,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2.9 location_aliases
CREATE TABLE IF NOT EXISTS location_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  alias_name varchar(100) NOT NULL,
  alias_normalized varchar(100) NOT NULL,
  location_type varchar(30) NOT NULL CHECK (location_type IN (
    'COUNTRY', 'STATE', 'DISTRICT', 'SUBDISTRICT', 'BLOCK', 'SETTLEMENT', 'POST_OFFICE'
  )),
  canonical_location_id uuid NOT NULL,
  source varchar(50),
  language_code varchar(10) DEFAULT 'en',
  is_active boolean DEFAULT true,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2.10 location_import_batches
CREATE TABLE IF NOT EXISTS location_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code varchar(50) UNIQUE NOT NULL,
  source_name varchar(100),
  source_file_name varchar(255),
  source_reference text,
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at timestamptz DEFAULT now(),
  total_rows integer DEFAULT 0,
  valid_rows integer DEFAULT 0,
  duplicate_rows integer DEFAULT 0,
  error_rows integer DEFAULT 0,
  approved_rows integer DEFAULT 0,
  rejected_rows integer DEFAULT 0,
  batch_status varchar(30) DEFAULT 'UPLOADED' CHECK (batch_status IN (
    'UPLOADED', 'VALIDATING', 'VALIDATED', 'REVIEW_PENDING', 'APPROVED',
    'IMPORTED', 'PARTIALLY_IMPORTED', 'REJECTED', 'FAILED'
  )),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  remarks text
);

-- 2.11 location_import_staging
CREATE TABLE IF NOT EXISTS location_import_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES location_import_batches(id) ON DELETE CASCADE,
  row_number integer,
  country_name_raw text,
  state_name_raw text,
  district_name_raw text,
  subdistrict_name_raw text,
  subdistrict_type_raw text,
  block_name_raw text,
  settlement_name_raw text,
  settlement_type_raw text,
  post_office_name_raw text,
  pin_code_raw text,
  official_code_raw text,
  normalized_payload jsonb DEFAULT '{}'::jsonb,
  matched_location_id uuid,
  match_method varchar(50),
  match_confidence numeric(5,2),
  validation_status varchar(30) DEFAULT 'PENDING' CHECK (validation_status IN (
    'PENDING', 'VALID', 'INVALID', 'DUPLICATE', 'PARENT_MISSING', 'ALIAS_MATCH', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED'
  )),
  import_action varchar(30) DEFAULT 'CREATE' CHECK (import_action IN (
    'CREATE', 'UPDATE', 'LINK_EXISTING', 'SKIP', 'REVIEW'
  )),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 2.12 location_requests
CREATE TABLE IF NOT EXISTS location_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  requested_location_type varchar(30) NOT NULL,
  country_id uuid REFERENCES location_countries(id) ON DELETE SET NULL,
  state_id uuid REFERENCES location_states(id) ON DELETE SET NULL,
  district_id uuid REFERENCES location_districts(id) ON DELETE SET NULL,
  subdistrict_id uuid REFERENCES location_subdistricts(id) ON DELETE SET NULL,
  block_id uuid REFERENCES location_blocks(id) ON DELETE SET NULL,
  proposed_name varchar(100) NOT NULL,
  proposed_pin_code varchar(10),
  reason text,
  supporting_reference text,
  request_status varchar(30) DEFAULT 'PENDING' CHECK (request_status IN (
    'PENDING', 'UNDER_VERIFICATION', 'APPROVED', 'REJECTED', 'DUPLICATE', 'MAPPED_TO_EXISTING'
  )),
  matched_location_id uuid,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_remarks text
);

-- 2.13 location_change_history
CREATE TABLE IF NOT EXISTS location_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_type varchar(30) NOT NULL,
  location_id uuid NOT NULL,
  change_type varchar(30) NOT NULL CHECK (change_type IN (
    'CREATED', 'CORRECTED', 'RENAMED', 'TRANSFERRED', 'MERGED', 'SPLIT', 'DEACTIVATED', 'REACTIVATED'
  )),
  old_values jsonb,
  new_values jsonb,
  effective_from date DEFAULT CURRENT_DATE,
  reason text,
  official_reference text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz DEFAULT now()
);

-- 3. COMPOSITE INDEXES & INDEXES FOR FAST PARENT LOOKUPS
CREATE INDEX IF NOT EXISTS idx_states_country ON location_states(country_id);
CREATE INDEX IF NOT EXISTS idx_districts_state ON location_districts(state_id);
CREATE INDEX IF NOT EXISTS idx_subdistricts_district ON location_subdistricts(district_id);
CREATE INDEX IF NOT EXISTS idx_blocks_district ON location_blocks(district_id);
CREATE INDEX IF NOT EXISTS idx_settlements_district ON location_settlements(district_id);
CREATE INDEX IF NOT EXISTS idx_settlements_subdistrict ON location_settlements(subdistrict_id);
CREATE INDEX IF NOT EXISTS idx_settlements_block ON location_settlements(block_id);
CREATE INDEX IF NOT EXISTS idx_post_offices_pin ON location_post_offices(pin_code);
CREATE INDEX IF NOT EXISTS idx_post_offices_settlement ON location_post_offices(settlement_id);

-- Normalized Name Composite Indexes
CREATE INDEX IF NOT EXISTS idx_states_parent_norm ON location_states(country_id, name_normalized);
CREATE INDEX IF NOT EXISTS idx_districts_parent_norm ON location_districts(state_id, name_normalized);
CREATE INDEX IF NOT EXISTS idx_subdistricts_parent_norm ON location_subdistricts(district_id, name_normalized);
CREATE INDEX IF NOT EXISTS idx_blocks_parent_norm ON location_blocks(district_id, name_normalized);
CREATE INDEX IF NOT EXISTS idx_aliases_norm ON location_aliases(alias_normalized);
CREATE INDEX IF NOT EXISTS idx_staging_batch ON location_import_staging(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON location_requests(request_status);

-- 4. ALTER LEADS TABLE (Add foreign key columns without deleting old text columns)
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES location_countries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS state_id uuid REFERENCES location_states(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES location_districts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subdistrict_id uuid REFERENCES location_subdistricts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS block_id uuid REFERENCES location_blocks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settlement_id uuid REFERENCES location_settlements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS post_office_id uuid REFERENCES location_post_offices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_mapping_status text DEFAULT 'NOT_PROCESSED' CHECK (location_mapping_status IN (
    'NOT_PROCESSED', 'EXACT_MATCH', 'ALIAS_MATCH', 'REVIEW_REQUIRED', 'NO_MATCH', 'MANUALLY_MAPPED'
  ));

-- 5. RLS POLICIES
ALTER TABLE location_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_subdistricts ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_post_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_requests ENABLE ROW LEVEL SECURITY;

-- Read policies for all authenticated users
DROP POLICY IF EXISTS "Public read countries" ON location_countries;
CREATE POLICY "Public read countries" ON location_countries FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public read states" ON location_states;
CREATE POLICY "Public read states" ON location_states FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public read districts" ON location_districts;
CREATE POLICY "Public read districts" ON location_districts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public read subdistricts" ON location_subdistricts;
CREATE POLICY "Public read subdistricts" ON location_subdistricts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public read blocks" ON location_blocks;
CREATE POLICY "Public read blocks" ON location_blocks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public read settlements" ON location_settlements;
CREATE POLICY "Public read settlements" ON location_settlements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public read post offices" ON location_post_offices;
CREATE POLICY "Public read post offices" ON location_post_offices FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public read aliases" ON location_aliases;
CREATE POLICY "Public read aliases" ON location_aliases FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can read/create location requests" ON location_requests;
CREATE POLICY "Users can read/create location requests" ON location_requests FOR ALL TO authenticated USING (true);

-- 6. DEVELOPMENT / TESTING SEED DATA
DO $$
DECLARE
  v_country_id uuid;
  v_state_hr_id uuid;
  v_state_pb_id uuid;
  v_dist_sirsa_id uuid;
  v_dist_hisar_id uuid;
  v_dist_ludhiana_id uuid;
  v_dist_rupnagar_id uuid;
  v_subdist_dabwali_id uuid;
  v_subdist_ellenabad_id uuid;
  v_subdist_lud_east_id uuid;
  v_block_rania_id uuid;
  v_block_odhan_id uuid;
  v_settlement_dabwali_id uuid;
  v_settlement_ellenabad_id uuid;
  v_settlement_ludhiana_id uuid;
BEGIN
  -- Insert Country India
  INSERT INTO location_countries (country_code, country_name, official_code, name_normalized)
  VALUES ('IN', 'India', 'IND', 'india')
  ON CONFLICT (country_code) DO UPDATE SET country_name = EXCLUDED.country_name
  RETURNING id INTO v_country_id;

  -- Insert States Haryana & Punjab
  INSERT INTO location_states (country_id, state_code, state_name, state_type, name_normalized)
  VALUES (v_country_id, 'HR', 'Haryana', 'STATE', 'haryana')
  ON CONFLICT (country_id, state_code) DO UPDATE SET state_name = EXCLUDED.state_name
  RETURNING id INTO v_state_hr_id;

  INSERT INTO location_states (country_id, state_code, state_name, state_type, name_normalized)
  VALUES (v_country_id, 'PB', 'Punjab', 'STATE', 'punjab')
  ON CONFLICT (country_id, state_code) DO UPDATE SET state_name = EXCLUDED.state_name
  RETURNING id INTO v_state_pb_id;

  -- Insert Districts
  INSERT INTO location_districts (country_id, state_id, district_code, district_name, name_normalized)
  VALUES (v_country_id, v_state_hr_id, 'DIST-SIRSA', 'Sirsa', 'sirsa')
  ON CONFLICT (state_id, district_code) DO UPDATE SET district_name = EXCLUDED.district_name
  RETURNING id INTO v_dist_sirsa_id;

  INSERT INTO location_districts (country_id, state_id, district_code, district_name, name_normalized)
  VALUES (v_country_id, v_state_hr_id, 'DIST-HISAR', 'Hisar', 'hisar')
  ON CONFLICT (state_id, district_code) DO UPDATE SET district_name = EXCLUDED.district_name
  RETURNING id INTO v_dist_hisar_id;

  INSERT INTO location_districts (country_id, state_id, district_code, district_name, name_normalized)
  VALUES (v_country_id, v_state_pb_id, 'DIST-LUDHIANA', 'Ludhiana', 'ludhiana')
  ON CONFLICT (state_id, district_code) DO UPDATE SET district_name = EXCLUDED.district_name
  RETURNING id INTO v_dist_ludhiana_id;

  INSERT INTO location_districts (country_id, state_id, district_code, district_name, name_normalized)
  VALUES (v_country_id, v_state_pb_id, 'DIST-RUPNAGAR', 'Rupnagar', 'rupnagar')
  ON CONFLICT (state_id, district_code) DO UPDATE SET district_name = EXCLUDED.district_name
  RETURNING id INTO v_dist_rupnagar_id;

  -- Insert Sub-districts (Tehsils)
  INSERT INTO location_subdistricts (country_id, state_id, district_id, subdistrict_code, subdistrict_name, subdistrict_type, name_normalized)
  VALUES (v_country_id, v_state_hr_id, v_dist_sirsa_id, 'SUB-DABWALI', 'Dabwali', 'TEHSIL', 'dabwali')
  RETURNING id INTO v_subdist_dabwali_id;

  INSERT INTO location_subdistricts (country_id, state_id, district_id, subdistrict_code, subdistrict_name, subdistrict_type, name_normalized)
  VALUES (v_country_id, v_state_hr_id, v_dist_sirsa_id, 'SUB-ELLENABAD', 'Ellenabad', 'TEHSIL', 'ellenabad')
  RETURNING id INTO v_subdist_ellenabad_id;

  INSERT INTO location_subdistricts (country_id, state_id, district_id, subdistrict_code, subdistrict_name, subdistrict_type, name_normalized)
  VALUES (v_country_id, v_state_pb_id, v_dist_ludhiana_id, 'SUB-LUD-EAST', 'Ludhiana East', 'TEHSIL', 'ludhiana east')
  RETURNING id INTO v_subdist_lud_east_id;

  -- Insert Development Blocks
  INSERT INTO location_blocks (country_id, state_id, district_id, block_code, block_name, name_normalized)
  VALUES (v_country_id, v_state_hr_id, v_dist_sirsa_id, 'BLK-RANIA', 'Rania', 'rania')
  RETURNING id INTO v_block_rania_id;

  INSERT INTO location_blocks (country_id, state_id, district_id, block_code, block_name, name_normalized)
  VALUES (v_country_id, v_state_hr_id, v_dist_sirsa_id, 'BLK-ODHAN', 'Odhan', 'odhan')
  RETURNING id INTO v_block_odhan_id;

  -- Insert Settlements
  INSERT INTO location_settlements (country_id, state_id, district_id, subdistrict_id, block_id, settlement_code, settlement_name, settlement_type, name_normalized)
  VALUES (v_country_id, v_state_hr_id, v_dist_sirsa_id, v_subdist_dabwali_id, v_block_odhan_id, 'SET-DABWALI', 'Mandi Dabwali', 'TOWN', 'mandi dabwali')
  RETURNING id INTO v_settlement_dabwali_id;

  INSERT INTO location_settlements (country_id, state_id, district_id, subdistrict_id, block_id, settlement_code, settlement_name, settlement_type, name_normalized)
  VALUES (v_country_id, v_state_hr_id, v_dist_sirsa_id, v_subdist_ellenabad_id, v_block_rania_id, 'SET-ELLENABAD', 'Ellenabad', 'TOWN', 'ellenabad')
  RETURNING id INTO v_settlement_ellenabad_id;

  INSERT INTO location_settlements (country_id, state_id, district_id, subdistrict_id, block_id, settlement_code, settlement_name, settlement_type, name_normalized)
  VALUES (v_country_id, v_state_pb_id, v_dist_ludhiana_id, v_subdist_lud_east_id, NULL, 'SET-LUDHIANA', 'Ludhiana', 'CITY', 'ludhiana')
  RETURNING id INTO v_settlement_ludhiana_id;

  -- Insert Post Offices & PIN codes
  INSERT INTO location_post_offices (country_id, state_id, district_id, subdistrict_id, settlement_id, pin_code, post_office_name, name_normalized)
  VALUES (v_country_id, v_state_hr_id, v_dist_sirsa_id, v_subdist_dabwali_id, v_settlement_dabwali_id, '125104', 'Mandi Dabwali Sub Office', 'mandi dabwali sub office');

  INSERT INTO location_post_offices (country_id, state_id, district_id, subdistrict_id, settlement_id, pin_code, post_office_name, name_normalized)
  VALUES (v_country_id, v_state_hr_id, v_dist_sirsa_id, v_subdist_dabwali_id, v_settlement_dabwali_id, '125104', 'Dabwali Mandi Town Post Office', 'dabwali mandi town post office');

  INSERT INTO location_post_offices (country_id, state_id, district_id, subdistrict_id, settlement_id, pin_code, post_office_name, name_normalized)
  VALUES (v_country_id, v_state_pb_id, v_dist_ludhiana_id, v_subdist_lud_east_id, v_settlement_ludhiana_id, '141001', 'Ludhiana Head Post Office', 'ludhiana head post office');

  -- Insert Sample Aliases
  INSERT INTO location_aliases (alias_name, alias_normalized, location_type, canonical_location_id, source)
  VALUES ('Gurgaon', 'gurgaon', 'DISTRICT', v_dist_sirsa_id, 'SYSTEM_ALIAS');

  INSERT INTO location_aliases (alias_name, alias_normalized, location_type, canonical_location_id, source)
  VALUES ('Mohali', 'mohali', 'DISTRICT', v_dist_ludhiana_id, 'SYSTEM_ALIAS');

  INSERT INTO location_aliases (alias_name, alias_normalized, location_type, canonical_location_id, source)
  VALUES ('Distt Sirsa', 'distt sirsa', 'DISTRICT', v_dist_sirsa_id, 'SYSTEM_ALIAS');

  INSERT INTO location_aliases (alias_name, alias_normalized, location_type, canonical_location_id, source)
  VALUES ('Dabwali Mandi', 'dabwali mandi', 'SETTLEMENT', v_settlement_dabwali_id, 'SYSTEM_ALIAS');

END $$;
