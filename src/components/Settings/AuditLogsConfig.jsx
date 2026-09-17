'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Clock, Search, Calendar, RefreshCw, Download, Filter, 
  Activity, Users, AlertTriangle, ShieldCheck, Layers, Eye, 
  ChevronLeft, ChevronRight, X, User, ArrowUpDown, ChevronDown, Check, UserCheck,
  Moon, Sun
} from 'lucide-react';
import { getAuditLogs, getAuditLogFilters } from '@/app/actions/audit';
import DateRangePicker from '@/components/common/DateRangePicker';

const DEFAULT_COLUMNS = [
  { key: 'user', label: 'USER / EMPLOYEE', defaultWidth: 230, minWidth: 160 },
  { key: 'module', label: 'MODULE', defaultWidth: 140, minWidth: 100 },
  { key: 'action', label: 'ACTION', defaultWidth: 150, minWidth: 110 },
  { key: 'target', label: 'TARGET / ACTIVITY DETAILS', defaultWidth: 360, minWidth: 220 },
  { key: 'source', label: 'SOURCE / IP', defaultWidth: 140, minWidth: 100 },
  { key: 'timestamp', label: 'TIMESTAMP', defaultWidth: 210, minWidth: 160 },
  { key: 'view', label: 'VIEW', defaultWidth: 70, minWidth: 60, align: 'center' }
];

export default function AuditLogsConfig() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    totalEvents: 0,
    todayEvents: 0,
    deleteEvents: 0,
    uniqueUsers: 0,
    offHoursEvents: 0,
    nightEvents: 0
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filter options from backend
  const [userOptions, setUserOptions] = useState([]);

  // Active Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState('all'); // 'all' | 'off_hours' | 'day' | 'night' | 'custom'
  const [customTimeFrom, setCustomTimeFrom] = useState('19:00');
  const [customTimeTo, setCustomTimeTo] = useState('09:00');
  const [dateRangeQuick, setDateRangeQuick] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Searchable Employee Dropdown state
  const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState(false);
  const [employeeSearchInput, setEmployeeSearchInput] = useState('');
  const employeeDropdownRef = useRef(null);

  // Resizable columns state
  const [colWidths, setColWidths] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('audit_table_col_widths');
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      user: 230,
      module: 140,
      action: 150,
      target: 360,
      source: 140,
      timestamp: 210,
      view: 70
    };
  });
  const [resizingCol, setResizingCol] = useState(null);

  const handleMouseDownResize = (colKey, currentWidth, e) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(colKey);

    const startX = e.clientX;
    const colDef = DEFAULT_COLUMNS.find(c => c.key === colKey);
    const minW = colDef?.minWidth || 80;

    const onMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(minW, currentWidth + deltaX);
      setColWidths(prev => {
        const updated = { ...prev, [colKey]: newWidth };
        try {
          localStorage.setItem('audit_table_col_widths', JSON.stringify(updated));
        } catch (err) {}
        return updated;
      });
    };

    const onMouseUp = () => {
      setResizingCol(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleTouchStartResize = (colKey, currentWidth, e) => {
    const touch = e.touches[0];
    if (!touch) return;
    setResizingCol(colKey);
    const startX = touch.clientX;
    const colDef = DEFAULT_COLUMNS.find(c => c.key === colKey);
    const minW = colDef?.minWidth || 80;

    const onTouchMove = (moveEvent) => {
      const currentTouch = moveEvent.touches[0];
      if (!currentTouch) return;
      const deltaX = currentTouch.clientX - startX;
      const newWidth = Math.max(minW, currentWidth + deltaX);
      setColWidths(prev => {
        const updated = { ...prev, [colKey]: newWidth };
        try {
          localStorage.setItem('audit_table_col_widths', JSON.stringify(updated));
        } catch (err) {}
        return updated;
      });
    };

    const onTouchEnd = () => {
      setResizingCol(null);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);
  };

  const handleResetColWidth = (colKey) => {
    const colDef = DEFAULT_COLUMNS.find(c => c.key === colKey);
    if (!colDef) return;
    setColWidths(prev => {
      const updated = { ...prev, [colKey]: colDef.defaultWidth };
      try {
        localStorage.setItem('audit_table_col_widths', JSON.stringify(updated));
      } catch (err) {}
      return updated;
    });
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Selected Log for detail modal
  const [selectedLogDetail, setSelectedLogDetail] = useState(null);

  // Close employee dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(event.target)) {
        setIsEmployeeDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load Filter metadata (Approved Users list)
  useEffect(() => {
    async function loadFilters() {
      const res = await getAuditLogFilters();
      if (res.success && res.users) {
        setUserOptions(res.users);
      }
    }
    loadFilters();
  }, []);

  // Quick Date Range Handler
  const handleQuickDate = (type) => {
    setDateRangeQuick(type);
    const today = new Date();
    const formatDate = (d) => d.toISOString().split('T')[0];

    if (type === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (type === 'today') {
      setDateFrom(formatDate(today));
      setDateTo(formatDate(today));
    } else if (type === 'yesterday') {
      const y = new Date();
      y.setDate(today.getDate() - 1);
      setDateFrom(formatDate(y));
      setDateTo(formatDate(y));
    } else if (type === '7days') {
      const past = new Date();
      past.setDate(today.getDate() - 7);
      setDateFrom(formatDate(past));
      setDateTo(formatDate(today));
    } else if (type === '30days') {
      const past = new Date();
      past.setDate(today.getDate() - 30);
      setDateFrom(formatDate(past));
      setDateTo(formatDate(today));
    }
    setCurrentPage(1);
  };

  // Main Data Fetcher
  const fetchLogs = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await getAuditLogs({
        page: currentPage,
        pageSize,
        search: searchQuery,
        dateFrom,
        dateTo,
        module: selectedModule,
        actionType: selectedAction,
        userId: selectedUser,
        timeOfDay: selectedTimeOfDay,
        customTimeFrom,
        customTimeTo
      });

      if (res.success) {
        setLogs(res.logs || []);
        setTotalCount(res.totalCount || 0);
        if (res.stats) {
          setStats({
            totalEvents: res.stats.totalEvents || 0,
            todayEvents: res.stats.todayEvents || 0,
            deleteEvents: res.stats.deleteEvents || 0,
            uniqueUsers: res.stats.uniqueUsers || 0,
            offHoursEvents: res.stats.offHoursEvents || 0,
            nightEvents: res.stats.nightEvents || 0
          });
        }
      } else {
        throw new Error(res.error || 'Failed to fetch audit logs');
      }
    } catch (err) {
      console.error('Audit Log Fetch Error:', err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage, pageSize, searchQuery, dateFrom, dateTo, selectedModule, selectedAction, selectedUser, selectedTimeOfDay, customTimeFrom, customTimeTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset Filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedModule('all');
    setSelectedAction('all');
    setSelectedUser('all');
    setSelectedTimeOfDay('all');
    setCustomTimeFrom('19:00');
    setCustomTimeTo('09:00');
    setEmployeeSearchInput('');
    setIsEmployeeDropdownOpen(false);
    setDateRangeQuick('all');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!logs || logs.length === 0) {
      alert('No logs available to export for the current filters.');
      return;
    }

    const headers = ['Timestamp', 'Employee Name', 'Email', 'Module', 'Action', 'Target / Details', 'IP / Source'];
    const rows = logs.map(l => [
      `"${l.time || ''}"`,
      `"${(l.user || '').replace(/"/g, '""')}"`,
      `"${(l.email || '').replace(/"/g, '""')}"`,
      `"${(l.module || '').replace(/"/g, '""')}"`,
      `"${(l.action || '').replace(/"/g, '""')}"`,
      `"${(l.target || '').replace(/"/g, '""')}"`,
      `"${(l.ip || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format action badge style
  const getActionBadgeStyle = (action = '') => {
    const act = action.toLowerCase();
    if (act.includes('delete') || act.includes('revoke') || act.includes('terminate')) {
      return { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' };
    }
    if (act.includes('create') || act.includes('add') || act.includes('register') || act.includes('insert')) {
      return { background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' };
    }
    if (act.includes('update') || act.includes('edit') || act.includes('assign') || act.includes('change') || act.includes('stage')) {
      return { background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' };
    }
    if (act.includes('export') || act.includes('import') || act.includes('download')) {
      return { background: '#f3e8ff', color: '#7e22ce', border: '1px solid #e9d5ff' };
    }
    if (act.includes('login') || act.includes('logout') || act.includes('auth') || act.includes('password')) {
      return { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' };
    }
    return { background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' };
  };

  // Format module badge style
  const getModuleBadgeStyle = (module = '') => {
    const mod = module.toLowerCase();
    if (mod.includes('lead')) return { background: '#e0e7ff', color: '#4338ca' };
    if (mod.includes('team')) return { background: '#fce7f3', color: '#be185d' };
    if (mod.includes('settings')) return { background: '#ffedd5', color: '#c2410c' };
    if (mod.includes('auth')) return { background: '#fef9c3', color: '#a16207' };
    if (mod.includes('report') || mod.includes('data')) return { background: '#ccfbf1', color: '#0f766e' };
    if (mod.includes('messag')) return { background: '#d1fae5', color: '#047857' };
    if (mod.includes('call')) return { background: '#e0f2fe', color: '#0284c7' };
    return { background: 'var(--th-filtered-bg)', color: 'var(--text-secondary)' };
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div style={{ padding: '1.5rem', width: '100%', boxSizing: 'border-box' }}>
      
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.4rem' }}>
            <Clock size={26} color="var(--accent-color)" />
            Activity Audit Logs
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            Track, audit, and monitor all enterprise activities, user modifications, pipeline transitions, and security events.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => fetchLogs(true)}
            disabled={loading || refreshing}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.6rem 1rem', background: 'var(--bg-surface)',
              border: '1px solid var(--border-light)', borderRadius: '8px',
              color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem',
              fontWeight: 500, transition: 'all 0.2s'
            }}
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh Logs'}
          </button>

          <button
            onClick={handleExportCSV}
            disabled={logs.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.6rem 1.1rem', background: 'var(--accent-color)',
              border: 'none', borderRadius: '8px',
              color: 'white', cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem', fontWeight: 600, opacity: logs.length === 0 ? 0.6 : 1
            }}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        
        {/* Total System Events */}
        <div 
          onClick={handleResetFilters}
          style={{ 
            background: 'var(--bg-surface)', 
            padding: '1rem 1.25rem', 
            borderRadius: '10px', 
            border: '1px solid var(--border-light)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '1rem',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          title="Click to view all enterprise system logs (reset filters)"
        >
          <div style={{ background: '#e0e7ff', padding: '0.75rem', borderRadius: '10px', color: '#4f46e5' }}>
            <Activity size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Total System Events</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.totalEvents.toLocaleString()}</div>
          </div>
        </div>

        {/* Activities Today */}
        <div 
          onClick={() => {
            const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
            if (dateRangeQuick === 'today') {
              setDateRangeQuick('all');
              setDateFrom('');
              setDateTo('');
            } else {
              setDateRangeQuick('today');
              setDateFrom(todayStr);
              setDateTo(todayStr);
            }
            setCurrentPage(1);
          }}
          style={{ 
            background: dateRangeQuick === 'today' ? '#f0fdf4' : 'var(--bg-surface)', 
            padding: '1rem 1.25rem', 
            borderRadius: '10px', 
            border: dateRangeQuick === 'today' ? '2px solid #16a34a' : '1px solid var(--border-light)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '1rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: dateRangeQuick === 'today' ? '0 4px 12px rgba(22, 163, 74, 0.15)' : 'none'
          }}
          title="Click to quickly filter Today's events in IST"
        >
          <div style={{ background: '#dcfce7', padding: '0.75rem', borderRadius: '10px', color: '#16a34a' }}>
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>Activities Today</span>
              {dateRangeQuick === 'today' && <span style={{ fontSize: '0.65rem', background: '#16a34a', color: 'white', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>FILTERED</span>}
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#16a34a' }}>{stats.todayEvents.toLocaleString()}</div>
          </div>
        </div>

        {/* 🌙 Off-Hours & Night Shift Events Quick KPI */}
        <div 
          onClick={() => {
            setSelectedTimeOfDay(prev => prev === 'off_hours' ? 'all' : 'off_hours');
            setCurrentPage(1);
          }}
          style={{ 
            background: selectedTimeOfDay === 'off_hours' || selectedTimeOfDay === 'night' ? '#f5f3ff' : 'var(--bg-surface)', 
            padding: '1rem 1.25rem', 
            borderRadius: '10px', 
            border: selectedTimeOfDay === 'off_hours' || selectedTimeOfDay === 'night' ? '2px solid #7c3aed' : '1px solid var(--border-light)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '1rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: selectedTimeOfDay === 'off_hours' || selectedTimeOfDay === 'night' ? '0 4px 12px rgba(124, 58, 237, 0.15)' : 'none'
          }}
          title="Click to quickly filter Off-Hours activities (≥19:00 to ≤09:00)"
        >
          <div style={{ background: '#ede9fe', padding: '0.75rem', borderRadius: '10px', color: '#7c3aed' }}>
            <Moon size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>Off-Hours / Night</span>
              {(selectedTimeOfDay === 'off_hours' || selectedTimeOfDay === 'night') && <span style={{ fontSize: '0.65rem', background: '#7c3aed', color: 'white', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>FILTERED</span>}
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#7c3aed' }}>{(stats.offHoursEvents || stats.nightEvents || 0).toLocaleString()}</div>
          </div>
        </div>

        {/* Registered Users */}
        <div style={{ background: 'var(--bg-surface)', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: '#e0f2fe', padding: '0.75rem', borderRadius: '10px', color: '#0284c7' }}>
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Registered Users</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.uniqueUsers}</div>
          </div>
        </div>

        {/* Delete / Critical Events */}
        <div 
          onClick={() => {
            setSelectedAction(prev => prev === 'delete' ? 'all' : 'delete');
            setCurrentPage(1);
          }}
          style={{ 
            background: selectedAction === 'delete' ? '#fef2f2' : 'var(--bg-surface)', 
            padding: '1rem 1.25rem', 
            borderRadius: '10px', 
            border: selectedAction === 'delete' ? '2px solid #dc2626' : '1px solid var(--border-light)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '1rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: selectedAction === 'delete' ? '0 4px 12px rgba(220, 38, 38, 0.15)' : 'none'
          }}
          title="Click to quickly filter Delete / Critical events"
        >
          <div style={{ background: '#fee2e2', padding: '0.75rem', borderRadius: '10px', color: '#dc2626' }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>Delete / Critical</span>
              {selectedAction === 'delete' && <span style={{ fontSize: '0.65rem', background: '#dc2626', color: 'white', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>FILTERED</span>}
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#dc2626' }}>{stats.deleteEvents.toLocaleString()}</div>
          </div>
        </div>

      </div>

      {/* Error Message */}
      {error && (
        <div style={{ padding: '1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {/* Filter Toolbar Box */}
      <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        {/* Row 1: Search & Quick Date Presets */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          
          {/* Search Box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-primary)', padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-light)', flex: 1, minWidth: '260px' }}>
            <Search size={18} color="var(--text-secondary)" />
            <input 
              type="text" 
              placeholder="Search action, target description, employee, email or IP..." 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', width: '100%', fontSize: '0.85rem' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)' }}>
                <X size={16} />
              </button>
            )}
          </div>

          {/* Quick Date Presets & Custom Modal */}
          <DateRangePicker
            preset={dateRangeQuick}
            startDate={dateFrom}
            endDate={dateTo}
            allowAllTime={true}
            title="Filter Audit Logs by Date"
            onChange={({ preset, startDate, endDate }) => {
              setDateRangeQuick(preset);
              setDateFrom(startDate);
              setDateTo(endDate);
              setCurrentPage(1);
            }}
          />

        </div>

        {/* Row 2: Dropdowns (Module, Action, User, Time/Shift) + Reset Button */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          
          {/* Module Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Module:</span>
            <select
              value={selectedModule}
              onChange={(e) => {
                setSelectedModule(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '0.45rem 0.75rem',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Modules</option>
              <option value="Leads & CRM">Leads & CRM</option>
              <option value="Team & Access">Team & Access</option>
              <option value="Enterprise Settings">Enterprise Settings</option>
              <option value="Auth & Security">Auth & Security</option>
              <option value="Data & Reports">Data & Reports</option>
              <option value="Messaging">Messaging</option>
              <option value="Call Center">Call Center</option>
            </select>
          </div>

          {/* Action Type Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Action:</span>
            <select
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '0.45rem 0.75rem',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Actions</option>
              <option value="create">Create Events</option>
              <option value="update">Update Events</option>
              <option value="delete">Delete Events</option>
              <option value="assign">Assign Events</option>
              <option value="stage">Stage / Status Changes</option>
              <option value="export">Export / Download</option>
              <option value="login">Login / Logout</option>
              <option value="password">Password / Role Changes</option>
              <option value="config">Settings / Config</option>
            </select>
          </div>

          {/* Time / Shift Filter (Night & Off-Hours Support) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Shift / Hours:</span>
            <select
              value={selectedTimeOfDay}
              onChange={(e) => {
                setSelectedTimeOfDay(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '0.45rem 0.75rem',
                background: selectedTimeOfDay !== 'all' ? '#f5f3ff' : 'var(--bg-primary)',
                border: selectedTimeOfDay !== 'all' ? '1px solid #c4b5fd' : '1px solid var(--border-light)',
                borderRadius: '8px',
                color: selectedTimeOfDay !== 'all' ? '#6d28d9' : 'var(--text-primary)',
                fontWeight: selectedTimeOfDay !== 'all' ? 600 : 400,
                fontSize: '0.8rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">⏱️ All Hours 24</option>
              <option value="off_hours">🌙 Off hours (≥19:00 to ≤09:00)</option>
              <option value="day">☀️ Day Shift (≥09:00 to &lt; 19:00)</option>
              <option value="night">🦉 Night shift (≥20:00 to ≤08:00)</option>
              <option value="custom">⚙️ Add Custom Hours</option>
            </select>

            {selectedTimeOfDay === 'custom' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#f5f3ff', padding: '0.2rem 0.6rem', borderRadius: '8px', border: '1px solid #c4b5fd' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6d28d9' }}>From:</span>
                <input
                  type="time"
                  value={customTimeFrom}
                  onChange={(e) => {
                    setCustomTimeFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '0.2rem 0.35rem',
                    border: '1px solid #c4b5fd',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    background: '#fff',
                    color: '#4c1d95',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6d28d9' }}>To:</span>
                <input
                  type="time"
                  value={customTimeTo}
                  onChange={(e) => {
                    setCustomTimeTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '0.2rem 0.35rem',
                    border: '1px solid #c4b5fd',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    background: '#fff',
                    color: '#4c1d95',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                />
              </div>
            )}
          </div>

          {/* User / Employee Searchable Filter */}
          <div ref={employeeDropdownRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Employee:</span>
            
            <button
              type="button"
              onClick={() => {
                setIsEmployeeDropdownOpen(prev => !prev);
                setEmployeeSearchInput('');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
                padding: '0.45rem 0.75rem',
                background: selectedUser !== 'all' ? 'rgba(79, 70, 229, 0.08)' : 'var(--bg-primary)',
                border: selectedUser !== 'all' ? '1px solid #c7d2fe' : '1px solid var(--border-light)',
                borderRadius: '8px',
                color: selectedUser !== 'all' ? '#4338ca' : 'var(--text-primary)',
                fontSize: '0.8rem',
                fontWeight: selectedUser !== 'all' ? 600 : 400,
                outline: 'none',
                cursor: 'pointer',
                minWidth: '180px',
                maxWidth: '260px',
                textAlign: 'left'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <UserCheck size={14} color={selectedUser !== 'all' ? '#4f46e5' : 'var(--text-secondary)'} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedUser === 'all' 
                    ? 'All Approved Staff' 
                    : (userOptions.find(u => (u.email === selectedUser || u.id === selectedUser || u.user_id === selectedUser))?.emp_name || selectedUser)}
                </span>
              </div>
              <ChevronDown size={14} color="var(--text-secondary)" style={{ transform: isEmployeeDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {/* Dropdown Menu */}
            {isEmployeeDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                zIndex: 50,
                width: '320px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                borderRadius: '10px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                {/* Search Header */}
                <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Search size={14} color="var(--text-secondary)" />
                  <input
                    type="text"
                    placeholder="Search name, code, department..."
                    value={employeeSearchInput}
                    onChange={(e) => setEmployeeSearchInput(e.target.value)}
                    autoFocus
                    style={{
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      fontSize: '0.8rem',
                      width: '100%'
                    }}
                  />
                  {employeeSearchInput && (
                    <button
                      type="button"
                      onClick={() => setEmployeeSearchInput('')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Staff List */}
                <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '0.35rem 0' }}>
                  {/* All Option */}
                  <div
                    onClick={() => {
                      setSelectedUser('all');
                      setIsEmployeeDropdownOpen(false);
                      setCurrentPage(1);
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      color: selectedUser === 'all' ? '#4f46e5' : 'var(--text-primary)',
                      fontWeight: selectedUser === 'all' ? 600 : 400,
                      backgroundColor: selectedUser === 'all' ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => { if (selectedUser !== 'all') e.currentTarget.style.backgroundColor = 'var(--bg-primary)'; }}
                    onMouseLeave={(e) => { if (selectedUser !== 'all') e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <span>All Approved Employees ({userOptions.length})</span>
                    {selectedUser === 'all' && <Check size={14} color="#4f46e5" />}
                  </div>

                  {/* Filtered Users */}
                  {userOptions
                    .filter(u => {
                      if (!employeeSearchInput) return true;
                      const q = employeeSearchInput.toLowerCase();
                      return (
                        (u.emp_name && u.emp_name.toLowerCase().includes(q)) ||
                        (u.email && u.email.toLowerCase().includes(q)) ||
                        (u.emp_id && u.emp_id.toLowerCase().includes(q)) ||
                        (u.department && u.department.toLowerCase().includes(q))
                      );
                    })
                    .map((u, index) => {
                      const userKey = u.email || u.id || u.user_id || String(index);
                      const isSelected = selectedUser === userKey || selectedUser === u.email || selectedUser === u.user_id;

                      return (
                        <div
                          key={userKey}
                          onClick={() => {
                            setSelectedUser(u.email || u.user_id || u.id);
                            setIsEmployeeDropdownOpen(false);
                            setCurrentPage(1);
                          }}
                          style={{
                            padding: '0.5rem 0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            color: isSelected ? '#4f46e5' : 'var(--text-primary)',
                            fontWeight: isSelected ? 600 : 400,
                            backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
                            borderBottom: '1px solid rgba(0,0,0,0.03)',
                            transition: 'background 0.15s'
                          }}
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-primary)'; }}
                          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ fontWeight: 600 }}>{u.emp_name}</span>
                              {u.emp_id && (
                                <span style={{ fontSize: '0.7rem', padding: '0.05rem 0.35rem', background: '#e0e7ff', color: '#4338ca', borderRadius: '4px', fontWeight: 700 }}>
                                  {u.emp_id}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {u.email} {u.department ? `• ${u.department}` : ''}
                            </span>
                          </div>
                          {isSelected && <Check size={15} color="#4f46e5" />}
                        </div>
                      );
                    })}

                  {userOptions.length > 0 && userOptions.filter(u => {
                    if (!employeeSearchInput) return true;
                    const q = employeeSearchInput.toLowerCase();
                    return (
                      (u.emp_name && u.emp_name.toLowerCase().includes(q)) ||
                      (u.email && u.email.toLowerCase().includes(q)) ||
                      (u.emp_id && u.emp_id.toLowerCase().includes(q)) ||
                      (u.department && u.department.toLowerCase().includes(q))
                    );
                  }).length === 0 && (
                    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      No approved employee matches &quot;{employeeSearchInput}&quot;
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Reset Filters */}
          {(searchQuery || selectedModule !== 'all' || selectedAction !== 'all' || selectedUser !== 'all' || selectedTimeOfDay !== 'all' || dateRangeQuick !== 'all' || dateFrom || dateTo) && (
            <button
              onClick={handleResetFilters}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.45rem 0.75rem', background: '#fee2e2',
                color: '#b91c1c', border: '1px solid #fecaca',
                borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem',
                fontWeight: 500
              }}
            >
              <X size={14} />
              Reset Filters
            </button>
          )}

        </div>

      </div>

      {/* Audit Logs Data Table Container */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
        
        {loading && !refreshing ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 1rem auto', color: 'var(--accent-color)' }} />
            <div>Loading audit log records...</div>
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Layers size={36} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No Audit Logs Found</div>
            <div style={{ fontSize: '0.85rem' }}>No activity records match your current filter parameters. Try clearing the search or date filter.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 350px)', position: 'relative' }}>
            <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left', tableLayout: 'fixed' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--th-bg)' }}>
                <tr style={{ color: 'var(--text-secondary)' }}>
                  {DEFAULT_COLUMNS.map((col, idx) => {
                    const width = colWidths[col.key] || col.defaultWidth;
                    return (
                      <th
                        key={col.key}
                        style={{
                          width: `${width}px`,
                          minWidth: `${col.minWidth}px`,
                          maxWidth: `${width}px`,
                          position: 'relative',
                          padding: '0.85rem 1rem',
                          fontWeight: 600,
                          textAlign: col.align || 'left',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          background: 'var(--th-bg)',
                          boxShadow: 'inset 0 -1px 0 var(--border-light), 0 2px 4px rgba(0,0,0,0.03)'
                        }}
                      >
                        <span>{col.label}</span>

                        {/* Draggable Resizer between columns */}
                        {idx < DEFAULT_COLUMNS.length - 1 && (
                          <div
                            onMouseDown={(e) => handleMouseDownResize(col.key, width, e)}
                            onTouchStart={(e) => handleTouchStartResize(col.key, width, e)}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={() => handleResetColWidth(col.key)}
                            className={`column-resizer ${resizingCol === col.key ? 'is-resizing' : ''}`}
                            title="Drag to resize column width | Double-click to reset"
                            style={{
                              position: 'absolute',
                              right: '-6px',
                              top: 0,
                              height: '100%',
                              width: '14px',
                              cursor: 'col-resize',
                              userSelect: 'none',
                              touchAction: 'none',
                              zIndex: 25,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <div 
                              className="resizer-bar"
                              style={{
                                width: resizingCol === col.key ? '4px' : '3px',
                                height: '75%',
                                backgroundColor: resizingCol === col.key ? 'var(--accent-color, #2563eb)' : '#94a3b8',
                                borderRadius: '3px',
                                boxShadow: resizingCol === col.key ? '0 0 6px var(--accent-color)' : '0 1px 2px rgba(0,0,0,0.15)',
                                transition: 'all 0.15s ease'
                              }}
                            />
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const userName = log.user || log.emp_name || (log.email ? log.email.split('@')[0] : 'System User');
                  const actionStyle = getActionBadgeStyle(log.action);
                  const moduleName = log.module || 'Leads & Pipeline';
                  const moduleStyle = getModuleBadgeStyle(moduleName);
                  const initials = userName
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map(p => p[0])
                    .join('')
                    .toUpperCase();
                  const timeDisplay = log.time || (log.created_at ? new Date(log.created_at).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: true
                  }) : '—');
                  const ipDisplay = log.ip || log.ip_address || 'Web App';

                  return (
                    <tr 
                      key={log.id} 
                      style={{ 
                        borderBottom: '1px solid var(--border-light)', 
                        borderLeft: log.isLateNight 
                          ? '4px solid #db2777' 
                          : (log.isNight ? '4px solid #7c3aed' : '4px solid transparent'),
                        backgroundColor: log.isLateNight 
                          ? 'rgba(219, 39, 119, 0.025)' 
                          : (log.isNight ? 'rgba(124, 58, 237, 0.02)' : 'transparent'),
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = log.isLateNight ? 'rgba(219, 39, 119, 0.06)' : (log.isNight ? 'rgba(124, 58, 237, 0.06)' : 'var(--th-filtered-bg)')}
                      onMouseLeave={(e) => e.currentTarget.style.background = log.isLateNight ? 'rgba(219, 39, 119, 0.025)' : (log.isNight ? 'rgba(124, 58, 237, 0.02)' : 'transparent')}
                    >
                      {/* User Column */}
                      <td style={{ width: `${colWidths.user || 230}px`, minWidth: '160px', maxWidth: `${colWidths.user || 230}px`, padding: '0.85rem 1rem', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div style={{ 
                            width: '32px', height: '32px', borderRadius: '50%', 
                            background: log.isLateNight ? '#be185d' : (log.isNight ? '#6d28d9' : 'var(--accent-color)'), color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 
                          }}>
                            {initials || 'U'}
                          </div>
                          <div style={{ minWidth: 0, overflow: 'hidden' }}>
                            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {userName}
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {log.email || '—'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Module Badge */}
                      <td style={{ width: `${colWidths.module || 140}px`, minWidth: '100px', maxWidth: `${colWidths.module || 140}px`, padding: '0.85rem 1rem', overflow: 'hidden' }}>
                        <span style={{ 
                          display: 'inline-block',
                          padding: '0.25rem 0.6rem', 
                          borderRadius: '6px', 
                          fontSize: '0.75rem', 
                          fontWeight: 600,
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          ...moduleStyle
                        }}>
                          {moduleName}
                        </span>
                      </td>

                      {/* Action Badge */}
                      <td style={{ width: `${colWidths.action || 150}px`, minWidth: '110px', maxWidth: `${colWidths.action || 150}px`, padding: '0.85rem 1rem', overflow: 'hidden' }}>
                        <span style={{ 
                          display: 'inline-block',
                          padding: '0.25rem 0.6rem', 
                          borderRadius: '6px', 
                          fontSize: '0.75rem', 
                          fontWeight: 600,
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          ...actionStyle
                        }}>
                          {log.action || 'Activity'}
                        </span>
                      </td>

                      {/* Target / Details */}
                      <td style={{ width: `${colWidths.target || 360}px`, minWidth: '220px', maxWidth: `${colWidths.target || 360}px`, padding: '0.85rem 1rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                        <div style={{ 
                          wordBreak: 'break-word',
                          whiteSpace: 'normal',
                          fontSize: '0.85rem'
                        }}>
                          {log.target || '—'}
                        </div>
                      </td>

                      {/* IP / Source */}
                      <td style={{ width: `${colWidths.source || 140}px`, minWidth: '100px', maxWidth: `${colWidths.source || 140}px`, padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'var(--bg-primary)', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.75rem', fontWeight: 500 }}>
                          🌐 {ipDisplay}
                        </span>
                      </td>

                      {/* Timestamp & Shift Indicator */}
                      <td style={{ width: `${colWidths.timestamp || 210}px`, minWidth: '160px', maxWidth: `${colWidths.timestamp || 210}px`, padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.82rem' }}>{timeDisplay}</div>
                        {log.isNightShift ? (
                          <div style={{ marginTop: '0.25rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#fdf2f8', color: '#be185d', border: '1px solid #fbcfe8', fontSize: '0.7rem', fontWeight: 700 }}>
                              🦉 Night shift (≥20:00 to ≤08:00)
                            </span>
                          </div>
                        ) : log.isOffHours ? (
                          <div style={{ marginTop: '0.25rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', fontSize: '0.7rem', fontWeight: 600 }}>
                              🌙 Off hours (≥19:00 to ≤09:00)
                            </span>
                          </div>
                        ) : (
                          <div style={{ marginTop: '0.25rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', fontSize: '0.7rem', fontWeight: 500 }}>
                              ☀️ Day Shift (≥09:00 to &lt; 19:00)
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Inspect Modal Button */}
                      <td style={{ width: `${colWidths.view || 70}px`, minWidth: '60px', maxWidth: `${colWidths.view || 70}px`, padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <button
                          onClick={() => setSelectedLogDetail(log)}
                          title="Inspect Details"
                          style={{
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-light)',
                            borderRadius: '6px',
                            padding: '0.35rem',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Eye size={15} />
                        </button>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div style={{ 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
          padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border-light)', 
          background: 'var(--bg-surface)', flexWrap: 'wrap', gap: '0.75rem' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span>
              Showing {totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount.toLocaleString()} logs
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage <= 1 || loading}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                padding: '0.4rem 0.75rem', background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)', borderRadius: '6px',
                color: currentPage <= 1 ? 'var(--text-secondary)' : 'var(--text-primary)',
                cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage <= 1 ? 0.5 : 1, fontSize: '0.8rem'
              }}
            >
              <ChevronLeft size={16} />
              Previous
            </button>

            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, padding: '0 0.5rem' }}>
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages || loading}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                padding: '0.4rem 0.75rem', background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)', borderRadius: '6px',
                color: currentPage >= totalPages ? 'var(--text-secondary)' : 'var(--text-primary)',
                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage >= totalPages ? 0.5 : 1, fontSize: '0.8rem'
              }}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

      </div>

      {/* Row Details Inspector Modal */}
      {selectedLogDetail && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '1rem'
        }}>
          <div style={{
            background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)',
            width: '100%', maxWidth: '600px', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem' }}>
                <ShieldCheck size={20} color="var(--accent-color)" />
                Audit Log Event Details
              </h3>
              <button 
                onClick={() => setSelectedLogDetail(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.9rem' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Event ID:</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.8rem' }}>{selectedLogDetail.id}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Employee:</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedLogDetail.user}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Email Address:</span>
                <span style={{ color: 'var(--text-primary)' }}>{selectedLogDetail.email || '—'}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Module:</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedLogDetail.module}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Action:</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedLogDetail.action}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Timestamp:</span>
                <span style={{ color: 'var(--text-primary)' }}>{selectedLogDetail.time}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Shift / Hours:</span>
                <div>
                  {selectedLogDetail.isNightShift ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#fdf2f8', color: '#be185d', border: '1px solid #fbcfe8', fontSize: '0.75rem', fontWeight: 700 }}>
                      🦉 Night shift (≥20:00 to ≤08:00)
                    </span>
                  ) : selectedLogDetail.isOffHours ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', fontSize: '0.75rem', fontWeight: 600 }}>
                      🌙 Off hours (≥19:00 to ≤09:00)
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', fontSize: '0.75rem', fontWeight: 500 }}>
                      ☀️ Day Shift (≥09:00 to &lt; 19:00)
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Source / IP:</span>
                <span style={{ color: 'var(--text-primary)' }}>{selectedLogDetail.ip}</span>
              </div>

              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '0.35rem' }}>Description / Payload:</div>
                <div style={{ 
                  background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '8px', 
                  border: '1px solid var(--border-light)', color: 'var(--text-primary)',
                  fontSize: '0.85rem', lineHeight: 1.5, wordBreak: 'break-word', maxHeight: '180px', overflowY: 'auto'
                }}>
                  {selectedLogDetail.target}
                </div>
              </div>

            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedLogDetail(null)}
                style={{
                  padding: '0.55rem 1.25rem', background: 'var(--accent-color)',
                  color: 'white', border: 'none', borderRadius: '8px',
                  fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem'
                }}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Styles for Draggable Column Resizer */}
      <style jsx>{`
        .column-resizer {
          opacity: 0.6;
          transition: opacity 0.15s ease;
        }
        .column-resizer:hover,
        .column-resizer.is-resizing {
          opacity: 1 !important;
        }
        .column-resizer:hover .resizer-bar,
        .column-resizer.is-resizing .resizer-bar {
          background-color: var(--accent-color, #2563eb) !important;
          width: 4px !important;
          height: 90% !important;
          box-shadow: 0 0 8px rgba(37, 99, 235, 0.5) !important;
        }
      `}</style>

    </div>
  );
}

