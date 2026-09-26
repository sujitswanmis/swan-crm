'use client';

import React, { useState } from 'react';
import { X, LogIn, RefreshCw, CheckCircle2, AlertCircle, ShieldAlert } from 'lucide-react';

export default function ImpersonateModal({
  isOpen,
  onClose,
  user
}) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen || !user) return null;

  const handleConfirm = () => {
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const targetUserId = user.user_id;
      const targetName = user.emp_name || user.email || 'Employee';
      const impersonateUrl = `/?view_as=${encodeURIComponent(targetUserId)}`;

      const newTab = window.open(impersonateUrl, '_blank');
      if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
        window.location.href = impersonateUrl;
        return;
      }

      setLoading(false);
      setSuccessMsg(`Logged in as ${targetName}! Opened in a new tab.`);
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err) {
      setLoading(false);
      setErrorMsg(err.message || 'Failed to open impersonation session');
    }
  };

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
      zIndex: 1060,
      padding: '1rem'
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '460px',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '16px',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
        border: '1px solid var(--border-light)',
        overflow: 'hidden',
        padding: 0
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <LogIn size={20} style={{ color: '#7c3aed' }} />
              Login as User (Impersonate)
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Test & verify user portal view without requiring their password
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '0.35rem',
              borderRadius: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem' }}>
          {errorMsg && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              backgroundColor: '#ecfdf5',
              border: '1px solid #a7f3d0',
              color: '#059669',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          <div style={{
            padding: '1rem',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-primary, #f8fafc)',
            border: '1px solid var(--border-light)',
            marginBottom: '1.25rem'
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
              {user.emp_name || 'Unnamed User'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span><strong>Email:</strong> {user.email || 'N/A'}</span>
              <span><strong>Designation:</strong> {user.emp_designation || 'N/A'}</span>
              <span><strong>Department:</strong> {user.emp_department || 'N/A'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontSize: '0.78rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            <ShieldAlert size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
            <span>
              This will launch a dedicated session in a <strong>new browser tab</strong>. Your current Master Admin tab remains completely untouched and secure.
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={loading || Boolean(successMsg)}
              onClick={handleConfirm}
              style={{
                padding: '0.55rem 1.4rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#7c3aed',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {loading ? <RefreshCw size={16} className="spin" /> : <LogIn size={16} />}
              Login in New Tab
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
