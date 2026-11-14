import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const compile = async filename => (await swc.transform(fs.readFileSync(filename, 'utf8'), {
  filename, jsc: { parser: { syntax: 'ecmascript', jsx: true } }, module: { type: 'commonjs' },
})).code;
function load(code, dependencies, globals = {}) {
  const loaded = { exports: {} };
  vm.runInNewContext(code, { module: loaded, exports: loaded.exports, console, Date, Buffer, setTimeout, clearTimeout, ...globals,
    require: name => { if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected dependency: ${name}`); return dependencies[name]; } });
  return loaded.exports;
}
const tokens = load(await compile('src/utils/fieldTelemetryToken.js'), { 'node:crypto': crypto }, { process: { env: { FIELD_TELEMETRY_SECRET: 'isolated-heartbeat-test-secret' } } });
const policy = load(await compile('src/config/appReleaseConfig.js'), {});
const actionCode = await compile('src/app/actions/liveTracking.js');
const routeCode = await compile('src/app/api/field-force/telemetry/route.js');
const trackerCode = await compile('src/components/FieldForce/GlobalMobileTelemetryTracker.jsx');
const uid = '11111111-1111-4111-8111-111111111111';
const otherUid = '22222222-2222-4222-8222-222222222222';
const company = 'TNT00002';
const token = tokens.signFieldTelemetryToken({ userId: uid, company, branchCode: 'TNT00002-B0001' });
const snapshot = patch => ({ capturedAtMs: Date.now(), hasForegroundLocation: true, hasBackgroundLocation: true, gpsProviderEnabled: true, running: true, appVersionCode: 5, appVersionName: 'test', pendingCount: 0, ...patch });

function harness({ initial = {}, dbError = false } = {}) {
  let store = structuredClone(initial);
  const writes = [];
  const gpsBatches = [];
  const rows = Object.values(initial);
  const client = {
    from(table) {
      const filters = {};
      return {
        select() { return this; }, eq(key, value) { filters[key] = value; return this; }, order() { return this; }, limit() { return this; },
        maybeSingle: async () => ({ data: table === 'employee_device_health' ? rows.find(row => Object.entries(filters).every(([key, value]) => row[key] === value)) || null : null }),
        upsert: async record => { writes.push({ table, record }); return { error: dbError ? { message: 'database unavailable' } : null }; },
      };
    },
  };
  const action = load(actionCode, {
    '@supabase/supabase-js': { createClient: () => client }, '@/utils/supabase/server': {}, '@/utils/fieldTelemetryToken': tokens,
    '@/utils/routeGeometryMatcher': {}, '@/components/FieldForce/trackingActivityTimeline': {},
    '@/app/actions/tenantBranches': { resolveKnownTenant: async value => ({ tenantCode: value, tenantId: '33333333-3333-4333-8333-333333333333' }) },
    '@/config/appReleaseConfig': policy,
    'fs/promises': { readFile: async filename => { if (!filename.includes('device_health_store.json')) throw new Error('No policy cache'); return JSON.stringify(store); }, mkdir: async () => {}, writeFile: async (_file, value) => { store = JSON.parse(value); } },
    path, os,
  }, { process: { cwd: () => '/isolated-tests', env: {} } });
  const route = load(routeCode, {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
    '@/utils/fieldTelemetryToken': tokens,
    '@/app/actions/liveTracking': { reportFieldDeviceHeartbeat: action.reportFieldDeviceHeartbeat,
      recordLocationPingBatch: async pings => { gpsBatches.push(pings); return { success: true, count: pings.length }; } },
  });
  return { action, route, writes, gpsBatches, store: () => store };
}
const request = body => ({ json: async () => body, headers: new Headers() });

test('status-only request records permission denial with no GPS fix or fabricated coordinate', async () => {
  const h = harness();
  const result = await h.route.POST(request({ token, pings: [], deviceStatus: snapshot({ hasForegroundLocation: false }) }));
  assert.equal(result.status, 200);
  assert.equal(result.body.statusAccepted, true);
  assert.equal(result.body.count, 0);
  assert.equal(h.gpsBatches.length, 0);
  const record = h.writes[0].record;
  assert.equal(record.has_foreground_location, false);
  assert.equal(record.has_background_location, false);
  assert.equal(record.gps_provider_enabled, true);
  assert.equal(record.location_mode, 'denied');
  assert.equal(Object.hasOwn(record, 'latitude'), false);
  assert.ok(Date.now() - Date.parse(record.last_checked_at) < 3000);
});

test('token owns heartbeat user, tenant and branch; payload identity overrides are ignored', async () => {
  const h = harness();
  const result = await h.action.reportFieldDeviceHeartbeat(token, snapshot({ userId: otherUid, user_id: otherUid, company: 'TNT00003', tenantId: otherUid, branchCode: 'TNT00003-B0009' }));
  assert.equal(result.success, true);
  const record = h.writes[0].record;
  assert.equal(record.user_id, uid);
  assert.equal(record.company, company);
  assert.equal(record.branch_code, 'TNT00002-B0001');
  assert.equal(Object.keys(h.store()).length, 1);
});

test('heartbeat preserves battery, notification and device metadata plus other employees fallback rows', async () => {
  const key = `${uid}::${company}`;
  const previous = { user_id: uid, company, battery_unrestricted: false, notifications_enabled: true, device_model: 'Test phone', last_checked_at: new Date(Date.now() - 60000).toISOString() };
  const otherKey = `${otherUid}::${company}`;
  const h = harness({ initial: { [key]: previous, [otherKey]: { user_id: otherUid, company, sentinel: 'keep' } } });
  await h.action.reportFieldDeviceHeartbeat(token, snapshot({ gpsProviderEnabled: false }));
  const record = h.store()[key];
  assert.equal(record.gps_provider_enabled, false);
  assert.equal(record.has_foreground_location, true);
  assert.equal(record.location_mode, 'all_the_time');
  assert.equal(record.battery_unrestricted, false);
  assert.equal(record.notifications_enabled, true);
  assert.equal(record.device_model, 'Test phone');
  assert.equal(h.store()[otherKey].sentinel, 'keep');
});

test('bad token, string booleans, stale/replayed capture and invalid snapshots never write health', async () => {
  const h = harness();
  for (const [signed, value] of [['bad-token', snapshot()], [token, snapshot({ hasForegroundLocation: 'false' })], [token, snapshot({ capturedAtMs: Date.now() - 121000 })], [token, snapshot({ capturedAtMs: Date.now() + 31000 })], [token, null]]) {
    assert.equal((await h.action.reportFieldDeviceHeartbeat(signed, value)).success, false);
  }
  assert.equal(h.writes.length, 0);
  const unauthorized = await h.route.POST(request({ token: 'bad', deviceStatus: snapshot() }));
  assert.equal(unauthorized.status, 401);
});

test('rejected diagnostic never prevents GPS acknowledgment; legacy packets keep their response', async () => {
  const h = harness();
  const result = await h.route.POST(request({ token, deviceStatus: snapshot({ running: 'true' }), pings: [{ user_id: otherUid, latitude: 30, longitude: 75 }] }));
  assert.equal(result.body.success, true);
  assert.equal(result.body.statusAccepted, false);
  assert.equal(result.body.count, 1);
  assert.equal(h.gpsBatches[0][0].user_id, uid);
  const legacy = await h.route.POST(request({ token, pings: [] }));
  assert.deepEqual(JSON.parse(JSON.stringify(legacy.body)), { success: true, count: 0 });
});

test('database outage still accepts durable fallback health, and while-using stays distinct', async () => {
  const h = harness({ dbError: true });
  assert.equal((await h.action.reportFieldDeviceHeartbeat(token, snapshot({ hasBackgroundLocation: false }))).success, true);
  assert.equal(h.store()[`${uid}::${company}`].location_mode, 'while_using');
});

test('device summary retains explicit false permissions for the dashboard', async () => {
  const h = harness({ initial: { [`${uid}::${company}`]: { user_id: uid, company, platform: 'Android App',
    last_checked_at: new Date().toISOString(), has_foreground_location: false, has_background_location: false, gps_provider_enabled: true } } });
  const result = await h.action.getEmployeeDeviceHealthSummary(uid, company);
  assert.equal(result.success, true);
  assert.equal(result.summary.hasForegroundLocation, false);
  assert.equal(result.summary.hasBackgroundLocation, false);
  assert.equal(result.summary.gpsProviderEnabled, true);
  assert.equal(result.summary.locationMode, 'denied');
});

test('mobile health timer survives native GPS activation, reports permission changes without a fix, and cleans up', async () => {
  const effects = [], reports = [], intervals = new Map(), listeners = new Map(), permissionListeners = new Map();
  let currentTime = Date.now(), nextInterval = 0, success = true;
  let device = snapshot();
  class Clock extends Date { static now() { return currentTime; } }
  const permission = { addEventListener: (key, fn) => permissionListeners.set(key, fn), removeEventListener: key => permissionListeners.delete(key) };
  const navigator = { userAgent: 'Android SPC Workspace APK', onLine: true,
    permissions: { query: async () => permission },
    geolocation: { watchPosition: () => 1, clearWatch: () => {}, getCurrentPosition: () => assert.fail('Native tracking must not request fallback GPS') } };
  const tracker = load(trackerCode, {
    react: { useRef: initial => ({ current: initial }), useState: initial => [initial, () => {}], useEffect: fn => effects.push(fn) },
    'lucide-react': {},
    '@/app/actions/liveTracking': { issueFieldTelemetryToken: async () => ({ success: true, token }), recordLocationPingBatch: async () => assert.fail('No fix was supplied'),
      reportEmployeeDeviceHealth: async payload => { reports.push(payload); return { success }; } },
    '@/utils/platformDetection': { detectClientPlatform: () => ({ platform: 'Android App', details: 'APK' }), PLATFORM_LABELS: { ANDROID_APP: 'Android App' } },
    '@/utils/offlineLocationVault': { flushOfflineVault: async () => {}, queueOfflineGpsPing: async () => assert.fail('No fake GPS queue entries') },
  }, { Date: Clock, navigator,
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    window: { location: { origin: 'https://example.test' }, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key),
      Capacitor: { isNativePlatform: () => true, Plugins: { FieldTracker: { startTracking: async () => ({ started: true }), flushNow: async () => {}, getStatus: async () => device } } } },
    setInterval: fn => { intervals.set(++nextInterval, fn); return nextInterval; }, clearInterval: id => intervals.delete(id),
  });
  tracker.default({ userId: uid, company });
  const cleanup = effects[0]();
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  assert.equal(reports.length, 1);
  assert.equal(intervals.size, 1, 'Only independent health timer remains after native GPS starts');
  device = snapshot({ hasForegroundLocation: false, hasBackgroundLocation: false, locationMode: 'denied' });
  permissionListeners.get('change')();
  await settle();
  assert.equal(reports.at(-1).hasForegroundLocation, false);
  assert.equal(reports.at(-1).gpsProviderEnabled, true);
  assert.equal(navigator.onLine, true);
  currentTime += 50000;
  success = false;
  [...intervals.values()][0](); await settle();
  const failedCount = reports.length;
  currentTime += 25000;
  success = true;
  [...intervals.values()][0](); await settle();
  assert.equal(reports.length, failedCount + 1, 'Failed sends do not suppress the next heartbeat');
  navigator.onLine = false;
  currentTime += 50000;
  const beforeOffline = reports.length;
  [...intervals.values()][0](); await settle();
  assert.equal(reports.length, beforeOffline);
  cleanup();
  assert.equal(intervals.size, 0);
  assert.equal(permissionListeners.size, 0);
  assert.equal(listeners.size, 0);
});

function startMobileTracker({ hasGeolocation = true, blockedStart = false, blockedStatus = false, desktopLabel = false } = {}) {
  const effects = [], reports = [], timers = new Map(), intervals = new Map(), events = new Map();
  let nextTimer = 0, serviceAttempts = 0;
  const device = snapshot({ hasForegroundLocation: false, hasBackgroundLocation: false, locationMode: 'denied', running: false });
  const never = () => new Promise(() => {});
  const tracker = load(trackerCode, {
    react: { useRef: initial => ({ current: initial }), useState: initial => [initial, () => {}], useEffect: fn => effects.push(fn) },
    'lucide-react': {},
    '@/app/actions/liveTracking': { issueFieldTelemetryToken: async () => ({ success: true, token }),
      recordLocationPingBatch: async () => assert.fail('Health reporting must not fabricate locations'),
      reportEmployeeDeviceHealth: async payload => { reports.push(payload); return { success: true }; } },
    '@/utils/platformDetection': { detectClientPlatform: () => ({ platform: desktopLabel ? 'Windows App' : 'Android App' }), PLATFORM_LABELS: { ANDROID_APP: 'Android App', WINDOWS_APP: 'Windows App' } },
    '@/utils/offlineLocationVault': { flushOfflineVault: async () => {}, queueOfflineGpsPing: async () => assert.fail('No fixes were supplied') },
  }, { navigator: { onLine: true, userAgent: desktopLabel ? 'SPC Workspace' : 'Android',
      ...(hasGeolocation ? { geolocation: { watchPosition: () => 1, clearWatch() {}, getCurrentPosition() {} } } : {}) },
    document: { visibilityState: 'visible', addEventListener: (key, fn) => events.set(`doc:${key}`, fn), removeEventListener: key => events.delete(`doc:${key}`) },
    window: { location: { origin: 'https://example.test' }, addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key),
      Capacitor: { isNativePlatform: () => true, Plugins: { FieldTracker: {
        startTracking: () => { serviceAttempts++; return blockedStart ? never() : Promise.resolve({ permissionDenied: true }); },
        getStatus: () => blockedStatus ? never() : Promise.resolve(device),
      } } } },
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: key => timers.delete(key),
    setInterval: fn => { intervals.set(++nextTimer, fn); return nextTimer; }, clearInterval: key => intervals.delete(key),
  });
  tracker.default({ userId: uid, company });
  const cleanup = effects[0]();
  return { reports, timers, intervals, events, cleanup, attempts: () => serviceAttempts };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('denied permission is reported at startup even while native permission/service startup never resolves', async () => {
  const h = startMobileTracker({ blockedStart: true });
  await settle();
  assert.equal(h.attempts(), 1);
  assert.equal(h.reports.length, 1);
  assert.equal(h.reports[0].locationMode, 'denied');
  assert.equal(h.reports[0].gpsProviderEnabled, true);
  assert.equal(h.reports[0].running, false);
  h.events.get('focus')(); await settle();
  assert.equal(h.reports.length, 2, 'Resume audit must not await the still-pending location request');
  assert.equal(h.attempts(), 1, 'Resume cannot open duplicate permission prompts');
  h.cleanup();
  assert.equal(h.intervals.size, 0);
  assert.equal(h.events.size, 0);
});

test('native permission audit runs without a geolocation API and wins over a misleading desktop UA label', async () => {
  const h = startMobileTracker({ hasGeolocation: false, blockedStart: true, desktopLabel: true });
  await settle();
  assert.equal(h.reports.length, 1);
  assert.equal(h.reports[0].platform, 'Android App');
  assert.equal(h.reports[0].hasForegroundLocation, false);
  h.cleanup();
});

test('an unresponsive native status bridge times out without replacing the last valid health and allows retry', async () => {
  const h = startMobileTracker({ blockedStart: true, blockedStatus: true });
  await settle();
  assert.equal(h.timers.size, 1);
  [...h.timers.values()][0](); await settle();
  assert.equal(h.reports.length, 0, 'A timeout must not upload guessed permission flags');
  assert.equal(h.timers.size, 0);
  h.events.get('focus')(); await settle();
  assert.equal(h.timers.size, 1, 'A stalled bridge cannot permanently lock health reporting');
  [...h.timers.values()][0](); await settle();
  h.cleanup();
});
