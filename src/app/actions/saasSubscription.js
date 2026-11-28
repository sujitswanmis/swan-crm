'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { createHash, randomUUID } from 'node:crypto';
import { formatBranchStandard } from '@/utils/branchAccess';
import { requireSaasMaster, requireSaasTenant, userBelongsToSaasTenant, isSaasUserActive, SAAS_UUID } from '@/lib/saasAccess';
import { saasNumber, saasDateKey, saasEndOfDay, saasAddMonths, saasInvoiceAmounts, calculateSaasPrice, SAAS_CYCLE_MONTHS, SAAS_INTERNAL_KEYS } from '@/lib/saasBilling';
import {
  DEFAULT_TENANT_ID,
  DEFAULT_PROCESS_CATALOG,
  DEFAULT_CYCLE_DISCOUNTS
} from '@/utils/saasEntitlements';
import { computeTenantModuleUsage } from '@/lib/saasSeatLimits';

const SMTP_LIMITS_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'tenant_smtp_limits.json');

async function readLocalSmtpLimits() {
  try {
    const content = await fs.readFile(SMTP_LIMITS_FILE_PATH, 'utf-8');
    return JSON.parse(content || '{}');
  } catch {
    return {};
  }
}

async function writeLocalSmtpLimits(limits) {
  try {
    const dir = path.dirname(SMTP_LIMITS_FILE_PATH);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(SMTP_LIMITS_FILE_PATH, JSON.stringify(limits, null, 2), 'utf-8');
  } catch (err) {
    console.error('writeLocalSmtpLimits error:', err);
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MASTER_HQ_IDS = new Set([
  '0a37b8e8-1c28-4e19-8891-951fc3f8f8af',
  'e7d483b2-3fcb-4eb2-9d39-e932b7bb5ff4'
]);

/** Return true when a tenant row or identifier represents the permanent Master HQ workspace. */
function isMasterHqTenant(t) {
  if (!t) return false;
  if (typeof t === 'string') {
    const v = t.trim().toLowerCase();
    return MASTER_HQ_IDS.has(v) || v === 'tnt00001' || v === 'supuja_creations' || v === 'supuja creations';
  }
  const idLower = String(t.id || '').trim().toLowerCase();
  const codeLower = String(t.tenant_code || '').trim().toLowerCase();
  const nameLower = String(t.name || '').trim().toLowerCase();
  return (
    MASTER_HQ_IDS.has(idLower) ||
    codeLower === 'tnt00001' ||
    codeLower === 'supuja_creations' ||
    nameLower === 'supuja creations'
  );
}

function isValidUuid(val) {
  return Boolean(val && UUID_REGEX.test(String(val).trim()));
}

async function resolveSaasTenantUuid(admin, tenantId) {
  const raw = String(tenantId || '').trim();
  if (isValidUuid(raw)) return raw;
  if (!raw || /[(),]/.test(raw)) throw new Error('A valid workspace is required.');
  const { data, error } = await admin.from('tenants').select('id, name, tenant_code');
  if (error) throw error;
  const matches = (data || []).filter(t => [t.name, t.tenant_code].some(value => String(value || '').trim().toLowerCase() === raw.toLowerCase()));
  if (matches.length !== 1) throw new Error('Workspace could not be resolved uniquely.');
  return matches[0].id;
}

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const CONFIG_ENTITLEMENT_KEY = 'SAAS_PRICING_CONFIG';

/**
 * Fetch dynamic pricing config from DB or fallback
 */
async function getDynamicConfig(adminClient, strict = false) {
  try {
    const { data, error } = await adminClient
      .from('tenant_entitlements')
      .select('config_json')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('module_key', CONFIG_ENTITLEMENT_KEY)
      .maybeSingle();

    if (error) throw error;
    if (data?.config_json) {
      return data.config_json;
    }
  } catch (err) {
    if (strict) throw err;
    console.warn('getDynamicConfig fallback notice:', err.message);
  }
  return null;
}

/**
 * Get active process catalog with live pricing
 */
export async function getProcessCatalog(tenantId = null) {
  try {
    const admin = getAdminClient();
    const config = await getDynamicConfig(admin);
    const catalogRates = config?.rates || {};
    const customModules = config?.custom_modules || [];

    // Base catalog from DEFAULT_PROCESS_CATALOG
    let catalog = DEFAULT_PROCESS_CATALOG.map(item => ({
      ...item,
      monthly_rate_per_user: typeof catalogRates[item.process_code] === 'number'
        ? catalogRates[item.process_code]
        : item.monthly_rate_per_user
    }));

    // Append dynamic custom modules added by Super Admin
    for (const cMod of customModules) {
      const existingIdx = catalog.findIndex(x => x.process_code === cMod.process_code);
      const modObj = {
        process_code: cMod.process_code,
        display_name: cMod.display_name,
        category: cMod.category || 'OPERATIONS',
        description: cMod.description || '',
        monthly_rate_per_user: typeof catalogRates[cMod.process_code] === 'number'
          ? catalogRates[cMod.process_code]
          : Number(cMod.monthly_rate_per_user || 99),
        is_active: cMod.is_active !== false,
        is_custom_added: true
      };
      if (existingIdx >= 0) {
        catalog[existingIdx] = modObj;
      } else {
        catalog.push(modObj);
      }
    }

    // If tenantId specified, check for tenant negotiated custom rates
    if (tenantId && tenantId !== DEFAULT_TENANT_ID && config?.tenant_rates?.[tenantId]) {
      const tenantRates = config.tenant_rates[tenantId];
      catalog = catalog.map(item => ({
        ...item,
        monthly_rate_per_user: typeof tenantRates[item.process_code] === 'number'
          ? tenantRates[item.process_code]
          : item.monthly_rate_per_user,
        is_custom_negotiated: typeof tenantRates[item.process_code] === 'number'
      }));
    }

    return { success: true, catalog };
  } catch (err) {
    console.error('getProcessCatalog error:', err);
    return { success: true, catalog: DEFAULT_PROCESS_CATALOG };
  }
}

/**
 * Super Admin: Add a new custom module to the process catalog
 */
export async function addNewProcessModule({
  processCode,
  displayName,
  category = 'OPERATIONS',
  description = '',
  monthlyRate = 99
}) {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    if (!processCode || !displayName) {
      throw new Error('Module Code और Display Name आवश्यक हैं।');
    }

    const cleanCode = String(processCode).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const cleanName = String(displayName).trim();
    if (!cleanName || !/^[A-Z][A-Z0-9_]{1,63}$/.test(cleanCode) || SAAS_INTERNAL_KEYS.has(cleanCode)) throw new Error('Choose a valid business module code and name.');
    if (DEFAULT_PROCESS_CATALOG.some(p => p.process_code === cleanCode)) throw new Error('This module already exists. Use its rate editor.');
    const rate = saasNumber(monthlyRate, 'Monthly rate');

    const config = (await getDynamicConfig(admin, true)) || {};
    const customModules = config.custom_modules || [];
    const rates = config.rates || {};

    const existingIdx = customModules.findIndex(m => m.process_code === cleanCode);
    const newModule = {
      process_code: cleanCode,
      display_name: cleanName,
      category: category || 'OPERATIONS',
      description: description || '',
      monthly_rate_per_user: rate,
      is_active: true,
      created_at: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      customModules[existingIdx] = newModule;
    } else {
      customModules.push(newModule);
    }

    rates[cleanCode] = rate;
    config.custom_modules = customModules;
    config.rates = rates;
    config.updated_at = new Date().toISOString();

    const { error } = await admin
      .from('tenant_entitlements')
      .upsert({
        tenant_id: DEFAULT_TENANT_ID,
        module_key: CONFIG_ENTITLEMENT_KEY,
        is_enabled: true,
        config_json: config
      }, { onConflict: 'tenant_id,module_key' });

    if (error) throw error;

    return {
      success: true,
      module: newModule,
      message: `नया मॉड्यूल '${cleanName}' (${cleanCode}) कैटलॉग में सफलतापूर्वक जुड़ गया!`
    };
  } catch (err) {
    console.error('addNewProcessModule error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get billing cycles and active discount rates
 */
export async function getCycleDiscounts() {
  try {
    const admin = getAdminClient();
    const config = await getDynamicConfig(admin);
    const discountsMap = config?.discounts || {};

    const cycles = DEFAULT_CYCLE_DISCOUNTS.map(cycle => ({
      ...cycle,
      discount_percent: typeof discountsMap[cycle.cycle_code] === 'number'
        ? discountsMap[cycle.cycle_code]
        : cycle.discount_percent
    }));

    return { success: true, cycles };
  } catch (err) {
    console.error('getCycleDiscounts error:', err);
    return { success: true, cycles: DEFAULT_CYCLE_DISCOUNTS };
  }
}

/**
 * Calculate dynamic plan pricing
 */
export async function calculatePlanPrice({
  processCodes = [],
  userSeats = 1,
  cycleCode = 'MONTHLY',
  tenantId = null
}) {
  try {
    const {
      success,
      catalog,
      error
    } = await getProcessCatalog(tenantId);
    if (!success) throw new Error(error || 'Pricing unavailable.');
    const {
      cycles
    } = await getCycleDiscounts();
    const cycle = cycles.find(c => c.cycle_code === cycleCode);
    if (!cycle) throw new Error('Invalid billing cycle.');
    const codes = [...new Set(processCodes)];
    const items = catalog.filter(p => codes.includes(p.process_code) && p.is_active !== false && !SAAS_INTERNAL_KEYS.has(p.process_code));
    if (!codes.length || items.length !== codes.length) throw new Error('Choose valid active modules.');
    if (codes.includes('LEADS_WITH_CALLING') && codes.some(c => ['LEADS_ONLY', 'CALLING_STANDALONE'].includes(c))) throw new Error('Choose the CRM combo or standalone modules, not both.');
    const seats = saasNumber(userSeats, 'Seats', {
      min: 1,
      max: 100000,
      integer: true
    });
    const price = calculateSaasPrice({
      items,
      seats,
      months: cycle.months_count,
      discountPercent: cycle.discount_percent
    });
    return {
      success: true,
      selected_count: items.length,
      seats,
      cycle_code: cycle.cycle_code,
      months: cycle.months_count,
      discount_percent: cycle.discount_percent,
      rate_per_seat_monthly: price.rate,
      monthly_total: price.rate * seats,
      gross_total: price.gross,
      discount_amount: price.discountAmount,
      final_amount: price.amount
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Get tenant subscription details and status
 */
export async function getTenantSubscription(tenantId = DEFAULT_TENANT_ID) {
  try {
    const admin = getAdminClient();
    const target = await resolveSaasTenantUuid(admin, tenantId);
    await requireSaasTenant(admin, target);
    const [{ data: tenantRow }, { data: sub, error }] = await Promise.all([
      admin.from('tenants').select('id,name,tenant_code').eq('id', target).maybeSingle(),
      admin.from('tenant_subscriptions').select('*').eq('tenant_id', target).order('created_at', {
        ascending: false
      }).limit(1).maybeSingle()
    ]);
    if (error) throw error;
    const isMasterHq = isMasterHqTenant(tenantRow) || isMasterHqTenant(target) || isMasterHqTenant(tenantId);
    if (isMasterHq) {
      return {
        success: true,
        subscription: {
          ...(sub || { tenant_id: target, plan_name: 'MASTER_HQ_LIFETIME', user_seat_limit: 999 }),
          days_remaining: null,
          is_expired: false,
          is_expiring_soon: false,
          is_master_hq: true,
          never_expires: true,
          status: 'ACTIVE'
        }
      };
    }
    if (!sub) return {
      success: false,
      error: 'Subscription not found',
      subscription: null
    };
    const { daysRemaining, isExpired, isExpiringSoon } = getIstDaysSummary(sub.valid_until);
    const days = daysRemaining ?? 0;
    return {
      success: true,
      subscription: {
        ...sub,
        days_remaining: days,
        is_expired: isExpired,
        is_expiring_soon: isExpiringSoon,
        is_master_hq: false,
        never_expires: false,
        status: isExpired ? 'EXPIRED' : isExpiringSoon && sub.status === 'ACTIVE' ? 'EXPIRING_SOON' : sub.status
      }
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      subscription: null
    };
  }
}

/**
 * Get map of all enabled modules for a tenant
 */
export async function getTenantEntitlements(tenantId = DEFAULT_TENANT_ID) {
  try {
    const admin = getAdminClient();
    const target = await resolveSaasTenantUuid(admin, tenantId);
    await requireSaasTenant(admin, target);
    const [{ data: tenantRow }, { data: rows, error }] = await Promise.all([
      admin.from('tenants').select('id,name,tenant_code').eq('id', target).maybeSingle(),
      admin.from('tenant_entitlements').select('module_key,is_enabled').eq('tenant_id', target)
    ]);
    if (error) throw error;
    const entitlements = Object.fromEntries((rows || []).map(r => [r.module_key, r.is_enabled === true]));
    if (isMasterHqTenant(tenantRow) || isMasterHqTenant(target) || (!rows?.length && target === DEFAULT_TENANT_ID)) {
      DEFAULT_PROCESS_CATALOG.forEach(p => {
        entitlements[p.process_code] = true;
      });
    }
    return {
      success: true,
      entitlements
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      entitlements: {}
    };
  }
}

/**
 * Super Admin: Update process price dynamically
 */
export async function updateProcessRate(processCode, newMonthlyRate) {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    const config = (await getDynamicConfig(admin, true)) || {};
    const rates = config.rates || {};
    if (![...DEFAULT_PROCESS_CATALOG, ...(config.custom_modules || [])].some(p => p.process_code === processCode)) throw new Error('Unknown module.');
    rates[processCode] = saasNumber(newMonthlyRate, 'Monthly rate');

    config.rates = rates;
    config.updated_at = new Date().toISOString();

    const { error } = await admin
      .from('tenant_entitlements')
      .upsert({
        tenant_id: DEFAULT_TENANT_ID,
        module_key: CONFIG_ENTITLEMENT_KEY,
        is_enabled: true,
        config_json: config
      }, { onConflict: 'tenant_id,module_key' });

    if (error) throw error;
    return { success: true, message: `Price for ${processCode} updated to ₹${newMonthlyRate}` };
  } catch (err) {
    console.error('updateProcessRate error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Super Admin: Update cycle discount dynamically
 */
export async function updateCycleDiscount(cycleCode, newDiscountPercent) {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    const config = (await getDynamicConfig(admin, true)) || {};
    const discounts = config.discounts || {};
    if (!SAAS_CYCLE_MONTHS[cycleCode]) throw new Error('Invalid billing cycle.');
    discounts[cycleCode] = saasNumber(newDiscountPercent, 'Discount', {max:100});

    config.discounts = discounts;
    config.updated_at = new Date().toISOString();

    const { error } = await admin
      .from('tenant_entitlements')
      .upsert({
        tenant_id: DEFAULT_TENANT_ID,
        module_key: CONFIG_ENTITLEMENT_KEY,
        is_enabled: true,
        config_json: config
      }, { onConflict: 'tenant_id,module_key' });

    if (error) throw error;
    return { success: true, message: `Discount for ${cycleCode} updated to ${newDiscountPercent}%` };
  } catch (err) {
    console.error('updateCycleDiscount error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch all tenants with active subscriptions and user counts for Super Admin
 */
export async function getAllTenantsWithSubscriptions() {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    const { data: tenantsList, error: tErr } = await admin
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });

    if (tErr) throw tErr;
    const {catalog: billableCatalog} = await getProcessCatalog();
    const pricingConfig = await getDynamicConfig(admin);
    const billableKeys = new Set((billableCatalog || []).map(p => p.process_code));

    const { data: subsList, error: subsError } = await admin
      .from('tenant_subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: entitlementsList, error: entitlementsError } = await admin
      .from('tenant_entitlements')
      .select('tenant_id, module_key, is_enabled, config_json');

    const { data: userCounts, error: userCountError } = await admin
      .from('user_roles')
      .select('tenant_id, company, user_id, role, emp_official_mail_id, email, is_approved, emp_status, module_access');

    const { data: pendingEvents } = await admin
      .from('saas_billing_events')
      .select('tenant_id, operation, invoice_number, invoice')
      .in('operation', ['MODULE_PROFORMA', 'ADDON_PROFORMA', 'RENEWAL_PROFORMA']);

    // Load telephony & forward settings from call_agents for enrichment
    const { data: systemAgents } = await admin
      .from('call_agents')
      .select('plivo_username, mobile_number, agent_code, plivo_endpoint_key, plivo_password')
      .or('plivo_username.like.system_telephony_config_%,plivo_username.like.system_settings_forward_%');

    const systemTelMap = {};
    const systemFwdMap = {};
    (systemAgents || []).forEach(sa => {
      const u = sa.plivo_username || '';
      if (u.startsWith('system_telephony_config_')) {
        const key = u.replace('system_telephony_config_', '').toLowerCase();
        let parsed = {};
        try { parsed = JSON.parse(sa.plivo_password || '{}'); } catch (_) {}
        systemTelMap[key] = {
          mode: sa.agent_code || parsed.mode || 'managed',
          from_number: sa.mobile_number || parsed.from_number || '',
          calling_seat_limit: parseInt(sa.plivo_endpoint_key, 10) || parsed.calling_seat_limit || 5,
          auth_id: parsed.auth_id || '',
          auth_token: parsed.auth_token || '',
          default_forward: parsed.default_forward || ''
        };
      } else if (u.startsWith('system_settings_forward')) {
        const key = u.replace('system_settings_forward_', '').replace('system_settings_forward', '').toLowerCase();
        systemFwdMap[key] = sa.mobile_number || '';
      }
    });

    // Load tenant SMTP limits map
    const limitsRes = await getTenantSmtpLimitsMap();
    const smtpLimitsMap = limitsRes?.limits || {};

    // Load local branches for enrichment
    let localBranchMap = {};
    try {
      const branchesFilePath = path.join(process.cwd(), 'src', 'config', 'tenant_branches.json');
      const bContent = await fs.readFile(branchesFilePath, 'utf-8');
      localBranchMap = JSON.parse(bContent || '{}');
    } catch (_) {}

    if (subsError || entitlementsError || userCountError) throw subsError || entitlementsError || userCountError;
    const now = new Date();

    const expiringForAutoPi = [];
    const enriched = (tenantsList || []).map(t => {
      const sub = (subsList || []).find(s => s.tenant_id === t.id);
      const tEntitlements = (entitlementsList || [])
        .filter(e => e.tenant_id === t.id && e.is_enabled && billableKeys.has(e.module_key))
        .map(e => e.module_key);

      const activeTenantUsers = (userCounts || []).filter(u => userBelongsToSaasTenant(u, t, tenantsList) && isSaasUserActive(u));
      const activeUserCount = activeTenantUsers.length;

      const isMasterHq = isMasterHqTenant(t);
      let daysRemaining = null;
      let isExpired = false;
      let isExpiringSoon = false;

      if (!isMasterHq && sub?.valid_until) {
        ({ daysRemaining, isExpired, isExpiringSoon } = getIstDaysSummary(sub.valid_until));
        if ((isExpired || isExpiringSoon) && !['ARCHIVED', 'DELETED', 'DRAFT', 'SUSPENDED'].includes(t.status) && !['SUSPENDED', 'READ_ONLY', 'ARCHIVED'].includes(sub?.status)) {
          expiringForAutoPi.push({ tenant: t, sub });
        }
      }

      let resolvedStatus = 'ACTIVE';
      if (isMasterHq) {
        resolvedStatus = 'ACTIVE';
      } else if (t.status === 'ARCHIVED' || t.status === 'DELETED') {
        resolvedStatus = 'DELETED';
      } else if (t.status === 'DRAFT') {
        resolvedStatus = 'DRAFT';
      } else if (['SUSPENDED','READ_ONLY','GRACE_PERIOD'].includes(t.status)) {
        resolvedStatus = t.status;
      } else if (['SUSPENDED','READ_ONLY','ARCHIVED'].includes(sub?.status)) {
        resolvedStatus = sub.status;
      } else if (t.status === 'TRIAL' || sub?.status === 'TRIAL' || String(sub?.billing_cycle || '').startsWith('TRIAL')) {
        resolvedStatus = isExpired ? 'EXPIRED' : 'TRIAL';
      } else if (isExpired) {
        resolvedStatus = 'EXPIRED';
      } else if (isExpiringSoon) {
        resolvedStatus = 'EXPIRING_SOON';
      } else {
        resolvedStatus = sub?.status || t.status || 'ACTIVE';
      }

      // Resolve branches for this tenant (e.g. TNT00002-B0001, etc.)
      let branches = [];
      const branchList = localBranchMap[t.name] || (t.id === DEFAULT_TENANT_ID ? localBranchMap['New Swan Group'] : null) || [];
      if (Array.isArray(branchList) && branchList.length > 0) {
        branches = branchList.map(formatBranchStandard);
      } else if (t.id === DEFAULT_TENANT_ID || t.tenant_code === 'TNT00002') {
        branches = ['TNT00002-B0001', 'TNT00002-B0002', 'TNT00002-B0003'].map(formatBranchStandard);
      } else {
        branches = (t.branches || []).map(formatBranchStandard);
      }

      const smtpLimit = isMasterHq 
        ? 999 
        : (Number(smtpLimitsMap[t.id]) || Number(smtpLimitsMap[t.tenant_code]) || Number(smtpLimitsMap[t.name]) || 1);

      const telEnt = (entitlementsList || []).find(e => e.tenant_id === t.id && e.module_key === 'TELEPHONY_CONFIG');
      const telConfig = telEnt?.config_json || {};
      const slug = String(t.name || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
      const fallbackTel = systemTelMap[slug] || {};
      const fallbackFwd = systemFwdMap[slug] || (t.id === DEFAULT_TENANT_ID ? (systemFwdMap[''] || process.env.DEFAULT_FORWARD_TO || '') : '');

      const callingSeatLimit = isMasterHq ? 300 : (Number(telConfig.calling_seat_limit) || fallbackTel.calling_seat_limit || 5);
      const callingMode = isMasterHq ? 'managed' : (telConfig.mode || fallbackTel.mode || 'managed');
      const defaultForward = telConfig.default_forward || fallbackTel.default_forward || fallbackFwd || '';
      const authId = telConfig.auth_id || fallbackTel.auth_id || (isMasterHq ? (process.env.PLIVO_AUTH_ID || '') : '');
      const authToken = telConfig.auth_token || fallbackTel.auth_token || (isMasterHq ? (process.env.PLIVO_AUTH_TOKEN || '') : '');
      const fromNumber = telConfig.from_number || fallbackTel.from_number || process.env.PLIVO_FROM_NUMBER || '+918035340622';

      const seatLimitValue = sub?.user_seat_limit || (t.id === DEFAULT_TENANT_ID ? 200 : 5);
      const hasComboLeadCalling = tEntitlements.includes('LEADS_WITH_CALLING');
      const entDetails = (billableCatalog || [])
        .filter(p => tEntitlements.includes(p.process_code))
        .map(p => {
          const entRow = (entitlementsList || []).find(e => e.tenant_id === t.id && e.module_key === p.process_code);
          const customLicensed = Number(entRow?.config_json?.licensed_seats);
          const licensedSeats = customLicensed > 0 ? customLicensed : seatLimitValue;
          const isRedundantCombo = hasComboLeadCalling && (p.process_code === 'LEADS_ONLY' || p.process_code === 'CALLING_STANDALONE');
          const effectiveRate = pricingConfig?.tenant_rates?.[t.id]?.[p.process_code] ?? p.monthly_rate_per_user;
          const usage = computeTenantModuleUsage(activeTenantUsers, p.process_code, { includeUsersList: false });
          return {
            module_key: p.process_code,
            display_name: p.display_name,
            monthly_rate_per_user: effectiveRate,
            licensed_seats: licensedSeats,
            has_custom_seats: Boolean(customLicensed > 0),
            included_in_combo: isRedundantCombo,
            used_seats: usage.used_seats,
            staff_used_seats: usage.staff_used_seats,
            admin_used_seats: usage.admin_used_seats
          };
        });
      const pendingRequests = (pendingEvents || [])
        .filter(ev => ev.tenant_id === t.id && String(ev.invoice?.status || '').toUpperCase() === 'PENDING')
        .map(ev => ({
          invoice_number: ev.invoice_number,
          operation: ev.operation,
          category: ev.invoice?.category || ev.operation,
          description: ev.invoice?.description || '',
          module_key: ev.invoice?.module_key || null,
          module_name: ev.invoice?.module_name || null,
          requested_users: ev.invoice?.requested_users ? Number(ev.invoice.requested_users) : null,
          additional_seats: Number(ev.invoice?.additional_seats || 0),
          amount: Number(ev.invoice?.amount || 0),
          total_payable: Number(ev.invoice?.total_payable || ev.invoice?.amount || 0)
        }));

      return {
        id: t.id,
        tenant_code: t.tenant_code,
        name: t.name,
        primary_contact_email: t.primary_contact_email || (t.id === DEFAULT_TENANT_ID ? 'admin@newswangroup.com' : null),
        primary_contact_mobile: t.primary_contact_mobile || null,
        branches,
        status: resolvedStatus,
        raw_status: t.status,
        is_master_hq: isMasterHq,
        created_at: t.created_at,
        subscription: sub ? {
          ...sub,
          days_remaining: daysRemaining,
          is_expired: isExpired,
          is_expiring_soon: isExpiringSoon,
          is_master_hq: isMasterHq,
          never_expires: isMasterHq,
          status: resolvedStatus
        } : (isMasterHq ? {
          tenant_id: t.id,
          plan_name: 'MASTER_HQ_LIFETIME',
          user_seat_limit: 999,
          days_remaining: null,
          is_expired: false,
          is_expiring_soon: false,
          is_master_hq: true,
          never_expires: true,
          status: 'ACTIVE'
        } : null),
        entitlements: tEntitlements,
        entitlement_details: entDetails,
        pending_requests: pendingRequests,
        active_users_count: activeUserCount,
        module_rates: Object.fromEntries((billableCatalog || []).map(p => [p.process_code, pricingConfig?.tenant_rates?.[t.id]?.[p.process_code] ?? p.monthly_rate_per_user])),
        user_seat_limit: seatLimitValue,
        smtp_accounts_limit: smtpLimit,
        calling_seats_limit: callingSeatLimit,
        calling_mode: callingMode,
        telephony_config: {
          mode: callingMode,
          calling_seat_limit: callingSeatLimit,
          auth_id: authId,
          auth_token: authToken ? '••••••••••••••••••••••••' : '',
          has_custom_token: Boolean(authToken),
          from_number: fromNumber,
          default_forward: defaultForward
        }
      };
    });

    if (expiringForAutoPi.length > 0) {
      await Promise.all(expiringForAutoPi.map(({ tenant: t, sub }) => ensureAutoRenewalProformaForTenant(admin, t, sub, t.id)));
    }

    return { success: true, tenants: enriched };
  } catch (err) {
    console.error('getAllTenantsWithSubscriptions error:', err);
    return { success: false, error: err.message, tenants: [] };
  }
}

/**
 * Super Admin: Extend a tenant's subscription validity (Offline / Cash / Bank Payment)
 */
export async function extendTenantSubscription(tenantId, monthsToAdd = 1) {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    const { data: existing } = await admin
      .from('tenant_subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const months = saasNumber(monthsToAdd, 'Months', {min:1,max:120,integer:true});
    let baseDate = new Date();
    if (existing?.valid_until) {
      const currentExpiry = new Date(existing.valid_until);
      if (currentExpiry > baseDate) {
        baseDate = currentExpiry;
      }
    }

    const newExpiry = saasAddMonths(baseDate, months);

    if (existing) {
      const { error } = await admin
        .from('tenant_subscriptions')
        .update({
          valid_until: newExpiry.toISOString(),
          status: 'ACTIVE'
        })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from('tenant_subscriptions')
        .insert([{
          tenant_id: tenantId,
          plan_name: 'PRO_CUSTOM',
          user_seat_limit: 10,
          valid_from: new Date().toISOString(),
          valid_until: newExpiry.toISOString(),
          status: 'ACTIVE',
          billing_cycle: months === 12 ? 'YEARLY' : (months === 6 ? 'HALF_YEARLY' : (months === 3 ? 'QUARTERLY' : 'MONTHLY'))
        }]);
      if (error) throw error;
    }

    // Also log audit event without blocking validity extension
    try {
      const actor = await requireSaasMaster(admin);
      const { data: tenantInfo } = await admin.from('tenants').select('tenant_code').eq('id', tenantId).maybeSingle();
      await recordNonPaidSaasEvent(admin, actor.user.id, {
        tenantId,
        tenantCode: tenantInfo?.tenant_code || 'WS',
        operation: 'MANUAL_EXTENSION',
        invoiceType: 'log',
        category: 'MANUAL_EXTENSION',
        description: `Manual validity extension (+${months} month${months > 1 ? 's' : ''}) — non-payment adjustment`,
        totalSeats: existing?.user_seat_limit || 10,
        monthsAdded: months,
        validFrom: existing?.valid_until || new Date().toISOString(),
        validUntil: newExpiry.toISOString(),
        status: 'LOGGED',
        requestPayload: { months, previous_valid_until: existing?.valid_until || null }
      });
    } catch (logErr) {
      console.warn('extendTenantSubscription audit log skipped:', logErr.message);
    }

    return {
      success: true,
      message: `वैलिडिटी सफलतापूर्वक ${months} महीने आगे बढ़ाई गई! (New Expiry: ${newExpiry.toLocaleDateString('en-IN', {timeZone:'Asia/Kolkata'})})`
    };
  } catch (err) {
    console.error('extendTenantSubscription error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Super Admin: Update a tenant's purchased seat limit
 */
export async function updateTenantSeats(tenantId, newSeatLimit, requestId = null) {
  try {
    const admin = getAdminClient();
    const actor = await requireSaasMaster(admin);
    const result = await applySaasBilling(admin, actor, tenantId, requestId, 'SEATS_ONLY', {
      new_seats: saasNumber(newSeatLimit, 'Seats', {
        min: 1,
        max: 100000,
        integer: true
      }),
      amount: 0,
      gst_type: 'NON_GST'
    });
    return {
      success: true,
      ...result,
      message: 'Seat limit updated.'
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Super Admin: Assign client-specific negotiated rate
 */
export async function updateTenantCustomRate(tenantId, processCode, customRate) {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    const config = (await getDynamicConfig(admin, true)) || {};
    const tenantRates = config.tenant_rates || {};
    if (!tenantRates[tenantId]) {
      tenantRates[tenantId] = {};
    }
    tenantRates[tenantId][processCode] = saasNumber(customRate, 'Negotiated rate');
    config.tenant_rates = tenantRates;
    config.updated_at = new Date().toISOString();

    const { error } = await admin
      .from('tenant_entitlements')
      .upsert({
        tenant_id: DEFAULT_TENANT_ID,
        module_key: CONFIG_ENTITLEMENT_KEY,
        is_enabled: true,
        config_json: config
      }, { onConflict: 'tenant_id,module_key' });

    if (error) throw error;
    return { success: true, message: `नेगोशिएटेड रेट ₹${customRate} सेट हो गया!` };
  } catch (err) {
    console.error('updateTenantCustomRate error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Super Admin SaaS: Generate next sequential tenant code (TNT00001, TNT00002, TNT00003...)
 */
export async function getNextTenantCode(adminClient = null) {
  try {
    const admin = adminClient || getAdminClient();
    await requireSaasMaster(admin);
    const { data: allTenants } = await admin
      .from('tenants')
      .select('tenant_code');

    let maxNum = 0;
    if (Array.isArray(allTenants)) {
      for (const t of allTenants) {
        const match = String(t.tenant_code || '').match(/^TNT(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }

    // Baseline minimum is 3 (TNT00001 = SuPuja, TNT00002 = New Swan Group, TNT00003 = Testing NSG)
    if (maxNum < 3) maxNum = 3;

    const nextNum = maxNum + 1;
    return `TNT${String(nextNum).padStart(5, '0')}`;
  } catch (err) {
    console.error('getNextTenantCode error:', err);
    throw new Error('Unable to allocate a tenant code. Please retry.');
  }
}

/**
 * Self-Serve SaaS Provisioning: Create a new company workspace, admin user, subscription, and entitlements
 */
export async function createTenantWorkspace({
  companyName,
  adminEmail,
  adminPassword,
  adminName,
  adminMobile = '',
  processCodes = ['LEADS_WITH_CALLING'],
  userSeats = 5,
  cycleCode = 'YEARLY',
  trialDays = 0,
  isDraft = false,
  dealPrice = null,
  discountPercent = null,
  planPrice = null,
  dealNotes = '',
  requestId
}) {
  try {
    const admin = getAdminClient();
    const actor = await requireSaasMaster(admin);
    const email = String(adminEmail || '').trim().toLowerCase(),
      company = String(companyName || '').trim(),
      name = String(adminName || '').trim();
    if (!company || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter company, administrator name and a valid email.');
    if (String(adminPassword || '').length < 8) throw new Error('Administrator password must have at least 8 characters.');
    const seats = saasNumber(userSeats, 'Seats', {
        min: 1,
        max: 100000,
        integer: true
      }),
      days = saasNumber(trialDays, 'Trial days', {
        max: 365,
        integer: true
      });
    if (!SAAS_CYCLE_MONTHS[cycleCode]) throw new Error('Invalid billing cycle.');
    const pricing = await calculatePlanPrice({
      processCodes,
      userSeats: seats,
      cycleCode
    });
    if (!pricing.success) throw new Error(pricing.error);
    const amount = days ? 0 : dealPrice === null || dealPrice === undefined ? pricing.final_amount : saasNumber(dealPrice, 'Agreed amount');
    if (discountPercent !== null) saasNumber(discountPercent, 'Discount', {
      max: 100
    });
    if (planPrice !== null) saasNumber(planPrice, 'Catalog amount');
    const key = requestId || randomUUID();
    if (!SAAS_UUID.test(key)) throw new Error('Invalid provisioning request ID.');
    const payload = {
      company,
      email,
      admin_name: name,
      mobile: String(adminMobile || '').trim(),
      process_codes: [...new Set(processCodes)].sort(),
      seats,
      cycle: cycleCode,
      trial_days: days,
      is_draft: !!isDraft,
      amount,
      discount_percent: discountPercent,
      plan_price: planPrice,
      deal_notes: String(dealNotes)
    };
    const prepared = await callSaasRpc(admin, 'saas_prepare_workspace', {
        p_actor_id: actor.user.id,
        p_request_id: key,
        p_payload: payload
      }),
      tenant = prepared.tenant;
    if (prepared.complete) return {
      success: true,
      tenantId: tenant.id,
      tenantCode: tenant.tenant_code,
      adminEmail: email,
      message: 'Workspace was already provisioned successfully.'
    };
    const {
      data: authData,
      error: authError
    } = await admin.auth.admin.createUser({
      email,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        name,
        mobile: payload.mobile,
        company,
        saas_provisioning_request: key,
        tenant_id: tenant.id
      }
    });
    let user = authData?.user;
    if (authError) {
      if (!/already|registered/i.test(authError.message)) throw new Error(authError.message);
      for (let page = 1; page <= 100 && !user; page++) {
        const {
          data,
          error
        } = await admin.auth.admin.listUsers({
          page,
          perPage: 1000
        });
        if (error) throw error;
        const found = data?.users?.find(u => u.email?.toLowerCase() === email);
        if (found) {
          if (found.user_metadata?.saas_provisioning_request !== key || found.user_metadata?.tenant_id !== tenant.id) throw new Error('Email belongs to an existing account. No existing account was changed.');
          user = found;
          break;
        }
        if (!data?.users?.length || data.users.length < 1000) break;
      }
    }
    if (!user?.id) throw new Error('Administrator could not be verified. Retry this provisioning request.');
    const {
      saveTenantBranch
    } = await import('@/app/actions/tenantBranches');
    const branch = await saveTenantBranch({
      id: tenant.tenant_code + '-B0001',
      company,
      tenantId: tenant.id,
      branchName: company + ' (Headquarters)',
      branchCode: tenant.tenant_code + '-B0001',
      locationType: 'Headquarters',
      email,
      phone: payload.mobile,
      inchargeName: name
    });
    if (!branch?.success) throw new Error(branch?.error || 'Headquarters setup failed. Workspace remains draft; retry this request.');
    const now = new Date(),
      status = isDraft ? 'DRAFT' : days ? 'TRIAL' : 'ACTIVE',
      expiry = days ? new Date(now.getTime() + days * 86400000) : saasAddMonths(now, SAAS_CYCLE_MONTHS[cycleCode]);
    await callSaasRpc(admin, 'saas_finalize_workspace', {
      p_actor_id: actor.user.id,
      p_request_id: key,
      p_admin_user_id: user.id,
      p_subscription: {
        plan_name: days ? 'FREE_TRIAL' : 'SAAS_MODULAR',
        user_seat_limit: seats,
        valid_from: now.toISOString(),
        valid_until: expiry.toISOString(),
        status,
        billing_cycle: days ? 'TRIAL_' + days + 'D' : cycleCode,
        amount
      },
      p_entitlements: payload.process_codes.map(module_key => ({
        module_key,
        config_json: {
          activated_at: now.toISOString(),
          billing_cycle: cycleCode,
          deal_terms: {
            catalog_price: planPrice,
            discount_percent: discountPercent,
            deal_price: amount,
            deal_notes: dealNotes
          }
        }
      }))
    });
    return {
      success: true,
      tenantId: tenant.id,
      tenantCode: tenant.tenant_code,
      adminEmail: email,
      message: 'Workspace ' + tenant.tenant_code + ' provisioned successfully.'
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Tenant Self-Serve / Add-on: Purchase additional user seats
 */
export async function purchaseAddonSeats(tenantId, additionalSeats, requestId = null, moduleKey = null, moduleAdditions = null) {
  try {
    const admin = getAdminClient();
    const actor = await requireSaasTenant(admin, tenantId, {
      manage: true
    });
    const {
      data: sub,
      error
    } = await admin.from('tenant_subscriptions').select('*').eq('tenant_id', tenantId).order('created_at', {
      ascending: false
    }).limit(1).maybeSingle();
    if (error) throw error;
    if (!sub) throw new Error('An active subscription is required.');
    const {
      data: ent,
      error: entError
    } = await admin.from('tenant_entitlements').select('module_key,is_enabled,config_json').eq('tenant_id', tenantId);
    if (entError) throw entError;
    const pricing = await getProcessCatalog(tenantId);
    if (!pricing.success) throw new Error(pricing.error);
    const entMap = new Map((ent || []).map(e => [e.module_key, e]));
    const enabledSet = new Set((ent || []).filter(e => e.is_enabled).map(e => e.module_key));
    const hasComboLeadCalling = enabledSet.has('LEADS_WITH_CALLING');

    const { daysRemaining, isExpired } = getIstDaysSummary(sub.valid_until);
    if (isExpired || daysRemaining === null) throw new Error('Renew before requesting additional seats.');
    const days = Math.max(1, daysRemaining);
    const workspaceLimit = Math.max(1, Number(sub.user_seat_limit) || 5);

    // Normalize batch module additions (multi-module table) or single moduleKey fallback
    let normalizedAdditions = [];
    if (Array.isArray(moduleAdditions) && moduleAdditions.length > 0) {
      const seenKeys = new Set();
      for (const entry of moduleAdditions) {
        const key = String(entry?.module_key || '').trim();
        if (!key || seenKeys.has(key) || SAAS_INTERNAL_KEYS.has(key) || !enabledSet.has(key)) continue;
        const catItem = pricing.catalog.find(p => p.process_code === key && p.is_active !== false);
        if (!catItem) continue;
        const n = saasNumber(entry?.additional_seats, `${catItem.display_name} additional seats`, {
          min: 1,
          max: 100000,
          integer: true
        });
        seenKeys.add(key);
        normalizedAdditions.push({ catItem, add: n });
      }
      if (normalizedAdditions.length === 0) {
        throw new Error('Select at least one active module and enter extra seats.');
      }
    } else if (moduleKey && moduleKey !== 'ALL_WORKSPACE') {
      if (!enabledSet.has(moduleKey) || SAAS_INTERNAL_KEYS.has(moduleKey)) {
        throw new Error('Selected module is not active or not found.');
      }
      const targetModuleItem = pricing.catalog.find(p => p.process_code === moduleKey && p.is_active !== false);
      if (!targetModuleItem) throw new Error('Selected module is not active or not found.');
      const n = saasNumber(additionalSeats, 'Additional seats', { min: 1, max: 100000, integer: true });
      normalizedAdditions.push({ catItem: targetModuleItem, add: n });
    }

    // Multi-module or single-module per-module seat expansion via MODULE_PROFORMA
    if (normalizedAdditions.length > 0) {
      const seatLineItems = normalizedAdditions.map(({ catItem, add: modAdd }) => {
        const entRow = entMap.get(catItem.process_code);
        const customModSeats = Number(entRow?.config_json?.licensed_seats);
        const currentModuleSeats = customModSeats > 0 ? customModSeats : workspaceLimit;
        const newModuleSeats = currentModuleSeats + modAdd;
        const rate = Number(catItem.monthly_rate_per_user || 0);
        const netAmount = Math.round(modAdd * rate * days / 30 * 100) / 100;
        return {
          module_key: catItem.process_code,
          display_name: catItem.display_name,
          current_module_seats: currentModuleSeats,
          new_module_seats: newModuleSeats,
          seats: modAdd,
          rate_per_user: rate,
          days_remaining: days,
          net_amount: netAmount
        };
      });

      const isSingle = seatLineItems.length === 1;
      const primaryItem = seatLineItems[0];
      const totalProratedAmount = Math.round(seatLineItems.reduce((s, li) => s + li.net_amount, 0) * 100) / 100;
      const totalSeatAdditions = seatLineItems.reduce((s, li) => s + li.seats, 0);
      const maxNewSeats = Math.max(workspaceLimit, ...seatLineItems.map(li => li.new_module_seats));

      const pricingBasis = isSingle
        ? `+${primaryItem.seats} Seat${primaryItem.seats > 1 ? 's' : ''} for ${primaryItem.display_name} (${primaryItem.current_module_seats} → ${primaryItem.new_module_seats} Users) × ₹${primaryItem.rate_per_user}/user/mo × ${days}/30 days`
        : `${seatLineItems.length} Modules Seat Expansion (+${totalSeatAdditions} seats across modules) × ${days}/30 days`;

      const result = await applySaasBilling(admin, actor, tenantId, requestId, 'MODULE_PROFORMA', {
        // Keep a real active module_key so RPC ON CONFLICT updates an existing row safely (never inserts dummy key)
        module_key: primaryItem.module_key,
        module_name: isSingle ? primaryItem.display_name : `${seatLineItems.length} Modules Seat Expansion`,
        seat_expansion: true,
        module_additions: seatLineItems.map(li => ({
          module_key: li.module_key,
          module_name: li.display_name,
          additional_seats: li.seats,
          current_module_seats: li.current_module_seats,
          requested_users: li.new_module_seats,
          rate_per_user: li.rate_per_user
        })),
        additional_seats: totalSeatAdditions,
        ...(isSingle ? {
          current_module_seats: primaryItem.current_module_seats,
          requested_users: primaryItem.new_module_seats
        } : {}),
        current_seats: workspaceLimit,
        new_seats: maxNewSeats,
        months: 0,
        billing_mode: 'SAME_EXPIRY',
        unit_rate: isSingle ? primaryItem.rate_per_user : null,
        days_remaining: days,
        amount: totalProratedAmount,
        gst_type: 'IGST'
      });

      const multiDesc = seatLineItems.map(li => `${li.display_name} (+${li.seats})`).join(', ');
      const enrichedSeatInv = {
        ...result.invoice,
        category: 'ADDON_SEATS',
        seat_expansion: true,
        module_key: isSingle ? primaryItem.module_key : null,
        module_name: isSingle ? primaryItem.display_name : `${seatLineItems.length} Modules`,
        additional_seats: totalSeatAdditions,
        ...(isSingle ? {
          current_module_seats: primaryItem.current_module_seats,
          requested_users: primaryItem.new_module_seats
        } : {}),
        total_seats: isSingle ? primaryItem.new_module_seats : maxNewSeats,
        unit_rate: isSingle ? primaryItem.rate_per_user : null,
        days_remaining: days,
        pricing_basis: pricingBasis,
        line_items: seatLineItems,
        description: isSingle
          ? `Seat expansion (${primaryItem.display_name}): +${primaryItem.seats} user${primaryItem.seats > 1 ? 's' : ''} (${primaryItem.current_module_seats} → ${primaryItem.new_module_seats} Users) • ₹${primaryItem.rate_per_user}/u/mo × ${days}d`
          : `Seat expansion (${seatLineItems.length} Modules): ${multiDesc} • ${days}d`
      };
      if (result.invoice?.invoice_number) {
        await admin
          .from('saas_billing_events')
          .update({ invoice: enrichedSeatInv })
          .eq('tenant_id', tenantId)
          .eq('invoice_number', result.invoice.invoice_number);
      }

      return {
        success: true,
        ...result,
        invoice: enrichedSeatInv,
        newLimit: workspaceLimit,
        message: isSingle
          ? `${primaryItem.display_name} seat expansion (+${primaryItem.seats} user${primaryItem.seats > 1 ? 's' : ''}) proforma saved. Payment confirmation is required before seats activate.`
          : `Seat expansion proforma for ${seatLineItems.length} modules saved. Payment confirmation is required before seats activate.`
      };
    }

    const add = saasNumber(additionalSeats, 'Additional seats', {
      min: 1,
      max: 100000,
      integer: true
    });

    const workspaceCoreModules = pricing.catalog.filter(p => {
      if (p.is_active === false || SAAS_INTERNAL_KEYS.has(p.process_code) || !enabledSet.has(p.process_code)) return false;
      if (hasComboLeadCalling && (p.process_code === 'LEADS_ONLY' || p.process_code === 'CALLING_STANDALONE')) return false;
      const customSeats = Number(entMap.get(p.process_code)?.config_json?.licensed_seats);
      if (customSeats > 0 && customSeats < workspaceLimit) return false;
      return true;
    });

    const rate = workspaceCoreModules.reduce((sum, p) => sum + Number(p.monthly_rate_per_user), 0);
    const seatProratedAmount = Math.round(add * rate * days / 30 * 100) / 100;
    const seatLineItems = workspaceCoreModules.map(p => ({
      module_key: p.process_code,
      display_name: p.display_name,
      seats: add,
      rate_per_user: Number(p.monthly_rate_per_user),
      days_remaining: days,
      net_amount: Math.round(add * Number(p.monthly_rate_per_user) * days / 30 * 100) / 100
    }));

    const pricingBasis = `+${add} Extra Seat${add > 1 ? 's' : ''} × ₹${rate}/user/mo (${workspaceCoreModules.length} workspace modules) × ${days}/30 days`;

    const result = await applySaasBilling(admin, actor, tenantId, requestId, 'ADDON_PROFORMA', {
      current_seats: workspaceLimit,
      new_seats: workspaceLimit + add,
      months: 0,
      billing_mode: 'SAME_EXPIRY',
      unit_rate: rate,
      days_remaining: days,
      amount: seatProratedAmount,
      gst_type: 'IGST'
    });

    const enrichedSeatInv = {
      ...result.invoice,
      unit_rate: rate,
      days_remaining: days,
      pricing_basis: pricingBasis,
      line_items: seatLineItems,
      description: `Seat expansion (All Workspace Modules): +${add} user${add > 1 ? 's' : ''} (Total ${workspaceLimit + add}) • ₹${rate}/u/mo × ${days}d`
    };
    if (result.invoice?.invoice_number) {
      await admin
        .from('saas_billing_events')
        .update({ invoice: enrichedSeatInv })
        .eq('tenant_id', tenantId)
        .eq('invoice_number', result.invoice.invoice_number);
    }

    return {
      success: true,
      ...result,
      invoice: enrichedSeatInv,
      newLimit: workspaceLimit,
      message: 'Add-on request and proforma saved. Payment confirmation is required before seats change.'
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Tenant Self-Serve / Add-on: Unlock an additional business process module
 */
export async function purchaseAddonModule(tenantId, processCode, requestId = null, requestedUsers = null) {
  try {
    const admin = getAdminClient();
    const actor = await requireSaasTenant(admin, tenantId, {
      manage: true
    });
    const pricing = await getProcessCatalog(tenantId);
    const item = pricing.catalog?.find(p => p.process_code === processCode && p.is_active !== false && !SAAS_INTERNAL_KEYS.has(p.process_code));
    if (!pricing.success || !item) throw new Error('Choose a valid active module.');
    const {
      data: sub,
      error
    } = await admin.from('tenant_subscriptions').select('*').eq('tenant_id', tenantId).order('created_at', {
      ascending: false
    }).limit(1).maybeSingle();
    if (error) throw error;
    if (!sub) throw new Error('An active subscription is required.');
    const {
      data: ent,
      error: entError
    } = await admin.from('tenant_entitlements').select('is_enabled').eq('tenant_id', tenantId).eq('module_key', processCode).maybeSingle();
    if (entError) throw entError;
    if (ent?.is_enabled) throw new Error('This module is already active.');
    const { daysRemaining, isExpired } = getIstDaysSummary(sub.valid_until);
    if (isExpired || daysRemaining === null) throw new Error('Renew before requesting modules.');
    const days = Math.max(1, daysRemaining);
    const maxSeats = Math.max(1, Number(sub.user_seat_limit) || 5);
    const usersCount = requestedUsers === null || requestedUsers === undefined || requestedUsers === ''
      ? maxSeats
      : saasNumber(requestedUsers, 'Module users', { min: 1, max: maxSeats, integer: true });
    const proratedAmount = Math.round(item.monthly_rate_per_user * usersCount * days / 30 * 100) / 100;
    const result = await applySaasBilling(admin, actor, tenantId, requestId, 'MODULE_PROFORMA', {
      module_key: processCode,
      module_name: item.display_name,
      requested_users: usersCount,
      unit_rate: item.monthly_rate_per_user,
      days_remaining: days,
      amount: proratedAmount,
      gst_type: 'IGST'
    });
    const enrichedInvoice = {
      ...result.invoice,
      module_key: processCode,
      module_name: item.display_name,
      requested_users: usersCount,
      unit_rate: item.monthly_rate_per_user,
      days_remaining: days,
      pricing_basis: `${usersCount} User${usersCount > 1 ? 's' : ''} × ₹${item.monthly_rate_per_user}/user/mo × ${days}/30 days`,
      line_items: [{
        module_key: processCode,
        display_name: item.display_name,
        seats: usersCount,
        rate_per_user: Number(item.monthly_rate_per_user),
        days_remaining: days,
        net_amount: proratedAmount
      }],
      description: `${item.display_name} (${usersCount} User${usersCount > 1 ? 's' : ''} × ₹${item.monthly_rate_per_user}/mo • ${days}d prorated)`
    };
    if (result.invoice?.invoice_number) {
      await admin
        .from('saas_billing_events')
        .update({ invoice: enrichedInvoice })
        .eq('tenant_id', tenantId)
        .eq('invoice_number', result.invoice.invoice_number);
    }
    return {
      success: true,
      ...result,
      invoice: enrichedInvoice,
      message: `Module request for ${usersCount} user${usersCount > 1 ? 's' : ''} saved. Master Admin must approve activation.`
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Super Admin: Toggle / Manage enabled modules for a specific tenant
 */
export async function updateTenantEntitlements(tenantId, enabledModuleKeys = [], moduleSeatOverrides = {}) {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    if (!SAAS_UUID.test(String(tenantId))) throw new Error('Invalid workspace.');
    const {
      success,
      catalog,
      error
    } = await getProcessCatalog();
    if (!success) throw new Error(error);
    if (!Array.isArray(enabledModuleKeys)) throw new Error('Invalid module selection.');
    const keys = new Set(enabledModuleKeys);
    const items = catalog.filter(p => !SAAS_INTERNAL_KEYS.has(p.process_code));
    if ([...keys].some(key => !items.some(p => p.process_code === key && p.is_active !== false))) throw new Error('Unknown or inactive module.');
    const {
      data: existing,
      error: readError
    } = await admin.from('tenant_entitlements').select('module_key,config_json').eq('tenant_id', tenantId);
    if (readError) throw readError;
    const overrides = moduleSeatOverrides && typeof moduleSeatOverrides === 'object' ? moduleSeatOverrides : {};
    const updates = items.map(p => {
      const prevConfig = { ...((existing || []).find(r => r.module_key === p.process_code)?.config_json || {}) };
      if (Object.prototype.hasOwnProperty.call(overrides, p.process_code)) {
        const rawOverride = overrides[p.process_code];
        if (rawOverride === '' || rawOverride === null || rawOverride === undefined) {
          delete prevConfig.licensed_seats;
        } else {
          prevConfig.licensed_seats = saasNumber(rawOverride, `${p.display_name} licensed users`, { min: 1, max: 100000, integer: true });
        }
      }
      return {
        tenant_id: tenantId,
        module_key: p.process_code,
        is_enabled: keys.has(p.process_code),
        config_json: {
          ...prevConfig,
          updated_at: new Date().toISOString(),
          manual_override: true
        }
      };
    });
    const result = await admin.from('tenant_entitlements').upsert(updates, {
      onConflict: 'tenant_id,module_key'
    });
    if (result.error) throw result.error;

    // Auto-refresh any PENDING auto-renewal proforma so updated per-module seats & modules reflect immediately
    try {
      const { data: pendingRenewals } = await admin
        .from('saas_billing_events')
        .select('id,invoice,request_payload')
        .eq('tenant_id', tenantId)
        .eq('operation', 'RENEWAL_PROFORMA');
      const autoPending = (pendingRenewals || []).find(
        ev => String(ev.invoice?.status || '').toUpperCase() === 'PENDING' && ev.request_payload?.source === 'AUTO_7D_RENEWAL'
      );
      if (autoPending) {
        const quote = await computeTenantRenewalQuote(admin, tenantId, autoPending.request_payload?.months || null);
        if (quote.amount > 0) {
          const gstType = autoPending.invoice?.gst_type || autoPending.request_payload?.gst_type || 'IGST';
          const amounts = saasInvoiceAmounts(quote.amount, gstType);
          const refreshedInv = {
            ...autoPending.invoice,
            amount: amounts.amount,
            tax_amount: amounts.tax_amount,
            total_payable: amounts.total_payable,
            total_seats: quote.seatLimit,
            months_added: quote.months,
            line_items: quote.line_items || [],
            pricing_basis: quote.pricing_basis || '',
            discount_percent: quote.discountPercent || 0
          };
          await admin
            .from('saas_billing_events')
            .update({
              invoice: refreshedInv,
              request_payload: { ...autoPending.request_payload, amount: quote.amount, months: quote.months }
            })
            .eq('id', autoPending.id);
        }
      }
    } catch (refreshErr) {
      console.warn('Auto-renewal PI refresh skipped:', refreshErr.message);
    }

    return {
      success: true,
      message: 'Workspace modules updated successfully.'
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Super Admin: Update allowed SMTP server accounts limit for a tenant
 */
export async function updateTenantSmtpLimit(tenantId, limit = 1) {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    if (!SAAS_UUID.test(String(tenantId))) throw new Error('Invalid workspace.');
    const value = saasNumber(limit, 'SMTP quota', {
      min: 1,
      max: 100000,
      integer: true
    });
    const {
      error
    } = await admin.from('tenant_entitlements').upsert({
      tenant_id: tenantId,
      module_key: 'SMTP_SERVER_LIMIT',
      is_enabled: true,
      config_json: {
        limit: value,
        updated_at: new Date().toISOString()
      }
    }, {
      onConflict: 'tenant_id,module_key'
    });
    if (error) throw error;
    const limits = await readLocalSmtpLimits();
    limits[tenantId] = value;
    await writeLocalSmtpLimits(limits);
    return {
      success: true,
      limit: value,
      message: 'SMTP account quota saved.'
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Super Admin: Get telephony & calling seats config for a tenant
 */
export async function getTenantTelephonyConfig(tenantId, companyName = '') {
  try {
    const admin = getAdminClient();
    
    // 1. Try tenant_entitlements
    if (tenantId) {
      const { data: ent } = await admin
        .from('tenant_entitlements')
        .select('config_json')
        .eq('tenant_id', tenantId)
        .eq('module_key', 'TELEPHONY_CONFIG')
        .maybeSingle();

      if (ent?.config_json) {
        let fwd = ent.config_json.default_forward || '';
        if (!fwd && companyName) {
          const slug = (companyName || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
          const { data: fwdRow } = await admin.from('call_agents').select('mobile_number').eq('plivo_username', `system_settings_forward_${slug}`).maybeSingle();
          if (fwdRow?.mobile_number) fwd = fwdRow.mobile_number;
        }
        return {
          success: true,
          config: {
            mode: ent.config_json.mode || 'managed',
            auth_id: ent.config_json.auth_id || '',
            auth_token: ent.config_json.auth_token || '',
            from_number: ent.config_json.from_number || process.env.PLIVO_FROM_NUMBER || '+918035340622',
            default_forward: fwd,
            calling_seat_limit: Number(ent.config_json.calling_seat_limit) || 5
          }
        };
      }
    }

    // 2. Fallback to call_agents system_telephony_config_{slug}
    const slug = (companyName || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    if (slug) {
      const configKey = `system_telephony_config_${slug}`;
      const forwardKey = `system_settings_forward_${slug}`;
      const [{ data: agentRow }, { data: fwdRow }] = await Promise.all([
        admin.from('call_agents').select('agent_code, mobile_number, plivo_endpoint_key, plivo_password').eq('plivo_username', configKey).maybeSingle(),
        admin.from('call_agents').select('mobile_number').eq('plivo_username', forwardKey).maybeSingle()
      ]);

      if (agentRow) {
        let parsed = {};
        try {
          parsed = JSON.parse(agentRow.plivo_password || '{}');
        } catch (_) {}

        return {
          success: true,
          config: {
            mode: agentRow.agent_code || parsed.mode || 'managed',
            auth_id: parsed.auth_id || '',
            auth_token: parsed.auth_token || '',
            from_number: agentRow.mobile_number || parsed.from_number || process.env.PLIVO_FROM_NUMBER || '+918035340622',
            default_forward: parsed.default_forward || fwdRow?.mobile_number || '',
            calling_seat_limit: parseInt(agentRow.plivo_endpoint_key, 10) || parsed.calling_seat_limit || 5
          }
        };
      }
    }

    return {
      success: true,
      config: {
        mode: 'managed',
        auth_id: '',
        auth_token: '',
        from_number: process.env.PLIVO_FROM_NUMBER || '+918035340622',
        default_forward: '',
        calling_seat_limit: 5
      }
    };
  } catch (err) {
    console.error('getTenantTelephonyConfig error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Super Admin: Update telephony & calling seats config for a tenant
 */
export async function updateTenantTelephonyConfig(tenantId, companyName, {
  mode = 'managed',
  authId = '',
  authToken = '',
  fromNumber = '',
  defaultForward = '',
  callingSeatLimit = 5
}) {
  try {
    const admin = getAdminClient();
    const cleanMode = mode === 'byoc' ? 'byoc' : 'managed';
    const cleanAuthId = (authId || '').trim();
    let cleanAuthToken = (authToken || '').trim();
    const cleanFromNumber = (fromNumber || '').trim() || process.env.PLIVO_FROM_NUMBER || '+918035340622';
    const cleanDefaultForward = (defaultForward || '').trim();
    const cleanSeatLimit = Math.max(1, parseInt(callingSeatLimit, 10) || 5);
    const slug = (companyName || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '_');

    // If authToken was not provided in this update, preserve existing saved token so it is not wiped
    if (!cleanAuthToken) {
      if (tenantId) {
        const { data: existingEnt } = await admin
          .from('tenant_entitlements')
          .select('config_json')
          .eq('tenant_id', tenantId)
          .eq('module_key', 'TELEPHONY_CONFIG')
          .maybeSingle();
        if (existingEnt?.config_json?.auth_token) {
          cleanAuthToken = existingEnt.config_json.auth_token;
        }
      }
      if (!cleanAuthToken && slug) {
        const { data: existingAg } = await admin
          .from('call_agents')
          .select('plivo_password')
          .eq('plivo_username', `system_telephony_config_${slug}`)
          .maybeSingle();
        try {
          const parsed = JSON.parse(existingAg?.plivo_password || '{}');
          if (parsed.auth_token) cleanAuthToken = parsed.auth_token;
        } catch (_) {}
      }
    }

    const configPayload = {
      mode: cleanMode,
      auth_id: cleanAuthId,
      auth_token: cleanAuthToken,
      from_number: cleanFromNumber,
      default_forward: cleanDefaultForward,
      calling_seat_limit: cleanSeatLimit,
      updated_at: new Date().toISOString()
    };

    // 1. Save to tenant_entitlements if tenantId is provided
    if (tenantId) {
      const { error: entError } = await admin
        .from('tenant_entitlements')
        .upsert({
          tenant_id: tenantId,
          module_key: 'TELEPHONY_CONFIG',
          is_enabled: true,
          config_json: configPayload
        }, { onConflict: 'tenant_id,module_key' });

      if (entError) {
        console.warn('tenant_entitlements upsert notice for TELEPHONY_CONFIG:', entError.message);
      }
    }

    // 2. Also sync to call_agents system_telephony_config_{slug} and forward number
    if (slug) {
      const configKey = `system_telephony_config_${slug}`;
      const forwardKey = `system_settings_forward_${slug}`;
      const payloadString = JSON.stringify(configPayload);

      const [{ data: existingAgent }, { data: existingFwd }] = await Promise.all([
        admin.from('call_agents').select('id').eq('plivo_username', configKey).maybeSingle(),
        admin.from('call_agents').select('id').eq('plivo_username', forwardKey).maybeSingle()
      ]);

      if (existingAgent) {
        await admin
          .from('call_agents')
          .update({
            agent_code: cleanMode,
            mobile_number: cleanFromNumber,
            plivo_endpoint_key: String(cleanSeatLimit),
            plivo_password: payloadString,
            is_active: true
          })
          .eq('id', existingAgent.id);
      } else {
        await admin
          .from('call_agents')
          .insert({
            display_name: `Telephony Config (${companyName || slug})`,
            plivo_username: configKey,
            agent_code: cleanMode,
            mobile_number: cleanFromNumber,
            plivo_endpoint_key: String(cleanSeatLimit),
            plivo_password: payloadString,
            is_active: true
          });
      }

      if (cleanDefaultForward !== undefined) {
        if (existingFwd) {
          await admin
            .from('call_agents')
            .update({ mobile_number: cleanDefaultForward })
            .eq('id', existingFwd.id);
        } else if (cleanDefaultForward) {
          await admin
            .from('call_agents')
            .insert({
              display_name: `System Forwarding (${companyName || slug})`,
              plivo_username: forwardKey,
              mobile_number: cleanDefaultForward,
              default_calling_mode: 'mobile',
              is_active: false,
              status: 'offline'
            });
        }
      }
    }

    return {
      success: true,
      message: `Telephony config for '${companyName || 'tenant'}' updated successfully! (${cleanSeatLimit} Calling Seats, Mode: ${cleanMode.toUpperCase()})`,
      config: configPayload
    };
  } catch (err) {
    console.error('updateTenantTelephonyConfig error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Super Admin: Get all tenant SMTP limits map
 */
export async function getTenantSmtpLimitsMap() {
  try {
    const localLimits = await readLocalSmtpLimits();
    const admin = getAdminClient();

    let dbLimits = {};
    try {
      const { data, error } = await admin
        .from('tenant_entitlements')
        .select('tenant_id, config_json')
        .eq('module_key', 'SMTP_SERVER_LIMIT');

      if (!error && Array.isArray(data)) {
        data.forEach(row => {
          if (row.tenant_id && row.config_json?.limit) {
            dbLimits[row.tenant_id] = Number(row.config_json.limit);
          }
        });
      }
    } catch (e) {
      // Table query fallback
    }

    // Merge: DB limits take precedence, fallback to local file
    const merged = { ...localLimits, ...dbLimits };
    return { success: true, limits: merged };
  } catch (err) {
    console.error('getTenantSmtpLimitsMap error:', err);
    return { success: true, limits: {} };
  }
}

/**
 * Super Admin: Extend or assign Free Trial (1, 3, 7, 10, or custom days)
 */
export async function extendTenantSubscriptionTrial(tenantId, trialDays = 7) {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    const days = saasNumber(trialDays, 'Trial days', {min:1,max:365,integer:true});
    const now = new Date();
    const newExpiry = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const { data: existing } = await admin
      .from('tenant_subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from('tenant_subscriptions')
        .update({
          valid_until: newExpiry.toISOString(),
          status: 'TRIAL',
          billing_cycle: `TRIAL_${days}D`
        })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from('tenant_subscriptions')
        .insert([{
          tenant_id: tenantId,
          plan_name: 'FREE_TRIAL',
          user_seat_limit: 5,
          valid_from: now.toISOString(),
          valid_until: newExpiry.toISOString(),
          status: 'TRIAL',
          billing_cycle: `TRIAL_${days}D`,
          amount: 0
        }]);
      if (error) throw error;
    }

    // Sync tenants table status to TRIAL
    const {error:tenantError}=await admin.from('tenants').update({ status: 'TRIAL', updated_at: now.toISOString() }).eq('id', tenantId);
    if(tenantError)throw tenantError;

    // Log Trial grant event into saas_billing_events so Master Admin has complete trial history
    try {
      const actor = await requireSaasMaster(admin);
      const { data: tenantInfo } = await admin.from('tenants').select('tenant_code').eq('id', tenantId).maybeSingle();
      await recordNonPaidSaasEvent(admin, actor.user.id, {
        tenantId,
        tenantCode: tenantInfo?.tenant_code || 'WS',
        operation: 'TRIAL_GRANT',
        invoiceType: 'log',
        category: 'TRIAL_GRANT',
        description: `Free Trial Granted (${days} Day${days > 1 ? 's' : ''})`,
        totalSeats: existing?.user_seat_limit || 5,
        daysAdded: days,
        validFrom: now.toISOString(),
        validUntil: newExpiry.toISOString(),
        status: 'TRIAL_LOG',
        requestPayload: { trial_days: days, previous_valid_until: existing?.valid_until || null }
      });
    } catch (logErr) {
      console.warn('extendTenantSubscriptionTrial audit log skipped:', logErr.message);
    }

    return {
      success: true,
      message: `${days} दिन का फ्री ट्रायल सक्रिय हो गया! (Expiry: ${newExpiry.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })})`
    };
  } catch (err) {
    console.error('extendTenantSubscriptionTrial error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Super Admin: Manually edit Expiry Date, change status, and fix accidental extensions
 */
export async function updateTenantValidityAndStatus({
  tenantId,
  validUntil,
  status = 'ACTIVE',
  billingCycle = null
}) {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    if (!SAAS_UUID.test(String(tenantId))) throw new Error('Invalid workspace.');
    const normalized = status === 'FREE TRIAL' ? 'TRIAL' : status;
    if (!['ACTIVE', 'TRIAL', 'DRAFT', 'EXPIRED', 'SUSPENDED', 'GRACE_PERIOD', 'READ_ONLY'].includes(normalized)) throw new Error('Invalid status.');
    if (billingCycle && !SAAS_CYCLE_MONTHS[billingCycle] && !/^TRIAL_[0-9]+D$/.test(billingCycle)) throw new Error('Invalid billing cycle.');
    const expiry = saasEndOfDay(validUntil).toISOString();
    const {
      data: existing,
      error
    } = await admin.from('tenant_subscriptions').select('*').eq('tenant_id', tenantId).order('created_at', {
      ascending: false
    }).limit(1).maybeSingle();
    if (error) throw error;
    if (!existing) throw new Error('Complete workspace provisioning first.');
    const {
      error: subError
    } = await admin.from('tenant_subscriptions').update({
      valid_until: expiry,
      status: normalized,
      ...(billingCycle ? {
        billing_cycle: billingCycle
      } : {})
    }).eq('id', existing.id);
    if (subError) throw subError;
    const {
      error: tenantError
    } = await admin.from('tenants').update({
      status: normalized === 'EXPIRED' ? 'SUSPENDED' : normalized,
      updated_at: new Date().toISOString()
    }).eq('id', tenantId);
    if (tenantError) throw new Error('Subscription saved but workspace status could not sync. Please retry.');

    try {
      const actor = await requireSaasMaster(admin);
      const { data: tenantInfo } = await admin.from('tenants').select('tenant_code').eq('id', tenantId).maybeSingle();
      await recordNonPaidSaasEvent(admin, actor.user.id, {
        tenantId,
        tenantCode: tenantInfo?.tenant_code || 'WS',
        operation: 'VALIDITY_ADJUSTMENT',
        invoiceType: 'log',
        category: 'VALIDITY_ADJUSTMENT',
        description: `Manual Validity / Status Adjustment → ${normalized} (Till ${validUntil})`,
        totalSeats: existing.user_seat_limit || 5,
        validFrom: existing.valid_until || null,
        validUntil: expiry,
        status: 'LOGGED',
        requestPayload: { status: normalized, valid_until: validUntil, previous_valid_until: existing.valid_until || null }
      });
    } catch (logErr) {
      console.warn('updateTenantValidityAndStatus audit log skipped:', logErr.message);
    }

    return {
      success: true,
      message: 'Expiry and status updated.'
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Super Admin: Soft delete workspace (Move to Deleted Archive for 1-3 months retention)
 */
export async function softDeleteTenantWorkspace(tenantId) {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    if (!tenantId) throw new Error('Tenant ID missing.');
    if (tenantId === DEFAULT_TENANT_ID) {
      throw new Error('New Swan Group (Master Workspace) को डिलीट नहीं किया जा सकता!');
    }

    const now = new Date().toISOString();

    const { error: tErr } = await admin
      .from('tenants')
      .update({ status: 'ARCHIVED', updated_at: now })
      .eq('id', tenantId);
    if (tErr) throw tErr;

    await admin
      .from('tenant_subscriptions')
      .update({ status: 'ARCHIVED' })
      .eq('tenant_id', tenantId);

    return {
      success: true,
      message: 'कंपनी वर्कस्पेस को Deleted Archive में भेज दिया गया है (1-3 माह की सुरक्षा के साथ)!'
    };
  } catch (err) {
    console.error('softDeleteTenantWorkspace error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Super Admin: Restore workspace from Deleted Archive back to Active
 */
export async function restoreTenantWorkspace(tenantId) {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    if (!tenantId) throw new Error('Tenant ID missing.');
    if (tenantId === DEFAULT_TENANT_ID) throw new Error('Action not allowed.');

    const now = new Date().toISOString();

    const { error: tErr } = await admin
      .from('tenants')
      .update({ status: 'ACTIVE', updated_at: now })
      .eq('id', tenantId);
    if (tErr) throw tErr;

    await admin
      .from('tenant_subscriptions')
      .update({ status: 'ACTIVE' })
      .eq('tenant_id', tenantId);

    return {
      success: true,
      message: 'कंपनी वर्कस्पेस को सफलतापूर्वक Restore कर दिया गया है!'
    };
  } catch (err) {
    console.error('restoreTenantWorkspace error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Super Admin: Permanently delete workspace and wipe test records
 */
export async function permanentDeleteTenantWorkspace(tenantId) {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    if (!tenantId) throw new Error('Tenant ID missing.');
    if (tenantId === DEFAULT_TENANT_ID) {
      throw new Error('New Swan Group (Master Workspace) को स्थायी रूप से डिलीट नहीं किया जा सकता!');
    }

    const { data: tenant } = await admin
      .from('tenants')
      .select('name, tenant_code')
      .eq('id', tenantId)
      .maybeSingle();

    await admin.from('tenant_subscriptions').delete().eq('tenant_id', tenantId);
    await admin.from('tenant_entitlements').delete().eq('tenant_id', tenantId);
    await admin.from('companies').delete().eq('tenant_id', tenantId);
    const { error: delErr } = await admin.from('tenants').delete().eq('id', tenantId);
    if (delErr) throw delErr;

    if (tenant?.name) {
      await admin.from('user_roles').update({ company: '' }).eq('company', tenant.name);
    }

    return {
      success: true,
      message: `कंपनी वर्कस्पेस '${tenant?.name || tenantId}' को स्थायी रूप से डिलीट कर दिया गया है!`
    };
  } catch (err) {
    console.error('permanentDeleteTenantWorkspace error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Super Admin: Record offline/bank payment and generate Tax Invoice
 */
export async function recordPaymentAndGenerateInvoice({
  tenantId,
  amount,
  paymentMode = 'UPI',
  transactionId = '',
  months = 12,
  gstType = 'IGST',
  requestId,
  sourceInvoiceNumber = null
}) {
  try {
    const admin = getAdminClient(),
      actor = await requireSaasMaster(admin);
    const cleanTxn = String(transactionId || '').trim();
    if (!cleanTxn) {
      throw new Error('Enter a valid UTR / Transaction ID before confirming payment and generating a Tax Invoice.');
    }
    const paidAmount = saasNumber(amount, 'Paid amount', {
      min: 1,
      max: 1e9
    });
    let kind = 'RENEWAL';
    let renewalSourceId = null;
    let payload = {
      amount: paidAmount,
      months: saasNumber(months, 'Months', {
        min: 1,
        max: 120,
        integer: true
      }),
      gst_type: gstType,
      payment_mode: paymentMode,
      transaction_id: cleanTxn
    };
    let sourceInv = null;
    if (sourceInvoiceNumber) {
      const {
        data: source,
        error
      } = await admin.from('saas_billing_events').select('id,tenant_id,operation,request_payload,invoice').eq('tenant_id', tenantId).eq('invoice_number', String(sourceInvoiceNumber)).maybeSingle();
      if (error) throw error;
      if (!source || !['ADDON_PROFORMA', 'MODULE_PROFORMA', 'RENEWAL_PROFORMA'].includes(source.operation)) {
        throw new Error('This invoice cannot be paid through the proforma confirmation flow.');
      }
      if (source.invoice?.status !== 'PENDING') {
        throw new Error('This proforma was already settled or voided.');
      }
      sourceInv = source.invoice || null;
      if (source.operation === 'RENEWAL_PROFORMA') {
        renewalSourceId = source.id;
        payload = {
          amount: source.request_payload?.amount ? saasNumber(source.request_payload.amount, 'Paid amount', { min: 1, max: 1e9 }) : paidAmount,
          months: saasNumber(source.request_payload?.months ?? months, 'Months', { min: 1, max: 120, integer: true }),
          gst_type: source.request_payload?.gst_type || gstType,
          payment_mode: paymentMode,
          transaction_id: cleanTxn
        };
      } else {
        kind = source.operation === 'MODULE_PROFORMA' ? 'MODULE_PAYMENT' : 'ADDON_PAYMENT';
        payload = {
          ...source.request_payload,
          payment_mode: paymentMode,
          transaction_id: cleanTxn,
          source_invoice_number: source.invoice.invoice_number
        };
      }
    }
    const result = await applySaasBilling(admin, actor, tenantId, requestId, kind, payload);
    if (kind === 'MODULE_PAYMENT' && payload?.module_key) {
      const reqUsers = Number(payload.requested_users) || null;
      const modName = payload.module_name || payload.module_key;
      const isSeatExpansion = Boolean(payload.seat_expansion);
      const addSeats = Number(payload.additional_seats || 0);
      const prevModSeats = Number(payload.current_module_seats || 0);
      const modAdditions = Array.isArray(payload.module_additions) ? payload.module_additions : [];
      const isMultiModuleExpansion = isSeatExpansion && modAdditions.length > 1;
      if (result.invoice?.invoice_number) {
        const enrichedTaxInv = {
          ...result.invoice,
          ...(isSeatExpansion ? { category: 'ADDON_SEATS', seat_expansion: true } : {}),
          module_key: isMultiModuleExpansion ? null : payload.module_key,
          module_name: modName,
          ...(addSeats > 0 ? { additional_seats: addSeats } : {}),
          ...(prevModSeats > 0 && !isMultiModuleExpansion ? { current_module_seats: prevModSeats } : {}),
          ...(reqUsers && !isMultiModuleExpansion ? { requested_users: reqUsers, ...(isSeatExpansion ? { total_seats: reqUsers } : {}) } : {}),
          ...(payload.unit_rate != null ? { unit_rate: payload.unit_rate } : {}),
          ...(payload.days_remaining != null ? { days_remaining: payload.days_remaining } : {}),
          ...(Array.isArray(sourceInv?.line_items) && sourceInv.line_items.length > 0 ? { line_items: sourceInv.line_items } : {}),
          ...(sourceInv?.pricing_basis ? { pricing_basis: sourceInv.pricing_basis } : {}),
          description: isMultiModuleExpansion
            ? `Seat expansion (${modAdditions.length} Modules): ${modAdditions.map(m => `${m.module_name || m.module_key} (+${m.additional_seats})`).join(', ')}`
            : isSeatExpansion && addSeats > 0
              ? `Seat expansion (${modName}): +${addSeats} user${addSeats > 1 ? 's' : ''} (${prevModSeats} → ${reqUsers} Users)`
              : reqUsers
                ? `${modName} Activation (${reqUsers} User${reqUsers > 1 ? 's' : ''})`
                : `Module activation: ${modName}`
        };
        result.invoice = enrichedTaxInv;
        await admin
          .from('saas_billing_events')
          .update({ invoice: enrichedTaxInv })
          .eq('tenant_id', tenantId)
          .eq('invoice_number', enrichedTaxInv.invoice_number);
      }
      if (modAdditions.length > 0) {
        try {
          const targetKeys = modAdditions.map(m => m.module_key).filter(Boolean);
          const { data: entRows } = await admin
            .from('tenant_entitlements')
            .select('module_key,config_json')
            .eq('tenant_id', tenantId)
            .in('module_key', targetKeys);
          const existingByKey = new Map((entRows || []).map(r => [r.module_key, r.config_json || {}]));
          for (const item of modAdditions) {
            const targetUsers = Number(item.requested_users) || null;
            if (!item.module_key || !targetUsers) continue;
            await admin
              .from('tenant_entitlements')
              .update({ config_json: { ...(existingByKey.get(item.module_key) || {}), licensed_seats: targetUsers } })
              .eq('tenant_id', tenantId)
              .eq('module_key', item.module_key);
          }
        } catch (entSyncErr) {
          console.warn('multi-module licensed_seats config sync skipped:', entSyncErr.message);
        }
      } else if (reqUsers) {
        try {
          const { data: entRow } = await admin
            .from('tenant_entitlements')
            .select('config_json')
            .eq('tenant_id', tenantId)
            .eq('module_key', payload.module_key)
            .maybeSingle();
          await admin
            .from('tenant_entitlements')
            .update({ config_json: { ...(entRow?.config_json || {}), licensed_seats: reqUsers } })
            .eq('tenant_id', tenantId)
            .eq('module_key', payload.module_key);
        } catch (entSyncErr) {
          console.warn('module licensed_seats config sync skipped:', entSyncErr.message);
        }
      }
    }
    if (renewalSourceId) {
      const { data: srcRow } = await admin.from('saas_billing_events').select('invoice').eq('id', renewalSourceId).maybeSingle();
      if (srcRow?.invoice) {
        await admin.from('saas_billing_events').update({
          invoice: {
            ...srcRow.invoice,
            status: 'PAID',
            payment_mode: paymentMode,
            transaction_id: cleanTxn,
            converted_to_invoice: result.invoice.invoice_number,
            paid_at: result.invoice.created_at
          }
        }).eq('id', renewalSourceId);
      }
    }
    if (kind === 'RENEWAL' && result.invoice?.invoice_number) {
      try {
        const quote = await computeTenantRenewalQuote(admin, tenantId, payload.months);
        const enrichedRenewalTax = {
          ...result.invoice,
          line_items: quote.line_items || [],
          pricing_basis: quote.pricing_basis || '',
          discount_percent: quote.discountPercent || 0
        };
        result.invoice = enrichedRenewalTax;
        await admin
          .from('saas_billing_events')
          .update({ invoice: enrichedRenewalTax })
          .eq('tenant_id', tenantId)
          .eq('invoice_number', enrichedRenewalTax.invoice_number);
      } catch (qErr) {
        console.warn('renewal invoice line_items enrich skipped:', qErr.message);
      }
    }
    if (kind === 'ADDON_PAYMENT' && sourceInvoiceNumber && result.invoice?.invoice_number) {
      try {
        const { data: srcAddon } = await admin.from('saas_billing_events').select('invoice').eq('tenant_id', tenantId).eq('invoice_number', String(sourceInvoiceNumber)).maybeSingle();
        if (srcAddon?.invoice?.line_items || srcAddon?.invoice?.pricing_basis) {
          const enrichedSeatTax = {
            ...result.invoice,
            line_items: srcAddon.invoice.line_items || [],
            pricing_basis: srcAddon.invoice.pricing_basis || '',
            unit_rate: srcAddon.invoice.unit_rate || null,
            days_remaining: srcAddon.invoice.days_remaining || null
          };
          result.invoice = enrichedSeatTax;
          await admin
            .from('saas_billing_events')
            .update({ invoice: enrichedSeatTax })
            .eq('tenant_id', tenantId)
            .eq('invoice_number', enrichedSeatTax.invoice_number);
        }
      } catch (aErr) {
        console.warn('addon seat tax line_items enrich skipped:', aErr.message);
      }
    }
    return {
      success: true,
      ...result,
      invoiceNumber: result.invoice.invoice_number,
      paidAt: result.invoice.created_at,
      message: 'Payment recorded and invoice saved.'
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Super Admin: Explicitly issue and save a pending Renewal Proforma Invoice (PI) in database
 */
export async function createRenewalProformaInvoice({
  tenantId,
  months = 12,
  amount = null,
  gstType = 'IGST',
  requestId = null
}) {
  try {
    const admin = getAdminClient();
    const actor = await requireSaasMaster(admin);
    if (!SAAS_UUID.test(String(tenantId || ''))) throw new Error('A valid workspace is required.');
    const cleanMonths = saasNumber(months, 'Months', { min: 1, max: 120, integer: true });
    if (!['IGST', 'CGST_SGST', 'NON_GST'].includes(gstType)) throw new Error('Choose a valid GST mode.');
    const quote = await computeTenantRenewalQuote(admin, tenantId, cleanMonths);
    const resolvedAmount = amount === null || amount === undefined || amount === ''
      ? quote.amount
      : saasNumber(amount, 'Proforma amount', { min: 1, max: 1e9 });
    if (!(resolvedAmount > 0)) {
      throw new Error('Renewal Proforma amount must be greater than ₹0.');
    }
    const { data: tenantInfo } = await admin.from('tenants').select('tenant_code,name').eq('id', tenantId).maybeSingle();
    const { data: subRow } = await admin.from('tenant_subscriptions').select('user_seat_limit,valid_until').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const recorded = await recordNonPaidSaasEvent(admin, actor.user.id, {
      tenantId,
      tenantCode: tenantInfo?.tenant_code || 'WS',
      requestId: requestId || randomUUID(),
      operation: 'RENEWAL_PROFORMA',
      invoiceType: 'proforma',
      category: 'RENEWAL_PROFORMA',
      description: `Subscription Renewal Proforma (${cleanMonths} Month${cleanMonths > 1 ? 's' : ''})`,
      totalSeats: subRow?.user_seat_limit || quote.seatLimit || 5,
      monthsAdded: cleanMonths,
      validUntil: subRow?.valid_until || null,
      amount: resolvedAmount,
      gstType,
      status: 'PENDING',
      lineItems: quote.line_items || [],
      pricingBasis: quote.pricing_basis || '',
      discountPercent: quote.discountPercent || 0,
      requestPayload: {
        amount: resolvedAmount,
        months: cleanMonths,
        gst_type: gstType,
        cycle_expiry: subRow?.valid_until || null,
        source: 'MANUAL_PI'
      }
    });
    return {
      success: true,
      invoice: recorded.invoice,
      invoiceNumber: recorded.invoice_number,
      message: `Proforma Invoice ${recorded.invoice_number} issued and saved.`
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

const BILLING_HISTORY_MODULE_KEY = 'TENANT_BILLING_HISTORY';

/**
 * Super Admin: Fetch all historical invoices & payments for a workspace
 */
export async function getTenantBillingHistory(tenantId) {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    if (!SAAS_UUID.test(String(tenantId))) throw new Error('Invalid workspace.');
    const [{
      data: tenant,
      error: tError
    }, {
      data: subscription,
      error: sError
    }, invoices] = await Promise.all([admin.from('tenants').select('*').eq('id', tenantId).maybeSingle(), admin.from('tenant_subscriptions').select('*').eq('tenant_id', tenantId).order('created_at', {
      ascending: false
    }).limit(1).maybeSingle(), readSaasInvoices(admin, tenantId)]);
    if (tError || sError) throw tError || sError;
    if (!tenant) throw new Error('Workspace not found.');
    return {
      success: true,
      tenant,
      subscription,
      invoices
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      invoices: []
    };
  }
}

/**
 * Super Admin: Process Add-on User Seats Expansion and generate dedicated invoice
 */
export async function processAddonSeatsAndInvoice({
  tenantId,
  currentSeats = 5,
  newSeats = 10,
  billingMode = 'SAME_EXPIRY',
  monthsToAdd = 0,
  dealPrice = 0,
  invoiceType = 'tax_invoice',
  paymentMode = 'UPI',
  transactionId = '',
  gstType = 'IGST',
  requestId
}) {
  try {
    const admin = getAdminClient();
    const actor = await requireSaasMaster(admin);
    if (!['proforma', 'tax_invoice'].includes(invoiceType)) throw new Error('Invalid invoice type.');
    if (!['SAME_EXPIRY', 'EXTEND_VALIDITY'].includes(billingMode)) throw new Error('Invalid billing mode.');
    const result = await applySaasBilling(admin, actor, tenantId, requestId, invoiceType === 'proforma' ? 'ADDON_PROFORMA' : 'ADDON_PAYMENT', {
      current_seats: saasNumber(currentSeats, 'Current seats', {
        min: 1,
        max: 100000,
        integer: true
      }),
      new_seats: saasNumber(newSeats, 'Seats', {
        min: 1,
        max: 100000,
        integer: true
      }),
      months: billingMode === 'EXTEND_VALIDITY' ? saasNumber(monthsToAdd, 'Months', {
        min: 1,
        max: 120,
        integer: true
      }) : 0,
      billing_mode: billingMode,
      amount: saasNumber(dealPrice, 'Amount'),
      gst_type: gstType,
      payment_mode: paymentMode,
      transaction_id: String(transactionId).trim()
    });
    return {
      success: true,
      ...result,
      message: invoiceType === 'proforma' ? 'Proforma saved. Seats and validity remain unchanged until payment confirmation.' : 'Seats updated and paid invoice saved.'
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Super Admin: Get all active employees in a tenant workspace for seat auditing and hold selection
 */
export async function getTenantActiveUsers(tenantId) {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    if (!SAAS_UUID.test(String(tenantId))) throw new Error('Invalid workspace.');
    const [{
      data: tenants,
      error: tError
    }, {
      data: users,
      error: uError
    }] = await Promise.all([admin.from('tenants').select('id,name,tenant_code,primary_contact_email'), admin.from('user_roles').select('user_id,tenant_id,emp_id,emp_name,emp_official_mail_id,email,role,is_approved,emp_status,company,module_access,created_at').order('emp_name', {
      ascending: true
    })]);
    if (tError || uError) throw tError || uError;
    const tenant = tenants?.find(t => t.id === tenantId);
    if (!tenant) throw new Error('Workspace not found.');
    const scoped = (users || []).filter(u => userBelongsToSaasTenant(u, tenant, tenants)).map(u => ({
      ...u,
      can_hold: !['admin', 'tenant_admin', 'superadmin', 'super_admin', 'masteradmin', 'master_admin'].includes(String(u.role).toLowerCase()) && !u.module_access?.is_master_admin && [u.email, u.emp_official_mail_id].every(e => !e || String(e).toLowerCase() !== String(tenant.primary_contact_email || '').toLowerCase()),
      module_access: undefined
    }));
    return {
      success: true,
      tenant,
      totalUsers: scoped.length,
      activeUsers: scoped.filter(isSaasUserActive),
      heldUsers: scoped.filter(u => !isSaasUserActive(u))
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      activeUsers: [],
      heldUsers: []
    };
  }
}

/**
 * Super Admin: Process User Seats Downgrade and put selected excess employees on HOLD
 */
export async function reduceTenantSeatsAndHoldUsers({
  tenantId,
  currentSeats = 5,
  newSeats = 1,
  holdUserIds = [],
  reason = '',
  requestId
}) {
  try {
    const admin = getAdminClient();
    const actor = await requireSaasMaster(admin);
    if (!Array.isArray(holdUserIds) || holdUserIds.some(id => !SAAS_UUID.test(String(id)))) throw new Error('Invalid HOLD selection.');
    const result = await applySaasBilling(admin, actor, tenantId, requestId, 'DOWNGRADE', {
      current_seats: saasNumber(currentSeats, 'Current seats', {
        min: 1,
        max: 100000,
        integer: true
      }),
      new_seats: saasNumber(newSeats, 'Seats', {
        min: 1,
        max: 100000,
        integer: true
      }),
      hold_user_ids: [...new Set(holdUserIds)],
      reason: String(reason).trim(),
      amount: 0,
      gst_type: 'NON_GST'
    });
    return {
      success: true,
      ...result,
      reducedCount: currentSeats - newSeats,
      message: 'Seat limit and selected eligible accounts updated.'
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Super Admin: Get all invoices across all tenants for Master Invoices Ledger
 */
export async function getAllMasterInvoices() {
  try {
    const admin = getAdminClient();
    await requireSaasMaster(admin);
    const [{
      data: tenants,
      error
    }, invoices] = await Promise.all([admin.from('tenants').select('id,name,tenant_code,primary_contact_email,primary_contact_mobile'), readSaasInvoices(admin)]);
    if (error) throw error;
    const directory = new Map((tenants || []).map(t => [t.id, t]));
    return {
      success: true,
      invoices: invoices.map(inv => {
        const t = directory.get(inv.tenant_id);
        return {
          ...inv,
          tenant_name: t?.name || 'Unavailable workspace',
          tenant_code: t?.tenant_code || '',
          tenant_email: t?.primary_contact_email,
          tenant_phone: t?.primary_contact_mobile
        };
      })
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      invoices: []
    };
  }
}





async function callSaasRpc(admin, name, args) {
  const {
    data,
    error
  } = await admin.rpc(name, args);
  if (error) {
    if (['PGRST202', '42P01', '42883'].includes(error.code)) throw new Error('SaaS safety migration 54 must be reviewed and applied before this operation. No payment or seat change was recorded.');
    throw new Error(error.message || 'SaaS operation failed.');
  }
  if (!data) throw new Error('SaaS operation returned no confirmation. Please retry with the same request.');
  return data;
}

async function applySaasBilling(admin, actor, tenantId, requestId, kind, payload) {
  if (!SAAS_UUID.test(String(tenantId || ''))) throw new Error('A valid workspace is required.');
  const key = requestId || randomUUID();
  if (!SAAS_UUID.test(key)) throw new Error('A valid request ID is required.');
  return callSaasRpc(admin, 'saas_apply_billing_operation', {
    p_tenant_id: tenantId,
    p_actor_id: actor.user.id,
    p_request_id: key,
    p_kind: kind,
    p_payload: payload
  });
}

function deterministicSaasUuid(seed) {
  const bytes = createHash('sha256').update(String(seed)).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function getIstYearMonth(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit'
  }).format(date).replace('-', '');
}

function getIstDaysSummary(validUntil) {
  if (!validUntil) return { daysRemaining: null, isExpired: false, isExpiringSoon: false };
  const targetMs = new Date(validUntil).getTime();
  if (Number.isNaN(targetMs)) return { daysRemaining: null, isExpired: false, isExpiringSoon: false };
  const now = new Date();
  if (targetMs <= now.getTime()) {
    return { daysRemaining: 0, isExpired: true, isExpiringSoon: false };
  }
  const calDiff = Math.round(
    (Date.parse(`${saasDateKey(validUntil)}T00:00:00Z`) - Date.parse(`${saasDateKey(now)}T00:00:00Z`)) / 86400000
  );
  const daysRemaining = Math.max(0, calDiff);
  return {
    daysRemaining,
    isExpired: false,
    isExpiringSoon: daysRemaining <= 7
  };
}

async function recordNonPaidSaasEvent(admin, actorId, {
  tenantId,
  tenantCode = 'WS',
  requestId = null,
  operation,
  invoiceType = 'log',
  category,
  description,
  additionalSeats = 0,
  totalSeats = 0,
  billingMode = null,
  monthsAdded = 0,
  daysAdded = 0,
  validFrom = null,
  validUntil = null,
  amount = 0,
  gstType = 'NON_GST',
  status = 'LOGGED',
  lineItems = [],
  pricingBasis = '',
  discountPercent = 0,
  requestPayload = {}
}) {
  const reqId = requestId && SAAS_UUID.test(String(requestId)) ? String(requestId) : randomUUID();
  const { data: existingEvent } = await admin
    .from('saas_billing_events')
    .select('invoice_number,invoice')
    .eq('tenant_id', tenantId)
    .eq('request_id', reqId)
    .maybeSingle();
  if (existingEvent) {
    return { invoice_number: existingEvent.invoice_number, invoice: existingEvent.invoice, reused: true };
  }

  const prefix = operation === 'RENEWAL_PROFORMA'
    ? 'PI'
    : operation === 'TRIAL_GRANT'
      ? 'TRL'
      : operation === 'MANUAL_EXTENSION'
        ? 'EXT'
        : 'ADJ';
  const cleanCode = String(tenantCode || 'WS').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'WS';
  const ym = getIstYearMonth();
  const amounts = saasInvoiceAmounts(amount, gstType);
  const nowIso = new Date().toISOString();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const invoiceNumber = `${prefix}-${cleanCode}-${ym}-${suffix}`;
    const invoice = {
      id: randomUUID(),
      invoice_number: invoiceNumber,
      invoice_type: invoiceType,
      category,
      operation,
      description,
      additional_seats: additionalSeats,
      total_seats: totalSeats,
      billing_mode: billingMode || operation,
      months_added: monthsAdded,
      days_added: daysAdded,
      valid_from: validFrom,
      valid_until: validUntil,
      amount: amounts.amount,
      gst_type: amounts.gst_type,
      gst_rate: amounts.gst_rate,
      tax_amount: amounts.tax_amount,
      total_payable: amounts.total_payable,
      payment_mode: '',
      transaction_id: '',
      status,
      ...(Array.isArray(lineItems) && lineItems.length > 0 ? { line_items: lineItems } : {}),
      ...(pricingBasis ? { pricing_basis: pricingBasis } : {}),
      ...(discountPercent ? { discount_percent: discountPercent } : {}),
      created_at: nowIso
    };
    const response = {
      invoice,
      newExpiry: validUntil,
      newSeatLimit: totalSeats
    };
    const { error } = await admin.from('saas_billing_events').insert({
      tenant_id: tenantId,
      actor_id: actorId && SAAS_UUID.test(String(actorId)) ? actorId : tenantId,
      request_id: reqId,
      operation,
      request_payload: requestPayload,
      invoice_number: invoiceNumber,
      invoice,
      result: response
    });
    if (!error) {
      return { invoice_number: invoiceNumber, invoice };
    }
    if (error.code === '23505') {
      const { data: raced } = await admin
        .from('saas_billing_events')
        .select('invoice_number,invoice')
        .eq('tenant_id', tenantId)
        .eq('request_id', reqId)
        .maybeSingle();
      if (raced) return { invoice_number: raced.invoice_number, invoice: raced.invoice, reused: true };
      continue;
    }
    throw error;
  }
  throw new Error('Could not generate a unique SaaS reference number.');
}

async function computeTenantRenewalQuote(admin, tenantId, overrideMonths = null) {
  const [
    { data: subRow },
    { data: entRows },
    { catalog },
    { cycles }
  ] = await Promise.all([
    admin.from('tenant_subscriptions').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('tenant_entitlements').select('module_key,is_enabled,config_json').eq('tenant_id', tenantId),
    getProcessCatalog(tenantId),
    getCycleDiscounts()
  ]);

  const cycleCode = SAAS_CYCLE_MONTHS[subRow?.billing_cycle] ? subRow.billing_cycle : 'YEARLY';
  const months = overrideMonths || SAAS_CYCLE_MONTHS[cycleCode] || 12;
  const matchedCycle = (cycles || []).find(c => (c.months_count ?? c.months) === months) || (cycles || []).find(c => c.cycle_code === cycleCode);
  const discountPercent = Number(matchedCycle?.discount_percent || 0);
  const seatLimit = Math.max(1, Number(subRow?.user_seat_limit) || 5);
  const entByKey = new Map((entRows || []).map(r => [r.module_key, r]));
  const enabledKeys = new Set((entRows || []).filter(r => r.is_enabled === true).map(r => r.module_key));
  const hasComboLeadCalling = enabledKeys.has('LEADS_WITH_CALLING');
  const enabledItems = (catalog || []).filter(p =>
    enabledKeys.has(p.process_code) &&
    !SAAS_INTERNAL_KEYS.has(p.process_code) &&
    p.is_active !== false &&
    !(hasComboLeadCalling && (p.process_code === 'LEADS_ONLY' || p.process_code === 'CALLING_STANDALONE'))
  );

  const lineItems = enabledItems.map(p => {
    const customSeats = Number(entByKey.get(p.process_code)?.config_json?.licensed_seats);
    const modSeats = customSeats > 0 ? customSeats : seatLimit;
    const rate = Number(p.monthly_rate_per_user || 0);
    const gross = Math.round(rate * modSeats * months * 100) / 100;
    const net = Math.round(gross * (1 - discountPercent / 100) * 100) / 100;
    return {
      module_key: p.process_code,
      display_name: p.display_name,
      seats: modSeats,
      rate_per_user: rate,
      months,
      discount_percent: discountPercent,
      gross_amount: gross,
      net_amount: net
    };
  });

  const computedTotal = Math.round(lineItems.reduce((sum, li) => sum + li.net_amount, 0) * 100) / 100;
  const pricingBasis = lineItems.length > 0
    ? `${lineItems.length} Active Modules • ${months} Month${months > 1 ? 's' : ''}${discountPercent > 0 ? ` • ${discountPercent}% Cycle Discount` : ''}`
    : '';

  if (!overrideMonths && Number(subRow?.amount) > 0) {
    return {
      amount: Number(subRow.amount),
      months,
      cycleCode,
      seatLimit,
      discountPercent,
      moduleCount: enabledItems.length,
      line_items: lineItems,
      pricing_basis: `${pricingBasis}${pricingBasis ? ' • ' : ''}Agreed Contract Rate`
    };
  }

  return {
    amount: computedTotal,
    months,
    cycleCode,
    seatLimit,
    discountPercent,
    moduleCount: enabledItems.length,
    line_items: lineItems,
    pricing_basis: pricingBasis
  };
}

async function ensureAutoRenewalProformaForTenant(admin, tenantRow, subRow, actorId) {
  try {
    if (!tenantRow || !subRow?.valid_until || isMasterHqTenant(tenantRow)) return null;
    const { daysRemaining, isExpired } = getIstDaysSummary(subRow.valid_until);
    if (!isExpired && (daysRemaining === null || daysRemaining > 7)) return null;

    const expiryKey = saasDateKey(subRow.valid_until);
    const reqId = deterministicSaasUuid(`AUTO_RENEWAL_PI:${tenantRow.id}:${expiryKey}`);

    // Skip if any PENDING or recently PAID renewal exists for this expiry window
    const { data: existingEvents } = await admin
      .from('saas_billing_events')
      .select('operation,request_id,invoice,created_at')
      .eq('tenant_id', tenantRow.id)
      .in('operation', ['RENEWAL_PROFORMA', 'RENEWAL'])
      .order('created_at', { ascending: false })
      .limit(10);

    const alreadyHandled = (existingEvents || []).some(ev => {
      if (ev.request_id === reqId) return true;
      const st = String(ev.invoice?.status || '').toUpperCase();
      if (ev.operation === 'RENEWAL_PROFORMA' && st === 'PENDING') return true;
      return false;
    });
    if (alreadyHandled) return null;

    const quote = await computeTenantRenewalQuote(admin, tenantRow.id);
    if (!(quote.amount > 0)) return null;

    const expiryDisplay = new Date(subRow.valid_until).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    return await recordNonPaidSaasEvent(admin, actorId || tenantRow.id, {
      tenantId: tenantRow.id,
      tenantCode: tenantRow.tenant_code || 'WS',
      requestId: reqId,
      operation: 'RENEWAL_PROFORMA',
      invoiceType: 'proforma',
      category: 'RENEWAL_PROFORMA',
      description: `Auto Renewal Proforma (${quote.months} Months • Expiry ${expiryDisplay})`,
      totalSeats: quote.seatLimit,
      monthsAdded: quote.months,
      validUntil: subRow.valid_until,
      amount: quote.amount,
      gstType: 'IGST',
      status: 'PENDING',
      lineItems: quote.line_items || [],
      pricingBasis: quote.pricing_basis || '',
      discountPercent: quote.discountPercent || 0,
      requestPayload: {
        amount: quote.amount,
        months: quote.months,
        gst_type: 'IGST',
        cycle_expiry: subRow.valid_until,
        expiry_key: expiryKey,
        source: 'AUTO_7D_RENEWAL'
      }
    });
  } catch (err) {
    console.warn('ensureAutoRenewalProformaForTenant skipped:', err.message);
    return null;
  }
}

async function readSaasInvoices(admin, tenantId = null) {
  let legacyQuery = admin.from('tenant_entitlements').select('tenant_id, config_json').eq('module_key', 'TENANT_BILLING_HISTORY');
  let eventsQuery = admin.from('saas_billing_events').select('tenant_id, invoice, created_at').order('created_at', {
    ascending: false
  });
  if (tenantId) {
    legacyQuery = legacyQuery.eq('tenant_id', tenantId);
    eventsQuery = eventsQuery.eq('tenant_id', tenantId);
  }
  const [legacy, events] = await Promise.all([legacyQuery, eventsQuery]);
  if (legacy.error) throw legacy.error;
  if (events.error && !['42P01', 'PGRST205'].includes(events.error.code)) throw events.error;
  const invoices = new Map();
  for (const row of legacy.data || []) for (const invoice of Array.isArray(row.config_json?.invoices) ? row.config_json.invoices : []) {
    invoices.set(row.tenant_id + ':' + (invoice.invoice_number || invoice.id), {
      ...invoice,
      tenant_id: row.tenant_id
    });
  }
  for (const row of events.data || []) invoices.set(row.tenant_id + ':' + row.invoice.invoice_number, {
    ...row.invoice,
    tenant_id: row.tenant_id
  });
  return [...invoices.values()].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

export async function getSaasMasterSnapshot() {
  try {
    await requireSaasMaster(getAdminClient());
    const data = await Promise.all([getProcessCatalog(), getCycleDiscounts(), getAllTenantsWithSubscriptions(), getAllMasterInvoices()]);
    const failed = data.find(result => !result.success);
    if (failed) throw new Error(failed.error || 'SaaS data is unavailable.');
    return {
      success: true,
      data
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Tenant Admin / Master Admin: Fetch strictly scoped Plan Period, Quotas & Billing History for their own workspace.
 * Enforces tenant isolation + manage permission via requireSaasTenant(..., { manage: true }).
 */
export async function cancelPendingSaasProforma(tenantId = DEFAULT_TENANT_ID, invoiceNumber = '', reason = 'Cancelled / Withdrawn') {
  try {
    const admin = getAdminClient();
    const target = await resolveSaasTenantUuid(admin, tenantId || DEFAULT_TENANT_ID);
    await requireSaasTenant(admin, target, { manage: true });
    const cleanInvNo = String(invoiceNumber || '').trim();
    if (!cleanInvNo) throw new Error('Invoice number is required.');
    const { data: row, error } = await admin
      .from('saas_billing_events')
      .select('id,invoice')
      .eq('tenant_id', target)
      .eq('invoice_number', cleanInvNo)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error('Proforma invoice not found.');
    if (String(row.invoice?.status || '').toUpperCase() !== 'PENDING') {
      throw new Error('Only PENDING proforma invoices can be cancelled.');
    }
    const updatedInvoice = {
      ...row.invoice,
      status: 'CANCELLED',
      void_reason: String(reason || 'Cancelled / Withdrawn').trim(),
      cancelled_at: new Date().toISOString()
    };
    const { error: updErr } = await admin
      .from('saas_billing_events')
      .update({ invoice: updatedInvoice })
      .eq('id', row.id);
    if (updErr) throw updErr;
    return {
      success: true,
      invoice: updatedInvoice,
      message: `Proforma ${cleanInvNo} cancelled.`
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

export async function getOwnTenantBillingSummary(tenantId = DEFAULT_TENANT_ID) {
  try {
    const admin = getAdminClient();
    const target = await resolveSaasTenantUuid(admin, tenantId);
    await requireSaasTenant(admin, target, { manage: true });

    const [
      { data: tenantRow, error: tErr },
      { data: allTenants },
      { data: subRow, error: sErr },
      { data: entRows, error: eErr },
      { data: usersList, error: uErr },
      { catalog },
      smtpLimitsMap
    ] = await Promise.all([
      admin.from('tenants').select('id,tenant_code,name,status,primary_contact_email,phone,address,gstin,created_at').eq('id', target).maybeSingle(),
      admin.from('tenants').select('id,tenant_code,name'),
      admin.from('tenant_subscriptions').select('*').eq('tenant_id', target).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('tenant_entitlements').select('module_key,is_enabled,config_json').eq('tenant_id', target),
      admin.from('user_roles').select('user_id,tenant_id,company,emp_id,emp_name,emp_official_mail_id,email,role,is_approved,emp_status,module_access'),
      getProcessCatalog(target),
      readLocalSmtpLimits()
    ]);

    if (tErr || sErr || eErr || uErr) throw tErr || sErr || eErr || uErr;
    if (!tenantRow) throw new Error('Workspace not found.');

    const isMasterHq = isMasterHqTenant(tenantRow) || isMasterHqTenant(target);
    if (!isMasterHq && subRow?.valid_until && !['ARCHIVED', 'DELETED', 'DRAFT', 'SUSPENDED'].includes(tenantRow.status)) {
      await ensureAutoRenewalProformaForTenant(admin, tenantRow, subRow, target);
    }
    const invoices = await readSaasInvoices(admin, target);
    const catalogList = Array.isArray(catalog) ? catalog : DEFAULT_PROCESS_CATALOG;
    const enabledKeys = new Set(
      (entRows || []).filter(r => r.is_enabled === true).map(r => r.module_key)
    );
    const grantAll = isMasterHq || (!(entRows || []).length && target === DEFAULT_TENANT_ID);
    const seatLimit = subRow?.user_seat_limit || (target === DEFAULT_TENANT_ID ? 200 : 5);
    const activeTenantUsers = (usersList || []).filter(u =>
      userBelongsToSaasTenant(u, tenantRow, allTenants || []) && isSaasUserActive(u)
    );
    const activeUsersCount = activeTenantUsers.length;
    const enabledModules = catalogList
      .filter(p => grantAll || enabledKeys.has(p.process_code))
      .map(p => {
        const entRow = (entRows || []).find(r => r.module_key === p.process_code);
        const customSeats = Number(entRow?.config_json?.licensed_seats);
        const usage = computeTenantModuleUsage(activeTenantUsers, p.process_code, { includeUsersList: true });
        return {
          process_code: p.process_code,
          display_name: p.display_name,
          category: p.category,
          monthly_rate_per_user: Number(p.monthly_rate_per_user || 0),
          licensed_seats: customSeats > 0 ? customSeats : seatLimit,
          has_custom_seats: Boolean(customSeats > 0),
          used_seats: usage.used_seats,
          staff_used_seats: usage.staff_used_seats,
          admin_used_seats: usage.admin_used_seats,
          assigned_users: usage.assigned_users
        };
      });

    const telEnt = (entRows || []).find(r => r.module_key === 'TELEPHONY_CONFIG');
    const telConfig = telEnt?.config_json || {};
    const smtpLimit = isMasterHq
      ? 999
      : (Number(smtpLimitsMap[tenantRow.id]) || Number(smtpLimitsMap[tenantRow.tenant_code]) || Number(smtpLimitsMap[tenantRow.name]) || 1);

    let daysRemaining = null;
    let isExpired = false;
    let isExpiringSoon = false;
    if (!isMasterHq && subRow?.valid_until) {
      ({ daysRemaining, isExpired, isExpiringSoon } = getIstDaysSummary(subRow.valid_until));
    }

    const resolvedStatus = isMasterHq
      ? 'ACTIVE'
      : isExpired
        ? 'EXPIRED'
        : isExpiringSoon
          ? 'EXPIRING_SOON'
          : (tenantRow.status === 'TRIAL' || subRow?.status === 'TRIAL')
            ? 'TRIAL'
            : (subRow?.status || tenantRow.status || 'ACTIVE');

    const safeInvoices = (invoices || []).map(inv => {
      const rawDesc = String(inv.description || '');
      const inferredModuleKey = inv.module_key || (
        inv.category === 'ADDON_MODULE' && (rawDesc.startsWith('Module add-on request:') || rawDesc.startsWith('Module activation:'))
          ? rawDesc.replace('Module add-on request:', '').replace('Module activation:', '').trim()
          : null
      );
      const matchedCatalog = inferredModuleKey ? catalogList.find(c => c.process_code === inferredModuleKey) : null;
      const cleanDesc = matchedCatalog && rawDesc.startsWith('Module add-on request:')
        ? `${matchedCatalog.display_name} (${Number(inv.requested_users || inv.total_seats || subRow?.user_seat_limit || 0)} Users)`
        : rawDesc;
      const inferredUsers = inv.requested_users
        ? Number(inv.requested_users)
        : (inv.category === 'ADDON_MODULE' ? (Number(inv.total_seats || subRow?.user_seat_limit || 0) || null) : null);

      return {
        invoice_number: inv.invoice_number || inv.id || 'N/A',
        created_at: inv.created_at || null,
        category: inv.category || 'SUBSCRIPTION',
        operation: inv.operation || null,
        description: cleanDesc,
        amount: Number(inv.amount || 0),
        gst_type: inv.gst_type || 'IGST',
        status: inv.status || 'PAID',
        months_added: Number(inv.months_added || 0),
        days_added: Number(inv.days_added || 0),
        additional_seats: Number(inv.additional_seats || 0),
        total_seats: Number(inv.total_seats || 0),
        module_key: inferredModuleKey,
        module_name: inv.module_name || matchedCatalog?.display_name || null,
        seat_expansion: Boolean(inv.seat_expansion),
        requested_users: inferredUsers,
        unit_rate: inv.unit_rate != null ? Number(inv.unit_rate) : (matchedCatalog?.monthly_rate_per_user ?? null),
        days_remaining: inv.days_remaining != null ? Number(inv.days_remaining) : null,
        pricing_basis: inv.pricing_basis || '',
        discount_percent: inv.discount_percent ? Number(inv.discount_percent) : 0,
        line_items: Array.isArray(inv.line_items) ? inv.line_items : [],
        void_reason: inv.void_reason || '',
        billing_mode: inv.billing_mode || null,
        new_seats: inv.new_seats || null,
        current_seats: inv.current_seats || null,
        payment_mode: inv.payment_mode || '',
        transaction_id: inv.transaction_id || '',
        valid_from: inv.valid_from || null,
        valid_until: inv.valid_until || null
      };
    });

    return {
      success: true,
      tenant: {
        tenant_code: tenantRow.tenant_code || (target === DEFAULT_TENANT_ID ? 'TNT00002' : 'TNT00001'),
        name: tenantRow.name,
        status: resolvedStatus,
        primary_contact_email: tenantRow.primary_contact_email || null,
        phone: tenantRow.phone || null,
        address: tenantRow.address || null,
        gstin: tenantRow.gstin || null,
        is_master_hq: isMasterHq
      },
      subscription: {
        plan_name: subRow?.plan_name || (isMasterHq ? 'MASTER_HQ_LIFETIME' : 'ENTERPRISE_PLAN'),
        billing_cycle: subRow?.billing_cycle || (isMasterHq ? 'LIFETIME' : 'YEARLY'),
        status: resolvedStatus,
        start_date: subRow?.valid_from || subRow?.starts_at || subRow?.created_at || tenantRow.created_at || null,
        valid_until: isMasterHq ? null : (subRow?.valid_until || null),
        days_remaining: daysRemaining,
        is_expired: isExpired,
        is_expiring_soon: isExpiringSoon,
        is_master_hq: isMasterHq,
        never_expires: isMasterHq,
        user_seat_limit: subRow?.user_seat_limit || (target === DEFAULT_TENANT_ID ? 200 : 5),
        active_users_count: activeUsersCount,
        calling_seats_limit: isMasterHq ? 300 : (Number(telConfig.calling_seat_limit) || 5),
        calling_mode: isMasterHq ? 'managed' : (telConfig.mode || 'managed'),
        smtp_accounts_limit: smtpLimit,
        enabled_modules: enabledModules
      },
      invoices: safeInvoices
    };
  } catch (err) {
    console.error('getOwnTenantBillingSummary error:', err);
    return {
      success: false,
      error: err.message || 'Unable to load billing summary.',
      tenant: null,
      subscription: null,
      invoices: []
    };
  }
}
