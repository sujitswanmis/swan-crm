'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronDown, Check, X, Package, Tag, IndianRupee } from 'lucide-react';

export default function SearchableProductSelect({
  products = [],
  value = '',
  onChange = () => {},
  onSelectNext = null,
  placeholder = 'Click to search and select product...',
  disabled = false,
  required = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  // Normalize products to uniform objects
  const normalizedProducts = useMemo(() => {
    if (!Array.isArray(products)) return [];
    return products.map(p => {
      if (typeof p === 'string') {
        return { id: p, name: p, price: 0, sku: '' };
      }
      return {
        id: p.id || p.sku || p.name,
        name: p.name || '',
        sku: p.sku || '',
        category: p.category || '',
        sub_category: p.sub_category || '',
        price: p.price != null && p.price !== '' ? Number(p.price) : null,
        uom: p.uom || 'Units',
        description: p.description || ''
      };
    });
  }, [products]);

  // Find currently selected product object
  const currentSelected = useMemo(() => {
    if (!value || typeof value !== 'string' || !value.trim()) return null;
    return normalizedProducts.find(p => p.name === value || p.id === value) || { name: value };
  }, [normalizedProducts, value]);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Auto focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select?.();
      }, 30);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  // Multi-token search filter across name, sku, category, specs
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) {
      return normalizedProducts;
    }

    const tokens = searchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean);

    return normalizedProducts.filter(p => {
      const searchTarget = [
        p.name,
        p.sku,
        p.category,
        p.sub_category,
        p.description
      ].filter(Boolean).join(' ').toLowerCase();

      return tokens.every(token => searchTarget.includes(token));
    });
  }, [normalizedProducts, searchTerm]);

  // Reset highlight index when filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredProducts.length, searchTerm]);

  // Scroll active item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex];
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelectProduct = useCallback((prod) => {
    if (!prod) return;
    onChange(prod);
    setIsOpen(false);
    setSearchTerm('');
    if (typeof onSelectNext === 'function') {
      setTimeout(() => onSelectNext(), 60);
    }
  }, [onChange, onSelectNext]);

  // Keyboard navigation inside search input
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < filteredProducts.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredProducts.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts[highlightedIndex]) {
        handleSelectProduct(filteredProducts[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        minWidth: 0
      }}
    >
      {/* Trigger Bar: Always clear, readable, and clickable */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled) setIsOpen(prev => !prev);
        }}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: 'var(--bg-primary, #ffffff)',
          border: isOpen ? '1.5px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light, #cbd5e1)',
          borderRadius: '8px',
          boxShadow: isOpen ? '0 0 0 3px rgba(37,99,235,0.15)' : 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.45rem', overflow: 'hidden' }}>
          <Package size={15} style={{ color: isOpen ? 'var(--accent-color, #2563eb)' : 'var(--text-secondary, #64748b)', flexShrink: 0 }} />

          {currentSelected?.name ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, overflow: 'hidden', flexWrap: 'nowrap' }}>
              <span style={{
                fontSize: '0.82rem',
                fontWeight: 600,
                color: 'var(--text-primary, #0f172a)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {currentSelected.name}
              </span>

              {currentSelected.sku && (
                <span style={{
                  flexShrink: 0,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'rgba(56,189,248,0.12)',
                  color: '#0284c7',
                  border: '1px solid rgba(56,189,248,0.25)'
                }}>
                  {currentSelected.sku}
                </span>
              )}

              {currentSelected.category && (
                <span style={{
                  flexShrink: 0,
                  fontSize: '0.66rem',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'rgba(148,163,184,0.12)',
                  color: 'var(--text-secondary, #64748b)'
                }}>
                  {currentSelected.category}
                </span>
              )}
            </div>
          ) : (
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted, #94a3b8)' }}>
              {placeholder}
            </span>
          )}
        </div>

        {/* Right Action / Search Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          {currentSelected?.price != null && (
            <span style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#059669'
            }}>
              ₹{Number(currentSelected.price).toLocaleString('en-IN')}
            </span>
          )}

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.2rem',
            padding: '2px 7px',
            borderRadius: '5px',
            background: isOpen ? 'var(--accent-color, #2563eb)' : 'rgba(37,99,235,0.08)',
            color: isOpen ? '#ffffff' : 'var(--accent-color, #2563eb)',
            fontSize: '0.7rem',
            fontWeight: 700,
            border: isOpen ? 'none' : '1px solid rgba(37,99,235,0.2)'
          }}>
            <Search size={11} />
            <span>Search</span>
            <ChevronDown size={11} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </div>
        </div>
      </div>

      {/* Floating Popover with Dedicated Search Bar & Live Results */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 5px)',
            left: 0,
            right: 0,
            zIndex: 1050,
            background: 'var(--bg-surface, #ffffff)',
            border: '1.5px solid var(--border-medium, #94a3b8)',
            borderRadius: '12px',
            boxShadow: '0 16px 36px -4px rgba(0,0,0,0.28), 0 6px 12px rgba(0,0,0,0.1)',
            maxHeight: '320px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Dedicated Search Input Bar at top */}
          <div style={{
            padding: '0.6rem 0.75rem',
            background: 'var(--bg-primary, #f8fafc)',
            borderBottom: '1px solid var(--border-light, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Search size={16} style={{ color: 'var(--accent-color, #2563eb)', flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Search ${normalizedProducts.length} products by name, SKU, series or model...`}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '0.84rem',
                fontWeight: 600,
                color: 'var(--text-primary, #0f172a)',
                padding: '0.1rem 0',
                margin: 0,
                minWidth: 0
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  searchInputRef.current?.focus();
                }}
                style={{
                  background: 'rgba(148,163,184,0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  padding: '3px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary, #64748b)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Subheader Counter / Tip */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.35rem 0.85rem',
            background: 'rgba(148,163,184,0.06)',
            borderBottom: '1px solid var(--border-light, #e2e8f0)',
            fontSize: '0.7rem',
            color: 'var(--text-secondary, #64748b)'
          }}>
            <span>
              {filteredProducts.length === 0
                ? 'No matching products'
                : `Showing all ${filteredProducts.length} products`}
            </span>
            <span style={{ fontSize: '0.66rem', color: 'var(--text-muted, #94a3b8)' }}>
              Use ↑↓ to navigate • Enter to select
            </span>
          </div>

          {/* Scrollable Products List */}
          <div
            ref={listRef}
            style={{
              overflowY: 'auto',
              maxHeight: '260px',
              padding: '0.25rem 0'
            }}
          >
            {filteredProducts.length === 0 ? (
              <div style={{ padding: '1.5rem 1rem', textAlign: 'center', color: 'var(--text-muted, #94a3b8)', fontSize: '0.82rem' }}>
                <Package size={26} style={{ margin: '0 auto 0.4rem auto', opacity: 0.4 }} />
                <div style={{ fontWeight: 600 }}>No products found matching &quot;{searchTerm}&quot;</div>
                <div style={{ fontSize: '0.72rem', marginTop: '0.25rem' }}>Try searching with a shorter keyword or model code</div>
              </div>
            ) : (
              filteredProducts.map((prod, index) => {
                const isSelected = prod.name === currentSelected?.name;
                const isHighlighted = index === highlightedIndex;

                return (
                  <div
                    key={prod.id || `${prod.name}-${index}`}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => handleSelectProduct(prod)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      padding: '0.55rem 0.85rem',
                      background: isHighlighted
                        ? 'rgba(37,99,235,0.09)'
                        : isSelected
                        ? 'rgba(16,185,129,0.07)'
                        : 'transparent',
                      borderLeft: isHighlighted
                        ? '3.5px solid var(--accent-color, #2563eb)'
                        : isSelected
                        ? '3.5px solid #10b981'
                        : '3.5px solid transparent',
                      cursor: 'pointer',
                      transition: 'background 0.1s ease'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        flexWrap: 'wrap'
                      }}>
                        <span style={{
                          fontSize: '0.83rem',
                          fontWeight: isSelected ? 700 : 600,
                          color: isSelected ? '#059669' : 'var(--text-primary, #0f172a)'
                        }}>
                          {prod.name}
                        </span>

                        {prod.sku && (
                          <span style={{
                            fontSize: '0.66rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: 'rgba(56,189,248,0.12)',
                            color: '#0284c7',
                            border: '1px solid rgba(56,189,248,0.25)'
                          }}>
                            {prod.sku}
                          </span>
                        )}

                        {prod.category && (
                          <span style={{
                            fontSize: '0.65rem',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: 'rgba(148,163,184,0.15)',
                            color: 'var(--text-secondary, #64748b)'
                          }}>
                            {prod.category}
                          </span>
                        )}
                      </div>

                      {prod.description && (
                        <div style={{
                          fontSize: '0.72rem',
                          color: 'var(--text-muted, #94a3b8)',
                          marginTop: '0.15rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {prod.description}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {prod.price != null && prod.price !== '' ? (
                        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#059669' }}>
                          ₹{Number(prod.price).toLocaleString('en-IN')}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                          --
                        </div>
                      )}
                      {isSelected && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          fontSize: '0.66rem',
                          color: '#059669',
                          fontWeight: 700
                        }}>
                          <Check size={11} /> Selected
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
