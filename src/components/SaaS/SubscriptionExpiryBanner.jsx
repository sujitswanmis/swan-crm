'use client';

import React, { useState } from 'react';
import { AlertTriangle, X, ArrowRight, ShieldAlert, UserPlus } from 'lucide-react';

/**
 * SubscriptionExpiryBanner
 * Renders a sticky warning banner at top of workspace when subscription has <= 7 days remaining
 */
export default function SubscriptionExpiryBanner({ subscription }) {
  const [dismissed, setDismissed] = useState(false);

  if (!subscription || !subscription.is_expiring_soon || subscription.is_expired || dismissed) {
    return null;
  }

  const daysRemaining = subscription.days_remaining || 1;
  const isUrgent = daysRemaining <= 3;

  return (
    <div
      style={{
        backgroundColor: isUrgent ? '#fef2f2' : '#fffbeb',
        borderBottom: `1px solid ${isUrgent ? '#fecaca' : '#fef3c7'}`,
        color: isUrgent ? '#991b1b' : '#92400e',
        padding: '0.65rem 1.25rem',
        fontSize: '0.85rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 50,
        position: 'relative',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        {isUrgent ? (
          <ShieldAlert size={18} style={{ color: '#dc2626', flexShrink: 0 }} />
        ) : (
          <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0 }} />
        )}
        <span>
          <strong>Subscription Alert:</strong> Your plan expires in{' '}
          <strong style={{ textDecoration: 'underline' }}>{daysRemaining} day{daysRemaining > 1 ? 's' : ''}</strong>. Please renew in advance to ensure uninterrupted calling, leads, and services.
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('open-addon-modal'));
          }}
          style={{
            backgroundColor: '#ffffff',
            color: isUrgent ? '#dc2626' : '#92400e',
            border: `1px solid ${isUrgent ? '#fecaca' : '#fde68a'}`,
            borderRadius: '6px',
            padding: '0.35rem 0.65rem',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem'
          }}
        >
          <UserPlus size={13} /> Add Seats / Add-ons
        </button>

        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('open-saas-billing'));
          }}
          style={{
            backgroundColor: isUrgent ? '#dc2626' : '#d97706',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '0.35rem 0.75rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            transition: 'opacity 0.15s ease'
          }}
          onMouseOver={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
        >
          Renew Now <ArrowRight size={13} />
        </button>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: isUrgent ? '#991b1b' : '#92400e',
            cursor: 'pointer',
            padding: '0.2rem',
            display: 'flex',
            alignItems: 'center',
            opacity: 0.7
          }}
          title="Dismiss for this session"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
