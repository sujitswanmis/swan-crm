import React, { useState, useEffect } from 'react';

export function PremiumProgressLoader({ message, active, loadedCount, totalCount, progressPercent }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (active) {
      setVisible(true);
    } else {
      const timeout = setTimeout(() => {
        setVisible(false);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [active]);

  if (!visible && !active) return null;

  // Calculate real percentage if available
  const hasRealCount = typeof loadedCount === 'number' && typeof totalCount === 'number' && totalCount > 0;
  const computedPercent = hasRealCount
    ? Math.min(100, Math.round((loadedCount / totalCount) * 100))
    : (typeof progressPercent === 'number' ? Math.min(100, Math.max(0, progressPercent)) : null);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2.5rem 1rem',
      width: '100%',
      color: 'var(--text-primary)',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      position: 'relative',
      zIndex: 10
    }}>
      {/* Glow effect */}
      <div style={{
        position: 'absolute',
        width: '140px',
        height: '140px',
        background: 'rgba(59, 130, 246, 0.08)',
        filter: 'blur(40px)',
        borderRadius: '50%',
        pointerEvents: 'none'
      }} />

      {/* Floating brand logo */}
      <div className="float-icon-loader" style={{
        marginBottom: '1.1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}>
        <img 
          src="/supuja-logo.png" 
          alt="SuPuja Creations" 
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            objectFit: 'contain',
            background: '#ffffff',
            padding: '3px',
            boxShadow: '0 10px 25px -5px rgba(67, 56, 202, 0.25), 0 4px 6px -2px rgba(0,0,0,0.05)',
            border: '1px solid #e2e8f0'
          }} 
        />
      </div>

      {/* Message & Real Progress Indicator */}
      <div style={{
        fontSize: '0.95rem',
        fontWeight: 500,
        marginBottom: '0.75rem',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <span>{message || 'Loading records'}</span>
        {hasRealCount ? (
          <span style={{
            color: 'var(--accent-color, #2563eb)',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums'
          }}>
            ({loadedCount.toLocaleString()} / {totalCount.toLocaleString()} loaded • {computedPercent}%)
          </span>
        ) : computedPercent !== null ? (
          <span style={{
            color: 'var(--accent-color, #2563eb)',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums'
          }}>
            {computedPercent}%
          </span>
        ) : null}
      </div>

      {/* Progress Bar Container */}
      <div style={{
        width: '80%',
        maxWidth: '300px',
        height: '5px',
        background: 'var(--border-light, #e2e8f0)',
        borderRadius: '99px',
        overflow: 'hidden',
        position: 'relative'
      }}>
        {computedPercent !== null ? (
          <div style={{
            width: `${computedPercent}%`,
            height: '100%',
            background: 'linear-gradient(90deg, var(--accent-color, #2563eb) 0%, #60a5fa 100%)',
            borderRadius: '99px',
            transition: 'width 0.2s ease-out',
            boxShadow: '0 0 6px rgba(59, 130, 246, 0.4)'
          }} />
        ) : (
          <div className="indeterminate-progress-bar" style={{
            height: '100%',
            background: 'linear-gradient(90deg, var(--accent-color, #2563eb) 0%, #60a5fa 100%)',
            borderRadius: '99px'
          }} />
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes floatLoader {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes indeterminateBar {
          0% { width: 0%; transform: translateX(-100%); }
          50% { width: 60%; transform: translateX(50%); }
          100% { width: 100%; transform: translateX(100%); }
        }
        .float-icon-loader {
          animation: floatLoader 2s ease-in-out infinite;
        }
        .indeterminate-progress-bar {
          animation: indeterminateBar 1.5s infinite linear;
        }
      `}} />
    </div>
  );
}
