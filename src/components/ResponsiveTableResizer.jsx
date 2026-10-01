'use client';

import { useEffect } from 'react';

export default function ResponsiveTableResizer() {
  useEffect(() => {
    let stopDragging = null;

    const onPointerDown = event => {
      if (event.button !== 0 || event.pointerType === 'touch') return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest('button, a, input, select, textarea, [role="button"]')) return;

      const header = target.closest('th');
      const table = header?.closest('table');
      if (!table || table.hasAttribute('data-column-resize-managed')) return;
      if (!table.closest('.app-layout, .modal-container')) return;

      const headerRow = table.tHead?.rows[table.tHead.rows.length - 1];
      if (!headerRow || header.parentElement !== headerRow) return;
      const headers = Array.from(headerRow.cells);
      if (headers.length < 2 || headers.some(cell => cell.tagName !== 'TH' || cell.colSpan !== 1)) return;

      const edge = header.getBoundingClientRect().right;
      if (edge - event.clientX < 0 || edge - event.clientX > 12) return;

      const columnIndex = headers.indexOf(header);
      const widths = headers.map(cell => cell.getBoundingClientRect().width);
      const originalWidth = widths[columnIndex];
      const minimumWidth = Math.max(64, Number.parseFloat(getComputedStyle(header).minWidth) || 0);
      const tableWidth = Math.max(table.getBoundingClientRect().width, widths.reduce((sum, width) => sum + width, 0));
      const startX = event.clientX;

      headers.forEach((cell, index) => { cell.style.width = `${widths[index]}px`; });
      table.style.tableLayout = 'fixed';
      table.style.width = `${tableWidth}px`;
      table.classList.add('column-resize-active');
      document.body.classList.add('column-resize-dragging');

      const onPointerMove = moveEvent => {
        const nextWidth = Math.max(minimumWidth, originalWidth + moveEvent.clientX - startX);
        const delta = nextWidth - originalWidth;
        header.style.width = `${nextWidth}px`;
        table.style.width = `${tableWidth + delta}px`;
        if (table.parentElement && table.scrollWidth > table.parentElement.clientWidth) {
          table.parentElement.classList.add('column-resize-scroll-host');
        }
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        table.classList.remove('column-resize-active');
        document.body.classList.remove('column-resize-dragging');
        stopDragging = null;
      };

      stopDragging?.();
      stopDragging = onPointerUp;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      event.preventDefault();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      stopDragging?.();
    };
  }, []);

  return null;
}
