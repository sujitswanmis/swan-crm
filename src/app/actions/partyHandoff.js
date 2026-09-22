'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createPartyMaster, updatePartyMeta } from './partyMaster';

function parsePartyMeta(businessNature) {
  if (!businessNature || typeof businessNature !== 'string') return {};
  if (businessNature.startsWith('SWAN_PARTY_META:')) {
    try {
      return JSON.parse(businessNature.slice('SWAN_PARTY_META:'.length));
    } catch {
      return {};
    }
  }
  return {};
}

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

  // Verify Stage 07 / S08 / Final Stage or status containing transfer / party master
  const st = lead.status || '';
  const isStageAllowed = 
    st.startsWith('07') || 
    st.startsWith('7;') || 
    st.startsWith('08') || 
    st.startsWith('8;') || 
    st.toLowerCase().includes('final stage') || 
    st.toLowerCase().includes('party master') || 
    st.toLowerCase().includes('transfer');
  if (!isStageAllowed) {
    throw new Error('"Transfer to Party Master" is only allowed for leads in Final Stage or with status "Transfer to Party Master"');
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
    our_company: lead.our_company || 'NSMLR',
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
    party_status: 'Draft_From_Lead',
    onboarding_stage: 'S00_Party_Entry',

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
    contact_alt_email_2_1: lead.cp2_email_1 || null,

    // Contact person 3
    contact_person_name_3: lead.cp3_name || null,
    contact_mobile_3_1: lead.cp3_mobile_1 || null,
    contact_mobile_3_2: lead.cp3_mobile_2 || null,
    contact_alt_mobile_3_1: lead.cp3_alt_1 || null,
    contact_alt_mobile_3_2: lead.cp3_alt_2 || null,
    contact_email_3_1: lead.cp3_email_1 || null,
    contact_email_3_2: lead.cp3_email_2 || null,
    contact_alt_email_3_1: lead.cp3_email_2 || null
  };

  let party;
  let transferType = 'NEW_PARTY_DRAFT';

  if (existingParties && existingParties.length > 0) {
    party = existingParties[0];
    transferType = 'LINK_EXISTING_PARTY';

    await adminClient
      .from('party_master')
      .update({
        source_lead_id: lead.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', party.id);

    try {
      await updatePartyMeta(adminClient, party.id, {
        our_company: lead.our_company || 'NSMLR'
      });
    } catch (e) {
      console.warn('updatePartyMeta notice for existing party:', e.message);
    }
  } else {
    // 3. Create New Party Draft with all lead fields
    party = await createPartyMaster(partyMasterPayload);
  }

  // 4. Record Lead Party Handoff Log (prevent duplicates)
  let handoffId = null;
  const { data: existingHandoffs } = await adminClient
    .from('lead_party_handoffs')
    .select('id')
    .eq('lead_id', lead.id)
    .limit(1);

  if (existingHandoffs && existingHandoffs.length > 0) {
    handoffId = existingHandoffs[0].id;
    await adminClient
      .from('lead_party_handoffs')
      .update({
        target_party_id: party.id,
        transfer_type: transferType,
        transferred_by: userId || null,
        transferred_at: new Date().toISOString()
      })
      .eq('id', handoffId);
  } else {
    const { data: handoff, error: handoffErr } = await adminClient
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

    if (handoffErr) {
      console.warn('lead_party_handoffs insert notice:', handoffErr.message);
    } else if (handoff) {
      handoffId = handoff.id;
    }
  }

  // 5. Move lead status to Stage 08 (Frozen in Lead Data)
  const frozenStatus = '8;02>Transfer to Party>Transferred to Party Master';
  try {
    await adminClient
      .from('leads')
      .update({
        status: frozenStatus,
        last_status: lead.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id);
  } catch (stErr) {
    console.warn('Lead status update warning in handoff:', stErr.message);
  }

  // 6. Update lead note without deleting lead
  try {
    await adminClient.from('lead_notes').insert([{
      lead_id: lead.id,
      note_text: `Lead transferred to Party Master S00 (${party.party_universal_code || party.id} - ${party.firm_name}). Moved to 08 - Transfer to Party (Sales status locked, profile editable).`,
      created_by: 'System Handoff'
    }]);
  } catch (noteErr) {
    console.warn('Note insert warning:', noteErr.message);
  }

  return {
    success: true,
    partyCode: party.party_universal_code,
    partyId: party.id,
    newStatus: frozenStatus,
    transferType,
    handoffId
  };
}

/**
 * Fetch all leads transferred to Party Master (S00)
 */
export async function getTransferredLeads() {
  const adminClient = getAdminClient();
  try {
    // 0. Auto-Heal: Ensure any leads marked "Transfer to Party Master" in leads table are recorded in handoffs
    try {
      const { data: markedLeads } = await adminClient
        .from('leads')
        .select('id')
        .ilike('status', '%transfer to party master%')
        .limit(50);

      if (markedLeads && markedLeads.length > 0) {
        const { data: existingHandoffs } = await adminClient
          .from('lead_party_handoffs')
          .select('lead_id')
          .in('lead_id', markedLeads.map(l => l.id));

        const existingSet = new Set((existingHandoffs || []).map(h => h.lead_id));
        const missingLeads = markedLeads.filter(l => !existingSet.has(l.id));

        for (const m of missingLeads) {
          try {
            await sendLeadToParty(m.id, null);
          } catch (autoErr) {
            console.warn('Auto-heal sendLeadToParty notice:', autoErr.message);
          }
        }
      }
    } catch (healErr) {
      console.warn('Auto-heal check warning:', healErr.message);
    }

    const { data: handoffs, error: hErr } = await adminClient
      .from('lead_party_handoffs')
      .select('*')
      .order('transferred_at', { ascending: false });

    if (hErr) {
      console.warn('Could not query lead_party_handoffs:', hErr.message);
    }

    const handoffList = handoffs || [];

    if (handoffList.length > 0) {
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
        const isConfirmed = h.handoff_status === 'APPROVED' || h.handoff_status === 'ACTIVATED' || (party.party_status && party.party_status !== 'Draft_From_Lead');

        const partyMeta = parsePartyMeta(party.business_nature);
        const rawComp = lead.our_company || party.our_company || partyMeta.our_company || 'NSMLR';
        const effectiveCompany = rawComp === 'NSTLP' ? 'NSTL' : rawComp;

        return {
          id: h.id,
          handoff_id: h.id,
          lead_id: h.lead_id,
          lead_universal_id: lead.lead_ref_id || (lead.id ? `LD-${lead.id.slice(-6)}` : 'LEAD'),
          party_id: h.target_party_id,
          party_universal_code: party.party_universal_code,
          our_company: effectiveCompany,
          firm_name: party.firm_name || lead.company || lead.name || 'Channel Partner',
          legal_name: party.legal_name || lead.company || lead.name,
          party_type: lead.business_type?.toLowerCase().includes('distributor') ? 'Distributor' : lead.business_type?.toLowerCase().includes('sub') ? 'Sub-Dealer' : 'Dealer',
          contact_person: lead.name || party.firm_name,
          lead_name: lead.name,
          company: lead.company,
          phone: lead.phone || party.primary_mobile,
          primary_mobile: lead.phone || party.primary_mobile,
          email: lead.email || party.official_email,
          lead_status: lead.status || '08 - Transfer to Party',
          lead_source: lead.source,
          city: lead.city_name || lead.city || '',
          state: lead.state_name || lead.state || 'Punjab',
          state_name: lead.state_name || lead.state || 'Punjab',
          district_name: lead.district_name || lead.district || '',
          order_category: lead.requirement || 'Rotavator',
          handoff_status: isConfirmed ? 'CONFIRMED' : 'PENDING_CONFIRMATION',
          transfer_status: isConfirmed ? 'CONFIRMED' : 'PENDING_CONFIRMATION',
          transfer_type: h.transfer_type,
          handoff_at: h.transferred_at,
          created_at: h.transferred_at,
          workflow_status: isConfirmed ? 'S01_Approved' : 'S00_TRANSFERRED',
          lead: lead
        };
      });
    }

    // Fallback: Query party_master directly where source_lead_id is present
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
      const isConfirmed = p.party_status !== 'Draft_From_Lead';
      const partyMeta = parsePartyMeta(p.business_nature);
      const rawComp = lead.our_company || p.our_company || partyMeta.our_company || 'NSMLR';
      const effectiveCompany = rawComp === 'NSTLP' ? 'NSTL' : rawComp;

      return {
        id: p.id,
        handoff_id: p.id,
        party_id: p.id,
        lead_universal_id: lead.lead_ref_id || (lead.id ? `LD-${lead.id.slice(-6)}` : 'LEAD'),
        party_universal_code: p.party_universal_code,
        our_company: effectiveCompany,
        firm_name: p.firm_name || lead.company || lead.name,
        legal_name: p.legal_name || lead.name,
        party_type: lead.business_type?.toLowerCase().includes('distributor') ? 'Distributor' : lead.business_type?.toLowerCase().includes('sub') ? 'Sub-Dealer' : 'Dealer',
        lead_id: lead.id,
        lead_name: lead.name,
        company: lead.company,
        contact_person: lead.name || p.firm_name,
        phone: lead.phone || p.primary_mobile,
        primary_mobile: lead.phone || p.primary_mobile,
        email: lead.email || p.official_email,
        lead_status: lead.status || '08 - Transfer to Party',
        lead_source: lead.source || p.acquisition_source,
        city: lead.city_name || lead.city || '',
        state: lead.state_name || lead.state || 'Punjab',
        state_name: lead.state_name || lead.state || 'Punjab',
        district_name: lead.district_name || lead.district || '',
        order_category: lead.requirement || 'Rotavator',
        handoff_status: isConfirmed ? 'CONFIRMED' : 'PENDING_CONFIRMATION',
        transfer_status: isConfirmed ? 'CONFIRMED' : 'PENDING_CONFIRMATION',
        handoff_at: p.created_at,
        created_at: p.created_at,
        workflow_status: isConfirmed ? 'S01_Approved' : 'S00_TRANSFERRED',
        lead: lead
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
    try {
      await adminClient
        .from('lead_party_handoffs')
        .update({
          handoff_status: 'APPROVED',
          transferred_by: userId || null
        })
        .eq('id', handoffId);
    } catch (e) {
      console.warn('Could not update lead_party_handoffs:', e.message);
    }
  }

  // 2. Update party_master status
  if (partyId) {
    const { data: updatedParty, error } = await adminClient
      .from('party_master')
      .update({
        party_status: 'Draft',
        onboarding_stage: 'S01_Registration',
        updated_at: new Date().toISOString()
      })
      .eq('id', partyId)
      .select()
      .single();

    if (error) {
      console.warn('party_master update warning:', error.message);
    }
    return { success: true, party: updatedParty };
  }

  return { success: true };
}
