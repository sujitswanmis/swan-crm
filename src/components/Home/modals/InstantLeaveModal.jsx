'use client';

import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, AlertCircle, Calendar, Sun, Clock, FileText } from 'lucide-react';
import { applyEmployeeLeave } from '@/app/actions/attendance';

const LEAVE_TYPES = [
  { id: 'CL', label: 'Casual Leave (CL)', desc: 'Personal or urgent work' },
  { id: 'SL', label: 'Sick Leave (SL)', desc: 'Medical illness or doctor visit' },
  { id: 'EL', label: 'Earned Leave (EL)', desc: 'Planned vacation / earned days' },
  { id: 'HALF_DAY', label: 'Half Day (HD)', desc: 'First or Second half' },
  { id: 'CPL', label: 'Compensatory Off (CPL)', desc: 'Against holiday work' },
  { id: 'LWP', label: 'Leave Without Pay (LWP)', desc: 'Unpaid absence' }
];

export default function InstantLeaveModal({
  isOpen,
  onClose,
  tenantId = '',
  userId = '',
  userName = 'Employee',
  userEmail = '',
  userCompany = '',
  onApplied = null
}) {
  const getTodayIST = () => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    } catch (_e) {
      return new Date().toISOString().slice(0, 10);
    }
  };

  const [form, setForm] = useState({
    leaveType: 'CL',
    fromDate: '',
    toDate: '',
    halfDaySession: 'FIRST_HALF',
    reason: ''
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setForm({
        leaveType: 'CL',
        fromDate: getTodayIST(),
        toDate: getTodayIST(),
        halfDaySession: 'FIRST_HALF',
        reason: ''
      });
      setErrorMsg('');
      setSuccessMsg('');
      return;
    }
    setForm(prev => ({
      ...prev,
      fromDate: getTodayIST(),
      toDate: getTodayIST()
    }));
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!form.fromDate) {
      setErrorMsg('Please select a from date.');
      return;
    }
    const toDateVal = form.leaveType === 'HALF_DAY' ? form.fromDate : (form.toDate || form.fromDate);
    if (toDateVal < form.fromDate) {
      setErrorMsg('To Date cannot be earlier than From Date.');
      return;
    }
    if (!form.reason.trim()) {
      setErrorMsg('Please provide a reason for taking leave.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await applyEmployeeLeave({
        userId,
        email: userEmail,
        empName: userName,
        tenantId: tenantId || null,
        userCompany: userCompany || '',
        leaveType: form.leaveType,
        fromDate: form.fromDate,
        toDate: toDateVal,
        halfDaySession: form.leaveType === 'HALF_DAY' ? form.halfDaySession : undefined,
        reason: form.reason.trim()
      });

      if (res?.success) {
        setSuccessMsg(res.message || 'Leave applied successfully! Awaiting HOD approval.');
        window.dispatchEvent(new CustomEvent('attendance_updated'));
        if (onApplied) onApplied(res.data);
        setTimeout(() => {
          onClose();
        }, 1400);
      } else {
        setErrorMsg(res?.error || 'Failed to submit leave application.');
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Error submitting leave application.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'rgba(15, 23, 42, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backdropFilter: 'blur(4px)',
      padding: '1rem'
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-surface, #ffffff)',
        borderRadius: '16px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.2)',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid var(--border-light, #e2e8f0)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.15rem 1.4rem',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: 34, height: 34, borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Calendar size={18} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 750, color: '#ffffff' }}>
                🌴 Apply Leave (Chhuti)
              </h2>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.88)' }}>
                Submit formal leave application directly for HOD / Manager approval
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              cursor: 'pointer',
              color: '#ffffff',
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.35rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {errorMsg && (
            <div style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem'
            }}>
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#16a34a',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontWeight: 650
            }}>
              <Check size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Leave Type Grid */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.45rem' }}>
              Select Leave Type *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.45rem' }}>
              {LEAVE_TYPES.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, leaveType: opt.id }))}
                  style={{
                    padding: '0.55rem 0.4rem',
                    borderRadius: '8px',
                    border: form.leaveType === opt.id ? '2px solid #059669' : '1px solid var(--border-light, #cbd5e1)',
                    background: form.leaveType === opt.id ? '#ecfdf5' : 'var(--bg-surface, #ffffff)',
                    color: form.leaveType === opt.id ? '#047857' : 'var(--text-primary, #0f172a)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    textAlign: 'center'
                  }}
                >
                  <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{opt.label}</span>
                  <span style={{ fontSize: '0.65rem', color: '#64748b' }}>{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Half Day Session Selector (if HALF_DAY) */}
          {form.leaveType === 'HALF_DAY' && (
            <div style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#047857', marginBottom: '0.35rem' }}>
                Half Day Shift Session *
              </label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', cursor: 'pointer', color: '#065f46', fontWeight: 600 }}>
                  <input
                    type="radio"
                    name="halfDaySession"
                    checked={form.halfDaySession === 'FIRST_HALF'}
                    onChange={() => setForm(prev => ({ ...prev, halfDaySession: 'FIRST_HALF' }))}
                  />
                  <span>First Half (Morning)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', cursor: 'pointer', color: '#065f46', fontWeight: 600 }}>
                  <input
                    type="radio"
                    name="halfDaySession"
                    checked={form.halfDaySession === 'SECOND_HALF'}
                    onChange={() => setForm(prev => ({ ...prev, halfDaySession: 'SECOND_HALF' }))}
                  />
                  <span>Second Half (Afternoon)</span>
                </label>
              </div>
            </div>
          )}

          {/* Date Range */}
          <div style={{ display: 'grid', gridTemplateColumns: form.leaveType === 'HALF_DAY' ? '1fr' : '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
                <Calendar size={13} color="#059669" />
                <span>{form.leaveType === 'HALF_DAY' ? 'Leave Date *' : 'From Date *'}</span>
              </label>
              <input
                type="date"
                required
                value={form.fromDate}
                onChange={e => {
                  const val = e.target.value;
                  setForm(prev => ({
                    ...prev,
                    fromDate: val,
                    toDate: prev.toDate && prev.toDate < val ? val : prev.toDate
                  }));
                }}
                style={{
                  width: '100%',
                  padding: '0.58rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  fontSize: '0.85rem',
                  color: 'var(--text-primary, #0f172a)',
                  background: 'var(--bg-surface, #ffffff)'
                }}
              />
            </div>

            {form.leaveType !== 'HALF_DAY' && (
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
                  <Calendar size={13} color="#059669" />
                  <span>To Date *</span>
                </label>
                <input
                  type="date"
                  required
                  min={form.fromDate}
                  value={form.toDate || form.fromDate}
                  onChange={e => setForm(prev => ({ ...prev, toDate: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.58rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light, #cbd5e1)',
                    fontSize: '0.85rem',
                    color: 'var(--text-primary, #0f172a)',
                    background: 'var(--bg-surface, #ffffff)'
                  }}
                />
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
              Reason for Leave *
            </label>
            <textarea
              rows={2}
              required
              placeholder="Explain the reason for leave (e.g. Family function, unwell, urgent bank work)..."
              value={form.reason}
              onChange={e => setForm(prev => ({ ...prev, reason: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light, #cbd5e1)',
                fontSize: '0.84rem',
                color: 'var(--text-primary, #0f172a)',
                background: 'var(--bg-surface, #ffffff)',
                outline: 'none',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Footer Submit */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.65rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-light, #e2e8f0)',
            marginTop: '0.5rem'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                background: 'none',
                border: '1px solid var(--border-light, #cbd5e1)',
                color: 'var(--text-secondary, #64748b)',
                fontWeight: 650,
                fontSize: '0.84rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.55rem 1.35rem',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.84rem',
                border: 'none',
                cursor: submitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
              }}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              <span>{submitting ? 'Applying...' : 'Apply Leave Now'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
