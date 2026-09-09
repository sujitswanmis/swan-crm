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

/**
 * Server action to get CRM configurations from Supabase
 */
export async function getCRMConfig() {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('global_role_permissions')
      .select('permissions')
      .eq('id', 'crm_main_config')
      .maybeSingle();

    if (error || !data?.permissions) {
      return { success: true, config: DEFAULT_CRM_CONFIG };
    }

    return {
      success: true,
      config: {
        ...DEFAULT_CRM_CONFIG,
        ...data.permissions
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
export async function saveCRMConfig(newConfig) {
  try {
    const adminClient = getAdminClient();
    
    // Fetch existing
    let existingPermissions = {};
    const { data: existing } = await adminClient
      .from('global_role_permissions')
      .select('permissions')
      .eq('id', 'crm_main_config')
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
        id: 'crm_main_config',
        permissions: payload
      });

    if (error) {
      return { success: false, error: error.message };
    }

    try {
      await logAuditAction('Update CRM Config', 'Updated CRM pipeline stages, sources, client statuses, priorities, assignment rules, and sync settings in Supabase');
    } catch (auditErr) {
      console.warn('Audit log failed:', auditErr);
    }

    return { success: true, config: payload };
  } catch (err) {
    console.error('saveCRMConfig server action error:', err);
    return { success: false, error: err.message };
  }
}
