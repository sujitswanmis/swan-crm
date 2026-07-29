'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createPartyMaster } from './partyMaster';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

export async function sendLeadToParty(leadId, userId) {
  const adminClient = getAdminClient();

  // 1. Fetch Lead
  const { data: lead, error: leadErr } = await adminClient
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();

  if (leadErr || !lead) throw new Error('Lead not found');

  // Verify Stage 07
  if (!lead.status || !lead.status.startsWith('07') && !lead.status.startsWith('7;')) {
    throw new Error('"Send to Party" is only allowed for leads in 07 - Final Stage');
  }

  // 2. Check duplicate party by mobile or GSTIN
  const { data: existingParties } = await adminClient
    .from('party_master')
    .select('id, party_universal_code, firm_name, primary_mobile')
    .eq('primary_mobile', lead.phone)
    .limit(1);

  let party;
  let transferType = 'NEW_PARTY_DRAFT';

  if (existingParties && existingParties.length > 0) {
    party = existingParties[0];
    transferType = 'LINK_EXISTING_PARTY';
  } else {
    // 3. Create New Party Draft via Lead Mapping Builder
    party = await createPartyMaster({
      firm_name: lead.company || lead.name || 'Draft Party',
      legal_name: lead.company || lead.name,
      primary_mobile: lead.phone,
      official_email: lead.email,
      source_lead_id: lead.id,
      acquisition_source: lead.source || 'CRM_LEAD'
    });
  }

  // 4. Record Lead Party Handoff Log
  const { data: handoff } = await adminClient
    .from('lead_party_handoffs')
    .insert([{
      lead_id: lead.id,
      target_party_id: party.id,
      transfer_type: transferType,
      handoff_status: 'PENDING_VERIFICATION',
      transferred_by: userId || null
    }])
    .select()
    .single();

  // 5. Update lead note without deleting lead
  await adminClient.from('lead_notes').insert([{
    lead_id: lead.id,
    note_text: `Lead transferred to Party Master (${party.party_universal_code} - ${party.firm_name}). Lead preserved in Stage 07.`,
    created_by: 'System Handoff'
  }]);

  return {
    success: true,
    partyCode: party.party_universal_code,
    partyId: party.id,
    transferType
  };
}
