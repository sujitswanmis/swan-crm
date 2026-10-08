'use client';

import MobileTableView from '@/components/common/MobileTableView';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Monitor, Smartphone, Laptop, LogOut, RefreshCw, Search, ShieldCheck, 
  AlertCircle, CheckCircle2, Clock, Globe, User, ShieldAlert, Wifi, Filter,
  Calendar, Check, UserCheck, UserX, Coffee, Activity, Zap
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { getEmployeeDailyActivitySummary } from '@/app/actions/sessionSettings';
import { forceLogoutSession } from '@/app/actions/audit';
import useTableColumnResize, { ColumnResizer } from '@/utils/tableColumnResize';

const DEFAULT_ACTIVE_SESSIONS_COL_WIDTHS = {
  user_employee: 250,
  dept_role: 160,
  first_login: 150,
  last_seen: 150,
  active_time: 140,
  live_status: 160,
  device_ip: 170,
  session_action: 130
};

function getTodayDateStr() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function getTodayReadableIST() {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      weekday: 'short'
    }).format(new Date());
  } catch {
    return new Date().toDateString();
  }
}

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
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function ActiveSessionsTab() {
  const todayDateStr = useMemo(() => getTodayDateStr(), []);
  const todayReadableStr = useMemo(() => getTodayReadableIST(), []);

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  // Default filter: 'Present' (Shows only employees who logged in today)
  const [statusFilter, setStatusFilter] = useState('Present'); 
  const [revokingId, setRevokingId] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  // Column resizing hook for Active Sessions Table
  const {
    columnWidths: sessionColWidths,
    isResizing: isSessionResizing,
    handleMouseDown: handleSessionResizeStart,
    handleTouchStart: handleSessionTouchStart,
    handleDoubleClickReset: handleSessionReset,
    getTableTotalWidth: getSessionTotalWidth
  } = useTableColumnResize(DEFAULT_ACTIVE_SESSIONS_COL_WIDTHS, 'active_sessions_tab_col_widths');

  // Fetch current user email
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

  // Fetch strictly today's employee shift & active session summary (1 row per employee)
  const fetchActivitySummary = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await getEmployeeDailyActivitySummary(todayDateStr, todayDateStr);
      if (res && res.success) {
        setEmployees(res.employees || []);
      } else {
        setEmployees([]);
      }
    } catch (err) {
      console.error('Error fetching employee activity summary:', err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [todayDateStr]);

  // Periodic poll every 25 seconds for live status
  useEffect(() => {
    fetchActivitySummary(true);
    const interval = setInterval(() => {
      fetchActivitySummary(false);
    }, 25000);
    return () => clearInterval(interval);
  }, [fetchActivitySummary]);

  // Evaluate each unique employee
  const evaluatedEmployees = useMemo(() => {
    return (employees || []).map(emp => {
      const isOnline = emp.liveStatus === 'working';
      const isAway = emp.liveStatus === 'away';
      const isOnBreak = emp.liveStatus === 'on_break';
      const isLive = isOnline || isAway || isOnBreak;
      const isCurrent = Boolean(
        currentUserEmail && 
        emp.email && 
        emp.email.toLowerCase() === currentUserEmail
      );

      let statusBadge = {
        label: 'Not Logged In',
        color: '#64748b',
        bg: '#f1f5f9',
        border: '#cbd5e1',
        dot: '#94a3b8'
      };

      if (isOnline) {
        statusBadge = {
          label: 'Online (Working)',
          color: '#059669',
          bg: '#ecfdf5',
          border: '#a7f3d0',
          dot: '#10b981'
        };
      } else if (isOnBreak) {
        statusBadge = {
          label: `On ${emp.currentBreak?.type || 'Break'}`,
          color: '#ea580c',
          bg: '#fff7ed',
          border: '#fed7aa',
          dot: '#f97316'
        };
      } else if (isAway) {
        statusBadge = {
          label: 'Away / Idle',
          color: '#d97706',
          bg: '#fffbeb',
          border: '#fde68a',
          dot: '#f59e0b'
        };
      } else if (emp.hasActivityToday) {
        statusBadge = {
          label: 'Logged Out',
          color: '#475569',
          bg: '#f8fafc',
          border: '#e2e8f0',
          dot: '#64748b'
        };
      }

      return {
        ...emp,
        isOnline,
        isAway,
        isOnBreak,
        isLive,
        isCurrent,
        statusBadge,
        lastSeenTimeAgo: formatTimeAgo(emp.lastSeen)
      };
    });
  }, [employees, currentUserEmail]);

  // Status counts
  const counts = useMemo(() => {
    const c = { All: evaluatedEmployees.length, Online: 0, Present: 0, LoggedOut: 0, Absent: 0 };
    evaluatedEmployees.forEach(e => {
      if (e.isLive) c.Online++;
      if (e.hasActivityToday) {
        c.Present++;
        if (!e.isLive) c.LoggedOut++;
      } else {
        c.Absent++;
      }
    });
    return c;
  }, [evaluatedEmployees]);

  // Automatically adjust default filter to 'All' if nobody is logged in yet today
  useEffect(() => {
    if (counts.Present === 0 && counts.All > 0 && statusFilter === 'Present') {
      setStatusFilter('All');
    }
  }, [counts.Present, counts.All]);

  // Filtered list
  const filteredEmployees = useMemo(() => {
    let list = evaluatedEmployees;

    if (statusFilter === 'Online') {
      list = list.filter(e => e.isLive);
    } else if (statusFilter === 'Present') {
      list = list.filter(e => e.hasActivityToday);
    } else if (statusFilter === 'LoggedOut') {
      list = list.filter(e => e.hasActivityToday && !e.isLive);
    } else if (statusFilter === 'Absent') {
      list = list.filter(e => !e.hasActivityToday);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(e => {
        const name = (e.empName || '').toLowerCase();
        const code = (e.empId || '').toLowerCase();
        const email = (e.email || '').toLowerCase();
        const dept = (e.department || '').toLowerCase();
        const desig = (e.designation || '').toLowerCase();
        return name.includes(q) || code.includes(q) || email.includes(q) || dept.includes(q) || desig.includes(q);
      });
    }

    // Sort: Online users first, then present users, then others
    return [...list].sort((a, b) => {
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      if (a.hasActivityToday && !b.hasActivityToday) return -1;
      if (!a.hasActivityToday && b.hasActivityToday) return 1;
      return (a.empName || '').localeCompare(b.empName || '');
    });
  }, [evaluatedEmployees, statusFilter, searchQuery]);

  // Force single session termination
  const handleForceLogout = async (emp) => {
    const targetName = emp.empName || emp.email || 'this employee';
    if (!window.confirm(`Are you sure you want to terminate the active session for ${targetName}? They will be immediately logged out.`)) {
      return;
    }

    const sessionId = emp.sessionId || emp.userId;
    setRevokingId(emp.userId);
    try {
      const res = await forceLogoutSession(sessionId);
      if (res && res.success) {
        setSuccessMsg(`Session for ${targetName} terminated.`);
        setTimeout(() => setSuccessMsg(''), 3500);
        fetchActivitySummary(false);
      } else {
        alert(res?.error || 'Failed to terminate session');
      }
    } catch (err) {
      alert('Error terminating session: ' + err.message);
    } finally {
      setRevokingId(null);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Monitor size={22} style={{ color: '#059669' }} />
              Active User Sessions & Daily Login Monitor
            </h3>
            {/* Today IST Badge */}
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.25rem 0.65rem',
              borderRadius: '6px',
              backgroundColor: '#eff6ff',
              color: '#2563eb',
              border: '1px solid #bfdbfe',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}>
              <Calendar size={13} />
              Today: {todayReadableStr} (IST)
            </span>
          </div>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Strictly one row per employee today: First Check-in (In-Time), Last Active Seen (Out-Time), Work Duration & Live Online Status.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          {/* Live Online Count Badge */}
          <span style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            padding: '0.35rem 0.85rem',
            borderRadius: '20px',
            backgroundColor: counts.Online > 0 ? '#ecfdf5' : '#f1f5f9',
            color: counts.Online > 0 ? '#059669' : '#64748b',
            border: `1px solid ${counts.Online > 0 ? '#a7f3d0' : '#cbd5e1'}`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: counts.Online > 0 ? '#10b981' : '#94a3b8',
              boxShadow: counts.Online > 0 ? '0 0 0 2px rgba(16, 185, 129, 0.2)' : 'none'
            }} />
            {counts.Online} Online Now
          </span>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => fetchActivitySummary(true)}
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

      {/* Quick Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '0.85rem'
      }}>
        {/* Online Now */}
        <div style={{
          padding: '0.85rem 1.15rem',
          borderRadius: '10px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            backgroundColor: '#ecfdf5',
            color: '#059669',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Zap size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Online Working</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>{counts.Online}</div>
          </div>
        </div>

        {/* Present Today */}
        <div style={{
          padding: '0.85rem 1.15rem',
          borderRadius: '10px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            backgroundColor: '#eff6ff',
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <UserCheck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Logged In Today</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb' }}>{counts.Present}</div>
          </div>
        </div>

        {/* Logged Out */}
        <div style={{
          padding: '0.85rem 1.15rem',
          borderRadius: '10px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            backgroundColor: '#f8fafc',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Clock size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Shift Ended / Out</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#475569' }}>{counts.LoggedOut}</div>
          </div>
        </div>

        {/* Not Logged In */}
        <div style={{
          padding: '0.85rem 1.15rem',
          borderRadius: '10px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <UserX size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Not Logged In Yet</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#dc2626' }}>{counts.Absent}</div>
          </div>
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
            { id: 'Present', label: '👥 Logged In Today', count: counts.Present },
            { id: 'Online', label: '🟢 Online Now', count: counts.Online },
            { id: 'LoggedOut', label: '⚪ Logged Out', count: counts.LoggedOut },
            { id: 'Absent', label: '🔴 Not Logged In', count: counts.Absent },
            { id: 'All', label: 'All Employees', count: counts.All }
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
            placeholder="Search by name, employee code, email, department..."
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

      {/* Main Single-Row Per Employee Table */}
      <div style={{
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-surface)'
      }}>
        <div style={{ overflowX: 'auto', maxHeight: '68vh' }}>
          <MobileTableView id="UserManagement/tabs/ActiveSessionsTab-1"><table style={{ width: `${getSessionTotalWidth()}px`, tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
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
                <th style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.8rem 1rem', width: `${sessionColWidths.user_employee}px`, backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Employee / User</div>
                  <ColumnResizer columnKey="user_employee" isResizing={isSessionResizing('user_employee')} onMouseDown={(e) => handleSessionResizeStart('user_employee', e)} onTouchStart={(e) => handleSessionTouchStart('user_employee', e)} onDoubleClick={() => handleSessionReset('user_employee')} />
                </th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.8rem 1rem', width: `${sessionColWidths.dept_role}px`, backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Department & Role</div>
                  <ColumnResizer columnKey="dept_role" isResizing={isSessionResizing('dept_role')} onMouseDown={(e) => handleSessionResizeStart('dept_role', e)} onTouchStart={(e) => handleSessionTouchStart('dept_role', e)} onDoubleClick={() => handleSessionReset('dept_role')} />
                </th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.8rem 1rem', width: `${sessionColWidths.first_login}px`, backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>First Login (In-Time)</div>
                  <ColumnResizer columnKey="first_login" isResizing={isSessionResizing('first_login')} onMouseDown={(e) => handleSessionResizeStart('first_login', e)} onTouchStart={(e) => handleSessionTouchStart('first_login', e)} onDoubleClick={() => handleSessionReset('first_login')} />
                </th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.8rem 1rem', width: `${sessionColWidths.last_seen}px`, backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Last Seen (Out-Time)</div>
                  <ColumnResizer columnKey="last_seen" isResizing={isSessionResizing('last_seen')} onMouseDown={(e) => handleSessionResizeStart('last_seen', e)} onTouchStart={(e) => handleSessionTouchStart('last_seen', e)} onDoubleClick={() => handleSessionReset('last_seen')} />
                </th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.8rem 1rem', width: `${sessionColWidths.active_time}px`, backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Active Work Time</div>
                  <ColumnResizer columnKey="active_time" isResizing={isSessionResizing('active_time')} onMouseDown={(e) => handleSessionResizeStart('active_time', e)} onTouchStart={(e) => handleSessionTouchStart('active_time', e)} onDoubleClick={() => handleSessionReset('active_time')} />
                </th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.8rem 1rem', width: `${sessionColWidths.live_status}px`, textAlign: 'center', backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Live Status</div>
                  <ColumnResizer columnKey="live_status" isResizing={isSessionResizing('live_status')} onMouseDown={(e) => handleSessionResizeStart('live_status', e)} onTouchStart={(e) => handleSessionTouchStart('live_status', e)} onDoubleClick={() => handleSessionReset('live_status')} />
                </th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.8rem 1rem', width: `${sessionColWidths.device_ip}px`, backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Device & IP</div>
                  <ColumnResizer columnKey="device_ip" isResizing={isSessionResizing('device_ip')} onMouseDown={(e) => handleSessionResizeStart('device_ip', e)} onTouchStart={(e) => handleSessionTouchStart('device_ip', e)} onDoubleClick={() => handleSessionReset('device_ip')} />
                </th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, padding: '0.8rem 1rem', width: `${sessionColWidths.session_action}px`, textAlign: 'center', backgroundColor: 'var(--bg-primary, #f1f5f9)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Session Action</div>
                  <ColumnResizer columnKey="session_action" isResizing={isSessionResizing('session_action')} onMouseDown={(e) => handleSessionResizeStart('session_action', e)} onTouchStart={(e) => handleSessionTouchStart('session_action', e)} onDoubleClick={() => handleSessionReset('session_action')} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <Monitor size={36} style={{ opacity: 0.35 }} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        {statusFilter === 'Present' 
                          ? 'No employee logins recorded today yet' 
                          : statusFilter === 'Online'
                          ? 'No employees are actively online right now'
                          : 'No matching employee records found'}
                      </span>
                      <span style={{ fontSize: '0.78rem' }}>
                        {statusFilter !== 'All' ? (
                          <button
                            type="button"
                            onClick={() => setStatusFilter('All')}
                            style={{
                              marginTop: '0.5rem',
                              padding: '0.35rem 0.75rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-light)',
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--primary-color, #2563eb)',
                              fontWeight: 600,
                              fontSize: '0.78rem',
                              cursor: 'pointer'
                            }}
                          >
                            View All {counts.All} Employees
                          </button>
                        ) : 'Try clearing your search query'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp, idx) => {
                  const dev = parseDeviceInfo(emp.device);
                  const DevIcon = dev.icon;
                  const initials = (emp.empName || emp.email || 'E').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

                  return (
                    <tr
                      key={emp.userId || emp.email || idx}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                        backgroundColor: emp.isCurrent 
                          ? 'rgba(16, 185, 129, 0.05)' 
                          : (idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary, rgba(0,0,0,0.01))')
                      }}
                    >
                      {/* Employee Column */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            backgroundColor: emp.isLive ? '#dcfce7' : (emp.hasActivityToday ? '#f1f5f9' : '#f8fafc'),
                            color: emp.isLive ? '#15803d' : '#475569',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            border: emp.isLive ? '1.5px solid #86efac' : '1px solid var(--border-light)'
                          }}>
                            {initials}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}>
                              <span>{emp.empName}</span>
                              {emp.isCurrent && (
                                <span style={{
                                  fontSize: '0.65rem',
                                  backgroundColor: '#10b981',
                                  color: '#ffffff',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: '4px',
                                  fontWeight: 700
                                }}>
                                  You
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem', whiteSpace: 'normal', wordBreak: 'break-all', lineHeight: 1.3 }}>
                              {emp.empId ? <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>#{emp.empId} • </span> : null}
                              <span>{emp.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Department & Role */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}>
                          {emp.department || 'General'}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.15rem', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}>
                          {emp.designation || 'Staff'}
                        </div>
                      </td>

                      {/* First Login (In-Time / Check-In) */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {emp.hasActivityToday && emp.firstSeenFormatted && emp.firstSeenFormatted !== '--:--' ? (
                          <div>
                            <div style={{ fontWeight: 700, color: '#16a34a', fontSize: '0.88rem' }}>
                              {emp.firstSeenFormatted}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#16a34a', opacity: 0.85, fontWeight: 500, marginTop: '0.1rem' }}>
                              First Check-in
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.78rem' }}>
                            Not Logged In
                          </span>
                        )}
                      </td>

                      {/* Last Seen (Out-Time / Last Active) */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {emp.hasActivityToday && emp.lastSeenFormatted && emp.lastSeenFormatted !== '--:--' ? (
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                              {emp.lastSeenFormatted}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: emp.isLive ? '#059669' : 'var(--text-secondary)', fontWeight: 600, marginTop: '0.1rem' }}>
                              {emp.lastSeenTimeAgo}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>--:--</span>
                        )}
                      </td>

                      {/* Active Work Time */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {emp.hasActivityToday ? (
                          <div>
                            <div style={{ fontWeight: 800, fontFamily: 'monospace', color: emp.isTargetMet ? '#16a34a' : 'var(--text-primary)', fontSize: '0.9rem' }}>
                              {emp.activeDurationFormatted}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                              Span: {emp.shiftSpanFormatted || emp.totalDurationFormatted}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>0h 00m</span>
                        )}
                      </td>

                      {/* Live Status */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          padding: '0.25rem 0.65rem',
                          borderRadius: '12px',
                          backgroundColor: emp.statusBadge.bg,
                          color: emp.statusBadge.color,
                          border: `1px solid ${emp.statusBadge.border}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: emp.statusBadge.dot }} />
                          {emp.statusBadge.label}
                        </span>
                      </td>

                      {/* Device & IP */}
                      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}>
                          <DevIcon size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.78rem' }}>{dev.browser} on {dev.os}</span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem', whiteSpace: 'normal', wordBreak: 'break-all', lineHeight: 1.3 }}>
                          {emp.ipAddress || 'Logged via Web App'}
                        </div>
                      </td>

                      {/* Session Action */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {emp.isCurrent ? (
                          <span style={{ fontSize: '0.74rem', color: '#10b981', fontWeight: 600 }}>
                            Active (You)
                          </span>
                        ) : emp.isLive ? (
                          <button
                            type="button"
                            disabled={revokingId === emp.userId}
                            onClick={() => handleForceLogout(emp)}
                            title="Force Logout Session"
                            style={{
                              padding: '0.3rem 0.65rem',
                              borderRadius: '6px',
                              border: '1px solid #fecaca',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              cursor: revokingId === emp.userId ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                          >
                            <LogOut size={13} />
                            {revokingId === emp.userId ? 'Revoking...' : 'Force Logout'}
                          </button>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>--</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table></MobileTableView>
        </div>
      </div>
    </div>
  );
}
