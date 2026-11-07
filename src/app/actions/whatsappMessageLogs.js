'use server';

import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/supabase/adminClient';
import { getSubItemPermissions } from '@/utils/permissionUtils';
import { resolveKnownTenant } from '@/app/actions/tenantBranches';
import { WHATSAPP_LOG_VIEW_IDS } from '@/config/whatsappMessageLogsConfig';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT_CODE = /^TNT\d{5,}$/;
const BRANCH_CODE = /^TNT\d{5,}-B\d{4,}$/;
const PAGE_SIZE = 500;
const normalized = value => String(value || '').trim().toLowerCase();

function timestamp(value) {
  // Preserve database microseconds: rounding a keyset cursor to milliseconds
  // would repeat or skip rows that share the same millisecond.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('Invalid sync timestamp.');
  }
  return value;
}

function dateBound(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Select a valid date range.');
  const date = new Date(`${value}T00:00:00+05:30`);
  if (!Number.isFinite(date.getTime()) || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date) !== value) throw new Error('Select a valid date range.');
  return date;
}

function safeText(value) {
  return String(value || '')
    .replace(/https?:\/\/\S+/gi, '[provider URL]')
    .replace(/\b(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi, '[internal reference]')
    .replace(/\b(?:Bearer\s+\S+|eyJ[A-Za-z0-9._-]+)\b/gi, '[redacted]')
    .replace(/((?:api[_ -]?key|access[_ -]?token|auth[_ -]?token|authorization)["']?\s*[=:]\s*["']?)[^\s"',;}\]]+/gi, '$1[redacted]')
    .slice(0, 800);
}

function branchAliases(branch, tenant) {
  const aliases = [branch.branch_code, branch.branch_name, branch.legacy_code, branch.custom_code];
  if (normalized(branch.legacy_code || branch.custom_code) === 'nstlp') aliases.push('NSTL');
  if (normalized(branch.location_type).includes('headquarter')) {
    aliases.push(tenant.tenant_code, tenant.name, String(tenant.name || '').replace(/\s+/g, '_'));
  }
  return [...new Set(aliases.filter(Boolean).map(normalized))];
}

async function logLookups(db, tenant) {
  let branches = [];
  let frequencyRules = [];
  const warnings = [];
  try {
    const { data, error } = await db.from('tenant_branches')
      .select('branch_code,branch_name,legacy_code,custom_code,location_type,is_active')
      .eq('tenant_id', tenant.id).order('branch_code').limit(1000);
    if (error) throw error;
    branches = (data || []).filter(branch => BRANCH_CODE.test(branch.branch_code || '')
      && branch.branch_code.startsWith(`${tenant.tenant_code}-B`) && branch.is_active !== false)
      .map(branch => ({ code: branch.branch_code, name: safeText(branch.branch_name), aliases: branchAliases(branch, tenant) }));
  } catch {
    warnings.push('Branch list could not be loaded. Refresh to retry.');
  }
  try {
    // Company aliases are obtained only from this verified tenant and its branches.
    const aliases = [...new Set(['All', '', tenant.tenant_code, tenant.name,
      String(tenant.name || '').replace(/\s+/g, '_'), ...branches.flatMap(branch => [branch.code, branch.name, ...branch.aliases])]
      .filter(value => typeof value === 'string').flatMap(value => [value, value.toLowerCase(), value.toUpperCase()]))];
    const quoted = aliases.map(value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
    const { data, error } = await db.from('whatsapp_automations').select('template_id,frequency,company')
      .or(`company.is.null,company.in.(${quoted})`).limit(5000);
    if (error) throw error;
    frequencyRules = (data || []).map(rule => ({
      templateId: rule.template_id, company: normalized(rule.company) || 'all', frequency: safeText(rule.frequency)
    }));
  } catch {
    warnings.push('Automation frequency settings could not be loaded. Refresh to retry.');
  }
  return { branches, frequencyRules, lookupWarning: warnings.join(' ') };
}

function logView(row, tenantCode, branches) {
  const raw = String(row.status || '');
  const failed = /^failed\b/i.test(raw);
  const sent = /^sent\b/i.test(raw);
  const phone = raw.match(/^(?:sent\s+to|failed\s+for)\s+(\+?[\d ()-]+)/i)?.[1]?.replace(/[^\d+]/g, '') || '';
  const error = failed ? raw.replace(/^failed\s+for\s+[^:]+:\s*/i, '') : '';
  const operatingCompany = normalized(row.lead?.our_company);
  const matchingBranches = branches.filter(branch => branch.aliases.includes(operatingCompany));
  const branch = matchingBranches.length === 1 ? matchingBranches[0] : null;
  return {
    id: row.id,
    leadId: row.lead_id,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    tenantCode,
    branchCode: branch?.code || '',
    branchName: branch?.name || '',
    templateId: row.template_id,
    frequencyScopes: [...new Set([operatingCompany, ...(branch?.aliases || [])].filter(Boolean))],
    recipient: phone,
    leadName: safeText(row.lead?.name || row.lead?.company || 'Unknown customer'),
    customerCompany: safeText(row.lead?.company),
    templateName: safeText(row.template?.template_name || 'Unavailable template'),
    campaignName: safeText(row.template?.campaign_name),
    status: failed ? 'failed' : sent ? 'sent' : 'other',
    error: safeText(error),
    detail: failed || sent ? '' : safeText(raw)
  };
}

// Read-only endpoint. Existing dispatch and logging code is deliberately unchanged.
export async function getWhatsappMessageLogs(input = {}) {
  try {
    const session = await createClient();
    const { data: { user }, error: authError } = await session.auth.getUser();
    if (authError || !user) return { success: false, denied: true, error: 'Please sign in again.' };

    const db = getAdminClient();
    const { data: role, error: roleError } = await db.from('user_roles').select('*').eq('user_id', user.id).maybeSingle();
    if (roleError) throw roleError;
    const master = normalized(user.email) === 'supujacreations@gmail.com'
      || ['masteradmin', 'master_admin'].includes(normalized(role?.role)) || role?.module_access?.is_master_admin === true;
    const permissions = getSubItemPermissions(role?.module_access, role?.role, 'whatsapp_official', 'sent_logs');
    if (!role || role.is_approved === false || ['inactive', 'terminated', 'suspended'].includes(normalized(role.emp_status || role.module_access?.emp_status))
      || (!master && (role.can_read === false || !permissions.view))) {
      return { success: false, denied: true, error: 'You do not have access to API message logs.' };
    }
    const allowedViews = master ? WHATSAPP_LOG_VIEW_IDS : WHATSAPP_LOG_VIEW_IDS.filter(id => getSubItemPermissions(role.module_access, role.role, 'whatsapp_official', id).view);
    const canReadRaw = allowedViews.includes('sent_logs_raw');
    const canReadCustomers = canReadRaw || allowedViews.includes('sent_logs_customers');

    let ownIdentity = role.tenant_id || role.module_access?._tenantId;
    if (!ownIdentity) {
      const known = await resolveKnownTenant(role.company);
      ownIdentity = known.tenantId || known.tenantCode;
    }
    const requested = String(input.tenantId || ownIdentity || '').trim();
    if (!master && !ownIdentity) {
      return { success: false, denied: true, error: 'Workspace access denied.' };
    }
    if (requested && !UUID.test(requested) && !TENANT_CODE.test(requested)) throw new Error('Invalid workspace.');
    let tenantQuery = db.from('tenants').select('id,tenant_code,name,status').order('tenant_code').limit(1000);
    if (!master) tenantQuery = UUID.test(ownIdentity) ? tenantQuery.eq('id', ownIdentity) : tenantQuery.eq('tenant_code', ownIdentity);
    const { data: tenants, error: tenantError } = await tenantQuery;
    if (tenantError) throw tenantError;
    const available = (tenants || []).filter(tenant => TENANT_CODE.test(tenant.tenant_code || '')
      && !['SUSPENDED', 'ARCHIVED', 'DRAFT'].includes(String(tenant.status).toUpperCase()));
    const tenant = requested ? available.find(item => item.id === requested || item.tenant_code === requested) : master ? available[0] : null;
    if (!tenant) return { success: false, denied: true, error: 'Workspace access unavailable.' };

    const start = dateBound(input.fromDate);
    const lastDay = dateBound(input.toDate);
    if (start > lastDay) throw new Error('From date must be before or equal to To date.');
    const end = new Date(lastDay.getTime() + 86400000);
    const until = input.until ? timestamp(input.until) : new Date().toISOString();
    let query = db.from('whatsapp_message_logs')
      .select('id,lead_id,template_id,created_at,sent_at,status,lead:leads!inner(name,company,tenant_id,our_company),template:whatsapp_templates(template_name,campaign_name)')
      .eq('lead.tenant_id', tenant.id)
      .gte('created_at', start.toISOString()).lt('created_at', end.toISOString())
      .lte('created_at', until)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(PAGE_SIZE + 1);
    if (input.after) query = query.gt('created_at', timestamp(input.after));
    if (input.cursor) {
      const cursorTime = timestamp(input.cursor.createdAt);
      if (!UUID.test(input.cursor.id || '')) throw new Error('Invalid sync cursor.');
      query = query.or(`created_at.gt.${cursorTime},and(created_at.eq.${cursorTime},id.gt.${input.cursor.id})`);
    }
    const [{ data, error }, lookups] = await Promise.all([query, logLookups(db, tenant)]);
    if (error) throw error;
    const hasMore = data.length > PAGE_SIZE;
    const page = data.slice(0, PAGE_SIZE);
    const last = page[page.length - 1];
    return {
      success: true,
      data: page.map(row => {
        const view = logView(row, tenant.tenant_code, lookups.branches);
        return { ...view, error: canReadRaw ? view.error : '', detail: canReadRaw ? view.detail : '',
          recipient: canReadCustomers ? view.recipient : '', leadName: canReadCustomers ? view.leadName : 'Customer', customerCompany: canReadCustomers ? view.customerCompany : '' };
      }),
      allowedViews,
      tenantId: tenant.id,
      tenantCode: tenant.tenant_code,
      tenants: available.map(item => ({ id: item.id, code: item.tenant_code, name: safeText(item.name) })),
      ...lookups,
      until,
      hasMore,
      nextCursor: hasMore ? { createdAt: last.created_at, id: last.id } : null
    };
  } catch (error) {
    console.warn('WhatsApp API log refresh failed:', error.code || error.name || 'query_error');
    return { success: false, error: 'API message logs could not be refreshed. Please try again.' };
  }
}
