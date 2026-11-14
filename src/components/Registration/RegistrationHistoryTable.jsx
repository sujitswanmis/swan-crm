'use client';

import { useMemo, useState } from 'react';
import StandardTablePagination from '@/components/common/StandardTablePagination';
import useTableColumnResize, { ColumnResizer } from '@/utils/tableColumnResize';

const widths = { company: 280, contact: 230, location: 180, status: 220, actor: 180, date: 180, reason: 320 };
const cell = { padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)', overflowWrap: 'anywhere' };

export default function RegistrationHistoryTable({ view, rows = [], error = '', loading = false, onRetry }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const size = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}').defaultPageSize;
      return size === 'All' ? 100000 : Math.max(1, Number(size) || 25);
    } catch { return 25; }
  });
  const resizing = useTableColumnResize(`crm_registration_${view}_widths`, widths);
  const deleted = view === 'deleted';
  const columns = [
    ['company', 'Business / Lead Name'], ['contact', 'Contact Person & Phone'], ['location', 'City / State'],
    ...(deleted ? [['reason', 'Deletion Reason']] : [['status', 'Lead Status']]),
    ['actor', deleted ? 'Deleted By' : 'Submitted By'], ['date', deleted ? 'Deleted At (IST)' : 'Submitted At (IST)'],
  ];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(row => !term || [row.company, row.name, row.phone, row.lead_ref_id, row.city_name, row.state_name,
      row.registration_delete_reason, row.registration_deleted_by, row.registration_submitted_by].some(value => String(value || '').toLowerCase().includes(term)));
  }, [rows, search]);
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const value = (row, key) => {
    if (key === 'company') return <><strong>{row.company || row.name || 'Unnamed Lead'}</strong>{row.lead_ref_id && <div>#{row.lead_ref_id}</div>}</>;
    if (key === 'contact') return <>{row.name || '—'}<div>{row.phone || '—'}</div></>;
    if (key === 'location') return [row.city_name, row.state_name].filter(Boolean).join(', ') || '—';
    if (key === 'status') return row.status || '—';
    if (key === 'reason') return row.registration_delete_reason || '—';
    if (key === 'actor') return (deleted ? row.registration_deleted_by : row.registration_submitted_by) || '—';
    const date = deleted ? row.registration_deleted_at : row.registration_submitted_at;
    return date ? new Date(date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : '—';
  };
  return <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
      <h3 style={{ margin: 0 }}>{deleted ? 'Lead Deleted' : 'Lead Submitted'} ({rows.length})</h3>
      <input aria-label="Search registration history" placeholder="Search name, phone, lead number..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} style={{ padding: '0.5rem', border: '1px solid var(--border-light)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
    </div>
    {error && <p role="alert">{error} <button type="button" onClick={onRetry}>Retry</button></p>}
    {loading && <p role="status">Updating records…</p>}
    <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 350px)', minHeight: 380, border: '1px solid var(--border-light)', borderRadius: 8 }}>
      <table style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, width: columns.reduce((sum, [key]) => sum + resizing.colWidths[key], 0), minWidth: '100%', textAlign: 'left', fontSize: '0.88rem' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface)' }}><tr>{columns.map(([key, label]) => <th key={key} style={{ ...cell, position: 'sticky', top: 0, zIndex: 10, width: resizing.colWidths[key], backgroundColor: 'var(--bg-surface)', boxShadow: 'inset 0 -1px 0 var(--border-light)' }}>
          {label}<ColumnResizer colKey={key} isResizing={resizing.resizingCol === key} onResizeStart={resizing.handleResizeStart} onReset={resizing.resetColWidth} />
        </th>)}</tr></thead>
        <tbody>{visible.map(row => <tr key={row.id}>{columns.map(([key]) => <td key={key} style={cell}>{value(row, key)}</td>)}</tr>)}</tbody>
      </table>
      {filtered.length === 0 && <p style={{ padding: '2rem', textAlign: 'center' }}>No {deleted ? 'deleted' : 'submitted'} leads found.</p>}
    </div>
    <StandardTablePagination currentPage={safePage} totalRecords={filtered.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
  </div>;
}
