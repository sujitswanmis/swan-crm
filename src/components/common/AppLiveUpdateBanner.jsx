'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Download, Sparkles, X, Smartphone } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function AppLiveUpdateBanner() {
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [serverVersion, setServerVersion] = useState('');
  const [hasNewApk, setHasNewApk] = useState(false);
  const [apkInfo, setApkInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  const initialVersionRef = useRef('');
  const touchStartYRef = useRef(0);
  const isPullingRef = useRef(false);

  // Check server version
  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/version', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.version) return;

      if (!initialVersionRef.current) {
        initialVersionRef.current = data.version;
      } else if (data.version !== initialVersionRef.current) {
        setServerVersion(data.version);
        setHasNewVersion(true);
      }

      // Check if Android native APK needs upgrade
      if (typeof window !== 'undefined' && data.android) {
        const isAndroidApp = Boolean(
          window.Capacitor?.isNativePlatform() ||
          navigator.userAgent.includes('Capacitor') ||
          (navigator.userAgent.includes('Android') && navigator.userAgent.includes('wv'))
        );
        if (isAndroidApp && data.android.latest_version_code) {
          // Compare with locally known version code
          const localCode = Number(window.localStorage?.getItem('spc_android_version_code') || 0);
          if (localCode > 0 && localCode < data.android.latest_version_code) {
            setHasNewApk(true);
            setApkInfo(data.android);
          }
        }
      }
    } catch {}
  }, []);

  // Poll version periodically and on window focus/resume
  useEffect(() => {
    checkVersion();
    const interval = setInterval(checkVersion, 180000); // Check every 3 min

    const handleFocus = () => checkVersion();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    // Listen for Realtime CRM Live Reload Broadcasts
    try {
      const supabase = createClient();
      const channel = supabase.channel('crm_live_updates');
      channel.on('broadcast', { event: 'crm_force_live_reload' }, (payload) => {
        if (payload?.payload?.version) {
          setServerVersion(payload.payload.version);
          setHasNewVersion(true);
        } else {
          checkVersion();
        }
      }).subscribe();

      return () => {
        clearInterval(interval);
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibility);
        try { supabase.removeChannel(channel); } catch {}
      };
    } catch {
      return () => {
        clearInterval(interval);
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }
  }, [checkVersion]);

  // Mobile Pull-to-Refresh Gesture Handler
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onTouchStart = (e) => {
      if (window.scrollY <= 2) {
        touchStartYRef.current = e.touches[0].clientY;
        isPullingRef.current = true;
      }
    };

    const onTouchMove = (e) => {
      if (!isPullingRef.current || window.scrollY > 2) {
        isPullingRef.current = false;
        setPullProgress(0);
        return;
      }
      const currentY = e.touches[0].clientY;
      const diff = currentY - touchStartYRef.current;
      if (diff > 0 && diff < 160) {
        setPullProgress(Math.min(100, Math.round((diff / 120) * 100)));
      }
    };

    const onTouchEnd = async (e) => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;
      const currentY = e.changedTouches[0].clientY;
      const diff = currentY - touchStartYRef.current;
      setPullProgress(0);

      if (diff >= 90) {
        setIsPullRefreshing(true);
        try {
          // Clear caches & reload cleanly
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          }
        } catch {}
        setTimeout(() => {
          window.location.reload();
        }, 350);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // Action: 1-Click Reload
  const handleReload = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch {}
    window.location.reload();
  };

  // Action: 1-Click Native APK Download & Install
  const handleDownloadApk = () => {
    const url = apkInfo?.download_url || '/api/public/android-apk';
    window.location.href = url;
  };

  // Pull-to-refresh spinner indicator
  if (pullProgress > 0 || isPullRefreshing) {
    return (
      <div style={{
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        background: 'var(--bg-surface, #ffffff)',
        border: '1.5px solid #2563eb',
        borderRadius: '999px',
        padding: '6px 14px',
        boxShadow: '0 4px 16px rgba(37, 99, 235, 0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.78rem',
        fontWeight: 600,
        color: '#2563eb',
        pointerEvents: 'none'
      }}>
        <RefreshCw size={14} style={{ animation: isPullRefreshing ? 'spin 1s linear infinite' : 'none' }} />
        <span>{isPullRefreshing ? 'Refreshing live CRM...' : `Pull to refresh (${pullProgress}%)`}</span>
      </div>
    );
  }

  if (dismissed) return null;

  // Banner 1: Native APK Upgrade Available
  if (hasNewApk && apkInfo) {
    return (
      <div style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        right: '16px',
        maxWidth: '480px',
        margin: '0 auto',
        zIndex: 99998,
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
        color: '#ffffff',
        borderRadius: '12px',
        padding: '0.75rem 1rem',
        boxShadow: '0 8px 24px rgba(30, 58, 138, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Smartphone size={22} style={{ color: '#60a5fa', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>
              📲 Naya Android App Update (v{apkInfo.latest_version_code})
            </div>
            <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>
              Tap karein turant update install karne ke liye.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          <button
            onClick={handleDownloadApk}
            style={{
              background: '#ffffff',
              color: '#1e40af',
              border: 'none',
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.76rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <Download size={13} />
            Update
          </button>
          <button
            onClick={() => setDismissed(true)}
            style={{ background: 'transparent', border: 'none', color: '#ffffff', opacity: 0.7, cursor: 'pointer', padding: '4px' }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Banner 2: Live CRM Web & Policy Hot-Update
  if (hasNewVersion) {
    return (
      <div style={{
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99998,
        background: 'linear-gradient(135deg, #047857 0%, #059669 100%)',
        color: '#ffffff',
        borderRadius: '999px',
        padding: '0.45rem 1rem',
        boxShadow: '0 6px 20px rgba(5, 150, 105, 0.35)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
        border: '1px solid rgba(255, 255, 255, 0.25)',
        animation: 'slideDown 0.3s ease-out'
      }}>
        <Sparkles size={15} style={{ color: '#a7f3d0' }} />
        <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>
          ⚡ Naya Live Update Aaya Hai ({serverVersion || 'vLatest'})!
        </span>
        <button
          onClick={handleReload}
          style={{
            background: '#ffffff',
            color: '#065f46',
            border: 'none',
            padding: '0.25rem 0.65rem',
            borderRadius: '999px',
            fontSize: '0.74rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem'
          }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'transparent', border: 'none', color: '#ffffff', opacity: 0.75, cursor: 'pointer', padding: '2px', display: 'flex' }}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return null;
}
