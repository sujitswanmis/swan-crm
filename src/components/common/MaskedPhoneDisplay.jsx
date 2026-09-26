'use client';

import React, { useState, useMemo, useEffect, useCallback, useId } from 'react';
import { Phone, Eye, EyeOff, Copy, Check } from 'lucide-react';

/**
 * Global Exclusive Unmask Store
 * Enforces that strictly AT MOST ONE phone number across the entire CRM screen
 * can be revealed at any one time ("jab 2nd dekhne jaye tab 1st hide ho jaye").
 */
let globalRevealedInstanceId = null;
const globalListeners = new Set();

const broadcastRevealedId = (id) => {
  globalRevealedInstanceId = id;
  globalListeners.forEach(listener => {
    try {
      listener(id);
    } catch (e) {
      console.warn('Listener error in phone unmask:', e);
    }
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('crm:phone-unmask', { detail: { id } }));
  }
};

/**
 * Helper to trigger direct CRM softphone call or dispatch event
 */
export const triggerDirectCall = (rawNumber) => {
  if (typeof window === 'undefined') return;
  const clean = String(rawNumber || '').replace(/[^\d+]/g, '').trim();
  if (!clean) return;

  if (typeof window.__crm_direct_call === 'function') {
    window.__crm_direct_call(clean);
  } else {
    window.dispatchEvent(new CustomEvent('crm:make-call', { detail: { number: clean } }));
    setTimeout(() => {
      if (typeof window.__crm_direct_call !== 'function') {
        window.location.href = `tel:${clean}`;
      }
    }, 400);
  }
};

/**
 * MaskedPhoneDisplay Component
 * Displays: [📞 Call] [xxxxxx4578] [👁️ Eye] [📋 Copy]
 * - By default masks to xxxxxx{last 4 digits}
 * - Eye icon toggles full number visibility
 * - Exclusive Unmasking: Only 1 phone number across the entire screen can be revealed at once.
 *   Clicking eye on any 2nd number immediately hides/re-masks the 1st one.
 * - Copy icon copies the complete phone number
 * - Enforces strictly a SINGLE phone number display per component
 */
export default function MaskedPhoneDisplay({
  phone,
  onCall,
  size = 'md', // 'sm' | 'md'
  style = {},
  className = '',
  textColor = 'var(--text-primary)',
  showBorder = false,
  id: customId
}) {
  const generatedId = useId();
  const instanceId = customId || generatedId;

  const [isRevealed, setIsRevealed] = useState(() => globalRevealedInstanceId === instanceId);
  const [copied, setCopied] = useState(false);

  // Subscribe to global unmask updates so that revealing another number re-masks this one
  useEffect(() => {
    const handleUpdate = (currentActiveId) => {
      setIsRevealed(currentActiveId === instanceId);
    };
    globalListeners.add(handleUpdate);

    const handleWindowEvent = (e) => {
      setIsRevealed(e.detail?.id === instanceId);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('crm:phone-unmask', handleWindowEvent);
    }

    return () => {
      globalListeners.delete(handleUpdate);
      if (typeof window !== 'undefined') {
        window.removeEventListener('crm:phone-unmask', handleWindowEvent);
      }
      if (globalRevealedInstanceId === instanceId) {
        broadcastRevealedId(null);
      }
    };
  }, [instanceId]);

  // Extract strictly a single primary number from string, array, or comma/pipe/slash separated numbers
  const singleNumber = useMemo(() => {
    if (!phone) return '';
    let val = phone;
    if (Array.isArray(val)) {
      val = val.find(v => v && String(v).trim()) || '';
    }
    const str = String(val).trim();
    if (!str || str === '-' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return '';
    
    // Split by comma, pipe, slash, semicolon, or newline and take the first non-empty valid number
    const parts = str.split(/[,|/;\n\r]+/).map(p => p.trim()).filter(Boolean);
    return parts[0] || '';
  }, [phone]);

  if (!singleNumber) {
    return <span style={{ color: 'var(--text-secondary)', fontSize: size === 'sm' ? '0.74rem' : '0.82rem' }}>-</span>;
  }

  // Clean digits
  const cleanDigits = singleNumber.replace(/[^\d+]/g, '');
  const rawDigitsOnly = cleanDigits.replace(/\D/g, '');

  // Masked format: "xxxxxx4578" (only last 4 digits visible)
  let maskedText = singleNumber;
  if (rawDigitsOnly.length >= 4) {
    const last4 = rawDigitsOnly.slice(-4);
    maskedText = `xxxxxx${last4}`;
  }

  const displayText = isRevealed ? singleNumber : maskedText;

  const handleCall = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (onCall) {
      onCall(cleanDigits || singleNumber);
    } else {
      triggerDirectCall(cleanDigits || singleNumber);
    }
  };

  const handleToggleReveal = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (globalRevealedInstanceId === instanceId) {
      // Clicking eye on currently revealed number hides it
      broadcastRevealedId(null);
    } else {
      // Revealing this number automatically causes all other numbers on the screen to hide
      broadcastRevealedId(instanceId);
    }
  };

  const handleCopy = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      const copyVal = cleanDigits || singleNumber;
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyVal);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = copyVal;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  const isSmall = size === 'sm';
  const iconBtnSize = isSmall ? '20px' : '22px';
  const fontSize = isSmall ? '0.74rem' : '0.82rem';

  return (
    <div
      className={className}
      onClick={e => e.stopPropagation()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        whiteSpace: 'nowrap',
        backgroundColor: showBorder ? 'var(--bg-primary, rgba(255,255,255,0.03))' : 'transparent',
        border: showBorder ? '1px solid var(--border-light, rgba(255,255,255,0.1))' : 'none',
        padding: showBorder ? '0.15rem 0.35rem' : 0,
        borderRadius: '6px',
        ...style
      }}
    >
      {/* 1. Calling Icon */}
      <button
        type="button"
        onClick={handleCall}
        title={`Call ${isRevealed ? singleNumber : maskedText} via Softphone`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: iconBtnSize,
          height: iconBtnSize,
          borderRadius: '5px',
          border: '1px solid #10b981',
          background: 'rgba(16, 185, 129, 0.12)',
          color: '#10b981',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = '#10b981';
          e.currentTarget.style.color = '#ffffff';
          e.currentTarget.style.transform = 'scale(1.08)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)';
          e.currentTarget.style.color = '#10b981';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <Phone size={isSmall ? 10 : 11} strokeWidth={2.5} />
      </button>

      {/* 2. Number display (xxxxxx4578 or full number) */}
      <span
        style={{
          fontFamily: 'monospace',
          fontSize: fontSize,
          fontWeight: 600,
          color: isRevealed ? textColor : 'var(--text-secondary, #94a3b8)',
          letterSpacing: isRevealed ? 'normal' : '0.3px',
          userSelect: 'all'
        }}
        title={isRevealed ? singleNumber : 'Click eye icon to reveal full number'}
      >
        {displayText}
      </span>

      {/* 3. Eye Icon (Toggle visibility - Exclusive single reveal) */}
      <button
        type="button"
        onClick={handleToggleReveal}
        title={isRevealed ? "Hide number" : "Show full number"}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: iconBtnSize,
          height: iconBtnSize,
          borderRadius: '4px',
          border: isRevealed ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
          background: isRevealed ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
          color: isRevealed ? '#38bdf8' : 'var(--text-secondary, #94a3b8)',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={e => {
          if (!isRevealed) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.color = '#38bdf8';
          }
        }}
        onMouseLeave={e => {
          if (!isRevealed) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)';
          }
        }}
      >
        {isRevealed ? <EyeOff size={isSmall ? 11 : 12} /> : <Eye size={isSmall ? 11 : 12} />}
      </button>

      {/* 4. Copy Icon */}
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? "Copied to clipboard!" : "Copy full number"}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: iconBtnSize,
          height: iconBtnSize,
          borderRadius: '4px',
          border: copied ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid transparent',
          background: copied ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
          color: copied ? '#10b981' : 'var(--text-secondary, #94a3b8)',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={e => {
          if (!copied) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.color = '#10b981';
          }
        }}
        onMouseLeave={e => {
          if (!copied) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)';
          }
        }}
      >
        {copied ? <Check size={isSmall ? 10 : 11} strokeWidth={3} /> : <Copy size={isSmall ? 10 : 11} />}
      </button>
    </div>
  );
}
