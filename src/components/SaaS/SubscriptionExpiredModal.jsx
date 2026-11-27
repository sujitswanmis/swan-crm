'use client';

import React, { useState, useEffect } from 'react';
import { Lock, LogOut, CreditCard, ShieldAlert } from 'lucide-react';

/**
 * SubscriptionExpiredModal
 * Renders an unbypassable modal when a tenant's subscription validity period has expired.
 * Workspace Admins may temporarily view the Billing & Proforma page to complete payment.
 */
export default function SubscriptionExpiredModal({
  subscription,
  isMasterAdmin = false,
  canManageBilling = false,
  allowBillingView = false,
  onExitBillingView = null
}) {
  const [nowMs, setNowMs] = useState(null);

  useEffect(() => {
    const initialTimer = setTimeout(() => setNowMs(Date.now()), 0);
    const interval = setInterval(() => setNowMs(Date.now()), 10000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  const expiryMs = subscription?.valid_until ? new Date(subscription.valid_until).getTime() : NaN;
  const isLiveExpired = nowMs !== null && !Number.isNaN(expiryMs) && expiryMs <= nowMs;
  const effectiveExpired = Boolean(subscription?.is_expired || isLiveExpired);

  if (
    isMasterAdmin ||
    !subscription ||
    subscription.is_master_hq ||
    subscription.never_expires ||
    !effectiveExpired
  ) {
    return null;
  }

  const validUntilFormatted = subscription.valid_until
    ? new Date(subscription.valid_until).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : 'Recently';

  // Admin viewing /settings/subscription_billing to pay Proforma Invoice
  if (canManageBilling && allowBillingView) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 999998,
          background: 'linear-gradient(90deg, #991b1b 0%, #dc2626 100%)',
          color: '#ffffff',
          padding: '0.55rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          fontSize: '0.82rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldAlert size={16} />
          <span>
            <strong>Subscription Expired ({validUntilFormatted}):</strong> Only Billing &amp; Proforma Invoice access is open until payment confirmation.
          </span>
        </div>
        <button
          type="button"
          onClick={() => onExitBillingView?.()}
          style={{
            backgroundColor: '#ffffff',
            color: '#991b1b',
            border: 'none',
            borderRadius: '6px',
            padding: '0.3rem 0.75rem',
            fontSize: '0.76rem',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Back to Lock Screen
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem'
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          padding: '2.5rem',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #fee2e2'
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            backgroundColor: '#fee2e2',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            color: '#dc2626'
          }}
        >
          <Lock size={32} />
        </div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '0.75rem' }}>
          Subscription Expired
        </h2>
        <p style={{ color: '#4b5563', fontSize: '0.92rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
          Your company&apos;s CRM subscription expired on <strong>{validUntilFormatted}</strong>. Your data is 100% safe and secure.{' '}
          {canManageBilling
            ? 'Please open Billing & Proforma Invoice to renew your plan and restore access.'
            : 'Please contact your Workspace Administrator to renew your plan and restore access.'}
        </p>

        <div
          style={{
            backgroundColor: '#f9fafb',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            padding: '1rem',
            marginBottom: '1.75rem',
            textAlign: 'left',
            fontSize: '0.85rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ color: '#6b7280' }}>Plan Name:</span>
            <strong style={{ color: '#111827' }}>{subscription.plan_name || 'Standard Plan'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ color: '#6b7280' }}>Authorized Seats (Users):</span>
            <strong style={{ color: '#111827' }}>{subscription.user_seat_limit || 1}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Expiration Date:</span>
            <strong style={{ color: '#dc2626' }}>{validUntilFormatted}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {canManageBilling ? (
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-saas-billing'));
              }}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '0.85rem',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
              }}
            >
              <CreditCard size={18} /> Renew Subscription &amp; Pay Invoice
            </button>
          ) : (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontSize: '0.84rem',
                fontWeight: 600
              }}
            >
              Only your Workspace Administrator can renew the company subscription.
            </div>
          )}

          <form action="/auth/logout" method="POST" style={{ width: '100%' }}>
            <button
              type="submit"
              style={{
                width: '100%',
                backgroundColor: '#ffffff',
                color: '#4b5563',
                border: '1px solid #d1d5db',
                borderRadius: '10px',
                padding: '0.75rem',
                fontWeight: 500,
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem'
              }}
            >
              <LogOut size={16} /> Logout
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
