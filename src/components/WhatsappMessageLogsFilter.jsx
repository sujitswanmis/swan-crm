'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Check, ChevronDown, GitBranch, Search, SlidersHorizontal } from 'lucide-react';

const TONES = {
  emerald: { pill: 'wa:border-emerald-100 wa:bg-emerald-50 wa:text-emerald-600', dot: 'wa:bg-emerald-500 wa:shadow-[0_0_7px_#10b98155]' },
  rose: { pill: 'wa:border-rose-100 wa:bg-rose-50 wa:text-rose-500', dot: 'wa:bg-rose-500 wa:shadow-[0_0_7px_#f43f5e44]' },
  amber: { pill: 'wa:border-amber-100 wa:bg-amber-50 wa:text-amber-600', dot: 'wa:bg-amber-400' },
  indigo: { pill: 'wa:border-indigo-100 wa:bg-indigo-50 wa:text-indigo-500', dot: 'wa:bg-indigo-400' }
};

function FilterMark({ kind, tone = 'indigo', small = false }) {
  const colors = TONES[tone] || TONES.indigo;
  const Icon = kind === 'company' ? Building2 : kind === 'branch' ? GitBranch : SlidersHorizontal;
  return <span aria-hidden="true" className={`wa:inline-flex wa:shrink-0 wa:items-center wa:justify-center wa:rounded-lg wa:border ${small ? 'wa:h-6 wa:w-6' : 'wa:h-8 wa:w-8'} ${colors.pill}`}>
    {kind === 'status' && tone !== 'indigo'
      ? <span className={`wa:h-1.5 wa:w-1.5 wa:rounded-full ${colors.dot}`} />
      : <Icon size={small ? 12 : 14} strokeWidth={1.7} />}
  </span>;
}

function menuPosition(trigger, kind) {
  if (!trigger || typeof window === 'undefined') return null;
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, kind === 'status' ? 264 : 368), window.innerWidth - 24);
  const below = window.innerHeight - rect.bottom - 20;
  const above = rect.top - 20;
  const flip = below < 240 && above > below;
  return {
    left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
    width,
    maxHeight: Math.max(96, Math.min(420, flip ? above : below)),
    ...(flip ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 })
  };
}

/** A local, read-only filter. Option values stay internal; only labels/codes render. */
export default function WhatsappMessageLogsFilter({ label, value, onChange, options = [], disabled = false, searchable = false, kind = 'status', width = 'wa:w-40' }) {
  const [menu, setMenu] = useState(null);
  const trigger = useRef(null), panel = useRef(null), search = useRef(null), list = useRef(null);
  const typeahead = useRef({ text: '', at: 0 });
  const id = useId();
  const open = Boolean(menu) && !disabled;
  const selected = options.find(option => option.value === value);
  const filtered = useMemo(() => {
    const query = (menu?.query || '').trim().toLocaleLowerCase('en-IN');
    return query ? options.filter(option => `${option.label} ${option.description || ''}`.toLocaleLowerCase('en-IN').includes(query)) : options;
  }, [options, menu?.query]);
  const active = filtered.find(option => option.value === menu?.activeValue) || filtered[0];
  const activeIndex = filtered.indexOf(active);
  const activeId = open && active ? `${id}-option-${activeIndex}` : undefined;
  const measure = useCallback(() => menuPosition(trigger.current, kind), [kind]);
  const close = useCallback((restoreFocus = false) => {
    setMenu(null);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  const show = edge => {
    if (disabled || !options.length) return;
    const position = measure();
    if (!position) return;
    const first = edge === 'last' ? options.at(-1) : edge === 'first' ? options[0] : selected || options[0];
    typeahead.current = { text: '', at: 0 };
    setMenu({ query: '', activeValue: first.value, position });
  };
  const choose = option => {
    if (disabled || !option) return;
    onChange?.(option.value);
    close(true);
  };

  useEffect(() => {
    if (!open) return;
    if (searchable) search.current?.focus();
    const outside = event => {
      if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) close();
    };
    const escape = event => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
    };
    const reposition = event => {
      if (panel.current?.contains(event.target)) return;
      const position = measure();
      if (!position) { close(); return; }
      setMenu(current => current && JSON.stringify(current.position) !== JSON.stringify(position) ? { ...current, position } : current);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, searchable, measure, close]);

  useEffect(() => {
    if (open) list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [open, activeIndex, menu?.query]);

  const onKeyDown = event => {
    if (disabled || event.isComposing || event.nativeEvent?.isComposing) return;
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Tab' && open) { close(true); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { show(); return; }
      if (!filtered.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const index = (activeIndex + step + filtered.length) % filtered.length;
      setMenu(current => ({ ...current, activeValue: filtered[index].value }));
    } else if ((event.key === 'Home' || event.key === 'End') && (!searchable || !open)) {
      event.preventDefault();
      if (!open) show(event.key === 'Home' ? 'first' : 'last');
      else if (filtered.length) setMenu(current => ({ ...current, activeValue: (event.key === 'Home' ? filtered[0] : filtered.at(-1)).value }));
    } else if (event.key === 'Enter' || (event.key === ' ' && (!searchable || !open))) {
      event.preventDefault();
      if (open) choose(active); else show();
    } else if (!searchable && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      const now = Date.now();
      const text = `${now - typeahead.current.at < 650 ? typeahead.current.text : ''}${event.key}`.toLocaleLowerCase('en-IN');
      typeahead.current = { text, at: now };
      const match = options.find(option => option.label.toLocaleLowerCase('en-IN').startsWith(text));
      if (match) {
        if (!open) {
          const position = measure();
          if (position) setMenu({ query: '', activeValue: match.value, position });
        } else setMenu(current => ({ ...current, activeValue: match.value }));
      }
    }
  };

  return <div className={`wa:block wa:min-w-0 ${width}`}>
    <span id={`${id}-label`} className="wa:mb-1.5 wa:block wa:text-[9px] wa:font-semibold wa:tracking-[0.06em] wa:text-slate-400 wa:uppercase">{label}</span>
    <button ref={trigger} type="button" role={searchable ? undefined : 'combobox'} aria-label={label} aria-describedby={`${id}-value`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={!searchable ? activeId : undefined}
      disabled={disabled || !options.length} onClick={() => open ? close() : show()} onKeyDown={onKeyDown} title={[selected?.label, selected?.description].filter(Boolean).join(' · ')}
      className={`wa-log-filter-trigger wa:flex wa:h-10 wa:w-full wa:min-w-0 wa:items-center wa:gap-2 wa:rounded-lg wa:border wa:bg-white wa:px-2.5 wa:text-left wa:text-xs wa:shadow-none wa:transition-all wa:duration-200 wa:hover:-translate-y-0.5 wa:hover:border-indigo-300 wa:hover:shadow-sm wa:focus-visible:outline-none wa:focus-visible:ring-2 wa:focus-visible:ring-indigo-200 wa:disabled:cursor-default wa:disabled:opacity-65 wa:disabled:hover:translate-y-0 ${open ? 'wa:border-indigo-300 wa:ring-2 wa:ring-indigo-100' : 'wa:border-zinc-200'}`}>
      <FilterMark kind={kind} tone={selected?.tone} small />
      <span id={`${id}-value`} className="wa:min-w-0 wa:flex-1 wa:leading-tight"><span className={`wa:block wa:truncate wa:font-medium wa:text-slate-700 ${kind !== 'status' && selected?.description ? 'wa:font-mono wa:text-[10px] wa:tabular-nums' : 'wa:text-[11px]'}`}>{selected?.label || 'Select option'}</span>{kind !== 'status' && selected?.description && <span className="wa:mt-0.5 wa:block wa:truncate wa:text-[9px] wa:text-slate-400">{selected.description}</span>}</span>
      <ChevronDown size={12} aria-hidden="true" className={`wa:shrink-0 wa:text-slate-400 wa:transition-transform wa:duration-200 ${open ? 'wa:rotate-180' : ''}`} />
    </button>
    {open && typeof document !== 'undefined' && createPortal(<div ref={panel} className="wa-log-filter-menu wa-panel-enter wa:flex wa:flex-col wa:overflow-hidden wa:rounded-2xl wa:border wa:border-zinc-200 wa:bg-white" style={{ position: 'fixed', zIndex: 100020, ...menu.position }}>
      <div className="wa:flex wa:shrink-0 wa:items-center wa:justify-between wa:gap-3 wa:border-b wa:border-zinc-100 wa:px-4 wa:py-3"><span className="wa:text-[10px] wa:font-semibold wa:tracking-[0.09em] wa:text-slate-400 wa:uppercase">{label}</span><span className="wa:rounded-full wa:bg-indigo-50 wa:px-2 wa:py-0.5 wa:font-mono wa:text-[9px] wa:font-medium wa:text-indigo-500 wa:tabular-nums">{filtered.length} {filtered.length === 1 ? 'option' : 'options'}</span></div>
      {searchable && <div className="wa:shrink-0 wa:px-3 wa:pt-3 wa:pb-1"><div className="wa:relative"><Search size={14} aria-hidden="true" className="wa:pointer-events-none wa:absolute wa:top-1/2 wa:left-3 wa:-translate-y-1/2 wa:text-slate-400" /><input ref={search} role="combobox" aria-label={`Search ${label}`} aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={activeId} autoComplete="off" spellCheck={false} value={menu.query} onChange={event => setMenu(current => ({ ...current, query: event.target.value, activeValue: null }))} onKeyDown={onKeyDown} placeholder={kind === 'company' ? 'Search company code or name…' : 'Search branch code or name…'} className="wa:h-9 wa:w-full wa:rounded-lg wa:border wa:border-zinc-200 wa:bg-slate-50 wa:pr-3 wa:pl-9 wa:text-[11px] wa:text-slate-700 wa:outline-none wa:placeholder:text-slate-400 wa:focus:border-indigo-200 wa:focus:ring-2 wa:focus:ring-indigo-50" /></div></div>}
      <div ref={list} id={`${id}-list`} role="listbox" aria-label={label} className="wa:min-h-0 wa:flex-1 wa:overflow-y-auto wa:overscroll-contain wa:p-2">
        {filtered.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={option.value === value} data-active={index === activeIndex ? 'true' : undefined} onMouseDown={event => event.preventDefault()} onPointerMove={() => setMenu(current => !current || current.activeValue === option.value ? current : { ...current, activeValue: option.value })} onClick={() => choose(option)}
          className={`wa:flex wa:cursor-pointer wa:items-center wa:gap-3 wa:rounded-xl wa:border wa:px-2.5 wa:py-2.5 wa:transition-colors wa:duration-150 ${index === activeIndex ? 'wa:border-indigo-100 wa:bg-indigo-50/70' : option.value === value ? 'wa:border-transparent wa:bg-slate-50' : 'wa:border-transparent wa:bg-white'}`}>
          <FilterMark kind={kind} tone={option.tone} />
          <span className="wa:min-w-0 wa:flex-1 wa:leading-snug"><span className={`wa:block wa:font-semibold wa:text-slate-700 ${kind === 'status' ? 'wa:text-xs' : 'wa:font-mono wa:text-[11px] wa:tabular-nums'}`}>{option.label}</span>{option.description && <span className="wa:mt-0.5 wa:block wa:break-words wa:text-[11px] wa:font-normal wa:text-slate-400">{option.description}</span>}</span>
          <span aria-hidden="true" className={`wa:flex wa:h-5 wa:w-5 wa:shrink-0 wa:items-center wa:justify-center wa:rounded-full ${option.value === value ? 'wa:bg-indigo-100 wa:text-indigo-600' : 'wa:bg-transparent wa:text-transparent'}`}><Check size={12} strokeWidth={2.5} /></span>
        </div>)}
      </div>
      {!filtered.length && <p role="status" className="wa:m-0 wa:px-5 wa:py-6 wa:text-center wa:text-xs wa:text-slate-400">No matches. Try a different code or name.</p>}
      <div className="wa:flex wa:shrink-0 wa:items-center wa:justify-between wa:border-t wa:border-zinc-100 wa:bg-slate-50/70 wa:px-4 wa:py-2 wa:text-[9px] wa:text-slate-400"><span>↑↓ Navigate <span className="wa:px-1 wa:text-zinc-300">·</span> Enter Select</span><span>Esc Close</span></div>
    </div>, document.body)}
  </div>;
}
