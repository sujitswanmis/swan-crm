'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

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

const CONFIG_ENTITLEMENT_KEY = 'SAAS_PRICING_CONFIG';

/**
 * Fetch dynamic pricing config from DB or fallback
 */
async function getDynamicConfig(adminClient) {
  try {
    const { data } = await adminClient
      .from('tenant_entitlements')
      .select('config_json')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('module_key', CONFIG_ENTITLEMENT_KEY)
      .maybeSingle();

    if (data?.config_json) {
      return data.config_json;
    }
  } catch (err) {
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

    let catalog = DEFAULT_PROCESS_CATALOG.map(item => ({
      ...item,
      monthly_rate_per_user: typeof catalogRates[item.process_code] === 'number'
        ? catalogRates[item.process_code]
        : item.monthly_rate_per_user
    }));

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
export async function calculatePlanPrice({ processCodes = [], userSeats = 1, cycleCode = 'MONTHLY', tenantId = null }) {
  try {
    const { catalog } = await getProcessCatalog(tenantId);
    const { cycles } = await getCycleDiscounts();

    const selectedItems = catalog.filter(p => processCodes.includes(p.process_code) && p.is_active);
    const ratePerSeatMonthly = selectedItems.reduce((acc, p) => acc + Number(p.monthly_rate_per_user || 0), 0);

    const cycleInfo = cycles.find(c => c.cycle_code === cycleCode) || cycles[0];
    const months = cycleInfo.months_count || 1;
    const discountPercent = cycleInfo.discount_percent || 0;

    const seats = Math.max(1, parseInt(userSeats, 10) || 1);
    const monthlyTotal = ratePerSeatMonthly * seats;
    const grossTotal = monthlyTotal * months;
    const discountAmount = Math.round((grossTotal * (discountPercent / 100)) * 100) / 100;
    const finalAmount = Math.max(0, Math.round((grossTotal - discountAmount) * 100) / 100);

    return {
      success: true,
      selected_count: selectedItems.length,
      seats,
      cycle_code: cycleInfo.cycle_code,
      months,
      discount_percent: discountPercent,
      rate_per_seat_monthly: ratePerSeatMonthly,
      monthly_total: monthlyTotal,
      gross_total: grossTotal,
      discount_amount: discountAmount,
      final_amount: finalAmount
    };
  } catch (err) {
    console.error('calculatePlanPrice error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get tenant subscription details and status
 */
export async function getTenantSubscription(tenantId = DEFAULT_TENANT_ID) {
  try {
    const admin = getAdminClient();
    const targetTenantId = tenantId || DEFAULT_TENANT_ID;

    const { data: sub, error } = await admin
      .from('tenant_subscriptions')
      .select('*')
      .eq('tenant_id', targetTenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !sub) {
      // Safe fallback for New Swan Group
      if (targetTenantId === DEFAULT_TENANT_ID) {
        return {
          success: true,
          subscription: {
            tenant_id: DEFAULT_TENANT_ID,
            plan_name: 'ENTERPRISE_ALL_MODULES',
            user_seat_limit: 999999,
            valid_from: '2026-01-01T00:00:00+05:30',
            valid_until: '2099-12-31T23:59:59+05:30',
            status: 'ACTIVE',
            days_remaining: 26000,
            is_expiring_soon: false,
            is_expired: false
          }
        };
      }
      return { success: false, error: 'Subscription not found', subscription: null };
    }

    const now = new Date();
    const expiry = new Date(sub.valid_until);
    const msDiff = expiry.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
    const isExpired = daysRemaining <= 0;
    const isExpiringSoon = daysRemaining > 0 && daysRemaining <= 7;

    return {
      success: true,
      subscription: {
        ...sub,
        days_remaining: daysRemaining,
        is_expiring_soon: isExpiringSoon,
        is_expired: isExpired,
        status: isExpired ? 'EXPIRED' : (isExpiringSoon ? 'EXPIRING_SOON' : sub.status || 'ACTIVE')
      }
    };
  } catch (err) {
    console.error('getTenantSubscription error:', err);
    return {
      success: false,
      error: err.message,
      subscription: {
        tenant_id: DEFAULT_TENANT_ID,
        plan_name: 'ENTERPRISE_ALL_MODULES',
        user_seat_limit: 999999,
        status: 'ACTIVE',
        days_remaining: 26000,
        is_expiring_soon: false,
        is_expired: false
      }
    };
  }
}

/**
 * Get map of all enabled modules for a tenant
 */
export async function getTenantEntitlements(tenantId = DEFAULT_TENANT_ID) {
  try {
    const admin = getAdminClient();
    const targetTenantId = tenantId || DEFAULT_TENANT_ID;

    // For default New Swan Group, all modules are always enabled
    if (targetTenantId === DEFAULT_TENANT_ID) {
      const allEnabled = {};
      DEFAULT_PROCESS_CATALOG.forEach(p => {
        allEnabled[p.process_code] = true;
      });
      return { success: true, entitlements: allEnabled };
    }

    const { data: rows, error } = await admin
      .from('tenant_entitlements')
      .select('module_key, is_enabled')
      .eq('tenant_id', targetTenantId);

    if (error) throw error;

    const entitlements = {};
    (rows || []).forEach(row => {
      entitlements[row.module_key] = !!row.is_enabled;
    });

    return { success: true, entitlements };
  } catch (err) {
    console.error('getTenantEntitlements error:', err);
    // Safe fallback: enable all to prevent blocking
    const allEnabled = {};
    DEFAULT_PROCESS_CATALOG.forEach(p => { allEnabled[p.process_code] = true; });
    return { success: true, entitlements: allEnabled };
  }
}

/**
 * Super Admin: Update process price dynamically
 */
export async function updateProcessRate(processCode, newMonthlyRate) {
  try {
    const admin = getAdminClient();
    const config = (await getDynamicConfig(admin)) || {};
    const rates = config.rates || {};
    rates[processCode] = Number(newMonthlyRate);

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
    const config = (await getDynamicConfig(admin)) || {};
    const discounts = config.discounts || {};
    discounts[cycleCode] = Number(newDiscountPercent);

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
