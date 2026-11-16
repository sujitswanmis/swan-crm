'use client';

import React, { useState, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, CheckCircle2, Clock, XCircle, 
  FileText, ShieldCheck, Loader2 
} from 'lucide-react';

const APPROVAL_QUICK_REMARKS = {
  Approved: [
    'Documents & KYC Verified',
    'Onboarding Approved',
    'HOD Approval Received',
    'Profile Verified'
  ],
  Pending: [
    'Awaiting KYC Documents',
    'Pending HOD Review',
    'Shift Assignment Pending',
    'Under Verification'
  ],
  Rejected: [
    'Incorrect Branch Mapping',
    'Duplicate Account / ID',
    'Incomplete Documents',
    'Invalid Mobile / Email',
    'Unauthorized Registration',
    'Candidate Backed Out'
  ]
};

export default function ApprovalStatusModal({
  isOpen,
  onClose,
  onConfirm,
  user,
  currentApproval = 'Pending',
  loading = false
}) {
  const titleId = useId();
  const [selectedStatus, setSelectedStatus] = useState(currentApproval || 'Pending');
  const [remarks, setRemarks] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedStatus(currentApproval || 'Pending');
      setRemarks(user?.approval_remarks || user?.module_access?.approval_remarks || '');
      setValidationError('');
    }
  }, [isOpen, currentApproval, user]);

  if (!isOpen || typeof document === 'undefined') return null;

  const quickPills = APPROVAL_QUICK_REMARKS[selectedStatus] || [];
  const isRejected = selectedStatus === 'Rejected';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isRejected && !remarks.trim()) {
      setValidationError('Please provide a reason or remarks for rejecting this user.');
      return;
    }
    setValidationError('');
    onConfirm({
      approvalStatus: selectedStatus,
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
        {/* Header */}
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
              backgroundColor: '#e0e7ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <ShieldCheck size={20} style={{ color: '#4338ca' }} />
            </div>
            <div>
              <h3 id={titleId} style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
                Update Approval Status
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

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.25rem 1.5rem', overflowY: 'auto' }}>
          {/* Status Selection Cards */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary, #0f172a)', marginBottom: '0.5rem' }}>
              Select Status *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.65rem' }}>
              {/* Approved Card */}
              <button
                type="button"
                onClick={() => {
                  setSelectedStatus('Approved');
                  if (validationError) setValidationError('');
                }}
                style={{
                  padding: '0.75rem 0.5rem',
                  borderRadius: '10px',
                  border: selectedStatus === 'Approved' ? '2px solid #16a34a' : '1px solid var(--border-light, #e2e8f0)',
                  backgroundColor: selectedStatus === 'Approved' ? '#f0fdf4' : 'var(--bg-primary, #f8fafc)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.35rem',
                  textAlign: 'center'
                }}
              >
                <CheckCircle2 size={20} style={{ color: '#16a34a' }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#15803d' }}>Approved</span>
              </button>

              {/* Pending Card */}
              <button
                type="button"
                onClick={() => {
                  setSelectedStatus('Pending');
                  if (validationError) setValidationError('');
                }}
                style={{
                  padding: '0.75rem 0.5rem',
                  borderRadius: '10px',
                  border: selectedStatus === 'Pending' ? '2px solid #d97706' : '1px solid var(--border-light, #e2e8f0)',
                  backgroundColor: selectedStatus === 'Pending' ? '#fffbeb' : 'var(--bg-primary, #f8fafc)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.35rem',
                  textAlign: 'center'
                }}
              >
                <Clock size={20} style={{ color: '#d97706' }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b45309' }}>Pending</span>
              </button>

              {/* Rejected Card */}
              <button
                type="button"
                onClick={() => {
                  setSelectedStatus('Rejected');
                  if (validationError) setValidationError('');
                }}
                style={{
                  padding: '0.75rem 0.5rem',
                  borderRadius: '10px',
                  border: selectedStatus === 'Rejected' ? '2px solid #dc2626' : '1px solid var(--border-light, #e2e8f0)',
                  backgroundColor: selectedStatus === 'Rejected' ? '#fef2f2' : 'var(--bg-primary, #f8fafc)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.35rem',
                  textAlign: 'center'
                }}
              >
                <XCircle size={20} style={{ color: '#dc2626' }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b91c1c' }}>Rejected</span>
              </button>
            </div>
          </div>

          {/* Quick Suggestions */}
          {quickPills.length > 0 && (
            <div style={{ marginBottom: '0.65rem' }}>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginBottom: '0.35rem' }}>
                Quick Remarks (Click to fill)
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
                      backgroundColor: remarks === pill ? '#e2e8f0' : 'var(--bg-primary, #f8fafc)',
                      color: remarks === pill ? '#0f172a' : 'var(--text-secondary, #64748b)',
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
              <span>Remarks {isRejected ? '*' : '(Optional)'}</span>
            </label>
            <textarea
              rows={3}
              required={isRejected}
              value={remarks}
              onChange={(e) => {
                setRemarks(e.target.value);
                if (validationError) setValidationError('');
              }}
              placeholder={isRejected ? 'Enter reason for rejection (required)...' : 'Enter approval notes / verification comments...'}
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

          {/* Footer Actions */}
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
                backgroundColor: isRejected ? '#dc2626' : (selectedStatus === 'Approved' ? '#16a34a' : '#d97706'),
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
              <span>Save Approval Status</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
