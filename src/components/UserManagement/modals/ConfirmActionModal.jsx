'use client';

import React from 'react';
import { X, AlertTriangle, Trash2, RotateCcw, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';

export default function ConfirmActionModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'warning', // 'warning' | 'danger' | 'info' | 'success'
  loading = false
}) {
  if (!isOpen) return null;

  const getColorStyles = () => {
    switch (type) {
      case 'danger':
        return {
          icon: Trash2,
          iconColor: '#dc2626',
          btnBg: '#dc2626',
          btnText: '#ffffff'
        };
      case 'success':
        return {
          icon: CheckCircle2,
          iconColor: '#059669',
          btnBg: '#059669',
          btnText: '#ffffff'
        };
      case 'info':
        return {
          icon: RotateCcw,
          iconColor: '#2563eb',
          btnBg: '#2563eb',
          btnText: '#ffffff'
        };
      case 'warning':
      default:
        return {
          icon: AlertTriangle,
          iconColor: '#d97706',
          btnBg: '#d97706',
          btnText: '#ffffff'
        };
    }
  };

  const style = getColorStyles();
  const Icon = style.icon;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1070,
      padding: '1rem'
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '440px',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '16px',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
        border: '1px solid var(--border-light)',
        overflow: 'hidden',
        padding: 0
      }}>
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: 'var(--bg-primary, #f8fafc)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Icon size={22} style={{ color: style.iconColor }} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {title}
              </h3>
              <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {message}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              style={{
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {cancelText}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={onConfirm}
              style={{
                padding: '0.55rem 1.35rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: style.btnBg,
                color: style.btnText,
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {loading && <Loader2 size={16} className="spin" />}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
