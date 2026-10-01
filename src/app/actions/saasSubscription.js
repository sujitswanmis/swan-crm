'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_TENANT_ID,
  DEFAULT_PROCESS_CATALOG,
  DEFAULT_CYCLE_DISCOUNTS
} from '@/utils/saasEntitlements';

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

/**
 * Fetch all tenants with active subscriptions and user counts for Super Admin
 */
export async function getAllTenantsWithSubscriptions() {
  try {
    const admin = getAdminClient();
    const { data: tenantsList, error: tErr } = await admin
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });

    if (tErr) throw tErr;

    const { data: subsList } = await admin
      .from('tenant_subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: entitlementsList } = await admin
      .from('tenant_entitlements')
      .select('tenant_id, module_key, is_enabled');

    const { data: userCounts } = await admin
      .from('user_roles')
      .select('tenant_id, user_id, role');

    const now = new Date();

    const enriched = (tenantsList || []).map(t => {
      const sub = (subsList || []).find(s => s.tenant_id === t.id);
      const tEntitlements = (entitlementsList || [])
        .filter(e => e.tenant_id === t.id && e.is_enabled)
        .map(e => e.module_key);

      const activeUserCount = (userCounts || []).filter(u => 
        (u.tenant_id === t.id || (!u.tenant_id && t.id === DEFAULT_TENANT_ID)) && 
        u.role !== 'customer'
      ).length;

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

      return {
        id: t.id,
        tenant_code: t.tenant_code,
        name: t.name,
        status: t.status || 'ACTIVE',
        created_at: t.created_at,
        subscription: sub ? {
          ...sub,
          days_remaining: daysRemaining,
          is_expired: isExpired,
          is_expiring_soon: isExpiringSoon
        } : null,
        entitlements: tEntitlements,
        active_users_count: activeUserCount,
        user_seat_limit: sub?.user_seat_limit || (t.id === DEFAULT_TENANT_ID ? 999999 : 5)
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
    const { data: existing } = await admin
      .from('tenant_subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const months = Math.max(1, parseInt(monthsToAdd, 10) || 1);
    let baseDate = new Date();
    if (existing?.valid_until) {
      const currentExpiry = new Date(existing.valid_until);
      if (currentExpiry > baseDate) {
        baseDate = currentExpiry;
      }
    }

    const newExpiry = new Date(baseDate);
    newExpiry.setMonth(newExpiry.getMonth() + months);

    if (existing) {
      const { error } = await admin
        .from('tenant_subscriptions')
        .update({
          valid_until: newExpiry.toISOString(),
          status: 'ACTIVE',
          updated_at: new Date().toISOString()
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
      message: `वैलिडिटी सफलतापूर्वक ${months} महीने आगे बढ़ाई गई! (New Expiry: ${newExpiry.toLocaleDateString('en-IN')})`
    };
  } catch (err) {
    console.error('extendTenantSubscription error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Super Admin: Update a tenant's purchased seat limit
 */
export async function updateTenantSeats(tenantId, newSeatLimit) {
  try {
    const admin = getAdminClient();
    const seats = Math.max(1, parseInt(newSeatLimit, 10) || 1);

    const { data: existing } = await admin
      .from('tenant_subscriptions')
      .select('id')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from('tenant_subscriptions')
        .update({ user_seat_limit: seats })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from('tenant_subscriptions')
        .insert([{
          tenant_id: tenantId,
          plan_name: 'STANDARD',
          user_seat_limit: seats,
          valid_from: new Date().toISOString(),
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'ACTIVE',
          billing_cycle: 'MONTHLY'
        }]);
      if (error) throw error;
    }

    return { success: true, message: `सीट लिमिट अपडेट होकर ${seats} हो गई है!` };
  } catch (err) {
    console.error('updateTenantSeats error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Super Admin: Assign client-specific negotiated rate
 */
export async function updateTenantCustomRate(tenantId, processCode, customRate) {
  try {
    const admin = getAdminClient();
    const config = (await getDynamicConfig(admin)) || {};
    const tenantRates = config.tenant_rates || {};
    if (!tenantRates[tenantId]) {
      tenantRates[tenantId] = {};
    }
    tenantRates[tenantId][processCode] = Number(customRate);
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
  cycleCode = 'YEARLY'
}) {
  try {
    const admin = getAdminClient();

    if (!companyName || !adminEmail || !adminPassword || !adminName) {
      return { success: false, error: 'कृपया कंपनी का नाम, एडमिन का नाम, ईमेल और पासवर्ड भरें।' };
    }

    const cleanEmail = adminEmail.trim().toLowerCase();
    const cleanCompany = companyName.trim();
    const cleanName = adminName.trim();
    const cleanMobile = adminMobile ? adminMobile.trim() : '';

    // Generate unique slug tenant_code
    const baseSlug = cleanCompany
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/__+/g, '_')
      .substring(0, 14) || 'WORKSPACE';
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const tenantCode = `${baseSlug}_${randSuffix}`;

    // 1. Create tenant row
    const { data: newTenant, error: tenantErr } = await admin
      .from('tenants')
      .insert([{
        tenant_code: tenantCode,
        name: cleanCompany,
        primary_contact_email: cleanEmail,
        primary_contact_mobile: cleanMobile || null,
        status: 'ACTIVE'
      }])
      .select()
      .single();

    if (tenantErr) {
      console.error('Tenant creation error:', tenantErr);
      throw new Error(`कंपनी रजिस्टर करने में त्रुटि: ${tenantErr.message}`);
    }

    // 2. Create Auth User
    let userId = null;
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        name: cleanName,
        mobile: cleanMobile,
        company: cleanCompany
      }
    });

    if (authError) {
      if (authError.message?.toLowerCase().includes('already registered')) {
        const { data: userList } = await admin.auth.admin.listUsers();
        const existing = userList?.users?.find(
          u => u.email?.toLowerCase() === cleanEmail
        );
        if (existing) {
          userId = existing.id;
        } else {
          throw new Error(`ईमेल पहले से सिस्टम में मौजूद है: ${authError.message}`);
        }
      } else {
        throw new Error(`यूज़र क्रेडेंशियल बनाने में त्रुटि: ${authError.message}`);
      }
    } else if (authData?.user) {
      userId = authData.user.id;
    }

    // 3. Setup Administrator in user_roles
    const userRolePayload = {
      user_id: userId,
      tenant_id: newTenant.id,
      role: 'admin',
      is_approved: true,
      can_read: true,
      can_write: true,
      emp_id: 'ADM-001',
      emp_name: cleanName,
      emp_official_mail_id: cleanEmail,
      emp_mobile: cleanMobile,
      emp_designation: 'Chief Administrator',
      emp_department: 'Administration',
      company: cleanCompany,
      emp_status: 'Active'
    };

    const { error: roleError } = await admin
      .from('user_roles')
      .upsert(userRolePayload, { onConflict: 'user_id' });

    if (roleError) {
      console.warn('user_roles setup notice:', roleError.message);
    }

    // 4. Calculate Subscription Dates strictly in IST
    const now = new Date();
    let monthsToAdd = 1;
    if (cycleCode === 'QUARTERLY') monthsToAdd = 3;
    else if (cycleCode === 'HALF_YEARLY') monthsToAdd = 6;
    else if (cycleCode === 'YEARLY') monthsToAdd = 12;

    const expiryDate = new Date(now);
    expiryDate.setMonth(expiryDate.getMonth() + monthsToAdd);

    // Calculate dynamic price
    const priceRes = await calculatePlanPrice({
      processCodes,
      userSeats,
      cycleCode,
      tenantId: newTenant.id
    });
    const finalAmount = priceRes.success ? priceRes.final_amount : 0;

    // 5. Insert Subscription Record
    const { error: subError } = await admin
      .from('tenant_subscriptions')
      .insert([{
        tenant_id: newTenant.id,
        plan_name: 'SAAS_MODULAR',
        user_seat_limit: Math.max(1, parseInt(userSeats, 10) || 5),
        valid_from: now.toISOString(),
        valid_until: expiryDate.toISOString(),
        status: 'ACTIVE',
        billing_cycle: cycleCode,
        amount: finalAmount
      }]);

    if (subError) {
      console.warn('Subscription creation notice:', subError.message);
    }

    // 6. Insert Tenant Entitlements for Chosen Modules
    const entitlementsRows = (processCodes || []).map((code) => ({
      tenant_id: newTenant.id,
      module_key: code,
      is_enabled: true,
      config_json: {
        activated_at: now.toISOString(),
        plan: 'SAAS_MODULAR',
        billing_cycle: cycleCode
      }
    }));

    if (entitlementsRows.length > 0) {
      const { error: entError } = await admin
        .from('tenant_entitlements')
        .upsert(entitlementsRows, { onConflict: 'tenant_id,module_key' });
      if (entError) console.warn('Entitlements insert notice:', entError.message);
    }

    // 7. Insert default company record into companies table
    try {
      await admin.from('companies').insert([{
        tenant_id: newTenant.id,
        code: `${tenantCode}_MAIN`,
        name: cleanCompany,
        status: 'ACTIVE'
      }]);
    } catch (compErr) {
      console.warn('Default company insert note:', compErr.message);
    }

    return {
      success: true,
      tenantId: newTenant.id,
      tenantCode,
      adminEmail: cleanEmail,
      message: `कंपनी वर्कस्पेस '${cleanCompany}' (${tenantCode}) सफलतापूर्वक सक्रिय हो गया!`
    };
  } catch (err) {
    console.error('createTenantWorkspace error:', err);
    return { success: false, error: err.message || 'कंपनी वर्कस्पेस बनाने में समस्या आई।' };
  }
}

/**
 * Tenant Self-Serve / Add-on: Purchase additional user seats
 */
export async function purchaseAddonSeats(tenantId, additionalSeats) {
  try {
    const admin = getAdminClient();
    const addSeats = Math.max(1, parseInt(additionalSeats, 10) || 1);

    const { data: sub, error: subErr } = await admin
      .from('tenant_subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr) throw subErr;

    const currentSeats = sub?.user_seat_limit || 5;
    const newLimit = currentSeats + addSeats;

    if (sub) {
      const { error } = await admin
        .from('tenant_subscriptions')
        .update({
          user_seat_limit: newLimit,
          updated_at: new Date().toISOString()
        })
        .eq('id', sub.id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from('tenant_subscriptions')
        .insert([{
          tenant_id: tenantId,
          plan_name: 'SAAS_CUSTOM',
          user_seat_limit: newLimit,
          valid_from: new Date().toISOString(),
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'ACTIVE',
          billing_cycle: 'MONTHLY'
        }]);
      if (error) throw error;
    }

    return {
      success: true,
      newLimit,
      message: `सफलतापूर्वक ${addSeats} अतिरिक्त सीट्स जोड़ दी गईं! कुल सीमा: ${newLimit} Users.`
    };
  } catch (err) {
    console.error('purchaseAddonSeats error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Tenant Self-Serve / Add-on: Unlock an additional business process module
 */
export async function purchaseAddonModule(tenantId, processCode) {
  try {
    const admin = getAdminClient();
    if (!tenantId || !processCode) {
      return { success: false, error: 'Tenant ID or process code missing.' };
    }

    const { error } = await admin
      .from('tenant_entitlements')
      .upsert({
        tenant_id: tenantId,
        module_key: processCode,
        is_enabled: true,
        config_json: {
          is_addon: true,
          activated_at: new Date().toISOString()
        }
      }, { onConflict: 'tenant_id,module_key' });

    if (error) throw error;

    return {
      success: true,
      message: `मॉड्यूल '${processCode}' सफलतापूर्वक अनलॉक हो गया है!`
    };
  } catch (err) {
    console.error('purchaseAddonModule error:', err);
    return { success: false, error: err.message };
  }
}


