'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import fs from 'fs/promises';
import path from 'path';

const SETTINGS_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'session_security_settings.json');
const ACTIVITY_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'user_daily_activity.json');

function getOfficeTodayDateStr() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    return new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0];
  }
}

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_BREAK_RULES = [
  { id: 'tea', label: 'Tea / Coffee Break', icon: '☕', defaultMins: 5, maxPerDay: 2, enabled: true },
  { id: 'lunch', label: 'Lunch Break', icon: '🍱', defaultMins: 30, maxPerDay: 1, enabled: true },
  { id: 'washroom', label: 'Washroom Break', icon: '🚻', defaultMins: 5, maxPerDay: 4, enabled: true },
  { id: 'water', label: 'Drinking Water / Hydration', icon: '💧', defaultMins: 2, maxPerDay: 4, enabled: true },
  { id: 'rest', label: 'Rest / Short Break', icon: '🛌', defaultMins: 5, maxPerDay: 1, enabled: true },
  { id: 'meeting', label: 'Team Discussion Meeting by HOD', icon: '👥', defaultMins: 60, maxPerDay: 2, enabled: true },
  { id: 'custom_1787827530028', label: 'HOD to Emp Called', icon: '🏃', defaultMins: 10, maxPerDay: 8, enabled: true },
  { id: 'custom_1787827566723', label: 'Emp to HOD Meet', icon: '🤝', defaultMins: 10, maxPerDay: 3, enabled: true },
  { id: 'custom_1787827792172', label: 'Between Discuss', icon: '🚻', defaultMins: 5, maxPerDay: 4, enabled: true },
  { id: 'custom_1787827858042', label: 'Breakfast', icon: '🥪', defaultMins: 5, maxPerDay: 1, enabled: true },
  { id: 'custom_1787827866658', label: 'Snacks', icon: '☕', defaultMins: 5, maxPerDay: 2, enabled: true }
];

// Default Settings including 9 Hours Working + 30 Mins Lunch
const DEFAULT_SESSION_SETTINGS = {
  inactivityTimeoutMinutes: 60, // Default 60 minutes before auto-logout
  enableAutoLogout: true,
  showTimerInHeader: true,
  warningSeconds: 60,
  idleThresholdSeconds: 60, // Switch to Away after 60s of no mouse movement
  dailyWorkTargetHours: 9, // 9 Hours (540 mins) pure active work
  dailyLunchBreakMinutes: 30, // 30 Mins lunch break
  totalShiftHours: 9.5, // 9h 30m (570 mins) total office shift
  breakRules: DEFAULT_BREAK_RULES,
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

    // 1. Read persistent local file first
    await ensureConfigFile(SETTINGS_FILE_PATH, DEFAULT_SESSION_SETTINGS);
    let fileConfig = DEFAULT_SESSION_SETTINGS;
    try {
      const content = await fs.readFile(SETTINGS_FILE_PATH, 'utf-8');
      fileConfig = { ...DEFAULT_SESSION_SETTINGS, ...JSON.parse(content) };
    } catch {
      fileConfig = DEFAULT_SESSION_SETTINGS;
    }

    // 2. Try fetching from Supabase table `session_security_settings`
    try {
      const { data, error } = await adminClient
        .from('session_security_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (!error && data) {
        const breakRulesFromDb = Array.isArray(data.break_rules) && data.break_rules.length > 0 ? data.break_rules : null;
        const breakRulesFromFile = Array.isArray(fileConfig.breakRules) && fileConfig.breakRules.length > 0 ? fileConfig.breakRules : null;

        let chosenBreakRules = DEFAULT_BREAK_RULES;
        if (breakRulesFromFile && breakRulesFromDb) {
          chosenBreakRules = breakRulesFromFile.length >= breakRulesFromDb.length ? breakRulesFromFile : breakRulesFromDb;
        } else if (breakRulesFromFile) {
          chosenBreakRules = breakRulesFromFile;
        } else if (breakRulesFromDb) {
          chosenBreakRules = breakRulesFromDb;
        }

        return {
          success: true,
          source: 'supabase',
          settings: {
            inactivityTimeoutMinutes: data.inactivity_timeout_minutes || fileConfig.inactivityTimeoutMinutes || 60,
            enableAutoLogout: data.enable_auto_logout !== false,
            showTimerInHeader: data.show_timer_in_header !== false,
            warningSeconds: data.warning_seconds || fileConfig.warningSeconds || 60,
            idleThresholdSeconds: data.idle_threshold_seconds || fileConfig.idleThresholdSeconds || 60,
            dailyWorkTargetHours: Number(data.daily_work_target_hours) || fileConfig.dailyWorkTargetHours || 9,
            dailyLunchBreakMinutes: Number(data.daily_lunch_break_minutes) || fileConfig.dailyLunchBreakMinutes || 30,
            totalShiftHours: 9.5,
            breakRules: chosenBreakRules,
            updatedAt: data.updated_at || fileConfig.updatedAt || new Date().toISOString()
          }
        };
      }
    } catch (dbErr) {
      // Table may not exist yet, fallback to JSON
    }

    // 3. Fallback to server JSON file
    return {
      success: true,
      source: 'file',
      settings: {
        ...DEFAULT_SESSION_SETTINGS,
        ...fileConfig,
        breakRules: Array.isArray(fileConfig.breakRules) && fileConfig.breakRules.length > 0 ? fileConfig.breakRules : DEFAULT_BREAK_RULES
      }
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
    const incomingBreakRules = Array.isArray(newSettings.breakRules) && newSettings.breakRules.length > 0 ? newSettings.breakRules : null;
    const existingBreakRules = Array.isArray(current.breakRules) && current.breakRules.length > 0 ? current.breakRules : null;

    const updated = {
      ...current,
      ...newSettings,
      inactivityTimeoutMinutes: Math.max(1, Number(newSettings.inactivityTimeoutMinutes) || 60),
      enableAutoLogout: newSettings.enableAutoLogout !== false,
      showTimerInHeader: newSettings.showTimerInHeader !== false,
      warningSeconds: Math.max(10, Number(newSettings.warningSeconds) || 60),
      idleThresholdSeconds: Math.max(10, Number(newSettings.idleThresholdSeconds) || 60),
      dailyWorkTargetHours: Number(newSettings.dailyWorkTargetHours) || 9,
      dailyLunchBreakMinutes: Number(newSettings.dailyLunchBreakMinutes) || 30,
      totalShiftHours: (Number(newSettings.dailyWorkTargetHours) || 9) + ((Number(newSettings.dailyLunchBreakMinutes) || 30) / 60),
      breakRules: incomingBreakRules || existingBreakRules || DEFAULT_BREAK_RULES,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.email || 'admin'
    };

    // 1. Always persist to file backup first (guaranteed persistence)
    await ensureConfigFile(SETTINGS_FILE_PATH, DEFAULT_SESSION_SETTINGS);
    await fs.writeFile(SETTINGS_FILE_PATH, JSON.stringify(updated, null, 2), 'utf-8');

    // 2. Save to Supabase table `session_security_settings`
    try {
      const dbPayload = {
        id: 'default',
        inactivity_timeout_minutes: updated.inactivityTimeoutMinutes,
        enable_auto_logout: updated.enableAutoLogout,
        show_timer_in_header: updated.showTimerInHeader,
        warning_seconds: updated.warningSeconds,
        idle_threshold_seconds: updated.idleThresholdSeconds || 60,
        break_rules: updated.breakRules,
        updated_at: updated.updatedAt,
        updated_by: updated.updatedBy
      };

      const { error: upsertErr } = await adminClient.from('session_security_settings').upsert(dbPayload);
      if (upsertErr) {
        // If column break_rules doesn't exist in Supabase table, retry without it
        delete dbPayload.break_rules;
        await adminClient.from('session_security_settings').upsert(dbPayload);
      }
    } catch (dbErr) {
      // Supabase table issue - file backup is safe
    }

    // 3. Log Audit Action in Supabase audit_logs
    try {
      const { logAuditAction } = await import('@/app/actions/audit');
      await logAuditAction(
        'Update Session & Break Settings',
        `Admin configured custom break rules and session policies`
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
  status = 'working', // 'working' | 'away' | 'on_break' | 'offline'
  device = ''
}) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated', valid: false, forceLogout: true };

    const adminClient = getAdminClient();
    const today = getOfficeTodayDateStr(); // YYYY-MM-DD (IST Office Date)
    const nowIso = new Date().toISOString();

    // 1. Check if user's session was terminated by Admin recently
    const { data: recentSessions } = await adminClient.from('user_sessions')
      .select('id, is_active, last_active')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false })
      .limit(1);

    const existingSess = recentSessions && recentSessions.length > 0 ? recentSessions[0] : null;
    if (existingSess && existingSess.is_active === false) {
      const lastActiveMs = existingSess.last_active ? new Date(existingSess.last_active).getTime() : 0;
      const diffSec = Math.floor((Date.now() - lastActiveMs) / 1000);
      if (diffSec <= 90) {
        return { success: false, error: 'Session terminated by admin', valid: false, forceLogout: true };
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

    // 2. Fetch existing daily activity directly from Supabase (Source of Truth)
    const { data: existingDaily } = await adminClient
      .from('user_daily_activity')
      .select('*')
      .eq('email', user.email)
      .eq('activity_date', today)
      .maybeSingle();

    const firstSeen = existingDaily?.created_at || nowIso;
    const prevActive = existingDaily?.active_seconds || 0;
    const prevIdle = existingDaily?.idle_seconds || 0;

    const newActive = prevActive + Math.max(0, Math.round(activeSecondsIncrement));
    const newIdle = prevIdle + Math.max(0, Math.round(idleSecondsIncrement));

    // Upsert into Supabase user_daily_activity
    try {
      await adminClient.from('user_daily_activity').upsert({
        user_id: user.id,
        email: user.email,
        emp_name: empName,
        activity_date: today,
        active_seconds: newActive,
        idle_seconds: newIdle,
        status: status || 'working',
        device: device || 'Web Browser',
        last_active: nowIso,
        updated_at: nowIso
      }, { onConflict: 'email,activity_date' });
    } catch (tableErr) {
      console.error('user_daily_activity upsert error:', tableErr);
    }

    // 3. Update Supabase table `user_sessions` heartbeat
    try {
      if (existingSess) {
        await adminClient.from('user_sessions').update({
          last_active: nowIso,
          is_active: true,
          emp_name: empName,
          email: user.email
        }).eq('id', existingSess.id);
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

    // Also update local file cache as best-effort fallback
    try {
      await ensureConfigFile(ACTIVITY_FILE_PATH, {});
      let activityData = {};
      try {
        const content = await fs.readFile(ACTIVITY_FILE_PATH, 'utf-8');
        activityData = JSON.parse(content || '{}');
      } catch {
        activityData = {};
      }
      if (!activityData[today]) activityData[today] = {};
      const userKey = user.id || user.email;
      activityData[today][userKey] = {
        userId: user.id,
        email: user.email,
        empName,
        activeSeconds: newActive,
        idleSeconds: newIdle,
        firstSeen,
        lastSeen: nowIso,
        status: status || 'working',
        device: device || 'Web Browser'
      };
      await fs.writeFile(ACTIVITY_FILE_PATH, JSON.stringify(activityData, null, 2), 'utf-8');
    } catch (fileErr) { /* ignore */ }

    return { 
      success: true, 
      valid: true, 
      todaySummary: {
        activeSeconds: newActive,
        idleSeconds: newIdle,
        status: status || 'working',
        firstSeen,
        lastSeen: nowIso
      } 
    };
  } catch (err) {
    console.error('Error recording activity heartbeat:', err);
    return { success: false, error: err.message, valid: true };
  }
}

// -------------------------------------------------------------
// 3. AGENT BREAK MANAGEMENT (START & END BREAKS)
// -------------------------------------------------------------
function parseBreaksFromAuditLogs(logs = []) {
  const userBreaksMap = {};

  logs.forEach(log => {
    const email = (log.email || '').toLowerCase();
    if (!email) return;
    if (!userBreaksMap[email]) {
      userBreaksMap[email] = { breaks: [], currentBreak: null };
    }

    const details = log.details || {};
    let breakType = details.breakType;
    if (!breakType && log.target) {
      if (log.target.includes('started ')) {
        breakType = log.target.split('started ')[1].split(' at ')[0];
      } else if (log.target.includes('completed ')) {
        breakType = log.target.split('completed ')[1].split(' (')[0];
      }
    }
    if (!breakType) breakType = 'Break';

    const breakIcon = details.breakIcon || (
      breakType.toLowerCase().includes('tea') || breakType.toLowerCase().includes('coffee') ? '☕' :
      breakType.toLowerCase().includes('lunch') ? '🍱' :
      breakType.toLowerCase().includes('washroom') ? '🚻' :
      breakType.toLowerCase().includes('water') ? '💧' :
      breakType.toLowerCase().includes('rest') ? '🛌' :
      breakType.toLowerCase().includes('breakfast') ? '🥪' :
      breakType.toLowerCase().includes('snacks') ? '☕' : '☕'
    );

    const timeIso = log.created_at;
    const timeFormatted = new Date(timeIso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

    if (log.action === 'Start Break') {
      userBreaksMap[email].currentBreak = {
        id: details.breakId || log.id,
        type: breakType,
        icon: breakIcon,
        startTime: details.startTime || timeIso,
        startTimeFormatted: details.startTimeFormatted || timeFormatted
      };
    } else if (log.action === 'End Break') {
      const cur = userBreaksMap[email].currentBreak;
      // If there is NO active start break and this is an orphan End Break with short duration, SKIP it to avoid false count
      if (!cur && (!details.durationSeconds || details.durationSeconds <= 3) && (!details.startTime)) {
        return;
      }

      const startTime = cur?.startTime || details.startTime || timeIso;
      const endTime = details.endTime || timeIso;
      const durationSeconds = details.durationSeconds || Math.max(1, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000));
      const finalType = cur?.type || (breakType !== 'Break' ? breakType : 'Break');

      if (cur || durationSeconds > 3) {
        userBreaksMap[email].breaks.push({
          id: details.breakId || log.id,
          type: finalType,
          icon: details.breakIcon || cur?.icon || breakIcon,
          startTime,
          startTimeFormatted: cur?.startTimeFormatted || new Date(startTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }),
          endTime,
          endTimeFormatted: details.endTimeFormatted || new Date(endTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }),
          durationSeconds,
          durationFormatted: details.durationFormatted || formatDuration(durationSeconds)
        });
      }
      userBreaksMap[email].currentBreak = null;
    }
  });

  return userBreaksMap;
}

export async function startEmployeeBreak({ breakType = 'Tea Break', breakIcon = '☕', userEmail = '' }) {
  try {
    const adminClient = getAdminClient();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email || userEmail;
    if (!email && !user) return { success: false, error: 'Not authenticated' };

    const today = getOfficeTodayDateStr();
    const nowIso = new Date().toISOString();

    // Prevent duplicate start within 5 seconds
    try {
      const { data: recentLogs } = await adminClient
        .from('audit_logs')
        .select('*')
        .in('action', ['Start Break', 'End Break'])
        .eq('email', email)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .order('created_at', { ascending: true });
      const recentParsed = parseBreaksFromAuditLogs(recentLogs || []);
      const curBreak = recentParsed[email.toLowerCase()]?.currentBreak;
      if (curBreak && (Date.now() - new Date(curBreak.startTime).getTime()) < 5000) {
        return { success: true, currentBreak: curBreak };
      }
    } catch (checkErr) {}

    let empName = user?.user_metadata?.full_name || (email ? email.split('@')[0] : 'Employee');
    try {
      const { data: roleData } = await adminClient
        .from('user_roles')
        .select('emp_name')
        .eq('email', email)
        .maybeSingle();
      if (roleData?.emp_name) empName = roleData.emp_name;
    } catch (e) {}

    const newBreak = {
      id: `brk_${Date.now()}`,
      type: breakType,
      icon: breakIcon,
      startTime: nowIso,
      startTimeFormatted: new Date(nowIso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
    };

    // 1. Audit Log in Supabase (Primary Source of Truth)
    try {
      const { logAuditAction } = await import('@/app/actions/audit');
      await logAuditAction('Start Break', `${empName} started ${breakType} at ${newBreak.startTimeFormatted}`, {
        breakType,
        breakIcon,
        startTime: nowIso,
        startTimeFormatted: newBreak.startTimeFormatted,
        breakId: newBreak.id
      });
    } catch (e) {
      console.error('Failed to log start break:', e);
    }

    // 2. Update user_daily_activity status
    try {
      await adminClient.from('user_daily_activity').upsert({
        user_id: user?.id || null,
        email,
        emp_name: empName,
        activity_date: today,
        status: 'on_break',
        last_active: nowIso,
        updated_at: nowIso
      }, { onConflict: 'email,activity_date' });
    } catch (e) {}

    // 3. Update user_sessions status
    try {
      if (user?.id) {
        await adminClient.from('user_sessions').update({
          last_active: nowIso,
          is_active: true
        }).eq('user_id', user.id);
      }
    } catch (e) {}

    return { success: true, currentBreak: newBreak };
  } catch (err) {
    console.error('Error starting break:', err);
    return { success: false, error: err.message };
  }
}

export async function endEmployeeBreak({ userEmail = '' } = {}) {
  try {
    const adminClient = getAdminClient();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email || userEmail;
    if (!email && !user) return { success: false, error: 'Not authenticated' };

    const today = getOfficeTodayDateStr();
    const nowIso = new Date().toISOString();

    let empName = user?.user_metadata?.full_name || (email ? email.split('@')[0] : 'Employee');
    try {
      const { data: roleData } = await adminClient
        .from('user_roles')
        .select('emp_name')
        .eq('email', email)
        .maybeSingle();
      if (roleData?.emp_name) empName = roleData.emp_name;
    } catch (e) {}

    // 1. Fetch latest Start Break from audit_logs
    const { data: breakLogs } = await adminClient
      .from('audit_logs')
      .select('*')
      .in('action', ['Start Break', 'End Break'])
      .eq('email', email)
      .gte('created_at', `${today}T00:00:00.000Z`)
      .order('created_at', { ascending: true });

    const breaksMap = parseBreaksFromAuditLogs(breakLogs || []);
    const cur = breaksMap[email.toLowerCase()]?.currentBreak;

    // If no active break exists (e.g. double click or already ended), safely return
    if (!cur) {
      return { success: true, message: 'Break already ended' };
    }

    const startTime = cur?.startTime || nowIso;
    const durationSeconds = Math.max(1, Math.round((new Date(nowIso).getTime() - new Date(startTime).getTime()) / 1000));
    const breakType = cur?.type || 'Break';
    const breakIcon = cur?.icon || '☕';
    const durationFormatted = formatDuration(durationSeconds);
    const endTimeFormatted = new Date(nowIso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

    const completedBreak = {
      id: cur?.id || `brk_${Date.now()}`,
      type: breakType,
      icon: breakIcon,
      startTime,
      startTimeFormatted: cur?.startTimeFormatted || new Date(startTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }),
      endTime: nowIso,
      endTimeFormatted,
      durationSeconds,
      durationFormatted
    };

    // 2. Log End Break in Supabase audit_logs
    try {
      const { logAuditAction } = await import('@/app/actions/audit');
      await logAuditAction('End Break', `${empName} completed ${breakType} (${durationFormatted})`, {
        breakType,
        breakIcon,
        startTime,
        endTime: nowIso,
        endTimeFormatted,
        durationSeconds,
        durationFormatted,
        breakId: completedBreak.id
      });
    } catch (e) {
      console.error('Failed to log end break:', e);
    }

    // 3. Update user_daily_activity status to 'working'
    try {
      await adminClient.from('user_daily_activity').update({
        status: 'working',
        last_active: nowIso,
        updated_at: nowIso
      }).eq('email', email).eq('activity_date', today);
    } catch (e) {}

    return { success: true, completedBreak };
  } catch (err) {
    console.error('Error ending break:', err);
    return { success: false, error: err.message };
  }
}

export async function getCurrentEmployeeStatus(userEmail = '') {
  try {
    const adminClient = getAdminClient();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email || userEmail;
    if (!email && !user) return { success: false, error: 'Not authenticated' };

    const today = getOfficeTodayDateStr();
    const { data: breakLogs } = await adminClient
      .from('audit_logs')
      .select('*')
      .in('action', ['Start Break', 'End Break'])
      .eq('email', email)
      .gte('created_at', `${today}T00:00:00.000Z`)
      .order('created_at', { ascending: true });

    const parsed = parseBreaksFromAuditLogs(breakLogs || []);
    const userBreakInfo = parsed[email.toLowerCase()] || { breaks: [], currentBreak: null };

    return {
      success: true,
      currentBreak: userBreakInfo.currentBreak,
      breaks: userBreakInfo.breaks,
      status: userBreakInfo.currentBreak ? 'on_break' : 'working'
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// -------------------------------------------------------------
// 4. GET DAILY/PERIOD ACTIVITY, 9-HOUR SHIFT & BREAK SUMMARY FOR ADMIN
// -------------------------------------------------------------
export async function getEmployeeDailyActivitySummary(startDateOrTarget = null, endDate = null) {
  try {
    const todayStr = getOfficeTodayDateStr();
    const startDate = startDateOrTarget || todayStr;
    const finalEndDate = endDate || startDate;
    const isSingleDay = startDate === finalEndDate;

    const adminClient = getAdminClient();
    const now = Date.now();
    const THREE_MINUTES_MS = 3 * 60 * 1000;
    
    // Calculate count of calendar days in range
    const daysCount = isSingleDay 
      ? 1 
      : Math.max(1, Math.round((new Date(finalEndDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    
    const TARGET_WORK_SECONDS = daysCount * 9 * 3600; // Scaled by number of days (9h per day)
    const dateStartIso = `${startDate}T00:00:00.000Z`;
    const dateEndIso = `${finalEndDate}T23:59:59.999Z`;

    // ⚡ HIGH PERFORMANCE: Fetch all database tables concurrently in parallel
    const [rolesResult, activityFileResult, dbRecordsResult, auditLogsResult, sessionsResult, breakLogsResult] = await Promise.allSettled([
      // 1. Approved team members
      adminClient
        .from('user_roles')
        .select('user_id, email, emp_name, emp_department, emp_designation, emp_id, company, module_access, is_approved, role')
        .eq('is_approved', true)
        .neq('role', 'customer')
        .order('emp_name', { ascending: true }),
      
      // 2. Local activity file
      (async () => {
        try {
          await ensureConfigFile(ACTIVITY_FILE_PATH, {});
          const content = await fs.readFile(ACTIVITY_FILE_PATH, 'utf-8');
          return JSON.parse(content || '{}');
        } catch {
          return {};
        }
      })(),

      // 3. Supabase user_daily_activity
      isSingleDay
        ? adminClient
            .from('user_daily_activity')
            .select('user_id, email, active_seconds, idle_seconds, status, created_at, last_active')
            .eq('activity_date', startDate)
        : adminClient
            .from('user_daily_activity')
            .select('user_id, email, active_seconds, idle_seconds, status, created_at, last_active, activity_date')
            .gte('activity_date', startDate)
            .lte('activity_date', finalEndDate),

      // 4. Earliest & latest audit logs for the period
      adminClient
        .from('audit_logs')
        .select('user_id, email, created_at')
        .gte('created_at', dateStartIso)
        .lte('created_at', dateEndIso)
        .order('created_at', { ascending: true })
        .limit(5000),

      // 5. User sessions active during period
      adminClient
        .from('user_sessions')
        .select('id, user_id, email, is_active, created_at, last_active')
        .gte('last_active', dateStartIso)
        .lte('last_active', dateEndIso),

      // 6. Break events from audit_logs
      adminClient
        .from('audit_logs')
        .select('*')
        .in('action', ['Start Break', 'End Break'])
        .gte('created_at', dateStartIso)
        .lte('created_at', dateEndIso)
        .order('created_at', { ascending: true })
    ]);

    // Process 1: Team Members
    let allTeamMembers = [];
    if (rolesResult.status === 'fulfilled' && rolesResult.value?.data) {
      allTeamMembers = rolesResult.value.data.filter(r => {
        const status = (r.module_access && r.module_access.emp_status) || 'Active';
        const hasNameOrEmail = (r.emp_name && r.emp_name.trim()) || (r.email && r.email.trim());
        return hasNameOrEmail && status === 'Active';
      });
    }

    // Process 2: Aggregate Local activity records across date range
    const activityData = (activityFileResult.status === 'fulfilled' && activityFileResult.value) ? activityFileResult.value : {};
    const aggregatedFileRecords = {}; // keyed by userId or email
    
    Object.keys(activityData).forEach(dateKey => {
      if (dateKey >= startDate && dateKey <= finalEndDate) {
        const dayMap = activityData[dateKey] || {};
        Object.keys(dayMap).forEach(k => {
          const item = dayMap[k];
          if (!aggregatedFileRecords[k]) {
            aggregatedFileRecords[k] = {
              userId: item.userId,
              email: item.email,
              empName: item.empName,
              activeSeconds: 0,
              idleSeconds: 0,
              breaks: [],
              firstSeen: item.firstSeen,
              lastSeen: item.lastSeen,
              status: item.status,
              currentBreak: item.currentBreak,
              daysActiveCount: 0
            };
          }
          const rec = aggregatedFileRecords[k];
          rec.activeSeconds += (item.activeSeconds || 0);
          rec.idleSeconds += (item.idleSeconds || 0);
          if (Array.isArray(item.breaks)) {
            rec.breaks.push(...item.breaks);
          }
          if (item.firstSeen && (!rec.firstSeen || new Date(item.firstSeen) < new Date(rec.firstSeen))) {
            rec.firstSeen = item.firstSeen;
          }
          if (item.lastSeen && (!rec.lastSeen || new Date(item.lastSeen) > new Date(rec.lastSeen))) {
            rec.lastSeen = item.lastSeen;
            rec.status = item.status;
            rec.currentBreak = item.currentBreak;
          }
          if ((item.activeSeconds > 0 || (item.breaks && item.breaks.length > 0))) {
            rec.daysActiveCount += 1;
          }
        });
      }
    });

    // Process 3: Supabase user_daily_activity map (accumulated)
    const dbMap = {};
    if (dbRecordsResult.status === 'fulfilled' && dbRecordsResult.value?.data) {
      dbRecordsResult.value.data.forEach(r => {
        const k1 = r.user_id;
        const k2 = r.email ? r.email.toLowerCase() : null;
        [k1, k2].filter(Boolean).forEach(k => {
          if (!dbMap[k]) {
            dbMap[k] = { active_seconds: 0, idle_seconds: 0, created_at: r.created_at, last_active: r.last_active, status: r.status };
          }
          dbMap[k].active_seconds += (r.active_seconds || 0);
          dbMap[k].idle_seconds += (r.idle_seconds || 0);
          if (r.created_at && (!dbMap[k].created_at || new Date(r.created_at) < new Date(dbMap[k].created_at))) {
            dbMap[k].created_at = r.created_at;
          }
          if (r.last_active && (!dbMap[k].last_active || new Date(r.last_active) > new Date(dbMap[k].last_active))) {
            dbMap[k].last_active = r.last_active;
            dbMap[k].status = r.status;
          }
        });
      });
    }

    // Process 4: Audit Logs earliest / latest map
    const firstAuditMap = {};
    const lastAuditMap = {};
    if (auditLogsResult.status === 'fulfilled' && auditLogsResult.value?.data) {
      auditLogsResult.value.data.forEach(l => {
        const emailLower = (l.email || '').toLowerCase();
        const uid = l.user_id;
        const time = l.created_at;

        [emailLower, uid].filter(Boolean).forEach(k => {
          if (!firstAuditMap[k] || new Date(time) < new Date(firstAuditMap[k])) {
            firstAuditMap[k] = time;
          }
          if (!lastAuditMap[k] || new Date(time) > new Date(lastAuditMap[k])) {
            lastAuditMap[k] = time;
          }
        });
      });
    }

    // Process 5: Sessions map
    const sessionMap = {};
    if (sessionsResult.status === 'fulfilled' && sessionsResult.value?.data) {
      sessionsResult.value.data.forEach(s => {
        const keyUserId = s.user_id;
        const keyEmail = s.email ? s.email.toLowerCase() : null;
        if (keyUserId) sessionMap[keyUserId] = s;
        if (keyEmail) sessionMap[keyEmail] = s;
      });
    }

    // Process 6: Break Logs from Supabase audit_logs
    const breakLogsData = (breakLogsResult.status === 'fulfilled' && breakLogsResult.value?.data) ? breakLogsResult.value.data : [];
    const breaksAuditMap = parseBreaksFromAuditLogs(breakLogsData);

    // 7. Build comprehensive roster combining all authorized employees + activity + sessions + audit_logs
    const processedEmails = new Set();
    const records = [];

    allTeamMembers.forEach(emp => {
      const emailLower = (emp.email || '').toLowerCase();
      const userId = emp.user_id;
      processedEmails.add(emailLower);
      if (userId) processedEmails.add(userId);

      const d = (userId && dbMap[userId]) || dbMap[emailLower] || {};
      const f = (userId && aggregatedFileRecords[userId]) || aggregatedFileRecords[emailLower] || aggregatedFileRecords[emp.email] || {};
      const sess = (userId && sessionMap[userId]) || sessionMap[emailLower] || null;
      const auditFirst = (userId && firstAuditMap[userId]) || firstAuditMap[emailLower] || null;
      const auditLast = (userId && lastAuditMap[userId]) || lastAuditMap[emailLower] || null;

      let activeSeconds = Math.max(d.active_seconds || 0, f.activeSeconds || 0);
      let idleSeconds = Math.max(d.idle_seconds || 0, f.idleSeconds || 0);
      
      const auditBreakInfo = breaksAuditMap[emailLower] || (emp.email ? breaksAuditMap[emp.email.toLowerCase()] : null) || { breaks: [], currentBreak: null };
      const currentBreak = auditBreakInfo.currentBreak || f.currentBreak || null;
      const breaksList = (auditBreakInfo.breaks && auditBreakInfo.breaks.length > 0) ? auditBreakInfo.breaks : (Array.isArray(f.breaks) ? f.breaks : []);

      // Calculate earliest firstSeen (In-Time)
      const allFirstCandidates = [auditFirst, f.firstSeen, d.created_at, sess ? (sess.created_at || sess.last_active) : null].filter(Boolean);
      let firstSeen = null;
      if (allFirstCandidates.length > 0) {
        allFirstCandidates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        firstSeen = allFirstCandidates[0];
      }

      // Calculate most recent lastSeen
      const allLastCandidates = [auditLast, d.last_active, f.lastSeen, sess ? sess.last_active : null].filter(Boolean);
      let lastSeen = null;
      if (allLastCandidates.length > 0) {
        allLastCandidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        lastSeen = allLastCandidates[0];
      }

      const status = currentBreak ? 'on_break' : (d.status || f.status || (sess && sess.is_active ? 'working' : 'offline'));
      const hasActivityToday = activeSeconds > 0 || idleSeconds > 0 || !!sess || !!auditFirst || breaksList.length > 0 || !!currentBreak;

      let liveStatus = 'offline';
      if (currentBreak) {
        liveStatus = 'on_break';
      } else if (hasActivityToday && lastSeen) {
        const lastSeenTime = new Date(lastSeen).getTime();
        const diffMs = now - lastSeenTime;
        if (diffMs <= THREE_MINUTES_MS && (sess?.is_active !== false)) {
          liveStatus = status === 'away' ? 'away' : 'working';
        } else {
          liveStatus = 'offline';
        }
      }

      let ongoingBreakSec = 0;
      if (currentBreak && currentBreak.startTime) {
        ongoingBreakSec = Math.max(0, Math.floor((now - new Date(currentBreak.startTime).getTime()) / 1000));
      }
      const recordedBreakSec = breaksList.reduce((acc, b) => acc + (b.durationSeconds || 0), 0) + ongoingBreakSec;
      
      let activeScreenSec = 0;
      let idleAwaySec = 0;
      let spanSeconds = 0;

      if (isSingleDay) {
        spanSeconds = (firstSeen && lastSeen && hasActivityToday)
          ? Math.max(0, Math.floor((new Date(lastSeen).getTime() - new Date(firstSeen).getTime()) / 1000))
          : 0;

        if (hasActivityToday && spanSeconds > 0) {
          const rawActive = Math.max(d.active_seconds || 0, f.activeSeconds || 0);
          const rawIdle = Math.max(d.idle_seconds || 0, f.idleSeconds || 0);
          const workingSpanSec = Math.max(0, spanSeconds - recordedBreakSec);
          const trackedTotal = rawActive + rawIdle;

          if (trackedTotal >= (workingSpanSec * 0.60) && trackedTotal > 0) {
            // High tracker coverage throughout the shift
            const activeRatio = rawActive / trackedTotal;
            activeScreenSec = Math.min(workingSpanSec, Math.round(activeRatio * workingSpanSec));
            idleAwaySec = Math.max(0, workingSpanSec - activeScreenSec);
          } else {
            // Partial tracker coverage: use tracked ratio (bounded between 70% and 90%) or default 75-80% active
            const baseRatio = trackedTotal > 0 ? Math.min(0.85, Math.max(0.70, rawActive / trackedTotal)) : 0.75;
            activeScreenSec = Math.round(workingSpanSec * baseRatio);
            idleAwaySec = Math.max(0, workingSpanSec - activeScreenSec);
          }
        }
      } else {
        // Multi-day accumulation
        activeScreenSec = activeSeconds;
        idleAwaySec = idleSeconds;
        spanSeconds = activeScreenSec + idleAwaySec + recordedBreakSec;
      }

      // Calculate Target Work Progress (Target is scaled by daysCount: e.g. 1 day = 9h, 7 days = 63h)
      const workProgressPercent = Math.min(100, Math.round((activeScreenSec / TARGET_WORK_SECONDS) * 100));
      const lunchTakenMinutes = Math.round(recordedBreakSec / 60);
      const isTargetMet = activeScreenSec >= TARGET_WORK_SECONDS || spanSeconds >= TARGET_WORK_SECONDS;
      const isHalfDay = activeScreenSec >= (TARGET_WORK_SECONDS / 2) && activeScreenSec < TARGET_WORK_SECONDS;

      // Shift Evaluation Status
      let shiftStatus = 'absent';
      if (isTargetMet) {
        shiftStatus = 'completed'; // 🟢 Target Met
      } else if (liveStatus === 'working' || liveStatus === 'away' || liveStatus === 'on_break') {
        shiftStatus = 'in_progress'; // 🟢 In Progress
      } else if (hasActivityToday) {
        shiftStatus = isHalfDay ? 'half_day' : 'shortfall'; // 🟠 Half Day or 🔴 Shortfall
      } else {
        shiftStatus = 'absent'; // 🔴 Not logged in
      }

      records.push({
        userId: emp.user_id,
        empId: emp.emp_id || '',
        email: emp.email || '',
        empName: emp.emp_name || (emp.email ? emp.email.split('@')[0] : 'System User'),
        department: emp.emp_department || '',
        designation: emp.emp_designation || '',
        company: emp.company || '',
        activeSeconds: activeScreenSec,
        idleSeconds: idleAwaySec,
        breakSeconds: recordedBreakSec,
        shiftSpanSeconds: spanSeconds,
        firstSeen,
        lastSeen,
        liveStatus,
        shiftStatus,
        hasActivityToday,
        currentBreak,
        breaks: breaksList,
        breakCount: breaksList.length,
        workProgressPercent,
        lunchTakenMinutes,
        isTargetMet,
        daysCount,
        daysActiveCount: f.daysActiveCount || (hasActivityToday ? 1 : 0),
        activeDurationFormatted: formatDuration(activeScreenSec),
        idleDurationFormatted: formatDuration(idleAwaySec),
        breakDurationFormatted: formatDuration(recordedBreakSec),
        totalDurationFormatted: formatDuration(spanSeconds),
        shiftSpanFormatted: formatDuration(spanSeconds),
        firstSeenFormatted: firstSeen ? new Date(firstSeen).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--',
        lastSeenFormatted: lastSeen ? new Date(lastSeen).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--'
      });
    });

    // 7. Include any other active sessions
    Object.values(sessionMap).forEach(sess => {
      const emailLower = (sess.email || '').toLowerCase();
      const userId = sess.user_id;

      if (!processedEmails.has(emailLower) && (!userId || !processedEmails.has(userId))) {
        processedEmails.add(emailLower);
        if (userId) processedEmails.add(userId);

        const d = (userId && dbMap[userId]) || dbMap[emailLower] || {};
        const f = (userId && aggregatedFileRecords[userId]) || aggregatedFileRecords[emailLower] || {};
        const activeSeconds = Math.max(d.active_seconds || 0, f.activeSeconds || 0, 1800);

        records.push({
          userId: sess.user_id,
          empId: '',
          email: sess.email || '',
          empName: sess.email ? sess.email.split('@')[0] : 'Logged In User',
          department: 'General',
          designation: 'Staff',
          company: '',
          activeSeconds,
          idleSeconds: 0,
          breakSeconds: 0,
          shiftSpanSeconds: activeSeconds,
          firstSeen: sess.created_at || sess.last_active,
          lastSeen: sess.last_active,
          liveStatus: sess.is_active ? 'working' : 'offline',
          shiftStatus: 'in_progress',
          hasActivityToday: true,
          currentBreak: null,
          breaks: [],
          breakCount: 0,
          workProgressPercent: Math.min(100, Math.round((activeSeconds / TARGET_WORK_SECONDS) * 100)),
          lunchTakenMinutes: 0,
          isTargetMet: false,
          daysCount,
          daysActiveCount: 1,
          activeDurationFormatted: formatDuration(activeSeconds),
          idleDurationFormatted: '0m 00s',
          breakDurationFormatted: '0m 00s',
          totalDurationFormatted: formatDuration(activeSeconds),
          shiftSpanFormatted: formatDuration(activeSeconds),
          firstSeenFormatted: sess.created_at ? new Date(sess.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--',
          lastSeenFormatted: sess.last_active ? new Date(sess.last_active).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--'
        });
      }
    });

    // Sort: Live / Present users first, then by name
    records.sort((a, b) => {
      if (a.hasActivityToday && !b.hasActivityToday) return -1;
      if (!a.hasActivityToday && b.hasActivityToday) return 1;
      return (a.empName || '').localeCompare(b.empName || '');
    });

    return {
      success: true,
      date: isSingleDay ? startDate : `${startDate} to ${finalEndDate}`,
      startDate,
      endDate: finalEndDate,
      daysCount,
      shiftTargetRules: {
        workingHours: daysCount * 9,
        lunchMinutes: daysCount * 30,
        totalShiftHours: daysCount * 9.5
      },
      employees: records
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
