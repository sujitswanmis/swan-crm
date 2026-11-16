'use client';

import React, { useState, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, AlertTriangle, UserX, UserMinus, PauseCircle, 
  CheckCircle2, Clock, Calendar, FileText, Loader2 
} from 'lucide-react';

const STATUS_QUICK_REMARKS = {
  Resigned: [
    'Better Opportunity',
    'Personal / Family Reasons',
    'Higher Studies',
    'Relocation',
    'Health Issues',
    'Career Transition'
  ],
  Terminated: [
    'Performance Issues',
    'Disciplinary Action',
    'Policy Violation',
    'Attendance Shortage',
    'Contract Ended',
    'Failed Background Check'
  ],
  Hold: [
    'Absconding / No Show',
    'Under Investigation',
    'Document / KYC Pending',
    'Extended Leave',
    'Medical Hold'
  ],
  InActive: [
    'Long Absenteeism',
    'Temporary Suspension',
    'Not Reachable',
    'Seasonal Break'
  ],
  Active: [
    'Rejoined / Returned',
    'Hold Cleared',
    'Onboarding Completed',
    'Reinstated'
  ]
};

function getTodayIST() {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'Asia/Kolkata', 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
    return formatter.format(now);
  } catch (e) {
    return new Date().toISOString().split('T')[0];
  }
}

export default function StatusChangeModal({
  isOpen,
  onClose,
  onConfirm,
  user,
  targetStatus = 'InActive',
  loading = false
}) {
  const titleId = useId();
  const [effectiveDate, setEffectiveDate] = useState(getTodayIST());
  const [remarks, setRemarks] = useState('');
  const [validationError, setValidationError] = useState('');

  const currentStatus = user?.emp_status || user?.module_access?.emp_status || 'Active';
  const isCriticalStatus = ['inactive', 'hold', 'resigned', 'terminated', 'trash'].includes(
    String(targetStatus || '').toLowerCase()
  );

  useEffect(() => {
    if (isOpen) {
      setEffectiveDate(getTodayIST());
      setRemarks('');
      setValidationError('');
    }
  }, [isOpen, targetStatus]);

  if (!isOpen || typeof document === 'undefined') return null;

  const getStatusTheme = () => {
    switch (String(targetStatus).toLowerCase()) {
      case 'terminated':
        return { icon: UserX, color: '#dc2626', bg: '#fee2e2', btnBg: '#dc2626' };
      case 'resigned':
        return { icon: UserMinus, color: '#9333ea', bg: '#f3e8ff', btnBg: '#9333ea' };
      case 'hold':
        return { icon: Clock, color: '#ea580c', bg: '#ffedd5', btnBg: '#ea580c' };
      case 'inactive':
        return { icon: PauseCircle, color: '#d97706', bg: '#fef3c7', btnBg: '#d97706' };
      case 'active':
        return { icon: CheckCircle2, color: '#16a34a', bg: '#dcfce7', btnBg: '#16a34a' };
      default:
        return { icon: AlertTriangle, color: '#2563eb', bg: '#dbeafe', btnBg: '#2563eb' };
    }
  };

  const theme = getStatusTheme();
  const Icon = theme.icon;
  const quickPills = STATUS_QUICK_REMARKS[targetStatus] || [];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isCriticalStatus && !remarks.trim()) {
      setValidationError(`Please enter a remark or reason for changing status to "${targetStatus}".`);
      return;
    }
    setValidationError('');
    onConfirm({
      status: targetStatus,
      effectiveDate: effectiveDate || getTodayIST(),
      remarks: remarks.trim()
    });
  };

  return createPortal(
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
      zIndex: 1075,
      padding: '1rem'
    }}>
      <div 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby={titleId} 
        aria-busy={loading} 
        style={{
          width: '100%',
          maxWidth: '480px',
          maxHeight: 'calc(100dvh - 2rem)',
          backgroundColor: 'var(--bg-surface, #ffffff)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
          border: '1px solid var(--border-light, #e2e8f0)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-light, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          backgroundColor: 'var(--bg-primary, #f8fafc)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: theme.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Icon size={20} style={{ color: theme.color }} />
            </div>
            <div>
              <h3 id={titleId} style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
                Change Employee Status: {targetStatus}
              </h3>
              <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
                {user?.emp_name || user?.email || 'Selected Employee'} ({user?.emp_id || 'ID: —'})
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary, #64748b)',
              padding: '0.25rem',
              borderRadius: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.25rem 1.5rem', overflowY: 'auto' }}>
          {/* Status Transition Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.65rem 0.85rem',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-primary, #f8fafc)',
            border: '1px solid var(--border-light, #e2e8f0)',
            marginBottom: '1rem',
            fontSize: '0.8rem'
          }}>
            <span style={{ color: 'var(--text-secondary, #64748b)', fontWeight: 500 }}>Transition</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
              <span style={{ padding: '0.15rem 0.5rem', borderRadius: '4px', background: '#e2e8f0', color: '#475569' }}>
                {currentStatus}
              </span>
              <span>→</span>
              <span style={{ padding: '0.15rem 0.5rem', borderRadius: '4px', background: theme.bg, color: theme.color }}>
                {targetStatus}
              </span>
            </div>
          </div>

          {/* Effective Date */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-primary, #0f172a)',
              marginBottom: '0.35rem'
            }}>
              <Calendar size={14} style={{ color: 'var(--text-secondary)' }} />
              <span>Effective Date (IST) *</span>
            </label>
            <input
              type="date"
              required
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light, #e2e8f0)',
                backgroundColor: 'var(--bg-surface, #ffffff)',
                color: 'var(--text-primary, #0f172a)',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.25rem' }}>
              Specifies the exact day when this status change and payroll/attendance rules take effect.
            </div>
          </div>

          {/* Quick Remarks Pills */}
          {quickPills.length > 0 && (
            <div style={{ marginBottom: '0.65rem' }}>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginBottom: '0.35rem' }}>
                Quick Suggestions (Click to fill)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {quickPills.map((pill) => (
                  <button
                    key={pill}
                    type="button"
                    onClick={() => setRemarks(pill)}
                    style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light, #e2e8f0)',
                      backgroundColor: remarks === pill ? theme.bg : 'var(--bg-primary, #f8fafc)',
                      color: remarks === pill ? theme.color : 'var(--text-secondary, #64748b)',
                      fontSize: '0.72rem',
                      fontWeight: remarks === pill ? 600 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {pill}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Remarks Textarea */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-primary, #0f172a)',
              marginBottom: '0.35rem'
            }}>
              <FileText size={14} style={{ color: 'var(--text-secondary)' }} />
              <span>Remarks & Notes {isCriticalStatus ? '*' : '(Optional)'}</span>
            </label>
            <textarea
              rows={3}
              required={isCriticalStatus}
              value={remarks}
              onChange={(e) => {
                setRemarks(e.target.value);
                if (validationError) setValidationError('');
              }}
              placeholder={`Explain reason for ${targetStatus} (e.g. handover details, resignation reason, notice period)...`}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '8px',
                border: `1px solid ${validationError ? '#ef4444' : 'var(--border-light, #e2e8f0)'}`,
                backgroundColor: 'var(--bg-surface, #ffffff)',
                color: 'var(--text-primary, #0f172a)',
                fontSize: '0.85rem',
                outline: 'none',
                resize: 'vertical'
              }}
            />
            {validationError && (
              <div style={{ fontSize: '0.74rem', color: '#dc2626', marginTop: '0.3rem', fontWeight: 500 }}>
                {validationError}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              style={{
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light, #e2e8f0)',
                backgroundColor: 'transparent',
                color: 'var(--text-primary, #0f172a)',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.55rem 1.35rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: theme.btnBg,
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem'
              }}
            >
              {loading && <Loader2 size={15} className="spin" />}
              <span>Save & Update Status</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
