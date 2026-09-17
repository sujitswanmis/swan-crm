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
 * Fetch complete party list with hierarchy information (R03 Ready)
 */
export async function getPartyList(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  try {
    const { data, error } = await adminClient
      .from('party_master')
      .select('*, party_roles(*), party_contacts(*), party_commercial_terms(*)')
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
      const parentDist = item.parent_distributor_id ? partyMap.get(item.parent_distributor_id) : null;
      const parentDealer = item.parent_dealer_id ? partyMap.get(item.parent_dealer_id) : null;
      
      // If subdealer, auto-derive distributor from parent dealer if not directly set
      const effectiveDist = parentDist || (parentDealer?.parent_distributor_id ? partyMap.get(parentDealer.parent_distributor_id) : null);

      return {
        ...item,
        gstin: item.gstin && item.gstin.includes('Error creating party') ? '' : item.gstin,
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
        product_authorizations: authMap[item.id] || [],
        territory_allocations: territoryMap[item.id] || [],
        team_assignments: teamMap[item.id] || []
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

  const payload = {
    ...cleanPartyData,
    party_universal_code: partyCode,
    party_type: partyType,
    tenant_id: tenantId,
    party_status: 'Draft',
    final_status: 'Draft',
    workflow_status: 'S00_Party_Master',
    next_step: partyType === 'Distributor' ? 'S01_Distributor_Registration' : (partyType === 'Dealer' ? 'S02_Dealer_Registration' : 'S03_Sub_Dealer_Registration'),
    distributor_code: partyType === 'Distributor' ? channelCode : null,
    dealer_code: partyType === 'Dealer' ? channelCode : null,
    sub_dealer_code: partyType === 'Sub-Dealer' ? channelCode : null,
    billing_route_type: partyData.billing_route_type || 'DIRECT_COMPANY_BILLING'
  };

  const { data: party, error } = await adminClient
    .from('party_master')
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Insert primary contact if provided
  const contactName = primary_contact_name || partyData.owner_name || partyData.contact_person;
  const mobile = partyData.primary_mobile || partyData.mobile_no;
  if (contactName && mobile) {
    try {
      await adminClient.from('party_contacts').insert([{
        party_id: party.id,
        contact_name: contactName,
        primary_mobile: mobile,
        is_primary: true
      }]);
    } catch (e) {
      console.warn('Could not insert party_contacts:', e.message);
    }
  }

  // Initialize commercial terms
  try {
    await adminClient.from('party_commercial_terms').insert([{
      party_id: party.id,
      credit_limit: partyData.credit_limit || 500000,
      credit_days: partyData.credit_days || 30,
      commercial_status: 'Pending'
    }]);
  } catch (e) {
    console.warn('Could not insert party_commercial_terms:', e.message);
  }

  // Record initial relationship history if parent is set
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

  const updateFields = { ...stepData, updated_at: new Date().toISOString() };

  // Handle parent relationship history preservation for S02 / S03
  if (stepName === 'S02_Dealer_Registration' && stepData.parent_distributor_id) {
    if (currentParty.parent_distributor_id && currentParty.parent_distributor_id !== stepData.parent_distributor_id) {
      const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      // Deactivate old relationship
      await adminClient
        .from('party_relationship_history')
        .update({ status: 'INACTIVE', effective_to: todayIST })
        .eq('party_id', partyId)
        .eq('status', 'ACTIVE');

      // Insert new active relationship
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
    }
  }

  if (stepName === 'S03_Sub_Dealer_Registration' && stepData.parent_dealer_id) {
    if (currentParty.parent_dealer_id && currentParty.parent_dealer_id !== stepData.parent_dealer_id) {
      const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      // Deactivate old
      await adminClient
        .from('party_relationship_history')
        .update({ status: 'INACTIVE', effective_to: todayIST })
        .eq('party_id', partyId)
        .eq('status', 'ACTIVE');

      // Insert new active
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
    }
  }

  // Update party master record
  const { data: updated, error } = await adminClient
    .from('party_master')
    .update(updateFields)
    .eq('id', partyId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // If commercial step, update party_commercial_terms
  if (stepName === 'S04_Commercial') {
    await adminClient
      .from('party_commercial_terms')
      .upsert([{
        party_id: partyId,
        credit_limit: stepData.credit_limit,
        credit_days: stepData.credit_days,
        security_deposit_amount: stepData.security_deposit_amount,
        security_mode: stepData.security_mode,
        receipt_no: stepData.receipt_no,
        commercial_status: stepData.commercial_status || 'Completed'
      }], { onConflict: 'party_id' });
  }

  return updated;
}

/**
 * Save Product Authorizations (S05)
 */
export async function saveProductAuthorizations(partyId, products, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  // Delete existing and insert new
  await adminClient.from('party_product_authorizations').delete().eq('party_id', partyId);
  
  if (products && products.length > 0) {
    const records = products.map(p => ({
      tenant_id: tenantId,
      party_id: partyId,
      order_category: p.order_category || 'Rotavator',
      product_category: p.product_category || 'Champion',
      product_name: p.product_name,
      opening_stock_required: p.opening_stock_required || 0,
      is_authorized: true,
      authorization_status: 'Active',
      effective_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    }));
    const { error } = await adminClient.from('party_product_authorizations').insert(records);
    if (error) throw new Error(error.message);
  }
  return true;
}

/**
 * Save Territory Allocation (S05.1)
 */
export async function saveTerritoryAllocation(partyId, territoryData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  await adminClient.from('party_territory_allocations').delete().eq('party_id', partyId);

  const record = {
    tenant_id: tenantId,
    party_id: partyId,
    zone: territoryData.zone || 'North Zone',
    state: territoryData.state,
    district: territoryData.district,
    tehsil_area: territoryData.tehsil_area,
    market_coverage_area: territoryData.market_coverage_area,
    territory_type: territoryData.territory_type || 'Exclusive',
    territory_status: 'Active',
    effective_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  };

  const { data, error } = await adminClient.from('party_territory_allocations').insert([record]).select().single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Save Team Assignments (S06)
 */
export async function saveTeamAssignments(partyId, assignments, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
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
    if (error) throw new Error(error.message);
  }
  return true;
}

/**
 * S07 Partner Activation with strict pre-flight validation
 */
export async function activatePartner(partyId, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();

  const details = await getParty360Details(partyId);
  const party = details.party;
  if (!party) throw new Error('Party not found');

  const errors = [];

  // Validation 1: Hierarchy check
  if (party.party_type === 'Dealer') {
    if (!party.parent_distributor_id) {
      errors.push('Dealer must have an active Parent Distributor before activation.');
    }
  } else if (party.party_type === 'Sub-Dealer') {
    if (!party.parent_dealer_id) {
      errors.push('Sub-Dealer must have an active Parent Dealer before activation.');
    }
    if (!party.parent_distributor_id) {
      errors.push('Sub-Dealer chain incomplete: Parent Dealer does not have an active Distributor.');
    }
  }

  // Validation 2: Commercial Completed
  const commStatus = details.commercial?.commercial_status || party.commercial_status;
  if (commStatus !== 'Completed') {
    errors.push('S04 Commercial & Security Details must be marked "Completed".');
  }

  // Validation 3: Min 1 active product authorization
  const auths = details.product_authorizations || [];
  if (auths.length === 0) {
    errors.push('S05 requires at least one Active Product Authorization.');
  }

  // Validation 4: Min 1 active territory
  const territories = details.territory_allocations || [];
  if (territories.length === 0 && !party.state_name) {
    errors.push('S05.1 requires at least one Active Territory Allocation.');
  }

  // Validation 5: Min 1 Primary Sales Coordinator in S06
  const teams = details.team_assignments || [];
  const hasCoordinator = teams.some(t => t.role_in_party === 'Sales Coordinator' || t.role_in_party === 'Telecaller' || t.role_in_party === 'Sales Executive');
  if (teams.length === 0 && !hasCoordinator) {
    errors.push('S06 requires at least one Active Client Team Assignment (Sales Coordinator / Telecaller).');
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Activate Party
  const { data: activated, error: actErr } = await adminClient
    .from('party_master')
    .update({
      party_status: 'Active',
      final_status: 'Active',
      workflow_status: 'S07_Activated',
      registration_status: 'Completed',
      next_step: 'R03_Report',
      updated_at: new Date().toISOString()
    })
    .eq('id', partyId)
    .select()
    .single();

  if (actErr) throw new Error(actErr.message);

  return { success: true, party: activated };
}

/**
 * Get Party 360 Degree Details
 */
export async function getParty360Details(partyId) {
  const adminClient = getAdminClient();

  const [
    { data: party },
    { data: roles },
    { data: contacts },
    { data: addresses },
    { data: history },
    { data: commercial },
    { data: auths },
    { data: territories },
    { data: teams }
  ] = await Promise.all([
    adminClient.from('party_master').select('*').eq('id', partyId).single(),
    adminClient.from('party_roles').select('*').eq('party_id', partyId),
    adminClient.from('party_contacts').select('*').eq('party_id', partyId),
    adminClient.from('party_addresses').select('*').eq('party_id', partyId),
    adminClient.from('party_relationship_history').select('*').eq('party_id', partyId).order('created_at', { ascending: false }),
    adminClient.from('party_commercial_terms').select('*').eq('party_id', partyId).single(),
    adminClient.from('party_product_authorizations').select('*').eq('party_id', partyId),
    adminClient.from('party_territory_allocations').select('*').eq('party_id', partyId),
    adminClient.from('party_team_assignments').select('*').eq('party_id', partyId)
  ]);

  return {
    party,
    roles: roles || [],
    contacts: contacts || [],
    addresses: addresses || [],
    relationship_history: history || [],
    commercial: commercial || null,
    product_authorizations: auths || [],
    territory_allocations: territories || [],
    team_assignments: teams || []
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
