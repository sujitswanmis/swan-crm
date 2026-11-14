import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const code = (await swc.transform(fs.readFileSync(new URL('../src/components/FieldForce/trackingDateRanges.js', import.meta.url), 'utf8'), {
  filename: 'trackingDateRanges.js', jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' },
})).code;

function helpers(extra = {}) {
  const loaded = { exports: {} };
  vm.runInNewContext(code, { module: loaded, exports: loaded.exports, setTimeout, clearTimeout, ...extra });
  return loaded.exports;
}
const ranges = helpers();
const asJSON = value => JSON.parse(JSON.stringify(value));
const userId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-11-11T12:00:00+05:30').getTime();
const route = (date, km = 1.25) => ({
  userId, date, totalKm: km, trackedRoadKm: km - 0.25, offlineGapKm: 0.25, visitsCount: 1,
  polyline: [{ lat: 30, lng: 75, time: `${date}T09:00:00+05:30` }, { lat: 30.01, lng: 75.01, time: `${date}T10:00:00+05:30` }],
  timeline: [{ type: 'stoppage', startTime: `${date}T09:00:00+05:30`, endTime: `${date}T09:10:00+05:30`, durationMins: 10 }],
  lastPing: { recorded_at: `${date}T10:00:00+05:30`, battery_pct: 45 },
});

test('all requested presets include Last 30 and Last 90 Days without Last 10 Days', () => {
  const labels = ranges.TRACKING_RANGE_PRESETS.map(item => item.label);
  for (const label of ['Today', 'Yesterday', 'This Week', 'Last Week', 'Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'This Month', 'Last Month']) assert.ok(labels.includes(label));
  assert.ok(!labels.includes('Last 10 Days'));
  for (const [preset, start, end, count] of [
    ['today', '2026-11-11', '2026-11-11', 1], ['yesterday', '2026-11-10', '2026-11-10', 1],
    ['this_week', '2026-11-09', '2026-11-11', 3], ['last_week', '2026-11-02', '2026-11-08', 7],
    ['last_7', '2026-11-05', '2026-11-11', 7], ['last_30', '2026-10-13', '2026-11-11', 30],
    ['last_90', '2026-08-14', '2026-11-11', 90], ['this_month', '2026-11-01', '2026-11-11', 11],
    ['last_month', '2026-10-01', '2026-10-31', 31],
  ]) {
    const value = ranges.resolveTrackingDateRange(preset, '', '', now);
    assert.equal(value.startDate, start, preset);
    assert.equal(value.endDate, end, preset);
    assert.equal(ranges.enumerateTrackingDates(start, end).length, count, preset);
  }
});

test('IST midnight, Monday/Sunday, year and leap-month boundaries are exact', () => {
  assert.equal(ranges.resolveTrackingDateRange('today', '', '', Date.parse('2026-11-11T18:29:59Z')).startDate, '2026-11-11');
  assert.equal(ranges.resolveTrackingDateRange('today', '', '', Date.parse('2026-11-11T18:30:00Z')).startDate, '2026-11-12');
  const sunday = ranges.resolveTrackingDateRange('this_week', '', '', Date.parse('2026-11-15T10:00:00+05:30'));
  assert.equal(sunday.startDate, '2026-11-09');
  const monday = ranges.resolveTrackingDateRange('last_week', '', '', Date.parse('2026-11-16T00:00:00+05:30'));
  assert.equal(monday.endDate, '2026-11-15');
  const january = ranges.resolveTrackingDateRange('last_month', '', '', Date.parse('2027-01-01T00:00:00+05:30'));
  assert.equal(january.startDate, '2026-12-01');
  assert.equal(january.endDate, '2026-12-31');
  const leap = ranges.resolveTrackingDateRange('last_month', '', '', Date.parse('2028-03-01T00:00:00+05:30'));
  assert.equal(leap.endDate, '2028-02-29');
  assert.equal(ranges.enumerateTrackingDates('2028-02-28', '2028-03-01').length, 3);
  assert.equal(ranges.enumerateTrackingDates('2026-02-31', '2026-03-02').length, 0);
  assert.equal(ranges.enumerateTrackingDates('2026-11-12', '2026-11-11').length, 0);
});

test('custom ranges preserve both endpoints and enumerate every included day', () => {
  const custom = ranges.resolveTrackingDateRange('custom', '2026-10-20', '2026-11-11', now);
  assert.equal(custom.startDate, '2026-10-20');
  assert.equal(custom.endDate, '2026-11-11');
  assert.equal(ranges.enumerateTrackingDates(custom.startDate, custom.endDate).length, 23);
});

test('90-day loading is bounded to two requests and repeat ranges reuse cached daily results', async () => {
  const mod = helpers();
  const selected = mod.resolveTrackingDateRange('last_90', '', '', now);
  const dates = mod.enumerateTrackingDates(selected.startDate, selected.endDate);
  let inFlight = 0;
  let peak = 0;
  let calls = 0;
  const snapshots = [];
  const fetchDaily = async (_, date) => {
    calls++;
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise(resolve => setTimeout(resolve, 1));
    inFlight--;
    return route(date);
  };
  const loaded = await mod.loadTrackingRange({ userId, dates, fetchDaily, concurrency: 20, onProgress: progress => snapshots.push(progress.completed) });
  assert.equal(loaded.completed, 90);
  assert.equal(Object.keys(loaded.entries).length, 90);
  assert.equal(peak, 2);
  assert.equal(calls, 90);
  assert.equal(snapshots[0], 0);
  assert.equal(snapshots.at(-1), 90);
  await mod.loadTrackingRange({ userId, dates, fetchDaily });
  assert.equal(calls, 90, 'Second visit to the same range must not download historical routes again');
});

test('active-day and range requests deduplicate, refresh works, and users never share cache entries', async () => {
  const mod = helpers();
  let calls = 0;
  const fetchDaily = async (id, date) => { calls++; await new Promise(resolve => setTimeout(resolve, 3)); return { ...route(date), userId: id }; };
  const a = mod.fetchTrackingDay(userId, '2026-11-09', fetchDaily);
  const b = mod.fetchTrackingDay(userId, '2026-11-09', fetchDaily);
  assert.equal((await a), (await b));
  assert.equal(calls, 1);
  await mod.fetchTrackingDay(userId, '2026-11-09', fetchDaily, { forceFresh: true });
  assert.equal(calls, 2);
  await mod.fetchTrackingDay('22222222-2222-4222-8222-222222222222', '2026-11-09', fetchDaily);
  assert.equal(calls, 3);
});

test('persisted pre-guard geometry stays stored but is not reused by the corrected playback', async () => {
  const date = '2026-11-09';
  const oldKey = `${userId}:${date}`;
  const stored = new Map([[oldKey, { key: oldKey, at: now, data: route(date, 99) }]]);
  const previousGuardKey = `gps-guard-v1:${oldKey}`;
  stored.set(previousGuardKey, { key: previousGuardKey, at: now, data: route(date, 2.54) });
  const previousActivityKey = `activity-v1:${oldKey}`;
  stored.set(previousActivityKey, { key: previousActivityKey, at: now, data: { ...route(date), visitsCount: 5 } });
  const reads = [];
  const db = { transaction: () => ({ objectStore: () => ({
    get(key) {
      reads.push(key);
      const request = {};
      queueMicrotask(() => { request.result = stored.get(key); request.onsuccess(); });
      return request;
    },
    put(record) { stored.set(record.key, record); },
  }) }) };
  const indexedDB = { open() {
    const request = { result: db };
    queueMicrotask(() => request.onsuccess());
    return request;
  } };
  const mod = helpers({ indexedDB });
  let calls = 0;
  const fetchDaily = async () => { calls++; return route(date, 2.55); };
  assert.equal((await mod.fetchTrackingDay(userId, date, fetchDaily, { now })).totalKm, 2.55);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.notEqual(reads[0], oldKey);
  assert.notEqual(reads[0], previousGuardKey);
  assert.notEqual(reads[0], previousActivityKey);
  assert.equal(stored.get(oldKey).data.totalKm, 99);
  assert.equal(stored.get(previousGuardKey).data.totalKm, 2.54);
  assert.equal(stored.get(previousActivityKey).data.visitsCount, 5);
  assert.equal(mod.peekTrackingDay(userId, date).totalKm, 2.55);
  assert.equal((await mod.fetchTrackingDay(userId, date, fetchDaily, { now })).totalKm, 2.55);
  assert.equal(calls, 1);
});

test('overlapping ranges and an active day share the same global two-request limit', async () => {
  const mod = helpers();
  let active = 0;
  let peak = 0;
  const fetchDaily = async (_, day) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    return route(day);
  };
  await Promise.all([
    mod.loadTrackingRange({ userId, dates: ['2026-11-01', '2026-11-02', '2026-11-03'], fetchDaily }),
    mod.loadTrackingRange({ userId, dates: ['2026-11-04', '2026-11-05', '2026-11-06'], fetchDaily }),
    mod.fetchTrackingDay(userId, '2026-11-07', fetchDaily),
  ]);
  assert.equal(peak, 2);
});

test('partial failures remain explicit and cancelled ranges stop publishing or starting new requests', async () => {
  const mod = helpers();
  const dates = ['2026-11-07', '2026-11-08', '2026-11-09'];
  const value = await mod.loadTrackingRange({ userId, dates, fetchDaily: async (_, date) => {
    if (date === dates[1]) throw new Error('Network unavailable');
    return route(date);
  } });
  assert.equal(value.entries[dates[1]].status, 'error');
  const summary = mod.summarizeTrackingRange(value.entries, dates);
  assert.equal(summary.loadedDays, 2);
  assert.equal(summary.failedDays, 1);
  assert.equal(summary.totalKm, 2.5);
  const controller = new AbortController();
  let calls = 0;
  const updates = [];
  const pending = helpers().loadTrackingRange({ userId, dates, signal: controller.signal, onProgress: item => updates.push(item.completed), fetchDaily: async (_, date) => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 8));
    return route(date);
  } });
  await new Promise(resolve => setTimeout(resolve, 1));
  controller.abort();
  const cancelled = await pending;
  assert.ok(cancelled.cancelled);
  assert.ok(calls <= 2);
  assert.deepEqual(updates, [0]);
});

test('range totals add existing daily values without mutating routes or events', () => {
  const first = route('2026-11-09', 4.69);
  const second = route('2026-11-10', 1.73);
  first.activityTimeline = [{ ...first.timeline[0], fullAddress: 'Address one' }, { type: 'travel', startTime: '2026-11-09T10:00:00+05:30', endTime: '2026-11-09T10:10:00+05:30', durationMins: 10, distanceKm: 4.69 }];
  first.visitsCount = 5;
  first.activityVisitsCount = 3;
  second.activityTimeline = [{ ...second.timeline[0], fullAddress: 'Address two' }];
  const entries = { [first.date]: { status: 'success', data: first }, [second.date]: { status: 'success', data: second } };
  const before = JSON.stringify(entries);
  const summary = ranges.summarizeTrackingRange(entries, [first.date, second.date]);
  assert.equal(summary.totalKm, 6.42);
  assert.equal(summary.visitsCount, 6, 'Raw submission totals stay available to existing callers');
  assert.equal(summary.activityVisitsCount, 4, 'Corrected daily counts sum independently with a legacy fallback');
  assert.equal(summary.timeline.length, 2);
  assert.equal(summary.activityTimeline.length, 3);
  assert.deepEqual(asJSON(summary.activityTimeline.map(event => event.trackingDate)), [first.date, first.date, second.date]);
  assert.equal(summary.activityTimeline[1].distanceKm, 4.69);
  assert.equal(summary.activityTimeline[2].fullAddress, 'Address two');
  assert.deepEqual(asJSON(summary.timeline.map(event => event.trackingDate)), [first.date, second.date]);
  assert.equal(summary.latest.date, second.date);
  assert.equal(JSON.stringify(entries), before);
  assert.equal(ranges.summarizeTrackingRange({}, [first.date]).totalKm, null);
  assert.equal(ranges.summarizeTrackingRange({}, [first.date]).activityVisitsCount, null);
});

test('map overview separates days, connectivity gaps and return legs without overnight lines', () => {
  const first = route('2026-11-09');
  const second = route('2026-11-10');
  second.polyline = [{ lat: 29, lng: 74 }, { lat: 29.1, lng: 74.1, isOffline: true }, { lat: 29.2, lng: 74.2 }, { lat: 29, lng: 74 }];
  const a = ranges.getTrackingOverviewRuns(first);
  const b = ranges.getTrackingOverviewRuns(second, { hasReturnTrip: true, turnaroundIdx: 2 });
  assert.equal(a.length, 1);
  assert.equal(b[0].kind, 'gap');
  assert.equal(b.at(-1).kind, 'return');
  for (const run of [...a, ...b]) {
    const original = run.date === first.date ? first.polyline : second.polyline;
    for (const [lat, lng] of run.coords) assert.ok(original.some(point => point.lat === lat && point.lng === lng));
  }
  assert.equal(first.polyline.at(-1).lat, 30.01);
  assert.equal(b[0].coords[0][0], 29, 'New day must start from its own coordinate');
});

test('range playback advances chronologically, waits for pending days and skips empty/failed dates', () => {
  const dates = ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'];
  const entries = { [dates[0]]: { status: 'success', data: route(dates[0]) }, [dates[2]]: { status: 'success', data: route(dates[2]) } };
  assert.equal(ranges.nextTrackingPlaybackDay(dates, entries, dates[0]).waiting, true);
  entries[dates[1]] = { status: 'error', data: null };
  assert.equal(ranges.nextTrackingPlaybackDay(dates, entries, dates[0]).date, dates[2]);
  entries[dates[3]] = { status: 'success', data: { ...route(dates[3]), polyline: [] } };
  assert.deepEqual(asJSON(ranges.nextTrackingPlaybackDay(dates, entries, dates[2])), { date: '', waiting: false });
});
