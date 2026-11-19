'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { formatBranchStandard } from '@/utils/branchAccess';
import { requireSaasMaster, requireSaasTenant, userBelongsToSaasTenant, isSaasUserActive, SAAS_UUID } from '@/lib/saasAccess';
import { saasNumber, saasEndOfDay, saasAddMonths, calculateSaasPrice, SAAS_CYCLE_MONTHS, SAAS_INTERNAL_KEYS } from '@/lib/saasBilling';
import {
  DEFAULT_TENANT_ID,
  DEFAULT_PROCESS_CATALOG,
  DEFAULT_CYCLE_DISCOUNTS
} from '@/utils/saasEntitlements';

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
    const {
      data: sub,
      error
    } = await admin.from('tenant_subscriptions').select('*').eq('tenant_id', target).order('created_at', {
      ascending: false
    }).limit(1).maybeSingle();
    if (error) throw error;
    if (!sub) return {
      success: false,
      error: 'Subscription not found',
      subscription: null
    };
    const ms = new Date(sub.valid_until).getTime() - Date.now();
    const days = Math.ceil(ms / 86400000);
    return {
      success: true,
      subscription: {
        ...sub,
        days_remaining: days,
        is_expired: ms <= 0,
        is_expiring_soon: ms > 0 && days <= 7,
        status: ms <= 0 ? 'EXPIRED' : days <= 7 && sub.status === 'ACTIVE' ? 'EXPIRING_SOON' : sub.status
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
    const {
      data: rows,
      error
    } = await admin.from('tenant_entitlements').select('module_key,is_enabled').eq('tenant_id', target);
    if (error) throw error;
    const entitlements = Object.fromEntries((rows || []).map(r => [r.module_key, r.is_enabled === true]));
    if (!rows?.length && target === DEFAULT_TENANT_ID) DEFAULT_PROCESS_CATALOG.forEach(p => {
      entitlements[p.process_code] = true;
    });
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
      .select('tenant_id, company, user_id, role, emp_official_mail_id, is_approved, emp_status');

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

    const enriched = (tenantsList || []).map(t => {
      const sub = (subsList || []).find(s => s.tenant_id === t.id);
      const tEntitlements = (entitlementsList || [])
        .filter(e => e.tenant_id === t.id && e.is_enabled && billableKeys.has(e.module_key))
        .map(e => e.module_key);

      const activeUserCount = (userCounts || []).filter(u => userBelongsToSaasTenant(u,t,tenantsList) && isSaasUserActive(u)).length;

      let daysRemaining = null;
      let isExpired = false;
      let isExpiringSoon = false;

      if (sub?.valid_until) {
        const expiry = new Date(sub.valid_until);
        const msDiff = expiry.getTime() - now.getTime();
        daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
        isExpired = daysRemaining <= 0;
        isExpiringSoon = daysRemaining > 0 && daysRemaining <= 7;
      }

      let resolvedStatus = 'ACTIVE';
      if (t.status === 'ARCHIVED' || t.status === 'DELETED') {
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

      const isMasterHq = t.name === 'SuPuja Creations' || t.tenant_code === 'SUPUJA_CREATIONS' || t.tenant_code === 'TNT00001' || t.id === '0a37b8e8-1c28-4e19-8891-951fc3f8f8af' || t.id === 'e7d483b2-3fcb-4eb2-9d39-e932b7bb5ff4';
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

      return {
        id: t.id,
        tenant_code: t.tenant_code,
        name: t.name,
        primary_contact_email: t.primary_contact_email || (t.id === DEFAULT_TENANT_ID ? 'admin@newswangroup.com' : null),
        primary_contact_mobile: t.primary_contact_mobile || null,
        branches,
        status: resolvedStatus,
        raw_status: t.status,
        created_at: t.created_at,
        subscription: sub ? {
          ...sub,
          days_remaining: daysRemaining,
          is_expired: isExpired,
          is_expiring_soon: isExpiringSoon,
          status: resolvedStatus
        } : null,
        entitlements: tEntitlements,
        active_users_count: activeUserCount,
        module_rates: Object.fromEntries((billableCatalog || []).map(p => [p.process_code, pricingConfig?.tenant_rates?.[t.id]?.[p.process_code] ?? p.monthly_rate_per_user])),
        user_seat_limit: sub?.user_seat_limit || (t.id === DEFAULT_TENANT_ID ? 200 : 5),
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
export async function purchaseAddonSeats(tenantId, additionalSeats, requestId = null) {
  try {
    const admin = getAdminClient();
    const actor = await requireSaasTenant(admin, tenantId, {
      manage: true
    });
    const add = saasNumber(additionalSeats, 'Additional seats', {
      min: 1,
      max: 100000,
      integer: true
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
    } = await admin.from('tenant_entitlements').select('module_key,is_enabled').eq('tenant_id', tenantId);
    if (entError) throw entError;
    const pricing = await getProcessCatalog(tenantId);
    if (!pricing.success) throw new Error(pricing.error);
    const rate = pricing.catalog.filter(p => p.is_active !== false && (ent || []).some(e => e.module_key === p.process_code && e.is_enabled)).reduce((sum, p) => sum + Number(p.monthly_rate_per_user), 0);
    const days = Math.max(0, Math.ceil((new Date(sub.valid_until) - Date.now()) / 86400000));
    if (!days) throw new Error('Renew before requesting additional seats.');
    const result = await applySaasBilling(admin, actor, tenantId, requestId, 'ADDON_PROFORMA', {
      current_seats: sub.user_seat_limit,
      new_seats: sub.user_seat_limit + add,
      months: 0,
      billing_mode: 'SAME_EXPIRY',
      amount: Math.round(add * rate * days / 30 * 100) / 100,
      gst_type: 'IGST'
    });
    return {
      success: true,
      ...result,
      newLimit: sub.user_seat_limit,
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
export async function purchaseAddonModule(tenantId, processCode, requestId = null) {
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
    const days = Math.max(0, Math.ceil((new Date(sub.valid_until) - Date.now()) / 86400000));
    if (!days) throw new Error('Renew before requesting modules.');
    const result = await applySaasBilling(admin, actor, tenantId, requestId, 'MODULE_PROFORMA', {
      module_key: processCode,
      amount: Math.round(item.monthly_rate_per_user * sub.user_seat_limit * days / 30 * 100) / 100,
      gst_type: 'IGST'
    });
    return {
      success: true,
      ...result,
      message: 'Module request and proforma saved. Master Admin must approve activation.'
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
export async function updateTenantEntitlements(tenantId, enabledModuleKeys = []) {
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
    const updates = items.map(p => ({
      tenant_id: tenantId,
      module_key: p.process_code,
      is_enabled: keys.has(p.process_code),
      config_json: {
        ...((existing || []).find(r => r.module_key === p.process_code)?.config_json || {}),
        updated_at: new Date().toISOString(),
        manual_override: true
      }
    }));
    const result = await admin.from('tenant_entitlements').upsert(updates, {
      onConflict: 'tenant_id,module_key'
    });
    if (result.error) throw result.error;
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
    let kind = 'RENEWAL';
    let payload = {
      amount: saasNumber(amount, 'Amount'),
      months: saasNumber(months, 'Months', {
        min: 1,
        max: 120,
        integer: true
      }),
      gst_type: gstType,
      payment_mode: paymentMode,
      transaction_id: String(transactionId).trim()
    };
    if (sourceInvoiceNumber) {
      const {
        data: source,
        error
      } = await admin.from('saas_billing_events').select('tenant_id,operation,request_payload,invoice').eq('tenant_id', tenantId).eq('invoice_number', String(sourceInvoiceNumber)).maybeSingle();
      if (error) throw error;
      if (!source || !['ADDON_PROFORMA', 'MODULE_PROFORMA'].includes(source.operation)) throw new Error('This invoice cannot be paid through the add-on confirmation flow.');
      kind = source.operation === 'MODULE_PROFORMA' ? 'MODULE_PAYMENT' : 'ADDON_PAYMENT';
      payload = {
        ...source.request_payload,
        payment_mode: paymentMode,
        transaction_id: String(transactionId).trim(),
        source_invoice_number: source.invoice.invoice_number
      };
    }
    const result = await applySaasBilling(admin, actor, tenantId, requestId, kind, payload);
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
