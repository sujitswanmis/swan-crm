'use client';

import React, { useState, useEffect } from 'react';
import { 
  Monitor, Smartphone, Laptop, LogOut, RefreshCw, Search, ShieldCheck, 
  AlertCircle, CheckCircle2, Clock, Globe, User, ShieldAlert 
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { forceLogoutSession } from '@/app/actions/audit';
import { formatISTDateTime } from '../utils/userManagementUtils';

function parseDeviceInfo(deviceStr = '') {
  if (!deviceStr) return { os: 'Unknown OS', browser: 'Browser', icon: Globe };
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

export default function ActiveSessionsTab() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [revokingId, setRevokingId] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .order('last_active', { ascending: false })
        .limit(100);

      if (error) throw error;
      setSessions(data || []);
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleForceLogout = async (session) => {
    const userName = session.emp_name || session.email || 'this user';
    if (!window.confirm(`Are you sure you want to terminate the active session for ${userName}? They will be immediately logged out.`)) {
      return;
    }

    setRevokingId(session.id);
    try {
      const res = await forceLogoutSession(session.id);
      if (res && res.success) {
        setSuccessMsg(`Session for ${userName} terminated successfully.`);
        setTimeout(() => setSuccessMsg(''), 3000);
        fetchSessions();
      } else {
        alert(res?.error || 'Failed to terminate session');
      }
    } catch (err) {
      alert('Error terminating session: ' + err.message);
    } finally {
      setRevokingId(null);
    }
  };

  const filteredSessions = sessions.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const name = (s.emp_name || '').toLowerCase();
    const email = (s.email || '').toLowerCase();
    const ip = (s.ip_address || '').toLowerCase();
    const dev = (s.device || '').toLowerCase();
    return name.includes(q) || email.includes(q) || ip.includes(q) || dev.includes(q);
  });

  const activeCount = sessions.filter(s => s.is_active !== false).length;

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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            fontSize: '0.76rem',
            fontWeight: 700,
            padding: '0.25rem 0.65rem',
            borderRadius: '12px',
            backgroundColor: '#ecfdf5',
            color: '#059669',
            border: '1px solid #a7f3d0'
          }}>
            {activeCount} Active Online
          </span>

          <button
            type="button"
            onClick={fetchSessions}
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

      {/* Search Input */}
      <div style={{
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-light)'
      }}>
        <div style={{ position: 'relative' }}>
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
                <th style={{ padding: '0.75rem 1rem' }}>User / Employee</th>
                <th style={{ padding: '0.75rem 1rem' }}>Device & Browser</th>
                <th style={{ padding: '0.75rem 1rem' }}>IP Address</th>
                <th style={{ padding: '0.75rem 1rem' }}>Last Active (IST)</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Session Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Revoke</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <Monitor size={36} style={{ opacity: 0.35 }} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>No active sessions found</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSessions.map((s, idx) => {
                  const dev = parseDeviceInfo(s.device);
                  const DevIcon = dev.icon;
                  const isActive = s.is_active !== false;

                  return (
                    <tr
                      key={s.id || idx}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                        backgroundColor: idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary, rgba(0,0,0,0.01))'
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {s.emp_name || 'System User'}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          {s.email}
                        </div>
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                          <DevIcon size={16} style={{ color: 'var(--text-secondary)' }} />
                          <span>{dev.browser} on {dev.os}</span>
                        </div>
                      </td>

                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {s.ip_address || '127.0.0.1'}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {formatISTDateTime(s.last_active)}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.55rem',
                          borderRadius: '10px',
                          backgroundColor: isActive ? '#ecfdf5' : '#f1f5f9',
                          color: isActive ? '#059669' : '#64748b',
                          border: `1px solid ${isActive ? '#a7f3d0' : '#cbd5e1'}`
                        }}>
                          {isActive ? '● Online' : 'Expired'}
                        </span>
                      </td>

                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          disabled={revokingId === s.id || !isActive}
                          onClick={() => handleForceLogout(s)}
                          title="Force Logout Session"
                          style={{
                            padding: '0.3rem 0.65rem',
                            borderRadius: '6px',
                            border: '1px solid #fecaca',
                            backgroundColor: '#fef2f2',
                            color: '#dc2626',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            cursor: (!isActive || revokingId === s.id) ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            opacity: (!isActive || revokingId === s.id) ? 0.5 : 1
                          }}
                        >
                          <LogOut size={13} />
                          Force Logout
                        </button>
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
