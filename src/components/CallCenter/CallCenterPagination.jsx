'use client';
import React from 'react';
import StandardTablePagination from '@/components/common/StandardTablePagination';

export const stickyHeader = { position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-surface, white)', boxShadow: 'inset 0 -1px 0 var(--border-light, #e2e8f0)' };
export const tableScroll = { overflow: 'auto', maxHeight: 'calc(100vh - 310px)', minHeight: '380px', position: 'relative' };

export default function CallCenterPagination({ total, page, pageSize, onPageChange, onPageSizeChange, disabled = false }) {
  const isAll = String(pageSize).toLowerCase() === 'all';
  const effectivePageSize = isAll ? 100000 : (Number(pageSize) || 25);
  return (
    <StandardTablePagination
      currentPage={(Number(page) || 0) + 1}
      totalRecords={total || 0}
      pageSize={effectivePageSize}
      onPageChange={nextPage => onPageChange && onPageChange(nextPage - 1)}
      onPageSizeChange={nextSize => {
        if (onPageSizeChange) onPageSizeChange(nextSize);
        if (onPageChange) onPageChange(0);
      }}
      disabled={disabled}
      style={{ padding: '0.75rem 1rem' }}
    />
  );
}
