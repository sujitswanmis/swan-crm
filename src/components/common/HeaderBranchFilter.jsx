'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, GitBranch, Search } from 'lucide-react';

function calculateMenuPosition(triggerEl) {
  if (!triggerEl || typeof window === 'undefined') return null;
  const rect = triggerEl.getBoundingClientRect();
  const menuWidth = Math.min(360, window.innerWidth - 24);
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

export default function HeaderBranchFilter({
  value = 'All',
  onChange,
  branches = [],
  disabled = false
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
    const list = [
      {
        value: 'All',
        code: 'All Branches',
        name: '',
        isAll: true
      }
    ];

    (branches || []).forEach(b => {
      const code = b.branch_code || b.custom_code || b.id || '';
      const name = b.branch_name || b.name || '';
      const customCode = b.custom_code || '';
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
  }, [branches]);

  // Selected Option resolution
  const selectedOption = useMemo(() => {
    if (!value || value === 'All' || value.toLowerCase() === 'all companies') {
      return allOptions[0];
    }
    const valUpper = String(value).toUpperCase().trim();
    return (
      allOptions.find(o => 
        String(o.value).toUpperCase() === valUpper ||
        String(o.code).toUpperCase() === valUpper ||
        String(o.customCode).toUpperCase() === valUpper
      ) || allOptions[0]
    );
  }, [allOptions, value]);

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
    if (disabled || !allOptions.length) return;
    const pos = calculateMenuPosition(triggerRef.current);
    if (!pos) return;
    setMenuPosition(pos);
    setSearchQuery('');
    const currentIdx = filteredOptions.findIndex(o => o.value === selectedOption.value);
    setActiveIndex(currentIdx >= 0 ? currentIdx : 0);
    setIsOpen(true);
  };

  const closeMenu = (restoreFocus = false) => {
    setIsOpen(false);
    setSearchQuery('');
    if (restoreFocus) triggerRef.current?.focus();
  };

  const selectOption = (opt) => {
    if (disabled || !opt) return;
    onChange?.(opt.value);
    closeMenu(true);
  };

  // Focus & Click outside listeners
  useEffect(() => {
    if (!isOpen) return;
    searchInputRef.current?.focus();

    const handleOutside = (e) => {
      if (!triggerRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) {
        closeMenu();
      }
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

  // Scroll active item into view
  useEffect(() => {
    if (isOpen) {
      listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }, [isOpen, activeIndex]);

  // Keyboard navigation
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
    <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
      {/* Trigger Button (Matches Navbar Style: 36px height) */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        title={selectedOption ? `${selectedOption.code} ${selectedOption.name}`.trim() : 'Select Branch'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          height: '36px',
          padding: '0.3rem 0.65rem',
          borderRadius: '9px',
          border: isOpen ? '1.5px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light, #e2e8f0)',
          background: 'var(--bg-surface, #ffffff)',
          color: 'var(--text-primary, #0f172a)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxShadow: isOpen ? '0 0 0 3px rgba(37, 99, 235, 0.15)' : 'var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.05))',
          transition: 'all 0.18s ease',
          textAlign: 'left',
          maxWidth: '260px'
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

        <span style={{ minWidth: 0, flex: 1, lineHeight: 1.2 }}>
          {selectedOption.isAll ? (
            <span style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary, #0f172a)', whiteSpace: 'nowrap' }}>
              All Branches
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
          )}
        </span>

        <ChevronDown
          size={13}
          style={{
            color: 'var(--text-secondary, #64748b)',
            flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease'
          }}
        />
      </button>

      {/* Floating Popover Portal (Exact Match to WhatsApp Official Style) */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            zIndex: 100020,
            left: `${menuPosition?.left}px`,
            top: menuPosition?.top ? `${menuPosition.top}px` : undefined,
            bottom: menuPosition?.bottom ? `${menuPosition.bottom}px` : undefined,
            width: `${menuPosition?.width}px`,
            maxHeight: `${menuPosition?.maxHeight}px`,
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: '16px',
            border: '1px solid var(--border-light, #e2e8f0)',
            boxShadow: '0 20px 50px -10px rgba(15, 23, 42, 0.22), 0 4px 14px rgba(15, 23, 42, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'Inter, system-ui, sans-serif',
            animation: 'fadeInMenu 0.16s ease-out'
          }}
        >
          {/* Header Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.65rem 0.95rem',
              borderBottom: '1px solid var(--border-light, #f1f5f9)',
              background: 'var(--bg-secondary, #f8fafc)'
            }}
          >
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
              BRANCH / PLANT
            </span>
            <span
              style={{
                borderRadius: '9999px',
                background: '#eff6ff',
                padding: '2px 8px',
                fontFamily: 'monospace',
                fontSize: '9px',
                fontWeight: 600,
                color: '#2563eb'
              }}
            >
              {filteredOptions.length} {filteredOptions.length === 1 ? 'option' : 'options'}
            </span>
          </div>

          {/* Search Input Box */}
          <div style={{ padding: '0.55rem 0.65rem 0.35rem 0.65rem' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: '10px',
                  color: '#94a3b8',
                  pointerEvents: 'none'
                }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search branch code or name..."
                style={{
                  width: '100%',
                  height: '34px',
                  padding: '0 0.65rem 0 2rem',
                  fontSize: '0.78rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  background: 'var(--bg-secondary, #f8fafc)',
                  color: 'var(--text-primary, #0f172a)',
                  outline: 'none',
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
              const isSelected = opt.value === selectedOption.value;
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
                    borderRadius: '10px',
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
                        All Branches
                      </span>
                    ) : (
                      <>
                        <span style={{ display: 'block', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.80rem', color: isSelected ? 'var(--accent-color, #2563eb)' : 'var(--text-primary, #0f172a)' }}>
                          {opt.code}
                        </span>
                        {opt.name && (
                          <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginTop: '1px' }}>
                            {opt.name}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Checkmark Indicator */}
                  {isSelected && (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '18px',
                        height: '18px',
                        borderRadius: '9999px',
                        background: '#dbeafe',
                        color: 'var(--accent-color, #2563eb)',
                        flexShrink: 0
                      }}
                    >
                      <Check size={11} strokeWidth={2.8} />
                    </span>
                  )}
                </div>
              );
            })}

            {!filteredOptions.length && (
              <p style={{ margin: 0, padding: '1.25rem', textAlign: 'center', fontSize: '0.78rem', color: '#94a3b8' }}>
                No branches match your search.
              </p>
            )}
          </div>

          {/* Footer Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.45rem 0.85rem',
              borderTop: '1px solid var(--border-light, #f1f5f9)',
              background: 'var(--bg-secondary, #f8fafc)',
              fontSize: '9px',
              color: '#94a3b8'
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
