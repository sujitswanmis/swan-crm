'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function getPartyList(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('party_master')
    .select('*, party_roles(*), party_contacts(*), party_commercial_terms(*)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching party list:', error);
    return [];
  }
  
  const cleanedData = (data || []).map(item => ({
    ...item,
    gstin: item.gstin && item.gstin.includes('Error creating party') ? '' : item.gstin
  }));

  return cleanedData;
}

export async function createPartyMaster(partyData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();

  const { primary_contact_name, ...cleanPartyData } = partyData;

  // Generate atomic party code
  const { data: codeData } = await adminClient.rpc('generate_atomic_party_code');
  const partyCode = codeData || `PTY-${Date.now().toString().slice(-6)}`;

  const { data: party, error } = await adminClient
    .from('party_master')
    .insert([{
      ...cleanPartyData,
      party_universal_code: partyCode,
      tenant_id: tenantId,
      party_status: 'Draft'
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Insert primary contact if provided
  if (primary_contact_name && partyData.primary_mobile) {
    await adminClient.from('party_contacts').insert([{
      party_id: party.id,
      contact_name: primary_contact_name,
      primary_mobile: partyData.primary_mobile,
      is_primary: true
    }]);
  }

  // Initialize commercial terms
  await adminClient.from('party_commercial_terms').insert([{
    party_id: party.id
  }]);

  return party;
}

export async function getParty360Details(partyId) {
  const adminClient = getAdminClient();
  const [
    { data: party },
    { data: roles },
    { data: contacts },
    { data: addresses },
    { data: relationships },
    { data: billingRoutes },
    { data: commercial },
    { data: bankAccounts }
  ] = await Promise.all([
    adminClient.from('party_master').select('*').eq('id', partyId).single(),
    adminClient.from('party_roles').select('*').eq('party_id', partyId),
    adminClient.from('party_contacts').select('*').eq('party_id', partyId),
    adminClient.from('party_addresses').select('*').eq('party_id', partyId),
    adminClient.from('party_relationships').select('*').eq('dealer_party_id', partyId),
    adminClient.from('party_billing_routes').select('*').eq('party_id', partyId).single(),
    adminClient.from('party_commercial_terms').select('*').eq('party_id', partyId).single(),
    adminClient.from('party_bank_accounts').select('*').eq('party_id', partyId)
  ]);

  return {
    party,
    roles: roles || [],
    contacts: contacts || [],
    addresses: addresses || [],
    relationships: relationships || [],
    billingRoute: billingRoutes || null,
    commercial: commercial || null,
    bankAccounts: bankAccounts || []
  };
}
