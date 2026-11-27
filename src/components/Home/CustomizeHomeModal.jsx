'use client';

import React, { useState } from 'react';
import { X, Check, RotateCcw, LayoutDashboard, Sliders, ShieldCheck } from 'lucide-react';
import { AVAILABLE_WIDGETS, getPermittedWidgets } from './homeWidgetsConfig';

export default function CustomizeHomeModal({
  isOpen,
  onClose,
  enabledWidgetIds = [],
  onSaveWidgets,
  moduleAccess = {},
  userRole = '',
  userId = 'default'
}) {
  if (!isOpen) return null;

  const permittedWidgets = getPermittedWidgets(moduleAccess, userRole);
  const [selectedIds, setSelectedIds] = useState(() => {
    return Array.isArray(enabledWidgetIds) && enabledWidgetIds.length > 0
      ? enabledWidgetIds.filter(id => permittedWidgets.some(w => w.id === id))
      : permittedWidgets.filter(w => w.defaultEnabled).map(w => w.id);
  });

  const toggleWidget = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleResetDefaults = () => {
    const defaults = permittedWidgets.filter(w => w.defaultEnabled).map(w => w.id);
    setSelectedIds(defaults);
  };

  const handleSelectAll = () => {
    setSelectedIds(permittedWidgets.map(w => w.id));
  };

  const handleSave = () => {
    onSaveWidgets(selectedIds);
    try {
      localStorage.setItem(`spc_user_home_widgets_${userId}`, JSON.stringify(selectedIds));
    } catch (_e) {}
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface, #ffffff)',
        color: 'var(--text-primary, #0f172a)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
        border: '1px solid var(--border-light, #e2e8f0)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-light, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0%, rgba(99, 102, 241, 0.05) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Sliders size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                Customize My Home Dashboard
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', margin: '2px 0 0 0' }}>
                Select cards & widgets relevant to your daily workflow
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary, #64748b)',
              padding: '0.4rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Quick Toolbar */}
        <div style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: 'rgba(241, 245, 249, 0.6)',
          borderBottom: '1px solid var(--border-light, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.82rem'
        }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>
            {selectedIds.length} of {permittedWidgets.length} widgets selected
          </span>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={handleSelectAll}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563eb',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              Select All
            </button>
            <span style={{ color: 'var(--border-light, #cbd5e1)' }}>|</span>
            <button
              type="button"
              onClick={handleResetDefaults}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <RotateCcw size={12} />
              Reset Defaults
            </button>
          </div>
        </div>

        {/* Widget Grid List */}
        <div style={{
          padding: '1.25rem 1.5rem',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          {permittedWidgets.map(widget => {
            const isSelected = selectedIds.includes(widget.id);
            return (
              <div
                key={widget.id}
                onClick={() => toggleWidget(widget.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1rem',
                  borderRadius: '12px',
                  border: isSelected ? `1.5px solid ${widget.color}` : '1px solid var(--border-light, #e2e8f0)',
                  backgroundColor: isSelected ? `${widget.color}0a` : 'var(--bg-card, #ffffff)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: `${widget.color}18`,
                    color: widget.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}>
                    <LayoutDashboard size={18} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 650, fontSize: '0.92rem', color: 'var(--text-primary, #0f172a)' }}>
                        {widget.title}
                      </span>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '999px',
                        backgroundColor: `${widget.color}18`,
                        color: widget.color
                      }}>
                        {widget.category}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
                      {widget.description}
                    </p>
                  </div>
                </div>

                {/* Checkbox circle */}
                <div style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '6px',
                  border: isSelected ? `2px solid ${widget.color}` : '2px solid #cbd5e1',
                  backgroundColor: isSelected ? widget.color : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  flexShrink: 0,
                  marginTop: '4px',
                  transition: 'all 0.15s ease'
                }}>
                  {isSelected && <Check size={14} strokeWidth={3} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--border-light, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '0.75rem',
          backgroundColor: 'var(--bg-primary, #f8fafc)'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light, #cbd5e1)',
              backgroundColor: 'var(--bg-surface, #ffffff)',
              color: 'var(--text-primary, #1e293b)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '0.55rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.25)'
            }}
          >
            Save Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
