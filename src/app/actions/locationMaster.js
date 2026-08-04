'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

/**
 * 100% DATABASE-DRIVEN LOCATION MASTER ACTIONS
 * Absolutely ZERO hardcoded state/district arrays or fake fallbacks!
 */

export async function getStates() {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('location_states')
    .select('*')
    .eq('is_active', true)
    .order('state_name', { ascending: true });

  if (error) {
    console.error('Error fetching location_states from DB:', error.message);
    return [];
  }
  return data || [];
}

export async function createState(stateData) {
  const adminClient = getAdminClient();
  const stateCode = stateData.code ? stateData.code.toUpperCase() : stateData.name.slice(0, 3).toUpperCase();
  const nameNorm = stateData.name.trim().toLowerCase();

  const { data, error } = await adminClient
    .from('location_states')
    .insert([{
      country_id: stateData.country_id || '00000000-0000-0000-0000-000000000001',
      state_code: stateCode,
      state_name: stateData.name,
      name_normalized: nameNorm,
      state_type: stateData.state_type || 'STATE',
      official_code: stateData.official_code || null
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getDistricts(stateId) {
  if (!stateId) return [];
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('location_districts')
    .select('*')
    .eq('state_id', stateId)
    .eq('is_active', true)
    .order('district_name', { ascending: true });

  if (error) {
    console.error('Error fetching location_districts from DB:', error.message);
    return [];
  }
  return data || [];
}

export async function createDistrict(districtData) {
  const adminClient = getAdminClient();
  const distCode = districtData.code ? districtData.code.toUpperCase() : `DIST-${Date.now().toString(36).toUpperCase()}`;
  const nameNorm = districtData.name.trim().toLowerCase();

  const { data, error } = await adminClient
    .from('location_districts')
    .insert([{
      country_id: districtData.country_id || '00000000-0000-0000-0000-000000000001',
      state_id: districtData.state_id,
      district_code: distCode,
      district_name: districtData.name,
      name_normalized: nameNorm,
      official_code: districtData.official_code || null
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createSubdistrict(subdistrictData) {
  const adminClient = getAdminClient();
  const subCode = subdistrictData.code ? subdistrictData.code.toUpperCase() : `SUB-${Date.now().toString(36).toUpperCase()}`;
  const nameNorm = subdistrictData.name.trim().toLowerCase();

  const { data, error } = await adminClient
    .from('location_subdistricts')
    .insert([{
      country_id: subdistrictData.country_id || '00000000-0000-0000-0000-000000000001',
      state_id: subdistrictData.state_id,
      district_id: subdistrictData.district_id,
      subdistrict_code: subCode,
      subdistrict_name: subdistrictData.name,
      subdistrict_type: subdistrictData.subdistrict_type || 'TEHSIL',
      name_normalized: nameNorm,
      official_code: subdistrictData.official_code || null
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function resolveLocationAlias(rawName) {
  if (!rawName) return null;
  const adminClient = getAdminClient();
  const norm = rawName.trim().toLowerCase();

  const { data } = await adminClient
    .from('location_aliases')
    .select('*')
    .ilike('alias_normalized', norm)
    .eq('is_active', true)
    .maybeSingle();

  if (data?.canonical_location_id) {
    return data.alias_name;
  }
  return rawName.trim();
}

export async function createLocationRequest(reqData) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('location_requests')
    .insert([reqData])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
