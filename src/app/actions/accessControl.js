'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function getAccessProfiles(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('access_profiles')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('profile_name', { ascending: true });

  if (error) {
    console.error('Error fetching access profiles:', error);
    return [];
  }
  return data || [];
}

export async function createAccessProfile(profileData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const profileCode = profileData.profile_code || `PROF-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await adminClient
    .from('access_profiles')
    .insert([{ ...profileData, profile_code: profileCode, tenant_id: tenantId }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function setUserAccessOverride(overrideData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('user_access_overrides')
    .insert([{ ...overrideData, tenant_id: tenantId }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 4-Tier Access Calculator:
 * Effective Access = Designation Default + Assigned Access Profile + User Additional - User Restrictions
 * Rules: User Restrictions take highest priority.
 */
export async function calculateEffectiveUserAccess(userId, moduleKey) {
  const adminClient = getAdminClient();

  // 1. Fetch user restrictions / grants
  const { data: overrides } = await adminClient
    .from('user_access_overrides')
    .select('*')
    .eq('user_id', userId)
    .eq('module_key', moduleKey);

  const isRestricted = overrides?.some(o => o.override_type === 'RESTRICT');
  if (isRestricted) {
    return { canView: false, canEdit: false, dataVisibility: 'Blocked' };
  }

  const isGranted = overrides?.some(o => o.override_type === 'GRANT');

  // 2. Fetch employee designation access default
  const { data: emp } = await adminClient
    .from('employees')
    .select('*, designation:designations(*)')
    .eq('user_id', userId)
    .single();

  const visibilityScope = emp?.designation?.default_data_visibility || 'Own Records Only';

  return {
    canView: true,
    canEdit: isGranted || emp?.designation?.is_assignment_eligible,
    dataVisibility: visibilityScope
  };
}
