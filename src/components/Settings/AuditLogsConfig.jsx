import React, { useState, useEffect, useCallback } from 'react';
import { 
  Clock, Search, Calendar, RefreshCw, Download, Filter, 
  Activity, Users, AlertTriangle, ShieldCheck, Layers, Eye, 
  ChevronLeft, ChevronRight, X, User, ArrowUpDown
} from 'lucide-react';
import { getAuditLogs, getAuditLogFilters } from '@/app/actions/audit';

export default function AuditLogsConfig() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    totalEvents: 0,
    todayEvents: 0,
    deleteEvents: 0,
    uniqueUsers: 0
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
  const [dateRangeQuick, setDateRangeQuick] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Selected Log for detail modal
  const [selectedLogDetail, setSelectedLogDetail] = useState(null);

  // Load Filter metadata (Users list)
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
        userId: selectedUser
      });

      if (res.success) {
        setLogs(res.logs || []);
        setTotalCount(res.totalCount || 0);
        if (res.stats) {
          setStats({
            totalEvents: res.stats.totalEvents || 0,
            todayEvents: res.stats.todayEvents || 0,
            deleteEvents: res.stats.deleteEvents || 0,
            uniqueUsers: res.stats.uniqueUsers || 0
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
  }, [currentPage, pageSize, searchQuery, dateFrom, dateTo, selectedModule, selectedAction, selectedUser]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset Filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedModule('all');
    setSelectedAction('all');
    setSelectedUser('all');
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        
        <div style={{ background: 'var(--bg-surface)', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: '#e0e7ff', padding: '0.75rem', borderRadius: '10px', color: '#4f46e5' }}>
            <Activity size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Total System Events</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.totalEvents.toLocaleString()}</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: '#dcfce7', padding: '0.75rem', borderRadius: '10px', color: '#16a34a' }}>
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Activities Today</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#16a34a' }}>{stats.todayEvents.toLocaleString()}</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: '#e0f2fe', padding: '0.75rem', borderRadius: '10px', color: '#0284c7' }}>
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Registered Users</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.uniqueUsers}</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: '#fee2e2', padding: '0.75rem', borderRadius: '10px', color: '#dc2626' }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Delete / Critical Events</div>
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

          {/* Quick Date Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--bg-primary)', padding: '0.3rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '7days', label: 'Last 7 Days' },
              { id: '30days', label: 'Last 30 Days' }
            ].map(pill => (
              <button
                key={pill.id}
                onClick={() => handleQuickDate(pill.id)}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: dateRangeQuick === pill.id ? 600 : 400,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: dateRangeQuick === pill.id ? 'var(--accent-color)' : 'transparent',
                  color: dateRangeQuick === pill.id ? 'white' : 'var(--text-secondary)',
                  transition: 'all 0.15s'
                }}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-primary)', padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <Calendar size={16} color="var(--text-secondary)" />
            <input 
              type="date" 
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setDateRangeQuick('custom');
                setCurrentPage(1);
              }}
              style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.8rem' }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>to</span>
            <input 
              type="date" 
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setDateRangeQuick('custom');
                setCurrentPage(1);
              }}
              style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.8rem' }}
            />
          </div>

        </div>

        {/* Row 2: Dropdowns (Module, Action, User) + Reset Button */}
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

          {/* User / Employee Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Employee:</span>
            <select
              value={selectedUser}
              onChange={(e) => {
                setSelectedUser(e.target.value);
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
                cursor: 'pointer',
                maxWidth: '220px'
              }}
            >
              <option value="all">All Employees</option>
              {userOptions.map((u, index) => {
                const val = u.email || u.id || u.emp_name || String(index);
                const label = u.emp_name || u.name || u.email || `User ${index + 1}`;
                return (
                  <option key={val} value={val}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Reset Filters */}
          {(searchQuery || selectedModule !== 'all' || selectedAction !== 'all' || selectedUser !== 'all' || dateRangeQuick !== 'all' || dateFrom || dateTo) && (
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--th-bg)' }}>
                <tr style={{ color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, width: '220px', position: 'sticky', top: 0, zIndex: 20, background: 'var(--th-bg)', boxShadow: 'inset 0 -1px 0 var(--border-light), 0 2px 4px rgba(0,0,0,0.03)' }}>User / Employee</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, width: '130px', position: 'sticky', top: 0, zIndex: 20, background: 'var(--th-bg)', boxShadow: 'inset 0 -1px 0 var(--border-light), 0 2px 4px rgba(0,0,0,0.03)' }}>Module</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, width: '150px', position: 'sticky', top: 0, zIndex: 20, background: 'var(--th-bg)', boxShadow: 'inset 0 -1px 0 var(--border-light), 0 2px 4px rgba(0,0,0,0.03)' }}>Action</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, position: 'sticky', top: 0, zIndex: 20, background: 'var(--th-bg)', boxShadow: 'inset 0 -1px 0 var(--border-light), 0 2px 4px rgba(0,0,0,0.03)' }}>Target / Activity Details</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, width: '160px', position: 'sticky', top: 0, zIndex: 20, background: 'var(--th-bg)', boxShadow: 'inset 0 -1px 0 var(--border-light), 0 2px 4px rgba(0,0,0,0.03)' }}>Source / IP</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, width: '170px', position: 'sticky', top: 0, zIndex: 20, background: 'var(--th-bg)', boxShadow: 'inset 0 -1px 0 var(--border-light), 0 2px 4px rgba(0,0,0,0.03)' }}>Timestamp</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, width: '60px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 20, background: 'var(--th-bg)', boxShadow: 'inset 0 -1px 0 var(--border-light), 0 2px 4px rgba(0,0,0,0.03)' }}>View</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const actionStyle = getActionBadgeStyle(log.action);
                  const moduleStyle = getModuleBadgeStyle(log.module);
                  const initials = (log.user || 'U')
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map(p => p[0])
                    .join('')
                    .toUpperCase();

                  return (
                    <tr 
                      key={log.id} 
                      style={{ 
                        borderBottom: '1px solid var(--border-light)', 
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--th-filtered-bg)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* User Column */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div style={{ 
                            width: '32px', height: '32px', borderRadius: '50%', 
                            background: 'var(--accent-color)', color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 
                          }}>
                            {initials || 'U'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {log.user}
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {log.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Module Badge */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{ 
                          display: 'inline-block',
                          padding: '0.25rem 0.6rem', 
                          borderRadius: '6px', 
                          fontSize: '0.75rem', 
                          fontWeight: 600,
                          ...moduleStyle
                        }}>
                          {log.module}
                        </span>
                      </td>

                      {/* Action Badge */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{ 
                          display: 'inline-block',
                          padding: '0.25rem 0.6rem', 
                          borderRadius: '6px', 
                          fontSize: '0.75rem', 
                          fontWeight: 600,
                          ...actionStyle
                        }}>
                          {log.action}
                        </span>
                      </td>

                      {/* Target / Details */}
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-primary)', lineHeight: 1.4, maxWidth: '400px' }}>
                        <div style={{ 
                          wordBreak: 'break-word',
                          fontSize: '0.85rem'
                        }}>
                          {log.target || '—'}
                        </div>
                      </td>

                      {/* IP / Source */}
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        <div>{log.ip}</div>
                      </td>

                      {/* Timestamp */}
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{log.time}</div>
                      </td>

                      {/* Inspect Modal Button */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
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

    </div>
  );
}

