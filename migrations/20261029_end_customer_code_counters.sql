-- Additive Customer Code allocator. Does not renumber or modify existing customers.
-- Run once before using database-backed sequential Customer IDs.
BEGIN;

CREATE TABLE IF NOT EXISTS public.end_customer_code_counters (
  tenant_id text NOT NULL CHECK (tenant_id ~ '^TNT[0-9]{5,}$'),
  code_year integer NOT NULL CHECK (code_year BETWEEN 2000 AND 9999),
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value BETWEEN 0 AND 9007199254740991),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, code_year)
);

ALTER TABLE public.end_customer_code_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.end_customer_code_counters FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.end_customer_code_counters TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_end_customer_codes(
  p_tenant_id text,
  p_year integer,
  p_count integer DEFAULT 1,
  p_minimum bigint DEFAULT 0
)
RETURNS TABLE (first_value bigint, last_value bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_seed bigint := 0;
  v_last bigint;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^TNT[0-9]{5,}$'
     OR p_year IS NULL OR p_year NOT BETWEEN 2000 AND 9999
     OR p_count IS NULL OR p_count NOT BETWEEN 1 AND 1000
     OR p_minimum IS NULL OR p_minimum NOT BETWEEN 0 AND 9007199254739991 THEN
    RAISE EXCEPTION 'Invalid customer code reservation';
  END IF;

  -- A local-only installation may not have this table yet. Existing alphanumeric
  -- random codes remain untouched; only fully numeric suffixes seed the sequence.
  IF pg_catalog.to_regclass('public.end_customers') IS NOT NULL THEN
    EXECUTE $seed$
      SELECT COALESCE(MAX(substring(customer_code FROM $2)::bigint), 0)
      FROM public.end_customers
      WHERE tenant_id::text = $1 AND customer_code ~ $2
    $seed$
    INTO v_seed
    USING p_tenant_id, '^CUST-' || p_year::text || '-([0-9]{1,15})$';
  END IF;
  v_seed := GREATEST(v_seed, p_minimum);

  -- ON CONFLICT locks the tenant/year row. Overlapping requests reserve disjoint
  -- ranges, including when both requests are the first allocation for a tenant.
  INSERT INTO public.end_customer_code_counters AS counter
    (tenant_id, code_year, last_value, updated_at)
  VALUES (p_tenant_id, p_year, v_seed + p_count, now())
  ON CONFLICT (tenant_id, code_year) DO UPDATE
    SET last_value = GREATEST(counter.last_value, v_seed) + p_count,
        updated_at = now()
  RETURNING counter.last_value INTO v_last;

  RETURN QUERY SELECT v_last - p_count + 1, v_last;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_end_customer_codes(text, integer, integer, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_end_customer_codes(text, integer, integer, bigint) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
