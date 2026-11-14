'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Inbox, Layers, X } from 'lucide-react';
import StandardTablePagination from '@/components/common/StandardTablePagination';
import { ColumnResizer, useTableColumnResize } from '@/utils/tableColumnResize';

export function CopyNumber({ number }) {
  const [state, setState] = useState('idle');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(number);
      setState('copied');
    } catch { setState('error'); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1800);
  };
  if (!number) return <span className="wa:text-slate-400">—</span>;
  return <span className="wa:inline-flex wa:max-w-full wa:items-center wa:gap-1.5">
    <span className="wa:truncate wa:font-mono wa:text-xs wa:font-medium wa:tabular-nums" title={number}>{number}</span>
    <button type="button" onClick={copy} aria-label={state === 'copied' ? 'Number copied' : `Copy ${number}`} title={state === 'copied' ? 'Copied!' : state === 'error' ? 'Copy unavailable. Select the number to copy.' : 'Copy number'}
      className={`wa:inline-flex wa:h-6 wa:w-6 wa:shrink-0 wa:items-center wa:justify-center wa:rounded-md wa:border-0 wa:bg-transparent wa:transition-all wa:duration-200 wa:hover:-translate-y-0.5 wa:hover:bg-indigo-50 wa:focus-visible:outline-2 wa:focus-visible:outline-indigo-500 ${state === 'copied' ? 'wa:text-emerald-600' : 'wa:text-slate-400 wa:hover:text-indigo-600'}`}>
      {state === 'copied' ? <Check size={13} /> : <Copy size={12} />}
    </button>
    <span role="status" className="wa:sr-only">{state === 'copied' ? 'Number copied to clipboard.' : state === 'error' ? 'Clipboard access is unavailable.' : ''}</span>
  </span>;
}

export function TemplateTags({ values = [], label = 'Sent templates', phone = false }) {
  const items = [...new Set(values.filter(Boolean))];
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef(null), panel = useRef(null), closeTimer = useRef(null), pinned = useRef(false);
  const id = useId();
  const close = useCallback(() => { setOpen(false); pinned.current = false; }, []);
  const show = () => {
    clearTimeout(closeTimer.current);
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const height = Math.min(320, items.length * 34 + 68);
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 332)), top: rect.bottom + height + 8 > window.innerHeight ? Math.max(12, rect.top - height - 8) : rect.bottom + 8 });
    setOpen(true);
  };
  const scheduleClose = () => { if (!pinned.current) closeTimer.current = setTimeout(close, 160); };
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) close(); };
    const escape = event => { if (event.key === 'Escape') { close(); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('resize', close); };
  }, [open, close]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  if (!items.length) return <span className="wa:text-slate-400">—</span>;
  return <span className="wa:inline-flex wa:max-w-full wa:items-center wa:gap-1.5">
    {phone ? <CopyNumber number={items[0]} /> : <span title={items[0]} className="wa:inline-flex wa:max-w-[190px] wa:items-center wa:gap-1 wa:rounded-md wa:border wa:border-indigo-100 wa:bg-indigo-50/80 wa:px-2 wa:py-1 wa:text-[11px] wa:font-medium wa:text-indigo-700"><Layers size={10} className="wa:shrink-0" /><span className="wa:truncate">{items[0]}</span></span>}
    {items.length > 1 && <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={`Show all ${items.length} ${label.toLowerCase()}`}
      onPointerEnter={show} onPointerLeave={scheduleClose} onFocus={show} onClick={() => { if (open && pinned.current) close(); else { pinned.current = true; show(); } }}
      className="wa:shrink-0 wa:rounded-md wa:border wa:border-zinc-200 wa:bg-white wa:px-1.5 wa:py-1 wa:text-[10px] wa:font-semibold wa:text-slate-500 wa:transition-all wa:duration-200 wa:hover:border-indigo-200 wa:hover:bg-indigo-50 wa:hover:text-indigo-600 wa:focus-visible:outline-2 wa:focus-visible:outline-indigo-500">+{items.length - 1} more</button>}
    {open && typeof document !== 'undefined' && createPortal(<div ref={panel} id={id} role="dialog" aria-label={label} onPointerEnter={() => clearTimeout(closeTimer.current)} onPointerLeave={scheduleClose}
      style={{ ...position, position: 'fixed', zIndex: 100010, width: 320 }} className="wa-log-popover wa-panel-enter wa:overflow-hidden wa:rounded-xl wa:border wa:border-zinc-200 wa:bg-white wa:shadow-xl">
      <div className="wa:flex wa:items-center wa:justify-between wa:border-b wa:border-zinc-100 wa:px-4 wa:py-3"><strong className="wa:text-xs wa:font-semibold wa:text-slate-800">{label} <span className="wa:text-slate-400">({items.length})</span></strong><button type="button" aria-label="Close list" onClick={() => { close(); trigger.current?.focus(); }} className="wa:flex wa:h-6 wa:w-6 wa:items-center wa:justify-center wa:rounded-md wa:border-0 wa:bg-slate-50 wa:text-slate-500 wa:hover:bg-slate-100"><X size={13} /></button></div>
      <ul className="wa:m-0 wa:max-h-60 wa:list-none wa:overflow-auto wa:p-2">{items.map(item => <li key={item} className="wa:rounded-md wa:px-2 wa:py-2 wa:text-xs wa:text-slate-600 wa:hover:bg-slate-50">{phone ? <CopyNumber number={item} /> : <span className="wa:break-words wa:whitespace-normal">{item}</span>}</li>)}</ul>
    </div>, document.body)}
  </span>;
}

export function StatusBadge({ status }) {
  const sent = status === 'sent', failed = status === 'failed';
  return <span className={`wa:inline-flex wa:items-center wa:gap-1.5 wa:rounded-full wa:border wa:px-2.5 wa:py-0.5 wa:text-[10px] wa:font-semibold ${sent ? 'wa:border-emerald-200/70 wa:bg-emerald-50 wa:text-emerald-700' : failed ? 'wa:border-rose-200/70 wa:bg-rose-50 wa:text-rose-700' : 'wa:border-slate-200/80 wa:bg-slate-100 wa:text-slate-700'}`}>
    <span className={`wa:h-1.5 wa:w-1.5 wa:rounded-full ${sent ? 'wa:bg-emerald-500 wa:animate-pulse wa:shadow-[0_0_6px_#10b98155]' : failed ? 'wa:bg-rose-500 wa:animate-pulse wa:shadow-[0_0_6px_#f43f5e55]' : 'wa:bg-slate-400'}`} />{sent ? 'Sent' : failed ? 'Failed' : 'Other'}
  </span>;
}

function defaultPageSize() {
  try { const value = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}').defaultPageSize; const size = value === 'All' ? 100000 : Number(value); if (size > 0 && Number.isFinite(size)) return size; } catch { /* Safe default when storage is unavailable. */ }
  return 15;
}

export default function WhatsappMessageLogsTable({ id, title, description, rows = [], columns, filterKey, loading = false, emptyText = 'No records match your filters.', compact = false }) {
  const [page, setPage] = useState({ filterKey, value: 1 });
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const widths = useMemo(() => Object.fromEntries(columns.map(column => [column.id, column.width])), [columns]);
  const minimums = useMemo(() => Object.fromEntries(columns.map(column => [column.id, column.width <= 100 ? 70 : 100])), [columns]);
  const resize = useTableColumnResize(`crm_wa_premium_${id}_widths`, widths, minimums);
  const currentPage = Math.min(page.filterKey === filterKey ? page.value : 1, Math.max(1, Math.ceil(rows.length / pageSize)));
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const changePage = useCallback(value => setPage({ filterKey, value }), [filterKey]);
  const changePageSize = useCallback(value => { setPageSize(value); setPage({ filterKey, value: 1 }); }, [filterKey]);
  return <div className="wa:overflow-hidden wa:rounded-xl wa:border wa:border-slate-200/80 wa:bg-white wa:shadow-[0_1px_3px_rgba(0,0,0,0.05)] wa:transition-all wa:duration-200 wa:hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
    <div className="wa:flex wa:items-center wa:justify-between wa:gap-3 wa:border-b wa:border-slate-100 wa:px-4 wa:py-3.5"><div><h3 className="wa:m-0 wa:text-[13px] wa:font-semibold wa:tracking-tight wa:text-slate-800">{title}</h3>{description && <p className="wa:mt-0.5 wa:mb-0 wa:text-[11px] wa:text-slate-400">{description}</p>}</div><span className="wa:shrink-0 wa:rounded-md wa:border wa:border-slate-200/70 wa:bg-slate-50 wa:px-2 wa:py-1 wa:font-mono wa:text-[10px] wa:tabular-nums wa:text-slate-600">{rows.length.toLocaleString('en-IN')} records</span></div>
    {loading && <div aria-label="Refreshing table" className="wa-loading-shimmer wa:h-0.5 wa:w-full" />}
    <div className="wa:overflow-auto wa:overscroll-contain" style={{ maxHeight: compact ? 340 : 'calc(100vh - 440px)', minHeight: compact ? 150 : 310 }}>
      <table data-column-resize-managed="true" aria-label={title} aria-busy={loading} className="wa-log-table wa:table-fixed wa:text-left wa:text-xs wa:tabular-nums" style={{ width: resize.getTotalTableWidth(), minWidth: resize.getTotalTableWidth(), tableLayout: 'fixed' }}>
        <colgroup>{columns.map(column => <col key={column.id} style={{ width: resize.colWidths[column.id] }} />)}</colgroup>
        <thead className="wa:sticky wa:top-0 wa:z-10 wa:bg-slate-50/95 wa:backdrop-blur-md"><tr>{columns.map(column => <th key={column.id} scope="col" className="wa:sticky wa:top-0 wa:z-10 wa:h-11 wa:whitespace-nowrap wa:bg-slate-50/95 wa:px-3.5 wa:text-[9px] wa:font-semibold wa:tracking-[0.075em] wa:text-slate-500 wa:uppercase" style={{ minWidth: minimums[column.id], boxShadow: 'inset 0 -1px 0 rgba(226, 232, 240, 0.85)' }}>{column.label}<span style={{ position: 'absolute', right: 4, top: 0, height: '100%', width: 12 }}><ColumnResizer colKey={column.id} isResizing={resize.resizingCol === column.id} onResizeStart={resize.handleResizeStart} onReset={resize.resetColWidth} /></span></th>)}</tr></thead>
        <tbody>{visible.map(row => <tr key={row.id || row.key} className="wa:h-11 wa:transition-colors wa:duration-150 wa:hover:bg-slate-50/90">{columns.map(column => <td key={column.id} className="wa:h-11 wa:border-b wa:border-slate-100 wa:px-3.5 wa:py-2.5 wa:align-middle wa:text-slate-600">{column.render ? column.render(row) : typeof row[column.id] === 'number' ? <span className="wa:font-mono wa:font-medium wa:tabular-nums">{row[column.id].toLocaleString('en-IN')}</span> : row[column.id] || '—'}</td>)}</tr>)}
          {!visible.length && loading && Array.from({ length: 5 }, (_, index) => <tr key={index} className="wa:h-11">{columns.map(column => <td key={column.id} className="wa:border-b wa:border-slate-100 wa:px-3.5 wa:py-2.5"><div className="wa-loading-shimmer wa:h-3 wa:w-3/4 wa:rounded" /></td>)}</tr>)}
          {!visible.length && !loading && <tr><td colSpan={columns.length} className="wa:h-48 wa:text-center"><Inbox size={28} className="wa:mx-auto wa:mb-3 wa:text-slate-300" /><p className="wa:m-0 wa:text-xs wa:font-medium wa:text-slate-500">{emptyText}</p><p className="wa:mt-1 wa:text-[11px] wa:text-slate-400">Try another date range or adjust your filters.</p></td></tr>}
        </tbody>
      </table>
    </div>
    <StandardTablePagination className="wa-pagination" currentPage={currentPage} totalRecords={rows.length} pageSize={pageSize} onPageChange={changePage} onPageSizeChange={changePageSize} style={{ padding: '11px 14px', fontSize: '0.72rem', borderTop: '1px solid rgba(226, 232, 240, 0.85)' }} />
  </div>;
}
