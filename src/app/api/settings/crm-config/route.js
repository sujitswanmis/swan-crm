import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const DEFAULT_CRM_CONFIG = {
  sources: [
    'Website', 'Facebook', 'Google Ads', 'IndiaMART', 'TradeIndia', 
    'WhatsApp', 'Phone Call', 'Field Visit', 'Dealer Reference', 
    'Customer Reference', 'Exhibition', 'Other'
  ],
  stages: [
    { name: '01 - New Stage', substages: ['New Lead', 'Assigned', 'Contact Pending'] },
    { name: '02 - Contact Stage', substages: ['Contacted', 'Wrong Number', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '03 - Qualification Stage', substages: ['Interested', 'Qualified', 'Unqualified', 'Need Identified', 'Budget Confirmed', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '04 - Follow Up Stage', substages: ['Catalog Shared', 'Follow Up Required', 'Next Follow Up Set', 'Follow Up Done', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '05 - Sales Process Stage', substages: ['Visit Require Sales Person', 'Before Visit Conference Call Pending', 'Before Visit Conference Call Done', 'Visit Confirmation Date', 'Task Assigned in TrackWick', 'Meeting Pending', 'Meeting Done', 'Negotiation Pending', 'Negotiation Done', 'Client Documentation Pending', 'Client Documentation Done', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '06 - Conversion Stage', substages: ['Token Amount Pending', 'Token Amount Deposited', 'Client Details Pending', 'Client Details Received', 'Billing 1st Quotation Pending', 'Billing 1st Quotation Sent', 'Quotation Revision Required', 'Quotation Approved by Client', 'Billing 1st Advance Payment Pending', 'Billing 1st Advance Paid', 'Payment Verification Pending', 'Payment Verified', 'Order Confirmed', 'Stock Availability Check', 'Stock Not Available', 'Production Planning Required', 'Delivery Date Confirmed', 'Final Billing 1st Pending', 'Final Billing 1st Done', 'Ready for Dispatch', 'Call not connected', 'No Response', 'ReSchedule'] },
    { name: '07 - Final Stage', substages: ['Converted - Out for Delivery', 'Converted - Order Received', 'Converted - Final Feedback From Client', 'Won', 'Lost After Quotation', 'Lost Due to Price Issue', 'Lost Due to Payment Issue', 'Lost Due to Stock Issue', 'Hold - Client Side', 'Hold - Company Side', 'Duplicate Lead', 'Call not connected', 'No Response', 'ReSchedule'] }
  ],
  clientStatuses: ['None', 'Hot', 'Warm', 'Cold', 'Active', 'InActive', 'Hold', 'In-Progress'],
  priorities: [
    'LP00: None', 'LP01: Immediate', 'LP02: High', 'LP03: Medium', 
    'LP04: Low', 'LP05: Cold', 'LP06: Disqualified', 'LP07: Irrelevant', 
    'LP08: Invalid', 'LP09: Spam', 'LP10: Archive', 'LP11: Competitor Dealer', 'LP12: Competitor Distributor'
  ],
  assignmentRule: 'round_robin',
  leadSyncChunkSize: '500'
};

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('global_role_permissions')
      .select('permissions')
      .eq('id', 'crm_main_config')
      .maybeSingle();

    if (error) {
      console.error('Error reading crm_main_config from Supabase:', error.message);
      return NextResponse.json({
        success: true,
        source: 'default_fallback',
        config: DEFAULT_CRM_CONFIG
      });
    }

    if (!data?.permissions) {
      return NextResponse.json({
        success: true,
        source: 'default_initial',
        config: DEFAULT_CRM_CONFIG
      });
    }

    // Merge saved config with defaults to ensure all required fields exist
    const raw = data.permissions;
    const config = {
      sources: Array.isArray(raw.sources) && raw.sources.length > 0 ? raw.sources : DEFAULT_CRM_CONFIG.sources,
      stages: Array.isArray(raw.stages) && raw.stages.length > 0 ? raw.stages : DEFAULT_CRM_CONFIG.stages,
      clientStatuses: Array.isArray(raw.clientStatuses) && raw.clientStatuses.length > 0 ? raw.clientStatuses : DEFAULT_CRM_CONFIG.clientStatuses,
      priorities: Array.isArray(raw.priorities) && raw.priorities.length > 0 ? raw.priorities : DEFAULT_CRM_CONFIG.priorities,
      assignmentRule: raw.assignmentRule || DEFAULT_CRM_CONFIG.assignmentRule,
      leadSyncChunkSize: raw.leadSyncChunkSize || DEFAULT_CRM_CONFIG.leadSyncChunkSize,
      alertSound: raw.alertSound || 'bell',
      alertDuration: raw.alertDuration || 5,
      browserPushEnabled: raw.browserPushEnabled !== undefined ? raw.browserPushEnabled : false,
      confirmStageChange: raw.confirmStageChange !== undefined ? raw.confirmStageChange : true,
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

    // Fetch current record to avoid losing any additional fields
    let currentPermissions = {};
    try {
      const { data: existing } = await supabase
        .from('global_role_permissions')
        .select('permissions')
        .eq('id', 'crm_main_config')
        .maybeSingle();
      if (existing?.permissions) {
        currentPermissions = existing.permissions;
      }
    } catch (e) {
      // Non-fatal if fetch fails
    }

    const updatedConfig = {
      ...currentPermissions,
      ...body,
      sources: Array.isArray(body.sources) ? body.sources : (currentPermissions.sources || DEFAULT_CRM_CONFIG.sources),
      stages: Array.isArray(body.stages) ? body.stages : (currentPermissions.stages || DEFAULT_CRM_CONFIG.stages),
      clientStatuses: Array.isArray(body.clientStatuses) ? body.clientStatuses : (currentPermissions.clientStatuses || DEFAULT_CRM_CONFIG.clientStatuses),
      priorities: Array.isArray(body.priorities) ? body.priorities : (currentPermissions.priorities || DEFAULT_CRM_CONFIG.priorities),
      assignmentRule: body.assignmentRule || currentPermissions.assignmentRule || DEFAULT_CRM_CONFIG.assignmentRule,
      leadSyncChunkSize: body.leadSyncChunkSize || currentPermissions.leadSyncChunkSize || DEFAULT_CRM_CONFIG.leadSyncChunkSize,
      updated_at: new Date().toISOString(),
      is_customized: true
    };

    const { error } = await supabase
      .from('global_role_permissions')
      .upsert({
        id: 'crm_main_config',
        permissions: updatedConfig
      });

    if (error) {
      console.error('Error upserting crm_main_config to Supabase:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      config: updatedConfig
    });
  } catch (error) {
    console.error('Error in POST /api/settings/crm-config:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
