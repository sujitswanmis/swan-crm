'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { headers, cookies } from 'next/headers';
import {
  resolvePlatformFromRequest,
  normalizePlatformLabel,
  inferPlatformFromSessions,
  PLATFORM_LABELS,
  CLIENT_PLATFORM_COOKIE,
  CLIENT_PLATFORM_DETAILS_COOKIE
} from '@/utils/platformDetection';
import { extractSessionDeviceId } from '@/utils/deviceSessionId';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

async function resolveClientIp() {
  try {
    const h = await headers();
    // 1. Cloudflare Connecting IP (Authoritative client public IP when proxied via Cloudflare / Tunnel)
    const cfIp = h.get('cf-connecting-ip');
    if (cfIp && cfIp.trim() && cfIp !== '::1' && cfIp !== '127.0.0.1') {
      return cfIp.trim();
    }

    // 2. Client IP header from proxies or edge CDNs
    const clientIp = h.get('x-client-ip') || h.get('true-client-ip');
    if (clientIp && clientIp.trim() && clientIp !== '::1' && clientIp !== '127.0.0.1') {
      return clientIp.trim();
    }

    // 3. X-Forwarded-For (filter out internal proxies and localhost)
    const forwarded = h.get('x-forwarded-for');
    if (forwarded) {
      const parts = forwarded.split(',').map(p => p.trim()).filter(Boolean);
      for (const p of parts) {
        if (p && p !== '::1' && p !== '127.0.0.1' && !p.startsWith('10.') && !p.startsWith('192.168.')) {
          return p;
        }
      }
      if (parts[0]) return parts[0];
    }

    // 4. X-Real-IP
    const realIp = h.get('x-real-ip');
    if (realIp) {
      const trimmed = realIp.trim();
      if (trimmed && trimmed !== '::1' && trimmed !== '127.0.0.1') {
        return trimmed;
      }
    }
  } catch (e) {}
  return '127.0.0.1 (Local)';
}

let auditPlatformColsMissingUntil = 0;

function isMissingPlatformColumnError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    msg.includes('platform') && (msg.includes('column') || msg.includes('schema cache'))
  );
}

function sanitizeAuditIp(rawIp, rawTarget = '') {
  const ip = String(rawIp || '').trim();
  if (!ip || ip === 'Web App' || ip === 'Logged via Web App') return null;
  if (rawTarget && ip === String(rawTarget).trim()) return null;
  if (ip.length > 45 && !ip.includes('(Local)')) return null;
  return ip;
}

async function resolveClientPlatform(explicitPlatform = '', explicitDetails = '') {
  let userAgent = '';
  let xRequestedWith = '';
  let xPlatform = '';
  let secChUaPlatform = '';
  let cookiePlatform = '';
  let cookieDetails = '';

  try {
    const h = await headers();
    userAgent = h.get('user-agent') || '';
    xRequestedWith = h.get('x-requested-with') || '';
    xPlatform = h.get('x-spc-platform') || '';
    secChUaPlatform = h.get('sec-ch-ua-platform') || '';
  } catch (_e) {}

  try {
    const c = await cookies();
    cookiePlatform = decodeURIComponent(c.get(CLIENT_PLATFORM_COOKIE)?.value || '');
    cookieDetails = decodeURIComponent(c.get(CLIENT_PLATFORM_DETAILS_COOKIE)?.value || '');
  } catch (_e) {}

  return resolvePlatformFromRequest({
    userAgent,
    xRequestedWith,
    xPlatform,
    secChUaPlatform,
    cookiePlatform,
    cookieDetails,
    explicitPlatform,
    explicitDetails
  });
}

export async function logAuditAction(action, target, details = {}) {
  try {
    const actionObj = (typeof action === 'object' && action !== null) ? action : null;
    let actionStr = action;
    let targetStr = target;
    let detailsInfo = details;

    // Handle single object parameter e.g. logAuditAction({ action, module, target, details, ... })
    if (actionObj) {
      actionStr = actionObj.action || 'Action';
      detailsInfo = actionObj.details ?? '';
      if (actionObj.target) {
        targetStr = actionObj.target;
      } else if (typeof detailsInfo === 'string' && detailsInfo.trim()) {
        targetStr = detailsInfo.trim();
      } else if (detailsInfo && typeof detailsInfo === 'object') {
        const parts = Object.entries(detailsInfo)
          .filter(([k, v]) => !['platform', 'platformDetails', 'platform_details', 'ip'].includes(k) && v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
        targetStr = parts.join(', ');
      } else {
        targetStr = '';
      }
      if (actionObj.module && targetStr && !targetStr.toLowerCase().includes(String(actionObj.module).toLowerCase()) && !String(actionStr).toLowerCase().includes(String(actionObj.module).toLowerCase())) {
        targetStr = `[${String(actionObj.module).toUpperCase()}] ${targetStr}`;
      }
    } else if (!targetStr && detailsInfo) {
      if (typeof detailsInfo === 'string') {
        targetStr = detailsInfo;
      } else if (typeof detailsInfo === 'object') {
        const parts = Object.entries(detailsInfo)
          .filter(([k, v]) => !['platform', 'platformDetails', 'platform_details', 'ip'].includes(k) && v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
        if (parts.length > 0) targetStr = parts.join(', ');
      }
    }

    const explicitPlatform =
      actionObj?.platform ||
      (typeof detailsInfo === 'object' && detailsInfo !== null ? detailsInfo.platform : '') ||
      '';
    const explicitDetails =
      actionObj?.platformDetails ||
      actionObj?.platform_details ||
      (typeof detailsInfo === 'object' && detailsInfo !== null
        ? (detailsInfo.platformDetails || detailsInfo.platform_details || '')
        : '') ||
      '';

    const fallbackPerformedBy = actionObj?.userName || actionObj?.performedBy || '';
    let empName = fallbackPerformedBy || 'System User';
    let userEmail = actionObj?.userEmail || (fallbackPerformedBy.includes('@') ? fallbackPerformedBy : '') || 'system@internal';
    let userId = actionObj?.userId || null;

    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      const user = data?.user || null;
      if (user) {
        userId = user.id;
        userEmail = user.email || userEmail;
        empName = user.user_metadata?.full_name || user.user_metadata?.emp_name || actionObj?.userName || fallbackPerformedBy;
        if (!empName) {
          const adminClient = getAdminClient();
          const { data: roleData } = await adminClient
            .from('user_roles')
            .select('emp_name')
            .eq('user_id', user.id)
            .maybeSingle();

          if (roleData?.emp_name) {
            empName = roleData.emp_name;
          }
        }
        if (!empName) {
          empName = user.email ? user.email.split('@')[0] : 'System User';
        }
      }
    } catch (authErr) {
      // Fallback gracefully
    }

    const [clientIp, resolvedPlatform] = await Promise.all([
      resolveClientIp(),
      resolveClientPlatform(explicitPlatform, explicitDetails)
    ]);

    const objIp = (typeof detailsInfo === 'object' && detailsInfo !== null) ? sanitizeAuditIp(detailsInfo.ip) : null;
    const ipAddressVal = objIp || clientIp;

    const basePayload = {
      user_id: userId,
      emp_name: empName,
      email: String(userEmail || 'system@internal').trim().toLowerCase(),
      action: String(actionStr || 'Action'),
      target: String(targetStr || ''),
      ip_address: String(ipAddressVal || '127.0.0.1 (Local)'),
      created_at: new Date().toISOString()
    };

    const fullPayload = {
      ...basePayload,
      platform: resolvedPlatform.platform,
      platform_details: resolvedPlatform.details
    };

    const adminClient = getAdminClient();
    const skipPlatformCols = Date.now() < auditPlatformColsMissingUntil;
    let { error } = await adminClient.from('audit_logs').insert([skipPlatformCols ? basePayload : fullPayload]);
    if (!skipPlatformCols && error && isMissingPlatformColumnError(error)) {
      auditPlatformColsMissingUntil = Date.now() + 5 * 60 * 1000;
      const fallbackRes = await adminClient.from('audit_logs').insert([basePayload]);
      error = fallbackRes.error;
    }

    if (error) {
      console.warn('Audit Log Insert Warning:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.warn('Failed to log audit action:', err.message);
    return { success: false, error: err.message };
  }
}

// Known historical seed of off-hours (>=19:00 to <=09:00 IST) and night shift (>=20:00 to <=08:00 IST)
const SEED_OFF_HOURS_LOG_IDS = [
  "5879fc8d-2db9-4911-9d4f-b2bdc8fe7f33","a3e62a13-7fb4-4c0a-9b19-15f6c5230bda","203ed3ed-6f41-4d10-9a54-206d1cf32727",
  "db240bd7-d388-4333-b9b0-4d3b2195f1d2","56360a0c-719c-4c4d-b602-db4e043a3267","bdcb3ade-5b34-4206-b55b-d24ef0a28c58",
  "c1a7183f-2b01-4512-bf38-00a1a4156dd6","3159147d-5ca5-4caf-b2bd-c9508dde4704","33a89612-c077-4f3d-ae95-543ed3c44adc",
  "d0e985e1-ceb0-4297-8492-f95f3720c9f5","1834d330-1772-41d6-ad14-c9eceff6f1ee","8d93c3b1-b7e9-497c-acdc-ce4d63bbe118",
  "4324153c-2173-468f-80b1-ab0d7a7213ab","6e7128c4-d0e3-4e1c-80db-21736bdd2693","36147086-a136-47c8-88e8-eaf51fe73782",
  "6ddc9bad-50d9-4872-aebc-f9df4eba1067","004c2a16-1f32-41c7-8dc1-e6f33ae78b72","b52429c9-e2fb-45b4-8aae-1e26a888fb1b",
  "a0caa129-8590-4946-9b5c-7e7b84fefe2d","87cc02b4-0f6e-4224-a1c3-9c53767937a0","31e8dc6d-e197-47e4-9cfa-15630bf63d50",
  "cbcaebe9-ad3d-4706-9ed1-1f798a6fd723","1ed8aebd-5008-4642-93d0-81dcf151cb86","2c41c23c-e224-4f06-95c6-eadce68c8758",
  "f0c076cc-6d20-4d5d-b77e-18cd34ae0c69","9120543e-9863-4c87-b323-6b5c75e5602e","916be900-c5db-4a83-a54b-c50271fcaa28",
  "e7ffa4c8-2b70-410c-9f9b-bd347afa28a2","2273db4f-aabd-483a-a7a5-bfe14f1f1066","831211cb-1f9c-41c5-9f6e-f7ff5f3dfa25",
  "9ebedf9c-e9ed-4067-8c6d-e5de3c9d670d","86cca8ad-b1d1-4e79-8f29-662f30fba5fb","7e263682-e43c-429c-a851-20cdd3e09685",
  "4167d7c4-76a3-4fd2-b147-c87fb8f9eee2","fe5c612f-f52e-429f-b734-d4e4912c1bc1","3b7573fa-fac4-43f9-acb7-240272f27058",
  "de68d3ae-7f11-49a1-8400-c5177d969c38","40144091-3f61-43c1-bb66-0483e1943a6e","6d3d2e69-2e16-4b05-994a-d8ecc7ea0e6a",
  "cb972b5e-bfa5-468a-8800-9a6f9023be73","2356fadb-631c-46b0-a949-5741a7bccc13","d24f5d2e-4a10-46e3-be0b-f4a61061654c",
  "91888831-9603-4169-b510-f47d083be10e","6101d30e-caf9-4f51-8e82-05a9dd59dd6a","4dd274ef-214f-4e52-9a9c-63081e06035b",
  "f192a6e1-f776-4206-abb4-14339ded9b78","44f8a367-9931-420e-8fde-3675c6efedf5","2f977439-6105-48f1-944a-1f708fd8ca04",
  "2d57928d-7730-4c5e-bfbd-bcc898c0f6dc","e18b57ba-b9bb-41ad-ab19-d386d8a130f8","67ffbd53-5af7-45ab-a0a0-b3f402855dbd",
  "46e0d0a1-dfbd-462b-a46b-aaffc68571f2","4c531387-4900-49fd-b0c1-709c8d5673d6","2d5bd5bf-51f8-4c4b-975e-eb8938457159",
  "89ccb1a9-0430-44bb-93f6-e631ec2f066f","937fd580-989f-4782-adf9-a061e8e4305b","a62dcccc-e5b1-41d7-aba0-be7da87fc6c9",
  "a7aecdc7-c202-4031-8312-804bee8a4754","8655be3a-1552-4b9e-a178-bd24a25e087a","21baab4b-fe8a-42e0-9f8b-a5be3b73abe2",
  "7e906f7f-5f27-47fe-8385-964b35f0bd2e","9154282f-1766-48fb-b589-9d3e9330cd95","5f8153cd-7164-4a2b-806a-d49e09626962",
  "062debd8-7997-4f7b-abb4-7869dc929f15","bc2af511-8549-4f28-9946-21e38579364b","83db96b6-3e64-4d15-8ac0-a472b11eee68",
  "9daa1be3-6a7c-4ea7-a1b2-8549dd098def","021c6965-bda2-4d49-abe9-54fd18a7db8a","c129c855-c673-44fb-a122-5186dbd3dc35",
  "33df01c8-dc38-430d-bf87-ca070d57d4e6","cfe4bedb-2754-4eca-8515-c6365d5ed3db","572cffa7-8636-4b98-b8bf-055a41305db3",
  "3bf599c2-bfb4-43e6-9128-e76b5c892167"
];

const SEED_NIGHT_SHIFT_LOG_IDS = [
  "a3e62a13-7fb4-4c0a-9b19-15f6c5230bda","203ed3ed-6f41-4d10-9a54-206d1cf32727","db240bd7-d388-4333-b9b0-4d3b2195f1d2",
  "56360a0c-719c-4c4d-b602-db4e043a3267","bdcb3ade-5b34-4206-b55b-d24ef0a28c58","c1a7183f-2b01-4512-bf38-00a1a4156dd6",
  "3159147d-5ca5-4caf-b2bd-c9508dde4704","33a89612-c077-4f3d-ae95-543ed3c44adc","d0e985e1-ceb0-4297-8492-f95f3720c9f5",
  "1834d330-1772-41d6-ad14-c9eceff6f1ee","8d93c3b1-b7e9-497c-acdc-ce4d63bbe118","4324153c-2173-468f-80b1-ab0d7a7213ab",
  "6e7128c4-d0e3-4e1c-80db-21736bdd2693","36147086-a136-47c8-88e8-eaf51fe73782","6ddc9bad-50d9-4872-aebc-f9df4eba1067",
  "004c2a16-1f32-41c7-8dc1-e6f33ae78b72","b52429c9-e2fb-45b4-8aae-1e26a888fb1b","a0caa129-8590-4946-9b5c-7e7b84fefe2d",
  "87cc02b4-0f6e-4224-a1c3-9c53767937a0","31e8dc6d-e197-47e4-9cfa-15630bf63d50","cbcaebe9-ad3d-4706-9ed1-1f798a6fd723",
  "1ed8aebd-5008-4642-93d0-81dcf151cb86","2c41c23c-e224-4f06-95c6-eadce68c8758","f0c076cc-6d20-4d5d-b77e-18cd34ae0c69",
  "9120543e-9863-4c87-b323-6b5c75e5602e","916be900-c5db-4a83-a54b-c50271fcaa28","e7ffa4c8-2b70-410c-9f9b-bd347afa28a2",
  "2273db4f-aabd-483a-a7a5-bfe14f1f1066","831211cb-1f9c-41c5-9f6e-f7ff5f3dfa25","4167d7c4-76a3-4fd2-b147-c87fb8f9eee2",
  "de68d3ae-7f11-49a1-8400-c5177d969c38","40144091-3f61-43c1-bb66-0483e1943a6e","6d3d2e69-2e16-4b05-994a-d8ecc7ea0e6a",
  "cb972b5e-bfa5-468a-8800-9a6f9023be73","2356fadb-631c-46b0-a949-5741a7bccc13","d24f5d2e-4a10-46e3-be0b-f4a61061654c",
  "91888831-9603-4169-b510-f47d083be10e","67ffbd53-5af7-45ab-a0a0-b3f402855dbd","46e0d0a1-dfbd-462b-a46b-aaffc68571f2",
  "2d5bd5bf-51f8-4c4b-975e-eb8938457159","937fd580-989f-4782-adf9-a061e8e4305b","a62dcccc-e5b1-41d7-aba0-be7da87fc6c9",
  "a7aecdc7-c202-4031-8312-804bee8a4754","8655be3a-1552-4b9e-a178-bd24a25e087a","21baab4b-fe8a-42e0-9f8b-a5be3b73abe2",
  "7e906f7f-5f27-47fe-8385-964b35f0bd2e","9154282f-1766-48fb-b589-9d3e9330cd95","5f8153cd-7164-4a2b-806a-d49e09626962",
  "062debd8-7997-4f7b-abb4-7869dc929f15","bc2af511-8549-4f28-9946-21e38579364b","83db96b6-3e64-4d15-8ac0-a472b11eee68",
  "c129c855-c673-44fb-a122-5186dbd3dc35","33df01c8-dc38-430d-bf87-ca070d57d4e6","cfe4bedb-2754-4eca-8515-c6365d5ed3db",
  "572cffa7-8636-4b98-b8bf-055a41305db3"
];

let cachedOffHoursSet = new Set(SEED_OFF_HOURS_LOG_IDS);
let cachedNightShiftSet = new Set(SEED_NIGHT_SHIFT_LOG_IDS);
let lastShiftSyncTime = 0;

async function refreshShiftLogCache(adminClient) {
  const now = Date.now();
  if (now - lastShiftSyncTime < 30000 && lastShiftSyncTime > 0) {
    return { 
      offHoursIds: Array.from(cachedOffHoursSet), 
      nightShiftIds: Array.from(cachedNightShiftSet) 
    };
  }
  try {
    const checkSince = new Date(now - 3 * 3600000).toISOString();
    const { data: recentLogs } = await adminClient
      .from('audit_logs')
      .select('id, created_at')
      .gte('created_at', checkSince);

    if (recentLogs && recentLogs.length > 0) {
      recentLogs.forEach(l => {
        const createdAt = new Date(l.created_at);
        const istTime = new Date(createdAt.getTime() + 5.5 * 3600000);
        const h = istTime.getUTCHours();
        const m = istTime.getUTCMinutes();
        const minOfDay = h * 60 + m;

        // Off-hours: >= 19:00 (1140 min) or <= 09:00 (540 min)
        if (minOfDay >= 1140 || minOfDay <= 540) {
          cachedOffHoursSet.add(l.id);
        }
        // Night shift: >= 20:00 (1200 min) or <= 08:00 (480 min)
        if (minOfDay >= 1200 || minOfDay <= 480) {
          cachedNightShiftSet.add(l.id);
        }
      });
    }
    lastShiftSyncTime = now;
  } catch (e) {
    // Graceful fallback to existing cache
  }
  return { 
    offHoursIds: Array.from(cachedOffHoursSet), 
    nightShiftIds: Array.from(cachedNightShiftSet) 
  };
}

export async function getAuditLogs({
  page = 1,
  pageSize = 50,
  search = '',
  searchQuery = '',
  actionType = 'all',
  actionFilter = '',
  module = 'all',
  platform = 'all',
  userId = 'all',
  timeOfDay = 'all', // 'all' | 'off_hours' | 'day' | 'night' | 'custom'
  customTimeFrom = '19:00',
  customTimeTo = '09:00',
  dateFrom = '',
  dateTo = '',
  company = '',
  tenantId = null
}) {
  try {
    const adminClient = getAdminClient();
    const { offHoursIds, nightShiftIds } = await refreshShiftLogCache(adminClient);

    // Company / Tenant Isolation Filter
    const compLower = String(company || '').toLowerCase().trim();
    const effectiveTenantId = (() => {
      const rawId = String(tenantId || '').toLowerCase().trim();
      if (compLower.includes('supuja') || compLower === 'tnt00001' || rawId === 'tnt00001' || rawId === '0a37b8e8-1c28-4e19-8891-951fc3f8f8af') return '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
      if (compLower.includes('testing') || compLower === 'tnt00003' || rawId === 'tnt00003' || rawId === '922d3e72-6588-457f-a562-4f1bdbf10d98') return '922d3e72-6588-457f-a562-4f1bdbf10d98';
      if (compLower === 'tnt00002' || rawId === 'tnt00002') return '00000000-0000-0000-0000-000000000001';
      if (tenantId && tenantId !== '00000000-0000-0000-0000-000000000001') return tenantId;
      return '00000000-0000-0000-0000-000000000001';
    })();

    const SWAN_COMPANIES = ['nsmlr', 'nstlp', 'nstl', 'new swan group', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl', 'tnt00002'];
    const isSwan = effectiveTenantId === '00000000-0000-0000-0000-000000000001' && (!company || compLower === 'all' || compLower === 'all companies' || SWAN_COMPANIES.includes(compLower));

    let targetEmails = null;
    let targetUserIds = [];
    if (company || effectiveTenantId) {
      const { data: companyUsers } = await adminClient
        .from('user_roles')
        .select('user_id, email, emp_official_mail_id, company, tenant_id');

      const matchedUsers = (companyUsers || []).filter(u => {
        const uComp = String(u.company || '').toLowerCase().trim();
        const rawUTenant = String(u.tenant_id || '').toLowerCase().trim();
        const uTenant = (() => {
          if (uComp.includes('supuja') || uComp === 'tnt00001' || rawUTenant === '0a37b8e8-1c28-4e19-8891-951fc3f8f8af' || rawUTenant === 'tnt00001') return '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
          if (uComp.includes('testing') || uComp === 'tnt00003' || rawUTenant === '922d3e72-6588-457f-a562-4f1bdbf10d98' || rawUTenant === 'tnt00003') return '922d3e72-6588-457f-a562-4f1bdbf10d98';
          if (u.tenant_id && u.tenant_id !== '00000000-0000-0000-0000-000000000001') return u.tenant_id;
          return '00000000-0000-0000-0000-000000000001';
        })();

        // If specific client tenant workspace
        if (effectiveTenantId && effectiveTenantId !== '00000000-0000-0000-0000-000000000001') {
          return uTenant === effectiveTenantId;
        }

        if (!isSwan) {
          return uTenant === effectiveTenantId || uComp === compLower;
        }

        // Swan Group All / Group level: match strictly Swan plants, exclude other external tenants
        if (!company || compLower === 'all' || compLower === 'all companies' || compLower === 'new swan group' || compLower === 'tnt00002') {
          return uTenant === '00000000-0000-0000-0000-000000000001' && (SWAN_COMPANIES.includes(uComp) || !uComp);
        }

        // Specific Swan sub-company selected (e.g. NSMLR, NSTLP)
        return uTenant === '00000000-0000-0000-0000-000000000001' && uComp === compLower;
      });

      const emailSet = new Set();
      const userIdSet = new Set();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      matchedUsers.forEach(u => {
        if (u.user_id && uuidRegex.test(String(u.user_id).trim())) {
          userIdSet.add(String(u.user_id).trim());
        }
        [u.email, u.emp_official_mail_id].forEach(raw => {
          const clean = String(raw || '').trim();
          if (clean) {
            emailSet.add(clean);
            emailSet.add(clean.toLowerCase());
          }
        });
      });

      targetEmails = Array.from(emailSet);
      targetUserIds = Array.from(userIdSet);

      if (targetEmails.length === 0 && targetUserIds.length === 0) {
        return { success: true, logs: [], totalCount: 0, page, pageSize };
      }
    }

    const effectiveSearch = (search || searchQuery || '').trim();
    const effectiveAction = (actionFilter || (actionType !== 'all' ? actionType : '')).trim();
    const normalizedPlatformFilter = (platform && platform !== 'all')
      ? (normalizePlatformLabel(platform) || platform)
      : 'all';

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const buildAuditLogsQuery = (includePlatformCols) => {
      let query = adminClient
        .from('audit_logs')
        .select('*', { count: 'exact' });

      if ((targetEmails && targetEmails.length > 0) || targetUserIds.length > 0) {
        const tenantOrParts = [];
        if (targetEmails && targetEmails.length > 0) {
          const safeEmails = targetEmails.map(e => `"${e.replace(/["\\]/g, '')}"`).join(',');
          tenantOrParts.push(`email.in.(${safeEmails})`);
        }
        if (targetUserIds.length > 0) {
          tenantOrParts.push(`user_id.in.(${targetUserIds.join(',')})`);
        }
        if (tenantOrParts.length === 1) {
          if (targetEmails && targetEmails.length > 0) query = query.in('email', targetEmails);
          else query = query.in('user_id', targetUserIds);
        } else if (tenantOrParts.length > 1) {
          query = query.or(tenantOrParts.join(','));
        }
      }

      // 1. Action Filter (supports groups and exact substrings)
      if (effectiveAction) {
        const actLower = effectiveAction.toLowerCase();
        if (actLower === 'login') {
          query = query.or('action.ilike.%login%,action.ilike.%logout%,action.ilike.%session%');
        } else if (actLower === 'password') {
          query = query.or('action.ilike.%password%,action.ilike.%role%,action.ilike.%permission%');
        } else if (actLower === 'config') {
          query = query.or('action.ilike.%setting%,action.ilike.%config%,action.ilike.%department%,action.ilike.%branch%');
        } else if (actLower === 'export') {
          query = query.or('action.ilike.%export%,action.ilike.%download%');
        } else {
          query = query.ilike('action', `%${effectiveAction}%`);
        }
      }

      // 2. Module Filter (executed at database level for full pagination accuracy)
      if (module && module !== 'all') {
        const modLower = module.toLowerCase().trim();
        if (modLower === 'auth' || modLower.includes('auth') || modLower.includes('security')) {
          query = query.or('action.ilike.%auth%,action.ilike.%login%,action.ilike.%logout%,action.ilike.%session%,action.ilike.%impersonat%,action.ilike.%restore admin%,action.ilike.%break%,target.ilike.%login%,target.ilike.%logout%,target.ilike.%session%');
        } else if (modLower === 'user_access' || modLower.includes('team') || modLower.includes('access')) {
          query = query.or('action.ilike.%user%,action.ilike.%role%,action.ilike.%permission%,action.ilike.%password%,action.ilike.%team%,action.ilike.%employee%,target.ilike.%role%,target.ilike.%permission%,target.ilike.%password%');
        } else if (modLower === 'attendance' || modLower.includes('attendance') || modLower.includes('leave')) {
          query = query.or('action.ilike.%punch%,action.ilike.%attendance%,action.ilike.%regularization%,action.ilike.%leave%,action.ilike.%holiday%,action.ilike.%shift%,action.ilike.%geofence%,target.ilike.%punch%,target.ilike.%attendance%,target.ilike.%leave%,target.ilike.%holiday%');
        } else if (modLower === 'checklist') {
          query = query.or('action.ilike.%checklist%,target.ilike.%checklist%');
        } else if (modLower === 'delegation' || modLower.includes('delegat')) {
          query = query.or('action.ilike.%delegat%,target.ilike.%delegat%');
        } else if (modLower === 'task_planner' || modLower.includes('planner')) {
          query = query.or('action.ilike.%planner%,action.ilike.%carry forward task%,target.ilike.%planner%,target.ilike.%deleted tasks%');
        } else if (modLower === 'field_force' || modLower.includes('field')) {
          query = query.or('action.ilike.%field task%,action.ilike.%field visit%,action.ilike.%custom form%,action.ilike.%form studio%,target.ilike.%field task%,target.ilike.%custom form%');
        } else if (modLower === 'party_orders' || modLower.includes('party') || modLower.includes('order')) {
          query = query.or('action.ilike.%party%,action.ilike.%end customer%,action.ilike.%order%,action.ilike.%dispatch%,action.ilike.%complaint%,target.ilike.%party%,target.ilike.%order%,target.ilike.%complaint%,target.ilike.%end customer%');
        } else if (modLower === 'workflow') {
          query = query.or('action.ilike.%workflow%,target.ilike.%workflow%');
        } else if (modLower === 'recruitment' || modLower.includes('recruit')) {
          query = query.or('action.ilike.%recruit%,action.ilike.%position%,action.ilike.%candidate%,action.ilike.%vacancy%,target.ilike.%recruit%,target.ilike.%candidate%,target.ilike.%position%');
        } else if (modLower === 'call_center' || modLower.includes('call')) {
          query = query.or('action.ilike.%call%,action.ilike.%dial%,action.ilike.%ivr%,target.ilike.%call%,target.ilike.%dial%');
        } else if (modLower === 'messaging' || modLower.includes('message') || modLower.includes('sms') || modLower.includes('whatsapp') || modLower.includes('email')) {
          query = query.or('action.ilike.%whatsapp%,action.ilike.%email%,action.ilike.%smtp%,action.ilike.%sms%,action.ilike.%rcs%,action.ilike.%campaign%,action.ilike.%message%,target.ilike.%whatsapp%,target.ilike.%smtp%,target.ilike.%email%');
        } else if (modLower === 'leads' || modLower.includes('lead') || modLower.includes('crm')) {
          query = query.or('action.ilike.%lead%,action.ilike.%stage changed%,action.ilike.%add note%,action.ilike.%follow-up%,action.ilike.%claim reporting%,target.ilike.%lead%,target.ilike.%pipeline%');
        } else if (modLower === 'settings' || modLower.includes('setting') || modLower.includes('config')) {
          query = query.or('action.ilike.%setting%,action.ilike.%profile%,action.ilike.%config%,action.ilike.%branch%,action.ilike.%department%,action.ilike.%product%,action.ilike.%offline%,action.ilike.%custom field%,action.ilike.%notification%,target.ilike.%setting%,target.ilike.%config%,target.ilike.%branch%,target.ilike.%department%');
        } else if (modLower === 'reports' || modLower.includes('report') || modLower.includes('data')) {
          query = query.or('action.ilike.%report%,action.ilike.%export%,action.ilike.%import%,action.ilike.%download%,target.ilike.%report%,target.ilike.%export%,target.ilike.%import%');
        } else if (modLower === 'system') {
          query = query.or('action.ilike.%audit%,action.ilike.%system%,action.ilike.%purge%,target.ilike.%audit%');
        }
      }

      // 2b. Platform Filter (when platform column exists)
      if (includePlatformCols && normalizedPlatformFilter !== 'all') {
        if (normalizedPlatformFilter === PLATFORM_LABELS.LEGACY) {
          query = query.is('platform', null);
        } else {
          query = query.eq('platform', normalizedPlatformFilter);
        }
      }

      // 3. User Filter (safely handles UUID vs email vs text)
      if (userId && userId !== 'all') {
        const cleanUser = String(userId).trim();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanUser);
        if (isUuid) {
          query = query.eq('user_id', cleanUser);
        } else if (cleanUser.includes('@')) {
          query = query.ilike('email', cleanUser);
        } else {
          query = query.or(`emp_name.ilike.%${cleanUser}%,email.ilike.%${cleanUser}%`);
        }
      }

      // 4. Live Search Filter
      if (effectiveSearch) {
        const searchFields = [
          `emp_name.ilike.%${effectiveSearch}%`,
          `email.ilike.%${effectiveSearch}%`,
          `action.ilike.%${effectiveSearch}%`,
          `target.ilike.%${effectiveSearch}%`,
          `ip_address.ilike.%${effectiveSearch}%`
        ];
        if (includePlatformCols) {
          searchFields.push(`platform.ilike.%${effectiveSearch}%`, `platform_details.ilike.%${effectiveSearch}%`);
        }
        query = query.or(searchFields.join(','));
      }

      // 5. Date Range Filter in Indian Standard Time (IST)
      if (dateFrom) {
        query = query.gte('created_at', new Date(`${dateFrom}T00:00:00+05:30`).toISOString());
      }
      if (dateTo) {
        const endOfDay = new Date(`${dateTo}T23:59:59.999+05:30`);
        query = query.lte('created_at', endOfDay.toISOString());
      }

      // 6. Shift / Hours Filter
      if (timeOfDay === 'off_hours') {
        if (offHoursIds.length > 0) {
          query = query.in('id', offHoursIds);
        } else {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      } else if (timeOfDay === 'night') {
        if (nightShiftIds.length > 0) {
          query = query.in('id', nightShiftIds);
        } else {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      } else if (timeOfDay === 'day') {
        if (offHoursIds.length > 0) {
          query = query.not('id', 'in', `(${offHoursIds.join(',')})`);
        }
      } else if (timeOfDay === 'custom' && customTimeFrom && customTimeTo) {
        const [fromH, fromM] = customTimeFrom.split(':').map(Number);
        const [toH, toM] = customTimeTo.split(':').map(Number);
        const startMin = (isNaN(fromH) ? 0 : fromH) * 60 + (isNaN(fromM) ? 0 : fromM);
        const endMin = (isNaN(toH) ? 23 : toH) * 60 + (isNaN(toM) ? 59 : toM);

        const targetDates = [];
        if (dateFrom && dateTo) {
          let curr = new Date(`${dateFrom}T00:00:00+05:30`);
          const end = new Date(`${dateTo}T00:00:00+05:30`);
          while (curr <= end && targetDates.length < 60) {
            targetDates.push(curr.toISOString().split('T')[0]);
            curr.setDate(curr.getDate() + 1);
          }
        } else if (dateFrom) {
          targetDates.push(dateFrom);
        } else {
          const now = new Date();
          for (let i = 0; i < 30; i++) {
            const d = new Date(now.getTime() - i * 86400000);
            targetDates.push(d.toISOString().split('T')[0]);
          }
        }

        const intervals = [];
        targetDates.forEach(dStr => {
          if (startMin <= endMin) {
            const sIso = new Date(`${dStr}T${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}:00+05:30`).toISOString();
            const eIso = new Date(`${dStr}T${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}:59+05:30`).toISOString();
            intervals.push(`and(created_at.gte.${sIso},created_at.lte.${eIso})`);
          } else {
            const sEveningIso = new Date(`${dStr}T${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}:00+05:30`).toISOString();
            const eEveningIso = new Date(`${dStr}T23:59:59.999+05:30`).toISOString();
            const sMorningIso = new Date(`${dStr}T00:00:00+05:30`).toISOString();
            const eMorningIso = new Date(`${dStr}T${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}:59+05:30`).toISOString();
            intervals.push(`and(created_at.gte.${sEveningIso},created_at.lte.${eEveningIso})`);
            intervals.push(`and(created_at.gte.${sMorningIso},created_at.lte.${eMorningIso})`);
          }
        });

        if (intervals.length > 0) {
          query = query.or(intervals.join(','));
        }
      }

      return query.order('created_at', { ascending: false }).range(from, to);
    };

    const usePlatformCols = Date.now() >= auditPlatformColsMissingUntil;
    let { data, count, error } = await buildAuditLogsQuery(usePlatformCols);
    if (error && isMissingPlatformColumnError(error)) {
      auditPlatformColsMissingUntil = Date.now() + 5 * 60 * 1000;
      if (normalizedPlatformFilter !== 'all' && normalizedPlatformFilter !== PLATFORM_LABELS.LEGACY) {
        data = [];
        count = 0;
        error = null;
      } else {
        const fallbackRes = await buildAuditLogsQuery(false);
        data = fallbackRes.data;
        count = fallbackRes.count;
        error = fallbackRes.error;
      }
    }
    if (!usePlatformCols && normalizedPlatformFilter !== 'all' && normalizedPlatformFilter !== PLATFORM_LABELS.LEGACY) {
      data = [];
      count = 0;
    }
    if (error) throw error;

    // Helper to derive clean module
    const deriveModule = (action = '', target = '') => {
      const a = (action + ' ' + target).toLowerCase();
      if (a.includes('checklist')) return 'Smart Checklist';
      if (a.includes('delegat')) return 'Task Delegation';
      if (a.includes('planner') || a.includes('carry forward task')) return 'Task Planner';
      if (a.includes('field task') || a.includes('field visit') || a.includes('custom form') || a.includes('form studio')) return 'Field Force';
      if (a.includes('punch') || a.includes('attendance') || a.includes('regularization') || a.includes('leave') || a.includes('holiday') || a.includes('geofence')) return 'Attendance & Leave';
      if (a.includes('workflow')) return 'Workflow Builder';
      if (a.includes('recruit') || a.includes('candidate') || a.includes('position') || a.includes('vacancy')) return 'Recruitment & HR';
      if (a.includes('party') || a.includes('end customer') || a.includes('order') || a.includes('dispatch') || a.includes('complaint') || a.includes('ticket')) return 'Party & Orders';
      if (a.includes('whatsapp') || a.includes('email') || a.includes('smtp') || a.includes('sms') || a.includes('rcs') || a.includes('campaign') || a.includes('message template') || a.includes('admin message')) return 'Messaging & Email';
      if (a.includes('call') || a.includes('dial') || a.includes('ivr')) return 'Call Center';
      if (a.includes('login') || a.includes('logout') || a.includes('session') || a.includes('impersonat') || a.includes('restore admin') || a.includes('break')) return 'Auth & Session';
      if (a.includes('role') || a.includes('permission') || a.includes('password') || a.includes('user') || a.includes('team') || a.includes('employee')) return 'User & Access';
      if (a.includes('lead') || a.includes('stage changed') || a.includes('add note') || a.includes('follow-up') || a.includes('claim reporting') || a.includes('pipeline')) return 'Leads & CRM';
      if (a.includes('setting') || a.includes('profile') || a.includes('config') || a.includes('branch') || a.includes('department') || a.includes('product') || a.includes('offline') || a.includes('custom field') || a.includes('notification')) return 'Settings & Config';
      if (a.includes('report') || a.includes('export') || a.includes('import') || a.includes('download')) return 'Reports & Data';
      return 'System / Audit';
    };

    // Helper to clean raw stage/status strings
    const cleanTargetText = (target = '') => {
      if (!target) return '—';
      return target
        .replace(/(\d+;\d+>)([^>"]+)>([^>"]+)/g, '$2 → $3')
        .replace(/(\d+;\d+>)([^>"]+)/g, '$2');
    };

    // Enrich pre-deploy / null-platform rows from user_sessions (non-blocking best effort)
    const legacyByUserId = new Map();
    const legacyByEmail = new Map();
    const legacyRows = (data || []).filter(r => !r.platform);
    if (legacyRows.length > 0) {
      try {
        const legacyUserIds = Array.from(new Set(legacyRows.map(r => r.user_id).filter(Boolean)));
        const legacyEmails = Array.from(new Set(
          legacyRows
            .flatMap(r => [r.email, r.email ? String(r.email).toLowerCase() : ''])
            .map(e => String(e || '').trim())
            .filter(e => e && e !== 'system@internal' && e !== '—')
        ));

        const sessionQueries = [];
        if (legacyUserIds.length > 0) {
          sessionQueries.push(
            adminClient
              .from('user_sessions')
              .select('user_id, email, device, ip_address, last_active')
              .in('user_id', legacyUserIds)
              .order('last_active', { ascending: false })
          );
        }
        if (legacyEmails.length > 0) {
          sessionQueries.push(
            adminClient
              .from('user_sessions')
              .select('user_id, email, device, ip_address, last_active')
              .in('email', legacyEmails)
              .order('last_active', { ascending: false })
          );
        }

        const sessionResults = await Promise.allSettled(sessionQueries);
        sessionResults.forEach(res => {
          const rows = res.status === 'fulfilled' ? (res.value?.data || []) : [];
          rows.forEach(s => {
            if (s.user_id) {
              const list = legacyByUserId.get(s.user_id) || [];
              list.push(s);
              legacyByUserId.set(s.user_id, list);
            }
            const em = String(s.email || '').toLowerCase().trim();
            if (em) {
              const list = legacyByEmail.get(em) || [];
              list.push(s);
              legacyByEmail.set(em, list);
            }
          });
        });
      } catch (_sessErr) {
        // Non-blocking: falls back to Legacy / N/A
      }
    }

    const formattedLogs = (data || []).map(l => {
      const createdAt = new Date(l.created_at);
      // IST time (UTC + 5.5 hours)
      const istTime = new Date(createdAt.getTime() + 5.5 * 3600000);
      const istHours = istTime.getUTCHours();
      const istMinutes = istTime.getUTCMinutes();
      const minOfDay = istHours * 60 + istMinutes;

      // Off-Hours: >= 19:00 (1140) to <= 09:00 (540)
      const isOffHours = minOfDay >= 1140 || minOfDay <= 540;
      // Night Shift: >= 20:00 (1200) to <= 08:00 (480)
      const isNightShift = minOfDay >= 1200 || minOfDay <= 480;
      // Day Shift: >= 09:00 (540) to < 19:00 (1140)
      const isDayShift = minOfDay >= 540 && minOfDay < 1140;

      const timeFormatted = createdAt.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true
      });

      const derivedMod = deriveModule(l.action, l.target);
      const cleanIp = sanitizeAuditIp(l.ip_address, l.target) || sanitizeAuditIp(l.details?.ip) || '127.0.0.1 (Local)';
      const emailKey = String(l.email || '').toLowerCase().trim();
      const candidateSessions = [
        ...(l.user_id ? (legacyByUserId.get(l.user_id) || []) : []),
        ...(emailKey ? (legacyByEmail.get(emailKey) || []) : [])
      ];
      const inferredPlatform = inferPlatformFromSessions(l, candidateSessions, cleanIp);

      return {
        id: l.id,
        user: l.emp_name || (l.email ? l.email.split('@')[0] : 'System User'),
        emp_name: l.emp_name,
        email: l.email || '—',
        action: l.action || 'Activity',
        module: derivedMod,
        target: cleanTargetText(l.target),
        rawTarget: l.target,
        details: l.details || {},
        ip: cleanIp,
        ip_address: cleanIp,
        platform: inferredPlatform.platform,
        platform_details: inferredPlatform.details,
        time: timeFormatted,
        istHours,
        istMinutes,
        isOffHours,
        isNightShift,
        isDayShift,
        isNight: isOffHours,
        isLateNight: isNightShift,
        created_at: l.created_at
      };
    });

    // Calculate accurate KPI stats concurrently in IST
    const todayIst = new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0];
    const todayIsoStart = `${todayIst}T00:00:00+05:30`;

    const [totalAllRes, todayRes, deleteRes, usersRes] = await Promise.allSettled([
      adminClient.from('audit_logs').select('id', { count: 'exact', head: true }),
      adminClient.from('audit_logs').select('id', { count: 'exact', head: true }).gte('created_at', new Date(todayIsoStart).toISOString()),
      adminClient.from('audit_logs').select('id', { count: 'exact', head: true }).ilike('action', '%delete%'),
      adminClient.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('is_approved', true)
    ]);

    const totalAllCount = (totalAllRes.status === 'fulfilled' && totalAllRes.value?.count !== null) ? totalAllRes.value.count : (count || 0);
    const todayCount = (todayRes.status === 'fulfilled' && todayRes.value?.count !== null) ? todayRes.value.count : 0;
    const deleteCount = (deleteRes.status === 'fulfilled' && deleteRes.value?.count !== null) ? deleteRes.value.count : 0;
    const uniqueUsersCount = (usersRes.status === 'fulfilled' && usersRes.value?.count !== null) ? usersRes.value.count : 0;

    return {
      success: true,
      logs: formattedLogs,
      totalCount: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
      stats: {
        totalEvents: totalAllCount,
        todayEvents: todayCount,
        deleteEvents: deleteCount,
        uniqueUsers: uniqueUsersCount,
        offHoursEvents: offHoursIds.length,
        nightEvents: nightShiftIds.length
      }
    };
  } catch (err) {
    console.error('Fetch Audit Logs Error:', err);
    return { success: false, logs: [], totalCount: 0, error: err.message };
  }
}

export async function exportAuditLogsCsv() {
  try {
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) throw error;

    const headers = ['Timestamp (IST)', 'Employee Name', 'Email', 'Action', 'Target', 'IP Address', 'Platform', 'Platform Details', 'Details'];
    const rows = (data || []).map(log => [
      `"${new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}"`,
      `"${log.emp_name || ''}"`,
      `"${log.email || ''}"`,
      `"${log.action || ''}"`,
      `"${String(log.target || '').replace(/"/g, '""')}"`,
      `"${sanitizeAuditIp(log.ip_address, log.target) || '127.0.0.1 (Local)'}"`,
      `"${log.platform || PLATFORM_LABELS.LEGACY}"`,
      `"${String(log.platform_details || '').replace(/"/g, '""')}"`,
      `"${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    return { success: true, csv: csvContent };
  } catch (err) {
    console.error('Export CSV Error:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteAuditLogs(logIds = []) {
  try {
    const adminClient = getAdminClient();
    let query = adminClient.from('audit_logs').delete();
    
    if (logIds && logIds.length > 0) {
      query = query.in('id', logIds);
    } else {
      return { success: false, error: 'No logs specified for deletion.' };
    }

    const { error } = await query;
    if (error) throw error;

    await logAuditAction('Delete Audit Logs', `Deleted ${logIds.length} audit log entries.`);
    return { success: true };
  } catch (err) {
    console.error('Delete Audit Logs Error:', err);
    return { success: false, error: err.message };
  }
}

export async function purgeAuditLogsOlderThan(days = 30) {
  try {
    const adminClient = getAdminClient();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { error, count } = await adminClient
      .from('audit_logs')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffDate.toISOString());

    if (error) throw error;

    await logAuditAction('Purge Audit Logs', `Purged audit logs older than ${days} days.`);
    return { success: true, count };
  } catch (err) {
    console.error('Purge Audit Logs Error:', err);
    return { success: false, error: err.message };
  }
}

export async function getAllUniqueUsers() {
  try {
    const adminClient = getAdminClient();
    const { data: users, error } = await adminClient
      .from('user_roles')
      .select('user_id, emp_name, email, emp_id, role, is_approved, emp_department')
      .eq('is_approved', true)
      .neq('role', 'customer')
      .order('emp_name', { ascending: true });

    if (error) throw error;

    const uniqueMap = new Map();
    (users || []).forEach(u => {
      const email = (u.email || '').trim();
      const emailLower = email.toLowerCase();
      let displayName = u.emp_name ? u.emp_name.trim() : (email ? email.split('@')[0] : 'Employee');
      if (u.emp_id && !displayName.includes(u.emp_id)) {
        displayName = `${displayName} - ${u.emp_id}`;
      }

      if (emailLower && !uniqueMap.has(emailLower)) {
        uniqueMap.set(emailLower, { 
          id: emailLower,
          user_id: u.user_id,
          emp_id: u.emp_id || '',
          emp_name: displayName,
          raw_name: u.emp_name || '',
          email: u.email,
          role: u.role || 'Staff',
          department: u.emp_department || 'General'
        });
      }
    });

    return { success: true, users: Array.from(uniqueMap.values()) };
  } catch (err) {
    console.error('Get Unique Users Error:', err);
    return { success: false, users: [] };
  }
}

export async function getAuditLogFilters() {
  return await getAllUniqueUsers();
}

// -------------------------------------------------------------
// USER SESSIONS & FORCE LOGOUT ENGINE
// -------------------------------------------------------------
function getSessionDeviceBucket(deviceStr = '') {
  return /Android|iPhone|iPad|iPod|Mobile|SPC Workspace APK|; wv\)/i.test(String(deviceStr || ''))
    ? 'mobile'
    : 'desktop';
}

function findMatchingSessionRow(rows = [], deviceInfo = '') {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  if (!deviceInfo) return rows[0];

  const incomingSid = extractSessionDeviceId(deviceInfo);
  const bucket = getSessionDeviceBucket(deviceInfo);

  if (incomingSid) {
    // 1. Exact persistent device instance match ([SID:...])
    const exactMatch = rows.find((r) => extractSessionDeviceId(r?.device || '') === incomingSid);
    if (exactMatch) return exactMatch;

    // 2. Claim a pre-existing untagged session in the same device bucket (seamless upgrade without duplicates)
    const legacyBucketMatch = rows.find(
      (r) => !extractSessionDeviceId(r?.device || '') && getSessionDeviceBucket(r?.device || '') === bucket
    );
    if (legacyBucketMatch) return legacyBucketMatch;

    return null;
  }

  return rows.find((r) => getSessionDeviceBucket(r?.device || '') === bucket) || null;
}

export async function activateUserSession(userId, deviceInfo) {
  try {
    const adminClient = getAdminClient();
    const nowIso = new Date().toISOString();
    const clientIp = await resolveClientIp().catch(() => 'Logged via Web App');

    const { data: recentSessions } = await adminClient.from('user_sessions')
      .select('id, user_id, device')
      .eq('user_id', userId)
      .order('last_active', { ascending: false })
      .limit(20);

    const matched = findMatchingSessionRow(recentSessions || [], deviceInfo);
    if (matched) {
      await adminClient.from('user_sessions').update({
        is_active: true,
        last_active: nowIso,
        device: deviceInfo || matched.device || 'Web Browser',
        ip_address: clientIp || 'Logged via Web App'
      }).eq('id', matched.id);
    } else {
      const { data: roleData } = await adminClient.from('user_roles')
        .select('emp_name, email')
        .eq('user_id', userId)
        .maybeSingle();

      await adminClient.from('user_sessions').insert([{
        user_id: userId,
        emp_name: roleData?.emp_name || 'Employee',
        email: roleData?.email || '',
        device: deviceInfo || 'Web Browser',
        ip_address: clientIp || 'Logged via Web App',
        is_active: true,
        last_active: nowIso
      }]);
    }
    return { success: true };
  } catch (err) {
    console.error('activateUserSession error:', err);
    return { success: false, error: err.message };
  }
}

export async function logUserSession(deviceInfo) {
  try {
    const adminClient = getAdminClient();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated', valid: false };

    const nowIso = new Date().toISOString();
    const today = nowIso.split('T')[0];

    // 1. Check if this device instance's session was terminated by Admin recently
    const { data: recentSessions } = await adminClient.from('user_sessions')
      .select('id, is_active, last_active, device')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false })
      .limit(20);

    const existing = findMatchingSessionRow(recentSessions || [], deviceInfo);

    if (existing && existing.is_active === false) {
      const lastActiveMs = existing.last_active ? new Date(existing.last_active).getTime() : 0;
      const diffSec = Math.floor((Date.now() - lastActiveMs) / 1000);
      // Only enforce termination if admin actively revoked it within the last 90 seconds
      if (diffSec <= 90) {
        return { success: false, valid: false, forceLogout: true };
      }
    }

    // Resolve employee name
    let empName = user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'System User');
    try {
      const { data: roleData } = await adminClient
        .from('user_roles')
        .select('emp_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (roleData?.emp_name && roleData.emp_name !== 'System User') {
        empName = roleData.emp_name;
      }
    } catch (e) { /* ignore */ }

    // 2. Upsert device-scoped user session (keeps Mobile, PC 1, PC 2, etc. separate)
    const clientIp = await resolveClientIp().catch(() => 'Logged via Web App');
    if (existing) {
      await adminClient.from('user_sessions').update({
        last_active: nowIso,
        is_active: true,
        emp_name: empName,
        email: user.email,
        device: deviceInfo || existing.device || 'Web Browser',
        ip_address: clientIp || 'Logged via Web App'
      }).eq('id', existing.id);
    } else {
      await adminClient.from('user_sessions').insert([{
        user_id: user.id,
        emp_name: empName,
        email: user.email,
        device: deviceInfo || 'Web Browser',
        ip_address: clientIp || 'Logged via Web App',
        is_active: true,
        last_active: nowIso
      }]);
    }

    // 3. Automatically sync user_daily_activity so attendance records active presence
    try {
      const { data: existingDaily } = await adminClient.from('user_daily_activity')
        .select('active_seconds, idle_seconds')
        .eq('email', user.email)
        .eq('activity_date', today)
        .maybeSingle();

      const prevActive = existingDaily?.active_seconds || 0;
      const prevIdle = existingDaily?.idle_seconds || 0;

      await adminClient.from('user_daily_activity').upsert({
        user_id: user.id,
        email: user.email,
        emp_name: empName,
        activity_date: today,
        active_seconds: prevActive, // Managed accurately by dedicated activity heartbeat
        idle_seconds: prevIdle,
        status: 'working',
        device: deviceInfo || 'Web Browser',
        last_active: nowIso,
        updated_at: nowIso
      }, { onConflict: 'email,activity_date' });
    } catch (dailyErr) { /* ignore */ }

    return { success: true, valid: true };
  } catch (err) {
    console.error('Session Log Error:', err);
    return { success: false, error: err.message, valid: true };
  }
}

export async function checkSessionValidity(deviceInfo) {
  try {
    const adminClient = getAdminClient();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { valid: true }; // Do not force logout on network blips or offline sessions

    const { data: sessions } = await adminClient
      .from('user_sessions')
      .select('is_active, last_active, device')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false })
      .limit(20);

    const session = findMatchingSessionRow(sessions || [], deviceInfo);
    if (session && session.is_active === false) {
      const lastActiveMs = session.last_active ? new Date(session.last_active).getTime() : 0;
      const diffSec = Math.floor((Date.now() - lastActiveMs) / 1000);
      if (diffSec <= 90) {
        return { valid: false, forceLogout: true };
      }
    }
    return { valid: true };
  } catch (err) {
    return { valid: true };
  }
}

export async function getActiveUserSessions() {
  try {
    const sessionClient = await createClient();
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) return { success: false, error: 'Authentication required', sessions: [] };

    const adminClient = getAdminClient();
    const { data: actor, error: roleError } = await adminClient
      .from('user_roles')
      .select('role, module_access')
      .eq('user_id', user.id)
      .maybeSingle();
    if (roleError || !actor) return { success: false, error: 'Permission denied', sessions: [] };
    const isAdmin = ['admin', 'superadmin', 'masteradmin'].includes((actor.role || '').toLowerCase());
    const canView = actor.module_access?.user_management_new?.view === true || actor.module_access?.team?.view === true;
    if (!isAdmin && !canView) return { success: false, error: 'Permission denied', sessions: [] };

    const { data, error } = await adminClient
      .from('user_sessions')
      .select('id, user_id, emp_name, email, device, ip_address, last_active, is_active')
      .order('last_active', { ascending: false })
      .limit(200);
    if (error) throw error;
    return { success: true, sessions: data || [] };
  } catch (err) {
    return { success: false, error: err.message || 'Could not load sessions', sessions: [] };
  }
}

export async function forceLogoutSession(sessionId) {
  try {
    const sessionClient = await createClient();
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) return { success: false, error: 'Authentication required' };
    const adminClient = getAdminClient();
    // 1. Get the session info before marking inactive
    const { data: sessionData } = await adminClient
      .from('user_sessions')
      .select('id, user_id, email, emp_name')
      .eq('id', sessionId)
      .maybeSingle();

    if (!sessionData) return { success: false, error: 'Session not found' };
    if (sessionData.user_id !== user.id) {
      const { data: actor, error: roleError } = await adminClient
        .from('user_roles')
        .select('role, module_access')
        .eq('user_id', user.id)
        .maybeSingle();
      if (roleError || !actor) return { success: false, error: 'Permission denied' };
      const isAdmin = ['admin', 'superadmin', 'masteradmin'].includes((actor.role || '').toLowerCase());
      const canManage = actor.module_access?.user_management_new?.write === true || actor.module_access?.team?.write === true;
      if (!isAdmin && !canManage) return { success: false, error: 'Permission denied' };
    }

    // 2. Mark ONLY this targeted session inactive so Mobile & PC can be managed independently
    const { error: revokeError } = await adminClient
      .from('user_sessions')
      .update({ is_active: false, last_active: new Date().toISOString() })
      .eq('id', sessionId);
    if (revokeError) throw revokeError;

    await logAuditAction('Force Logout', `Revoked active user session for: ${sessionData?.emp_name || sessionData?.email || sessionId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function forceLogoutUserSessions(targetUserId) {
  try {
    if (!targetUserId) return { success: false, error: 'Target user ID required' };
    const sessionClient = await createClient();
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) return { success: false, error: 'Authentication required' };

    const adminClient = getAdminClient();
    if (targetUserId !== user.id) {
      const { data: actor, error: roleError } = await adminClient
        .from('user_roles')
        .select('role, module_access')
        .eq('user_id', user.id)
        .maybeSingle();
      if (roleError || !actor) return { success: false, error: 'Permission denied' };
      const isAdmin = ['admin', 'superadmin', 'masteradmin'].includes((actor.role || '').toLowerCase());
      const canManage = actor.module_access?.user_management_new?.write === true || actor.module_access?.team?.write === true;
      if (!isAdmin && !canManage) return { success: false, error: 'Permission denied' };
    }

    const { data: targetRole } = await adminClient
      .from('user_roles')
      .select('emp_name, email')
      .eq('user_id', targetUserId)
      .maybeSingle();

    const { error: revokeError } = await adminClient
      .from('user_sessions')
      .update({ is_active: false, last_active: new Date().toISOString() })
      .eq('user_id', targetUserId)
      .eq('is_active', true);
    if (revokeError) throw revokeError;

    await logAuditAction(
      'Force Logout All',
      `Revoked all active sessions for: ${targetRole?.emp_name || targetRole?.email || targetUserId}`
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function forceLogoutAllOtherSessions(currentDevice) {
  try {
    const adminClient = getAdminClient();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };
    
    // Deactivate all devices for this user EXCEPT the current one
    const nowIso = new Date().toISOString();
    if (currentDevice) {
      await adminClient.from('user_sessions')
        .update({ is_active: false, last_active: nowIso })
        .eq('user_id', user.id)
        .neq('device', currentDevice);
    } else {
      await adminClient.from('user_sessions')
        .update({ is_active: false, last_active: nowIso })
        .eq('user_id', user.id);
    }
    await logAuditAction('Force Logout All', 'Terminated all other active device sessions');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
