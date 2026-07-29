'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function recordQuantityTransaction(txData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const txRef = `QTY-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await adminClient
    .from('quantity_transactions')
    .insert([{
      ...txData,
      transaction_ref_code: txRef,
      tenant_id: tenantId
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getQuantityTransactions(itemCode, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  let query = adminClient
    .from('quantity_transactions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (itemCode) {
    query = query.eq('item_code', itemCode);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching quantity transactions:', error);
    return [];
  }
  return data || [];
}

export async function reserveInventory(reserveData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('inventory_reservations')
    .insert([{
      ...reserveData,
      tenant_id: tenantId,
      status: 'RESERVED'
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
