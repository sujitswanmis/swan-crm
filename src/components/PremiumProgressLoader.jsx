import React, { useState, useEffect } from 'react';

export function PremiumProgressLoader({ message, active }) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (active) {
      setProgress(0);
      setVisible(true);
      
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return 95;
          const diff = Math.floor(Math.random() * 12) + 4; // increment by 4 to 16%
          return Math.min(prev + diff, 95);
        });
      }, 70);
      
      return () => clearInterval(interval);
    } else {
      setProgress(100);
      const timeout = setTimeout(() => {
        setVisible(false);
      }, 250); // fade out duration
      return () => clearTimeout(timeout);
    }
  }, [active]);

  if (!visible) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '400px',
      width: '100%',
      color: 'var(--text-primary)',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      opacity: progress === 100 ? 0 : 1,
      transition: 'opacity 0.25s ease-in-out',
      position: 'relative',
      zIndex: 10
    }}>
      {/* Decorative background glow */}
      <div style={{
        position: 'absolute',
        width: '180px',
        height: '180px',
        background: 'rgba(59, 130, 246, 0.06)',
        filter: 'blur(50px)',
        borderRadius: '50%',
        pointerEvents: 'none'
      }} />

      {/* Floating brand icon */}
      <div className="float-icon-loader" style={{
        fontSize: '2.5rem',
        marginBottom: '1.2rem'
      }}>
        🦢
      </div>

      {/* Message & Percentage */}
      <div style={{
        fontSize: '0.95rem',
        fontWeight: 500,
        marginBottom: '0.75rem',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <span>{message || 'Loading workspace'}</span>
        <span style={{
          color: 'var(--accent-color, #2563eb)',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums'
        }}>
          {progress}%
        </span>
      </div>

      {/* Progress Bar Container */}
      <div style={{
        width: '80%',
        maxWidth: '280px',
        height: '5px',
        background: 'var(--border-light, #e2e8f0)',
        borderRadius: '99px',
        overflow: 'hidden'
      }}>
        {/* Animated Progress Bar */}
        <div style={{
          width: `${progress}%`,
          height: '100%',
          background: 'linear-gradient(90deg, var(--accent-color, #2563eb) 0%, #60a5fa 100%)',
          borderRadius: '99px',
          transition: 'width 0.15s ease-out',
          boxShadow: '0 0 6px rgba(59, 130, 246, 0.4)'
        }} />
      </div>

      {/* Pulse & Floating animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes floatLoader {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .float-icon-loader {
          animation: floatLoader 2s ease-in-out infinite;
        }
      `}} />
    </div>
  );
}
