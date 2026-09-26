'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Search, RefreshCw, Filter, ShieldCheck, User, Globe, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { getAuditLogs } from '@/app/actions/audit';
import { formatISTDateTime } from '../utils/userManagementUtils';

export default function AuditLogsTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 25;

  const fetchLogs = async (page = currentPage) => {
    setLoading(true);
    try {
      const res = await getAuditLogs({
        page,
        pageSize,
        searchQuery: searchQuery.trim(),
        module: 'all'
      });

      if (res && res.logs) {
        setLogs(res.logs);
        setTotalCount(res.totalCount || res.logs.length);
      } else {
        setLogs([]);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(currentPage);
  }, [currentPage]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchLogs(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

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
            <Clock size={20} style={{ color: '#475569' }} />
            Security & User Activity Audit Trail
          </h3>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Immutable records of employee role changes, security permissions, session events, and administrative actions
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchLogs(currentPage)}
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
          Refresh Logs
        </button>
      </div>

      {/* Search Input */}
      <form onSubmit={handleSearchSubmit} style={{
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        display: 'flex',
        gap: '0.75rem'
      }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search audit trail by user, action, target or IP..."
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
        <button
          type="submit"
          style={{
            padding: '0.45rem 1rem',
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

      {/* Logs Table */}
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
                <th style={{ padding: '0.75rem 1rem', width: '220px' }}>User / Performer</th>
                <th style={{ padding: '0.75rem 1rem', width: '160px' }}>Action</th>
                <th style={{ padding: '0.75rem 1rem' }}>Target & Details</th>
                <th style={{ padding: '0.75rem 1rem', width: '140px' }}>IP / Source</th>
                <th style={{ padding: '0.75rem 1rem', width: '190px' }}>Timestamp (IST)</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                      <Clock size={36} style={{ opacity: 0.35 }} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>No audit events found</span>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log, idx) => (
                  <tr
                    key={log.id || idx}
                    style={{
                      borderBottom: '1px solid var(--border-light)',
                      backgroundColor: idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary, rgba(0,0,0,0.01))'
                    }}
                  >
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {log.emp_name || 'System User'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {log.email || 'system@internal'}
                      </div>
                    </td>

                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        backgroundColor: '#f1f5f9',
                        color: '#334155',
                        border: '1px solid #cbd5e1'
                      }}>
                        {log.action || 'Action'}
                      </span>
                    </td>

                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      <div style={{ fontWeight: 500 }}>{log.target || 'N/A'}</div>
                      {log.details && typeof log.details === 'string' && log.details !== log.target && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          {log.details}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {log.ip_address || '127.0.0.1'}
                    </td>

                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {formatISTDateTime(log.created_at || log.timestamp)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-primary, #f8fafc)',
          fontSize: '0.78rem',
          color: 'var(--text-secondary)'
        }}>
          <div>
            Showing <strong>{logs.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> to <strong>{Math.min(currentPage * pageSize, totalCount)}</strong> of <strong>{totalCount}</strong> events
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              style={{
                padding: '0.3rem 0.55rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage <= 1 ? 0.5 : 1
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontWeight: 600 }}>Page {currentPage} of {totalPages}</span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              style={{
                padding: '0.3rem 0.55rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage >= totalPages ? 0.5 : 1
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
