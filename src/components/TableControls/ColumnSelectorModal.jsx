'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Check, X, Search, GripVertical, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';

export default function ColumnSelectorModal({
  isOpen,
  onClose,
  columns = [], // Array of { key: string, label: string }
  visibleColumns = [], // Array of keys
  onApply,
  onReset
}) {
  const [draftVisible, setDraftVisible] = useState(visibleColumns);
  const [draftOrder, setDraftOrder] = useState(columns);
  const [searchTerm, setSearchTerm] = useState('');
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const modalRef = useRef(null);

  // Sync with props whenever opened
  useEffect(() => {
    if (isOpen) {
      setDraftVisible(visibleColumns);
      setDraftOrder(columns);
      setSearchTerm('');
    }
  }, [isOpen, visibleColumns, columns]);

  // Close on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isAllSelected = draftOrder.length > 0 && draftOrder.every(col => draftVisible.includes(col.key));
  const isSomeSelected = draftOrder.some(col => draftVisible.includes(col.key)) && !isAllSelected;

  const handleToggleAll = () => {
    if (isAllSelected) {
      setDraftVisible([]);
    } else {
      setDraftVisible(draftOrder.map(c => c.key));
    }
  };

  const handleToggleColumn = (key) => {
    setDraftVisible(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // Drag and Drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...draftOrder];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    setDraftOrder(updated);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Move Up / Down
  const handleMove = (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= draftOrder.length) return;

    const updated = [...draftOrder];
    const [movedItem] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, movedItem);
    setDraftOrder(updated);
  };

  const handleApply = () => {
    if (onApply) {
      onApply(draftVisible, draftOrder);
    }
    onClose();
  };

  const filteredColumns = draftOrder.filter(col =>
    col.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    col.key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      ref={modalRef}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: '6px',
        width: '320px',
        maxWidth: '90vw',
        maxHeight: 'min(540px, calc(100vh - 130px))',
        backgroundColor: 'var(--bg-surface, #ffffff)',
        border: '1px solid var(--border-light, #e2e8f0)',
        borderRadius: '10px',
        boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.2), 0 8px 16px -4px rgba(0, 0, 0, 0.1)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeInScale 0.15s ease-out'
      }}
    >
      {/* Header matching Image 1 */}
      <div
        style={{
          padding: '0.85rem 1rem',
          borderBottom: '1px solid var(--border-light, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-surface, #ffffff)'
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', margin: 0, userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={isAllSelected}
            ref={el => {
              if (el) el.indeterminate = isSomeSelected;
            }}
            onChange={handleToggleAll}
            style={{
              width: '1.15rem',
              height: '1.15rem',
              accentColor: '#2563eb',
              cursor: 'pointer'
            }}
          />
          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary, #1e293b)' }}>
            Columns
          </span>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563eb',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 500,
              padding: '0.2rem 0.4rem'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            style={{
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.35rem 0.9rem',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
              transition: 'background 0.15s'
            }}
            onMouseOver={e => e.currentTarget.style.backgroundColor = '#0369a1'}
            onMouseOut={e => e.currentTarget.style.backgroundColor = '#0284c7'}
          >
            Apply
          </button>
        </div>
      </div>

      {/* Column Search Bar */}
      <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light, #f1f5f9)', backgroundColor: 'var(--bg-primary, #f8fafc)' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: '8px', color: 'var(--text-secondary, #94a3b8)' }} />
          <input
            type="text"
            placeholder="Search column..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.35rem 0.5rem 0.35rem 1.8rem',
              fontSize: '0.8rem',
              borderRadius: '5px',
              border: '1px solid var(--border-light, #cbd5e1)',
              background: 'var(--bg-surface, #ffffff)',
              outline: 'none'
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{ position: 'absolute', right: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Columns List with Drag & Drop */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.4rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px'
        }}
      >
        {filteredColumns.map((col, index) => {
          const originalIndex = draftOrder.findIndex(c => c.key === col.key);
          const isChecked = draftVisible.includes(col.key);
          const isBeingDragged = draggedIndex === originalIndex;
          const isDragOver = dragOverIndex === originalIndex;

          return (
            <div
              key={col.key}
              draggable={!searchTerm}
              onDragStart={e => handleDragStart(e, originalIndex)}
              onDragOver={e => handleDragOver(e, originalIndex)}
              onDrop={e => handleDrop(e, originalIndex)}
              onDragEnd={handleDragEnd}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.65rem',
                borderRadius: '6px',
                backgroundColor: isBeingDragged
                  ? '#eff6ff'
                  : isDragOver
                  ? '#dbeafe'
                  : isChecked
                  ? '#f8fafc'
                  : 'transparent',
                border: isDragOver ? '1px dashed #3b82f6' : '1px solid transparent',
                cursor: searchTerm ? 'pointer' : 'grab',
                transition: 'background-color 0.12s',
                opacity: isBeingDragged ? 0.5 : 1
              }}
              onMouseOver={e => {
                if (!isBeingDragged && !isDragOver) {
                  e.currentTarget.style.backgroundColor = '#f1f5f9';
                }
              }}
              onMouseOut={e => {
                if (!isBeingDragged && !isDragOver) {
                  e.currentTarget.style.backgroundColor = isChecked ? '#f8fafc' : 'transparent';
                }
              }}
            >
              {/* Left Checkbox + Label */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  cursor: 'pointer',
                  flex: 1,
                  minWidth: 0,
                  userSelect: 'none',
                  margin: 0
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleToggleColumn(col.key)}
                  style={{
                    width: '1.05rem',
                    height: '1.05rem',
                    accentColor: '#2563eb',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                />
                <span
                  style={{
                    fontSize: '0.875rem',
                    color: isChecked ? '#1e293b' : '#64748b',
                    fontWeight: isChecked ? 600 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={col.label}
                >
                  {col.label}
                </span>
              </label>

              {/* Push & Keep Controls (Move Up/Down & Grip) */}
              {!searchTerm && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', opacity: 0.7 }} className="reorder-controls">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleMove(originalIndex, 'up'); }}
                    disabled={originalIndex === 0}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: originalIndex === 0 ? 'not-allowed' : 'pointer',
                      opacity: originalIndex === 0 ? 0.25 : 1,
                      padding: '2px',
                      color: '#64748b'
                    }}
                    title="Push Up"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleMove(originalIndex, 'down'); }}
                    disabled={originalIndex === draftOrder.length - 1}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: originalIndex === draftOrder.length - 1 ? 'not-allowed' : 'pointer',
                      opacity: originalIndex === draftOrder.length - 1 ? 0.25 : 1,
                      padding: '2px',
                      color: '#64748b'
                    }}
                    title="Push Down"
                  >
                    <ChevronDown size={13} />
                  </button>
                  <GripVertical size={13} color="#94a3b8" style={{ cursor: 'grab', marginLeft: '2px' }} />
                </div>
              )}
            </div>
          );
        })}

        {filteredColumns.length === 0 && (
          <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
            No columns match "{searchTerm}"
          </div>
        )}
      </div>

      {/* Footer Reset Order */}
      {onReset && (
        <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border-light, #e2e8f0)', display: 'flex', justifyContent: 'space-between', backgroundColor: 'var(--bg-primary, #f8fafc)' }}>
          <button
            type="button"
            onClick={onReset}
            style={{
              background: 'none',
              border: 'none',
              color: '#dc2626',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}
          >
            <RotateCcw size={12} /> Reset to Default
          </button>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {draftVisible.length} of {draftOrder.length} visible
          </span>
        </div>
      )}
    </div>
  );
}
