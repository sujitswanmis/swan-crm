'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------
// COMPANIES
// ---------------------------------------------------------
export async function getCompanies(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('companies')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching companies:', error);
    return [];
  }
  return data || [];
}

export async function createCompany(companyData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('companies')
    .insert([{ ...companyData, tenant_id: tenantId }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------
// DEPARTMENTS & SUB-DEPARTMENTS
// ---------------------------------------------------------
export async function getWmsDepartments(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('departments_wms')
    .select('*, sub_departments(*)')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching WMS departments:', error);
    return [];
  }
  return data || [];
}

export async function createWmsDepartment(deptData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const code = deptData.code || `DEPT-${deptData.name.substring(0, 4).toUpperCase()}`;
  const { data, error } = await adminClient
    .from('departments_wms')
    .insert([{ ...deptData, code, tenant_id: tenantId }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createSubDepartment(subDeptData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const code = subDeptData.code || `SUB-${subDeptData.name.substring(0, 4).toUpperCase()}`;
  const { data, error } = await adminClient
    .from('sub_departments')
    .insert([{ ...subDeptData, code, tenant_id: tenantId }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------
// WORK LOCATIONS & PLANTS
// ---------------------------------------------------------
export async function getWorkLocations(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('work_locations')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching work locations:', error);
    return [];
  }
  return data || [];
}

export async function createWorkLocation(locationData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const code = locationData.code || `LOC-${locationData.name.substring(0, 4).toUpperCase()}`;
  const { data, error } = await adminClient
    .from('work_locations')
    .insert([{ ...locationData, code, tenant_id: tenantId }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
