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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let empName = user?.user_metadata?.full_name || user?.user_metadata?.emp_name;
    if (!empName && user?.id) {
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
      empName = user?.email ? user.email.split('@')[0] : 'System User';
    }

    const payload = {
      user_id: user?.id || null,
      emp_name: empName,
      email: user?.email || 'system@internal',
      action,
      target,
      details,
      created_at: new Date().toISOString()
    };

    const adminClient = getAdminClient();
    const { data, error } = await adminClient.from('audit_logs').insert([payload]);
    if (error) {
      console.error('Audit Log Error:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error('Failed to log audit action:', err);
    return { success: false, error: err.message };
  }
}

export async function getAuditLogs({ page = 1, pageSize = 20, searchQuery = '', actionFilter = '', dateFrom = '', dateTo = '' }) {
  try {
    const adminClient = getAdminClient();
    let query = adminClient
      .from('audit_logs')
      .select('*', { count: 'exact' });

    if (actionFilter) {
      query = query.eq('action', actionFilter);
    }
    if (searchQuery) {
      query = query.or(`emp_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,action.ilike.%${searchQuery}%,target.ilike.%${searchQuery}%`);
    }
    if (dateFrom) {
      query = query.gte('created_at', new Date(dateFrom).toISOString());
    }
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte('created_at', endOfDay.toISOString());
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      success: true,
      logs: data || [],
      totalCount: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
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
      .from('audit_logs')
      .select('emp_name, email')
      .order('emp_name', { ascending: true });

    if (error) throw error;

    const uniqueMap = new Map();
    (users || []).forEach(u => {
      if (u.email && !uniqueMap.has(u.email)) {
        uniqueMap.set(u.email, { emp_name: u.emp_name, email: u.email });
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
export async function logUserSession(deviceInfo) {
  try {
    const adminClient = getAdminClient();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated', valid: false };

    const nowIso = new Date().toISOString();
    const today = nowIso.split('T')[0];

    // 1. Check if user's session was terminated by Admin
    const { data: recentSessions } = await adminClient.from('user_sessions')
      .select('id, is_active')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false })
      .limit(1);

    const existing = recentSessions && recentSessions.length > 0 ? recentSessions[0] : null;

    if (existing && existing.is_active === false) {
      // Session was force-logged out! Do NOT reactivate.
      return { success: false, valid: false, forceLogout: true };
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
    if (!user) return { valid: false, forceLogout: true };

    const { data: session } = await adminClient
      .from('user_sessions')
      .select('is_active')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session && session.is_active === false) {
      return { valid: false, forceLogout: true };
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
