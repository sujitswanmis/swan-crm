'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, ArrowRight, ShieldAlert, UserPlus } from 'lucide-react';

/**
 * SubscriptionExpiryBanner
 * Renders a sticky warning banner at top of workspace when subscription has <= 7 days remaining
 */
export default function SubscriptionExpiryBanner({ subscription, isMasterAdmin = false, canManageBilling = false }) {
  const [dismissed, setDismissed] = useState(false);
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
  const hasValidExpiryTs = !Number.isNaN(expiryMs);
  const isLiveExpired = nowMs !== null && hasValidExpiryTs && expiryMs <= nowMs;

  if (
    isMasterAdmin ||
    !subscription ||
    subscription.is_master_hq ||
    subscription.never_expires ||
    !subscription.is_expiring_soon ||
    subscription.is_expired ||
    isLiveExpired ||
    (hasValidExpiryTs && nowMs === null)
  ) {
    return null;
  }

  const daysRemaining = Math.max(0, Number(subscription.days_remaining) || 0);
  const hasLiveDiff = nowMs !== null && !Number.isNaN(expiryMs) && expiryMs > nowMs;

  let ceilDays = Math.max(1, daysRemaining || 1);
  let isFinalHour = false;
  let countdownText = `${ceilDays} ${ceilDays === 1 ? 'day' : 'days'}`;

  if (hasLiveDiff) {
    const diffMs = expiryMs - nowMs;
    ceilDays = Math.max(1, Math.ceil(diffMs / 86400000));
    isFinalHour = diffMs < 3600000;

    const totalMinutes = Math.max(1, Math.floor(diffMs / 60000));
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    if (days > 0 || hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
    countdownText = parts.join(' ');
  }

  // Final hour alert cannot stay dismissed
  if (dismissed && !isFinalHour) {
    return null;
  }

  // 5-Stage Escalating Color Theme (7d -> 5d -> 3d -> 2d -> 1d -> <1h)
  const theme = isFinalHour
    ? {
        stage: 'EXPIRING <1 HR',
        bg: 'linear-gradient(90deg, #b91c1c 0%, #dc2626 100%)',
        border: '#991b1b',
        color: '#ffffff',
        accent: '#ffffff',
        ctaText: '#b91c1c',
        badgeBg: 'rgba(255,255,255,0.22)',
        badgeColor: '#ffffff',
        urgentIcon: true,
        solid: true
      }
    : ceilDays <= 1
      ? {
          stage: '1D FINAL DAY',
          bg: '#fef2f2',
          border: '#fca5a5',
          color: '#991b1b',
          accent: '#dc2626',
          ctaText: '#ffffff',
          badgeBg: '#fee2e2',
          badgeColor: '#991b1b',
          urgentIcon: true,
          solid: false
        }
      : ceilDays === 2
        ? {
            stage: '2D URGENT',
            bg: '#fff1f2',
            border: '#fda4af',
            color: '#9f1239',
            accent: '#e11d48',
            ctaText: '#ffffff',
            badgeBg: '#ffe4e6',
            badgeColor: '#9f1239',
            urgentIcon: true,
            solid: false
          }
        : ceilDays === 3
          ? {
              stage: '3D ACTION',
              bg: '#fff7ed',
              border: '#fdba74',
              color: '#9a3412',
              accent: '#ea580c',
              ctaText: '#ffffff',
              badgeBg: '#ffedd5',
              badgeColor: '#9a3412',
              urgentIcon: false,
              solid: false
            }
          : ceilDays <= 5
            ? {
                stage: '5D REMINDER',
                bg: '#fefce8',
                border: '#fde047',
                color: '#854d0e',
                accent: '#ca8a04',
                ctaText: '#ffffff',
                badgeBg: '#fef08a',
                badgeColor: '#854d0e',
                urgentIcon: false,
                solid: false
              }
            : {
                stage: '7D NOTICE',
                bg: '#eff6ff',
                border: '#93c5fd',
                color: '#1e40af',
                accent: '#2563eb',
                ctaText: '#ffffff',
                badgeBg: '#dbeafe',
                badgeColor: '#1d4ed8',
                urgentIcon: false,
                solid: false
              };

  return (
    <div
      style={{
        background: theme.bg,
        borderBottom: `1px solid ${theme.border}`,
        color: theme.color,
        padding: '0.6rem 1.25rem',
        fontSize: '0.84rem',
        width: '100%',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        zIndex: 50,
        position: 'relative',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
        {theme.urgentIcon ? (
          <ShieldAlert size={18} style={{ color: theme.solid ? '#ffffff' : theme.accent, flexShrink: 0 }} />
        ) : (
          <AlertTriangle size={18} style={{ color: theme.accent, flexShrink: 0 }} />
        )}
        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            padding: '0.14rem 0.5rem',
            borderRadius: '999px',
            backgroundColor: theme.badgeBg,
            color: theme.badgeColor,
            border: theme.solid ? '1px solid rgba(255,255,255,0.35)' : `1px solid ${theme.border}`,
            whiteSpace: 'nowrap'
          }}
        >
          {theme.stage}
        </span>
        <span>
          <strong>Subscription Alert:</strong> Your plan expires in{' '}
          <strong style={{ textDecoration: 'underline' }}>{countdownText}</strong>. Please renew in advance to ensure uninterrupted calling, leads, and services.
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {canManageBilling ? (
          <>
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-addon-modal'));
              }}
              style={{
                backgroundColor: theme.solid ? 'rgba(255,255,255,0.16)' : '#ffffff',
                color: theme.solid ? '#ffffff' : theme.color,
                border: theme.solid ? '1px solid rgba(255,255,255,0.45)' : `1px solid ${theme.border}`,
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
                backgroundColor: theme.accent,
                color: theme.ctaText,
                border: 'none',
                borderRadius: '6px',
                padding: '0.35rem 0.8rem',
                fontSize: '0.8rem',
                fontWeight: 700,
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
          </>
        ) : (
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.26rem 0.65rem',
              borderRadius: '999px',
              backgroundColor: theme.badgeBg,
              color: theme.badgeColor,
              border: theme.solid ? '1px solid rgba(255,255,255,0.35)' : `1px solid ${theme.border}`
            }}
          >
            Contact Workspace Admin to renew
          </span>
        )}

        {!isFinalHour && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.color,
              cursor: 'pointer',
              padding: '0.2rem',
              display: 'flex',
              alignItems: 'center',
              opacity: 0.75
            }}
            title="Dismiss for this session"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
