'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, Settings, RefreshCw, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { PERMISSION_DESCRIPTORS, resolveModulePermissionConfig } from '@/config/modulePermissionsConfig';
import {
  checkModulePermissions,
  getNativeFieldTrackerPlugin,
  openNativeAppPermissionSettings,
  requestModulePermissions
} from '@/utils/devicePermissionsBridge';

const DISMISS_STORAGE_PREFIX = 'spc_perm_prompt_dismissed_';
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours cooldown for optional prompts

function wasRecentlyDismissed(key) {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage?.getItem(`${DISMISS_STORAGE_PREFIX}${key}`);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markDismissed(key) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(`${DISMISS_STORAGE_PREFIX}${key}`, String(Date.now()));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Universal On-Demand Permission Modal Prompt
 *
 * Modes:
 * 1) Automatic per-module guard: pass `activeModule` (mounted once in CRMContainer).
 * 2) Imperative / custom trigger: any future module can dispatch:
 *    window.dispatchEvent(new CustomEvent('spc_request_module_permissions', {
 *      detail: { moduleId: 'my_new_module', title: '...', subtitle: '...', permissions: ['camera'], mandatory: false, onComplete: (res) => {} }
 *    }))
 */
export default function ModulePermissionPromptModal({ activeModule = null, trackingPolicy = 'PUNCH_ONLY' }) {
  const [promptConfig, setPromptConfig] = useState(null);
  const [statusResult, setStatusResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const callbackRef = useRef(null);
  const checkSeqRef = useRef(0);

  const evaluateAndShow = useCallback(async (config, { ignoreCooldown = false, onComplete = null } = {}) => {
    if (!config || !Array.isArray(config.permissions) || config.permissions.length === 0) {
      setPromptConfig(null);
      if (typeof onComplete === 'function') onComplete({ allGranted: true, statuses: {} });
      return;
    }

    const isNative = Boolean(getNativeFieldTrackerPlugin());
    if (config.nativeAppOnly && !isNative) {
      setPromptConfig(null);
      if (typeof onComplete === 'function') onComplete({ allGranted: true, skippedNonNative: true });
      return;
    }

    // Avoid overlapping with GlobalMobileTelemetryTracker's mandatory LIVE_TRACKING modal on Field Force
    const permissionsToCheck = [...config.permissions];
    if (
      config.moduleId === 'field_force' &&
      trackingPolicy === 'LIVE_TRACKING' &&
      !permissionsToCheck.includes('background_location')
    ) {
      // background_location is already handled by GlobalMobileTelemetryTracker for LIVE_TRACKING
    }

    if (!config.mandatory && !ignoreCooldown && wasRecentlyDismissed(config.moduleId || permissionsToCheck.join('_'))) {
      if (typeof onComplete === 'function') onComplete({ allGranted: false, skippedCooldown: true });
      return;
    }

    const seq = ++checkSeqRef.current;
    try {
      const checkRes = await checkModulePermissions(permissionsToCheck);
      if (seq !== checkSeqRef.current) return;

      if (checkRes.allGranted) {
        setPromptConfig(null);
        setStatusResult(null);
        setFeedbackMsg('');
        if (typeof onComplete === 'function') onComplete(checkRes);
        return;
      }

      callbackRef.current = onComplete;
      setStatusResult(checkRes);
      setFeedbackMsg('');
      setPromptConfig({
        ...config,
        permissions: permissionsToCheck
      });
    } catch {
      // Non-blocking fail-safe
    }
  }, [trackingPolicy]);

  // Automatic check when user navigates to a configured module
  useEffect(() => {
    const cfg = resolveModulePermissionConfig(activeModule);
    if (!cfg) {
      setPromptConfig(null);
      return;
    }
    const timer = setTimeout(() => {
      void evaluateAndShow(cfg, { ignoreCooldown: false });
    }, 350);
    return () => clearTimeout(timer);
  }, [activeModule, evaluateAndShow]);

  // Imperative event listener so ANY future web module can request permissions via modal on demand
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleCustomRequest = (ev) => {
      const detail = ev?.detail;
      if (!detail || !Array.isArray(detail.permissions) || detail.permissions.length === 0) return;
      void evaluateAndShow(
        {
          moduleId: detail.moduleId || `custom_${detail.permissions.join('_')}`,
          title: detail.title || 'App Permission Zaroori Hai',
          subtitle: detail.subtitle || 'Is feature ko chalane ke liye neeche di gayi permissions allow karein.',
          permissions: detail.permissions,
          mandatory: Boolean(detail.mandatory),
          nativeAppOnly: Boolean(detail.nativeAppOnly)
        },
        {
          ignoreCooldown: detail.ignoreCooldown !== false,
          onComplete: typeof detail.onComplete === 'function' ? detail.onComplete : null
        }
      );
    };
    window.addEventListener('spc_request_module_permissions', handleCustomRequest);
    return () => window.removeEventListener('spc_request_module_permissions', handleCustomRequest);
  }, [evaluateAndShow]);

  // Re-verify automatically when user returns from Android App Settings
  useEffect(() => {
    if (!promptConfig) return;
    const onFocusResume = async () => {
      if (document.visibilityState === 'hidden') return;
      const checkRes = await checkModulePermissions(promptConfig.permissions);
      setStatusResult(checkRes);
      if (checkRes.allGranted) {
        const cb = callbackRef.current;
        callbackRef.current = null;
        setPromptConfig(null);
        setFeedbackMsg('');
        if (typeof cb === 'function') cb(checkRes);
      }
    };
    window.addEventListener('focus', onFocusResume);
    document.addEventListener('visibilitychange', onFocusResume);
    return () => {
      window.removeEventListener('focus', onFocusResume);
      document.removeEventListener('visibilitychange', onFocusResume);
    };
  }, [promptConfig]);

  if (!promptConfig || !statusResult) return null;

  const missingKeys = statusResult.missingKeys || [];
  const needsSettings = Boolean(statusResult.requiresAppSettings);
  const isNative = Boolean(getNativeFieldTrackerPlugin());

  const handleAllowNow = async () => {
    if (busy) return;
    setBusy(true);
    setFeedbackMsg('');
    try {
      const res = await requestModulePermissions(missingKeys);
      setStatusResult(res);
      if (res.allGranted) {
        const cb = callbackRef.current;
        callbackRef.current = null;
        setPromptConfig(null);
        if (typeof cb === 'function') cb(res);
        return;
      }
      if (res.requiresAppSettings) {
        setFeedbackMsg('Phone ne permission block kar rakhi hai — "Open App Settings" par tap karke Allow karein.');
      } else {
        setFeedbackMsg('Kuch permissions abhi pending hain. Dobara Allow par tap karein.');
      }
    } catch {
      setFeedbackMsg('Permission request complete nahi ho saki. Kripya App Settings se allow karein.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenSettings = async () => {
    const opened = await openNativeAppPermissionSettings();
    if (!opened) {
      setFeedbackMsg('Phone Settings ➔ Apps ➔ SPC Workspace ➔ Permissions me jakar Allow karein.');
    }
  };

  const handleVerify = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await checkModulePermissions(promptConfig.permissions);
      setStatusResult(res);
      if (res.allGranted) {
        const cb = callbackRef.current;
        callbackRef.current = null;
        setPromptConfig(null);
        setFeedbackMsg('');
        if (typeof cb === 'function') cb(res);
      } else {
        setFeedbackMsg('Abhi sabhi permissions allow nahi hui hain.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    if (promptConfig.mandatory) return;
    markDismissed(promptConfig.moduleId || promptConfig.permissions.join('_'));
    const cb = callbackRef.current;
    callbackRef.current = null;
    setPromptConfig(null);
    setFeedbackMsg('');
    if (typeof cb === 'function') cb({ allGranted: false, dismissed: true, statuses: statusResult?.statuses || {} });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999995,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '18px',
          maxWidth: '420px',
          width: '100%',
          padding: '1.4rem',
          boxShadow: '0 24px 48px rgba(15, 23, 42, 0.35)',
          border: '1px solid #e2e8f0',
          position: 'relative',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
      >
        {!promptConfig.mandatory && (
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close permission modal"
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              border: 'none',
              background: '#f1f5f9',
              color: '#475569',
              width: '30px',
              height: '30px',
              borderRadius: '999px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={16} />
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', paddingRight: '1.75rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <ShieldCheck size={24} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
              {promptConfig.title}
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#475569', lineHeight: 1.4 }}>
              {promptConfig.subtitle}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '0.9rem 0 1rem 0' }}>
          {promptConfig.permissions.map((key) => {
            const desc = PERMISSION_DESCRIPTORS[key] || { key, label: key, icon: '🔐', shortDesc: 'Module feature activation ke liye' };
            const st = statusResult.statuses?.[key];
            const granted = st?.granted === true;
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '9px 11px',
                  borderRadius: '10px',
                  background: granted ? '#f0fdf4' : '#f8fafc',
                  border: `1px solid ${granted ? '#bbf7d0' : '#e2e8f0'}`
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
                  <span style={{ fontSize: '1.1rem', lineHeight: 1.2 }}>{desc.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>{desc.label}</div>
                    <div style={{ fontSize: '0.73rem', color: '#64748b', lineHeight: 1.35 }}>{desc.shortDesc}</div>
                  </div>
                </div>
                {granted ? (
                  <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0 }} />
                ) : (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: st?.state === 'permanently_denied' ? '#b91c1c' : '#d97706',
                      background: st?.state === 'permanently_denied' ? '#fee2e2' : '#fef3c7',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      flexShrink: 0
                    }}
                  >
                    {st?.state === 'permanently_denied' ? 'Blocked' : 'Needed'}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {feedbackMsg && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              padding: '8px 10px',
              borderRadius: '8px',
              fontSize: '0.76rem',
              fontWeight: 600,
              marginBottom: '0.85rem'
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{feedbackMsg}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {!needsSettings ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleAllowNow}
              style={{
                width: '100%',
                padding: '11px 16px',
                borderRadius: '10px',
                border: 'none',
                background: busy ? '#93c5fd' : '#2563eb',
                color: '#ffffff',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: busy ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)'
              }}
            >
              <ShieldCheck size={17} />
              {busy ? 'Requesting Permission...' : 'Allow Permission'}
            </button>
          ) : (
            <>
              {isNative && (
                <button
                  type="button"
                  onClick={handleOpenSettings}
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Settings size={17} /> Open App Settings &amp; Allow
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={handleVerify}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#334155',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={14} /> Check Again
              </button>
            </>
          )}

          {!promptConfig.mandatory && (
            <button
              type="button"
              onClick={handleDismiss}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '10px',
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Abhi Nahi (Skip for now)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
