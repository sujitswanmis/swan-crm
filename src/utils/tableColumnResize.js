'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Reusable hook for draggable column resizing on HTML tables.
 * Follows the Lead Data (LeadTable.jsx) pattern:
 * - Draggable divider handle with col-resize cursor
 * - Visual feedback when active
 * - Double-click to reset column width
 * - LocalStorage persistence
 * - Safe minWidth constraints
 */
export function useTableColumnResize(storageKey, defaultWidths, minWidths = {}) {
  const [colWidths, setColWidths] = useState(() => {
    if (typeof window !== 'undefined' && storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          return { ...defaultWidths, ...parsed };
        }
      } catch (e) {
        console.warn('Failed to load table column widths:', e);
      }
    }
    return defaultWidths;
  });

  const [resizingCol, setResizingCol] = useState(null);
  const dragInfoRef = useRef(null);
  const colWidthsRef = useRef(colWidths);
  colWidthsRef.current = colWidths;

  const handleResizeStart = useCallback((e, colKey) => {
    e.preventDefault();
    e.stopPropagation();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const startWidth = colWidthsRef.current[colKey] || defaultWidths[colKey] || 120;
    const minW = minWidths[colKey] || 70;

    dragInfoRef.current = {
      colKey,
      startX: clientX,
      startWidth,
      minW,
      latestWidth: startWidth
    };

    setResizingCol(colKey);

    const onMove = (moveEvent) => {
      if (!dragInfoRef.current) return;
      const currentX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const deltaX = currentX - dragInfoRef.current.startX;
      const newWidth = Math.max(dragInfoRef.current.minW, dragInfoRef.current.startWidth + deltaX);
      dragInfoRef.current.latestWidth = newWidth;

      setColWidths((prev) => ({
        ...prev,
        [colKey]: newWidth
      }));
    };

    const onEnd = () => {
      if (dragInfoRef.current) {
        const finalKey = dragInfoRef.current.colKey;
        const finalWidth = dragInfoRef.current.latestWidth;

        setColWidths((prev) => {
          const updated = { ...prev, [finalKey]: finalWidth };
          if (typeof window !== 'undefined' && storageKey) {
            try {
              localStorage.setItem(storageKey, JSON.stringify(updated));
            } catch (err) {}
          }
          return updated;
        });
      }

      dragInfoRef.current = null;
      setResizingCol(null);

      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, [defaultWidths, minWidths, storageKey]);

  const resetColWidth = useCallback((colKey) => {
    const defaultW = defaultWidths[colKey] || 120;
    setColWidths((prev) => {
      const updated = { ...prev, [colKey]: defaultW };
      if (typeof window !== 'undefined' && storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (err) {}
      }
      return updated;
    });
  }, [defaultWidths, storageKey]);

  const resetAllColWidths = useCallback(() => {
    setColWidths(defaultWidths);
    if (typeof window !== 'undefined' && storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch (err) {}
    }
  }, [defaultWidths, storageKey]);

  const getTotalTableWidth = useCallback(() => {
    return Object.values(colWidths).reduce((sum, w) => sum + (Number(w) || 0), 0);
  }, [colWidths]);

  return {
    colWidths,
    resizingCol,
    handleResizeStart,
    resetColWidth,
    resetAllColWidths,
    getTotalTableWidth
  };
}

/**
 * Draggable visual column divider handle component.
 */
export function ColumnResizer({
  colKey,
  isResizing,
  onResizeStart,
  onReset
}) {
  return (
    <div
      onMouseDown={(e) => onResizeStart(e, colKey)}
      onTouchStart={(e) => onResizeStart(e, colKey)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={() => onReset && onReset(colKey)}
      className={`column-resizer ${isResizing ? 'is-resizing' : ''}`}
      title="Drag to resize column width | Double-click to reset"
      style={{
        position: 'absolute',
        right: '-4px',
        top: 0,
        height: '100%',
        width: '12px',
        cursor: 'col-resize',
        userSelect: 'none',
        touchAction: 'none',
        zIndex: 25,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        className="resizer-bar"
        style={{
          width: isResizing ? '4px' : '2px',
          height: '70%',
          backgroundColor: isResizing ? 'var(--accent-color, #2563eb)' : '#cbd5e1',
          borderRadius: '2px',
          boxShadow: isResizing ? '0 0 5px var(--accent-color, #2563eb)' : 'none',
          transition: 'background-color 0.15s ease, width 0.15s ease'
        }}
      />
    </div>
  );
}
