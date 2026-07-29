'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function getTerritoryTargets(territoryId, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('territory_network_targets')
    .select('*, territory:territories(territory_name)')
    .eq('tenant_id', tenantId)
    .eq('territory_id', territoryId)
    .order('period_value', { ascending: false });

  if (error) {
    console.error('Error fetching territory targets:', error);
    return [];
  }
  return data || [];
}

export async function setTerritoryNetworkTarget(targetData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('territory_network_targets')
    .upsert({
      ...targetData,
      tenant_id: tenantId,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getTerritoryMarketPotential(territoryId) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('territory_market_potential')
    .select('*')
    .eq('territory_id', territoryId);

  if (error) return [];
  return data || [];
}
