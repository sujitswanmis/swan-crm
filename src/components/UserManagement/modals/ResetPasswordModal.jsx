'use client';

import React, { useState } from 'react';
import { X, Key, Eye, EyeOff, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { sendAdminPasswordResetLink } from '@/app/actions/team';

export default function ResetPasswordModal({
  isOpen,
  onClose,
  user,
  onSavePassword,
  saving = false
}) {
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sendingLink, setSendingLink] = useState(false);
  const [linkSuccess, setLinkSuccess] = useState('');

  if (!isOpen || !user) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }
    setErrorMsg('');
    onSavePassword(user.user_id, newPassword);
  };

  const handleSendEmailLink = async () => {
    if (!user.email) {
      setErrorMsg('User has no valid email address associated.');
      return;
    }
    setSendingLink(true);
    setErrorMsg('');
    setLinkSuccess('');
    try {
      const res = await sendAdminPasswordResetLink(user.user_id, user.email);
      if (res && res.success) {
        setLinkSuccess(res.message || 'Password reset link sent successfully to ' + user.email);
      } else {
        setErrorMsg(res?.error || 'Failed to send password reset link');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to send reset email');
    } finally {
      setSendingLink(false);
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
        maxWidth: '480px',
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
              <Key size={20} style={{ color: '#d97706' }} />
              Reset Password
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {user.emp_name || user.email} ({user.emp_id || 'No ID'})
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
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

          {linkSuccess && (
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
              <span>{linkSuccess}</span>
            </div>
          )}

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
              Set New Password (Direct Admin Override)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter at least 6 characters"
                style={{
                  width: '100%',
                  padding: '0.55rem 2.5rem 0.55rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--primary-color, #2563eb)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              {saving ? <Loader2 size={16} className="spin" /> : <Key size={16} />}
              Save New Password
            </button>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1rem 0' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-light)' }} />
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>OR</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-light)' }} />
          </div>

          {/* Send Email Link */}
          <div>
            <button
              type="button"
              disabled={sendingLink}
              onClick={handleSendEmailLink}
              style={{
                width: '100%',
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                backgroundColor: 'var(--bg-primary, #f8fafc)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: sendingLink ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              {sendingLink ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
              Send Password Reset Link to Email
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
