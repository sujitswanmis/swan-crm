/**
 * SaaS Multi-Tenant Feature Entitlements & Tab Mapping
 * Enforces modular access for all 8 standalone / combo SaaS business processes.
 * Ensures New Swan Group (00000000-0000-0000-0000-000000000001) has 100% unconditional access.
 */

export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Master catalog of all 8 decoupled business processes
 */
export const DEFAULT_PROCESS_CATALOG = [
  {
    process_code: 'LEADS_ONLY',
    display_name: 'Lead Management Only',
    category: 'SALES',
    monthly_rate_per_user: 199.00,
    description: 'Leads Table, Pipeline, Assignment, Activity Logs & Follow-up Reminders',
    is_active: true,
    sort_order: 1
  },
  {
    process_code: 'CALLING_STANDALONE',
    display_name: 'Cloud Calling (WebRTC + Softphone)',
    category: 'TELEPHONY',
    monthly_rate_per_user: 249.00,
    description: 'Browser-based Softphone, WebRTC dialer, call logs, recording & duration tracking (Exclude calling usage)',
    is_active: true,
    sort_order: 2
  },
  {
    process_code: 'LEADS_WITH_CALLING',
    display_name: 'Lead Management + Direct Cloud Calling',
    category: 'COMBO',
    monthly_rate_per_user: 399.00,
    description: 'Integrated Leads Table with 1-Click Browser Dialing, automatic duration logs & recordings (Exclude calling usage)',
    is_active: true,
    sort_order: 3
  },
  {
    process_code: 'TASK_DELEGATION',
    display_name: 'Task Delegation',
    category: 'OPERATIONS',
    monthly_rate_per_user: 99.00,
    description: 'Task assignment to team members, deadlines, status tracker & approval workflows',
    is_active: true,
    sort_order: 4
  },
  {
    process_code: 'SMART_CHECKLIST',
    display_name: 'Smart Checklist',
    category: 'OPERATIONS',
    monthly_rate_per_user: 99.00,
    description: 'Daily & recurring operational checklists, opening/closing SOPs & compliance monitoring',
    is_active: true,
    sort_order: 5
  },
  {
    process_code: 'ATTENDANCE',
    display_name: 'Attendance Management',
    category: 'HR',
    monthly_rate_per_user: 99.00,
    description: 'Geo/mobile punch-in/out, shift management, leave approvals & regularization',
    is_active: true,
    sort_order: 6
  },
  {
    process_code: 'RECRUITER',
    display_name: 'Recruiter Management (ATS)',
    category: 'HR',
    monthly_rate_per_user: 149.00,
    description: 'Job postings, public applicant portal, resume/CV upload & interview pipeline tracking',
    is_active: true,
    sort_order: 7
  },
  {
    process_code: 'PARTY_MASTER',
    display_name: 'Party Master Management',
    category: 'OPERATIONS',
    monthly_rate_per_user: 99.00,
    description: 'Dealers, Distributors, Vendors, Clients directory, territory mapping & ledger accounts',
    is_active: true,
    sort_order: 8
  }
];

export const DEFAULT_CYCLE_DISCOUNTS = [
  { cycle_code: 'MONTHLY', display_name: 'Monthly (1 Month)', months_count: 1, discount_percent: 0 },
  { cycle_code: 'QUARTERLY', display_name: 'Quarterly (3 Months)', months_count: 3, discount_percent: 5 },
  { cycle_code: 'HALF_YEARLY', display_name: 'Half-Yearly (6 Months)', months_count: 6, discount_percent: 10 },
  { cycle_code: 'YEARLY', display_name: 'Yearly (12 Months)', months_count: 12, discount_percent: 20 }
];

/**
 * Mapping between SaaS business processes and UI tab identifiers
 */
export const PROCESS_TO_TABS_MAP = {
  LEADS_ONLY: ['leads', 'registration', 'report', 'orders'],
  CALLING_STANDALONE: ['callcenter', 'calladmin', 'aicallcenter'],
  LEADS_WITH_CALLING: ['leads', 'registration', 'report', 'orders', 'callcenter', 'calladmin', 'aicallcenter'],
  TASK_DELEGATION: ['delegation'],
  SMART_CHECKLIST: ['checklist'],
  ATTENDANCE: ['attendance', 'joining'],
  RECRUITER: ['recruiter'],
  PARTY_MASTER: ['party', 'location_master', 'location_territory']
};

/**
 * Inverted map: which processes qualify/grant access to a given tab
 */
export const TAB_TO_ALLOWED_PROCESSES = {
  leads: ['LEADS_ONLY', 'LEADS_WITH_CALLING'],
  registration: ['LEADS_ONLY', 'LEADS_WITH_CALLING'],
  report: ['LEADS_ONLY', 'LEADS_WITH_CALLING'],
  orders: ['LEADS_ONLY', 'LEADS_WITH_CALLING'],
  callcenter: ['CALLING_STANDALONE', 'LEADS_WITH_CALLING'],
  calladmin: ['CALLING_STANDALONE', 'LEADS_WITH_CALLING'],
  aicallcenter: ['CALLING_STANDALONE', 'LEADS_WITH_CALLING'],
  delegation: ['TASK_DELEGATION'],
  checklist: ['SMART_CHECKLIST'],
  attendance: ['ATTENDANCE'],
  joining: ['ATTENDANCE'],
  recruiter: ['RECRUITER'],
  party: ['PARTY_MASTER'],
  location_master: ['PARTY_MASTER'],
  location_territory: ['PARTY_MASTER']
};

/**
 * Universal tabs accessible to all authenticated tenants
 */
export const UNIVERSAL_TABS = [
  'dashboard',
  'team',
  'user_management_new',
  'workplace',
  'settings',
  'public_users',
  'admin_message_config',
  'email_config',
  'sms_config',
  'rcs_config',
  'whatsapp_official',
  'whatsapp_unofficial'
];

/**
 * Check if a tab is entitled for a tenant's subscription plan
 * @param {string} tabId - UI Tab identifier
 * @param {Object} tenantEntitlements - Map of { [moduleKey]: boolean }
 * @param {string} tenantId - Tenant UUID
 * @returns {boolean}
 */
export function isFeatureEntitled(tabId, tenantEntitlements = null, tenantId = DEFAULT_TENANT_ID) {
  // 1. New Swan Group (Master Production) has unconditional access to all tabs
  if (!tenantId || tenantId === DEFAULT_TENANT_ID) {
    return true;
  }

  // 2. If no entitlements passed, grant safe default access
  if (!tenantEntitlements) {
    return true;
  }

  const normalizedTab = String(tabId || '').toLowerCase().split('/')[0];

  // 3. Universal tabs are open to all tenants
  if (UNIVERSAL_TABS.includes(normalizedTab)) {
    return true;
  }

  const requiredProcesses = TAB_TO_ALLOWED_PROCESSES[normalizedTab];
  // 4. If tab is not bound to a restricted process, allow it
  if (!requiredProcesses || requiredProcesses.length === 0) {
    return true;
  }

  // 5. Check if any qualifying process is active in tenant's entitlements
  return requiredProcesses.some(proc => tenantEntitlements[proc] === true);
}
