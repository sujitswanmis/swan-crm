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
            user_seat_limit: 200,
            valid_from: '2026-10-01T00:00:00+05:30',
            valid_until: '2027-10-01T23:59:59+05:30',
            status: 'ACTIVE',
            days_remaining: 354,
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
        user_seat_limit: 200,
        status: 'ACTIVE',
        days_remaining: 354,
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

    const { data: rows, error } = await admin
      .from('tenant_entitlements')
      .select('module_key, is_enabled')
      .eq('tenant_id', targetTenantId);

    if (error) throw error;

    const entitlements = {};
    if (rows && rows.length > 0) {
      rows.forEach(row => {
        entitlements[row.module_key] = !!row.is_enabled;
      });
    } else if (targetTenantId === DEFAULT_TENANT_ID) {
      // Safe fallback for initial setup if no DB rows configured yet
      DEFAULT_PROCESS_CATALOG.forEach(p => {
        entitlements[p.process_code] = true;
      });
      return { success: true, entitlements };
    }

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
      .select('company, user_id, role, emp_official_mail_id');

    const now = new Date();

    const enriched = (tenantsList || []).map(t => {
      const sub = (subsList || []).find(s => s.tenant_id === t.id);
      const tEntitlements = (entitlementsList || [])
        .filter(e => e.tenant_id === t.id && e.is_enabled)
        .map(e => e.module_key);

      const activeUserCount = (userCounts || []).filter(u => {
        if (u.role === 'customer') return false;
        const comp = String(u.company || '').trim().toLowerCase();
        const tName = String(t.name || '').trim().toLowerCase();
        const tCode = String(t.tenant_code || '').trim().toLowerCase();
        if (t.id === DEFAULT_TENANT_ID) {
          return comp === 'nstlp' || comp === 'nsmlr' || comp === 'new swan group' || comp === 'swan agro' || !comp;
        }
        return comp === tName || comp === tCode || (u.emp_official_mail_id && u.emp_official_mail_id.toLowerCase() === (t.primary_contact_email || '').toLowerCase());
      }).length;

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
      if (t.status === 'DELETED') {
        resolvedStatus = 'DELETED';
      } else if (t.status === 'DRAFT') {
        resolvedStatus = 'DRAFT';
      } else if (t.status === 'TRIAL' || sub?.status === 'TRIAL' || String(sub?.billing_cycle || '').startsWith('TRIAL')) {
        resolvedStatus = isExpired ? 'EXPIRED' : 'TRIAL';
      } else if (isExpired) {
        resolvedStatus = 'EXPIRED';
      } else if (isExpiringSoon) {
        resolvedStatus = 'EXPIRING_SOON';
      } else {
        resolvedStatus = sub?.status || t.status || 'ACTIVE';
      }

      const branches = t.id === DEFAULT_TENANT_ID ? ['NSMLR', 'NSTLP'] : (t.branches || []);

      return {
        id: t.id,
        tenant_code: t.tenant_code,
        name: t.name,
        primary_contact_email: t.primary_contact_email || (t.id === DEFAULT_TENANT_ID ? 'admin@newswangroup.com' : null),
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
        user_seat_limit: sub?.user_seat_limit || (t.id === DEFAULT_TENANT_ID ? 200 : 5)
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
  cycleCode = 'YEARLY',
  trialDays = 0,
  isDraft = false
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
    const initialStatus = isDraft ? 'DRAFT' : (Number(trialDays) > 0 ? 'TRIAL' : 'ACTIVE');

    // Generate clean slug tenant_code
    const baseSlug = cleanCompany
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/__+/g, '_')
      .replace(/^_|_$/g, '') || 'WORKSPACE';

    const { data: existingSlug } = await admin
      .from('tenants')
      .select('id')
      .eq('tenant_code', baseSlug)
      .maybeSingle();

    const tenantCode = existingSlug ? `${baseSlug}_${Math.floor(1000 + Math.random() * 9000)}` : baseSlug;

    // 1. Create tenant row
    const { data: newTenant, error: tenantErr } = await admin
      .from('tenants')
      .insert([{
        tenant_code: tenantCode,
        name: cleanCompany,
        primary_contact_email: cleanEmail,
        primary_contact_mobile: cleanMobile || null,
        status: initialStatus
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

    // 3. Setup Administrator in user_roles (uses company column)
    const userRolePayload = {
      user_id: userId,
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
    const isTrial = Number(trialDays) > 0;
    let expiryDate;
    let finalAmount = 0;
    let assignedCycle = cycleCode;

    if (isTrial) {
      const tDays = Math.max(1, parseInt(trialDays, 10));
      expiryDate = new Date(now.getTime() + tDays * 24 * 60 * 60 * 1000);
      assignedCycle = `TRIAL_${tDays}D`;
      finalAmount = 0;
    } else {
      let monthsToAdd = 1;
      if (cycleCode === 'QUARTERLY') monthsToAdd = 3;
      else if (cycleCode === 'HALF_YEARLY') monthsToAdd = 6;
      else if (cycleCode === 'YEARLY') monthsToAdd = 12;

      expiryDate = new Date(now);
      expiryDate.setMonth(expiryDate.getMonth() + monthsToAdd);

      const priceRes = await calculatePlanPrice({
        processCodes,
        userSeats,
        cycleCode,
        tenantId: newTenant.id
      });
      finalAmount = priceRes.success ? priceRes.final_amount : 0;
    }

    // 5. Insert Subscription Record
    const { error: subError } = await admin
      .from('tenant_subscriptions')
      .insert([{
        tenant_id: newTenant.id,
        plan_name: isTrial ? 'FREE_TRIAL' : 'SAAS_MODULAR',
        user_seat_limit: Math.max(1, parseInt(userSeats, 10) || 5),
        valid_from: now.toISOString(),
        valid_until: expiryDate.toISOString(),
        status: initialStatus,
        billing_cycle: assignedCycle,
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
        status: initialStatus
      }]);
    } catch (compErr) {
      console.warn('Default company insert note:', compErr.message);
    }

    const successMessage = isDraft
      ? `कंपनी वर्कस्पेस '${cleanCompany}' (${tenantCode}) ड्राफ्ट के रूप में सुरक्षित सेव हो गया!`
      : `कंपनी वर्कस्पेस '${cleanCompany}' (${tenantCode}) सफलतापूर्वक सक्रिय हो गया!`;

    return {
      success: true,
      tenantId: newTenant.id,
      tenantCode,
      adminEmail: cleanEmail,
      message: successMessage
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

/**
 * Super Admin: Toggle / Manage enabled modules for a specific tenant
 */
export async function updateTenantEntitlements(tenantId, enabledModuleKeys = []) {
  try {
    const admin = getAdminClient();
    if (!tenantId) throw new Error('Tenant ID missing.');

    const allModules = DEFAULT_PROCESS_CATALOG.map(p => p.process_code);
    const updates = allModules.map(code => ({
      tenant_id: tenantId,
      module_key: code,
      is_enabled: enabledModuleKeys.includes(code),
      config_json: {
        updated_at: new Date().toISOString(),
        manual_override: true
      }
    }));

    const { error } = await admin
      .from('tenant_entitlements')
      .upsert(updates, { onConflict: 'tenant_id,module_key' });

    if (error) throw error;
    return {
      success: true,
      message: 'कंपनी के मॉड्यूल्स सफलतापूर्वक अपडेट हो गए!'
    };
  } catch (err) {
    console.error('updateTenantEntitlements error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Super Admin: Extend or assign Free Trial (1, 3, 7, 10, or custom days)
 */
export async function extendTenantSubscriptionTrial(tenantId, trialDays = 7) {
  try {
    const admin = getAdminClient();
    const days = Math.max(1, parseInt(trialDays, 10) || 7);
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
          billing_cycle: `TRIAL_${days}D`,
          updated_at: now.toISOString()
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
    await admin.from('tenants').update({ status: 'TRIAL', updated_at: now.toISOString() }).eq('id', tenantId);

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
    if (!tenantId) throw new Error('Tenant ID missing.');

    const now = new Date();
    let expiryIso;
    if (validUntil) {
      const parsed = new Date(validUntil);
      expiryIso = isNaN(parsed.getTime()) ? now.toISOString() : parsed.toISOString();
    } else {
      expiryIso = now.toISOString();
    }

    const normalizedStatus = status === 'FREE TRIAL' ? 'TRIAL' : status;

    // 1. Update tenants table
    await admin.from('tenants').update({
      status: normalizedStatus,
      updated_at: now.toISOString()
    }).eq('id', tenantId);

    // 2. Update subscription record
    const { data: existing } = await admin
      .from('tenant_subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const subPayload = {
      valid_until: expiryIso,
      status: normalizedStatus,
      updated_at: now.toISOString()
    };
    if (billingCycle) {
      subPayload.billing_cycle = billingCycle;
    }

    if (existing) {
      const { error } = await admin
        .from('tenant_subscriptions')
        .update(subPayload)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from('tenant_subscriptions')
        .insert([{
          tenant_id: tenantId,
          plan_name: 'CUSTOM_PLAN',
          user_seat_limit: 5,
          valid_from: now.toISOString(),
          ...subPayload
        }]);
      if (error) throw error;
    }

    return {
      success: true,
      message: `वैलिडिटी और स्टेटस सफलतापूर्वक अपडेट हो गया! (New Expiry: ${new Date(expiryIso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })})`
    };
  } catch (err) {
    console.error('updateTenantValidityAndStatus error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Super Admin: Soft delete workspace (Move to Deleted Archive for 1-3 months retention)
 */
export async function softDeleteTenantWorkspace(tenantId) {
  try {
    const admin = getAdminClient();
    if (!tenantId) throw new Error('Tenant ID missing.');
    if (tenantId === DEFAULT_TENANT_ID) {
      throw new Error('New Swan Group (Master Workspace) को डिलीट नहीं किया जा सकता!');
    }

    const now = new Date().toISOString();

    const { error: tErr } = await admin
      .from('tenants')
      .update({ status: 'DELETED', updated_at: now })
      .eq('id', tenantId);
    if (tErr) throw tErr;

    await admin
      .from('tenant_subscriptions')
      .update({ status: 'DELETED', updated_at: now })
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
      .update({ status: 'ACTIVE', updated_at: now })
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
  months = 12
}) {
  try {
    const admin = getAdminClient();
    const now = new Date();
    const newExpiry = new Date(now);
    newExpiry.setMonth(newExpiry.getMonth() + Number(months || 12));

    const { data: sub } = await admin
      .from('tenant_subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (sub) {
      await admin
        .from('tenant_subscriptions')
        .update({
          valid_until: newExpiry.toISOString(),
          status: 'ACTIVE',
          amount: Number(amount || 0),
          billing_cycle: Number(months) === 12 ? 'YEARLY' : (Number(months) === 6 ? 'HALF_YEARLY' : 'MONTHLY'),
          updated_at: now.toISOString()
        })
        .eq('id', sub.id);
    } else {
      await admin
        .from('tenant_subscriptions')
        .insert([{
          tenant_id: tenantId,
          plan_name: 'SAAS_MODULAR',
          user_seat_limit: 5,
          valid_from: now.toISOString(),
          valid_until: newExpiry.toISOString(),
          status: 'ACTIVE',
          billing_cycle: Number(months) === 12 ? 'YEARLY' : 'MONTHLY',
          amount: Number(amount || 0)
        }]);
    }

    await admin.from('tenants').update({ status: 'ACTIVE', updated_at: now.toISOString() }).eq('id', tenantId);

    return {
      success: true,
      invoiceNumber,
      paidAt: now.toISOString(),
      newExpiry: newExpiry.toISOString(),
      message: `भुगतान रिकॉर्ड हो गया! Tax Invoice #${invoiceNumber} जनरेट हो गया।`
    };
  } catch (err) {
    console.error('recordPaymentAndGenerateInvoice error:', err);
    return { success: false, error: err.message };
  }
}




