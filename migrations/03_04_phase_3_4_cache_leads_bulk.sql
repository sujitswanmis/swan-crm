-- ====================================================================
-- PHASE 3 & 4 MIGRATION: CACHE ENGINE, ATOMIC LEAD ID, DUPLICATE MATCHER & BULK ASSIGNMENT
-- Multi-Tenant SaaS WMS Infrastructure
-- ====================================================================

-- 1. CACHE VERSIONS TABLES
CREATE TABLE IF NOT EXISTS team_cache_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_version integer DEFAULT 1,
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS navigation_cache_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  menu_version integer DEFAULT 1,
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- 2. ATOMIC LEAD ID SEQUENCE & FUNCTION
CREATE SEQUENCE IF NOT EXISTS lead_id_seq START WITH 100000 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION generate_atomic_lead_id()
RETURNS text AS $$
DECLARE
  next_val bigint;
  lead_ref text;
BEGIN
  next_val := nextval('lead_id_seq');
  lead_ref := 'SWAN-LD-' || lpad(next_val::text, 6, '0');
  RETURN lead_ref;
END;
$$ LANGUAGE plpgsql;

-- 3. MOBILE NORMALIZATION UTILITY FUNCTION
CREATE OR REPLACE FUNCTION normalize_mobile_digits(raw_mobile text)
RETURNS text AS $$
DECLARE
  cleaned text;
BEGIN
  IF raw_mobile IS NULL OR raw_mobile = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove non-digit characters
  cleaned := regexp_replace(raw_mobile, '\D', '', 'g');
  
  -- If starts with 91 and length is 12, strip 91
  IF length(cleaned) = 12 AND cleaned LIKE '91%' THEN
    cleaned := substring(cleaned from 3);
  END IF;
  
  -- Return last 10 digits if valid length
  IF length(cleaned) >= 10 THEN
    RETURN substring(cleaned from (length(cleaned) - 9));
  END IF;
  
  RETURN cleaned;
END;
$$ LANGUAGE plpgsql;

-- 4. BULK ASSIGNMENT BATCH AUDIT TABLE
CREATE TABLE IF NOT EXISTS lead_bulk_assignment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  batch_ref_code text NOT NULL,
  source text,
  source_name text,
  total_selected integer NOT NULL DEFAULT 0,
  assigned_count integer NOT NULL DEFAULT 0,
  target_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  target_employee_name text,
  assignment_mode text NOT NULL DEFAULT 'REASSIGN_ALL' CHECK (assignment_mode IN (
    'UNASSIGNED_ONLY', 'REASSIGN_ALL', 'ROUND_ROBIN', 'EQUAL_DISTRIBUTION', 'WORKLOAD_BASED', 'TERRITORY_BASED'
  )),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  remarks text,
  created_at timestamp with time zone DEFAULT now()
);

-- 5. DUPLICATE MATCH LOGS TABLE
CREATE TABLE IF NOT EXISTS lead_duplicate_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES tenants(id) ON DELETE CASCADE,
  primary_lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  duplicate_lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  match_type text NOT NULL CHECK (match_type IN ('MOBILE', 'EMAIL', 'GSTIN', 'PAN', 'FIRM_DISTRICT')),
  matched_value text,
  status text DEFAULT 'FLAGGED' CHECK (status IN ('FLAGGED', 'MERGED', 'LINKED', 'IGNORED', 'CANCELLED')),
  created_at timestamp with time zone DEFAULT now()
);
