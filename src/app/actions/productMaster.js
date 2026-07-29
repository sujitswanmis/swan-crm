'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function getProducts(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('products')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('product_name', { ascending: true });

  if (error) {
    console.error('Error fetching products:', error);
    return [];
  }
  return data || [];
}

export async function createProduct(productData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const productCode = productData.product_code || `PRD-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await adminClient
    .from('products')
    .insert([{
      ...productData,
      product_code: productCode,
      tenant_id: tenantId
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getBOM(productId) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('product_bom')
    .select('*')
    .eq('parent_product_id', productId);

  if (error) return [];
  return data || [];
}

/**
 * Assembly-ready quantity is calculated based on the minimum available accepted quantity of mandatory components.
 */
export async function calculateAssemblyReadyQty(productId) {
  const bom = await getBOM(productId);
  if (!bom || bom.length === 0) return 9999; // Unlimited if no BOM defined

  const adminClient = getAdminClient();
  let minReady = Infinity;

  for (const item of bom) {
    const { data: txs } = await adminClient
      .from('quantity_transactions')
      .select('accepted_qty')
      .eq('item_code', item.component_item_code);

    const totalAccepted = (txs || []).reduce((acc, t) => acc + (t.accepted_qty || 0), 0);
    const possibleUnits = Math.floor(totalAccepted / (item.required_qty_per_unit || 1));

    if (possibleUnits < minReady) {
      minReady = possibleUnits;
    }
  }

  return minReady === Infinity ? 0 : minReady;
}
