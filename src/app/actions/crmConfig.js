'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { logAuditAction } from '@/app/actions/audit';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
  assignmentRule: 'round_robin',
  leadSyncChunkSize: '500',
  client_form_fields: {
    lead_date: { label: 'Lead Date', enabled: true, required: true },
    our_company: { label: 'Our Company Name', enabled: true, required: true },
    source: { label: 'Lead Source', enabled: true, required: true },
    source_name: { label: 'Source Name', enabled: true, required: false },
    entry_by: { label: 'Entry By', enabled: true, required: true },
    assigned_to: { label: 'Assigned To', enabled: true, required: false },
    status: { label: 'Lead Status', enabled: true, required: true },
    priority: { label: 'Lead Priority Type', enabled: true, required: false },
    company: { label: 'Business / Firm Name', enabled: true, required: true },
    business_type: { label: 'Business Type', enabled: true, required: false },
    business_gst: { label: 'Business GSTIN', enabled: true, required: false },
    business_pan: { label: 'Business PAN', enabled: true, required: false },
    business_contact_1: { label: 'Business Contact 1', enabled: true, required: false },
    business_contact_2: { label: 'Business Contact 2', enabled: true, required: false },
    business_email_1: { label: 'Business Email 1', enabled: true, required: false },
    name: { label: 'Primary Contact Person (CP1 Name)', enabled: true, required: true },
    phone: { label: 'CP1 Mobile Number', enabled: true, required: true },
    email: { label: 'CP1 Email', enabled: true, required: false },
    cp1_mobile_2: { label: 'CP1 Alternate Mobile', enabled: true, required: false },
    state_name: { label: 'State', enabled: true, required: true },
    district_name: { label: 'District', enabled: true, required: true },
    city_name: { label: 'City', enabled: true, required: true },
    tehsil_name: { label: 'Tehsil', enabled: true, required: false },
    block_name: { label: 'Block', enabled: true, required: false },
    pin_code: { label: 'PIN Code', enabled: true, required: false },
    address: { label: 'Full Address', enabled: true, required: false },
    requirement: { label: 'Requirement / Product', enabled: true, required: false },
    investment: { label: 'Investment / Budget', enabled: true, required: false },
    buying_timeline: { label: 'Buying Timeline', enabled: true, required: false }
  }
};

function getTenantConfigId(company) {
  if (!company || company === 'All' || company === 'all') return 'crm_main_config';
  const slug = company.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `crm_config_${slug}`;
}

/**
 * Server action to get CRM configurations from Supabase
 */
export async function getCRMConfig(company = '') {
  try {
    const adminClient = getAdminClient();
    const configId = getTenantConfigId(company);

    let data = null;
    let error = null;

    if (configId !== 'crm_main_config') {
      const res = await adminClient
        .from('global_role_permissions')
        .select('permissions')
        .eq('id', configId)
        .maybeSingle();
      data = res.data;
      error = res.error;
    }

    // Fallback to main config if company-specific config doesn't exist
    if (!data?.permissions) {
      const mainRes = await adminClient
        .from('global_role_permissions')
        .select('permissions')
        .eq('id', 'crm_main_config')
        .maybeSingle();
      data = mainRes.data;
      error = mainRes.error;
    }

    if (error || !data?.permissions) {
      return { success: true, config: DEFAULT_CRM_CONFIG };
    }

    // Normalize stages to make sure enabled is populated
    const savedStages = data.permissions.stages || DEFAULT_CRM_CONFIG.stages;
    const normalizedStages = savedStages.map(s => ({
      ...s,
      enabled: s.enabled !== false
    }));

    return {
      success: true,
      config: {
        ...DEFAULT_CRM_CONFIG,
        ...data.permissions,
        stages: normalizedStages,
        client_form_fields: {
          ...DEFAULT_CRM_CONFIG.client_form_fields,
          ...(data.permissions.client_form_fields || {})
        }
      }
    };
  } catch (err) {
    console.error('getCRMConfig server action error:', err);
    return { success: true, config: DEFAULT_CRM_CONFIG };
  }
}

/**
 * Server action to save CRM configurations to Supabase
 */
export async function saveCRMConfig(newConfig, company = '') {
  try {
    const adminClient = getAdminClient();
    const configId = getTenantConfigId(company);
    
    // Fetch existing
    let existingPermissions = {};
    const { data: existing } = await adminClient
      .from('global_role_permissions')
      .select('permissions')
      .eq('id', configId)
      .maybeSingle();
      
    if (existing?.permissions) {
      existingPermissions = existing.permissions;
    }

    const payload = {
      ...existingPermissions,
      ...newConfig,
      updated_at: new Date().toISOString(),
      is_customized: true
    };

    const { error } = await adminClient
      .from('global_role_permissions')
      .upsert({
        id: configId,
        permissions: payload
      });

    if (error) {
      return { success: false, error: error.message };
    }

    try {
      await logAuditAction(
        'Update CRM Config', 
        `Updated CRM pipeline stages & form config for ${company || 'General Workspace'}`
      );
    } catch (auditErr) {
      console.warn('Audit log failed:', auditErr);
    }

    return { success: true, config: payload };
  } catch (err) {
    console.error('saveCRMConfig server action error:', err);
    return { success: false, error: err.message };
  }
}
