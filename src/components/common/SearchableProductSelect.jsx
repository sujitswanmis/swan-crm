'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronDown, Check, X, Tag, IndianRupee, Package, Layers } from 'lucide-react';

export default function SearchableProductSelect({
  products = [],
  value = '',
  onChange = () => {},
  onSelectNext = null,
  placeholder = 'Search by product name, SKU or model...',
  disabled = false,
  required = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Normalize products to array of objects
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
    if (!value) return null;
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

  // Filter products based on search query (multi-token search)
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

  // Reset highlighted index when filter changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredProducts.length, searchTerm]);

  // Scroll highlighted item into view
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
      setTimeout(() => onSelectNext(), 50);
    }
  }, [onChange, onSelectNext]);

  // Keyboard navigation inside input
  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

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
      {/* Trigger & Search Bar Box */}
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 20);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0.48rem 0.65rem',
          background: 'var(--bg-primary, #ffffff)',
          border: isOpen ? '1.5px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light, #cbd5e1)',
          borderRadius: '8px',
          boxShadow: isOpen ? '0 0 0 3px rgba(37,99,235,0.12)' : 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
          boxSizing: 'border-box'
        }}
      >
        <Search size={15} style={{ color: isOpen ? 'var(--accent-color, #2563eb)' : 'var(--text-muted, #94a3b8)', flexShrink: 0 }} />

        {isOpen ? (
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={currentSelected?.name ? `Current: ${currentSelected.name}` : placeholder}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '0.82rem',
              color: 'var(--text-primary, #0f172a)',
              padding: 0,
              margin: 0,
              minWidth: 0
            }}
            autoFocus
          />
        ) : (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
            {currentSelected?.name ? (
              <>
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

                {currentSelected.price != null && (
                  <span style={{
                    flexShrink: 0,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#059669',
                    marginLeft: 'auto'
                  }}>
                    ₹{Number(currentSelected.price).toLocaleString('en-IN')}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted, #94a3b8)' }}>
                {placeholder}
              </span>
            )}
          </div>
        )}

        {isOpen && searchTerm ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSearchTerm('');
              inputRef.current?.focus();
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px',
              cursor: 'pointer',
              color: 'var(--text-secondary, #64748b)',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={14} />
          </button>
        ) : (
          <ChevronDown size={14} style={{ color: 'var(--text-muted, #94a3b8)', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
        )}
      </div>

      {/* Floating Dropdown Results Popover */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 1050,
            background: 'var(--bg-surface, #ffffff)',
            border: '1px solid var(--border-medium, #cbd5e1)',
            borderRadius: '10px',
            boxShadow: '0 12px 30px -4px rgba(0,0,0,0.22), 0 4px 8px rgba(0,0,0,0.08)',
            maxHeight: '280px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Quick Header / Counter */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.4rem 0.75rem',
            background: 'var(--bg-primary, #f8fafc)',
            borderBottom: '1px solid var(--border-light, #e2e8f0)',
            fontSize: '0.7rem',
            color: 'var(--text-secondary, #64748b)'
          }}>
            <span>
              {filteredProducts.length === 0
                ? 'No matches found'
                : `Showing ${Math.min(filteredProducts.length, 60)} of ${filteredProducts.length} items`}
            </span>
            <span style={{ fontSize: '0.66rem', color: 'var(--text-muted, #94a3b8)' }}>
              ↑↓ to navigate • Enter to select
            </span>
          </div>

          {/* Scrollable Items List */}
          <div
            ref={listRef}
            style={{
              overflowY: 'auto',
              maxHeight: '240px',
              padding: '0.25rem 0'
            }}
          >
            {filteredProducts.length === 0 ? (
              <div style={{ padding: '1.25rem 1rem', textAlign: 'center', color: 'var(--text-muted, #94a3b8)', fontSize: '0.8rem' }}>
                <Package size={22} style={{ margin: '0 auto 0.4rem auto', opacity: 0.5 }} />
                <div>No products found matching &quot;{searchTerm}&quot;</div>
                <div style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>Try searching by general name, size or SKU code</div>
              </div>
            ) : (
              filteredProducts.slice(0, 60).map((prod, index) => {
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
                      padding: '0.55rem 0.75rem',
                      background: isHighlighted
                        ? 'rgba(37,99,235,0.08)'
                        : isSelected
                        ? 'rgba(16,185,129,0.06)'
                        : 'transparent',
                      borderLeft: isHighlighted
                        ? '3px solid var(--accent-color, #2563eb)'
                        : isSelected
                        ? '3px solid #10b981'
                        : '3px solid transparent',
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
                          fontSize: '0.82rem',
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
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#059669' }}>
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
