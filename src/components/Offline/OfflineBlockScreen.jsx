'use client';

import React, { useState } from 'react';
import { WifiOff, RefreshCw, ShieldAlert } from 'lucide-react';

export default function OfflineBlockScreen({ moduleName = 'This Module', onRetry }) {
  const [checking, setChecking] = useState(false);

  const handleCheck = () => {
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
      if (onRetry) onRetry();
    }, 1000);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      minHeight: '480px',
      padding: '2.5rem 1.5rem',
      margin: '1.5rem',
      backgroundColor: 'var(--card-bg, #1e293b)',
      borderRadius: '16px',
      border: '1px solid var(--border-color, #334155)',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
      textAlign: 'center',
      animation: 'fadeIn 0.25s ease-out'
    }}>
      {/* Pulse Icon Container */}
      <div style={{
        position: 'relative',
        width: '88px',
        height: '88px',
        borderRadius: '50%',
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
        border: '2px solid rgba(239, 68, 68, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '1.5rem'
      }}>
        <WifiOff size={42} style={{ color: '#ef4444' }} />
        <span style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: '#ef4444',
          border: '3px solid var(--card-bg, #1e293b)'
        }} />
      </div>

      {/* Badge */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: '20px',
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        fontSize: '0.75rem',
        fontWeight: '700',
        color: '#f87171',
        marginBottom: '1rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
      }}>
        <ShieldAlert size={14} />
        <span>Strict Online-Only Policy</span>
      </div>

      {/* Headings */}
      <h2 style={{
        margin: '0 0 0.5rem 0',
        fontSize: '1.6rem',
        fontWeight: '800',
        color: 'var(--text-color, #f8fafc)',
        letterSpacing: '-0.02em'
      }}>
        No Internet Connection
      </h2>

      <p style={{
        maxWidth: '480px',
        margin: '0 0 1.5rem 0',
        fontSize: '0.92rem',
        lineHeight: 1.6,
        color: 'var(--text-muted, #94a3b8)'
      }}>
        <strong>{moduleName}</strong> is configured by Admin to run in <strong>Online-Only</strong> mode.
        To protect data confidentiality and prevent sync conflicts, data viewing is locked while disconnected.
      </p>

      {/* Security Info Box */}
      <div style={{
        maxWidth: '440px',
        padding: '12px 16px',
        borderRadius: '10px',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        border: '1px dashed var(--border-color, #334155)',
        fontSize: '0.82rem',
        color: 'var(--text-muted, #94a3b8)',
        marginBottom: '2rem',
        lineHeight: 1.5
      }}>
        🔒 <strong>Data Security Notice</strong>: Kripya active Internet connect karein. Connection aate hi live data turant screen par wapas dikh jayega.
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={handleCheck}
          disabled={checking}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 22px',
            borderRadius: '10px',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: '600',
            cursor: checking ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
            transition: 'all 0.2s ease'
          }}
        >
          <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
          <span>{checking ? 'Checking Connection...' : 'Check Connection'}</span>
        </button>
      </div>
    </div>
  );
}
