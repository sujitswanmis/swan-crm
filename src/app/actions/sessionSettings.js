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

const DEFAULT_BREAK_RULES = [
  { id: 'tea', label: 'Tea / Coffee Break', icon: '☕', defaultMins: 15, enabled: true },
  { id: 'lunch', label: 'Lunch Break', icon: '🍱', defaultMins: 30, enabled: true },
  { id: 'washroom', label: 'Washroom Break', icon: '🚻', defaultMins: 10, enabled: true },
  { id: 'water', label: 'Drinking Water / Hydration', icon: '💧', defaultMins: 5, enabled: true },
  { id: 'rest', label: 'Rest / Short Break', icon: '🛌', defaultMins: 15, enabled: true },
  { id: 'meeting', label: 'Team Discussion / Meeting', icon: '👥', defaultMins: 30, enabled: true }
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

        return {
          success: true,
          source: 'supabase',
          settings: {
            inactivityTimeoutMinutes: data.inactivity_timeout_minutes || fileConfig.inactivityTimeoutMinutes || 60,
            enableAutoLogout: data.enable_auto_logout !== false,
            showTimerInHeader: data.show_timer_in_header !== false,
            warningSeconds: data.warning_seconds || 60,
            idleThresholdSeconds: data.idle_threshold_seconds || 60,
            dailyWorkTargetHours: Number(data.daily_work_target_hours) || fileConfig.dailyWorkTargetHours || 9,
            dailyLunchBreakMinutes: Number(data.daily_lunch_break_minutes) || fileConfig.dailyLunchBreakMinutes || 30,
            totalShiftHours: 9.5,
            breakRules: breakRulesFromDb || breakRulesFromFile || DEFAULT_BREAK_RULES,
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
      settings: { ...DEFAULT_SESSION_SETTINGS, ...fileConfig, breakRules: Array.isArray(fileConfig.breakRules) ? fileConfig.breakRules : DEFAULT_BREAK_RULES }
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
      dailyWorkTargetHours: Number(newSettings.dailyWorkTargetHours) || 9,
      dailyLunchBreakMinutes: Number(newSettings.dailyLunchBreakMinutes) || 30,
      totalShiftHours: (Number(newSettings.dailyWorkTargetHours) || 9) + ((Number(newSettings.dailyLunchBreakMinutes) || 30) / 60),
      breakRules: Array.isArray(newSettings.breakRules) ? newSettings.breakRules : (current.breakRules || DEFAULT_BREAK_RULES),
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
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const nowIso = new Date().toISOString();

    // 1. Check if user's session was terminated by Admin
    const { data: recentSessions } = await adminClient.from('user_sessions')
      .select('id, is_active')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false })
      .limit(1);

    const existingSess = recentSessions && recentSessions.length > 0 ? recentSessions[0] : null;
    if (existingSess && existingSess.is_active === false) {
      return { success: false, error: 'Session terminated by admin', valid: false, forceLogout: true };
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

    // 2. Read activity store
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
      currentBreak: null,
      breaks: [],
      device: device || 'Web Browser',
      ip: 'Logged via Web App'
    };

    existing.activeSeconds += Math.max(0, Math.round(activeSecondsIncrement));
    existing.idleSeconds += Math.max(0, Math.round(idleSecondsIncrement));
    existing.lastSeen = nowIso;
    if (existing.currentBreak) {
      existing.status = 'on_break';
    } else {
      existing.status = status;
    }
    existing.empName = empName;
    existing.email = user.email;
    if (device) existing.device = device;

    activityData[today][userKey] = existing;

    // Prune records older than 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const minDateStr = sixtyDaysAgo.toISOString().split('T')[0];
    Object.keys(activityData).forEach(d => {
      if (d < minDateStr) delete activityData[d];
    });

    await fs.writeFile(ACTIVITY_FILE_PATH, JSON.stringify(activityData, null, 2), 'utf-8');

    // 3. Update Supabase table `user_daily_activity`
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
      // Ignore if table issue
    }

    // 4. Update Supabase table `user_sessions` heartbeat
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

    return { success: true, valid: true, todaySummary: existing };
  } catch (err) {
    console.error('Error recording activity heartbeat:', err);
    return { success: false, error: err.message, valid: true };
  }
}

// -------------------------------------------------------------
// 3. AGENT BREAK MANAGEMENT (START & END BREAKS)
// -------------------------------------------------------------
export async function startEmployeeBreak({ breakType = 'Tea Break', breakIcon = '☕' }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const today = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

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
    const existing = activityData[today][userKey] || {
      userId: user.id,
      email: user.email,
      empName: user.email.split('@')[0],
      activeSeconds: 0,
      idleSeconds: 0,
      firstSeen: nowIso,
      lastSeen: nowIso,
      status: 'working',
      breaks: []
    };

    const newBreak = {
      id: `brk_${Date.now()}`,
      type: breakType,
      icon: breakIcon,
      startTime: nowIso,
      startTimeFormatted: new Date(nowIso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
    };

    existing.currentBreak = newBreak;
    existing.status = 'on_break';
    existing.lastSeen = nowIso;
    activityData[today][userKey] = existing;

    await fs.writeFile(ACTIVITY_FILE_PATH, JSON.stringify(activityData, null, 2), 'utf-8');

    // Audit log
    try {
      const { logAuditAction } = await import('@/app/actions/audit');
      await logAuditAction('Start Break', `${existing.empName} started ${breakType} at ${newBreak.startTimeFormatted}`);
    } catch (e) { /* ignore */ }

    return { success: true, currentBreak: newBreak };
  } catch (err) {
    console.error('Error starting break:', err);
    return { success: false, error: err.message };
  }
}

export async function endEmployeeBreak() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const today = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

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
    const existing = activityData[today][userKey];

    if (!existing || !existing.currentBreak) {
      return { success: true, message: 'No active break found' };
    }

    const cur = existing.currentBreak;
    const durationSeconds = Math.max(1, Math.round((new Date(nowIso).getTime() - new Date(cur.startTime).getTime()) / 1000));
    
    const completedBreak = {
      ...cur,
      endTime: nowIso,
      durationSeconds,
      endTimeFormatted: new Date(nowIso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }),
      durationFormatted: formatDuration(durationSeconds)
    };

    if (!Array.isArray(existing.breaks)) existing.breaks = [];
    existing.breaks.push(completedBreak);
    existing.idleSeconds = (existing.idleSeconds || 0) + durationSeconds;
    existing.currentBreak = null;
    existing.status = 'working';
    existing.lastSeen = nowIso;

    activityData[today][userKey] = existing;
    await fs.writeFile(ACTIVITY_FILE_PATH, JSON.stringify(activityData, null, 2), 'utf-8');

    // Audit log
    try {
      const { logAuditAction } = await import('@/app/actions/audit');
      await logAuditAction('End Break', `${existing.empName} completed ${completedBreak.type} (${completedBreak.durationFormatted})`);
    } catch (e) { /* ignore */ }

    return { success: true, completedBreak, todaySummary: existing };
  } catch (err) {
    console.error('Error ending break:', err);
    return { success: false, error: err.message };
  }
}

export async function getCurrentEmployeeStatus() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const today = new Date().toISOString().split('T')[0];
    await ensureConfigFile(ACTIVITY_FILE_PATH, {});
    let activityData = {};
    try {
      const content = await fs.readFile(ACTIVITY_FILE_PATH, 'utf-8');
      activityData = JSON.parse(content || '{}');
    } catch {
      activityData = {};
    }

    const userKey = user.id || user.email;
    const existing = (activityData[today] && activityData[today][userKey]) || null;

    return {
      success: true,
      currentBreak: existing?.currentBreak || null,
      breaks: existing?.breaks || [],
      activeSeconds: existing?.activeSeconds || 0,
      idleSeconds: existing?.idleSeconds || 0,
      status: existing?.status || 'working'
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// -------------------------------------------------------------
// 4. GET DAILY ACTIVITY, 9-HOUR SHIFT & BREAK SUMMARY FOR ADMIN
// -------------------------------------------------------------
export async function getEmployeeDailyActivitySummary(targetDate = null) {
  try {
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    const adminClient = getAdminClient();
    const now = Date.now();
    const THREE_MINUTES_MS = 3 * 60 * 1000;
    const TARGET_WORK_SECONDS = 9 * 3600; // 9 Hours (540 Mins = 32,400s)

    // 1. Fetch Approved & Active Team Members who have been granted access by Admin
    let allTeamMembers = [];
    try {
      const { data: rolesData, error: rolesError } = await adminClient
        .from('user_roles')
        .select('user_id, email, emp_name, emp_department, emp_designation, emp_id, company, module_access, is_approved, role')
        .eq('is_approved', true)
        .neq('role', 'customer')
        .order('emp_name', { ascending: true });

      if (rolesData) {
        allTeamMembers = rolesData.filter(r => {
          const status = (r.module_access && r.module_access.emp_status) || 'Active';
          const hasNameOrEmail = (r.emp_name && r.emp_name.trim()) || (r.email && r.email.trim());
          return hasNameOrEmail && status === 'Active';
        });
      }
      if (rolesError) {
        console.error('Error fetching accessed user_roles:', rolesError);
      }
    } catch (teamErr) {
      console.error('Error fetching team members:', teamErr);
    }

    // 2. Read from local activity store for target date
    await ensureConfigFile(ACTIVITY_FILE_PATH, {});
    let activityData = {};
    try {
      const content = await fs.readFile(ACTIVITY_FILE_PATH, 'utf-8');
      activityData = JSON.parse(content || '{}');
    } catch {
      activityData = {};
    }

    const fileDayRecords = activityData[dateStr] || {};

    // 3. Fetch from Supabase table `user_daily_activity`
    const dateStartIso = `${dateStr}T00:00:00.000Z`;
    const dateEndIso = `${dateStr}T23:59:59.999Z`;

    let dbMap = {};
    try {
      const { data: dbRecords } = await adminClient
        .from('user_daily_activity')
        .select('*')
        .eq('activity_date', dateStr);

      if (dbRecords) {
        dbRecords.forEach(r => {
          if (r.user_id) dbMap[r.user_id] = r;
          if (r.email) dbMap[r.email.toLowerCase()] = r;
        });
      }
    } catch (dbErr) { /* ignore */ }

    // 4. Fetch audit_logs for the date to get earliest In-Time (first user log of the day)
    let firstAuditMap = {};
    let lastAuditMap = {};
    try {
      const { data: auditLogs } = await adminClient
        .from('audit_logs')
        .select('user_id, email, created_at')
        .gte('created_at', dateStartIso)
        .lte('created_at', dateEndIso)
        .order('created_at', { ascending: true });

      if (auditLogs) {
        auditLogs.forEach(l => {
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
    } catch (auditErr) { /* ignore */ }

    // 5. Fetch all sessions active on this date from `user_sessions`
    let sessionMap = {};
    try {
      const { data: dateSessions } = await adminClient
        .from('user_sessions')
        .select('*')
        .gte('last_active', dateStartIso)
        .lte('last_active', dateEndIso);

      if (dateSessions) {
        dateSessions.forEach(s => {
          const keyUserId = s.user_id;
          const keyEmail = s.email ? s.email.toLowerCase() : null;
          if (keyUserId) sessionMap[keyUserId] = s;
          if (keyEmail) sessionMap[keyEmail] = s;
        });
      }
    } catch (sessErr) { /* ignore */ }

    // 6. Build comprehensive roster combining all authorized employees + activity + sessions + audit_logs
    const processedEmails = new Set();
    const records = [];

    allTeamMembers.forEach(emp => {
      const emailLower = (emp.email || '').toLowerCase();
      const userId = emp.user_id;
      processedEmails.add(emailLower);
      if (userId) processedEmails.add(userId);

      const d = (userId && dbMap[userId]) || dbMap[emailLower] || {};
      const f = (userId && fileDayRecords[userId]) || fileDayRecords[emailLower] || fileDayRecords[emp.email] || {};
      const sess = (userId && sessionMap[userId]) || sessionMap[emailLower] || null;
      const auditFirst = (userId && firstAuditMap[userId]) || firstAuditMap[emailLower] || null;
      const auditLast = (userId && lastAuditMap[userId]) || lastAuditMap[emailLower] || null;

      let activeSeconds = Math.max(d.active_seconds || 0, f.activeSeconds || 0);
      let idleSeconds = Math.max(d.idle_seconds || 0, f.idleSeconds || 0);
      
      const currentBreak = f.currentBreak || null;
      const breaksList = Array.isArray(f.breaks) ? f.breaks : [];

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
      const hasActivityToday = activeSeconds > 0 || idleSeconds > 0 || !!sess || !!auditFirst || breaksList.length > 0;

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

      // Calculate working span since first log of the day
      if (firstSeen && lastSeen && hasActivityToday) {
        const spanSeconds = Math.max(60, Math.floor((new Date(lastSeen).getTime() - new Date(firstSeen).getTime()) / 1000));
        if (activeSeconds < spanSeconds) {
          activeSeconds = Math.min(spanSeconds, 3600 * 9);
        }
      }

      // Calculate 9-Hour Work Target Progress
      const workProgressPercent = Math.min(100, Math.round((activeSeconds / TARGET_WORK_SECONDS) * 100));
      const lunchTakenMinutes = Math.round(idleSeconds / 60);
      const isTargetMet = activeSeconds >= TARGET_WORK_SECONDS;
      const isHalfDay = activeSeconds >= (TARGET_WORK_SECONDS / 2) && activeSeconds < TARGET_WORK_SECONDS;

      // Shift Evaluation Status
      let shiftStatus = 'absent';
      if (isTargetMet) {
        shiftStatus = 'completed'; // 🟢 9 Hours Target Met
      } else if (liveStatus === 'working' || liveStatus === 'away' || liveStatus === 'on_break') {
        shiftStatus = 'in_progress'; // 🟢 In Progress
      } else if (hasActivityToday) {
        shiftStatus = isHalfDay ? 'half_day' : 'shortfall'; // 🟠 Half Day or 🔴 Shortfall
      } else {
        shiftStatus = 'absent'; // 🔴 Not logged in today
      }

      records.push({
        userId: emp.user_id,
        empId: emp.emp_id || '',
        email: emp.email || '',
        empName: emp.emp_name || (emp.email ? emp.email.split('@')[0] : 'System User'),
        department: emp.emp_department || '',
        designation: emp.emp_designation || '',
        company: emp.company || '',
        activeSeconds,
        idleSeconds,
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
        activeDurationFormatted: formatDuration(activeSeconds),
        idleDurationFormatted: formatDuration(idleSeconds),
        totalDurationFormatted: formatDuration(activeSeconds + idleSeconds),
        firstSeenFormatted: firstSeen ? new Date(firstSeen).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--',
        lastSeenFormatted: lastSeen ? new Date(lastSeen).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--'
      });
    });

    // Also include any active session not in user_roles
    Object.keys(sessionMap).forEach(k => {
      const sess = sessionMap[k];
      const emailLower = (sess.email || '').toLowerCase();
      if (!processedEmails.has(emailLower) && !processedEmails.has(sess.user_id)) {
        processedEmails.add(emailLower);
        if (sess.user_id) processedEmails.add(sess.user_id);

        const activeSeconds = 1800; // baseline 30 mins
        records.push({
          userId: sess.user_id,
          empId: '',
          email: sess.email,
          empName: sess.emp_name || (sess.email ? sess.email.split('@')[0] : 'System User'),
          department: '',
          designation: '',
          company: '',
          activeSeconds,
          idleSeconds: 0,
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
          activeDurationFormatted: formatDuration(activeSeconds),
          idleDurationFormatted: '0m 00s',
          totalDurationFormatted: formatDuration(activeSeconds),
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
      date: dateStr,
      shiftTargetRules: {
        workingHours: 9,
        lunchMinutes: 30,
        totalShiftHours: 9.5
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
