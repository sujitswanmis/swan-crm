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

  // Verify Stage 07 (can be '07 - Final Stage', '7;...', or contain 'Final Stage')
  const st = lead.status || '';
  const isStage07 = st.startsWith('07') || st.startsWith('7;') || st.toLowerCase().includes('final stage');
  if (!isStage07) {
    throw new Error('"Transfer to Party Master" is only allowed for leads in 07 - Final Stage');
  }

  // 2. Check duplicate party by mobile or GSTIN
  const { data: existingParties } = await adminClient
    .from('party_master')
    .select('id, party_universal_code, firm_name, primary_mobile, workflow_status, party_status')
    .eq('primary_mobile', lead.phone)
    .limit(1);

  let party;
  let transferType = 'NEW_PARTY_DRAFT';

  if (existingParties && existingParties.length > 0) {
    party = existingParties[0];
    transferType = 'LINK_EXISTING_PARTY';
    await adminClient
      .from('party_master')
      .update({
        workflow_status: party.workflow_status || 'S00_TRANSFERRED',
        party_status: party.party_status || 'Pending Confirmation',
        source_lead_id: lead.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', party.id);
  } else {
    // 3. Create New Party Draft via Lead Mapping Builder
    party = await createPartyMaster({
      firm_name: lead.company || lead.name || 'Draft Party',
      legal_name: lead.company || lead.name,
      primary_mobile: lead.phone,
      official_email: lead.email,
      source_lead_id: lead.id,
      acquisition_source: lead.source || 'CRM_LEAD',
      workflow_status: 'S00_TRANSFERRED',
      party_status: 'Pending Confirmation'
    });
  }

  // 4. Record Lead Party Handoff Log
  const { data: handoff, error: handoffErr } = await adminClient
    .from('lead_party_handoffs')
    .insert([{
      lead_id: lead.id,
      target_party_id: party.id,
      transfer_type: transferType,
      handoff_status: 'PENDING_CONFIRMATION',
      transferred_by: userId || null
    }])
    .select()
    .single();

  if (handoffErr) {
    console.warn('lead_party_handoffs insert notice:', handoffErr.message);
  }

  // 5. Update lead note without deleting lead
  try {
    await adminClient.from('lead_notes').insert([{
      lead_id: lead.id,
      note_text: `Lead transferred to Party Master S00 (${party.party_universal_code || party.id} - ${party.firm_name}). Lead preserved in Stage 07.`,
      created_by: 'System Handoff'
    }]);
  } catch (noteErr) {
    console.warn('Note insert warning:', noteErr.message);
  }

  return {
    success: true,
    partyCode: party.party_universal_code,
    partyId: party.id,
    transferType,
    handoffId: handoff?.id || null
  };
}

/**
 * Fetch all leads transferred to Party Master (S00)
 */
export async function getTransferredLeads() {
  const adminClient = getAdminClient();
  try {
    const { data: handoffs, error: hErr } = await adminClient
      .from('lead_party_handoffs')
      .select('*')
      .order('created_at', { ascending: false });

    if (hErr) {
      console.warn('Could not query lead_party_handoffs:', hErr.message);
      // Fallback: Query parties directly where source_lead_id is not null
      const { data: partiesFallback } = await adminClient
        .from('party_master')
        .select('*')
        .not('source_lead_id', 'is', null)
        .order('created_at', { ascending: false });

      if (!partiesFallback || partiesFallback.length === 0) return [];

      const leadIds = partiesFallback.map(p => p.source_lead_id).filter(Boolean);
      const { data: leadsData } = await adminClient
        .from('leads')
        .select('id, name, company, phone, email, status, source, city, state, created_at')
        .in('id', leadIds);

      const leadMap = new Map((leadsData || []).map(l => [l.id, l]));

      return partiesFallback.map(p => {
        const lead = leadMap.get(p.source_lead_id) || {};
        return {
          id: p.id,
          handoff_id: null,
          party_id: p.id,
          party_universal_code: p.party_universal_code,
          firm_name: p.firm_name || lead.company || lead.name,
          legal_name: p.legal_name || lead.name,
          lead_id: lead.id,
          lead_name: lead.name,
          company: lead.company,
          phone: lead.phone || p.primary_mobile,
          email: lead.email || p.official_email,
          lead_status: lead.status || '07 - Final Stage',
          lead_source: lead.source || p.acquisition_source,
          city: lead.city,
          state: lead.state || p.state_name,
          handoff_status: p.party_status === 'Pending Confirmation' ? 'PENDING_CONFIRMATION' : 'CONFIRMED',
          created_at: p.created_at,
          workflow_status: p.workflow_status
        };
      });
    }

    const handoffList = handoffs || [];
    if (handoffList.length === 0) {
      // Check if any parties have source_lead_id
      const { data: partiesFallback } = await adminClient
        .from('party_master')
        .select('*')
        .not('source_lead_id', 'is', null)
        .order('created_at', { ascending: false });

      if (!partiesFallback || partiesFallback.length === 0) return [];

      const leadIds = partiesFallback.map(p => p.source_lead_id).filter(Boolean);
      const { data: leadsData } = await adminClient
        .from('leads')
        .select('id, name, company, phone, email, status, source, city, state, created_at')
        .in('id', leadIds);

      const leadMap = new Map((leadsData || []).map(l => [l.id, l]));

      return partiesFallback.map(p => {
        const lead = leadMap.get(p.source_lead_id) || {};
        return {
          id: p.id,
          handoff_id: null,
          party_id: p.id,
          party_universal_code: p.party_universal_code,
          firm_name: p.firm_name || lead.company || lead.name,
          legal_name: p.legal_name || lead.name,
          party_type: p.party_type || 'Dealer',
          lead_id: lead.id,
          lead_name: lead.name,
          company: lead.company,
          phone: lead.phone || p.primary_mobile,
          email: lead.email || p.official_email,
          lead_status: lead.status || '07 - Final Stage',
          lead_source: lead.source || p.acquisition_source,
          city: lead.city,
          state: lead.state || p.state_name,
          handoff_status: p.party_status === 'Pending Confirmation' ? 'PENDING_CONFIRMATION' : 'CONFIRMED',
          created_at: p.created_at,
          workflow_status: p.workflow_status
        };
      });
    }

    const leadIds = [...new Set(handoffList.map(h => h.lead_id).filter(Boolean))];
    const partyIds = [...new Set(handoffList.map(h => h.target_party_id).filter(Boolean))];

    const [{ data: leads }, { data: parties }] = await Promise.all([
      leadIds.length > 0
        ? adminClient.from('leads').select('id, name, company, phone, email, status, source, city, state, created_at').in('id', leadIds)
        : { data: [] },
      partyIds.length > 0
        ? adminClient.from('party_master').select('id, party_universal_code, firm_name, legal_name, party_type, workflow_status, party_status, created_at').in('id', partyIds)
        : { data: [] }
    ]);

    const leadMap = new Map((leads || []).map(l => [l.id, l]));
    const partyMap = new Map((parties || []).map(p => [p.id, p]));

    return handoffList.map(h => {
      const lead = leadMap.get(h.lead_id) || {};
      const party = partyMap.get(h.target_party_id) || {};
      return {
        id: h.id,
        handoff_id: h.id,
        lead_id: h.lead_id,
        party_id: h.target_party_id,
        party_universal_code: party.party_universal_code,
        firm_name: party.firm_name || lead.company || lead.name || 'Channel Partner',
        legal_name: party.legal_name || lead.name,
        party_type: party.party_type || 'Dealer',
        lead_name: lead.name,
        company: lead.company,
        phone: lead.phone,
        email: lead.email,
        lead_status: lead.status || '07 - Final Stage',
        lead_source: lead.source,
        city: lead.city,
        state: lead.state,
        handoff_status: h.handoff_status || (party.party_status === 'Pending Confirmation' ? 'PENDING_CONFIRMATION' : 'CONFIRMED'),
        transfer_type: h.transfer_type,
        created_at: h.created_at,
        workflow_status: party.workflow_status || 'S00_TRANSFERRED'
      };
    });
  } catch (err) {
    console.error('getTransferredLeads error:', err);
    return [];
  }
}

/**
 * Confirm transferred lead in S00 and advance to S01
 */
export async function confirmLeadTransfer(handoffId, partyId, userId) {
  const adminClient = getAdminClient();

  // 1. Update handoff status
  if (handoffId) {
    await adminClient
      .from('lead_party_handoffs')
      .update({
        handoff_status: 'CONFIRMED',
        verified_by: userId || null,
        verified_at: new Date().toISOString()
      })
      .eq('id', handoffId);
  }

  // 2. Update party_master status
  if (partyId) {
    const { data: updatedParty, error } = await adminClient
      .from('party_master')
      .update({
        party_status: 'Draft',
        workflow_status: 'S01_Party_Master',
        next_step: 'S01_Party_Master',
        updated_at: new Date().toISOString()
      })
      .eq('id', partyId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { success: true, party: updatedParty };
  }

  return { success: true };
}
