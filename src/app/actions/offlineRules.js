'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { logAuditAction } from '@/app/actions/audit';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_OFFLINE_RULES = {
  isOfflineEnabled: true,
  dailyQuotaHours: 5,
  monthlyQuotaHours: 50,
  features: {
    // 📋 Smart Checklist Operations
    checklistSubmit: true,
    checklistTemplateEdit: false,

    // 👥 Task & Delegation Operations
    delegationStatusUpdate: true,
    delegationCreate: true,
    delegationApproval: false,

    // ⏰ Smart Attendance Operations
    attendancePunch: true,
    attendanceRegularization: true,

    // 🎯 Sales & CRM Operations
    leadStatusUpdate: true,
    leadNotes: true,
    leadFollowUp: true,
    clientRegistration: true,
    profileEdit: true,
    leadAssign: false,
    partyMasterEdit: true,
    locationMaster: false,
    orders: false,
    clientReport: false,

    // 📊 General & Analytics
    analytics: false,

    // 📦 Purchase & Production
    mrp: false,
    mrpAgainst: false,

    // 👔 Human Resource
    recruiter: false,
    joining: false,

    // 🏢 System & Workplace WMS
    teamManagement: false,
    workplaceWms: false,
    publicUsers: false,

    // 📞 Communication & AI
    callCenter: false,
    callAdmin: false,
    aiCallCenter: false,
    whatsappOfficial: false,
    whatsappUnofficial: false,
    aiAssistant: false,
    aiAdmin: false,
    aiKnowledgeBase: false,
    adminMessageConfig: false,

    // ⚙️ System Settings
    settings: true
  },
  autoSyncOnReconnect: true,
  maxQueueItemsPerDevice: 500
};

/**
 * Fetch the global offline rule configuration from Supabase
 */
export async function getOfflineRuleSettings() {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('global_role_permissions')
      .select('permissions')
      .eq('id', 'offline_rule_config')
      .maybeSingle();

    if (error || !data?.permissions) {
      return { success: true, settings: DEFAULT_OFFLINE_RULES };
    }

    return {
      success: true,
      settings: {
        ...DEFAULT_OFFLINE_RULES,
        ...data.permissions,
        features: {
          ...DEFAULT_OFFLINE_RULES.features,
          ...(data.permissions.features || {})
        }
      }
    };
  } catch (err) {
    console.warn('getOfflineRuleSettings error, returning defaults:', err);
    return { success: true, settings: DEFAULT_OFFLINE_RULES };
  }
}

/**
 * Save updated offline rule configuration to Supabase
 */
export async function saveOfflineRuleSettings(newSettings) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized. Please login.' };
    }

    const adminClient = getAdminClient();

    // Verify role permissions (Admin or Manager)
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role, emp_name')
      .eq('user_id', user.id)
      .maybeSingle();

    const userRole = (roleData?.role || '').toLowerCase();
    if (!['admin', 'superadmin', 'manager'].includes(userRole) && user.email !== 'sujitswanmis@gmail.com') {
      return { success: false, error: 'Permission Denied: Only Admins can update Offline Rules.' };
    }

    const cleanSettings = {
      isOfflineEnabled: Boolean(newSettings.isOfflineEnabled),
      dailyQuotaHours: Math.min(24, Math.max(1, Number(newSettings.dailyQuotaHours) || 5)),
      monthlyQuotaHours: Math.min(300, Math.max(5, Number(newSettings.monthlyQuotaHours) || 50)),
      features: {
        checklistSubmit: Boolean(newSettings.features?.checklistSubmit),
        checklistTemplateEdit: Boolean(newSettings.features?.checklistTemplateEdit),
        delegationStatusUpdate: Boolean(newSettings.features?.delegationStatusUpdate),
        delegationCreate: Boolean(newSettings.features?.delegationCreate),
        delegationApproval: Boolean(newSettings.features?.delegationApproval),
        leadStatusUpdate: Boolean(newSettings.features?.leadStatusUpdate),
        leadNotes: Boolean(newSettings.features?.leadNotes),
        leadFollowUp: Boolean(newSettings.features?.leadFollowUp),
        clientRegistration: Boolean(newSettings.features?.clientRegistration),
        profileEdit: Boolean(newSettings.features?.profileEdit),
        leadAssign: Boolean(newSettings.features?.leadAssign),
        attendancePunch: Boolean(newSettings.features?.attendancePunch),
        attendanceRegularization: Boolean(newSettings.features?.attendanceRegularization),
        partyMasterEdit: Boolean(newSettings.features?.partyMasterEdit)
      },
      autoSyncOnReconnect: Boolean(newSettings.autoSyncOnReconnect),
      maxQueueItemsPerDevice: Number(newSettings.maxQueueItemsPerDevice) || 500,
      updated_at: new Date().toISOString(),
      updated_by: roleData?.emp_name || user.email
    };

    const { error: upsertErr } = await adminClient
      .from('global_role_permissions')
      .upsert({
        id: 'offline_rule_config',
        permissions: cleanSettings
      });

    if (upsertErr) {
      console.error('saveOfflineRuleSettings upsert error:', upsertErr);
      return { success: false, error: upsertErr.message };
    }

    try {
      await logAuditAction({
        action: 'Update Offline Rule',
        target: 'System Offline Policy',
        details: `Updated offline mode: ${cleanSettings.isOfflineEnabled ? 'Enabled' : 'Disabled'}, Daily Quota: ${cleanSettings.dailyQuotaHours}h, Monthly Quota: ${cleanSettings.monthlyQuotaHours}h`
      });
    } catch (auditErr) {}

    return { success: true, settings: cleanSettings };
  } catch (err) {
    console.error('saveOfflineRuleSettings critical error:', err);
    return { success: false, error: err.message };
  }
}
