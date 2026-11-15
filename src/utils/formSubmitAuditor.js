'use client';

// ==============================================================================
// FORM SUBMIT AUDITOR & CRM SYSTEM DIAGNOSTICS TELEMETRY
// Tracks all Form Submissions, Submit Button Clicks, Field Errors & CRM Tools
// Strict IST Timezone Enforcement (Asia/Kolkata, UTC+5:30)
// ==============================================================================

export const FORM_AUDIT_STORAGE_KEY = 'crm_form_submit_audit_logs';
const MAX_LOG_ENTRIES = 200;

export const formatISTTimestamp = (date = new Date()) => {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date(date)) + ' IST';
  } catch (e) {
    return new Date(date).toLocaleString() + ' IST';
  }
};

/**
 * Record a Form Submit or Action Button click across any page or tab
 */
export function recordFormSubmission({
  module = 'General',
  page = 'Unknown Page',
  tab = '',
  formName = 'Standard Form',
  buttonLabel = 'Submit',
  fields = [],
  status = 'success', // 'success' | 'error' | 'warning'
  error = null,
  responseCode = 200,
  table = null,
  payloadSummary = null
}) {
  if (typeof window === 'undefined') return;

  try {
    let normalizedError = null;
    if (error) {
      if (typeof error === 'string') {
        normalizedError = error;
      } else if (error.message) {
        normalizedError = error.message;
        if (error.code) normalizedError = `[Code ${error.code}] ${normalizedError}`;
        if (error.details) normalizedError += ` — ${error.details}`;
        if (error.hint) normalizedError += ` (Hint: ${error.hint})`;
      } else {
        normalizedError = JSON.stringify(error);
      }
    }

    const fieldList = Array.isArray(fields)
      ? fields
      : typeof fields === 'string'
      ? fields.split(',').map(f => f.trim()).filter(Boolean)
      : fields && typeof fields === 'object'
      ? Object.keys(fields)
      : [];

    const eventItem = {
      id: Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36),
      module,
      page,
      tab: tab || '',
      formName,
      buttonLabel,
      fields: fieldList,
      status: status === 'error' || normalizedError ? 'error' : status,
      error: normalizedError,
      responseCode: responseCode || (normalizedError ? 500 : 200),
      table: table || null,
      payloadSummary: payloadSummary ? (typeof payloadSummary === 'string' ? payloadSummary : JSON.stringify(payloadSummary).slice(0, 300)) : null,
      timestamp: formatISTTimestamp(new Date()),
      timestampRaw: new Date().toISOString()
    };

    const existingRaw = localStorage.getItem(FORM_AUDIT_STORAGE_KEY);
    let logs = [];
    if (existingRaw) {
      try {
        logs = JSON.parse(existingRaw);
      } catch (_e) {
        logs = [];
      }
    }

    logs = [eventItem, ...logs.slice(0, MAX_LOG_ENTRIES - 1)];
    localStorage.setItem(FORM_AUDIT_STORAGE_KEY, JSON.stringify(logs));

    // Broadcast live event to any active listener
    window.dispatchEvent(new CustomEvent('crm_form_submitted', { detail: eventItem }));
    return eventItem;
  } catch (err) {
    console.error('[FormSubmitAuditor] Failed to record submit event:', err);
  }
}

/**
 * Retrieve recent Form Submission Logs from LocalStorage
 */
export function getFormSubmissionLogs() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FORM_AUDIT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('[FormSubmitAuditor] Failed to read logs:', e);
    return [];
  }
}

/**
 * Clear Form Submission Logs from LocalStorage
 */
export function clearFormSubmissionLogs() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(FORM_AUDIT_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('crm_form_submit_logs_cleared'));
  } catch (e) {
    console.error('[FormSubmitAuditor] Failed to clear logs:', e);
  }
}

// ==============================================================================
// AUTOMATIC FULL-STACK TELEMETRY (Frontend Clicks, API Errors & Backend Mutations)
// ==============================================================================
let lastClickedButtonLabel = '';
let lastClickedButtonTime = 0;

if (typeof window !== 'undefined' && !window.__CRM_SUBMIT_TELEMETRY_INSTALLED__) {
  window.__CRM_SUBMIT_TELEMETRY_INSTALLED__ = true;

  // Track button clicks with submit-like intent
  window.addEventListener('click', (e) => {
    try {
      const btn = e.target?.closest ? e.target.closest('button, input[type="submit"]') : null;
      if (btn) {
        const text = (btn.innerText || btn.value || btn.title || '').trim();
        if (text) {
          lastClickedButtonLabel = text;
          lastClickedButtonTime = Date.now();
        }
      }
    } catch (_e) {}
  }, true);

  // Track HTML form submissions
  window.addEventListener('submit', (e) => {
    try {
      const form = e.target;
      if (form && form.elements) {
        const fieldNames = [];
        for (let i = 0; i < form.elements.length; i++) {
          const el = form.elements[i];
          if (el.name && !['submit', 'button', 'hidden'].includes(el.type)) {
            fieldNames.push(el.name);
          }
        }
        const btnLabel = e.submitter?.innerText || lastClickedButtonLabel || 'Submit';
        const path = window.location.pathname;
        const matchingReg = CRM_PAGES_AND_FORMS_REGISTRY.find(r => path.includes(r.targetTable) || (r.tab && path.includes(r.tab)));

        recordFormSubmission({
          module: matchingReg?.module || 'CRM Page',
          page: matchingReg?.pageName || path,
          tab: matchingReg?.tab || '',
          formName: matchingReg?.formName || 'Form Submission',
          buttonLabel: btnLabel,
          fields: fieldNames.length > 0 ? fieldNames : (matchingReg?.fields || []),
          status: 'success',
          responseCode: 200,
          table: matchingReg?.targetTable || null
        });
      }
    } catch (_e) {}
  }, true);

  // Transparent non-blocking fetch error & mutation monitor
  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      const method = (args[1]?.method || 'GET').toUpperCase();
      const isRestOrApi = url.includes('/rest/v1/') || url.includes('/api/');

      let response;
      try {
        response = await origFetch.apply(this, args);
      } catch (networkErr) {
        if (isRestOrApi && !url.includes('/api/plivo/wait-silence')) {
          const path = window.location.pathname;
          recordFormSubmission({
            module: 'Network / API',
            page: path,
            tab: '',
            formName: 'API Request',
            buttonLabel: (Date.now() - lastClickedButtonTime < 5000 && lastClickedButtonLabel) ? lastClickedButtonLabel : `${method} Call`,
            fields: [],
            status: 'error',
            error: networkErr.message || 'Network connection dropped',
            responseCode: 0,
            table: url.split('/rest/v1/')[1]?.split('?')[0] || null
          });
        }
        throw networkErr;
      }

      // If backend returns an error (>= 400) on PostgREST or internal API
      if (isRestOrApi && response.status >= 400 && !url.includes('/api/plivo/wait-silence')) {
        try {
          const clone = response.clone();
          clone.json().then(errData => {
            const path = window.location.pathname;
            const table = url.includes('/rest/v1/') ? url.split('/rest/v1/')[1]?.split('?')[0] : null;
            const errMsg = errData?.message || errData?.error || `HTTP ${response.status} Error`;
            const matchingReg = CRM_PAGES_AND_FORMS_REGISTRY.find(r => r.targetTable === table);

            recordFormSubmission({
              module: matchingReg?.module || 'Backend API',
              page: matchingReg?.pageName || path,
              tab: matchingReg?.tab || '',
              formName: matchingReg?.formName || `${method} ${table || 'API'}`,
              buttonLabel: (Date.now() - lastClickedButtonTime < 5000 && lastClickedButtonLabel) ? lastClickedButtonLabel : `${method} Action`,
              fields: matchingReg?.fields || [],
              status: 'error',
              error: errMsg,
              responseCode: response.status,
              table
            });
          }).catch(() => {});
        } catch (_e) {}
      }

      return response;
    };
  }
}

// ==============================================================================
// CRM TOOLS & INTEGRATIONS CATALOG (All 22+ Core Tools)
// ==============================================================================
export const CRM_TOOLS_CATALOG = [
  // Database & Engine
  {
    id: 'tool_postgrest',
    category: 'Database & Storage',
    name: 'PostgreSQL PostgREST Engine',
    description: 'Core RESTful PostgREST database query engine and row-level operations',
    endpoint: '/api/system/health',
    testType: 'db_query'
  },
  {
    id: 'tool_supabase_auth',
    category: 'Database & Storage',
    name: 'Supabase Auth & Session Tokens',
    description: 'User authentication, active JWT validation, and secure session credentials',
    endpoint: 'supabase.auth',
    testType: 'auth_session'
  },
  {
    id: 'tool_realtime_ws',
    category: 'Database & Storage',
    name: 'Supabase Realtime WebSockets',
    description: 'Live bidirectional sync channel for call alerts, lead changes, and notifications',
    endpoint: 'supabase.realtime',
    testType: 'websocket'
  },

  // Telephony & Voice
  {
    id: 'tool_plivo_sdk',
    category: 'Telephony & Voice',
    name: 'Plivo WebRTC Calling SDK & Desk API',
    description: 'WebRTC audio softphone dialer, agent seat tokens, and SIP endpoint status',
    endpoint: '/api/plivo/token',
    testType: 'http_head'
  },
  {
    id: 'tool_plivo_endpoints',
    category: 'Telephony & Voice',
    name: 'Plivo SIP Endpoints & Seat Allocation',
    description: 'SIP credentials, desk agent registration, and WebRTC bridge mapping',
    endpoint: '/api/plivo/desk-data',
    testType: 'http_head'
  },
  {
    id: 'tool_call_routing',
    category: 'Telephony & Voice',
    name: 'Inbound & Outbound Call Routing Engine',
    description: 'Caller ID routing rules, conference bridge, and missed call handlers',
    endpoint: '/api/plivo/incoming-route',
    testType: 'http_head'
  },
  {
    id: 'tool_webrtc_media',
    category: 'Telephony & Voice',
    name: 'Microphone & WebRTC Media Access',
    description: 'Browser audio input capture and real-time voice media stream',
    endpoint: 'navigator.mediaDevices',
    testType: 'media_device'
  },

  // AI & Automation
  {
    id: 'tool_gemini_ai',
    category: 'AI & Automation',
    name: 'Google Gemini AI Engine & Gateway',
    description: 'Gemini LLM model generation, prompt streaming, and function calling gateway',
    endpoint: '/api/ai/models',
    testType: 'http_get'
  },
  {
    id: 'tool_ai_knowledge_rag',
    category: 'AI & Automation',
    name: 'Knowledge Base (RAG) Vector Embeddings',
    description: 'Document retrieval and contextual embedding storage for AI chat & assistants',
    endpoint: '/api/ai/knowledge',
    testType: 'http_get'
  },
  {
    id: 'tool_ai_voice_campaigns',
    category: 'AI & Automation',
    name: 'AI Voice Calling Campaign Engine',
    description: 'Autonomous outbound AI dialer queue, campaign dispatch, and speech generation',
    endpoint: '/api/ai/campaigns',
    testType: 'http_get'
  },

  // Messaging & Notifications
  {
    id: 'tool_whatsapp_cloud',
    category: 'Communication',
    name: 'WhatsApp Official Cloud API & Webhooks',
    description: 'Meta Cloud API webhook listener, HSM templates, and delivery notifications',
    endpoint: '/api/wa-webhook',
    testType: 'http_get'
  },
  {
    id: 'tool_whatsapp_unofficial',
    category: 'Communication',
    name: 'WhatsApp Unofficial QR Gateway',
    description: 'Local QR session multi-device daemon and direct WhatsApp message sender',
    endpoint: '/api/settings/crm-config',
    testType: 'http_get'
  },
  {
    id: 'tool_email_smtp',
    category: 'Communication',
    name: 'Email Campaign & SMTP Gateway',
    description: 'Transactional email delivery, campaign dispatcher, and SMTP credentials',
    endpoint: '/api/email/settings',
    testType: 'http_get'
  },
  {
    id: 'tool_broadcast_alerts',
    category: 'Communication',
    name: 'Platform Broadcast Notifications Engine',
    description: 'Real-time platform banner broadcasts and targeted recipient notifications',
    endpoint: '/api/broadcast-notifications?mode=inbox',
    testType: 'http_get'
  },

  // Data Sync & Offline Tools
  {
    id: 'tool_indexed_db',
    category: 'Client & Storage',
    name: 'IndexedDB Offline Storage Engine',
    description: 'Browser local DB storage for offline leads, cached records, and sync state',
    endpoint: 'indexedDB',
    testType: 'browser_storage'
  },
  {
    id: 'tool_fast_snapshot',
    category: 'Client & Storage',
    name: '0ms Fast Snapshot Hydration Engine',
    description: 'Instant lead table rendering without flicker using cached local snapshots',
    endpoint: 'fast_snapshot',
    testType: 'cache_check'
  },
  {
    id: 'tool_mutation_queue',
    category: 'Client & Storage',
    name: 'Offline Mutation Queue & Background Re-Sync',
    description: 'Background synchronization worker syncing offline user edits to Supabase',
    endpoint: 'sync_queue',
    testType: 'sync_queue'
  },
  {
    id: 'tool_local_storage',
    category: 'Client & Storage',
    name: 'LocalStorage Config & Session Storage',
    description: 'Config Master settings, page navigation rules, column widths, and theme state',
    endpoint: 'localStorage',
    testType: 'browser_storage'
  },

  // Integrations & Releases
  {
    id: 'tool_meta_leads',
    category: 'Integrations & Webhooks',
    name: 'Meta Lead Ads Webhook Receiver',
    description: 'Facebook Instant Forms & Lead Ads webhook receiver for instant capture',
    endpoint: '/api/webhooks/leads',
    testType: 'http_get'
  },
  {
    id: 'tool_android_apk_release',
    category: 'System & Releases',
    name: 'Android APK & App Distribution Endpoint',
    description: 'Live mobile APK download, version manifest, and update check (/api/public/android-apk)',
    endpoint: '/api/public/android-apk',
    testType: 'http_get'
  },
  {
    id: 'tool_audit_logger',
    category: 'Security & Governance',
    name: 'Central Activity & Security Audit Logger',
    description: 'Compliance audit trail recording employee actions, permission updates, and logins',
    endpoint: 'audit_logs',
    testType: 'db_table'
  },
  {
    id: 'tool_nodejs_server',
    category: 'System & Releases',
    name: 'Node.js Server Runtime & Memory Monitor',
    description: 'Next.js serverless runtime, memory heap headroom, and uptime health ping',
    endpoint: '/api/system/health',
    testType: 'http_get'
  }
];

// ==============================================================================
// CRM PAGES, SUB-PAGES, TABS & FORM BUTTONS REGISTRY
// ==============================================================================
export const CRM_PAGES_AND_FORMS_REGISTRY = [
  // 1. Sales & Pipeline
  {
    id: 'reg_leads_create',
    module: 'Sales & Pipeline',
    pageName: 'Lead Management',
    tab: 'Lead Data',
    formName: 'Add New Lead Form',
    buttonLabel: 'Create Lead',
    targetTable: 'leads',
    requiredColumns: ['id', 'our_company', 'status', 'phone', 'updated_at'],
    fields: ['name', 'phone', 'email', 'company', 'requirement', 'source', 'our_company']
  },
  {
    id: 'reg_leads_status',
    module: 'Sales & Pipeline',
    pageName: 'Lead Management',
    tab: 'Lead Profile Panel',
    formName: 'Lead Status & Stage Form',
    buttonLabel: 'Save Stage Change',
    targetTable: 'leads',
    requiredColumns: ['id', 'status', 'updated_at'],
    fields: ['status', 'sub_status', 'remarks', 'next_followup_date']
  },
  {
    id: 'reg_leads_assign',
    module: 'Sales & Pipeline',
    pageName: 'Lead Management',
    tab: 'Lead Profile Panel',
    formName: 'Assign Representative Form',
    buttonLabel: 'Assign Representative',
    targetTable: 'leads',
    requiredColumns: ['id', 'assigned_to'],
    fields: ['assigned_to', 'transfer_reason']
  },
  {
    id: 'reg_leads_note',
    module: 'Sales & Pipeline',
    pageName: 'Lead Management',
    tab: 'Activity Timeline',
    formName: 'Follow-up Note Form',
    buttonLabel: 'Save Remark',
    targetTable: 'lead_notes',
    requiredColumns: ['id', 'lead_id', 'note_text', 'created_by'],
    fields: ['note_text', 'lead_id', 'created_by']
  },
  {
    id: 'reg_orders_new',
    module: 'Channel Operations',
    pageName: 'Daily Order Follow-up',
    tab: 'All Orders',
    formName: 'Create Party Order Form',
    buttonLabel: 'Submit Order',
    targetTable: 'party_orders',
    requiredColumns: ['id', 'tenant_id', 'order_number', 'party_id', 'order_status'],
    fields: ['order_number', 'party_id', 'order_status', 'total_amount']
  },
  {
    id: 'reg_complaints_new',
    module: 'Channel Operations',
    pageName: 'Complaints Studio',
    tab: 'Complaints',
    formName: 'Customer Complaint Ticket Form',
    buttonLabel: 'Submit Complaint Ticket',
    targetTable: 'party_complaints',
    requiredColumns: ['id', 'tenant_id', 'ticket_number', 'ticket_status'],
    fields: ['ticket_number', 'party_id', 'issue_description', 'priority', 'ticket_status']
  },
  {
    id: 'reg_party_create',
    module: 'Party Master',
    pageName: 'Party Master Studio',
    tab: 'Party Master',
    formName: 'Party Master Profile Form',
    buttonLabel: 'Save Party Record',
    targetTable: 'party_master',
    requiredColumns: ['id', 'tenant_id', 'party_universal_code', 'firm_name'],
    fields: ['firm_name', 'party_universal_code', 'phone', 'gstin', 'city', 'state']
  },
  {
    id: 'reg_customer_create',
    module: 'Party Master',
    pageName: 'End Customers',
    tab: 'Customer Catalog',
    formName: 'Register End Customer Form',
    buttonLabel: 'Register Customer',
    targetTable: 'end_customers',
    requiredColumns: ['id', 'customer_code', 'full_name', 'mobile_1'],
    fields: ['full_name', 'mobile_1', 'address', 'city', 'operating_company']
  },

  // 2. Smart Attendance & HR
  {
    id: 'reg_attendance_punch',
    module: 'Smart Attendance',
    pageName: 'Punch Station',
    tab: 'Daily Punch Station',
    formName: 'Morning / Evening Punch Form',
    buttonLabel: 'Punch In / Punch Out',
    targetTable: 'attendance_records',
    requiredColumns: ['id', 'tenant_id', 'email', 'attendance_date'],
    fields: ['email', 'attendance_date', 'punch_time', 'location_lat', 'location_lng']
  },
  {
    id: 'reg_attendance_regularize',
    module: 'Smart Attendance',
    pageName: 'Regularization Studio',
    tab: 'Missing Punch / Regularize',
    formName: 'Missing Punch Regularization Form',
    buttonLabel: 'Submit Regularization Request',
    targetTable: 'attendance_regularization_requests',
    requiredColumns: ['id', 'tenant_id', 'email', 'attendance_date', 'request_type', 'status'],
    fields: ['attendance_date', 'request_type', 'in_time', 'out_time', 'reason']
  },
  {
    id: 'reg_attendance_leave',
    module: 'Smart Attendance',
    pageName: 'Leave Management',
    tab: 'My Leaves',
    formName: 'Employee Leave Application Form',
    buttonLabel: 'Submit Leave Application',
    targetTable: 'employee_leaves',
    requiredColumns: ['id', 'tenant_id', 'email', 'leave_type', 'from_date', 'status'],
    isServerSecured: true,
    fields: ['leave_type', 'from_date', 'to_date', 'total_days', 'reason']
  },
  {
    id: 'reg_attendance_shift',
    module: 'Smart Attendance',
    pageName: 'Shift Policies',
    tab: 'Shift Rules',
    formName: 'Multi-Shift Configuration Form',
    buttonLabel: 'Save Shift Rules',
    targetTable: 'attendance_shift_policies',
    requiredColumns: ['id', 'tenant_id', 'company_name', 'shift_name', 'grace_minutes', 'shifts'],
    fields: ['company_name', 'branch_name', 'shift_name', 'grace_minutes', 'shifts']
  },
  {
    id: 'reg_attendance_geofence',
    module: 'Smart Attendance',
    pageName: 'Geofencing Policy',
    tab: 'Office Geofencing',
    formName: 'Branch Geofence Coordinates Form',
    buttonLabel: 'Save Geofencing Coordinates',
    targetTable: 'tenant_branches',
    requiredColumns: ['id', 'tenant_id', 'tenant_code', 'branch_code', 'branch_name'],
    fields: ['branch_code', 'latitude', 'longitude', 'radius_meters', 'is_geofence_active']
  },

  // 3. Field Force & Tasks
  {
    id: 'reg_field_tasks',
    module: 'Field Force & Forms',
    pageName: 'Task Manager',
    tab: 'Field Tasks',
    formName: 'Create Field Task Form',
    buttonLabel: 'Assign Task',
    targetTable: 'field_tasks',
    requiredColumns: ['id', 'tenant_id', 'task_code', 'task_type', 'status'],
    fields: ['task_code', 'task_type', 'assigned_user', 'due_date', 'party_id', 'priority']
  },
  {
    id: 'reg_device_health',
    module: 'Field Force & Forms',
    pageName: 'Device Health Radar',
    tab: 'Device Health',
    formName: 'Device Health Sync Form',
    buttonLabel: 'Ping Device Health',
    targetTable: 'employee_device_health',
    requiredColumns: ['id', 'user_id', 'tenant_id'],
    fields: ['user_id', 'battery_level', 'gps_accuracy', 'network_type']
  },

  // 4. Productivity, Checklists & Delegation
  {
    id: 'reg_daily_checklist',
    module: 'Smart Checklist',
    pageName: 'Daily Checklists',
    tab: 'Checklist Execution',
    formName: 'Submit Daily Checklist Form',
    buttonLabel: 'Submit Daily Checklist',
    targetTable: 'checklist_submissions',
    requiredColumns: ['id', 'template_id', 'period_key', 'status', 'employee_email'],
    fields: ['template_id', 'period_key', 'answers', 'completed_items', 'employee_email']
  },
  {
    id: 'reg_delegation_task',
    module: 'Delegation Tasks',
    pageName: 'Task Delegation Studio',
    tab: 'Delegated Tasks',
    formName: 'Delegate Task Form',
    buttonLabel: 'Delegate Task Now',
    targetTable: 'delegation_tasks',
    requiredColumns: ['id', 'tenant_id', 'title', 'assigned_to_email', 'status'],
    fields: ['task_title', 'delegated_to', 'deadline_ist', 'priority', 'instructions']
  },

  // 5. Call Center & Telephony
  {
    id: 'reg_call_agent_sip',
    module: 'Call Center',
    pageName: 'Call Admin & SIP',
    tab: 'Agents & Endpoints',
    formName: 'SIP Endpoint Mapping Form',
    buttonLabel: 'Save SIP Credentials',
    targetTable: 'call_agents',
    requiredColumns: ['id', 'user_id', 'plivo_username', 'plivo_sip_uri', 'is_active'],
    fields: ['user_id', 'plivo_username', 'plivo_sip_uri', 'is_active']
  },
  {
    id: 'reg_call_session',
    module: 'Call Center',
    pageName: 'Telecalling Desk',
    tab: 'Docked Softphone',
    formName: 'Call Session Logger Form',
    buttonLabel: 'Hangup & Save Call Log',
    targetTable: 'call_sessions',
    requiredColumns: ['id', 'user_id', 'agent_id', 'customer_number', 'status', 'agent_call_uuid'],
    fields: ['customer_number', 'status', 'duration', 'hangup_source', 'recording_url']
  },

  // 6. User Management & Governance
  {
    id: 'reg_user_profile',
    module: 'User Management',
    pageName: 'User Roster',
    tab: 'Users',
    formName: 'Create / Update Employee Form',
    buttonLabel: 'Save Employee Profile',
    targetTable: 'user_roles',
    requiredColumns: ['id', 'user_id', 'tenant_id', 'emp_code', 'department', 'emp_official_mail_id'],
    fields: ['user_id', 'emp_code', 'department', 'assigned_shift', 'salary_amount', 'emp_official_mail_id']
  },
  {
    id: 'reg_user_permissions',
    module: 'User Management',
    pageName: 'Permission Matrix',
    tab: 'Roles & Permissions',
    formName: 'Permission Matrix Form',
    buttonLabel: 'Update Permission Matrix',
    targetTable: 'user_roles',
    requiredColumns: ['id', 'user_id', 'role'],
    fields: ['user_id', 'role', 'can_read', 'can_write', 'can_import_export', 'permissions']
  },

  // 7. Config Master & System Settings
  {
    id: 'reg_broadcast_notification',
    module: 'Config Master',
    pageName: 'Broadcast Notifications',
    tab: 'User Notifications',
    formName: 'Send Broadcast Announcement Form',
    buttonLabel: 'Publish Announcement',
    targetTable: 'crm_broadcasts',
    requiredColumns: ['id', 'title', 'message', 'recipient_count'],
    isServerSecured: true,
    fields: ['title', 'message', 'target_tenant', 'target_roles', 'priority', 'expires_at']
  },
  {
    id: 'reg_page_navigation',
    module: 'Config Master',
    pageName: 'Page Navigation Rules',
    tab: 'Page Navigation Rules',
    formName: 'Page Navigation & Pagination Form',
    buttonLabel: 'Save Navigation Settings',
    targetTable: 'system_settings',
    requiredColumns: ['key', 'value', 'updated_at'],
    fields: ['defaultPageSize', 'availablePageSizes', 'pageNumberingJump']
  },
  {
    id: 'reg_offline_policy',
    module: 'Config Master',
    pageName: 'Offline Rules',
    tab: 'Offline Rules & Sync Policy',
    formName: 'Offline Storage & Sync Policy Form',
    buttonLabel: 'Save Offline Policy',
    targetTable: 'system_settings',
    requiredColumns: ['key', 'value', 'updated_at'],
    fields: ['cacheExpiryMinutes', 'autoSyncInterval', 'maxPendingQueue']
  }
];
