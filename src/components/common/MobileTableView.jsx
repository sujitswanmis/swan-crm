'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { Table, LayoutGrid } from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { isMobileLeadDevice } from '@/utils/leadPerformance';
import { readTableView, writeTableView } from '@/utils/tableViewPreferences';

function subscribeViewport(callback) {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

function subscribePreference(callback) {
  window.addEventListener('storage', callback);
  window.addEventListener('crm-table-view-change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('crm-table-view-change', callback);
  };
}

export function useTableViewPreference(id, { desktopKey } = {}) {
  const mobile = useSyncExternalStore(subscribeViewport, isMobileLeadDevice, () => false);
  const stored = useSyncExternalStore(subscribePreference, () => {
    try { return readTableView(id, mobile, window.localStorage, desktopKey); }
    catch (_error) { return mobile ? 'tiles' : 'table'; }
  }, () => 'table');
  const [override, setOverride] = useState(null);
  const identity = `${id}:${mobile}`;
  const view = override?.identity === identity ? override.value : stored;
  const setView = value => {
    if (!['table', 'tiles'].includes(value)) return;
    setOverride({ identity, value });
    try {
      writeTableView(id, mobile, value, window.localStorage, desktopKey);
      window.dispatchEvent(new Event('crm-table-view-change'));
    } catch (_error) {}
  };
  return [view, setView, mobile];
}

export function TableViewToggle({ view, onChange }) {
  return <div role="group" aria-label="Data view" style={{ display: 'inline-flex', alignItems: 'center',
    gap: 2, padding: 2, borderRadius: 8, border: '1px solid var(--border-light, #fecdd3)',
    background: 'var(--bg-surface, white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    userSelect: 'none', flexShrink: 0 }}>
    {[['table', 'Table', Table], ['tiles', 'Tiles', LayoutGrid]].map(([mode, label, Icon]) =>
      <button type="button" key={mode} title={`${label} View`} aria-label={`${label} view`}
        aria-pressed={view === mode} onClick={() => onChange(mode)} style={{ display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', gap: 5, height: 28, padding: '4px 10px',
          boxSizing: 'border-box', lineHeight: 1.2, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
          whiteSpace: 'nowrap', background: view === mode ? 'var(--accent-color, #e11d48)' : 'transparent',
          color: view === mode ? '#ffffff' : 'var(--accent-color, #e11d48)' }}>
        <Icon size={15} aria-hidden="true" /><span>{label}</span>
      </button>)}
  </div>;
}

function childNodes(children) {
  return React.Children.toArray(children).flatMap(child => React.isValidElement(child) && child.type === React.Fragment
    ? childNodes(child.props.children) : [child]);
}

function elementsOfType(children, type) {
  const result = [];
  for (const child of childNodes(children)) {
    if (!React.isValidElement(child)) continue;
    const tag = typeof child.type === 'string' ? child.type : child.props.node?.tagName;
    if (tag === type) result.push(child);
    else if (tag && !['table', 'td', 'th'].includes(tag)) result.push(...elementsOfType(child.props.children, type));
  }
  return result;
}

// Keep the original React cell contents and handlers. No DOM copying, hidden
// second table, new requests, or permission/action implementations are needed.
export function getTileRows(table) {
  if (!React.isValidElement(table) || table.type !== 'table') return null;
  const header = elementsOfType(table.props.children, 'thead')[0];
  const headerRows = header ? elementsOfType(header.props.children, 'tr') : [];
  const labels = headerRows.length ? childNodes(headerRows.at(-1).props.children)
    .filter(cell => React.isValidElement(cell) && ['th', 'td'].includes(typeof cell.type === 'string' ? cell.type : cell.props.node?.tagName)) : [];
  const sections = elementsOfType(table.props.children, 'tbody');
  const rows = sections.length ? sections.flatMap(section => elementsOfType(section.props.children, 'tr'))
    : elementsOfType(table.props.children, 'tr').filter(row => !headerRows.includes(row));
  // Custom row components cannot be safely invoked outside React. Preserve
  // their original table rather than dropping rows/actions.
  if (sections.some(section => childNodes(section.props.children).some(child =>
    React.isValidElement(child) && typeof child.type !== 'string' && child.type !== React.Fragment && !child.props.node?.tagName))) return null;
  if (!rows.length) return null;
  return rows.map(row => ({ row, cells: childNodes(row.props.children).filter(cell => React.isValidElement(cell) &&
    ['td', 'th'].includes(typeof cell.type === 'string' ? cell.type : cell.props.node?.tagName)), labels }));
}

function isResizer(element) {
  return element.props['data-column-resize-handle'] || element.props.style?.cursor === 'col-resize' ||
    (element.props.onResizeStart && element.props.onReset);
}

function labelText(children) {
  return childNodes(children).map(child => {
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    if (!React.isValidElement(child) || isResizer(child) ||
      ['button', 'input', 'select', 'svg'].includes(child.type) || child.props.style?.position === 'absolute') return '';
    return labelText(child.props.children);
  }).join(' ').trim();
}

function containsControl(children) {
  return childNodes(children).some(child => React.isValidElement(child) && !isResizer(child) &&
    (['button', 'input', 'select', 'textarea', 'a'].includes(child.type) || child.props.onClick ||
      child.props.onChange || containsControl(child.props.children)));
}

function withoutResizers(children) {
  return childNodes(children).filter(child => !React.isValidElement(child) || !isResizer(child))
    .map(child => React.isValidElement(child) && child.props.children !== undefined
      ? React.cloneElement(child, undefined, withoutResizers(child.props.children)) : child);
}

export function getTileSections({ cells, labels }, summaryKeys = []) {
  const fields = cells.map((cell, index) => ({ cell, index,
    label: labels[index] ? labelText(labels[index].props.children) : `Field ${index + 1}`,
    key: String(cell.key || '').split('$').at(-1) }));
  const actions = fields.filter(field => /^(actions?|options?|controls?|select|profile)$/i.test(field.label) ||
    (!field.label && containsControl(field.cell.props.children)));
  const data = fields.filter(field => !actions.includes(field));
  const preferred = summaryKeys.map(key => data.find(field => field.key === key)).filter(Boolean);
  const summary = [...preferred, ...data.filter(field => !preferred.includes(field))].slice(0, 6);
  return { actions, summary, remaining: data.filter(field => !summary.includes(field)) };
}

function TileFields({ fields }) {
  return fields.map(({ cell, index, label }) => <div key={cell.key || index} data-tile-field
    style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, 36%) minmax(0, 1fr)',
      alignItems: 'start', gap: 8, padding: '4px 0', minWidth: 0 }}>
    {!(cell.props.colSpan > 1) && <span style={{ fontSize: '0.72rem', lineHeight: 1.4,
      fontWeight: 500, color: 'var(--text-secondary, #64748b)', overflowWrap: 'anywhere' }}>{label}</span>}
    <div {...interactionProps(cell.props)} style={{ minWidth: 0, overflowWrap: 'anywhere',
      gridColumn: cell.props.colSpan > 1 ? '1 / -1' : undefined,
      color: cell.props.style?.color, fontWeight: cell.props.style?.fontWeight }}>
      {cell.props.children}
    </div>
  </div>);
}

function interactionProps(props) {
  return Object.fromEntries(Object.entries(props).filter(([key]) =>
    /^on[A-Z]|^data-|^aria-/.test(key) || ['id', 'title', 'tabIndex', 'role'].includes(key)));
}

export default function MobileTableView({ id, children, view: controlledView, hideToggle = false, summaryKeys = [] }) {
  const [savedView, setView, mobile] = useTableViewPreference(id);
  const view = controlledView === 'table' || controlledView === 'tiles' ? controlledView : savedView;
  const [page, setPage] = useState({ id, index: 0 });
  const [expandedRows, setExpandedRows] = useState(() => new Set());
  const table = React.Children.toArray(children).find(child => React.isValidElement(child) && child.type === 'table');
  let tiles = null;
  if (view === 'tiles') {
    try { tiles = getTileRows(table); } catch (_error) {}
  }
  const pageCount = Math.max(1, Math.ceil((tiles?.length || 0) / 25));
  const pageIndex = Math.min(page.id === id ? page.index : 0, pageCount - 1);
  return <ErrorBoundary key={`${id}:${view}`} fallback={children}><div data-table-view-id={id} style={{ minWidth: 0, width: '100%' }}>
    {!hideToggle && <div style={{ padding: '6px 4px' }}>
      <TableViewToggle view={view} onChange={setView} />
    </div>}
    {tiles ? <>
      {tiles[0].labels.some(label => containsControl(label.props.children)) && <details
        style={{ margin: '4px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        <summary style={{ cursor: 'pointer', padding: '5px 0' }}>Column controls &amp; selection</summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '8px 0' }}>
          {tiles[0].labels.filter(label => containsControl(label.props.children)).map((label, index) =>
            <div {...interactionProps(label.props)} key={label.key || index}
              style={{ position: 'relative', minWidth: 100, maxWidth: '100%' }}>
              {withoutResizers(label.props.children)}
            </div>)}
        </div>
      </details>}
      <div style={{ display: 'grid', alignItems: 'start', gap: 10, padding: 8,
        gridTemplateColumns: mobile ? 'minmax(0, 1fr)' : 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))' }}>
        {tiles.slice(pageIndex * 25, (pageIndex + 1) * 25).map((tile, index) => {
          const { row } = tile;
          const { actions, summary, remaining } = getTileSections(tile, summaryKeys);
          const rowKey = `${id}:${row.key || pageIndex * 25 + index}`;
          const expanded = expandedRows.has(rowKey);
          return <article {...interactionProps(row.props)} key={row.key || index} aria-label={`Record ${pageIndex * 25 + index + 1}`}
            style={{ border: '1px solid var(--border-light, #cbd5e1)', borderRadius: 8, padding: '8px 10px',
              fontSize: '0.82rem', lineHeight: 1.35,
              background: row.props.style?.backgroundColor || 'var(--bg-surface, white)',
              color: row.props.style?.color || 'var(--text-primary, #111827)',
              opacity: row.props.style?.opacity, pointerEvents: row.props.style?.pointerEvents, minWidth: 0 }}>
            {actions.length > 0 && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, paddingBottom: 6, marginBottom: 3, borderBottom: '1px solid var(--border-light)' }}>
              {actions.map(({ cell, index: cellIndex }) => <div {...interactionProps(cell.props)} key={cell.key || cellIndex}>
                {cell.props.children}
              </div>)}
            </div>}
            <TileFields fields={summary} />
            {expanded && <TileFields fields={remaining} />}
            {remaining.length > 0 && <button type="button" aria-expanded={expanded}
              onClick={event => {
                event.stopPropagation();
                setExpandedRows(current => {
                  const next = new Set(current);
                  if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey);
                  return next;
                });
              }} style={{ marginTop: 6, padding: '4px 0', border: 'none', background: 'transparent',
                cursor: 'pointer', color: 'var(--accent-color, #2563eb)', fontSize: '0.75rem', fontWeight: 600 }}>
              {expanded ? 'Show less' : `View details (${remaining.length})`}
            </button>}
          </article>;
        })}
      </div>
      {pageCount > 1 && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 10 }}>
        <button type="button" disabled={pageIndex === 0} onClick={() => setPage({ id, index: pageIndex - 1 })}>Previous tiles</button>
        <span>{pageIndex + 1} / {pageCount}</span>
        <button type="button" disabled={pageIndex + 1 >= pageCount} onClick={() => setPage({ id, index: pageIndex + 1 })}>Next tiles</button>
      </div>}
    </> : children}
  </div></ErrorBoundary>;
}
