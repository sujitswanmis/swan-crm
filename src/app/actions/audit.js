'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

// Helper to determine module name from action/target if not explicit
function detectModule(action = '', target = '') {
  const text = `${action} ${target}`.toLowerCase();
  if (text.includes('lead') || text.includes('stage') || text.includes('party') || text.includes('order')) return 'Leads & CRM';
  if (text.includes('user') || text.includes('role') || text.includes('permission') || text.includes('employee') || text.includes('password') || text.includes('team')) return 'Team & Access';
  if (text.includes('config') || text.includes('setting') || text.includes('profile') || text.includes('field') || text.includes('department') || text.includes('notification')) return 'Enterprise Settings';
  if (text.includes('session') || text.includes('login') || text.includes('logout') || text.includes('auth')) return 'Auth & Security';
  if (text.includes('export') || text.includes('import') || text.includes('report') || text.includes('data')) return 'Data & Reports';
  if (text.includes('whatsapp') || text.includes('sms') || text.includes('email') || text.includes('message')) return 'Messaging';
  if (text.includes('call') || text.includes('campaign') || text.includes('agent') || text.includes('sip')) return 'Call Center';
  return 'General';
}

// Function to fetch the current user's name/email and log the action
export async function logAuditAction(action, target, customUserInfo = null) {
  try {
    const adminClient = getAdminClient();
    let userId = customUserInfo?.user_id || null;
    let userEmail = customUserInfo?.email || null;
    let empName = customUserInfo?.emp_name || null;

    if (!userId || !userEmail || !empName) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userId = userId || user.id;
        userEmail = userEmail || user.email;

        // Fetch emp_name via admin client to avoid RLS issues
        const { data: roleData } = await adminClient
          .from('user_roles')
          .select('emp_name')
          .eq('user_id', user.id)
          .maybeSingle();

        if (roleData?.emp_name && roleData.emp_name !== 'System User') {
          empName = roleData.emp_name;
        } else if (user.email) {
          const { data: roleByEmail } = await adminClient
            .from('user_roles')
            .select('emp_name')
            .eq('email', user.email)
            .maybeSingle();
          if (roleByEmail?.emp_name && roleByEmail.emp_name !== 'System User') {
            empName = roleByEmail.emp_name;
          }
        }

        if (!empName || empName === 'System User') {
          empName = user.user_metadata?.full_name || 
                    user.user_metadata?.name || 
                    user.user_metadata?.emp_name || 
                    (user.email ? user.email.split('@')[0] : 'System User');
        }
      }
    }

    if (!userId && !userEmail && !empName) {
      empName = 'System User';
    }

    const { error } = await adminClient.from('audit_logs').insert([{
      user_id: userId,
      emp_name: empName || 'System User',
      email: userEmail || null,
      action: action || 'Action',
      target: target || '',
      ip_address: 'Logged via Web App'
    }]);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('Audit Log Error:', err);
    return { success: false, error: err.message };
  }
}

// Advanced Server Action to Fetch Paginated & Filtered Audit Logs with KPI Metrics
export async function getAuditLogs({
  page = 1,
  pageSize = 50,
  search = '',
  dateFrom = '',
  dateTo = '',
  module = 'all',
  actionType = 'all',
  userId = 'all'
} = {}) {
  try {
    const adminClient = getAdminClient();

    // Base query for filtered records
    let query = adminClient
      .from('audit_logs')
      .select('*', { count: 'exact' });

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      query = query.gte('created_at', fromDate.toISOString());
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toDate.toISOString());
    }

    if (userId && userId !== 'all') {
      query = query.or(`user_id.eq.${userId},email.eq.${userId}`);
    }

    if (actionType && actionType !== 'all') {
      query = query.ilike('action', `%${actionType}%`);
    }

    if (search && search.trim()) {
      const s = search.trim();
      query = query.or(`action.ilike.%${s}%,target.ilike.%${s}%,emp_name.ilike.%${s}%,email.ilike.%${s}%,ip_address.ilike.%${s}%`);
    }

    query = query.order('created_at', { ascending: false });

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: rawLogs, count: totalCount, error } = await query;

    if (error) throw error;

    // Fetch user roles map for any legacy resolution
    const { data: userRoles } = await adminClient.from('user_roles').select('user_id, email, emp_name');
    const roleMapByUser = {};
    const roleMapByEmail = {};
    (userRoles || []).forEach(r => {
      if (r.user_id && r.emp_name) roleMapByUser[r.user_id] = r.emp_name;
      if (r.email && r.emp_name) roleMapByEmail[r.email.toLowerCase()] = r.emp_name;
    });

    const formattedLogs = (rawLogs || []).map(log => {
      let resolvedUser = log.emp_name;
      if (!resolvedUser || resolvedUser === 'System User') {
        resolvedUser = roleMapByUser[log.user_id] || 
                       roleMapByEmail[(log.email || '').toLowerCase()] || 
                       (log.email ? log.email.split('@')[0] : 'System User');
      }

      const mod = detectModule(log.action, log.target);

      return {
        id: log.id,
        user_id: log.user_id,
        user: resolvedUser,
        email: log.email || '',
        action: log.action || 'Unknown Action',
        target: log.target || '',
        module: mod,
        ip: log.ip_address || 'Logged via Web App',
        created_at: log.created_at,
        time: new Date(log.created_at).toLocaleString()
      };
    });

    // Client/Module post-filtering if specific module filter applied
    let filteredLogs = formattedLogs;
    if (module && module !== 'all') {
      filteredLogs = formattedLogs.filter(l => l.module.toLowerCase() === module.toLowerCase());
    }

    // KPI Metrics calculation
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { count: todayCount } = await adminClient
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfToday.toISOString());

    const { count: totalAllCount } = await adminClient
      .from('audit_logs')
      .select('*', { count: 'exact', head: true });

    const { count: deleteCount } = await adminClient
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .ilike('action', '%delete%');

    return {
      success: true,
      logs: filteredLogs,
      totalCount: totalCount || 0,
      page,
      pageSize,
      stats: {
        totalEvents: totalAllCount || totalCount || 0,
        todayEvents: todayCount || 0,
        deleteEvents: deleteCount || 0,
        uniqueUsers: Object.keys(roleMapByUser).length || 0
      }
    };
  } catch (err) {
    console.error('getAuditLogs Error:', err);
    return { success: false, error: err.message, logs: [], totalCount: 0, stats: {} };
  }
}

// Fetch dynamic filter options (distinct users, distinct actions)
export async function getAuditLogFilters() {
  try {
    const adminClient = getAdminClient();
    const { data: userRoles } = await adminClient
      .from('user_roles')
      .select('user_id, email, emp_name')
      .order('emp_name', { ascending: true });

    const uniqueUsers = (userRoles || [])
      .filter(u => u.emp_name || u.email)
      .map(u => ({
        id: u.user_id || u.email,
        name: u.emp_name || u.email,
        email: u.email
      }));

    return {
      success: true,
      users: uniqueUsers
    };
  } catch (err) {
    console.error('getAuditLogFilters Error:', err);
    return { success: false, users: [] };
  }
}

export async function logUserSession(deviceInfo) {
  try {
    const adminClient = getAdminClient();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('emp_name')
      .eq('user_id', user.id)
      .maybeSingle();

    const empName = roleData?.emp_name || user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'System User');

    // Check if a session already exists for this user/device, and update it, else insert
    const { data: existingRecords } = await adminClient.from('user_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('device', deviceInfo)
      .order('last_active', { ascending: false })
      .limit(1);

    const existing = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;

    if (existing) {
      await adminClient.from('user_sessions').update({
        last_active: new Date().toISOString(),
        is_active: true,
        emp_name: empName
      }).eq('id', existing.id);
    } else {
      await adminClient.from('user_sessions').insert([{
        user_id: user.id,
        emp_name: empName,
        email: user.email,
        device: deviceInfo,
        ip_address: 'Logged via Web App',
        is_active: true
      }]);
    }

    return { success: true };
  } catch (err) {
    console.error('Session Log Error:', err);
    return { success: false, error: err.message };
  }
}

export async function forceLogoutSession(sessionId) {
  try {
    const adminClient = getAdminClient();
    await adminClient.from('user_sessions').update({ is_active: false }).eq('id', sessionId);
    await logAuditAction('Force Logout', `Revoked active user session ID: ${sessionId}`);
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

