'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Monitor, LogOut, Search, Calendar, History, ShieldOff, RefreshCw, Smartphone, Laptop, Clock, ShieldCheck, CheckCircle2, AlertCircle, Sliders, Activity } from 'lucide-react';
import { forceLogoutSession, forceLogoutAllOtherSessions } from '@/app/actions/audit';
import { getSessionSecuritySettings, saveSessionSecuritySettings, getEmployeeDailyActivitySummary } from '@/app/actions/sessionSettings';
import { createClient } from '@/utils/supabase/client';

function parseDeviceInfo(userAgent) {
  if (!userAgent || userAgent === 'Unknown Device') return { icon: '🖥️', label: 'Web Browser', raw: userAgent || '' };
  
  let os = 'Windows';
  if (/windows/i.test(userAgent)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(userAgent)) os = 'macOS';
  else if (/android/i.test(userAgent)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(userAgent)) os = 'iOS';
  else if (/linux/i.test(userAgent)) os = 'Linux';

  let browser = 'Chrome';
  if (/edg/i.test(userAgent)) browser = 'Edge';
  else if (/chrome|crios/i.test(userAgent)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(userAgent)) browser = 'Firefox';
  else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';
  else if (/opera|opr/i.test(userAgent)) browser = 'Opera';

  const isMobile = /android|iphone|ipad|ipod|mobile/i.test(userAgent);
  const icon = isMobile ? '📱' : '🖥️';

  return {
    icon,
    label: `${browser} (${os})`,
    raw: userAgent
  };
}

export default function ActiveSessionsConfig() {
  const [allSessions, setAllSessions] = useState([]);
  const [filteredActive, setFilteredActive] = useState([]);
  const [filteredInactive, setFilteredInactive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Settings State
  const [settings, setSettings] = useState({
    inactivityTimeoutMinutes: 60,
    enableAutoLogout: true,
    showTimerInHeader: true,
    warningSeconds: 60,
    idleThresholdSeconds: 60
  });
  const [isCustomTimeout, setIsCustomTimeout] = useState(false);
  const [customTimeoutInput, setCustomTimeoutInput] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccessMsg, setSettingsSuccessMsg] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // 1. Fetch Admin Session Security Settings
  const fetchSettings = useCallback(async () => {
    try {
      const res = await getSessionSecuritySettings();
      if (res?.success && res?.settings) {
        setSettings(res.settings);
        const standardPresets = [15, 30, 45, 60, 120];
        if (!standardPresets.includes(res.settings.inactivityTimeoutMinutes)) {
          setIsCustomTimeout(true);
          setCustomTimeoutInput(String(res.settings.inactivityTimeoutMinutes));
        } else {
          setIsCustomTimeout(false);
        }
      }
    } catch (err) {
      console.error('Error fetching session settings:', err);
    }
  }, []);

  // 2. Fetch Sessions & Daily Activity Metrics
  const fetchSessions = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const supabase = createClient();
      
      // 1. Fetch user roles for name mapping
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('user_id, email, emp_name');
        
      const userMap = {};
      (userRoles || []).forEach(u => {
        if (u.user_id && u.emp_name) userMap[u.user_id] = u.emp_name;
        if (u.email && u.emp_name) userMap[u.email.toLowerCase()] = u.emp_name;
      });

      // 2. Fetch employee activity metrics from today
      const activityRes = await getEmployeeDailyActivitySummary();
      const activityMap = {};
      if (activityRes?.success && activityRes?.employees) {
        activityRes.employees.forEach(emp => {
          if (emp.userId) activityMap[emp.userId] = emp;
          if (emp.email) activityMap[emp.email.toLowerCase()] = emp;
        });
      }

      // 3. Fetch user sessions
      let query = supabase
        .from('user_sessions')
        .select('*')
        .order('last_active', { ascending: false });
        
      if (dateFrom) {
        query = query.gte('last_active', new Date(dateFrom).toISOString());
      }
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('last_active', endOfDay.toISOString());
      }

      query = query.limit(500);

      const { data: sessionsData, error: sessionErr } = await query;

      if (sessionErr) {
        throw new Error('Session DB Error: ' + sessionErr.message);
      }

      if (sessionsData) {
        const now = Date.now();
        const THIRTY_MINUTES_MS = 30 * 60 * 1000;

        const formattedSessions = sessionsData.map(s => {
          let resolvedName = s.emp_name;
          if (!resolvedName || resolvedName === 'System User') {
            if (s.user_id && userMap[s.user_id]) resolvedName = userMap[s.user_id];
            else if (s.email && userMap[s.email.toLowerCase()]) resolvedName = userMap[s.email.toLowerCase()];
            else if (s.email) resolvedName = s.email.split('@')[0];
            else resolvedName = 'System User';
          }

          const lastActiveDate = new Date(s.last_active);
          const isWithin30Mins = (now - lastActiveDate.getTime()) < THIRTY_MINUTES_MS;
          const isActive = s.is_active === true && isWithin30Mins;
          const parsedDevice = parseDeviceInfo(s.device);

          // Merge live activity stats if available
          const act = (s.user_id && activityMap[s.user_id]) || (s.email && activityMap[s.email.toLowerCase()]);
          
          let liveStatus = 'offline';
          if (isActive) {
            liveStatus = act?.liveStatus || 'working';
          }

          return {
            id: s.id,
            user: resolvedName,
            email: s.email,
            deviceObj: parsedDevice,
            ip: s.ip_address || 'Logged via Web App',
            lastActive: lastActiveDate.toLocaleString('en-IN', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit', second: '2-digit',
              hour12: true
            }),
            lastActiveRaw: lastActiveDate,
            isActive,
            liveStatus,
            activeDurationFormatted: act?.activeDurationFormatted || '0m 00s',
            idleDurationFormatted: act?.idleDurationFormatted || '0m 00s',
            totalDurationFormatted: act?.totalDurationFormatted || '0m 00s',
            current: false
          };
        });
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const mySession = formattedSessions.find(s => s.email === user.email && s.isActive);
          if (mySession) mySession.current = true;
        }
        
        setAllSessions(formattedSessions);
      }
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchSettings();
    fetchSessions();
    const timer = setInterval(() => fetchSessions(false), 20000); // 20s auto-refresh
    return () => clearInterval(timer);
  }, [fetchSettings, fetchSessions]);

  useEffect(() => {
    // Client-side search filtering
    let filtered = allSessions;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        (s.user && s.user.toLowerCase().includes(q)) || 
        (s.email && s.email.toLowerCase().includes(q)) || 
        (s.deviceObj?.label && s.deviceObj.label.toLowerCase().includes(q)) ||
        (s.ip && s.ip.toLowerCase().includes(q))
      );
    }
    
    // Split into Active and Inactive
    setFilteredActive(filtered.filter(s => s.isActive));
    setFilteredInactive(filtered.filter(s => !s.isActive));
  }, [searchQuery, allSessions]);

  const handleForceLogout = async (sessionId) => {
    await forceLogoutSession(sessionId);
    fetchSessions(true);
  };

  const handleForceLogoutAll = async () => {
    if (!confirm('Are you sure you want to terminate all other active user sessions?')) return;
    const currentDevice = typeof navigator !== 'undefined' ? navigator.userAgent : null;
    await forceLogoutAllOtherSessions(currentDevice);
    alert('All other devices have been logged out.');
    fetchSessions(true);
  };

  // Save Settings Handler
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSettingsSuccessMsg(null);
    setError(null);

    let finalTimeout = settings.inactivityTimeoutMinutes;
    if (isCustomTimeout) {
      const parsedCustom = parseInt(customTimeoutInput, 10);
      if (isNaN(parsedCustom) || parsedCustom < 1) {
        setError('Please enter a valid custom timeout in minutes (minimum 1 minute).');
        setSavingSettings(false);
        return;
      }
      finalTimeout = parsedCustom;
    }

    const payload = {
      ...settings,
      inactivityTimeoutMinutes: finalTimeout
    };

    const res = await saveSessionSecuritySettings(payload);
    setSavingSettings(false);

    if (res?.success) {
      setSettings(res.settings);
      setSettingsSuccessMsg(`✅ Session settings saved! Users will now expire after ${res.settings.inactivityTimeoutMinutes} minutes of inactivity.`);
      window.dispatchEvent(new Event('session_config_updated'));
      setTimeout(() => setSettingsSuccessMsg(null), 5000);
    } else {
      setError(res?.error || 'Failed to save session settings');
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1150px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ color: 'var(--text-primary)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.4rem' }}>
            <Monitor size={24} color="var(--accent-color)" />
            Monitor User Sessions & Inactivity Rules
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Configure automatic session timeout duration and monitor real-time employee active/idle working hours.
          </p>
        </div>

        <button
          onClick={() => fetchSessions(true)}
          disabled={refreshing || loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.85rem',
            color: 'var(--text-primary)'
          }}
        >
          <RefreshCw size={15} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? 'Refreshing...' : 'Refresh Status'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {settingsSuccessMsg && (
        <div style={{ padding: '1rem', background: '#dcfce7', color: '#166534', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} />
          <span>{settingsSuccessMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION: ADMIN SESSION TIMEOUT & INACTIVITY CONFIGURATION */}
      {/* ========================================================================= */}
      <div style={{
        background: 'var(--bg-primary)',
        padding: '1.5rem',
        borderRadius: '12px',
        border: '1px solid var(--border-light)',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Sliders size={20} color="var(--accent-color)" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              Session Inactivity & Auto-Logout Settings
            </h3>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Applies to all employee logins across Web CRM
          </span>
        </div>

        {/* Timeout Duration Selector */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            Inactivity Timeout Duration (Minutes)
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {[15, 30, 45, 60, 120].map((mins) => {
              const isSelected = !isCustomTimeout && settings.inactivityTimeoutMinutes === mins;
              return (
                <button
                  key={mins}
                  type="button"
                  onClick={() => {
                    setIsCustomTimeout(false);
                    setSettings(prev => ({ ...prev, inactivityTimeoutMinutes: mins }));
                  }}
                  style={{
                    padding: '0.55rem 1.1rem',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid var(--accent-color)' : '1px solid var(--border-light)',
                    backgroundColor: isSelected ? 'rgba(67, 56, 202, 0.08)' : 'var(--bg-surface)',
                    color: isSelected ? 'var(--accent-color)' : 'var(--text-primary)',
                    fontWeight: isSelected ? 700 : 500,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {mins} Minutes
                </button>
              );
            })}

            {/* Custom Minutes Button */}
            <button
              type="button"
              onClick={() => {
                setIsCustomTimeout(true);
                if (!customTimeoutInput) setCustomTimeoutInput(String(settings.inactivityTimeoutMinutes || 90));
              }}
              style={{
                padding: '0.55rem 1.1rem',
                borderRadius: '8px',
                border: isCustomTimeout ? '2px solid var(--accent-color)' : '1px solid var(--border-light)',
                backgroundColor: isCustomTimeout ? 'rgba(67, 56, 202, 0.08)' : 'var(--bg-surface)',
                color: isCustomTimeout ? 'var(--accent-color)' : 'var(--text-primary)',
                fontWeight: isCustomTimeout ? 700 : 500,
                fontSize: '0.88rem',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              Custom
            </button>

            {isCustomTimeout && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={customTimeoutInput}
                  onChange={(e) => setCustomTimeoutInput(e.target.value)}
                  placeholder="e.g. 90"
                  style={{
                    width: '90px',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--accent-color)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    fontWeight: 600
                  }}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mins</span>
              </div>
            )}
          </div>
        </div>

        {/* Toggles & Options Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          
          {/* Toggle 1: Auto-Logout */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>Automatic Logout</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Log out user when timer reaches 00:00</div>
            </div>
            <input
              type="checkbox"
              checked={settings.enableAutoLogout}
              onChange={(e) => setSettings(prev => ({ ...prev, enableAutoLogout: e.target.checked }))}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent-color)' }}
            />
          </div>

          {/* Toggle 2: Show Live Timer in Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>Show Timer in Header</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Users can see countdown clock in topbar</div>
            </div>
            <input
              type="checkbox"
              checked={settings.showTimerInHeader}
              onChange={(e) => setSettings(prev => ({ ...prev, showTimerInHeader: e.target.checked }))}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent-color)' }}
            />
          </div>
        </div>

        {/* Save Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={savingSettings}
            style={{
              padding: '0.65rem 1.75rem',
              backgroundColor: 'var(--accent-color)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: savingSettings ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
            }}
          >
            {savingSettings ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {savingSettings ? 'Saving...' : 'Save Timeout Settings'}
          </button>
        </div>
      </div>

      {/* Global Search & Date Filters */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface)', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)', flex: 1, minWidth: '260px' }}>
          <Search size={18} color="var(--text-secondary)" />
          <input 
            type="text" 
            placeholder="Search employee, email, IP, or browser..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', width: '100%', fontSize: '0.9rem' }}
          />
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface)', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
          <Calendar size={18} color="var(--text-secondary)" />
          <input 
            type="date" 
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem' }}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>to</span>
          <input 
            type="date" 
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {loading && allSessions.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          ⏳ Loading live user sessions and activity durations...
        </div>
      ) : (
        <>
          {/* Section 1: Active User Sessions & Employee Time Tracking */}
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                  Active User Sessions & Time Tracking ({filteredActive.length})
                </h3>
              </div>

              {filteredActive.length > 1 && (
                <button 
                  onClick={handleForceLogoutAll}
                  style={{ padding: '0.45rem 1rem', background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <LogOut size={14} /> Force Logout All Other Devices
                </button>
              )}
            </div>
            
            {filteredActive.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px dashed var(--border-light)' }}>
                No active user sessions right now. (Users become active on login/action).
              </div>
            ) : (
              <div style={{ maxHeight: '460px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--th-bg)' }}>
                    <tr style={{ color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Employee Name & Email</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Real-Time Status</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Active Work (Today)</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Idle / Away</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Device / Browser</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Last Heartbeat</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActive.map((session, i) => (
                      <tr 
                        key={session.id} 
                        style={{ 
                          borderBottom: i < filteredActive.length - 1 ? '1px solid var(--border-light)' : 'none', 
                          background: session.current ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-surface)' 
                        }}
                      >
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 600 }}>{session.user}</span>
                            {session.current && (
                              <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', background: '#10b981', color: 'white', borderRadius: '10px', fontWeight: 600 }}>
                                Current
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400, marginTop: '0.1rem' }}>{session.email}</div>
                        </td>

                        {/* Real-time Status Badge */}
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {session.liveStatus === 'working' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#dcfce7', color: '#166534', fontWeight: 600, fontSize: '0.78rem' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16a34a' }} />
                              🟢 Working (Live)
                            </span>
                          )}
                          {session.liveStatus === 'away' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#fef3c7', color: '#b45309', fontWeight: 600, fontSize: '0.78rem' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                              🟡 Away (Idle)
                            </span>
                          )}
                          {session.liveStatus === 'offline' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#f1f5f9', color: '#64748b', fontWeight: 600, fontSize: '0.78rem' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#94a3b8' }} />
                              🔴 Offline
                            </span>
                          )}
                        </td>

                        {/* Active Work Time */}
                        <td style={{ padding: '0.75rem 1rem', color: '#15803d', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.9rem' }}>
                          {session.activeDurationFormatted}
                        </td>

                        {/* Idle Time */}
                        <td style={{ padding: '0.75rem 1rem', color: '#b45309', fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                          {session.idleDurationFormatted}
                        </td>

                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }} title={session.deviceObj?.raw}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-primary)', padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                            <span>{session.deviceObj?.icon}</span>
                            <span>{session.deviceObj?.label}</span>
                          </span>
                        </td>

                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          {session.lastActive}
                        </td>

                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          {!session.current ? (
                            <button 
                              onClick={() => handleForceLogout(session.id)}
                              style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, padding: '0.35rem 0.65rem', borderRadius: '6px', transition: 'all 0.15s' }}
                            >
                              <LogOut size={13} /> Force Logout
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Your session</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 2: User Session Logs (Inactive / Expired) */}
          <div style={{ background: 'var(--bg-primary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <History size={20} color="var(--text-secondary)" />
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                User Session Logs ({filteredInactive.length})
              </h3>
            </div>
            
            {filteredInactive.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-surface)', borderRadius: '8px', border: '1px dashed var(--border-light)' }}>
                No past session logs found.
              </div>
            ) : (
              <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--th-bg)' }}>
                    <tr style={{ color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>User & Email</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Device / Browser</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>IP Source</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Last Active (Expired/Logout)</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInactive.map((session, i) => (
                      <tr 
                        key={session.id} 
                        style={{ 
                          borderBottom: i < filteredInactive.length - 1 ? '1px solid var(--border-light)' : 'none', 
                          background: 'var(--bg-surface)' 
                        }}
                      >
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                          <div style={{ fontWeight: 600 }}>{session.user}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400, marginTop: '0.1rem' }}>{session.email}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }} title={session.deviceObj?.raw}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-primary)', padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            <span>{session.deviceObj?.icon}</span>
                            <span>{session.deviceObj?.label}</span>
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{session.ip}</td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{session.lastActive}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
                            <ShieldOff size={12} /> Logged Out / Expired
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
