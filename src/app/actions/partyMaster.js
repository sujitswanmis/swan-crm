'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Safe JSON metadata parser & updater for party_master.business_nature
 * Ensures product authorizations, territory, team assignments, and channel links persist in Supabase
 */
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

export async function updatePartyMeta(adminClient, partyId, partialMeta) {
  try {
    const { data: current } = await adminClient
      .from('party_master')
      .select('business_nature')
      .eq('id', partyId)
      .maybeSingle();

    const existing = parsePartyMeta(current?.business_nature);
    const merged = { ...existing, ...partialMeta };
    const serialized = 'SWAN_PARTY_META:' + JSON.stringify(merged);

    await adminClient
      .from('party_master')
      .update({
        business_nature: serialized,
        updated_at: new Date().toISOString()
      })
      .eq('id', partyId);

    return merged;
  } catch (err) {
    console.warn('updatePartyMeta notice:', err.message);
    return partialMeta;
  }
}

/**
 * Fetch complete party list with hierarchy information (R03 Ready)
 */
export async function getPartyList(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  try {
    const { data, error } = await adminClient
      .from('party_master')
      .select('*, party_roles(*), party_contacts(*), party_commercial_terms(*), party_addresses(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching party list:', error);
      return [];
    }

    // Defensive lookup map to resolve parent names if relational joins fail
    const parties = data || [];
    const partyMap = new Map();
    parties.forEach(p => partyMap.set(p.id, p));

    // Fetch related leads for parties originated from leads
    const leadIds = [...new Set(parties.map(p => p.source_lead_id).filter(Boolean))];
    const leadMap = new Map();
    if (leadIds.length > 0) {
      try {
        const { data: leadsData } = await adminClient.from('leads').select('*').in('id', leadIds);
        if (leadsData) {
          leadsData.forEach(l => leadMap.set(l.id, l));
        }
      } catch (lErr) {
        console.warn('Could not fetch leads for party list:', lErr.message);
      }
    }

    // Try to fetch authorizations and territories defensively
    let authMap = {};
    let territoryMap = {};
    let teamMap = {};

    try {
      const [authRes, terrRes, teamRes] = await Promise.all([
        adminClient.from('party_product_authorizations').select('*').eq('tenant_id', tenantId),
        adminClient.from('party_territory_allocations').select('*').eq('tenant_id', tenantId),
        adminClient.from('party_team_assignments').select('*').eq('tenant_id', tenantId)
      ]);

      if (authRes.data) {
        authRes.data.forEach(a => {
          if (!authMap[a.party_id]) authMap[a.party_id] = [];
          authMap[a.party_id].push(a);
        });
      }
      if (terrRes.data) {
        terrRes.data.forEach(t => {
          if (!territoryMap[t.party_id]) territoryMap[t.party_id] = [];
          territoryMap[t.party_id].push(t);
        });
      }
      if (teamRes.data) {
        teamRes.data.forEach(m => {
          if (!teamMap[m.party_id]) teamMap[m.party_id] = [];
          teamMap[m.party_id].push(m);
        });
      }
    } catch (e) {
      console.warn('Optional tables not yet migrated or query failed:', e.message);
    }

    const enrichedData = parties.map(item => {
      const meta = parsePartyMeta(item.business_nature);
      
      const distId = item.parent_distributor_id || meta.parent_distributor_id || null;
      const dealerId = item.parent_dealer_id || meta.parent_dealer_id || null;

      const parentDist = distId ? partyMap.get(distId) : null;
      const parentDealer = dealerId ? partyMap.get(dealerId) : null;
      
      // If subdealer, auto-derive distributor from parent dealer if not directly set
      const effectiveDist = parentDist || (parentDealer?.parent_distributor_id ? partyMap.get(parentDealer.parent_distributor_id) : (parentDealer ? partyMap.get(parsePartyMeta(parentDealer.business_nature).parent_distributor_id) : null));

      const lead = item.source_lead_id ? leadMap.get(item.source_lead_id) : null;
      const roles = item.party_roles || [];
      const contacts = item.party_contacts || [];
      const addresses = item.party_addresses || [];
      const commercialTerms = item.party_commercial_terms || [];
      const primaryComm = commercialTerms[0] || null;

      const primaryRole = roles[0]?.role_type;
      const pType = item.party_type || (primaryRole === 'DISTRIBUTOR' ? 'Distributor' : primaryRole === 'DIRECT_CUSTOMER' ? 'Sub-Dealer' : (lead?.business_type?.toLowerCase().includes('distributor') ? 'Distributor' : lead?.business_type?.toLowerCase().includes('sub') ? 'Sub-Dealer' : 'Dealer'));

      const primaryContact = contacts.find(c => c.is_primary) || contacts[0];
      const primaryAddress = addresses.find(a => a.is_primary) || addresses[0];

      // Merge authorizations, territory, and team from DB tables OR meta fallback
      const prodAuths = (authMap[item.id] && authMap[item.id].length > 0) 
        ? authMap[item.id] 
        : (meta.product_authorizations || []);
      
      const terrAllocs = (territoryMap[item.id] && territoryMap[item.id].length > 0)
        ? territoryMap[item.id]
        : (meta.territory ? [meta.territory] : (meta.territory_allocations || []));

      const teamAssigns = (teamMap[item.id] && teamMap[item.id].length > 0)
        ? teamMap[item.id]
        : (meta.team_assignments || []);

      return {
        ...item,
        lead: lead,
        party_type: pType,
        our_company: item.our_company || meta.our_company || lead?.our_company || 'NSMLR',
        final_status: item.party_status === 'Draft_From_Lead' ? 'Draft' : (item.party_status || 'Draft'),
        workflow_status: item.party_status === 'Draft_From_Lead' ? 'S00_TRANSFERRED' : (item.onboarding_stage || 'S01_Approved'),
        state_name: item.state_name || primaryAddress?.state_name || lead?.state_name || lead?.state || 'Punjab',
        district_name: item.district_name || primaryAddress?.district_name || lead?.district_name || lead?.district || '',
        address: item.address || primaryAddress?.address_line_1 || lead?.address || '',
        pincode: item.pincode || primaryAddress?.pincode || lead?.pin_code || lead?.pincode || '',
        tehsil: item.tehsil || lead?.tehsil_name || lead?.tehsil || '',
        block_name: item.block_name || lead?.block_name || '',
        city_village: item.city_village || lead?.city_name || lead?.city || '',
        order_category: item.order_category || lead?.requirement || 'Rotavator',
        biz_contact_no_1: item.biz_contact_no_1 || meta.biz_contact_no_1 || lead?.business_contact_1 || item.primary_mobile || '',
        biz_contact_no_2: item.biz_contact_no_2 || meta.biz_contact_no_2 || lead?.business_contact_2 || '',
        biz_alt_no_1: item.biz_alt_no_1 || meta.biz_alt_no_1 || lead?.business_alt_1 || '',
        biz_alt_no_2: item.biz_alt_no_2 || meta.biz_alt_no_2 || lead?.business_alt_2 || '',
        biz_email_1: item.biz_email_1 || meta.biz_email_1 || lead?.business_email_1 || item.official_email || '',
        biz_email_2: item.biz_email_2 || meta.biz_email_2 || lead?.business_email_2 || '',
        biz_alt_email_1: item.biz_alt_email_1 || meta.biz_alt_email_1 || lead?.business_alt_email_1 || '',
        biz_alt_email_2: item.biz_alt_email_2 || meta.biz_alt_email_2 || lead?.business_alt_email_2 || '',
        contact_person_name_1: item.contact_person_name_1 || meta.contact_person_name_1 || primaryContact?.contact_name || lead?.name || lead?.cp1_name || item.firm_name,
        contact_mobile_1_1: item.contact_mobile_1_1 || meta.contact_mobile_1_1 || primaryContact?.primary_mobile || lead?.phone || lead?.cp1_mobile_1 || item.primary_mobile,
        contact_mobile_1_2: item.contact_mobile_1_2 || meta.contact_mobile_1_2 || lead?.cp1_mobile_2 || '',
        contact_alt_mobile_1_1: item.contact_alt_mobile_1_1 || meta.contact_alt_mobile_1_1 || lead?.cp1_alt_1 || '',
        contact_alt_mobile_1_2: item.contact_alt_mobile_1_2 || meta.contact_alt_mobile_1_2 || lead?.cp1_alt_2 || '',
        contact_email_1_2: item.contact_email_1_2 || meta.contact_email_1_2 || lead?.cp1_email_2 || lead?.email || '',
        contact_alt_email_1_1: item.contact_alt_email_1_1 || meta.contact_alt_email_1_1 || lead?.cp1_alt_1 || '',
        contact_person_name_2: item.contact_person_name_2 || meta.contact_person_name_2 || lead?.cp2_name || '',
        contact_mobile_2_1: item.contact_mobile_2_1 || meta.contact_mobile_2_1 || lead?.cp2_mobile_1 || '',
        contact_mobile_2_2: item.contact_mobile_2_2 || meta.contact_mobile_2_2 || lead?.cp2_mobile_2 || '',
        contact_alt_mobile_2_1: item.contact_alt_mobile_2_1 || meta.contact_alt_mobile_2_1 || lead?.cp2_alt_1 || '',
        contact_alt_mobile_2_2: item.contact_alt_mobile_2_2 || meta.contact_alt_mobile_2_2 || lead?.cp2_alt_2 || '',
        contact_email_2_2: item.contact_email_2_2 || meta.contact_email_2_2 || lead?.cp2_email_2 || '',
        contact_alt_email_2_1: item.contact_alt_email_2_1 || meta.contact_alt_email_2_1 || lead?.cp2_email_1 || '',
        contact_person_name_3: item.contact_person_name_3 || meta.contact_person_name_3 || lead?.cp3_name || '',
        contact_mobile_3_1: item.contact_mobile_3_1 || meta.contact_mobile_3_1 || lead?.cp3_mobile_1 || '',
        contact_mobile_3_2: item.contact_mobile_3_2 || meta.contact_mobile_3_2 || lead?.cp3_mobile_2 || '',
        contact_alt_mobile_3_1: item.contact_alt_mobile_3_1 || meta.contact_alt_mobile_3_1 || lead?.cp3_alt_1 || '',
        contact_alt_mobile_3_2: item.contact_alt_mobile_3_2 || meta.contact_alt_mobile_3_2 || lead?.cp3_alt_2 || '',
        contact_email_3_1: item.contact_email_3_1 || meta.contact_email_3_1 || lead?.cp3_email_1 || '',
        contact_email_3_2: item.contact_email_3_2 || meta.contact_email_3_2 || lead?.cp3_email_2 || '',
        contact_alt_email_3_1: item.contact_alt_email_3_1 || meta.contact_alt_email_3_1 || lead?.cp3_email_2 || '',
        gstin: item.gstin && item.gstin.includes('Error creating party') ? '' : (item.gstin || lead?.business_gst || ''),
        pan: item.pan || lead?.pan || '',
        parent_distributor_id: distId,
        parent_dealer_id: dealerId,
        parent_distributor_name: effectiveDist?.firm_name || null,
        parent_dealer_name: parentDealer?.firm_name || null,
        parent_distributor: effectiveDist ? {
          id: effectiveDist.id,
          party_universal_code: effectiveDist.party_universal_code,
          distributor_code: effectiveDist.distributor_code || effectiveDist.party_universal_code,
          firm_name: effectiveDist.firm_name
        } : null,
        parent_dealer: parentDealer ? {
          id: parentDealer.id,
          party_universal_code: parentDealer.party_universal_code,
          dealer_code: parentDealer.dealer_code || parentDealer.party_universal_code,
          firm_name: parentDealer.firm_name
        } : null,
        zone: item.zone || meta.zone || (terrAllocs[0]?.zone) || null,
        dealership_type: item.dealership_type || meta.dealership_type || 'EXCLUSIVE_SWAN',
        showroom_area_sqft: item.showroom_area_sqft || meta.showroom_area_sqft || 2500,
        billing_route_type: item.billing_route_type || meta.billing_route_type || 'DIRECT_COMPANY_BILLING',
        commercial_status: item.commercial_status || meta.commercial_status || (commercialTerms.length > 0 ? 'Completed' : null),
        security_deposit_amount: item.security_deposit_amount ?? primaryComm?.security_deposit_amount ?? meta.security_deposit_amount ?? 0,
        credit_limit: item.credit_limit ?? primaryComm?.credit_limit ?? meta.credit_limit ?? 0,
        credit_days: item.credit_days ?? primaryComm?.credit_days ?? meta.credit_days ?? 30,
        product_category: (prodAuths[0]?.product_category) || item.product_category || meta.product_category || null,
        product_authorizations: prodAuths,
        territory_allocations: terrAllocs,
        team_assignments: teamAssigns,
        meta_stages: meta.stages || {},
        meta: meta
      };
    });

    return enrichedData;
  } catch (err) {
    console.error('Critical failure in getPartyList:', err);
    return [];
  }
}

/**
 * Helper to generate atomic channel codes
 */
async function generateChannelCode(adminClient, partyType) {
  const ts = Date.now().toString().slice(-6);
  try {
    if (partyType === 'Distributor') {
      const { data } = await adminClient.rpc('generate_atomic_distributor_code');
      return data || `DIS-${ts}`;
    } else if (partyType === 'Dealer') {
      const { data } = await adminClient.rpc('generate_atomic_dealer_code');
      return data || `DLR-${ts}`;
    } else if (partyType === 'Sub-Dealer') {
      const { data } = await adminClient.rpc('generate_atomic_sub_dealer_code');
      return data || `SDL-${ts}`;
    }
  } catch (e) {
    // Fallback if RPC does not exist
  }
  return partyType === 'Distributor' ? `DIS-${ts}` : partyType === 'Dealer' ? `DLR-${ts}` : `SDL-${ts}`;
}

const VALID_PARTY_MASTER_COLUMNS = [
  'id', 'tenant_id', 'party_universal_code', 'firm_name', 'legal_name', 'trade_name',
  'constitution_type', 'business_nature', 'gstin', 'pan', 'cin', 'udyam_number',
  'official_email', 'primary_mobile', 'website', 'party_status', 'onboarding_stage',
  'acquisition_source', 'source_lead_id', 'external_sap_code', 'created_by', 'created_at', 'updated_at'
];

const VALID_PARTY_STATUSES = [
  'Draft', 'Draft_From_Lead', 'Verification_Pending', 'Documents_Pending',
  'Commercial_Pending', 'Approval_Pending', 'Approved', 'Active',
  'Hold', 'Inactive', 'Blacklisted', 'Rejected', 'Closed'
];

const VALID_ONBOARDING_STAGES = [
  'S00_Party_Entry', 'S01_Registration', 'S02_Party_Classification',
  'S03_Dealer_Distributor_Mapping', 'S04_KYC_Commercial_Verification',
  'S05_Product_Authorization', 'S06_Territory_Allocation',
  'S07_Employee_Assignment', 'S08_Party_Activation'
];

const VALID_CONSTITUTIONS = [
  'PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED',
  'PUBLIC_LIMITED', 'INDIVIDUAL_FARMER', 'GOVERNMENT_DEPT'
];

/**
 * Create New Party Master (S00) with proper channel codes & relationship tracking
 */
export async function createPartyMaster(partyData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();

  const { primary_contact_name, ...cleanPartyData } = partyData;

  // Generate atomic PTY code
  let partyCode;
  try {
    const { data: codeData } = await adminClient.rpc('generate_atomic_party_code');
    partyCode = codeData || `PTY-${Date.now().toString().slice(-6)}`;
  } catch {
    partyCode = `PTY-${Date.now().toString().slice(-6)}`;
  }

  const partyType = partyData.party_type || partyData.party_category || 'Dealer';
  const channelCode = await generateChannelCode(adminClient, partyType);

  const sanitizedStatus = VALID_PARTY_STATUSES.includes(cleanPartyData.party_status)
    ? cleanPartyData.party_status
    : 'Draft';

  const sanitizedStage = VALID_ONBOARDING_STAGES.includes(cleanPartyData.onboarding_stage)
    ? cleanPartyData.onboarding_stage
    : 'S00_Party_Entry';

  const sanitizedConstitution = VALID_CONSTITUTIONS.includes(cleanPartyData.constitution_type)
    ? cleanPartyData.constitution_type
    : 'PROPRIETORSHIP';

  const dbPayload = {
    tenant_id: tenantId,
    party_universal_code: partyCode,
    firm_name: cleanPartyData.firm_name || cleanPartyData.company || 'Draft Firm',
    legal_name: cleanPartyData.legal_name || cleanPartyData.firm_name || cleanPartyData.company || null,
    trade_name: cleanPartyData.trade_name || null,
    constitution_type: sanitizedConstitution,
    business_nature: cleanPartyData.business_nature || null,
    gstin: cleanPartyData.gstin || cleanPartyData.gst_no || null,
    pan: cleanPartyData.pan || cleanPartyData.pan_no || null,
    cin: cleanPartyData.cin || null,
    udyam_number: cleanPartyData.udyam_number || null,
    official_email: cleanPartyData.official_email || cleanPartyData.biz_email_1 || null,
    primary_mobile: cleanPartyData.primary_mobile || cleanPartyData.biz_contact_no_1 || cleanPartyData.phone || '0000000000',
    website: cleanPartyData.website || null,
    party_status: sanitizedStatus,
    onboarding_stage: sanitizedStage,
    acquisition_source: cleanPartyData.acquisition_source || 'CRM_LEAD',
    source_lead_id: cleanPartyData.source_lead_id || null,
    external_sap_code: cleanPartyData.external_sap_code || null,
    created_by: cleanPartyData.created_by || null
  };

  const { data: party, error } = await adminClient
    .from('party_master')
    .insert([dbPayload])
    .select()
    .single();

  if (error) {
    console.error('Error in createPartyMaster inserting party_master:', error);
    throw new Error(error.message);
  }

  // 1. Insert primary contact into party_contacts if provided
  const contactName = primary_contact_name || cleanPartyData.contact_person_name_1 || cleanPartyData.owner_name || cleanPartyData.contact_person;
  const mobile = cleanPartyData.contact_mobile_1_1 || cleanPartyData.primary_mobile || cleanPartyData.biz_contact_no_1 || cleanPartyData.mobile_no;
  if (contactName || mobile) {
    try {
      await adminClient.from('party_contacts').insert([{
        party_id: party.id,
        contact_name: contactName || party.firm_name,
        primary_mobile: mobile || party.primary_mobile,
        email: cleanPartyData.contact_email_1_2 || cleanPartyData.biz_email_1 || cleanPartyData.official_email || null,
        is_primary: true
      }]);
    } catch (e) {
      console.warn('Could not insert party_contacts:', e.message);
    }
  }

  // 2. Insert address into party_addresses if provided
  const addrLine = cleanPartyData.address || cleanPartyData.address_line_1;
  const stateName = cleanPartyData.state_name || cleanPartyData.state || 'Punjab';
  const distName = cleanPartyData.district_name || cleanPartyData.district || '';
  const pinCode = cleanPartyData.pincode || cleanPartyData.pin_code || '';
  if (addrLine || stateName || distName || pinCode) {
    try {
      await adminClient.from('party_addresses').insert([{
        party_id: party.id,
        address_type: 'REGISTERED',
        address_line_1: addrLine || party.firm_name,
        state_name: stateName,
        district_name: distName,
        pincode: pinCode,
        is_primary: true
      }]);
    } catch (e) {
      console.warn('Could not insert party_addresses:', e.message);
    }
  }

  // 3. Insert role into party_roles
  try {
    const roleType = partyType === 'Distributor' ? 'DISTRIBUTOR' : (partyType === 'Sub-Dealer' ? 'DIRECT_CUSTOMER' : 'DEALER');
    await adminClient.from('party_roles').insert([{
      party_id: party.id,
      role_type: roleType,
      role_code: channelCode,
      status: 'ACTIVE'
    }]);
  } catch (e) {
    console.warn('Could not insert party_roles:', e.message);
  }

  // 4. Initialize commercial terms
  try {
    await adminClient.from('party_commercial_terms').insert([{
      party_id: party.id,
      credit_limit: cleanPartyData.credit_limit || 500000,
      credit_days: cleanPartyData.credit_days || 30
    }]);
  } catch (e) {
    console.warn('Could not insert party_commercial_terms:', e.message);
  }

  // 5. Record initial relationship history if parent is set
  if (party.parent_distributor_id || party.parent_dealer_id) {
    try {
      await adminClient.from('party_relationship_history').insert([{
        tenant_id: tenantId,
        party_id: party.id,
        party_type: partyType,
        parent_type: partyType === 'Dealer' ? 'Distributor' : 'Dealer',
        parent_party_id: partyType === 'Dealer' ? party.parent_distributor_id : party.parent_dealer_id,
        auto_derived_distributor_id: party.parent_distributor_id,
        effective_from: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
        status: 'ACTIVE'
      }]);
    } catch (e) {
      console.warn('Could not insert party_relationship_history:', e.message);
    }
  }

  // 6. Save initial metadata (including CP1, CP2, CP3, our_company, and official channels)
  const initialMeta = {};
  const metaKeys = [
    'our_company',
    'contact_person_name_1', 'contact_mobile_1_1', 'contact_mobile_1_2', 'contact_alt_mobile_1_1', 'contact_alt_mobile_1_2', 'contact_email_1_2', 'contact_alt_email_1_1',
    'contact_person_name_2', 'contact_mobile_2_1', 'contact_mobile_2_2', 'contact_alt_mobile_2_1', 'contact_alt_mobile_2_2', 'contact_email_2_2', 'contact_alt_email_2_1',
    'contact_person_name_3', 'contact_mobile_3_1', 'contact_mobile_3_2', 'contact_alt_mobile_3_1', 'contact_alt_mobile_3_2', 'contact_email_3_1', 'contact_email_3_2', 'contact_alt_email_3_1',
    'biz_contact_no_1', 'biz_contact_no_2', 'biz_alt_no_1', 'biz_alt_no_2', 'biz_email_1', 'biz_email_2', 'biz_alt_email_1', 'biz_alt_email_2',
    'state_name', 'district_name', 'tehsil', 'block_name', 'city_village', 'pincode', 'order_category',
    'parent_distributor_id', 'parent_dealer_id', 'dealership_type', 'showroom_area_sqft', 'billing_route_type'
  ];
  metaKeys.forEach(k => {
    if (cleanPartyData[k] !== undefined && cleanPartyData[k] !== null && cleanPartyData[k] !== '') {
      initialMeta[k] = cleanPartyData[k];
    }
  });
  if (!initialMeta.our_company) {
    initialMeta.our_company = cleanPartyData.our_company || 'NSMLR';
  }
  initialMeta.stages = { s01: true };
  await updatePartyMeta(adminClient, party.id, initialMeta);

  return party;
}

/**
 * Update Party Step Data (S01, S02, S03, S04, S05, S05.1, S06, S07)
 */
export async function updatePartyStep(partyId, stepName, stepData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();

  // Fetch current party to check parent changes
  const { data: currentParty, error: fetchErr } = await adminClient
    .from('party_master')
    .select('*')
    .eq('id', partyId)
    .single();

  if (fetchErr || !currentParty) throw new Error('Party not found');

  // Build sanitized party_master update payload
  const updateFields = {
    updated_at: new Date().toISOString()
  };

  VALID_PARTY_MASTER_COLUMNS.forEach(col => {
    if (stepData[col] !== undefined) {
      updateFields[col] = stepData[col];
    }
  });

  // Map step names to valid onboarding_stage check constraint values
  if (stepName) {
    const stageMapping = {
      'S00_Party_Master': 'S01_Registration',
      'S01_Distributor_Registration': 'S02_Party_Classification',
      'S02_Dealer_Registration': 'S03_Dealer_Distributor_Mapping',
      'S03_Sub_Dealer_Registration': 'S03_Dealer_Distributor_Mapping',
      'S04_Commercial': 'S04_KYC_Commercial_Verification',
      'S05_Product_Territory': 'S05_Product_Authorization',
      'S05_Product_Authorization_Territory': 'S06_Territory_Allocation',
      'S06_Team_Assignment': 'S07_Employee_Assignment',
      'S07_Activation': 'S08_Party_Activation'
    };
    if (stageMapping[stepName]) {
      updateFields.onboarding_stage = stageMapping[stepName];
    }
  }

  // Validate party_status if updating
  if (updateFields.party_status && !VALID_PARTY_STATUSES.includes(updateFields.party_status)) {
    delete updateFields.party_status;
  }

  // Handle parent relationship history preservation for S02 / S03
  if (stepName === 'S02_Dealer_Registration' && stepData.parent_distributor_id) {
    if (currentParty.parent_distributor_id && currentParty.parent_distributor_id !== stepData.parent_distributor_id) {
      const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      try {
        await adminClient
          .from('party_relationship_history')
          .update({ status: 'INACTIVE', effective_to: todayIST })
          .eq('party_id', partyId)
          .eq('status', 'ACTIVE');

        await adminClient.from('party_relationship_history').insert([{
          tenant_id: tenantId,
          party_id: partyId,
          party_type: 'Dealer',
          parent_type: 'Distributor',
          parent_party_id: stepData.parent_distributor_id,
          auto_derived_distributor_id: stepData.parent_distributor_id,
          effective_from: todayIST,
          status: 'ACTIVE',
          transfer_reason: stepData.transfer_reason || 'Distributor changed in S02'
        }]);
      } catch (e) {
        console.warn('Could not update party_relationship_history:', e.message);
      }
    }
  }

  if (stepName === 'S03_Sub_Dealer_Registration' && stepData.parent_dealer_id) {
    if (currentParty.parent_dealer_id && currentParty.parent_dealer_id !== stepData.parent_dealer_id) {
      const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      try {
        await adminClient
          .from('party_relationship_history')
          .update({ status: 'INACTIVE', effective_to: todayIST })
          .eq('party_id', partyId)
          .eq('status', 'ACTIVE');

        await adminClient.from('party_relationship_history').insert([{
          tenant_id: tenantId,
          party_id: partyId,
          party_type: 'Sub-Dealer',
          parent_type: 'Dealer',
          parent_party_id: stepData.parent_dealer_id,
          auto_derived_distributor_id: stepData.parent_distributor_id,
          effective_from: todayIST,
          status: 'ACTIVE',
          transfer_reason: stepData.transfer_reason || 'Dealer changed in S03'
        }]);
      } catch (e) {
        console.warn('Could not update party_relationship_history:', e.message);
      }
    }
  }

  // Update party master record safely
  const { data: updated, error } = await adminClient
    .from('party_master')
    .update(updateFields)
    .eq('id', partyId)
    .select()
    .single();

  if (error) {
    console.error('Error in updatePartyStep updating party_master:', error);
    throw new Error(error.message);
  }

  // 1. Update/insert address into party_addresses
  const addrLine = stepData.address || stepData.address_line_1;
  const stateName = stepData.state_name || stepData.state;
  const distName = stepData.district_name || stepData.district;
  const pinCode = stepData.pincode || stepData.pin_code;
  if (addrLine || stateName || distName || pinCode) {
    try {
      const { data: existingAddrs } = await adminClient
        .from('party_addresses')
        .select('id')
        .eq('party_id', partyId)
        .limit(1);

      const addrPayload = {
        party_id: partyId,
        address_type: 'REGISTERED',
        address_line_1: addrLine || currentParty.firm_name,
        state_name: stateName || 'Punjab',
        district_name: distName || '',
        pincode: pinCode || '',
        is_primary: true
      };

      if (existingAddrs && existingAddrs.length > 0) {
        await adminClient.from('party_addresses').update(addrPayload).eq('id', existingAddrs[0].id);
      } else {
        await adminClient.from('party_addresses').insert([addrPayload]);
      }
    } catch (e) {
      console.warn('Could not upsert party_addresses in updatePartyStep:', e.message);
    }
  }

  // 2. Update/insert contact into party_contacts
  const contactName = stepData.contact_person_name_1 || stepData.contact_person || stepData.owner_name;
  const mobile = stepData.contact_mobile_1_1 || stepData.biz_contact_no_1 || stepData.primary_mobile;
  if (contactName || mobile) {
    try {
      const { data: existingContacts } = await adminClient
        .from('party_contacts')
        .select('id')
        .eq('party_id', partyId)
        .limit(1);

      const contactPayload = {
        party_id: partyId,
        contact_name: contactName || currentParty.firm_name,
        primary_mobile: mobile || currentParty.primary_mobile,
        email: stepData.contact_email_1_2 || stepData.biz_email_1 || stepData.official_email || null,
        is_primary: true
      };

      if (existingContacts && existingContacts.length > 0) {
        await adminClient.from('party_contacts').update(contactPayload).eq('id', existingContacts[0].id);
      } else {
        await adminClient.from('party_contacts').insert([contactPayload]);
      }
    } catch (e) {
      console.warn('Could not upsert party_contacts in updatePartyStep:', e.message);
    }
  }

  // 3. Update party_roles if party_type changed
  if (stepData.party_type) {
    try {
      const roleType = stepData.party_type === 'Distributor' ? 'DISTRIBUTOR' : (stepData.party_type === 'Sub-Dealer' ? 'DIRECT_CUSTOMER' : 'DEALER');
      const { data: existingRoles } = await adminClient
        .from('party_roles')
        .select('id')
        .eq('party_id', partyId)
        .limit(1);

      if (existingRoles && existingRoles.length > 0) {
        await adminClient.from('party_roles').update({ role_type: roleType }).eq('id', existingRoles[0].id);
      } else {
        await adminClient.from('party_roles').insert([{ party_id: partyId, role_type: roleType, status: 'ACTIVE' }]);
      }
    } catch (e) {
      console.warn('Could not update party_roles:', e.message);
    }
  }

  // 4. Update commercial terms
  if (stepName === 'S04_Commercial' || stepData.credit_limit !== undefined || stepData.credit_days !== undefined) {
    try {
      await adminClient
        .from('party_commercial_terms')
        .upsert([{
          party_id: partyId,
          credit_limit: stepData.credit_limit || 0,
          credit_days: stepData.credit_days || 30
        }], { onConflict: 'party_id' });
    } catch (e) {
      console.warn('Could not upsert commercial terms:', e.message);
    }
  }

  // 5. Update party metadata (parent links, zone, route, contacts, stages)
  const metaUpdates = {};
  const contactMetaKeys = [
    'our_company',
    'contact_person_name_1', 'contact_mobile_1_1', 'contact_mobile_1_2', 'contact_alt_mobile_1_1', 'contact_alt_mobile_1_2', 'contact_email_1_2', 'contact_alt_email_1_1',
    'contact_person_name_2', 'contact_mobile_2_1', 'contact_mobile_2_2', 'contact_alt_mobile_2_1', 'contact_alt_mobile_2_2', 'contact_email_2_2', 'contact_alt_email_2_1',
    'contact_person_name_3', 'contact_mobile_3_1', 'contact_mobile_3_2', 'contact_alt_mobile_3_1', 'contact_alt_mobile_3_2', 'contact_email_3_1', 'contact_email_3_2', 'contact_alt_email_3_1',
    'biz_contact_no_1', 'biz_contact_no_2', 'biz_alt_no_1', 'biz_alt_no_2', 'biz_email_1', 'biz_email_2', 'biz_alt_email_1', 'biz_alt_email_2',
    'state_name', 'district_name', 'tehsil', 'block_name', 'city_village', 'pincode', 'order_category'
  ];
  contactMetaKeys.forEach(k => {
    if (stepData[k] !== undefined) metaUpdates[k] = stepData[k];
  });
  if (stepData.our_company !== undefined) metaUpdates.our_company = stepData.our_company;
  if (stepData.parent_distributor_id !== undefined) metaUpdates.parent_distributor_id = stepData.parent_distributor_id;
  if (stepData.parent_dealer_id !== undefined) metaUpdates.parent_dealer_id = stepData.parent_dealer_id;
  if (stepData.dealership_type !== undefined) metaUpdates.dealership_type = stepData.dealership_type;
  if (stepData.showroom_area_sqft !== undefined) metaUpdates.showroom_area_sqft = stepData.showroom_area_sqft;
  if (stepData.billing_route_type !== undefined) metaUpdates.billing_route_type = stepData.billing_route_type;
  if (stepData.commercial_status !== undefined) metaUpdates.commercial_status = stepData.commercial_status;
  if (stepData.credit_limit !== undefined) metaUpdates.credit_limit = stepData.credit_limit;
  if (stepData.credit_days !== undefined) metaUpdates.credit_days = stepData.credit_days;
  if (stepData.security_deposit_amount !== undefined) metaUpdates.security_deposit_amount = stepData.security_deposit_amount;
  if (stepData.zone !== undefined) metaUpdates.zone = stepData.zone;
  if (stepData.product_category !== undefined) metaUpdates.product_category = stepData.product_category;

  if (stepName) {
    const stageKeyMap = {
      'S00_Party_Master': 's01',
      'S01_Distributor_Registration': 's02',
      'S02_Dealer_Registration': 's03',
      'S03_Sub_Dealer_Registration': 's04',
      'S04_Commercial': 's05',
      'S05_Product_Territory': 's06',
      'S05_Product_Authorization_Territory': 's06',
      'S06_Team_Assignment': 's07',
      'S07_Activation': 's08'
    };
    if (stageKeyMap[stepName]) {
      const existingMeta = parsePartyMeta(currentParty.business_nature);
      metaUpdates.stages = { ...(existingMeta.stages || {}), [stageKeyMap[stepName]]: true };
    }
  }

  if (Object.keys(metaUpdates).length > 0) {
    await updatePartyMeta(adminClient, partyId, metaUpdates);
  }

  return updated;
}

/**
 * Save Product Authorizations (S05)
 */
export async function saveProductAuthorizations(partyId, products, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  try {
    // Delete existing and insert new in table if table exists
    await adminClient.from('party_product_authorizations').delete().eq('party_id', partyId);
    
    if (products && products.length > 0) {
      const records = products.map(p => ({
        tenant_id: tenantId,
        party_id: partyId,
        order_category: p.order_category || 'Rotavator',
        product_category: p.product_category || 'Both',
        product_name: p.product_name,
        opening_stock_required: p.opening_stock_required || 0,
        is_authorized: true,
        authorization_status: 'Active',
        effective_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
      }));
      const { error } = await adminClient.from('party_product_authorizations').insert(records);
      if (error) console.warn('party_product_authorizations notice:', error.message);
    }
  } catch (err) {
    console.warn('saveProductAuthorizations fallback:', err.message);
  }

  // Always persist authorisations and stage in party metadata
  await updatePartyMeta(adminClient, partyId, {
    product_authorizations: products || [],
    stages: {
      ...(parsePartyMeta((await adminClient.from('party_master').select('business_nature').eq('id', partyId).maybeSingle()).data?.business_nature).stages || {}),
      s06: true
    }
  });

  return true;
}

/**
 * Save Territory Allocation (S05.1)
 */
export async function saveTerritoryAllocation(partyId, territoryData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  let savedRecord = territoryData;
  try {
    await adminClient.from('party_territory_allocations').delete().eq('party_id', partyId);

    const record = {
      tenant_id: tenantId,
      party_id: partyId,
      zone: territoryData.zone || 'North Zone',
      state: territoryData.state,
      district: territoryData.district,
      tehsil_area: Array.isArray(territoryData.tehsil_area) ? territoryData.tehsil_area.join(', ') : (territoryData.tehsil_area || ''),
      market_coverage_area: Array.isArray(territoryData.market_coverage_area) ? territoryData.market_coverage_area.join(', ') : (territoryData.market_coverage_area || ''),
      territory_type: territoryData.territory_type || 'Exclusive',
      territory_status: 'Active',
      effective_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    };

    const { data, error } = await adminClient.from('party_territory_allocations').insert([record]).select().single();
    if (error) console.warn('party_territory_allocations notice:', error.message);
    if (data) savedRecord = data;
  } catch (err) {
    console.warn('saveTerritoryAllocation fallback:', err.message);
  }

  // Always persist territory in party metadata
  await updatePartyMeta(adminClient, partyId, {
    territory: territoryData,
    zone: territoryData.zone || 'North Zone'
  });

  return savedRecord;
}

/**
 * Save Team Assignments (S06)
 */
export async function saveTeamAssignments(partyId, assignments, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  try {
    await adminClient.from('party_team_assignments').delete().eq('party_id', partyId);

    if (assignments && assignments.length > 0) {
      const records = assignments.map(a => ({
        tenant_id: tenantId,
        party_id: partyId,
        employee_id: a.employee_id,
        employee_name: a.employee_name,
        role_in_party: a.role_in_party,
        assignment_type: a.assignment_type || 'Primary',
        status: 'Active'
      }));
      const { error } = await adminClient.from('party_team_assignments').insert(records);
      if (error) console.warn('party_team_assignments notice:', error.message);
    }
  } catch (err) {
    console.warn('saveTeamAssignments fallback:', err.message);
  }

  // Always persist team assignments and stage in party metadata
  await updatePartyMeta(adminClient, partyId, {
    team_assignments: assignments || [],
    stages: {
      ...(parsePartyMeta((await adminClient.from('party_master').select('business_nature').eq('id', partyId).maybeSingle()).data?.business_nature).stages || {}),
      s07: true
    }
  });

  return true;
}

/**
 * S08 Partner Activation with status options: Active, Inactive, Hold, Payment Issues
 */
export async function activatePartner(partyId, activationStatus = 'Active', remarks = '', tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();

  const details = await getParty360Details(partyId);
  const party = details?.party;
  if (!party) throw new Error('Party not found');

  const validStatuses = ['Active', 'Inactive', 'Hold', 'Payment Issues'];
  const finalStatus = validStatuses.includes(activationStatus) ? activationStatus : 'Active';

  // Map to valid party_status check constraint in DB
  let dbPartyStatus = 'Active';
  if (finalStatus === 'Inactive') dbPartyStatus = 'Inactive';
  else if (finalStatus === 'Hold' || finalStatus === 'Payment Issues') dbPartyStatus = 'Hold';

  // Update Party Status
  const { data: activated, error: actErr } = await adminClient
    .from('party_master')
    .update({
      party_status: dbPartyStatus,
      onboarding_stage: 'S08_Party_Activation',
      updated_at: new Date().toISOString()
    })
    .eq('id', partyId)
    .select()
    .single();

  if (actErr) {
    console.error('Error activating party:', actErr);
    throw new Error(actErr.message);
  }

  // Always update metadata stages in party_master
  const existingMeta = parsePartyMeta(activated.business_nature);
  await updatePartyMeta(adminClient, partyId, {
    activation_status: finalStatus,
    activation_remarks: remarks,
    stages: {
      ...(existingMeta.stages || {}),
      s08: true
    }
  });

  // If originated from lead, also update lead_party_handoffs to ACTIVATED
  try {
    await adminClient
      .from('lead_party_handoffs')
      .update({ handoff_status: 'ACTIVATED' })
      .eq('target_party_id', partyId);
  } catch (hErr) {
    console.warn('Could not update lead_party_handoffs status:', hErr.message);
  }

  return { success: true, party: activated, status: finalStatus };
}

/**
 * Get Party 360 Degree Details
 */
export async function getParty360Details(partyId) {
  const adminClient = getAdminClient();

  const [
    partyRes,
    rolesRes,
    contactsRes,
    addressesRes,
    historyRes,
    commercialRes,
    authsRes,
    territoriesRes,
    teamsRes
  ] = await Promise.all([
    adminClient.from('party_master').select('*').eq('id', partyId).maybeSingle(),
    adminClient.from('party_roles').select('*').eq('party_id', partyId),
    adminClient.from('party_contacts').select('*').eq('party_id', partyId),
    adminClient.from('party_addresses').select('*').eq('party_id', partyId),
    adminClient.from('party_relationship_history').select('*').eq('party_id', partyId).order('created_at', { ascending: false }),
    adminClient.from('party_commercial_terms').select('*').eq('party_id', partyId).maybeSingle(),
    adminClient.from('party_product_authorizations').select('*').eq('party_id', partyId),
    adminClient.from('party_territory_allocations').select('*').eq('party_id', partyId),
    adminClient.from('party_team_assignments').select('*').eq('party_id', partyId)
  ]);

  const rawParty = partyRes?.data || null;
  const meta = parsePartyMeta(rawParty?.business_nature);

  const mergedParty = rawParty ? {
    ...rawParty,
    parent_distributor_id: rawParty.parent_distributor_id || meta.parent_distributor_id || null,
    parent_dealer_id: rawParty.parent_dealer_id || meta.parent_dealer_id || null,
    zone: rawParty.zone || meta.zone || meta.territory?.zone || null,
    dealership_type: rawParty.dealership_type || meta.dealership_type || 'EXCLUSIVE_SWAN',
    showroom_area_sqft: rawParty.showroom_area_sqft || meta.showroom_area_sqft || 2500,
    billing_route_type: rawParty.billing_route_type || meta.billing_route_type || 'DIRECT_COMPANY_BILLING',
    commercial_status: rawParty.commercial_status || meta.commercial_status || (commercialRes?.data ? 'Completed' : null),
    contact_person_name_1: rawParty.contact_person_name_1 || meta.contact_person_name_1 || null,
    contact_mobile_1_1: rawParty.contact_mobile_1_1 || meta.contact_mobile_1_1 || null,
    contact_mobile_1_2: rawParty.contact_mobile_1_2 || meta.contact_mobile_1_2 || null,
    contact_alt_mobile_1_1: rawParty.contact_alt_mobile_1_1 || meta.contact_alt_mobile_1_1 || null,
    contact_alt_mobile_1_2: rawParty.contact_alt_mobile_1_2 || meta.contact_alt_mobile_1_2 || null,
    contact_email_1_2: rawParty.contact_email_1_2 || meta.contact_email_1_2 || null,
    contact_alt_email_1_1: rawParty.contact_alt_email_1_1 || meta.contact_alt_email_1_1 || null,
    contact_person_name_2: rawParty.contact_person_name_2 || meta.contact_person_name_2 || null,
    contact_mobile_2_1: rawParty.contact_mobile_2_1 || meta.contact_mobile_2_1 || null,
    contact_mobile_2_2: rawParty.contact_mobile_2_2 || meta.contact_mobile_2_2 || null,
    contact_alt_mobile_2_1: rawParty.contact_alt_mobile_2_1 || meta.contact_alt_mobile_2_1 || null,
    contact_alt_mobile_2_2: rawParty.contact_alt_mobile_2_2 || meta.contact_alt_mobile_2_2 || null,
    contact_email_2_2: rawParty.contact_email_2_2 || meta.contact_email_2_2 || null,
    contact_alt_email_2_1: rawParty.contact_alt_email_2_1 || meta.contact_alt_email_2_1 || null,
    contact_person_name_3: rawParty.contact_person_name_3 || meta.contact_person_name_3 || null,
    contact_mobile_3_1: rawParty.contact_mobile_3_1 || meta.contact_mobile_3_1 || null,
    contact_mobile_3_2: rawParty.contact_mobile_3_2 || meta.contact_mobile_3_2 || null,
    contact_alt_mobile_3_1: rawParty.contact_alt_mobile_3_1 || meta.contact_alt_mobile_3_1 || null,
    contact_alt_mobile_3_2: rawParty.contact_alt_mobile_3_2 || meta.contact_alt_mobile_3_2 || null,
    contact_email_3_1: rawParty.contact_email_3_1 || meta.contact_email_3_1 || null,
    contact_email_3_2: rawParty.contact_email_3_2 || meta.contact_email_3_2 || null,
    contact_alt_email_3_1: rawParty.contact_alt_email_3_1 || meta.contact_alt_email_3_1 || null,
    biz_contact_no_1: rawParty.biz_contact_no_1 || meta.biz_contact_no_1 || null,
    biz_contact_no_2: rawParty.biz_contact_no_2 || meta.biz_contact_no_2 || null,
    biz_alt_no_1: rawParty.biz_alt_no_1 || meta.biz_alt_no_1 || null,
    biz_alt_no_2: rawParty.biz_alt_no_2 || meta.biz_alt_no_2 || null,
    biz_email_1: rawParty.biz_email_1 || meta.biz_email_1 || null,
    biz_email_2: rawParty.biz_email_2 || meta.biz_email_2 || null,
    biz_alt_email_1: rawParty.biz_alt_email_1 || meta.biz_alt_email_1 || null,
    biz_alt_email_2: rawParty.biz_alt_email_2 || meta.biz_alt_email_2 || null,
    meta: meta
  } : null;

  return {
    party: mergedParty,
    roles: rolesRes?.data || [],
    contacts: contactsRes?.data || [],
    addresses: addressesRes?.data || [],
    relationship_history: historyRes?.data || [],
    commercial: commercialRes?.data || (meta.credit_limit !== undefined ? { credit_limit: meta.credit_limit, credit_days: meta.credit_days || 30 } : null),
    product_authorizations: (authsRes?.data && authsRes.data.length > 0) ? authsRes.data : (meta.product_authorizations || []),
    territory_allocations: (territoriesRes?.data && territoriesRes.data.length > 0) ? territoriesRes.data : (meta.territory ? [meta.territory] : []),
    team_assignments: (teamsRes?.data && teamsRes.data.length > 0) ? teamsRes.data : (meta.team_assignments || [])
  };
}

/**
 * Operational Engine 1: Order Followups
 */
export async function getOrderFollowups(tenantId = DEFAULT_TENANT_ID, scheduledDate = null) {
  const adminClient = getAdminClient();
  const dateStr = scheduledDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  const { data, error } = await adminClient
    .from('party_order_followups')
    .select('*, party:party_master(id, party_universal_code, firm_name, party_type, primary_mobile, owner_name)')
    .eq('tenant_id', tenantId)
    .eq('scheduled_date', dateStr)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching order followups:', error);
    return [];
  }
  return data || [];
}

export async function saveOrderFollowup(followupData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const payload = {
    ...followupData,
    tenant_id: tenantId,
    scheduled_date: followupData.scheduled_date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  };

  const { data, error } = await adminClient
    .from('party_order_followups')
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Operational Engine 2: Post-Order Feedback
 */
export async function getOrderFeedbackList(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('party_order_feedback')
    .select('*, party:party_master(id, party_universal_code, firm_name, primary_mobile)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return data || [];
}

export async function saveOrderFeedback(feedbackData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const isComplaint = (feedbackData.overall_satisfaction <= 2) || feedbackData.has_transit_damage_shortage;

  let linkedTicketId = null;

  // Auto-generate complaint ticket if low rating or damage reported
  if (isComplaint) {
    try {
      const ticketNo = `CMP-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
      const { data: ticket } = await adminClient
        .from('party_complaints')
        .insert([{
          tenant_id: tenantId,
          ticket_number: ticketNo,
          party_id: feedbackData.party_id,
          complaint_source: 'FEEDBACK_CALL_AUTO',
          category: feedbackData.has_transit_damage_shortage ? 'TRANSIT_DAMAGE' : 'MANUFACTURING_DEFECT',
          priority: 'HIGH',
          issue_description: `Auto-generated from post-order feedback for Order #${feedbackData.order_id}. Rating: ${feedbackData.overall_satisfaction}/5. Details: ${feedbackData.damage_details || feedbackData.dealer_comments || 'Low satisfaction score'}`
        }])
        .select()
        .single();

      linkedTicketId = ticket?.id;
    } catch (e) {
      console.warn('Auto complaint creation warning:', e.message);
    }
  }

  const payload = {
    ...feedbackData,
    tenant_id: tenantId,
    auto_complaint_triggered: isComplaint,
    linked_ticket_id: linkedTicketId
  };

  const { data, error } = await adminClient
    .from('party_order_feedback')
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Operational Engine 3: Monthly Default Feedback
 */
export async function getMonthlyFeedbackList(tenantId = DEFAULT_TENANT_ID, monthStr = null) {
  const adminClient = getAdminClient();
  const period = monthStr || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date());

  const { data, error } = await adminClient
    .from('party_monthly_feedback')
    .select('*, party:party_master(id, party_universal_code, firm_name, primary_mobile, party_type)')
    .eq('tenant_id', tenantId)
    .eq('evaluation_period', period)
    .order('created_at', { ascending: false });

  if (error) return [];
  return data || [];
}

export async function saveMonthlyFeedback(feedbackData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const period = feedbackData.evaluation_period || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date());

  const payload = {
    ...feedbackData,
    tenant_id: tenantId,
    evaluation_period: period
  };

  const { data, error } = await adminClient
    .from('party_monthly_feedback')
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Operational Engine 4: Complaint Management System
 */
export async function getComplaintsList(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('party_complaints')
    .select('*, party:party_master(id, party_universal_code, firm_name, primary_mobile, party_type)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return data || [];
}

export async function createComplaintTicket(complaintData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const ticketNo = `CMP-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

  const payload = {
    ...complaintData,
    tenant_id: tenantId,
    ticket_number: ticketNo,
    ticket_status: 'OPEN'
  };

  const { data, error } = await adminClient
    .from('party_complaints')
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateComplaintResolution(complaintId, resolutionData) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('party_complaints')
    .update({
      ...resolutionData,
      ticket_status: 'ACTION_TAKEN'
    })
    .eq('id', complaintId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function verifyAndCloseComplaint(complaintId, otp, satisfactionRating) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('party_complaints')
    .update({
      closure_otp: otp,
      dealer_satisfaction_rating: satisfactionRating || 5,
      ticket_status: 'RESOLVED_CLOSED',
      closed_at: new Date().toISOString()
    })
    .eq('id', complaintId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
