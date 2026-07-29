'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function getDesignations(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('designations')
    .select('*, company:companies(name), department:departments_wms(name)')
    .eq('tenant_id', tenantId)
    .order('hierarchy_rank', { ascending: true });

  if (error) {
    console.error('Error fetching designations:', error);
    return [];
  }
  return data || [];
}

export async function createDesignation(designationData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const designationCode = designationData.designation_code || `DESIG-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await adminClient
    .from('designations')
    .insert([{
      ...designationData,
      designation_code: designationCode,
      tenant_id: tenantId
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateDesignation(id, updates) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('designations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
