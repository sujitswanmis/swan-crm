'use client';
import React from 'react';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';

export const stickyHeader = { position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface, white)', boxShadow: 'inset 0 -1px 0 var(--border-light, #e2e8f0)' };
export const tableScroll = { overflow: 'auto', maxHeight: 'calc(100vh - 310px)', minHeight: '380px', position: 'relative' };

export default function CallCenterPagination({ total, page, pageSize, onPageChange, onPageSizeChange, disabled = false }) {
  const last = Math.max(0, Math.ceil(total / pageSize) - 1);
  const current = Math.min(page, last);
  const button = (label, Icon, next, boundary) => <button type="button" aria-label={label} title={label}
    disabled={disabled || boundary} onClick={() => onPageChange(next)}
    style={{ padding: '0.4rem', border: '1px solid var(--border-light, #cbd5e1)', borderRadius: 6, background: 'var(--bg-surface, white)', opacity: disabled || boundary ? 0.4 : 1, cursor: 'pointer' }}><Icon size={17} /></button>;
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '1rem', borderTop: '1px solid var(--border-light, #e2e8f0)', fontSize: '0.82rem' }}>
    <span>Showing <strong>{total ? current * pageSize + 1 : 0}</strong> to <strong>{Math.min((current + 1) * pageSize, total)}</strong> of <strong>{total}</strong> records</span>
    <label>Rows per page <select aria-label="Rows per page" value={pageSize} onChange={event => { onPageSizeChange(Number(event.target.value)); onPageChange(0); }}>
      {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
    </select></label>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {button('First page', ChevronsLeft, 0, current === 0)}
      {button('Previous page', ChevronLeft, current - 1, current === 0)}
      <span>Page {current + 1} of {last + 1}</span>
      {button('Next page', ChevronRight, current + 1, current === last)}
      {button('Last page', ChevronsRight, last, current === last)}
    </div>
  </div>;
}
