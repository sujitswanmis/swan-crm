'use client';

/**
 * Universal Device Permissions Bridge (Capacitor Android Native + Web Fallback)
 *
 * Allows any existing or future CRM web module to check and request Android OS
 * permissions dynamically via modal prompt without releasing a new APK.
 */

export function getNativeFieldTrackerPlugin() {
  if (typeof window === 'undefined') return null;
  try {
    const cap = window.Capacitor;
    const isNative = typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : Boolean(cap?.isNative);
    if (!isNative) return null;
    return cap?.Plugins?.FieldTracker || null;
  } catch {
    return null;
  }
}

export function isAndroidMobileClient() {
  if (typeof window === 'undefined') return false;
  try {
    if (getNativeFieldTrackerPlugin()) return true;
    const ua = navigator.userAgent || '';
    return /Android/i.test(ua);
  } catch {
    return false;
  }
}

export async function getNativeCapabilities() {
  const plugin = getNativeFieldTrackerPlugin();
  if (!plugin) {
    return { isNative: false, supportsDynamicPermissions: false, versionCode: 0 };
  }
  try {
    if (typeof plugin.getCapabilities === 'function') {
      const caps = await plugin.getCapabilities();
      return { isNative: true, ...caps };
    }
    if (typeof plugin.getStatus === 'function') {
      const st = await plugin.getStatus();
      return {
        isNative: true,
        supportsDynamicPermissions: false,
        versionCode: Number(st?.appVersionCode || 10)
      };
    }
  } catch {
    // Non-blocking capability check
  }
  return { isNative: true, supportsDynamicPermissions: false, versionCode: 10 };
}

async function checkBrowserPermissionFallback(keys = []) {
  const statuses = {};
  let allGranted = true;

  for (const key of keys) {
    let state = 'prompt';
    let granted = false;

    try {
      if (key === 'notifications') {
        if (typeof Notification !== 'undefined') {
          if (Notification.permission === 'granted') {
            granted = true;
            state = 'granted';
          } else if (Notification.permission === 'denied') {
            state = 'permanently_denied';
          }
        } else {
          granted = true;
          state = 'unavailable';
        }
      } else if ((key === 'camera' || key === 'microphone' || key === 'location') && navigator.permissions?.query) {
        const queryName = key === 'location' ? 'geolocation' : key;
        const perm = await navigator.permissions.query({ name: queryName }).catch(() => null);
        if (perm?.state === 'granted') {
          granted = true;
          state = 'granted';
        } else if (perm?.state === 'denied') {
          state = 'permanently_denied';
        }
      } else if (key === 'background_location' || key === 'battery_unrestricted' || key === 'phone_call' || key === 'bluetooth') {
        // Browser has no OS background service / native dialer / bluetooth permission toggle here
        granted = true;
        state = 'unavailable';
      }
    } catch {
      // Leave as prompt
    }

    if (!granted) allGranted = false;
    statuses[key] = {
      granted,
      state,
      canRequestDirectly: state === 'prompt'
    };
  }

  return { allGranted, statuses, source: 'web' };
}

export async function checkModulePermissions(permissionKeys = []) {
  const keys = Array.isArray(permissionKeys) ? permissionKeys.filter(Boolean) : [];
  if (keys.length === 0) {
    return { allGranted: true, statuses: {}, missingKeys: [], requiresAppSettings: false };
  }

  const plugin = getNativeFieldTrackerPlugin();
  if (plugin && typeof plugin.checkModulePermissions === 'function') {
    try {
      const res = await plugin.checkModulePermissions({ permissions: keys });
      const statuses = res?.statuses || {};
      const missingKeys = keys.filter((k) => statuses[k]?.granted !== true);
      const requiresAppSettings = missingKeys.some((k) => statuses[k]?.state === 'permanently_denied');
      return {
        allGranted: Boolean(res?.allGranted ?? missingKeys.length === 0),
        statuses,
        missingKeys,
        requiresAppSettings,
        source: 'native_v11'
      };
    } catch {
      // Fall back to v10 status check below
    }
  }

  if (plugin && typeof plugin.getStatus === 'function') {
    try {
      const st = await plugin.getStatus();
      const statuses = {};
      for (const k of keys) {
        if (k === 'location') {
          const g = st?.hasForegroundLocation === true;
          statuses[k] = { granted: g, state: g ? 'granted' : 'prompt', canRequestDirectly: !g };
        } else if (k === 'background_location') {
          const g = st?.hasBackgroundLocation === true;
          statuses[k] = { granted: g, state: g ? 'granted' : 'permanently_denied', canRequestDirectly: false };
        } else if (k === 'notifications') {
          const g = st?.notificationsEnabled === true;
          statuses[k] = { granted: g, state: g ? 'granted' : 'permanently_denied', canRequestDirectly: false };
        } else if (k === 'battery_unrestricted') {
          const g = st?.batteryUnrestricted === true;
          statuses[k] = { granted: g, state: g ? 'granted' : 'prompt', canRequestDirectly: !g };
        } else {
          // v10 cannot directly inspect camera/mic/media via FieldTracker.getStatus -> try browser query
          const webCheck = await checkBrowserPermissionFallback([k]);
          statuses[k] = webCheck.statuses[k];
        }
      }
      const missingKeys = keys.filter((k) => statuses[k]?.granted !== true);
      const requiresAppSettings = missingKeys.some((k) => statuses[k]?.state === 'permanently_denied');
      return {
        allGranted: missingKeys.length === 0,
        statuses,
        missingKeys,
        requiresAppSettings,
        source: 'native_v10'
      };
    } catch {
      // Fallback to web
    }
  }

  const webRes = await checkBrowserPermissionFallback(keys);
  const missingKeys = keys.filter((k) => webRes.statuses[k]?.granted !== true);
  const requiresAppSettings = missingKeys.some((k) => webRes.statuses[k]?.state === 'permanently_denied');
  return {
    ...webRes,
    missingKeys,
    requiresAppSettings
  };
}

async function requestSingleWebPermission(key) {
  try {
    if (key === 'notifications' && typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function') {
      const res = await Notification.requestPermission();
      return res === 'granted';
    }
    if (key === 'camera' && navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    }
    if (key === 'microphone' && navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    }
    if (key === 'location' && navigator.geolocation) {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 5000 });
      });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function requestModulePermissions(permissionKeys = []) {
  const keys = Array.isArray(permissionKeys) ? permissionKeys.filter(Boolean) : [];
  if (keys.length === 0) {
    return { allGranted: true, statuses: {}, missingKeys: [], requiresAppSettings: false };
  }

  const plugin = getNativeFieldTrackerPlugin();
  if (plugin && typeof plugin.requestModulePermissions === 'function') {
    try {
      const res = await plugin.requestModulePermissions({ permissions: keys });
      const statuses = res?.statuses || {};
      const missingKeys = keys.filter((k) => statuses[k]?.granted !== true);
      const requiresAppSettings = Boolean(
        res?.requiresAppSettings ||
        missingKeys.some((k) => statuses[k]?.state === 'permanently_denied')
      );
      return {
        allGranted: Boolean(res?.allGranted ?? missingKeys.length === 0),
        statuses,
        missingKeys,
        requiresAppSettings,
        source: 'native_v11'
      };
    } catch {
      // Fallback below
    }
  }

  // Fallback for v10 APK or Web Browser
  for (const key of keys) {
    if (key === 'battery_unrestricted' && plugin && typeof plugin.requestBatteryExemption === 'function') {
      try { await plugin.requestBatteryExemption(); } catch {}
      continue;
    }
    if (key === 'camera' || key === 'microphone' || key === 'location' || key === 'notifications') {
      await requestSingleWebPermission(key);
    }
  }

  return checkModulePermissions(keys);
}

export async function openNativeAppPermissionSettings() {
  const plugin = getNativeFieldTrackerPlugin();
  if (plugin && typeof plugin.openAppSettings === 'function') {
    try {
      await plugin.openAppSettings();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
