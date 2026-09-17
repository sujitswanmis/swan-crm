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
  let existingParties = null;
  if (lead.phone) {
    const { data: byPhone } = await adminClient
      .from('party_master')
      .select('*')
      .eq('primary_mobile', lead.phone)
      .limit(1);
    if (byPhone && byPhone.length > 0) existingParties = byPhone;
  }
  if (!existingParties && (lead.business_gst || lead.gstin)) {
    const gst = lead.business_gst || lead.gstin;
    const { data: byGst } = await adminClient
      .from('party_master')
      .select('*')
      .eq('gstin', gst)
      .limit(1);
    if (byGst && byGst.length > 0) existingParties = byGst;
  }

  const leadFirmName = lead.company || lead.name || 'Draft Party';
  const leadLegalName = lead.company || lead.name;
  const leadPrimaryPhone = lead.phone || lead.business_contact_1 || '0000000000';
  const leadEmail = lead.email || lead.business_email_1 || null;

  // Determine party tier from lead business_type
  let pType = 'Dealer';
  const bType = (lead.business_type || '').toLowerCase();
  if (bType.includes('distributor')) {
    pType = 'Distributor';
  } else if (bType.includes('sub-dealer') || bType.includes('sub dealer')) {
    pType = 'Sub-Dealer';
  }

  const partyMasterPayload = {
    firm_name: leadFirmName,
    legal_name: leadLegalName,
    party_type: pType,
    primary_mobile: leadPrimaryPhone,
    official_email: leadEmail,
    gstin: lead.business_gst || lead.gstin || lead.gst_no || null,
    pan: lead.pan || lead.pan_no || null,
    address: lead.address || null,
    state_name: lead.state_name || lead.state || 'Punjab',
    district_name: lead.district_name || lead.district || null,
    tehsil: lead.tehsil_name || lead.tehsil || null,
    block_name: lead.block_name || null,
    city_village: lead.city_name || lead.city || null,
    pincode: lead.pin_code || lead.pincode || null,
    order_category: lead.requirement || 'Rotavator',
    product_interest: lead.requirement || null,
    owner_name: lead.name || leadFirmName,
    contact_person: lead.name || null,
    source_lead_id: lead.id,
    acquisition_source: lead.source || 'CRM_LEAD',
    workflow_status: 'S00_TRANSFERRED',
    party_status: 'Pending Confirmation',

    // Business contacts
    biz_contact_no_1: lead.business_contact_1 || lead.phone || null,
    biz_contact_no_2: lead.business_contact_2 || null,
    biz_alt_no_1: lead.business_alt_1 || null,
    biz_alt_no_2: lead.business_alt_2 || null,
    biz_email_1: lead.business_email_1 || lead.email || null,
    biz_email_2: lead.business_email_2 || null,
    biz_alt_email_1: lead.business_alt_email_1 || null,
    biz_alt_email_2: lead.business_alt_email_2 || null,

    // Contact person 1
    contact_person_name_1: lead.name || lead.cp1_name || null,
    contact_mobile_1_1: lead.phone || lead.cp1_mobile_1 || null,
    contact_mobile_1_2: lead.cp1_mobile_2 || null,
    contact_alt_mobile_1_1: lead.cp1_alt_1 || null,
    contact_alt_mobile_1_2: lead.cp1_alt_2 || null,
    contact_email_1_2: lead.cp1_email_2 || lead.email || null,
    contact_alt_email_1_1: lead.cp1_alt_1 || null,

    // Contact person 2
    contact_person_name_2: lead.cp2_name || null,
    contact_mobile_2_1: lead.cp2_mobile_1 || null,
    contact_mobile_2_2: lead.cp2_mobile_2 || null,
    contact_alt_mobile_2_1: lead.cp2_alt_1 || null,
    contact_alt_mobile_2_2: lead.cp2_alt_2 || null,
    contact_email_2_2: lead.cp2_email_2 || null,
    contact_alt_email_2_1: lead.cp2_email_1 || null
  };

  let party;
  let transferType = 'NEW_PARTY_DRAFT';

  if (existingParties && existingParties.length > 0) {
    party = existingParties[0];
    transferType = 'LINK_EXISTING_PARTY';

    // Enrich existing party with lead data for any fields that are empty
    const enrichUpdates = {
      workflow_status: party.workflow_status || 'S00_TRANSFERRED',
      party_status: party.party_status || 'Pending Confirmation',
      source_lead_id: lead.id,
      updated_at: new Date().toISOString()
    };

    const enrichKeys = [
      'firm_name', 'legal_name', 'gstin', 'pan', 'address', 'state_name', 'district_name',
      'tehsil', 'block_name', 'city_village', 'pincode', 'order_category', 'product_interest',
      'biz_contact_no_1', 'biz_contact_no_2', 'biz_alt_no_1', 'biz_alt_no_2',
      'biz_email_1', 'biz_email_2', 'biz_alt_email_1', 'biz_alt_email_2',
      'contact_person_name_1', 'contact_mobile_1_1', 'contact_mobile_1_2',
      'contact_alt_mobile_1_1', 'contact_alt_mobile_1_2', 'contact_email_1_2', 'contact_alt_email_1_1',
      'contact_person_name_2', 'contact_mobile_2_1', 'contact_mobile_2_2',
      'contact_alt_mobile_2_1', 'contact_alt_mobile_2_2', 'contact_email_2_2', 'contact_alt_email_2_1'
    ];

    for (const key of enrichKeys) {
      if (!party[key] && partyMasterPayload[key]) {
        enrichUpdates[key] = partyMasterPayload[key];
      }
    }

    const { data: updatedP } = await adminClient
      .from('party_master')
      .update(enrichUpdates)
      .eq('id', party.id)
      .select()
      .single();

    if (updatedP) party = updatedP;
  } else {
    // 3. Create New Party Draft with all lead fields
    party = await createPartyMaster(partyMasterPayload);
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
        .select('*')
        .in('id', leadIds);

      const leadMap = new Map((leadsData || []).map(l => [l.id, l]));

      return partiesFallback.map(p => {
        const lead = leadMap.get(p.source_lead_id) || {};
        const isConfirmed = p.party_status !== 'Pending Confirmation' && p.workflow_status !== 'S00_TRANSFERRED';
        return {
          id: p.id,
          handoff_id: p.id,
          party_id: p.id,
          lead_universal_id: lead.lead_ref_id || (lead.id ? `LD-${lead.id.slice(-6)}` : 'LEAD'),
          party_universal_code: p.party_universal_code,
          firm_name: p.firm_name || lead.company || lead.name,
          legal_name: p.legal_name || lead.name,
          party_type: p.party_type || 'Dealer',
          lead_id: lead.id,
          lead_name: lead.name,
          company: lead.company,
          contact_person: p.contact_person_name_1 || p.contact_person || lead.name,
          phone: p.biz_contact_no_1 || p.primary_mobile || lead.phone,
          primary_mobile: p.biz_contact_no_1 || p.primary_mobile || lead.phone,
          email: p.biz_email_1 || p.official_email || lead.email,
          lead_status: lead.status || '07 - Final Stage',
          lead_source: lead.source || p.acquisition_source,
          city: p.city_village || lead.city_name || lead.city,
          state: p.state_name || lead.state_name || lead.state,
          state_name: p.state_name || lead.state_name || lead.state,
          district_name: p.district_name || lead.district_name || lead.district,
          order_category: p.order_category || lead.requirement || 'Rotavator',
          handoff_status: isConfirmed ? 'CONFIRMED' : 'PENDING_CONFIRMATION',
          transfer_status: isConfirmed ? 'CONFIRMED' : 'PENDING_CONFIRMATION',
          handoff_at: p.created_at,
          created_at: p.created_at,
          workflow_status: p.workflow_status
        };
      });
    }

    const leadIds = [...new Set(handoffList.map(h => h.lead_id).filter(Boolean))];
    const partyIds = [...new Set(handoffList.map(h => h.target_party_id).filter(Boolean))];

    const [{ data: leads }, { data: parties }] = await Promise.all([
      leadIds.length > 0
        ? adminClient.from('leads').select('*').in('id', leadIds)
        : { data: [] },
      partyIds.length > 0
        ? adminClient.from('party_master').select('*').in('id', partyIds)
        : { data: [] }
    ]);

    const leadMap = new Map((leads || []).map(l => [l.id, l]));
    const partyMap = new Map((parties || []).map(p => [p.id, p]));

    return handoffList.map(h => {
      const lead = leadMap.get(h.lead_id) || {};
      const party = partyMap.get(h.target_party_id) || {};
      const isConfirmed = h.handoff_status === 'CONFIRMED' || (party.party_status !== 'Pending Confirmation' && party.workflow_status !== 'S00_TRANSFERRED');
      return {
        id: h.id,
        handoff_id: h.id,
        lead_id: h.lead_id,
        lead_universal_id: lead.lead_ref_id || (lead.id ? `LD-${lead.id.slice(-6)}` : 'LEAD'),
        party_id: h.target_party_id,
        party_universal_code: party.party_universal_code,
        firm_name: party.firm_name || lead.company || lead.name || 'Channel Partner',
        legal_name: party.legal_name || lead.name,
        party_type: party.party_type || 'Dealer',
        contact_person: party.contact_person_name_1 || party.contact_person || lead.name,
        lead_name: lead.name,
        company: lead.company,
        phone: party.biz_contact_no_1 || party.primary_mobile || lead.phone,
        primary_mobile: party.biz_contact_no_1 || party.primary_mobile || lead.phone,
        email: party.biz_email_1 || party.official_email || lead.email,
        lead_status: lead.status || '07 - Final Stage',
        lead_source: lead.source,
        city: party.city_village || lead.city_name || lead.city,
        state: party.state_name || lead.state_name || lead.state,
        state_name: party.state_name || lead.state_name || lead.state,
        district_name: party.district_name || lead.district_name || lead.district,
        order_category: party.order_category || lead.requirement || 'Rotavator',
        handoff_status: h.handoff_status || (isConfirmed ? 'CONFIRMED' : 'PENDING_CONFIRMATION'),
        transfer_status: isConfirmed ? 'CONFIRMED' : 'PENDING_CONFIRMATION',
        transfer_type: h.transfer_type,
        handoff_at: h.transferred_at || h.created_at,
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
