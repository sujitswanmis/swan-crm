import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PLATFORM_LABELS,
  normalizePlatformLabel,
  parseBrowserAndOsDetails,
  detectClientPlatform,
  resolvePlatformFromRequest,
  inferPlatformFromSessions
} from '../src/utils/platformDetection.js';

test('resolvePlatformFromRequest detects Windows Electron Desktop App', () => {
  const res = resolvePlatformFromRequest({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) spc-workspace/2.5.1051 Chrome/148.0.0.0 Electron/45.2.2 Safari/537.36'
  });
  assert.equal(res.platform, PLATFORM_LABELS.WINDOWS_APP);
  assert.match(res.details, /Windows/);
  assert.match(res.details, /Electron 45/);
});

test('resolvePlatformFromRequest detects Android Capacitor App via WebView UA and X-Requested-With', () => {
  const fromWv = resolvePlatformFromRequest({
    userAgent: 'Mozilla/5.0 (Linux; Android 17; SM-S911B Build/CP2A.260605.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/156.0.8078.47 Mobile Safari/537.36'
  });
  assert.equal(fromWv.platform, PLATFORM_LABELS.ANDROID_APP);
  assert.match(fromWv.details, /Android 17/);

  const fromHeader = resolvePlatformFromRequest({
    userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/156.0.0.0 Mobile Safari/537.36',
    xRequestedWith: 'com.supujacreations.workspace'
  });
  assert.equal(fromHeader.platform, PLATFORM_LABELS.ANDROID_APP);
});

test('resolvePlatformFromRequest keeps regular Android/iOS mobile browsers as Web App (not Android App)', () => {
  const androidChrome = resolvePlatformFromRequest({
    userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36'
  });
  assert.equal(androidChrome.platform, PLATFORM_LABELS.WEB_APP);
  assert.match(androidChrome.details, /Chrome 156/);
  assert.match(androidChrome.details, /Android 10/);

  const vivoBrowser = resolvePlatformFromRequest({
    userAgent: 'Mozilla/5.0 (Linux; Android 12; vivo 1907) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0.6312.118 Mobile Safari/537.36 VivoBrowser/15.1.0.3'
  });
  assert.equal(vivoBrowser.platform, PLATFORM_LABELS.WEB_APP);
  assert.match(vivoBrowser.details, /VivoBrowser 15/);

  const iosChrome = resolvePlatformFromRequest({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/153.0.8010.24 Mobile/15E148 Safari/604.1'
  });
  assert.equal(iosChrome.platform, PLATFORM_LABELS.WEB_APP);
  assert.match(iosChrome.details, /Chrome 153/);
});

test('resolvePlatformFromRequest detects Desktop Browsers as Web App and supports client cookie & mismatch guard', () => {
  const winEdge = resolvePlatformFromRequest({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36 Edg/157.0.0.0'
  });
  assert.equal(winEdge.platform, PLATFORM_LABELS.WEB_APP);
  assert.equal(winEdge.details, 'Edge 157 • Windows');

  const fromCookie = resolvePlatformFromRequest({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/156.0.0.0 Mobile Safari/537.36',
    cookiePlatform: 'Android App',
    cookieDetails: 'SPC Workspace APK (Android 14)'
  });
  assert.equal(fromCookie.platform, PLATFORM_LABELS.ANDROID_APP);
  assert.equal(fromCookie.details, 'SPC Workspace APK (Android 14)');

  // Mismatched cookie (Android cookie paired with Windows desktop UA) must fall back to Web App
  const mismatch = resolvePlatformFromRequest({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36',
    cookiePlatform: 'Android App'
  });
  assert.equal(mismatch.platform, PLATFORM_LABELS.WEB_APP);
});

test('resolvePlatformFromRequest returns System when no client headers or explicit platform exist', () => {
  const sys = resolvePlatformFromRequest({});
  assert.equal(sys.platform, PLATFORM_LABELS.SYSTEM);
});

test('detectClientPlatform inspects window.desktopApp and window.Capacitor bridges accurately', () => {
  // 1. Electron Desktop App via preload bridge
  const winRes = detectClientPlatform({
    win: {
      desktopApp: { isDesktop: true, platform: 'win32', version: '45.2.2' },
      matchMedia: () => ({ matches: false })
    },
    nav: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/148.0.0.0 Safari/537.36' },
    doc: { referrer: '' }
  });
  assert.equal(winRes.platform, PLATFORM_LABELS.WINDOWS_APP);
  assert.match(winRes.details, /Electron 45/);

  // 2. Capacitor Android Native App
  const androidRes = detectClientPlatform({
    win: {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
      matchMedia: () => ({ matches: false })
    },
    nav: { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel) Chrome/156.0.0.0 Mobile Safari/537.36' },
    doc: { referrer: '' }
  });
  assert.equal(androidRes.platform, PLATFORM_LABELS.ANDROID_APP);
  assert.match(androidRes.details, /SPC Workspace APK/);

  // 3. Regular Web Browser
  const webRes = detectClientPlatform({
    win: { matchMedia: () => ({ matches: false }) },
    nav: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36' },
    doc: { referrer: '' }
  });
  assert.equal(webRes.platform, PLATFORM_LABELS.WEB_APP);
  assert.equal(webRes.details, 'Chrome 156 • Windows');
});

test('normalizePlatformLabel and parseBrowserAndOsDetails handle aliases safely', () => {
  assert.equal(normalizePlatformLabel('windows_app'), PLATFORM_LABELS.WINDOWS_APP);
  assert.equal(normalizePlatformLabel('android'), PLATFORM_LABELS.ANDROID_APP);
  assert.equal(normalizePlatformLabel('web'), PLATFORM_LABELS.WEB_APP);
  assert.equal(normalizePlatformLabel(''), null);
  assert.equal(parseBrowserAndOsDetails('', { secChUaPlatform: '"Windows"' }), 'Windows');
});

test('AuditLogsTab renders dynamic platform badge instead of hardcoded Web App', () => {
  const tabSource = fs.readFileSync(new URL('../src/components/UserManagement/tabs/AuditLogsTab.jsx', import.meta.url), 'utf8');
  assert.match(tabSource, /getPlatformBadge\(log\.platform\)/);
  assert.match(tabSource, /platformFilter/);
  assert.doesNotMatch(tabSource, />\s*Web App\s*<\/span>/);
});

test('inferPlatformFromSessions resolves legacy null-platform rows using matching IP/session or legacy text', () => {
  const sessions = [
    {
      ip_address: '103.210.38.202',
      device: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36'
    },
    {
      ip_address: '223.188.143.32',
      device: 'Mozilla/5.0 (Linux; Android 17; SM-S911B; wv) AppleWebKit/537.36 Version/4.0 Chrome/156.0.0.0 Mobile Safari/537.36'
    }
  ];

  const matchedByIp = inferPlatformFromSessions({ platform: null }, sessions, '223.188.143.32');
  assert.equal(matchedByIp.platform, PLATFORM_LABELS.ANDROID_APP);
  assert.match(matchedByIp.details, /\(Session\)/);

  const webMatched = inferPlatformFromSessions({ platform: null }, sessions, '103.210.38.202');
  assert.equal(webMatched.platform, PLATFORM_LABELS.WEB_APP);
  assert.match(webMatched.details, /Chrome 156 • Windows \(Session\)/);

  const fromLegacyText = inferPlatformFromSessions(
    { platform: null, target: 'Employee punched in (Office Web Terminal)' },
    [],
    '127.0.0.1 (Local)'
  );
  assert.equal(fromLegacyText.platform, PLATFORM_LABELS.WEB_APP);

  const unknownLegacy = inferPlatformFromSessions({ platform: null, target: 'Added note' }, [], '127.0.0.1 (Local)');
  assert.equal(unknownLegacy.platform, PLATFORM_LABELS.LEGACY);

  const explicitRow = inferPlatformFromSessions(
    { platform: 'Windows App', platform_details: 'SPC Workspace Desktop (Windows • Electron 45)' },
    sessions,
    '223.188.143.32'
  );
  assert.equal(explicitRow.platform, PLATFORM_LABELS.WINDOWS_APP);
});
