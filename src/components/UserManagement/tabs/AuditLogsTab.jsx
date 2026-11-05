'use client';

import MobileTableView, { TableViewToggle, useTableViewPreference } from '@/components/common/MobileTableView';
import StandardTablePagination from '@/components/common/StandardTablePagination';
import DateRangePicker from '@/components/common/DateRangePicker';
import React, { useState, useEffect } from 'react';
import { Clock, Search, RefreshCw, Filter, ShieldCheck, User, Globe, AlertCircle, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getAuditLogs } from '@/app/actions/audit';
import { formatISTDateTime } from '../utils/userManagementUtils';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';

const DEFAULT_AUDIT_LOGS_COL_WIDTHS = {
  user: 210,
  module: 140,
  action: 150,
  target: 330,
  status: 100,
  ip_address: 140,
  platform: 120,
  timestamp: 180
};

const MIN_AUDIT_LOGS_COL_WIDTHS = {
  user: 150,
  module: 110,
  action: 120,
  target: 200,
  status: 80,
  ip_address: 110,
  platform: 100,
  timestamp: 150
};

function getAuditLogModule(log) {
  const act = String(log.action || '').toLowerCase();
  const tgt = String(log.target || '').toLowerCase();
  if (act.includes('lead') || act.includes('stage') || act.includes('note') || tgt.includes('lead') || tgt.includes('pipeline')) {
    return { name: 'Leads & CRM', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' };
  }
  if (act.includes('punch') || act.includes('attendance') || tgt.includes('punch') || tgt.includes('attendance')) {
    return { name: 'Attendance', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
  }
  if (act.includes('login') || act.includes('logout') || act.includes('session') || tgt.includes('session')) {
    return { name: 'Session & Auth', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' };
  }
  if (act.includes('role') || act.includes('permission') || act.includes('password') || act.includes('user') || act.includes('team')) {
    return { name: 'User & Access', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' };
  }
  if (act.includes('call') || act.includes('dial') || tgt.includes('call')) {
    return { name: 'Call Center', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' };
  }
  if (act.includes('checklist') || tgt.includes('checklist')) {
    return { name: 'Smart Checklist', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' };
  }
  if (act.includes('delegat') || tgt.includes('delegat')) {
    return { name: 'Task Delegation', color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe' };
  }
  return { name: 'System / Audit', color: '#475569', bg: '#f8fafc', border: '#e2e8f0' };
}

export default function AuditLogsTab({ currentUserCompany = '', tenantId = null }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [tableView, setTableView] = useTableViewPreference('audit_logs_tab_view');
  const getTodayIST = () => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  };
  const [datePreset, setDatePreset] = useState('today');
  const [dateFrom, setDateFrom] = useState(() => getTodayIST());
  const [dateTo, setDateTo] = useState(() => getTodayIST());
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const settings = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (settings.defaultPageSize) {
          if (settings.defaultPageSize === 'All') return 100000;
          return parseInt(settings.defaultPageSize, 10) || 15;
        }
      } catch (e) {}
    }
    return 15;
  });

  // Column Resizing Hook (Lead Data Pattern)
  const {
    colWidths,
    resizingCol,
    handleResizeStart,
    resetColWidth,
    getTotalTableWidth
  } = useTableColumnResize(
    'audit_logs_tab_col_widths_v2',
    DEFAULT_AUDIT_LOGS_COL_WIDTHS,
    MIN_AUDIT_LOGS_COL_WIDTHS
  );

  const fetchLogs = async (page = currentPage) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await getAuditLogs({
        page,
        pageSize,
        searchQuery: searchQuery.trim(),
        module: 'all',
        company: currentUserCompany,
        tenantId,
        dateFrom,
        dateTo
      });

      if (res?.success && Array.isArray(res.logs)) {
        setLogs(res.logs);
        setTotalCount(res.totalCount ?? res.logs.length);
      } else {
        throw new Error(res?.error || 'Could not load audit logs');
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      setLoadError(err.message || 'Could not load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(currentPage);
  }, [currentPage, pageSize, currentUserCompany, tenantId, dateFrom, dateTo]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (currentPage === 1) fetchLogs(1);
    else setCurrentPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%' }}>
      {/* Intro Header & Action Toolbar */}
      <div style={{
        padding: '0.85rem 1.25rem',
        borderRadius: '12px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={19} style={{ color: '#475569' }} />
            Security & User Activity Audit Trail
          </h3>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Immutable records of employee role changes, security permissions, session events, and administrative actions
          </p>
        </div>

        {/* Toolbar Controls: Date Preset, Search, View Toggle, Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <DateRangePicker
            preset={datePreset}
            startDate={dateFrom}
            endDate={dateTo}
            allowAllTime={true}
            title="Filter Audit Logs by Date"
            onChange={({ preset, startDate, endDate }) => {
              setDatePreset(preset);
              setDateFrom(startDate);
              setDateTo(endDate);
              setCurrentPage(1);
            }}
          />

          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search user, action, target, IP..."
                style={{
                  width: '100%',
                  padding: '0.42rem 1.8rem 0.42rem 2rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-primary, #f8fafc)',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem'
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    if (currentPage === 1) fetchLogs(1);
                    else setCurrentPage(1);
                  }}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <button
              type="submit"
              style={{
                padding: '0.42rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--primary-color, #2563eb)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              Search
            </button>
          </form>

          <TableViewToggle view={tableView} onChange={setTableView} />

          <button
            type="button"
            onClick={() => fetchLogs(currentPage)}
            title="Refresh Logs"
            style={{
              padding: '0.42rem 0.75rem',
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
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {loadError && <div role="alert" style={{ padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#b91c1c' }}>Could not load audit logs: {loadError}</div>}

      {/* Logs Table */}
      <div style={{
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-surface)'
      }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 320px)', minHeight: '380px' }}>
          <MobileTableView id="audit_logs_tab_view" view={tableView} hideToggle={true}><table style={{ width: '100%', minWidth: `${getTotalTableWidth()}px`, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{
                position: 'sticky',
                top: 0,
                backgroundColor: 'var(--bg-surface)',
                boxShadow: 'inset 0 -1px 0 var(--border-light)',
                borderBottom: '1px solid var(--border-light)',
                zIndex: 10,
                color: 'var(--text-secondary)',
                fontSize: '0.74rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                <th style={{ width: `${colWidths.user}px`, padding: '0.75rem 1rem', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>User / Performer</span>
                  </div>
                  <ColumnResizer colKey="user" isResizing={resizingCol === 'user'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.module}px`, padding: '0.75rem 1rem', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Module</span>
                  </div>
                  <ColumnResizer colKey="module" isResizing={resizingCol === 'module'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.action}px`, padding: '0.75rem 1rem', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Action</span>
                  </div>
                  <ColumnResizer colKey="action" isResizing={resizingCol === 'action'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.target}px`, padding: '0.75rem 1rem', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Target & Details</span>
                  </div>
                  <ColumnResizer colKey="target" isResizing={resizingCol === 'target'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.status}px`, padding: '0.75rem 1rem', position: 'sticky', top: 0, zIndex: 10, textAlign: 'center', backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Status</span>
                  </div>
                  <ColumnResizer colKey="status" isResizing={resizingCol === 'status'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.ip_address}px`, padding: '0.75rem 1rem', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>IP Address</span>
                  </div>
                  <ColumnResizer colKey="ip_address" isResizing={resizingCol === 'ip_address'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.platform}px`, padding: '0.75rem 1rem', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Platform</span>
                  </div>
                  <ColumnResizer colKey="platform" isResizing={resizingCol === 'platform'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.timestamp}px`, padding: '0.75rem 1rem', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Timestamp (IST)</span>
                  </div>
                  <ColumnResizer colKey="timestamp" isResizing={resizingCol === 'timestamp'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <Clock size={36} style={{ opacity: 0.35 }} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{loadError ? 'Audit data unavailable' : 'No audit events found'}</span>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log, idx) => {
                  const mod = getAuditLogModule(log);
                  const resolvedIp = (!log.ip_address && !log.ip) || log.ip_address === 'Web App' || log.ip === 'Web App' || log.ip_address === 'Logged via Web App' || log.ip === 'Logged via Web App' ? '127.0.0.1 (Local)' : (log.ip_address || log.ip);
                  return (
                    <tr
                      key={log.id || idx}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                        backgroundColor: idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary, rgba(0,0,0,0.01))'
                      }}
                    >
                      {/* User / Performer */}
                      <td style={{ width: `${colWidths.user}px`, padding: '0.75rem 1rem', boxSizing: 'border-box', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }} title={log.emp_name || 'System User'}>
                          {log.emp_name || 'System User'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'normal', wordBreak: 'break-all', lineHeight: 1.3, marginTop: '0.15rem' }} title={log.email || 'system@internal'}>
                          {log.email || 'system@internal'}
                        </div>
                      </td>

                      {/* Module */}
                      <td style={{ width: `${colWidths.module}px`, padding: '0.75rem 1rem', boxSizing: 'border-box', verticalAlign: 'top' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '6px',
                          backgroundColor: mod.bg,
                          color: mod.color,
                          border: `1px solid ${mod.border}`,
                          display: 'inline-block',
                          whiteSpace: 'nowrap'
                        }}>
                          {mod.name}
                        </span>
                      </td>

                      {/* Action */}
                      <td style={{ width: `${colWidths.action}px`, padding: '0.75rem 1rem', boxSizing: 'border-box', verticalAlign: 'top' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '6px',
                          backgroundColor: '#f1f5f9',
                          color: '#334155',
                          border: '1px solid #cbd5e1',
                          display: 'inline-block',
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          lineHeight: 1.25
                        }}>
                          {log.action || 'Action'}
                        </span>
                      </td>

                      {/* Target & Details */}
                      <td style={{ width: `${colWidths.target}px`, padding: '0.75rem 1rem', color: 'var(--text-primary)', lineHeight: 1.35, boxSizing: 'border-box', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 500, whiteSpace: 'normal', wordBreak: 'break-word' }} title={log.target || 'N/A'}>{log.target || 'N/A'}</div>
                        {log.details && typeof log.details === 'string' && log.details !== log.target && (
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.25rem', whiteSpace: 'normal', wordBreak: 'break-word' }} title={log.details}>
                            {log.details}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ width: `${colWidths.status}px`, padding: '0.75rem 1rem', textAlign: 'center', boxSizing: 'border-box', verticalAlign: 'top' }}>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '10px',
                          backgroundColor: '#ecfdf5',
                          color: '#059669',
                          border: '1px solid #a7f3d0',
                          display: 'inline-block'
                        }}>
                          Recorded
                        </span>
                      </td>

                      {/* IP Address */}
                      <td style={{ width: `${colWidths.ip_address}px`, padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)', boxSizing: 'border-box', whiteSpace: 'normal', wordBreak: 'break-all', verticalAlign: 'top' }} title={resolvedIp}>
                        {resolvedIp}
                      </td>

                      {/* Platform */}
                      <td style={{ width: `${colWidths.platform}px`, padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-primary)', boxSizing: 'border-box', verticalAlign: 'top' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '6px',
                          backgroundColor: '#f8fafc',
                          color: '#475569',
                          border: '1px solid #e2e8f0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}>
                          Web App
                        </span>
                      </td>

                      {/* Timestamp (IST) */}
                      <td style={{ width: `${colWidths.timestamp}px`, padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)', boxSizing: 'border-box', whiteSpace: 'normal', wordBreak: 'break-word', verticalAlign: 'top' }}>
                        {formatISTDateTime(log.created_at || log.timestamp)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table></MobileTableView>
        </div>

        {/* Unified Standard Bottom Page Navigation */}
        <StandardTablePagination
          currentPage={currentPage}
          totalRecords={totalCount}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
