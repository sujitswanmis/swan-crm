'use client';

import React from 'react';
import { Lock, LogOut, ShieldAlert, CreditCard, RefreshCw } from 'lucide-react';

/**
 * SubscriptionExpiredModal
 * Renders an unbypassable modal when a tenant's subscription validity period has expired
 */
export default function SubscriptionExpiredModal({ subscription }) {
  if (!subscription || !subscription.is_expired) {
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
          सब्सक्रिप्शन समाप्त हो गया है
        </h2>
        <p style={{ color: '#4b5563', fontSize: '0.92rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
          आपकी कंपनी का CRM प्लान <strong>{validUntilFormatted}</strong> को समाप्त हो गया है। आपका डेटा 100% सुरक्षित है। आगे काम जारी रखने के लिए कृपया अपने प्लान को रिन्यू करें।
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
            <span style={{ color: '#6b7280' }}>प्लान का नाम:</span>
            <strong style={{ color: '#111827' }}>{subscription.plan_name || 'Standard Plan'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ color: '#6b7280' }}>स्वीकृत सीट्स (Users):</span>
            <strong style={{ color: '#111827' }}>{subscription.user_seat_limit || 1}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>अंतिम वैलिडिटी:</span>
            <strong style={{ color: '#dc2626' }}>{validUntilFormatted}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
            <CreditCard size={18} /> अभी रिन्यू करें (Renew Plan)
          </button>

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
              <LogOut size={16} /> लॉगआउट करें (Logout)
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
