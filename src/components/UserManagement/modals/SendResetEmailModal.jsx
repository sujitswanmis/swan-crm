'use client';

import React, { useState } from 'react';
import { Send, Check, RefreshCw, X, Mail } from 'lucide-react';
import { sendAdminPasswordResetLink } from '@/app/actions/team';

export default function SendResetEmailModal({
  isOpen,
  onClose,
  user
}) {
  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!isOpen || !user) return null;

  const targetEmail = user.email || user.emp_official_mail_id || '';

  const handleSend = async () => {
    if (!user.user_id) return;
    setSending(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await sendAdminPasswordResetLink(user.user_id);
      if (res && res.success) {
        setSuccessMsg(res.message || 'Password setup link sent successfully!');
        setTimeout(() => {
          handleClose();
        }, 1800);
      } else {
        setErrorMsg(res?.error || 'Failed to send password setup email.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'An error occurred while sending the email.');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setSending(false);
    setSuccessMsg(null);
    setErrorMsg(null);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.6)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: '16px',
        padding: '2rem',
        width: '90%',
        maxWidth: '440px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        textAlign: 'center',
        color: 'var(--text-primary)',
        position: 'relative'
      }}>
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          disabled={sending}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '0.25rem',
            borderRadius: '6px'
          }}
        >
          <X size={18} />
        </button>

        {/* Icon Header */}
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          backgroundColor: '#e0e7ff',
          color: '#4338ca',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.25rem auto'
        }}>
          <Send size={24} />
        </div>

        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
          Send Password Setup Link
        </h3>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.5', marginBottom: '1.25rem' }}>
          Send an official password activation email to <strong>{user.emp_name || user.email}</strong>?
        </p>

        {/* Recipient Details Box */}
        <div style={{
          backgroundColor: 'var(--bg-primary, #f8fafc)',
          border: '1px solid var(--border-light)',
          borderRadius: '10px',
          padding: '0.75rem 1rem',
          marginBottom: '1.25rem',
          textAlign: 'left',
          fontSize: '0.84rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Recipient:</span>
            <strong style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{targetEmail || 'No email registered'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Gateway:</span>
            <span style={{ color: '#4338ca', fontWeight: 600 }}>SuPuja Creations Admin Mail</span>
          </div>
        </div>

        {/* Feedback messages */}
        {successMsg && (
          <div style={{
            backgroundColor: '#dcfce7',
            color: '#166534',
            padding: '0.75rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            fontSize: '0.85rem',
            border: '1px solid #bbf7d0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }}>
            <Check size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div style={{
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            padding: '0.75rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            fontSize: '0.85rem',
            border: '1px solid #fecaca'
          }}>
            {errorMsg}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={sending}
            className="btn-secondary"
            style={{
              padding: '0.6rem 1.5rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-primary, #f1f5f9)',
              color: 'var(--text-secondary)',
              cursor: sending ? 'not-allowed' : 'pointer',
              fontWeight: 600
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !targetEmail}
            className="btn-primary"
            style={{
              backgroundColor: '#4338ca',
              borderColor: '#4338ca',
              color: '#fff',
              padding: '0.6rem 1.5rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 600,
              cursor: (sending || !targetEmail) ? 'not-allowed' : 'pointer'
            }}
          >
            {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
            {sending ? 'Sending...' : 'Send Setup Link'}
          </button>
        </div>
      </div>
    </div>
  );
}
