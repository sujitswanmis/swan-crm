'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, ArrowRight, ShieldAlert, UserPlus } from 'lucide-react';

/**
 * SubscriptionExpiryBanner
 * Renders a sticky warning banner at top of workspace when subscription has <= 7 days remaining
 */
export default function SubscriptionExpiryBanner({ subscription, isMasterAdmin = false }) {
  const [dismissed, setDismissed] = useState(false);
  const [nowMs, setNowMs] = useState(null);

  useEffect(() => {
    const initialTimer = setTimeout(() => setNowMs(Date.now()), 0);
    const interval = setInterval(() => setNowMs(Date.now()), 30000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  if (
    isMasterAdmin ||
    !subscription ||
    subscription.is_master_hq ||
    subscription.never_expires ||
    !subscription.is_expiring_soon ||
    subscription.is_expired ||
    dismissed
  ) {
    return null;
  }

  const daysRemaining = subscription.days_remaining ?? 1;
  const expiryMs = subscription.valid_until ? new Date(subscription.valid_until).getTime() : NaN;
  const hasLiveDiff = nowMs !== null && !Number.isNaN(expiryMs) && expiryMs > nowMs;

  let countdownText = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`;
  let isUrgent = daysRemaining <= 3;

  if (hasLiveDiff) {
    const totalMinutes = Math.max(1, Math.floor((expiryMs - nowMs) / 60000));
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;
    isUrgent = days <= 3;

    const parts = [];
    if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    if (days > 0 || hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
    countdownText = parts.join(' ');
  }

  return (
    <div
      style={{
        backgroundColor: isUrgent ? '#fef2f2' : '#fffbeb',
        borderBottom: `1px solid ${isUrgent ? '#fecaca' : '#fef3c7'}`,
        color: isUrgent ? '#991b1b' : '#92400e',
        padding: '0.65rem 1.25rem',
        fontSize: '0.85rem',
        width: '100%',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
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
          <strong style={{ textDecoration: 'underline' }}>{countdownText}</strong>. Please renew in advance to ensure uninterrupted calling, leads, and services.
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
