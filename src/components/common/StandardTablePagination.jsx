'use client';

import React, { useState, useEffect, useMemo } from 'react';

/**
 * StandardTablePagination
 * Standard CRM Table Pagination Component (Lead Data Pattern)
 * 
 * Features:
 * - Reads settings from localStorage (`crmPageNavSettings`) synced with CRM Settings > Page Navigation
 * - Dynamically updates on `crm_page_nav_updated` and `crm_config_updated` window events
 * - Provides dynamic page sizes dropdown (e.g. Show 10, Show 15, Show 20, Show 50, Show 100, All)
 * - Record counter: "Showing X to Y of Z records"
 * - Previous & Next buttons
 * - Numbered page pills with dynamic pageNumberingJump (active page highlighted in accent color)
 */
export default function StandardTablePagination({
  currentPage = 1,
  totalRecords = 0,
  pageSize = 25,
  onPageChange,
  onPageSizeChange,
  style = {},
  className = ''
}) {
  const [pageJump, setPageJump] = useState(() => {
    let jump = 7;
    if (typeof window !== 'undefined') {
      try {
        const settings = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (settings.pageNumberingJump) jump = Number(settings.pageNumberingJump);
      } catch (e) {}
    }
    return jump;
  });

  const [availablePageSizes, setAvailablePageSizes] = useState(() => {
    let sizes = [5, 10, 15, 20, 25, 50, 100];
    if (typeof window !== 'undefined') {
      try {
        const settings = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (settings.availablePageSizes) {
          const parsed = settings.availablePageSizes.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
          if (parsed.length > 0) sizes = parsed;
        }
      } catch (e) {}
    }
    return sizes;
  });

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Listen to CRM page navigation settings updates
  useEffect(() => {
    const handleNavUpdate = () => {
      try {
        const cached = localStorage.getItem('crmPageNavSettings');
        if (cached) {
          const settings = JSON.parse(cached);
          if (settings.pageNumberingJump) {
            setPageJump(Number(settings.pageNumberingJump));
          }
          if (settings.availablePageSizes) {
            const parsed = settings.availablePageSizes.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
            if (parsed.length > 0) setAvailablePageSizes(parsed);
          }
        }
      } catch (e) {}
    };

    window.addEventListener('crm_page_nav_updated', handleNavUpdate);
    window.addEventListener('crm_config_updated', handleNavUpdate);
    return () => {
      window.removeEventListener('crm_page_nav_updated', handleNavUpdate);
      window.removeEventListener('crm_config_updated', handleNavUpdate);
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalRecords / (pageSize === 100000 ? (totalRecords || 1) : pageSize)));

  const startRecord = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalRecords);

  // Dropdown options
  const optionsList = useMemo(() => {
    const optionsSet = new Set(availablePageSizes.filter(size => !isMobile || size <= 100));
    if (pageSize !== 100000 && !isNaN(pageSize)) optionsSet.add(pageSize);
    const sorted = Array.from(optionsSet).sort((a, b) => a - b);
    if (!isMobile) sorted.push(100000); // 100000 represents 'All'
    return sorted;
  }, [availablePageSizes, isMobile, pageSize]);

  // Numbered pages calculation based on pageJump (Lead Data pattern)
  const pageNumbers = useMemo(() => {
    const pages = [];
    const effectivePageJump = isMobile ? 1 : pageJump;

    let startPage = Math.max(1, currentPage - effectivePageJump);
    let endPage = Math.min(totalPages, currentPage + effectivePageJump);

    if (currentPage <= effectivePageJump + 1) {
      endPage = Math.min(effectivePageJump * 2 + 1, totalPages);
    }
    if (currentPage >= totalPages - effectivePageJump) {
      startPage = Math.max(1, totalPages - effectivePageJump * 2);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }, [currentPage, totalPages, isMobile, pageJump]);

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.65rem 1rem',
        borderTop: '1px solid var(--border-light)',
        background: 'var(--bg-primary, #f8fafc)',
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        flexWrap: 'wrap',
        gap: '0.65rem',
        ...style
      }}
    >
      {/* Left: Record Range Summary & Page Size Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span>
          Showing <strong>{startRecord}</strong> to <strong>{endRecord}</strong> of <strong>{totalRecords}</strong> records
        </span>

        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={e => {
              const newSize = Number(e.target.value);
              onPageSizeChange(newSize);
              if (onPageChange) onPageChange(1);
            }}
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.78rem',
              cursor: 'pointer'
            }}
          >
            {optionsList.map(size => (
              <option key={size} value={size}>
                {size === 100000 ? 'All' : `Show ${size}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Right: Previous, Numbered Page Pills, and Next Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onPageChange && onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          style={{
            padding: '0.25rem 0.75rem',
            border: '1px solid var(--border-light)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            borderRadius: '4px',
            cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
            opacity: currentPage <= 1 ? 0.5 : 1,
            fontSize: '0.78rem'
          }}
        >
          Previous
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
          {pageNumbers.map(i => {
            const isActive = currentPage === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onPageChange && onPageChange(i)}
                style={{
                  padding: '0.25rem 0.55rem',
                  minWidth: '28px',
                  border: isActive ? '1px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                  borderRadius: '4px',
                  background: isActive ? 'var(--accent-color, #2563eb)' : 'var(--bg-surface)',
                  color: isActive ? '#ffffff' : 'var(--text-primary)',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  fontSize: '0.78rem'
                }}
              >
                {i}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onPageChange && onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          style={{
            padding: '0.25rem 0.75rem',
            border: '1px solid var(--border-light)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            borderRadius: '4px',
            cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
            opacity: currentPage >= totalPages ? 0.5 : 1,
            fontSize: '0.78rem'
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
