'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Download, Sparkles, X, Smartphone } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function AppLiveUpdateBanner() {
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [serverVersion, setServerVersion] = useState('');
  const [hasNewApk, setHasNewApk] = useState(false);
  const [isForceUpgrade, setIsForceUpgrade] = useState(false);
  const [apkInfo, setApkInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [isReadyToRefresh, setIsReadyToRefresh] = useState(false);

  const initialVersionRef = useRef('');
  const touchStartYRef = useRef(0);
  const touchStartXRef = useRef(0);
  const touchStartTimeRef = useRef(0);
  const readyStartTimeRef = useRef(0);
  const isPullingRef = useRef(false);
  const isReadyRef = useRef(false);

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
        const ua = navigator.userAgent || '';
        const cap = window.Capacitor;
        const isCapacitor = Boolean(
          (typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : cap?.isNative) ||
          ua.includes('Capacitor')
        );
        const isAndroidWebView = /Android/i.test(ua) && (
          /;\s*wv\)/i.test(ua) ||
          /Version\/[\d.]+/i.test(ua) ||
          /spcworkspace/i.test(ua) ||
          document.referrer.includes('android-app://')
        );
        const isAndroidApp = isCapacitor || isAndroidWebView;

        if (isAndroidApp && data.android.latest_version_code) {
          // Query native FieldTracker plugin if available to get TRUE installed versionCode
          let currentCode = Number(window.localStorage?.getItem('spc_android_version_code') || 0);
          try {
            const plugin = window?.Capacitor?.Plugins?.FieldTracker;
            if (plugin && typeof plugin.getStatus === 'function') {
              const st = await plugin.getStatus();
              if (st?.appVersionCode) {
                currentCode = Number(st.appVersionCode);
                window.localStorage?.setItem('spc_android_version_code', String(currentCode));
              }
            }
          } catch {}

          const minSupported = Number(data.android.min_supported_version_code || 9);
          const latestCode = Number(data.android.latest_version_code || 9);

          // Option 1: Force Blocking Upgrade if currentCode < minSupported
          if (currentCode < minSupported) {
            setIsForceUpgrade(true);
            setHasNewApk(true);
            setApkInfo({ ...data.android, currentCode });
          } else if (currentCode < latestCode) {
            // Optional / standard update banner
            setIsForceUpgrade(false);
            setHasNewApk(true);
            setApkInfo({ ...data.android, currentCode });
          } else {
            // App is up to date (v9+)
            setIsForceUpgrade(false);
            setHasNewApk(false);
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

  // Mobile Pull-to-Refresh Gesture Handler (Deliberate 2-Stage Pull with Anti-Flick Protection)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onTouchStart = (e) => {
      // Must be at the very top of the window (scrollY <= 0)
      const docTop = window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
      if (docTop <= 0 && e.touches.length === 1) {
        touchStartYRef.current = e.touches[0].clientY;
        touchStartXRef.current = e.touches[0].clientX;
        touchStartTimeRef.current = Date.now();
        readyStartTimeRef.current = 0;
        isPullingRef.current = true;
        isReadyRef.current = false;
      } else {
        isPullingRef.current = false;
        isReadyRef.current = false;
      }
    };

    const onTouchMove = (e) => {
      if (!isPullingRef.current || e.touches.length !== 1) return;

      const docTop = window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
      if (docTop > 0) {
        isPullingRef.current = false;
        isReadyRef.current = false;
        readyStartTimeRef.current = 0;
        setPullProgress(0);
        setIsReadyToRefresh(false);
        return;
      }

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = currentY - touchStartYRef.current;
      const deltaX = currentX - touchStartXRef.current;

      // Cancel immediately if user is swiping horizontally (tabs, table scrolling)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 15) {
        isPullingRef.current = false;
        isReadyRef.current = false;
        readyStartTimeRef.current = 0;
        setPullProgress(0);
        setIsReadyToRefresh(false);
        return;
      }

      // Generous dead-zone: less than 60px downward movement is completely ignored (no visual flicker, no reload)
      if (deltaY <= 60) {
        setPullProgress(0);
        isReadyRef.current = false;
        readyStartTimeRef.current = 0;
        setIsReadyToRefresh(false);
        return;
      }

      // Active pull range from 60px to 210px (requires 150px deliberate downward drag beyond dead-zone)
      const pullDist = deltaY - 60;
      const PULL_THRESHOLD = 150;
      const progress = Math.min(100, Math.round((pullDist / PULL_THRESHOLD) * 100));
      setPullProgress(progress);

      const ready = progress >= 100;
      isReadyRef.current = ready;
      setIsReadyToRefresh(ready);

      if (ready) {
        if (!readyStartTimeRef.current) {
          readyStartTimeRef.current = Date.now();
        }
      } else {
        readyStartTimeRef.current = 0;
      }
    };

    const onTouchEnd = async (e) => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;

      const wasReady = isReadyRef.current;
      const totalDuration = Date.now() - (touchStartTimeRef.current || 0);
      const holdDuration = readyStartTimeRef.current > 0 ? (Date.now() - readyStartTimeRef.current) : 0;

      isReadyRef.current = false;
      readyStartTimeRef.current = 0;
      touchStartTimeRef.current = 0;
      setPullProgress(0);
      setIsReadyToRefresh(false);

      // ANTI-FLICK (JHATKA) FILTER:
      // 1. Must have reached 100% threshold
      // 2. Gesture must not be a fast jerk (totalDuration >= 450ms)
      // 3. User must have held finger at 100% ready state for at least 150ms
      // If any condition fails, CANCEL CLEANLY with zero refresh!
      if (!wasReady || totalDuration < 450 || holdDuration < 150) {
        return;
      }

      // Only refresh if deliberately pulled and held at 100%
      setIsPullRefreshing(true);
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      } catch {}
      setTimeout(() => {
        window.location.reload();
      }, 400);
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

  // Action: 1-Click Direct Native APK Download (Launches external Chrome directly)
  const handleDownloadApk = (e) => {
    const launcherUrl = 'https://tinyurl.com/22jnrvlx';
    try {
      window.location.href = launcherUrl;
    } catch {
      try {
        window.open(launcherUrl, '_system');
      } catch {}
    }
  };

  const handleCopyLink = () => {
    const directUrl = 'https://app.supujacreations.com/api/public/android-apk';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(directUrl);
      } else {
        const input = document.createElement('input');
        input.value = directUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 5000);
    } catch {}
  };

  return (
    <>
      {/* Option 1: Mandatory Full-Screen Blocking Modal when APK < min_supported_version_code (v9) */}
      {isForceUpgrade && apkInfo && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100001,
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            overflowY: 'auto'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              maxWidth: '440px',
              width: '100%',
              padding: '1.75rem 1.4rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              textAlign: 'center',
              border: '2px solid #ef4444',
              maxHeight: '94vh',
              overflowY: 'auto'
            }}
          >
            {/* Header Icon */}
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 0.85rem'
              }}
            >
              <Smartphone size={30} />
            </div>

            {/* SECTION 1: Hindi / Hinglish (User-Requested) */}
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.35rem' }}>
              🚀 Zaroori App Update Anivarya Hai
            </h2>

            <div
              style={{
                display: 'inline-block',
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                color: '#991b1b',
                padding: '3px 12px',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: 700,
                marginBottom: '0.75rem'
              }}
            >
              Installed: v{apkInfo.currentCode || '6'} → Required: v{apkInfo.latest_version_code || 9}
            </div>

            <p style={{ fontSize: '0.84rem', color: '#334155', lineHeight: 1.5, marginBottom: '0.45rem', textAlign: 'left' }}>
              SPC Workspace ka naya version <strong>v{apkInfo.latest_version_code || 9}</strong> release ho chuka hai. Is update mein <strong>kai naye features add kiye gaye hain aur existing features ko upgrade kiya gaya hai.</strong>
            </p>

            <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5, marginBottom: '0.85rem', textAlign: 'left' }}>
              Behtar performance, faster speed, improved security aur smooth user experience ke liye <strong>naya version install karna anivarya hai.</strong>
            </p>

            {/* DIVIDER / CHANGE LINE */}
            <div style={{ height: '1px', background: 'linear-gradient(to right, transparent, #cbd5e1, transparent)', margin: '0.85rem 0' }} />

            {/* SECTION 2: English (User-Requested) */}
            <h3 style={{ fontSize: '1.12rem', fontWeight: 800, color: '#1e3a8a', marginBottom: '0.35rem' }}>
              🚀 BIG UPDATE IS HERE!
            </h3>

            <div
              style={{
                display: 'inline-block',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1e40af',
                padding: '3px 12px',
                borderRadius: '999px',
                fontSize: '0.76rem',
                fontWeight: 700,
                marginBottom: '0.65rem'
              }}
            >
              Installed: v{apkInfo.currentCode || '6'} → New Version: v{apkInfo.latest_version_code || 9}
            </div>

            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.4rem', textAlign: 'left' }}>
              ✨ New Features. Smarter Tools. Better Experience!
            </div>

            <p style={{ fontSize: '0.80rem', color: '#475569', lineHeight: 1.5, marginBottom: '0.45rem', textAlign: 'left' }}>
              SPC Workspace is now upgraded with <strong>exciting new features, enhanced functionality, and smoother performance.</strong>
            </p>

            <p style={{ fontSize: '0.80rem', color: '#1e293b', fontWeight: 600, lineHeight: 1.45, marginBottom: '1.1rem', textAlign: 'left' }}>
              ⚡ Update now to unlock the latest improvements and continue using the app.
            </p>

            {/* ACTION 1: Download & Update Button (1-Click Chrome Launcher) */}
            <a
              href="https://tinyurl.com/22jnrvlx"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleDownloadApk}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.85rem 1rem',
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                color: '#ffffff',
                borderRadius: '12px',
                fontSize: '0.95rem',
                fontWeight: 800,
                textDecoration: 'none',
                boxShadow: '0 8px 20px rgba(220, 38, 38, 0.4)',
                cursor: 'pointer',
                marginBottom: '0.65rem'
              }}
            >
              <Download size={18} />
              🔴 DOWNLOAD & UPDATE NOW
            </a>

            {/* ACTION 2: Backup 1-Tap Copy Link Button */}
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                width: '100%',
                padding: '0.60rem 0.8rem',
                background: copiedLink ? '#dcfce7' : '#f8fafc',
                border: copiedLink ? '1px solid #86efac' : '1px solid #cbd5e1',
                color: copiedLink ? '#15803d' : '#475569',
                borderRadius: '10px',
                fontSize: '0.80rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                marginBottom: '0.75rem'
              }}
            >
              {copiedLink ? '✅ Official Link Copied!' : '📋 Copy Direct Download Link'}
            </button>

            {/* Direct Link Readout */}
            <div style={{ fontSize: '0.70rem', color: '#64748b', wordBreak: 'break-all', marginBottom: '0.75rem' }}>
              Official URL: <strong>https://app.supujacreations.com/api/public/android-apk</strong>
            </div>

            {/* Footers (User-Requested) */}
            <div style={{ fontSize: '0.74rem', color: '#475569', fontStyle: 'italic', marginBottom: '0.2rem' }}>
              Install hone ke baad app dobara kholein. Yeh screen automatically hat jayegi.
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
              Reopen the app after installing the update.
            </div>
          </div>
        </div>
      )}

      {/* Pull-to-refresh deliberate feedback indicator */}
      {(pullProgress > 0 || isPullRefreshing) && (
        <div style={{
          position: 'fixed',
          top: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 99999,
          background: isReadyToRefresh ? '#ecfdf5' : '#ffffff',
          border: isReadyToRefresh ? '1.5px solid #10b981' : '1.5px solid #3b82f6',
          borderRadius: '999px',
          padding: '6px 16px',
          boxShadow: isReadyToRefresh ? '0 6px 20px rgba(16, 185, 129, 0.35)' : '0 4px 16px rgba(59, 130, 246, 0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          fontSize: '0.8rem',
          fontWeight: 700,
          color: isReadyToRefresh ? '#065f46' : '#1d4ed8',
          pointerEvents: 'none',
          transition: 'all 0.12s ease'
        }}>
          <RefreshCw size={14} style={{ animation: isPullRefreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          <span>
            {isPullRefreshing
              ? '⚡ Workspace refresh ho raha hai...'
              : isReadyToRefresh
                ? '🟢 Chhodein refresh karne ke liye!'
                : `⬇️ Niche khichein (${pullProgress}%) — Chhodne par cancel`}
          </span>
        </div>
      )}

      {/* Banner 1: Native APK Upgrade Available (Non-blocking for optional updates) */}
      {!dismissed && !isForceUpgrade && hasNewApk && apkInfo && (
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
            <a
              href={apkInfo.download_url || 'https://app.supujacreations.com/api/public/android-apk'}
              target="_blank"
              rel="noopener noreferrer"
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
                gap: '0.35rem',
                textDecoration: 'none'
              }}
            >
              <Download size={13} />
              Update
            </a>
            <button
              onClick={() => setDismissed(true)}
              style={{ background: 'transparent', border: 'none', color: '#ffffff', opacity: 0.7, cursor: 'pointer', padding: '4px' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Banner 2: Live CRM Web & Policy Hot-Update */}
      {!dismissed && !hasNewApk && hasNewVersion && (
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
      )}
    </>
  );
}
