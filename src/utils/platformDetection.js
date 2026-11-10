/**
 * Shared client & server platform detection utilities for Audit Logs.
 * Accurately distinguishes:
 *  - Windows App (SPC Workspace Electron Desktop)
 *  - Android App (SPC Workspace Capacitor Android APK / WebView)
 *  - iOS App (Capacitor iOS Native)
 *  - macOS App (Electron macOS Desktop)
 *  - Web App (Desktop or Mobile Web Browser / PWA)
 *  - System (Internal server/cron tasks without a client request)
 */

export const PLATFORM_LABELS = {
  WEB_APP: 'Web App',
  WINDOWS_APP: 'Windows App',
  ANDROID_APP: 'Android App',
  IOS_APP: 'iOS App',
  MACOS_APP: 'macOS App',
  SYSTEM: 'System',
  LEGACY: 'Legacy / N/A'
};

export const CLIENT_PLATFORM_COOKIE = 'spc_client_platform';
export const CLIENT_PLATFORM_DETAILS_COOKIE = 'spc_client_platform_details';

export function normalizePlatformLabel(raw = '') {
  const val = String(raw || '').trim().toLowerCase();
  if (!val) return null;
  if (val === 'windows app' || val === 'windows_app' || val === 'windows desktop' || val === 'windows' || val === 'win32' || val === 'electron') {
    return PLATFORM_LABELS.WINDOWS_APP;
  }
  if (val === 'android app' || val === 'android_app' || val === 'android apk' || val === 'android') {
    return PLATFORM_LABELS.ANDROID_APP;
  }
  if (val === 'ios app' || val === 'ios_app' || val === 'ios') {
    return PLATFORM_LABELS.IOS_APP;
  }
  if (val === 'macos app' || val === 'macos_app' || val === 'mac app' || val === 'darwin') {
    return PLATFORM_LABELS.MACOS_APP;
  }
  if (val === 'web app' || val === 'web_app' || val === 'web' || val === 'browser' || val === 'web browser') {
    return PLATFORM_LABELS.WEB_APP;
  }
  if (val === 'system' || val === 'server') {
    return PLATFORM_LABELS.SYSTEM;
  }
  if (val === 'legacy' || val === 'legacy / n/a' || val === 'unrecorded') {
    return PLATFORM_LABELS.LEGACY;
  }
  return null;
}

export function parseBrowserAndOsDetails(userAgent = '', { secChUaPlatform = '', isPwa = false } = {}) {
  const ua = String(userAgent || '');
  const chPlat = String(secChUaPlatform || '').replace(/"/g, '').trim();

  // OS detection
  let osLabel = '';
  const androidMatch = ua.match(/Android\s+([\d.]+)/i);
  if (androidMatch) {
    osLabel = `Android ${androidMatch[1]}`;
  } else if (/Android/i.test(ua)) {
    osLabel = 'Android';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    osLabel = /iPad/i.test(ua) ? 'iPadOS' : 'iOS';
  } else if (/Windows NT/i.test(ua) || chPlat.toLowerCase() === 'windows') {
    osLabel = 'Windows';
  } else if (/Macintosh|Mac OS X/i.test(ua) || chPlat.toLowerCase() === 'macos') {
    osLabel = 'macOS';
  } else if (/Linux/i.test(ua) || chPlat.toLowerCase() === 'linux') {
    osLabel = 'Linux';
  } else if (chPlat) {
    osLabel = chPlat;
  }

  // Browser / runtime detection
  let browserLabel = '';
  const electronMatch = ua.match(/Electron\/([\d.]+)/i);
  if (electronMatch) {
    browserLabel = `Electron ${electronMatch[1].split('.')[0]}`;
  } else if (/EdgA?\/([\d]+)/i.test(ua)) {
    const m = ua.match(/EdgA?\/([\d]+)/i);
    browserLabel = `Edge ${m[1]}`;
  } else if (/VivoBrowser\/([\d]+)/i.test(ua)) {
    const m = ua.match(/VivoBrowser\/([\d]+)/i);
    browserLabel = `VivoBrowser ${m[1]}`;
  } else if (/SamsungBrowser\/([\d]+)/i.test(ua)) {
    const m = ua.match(/SamsungBrowser\/([\d]+)/i);
    browserLabel = `Samsung Browser ${m[1]}`;
  } else if (/OPR\/([\d]+)/i.test(ua)) {
    const m = ua.match(/OPR\/([\d]+)/i);
    browserLabel = `Opera ${m[1]}`;
  } else if (/CriOS\/([\d]+)/i.test(ua)) {
    const m = ua.match(/CriOS\/([\d]+)/i);
    browserLabel = `Chrome ${m[1]}`;
  } else if (/FxiOS\/([\d]+)/i.test(ua)) {
    const m = ua.match(/FxiOS\/([\d]+)/i);
    browserLabel = `Firefox ${m[1]}`;
  } else if (/Firefox\/([\d]+)/i.test(ua)) {
    const m = ua.match(/Firefox\/([\d]+)/i);
    browserLabel = `Firefox ${m[1]}`;
  } else if (/Chrome\/([\d]+)/i.test(ua) && !/Chromium/i.test(ua)) {
    const m = ua.match(/Chrome\/([\d]+)/i);
    browserLabel = `Chrome ${m[1]}`;
  } else if (/Safari\/[\d.]+/i.test(ua) && /Version\/([\d.]+)/i.test(ua)) {
    const m = ua.match(/Version\/([\d.]+)/i);
    browserLabel = `Safari ${m[1].split('.')[0]}`;
  }

  const isMobileUa = /Mobile|Android|iPhone|iPod/i.test(ua);
  const parts = [];
  if (browserLabel) parts.push(browserLabel);
  if (osLabel) parts.push(osLabel);
  if (isPwa) parts.push('PWA');
  else if (isMobileUa && !/Mobile/i.test(osLabel)) parts.push('Mobile Web');

  return parts.join(' • ') || 'Web Browser';
}

/**
 * Client-side runtime platform detection.
 * Uses preload/native bridges first (window.desktopApp, window.Capacitor),
 * then falls back to User-Agent and referrer inspection.
 */
export function detectClientPlatform({ win, nav, doc } = {}) {
  const runtimeWin = win ?? (typeof window !== 'undefined' ? window : undefined);
  const runtimeNav = nav ?? (typeof navigator !== 'undefined' ? navigator : undefined);
  const runtimeDoc = doc ?? (typeof document !== 'undefined' ? document : undefined);

  if (!runtimeWin) {
    return { platform: PLATFORM_LABELS.WEB_APP, details: 'Web Browser' };
  }

  const ua = runtimeNav?.userAgent || '';
  const referrer = runtimeDoc?.referrer || '';

  // 1. Electron Desktop App (Windows / macOS)
  const desktopBridge = runtimeWin.desktopApp;
  const isElectronUa = /\belectron\/\d/i.test(ua) || /\bspc[-_\s]?workspace\b/i.test(ua);
  if (desktopBridge?.isDesktop || isElectronUa) {
    const electronVer = desktopBridge?.version || (ua.match(/Electron\/([\d.]+)/i)?.[1] || '');
    const desktopOs = desktopBridge?.platform || (/\bmac/i.test(ua) && !/windows/i.test(ua) ? 'darwin' : 'win32');
    const platform = desktopOs === 'darwin' ? PLATFORM_LABELS.MACOS_APP : PLATFORM_LABELS.WINDOWS_APP;
    const osText = desktopOs === 'darwin' ? 'macOS' : 'Windows';
    const verSuffix = electronVer ? ` • Electron ${String(electronVer).split('.')[0]}` : '';
    return {
      platform,
      details: `SPC Workspace Desktop (${osText}${verSuffix})`
    };
  }

  // 2. Capacitor Native Android / iOS App
  const cap = runtimeWin.Capacitor;
  let isCapacitorNative = false;
  let capPlatform = '';
  if (cap) {
    try {
      isCapacitorNative = typeof cap.isNativePlatform === 'function'
        ? Boolean(cap.isNativePlatform())
        : Boolean(cap.isNative);
      capPlatform = typeof cap.getPlatform === 'function' ? String(cap.getPlatform() || '').toLowerCase() : '';
    } catch (_) {}
  }

  const isAndroidWebViewUa = /Android/i.test(ua) && (/;\s*wv\)/i.test(ua) || /spcworkspaceandroid/i.test(ua));
  if ((isCapacitorNative && capPlatform === 'android') || referrer.includes('android-app://') || isAndroidWebViewUa) {
    const androidMatch = ua.match(/Android\s+([\d.]+)/i);
    const androidVer = androidMatch ? `Android ${androidMatch[1]}` : 'Android';
    return {
      platform: PLATFORM_LABELS.ANDROID_APP,
      details: `SPC Workspace APK (${androidVer})`
    };
  }

  if (isCapacitorNative && capPlatform === 'ios') {
    return {
      platform: PLATFORM_LABELS.IOS_APP,
      details: 'SPC Workspace App (iOS)'
    };
  }

  // 3. Web App (Desktop or Mobile Browser / Installed PWA)
  let isPwa = false;
  try {
    isPwa = Boolean(
      runtimeWin.matchMedia?.('(display-mode: standalone)')?.matches ||
      runtimeNav?.standalone === true
    );
  } catch (_) {}

  return {
    platform: PLATFORM_LABELS.WEB_APP,
    details: parseBrowserAndOsDetails(ua, { isPwa })
  };
}

/**
 * Server-side platform resolution combining HTTP request headers, client cookie, and explicit overrides.
 */
export function resolvePlatformFromRequest({
  userAgent = '',
  xRequestedWith = '',
  xPlatform = '',
  secChUaPlatform = '',
  cookiePlatform = '',
  cookieDetails = '',
  explicitPlatform = '',
  explicitDetails = ''
} = {}) {
  const ua = String(userAgent || '');
  const reqWith = String(xRequestedWith || '').toLowerCase().trim();
  const explicitNorm = normalizePlatformLabel(explicitPlatform);
  const headerNorm = normalizePlatformLabel(xPlatform);
  const cookieNorm = normalizePlatformLabel(cookiePlatform);
  const cleanExplicitDetails = String(explicitDetails || '').trim();
  const cleanCookieDetails = String(cookieDetails || '').trim();

  // 1. Unambiguous native app signals from HTTP User-Agent / X-Requested-With
  if (/\belectron\/\d/i.test(ua) || /\bspc[-_\s]?workspace\b/i.test(ua)) {
    const isMac = /\bmacintosh\b|\bmac os x\b/i.test(ua) && !/windows/i.test(ua);
    const electronVer = ua.match(/Electron\/([\d.]+)/i)?.[1] || '';
    const verSuffix = electronVer ? ` • Electron ${electronVer.split('.')[0]}` : '';
    return {
      platform: isMac ? PLATFORM_LABELS.MACOS_APP : PLATFORM_LABELS.WINDOWS_APP,
      details: cleanExplicitDetails || cleanCookieDetails || `SPC Workspace Desktop (${isMac ? 'macOS' : 'Windows'}${verSuffix})`
    };
  }

  if (
    reqWith === 'com.supujacreations.workspace' ||
    /spcworkspaceandroid/i.test(ua) ||
    (/Android/i.test(ua) && /;\s*wv\)/i.test(ua))
  ) {
    const androidMatch = ua.match(/Android\s+([\d.]+)/i);
    const androidVer = androidMatch ? `Android ${androidMatch[1]}` : 'Android';
    return {
      platform: PLATFORM_LABELS.ANDROID_APP,
      details: cleanExplicitDetails || cleanCookieDetails || `SPC Workspace APK (${androidVer})`
    };
  }

  // 2. Explicit native platform passed directly from client JS (e.g., window.desktopApp / window.Capacitor)
  if (explicitNorm && explicitNorm !== PLATFORM_LABELS.WEB_APP) {
    return {
      platform: explicitNorm,
      details: cleanExplicitDetails || cleanCookieDetails || explicitNorm
    };
  }
  if (headerNorm && headerNorm !== PLATFORM_LABELS.WEB_APP) {
    return {
      platform: headerNorm,
      details: cleanExplicitDetails || cleanCookieDetails || headerNorm
    };
  }

  // 3. Client-synced cookie (from ClientPlatformSync), guarded against obvious UA OS mismatch
  if (cookieNorm && cookieNorm !== PLATFORM_LABELS.LEGACY) {
    const isDesktopUa = /Windows NT|Macintosh|X11; Linux/i.test(ua);
    const isMobileUa = /Android|iPhone|iPad|iPod/i.test(ua);
    const cookieConflictsWithUa =
      (cookieNorm === PLATFORM_LABELS.ANDROID_APP && isDesktopUa && !/Android/i.test(ua)) ||
      (cookieNorm === PLATFORM_LABELS.IOS_APP && isDesktopUa && !/iPhone|iPad|iPod/i.test(ua)) ||
      (cookieNorm === PLATFORM_LABELS.WINDOWS_APP && isMobileUa && !/Windows/i.test(ua));

    if (!cookieConflictsWithUa) {
      return {
        platform: cookieNorm,
        details: cleanExplicitDetails || cleanCookieDetails || parseBrowserAndOsDetails(ua, { secChUaPlatform })
      };
    }
  }

  // 4. Explicit Web App or valid HTTP User-Agent -> Web App
  if (explicitNorm === PLATFORM_LABELS.WEB_APP || headerNorm === PLATFORM_LABELS.WEB_APP || ua.trim()) {
    return {
      platform: PLATFORM_LABELS.WEB_APP,
      details: cleanExplicitDetails || parseBrowserAndOsDetails(ua, { secChUaPlatform })
    };
  }

  // 5. Internal server call with no client request headers
  return {
    platform: PLATFORM_LABELS.SYSTEM,
    details: 'Server / Internal Process'
  };
}

/**
 * Fallback platform inference for pre-migration / pre-deploy audit rows where `platform` is NULL.
 * Matches against known `user_sessions` rows (preferring matching IP address) or unambiguous legacy text.
 */
export function inferPlatformFromSessions(log = {}, candidateSessions = [], cleanIp = '') {
  if (log.platform) {
    return {
      platform: normalizePlatformLabel(log.platform) || log.platform,
      details: log.platform_details || ''
    };
  }

  const validSessions = (candidateSessions || []).filter(s => s && typeof s.device === 'string' && s.device.trim());
  if (validSessions.length > 0) {
    const ipNorm = String(cleanIp || '').trim();
    const matched = (ipNorm && ipNorm !== '127.0.0.1 (Local)')
      ? (validSessions.find(s => String(s.ip_address || '').trim() === ipNorm) || validSessions[0])
      : validSessions[0];

    const resolved = resolvePlatformFromRequest({ userAgent: matched.device });
    if (resolved?.platform && resolved.platform !== PLATFORM_LABELS.SYSTEM) {
      return {
        platform: resolved.platform,
        details: resolved.details ? `${resolved.details} (Session)` : 'Inferred from session'
      };
    }
  }

  const tgt = String(log.target || '');
  if (/office web terminal|logged in to web app/i.test(tgt)) {
    return {
      platform: PLATFORM_LABELS.WEB_APP,
      details: 'Inferred from legacy log'
    };
  }

  return {
    platform: PLATFORM_LABELS.LEGACY,
    details: 'Recorded prior to platform tracking'
  };
}
