'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function invalidateTeamCache(userId, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data: existing } = await adminClient
    .from('team_cache_versions')
    .select('access_version')
    .eq('user_id', userId)
    .single();

  const newVersion = (existing?.access_version || 1) + 1;

  await adminClient
    .from('team_cache_versions')
    .upsert({
      tenant_id: tenantId,
      user_id: userId,
      access_version: newVersion,
      updated_at: new Date().toISOString()
    });

  return newVersion;
}

export async function invalidateNavigationCache(userId, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data: existing } = await adminClient
    .from('navigation_cache_versions')
    .select('menu_version')
    .eq('user_id', userId)
    .single();

  const newVersion = (existing?.menu_version || 1) + 1;

  await adminClient
    .from('navigation_cache_versions')
    .upsert({
      tenant_id: tenantId,
      user_id: userId,
      menu_version: newVersion,
      updated_at: new Date().toISOString()
    });

  return newVersion;
}
