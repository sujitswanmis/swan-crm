import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const filename = 'src/components/FieldForce/trackingDeviceStatus.js';
const code = (await swc.transform(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' } })).code;
const loaded = { exports: {} };
vm.runInNewContext(code, { module: loaded, exports: loaded.exports, Intl, Date });
const { deriveTrackingDeviceStatus: derive } = loaded.exports;
const now = Date.parse('2026-11-13T18:00:00Z');
const ago = seconds => new Date(now - seconds * 1000).toISOString();
const base = { isToday: true, isShiftCompleted: false, lastPingMs: Date.parse(ago(240)), marker: 'retained' };
const health = { platform: 'Android App', lastCheckedAt: ago(10), hasForegroundLocation: true, hasBackgroundLocation: true, gpsProviderEnabled: true };

test('permission denial and provider OFF are explicit independent states, not connectivity failures', () => {
  for (const [patch, expected] of [[{ hasForegroundLocation: false }, 'PERMISSION_DENIED'], [{ gpsProviderEnabled: false }, 'PROVIDER_DISABLED'], [{ hasBackgroundLocation: false }, 'BACKGROUND_RESTRICTED']]) {
    const status = derive(base, {}, { ...health, ...patch }, now);
    assert.equal(status.mobileDataState.code, 'ONLINE');
    assert.equal(status.gpsStatusState.code, expected);
    assert.equal(status.marker, 'retained');
    assert.match(status.gpsStatusState.detail, /11:29.*IST/i);
  }
  assert.equal(derive(base, {}, { ...health, hasForegroundLocation: false, gpsProviderEnabled: false }, now).gpsStatusState.code, 'PERMISSION_DENIED');
});

test('fresh heartbeat without a fix says GPS ON waiting, and GPS silence never says mobile data OFF', () => {
  const status = derive(base, {}, health, now);
  assert.equal(status.gpsStatusState.code, 'NO_FIX');
  assert.equal(status.mobileDataState.label, 'Online');
  const missing = derive(base, {}, null, now);
  assert.equal(missing.mobileDataState.label, 'Connection unconfirmed');
  assert.equal(missing.gpsStatusState.code, 'UNKNOWN');
});

test('stale, future or desktop reports cannot diagnose current permission or internet', () => {
  for (const patch of [{ lastCheckedAt: ago(91) }, { lastCheckedAt: ago(-31) }, { platform: 'Windows App' }]) {
    const status = derive(base, {}, { ...health, hasForegroundLocation: false, ...patch }, now);
    assert.equal(status.gpsStatusState.code, 'UNKNOWN');
    assert.equal(status.mobileDataState.code, 'UNKNOWN');
  }
});

test('recent mobile session proves connectivity without inventing a GPS fix', () => {
  const status = derive(base, { mobileSessionLastActive: ago(20) }, { ...health, lastCheckedAt: ago(200), hasForegroundLocation: false }, now);
  assert.equal(status.mobileDataState.code, 'ONLINE');
  assert.equal(status.gpsStatusState.code, 'UNKNOWN');
});

test('live GPS is network evidence, while offline-synced coordinates cannot fake live connectivity', () => {
  const recent = { ...base, lastPingMs: Date.parse(ago(10)) };
  assert.equal(derive(recent, { lastPing: {} }, null, now).gpsStatusState.code, 'ACTIVE');
  assert.equal(derive(recent, { lastPing: {} }, null, now).mobileDataState.code, 'ONLINE');
  const synced = derive(recent, { lastPing: { is_offline_synced: true } }, null, now);
  assert.equal(synced.mobileDataState.code, 'UNKNOWN');
  assert.equal(synced.gpsStatusState.code, 'UNKNOWN');
});

test('archive and ended shift return the unchanged legacy object; inputs stay immutable', () => {
  for (const legacy of [{ ...base, isToday: false }, { ...base, isShiftCompleted: true }]) assert.equal(derive(legacy, {}, health, now), legacy);
  const before = JSON.stringify({ base, health });
  derive(base, {}, health, now);
  assert.equal(JSON.stringify({ base, health }), before);
});

test('health badge freshness does not inherit a GPS fix or desktop session', () => {
  const stale = { ...health, lastCheckedAt: ago(240) };
  const status = derive({ ...base, lastPingMs: Date.parse(ago(5)) }, {}, stale, now);
  assert.equal(status.gpsStatusState.code, 'ACTIVE');
  assert.equal(status.deviceHealthFresh, false);
  assert.equal(status.deviceHealthReportedAt, Date.parse(stale.lastCheckedAt));
  assert.match(status.deviceHealthDetail, /Last device report:.*IST\. Current permissions unconfirmed/);
  assert.equal(derive(base, {}, health, now).deviceHealthFresh, true);
  assert.equal(derive(base, {}, { ...health, platform: 'Windows App' }, now).deviceHealthFresh, false);
});
