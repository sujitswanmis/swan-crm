'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import styles from './CRMDesignSystem.module.css';

// Opt-in presentation primitives. Data, permissions and actions belong to callers.
export { styles as crmStyles };

const classes = (...values) => values.filter(Boolean).join(' ');

export function CRMPage({ children, className, ...props }) {
  return <div {...props} className={classes(styles.page, className)}>{children}</div>;
}

export function CRMPageHeader({ title, description, icon: Icon, actions, className, children, ...props }) {
  return <header {...props} className={classes(styles.header, className)}>
    <div className={styles.headingGroup}>
      {Icon && <span className={styles.headingIcon}><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span>}
      <div className={styles.headingCopy}>
        <h2 className={styles.title}>{title}</h2>
        {description && <p className={styles.description}>{description}</p>}
        {children}
      </div>
    </div>
    {actions && <div className={styles.headerActions}>{actions}</div>}
  </header>;
}

export function CRMCard({ children, className, ...props }) {
  return <div {...props} className={classes(styles.card, className)}>{children}</div>;
}

export function CRMToolbar({ children, className, ...props }) {
  return <div {...props} className={classes(styles.toolbar, className)}>{children}</div>;
}

export function CRMStatusBadge({ children, tone = 'neutral', className, ...props }) {
  return <span {...props} data-tone={tone} className={classes(styles.badge, className)}>
    <span aria-hidden="true" className={styles.statusDot} />{children}
  </span>;
}

export function CRMViewToggle({ value, onChange, items = [], label = 'Data view' }) {
  return <div role="group" aria-label={label} className={styles.viewToggle}>
    {items.map(item => {
      const Icon = item.icon;
      return <button key={item.id} type="button" aria-label={`${item.label} view`} title={item.title || `${item.label} View`}
        aria-pressed={value === item.id} onClick={() => onChange?.(item.id)}>
        {Icon && <Icon size={14} strokeWidth={1.8} aria-hidden="true" />}{item.label}
      </button>;
    })}
  </div>;
}

export function CRMTabs({ id, items = [], value, onChange, label = 'Page views', className }) {
  const generatedId = useId();
  const tabsId = id || generatedId;
  const refs = useRef({});
  const enabled = items.filter(item => !item.disabled);
  const current = enabled.find(item => item.id === value)?.id || enabled[0]?.id;
  const keyDown = (event, itemId) => {
    if (!enabled.length) return;
    const index = enabled.findIndex(item => item.id === itemId);
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % enabled.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + enabled.length) % enabled.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = enabled.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      onChange?.(enabled[next].id);
      refs.current[enabled[next].id]?.focus();
    }
  };
  return <div role="tablist" aria-label={label} className={classes(styles.tabs, className)}>
    {items.map(item => {
      const Icon = item.icon;
      return <button key={item.id} ref={node => { refs.current[item.id] = node; }}
        id={`${tabsId}-tab-${item.id}`} type="button" role="tab"
        aria-selected={current === item.id} aria-controls={`${tabsId}-panel-${item.id}`}
        tabIndex={current === item.id ? 0 : -1} disabled={item.disabled}
        onClick={() => onChange?.(item.id)} onKeyDown={event => keyDown(event, item.id)} className={styles.tab}>
        {Icon && <Icon size={15} strokeWidth={1.8} aria-hidden="true" />}
        {item.label}
        {item.count !== undefined && <span className={styles.tabCount}>{item.count}</span>}
      </button>;
    })}
  </div>;
}

// No key or animation on the panel: existing forms and fixed dialogs retain state.
export function CRMTabPanel({ tabsId, value, children }) {
  return <div id={`${tabsId}-panel-${value}`} role="tabpanel" aria-labelledby={`${tabsId}-tab-${value}`} tabIndex={0} className={styles.panel}>{children}</div>;
}

function configuredPageSize() {
  try {
    if (typeof window !== 'undefined') {
      const value = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}').defaultPageSize;
      const size = value === 'All' ? 100000 : Number(value);
      if (Number.isFinite(size) && size > 0) return Math.floor(size);
    }
  } catch { /* Storage can be unavailable; render with the standard default. */ }
  return 15;
}

export function useCRMPageSize(onReset) {
  const [size, setSize] = useState(configuredPageSize);
  const changeSize = useCallback(value => {
    const next = value === 'All' ? 100000 : Number(value);
    if (!Number.isFinite(next) || next <= 0) return;
    setSize(Math.floor(next));
    onReset?.(1);
  }, [onReset]);
  useEffect(() => {
    const update = () => changeSize(configuredPageSize());
    window.addEventListener('crm_page_nav_updated', update);
    window.addEventListener('crm_config_updated', update);
    return () => {
      window.removeEventListener('crm_page_nav_updated', update);
      window.removeEventListener('crm_config_updated', update);
    };
  }, [changeSize]);
  return [size, changeSize];
}

function configuredPageSizes() {
  const defaults = [5, 10, 15, 20, 25, 50, 100, 100000];
  try {
    if (typeof window === 'undefined') return defaults;
    const value = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}').availablePageSizes;
    const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
    const sizes = values.map(item => String(item).trim() === 'All' ? 100000 : Number(item)).filter(size => Number.isInteger(size) && size > 0);
    return sizes.length ? [...new Set([...sizes, 100000])].sort((a, b) => a - b) : defaults;
  } catch { return defaults; }
}

export function useCRMPageSizeOptions(currentSize) {
  const [sizes, setSizes] = useState(configuredPageSizes);
  useEffect(() => {
    const update = () => setSizes(configuredPageSizes());
    window.addEventListener('crm_page_nav_updated', update);
    window.addEventListener('crm_config_updated', update);
    return () => {
      window.removeEventListener('crm_page_nav_updated', update);
      window.removeEventListener('crm_config_updated', update);
    };
  }, []);
  return [...new Set([...sizes, currentSize])].sort((a, b) => a - b);
}

// Fit once per container size, then keep each drag independent of other columns.
export function fitCRMColumnWidths(widths, minimums, availableWidth, fixedColumns = ['select', 'actions']) {
  const keys = Object.keys(widths);
  const fitted = Object.fromEntries(keys.map(key => [key, Math.max(minimums[key] || 70, Number(widths[key]) || 120)]));
  const flexible = keys.filter(key => !fixedColumns.includes(key));
  if (!flexible.length || !Number.isFinite(availableWidth) || availableWidth <= 0) return fitted;
  const fixedTotal = keys.filter(key => !flexible.includes(key)).reduce((sum, key) => sum + fitted[key], 0);
  const minimumTotal = fixedTotal + flexible.reduce((sum, key) => sum + (minimums[key] || 70), 0);
  const target = Math.max(Math.floor(availableWidth), minimumTotal);
  const total = keys.reduce((sum, key) => sum + fitted[key], 0);
  const delta = target - total;
  const weights = flexible.map(key => delta < 0 ? fitted[key] - (minimums[key] || 70) : fitted[key]);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  if (!delta || !weightTotal) return fitted;
  let remaining = Math.abs(delta);
  flexible.forEach((key, index) => {
    const share = index === flexible.length - 1 ? remaining : Math.abs(delta) * weights[index] / weightTotal;
    fitted[key] += delta < 0 ? -share : share;
    remaining -= share;
  });
  return fitted;
}

/** Dedicated opt-in sizing: no shared/global table behavior is changed. */
const NO_MAX_WIDTHS = {};
export function useCRMResizableTable(storageKey, defaultWidths, minimums, enabled = true, maximums = NO_MAX_WIDTHS) {
  const [initialSizing] = useState(() => {
    let saved = {};
    try {
      if (typeof window !== 'undefined') saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {};
    } catch { /* Keep usable defaults when preferences are unavailable. */ }
    const keys = Object.keys(defaultWidths);
    const widths = Object.fromEntries(keys.map(key => {
      const value = Number(saved[key]);
      const minimum = minimums[key] || 70;
      const maximum = Math.max(minimum, maximums[key] || Infinity);
      return [key, Math.min(maximum, Math.max(minimum, Number.isFinite(value) && value > 0 ? value : defaultWidths[key]))];
    }));
    return { widths, hasSavedWidths: keys.every(key => Number.isFinite(Number(saved[key])) && Number(saved[key]) > 0) };
  });
  const [colWidths, setColWidths] = useState(initialSizing.widths);
  const [resizingCol, setResizingCol] = useState(null);
  const hostRef = useRef(null);
  const attachContainer = useCallback(node => { hostRef.current = node; }, []);
  const widthsRef = useRef(colWidths);
  const measuredWidthRef = useRef(0);
  const manualSizingRef = useRef(initialSizing.hasSavedWidths);
  const dragRef = useRef(null);
  const disposeDragRef = useRef(null);

  const applyWidths = useCallback((next, persist = false) => {
    widthsRef.current = next;
    setColWidths(next);
    if (persist) {
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Storage is optional. */ }
    }
  }, [storageKey]);

  useEffect(() => {
    if (!enabled || !hostRef.current) return;
    const host = hostRef.current;
    const measure = () => {
      const width = Math.floor(host.clientWidth);
      if (dragRef.current || width <= 0 || width === measuredWidthRef.current) return;
      measuredWidthRef.current = width;
      // Honor saved/dragged widths that need scrolling instead of squeezing them.
      const total = Object.values(widthsRef.current).reduce((sum, value) => sum + value, 0);
      if (manualSizingRef.current && total >= width) return;
      applyWidths(fitCRMColumnWidths(widthsRef.current, minimums, width), true);
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(host);
    window.addEventListener('resize', measure);
    const frame = window.requestAnimationFrame(measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.cancelAnimationFrame(frame);
      measuredWidthRef.current = 0;
    };
  }, [enabled, minimums, applyWidths]);

  const handleResizeStart = useCallback((event, column) => {
    if (!(column in defaultWidths)) return;
    event.preventDefault();
    event.stopPropagation();
    disposeDragRef.current?.();
    const startX = event.touches?.[0]?.clientX ?? event.clientX;
    if (!Number.isFinite(startX)) return;
    const original = { ...widthsRef.current };
    manualSizingRef.current = true;
    dragRef.current = { column };
    setResizingCol(column);
    const move = moveEvent => {
      const currentX = moveEvent.touches?.[0]?.clientX ?? moveEvent.clientX;
      if (!Number.isFinite(currentX)) return;
      if (moveEvent.cancelable) moveEvent.preventDefault();
      const minimum = minimums[column] || 70;
      const maximum = Math.max(minimum, maximums[column] || Infinity);
      applyWidths({ ...original, [column]: Math.min(maximum, Math.max(minimum, original[column] + currentX - startX)) });
    };
    const dispose = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
      dragRef.current = null;
      disposeDragRef.current = null;
    };
    const end = () => {
      dispose();
      applyWidths(widthsRef.current, true);
      setResizingCol(null);
    };
    disposeDragRef.current = dispose;
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
  }, [defaultWidths, minimums, maximums, applyWidths]);

  useEffect(() => () => { disposeDragRef.current?.(); }, []);
  const resetColWidth = useCallback(column => {
    manualSizingRef.current = true;
    const fittedDefaults = fitCRMColumnWidths(defaultWidths, minimums, measuredWidthRef.current);
    if (column in fittedDefaults) applyWidths({ ...widthsRef.current, [column]: fittedDefaults[column] }, true);
  }, [defaultWidths, minimums, applyWidths]);
  const getTotalTableWidth = useCallback(() => Object.values(colWidths).reduce((sum, width) => sum + width, 0), [colWidths]);
  return { attachContainer, colWidths, resizingCol, handleResizeStart, resetColWidth, getTotalTableWidth };
}
