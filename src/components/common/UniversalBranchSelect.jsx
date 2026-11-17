'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, GitBranch, Search } from 'lucide-react';
import { STANDARD_SWAN_BRANCH_LIST, STANDARD_SWAN_BRANCH_MAP, KNOWN_BRANCH_ALIAS_MAP } from '@/utils/branchAccess';

function calculateMenuPosition(triggerEl) {
  if (!triggerEl || typeof window === 'undefined') return null;
  const rect = triggerEl.getBoundingClientRect();
  const menuWidth = Math.min(Math.max(rect.width, 320), 400, window.innerWidth - 24);
  const spaceBelow = window.innerHeight - rect.bottom - 16;
  const spaceAbove = rect.top - 16;
  const flip = spaceBelow < 250 && spaceAbove > spaceBelow;

  return {
    left: Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12)),
    width: menuWidth,
    maxHeight: Math.max(120, Math.min(420, flip ? spaceAbove : spaceBelow)),
    ...(flip ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 })
  };
}

export default function UniversalBranchSelect({
  value = '',
  onChange,
  branches = [],
  mode = 'form', // 'form' | 'filter'
  placeholder = 'Select Company / Branch',
  label = '',
  title = 'BRANCH / PLANT',
  allValue = 'All',
  allLabel = 'All Branches',
  disabled = false,
  required = false,
  name = '',
  style = {},
  triggerStyle = {},
  portalZIndex = 100050
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuPosition, setMenuPosition] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);
  const id = useId();

  // Normalize all available options
  const allOptions = useMemo(() => {
    const list = [];

    if (mode === 'filter') {
      list.push({
        value: allValue,
        code: allLabel,
        name: '',
        customCode: '',
        isAll: true
      });
    }

    const sourceBranches = (Array.isArray(branches) && branches.length > 0)
      ? branches.filter(b => b.is_active !== false)
      : STANDARD_SWAN_BRANCH_LIST;

    sourceBranches.forEach(b => {
      const code = b.branch_code || b.custom_code || b.id || '';
      const name = b.branch_name || b.name || '';
      const customCode = b.custom_code || b.legacy_code || '';
      // Form mode preserves legacy / custom code value if expected, or fallback to branch_code
      const optionValue = customCode || code;

      list.push({
        value: optionValue,
        code: code,
        name: name,
        customCode: customCode,
        isAll: false
      });
    });

    return list;
  }, [branches, mode, allValue, allLabel]);

  // Resolve selected option matching current value
  const selectedOption = useMemo(() => {
    if (mode === 'filter') {
      if (!value || value === allValue || value === 'All' || value.toLowerCase?.() === 'all companies') {
        return allOptions[0];
      }
    }
    if (!value && mode === 'form') {
      return null;
    }

    const valUpper = String(value || '').toUpperCase().trim();
    if (!valUpper) return null;

    // Direct match by value, code, or customCode
    const directMatch = allOptions.find(o => 
      String(o.value).toUpperCase() === valUpper ||
      String(o.code).toUpperCase() === valUpper ||
      String(o.customCode).toUpperCase() === valUpper
    );
    if (directMatch) return directMatch;

    // Match via standard alias map
    for (const [key, aliases] of Object.entries(KNOWN_BRANCH_ALIAS_MAP)) {
      if (key === valUpper || aliases.some(a => a.toUpperCase() === valUpper)) {
        const found = allOptions.find(o => 
          String(o.value).toUpperCase() === key ||
          String(o.customCode).toUpperCase() === key
        );
        if (found) return found;
      }
    }

    return null;
  }, [allOptions, value, mode, allValue]);

  // Filtered options based on search query
  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(o => 
      o.code.toLowerCase().includes(q) ||
      o.name.toLowerCase().includes(q) ||
      (o.customCode && o.customCode.toLowerCase().includes(q))
    );
  }, [allOptions, searchQuery]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const pos = calculateMenuPosition(triggerRef.current);
    if (pos) setMenuPosition(pos);
  }, []);

  const openMenu = () => {
    if (disabled) return;
    updatePosition();
    setSearchQuery('');
    const idx = filteredOptions.findIndex(o => o.value === selectedOption?.value);
    setActiveIndex(idx >= 0 ? idx : 0);
    setIsOpen(true);
  };

  const closeMenu = (restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const selectOption = (opt) => {
    onChange?.(opt.value);
    closeMenu(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => searchInputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (e) => {
      if (
        triggerRef.current?.contains(e.target) ||
        panelRef.current?.contains(e.target)
      ) {
        return;
      }
      closeMenu();
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu(true);
      }
    };

    const handleReposition = () => {
      updatePosition();
    };

    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('focusin', handleOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('focusin', handleOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (isOpen) {
      listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }, [isOpen, activeIndex]);

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) { openMenu(); return; }
      if (!filteredOptions.length) return;
      setActiveIndex(prev => (prev + 1) % filteredOptions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) { openMenu(); return; }
      if (!filteredOptions.length) return;
      setActiveIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && filteredOptions[activeIndex]) {
        selectOption(filteredOptions[activeIndex]);
      } else {
        openMenu();
      }
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0, ...style }}>
      {name && (
        <input type="hidden" name={name} value={value || ''} required={required} />
      )}
      {label && (
        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginBottom: '0.35rem' }}>
          {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        title={selectedOption ? `${selectedOption.code} ${selectedOption.name}`.trim() : placeholder}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.55rem',
          width: '100%',
          minHeight: '38px',
          padding: '0.35rem 0.65rem',
          borderRadius: '7px',
          border: isOpen ? '1.5px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light, #cbd5e1)',
          background: 'var(--bg-surface, #ffffff)',
          color: 'var(--text-primary, #0f172a)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxShadow: isOpen ? '0 0 0 3px rgba(37, 99, 235, 0.15)' : 'none',
          transition: 'all 0.15s ease',
          textAlign: 'left',
          ...triggerStyle
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: 'rgba(37, 99, 235, 0.08)',
            color: 'var(--accent-color, #2563eb)',
            flexShrink: 0
          }}
        >
          <GitBranch size={13} strokeWidth={2} />
        </span>

        <span style={{ minWidth: 0, flex: 1, lineHeight: 1.25 }}>
          {selectedOption ? (
            selectedOption.isAll ? (
              <span style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary, #0f172a)', whiteSpace: 'nowrap' }}>
                {selectedOption.code}
              </span>
            ) : (
              <>
                <span style={{ display: 'block', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-primary, #0f172a)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selectedOption.code}
                </span>
                {selectedOption.name && (
                  <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-secondary, #64748b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedOption.name}
                  </span>
                )}
              </>
            )
          ) : (
            <span style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted, #94a3b8)', whiteSpace: 'nowrap' }}>
              {placeholder}
            </span>
          )}
        </span>

        <ChevronDown
          size={14}
          style={{
            color: 'var(--text-secondary, #64748b)',
            flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.18s ease'
          }}
        />
      </button>

      {/* Floating Searchable Menu Portal */}
      {isOpen && typeof document !== 'undefined' && menuPosition && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            left: `${menuPosition.left}px`,
            width: `${menuPosition.width}px`,
            maxHeight: `${menuPosition.maxHeight}px`,
            ...(menuPosition.top !== undefined ? { top: `${menuPosition.top}px` } : { bottom: `${menuPosition.bottom}px` }),
            zIndex: portalZIndex,
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: '12px',
            border: '1px solid var(--border-light, #e2e8f0)',
            boxShadow: '0 12px 32px -4px rgba(15, 23, 42, 0.16), 0 4px 12px -2px rgba(15, 23, 42, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeInMenu 0.14s ease-out'
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.6rem 0.85rem',
              borderBottom: '1px solid var(--border-light, #f1f5f9)',
              background: 'var(--bg-primary, #f8fafc)'
            }}
          >
            <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase' }}>
              {title}
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                fontFamily: 'monospace',
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: '999px',
                background: 'rgba(37, 99, 235, 0.08)',
                color: 'var(--accent-color, #2563eb)'
              }}
            >
              {filteredOptions.length} {filteredOptions.length === 1 ? 'option' : 'options'}
            </span>
          </div>

          {/* Search Input */}
          <div style={{ padding: '0.5rem 0.65rem 0.35rem 0.65rem', borderBottom: '1px solid var(--border-light, #f1f5f9)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.35rem 0.6rem',
                borderRadius: '8px',
                background: 'var(--bg-primary, #f8fafc)',
                border: '1px solid var(--border-light, #e2e8f0)'
              }}
            >
              <Search size={14} color="#94a3b8" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search branch code or name…"
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  width: '100%',
                  fontSize: '0.78rem',
                  color: 'var(--text-primary, #0f172a)',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Scrollable Options List */}
          <div
            ref={listRef}
            id={`${id}-list`}
            role="listbox"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '0.35rem'
            }}
          >
            {filteredOptions.map((opt, index) => {
              const isSelected = selectedOption && (opt.value === selectedOption.value || (opt.isAll && selectedOption.isAll));
              const isActive = index === activeIndex;

              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  data-active={isActive ? 'true' : undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onPointerMove={() => setActiveIndex(index)}
                  onClick={() => selectOption(opt)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '9px',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                    border: isActive ? '1px solid #bfdbfe' : '1px solid transparent',
                    background: isActive ? '#eff6ff' : isSelected ? '#f8fafc' : 'transparent',
                    marginBottom: '2px'
                  }}
                >
                  {/* Option Icon */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '26px',
                      height: '26px',
                      borderRadius: '7px',
                      background: isSelected ? 'var(--accent-color, #2563eb)' : '#f1f5f9',
                      color: isSelected ? '#ffffff' : '#64748b',
                      flexShrink: 0
                    }}
                  >
                    <GitBranch size={13} strokeWidth={isSelected ? 2.2 : 1.7} />
                  </span>

                  {/* Option Content: Bold Code on Top, Name Below */}
                  <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
                    {opt.isAll ? (
                      <span style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: isSelected ? 'var(--accent-color, #2563eb)' : 'var(--text-primary, #0f172a)' }}>
                        {opt.code}
                      </span>
                    ) : (
                      <>
                        <span style={{ display: 'block', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.78rem', color: isSelected ? 'var(--accent-color, #2563eb)' : 'var(--text-primary, #0f172a)' }}>
                          {opt.code}
                        </span>
                        {opt.name && (
                          <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-secondary, #64748b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {opt.name}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Checkmark when selected */}
                  {isSelected && (
                    <span style={{ color: 'var(--accent-color, #2563eb)', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                      <Check size={14} strokeWidth={2.5} />
                    </span>
                  )}
                </div>
              );
            })}

            {filteredOptions.length === 0 && (
              <div style={{ padding: '1.25rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                No branches found matching "{searchQuery}"
              </div>
            )}
          </div>

          {/* Footer Shortcuts */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.4rem 0.75rem',
              borderTop: '1px solid var(--border-light, #f1f5f9)',
              background: 'var(--bg-primary, #f8fafc)',
              fontSize: '0.66rem',
              color: 'var(--text-secondary, #94a3b8)'
            }}
          >
            <span>↑↓ Navigate · Enter Select</span>
            <span>Esc Close</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
