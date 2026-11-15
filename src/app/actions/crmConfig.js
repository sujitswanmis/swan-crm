'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { logAuditAction } from '@/app/actions/audit';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

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

const SWAN_COMPANIES = ['nsmlr', 'nstlp', 'nstl', 'nse-1', 'nse1', 'new swan', 'new swan group'];
const SWAN_TENANTS = ['00000000-0000-0000-0000-000000000001', 'tnt00002'];

function resolveConfigIds(company = '', tenantId = '') {
  const compLower = String(company || '').trim().toLowerCase();
  const tenantLower = String(tenantId || '').trim().toLowerCase();

  const isSwan = SWAN_TENANTS.includes(tenantLower) || 
                 SWAN_COMPANIES.includes(compLower) || 
                 compLower.includes('swan');

  let primaryId = 'crm_main_config';
  let tenantFallbackId = null;

  if (compLower && compLower !== 'all') {
    const slug = compLower.replace(/[^a-z0-9]/g, '_');
    primaryId = `crm_config_${slug}`;
  }

  if (isSwan) {
    tenantFallbackId = 'crm_config_new_swan_group';
    if (!compLower || compLower === 'all' || compLower === 'new swan group' || compLower === 'new swan') {
      primaryId = 'crm_config_new_swan_group';
    }
  }

  return { primaryId, tenantFallbackId, isSwan };
}

function getTenantConfigId(company, tenantId = '') {
  return resolveConfigIds(company, tenantId).primaryId;
}

/**
 * Server action to get CRM configurations from Supabase
 */
export async function getCRMConfig(company = '', tenantId = '') {
  try {
    const adminClient = getAdminClient();
    const { primaryId, tenantFallbackId } = resolveConfigIds(company, tenantId);
    const configId = primaryId;

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

    // Fallback to tenant config (e.g. crm_config_new_swan_group for Swan branches)
    if (!data?.permissions && tenantFallbackId && tenantFallbackId !== configId) {
      const tenantRes = await adminClient
        .from('global_role_permissions')
        .select('permissions')
        .eq('id', tenantFallbackId)
        .maybeSingle();
      if (tenantRes.data?.permissions) {
        data = tenantRes.data;
        error = tenantRes.error;
      }
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

    // Fallback to Swan config if main config is empty and it's a Swan user
    if (!data?.permissions && tenantFallbackId) {
      const swanRes = await adminClient
        .from('global_role_permissions')
        .select('permissions')
        .eq('id', 'crm_config_new_swan_group')
        .maybeSingle();
      data = swanRes.data;
      error = swanRes.error;
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

    const savedFormFields = data.permissions.client_form_fields || {};
    const mergedFormFields = {};
    for (const [k, def] of Object.entries(DEFAULT_CLIENT_FORM_FIELDS)) {
      mergedFormFields[k] = {
        ...def,
        ...(savedFormFields[k] || {}),
        category: def.category,
        label: def.label
      };
    }

    return {
      success: true,
      config: {
        ...DEFAULT_CRM_CONFIG,
        ...data.permissions,
        stages: normalizedStages,
        businessTypes: (Array.isArray(data.permissions.businessTypes) && data.permissions.businessTypes.length > 0)
          ? data.permissions.businessTypes
          : DEFAULT_CRM_CONFIG.businessTypes,
        client_form_fields: mergedFormFields
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
export async function saveCRMConfig(newConfig, company = '', tenantId = '') {
  try {
    const adminClient = getAdminClient();
    const { primaryId, isSwan } = resolveConfigIds(company, tenantId);
    const configId = primaryId;
    
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

    // Dual-sync: keep crm_main_config and crm_config_new_swan_group in sync for workspace-level updates
    if (configId === 'crm_config_new_swan_group' || (!company || company.toLowerCase() === 'all' || isSwan)) {
      try {
        await adminClient
          .from('global_role_permissions')
          .upsert([
            { id: 'crm_main_config', permissions: payload },
            { id: 'crm_config_new_swan_group', permissions: payload }
          ]);
      } catch (syncErr) {
        console.warn('Notice: Background sync between main & Swan config in server action:', syncErr);
      }
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
