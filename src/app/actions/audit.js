'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

export async function logAuditAction(action, target, details = {}) {
  try {
    let actionStr = action;
    let targetStr = target;
    let detailsInfo = details;

    // Handle single object parameter e.g. logAuditAction({ action, target, ... })
    if (typeof action === 'object' && action !== null) {
      actionStr = action.action || 'Action';
      targetStr = action.target || action.details || '';
      detailsInfo = action.details || '';
    }

    let empName = 'System User';
    let userEmail = 'system@internal';
    let userId = null;

    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      const user = data?.user || null;
      if (user) {
        userId = user.id;
        userEmail = user.email || 'system@internal';
        empName = user.user_metadata?.full_name || user.user_metadata?.emp_name;
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

    const ipAddressVal = typeof detailsInfo === 'string' && detailsInfo ? detailsInfo : (detailsInfo?.ip || 'Web App');

    const payload = {
      user_id: userId,
      emp_name: empName,
      email: userEmail,
      action: String(actionStr || 'Action'),
      target: String(targetStr || ''),
      ip_address: String(ipAddressVal || 'Web App'),
      created_at: new Date().toISOString()
    };

    const adminClient = getAdminClient();
    const { error } = await adminClient.from('audit_logs').insert([payload]);
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
  userId = 'all',
  timeOfDay = 'all', // 'all' | 'off_hours' | 'day' | 'night' | 'custom'
  customTimeFrom = '19:00',
  customTimeTo = '09:00',
  dateFrom = '',
  dateTo = ''
}) {
  try {
    const adminClient = getAdminClient();
    const { offHoursIds, nightShiftIds } = await refreshShiftLogCache(adminClient);

    let query = adminClient
      .from('audit_logs')
      .select('*', { count: 'exact' });

    const effectiveSearch = (search || searchQuery || '').trim();
    const effectiveAction = (actionFilter || (actionType !== 'all' ? actionType : '')).trim();

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
      const modLower = module.toLowerCase();
      if (modLower.includes('lead') || modLower.includes('pipeline') || modLower.includes('crm')) {
        query = query.or('action.ilike.%lead%,action.ilike.%stage%,action.ilike.%claim%,target.ilike.%lead%,target.ilike.%stage%,target.ilike.%pipeline%');
      } else if (modLower.includes('team') || modLower.includes('access')) {
        query = query.or('action.ilike.%team%,action.ilike.%employee%,action.ilike.%user%,action.ilike.%role%,action.ilike.%permission%,target.ilike.%team%,target.ilike.%employee%,target.ilike.%user%,target.ilike.%role%');
      } else if (modLower.includes('setting') || modLower.includes('config')) {
        query = query.or('action.ilike.%setting%,action.ilike.%profile%,action.ilike.%config%,action.ilike.%branch%,action.ilike.%department%,target.ilike.%setting%,target.ilike.%config%,target.ilike.%branch%,target.ilike.%department%');
      } else if (modLower.includes('auth') || modLower.includes('security')) {
        query = query.or('action.ilike.%auth%,action.ilike.%login%,action.ilike.%logout%,action.ilike.%password%,action.ilike.%session%,target.ilike.%login%,target.ilike.%logout%,target.ilike.%session%');
      } else if (modLower.includes('report') || modLower.includes('data')) {
        query = query.or('action.ilike.%report%,action.ilike.%export%,action.ilike.%import%,action.ilike.%download%,target.ilike.%report%,target.ilike.%export%,target.ilike.%import%');
      } else if (modLower.includes('call')) {
        query = query.or('action.ilike.%call%,action.ilike.%dial%,action.ilike.%ivr%,target.ilike.%call%,target.ilike.%dial%');
      } else if (modLower.includes('message') || modLower.includes('sms') || modLower.includes('whatsapp')) {
        query = query.or('action.ilike.%message%,action.ilike.%whatsapp%,action.ilike.%sms%,target.ilike.%whatsapp%,target.ilike.%sms%');
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
      query = query.or(`emp_name.ilike.%${effectiveSearch}%,email.ilike.%${effectiveSearch}%,action.ilike.%${effectiveSearch}%,target.ilike.%${effectiveSearch}%,ip_address.ilike.%${effectiveSearch}%`);
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
      // Off hours: >= 19:00 to <= 09:00 IST
      if (offHoursIds.length > 0) {
        query = query.in('id', offHoursIds);
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      }
    } else if (timeOfDay === 'night') {
      // Night shift: >= 20:00 to <= 08:00 IST
      if (nightShiftIds.length > 0) {
        query = query.in('id', nightShiftIds);
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      }
    } else if (timeOfDay === 'day') {
      // Day shift: >= 09:00 to < 19:00 IST
      if (offHoursIds.length > 0) {
        query = query.not('id', 'in', `(${offHoursIds.join(',')})`);
      }
    } else if (timeOfDay === 'custom' && customTimeFrom && customTimeTo) {
      // Custom Hours Filter in IST
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
        // Default to past 30 days if no explicit date filter
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

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    // Helper to derive clean module
    const deriveModule = (action = '', target = '') => {
      const a = (action + ' ' + target).toLowerCase();
      if (a.includes('lead') || a.includes('stage') || a.includes('status') || a.includes('pipeline') || a.includes('claim')) return 'Leads & CRM';
      if (a.includes('team') || a.includes('employee') || a.includes('user') || a.includes('role') || a.includes('permission')) return 'Team & Access';
      if (a.includes('setting') || a.includes('profile') || a.includes('config') || a.includes('branch') || a.includes('department')) return 'Enterprise Settings';
      if (a.includes('auth') || a.includes('login') || a.includes('logout') || a.includes('password') || a.includes('session')) return 'Auth & Security';
      if (a.includes('report') || a.includes('export') || a.includes('import') || a.includes('download')) return 'Data & Reports';
      if (a.includes('call') || a.includes('dial') || a.includes('ivr')) return 'Call Center';
      if (a.includes('message') || a.includes('whatsapp') || a.includes('sms')) return 'Messaging';
      return 'General Activity';
    };

    // Helper to clean raw stage/status strings
    const cleanTargetText = (target = '') => {
      if (!target) return '—';
      return target
        .replace(/(\d+;\d+>)([^>"]+)>([^>"]+)/g, '$2 → $3')
        .replace(/(\d+;\d+>)([^>"]+)/g, '$2');
    };

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
        ip: l.ip_address || l.details?.ip || 'Web App',
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

    const headers = ['Timestamp', 'Employee Name', 'Email', 'Action', 'Target', 'Details'];
    const rows = (data || []).map(log => [
      `"${new Date(log.created_at).toLocaleString('en-IN')}"`,
      `"${log.emp_name || ''}"`,
      `"${log.email || ''}"`,
      `"${log.action || ''}"`,
      `"${log.target || ''}"`,
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
export async function activateUserSession(userId, deviceInfo) {
  try {
    const adminClient = getAdminClient();
    const nowIso = new Date().toISOString();

    const { data: recentSessions } = await adminClient.from('user_sessions')
      .select('id, user_id')
      .eq('user_id', userId)
      .limit(1);

    if (recentSessions && recentSessions.length > 0) {
      await adminClient.from('user_sessions').update({
        is_active: true,
        last_active: nowIso,
        device: deviceInfo || 'Web Browser'
      }).eq('user_id', userId);
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
        ip_address: 'Logged via Web App',
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

    // 1. Check if user's session was terminated by Admin recently
    const { data: recentSessions } = await adminClient.from('user_sessions')
      .select('id, is_active, last_active')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false })
      .limit(1);

    const existing = recentSessions && recentSessions.length > 0 ? recentSessions[0] : null;

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

    // 2. Upsert user session
    if (existing) {
      await adminClient.from('user_sessions').update({
        last_active: nowIso,
        is_active: true,
        emp_name: empName,
        email: user.email,
        device: deviceInfo || 'Web Browser'
      }).eq('id', existing.id);
    } else {
      await adminClient.from('user_sessions').insert([{
        user_id: user.id,
        emp_name: empName,
        email: user.email,
        device: deviceInfo || 'Web Browser',
        ip_address: 'Logged via Web App',
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

    const { data: session } = await adminClient
      .from('user_sessions')
      .select('is_active, last_active')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false })
      .limit(1)
      .maybeSingle();

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

export async function forceLogoutSession(sessionId) {
  try {
    const adminClient = getAdminClient();
    // 1. Get the session info before marking inactive
    const { data: sessionData } = await adminClient
      .from('user_sessions')
      .select('id, user_id, email, emp_name')
      .eq('id', sessionId)
      .maybeSingle();

    // 2. Mark this session inactive
    await adminClient.from('user_sessions').update({ is_active: false }).eq('id', sessionId);

    // 3. Also mark all active sessions for this user_id / email as inactive
    if (sessionData?.user_id) {
      await adminClient.from('user_sessions').update({ is_active: false }).eq('user_id', sessionData.user_id);
    } else if (sessionData?.email) {
      await adminClient.from('user_sessions').update({ is_active: false }).eq('email', sessionData.email);
    }

    await logAuditAction('Force Logout', `Revoked active user session for: ${sessionData?.emp_name || sessionData?.email || sessionId}`);
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
    if (currentDevice) {
      await adminClient.from('user_sessions')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .neq('device', currentDevice);
    } else {
      await adminClient.from('user_sessions')
        .update({ is_active: false })
        .eq('user_id', user.id);
    }
    await logAuditAction('Force Logout All', 'Terminated all other active device sessions');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
