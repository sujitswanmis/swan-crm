'use client';

import React, { useState } from 'react';
import { X, AlertTriangle, Ban } from 'lucide-react';
import { cancelOrder } from '@/app/actions/orderFulfillment';

const CANCELLATION_REASONS = [
  'Customer / Channel Partner Requested Cancellation',
  'Commercial / Pricing Dispute',
  'Delivery Lead Time / TAT Unacceptable to Partner',
  'Duplicate Order Punched by Mistake',
  'Credit Limit / Overdue Payment Default',
  'Technical / Machine Specification Mismatch',
  'Plant Raw Material / Component Stock Shortage',
  'Other / Custom Reason'
];

export default function CancelOrderModal({
  order,
  isOpen,
  onClose,
  onSuccess,
  userName = 'Sales Desk',
  tenantId = 'TNT00002'
}) {
  const [reason, setReason] = useState(CANCELLATION_REASONS[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !order) return null;

  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    if (!reason) {
      setErrorMsg('Please select a cancellation reason.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    try {
      const res = await cancelOrder(order.id, reason, userName, notes, tenantId);
      if (res.success) {
        if (onSuccess) onSuccess(res.order);
        onClose();
      } else {
        setErrorMsg(res.error || 'Failed to cancel order.');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid #ef4444',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '520px',
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(239, 68, 68, 0.2)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(239, 68, 68, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ef4444'
            }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#ef4444' }}>
                Cancel Order {order.order_number}
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Stage S01 — Order Confirmation
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleCancelSubmit} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-primary)' }}>
            Are you sure you want to cancel sales order <strong style={{ color: '#ef4444' }}>{order.order_number}</strong> for partner <strong>{order.party?.firm_name || 'Channel Partner'}</strong>? This will halt the delivery pipeline and mark the order as Cancelled.
          </p>

          {errorMsg && (
            <div style={{
              padding: '0.65rem 0.85rem',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              color: '#ef4444',
              fontSize: '0.82rem'
            }}>
              {errorMsg}
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '0.35rem' }}>
              Cancellation Reason *
            </label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.84rem'
              }}
            >
              {CANCELLATION_REASONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '0.35rem' }}>
              Detailed Explanation / Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Provide context or explanation for records..."
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.84rem'
              }}
            />
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            paddingTop: '0.5rem',
            borderTop: '1px solid var(--border-light)'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                fontSize: '0.84rem',
                cursor: 'pointer'
              }}
            >
              Back
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '0.5rem 1.25rem',
                background: '#ef4444',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '0.84rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: saving ? 'not-allowed' : 'pointer'
              }}
            >
              <Ban size={15} />
              {saving ? 'Cancelling...' : 'Confirm Order Cancellation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
