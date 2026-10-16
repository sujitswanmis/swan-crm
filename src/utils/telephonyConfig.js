import { createClient } from '@supabase/supabase-js';

export const SWAN_COMPANIES = [
  'nsmlr',
  'nstlp',
  'nstl',
  'new swan group',
  'swan agro',
  'nse-1',
  'nse-2',
  'nse-6',
  'nscpl',
  'nsacpl'
];

export function isSwanCompany(company = '') {
  if (!company) return true;
  const c = String(company).toLowerCase().trim();
  return SWAN_COMPANIES.some(sc => c.includes(sc));
}

export function getCompanySlug(company = '') {
  return String(company || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
}

/**
 * Get telephony config for a workspace/company
 * Supports both BYOC (Client Own Plivo) and Managed (Platform Plivo)
 */
export async function getWorkspaceTelephonyConfig(company = '', tenantId = null) {
  const isSwan = isSwanCompany(company);
  const defaultAuthId = (process.env.PLIVO_AUTH_ID || '').trim().replace(/['"]/g, '');
  const defaultAuthToken = (process.env.PLIVO_AUTH_TOKEN || '').trim().replace(/['"]/g, '');
  const defaultFromNumber = process.env.PLIVO_FROM_NUMBER || '+918035340622';

  if (isSwan) {
    return {
      mode: 'managed',
      authId: defaultAuthId,
      authToken: defaultAuthToken,
      fromNumber: defaultFromNumber,
      callingSeatLimit: 300,
      isSwan: true
    };
  }

  // Non-Swan Workspace: Look up custom config from database
  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1. First check tenant_entitlements if tenantId is provided or can be looked up
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId && company) {
      const { data: tenant } = await adminClient
        .from('tenants')
        .select('id')
        .ilike('name', company.trim())
        .maybeSingle();
      if (tenant?.id) resolvedTenantId = tenant.id;
    }

    if (resolvedTenantId) {
      const { data: ent } = await adminClient
        .from('tenant_entitlements')
        .select('config_json')
        .eq('tenant_id', resolvedTenantId)
        .eq('module_key', 'TELEPHONY_CONFIG')
        .maybeSingle();

      if (ent?.config_json) {
        const c = ent.config_json;
        const mode = c.mode || 'managed';
        const seatLimit = Number(c.calling_seat_limit) || 5;
        const fromNumber = c.from_number || defaultFromNumber;
        const authId = (c.auth_id || '').trim();
        const authToken = (c.auth_token || '').trim();

        if (mode === 'byoc' && authId && authToken) {
          return {
            mode: 'byoc',
            authId,
            authToken,
            fromNumber,
            callingSeatLimit: seatLimit,
            isSwan: false,
            tenantId: resolvedTenantId
          };
        }

        return {
          mode: 'managed',
          authId: authId || defaultAuthId,
          authToken: authToken || defaultAuthToken,
          fromNumber,
          callingSeatLimit: seatLimit,
          isSwan: false,
          tenantId: resolvedTenantId
        };
      }
    }

    // 2. Fallback to system_telephony_config_{slug} in call_agents
    const slug = getCompanySlug(company);
    const configKey = `system_telephony_config_${slug}`;

    const { data } = await adminClient
      .from('call_agents')
      .select('agent_code, mobile_number, plivo_endpoint_key, plivo_password')
      .eq('plivo_username', configKey)
      .maybeSingle();

    let parsed = {};
    if (data?.plivo_password) {
      try {
        parsed = JSON.parse(data.plivo_password);
      } catch (_) {}
    }

    const mode = data?.agent_code || parsed.mode || 'managed';
    const seatLimit = parseInt(data?.plivo_endpoint_key, 10) || parsed.calling_seat_limit || 5;
    const fromNumber = data?.mobile_number || parsed.from_number || defaultFromNumber;

    if (mode === 'byoc' && parsed.auth_id && parsed.auth_token) {
      return {
        mode: 'byoc',
        authId: parsed.auth_id.trim(),
        authToken: parsed.auth_token.trim(),
        fromNumber: fromNumber,
        callingSeatLimit: seatLimit,
        isSwan: false
      };
    }

    return {
      mode: 'managed',
      authId: defaultAuthId,
      authToken: defaultAuthToken,
      fromNumber: fromNumber,
      callingSeatLimit: seatLimit,
      isSwan: false
    };
  } catch (err) {
    console.error('Error in getWorkspaceTelephonyConfig:', err);
    return {
      mode: 'managed',
      authId: defaultAuthId,
      authToken: defaultAuthToken,
      fromNumber: defaultFromNumber,
      callingSeatLimit: 5,
      isSwan: false
    };
  }
}

/**
 * Get active calling seat usage and limits for a company
 */
export async function getWorkspaceCallingSeatQuota(company = '', tenantId = null) {
  const isSwan = isSwanCompany(company);
  if (isSwan) {
    return { used: 27, total: 300, available: 273, canAdd: true };
  }

  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const reqLower = String(company || '').toLowerCase().trim();
    const [{ data: users }, { data: agents }, config] = await Promise.all([
      adminClient.from('user_roles').select('user_id, company, tenant_id'),
      adminClient.from('call_agents').select('id, user_id, is_active, plivo_username'),
      getWorkspaceTelephonyConfig(company, tenantId)
    ]);

    const userCompanyMap = new Map();
    (users || []).forEach(u => {
      if (u.user_id) {
        userCompanyMap.set(u.user_id, {
          company: String(u.company || '').toLowerCase().trim(),
          tenantId: u.tenant_id
        });
      }
    });

    const activeWorkspaceAgents = (agents || []).filter(a => {
      if (!a.user_id) return false;
      if (a.plivo_username?.startsWith('system_')) return false;
      const uInfo = userCompanyMap.get(a.user_id);
      if (!uInfo) return false;
      if (tenantId && uInfo.tenantId === tenantId) return true;
      return uInfo.company === reqLower;
    });

    const used = activeWorkspaceAgents.length;
    const total = config.callingSeatLimit || 5;
    const available = Math.max(0, total - used);

    return {
      used,
      total,
      available,
      canAdd: used < total
    };
  } catch (err) {
    console.error('Error in getWorkspaceCallingSeatQuota:', err);
    return { used: 0, total: 5, available: 5, canAdd: true };
  }
}
