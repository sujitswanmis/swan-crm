'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Monitor, Smartphone, Laptop, LogOut, RefreshCw, Search, ShieldCheck, 
  AlertCircle, CheckCircle2, Clock, Globe, User, ShieldAlert, Wifi, Filter
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { forceLogoutSession, forceLogoutAllOtherSessions } from '@/app/actions/audit';
import { formatISTDateTime } from '../utils/userManagementUtils';

function parseDeviceInfo(deviceStr = '') {
  if (!deviceStr) return { os: 'Windows', browser: 'Browser', icon: Monitor };
  const d = deviceStr.toLowerCase();

  let os = 'Windows';
  let icon = Monitor;
  if (d.includes('android')) {
    os = 'Android';
    icon = Smartphone;
  } else if (d.includes('iphone') || d.includes('ipad') || d.includes('ios')) {
    os = 'iOS';
    icon = Smartphone;
  } else if (d.includes('macintosh') || d.includes('mac os')) {
    os = 'macOS';
    icon = Laptop;
  } else if (d.includes('linux')) {
    os = 'Linux';
    icon = Laptop;
  }

  let browser = 'Chrome';
  if (d.includes('edg/')) browser = 'Edge';
  else if (d.includes('chrome')) browser = 'Chrome';
  else if (d.includes('safari')) browser = 'Safari';
  else if (d.includes('firefox')) browser = 'Firefox';

  return { os, browser, icon };
}

function formatTimeAgo(dateString) {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function ActiveSessionsTab() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Online' | 'Away' | 'Offline'
  const [revokingId, setRevokingId] = useState(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [loadError, setLoadError] = useState('');
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  // Fetch current logged in user email to tag "Your Session"
  useEffect(() => {
    async function loadUser() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.email) {
          setCurrentUserEmail(user.email.toLowerCase());
        }
      } catch (e) {
        console.warn('Could not load current user:', e);
      }
    }
    loadUser();
  }, []);

  const fetchSessions = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .order('last_active', { ascending: false })
        .limit(200);

      if (error) throw error;
      setSessions(data || []);
      setLoadError('');
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setLoadError(err.message || 'Could not load sessions');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  // Initial load and periodic background poll every 25 seconds
  useEffect(() => {
    fetchSessions(true);
    const interval = setInterval(() => {
      fetchSessions(false);
    }, 25000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Evaluated sessions with strict heartbeat time calculation:
  // - Heartbeat interval is 60s
  // - <= 10 mins: Live Online
  // - 10 to 30 mins: Away / Idle
  // - > 30 mins or is_active === false: Offline / Expired
  const evaluatedSessions = useMemo(() => {
    const now = Date.now();

    return (sessions || []).map(s => {
      const lastActiveMs = s.last_active ? new Date(s.last_active).getTime() : 0;
      const diffMs = now - lastActiveMs;
      const diffMinutes = diffMs / (1000 * 60);

      let status = 'offline';
      let statusLabel = 'Offline';
      let statusColor = '#64748b';
      let statusBg = '#f1f5f9';
      let statusBorder = '#cbd5e1';
      let statusDot = '#94a3b8';
      let isLive = false;

      if (s.is_active === false) {
        status = 'revoked';
        statusLabel = 'Revoked';
        statusColor = '#dc2626';
        statusBg = '#fef2f2';
        statusBorder = '#fecaca';
        statusDot = '#ef4444';
      } else if (diffMinutes <= 10) {
        status = 'online';
        statusLabel = '● Online';
        statusColor = '#059669';
        statusBg = '#ecfdf5';
        statusBorder = '#a7f3d0';
        statusDot = '#10b981';
        isLive = true;
      } else if (diffMinutes <= 30) {
        status = 'away';
        statusLabel = '● Away';
        statusColor = '#d97706';
        statusBg = '#fffbeb';
        statusBorder = '#fde68a';
        statusDot = '#f59e0b';
        isLive = true;
      } else {
        status = 'offline';
        statusLabel = 'Offline';
        statusColor = '#64748b';
        statusBg = '#f1f5f9';
        statusBorder = '#cbd5e1';
        statusDot = '#94a3b8';
      }

      const isCurrent = Boolean(
        currentUserEmail && 
        s.email && 
        s.email.toLowerCase() === currentUserEmail && 
        isLive
      );

      return {
        ...s,
        status,
        statusLabel,
        statusColor,
        statusBg,
        statusBorder,
        statusDot,
        isLive,
        isCurrent,
        timeAgo: formatTimeAgo(s.last_active)
      };
    });
  }, [sessions, currentUserEmail]);

  // Aggregate stats
  const statusCounts = useMemo(() => {
    const c = { All: evaluatedSessions.length, Online: 0, Away: 0, Offline: 0 };
    evaluatedSessions.forEach(s => {
      if (s.status === 'online') c.Online++;
      else if (s.status === 'away') c.Away++;
      else c.Offline++;
    });
    return c;
  }, [evaluatedSessions]);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    let list = evaluatedSessions;

    if (statusFilter === 'Online') {
      list = list.filter(s => s.status === 'online');
    } else if (statusFilter === 'Away') {
      list = list.filter(s => s.status === 'away');
    } else if (statusFilter === 'Offline') {
      list = list.filter(s => s.status === 'offline' || s.status === 'revoked');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(s => {
        const name = (s.emp_name || '').toLowerCase();
        const email = (s.email || '').toLowerCase();
        const ip = (s.ip_address || '').toLowerCase();
        const dev = (s.device || '').toLowerCase();
        return name.includes(q) || email.includes(q) || ip.includes(q) || dev.includes(q);
      });
    }

    return list;
  }, [evaluatedSessions, statusFilter, searchQuery]);

  // Force single session logout
  const handleForceLogout = async (session) => {
    const userName = session.emp_name || session.email || 'this user';
    if (!window.confirm(`Log out ${userName} from all active sessions?`)) {
      return;
    }

    setRevokingId(session.id);
    try {
      const res = await forceLogoutSession(session.id);
      if (res && res.success) {
        setSuccessMsg(`All sessions for ${userName} terminated successfully.`);
        setTimeout(() => setSuccessMsg(''), 3500);
        fetchSessions(false);
      } else {
        alert(res?.error || 'Failed to terminate session');
      }
    } catch (err) {
      alert('Error terminating session: ' + err.message);
    } finally {
      setRevokingId(null);
    }
  };

  // Force logout all other sessions
  const handleForceLogoutAllOthers = async () => {
    if (!window.confirm('Log out your other active sessions?')) {
      return;
    }

    setRevokingAll(true);
    try {
      const res = await forceLogoutAllOtherSessions();
      if (res && res.success) {
        setSuccessMsg('Your other sessions terminated successfully.');
        setTimeout(() => setSuccessMsg(''), 3500);
        fetchSessions(false);
      } else {
        alert(res?.error || 'Failed to terminate other sessions');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setRevokingAll(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      {/* Intro Header */}
      <div style={{
        padding: '1.25rem 1.5rem',
        borderRadius: '12px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Monitor size={20} style={{ color: '#059669' }} />
            Active User Sessions & Security Monitor
          </h3>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Real-time tracking of active user logins, devices, IP locations, and instant session revocation
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          {/* Real Active Online Badge */}
          <span style={{
            fontSize: '0.78rem',
            fontWeight: 700,
            padding: '0.3rem 0.75rem',
            borderRadius: '20px',
            backgroundColor: statusCounts.Online > 0 ? '#ecfdf5' : '#f1f5f9',
            color: statusCounts.Online > 0 ? '#059669' : '#64748b',
            border: `1px solid ${statusCounts.Online > 0 ? '#a7f3d0' : '#cbd5e1'}`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}>
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: statusCounts.Online > 0 ? '#10b981' : '#94a3b8'
            }} />
            {statusCounts.Online} Active Online
          </span>

          {/* Force Logout All Others if multiple live sessions */}
          {statusCounts.Online > 1 && (
            <button
              type="button"
              disabled={revokingAll}
              onClick={handleForceLogoutAllOthers}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: revokingAll ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <LogOut size={14} />
              {revokingAll ? 'Revoking...' : 'Log Out My Other Sessions'}
            </button>
          )}

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => fetchSessions(true)}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {successMsg && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          backgroundColor: '#ecfdf5',
          border: '1px solid #a7f3d0',
          color: '#059669',
          fontSize: '0.82rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {loadError && <div role="alert" style={{ padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#b91c1c' }}>Could not load sessions: {loadError}</div>}

      {/* Filter Tabs & Search Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--bg-surface)',
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        border: '1px solid var(--border-light)'
      }}>
        {/* Status Filter Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
          {[
            { id: 'All', label: 'All Sessions', count: statusCounts.All },
            { id: 'Online', label: '🟢 Online', count: statusCounts.Online },
            { id: 'Away', label: '🟡 Away', count: statusCounts.Away },
            { id: 'Offline', label: '⚪ Offline', count: statusCounts.Offline }
          ].map(tab => {
            const isSelected = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '20px',
                  border: isSelected ? '1px solid var(--primary-color, #2563eb)' : '1px solid var(--border-light)',
                  backgroundColor: isSelected ? 'var(--primary-color, #2563eb)' : 'var(--bg-primary, #f8fafc)',
                  color: isSelected ? '#ffffff' : 'var(--text-primary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{tab.label}</span>
                <span style={{
                  fontSize: '0.7rem',
                  backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--border-light)',
                  color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                  padding: '0.05rem 0.45rem',
                  borderRadius: '10px'
                }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by user, email, IP address, device..."
            style={{
              width: '100%',
              padding: '0.45rem 0.75rem 0.45rem 2.1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-primary, #f8fafc)',
              color: 'var(--text-primary)',
              fontSize: '0.82rem'
            }}
          />
        </div>
      </div>

      {/* Sessions Table */}
      <div style={{
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-surface)'
      }}>
        <div style={{ overflowX: 'auto', maxHeight: '68vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{
                position: 'sticky',
                top: 0,
                backgroundColor: 'var(--bg-primary, #f1f5f9)',
                borderBottom: '1px solid var(--border-light)',
                zIndex: 2,
                color: 'var(--text-secondary)',
                fontSize: '0.74rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                <th style={{ padding: '0.75rem 1rem', width: '260px' }}>User / Employee</th>
                <th style={{ padding: '0.75rem 1rem', width: '180px' }}>Device & Browser</th>
                <th style={{ padding: '0.75rem 1rem', width: '150px' }}>IP Address</th>
                <th style={{ padding: '0.75rem 1rem', width: '200px' }}>Last Active (IST)</th>
                <th style={{ padding: '0.75rem 1rem', width: '130px', textAlign: 'center' }}>Session Status</th>
                <th style={{ padding: '0.75rem 1rem', width: '130px', textAlign: 'center' }}>Revoke</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <Monitor size={36} style={{ opacity: 0.35 }} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>No sessions found</span>
                      <span style={{ fontSize: '0.78rem' }}>Try switching filter tabs or clearing search query</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSessions.map((s, idx) => {
                  const dev = parseDeviceInfo(s.device);
                  const DevIcon = dev.icon;

                  return (
                    <tr
                      key={s.id || idx}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                        backgroundColor: s.isCurrent 
                          ? 'rgba(16, 185, 129, 0.05)' 
                          : (idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary, rgba(0,0,0,0.01))')
                      }}
                    >
                      {/* User Column */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>{s.emp_name || 'System User'}</span>
                          {s.isCurrent && (
                            <span style={{
                              fontSize: '0.66rem',
                              backgroundColor: '#10b981',
                              color: '#ffffff',
                              padding: '0.1rem 0.45rem',
                              borderRadius: '4px',
                              fontWeight: 700
                            }}>
                              You (Current)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                          {s.email}
                        </div>
                      </td>

                      {/* Device & Browser Column */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                          <DevIcon size={16} style={{ color: 'var(--text-secondary)' }} />
                          <span>{dev.browser} on {dev.os}</span>
                        </div>
                      </td>

                      {/* IP Column */}
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {s.ip_address || 'Logged via Web App'}
                      </td>

                      {/* Last Active Column */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                          {formatISTDateTime(s.last_active)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: s.isLive ? '#059669' : 'var(--text-secondary)', fontWeight: 600, marginTop: '0.15rem' }}>
                          {s.timeAgo}
                        </div>
                      </td>

                      {/* Session Status Column */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.6rem',
                          borderRadius: '12px',
                          backgroundColor: s.statusBg,
                          color: s.statusColor,
                          border: `1px solid ${s.statusBorder}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: s.statusDot }} />
                          {s.statusLabel}
                        </span>
                      </td>

                      {/* Revoke Column */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {s.isCurrent ? (
                          <span style={{ fontSize: '0.74rem', color: '#10b981', fontWeight: 600 }}>
                            Active
                          </span>
                        ) : s.isLive ? (
                          <button
                            type="button"
                            disabled={revokingId === s.id}
                            onClick={() => handleForceLogout(s)}
                            title="Log out user from all sessions"
                            style={{
                              padding: '0.3rem 0.65rem',
                              borderRadius: '6px',
                              border: '1px solid #fecaca',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              cursor: revokingId === s.id ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                          >
                            <LogOut size={13} />
                            {revokingId === s.id ? 'Revoking...' : 'Log Out User'}
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                            {s.status === 'revoked' ? 'Revoked' : 'Expired'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
