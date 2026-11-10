'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MapPinOff, X } from 'lucide-react';
import { recordLocationPingBatch, issueFieldTelemetryToken } from '@/app/actions/liveTracking';
import { detectClientPlatform, PLATFORM_LABELS } from '@/utils/platformDetection';
import { flushOfflineVault, queueOfflineGpsPing } from '@/utils/offlineLocationVault';

function calculateHaversineMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isMobileTrackerClient() {
  if (typeof window === 'undefined') return false;
  try {
    const { platform } = detectClientPlatform();
    if (platform === PLATFORM_LABELS.ANDROID_APP || platform === PLATFORM_LABELS.IOS_APP) {
      return true;
    }
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  } catch {
    return false;
  }
}

async function readBatterySnapshot() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function') {
      const bat = await navigator.getBattery();
      if (bat && typeof bat.level === 'number') {
        return {
          batteryPct: Math.round(bat.level * 100),
          isCharging: Boolean(bat.charging)
        };
      }
    }
  } catch {
    // Unsupported browsers (e.g. iOS Safari) cleanly fallback to null
  }
  return { batteryPct: null, isCharging: false };
}

/**
 * Always-on headless GPS + Battery telemetry tracker mounted at root CRM shell.
 * Runs exclusively on Mobile / Android APK / iOS App across all tabs so Desk PCs
 * never overwrite mobile travel and mobile tracking works even outside Field tabs.
 */
export default function GlobalMobileTelemetryTracker({
  userId,
  company = 'TNT00001',
  branchCode = null
}) {
  const lastRecordedRef = useRef({ lat: null, lng: null, time: 0 });
  const lastForceAtRef = useRef(0);
  const inFlightRef = useRef(false);
  const [gpsAlert, setGpsAlert] = useState(null);
  const [dismissedAlert, setDismissedAlert] = useState(false);

  useEffect(() => {
    if (!userId || typeof window === 'undefined' || !navigator.geolocation) return;
    if (!isMobileTrackerClient()) return;

    let disposed = false;
    let watchId = null;
    let heartbeatTimer = null;
    let nativeServiceActive = false;
    let lastNativeTokenAt = 0;

    const getNativeTrackerPlugin = () => {
      try {
        if (typeof window === 'undefined') return null;
        if (!window.Capacitor?.isNativePlatform?.()) return null;
        return window.Capacitor?.Plugins?.FieldTracker || null;
      } catch {
        return null;
      }
    };

    const startOrRefreshNativeService = async (forceRefresh = false) => {
      const plugin = getNativeTrackerPlugin();
      if (!plugin || disposed) return false;
      const now = Date.now();
      if (!forceRefresh && nativeServiceActive && now - lastNativeTokenAt < 6 * 3600 * 1000) {
        try {
          await plugin.flushNow();
        } catch {}
        return true;
      }

      try {
        const tokenRes = await issueFieldTelemetryToken({
          userId,
          company: company || 'TNT00001',
          branchCode: branchCode || null
        });
        if (disposed || !tokenRes?.success || !tokenRes?.token) return false;

        lastNativeTokenAt = Date.now();
        const startRes = await plugin.startTracking({
          userId,
          company: company || 'TNT00001',
          branchCode: branchCode || '',
          endpointUrl: window.location.origin,
          token: tokenRes.token
        });
        if (startRes?.started || startRes?.running) {
          nativeServiceActive = true;
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
          setGpsAlert(null);
          return true;
        }
        if (startRes?.permissionDenied) {
          setGpsAlert('Background location permission required for offline field tracking.');
        }
      } catch {
        // Fallback smoothly to web tracker if native bridge unavailable
      }
      return false;
    };

    const syncQueuedPings = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      try {
        await flushOfflineVault(
          async (queuedPings) => {
            if (!Array.isArray(queuedPings) || queuedPings.length === 0) return true;
            const res = await recordLocationPingBatch(
              queuedPings.map(p => ({ ...p, is_offline_synced: true }))
            );
            return Boolean(res?.success);
          },
          null
        );
      } catch {
        // Retry on next online / resume trigger
      }
    };

    const handlePosition = async (pos, forceSend = false) => {
      if (disposed || !pos?.coords) return;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy != null ? Math.min(Math.round(pos.coords.accuracy), 9999) : null;
      const speedKmh = pos.coords.speed != null ? Math.min(Math.round(pos.coords.speed * 3.6), 999) : 0;
      const heading = pos.coords.heading != null ? Math.min(Math.round(pos.coords.heading), 360) : null;

      setGpsAlert(null);

      // Broadcast accurate GPS coordinates to active UI views (e.g. FieldMobileDashboard)
      try {
        window.dispatchEvent(new CustomEvent('spc_mobile_gps_fix', { detail: { lat, lng, accuracy } }));
      } catch {
        // Ignore custom event failures
      }

      // Skip web server uploads when Native Android Foreground Service is actively handling GPS + SQLite sync
      if (nativeServiceActive) return;

      // Skip coarse cell-tower fixes (>300m) without updating throttle ref so a crisp fix sends immediately
      if (accuracy != null && accuracy > 300) return;

      const now = Date.now();
      const last = lastRecordedRef.current;
      const distMeters = (last.lat && last.lng)
        ? calculateHaversineMeters(last.lat, last.lng, lat, lng)
        : 999;

      // Record on initial fix, movement >= 20m, true ~25s stationary heartbeat, or unthrottled resume
      const canForce = forceSend && (now - lastForceAtRef.current >= 2000);
      const shouldSend = canForce || !last.lat || distMeters >= 20 || (now - last.time >= 22000);
      if (!shouldSend || inFlightRef.current) return;

      inFlightRef.current = true;
      lastRecordedRef.current = { lat, lng, time: now };
      if (forceSend) lastForceAtRef.current = now;

      let pingPayload = {
        user_id: userId,
        company: company || 'TNT00001',
        branch_code: branchCode || null,
        latitude: lat,
        longitude: lng,
        accuracy_meters: accuracy,
        speed_kmh: speedKmh,
        heading,
        battery_pct: null,
        is_charging: false,
        is_moving: Boolean(speedKmh > 2 || distMeters >= 20),
        recorded_at: new Date().toISOString()
      };

      try {
        const { batteryPct, isCharging } = await readBatterySnapshot();
        pingPayload = {
          ...pingPayload,
          battery_pct: batteryPct,
          is_charging: isCharging
        };

        if (navigator.onLine) {
          const res = await recordLocationPingBatch([pingPayload]);
          if (!res?.success) {
            await queueOfflineGpsPing(pingPayload);
          } else {
            syncQueuedPings();
          }
        } else {
          await queueOfflineGpsPing(pingPayload);
        }
      } catch {
        try {
          await queueOfflineGpsPing(pingPayload);
        } catch {
          // Ignore vault errors
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    const handleGeoError = (err) => {
      if (disposed || !err || nativeServiceActive) return;
      if (err.code === 1) {
        setGpsAlert('Location permission is blocked. Enable GPS permission for SPC Workspace.');
      } else if (err.code === 2) {
        setGpsAlert('Phone GPS / Location appears OFF. Please turn on device Location.');
      }
    };

    const captureImmediatePing = (force = false) => {
      if (disposed || nativeServiceActive) return;
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => handlePosition(pos, force),
          handleGeoError,
          { enableHighAccuracy: true, maximumAge: 8000, timeout: 10000 }
        );
      } catch {
        // Ignore geolocation call errors
      }
    };

    // Start Native Android Foreground Service first (if on APK); always flush legacy web vault
    startOrRefreshNativeService(true).then((started) => {
      if (disposed) return;
      if (!started) {
        captureImmediatePing(true);
      }
    });
    syncQueuedPings();

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => handlePosition(pos, false),
        handleGeoError,
        { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 }
      );
    } catch {
      // Fallback interval covers devices where watchPosition fails
    }

    // 25s interval > 22s stationary threshold (used on mobile browsers / older APKs without native plugin)
    heartbeatTimer = setInterval(() => {
      if (!nativeServiceActive) captureImmediatePing(false);
    }, 25000);

    const handleResume = () => {
      if (document.visibilityState === 'hidden') return;
      syncQueuedPings();
      startOrRefreshNativeService(false).then((started) => {
        if (!started && !disposed) captureImmediatePing(true);
      });
    };

    const handleOnline = () => {
      lastForceAtRef.current = 0;
      syncQueuedPings();
      startOrRefreshNativeService(false).then((started) => {
        if (!started && !disposed) captureImmediatePing(true);
      });
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    window.addEventListener('online', handleOnline);

    return () => {
      disposed = true;
      if (watchId !== null) {
        try { navigator.geolocation.clearWatch(watchId); } catch {}
      }
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('online', handleOnline);
    };
  }, [userId, company, branchCode]);

  if (!gpsAlert || dismissedAlert) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: '76px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99990,
        maxWidth: '92vw',
        width: 'max-content',
        background: '#fff7ed',
        border: '1px solid #fdba74',
        color: '#9a3412',
        padding: '0.55rem 0.85rem',
        borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.55rem',
        fontSize: '0.78rem',
        fontWeight: 700
      }}
    >
      <MapPinOff size={16} color="#ea580c" style={{ flexShrink: 0 }} />
      <span>{gpsAlert}</span>
      <button
        type="button"
        onClick={() => setDismissedAlert(true)}
        aria-label="Dismiss GPS notice"
        style={{
          border: 0,
          background: 'transparent',
          color: '#9a3412',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
