import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const DEFAULT_BUSINESS_TYPES = [
  'Dealer', 'Distributor', 'Retailer', 'Farmer', 'Trader', 
  'Manufacturer', 'Service Provider', 'Wholesaler', 'Broker', 'Other'
];

export const DEFAULT_CLIENT_FORM_FIELDS = {
  // 01 - Lead Information
  lead_date: { label: 'Lead Date', category: '01 - Lead Information', enabled: true, required: true },
  our_company: { label: 'Our Company Name', category: '01 - Lead Information', enabled: true, required: true },
  source: { label: 'Lead Source', category: '01 - Lead Information', enabled: true, required: true },
  source_name: { label: 'Source Name', category: '01 - Lead Information', enabled: true, required: false },
  entry_by: { label: 'Lead Entry By', category: '01 - Lead Information', enabled: true, required: true },
  assigned_to: { label: 'Assign To (Agent)', category: '01 - Lead Information', enabled: true, required: false },
  status: { label: 'Client Status', category: '01 - Lead Information', enabled: true, required: true },
  priority: { label: 'Lead Priority Type', category: '01 - Lead Information', enabled: true, required: false },

  // 02 - Business Details
  company: { label: 'Business / Firm Name', category: '02 - Business Details', enabled: true, required: true },
  business_type: { label: 'Business Type', category: '02 - Business Details', enabled: true, required: false },
  business_gst: { label: 'Business GSTIN', category: '02 - Business Details', enabled: true, required: false },
  business_contact_1: { label: 'Business Contact 1', category: '02 - Business Details', enabled: true, required: false },
  business_contact_2: { label: 'Business Contact 2', category: '02 - Business Details', enabled: true, required: false },
  business_alt_1: { label: 'Business Alternate Number 1', category: '02 - Business Details', enabled: true, required: false },
  business_alt_2: { label: 'Business Alternate Number 2', category: '02 - Business Details', enabled: true, required: false },
  business_email_1: { label: 'Business Mail ID 1', category: '02 - Business Details', enabled: true, required: false },
  business_email_2: { label: 'Business Mail ID 2', category: '02 - Business Details', enabled: true, required: false },
  business_alt_email_1: { label: 'Business Alternate Mail 1', category: '02 - Business Details', enabled: true, required: false },
  business_alt_email_2: { label: 'Business Alternate Mail 2', category: '02 - Business Details', enabled: true, required: false },

  // 03 - Contact Person 1
  name: { label: 'CP1 Name (Primary Contact)', category: '03 - Contact Person 1', enabled: true, required: true },
  phone: { label: 'CP1 Mobile Number 1', category: '03 - Contact Person 1', enabled: true, required: true },
  cp1_mobile_2: { label: 'CP1 Mobile Number 2', category: '03 - Contact Person 1', enabled: true, required: false },
  cp1_alt_1: { label: 'CP1 Alternate Number 1', category: '03 - Contact Person 1', enabled: true, required: false },
  cp1_alt_2: { label: 'CP1 Alternate Number 2', category: '03 - Contact Person 1', enabled: true, required: false },
  email: { label: 'CP1 Mail ID 1', category: '03 - Contact Person 1', enabled: true, required: false },
  cp1_email_2: { label: 'CP1 Alternate Mail 1', category: '03 - Contact Person 1', enabled: true, required: false },

  // 04 - Contact Person 2
  cp2_name: { label: 'CP2 Name', category: '04 - Contact Person 2', enabled: true, required: false },
  cp2_mobile_1: { label: 'CP2 Mobile Number 1', category: '04 - Contact Person 2', enabled: true, required: false },
  cp2_mobile_2: { label: 'CP2 Mobile Number 2', category: '04 - Contact Person 2', enabled: true, required: false },
  cp2_alt_1: { label: 'CP2 Alternate Number 1', category: '04 - Contact Person 2', enabled: true, required: false },
  cp2_alt_2: { label: 'CP2 Alternate Number 2', category: '04 - Contact Person 2', enabled: true, required: false },
  cp2_email_1: { label: 'CP2 Mail ID 1', category: '04 - Contact Person 2', enabled: true, required: false },
  cp2_email_2: { label: 'CP2 Alternate Mail 1', category: '04 - Contact Person 2', enabled: true, required: false },

  // 05 - Contact Person 3
  cp3_name: { label: 'CP3 Name', category: '05 - Contact Person 3', enabled: true, required: false },
  cp3_mobile_1: { label: 'CP3 Mobile Number 1', category: '05 - Contact Person 3', enabled: true, required: false },
  cp3_mobile_2: { label: 'CP3 Mobile Number 2', category: '05 - Contact Person 3', enabled: true, required: false },
  cp3_alt_1: { label: 'CP3 Alternate Number 1', category: '05 - Contact Person 3', enabled: true, required: false },
  cp3_alt_2: { label: 'CP3 Alternate Number 2', category: '05 - Contact Person 3', enabled: true, required: false },
  cp3_email_1: { label: 'CP3 Mail ID 1', category: '05 - Contact Person 3', enabled: true, required: false },
  cp3_email_2: { label: 'CP3 Alternate Mail 1', category: '05 - Contact Person 3', enabled: true, required: false },

  // 06 - Location Details
  state_name: { label: 'State Name', category: '06 - Location Details', enabled: true, required: true },
  district_name: { label: 'District Name', category: '06 - Location Details', enabled: true, required: true },
  city_name: { label: 'City Name', category: '06 - Location Details', enabled: true, required: true },
  tehsil_name: { label: 'Tehsil Name', category: '06 - Location Details', enabled: true, required: false },
  block_name: { label: 'Block Name', category: '06 - Location Details', enabled: true, required: false },
  pin_code: { label: 'PIN Code', category: '06 - Location Details', enabled: true, required: false },
  address: { label: 'Full Address', category: '06 - Location Details', enabled: true, required: false },

  // 07 - Requirements
  requirement: { label: 'Detailed Requirement', category: '07 - Requirements', enabled: true, required: false },
  investment: { label: 'Investment Size', category: '07 - Requirements', enabled: true, required: false },
  buying_timeline: { label: 'Buying Timeline', category: '07 - Requirements', enabled: true, required: false }
};

export const DEFAULT_CRM_CONFIG = {
  sources: [
    'Website', 'Facebook', 'Google Ads', 'IndiaMART', 'TradeIndia', 
    'WhatsApp', 'Phone Call', 'Field Visit', 'Dealer Reference', 
    'Customer Reference', 'Exhibition', 'Other'
  ],
  stages: [
    { name: '01 - New Stage', enabled: true, is_closing: false, substages: ['New Lead', 'Assigned', 'Contact Pending'] },
    { name: '02 - Contact Stage', enabled: true, is_closing: false, substages: ['Contacted', 'Wrong Number', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '03 - Qualification Stage', enabled: true, is_closing: false, substages: ['Interested', 'Qualified', 'Unqualified', 'Need Identified', 'Budget Confirmed', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '04 - Follow Up Stage', enabled: true, is_closing: false, substages: ['Catalog Shared', 'Follow Up Required', 'Next Follow Up Set', 'Follow Up Done', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '05 - Sales Process Stage', enabled: true, is_closing: false, substages: ['Visit Require Sales Person', 'Before Visit Conference Call Pending', 'Before Visit Conference Call Done', 'Visit Confirmation Date', 'Task Assigned in TrackWick', 'Meeting Pending', 'Meeting Done', 'Negotiation Pending', 'Negotiation Done', 'Client Documentation Pending', 'Client Documentation Done', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '06 - Conversion Stage', enabled: true, is_closing: false, substages: ['Token Amount Pending', 'Token Amount Deposited', 'Client Details Pending', 'Client Details Received', 'Billing 1st Quotation Pending', 'Billing 1st Quotation Sent', 'Quotation Revision Required', 'Quotation Approved by Client', 'Billing 1st Advance Payment Pending', 'Billing 1st Advance Paid', 'Payment Verification Pending', 'Payment Verified', 'Order Confirmed', 'Stock Availability Check', 'Stock Not Available', 'Production Planning Required', 'Delivery Date Confirmed', 'Final Billing 1st Pending', 'Final Billing 1st Done', 'Ready for Dispatch', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '07 - Final Stage', enabled: true, is_closing: true, substages: ['Converted - Out for Delivery', 'Converted - Order Received', 'Converted - Final Feedback From Client', 'Won', 'Lost After Quotation', 'Lost Due to Price Issue', 'Lost Due to Payment Issue', 'Lost Due to Stock Issue', 'Hold - Client Side', 'Hold - Company Side', 'Duplicate Lead', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '08 - Transfer to Party', enabled: true, is_closing: false, substages: ['Pending Confirmation', 'Transferred to Party Master', 'Won - Transferred'] }
  ],
  clientStatuses: ['None', 'Hot', 'Warm', 'Cold', 'Active', 'InActive', 'Hold', 'In-Progress'],
  priorities: [
    'LP00: None', 'LP01: Immediate', 'LP02: High', 'LP03: Medium', 
    'LP04: Low', 'LP05: Cold', 'LP06: Disqualified', 'LP07: Irrelevant', 
    'LP08: Invalid', 'LP09: Spam', 'LP10: Archive', 'LP11: Competitor Dealer', 'LP12: Competitor Distributor'
  ],
  businessTypes: DEFAULT_BUSINESS_TYPES,
  assignmentRule: 'round_robin',
  leadSyncChunkSize: '500',
  client_form_fields: DEFAULT_CLIENT_FORM_FIELDS
};

function getTenantConfigId(company) {
  if (!company || company === 'All' || company === 'all') return 'crm_main_config';
  const slug = company.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `crm_config_${slug}`;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const company = searchParams.get('company') || '';
    const configId = getTenantConfigId(company);

    let data = null;
    let error = null;

    if (configId !== 'crm_main_config') {
      const res = await supabase
        .from('global_role_permissions')
        .select('permissions')
        .eq('id', configId)
        .maybeSingle();
      data = res.data;
      error = res.error;
    }

    if (!data?.permissions) {
      const mainRes = await supabase
        .from('global_role_permissions')
        .select('permissions')
        .eq('id', 'crm_main_config')
        .maybeSingle();
      data = mainRes.data;
      error = mainRes.error;
    }

    if (error || !data?.permissions) {
      return NextResponse.json({
        success: true,
        source: 'default_fallback',
        config: DEFAULT_CRM_CONFIG
      });
    }

    const raw = data.permissions;
    const stages = (Array.isArray(raw.stages) && raw.stages.length > 0 ? raw.stages : DEFAULT_CRM_CONFIG.stages).map(s => ({
      ...s,
      enabled: s.enabled !== false
    }));

    // Guarantee Stage 08 exists in stages
    const hasS08 = stages.some(s => s.name?.includes('08 - Transfer to Party') || s.name?.startsWith('08'));
    if (!hasS08) {
      stages.push({
        name: '08 - Transfer to Party',
        enabled: true,
        is_closing: false,
        substages: ['Pending Confirmation', 'Transferred to Party Master', 'Won - Transferred']
      });
    }

    const config = {
      sources: Array.isArray(raw.sources) && raw.sources.length > 0 ? raw.sources : DEFAULT_CRM_CONFIG.sources,
      stages,
      clientStatuses: Array.isArray(raw.clientStatuses) && raw.clientStatuses.length > 0 ? raw.clientStatuses : DEFAULT_CRM_CONFIG.clientStatuses,
      priorities: Array.isArray(raw.priorities) && raw.priorities.length > 0 ? raw.priorities : DEFAULT_CRM_CONFIG.priorities,
      assignmentRule: raw.assignmentRule || DEFAULT_CRM_CONFIG.assignmentRule,
      leadSyncChunkSize: raw.leadSyncChunkSize || DEFAULT_CRM_CONFIG.leadSyncChunkSize,
      alertSound: raw.alertSound || 'bell',
      alertDuration: raw.alertDuration || 5,
      browserPushEnabled: raw.browserPushEnabled !== undefined ? raw.browserPushEnabled : false,
      confirmStageChange: raw.confirmStageChange !== undefined ? raw.confirmStageChange : true,
      client_form_fields: {
        ...DEFAULT_CRM_CONFIG.client_form_fields,
        ...(raw.client_form_fields || {})
      },
      updated_at: raw.updated_at || null,
      is_customized: Boolean(raw.is_customized)
    };

    return NextResponse.json({
      success: true,
      source: 'supabase',
      config
    });
  } catch (error) {
    console.error('Error in GET /api/settings/crm-config:', error);
    return NextResponse.json({
      success: true,
      source: 'error_fallback',
      config: DEFAULT_CRM_CONFIG
    });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }

    const company = body.company || '';
    const configId = getTenantConfigId(company);

    let currentPermissions = {};
    try {
      const { data: existing } = await supabase
        .from('global_role_permissions')
        .select('permissions')
        .eq('id', configId)
        .maybeSingle();
      if (existing?.permissions) {
        currentPermissions = existing.permissions;
      }
    } catch (e) {
      // Non-fatal
    }

    let finalStages = Array.isArray(body.stages) ? body.stages : (currentPermissions.stages || DEFAULT_CRM_CONFIG.stages);
    const hasS08Post = finalStages.some(s => s.name?.includes('08 - Transfer to Party') || s.name?.startsWith('08'));
    if (!hasS08Post) {
      finalStages.push({
        name: '08 - Transfer to Party',
        enabled: true,
        is_closing: false,
        substages: ['Pending Confirmation', 'Transferred to Party Master', 'Won - Transferred']
      });
    }
    const s07 = finalStages.find(s => s.name?.includes('07 - Final Stage'));
    if (s07 && Array.isArray(s07.substages)) {
      s07.substages = s07.substages.filter(sub => sub !== 'Transfer to Party Master');
    }

    const updatedConfig = {
      ...currentPermissions,
      ...body,
      sources: Array.isArray(body.sources) ? body.sources : (currentPermissions.sources || DEFAULT_CRM_CONFIG.sources),
      stages: finalStages,
      clientStatuses: Array.isArray(body.clientStatuses) ? body.clientStatuses : (currentPermissions.clientStatuses || DEFAULT_CRM_CONFIG.clientStatuses),
      priorities: Array.isArray(body.priorities) ? body.priorities : (currentPermissions.priorities || DEFAULT_CRM_CONFIG.priorities),
      assignmentRule: body.assignmentRule || currentPermissions.assignmentRule || DEFAULT_CRM_CONFIG.assignmentRule,
      leadSyncChunkSize: body.leadSyncChunkSize || currentPermissions.leadSyncChunkSize || DEFAULT_CRM_CONFIG.leadSyncChunkSize,
      client_form_fields: {
        ...DEFAULT_CRM_CONFIG.client_form_fields,
        ...(currentPermissions.client_form_fields || {}),
        ...(body.client_form_fields || {})
      },
      updated_at: new Date().toISOString(),
      is_customized: true
    };

    const { error } = await supabase
      .from('global_role_permissions')
      .upsert({
        id: configId,
        permissions: updatedConfig
      });

    if (error) {
      console.error('Error upserting crm_config to Supabase:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      config: updatedConfig
    });
  } catch (error) {
    console.error('Error in POST /api/settings/crm-config:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal error' }, { status: 500 });
  }
}
