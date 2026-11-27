/**
 * Central Mobile App Release Policy & Device Health Classifier
 *
 * Non-hardcoded governance helper: runtime minimum/latest versions are loaded dynamically
 * from Supabase (`app_release_policies`) or JSON policy store and compared against
 * each field executive's live device telemetry & permission snapshot.
 */

export const DEFAULT_ANDROID_RELEASE_POLICY = {
  platform: 'android',
  latest_version_code: 12,
  latest_version_name: 'v12.0 (2.5.1424)',
  min_supported_version_code: 10,
  download_url: 'https://app.supujacreations.com/apps/spcworkspacev12.apk',
  release_notes:
    'Firebase Cloud Messaging (FCM) instant push notifications even when app is closed, plus Dynamic On-Demand Module Permission System.'
};

export const DEFAULT_WINDOWS_RELEASE_POLICY = {
  platform: 'windows',
  latest_version_code: 3,
  latest_version_name: 'v3.0 (2.5.1339)',
  min_supported_version_code: 3,
  download_url: 'https://app.supujacreations.com/api/public/desktop-installer',
  release_notes:
    'Official SPC Workspace Desktop v3.0 with native Action Center toast notifications, persistent background sync, and dynamic Next.js runtime.'
};

export const DEFAULT_IOS_RELEASE_POLICY = {
  platform: 'ios',
  latest_version_code: 1,
  latest_version_name: 'v1.0 (2.5.1333)',
  min_supported_version_code: 1,
  download_url: 'https://apps.apple.com/app/spc-workspace',
  release_notes:
    'Official iOS mobile application with live GPS telemetry, smart checklist, and multi-tenant push notifications.'
};

export const PLATFORM_RELEASE_DEFAULTS = {
  android: DEFAULT_ANDROID_RELEASE_POLICY,
  windows: DEFAULT_WINDOWS_RELEASE_POLICY,
  ios: DEFAULT_IOS_RELEASE_POLICY
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

export function sanitizeReleasePolicy(raw = {}, defaultPlatform = 'android') {
  const platform = String(raw?.platform || defaultPlatform || 'android').trim().toLowerCase();
  const fallback = PLATFORM_RELEASE_DEFAULTS[platform] || DEFAULT_ANDROID_RELEASE_POLICY;

  const latestCode = Math.max(1, parseInt(raw?.latest_version_code ?? fallback.latest_version_code, 10) || 1);
  const minCode = Math.max(
    1,
    Math.min(latestCode, parseInt(raw?.min_supported_version_code ?? fallback.min_supported_version_code, 10) || 1)
  );
  return {
    platform,
    latest_version_code: latestCode,
    latest_version_name: String(raw?.latest_version_name || fallback.latest_version_name).trim(),
    min_supported_version_code: minCode,
    download_url: String(raw?.download_url || fallback.download_url).trim() || fallback.download_url,
    release_notes: String(raw?.release_notes || fallback.release_notes).trim(),
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
 * Evaluates an employee's device telemetry record against active multi-platform release policies.
 * Supports Android APK, Windows Desktop (.exe), iOS App, Mobile Web, and Desktop Web sessions.
 */
export function classifyDeviceHealth(record = null, policyInput = DEFAULT_ANDROID_RELEASE_POLICY, allPoliciesInput = null) {
  const androidPolicy = sanitizeReleasePolicy(policyInput?.android || policyInput, 'android');
  const windowsPolicy = sanitizeReleasePolicy(allPoliciesInput?.windows || policyInput?.windows || DEFAULT_WINDOWS_RELEASE_POLICY, 'windows');
  const iosPolicy = sanitizeReleasePolicy(allPoliciesInput?.ios || policyInput?.ios || DEFAULT_IOS_RELEASE_POLICY, 'ios');

  if (!record) {
    return {
      status: DEVICE_HEALTH_STATUS.OFFLINE,
      issues: ['No app or browser session telemetry recorded yet'],
      issueSummary: 'No device telemetry recorded yet',
      isNativeAndroid: false,
      needsApkInstall: false,
      needsApkUpgrade: false,
      needsPermissionFix: false,
      locationMode: 'unknown'
    };
  }

  const platformStr = String(record.platform || '').toLowerCase();
  const detailsStr = String(record.platform_details || record.platformDetails || '').toLowerCase();
  const rawCode = record.app_version_code ?? record.appVersionCode;
  const versionCode = rawCode != null && Number.isFinite(Number(rawCode)) ? Number(rawCode) : null;

  const isWindowsApp =
    platformStr === 'windows app' ||
    platformStr.includes('windows') ||
    platformStr === 'macos app' ||
    detailsStr.includes('spc workspace desktop') ||
    detailsStr.includes('electron');

  const isIosApp =
    platformStr === 'ios app' ||
    detailsStr.includes('spc workspace app (ios)') ||
    (detailsStr.includes('capacitor') && detailsStr.includes('ios'));

  const isNativeAndroid =
    !isWindowsApp &&
    !isIosApp &&
    (platformStr.includes('android') ||
      detailsStr.includes('spc workspace apk') ||
      detailsStr.includes('capacitor') ||
      versionCode != null);

  const isMobileWeb =
    !isNativeAndroid &&
    !isWindowsApp &&
    !isIosApp &&
    (detailsStr.includes('mobile') ||
      detailsStr.includes('android') ||
      detailsStr.includes('iphone') ||
      detailsStr.includes('ipad') ||
      detailsStr.includes('ipod') ||
      detailsStr.includes('pwa') ||
      record.location_mode === 'browser' ||
      record.locationMode === 'browser');

  const isDesktopWeb =
    !isNativeAndroid &&
    !isWindowsApp &&
    !isIosApp &&
    !isMobileWeb &&
    (platformStr.includes('web') ||
      detailsStr.includes('chrome') ||
      detailsStr.includes('edge') ||
      detailsStr.includes('firefox') ||
      detailsStr.includes('safari') ||
      detailsStr.includes('windows') ||
      detailsStr.includes('macos'));

  if (isWindowsApp) {
    const issues = [];
    const needsForce = versionCode == null || versionCode < windowsPolicy.min_supported_version_code;
    const needsOptional = !needsForce && versionCode < windowsPolicy.latest_version_code;
    if (versionCode == null) {
      issues.push(`Legacy Desktop build — update to v${windowsPolicy.latest_version_code}`);
    } else if (needsForce) {
      issues.push(`Unsupported Desktop v${versionCode} — minimum v${windowsPolicy.min_supported_version_code} required`);
    } else if (needsOptional) {
      issues.push(`Desktop v${versionCode} behind latest v${windowsPolicy.latest_version_code}`);
    }
    return {
      status: needsForce
        ? DEVICE_HEALTH_STATUS.FORCE_UPGRADE
        : needsOptional
          ? DEVICE_HEALTH_STATUS.OUTDATED_APK
          : DEVICE_HEALTH_STATUS.HEALTHY,
      issues,
      issueSummary: issues.length > 0 ? issues.join(' • ') : `Windows Desktop v${versionCode} up-to-date`,
      isNativeAndroid: false,
      needsApkInstall: false,
      needsApkUpgrade: needsForce || needsOptional,
      needsPermissionFix: false,
      locationMode: 'unknown',
      versionCode
    };
  }

  if (isIosApp) {
    const issues = [];
    const needsForce = versionCode == null || versionCode < iosPolicy.min_supported_version_code;
    const needsOptional = !needsForce && versionCode < iosPolicy.latest_version_code;
    if (needsForce) {
      issues.push(`Unsupported iOS v${versionCode ?? '?'} — minimum v${iosPolicy.min_supported_version_code} required`);
    } else if (needsOptional) {
      issues.push(`iOS v${versionCode} behind latest v${iosPolicy.latest_version_code}`);
    }
    return {
      status: needsForce
        ? DEVICE_HEALTH_STATUS.FORCE_UPGRADE
        : needsOptional
          ? DEVICE_HEALTH_STATUS.OUTDATED_APK
          : DEVICE_HEALTH_STATUS.HEALTHY,
      issues,
      issueSummary: issues.length > 0 ? issues.join(' • ') : `iOS App v${versionCode} up-to-date`,
      isNativeAndroid: false,
      needsApkInstall: false,
      needsApkUpgrade: needsForce || needsOptional,
      needsPermissionFix: false,
      locationMode: normalizeLocationMode(record),
      versionCode
    };
  }

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
    if (isDesktopWeb) {
      return {
        status: DEVICE_HEALTH_STATUS.OFFLINE,
        issues: ['Active on Desktop Web Browser (no native Mobile/Desktop App telemetry)'],
        issueSummary: `Desktop Web Browser (${record.platform_details || record.platformDetails || 'Browser'})`,
        isNativeAndroid: false,
        needsApkInstall: false,
        needsApkUpgrade: false,
        needsPermissionFix: false,
        locationMode: 'unknown'
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

  const locationMode = normalizeLocationMode(record);
  const batteryUnrestricted = record.battery_unrestricted ?? record.batteryUnrestricted;
  const notificationsEnabled = record.notifications_enabled ?? record.notificationsEnabled;
  const gpsProviderEnabled = record.gps_provider_enabled ?? record.gpsProviderEnabled;

  const issues = [];
  if (versionCode == null) {
    issues.push(`Old APK (<= v3 legacy build) — update to v${androidPolicy.latest_version_code}`);
  } else if (versionCode < androidPolicy.min_supported_version_code) {
    issues.push(`Unsupported APK v${versionCode} — minimum v${androidPolicy.min_supported_version_code} required`);
  } else if (versionCode < androidPolicy.latest_version_code) {
    issues.push(`APK v${versionCode} behind latest v${androidPolicy.latest_version_code}`);
  }

  let hasPermissionBlocker = false;
  if (locationMode === 'denied') {
    issues.push('Location permission DENIED');
    hasPermissionBlocker = true;
  } else if (locationMode === 'while_using') {
    issues.push('At official work start time, app permission "Allow all the time" is mandatory');
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

  const needsForceUpgrade = versionCode == null || versionCode < androidPolicy.min_supported_version_code;
  const needsOptionalUpgrade = !needsForceUpgrade && versionCode < androidPolicy.latest_version_code;

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
