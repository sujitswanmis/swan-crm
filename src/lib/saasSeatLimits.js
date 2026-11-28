import 'server-only';
import { userBelongsToSaasTenant, isSaasUserActive, SAAS_UUID } from '@/lib/saasAccess';
import { DEFAULT_TENANT_ID, DEFAULT_PROCESS_CATALOG, PROCESS_TO_TABS_MAP } from '@/utils/saasEntitlements';
import { SAAS_INTERNAL_KEYS } from '@/lib/saasBilling';
import { checkIsAdminRole, checkIsMasterAdmin, getModulePermissions, getSubItemPermissions } from '@/utils/permissionUtils';

const MASTER_HQ_IDS = new Set([
  '0a37b8e8-1c28-4e19-8891-951fc3f8f8af',
  'e7d483b2-3fcb-4eb2-9d39-e932b7bb5ff4'
]);

const CHANNEL_PROCESS_SUBITEMS = {
  DAILY_ORDER_FOLLOWUP: ['orders', 'frequency_rules', 'order_followup', 'order_pipeline', 'order_feedback', 'all_orders'],
  COMPLAINT_MANAGEMENT: ['complaints'],
  MONTHLY_PARTY_FEEDBACK: ['monthly_feedback'],
  END_CUSTOMER_MASTER: ['end_customers']
};

/**
 * Only the Master HQ workspace (Supuja Creations / TNT00001) is exempt from seat caps.
 * All other workspaces (including New Swan Group / TNT00002) enforce configured seat limits.
 */
export function isMasterHqExemptForSeats(tenantOrId) {
  if (!tenantOrId) return false;
  if (typeof tenantOrId === 'string') {
    const v = tenantOrId.trim().toLowerCase();
    return MASTER_HQ_IDS.has(v) || v === 'tnt00001' || v === 'supuja_creations' || v === 'supuja creations';
  }
  const idLower = String(tenantOrId.id || '').trim().toLowerCase();
  const codeLower = String(tenantOrId.tenant_code || '').trim().toLowerCase();
  const nameLower = String(tenantOrId.name || '').trim().toLowerCase();
  return (
    MASTER_HQ_IDS.has(idLower) ||
    codeLower === 'tnt00001' ||
    codeLower === 'supuja_creations' ||
    nameLower === 'supuja creations'
  );
}

function parseAccessJson(rawAccess) {
  if (typeof rawAccess === 'string') {
    try { return JSON.parse(rawAccess); } catch { return {}; }
  }
  return rawAccess && typeof rawAccess === 'object' ? rawAccess : {};
}

export function userHasModuleProcessAccess(user, processCode) {
  try {
    const access = parseAccessJson(user?.module_access);
    const role = user?.role || '';
    const email = user?.email || user?.emp_official_mail_id || '';
    if (checkIsMasterAdmin(access, role, email) || checkIsAdminRole(role) || String(role).trim().toLowerCase() === 'tenant_admin') {
      return { hasAccess: true, isAdmin: true };
    }
    const code = String(processCode || '').trim().toUpperCase();
    const channelSubs = CHANNEL_PROCESS_SUBITEMS[code];
    let granted = false;
    if (channelSubs) {
      granted = channelSubs.some(subId => getSubItemPermissions(access, role, 'channel_ops', subId, 'all').view === true)
        || (code === 'END_CUSTOMER_MASTER' && getSubItemPermissions(access, role, 'party', 'end_customers', 'all').view === true);
    }
    if (!granted) {
      const mappedTabs = PROCESS_TO_TABS_MAP[code] || [code.toLowerCase()];
      granted = mappedTabs.some(tabId => getModulePermissions(access, role, tabId, 'all').view === true);
    }
    return { hasAccess: granted, isAdmin: false };
  } catch {
    return { hasAccess: false, isAdmin: false };
  }
}

export function computeTenantModuleUsage(activeUsers = [], processCode, { includeUsersList = true } = {}) {
  let usedSeats = 0;
  let staffUsed = 0;
  let adminUsed = 0;
  const assignedUsers = [];

  for (const u of activeUsers) {
    const { hasAccess, isAdmin } = userHasModuleProcessAccess(u, processCode);
    if (!hasAccess) continue;
    usedSeats += 1;
    if (isAdmin) adminUsed += 1;
    else staffUsed += 1;
    if (includeUsersList) {
      assignedUsers.push({
        user_id: u.user_id || null,
        emp_id: u.emp_id || '',
        emp_name: u.emp_name || u.email || u.emp_official_mail_id || 'Staff Member',
        email: u.emp_official_mail_id || u.email || '',
        role: u.role || 'staff',
        is_admin: isAdmin
      });
    }
  }

  return {
    used_seats: usedSeats,
    staff_used_seats: staffUsed,
    admin_used_seats: adminUsed,
    assigned_users: assignedUsers
  };
}

async function loadTenantSeatContext(adminClient, tenantIdentifier, sampleUser = null) {
  const { data: allTenants, error: tErr } = await adminClient
    .from('tenants')
    .select('id, name, tenant_code, status');
  if (tErr) throw tErr;

  const list = allTenants || [];
  let tenant = null;

  if (tenantIdentifier && typeof tenantIdentifier === 'object' && tenantIdentifier.id) {
    tenant = tenantIdentifier;
  } else if (tenantIdentifier) {
    const raw = String(tenantIdentifier).trim();
    const rawLower = raw.toLowerCase();
    tenant = list.find(t =>
      (SAAS_UUID.test(raw) && t.id === raw) ||
      String(t.tenant_code || '').trim().toLowerCase() === rawLower ||
      String(t.name || '').trim().toLowerCase() === rawLower
    ) || null;
  }

  if (!tenant && sampleUser) {
    const hintId = sampleUser.tenant_id || sampleUser.module_access?._tenantId;
    if (hintId && SAAS_UUID.test(String(hintId))) {
      tenant = list.find(t => t.id === String(hintId)) || null;
    }
    if (!tenant) {
      tenant = list.find(t => userBelongsToSaasTenant(sampleUser, t, list)) || null;
    }
  }

  if (!tenant) {
    return { tenant: null, allTenants: list, isMasterHq: false };
  }

  return {
    tenant,
    allTenants: list,
    isMasterHq: isMasterHqExemptForSeats(tenant)
  };
}

/**
 * Validate workspace-wide active user seat limit before creating/activating/approving employees.
 * Throws an Error when the workspace limit would be exceeded.
 */
export async function assertTenantWorkspaceSeatAvailable(adminClient, tenantIdentifier, { incomingCount = 1, activatingUserId = null, sampleUser = null } = {}) {
  const { tenant, allTenants, isMasterHq } = await loadTenantSeatContext(adminClient, tenantIdentifier, sampleUser);
  if (!tenant || isMasterHq) return { allowed: true, exempt: isMasterHq };

  const [{ data: sub }, { data: allUsers, error: uErr }] = await Promise.all([
    adminClient
      .from('tenant_subscriptions')
      .select('user_seat_limit')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    adminClient
      .from('user_roles')
      .select('user_id, tenant_id, company, role, is_approved, emp_status, module_access')
  ]);
  if (uErr) throw uErr;

  if (!sub || typeof sub.user_seat_limit !== 'number') {
    return { allowed: true };
  }

  const seatLimit = Math.max(1, Number(sub.user_seat_limit));
  const activeUsers = (allUsers || []).filter(u =>
    userBelongsToSaasTenant(u, tenant, allTenants) && isSaasUserActive(u)
  );
  const alreadyActive = Boolean(activatingUserId && activeUsers.some(u => u.user_id === activatingUserId));
  const needed = alreadyActive ? activeUsers.length : activeUsers.length + Math.max(1, Number(incomingCount) || 1);

  if (needed > seatLimit) {
    throw new Error(
      `आपकी Workspace सीट सीमा (${seatLimit} Users) समाप्त हो चुकी है (${activeUsers.length}/${seatLimit} Active)। अतिरिक्त सदस्य जोड़ने या सक्रिय करने के लिए कृपया Settings → Plan & Billing से सीट्स बढ़ाएं (Add-on Seats)।`
    );
  }

  return { allowed: true, activeCount: activeUsers.length, seatLimit };
}

/**
 * Delta-only per-module licensed seat enforcement.
 * Only validates modules where at least one changed user newly gains active access.
 * Existing access edits and permission removals are never blocked.
 */
export async function assertTenantModuleSeatsAvailable(adminClient, tenantIdentifier, proposedChanges = []) {
  const changes = (Array.isArray(proposedChanges) ? proposedChanges : []).filter(c => c && c.afterUser);
  if (changes.length === 0) return { allowed: true };

  const firstSample = changes[0].afterUser || changes[0].beforeUser;
  const { tenant, allTenants, isMasterHq } = await loadTenantSeatContext(adminClient, tenantIdentifier, firstSample);
  if (!tenant || isMasterHq) return { allowed: true, exempt: isMasterHq };

  const [
    { data: sub },
    { data: entRows, error: eErr },
    { data: allUsers, error: uErr },
    { data: pricingRow }
  ] = await Promise.all([
    adminClient
      .from('tenant_subscriptions')
      .select('user_seat_limit')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    adminClient
      .from('tenant_entitlements')
      .select('module_key, is_enabled, config_json')
      .eq('tenant_id', tenant.id),
    adminClient
      .from('user_roles')
      .select('user_id, tenant_id, company, role, is_approved, emp_status, email, emp_official_mail_id, module_access'),
    adminClient
      .from('tenant_entitlements')
      .select('config_json')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('module_key', 'SAAS_PRICING_CONFIG')
      .maybeSingle()
  ]);

  if (eErr || uErr) throw eErr || uErr;

  const workspaceSeatLimit = Number(sub?.user_seat_limit) || (tenant.id === DEFAULT_TENANT_ID ? 200 : 5);
  const customModules = Array.isArray(pricingRow?.config_json?.custom_modules) ? pricingRow.config_json.custom_modules : [];
  const catalogList = [...DEFAULT_PROCESS_CATALOG];
  for (const cMod of customModules) {
    if (cMod?.process_code && !catalogList.some(x => x.process_code === cMod.process_code)) {
      catalogList.push(cMod);
    }
  }

  const enabledEnts = (entRows || []).filter(r => r.is_enabled === true && !SAAS_INTERNAL_KEYS.has(r.module_key));
  const enabledKeys = new Set(enabledEnts.map(r => r.module_key));
  if (enabledKeys.has('LEADS_WITH_CALLING')) {
    enabledKeys.delete('LEADS_ONLY');
    enabledKeys.delete('CALLING_STANDALONE');
  }

  const activeTenantUsers = (allUsers || []).filter(u =>
    userBelongsToSaasTenant(u, tenant, allTenants) && isSaasUserActive(u)
  );
  const changedUserIds = new Set(changes.map(c => c.afterUser?.user_id || c.beforeUser?.user_id).filter(Boolean));
  const baselineOthers = activeTenantUsers.filter(u => !changedUserIds.has(u.user_id));

  const violations = [];

  for (const processCode of enabledKeys) {
    const entRow = enabledEnts.find(r => r.module_key === processCode);
    const customSeats = Number(entRow?.config_json?.licensed_seats);
    const licensedSeats = customSeats > 0 ? customSeats : workspaceSeatLimit;
    if (licensedSeats <= 0) continue;

    let anyNewlyGained = false;
    let projectedChangedUsed = 0;

    for (const ch of changes) {
      const beforeWasActive = ch.beforeUser ? isSaasUserActive(ch.beforeUser) : false;
      const beforeHadModule = beforeWasActive && userHasModuleProcessAccess(ch.beforeUser, processCode).hasAccess;

      const afterIsActive = isSaasUserActive(ch.afterUser);
      const afterHasModule = afterIsActive && userHasModuleProcessAccess(ch.afterUser, processCode).hasAccess;

      if (afterHasModule) {
        projectedChangedUsed += 1;
        if (!beforeHadModule) {
          anyNewlyGained = true;
        }
      }
    }

    if (!anyNewlyGained) continue;

    let baselineUsed = 0;
    for (const u of baselineOthers) {
      if (userHasModuleProcessAccess(u, processCode).hasAccess) {
        baselineUsed += 1;
      }
    }

    const projectedTotal = baselineUsed + projectedChangedUsed;
    if (projectedTotal > licensedSeats) {
      const cat = catalogList.find(p => p.process_code === processCode);
      const currentUsed = baselineUsed + changes.reduce((sum, ch) => {
        const wasActive = ch.beforeUser ? isSaasUserActive(ch.beforeUser) : false;
        return sum + (wasActive && userHasModuleProcessAccess(ch.beforeUser, processCode).hasAccess ? 1 : 0);
      }, 0);

      violations.push({
        module_key: processCode,
        display_name: cat?.display_name || processCode,
        current_used: currentUsed,
        projected_used: projectedTotal,
        licensed_seats: licensedSeats
      });
    }
  }

  if (violations.length > 0) {
    const summary = violations
      .map(v => `${v.display_name} (${v.current_used}/${v.licensed_seats} used, trying ${v.projected_used})`)
      .join(', ');
    throw new Error(
      `Module seat limit reached for ${summary}. Existing user se permission hatayein ya Settings → Plan & Billing se add-on seats lein.`
    );
  }

  return { allowed: true };
}
