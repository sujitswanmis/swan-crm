'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_INDIAN_STATES = [
  { code: 'PB', name: 'Punjab' },
  { code: 'HR', name: 'Haryana' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'DL', name: 'Delhi' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'BR', name: 'Bihar' },
  { code: 'WB', name: 'West Bengal' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TS', name: 'Telangana' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'HP', name: 'Himachal Pradesh' },
  { code: 'UK', name: 'Uttarakhand' }
];

const DEFAULT_DISTRICTS_MAP = {
  'Punjab': ['Ludhiana', 'Jalandhar', 'Amritsar', 'Patiala', 'Bathinda', 'Sahibzada Ajit Singh Nagar (Mohali)', 'Sangrur', 'Gurdaspur', 'Hoshiarpur', 'Firozpur'],
  'Haryana': ['Gurugram', 'Faridabad', 'Ambala', 'Karnal', 'Panipat', 'Hisar', 'Rohtak', 'Sonipat', 'Sirsa', 'Yamunanagar'],
  'Uttar Pradesh': ['Noida', 'Ghaziabad', 'Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Meerut', 'Prayagraj', 'Bareilly', 'Aligarh'],
  'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner', 'Alwar', 'Bhilwara', 'Sikar', 'Sri Ganganagar'],
  'Delhi': ['Central Delhi', 'East Delhi', 'New Delhi', 'North Delhi', 'South Delhi', 'West Delhi']
};

export async function getStates() {
  const adminClient = getAdminClient();
  let { data, error } = await adminClient
    .from('location_states')
    .select('*')
    .order('name', { ascending: true });

  if (error || !data || data.length === 0) {
    const { data: inserted } = await adminClient
      .from('location_states')
      .insert(DEFAULT_INDIAN_STATES)
      .select();

    return inserted || DEFAULT_INDIAN_STATES.map((s, idx) => ({ id: `st-${idx}`, ...s }));
  }

  return data || [];
}

export async function createState(stateData) {
  const adminClient = getAdminClient();
  const stateCode = stateData.code || stateData.name.slice(0, 3).toUpperCase();
  const { data, error } = await adminClient
    .from('location_states')
    .insert([{ name: stateData.name, code: stateCode }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getDistricts(stateId) {
  const adminClient = getAdminClient();
  let { data } = await adminClient
    .from('location_districts')
    .select('*')
    .eq('state_id', stateId)
    .order('name', { ascending: true });

  if (!data || data.length === 0) {
    const { data: stateData } = await adminClient
      .from('location_states')
      .select('name')
      .eq('id', stateId)
      .single();

    const stateName = stateData?.name;
    const defaultDistricts = DEFAULT_DISTRICTS_MAP[stateName] || ['Central District', 'North District', 'South District', 'East District', 'West District'];

    const districtPayload = defaultDistricts.map((dName, idx) => ({
      state_id: stateId,
      code: `DIST-${idx + 1}`,
      name: dName
    }));

    const { data: insertedDistricts } = await adminClient
      .from('location_districts')
      .insert(districtPayload)
      .select();

    return insertedDistricts || districtPayload.map((d, idx) => ({ id: `dst-${idx}`, ...d }));
  }

  return data || [];
}

export async function createDistrict(districtData) {
  const adminClient = getAdminClient();
  const distCode = districtData.code || `DIST-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await adminClient
    .from('location_districts')
    .insert([{
      state_id: districtData.state_id,
      name: districtData.name,
      code: distCode
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createSubdistrict(subdistrictData) {
  const adminClient = getAdminClient();
  const subCode = subdistrictData.code || `SUB-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await adminClient
    .from('location_subdistricts')
    .insert([{
      district_id: subdistrictData.district_id,
      name: subdistrictData.name,
      code: subCode
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function resolveLocationAlias(rawName) {
  const adminClient = getAdminClient();
  if (!rawName) return null;

  const { data } = await adminClient
    .from('location_aliases')
    .select('*')
    .ilike('raw_alias', rawName.trim())
    .single();

  if (data?.official_name) return data.official_name;

  const lower = rawName.trim().toLowerCase();
  if (lower.includes('gurgaon')) return 'Gurugram';
  if (lower.includes('mohali')) return 'Sahibzada Ajit Singh Nagar (Mohali)';
  if (lower.includes('dist sirsa') || lower === 'sirsa') return 'Sirsa';
  if (lower.includes('bombay')) return 'Mumbai';
  if (lower.includes('calcutta')) return 'Kolkata';

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
