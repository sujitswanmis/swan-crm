'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, ShieldAlert, Activity, CheckCircle2, RefreshCw, AlertTriangle, UserCheck, Coffee, Utensils, Play, X, ChevronRight, Droplets, Users, BedDouble } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { getSessionSecuritySettings, recordUserActivityHeartbeat, startEmployeeBreak, endEmployeeBreak, getCurrentEmployeeStatus } from '@/app/actions/sessionSettings';

const BREAK_TYPES = [
  { id: 'tea', label: 'Tea / Coffee Break', icon: '☕', defaultMins: 15 },
  { id: 'lunch', label: 'Lunch Break', icon: '🍱', defaultMins: 30 },
  { id: 'washroom', label: 'Washroom Break', icon: '🚻', defaultMins: 10 },
  { id: 'water', label: 'Drinking Water / Hydration', icon: '💧', defaultMins: 5 },
  { id: 'rest', label: 'Rest / Short Break', icon: '🛌', defaultMins: 15 },
  { id: 'meeting', label: 'Team Discussion / Meeting', icon: '👥', defaultMins: 30 }
];

export default function SessionExpiryTracker({ userEmail = '', userName = '', userRole = '' }) {
  const [settings, setSettings] = useState({
    inactivityTimeoutMinutes: 60,
    enableAutoLogout: true,
    showTimerInHeader: true,
    warningSeconds: 60,
    idleThresholdSeconds: 60
  });

  const [timeLeftSeconds, setTimeLeftSeconds] = useState(60 * 60);
  const [isAway, setIsAway] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [todayActiveSec, setTodayActiveSec] = useState(0);
  const [todayIdleSec, setTodayIdleSec] = useState(0);

  // Break State
  const [currentBreak, setCurrentBreak] = useState(null); // { id, type, icon, startTime }
  const [breakElapsedSec, setBreakElapsedSec] = useState(0);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Refs for tracking without re-triggering intervals
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const dropdownContainerRef = useRef(null);
  const lastActivityTimestamp = useRef(Date.now());
  const activeAccumulator = useRef(0);
  const idleAccumulator = useRef(0);
  const isCurrentlyActive = useRef(true);
  const isLoggingOut = useRef(false);
  const currentBreakRef = useRef(null);
  currentBreakRef.current = currentBreak;

  // Click Outside Listener for Dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Fetch Admin Session Settings & Current Break Status on mount
  const fetchSettingsAndStatus = useCallback(async () => {
    try {
      // 1. Instant local restore
      try {
        if (typeof window !== 'undefined') {
          const cachedBreak = localStorage.getItem('crm_active_break');
          if (cachedBreak) {
            const parsed = JSON.parse(cachedBreak);
            setCurrentBreak(parsed);
            const elapsed = Math.max(0, Math.floor((Date.now() - new Date(parsed.startTime).getTime()) / 1000));
            setBreakElapsedSec(elapsed);
          }
        }
      } catch (e) {}

      const res = await getSessionSecuritySettings();
      if (res?.success && res?.settings) {
        setSettings(res.settings);
        const fullTimeout = (res.settings.inactivityTimeoutMinutes || 60) * 60;
        setTimeLeftSeconds(fullTimeout);
      }

      const statusRes = await getCurrentEmployeeStatus(userEmail);
      if (statusRes?.success) {
        if (statusRes.currentBreak) {
          setCurrentBreak(statusRes.currentBreak);
          const elapsed = Math.max(0, Math.floor((Date.now() - new Date(statusRes.currentBreak.startTime).getTime()) / 1000));
          setBreakElapsedSec(elapsed);
          try {
            localStorage.setItem('crm_active_break', JSON.stringify(statusRes.currentBreak));
          } catch (e) {}
        } else {
          try {
            localStorage.removeItem('crm_active_break');
          } catch (e) {}
          setCurrentBreak(null);
        }
      }
    } catch (e) {
      console.error('Failed to load session settings / break status:', e);
    }
  }, [userEmail]);

  useEffect(() => {
    fetchSettingsAndStatus();

    const handleConfigUpdate = () => {
      fetchSettingsAndStatus();
    };

    window.addEventListener('session_config_updated', handleConfigUpdate);
    window.addEventListener('crm_config_updated', handleConfigUpdate);

    return () => {
      window.removeEventListener('session_config_updated', handleConfigUpdate);
      window.removeEventListener('crm_config_updated', handleConfigUpdate);
    };
  }, [fetchSettingsAndStatus]);

  // 2. User Activity Reset Handler
  const handleUserActivity = useCallback(() => {
    // If user is actively on break, do not override break status by mouse movement
    if (currentBreakRef.current) return;

    const now = Date.now();
    lastActivityTimestamp.current = now;

    if (!isCurrentlyActive.current) {
      isCurrentlyActive.current = true;
      setIsAway(false);
    }

    setShowWarningModal(false);

    const fullDuration = (settingsRef.current.inactivityTimeoutMinutes || 60) * 60;
    setTimeLeftSeconds(fullDuration);
  }, []);

  // Event Listeners for Activity Reset
  useEffect(() => {
    let lastEventTime = 0;
    const throttledActivity = () => {
      const now = Date.now();
      if (now - lastEventTime > 800) {
        lastEventTime = now;
        handleUserActivity();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(event => {
      window.addEventListener(event, throttledActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, throttledActivity);
      });
    };
  }, [handleUserActivity]);

  // 3. Main 1-Second Ticking Engine
  useEffect(() => {
    const timer = setInterval(() => {
      if (isLoggingOut.current) return;

      // If user is currently ON BREAK
      if (currentBreakRef.current) {
        setBreakElapsedSec(prev => prev + 1);
        idleAccumulator.current += 1;
        setTodayIdleSec(prev => prev + 1);
        return;
      }

      const now = Date.now();
      const idleDiffSec = Math.floor((now - lastActivityTimestamp.current) / 1000);
      const idleThreshold = settingsRef.current.idleThresholdSeconds || 60;
      const fullDuration = (settingsRef.current.inactivityTimeoutMinutes || 60) * 60;
      const warningThreshold = settingsRef.current.warningSeconds || 60;
      const enableAutoLogout = settingsRef.current.enableAutoLogout !== false;

      // Check if inactive for > idleThreshold
      if (idleDiffSec >= idleThreshold) {
        if (isCurrentlyActive.current) {
          isCurrentlyActive.current = false;
          setIsAway(true);
        }
        idleAccumulator.current += 1;
        setTodayIdleSec(prev => prev + 1);
      } else {
        if (!isCurrentlyActive.current) {
          isCurrentlyActive.current = true;
          setIsAway(false);
        }
        activeAccumulator.current += 1;
        setTodayActiveSec(prev => prev + 1);
      }

      // Calculate remaining countdown
      const remaining = Math.max(0, fullDuration - idleDiffSec);
      setTimeLeftSeconds(remaining);

      // Warning Modal (< 60s)
      if (enableAutoLogout && remaining <= warningThreshold && remaining > 0) {
        setShowWarningModal(true);
      } else if (remaining > warningThreshold) {
        setShowWarningModal(false);
      }

      // Auto-Logout Trigger
      if (enableAutoLogout && remaining <= 0 && !isLoggingOut.current) {
        isLoggingOut.current = true;
        handleAutoLogout();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 4. Periodic Server Heartbeat (Every 30 seconds)
  useEffect(() => {
    const sendHeartbeat = async () => {
      const activeToSend = activeAccumulator.current;
      const idleToSend = idleAccumulator.current;
      activeAccumulator.current = 0;
      idleAccumulator.current = 0;

      let currentStatus = 'working';
      if (currentBreakRef.current) {
        currentStatus = 'on_break';
      } else if (!isCurrentlyActive.current) {
        currentStatus = 'away';
      }

      const device = typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Browser';

      try {
        const res = await recordUserActivityHeartbeat({
          activeSecondsIncrement: activeToSend,
          idleSecondsIncrement: idleToSend,
          status: currentStatus,
          device
        });

        if (res && (res.forceLogout === true || res.valid === false)) {
          isLoggingOut.current = true;
          alert('Your session has been terminated by the administrator.');
          const supabase = createClient();
          await supabase.auth.signOut();
          window.location.href = '/login?reason=force_logout';
          return;
        }

        if (res?.success && res.todaySummary) {
          setTodayActiveSec(res.todaySummary.activeSeconds);
          setTodayIdleSec(res.todaySummary.idleSeconds);
        }
      } catch (err) {
        console.error('Failed to sync activity heartbeat:', err);
      }
    };

    const interval = setInterval(sendHeartbeat, 30000);
    return () => clearInterval(interval);
  }, []);

  // 5. Break Handlers
  const handleStartBreak = async (breakTypeObj) => {
    const nowIso = new Date().toISOString();
    const localBreak = {
      id: `brk_${Date.now()}`,
      type: breakTypeObj.label || 'Break',
      icon: breakTypeObj.icon || '☕',
      startTime: nowIso,
      startTimeFormatted: new Date(nowIso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
    };

    // Instant local state update (Zero lag / Never stuck)
    setCurrentBreak(localBreak);
    setBreakElapsedSec(0);
    setShowBreakModal(false);
    setIsDropdownOpen(false);

    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('crm_active_break', JSON.stringify(localBreak));
      }
    } catch (e) {}

    // Background server sync
    try {
      const res = await startEmployeeBreak({
        breakType: breakTypeObj.label,
        breakIcon: breakTypeObj.icon,
        userEmail
      });
      if (res?.currentBreak) {
        setCurrentBreak(res.currentBreak);
      }
    } catch (err) {
      console.error('Failed to sync start break with server:', err);
    }
  };

  const handleEndBreak = async () => {
    // Instant local state resume
    setCurrentBreak(null);
    setBreakElapsedSec(0);
    handleUserActivity();

    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('crm_active_break');
      }
    } catch (e) {}

    // Background server sync
    try {
      await endEmployeeBreak({ userEmail });
    } catch (err) {
      console.error('Failed to sync end break with server:', err);
    }
  };

  // 6. Handle Auto Logout
  const handleAutoLogout = async () => {
    try {
      const supabase = createClient();
      const { logAuditAction } = await import('@/app/actions/audit');
      await logAuditAction('Session Auto-Logout', 'Session automatically logged out due to inactivity timeout');
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Auto logout error:', err);
    } finally {
      window.location.href = '/login?reason=inactivity_timeout';
    }
  };

  // Helper formatting for minutes:seconds (e.g. 45:12)
  const formatTimeRemaining = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatHoursMinutes = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}m`;
  };

  if (!settings.showTimerInHeader) return null;

  // Determine badge styling based on remaining time & break status
  const isUrgent = timeLeftSeconds <= (settings.warningSeconds || 60);
  const isLowTime = timeLeftSeconds <= 300;

  let badgeBg = '#f0fdf4';
  let badgeBorder = '#bbf7d0';
  let badgeColor = '#15803d';
  let dotColor = '#10b981';

  if (currentBreak) {
    badgeBg = '#fff7ed';
    badgeBorder = '#ffedd5';
    badgeColor = '#c2410c';
    dotColor = '#f97316';
  } else if (isUrgent) {
    badgeBg = '#fef2f2';
    badgeBorder = '#fecaca';
    badgeColor = '#b91c1c';
    dotColor = '#ef4444';
  } else if (isLowTime || isAway) {
    badgeBg = '#fffbeb';
    badgeBorder = '#fde68a';
    badgeColor = '#b45309';
    dotColor = '#f59e0b';
  }

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. TOPBAR LIVE SESSION TIMER & BREAK CONTROLS */}
      {/* ========================================================================= */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} ref={dropdownContainerRef}>
        
        {/* If ON BREAK: Show Prominent End Break Button */}
        {currentBreak ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.35rem 0.75rem',
                backgroundColor: '#fff7ed',
                border: '1px solid #fdba74',
                borderRadius: '10px',
                color: '#c2410c',
                fontSize: '0.82rem',
                fontWeight: 700,
                boxShadow: '0 0 10px rgba(249, 115, 22, 0.25)',
                animation: 'pulse 1.5s infinite'
              }}
            >
              <span>{currentBreak.icon || '☕'}</span>
              <span>{currentBreak.type || 'On Break'}</span>
              <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                ({formatTimeRemaining(breakElapsedSec)})
              </span>
            </div>

            <button
              type="button"
              onClick={handleEndBreak}
              disabled={actionLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.4rem 0.85rem',
                backgroundColor: '#16a34a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(22, 163, 74, 0.3)',
                transition: 'all 0.15s'
              }}
              title="Click to end break and resume working"
            >
              <Play size={14} fill="#ffffff" />
              <span>Resume Work</span>
            </button>
          </div>
        ) : (
          /* Normal Working / Session Timer Click-to-Open Dropdown */
          <div style={{ position: 'relative' }}>
            <div
              onClick={() => {
                handleUserActivity();
                setIsDropdownOpen(prev => !prev);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.35rem 0.65rem',
                backgroundColor: isDropdownOpen ? 'rgba(67, 56, 202, 0.08)' : badgeBg,
                border: isDropdownOpen ? '1px solid var(--accent-color, #4338ca)' : `1px solid ${badgeBorder}`,
                borderRadius: '10px',
                color: isDropdownOpen ? 'var(--accent-color, #4338ca)' : badgeColor,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.2s',
                boxShadow: isUrgent ? '0 0 10px rgba(239, 68, 68, 0.4)' : (isDropdownOpen ? '0 0 0 2px rgba(67, 56, 202, 0.2)' : '0 1px 2px rgba(0,0,0,0.04)'),
                animation: isUrgent ? 'pulse 1s infinite' : 'none'
              }}
              title="Click to view work time or take a break"
            >
              <span 
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: dotColor,
                  display: 'inline-block',
                  boxShadow: `0 0 6px ${dotColor}`
                }}
              />

              <Clock size={14} style={{ color: isDropdownOpen ? 'var(--accent-color, #4338ca)' : badgeColor }} />
              
              <span style={{ fontFamily: 'monospace', letterSpacing: '0.5px', fontSize: '0.82rem' }}>
                {formatTimeRemaining(timeLeftSeconds)}
              </span>

              <span style={{ fontSize: '0.7rem', opacity: 0.85, fontWeight: 500 }} className="desktop-only">
                {isAway ? 'Away' : 'Active'}
              </span>
            </div>

            {/* Click-to-Open Dropdown Menu */}
            {isDropdownOpen && (
              <div 
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  width: '270px',
                  backgroundColor: 'var(--bg-surface, #ffffff)',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  borderRadius: '14px',
                  padding: '1rem',
                  boxShadow: '0 15px 35px -5px rgba(0,0,0,0.2), 0 5px 15px rgba(0,0,0,0.08)',
                  zIndex: 100000,
                  fontSize: '0.82rem',
                  color: 'var(--text-primary, #0f172a)',
                  animation: 'fadeIn 0.15s ease-out'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem', borderBottom: '1px solid var(--border-light, #e2e8f0)', paddingBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                    <Activity size={16} color="var(--accent-color, #4338ca)" /> Work & Session Time
                  </span>
                  <span style={{ 
                    fontSize: '0.7rem', 
                    padding: '0.15rem 0.45rem', 
                    borderRadius: '10px', 
                    backgroundColor: isAway ? '#fef3c7' : '#dcfce7',
                    color: isAway ? '#b45309' : '#166534',
                    fontWeight: 700
                  }}>
                    {isAway ? '🟡 Away (Idle)' : '🟢 Working'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', color: 'var(--text-secondary, #64748b)', marginBottom: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Inactivity Timeout:</span>
                    <strong style={{ color: 'var(--text-primary, #0f172a)' }}>{settings.inactivityTimeoutMinutes} mins</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Remaining Before Logout:</span>
                    <strong style={{ color: badgeColor, fontFamily: 'monospace' }}>{formatTimeRemaining(timeLeftSeconds)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Active Work Today:</span>
                    <strong style={{ color: '#16a34a' }}>{formatHoursMinutes(todayActiveSec)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Lunch / Breaks Today:</span>
                    <strong style={{ color: '#d97706' }}>{formatHoursMinutes(todayIdleSec)}</strong>
                  </div>
                </div>

                {/* Take Break Button & Reset Button */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBreakModal(true);
                      setIsDropdownOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.55rem',
                      backgroundColor: '#ea580c',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.45rem',
                      boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)',
                      transition: 'all 0.15s'
                    }}
                  >
                    <Coffee size={16} />
                    <span>☕ Take a Break (Tea / Rest)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleUserActivity();
                      setIsDropdownOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      backgroundColor: 'var(--bg-surface, #f8fafc)',
                      color: 'var(--text-primary, #0f172a)',
                      border: '1px solid var(--border-light, #cbd5e1)',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <RefreshCw size={13} /> Reset / Extend Session
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. BREAK SELECTION MODAL (TEA, LUNCH, WASHROOM, REST, ETC.) */}
      {/* ========================================================================= */}
      {showBreakModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            maxWidth: '460px',
            width: '100%',
            padding: '1.5rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            animation: 'scaleIn 0.2s ease-out'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Coffee size={22} color="#ea580c" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
                  Take a Break
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBreakModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 1rem 0' }}>
              Select your break reason. Exact Start Time and Duration will be tracked accurately for shift records.
            </p>

            {/* Break Options Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {((Array.isArray(settings.breakRules) && settings.breakRules.length > 0)
                ? settings.breakRules.filter(b => b.enabled !== false)
                : BREAK_TYPES
              ).map(b => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleStartBreak(b)}
                  disabled={actionLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#f8fafc',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#fff7ed';
                    e.currentTarget.style.borderColor = '#fdba74';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8fafc';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.4rem' }}>{b.icon || '☕'}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{b.label}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Standard: ~{b.defaultMins} mins</div>
                    </div>
                  </div>
                  <ChevronRight size={16} color="#94a3b8" />
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowBreakModal(false)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SESSION EXPIRY WARNING MODAL (< 60 SECONDS) */}
      {/* ========================================================================= */}
      {showWarningModal && !currentBreak && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            maxWidth: '440px',
            width: '100%',
            padding: '2rem 1.75rem',
            textAlign: 'center',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            border: '2px solid #f87171',
            animation: 'scaleIn 0.2s ease-out'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <AlertTriangle size={34} />
            </div>

            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
              Session Expiry Warning!
            </h2>

            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              You have been inactive for a while. For data security, your session will automatically terminate in:
            </p>

            <div style={{
              backgroundColor: '#fef2f2',
              border: '2px dashed #fca5a5',
              padding: '0.75rem',
              borderRadius: '12px',
              marginBottom: '1.5rem',
              display: 'inline-block',
              minWidth: '180px'
            }}>
              <span style={{
                fontSize: '2.25rem',
                fontWeight: 800,
                fontFamily: 'monospace',
                color: '#dc2626',
                letterSpacing: '2px'
              }}>
                {formatTimeRemaining(timeLeftSeconds)}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleUserActivity}
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)'
                }}
              >
                <UserCheck size={18} /> I Am Still Working (Keep Active)
              </button>

              <button
                type="button"
                onClick={handleAutoLogout}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  backgroundColor: 'transparent',
                  color: '#64748b',
                  border: 'none',
                  fontWeight: 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Log Out Now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
