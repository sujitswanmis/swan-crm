'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import fs from 'fs/promises';
import path from 'path';

const SETTINGS_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'session_security_settings.json');
const ACTIVITY_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'user_daily_activity.json');

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

// Default Settings
const DEFAULT_SESSION_SETTINGS = {
  inactivityTimeoutMinutes: 60, // Default 60 minutes
  enableAutoLogout: true,
  showTimerInHeader: true,
  warningSeconds: 60,
  idleThresholdSeconds: 60, // Switch to Away after 60s without movement
  updatedAt: new Date().toISOString()
};

async function ensureConfigFile(filePath, defaultData) {
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error(`Error ensuring config file ${filePath}:`, err);
  }
}

// -------------------------------------------------------------
// 1. GET & SAVE SESSION SECURITY SETTINGS (SUPABASE + LOCAL SYNC)
// -------------------------------------------------------------
export async function getSessionSecuritySettings() {
  try {
    const adminClient = getAdminClient();

    // 1. Try fetching from Supabase table `session_security_settings`
    try {
      const { data, error } = await adminClient
        .from('session_security_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (!error && data) {
        return {
          success: true,
          source: 'supabase',
          settings: {
            inactivityTimeoutMinutes: data.inactivity_timeout_minutes || 60,
            enableAutoLogout: data.enable_auto_logout !== false,
            showTimerInHeader: data.show_timer_in_header !== false,
            warningSeconds: data.warning_seconds || 60,
            idleThresholdSeconds: data.idle_threshold_seconds || 60,
            updatedAt: data.updated_at || new Date().toISOString()
          }
        };
      }
    } catch (dbErr) {
      // Table may not exist yet, fallback to JSON
    }

    // 2. Fallback to server JSON file
    await ensureConfigFile(SETTINGS_FILE_PATH, DEFAULT_SESSION_SETTINGS);
    const content = await fs.readFile(SETTINGS_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    return {
      success: true,
      source: 'file',
      settings: { ...DEFAULT_SESSION_SETTINGS, ...parsed }
    };
  } catch (err) {
    console.error('Error fetching session settings:', err);
    return {
      success: true,
      source: 'default',
      settings: DEFAULT_SESSION_SETTINGS
    };
  }
}

export async function saveSessionSecuritySettings(newSettings) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const adminClient = getAdminClient();

    // Prepare updated config
    const current = (await getSessionSecuritySettings()).settings;
    const updated = {
      ...current,
      ...newSettings,
      inactivityTimeoutMinutes: Math.max(1, Number(newSettings.inactivityTimeoutMinutes) || 60),
      enableAutoLogout: newSettings.enableAutoLogout !== false,
      showTimerInHeader: newSettings.showTimerInHeader !== false,
      warningSeconds: Math.max(10, Number(newSettings.warningSeconds) || 60),
      updatedAt: new Date().toISOString(),
      updatedBy: user?.email || 'admin'
    };

    // 1. Save to Supabase table `session_security_settings` if exists
    try {
      await adminClient.from('session_security_settings').upsert({
        id: 'default',
        inactivity_timeout_minutes: updated.inactivityTimeoutMinutes,
        enable_auto_logout: updated.enableAutoLogout,
        show_timer_in_header: updated.showTimerInHeader,
        warning_seconds: updated.warningSeconds,
        idle_threshold_seconds: updated.idleThresholdSeconds || 60,
        updated_at: updated.updatedAt,
        updated_by: updated.updatedBy
      });
    } catch (dbErr) {
      // Table may not exist yet
    }

    // 2. Always persist to file backup
    await ensureConfigFile(SETTINGS_FILE_PATH, DEFAULT_SESSION_SETTINGS);
    await fs.writeFile(SETTINGS_FILE_PATH, JSON.stringify(updated, null, 2), 'utf-8');

    // 3. Log Audit Action in Supabase audit_logs
    try {
      const { logAuditAction } = await import('@/app/actions/audit');
      await logAuditAction(
        'Update Session Settings',
        `Admin set session timeout to ${updated.inactivityTimeoutMinutes} mins (Auto-logout: ${updated.enableAutoLogout ? 'ON' : 'OFF'})`
      );
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    return { success: true, settings: updated };
  } catch (err) {
    console.error('Error saving session settings:', err);
    return { success: false, error: err.message };
  }
}

// -------------------------------------------------------------
// 2. USER ACTIVITY HEARTBEAT & WORKING/IDLE TIME ACCUMULATION
// -------------------------------------------------------------
export async function recordUserActivityHeartbeat({
  activeSecondsIncrement = 0,
  idleSecondsIncrement = 0,
  status = 'working', // 'working' | 'away' | 'offline'
  device = ''
}) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const adminClient = getAdminClient();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const nowIso = new Date().toISOString();

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

    // 1. Read activity store
    await ensureConfigFile(ACTIVITY_FILE_PATH, {});
    let activityData = {};
    try {
      const content = await fs.readFile(ACTIVITY_FILE_PATH, 'utf-8');
      activityData = JSON.parse(content || '{}');
    } catch {
      activityData = {};
    }

    if (!activityData[today]) {
      activityData[today] = {};
    }

    const userKey = user.id || user.email;
    const existing = activityData[today][userKey] || {
      userId: user.id,
      email: user.email,
      empName,
      activeSeconds: 0,
      idleSeconds: 0,
      firstSeen: nowIso,
      lastSeen: nowIso,
      status: 'working',
      device: device || 'Web Browser',
      ip: 'Logged via Web App'
    };

    existing.activeSeconds += Math.max(0, Math.round(activeSecondsIncrement));
    existing.idleSeconds += Math.max(0, Math.round(idleSecondsIncrement));
    existing.lastSeen = nowIso;
    existing.status = status;
    existing.empName = empName;
    existing.email = user.email;
    if (device) existing.device = device;

    activityData[today][userKey] = existing;

    // Prune records older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const minDateStr = thirtyDaysAgo.toISOString().split('T')[0];
    Object.keys(activityData).forEach(d => {
      if (d < minDateStr) delete activityData[d];
    });

    await fs.writeFile(ACTIVITY_FILE_PATH, JSON.stringify(activityData, null, 2), 'utf-8');

    // 2. Try updating Supabase table `user_daily_activity` if exists
    try {
      await adminClient.from('user_daily_activity').upsert({
        user_id: user.id,
        email: user.email,
        emp_name: empName,
        activity_date: today,
        active_seconds: existing.activeSeconds,
        idle_seconds: existing.idleSeconds,
        status: existing.status,
        device: existing.device,
        last_active: nowIso,
        updated_at: nowIso
      }, { onConflict: 'email,activity_date' });
    } catch (tableErr) {
      // Ignore if user_daily_activity table not yet created in Supabase
    }

    // 3. Update Supabase table `user_sessions` heartbeat
    try {
      const { data: existingSessions } = await adminClient.from('user_sessions')
        .select('id')
        .eq('user_id', user.id)
        .order('last_active', { ascending: false })
        .limit(1);

      if (existingSessions && existingSessions.length > 0) {
        await adminClient.from('user_sessions').update({
          last_active: nowIso,
          is_active: true,
          emp_name: empName,
          email: user.email
        }).eq('id', existingSessions[0].id);
      } else {
        await adminClient.from('user_sessions').insert([{
          user_id: user.id,
          emp_name: empName,
          email: user.email,
          device: device || 'Web Browser',
          ip_address: 'Logged via Web App',
          is_active: true,
          last_active: nowIso
        }]);
      }
    } catch (sessErr) {
      console.error('Session update error in Supabase:', sessErr);
    }

    return { success: true, todaySummary: existing };
  } catch (err) {
    console.error('Error recording activity heartbeat:', err);
    return { success: false, error: err.message };
  }
}

// -------------------------------------------------------------
// 3. GET DAILY ACTIVITY SUMMARY FOR ADMIN PANEL
// -------------------------------------------------------------
export async function getEmployeeDailyActivitySummary(targetDate = null) {
  try {
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    const adminClient = getAdminClient();
    const now = Date.now();
    const THREE_MINUTES_MS = 3 * 60 * 1000;

    // 1. Try reading from Supabase table `user_daily_activity`
    try {
      const { data: dbRecords, error } = await adminClient
        .from('user_daily_activity')
        .select('*')
        .eq('activity_date', dateStr);

      if (!error && dbRecords && dbRecords.length > 0) {
        const formatted = dbRecords.map(emp => {
          const lastSeenTime = new Date(emp.last_active || emp.updated_at).getTime();
          const diffMs = now - lastSeenTime;

          let liveStatus = emp.status || 'working';
          if (diffMs > THREE_MINUTES_MS) {
            liveStatus = 'offline';
          }

          return {
            userId: emp.user_id,
            email: emp.email,
            empName: emp.emp_name,
            activeSeconds: emp.active_seconds || 0,
            idleSeconds: emp.idle_seconds || 0,
            lastSeen: emp.last_active || emp.updated_at,
            liveStatus,
            activeDurationFormatted: formatDuration(emp.active_seconds || 0),
            idleDurationFormatted: formatDuration(emp.idle_seconds || 0),
            totalDurationFormatted: formatDuration((emp.active_seconds || 0) + (emp.idle_seconds || 0)),
          };
        });

        return {
          success: true,
          source: 'supabase',
          date: dateStr,
          employees: formatted
        };
      }
    } catch (dbErr) {
      // Fallback to JSON file
    }

    // 2. Read from local activity store
    await ensureConfigFile(ACTIVITY_FILE_PATH, {});
    let activityData = {};
    try {
      const content = await fs.readFile(ACTIVITY_FILE_PATH, 'utf-8');
      activityData = JSON.parse(content || '{}');
    } catch {
      activityData = {};
    }

    const dayRecords = activityData[dateStr] || {};

    const formatted = Object.values(dayRecords).map(emp => {
      const lastSeenTime = new Date(emp.lastSeen).getTime();
      const diffMs = now - lastSeenTime;

      let liveStatus = emp.status;
      if (diffMs > THREE_MINUTES_MS) {
        liveStatus = 'offline';
      }

      return {
        ...emp,
        liveStatus,
        activeDurationFormatted: formatDuration(emp.activeSeconds),
        idleDurationFormatted: formatDuration(emp.idleSeconds),
        totalDurationFormatted: formatDuration(emp.activeSeconds + emp.idleSeconds),
      };
    });

    return {
      success: true,
      source: 'file',
      date: dateStr,
      employees: formatted
    };
  } catch (err) {
    console.error('Error getting daily activity summary:', err);
    return { success: false, employees: [], error: err.message };
  }
}

function formatDuration(totalSeconds = 0) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
