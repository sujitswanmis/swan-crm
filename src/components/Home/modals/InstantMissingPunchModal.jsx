'use client';

import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, AlertCircle, FileText, Calendar, Clock, AlertTriangle } from 'lucide-react';
import { applyMissingAttendance } from '@/app/actions/attendance';

const REASON_OPTIONS = [
  'Forgot to Punch In / Out',
  'Client Visit / Field Duty',
  'Technical / Biometric Issue',
  'Power / Internet Disruption',
  'Urgent Meeting / Delayed Entry',
  'Other Official Work'
];

export default function InstantMissingPunchModal({
  isOpen,
  onClose,
  tenantId = '',
  userId = '',
  userName = 'Employee',
  userEmail = '',
  onApplied = null
}) {
  const getTodayIST = () => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    } catch (_e) {
      return new Date().toISOString().slice(0, 10);
    }
  };

  const getYesterdayIST = () => {
    try {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
    } catch (_e) {
      return '';
    }
  };

  const [form, setForm] = useState({
    attendanceDate: '',
    requestType: 'BOTH', // 'MISSED_IN' | 'MISSED_OUT' | 'BOTH'
    requestedInTime: '09:00',
    requestedOutTime: '18:30',
    reasonType: 'Forgot to Punch In / Out',
    reasonDetails: ''
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setForm({
        attendanceDate: getTodayIST(),
        requestType: 'BOTH',
        requestedInTime: '09:00',
        requestedOutTime: '18:30',
        reasonType: 'Forgot to Punch In / Out',
        reasonDetails: ''
      });
      setErrorMsg('');
      setSuccessMsg('');
      return;
    }
    setForm(prev => ({ ...prev, attendanceDate: getTodayIST() }));
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!form.attendanceDate) {
      setErrorMsg('Please select the attendance date.');
      return;
    }
    if (!form.reasonDetails.trim()) {
      setErrorMsg('Please provide remarks/explanation for the missing punch.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await applyMissingAttendance({
        email: userEmail,
        userId,
        empName: userName,
        attendanceDate: form.attendanceDate,
        requestType: form.requestType,
        requestedInTime: form.requestedInTime,
        requestedOutTime: form.requestedOutTime,
        reasonType: form.reasonType,
        reasonDetails: form.reasonDetails.trim(),
        tenantId: tenantId || undefined
      });

      if (res?.success) {
        setSuccessMsg(res.message || 'Missing punch application submitted successfully! Awaiting HOD approval.');
        window.dispatchEvent(new CustomEvent('attendance_updated'));
        if (onApplied) onApplied(res.data);
        setTimeout(() => {
          onClose();
        }, 1400);
      } else {
        setErrorMsg(res?.error || 'Failed to submit missing punch request.');
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Error submitting missing punch request.');
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
          background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
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
              <FileText size={18} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 750, color: '#ffffff' }}>
                Apply Missing Punch (Regularization)
              </h2>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.88)' }}>
                Forgot to punch? Submit missed punch request directly for HOD approval
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

          {/* Date Selection with Quick Pills */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
                Missing Punch Date *
              </label>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, attendanceDate: getTodayIST() }))}
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    border: '1px solid var(--border-light, #cbd5e1)',
                    background: form.attendanceDate === getTodayIST() ? '#ea580c' : '#f8fafc',
                    color: form.attendanceDate === getTodayIST() ? '#fff' : '#64748b',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, attendanceDate: getYesterdayIST() }))}
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    border: '1px solid var(--border-light, #cbd5e1)',
                    background: form.attendanceDate === getYesterdayIST() ? '#ea580c' : '#f8fafc',
                    color: form.attendanceDate === getYesterdayIST() ? '#fff' : '#64748b',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Yesterday
                </button>
              </div>
            </div>
            <input
              type="date"
              required
              value={form.attendanceDate}
              onChange={e => setForm(prev => ({ ...prev, attendanceDate: e.target.value }))}
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

          {/* Request Type */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
              What did you miss? *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {[
                { id: 'MISSED_IN', label: 'Missed In-Punch', desc: 'Punch In bhool gaye' },
                { id: 'MISSED_OUT', label: 'Missed Out-Punch', desc: 'Punch Out bhool gaye' },
                { id: 'BOTH', label: 'Both In & Out', desc: 'Poora din missed' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, requestType: opt.id }))}
                  style={{
                    padding: '0.6rem 0.4rem',
                    borderRadius: '8px',
                    border: form.requestType === opt.id ? '2px solid #ea580c' : '1px solid var(--border-light, #cbd5e1)',
                    background: form.requestType === opt.id ? '#fff7ed' : 'var(--bg-surface, #ffffff)',
                    color: form.requestType === opt.id ? '#c2410c' : 'var(--text-primary, #0f172a)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    textAlign: 'center'
                  }}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{opt.label}</span>
                  <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Time Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            {(form.requestType === 'MISSED_IN' || form.requestType === 'BOTH') && (
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
                  <Clock size={13} color="#16a34a" />
                  <span>Actual In Time (IST) *</span>
                </label>
                <input
                  type="time"
                  required
                  value={form.requestedInTime}
                  onChange={e => setForm(prev => ({ ...prev, requestedInTime: e.target.value }))}
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

            {(form.requestType === 'MISSED_OUT' || form.requestType === 'BOTH') && (
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
                  <Clock size={13} color="#dc2626" />
                  <span>Actual Out Time (IST) *</span>
                </label>
                <input
                  type="time"
                  required
                  value={form.requestedOutTime}
                  onChange={e => setForm(prev => ({ ...prev, requestedOutTime: e.target.value }))}
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

          {/* Reason Type */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
              Reason Category *
            </label>
            <select
              value={form.reasonType}
              onChange={e => setForm(prev => ({ ...prev, reasonType: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.58rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light, #cbd5e1)',
                fontSize: '0.85rem',
                color: 'var(--text-primary, #0f172a)',
                background: 'var(--bg-surface, #ffffff)'
              }}
            >
              {REASON_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Reason Details / Remarks */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginBottom: '0.35rem' }}>
              Explanation / Remarks for HOD *
            </label>
            <textarea
              rows={2}
              required
              placeholder="Explain why punch was missed (e.g. Worked at Client site from 10am to 6pm)..."
              value={form.reasonDetails}
              onChange={e => setForm(prev => ({ ...prev, reasonDetails: e.target.value }))}
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
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.84rem',
                border: 'none',
                cursor: submitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)'
              }}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              <span>{submitting ? 'Submitting...' : 'Submit Missing Punch'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
