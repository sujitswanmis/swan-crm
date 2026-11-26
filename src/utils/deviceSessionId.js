/**
 * Persistent per-device / per-browser session signature utility.
 * Generates a compact device instance ID stored in localStorage so 2-4+ concurrent logins
 * (e.g., multiple PCs, browsers, Android APK, iOS) maintain separate rows in `user_sessions`
 * without requiring a DB schema migration or duplicating rows on page refresh.
 */

export const DEVICE_UID_STORAGE_KEY = 'spc_device_uid';
const DEVICE_SID_REGEX = /\s*\[SID:([A-Za-z0-9_-]+)\]\s*/i;

/**
 * Extract the `[SID:xxxxxx]` token from a stored `device` string.
 */
export function extractSessionDeviceId(deviceStr = '') {
  const match = String(deviceStr || '').match(DEVICE_SID_REGEX);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Strip the `[SID:xxxxxx]` suffix so existing UA parsers read cleanly.
 */
export function stripSessionDeviceId(deviceStr = '') {
  return String(deviceStr || '').replace(DEVICE_SID_REGEX, ' ').trim();
}

/**
 * Get or generate a stable 6-char device instance ID on the client.
 */
export function getOrCreateClientDeviceId() {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage?.getItem(DEVICE_UID_STORAGE_KEY);
    if (existing && /^[A-Za-z0-9_-]{4,16}$/.test(existing)) {
      return existing.toUpperCase();
    }
    let generated = '';
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(4);
      window.crypto.getRandomValues(bytes);
      generated = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 6).toUpperCase();
    } else {
      generated = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0');
    }
    window.localStorage?.setItem(DEVICE_UID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return '';
  }
}

/**
 * Return user-agent string tagged with the current client's `[SID:xxxxxx]` identifier.
 */
export function getClientDeviceSignature() {
  if (typeof navigator === 'undefined') return 'Unknown Device';
  const baseUa = navigator.userAgent || 'Web Browser';
  const sid = getOrCreateClientDeviceId();
  if (!sid) return baseUa;
  return `${stripSessionDeviceId(baseUa)} [SID:${sid}]`;
}

/**
 * Parse OS, browser/app runtime, and device instance tag from a `user_sessions.device` string.
 */
export function parseSessionDeviceSummary(deviceStr = '') {
  const deviceIdTag = extractSessionDeviceId(deviceStr);
  const cleanStr = stripSessionDeviceId(deviceStr);
  const lower = cleanStr.toLowerCase();

  if (!cleanStr) {
    return { os: 'Unknown', browser: 'Browser', runtime: 'Web Browser', deviceIdTag, isMobile: false };
  }

  let os = 'Windows';
  let isMobile = false;
  if (lower.includes('android')) {
    os = 'Android';
    isMobile = true;
  } else if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ios')) {
    os = lower.includes('ipad') ? 'iPadOS' : 'iOS';
    isMobile = true;
  } else if (lower.includes('macintosh') || lower.includes('mac os')) {
    os = 'macOS';
  } else if (lower.includes('linux')) {
    os = 'Linux';
  }

  let browser = 'Browser';
  let runtime = '';
  if (lower.includes('electron')) {
    browser = 'Desktop App';
    runtime = os === 'macOS' ? 'macOS App' : 'Windows App';
  } else if (lower.includes('spc workspace apk') || (lower.includes('android') && lower.includes('; wv)'))) {
    browser = 'Android APK';
    runtime = 'Android App';
  } else if (lower.includes('edg/')) {
    browser = 'Edge';
    runtime = `Edge on ${os}`;
  } else if (lower.includes('chrome')) {
    browser = 'Chrome';
    runtime = `Chrome on ${os}`;
  } else if (lower.includes('safari')) {
    browser = 'Safari';
    runtime = `Safari on ${os}`;
  } else if (lower.includes('firefox')) {
    browser = 'Firefox';
    runtime = `Firefox on ${os}`;
  } else {
    runtime = `${browser} on ${os}`;
  }

  return { os, browser, runtime, deviceIdTag, isMobile };
}
