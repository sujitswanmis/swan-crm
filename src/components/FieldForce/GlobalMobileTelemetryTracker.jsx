'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MapPinOff, X, Download, Settings, BatteryCharging, ShieldAlert, RefreshCw } from 'lucide-react';
import {
  recordLocationPingBatch,
  issueFieldTelemetryToken,
  reportEmployeeDeviceHealth
} from '@/app/actions/liveTracking';
import { getTodayUserAttendanceStatus } from '@/app/actions/fieldTasks';
import { detectClientPlatform, PLATFORM_LABELS } from '@/utils/platformDetection';
import { flushOfflineVault, queueOfflineGpsPing } from '@/utils/offlineLocationVault';
import { initAttendanceReminderScheduler } from '@/utils/attendanceReminderScheduler';

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
    if (window.Capacitor?.isNativePlatform?.()) return true;
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
  branchCode = null,
  trackingPolicy = 'PUNCH_ONLY'
}) {
  const isFieldForce = trackingPolicy === 'LIVE_TRACKING';
  const lastRecordedRef = useRef({ lat: null, lng: null, time: 0 });
  const lastForceAtRef = useRef(0);
  const lastCrispGpsRef = useRef({ time: 0, acc: 9999 });
  const inFlightRef = useRef(false);
  const [gpsAlert, setGpsAlert] = useState(null);
  const [dismissedAlert, setDismissedAlert] = useState(false);
  const [deviceHealthBanner, setDeviceHealthBanner] = useState(null);
  const [dismissedHealthBanner, setDismissedHealthBanner] = useState(false);
  const [showMandatoryPermissionModal, setShowMandatoryPermissionModal] = useState(false);
  const [mandatoryGaps, setMandatoryGaps] = useState({ needsLocation: false, needsBattery: false });
  const isPunchedInRef = useRef(false);
  const lastHealthReportRef = useRef({ at: 0, sig: '' });

  // Universal Lightweight App Version & Device Health Audit:
  // Runs for ALL authenticated users & platforms (Android APK, iOS, Mobile Web, Windows Desktop App)
  // even when not punched in or on PUNCH_ONLY/ATTENDANCE_ONLY policy, while GPS tracking stays Field-Force + On-Duty only.
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    let disposed = false;
    let inFlight = false;

    const reportUniversalHealth = async (force = false) => {
      if (disposed || inFlight || navigator.onLine === false) return;
      inFlight = true;
      try {
        const plat = detectClientPlatform();
        const ua = navigator.userAgent || '';
        const plugin = window.Capacitor?.isNativePlatform?.() ? (window.Capacitor?.Plugins?.FieldTracker || null) : null;
        const desktopBridge = window.desktopApp?.isDesktop ? window.desktopApp : null;

        let payload = {
          userId,
          company,
          branchCode,
          platform: plat?.platform || PLATFORM_LABELS.WEB_APP,
          platform_details: plat?.details || ua
        };

        if (plugin && typeof plugin.getStatus === 'function') {
          let timer;
          let st;
          try {
            st = await Promise.race([
              plugin.getStatus(),
              new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native status timeout')), 5000); })
            ]);
          } finally {
            clearTimeout(timer);
          }
          payload = {
            ...payload,
            platform: PLATFORM_LABELS.ANDROID_APP,
            running: Boolean(st?.running),
            pendingCount: Number(st?.pendingCount || 0),
            hasForegroundLocation: st?.hasForegroundLocation,
            hasBackgroundLocation: st?.hasBackgroundLocation,
            locationMode: st?.locationMode,
            appVersionCode: st?.appVersionCode,
            appVersionName: st?.appVersionName,
            osVersion: st?.osVersion,
            sdkInt: st?.sdkInt,
            deviceManufacturer: st?.deviceManufacturer,
            deviceModel: st?.deviceModel,
            batteryUnrestricted: st?.batteryUnrestricted,
            notificationsEnabled: st?.notificationsEnabled,
            gpsProviderEnabled: st?.gpsProviderEnabled
          };
          if (st?.appVersionCode) {
            try { window.localStorage?.setItem('spc_android_version_code', String(st.appVersionCode)); } catch {}
          }
          if (typeof plugin.getFcmToken === 'function') {
            try {
              const fcmRes = await plugin.getFcmToken();
              const fcmToken = fcmRes?.token;
              if (fcmToken) {
                const syncKey = `${userId}:${fcmToken}`;
                const lastSynced = window.localStorage?.getItem('spc_fcm_token_synced');
                if (lastSynced !== syncKey) {
                  const regRes = await fetch('/api/push/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      fcmToken,
                      company,
                      platform: 'android',
                      appVersionCode: st?.appVersionCode ?? null,
                      deviceModel: st?.deviceModel ?? null
                    })
                  });
                  if (regRes.ok) {
                    try { window.localStorage?.setItem('spc_fcm_token_synced', syncKey); } catch {}
                  }
                }
              }
            } catch {}
          }
        } else if (desktopBridge) {
          const desktopCode = Number(desktopBridge.appVersionCode || (desktopBridge.version === '3.0.0' ? 3 : 2));
          payload = {
            ...payload,
            platform: plat?.platform === PLATFORM_LABELS.MACOS_APP ? PLATFORM_LABELS.MACOS_APP : PLATFORM_LABELS.WINDOWS_APP,
            appVersionCode: desktopCode,
            appVersionName: String(desktopBridge.appVersion || desktopBridge.version || `v${desktopCode}`),
            osVersion: desktopBridge.platform === 'darwin' ? 'macOS' : 'Windows',
            deviceManufacturer: 'Desktop',
            deviceModel: 'SPC Workspace Electron'
          };
        } else if (plat?.platform === PLATFORM_LABELS.IOS_APP) {
          payload = {
            ...payload,
            platform: PLATFORM_LABELS.IOS_APP,
            appVersionCode: Number(window.localStorage?.getItem('spc_ios_version_code') || 1),
            appVersionName: 'v1.0',
            osVersion: 'iOS'
          };
        } else {
          // Desktop Chrome/Edge browsers already log live presence via user_sessions; never overwrite mobile health rows
          if (!/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) {
            return;
          }
          payload.locationMode = 'browser';
        }

        const sig = JSON.stringify([
          payload.platform,
          payload.appVersionCode ?? null,
          payload.locationMode ?? null,
          payload.hasForegroundLocation ?? null,
          payload.hasBackgroundLocation ?? null,
          payload.batteryUnrestricted ?? null,
          payload.gpsProviderEnabled ?? null,
          payload.running ?? null
        ]);
        const now = Date.now();
        if (!force && sig === lastHealthReportRef.current.sig && now - lastHealthReportRef.current.at < 45000) {
          return;
        }
        const res = await reportEmployeeDeviceHealth(payload);
        if (!disposed && res?.success && !res?.skippedOverwrite) {
          lastHealthReportRef.current = { at: now, sig };
        }
      } catch {
        // Non-blocking audit
      } finally {
        inFlight = false;
      }
    };

    void reportUniversalHealth(true);
    const interval = setInterval(() => { void reportUniversalHealth(false); }, 300000);
    const onWake = () => {
      if (document.visibilityState === 'hidden') return;
      void reportUniversalHealth(false);
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    return () => {
      disposed = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [userId, company, branchCode]);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    if (!isMobileTrackerClient()) return;
    // Policy rule: Only "Live Tracking (Field Force)" runs continuous background telemetry
    // and enforces "Allow all the time". "Only Attendance" and "Punch GPS Only" stay completely idle.
    if (!isFieldForce) return;

    let disposed = false;
    let watchId = null;
    let heartbeatTimer = null;
    let healthTimer = null;
    let healthReportInFlight = false;
    let permissionStatus = null;
    let nativeServiceActive = false;
    let nativeStartInFlight = false;
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

    // Immediate check on mobile app mount for Field Force users:
    // Forcibly require "Allow all the time" + Battery Unrestricted before opening the app
    const applyMandatoryDiag = (diag) => {
      if (!diag) return;
      const hasAllTime = diag.locationMode === 'all_the_time' || diag.hasBackgroundLocation === true;
      const needsLocation = !hasAllTime;
      const needsBattery = diag.batteryUnrestricted === false;
      setMandatoryGaps({ needsLocation, needsBattery });
      if (needsLocation || needsBattery) {
        setShowMandatoryPermissionModal(true);
      } else {
        setShowMandatoryPermissionModal(false);
        setGpsAlert(null);
      }
    };

    const checkImmediateFieldPermission = async () => {
      const plugin = getNativeTrackerPlugin();
      const statusFn = plugin?.getStatus || plugin?.getDiagnostics;
      if (!plugin || typeof statusFn !== 'function') return;
      try {
        const diag = await statusFn.call(plugin);
        applyMandatoryDiag(diag);
      } catch {}
    };
    checkImmediateFieldPermission();

    const startOrRefreshNativeService = async (forceRefresh = false) => {
      const plugin = getNativeTrackerPlugin();
      if (!plugin || disposed || nativeStartInFlight) return nativeServiceActive;
      // Do NOT start background GPS service outside official duty (when employee is not punched in)
      if (!isPunchedInRef.current) {
        if (nativeServiceActive && typeof plugin.stopTracking === 'function') {
          try { await plugin.stopTracking(); } catch {}
          nativeServiceActive = false;
        }
        return false;
      }
      const now = Date.now();
      if (!forceRefresh && nativeServiceActive && now - lastNativeTokenAt < 6 * 3600 * 1000) {
        try {
          await plugin.flushNow();
        } catch {}
        return true;
      }

      nativeStartInFlight = true;
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
          // Only dismiss modal if BOTH background location is all_the_time AND battery is unrestricted
          try {
            const pluginStatusFn = plugin?.getStatus || plugin?.getDiagnostics;
            const diag = typeof pluginStatusFn === 'function' ? await pluginStatusFn.call(plugin) : null;
            if (diag) {
              applyMandatoryDiag(diag);
            }
          } catch {}
          return true;
        }
        if (startRes?.permissionDenied) {
          setGpsAlert('At official work start time, app permission "Allow all the time" is mandatory.');
          if (isPunchedInRef.current) {
            setShowMandatoryPermissionModal(true);
          }
        }
      } catch {
        // Fallback smoothly to web tracker if native bridge unavailable
      } finally { nativeStartInFlight = false; }
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

      const now = Date.now();
      if (accuracy != null && accuracy <= 25) {
        lastCrispGpsRef.current = { time: now, acc: accuracy };
      } else if (accuracy != null) {
        const recentCrisp = now - (lastCrispGpsRef.current.time || 0) <= 180000;
        if (accuracy > 150 || (recentCrisp && accuracy > 35)) {
          return;
        }
      }

      // Location tracking is strictly permitted only while employee is punched in on official duty
      if (!isPunchedInRef.current) return;

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
      if (disposed || nativeServiceActive || !navigator.geolocation || !isPunchedInRef.current) return;
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

    const reportMobileHealthAudit = async (force = false) => {
      if (disposed || healthReportInFlight || typeof window === 'undefined' || navigator.onLine === false) return;
      healthReportInFlight = true;
      try {
        const plat = detectClientPlatform();
        const ua = navigator.userAgent || '';
        const isDesktopPlatform =
          plat?.platform === PLATFORM_LABELS.WINDOWS_APP ||
          plat?.platform === PLATFORM_LABELS.MACOS_APP;
        const isNativeAndroid = plat?.platform === PLATFORM_LABELS.ANDROID_APP;
        const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
        const plugin = getNativeTrackerPlugin();

        if (!plugin && (isDesktopPlatform || (!isNativeAndroid && !isMobileUa))) {
          return;
        }

        let payload = {
          userId,
          company,
          branchCode,
          platform: plat?.platform || (plugin ? PLATFORM_LABELS.ANDROID_APP : PLATFORM_LABELS.WEB_APP),
          platform_details: plat?.details || ua
        };

        if (plugin && typeof plugin.getStatus === 'function') {
          try {
            let statusTimer;
            let st;
            try {
              st = await Promise.race([
                plugin.getStatus(),
                new Promise((_, reject) => { statusTimer = setTimeout(() => reject(new Error('Native status timeout')), 5000); })
              ]);
            } finally { clearTimeout(statusTimer); }
            payload = {
              ...payload,
              platform: PLATFORM_LABELS.ANDROID_APP,
              running: Boolean(st?.running),
              pendingCount: Number(st?.pendingCount || 0),
              hasForegroundLocation: st?.hasForegroundLocation,
              hasBackgroundLocation: st?.hasBackgroundLocation,
              locationMode: st?.locationMode,
              appVersionCode: st?.appVersionCode,
              appVersionName: st?.appVersionName,
              osVersion: st?.osVersion,
              sdkInt: st?.sdkInt,
              deviceManufacturer: st?.deviceManufacturer,
              deviceModel: st?.deviceModel,
              batteryUnrestricted: st?.batteryUnrestricted,
              notificationsEnabled: st?.notificationsEnabled,
              gpsProviderEnabled: st?.gpsProviderEnabled
            };
            if (st?.appVersionCode && typeof window !== 'undefined') {
              try { window.localStorage?.setItem('spc_android_version_code', String(st.appVersionCode)); } catch {}
            }
          } catch {
            // A failed bridge read is not a new permission or connectivity report.
            return;
          }
        } else {
          payload.locationMode = 'browser';
        }

        const sig = JSON.stringify([
          payload.platform,
          payload.appVersionCode ?? null,
          payload.locationMode ?? null,
          payload.hasForegroundLocation ?? null,
          payload.hasBackgroundLocation ?? null,
          payload.batteryUnrestricted ?? null,
          payload.gpsProviderEnabled ?? null,
          payload.running ?? null
        ]);
        const now = Date.now();
        if (!force && sig === lastHealthReportRef.current.sig && now - lastHealthReportRef.current.at < 45000) {
          return;
        }
        const res = await reportEmployeeDeviceHealth(payload);
        if (disposed || !res?.success) return;
        lastHealthReportRef.current = { at: now, sig };

        const ev = res.evaluation;
        const pol = res.policy;
        if (!ev || ev.status === 'HEALTHY' || ev.status === 'OFFLINE') {
          setDeviceHealthBanner(null);
          return;
        }

        const needsApkUpdate = ev.status === 'FORCE_UPGRADE' || ev.status === 'OUTDATED_APK' || ev.status === 'BROWSER_ONLY';
        const isPermissionRestricted = Boolean(
          plugin &&
          (ev.locationMode === 'while_using' || ev.locationMode === 'denied')
        );
        const showAppSettings = isPermissionRestricted;
        const showBatteryFix = Boolean(plugin && payload.batteryUnrestricted === false);
        const showGpsFix = Boolean(plugin && payload.gpsProviderEnabled === false);

        // For Live Tracking (Field Force) users, forcibly require BOTH 'Allow all the time' and Battery Unrestricted
        if (plugin && (isPermissionRestricted || showBatteryFix)) {
          setMandatoryGaps({
            needsLocation: isPermissionRestricted,
            needsBattery: showBatteryFix
          });
          setShowMandatoryPermissionModal(true);
        } else if (ev.locationMode === 'all_the_time' && !showBatteryFix) {
          setMandatoryGaps({ needsLocation: false, needsBattery: false });
          setShowMandatoryPermissionModal(false);
          setGpsAlert(null);
        }

        setDeviceHealthBanner({
          status: ev.status,
          isLegacyApk: Boolean(ev.isNativeAndroid && ev.versionCode == null),
          hasNativePlugin: Boolean(plugin),
          message:
            ev.status === 'BROWSER_ONLY'
              ? 'Browser me screen lock hone par GPS band hota hai — SPC Workspace Android APK install karein.'
              : ev.status === 'FORCE_UPGRADE'
                ? `Purani Android APK detect hui hai — v${pol?.latest_version_code || 4} update install karein.`
                : isPermissionRestricted
                  ? 'At official work start time, app permission "Allow all the time" is mandatory.'
                  : ev.issueSummary || 'Background GPS ya Battery permission fix karein.',
          downloadUrl: pol?.download_url || '/api/public/android-apk',
          latestCode: pol?.latest_version_code || 4,
          showApkDownload: needsApkUpdate,
          showAppSettings,
          showBatteryFix,
          showGpsFix
        });
      } catch {
        // Non-blocking health telemetry diagnostic
      } finally { healthReportInFlight = false; }
    };

    const refreshDutyAndTracking = async (forceStart = false) => {
      if (disposed) return;
      try {
        const attRes = await getTodayUserAttendanceStatus(userId);
        if (disposed) return;
        isPunchedInRef.current = Boolean(attRes?.isPunchedIn);
      } catch (e) {
        console.warn('[GlobalMobileTelemetryTracker] Attendance status check fallback:', e?.message || e);
      }

      // If employee is OFF DUTY (not punched in, or punched out for the day):
      if (!isPunchedInRef.current) {
        const plugin = getNativeTrackerPlugin();
        if (plugin && typeof plugin.stopTracking === 'function') {
          try { await plugin.stopTracking(); } catch {}
        }
        if (watchId !== null) {
          try { navigator.geolocation?.clearWatch(watchId); } catch {}
          watchId = null;
        }
        nativeServiceActive = false;
        setGpsAlert(null);
        return;
      }

      // Employee IS ON DUTY (Punched in):
      const started = await startOrRefreshNativeService(forceStart);
      await reportMobileHealthAudit(true);
      if (!started && !disposed && isPunchedInRef.current && watchId === null) {
        try {
          watchId = navigator.geolocation?.watchPosition(
            (pos) => handlePosition(pos, false),
            handleGeoError,
            { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 }
          );
        } catch {}
        captureImmediatePing(true);
      }
    };

    // Initial verification of attendance duty & tracking activation
    void refreshDutyAndTracking(true);
    syncQueuedPings();

    // 25s interval > 22s stationary threshold (used on mobile browsers / older APKs without native plugin)
    heartbeatTimer = setInterval(() => {
      if (!nativeServiceActive && isPunchedInRef.current) captureImmediatePing(false);
    }, 25000);
    // Periodically verify device health and duty status
    healthTimer = setInterval(() => { void refreshDutyAndTracking(false); }, 30000);
    const handlePermissionChange = () => { void reportMobileHealthAudit(true); };
    try {
      navigator.permissions?.query({ name: 'geolocation' }).then(permission => {
        if (disposed) return;
        permissionStatus = permission;
        permissionStatus.addEventListener('change', handlePermissionChange);
      }).catch(() => {});
    } catch { /* Older WebViews still report on resume and the independent timer. */ }

    // Listen to real-time punch-in and punch-out events in AttendanceModule & WorkspaceHome Quick Punch
    const handleAttendanceChange = () => {
      void refreshDutyAndTracking(true);
    };
    window.addEventListener('crm_attendance_changed', handleAttendanceChange);
    window.addEventListener('attendance_updated', handleAttendanceChange);

    const handleResume = () => {
      if (document.visibilityState === 'hidden') return;
      void checkImmediateFieldPermission();
      void refreshDutyAndTracking(false);
      syncQueuedPings();
    };

    const handleOnline = () => {
      lastForceAtRef.current = 0;
      void refreshDutyAndTracking(true);
      syncQueuedPings();
    };

    // Initialize automatic Shift Punch In & Punch Out push notification reminder scheduler
    const cancelReminderScheduler = initAttendanceReminderScheduler({ userId });

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    window.addEventListener('online', handleOnline);

    return () => {
      disposed = true;
      cancelReminderScheduler();
      if (watchId !== null) {
        try { navigator.geolocation?.clearWatch(watchId); } catch {}
      }
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (healthTimer) clearInterval(healthTimer);
      permissionStatus?.removeEventListener('change', handlePermissionChange);
      window.removeEventListener('crm_attendance_changed', handleAttendanceChange);
      window.removeEventListener('attendance_updated', handleAttendanceChange);
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('online', handleOnline);
    };
  }, [userId, company, branchCode, isFieldForce]);

  const handleSelfHealClick = async (kind) => {
    try {
      const plugin = typeof window !== 'undefined' ? window.Capacitor?.Plugins?.FieldTracker : null;
      if (!plugin) return;
      if (kind === 'app' && typeof plugin.openAppSettings === 'function') {
        await plugin.openAppSettings();
      } else if (kind === 'battery' && typeof plugin.requestBatteryExemption === 'function') {
        await plugin.requestBatteryExemption();
      } else if (kind === 'gps' && typeof plugin.openLocationSettings === 'function') {
        await plugin.openLocationSettings();
      }
    } catch {
      // Safe fallback
    }
  };

  const handleManualCheckUnlock = async () => {
    let needsLocation = mandatoryGaps.needsLocation;
    let needsBattery = mandatoryGaps.needsBattery;
    try {
      const plugin = typeof window !== 'undefined' ? window.Capacitor?.Plugins?.FieldTracker : null;
      const statusFn = plugin?.getStatus || plugin?.getDiagnostics;
      if (plugin && typeof statusFn === 'function') {
        const diag = await statusFn.call(plugin);
        const hasAllTime = diag?.locationMode === 'all_the_time' || diag?.hasBackgroundLocation === true;
        needsLocation = !hasAllTime;
        needsBattery = diag?.batteryUnrestricted === false;
        setMandatoryGaps({ needsLocation, needsBattery });
        if (!needsLocation && !needsBattery) {
          setShowMandatoryPermissionModal(false);
          setGpsAlert(null);
          return;
        }
      }
    } catch {}
    if (typeof window !== 'undefined') {
      if (needsLocation && needsBattery) {
        alert('⚠️ Location ("Allow all the time") aur Battery ("Unrestricted") dono zaroori hain.\n\nKripya pehle dono permissions allow karein.');
      } else if (needsBattery) {
        alert('⚠️ Battery Optimization abhi bhi restricted hai.\n\nKripya "Allow" par tap karke SPC Workspace ke liye Battery Unrestricted set karein.');
      } else {
        alert('⚠️ Location permission abhi bhi "Allow all the time" nahi mili hai.\n\nKripya phone settings me jakar Permissions ➔ Location ➔ "Allow all the time" select karein.');
      }
    }
    handleSelfHealClick(needsLocation ? 'app' : 'battery');
  };

  const showGpsAlert = Boolean(gpsAlert && !dismissedAlert);
  const showHealthBanner = Boolean(deviceHealthBanner && !dismissedHealthBanner);
  if (!isFieldForce) return null;
  if (!showGpsAlert && !showHealthBanner && !showMandatoryPermissionModal) return null;

  return (
    <>
      {/* Mandatory English Permission Blocking Modal (When user is on official duty and lacks 'Allow all the time') */}
      {showMandatoryPermissionModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '1.75rem',
              maxWidth: '430px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
              textAlign: 'center',
              border: '1px solid #e2e8f0'
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.15rem auto'
              }}
            >
              <ShieldAlert size={34} color="#d97706" />
            </div>

            <h2 style={{ fontSize: '1.22rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
              ⚠️ Live Tracking (Field Force) Permission
            </h2>

            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                padding: '12px 14px',
                margin: '0 0 1rem 0'
              }}
            >
              <p style={{ margin: '0 0 6px 0', fontSize: '0.92rem', fontWeight: 700, color: '#dc2626', lineHeight: 1.45 }}>
                Live Tracking ke liye Location (&quot;Allow all the time&quot;) aur Battery (&quot;Unrestricted&quot;) dono anivarya hain.
              </p>
              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#991b1b', lineHeight: 1.45 }}>
                Aapke account par 🚗 Live Tracking (Field Force) active hai. Screen lock ya Battery Saver me GPS band na ho iske liye dono settings allow karein.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1rem', textAlign: 'left' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: mandatoryGaps.needsLocation ? '#fff7ed' : '#f0fdf4',
                  border: `1px solid ${mandatoryGaps.needsLocation ? '#fed7aa' : '#bbf7d0'}`
                }}
              >
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                  📍 Location: &quot;Allow all the time&quot;
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: mandatoryGaps.needsLocation ? '#c2410c' : '#15803d' }}>
                  {mandatoryGaps.needsLocation ? 'Pending' : '✅ Allowed'}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: mandatoryGaps.needsBattery ? '#fff7ed' : '#f0fdf4',
                  border: `1px solid ${mandatoryGaps.needsBattery ? '#fed7aa' : '#bbf7d0'}`
                }}
              >
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                  🔋 Battery Saver: &quot;Unrestricted&quot;
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: mandatoryGaps.needsBattery ? '#c2410c' : '#15803d' }}>
                  {mandatoryGaps.needsBattery ? 'Pending' : '✅ Unrestricted'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {mandatoryGaps.needsLocation && (
                <button
                  type="button"
                  onClick={() => handleSelfHealClick('app')}
                  style={{
                    width: '100%',
                    padding: '12px 18px',
                    borderRadius: '10px',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.38)'
                  }}
                >
                  <Settings size={17} /> 1. Allow Location All the Time
                </button>
              )}

              {mandatoryGaps.needsBattery && (
                <button
                  type="button"
                  onClick={() => handleSelfHealClick('battery')}
                  style={{
                    width: '100%',
                    padding: '12px 18px',
                    borderRadius: '10px',
                    background: '#d97706',
                    color: '#ffffff',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(217, 119, 6, 0.35)'
                  }}
                >
                  <BatteryCharging size={17} /> {mandatoryGaps.needsLocation ? '2. ' : ''}Set Battery Unrestricted
                </button>
              )}

              <button
                type="button"
                onClick={handleManualCheckUnlock}
                style={{
                  width: '100%',
                  padding: '11px 16px',
                  borderRadius: '10px',
                  background: '#f1f5f9',
                  color: '#334155',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  border: '1px solid #cbd5e1',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={15} /> I&apos;ve Allowed — Check &amp; Unlock App
              </button>
            </div>
          </div>
        </div>
      )}

      {showHealthBanner && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: showGpsAlert ? '128px' : '76px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99989,
            maxWidth: '94vw',
            width: 'max-content',
            background: deviceHealthBanner.status === 'FORCE_UPGRADE' || deviceHealthBanner.status === 'BROWSER_ONLY' ? '#fef2f2' : '#fffbeb',
            border: `1px solid ${deviceHealthBanner.status === 'FORCE_UPGRADE' || deviceHealthBanner.status === 'BROWSER_ONLY' ? '#fca5a5' : '#fcd34d'}`,
            color: '#1e293b',
            padding: '0.55rem 0.85rem',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.76rem',
            fontWeight: 600,
            flexWrap: 'wrap'
          }}
        >
          <ShieldAlert size={16} color={deviceHealthBanner.status === 'FORCE_UPGRADE' ? '#dc2626' : '#d97706'} style={{ flexShrink: 0 }} />
          <span>{deviceHealthBanner.message}</span>

          {deviceHealthBanner.showAppSettings && (
            <button
              type="button"
              onClick={() => handleSelfHealClick('app')}
              style={{
                border: 'none',
                borderRadius: 6,
                background: '#2563eb',
                color: '#ffffff',
                padding: '4px 9px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <Settings size={12} /> Allow All the Time
            </button>
          )}

          {deviceHealthBanner.showBatteryFix && (
            <button
              type="button"
              onClick={() => handleSelfHealClick('battery')}
              style={{
                border: 'none',
                borderRadius: 6,
                background: '#d97706',
                color: '#ffffff',
                padding: '4px 9px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <BatteryCharging size={12} /> Fix Battery Saver
            </button>
          )}

          {deviceHealthBanner.showGpsFix && (
            <button
              type="button"
              onClick={() => handleSelfHealClick('gps')}
              style={{
                border: 'none',
                borderRadius: 6,
                background: '#dc2626',
                color: '#ffffff',
                padding: '4px 9px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Turn On GPS
            </button>
          )}

          {deviceHealthBanner.showApkDownload && (
            <a
              href={deviceHealthBanner.downloadUrl || '/api/public/android-apk'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                const targetUrl = deviceHealthBanner.downloadUrl || 'https://app.supujacreations.com/api/public/android-apk';
                if (window?.Capacitor?.isNativePlatform?.() && typeof document !== 'undefined') {
                  e.preventDefault();
                  const existing = document.getElementById('spc-apk-dl-frame');
                  if (existing) existing.remove();
                  const iframe = document.createElement('iframe');
                  iframe.id = 'spc-apk-dl-frame';
                  iframe.style.display = 'none';
                  iframe.src = targetUrl;
                  document.body.appendChild(iframe);
                  setTimeout(() => {
                    try { iframe.remove(); } catch {}
                  }, 15000);
                }
              }}
              style={{
                borderRadius: 6,
                background: '#0f766e',
                color: '#ffffff',
                padding: '4px 9px',
                fontSize: '0.72rem',
                fontWeight: 700,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <Download size={12} /> Update APK v{deviceHealthBanner.latestCode}
            </a>
          )}

          {deviceHealthBanner.status !== 'FORCE_UPGRADE' && (
            <button
              type="button"
              onClick={() => setDismissedHealthBanner(true)}
              aria-label="Dismiss device health notice"
              style={{
                border: 0,
                background: 'transparent',
                color: '#64748b',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {showGpsAlert && (
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
      )}
    </>
  );
}
