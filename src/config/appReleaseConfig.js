/**
 * Central Mobile App Release Policy & Device Health Classifier
 *
 * Non-hardcoded governance helper: runtime minimum/latest versions are loaded dynamically
 * from Supabase (`app_release_policies`) or JSON policy store and compared against
 * each field executive's live device telemetry & permission snapshot.
 */

export const DEFAULT_ANDROID_RELEASE_POLICY = {
  platform: 'android',
  latest_version_code: 4,
  latest_version_name: '2.5.1114',
  min_supported_version_code: 4,
  download_url: '/api/public/android-apk',
  release_notes:
    'Added Android background GPS & battery optimization diagnostics, 1-tap self-heal settings shortcuts, and foreground GPS accuracy improvements.'
};

export const DEVICE_HEALTH_STATUS = {
  HEALTHY: 'HEALTHY',
  NEEDS_PERMISSION_FIX: 'NEEDS_PERMISSION_FIX',
  OUTDATED_APK: 'OUTDATED_APK',
  FORCE_UPGRADE: 'FORCE_UPGRADE',
  BROWSER_ONLY: 'BROWSER_ONLY',
  OFFLINE: 'OFFLINE'
};

export const HEALTH_STATUS_META = {
  HEALTHY: {
    label: 'Tracking Ready',
    shortLabel: 'Ready',
    color: '#15803d',
    bg: '#dcfce7',
    border: '#86efac'
  },
  NEEDS_PERMISSION_FIX: {
    label: 'Permission / Battery Fix Needed',
    shortLabel: 'Fix Permissions',
    color: '#b45309',
    bg: '#fef3c7',
    border: '#fcd34d'
  },
  OUTDATED_APK: {
    label: 'Update Available',
    shortLabel: 'Update APK',
    color: '#1d4ed8',
    bg: '#dbeafe',
    border: '#93c5fd'
  },
  FORCE_UPGRADE: {
    label: 'Old APK (Upgrade Required)',
    shortLabel: 'Old APK',
    color: '#b91c1c',
    bg: '#fee2e2',
    border: '#fca5a5'
  },
  BROWSER_ONLY: {
    label: 'Mobile Web Only (No APK)',
    shortLabel: 'Browser Only',
    color: '#7c2d12',
    bg: '#ffedd5',
    border: '#fdba74'
  },
  OFFLINE: {
    label: 'No Mobile Ping Today',
    shortLabel: 'Offline / Idle',
    color: '#475569',
    bg: '#f1f5f9',
    border: '#cbd5e1'
  }
};

export function sanitizeReleasePolicy(raw = {}) {
  const latestCode = Math.max(1, parseInt(raw?.latest_version_code ?? DEFAULT_ANDROID_RELEASE_POLICY.latest_version_code, 10) || 4);
  const minCode = Math.max(
    1,
    Math.min(latestCode, parseInt(raw?.min_supported_version_code ?? DEFAULT_ANDROID_RELEASE_POLICY.min_supported_version_code, 10) || 4)
  );
  return {
    platform: 'android',
    latest_version_code: latestCode,
    latest_version_name: String(raw?.latest_version_name || DEFAULT_ANDROID_RELEASE_POLICY.latest_version_name).trim(),
    min_supported_version_code: minCode,
    download_url: String(raw?.download_url || DEFAULT_ANDROID_RELEASE_POLICY.download_url).trim() || '/api/public/android-apk',
    release_notes: String(raw?.release_notes || DEFAULT_ANDROID_RELEASE_POLICY.release_notes).trim(),
    updated_by: raw?.updated_by || null,
    updated_at: raw?.updated_at || null
  };
}

export function normalizeLocationMode(snapshot = {}) {
  const explicit = String(snapshot?.location_mode || snapshot?.locationMode || '').toLowerCase().trim();
  if (['all_the_time', 'while_using', 'denied', 'browser'].includes(explicit)) {
    return explicit;
  }
  const hasBg = snapshot?.has_background_location ?? snapshot?.hasBackgroundLocation;
  const hasFg = snapshot?.has_foreground_location ?? snapshot?.hasForegroundLocation;
  if (hasBg === true) return 'all_the_time';
  if (hasFg === true) return 'while_using';
  if (hasFg === false) return 'denied';
  return 'unknown';
}

/**
 * Evaluates an employee's device telemetry record against the active release policy.
 * Handles:
 *  - Mobile Web Browser logins without APK (BROWSER_ONLY)
 *  - Legacy APKs v1/v2/v3 that predate appVersionCode reporting (FORCE_UPGRADE)
 *  - Newer APKs with missing Always-Allow GPS, Restricted Battery, or GPS OFF (NEEDS_PERMISSION_FIX)
 */
export function classifyDeviceHealth(record = null, policyInput = DEFAULT_ANDROID_RELEASE_POLICY) {
  const policy = sanitizeReleasePolicy(policyInput);
  if (!record) {
    return {
      status: DEVICE_HEALTH_STATUS.OFFLINE,
      issues: ['No mobile app or mobile browser telemetry recorded yet'],
      issueSummary: 'No mobile telemetry recorded yet',
      isNativeAndroid: false,
      needsApkInstall: false,
      needsApkUpgrade: false,
      needsPermissionFix: false,
      locationMode: 'unknown'
    };
  }

  const platformStr = String(record.platform || '').toLowerCase();
  const detailsStr = String(record.platform_details || record.platformDetails || '').toLowerCase();
  const isNativeAndroid =
    platformStr.includes('android') ||
    detailsStr.includes('spc workspace apk') ||
    detailsStr.includes('capacitor') ||
    record.app_version_code != null ||
    record.appVersionCode != null;

  const isDesktop =
    platformStr.includes('windows') ||
    platformStr.includes('macos') ||
    detailsStr.includes('electron') ||
    detailsStr.includes('desktop') ||
    (/\b(windows|macintosh|macos|linux)\b/i.test(detailsStr) && !/\b(android|iphone|ipad|ipod|mobile)\b/i.test(detailsStr));

  const isMobileWeb =
    !isNativeAndroid &&
    !isDesktop &&
    (detailsStr.includes('mobile') ||
      detailsStr.includes('android') ||
      detailsStr.includes('iphone') ||
      detailsStr.includes('ipad') ||
      detailsStr.includes('ipod') ||
      detailsStr.includes('pwa') ||
      record.location_mode === 'browser' ||
      record.locationMode === 'browser');

  if (!isNativeAndroid) {
    if (isMobileWeb) {
      return {
        status: DEVICE_HEALTH_STATUS.BROWSER_ONLY,
        issues: ['Using Mobile Browser instead of Android APK (screen lock stops background GPS)'],
        issueSummary: 'Mobile browser session detected — install Android APK for background tracking',
        isNativeAndroid: false,
        needsApkInstall: true,
        needsApkUpgrade: false,
        needsPermissionFix: false,
        locationMode: 'browser'
      };
    }
    return {
      status: DEVICE_HEALTH_STATUS.OFFLINE,
      issues: ['No active mobile device detected (desktop session only)'],
      issueSummary: 'No mobile device session detected',
      isNativeAndroid: false,
      needsApkInstall: false,
      needsApkUpgrade: false,
      needsPermissionFix: false,
      locationMode: 'unknown'
    };
  }

  const rawCode = record.app_version_code ?? record.appVersionCode;
  const versionCode = rawCode != null && Number.isFinite(Number(rawCode)) ? Number(rawCode) : null;
  const locationMode = normalizeLocationMode(record);
  const batteryUnrestricted = record.battery_unrestricted ?? record.batteryUnrestricted;
  const notificationsEnabled = record.notifications_enabled ?? record.notificationsEnabled;
  const gpsProviderEnabled = record.gps_provider_enabled ?? record.gpsProviderEnabled;

  const issues = [];
  if (versionCode == null) {
    issues.push(`Old APK (<= v3 legacy build) — update to v${policy.latest_version_code}`);
  } else if (versionCode < policy.min_supported_version_code) {
    issues.push(`Unsupported APK v${versionCode} — minimum v${policy.min_supported_version_code} required`);
  } else if (versionCode < policy.latest_version_code) {
    issues.push(`APK v${versionCode} behind latest v${policy.latest_version_code}`);
  }

  let hasPermissionBlocker = false;
  if (locationMode === 'denied') {
    issues.push('Location permission DENIED');
    hasPermissionBlocker = true;
  } else if (locationMode === 'while_using') {
    issues.push('Location set to "While using app" — needs "Allow all the time"');
    hasPermissionBlocker = true;
  }

  if (gpsProviderEnabled === false) {
    issues.push('Device GPS / Location toggle is OFF');
    hasPermissionBlocker = true;
  }
  if (batteryUnrestricted === false) {
    issues.push('Battery optimization enabled (OS may kill background GPS)');
    hasPermissionBlocker = true;
  }
  if (notificationsEnabled === false) {
    issues.push('App notifications disabled');
  }

  const needsForceUpgrade = versionCode == null || versionCode < policy.min_supported_version_code;
  const needsOptionalUpgrade = !needsForceUpgrade && versionCode < policy.latest_version_code;

  let status = DEVICE_HEALTH_STATUS.HEALTHY;
  if (needsForceUpgrade) {
    status = DEVICE_HEALTH_STATUS.FORCE_UPGRADE;
  } else if (hasPermissionBlocker) {
    status = DEVICE_HEALTH_STATUS.NEEDS_PERMISSION_FIX;
  } else if (needsOptionalUpgrade) {
    status = DEVICE_HEALTH_STATUS.OUTDATED_APK;
  }

  return {
    status,
    issues,
    issueSummary: issues.length > 0 ? issues.join(' • ') : 'All permissions, battery, and APK version healthy',
    isNativeAndroid: true,
    needsApkInstall: false,
    needsApkUpgrade: needsForceUpgrade || needsOptionalUpgrade,
    needsPermissionFix: hasPermissionBlocker,
    locationMode,
    versionCode
  };
}
