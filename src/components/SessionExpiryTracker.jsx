'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, ShieldAlert, Activity, CheckCircle2, RefreshCw, AlertTriangle, UserCheck } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { getSessionSecuritySettings, recordUserActivityHeartbeat } from '@/app/actions/sessionSettings';

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
  const [isHovered, setIsHovered] = useState(false);
  const [todayActiveSec, setTodayActiveSec] = useState(0);
  const [todayIdleSec, setTodayIdleSec] = useState(0);

  // Refs for tracking without re-triggering intervals
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const lastActivityTimestamp = useRef(Date.now());
  const activeAccumulator = useRef(0);
  const idleAccumulator = useRef(0);
  const isCurrentlyActive = useRef(true);
  const isLoggingOut = useRef(false);

  // 1. Fetch Admin Session Settings on mount & listen to changes
  const fetchSettings = useCallback(async () => {
    try {
      const res = await getSessionSecuritySettings();
      if (res?.success && res?.settings) {
        setSettings(res.settings);
        const fullTimeout = (res.settings.inactivityTimeoutMinutes || 60) * 60;
        setTimeLeftSeconds(fullTimeout);
      }
    } catch (e) {
      console.error('Failed to load session settings:', e);
    }
  }, []);

  useEffect(() => {
    fetchSettings();

    // Listen for live updates when Admin saves settings
    const handleConfigUpdate = () => {
      fetchSettings();
    };

    window.addEventListener('session_config_updated', handleConfigUpdate);
    window.addEventListener('crm_config_updated', handleConfigUpdate);

    return () => {
      window.removeEventListener('session_config_updated', handleConfigUpdate);
      window.removeEventListener('crm_config_updated', handleConfigUpdate);
    };
  }, [fetchSettings]);

  // 2. User Activity Reset Handler (Mouse, Touch, Keydown, Scroll)
  const handleUserActivity = useCallback(() => {
    const now = Date.now();
    lastActivityTimestamp.current = now;

    // Reset away status to working
    if (!isCurrentlyActive.current) {
      isCurrentlyActive.current = true;
      setIsAway(false);
    }

    // Dismiss warning modal if user moves mouse
    setShowWarningModal(false);

    // Reset countdown timer to full duration
    const fullDuration = (settingsRef.current.inactivityTimeoutMinutes || 60) * 60;
    setTimeLeftSeconds(fullDuration);
  }, []);

  // Set up throttled event listeners
  useEffect(() => {
    let lastEventTime = 0;
    const throttledActivity = () => {
      const now = Date.now();
      if (now - lastEventTime > 800) { // Max once per 800ms to keep CPU 0%
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

  // 3. Main 1-Second Ticking Engine (Countdown & Working/Idle Accumulation)
  useEffect(() => {
    const timer = setInterval(() => {
      if (isLoggingOut.current) return;

      const now = Date.now();
      const idleDiffSec = Math.floor((now - lastActivityTimestamp.current) / 1000);
      const idleThreshold = settingsRef.current.idleThresholdSeconds || 60;
      const fullDuration = (settingsRef.current.inactivityTimeoutMinutes || 60) * 60;
      const warningThreshold = settingsRef.current.warningSeconds || 60;
      const enableAutoLogout = settingsRef.current.enableAutoLogout !== false;

      // Check if user has been inactive for > idleThreshold
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

      // Calculate remaining countdown seconds based on inactivity duration
      const remaining = Math.max(0, fullDuration - idleDiffSec);
      setTimeLeftSeconds(remaining);

      // Warning Modal Trigger (when <= warningThreshold)
      if (enableAutoLogout && remaining <= warningThreshold && remaining > 0) {
        setShowWarningModal(true);
      } else if (remaining > warningThreshold) {
        setShowWarningModal(false);
      }

      // Auto-Logout Trigger when remaining reaches 0
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
      if (activeAccumulator.current === 0 && idleAccumulator.current === 0) return;

      const activeToSend = activeAccumulator.current;
      const idleToSend = idleAccumulator.current;
      activeAccumulator.current = 0;
      idleAccumulator.current = 0;

      const currentStatus = isCurrentlyActive.current ? 'working' : 'away';
      const device = typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Browser';

      try {
        const res = await recordUserActivityHeartbeat({
          activeSecondsIncrement: activeToSend,
          idleSecondsIncrement: idleToSend,
          status: currentStatus,
          device
        });

        if (res?.success && res.todaySummary) {
          setTodayActiveSec(res.todaySummary.activeSeconds);
          setTodayIdleSec(res.todaySummary.idleSeconds);
        }
      } catch (err) {
        console.error('Failed to sync activity heartbeat:', err);
      }
    };

    const interval = setInterval(sendHeartbeat, 30000); // Sync every 30s
    return () => clearInterval(interval);
  }, []);

  // 5. Handle Auto Logout Execution
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

  // Determine badge styling based on remaining time
  const isUrgent = timeLeftSeconds <= (settings.warningSeconds || 60);
  const isLowTime = timeLeftSeconds <= 300; // <= 5 minutes

  let badgeBg = '#f0fdf4';
  let badgeBorder = '#bbf7d0';
  let badgeColor = '#15803d';
  let dotColor = '#10b981';

  if (isUrgent) {
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
      {/* 1. TOPBAR LIVE SESSION TIMER BADGE */}
      {/* ========================================================================= */}
      <div 
        style={{ position: 'relative' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          onClick={handleUserActivity}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.35rem 0.65rem',
            backgroundColor: badgeBg,
            border: `1px solid ${badgeBorder}`,
            borderRadius: '10px',
            color: badgeColor,
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'all 0.2s',
            boxShadow: isUrgent ? '0 0 10px rgba(239, 68, 68, 0.4)' : '0 1px 2px rgba(0,0,0,0.04)',
            animation: isUrgent ? 'pulse 1s infinite' : 'none'
          }}
          title="Click to reset / extend session"
        >
          {/* Pulsing Status Dot */}
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

          <Clock size={14} style={{ color: badgeColor }} />
          
          <span style={{ fontFamily: 'monospace', letterSpacing: '0.5px', fontSize: '0.82rem' }}>
            {formatTimeRemaining(timeLeftSeconds)}
          </span>

          <span style={{ fontSize: '0.7rem', opacity: 0.85, fontWeight: 500 }} className="desktop-only">
            {isAway ? 'Away' : 'Active'}
          </span>
        </div>

        {/* ========================================================================= */}
        {/* HOVER TOOLTIP / STATUS DETAILS POPOVER */}
        {/* ========================================================================= */}
        {isHovered && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '240px',
            backgroundColor: 'var(--bg-surface, #ffffff)',
            border: '1px solid var(--border-light, #e2e8f0)',
            borderRadius: '12px',
            padding: '0.85rem',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
            zIndex: 10000,
            fontSize: '0.8rem',
            color: 'var(--text-primary, #0f172a)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-light, #e2e8f0)', paddingBottom: '0.4rem' }}>
              <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Activity size={15} color="var(--accent-color, #4338ca)" /> Work & Session Time
              </span>
              <span style={{ 
                fontSize: '0.68rem', 
                padding: '0.1rem 0.4rem', 
                borderRadius: '10px', 
                backgroundColor: isAway ? '#fef3c7' : '#dcfce7',
                color: isAway ? '#b45309' : '#166534',
                fontWeight: 600
              }}>
                {isAway ? '🟡 Away (Idle)' : '🟢 Working'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', color: 'var(--text-secondary, #64748b)' }}>
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
                <span>Idle / Break Today:</span>
                <strong style={{ color: '#d97706' }}>{formatHoursMinutes(todayIdleSec)}</strong>
              </div>
            </div>

            <button
              type="button"
              onClick={handleUserActivity}
              style={{
                marginTop: '0.65rem',
                width: '100%',
                padding: '0.45rem',
                backgroundColor: 'var(--accent-color, #4338ca)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.75rem',
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
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. SESSION EXPIRY WARNING MODAL (< 60 SECONDS) */}
      {/* ========================================================================= */}
      {showWarningModal && (
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

            {/* Big Countdown Clock */}
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

            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.5rem' }}>
              Move your mouse, type, or click the button below to stay logged in.
            </p>

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
