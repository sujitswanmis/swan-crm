import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const compile = async path => (await swc.transform(fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
  filename: path, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' },
})).code;
const geometryCode = await compile('src/utils/routeGeometryMatcher.js');
const actionCode = await compile('src/app/actions/liveTracking.js');
const activityCode = await compile('src/components/FieldForce/trackingActivityTimeline.js');

function load(code, dependencies = {}, globals = {}) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: name => {
    if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, console, setTimeout, clearTimeout, AbortController, ...globals });
  return loadedModule.exports;
}

const points = positions => positions.map((position, i) => ({
  lat: 30, lng: 75 + position * 0.001, speed: 24, accuracy_meters: 4, isOffline: false,
  time: new Date(Date.parse('2026-11-13T18:35:00+05:30') + i * 15000).toISOString(),
}));
const forward = points(Array.from({ length: 19 }, (_, i) => i));

function fixture({ loop = false, confidence = 0.9, fail = false, bend = false } = {}) {
  const calls = [];
  let geometry;
  geometry = load(geometryCode, {}, { fetch: async url => {
    calls.push(String(url));
    assert.ok(String(url).includes('/match/v1/driving/'), 'Never invent an OSRM /route fallback');
    const coords = String(url).split('/driving/')[1].split('?')[0].split(';').map(pair => pair.split(',').map(Number));
    let road = loop && coords[0][0] < 75.001
      ? [...coords.slice(0, 9), ...coords.slice(4, 8).reverse(), coords[9]]
      : coords;
    if (bend && coords[0][0] >= 75.001) road = [...coords.slice(0, 4), [(coords[3][0] + coords[4][0]) / 2, 30.0001], ...coords.slice(4)];
    const distance = road.slice(1).reduce((sum, point, index) =>
      sum + geometry.haversineMeters(road[index][1], road[index][0], point[1], point[0]), 0);
    return { ok: !fail, json: async () => fail ? { code: 'Error' } : {
      code: 'Ok', matchings: [{ confidence, distance, geometry: { coordinates: road } }],
    } };
  } });
  return { geometry, calls };
}

test('Field Force rejects a near-zero-confidence carriageway loop even when full-trip distance passes the old limit', async () => {
  const { geometry, calls } = fixture({ loop: true, confidence: 2.5e-13, bend: true });
  const original = JSON.stringify(forward);
  const legacy = await geometry.snapRouteSegmentsToRoad(forward);
  const guarded = await geometry.snapRouteSegmentsToRoad(forward, { rejectUnsupportedDetours: true });
  assert.equal(legacy.hasSnappedRoad, true, 'Existing callers retain their default behavior');
  assert.equal(guarded.hasSnappedRoad, true, 'Verified chunks retain their road geometry');
  assert.ok(legacy.totalDistanceMeters > guarded.totalDistanceMeters + 600);
  assert.ok(guarded.polyline.some(point => point.isSnapped && point.lat === 30.0001), 'The valid road bend is not replaced by a straight GPS chord');
  assert.ok(guarded.polyline.some(point => !point.isSnapped));
  assert.ok(guarded.polyline.every((point, index, all) => index === 0 || point.lng >= all[index - 1].lng), 'One-way GPS travel must not gain an invented reverse leg');
  assert.equal(JSON.stringify(forward), original, 'GPS records are never mutated');
  assert.equal(calls.length, 4, 'Guarded requests cannot reuse unvalidated legacy OSRM cache entries');
});

test('a confident but excessive invented detour also falls back to recorded GPS', async () => {
  const { geometry } = fixture({ loop: true, confidence: 0.95 });
  const result = await geometry.snapRouteSegmentsToRoad(forward, { rejectUnsupportedDetours: true });
  assert.equal(result.hasSnappedRoad, true);
  assert.ok(result.polyline.every((point, index, all) => index === 0 || point.lng >= all[index - 1].lng));
});

test('an entirely unsupported road match uses the GPS trace without altering its timestamps or speed', async () => {
  const { geometry } = fixture({ loop: true, confidence: 0 });
  const trip = forward.slice(0, 10);
  const result = await geometry.snapRouteSegmentsToRoad(trip, { rejectUnsupportedDetours: true });
  assert.equal(result.hasSnappedRoad, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.polyline)), trip.map(point => ({ ...point, isSnapped: false })));
});

test('displaced 15–25m zero-speed network fixes cannot pull a sharp moving GPS trace off the road', async () => {
  const { geometry } = fixture();
  const sharp = points([0, 2, 4, 6, 8]);
  const noisy = sharp.flatMap((point, index) => index > 0 && index < 4 ? [{
    ...point, lat: 30.0005, speed: 0, accuracy_meters: [0, 15, 21, 23][index],
    time: new Date(Date.parse(point.time) - 350).toISOString(),
  }, point] : [point]);
  const before = JSON.stringify(noisy);
  assert.ok(geometry.stripNoisyGpsOutliers(noisy).some(point => point.lat === 30.0005), 'Fixture reproduces the surviving legacy spikes');
  const filtered = geometry.stripNoisyGpsOutliers(noisy, { rejectUnsupportedDetours: true });
  assert.deepEqual(JSON.parse(JSON.stringify(filtered)), sharp);
  const result = await geometry.snapRouteSegmentsToRoad(noisy, { rejectUnsupportedDetours: true });
  assert.equal(result.hasSnappedRoad, true);
  assert.ok(result.polyline.every(point => point.lat === 30));
  assert.equal(JSON.stringify(noisy), before);
});

test('stationary dwell times, accurate turns and fixes without nearby sharp evidence are preserved', () => {
  const { geometry } = fixture();
  const dwell = points([0, 0, 0]).map((point, index) => ({ ...point, speed: 0, accuracy_meters: index === 1 ? 21 : 4 }));
  assert.deepEqual(JSON.parse(JSON.stringify(geometry.stripNoisyGpsOutliers(dwell, { rejectUnsupportedDetours: true }))), dwell);
  const sparse = points([0, 1, 2]).map(point => ({ ...point, accuracy_meters: 21 }));
  assert.deepEqual(JSON.parse(JSON.stringify(geometry.stripNoisyGpsOutliers(sparse, { rejectUnsupportedDetours: true }))), sparse);
  const turn = points([0, 1, 2]);
  turn[1].lat = 30.0005;
  assert.deepEqual(JSON.parse(JSON.stringify(geometry.stripNoisyGpsOutliers(turn, { rejectUnsupportedDetours: true }))), turn);
});

test('supported one-way and genuine out-and-back trips keep their recorded direction and road snapping', async () => {
  for (const trip of [forward, points([0, 1, 2, 3, 4, 3, 2, 1, 0])]) {
    const { geometry, calls } = fixture();
    const result = await geometry.snapRouteSegmentsToRoad(trip, { rejectUnsupportedDetours: true });
    assert.equal(result.hasSnappedRoad, true);
    assert.deepEqual(Array.from(result.polyline, point => Number(point.lng.toFixed(3))), trip.map(point => point.lng));
    const requests = calls.length;
    await geometry.snapRouteSegmentsToRoad(trip, { rejectUnsupportedDetours: true });
    assert.equal(calls.length, requests, 'Validated OSRM chunks remain cached');
  }
});

test('low confidence alone does not reject matching geometry without an added detour', async () => {
  const { geometry } = fixture({ confidence: 0 });
  assert.equal((await geometry.snapRouteSegmentsToRoad(forward, { rejectUnsupportedDetours: true })).hasSnappedRoad, true);
});

test('network failures and blind offline gaps preserve recorded points without fabricating road travel', async () => {
  const { geometry } = fixture({ fail: true });
  const failed = await geometry.snapRouteSegmentsToRoad(forward, { rejectUnsupportedDetours: true });
  assert.equal(failed.hasSnappedRoad, false);
  assert.equal(failed.polyline.length, forward.length);
  const gap = fixture();
  const trip = points([0, 20]);
  trip[1].time = '2026-11-13T19:00:00+05:30';
  const result = await gap.geometry.snapRouteSegmentsToRoad(trip, { rejectUnsupportedDetours: true });
  assert.equal(gap.calls.length, 0);
  assert.equal(result.polyline[1].isOffline, true);
  assert.ok(result.offlineGapMeters > 1000);
});

test('daily server action keeps legacy default and passes the explicit Field Force guard without changing its response contract', async () => {
  const { geometry } = fixture();
  const trip = forward.slice(0, 3);
  const records = trip.map(point => ({ latitude: point.lat, longitude: point.lng, recorded_at: point.time,
    speed_kmh: point.speed, accuracy_meters: point.accuracy_meters, is_offline_synced: false }));
  const client = { from(table) {
    const result = { data: table === 'employee_live_locations' ? records : table === 'attendance_records' || table === 'user_roles' ? null : [], error: null };
    const query = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'range', 'or', 'maybeSingle', 'limit']) query[method] = () => query;
    return query;
  } };
  const options = [];
  const action = load(actionCode, {
    '@supabase/supabase-js': { createClient: () => client },
    '@/utils/supabase/server': {}, '@/utils/fieldTelemetryToken': {},
    '@/components/FieldForce/trackingActivityTimeline': load(activityCode, { '@/utils/routeGeometryMatcher': geometry }),
    '@/utils/routeGeometryMatcher': { ...geometry, snapRouteSegmentsToRoad: async (polyline, option) => {
      options.push(option);
      return { polyline, totalDistanceMeters: 200, trackedRoadMeters: 200, offlineGapMeters: 0, hasSnappedRoad: true, routeCleaned: true };
    } },
  }, { process: { env: {} } });
  const userId = '11111111-1111-4111-8111-111111111111';
  const legacy = await action.getEmployee360Route(userId, '2026-11-13');
  const guarded = await action.getEmployee360Route(userId, '2026-11-13', { rejectUnsupportedDetours: true });
  assert.deepEqual(options.map(option => option.rejectUnsupportedDetours), [false, true]);
  assert.deepEqual(Object.keys(guarded).sort(), Object.keys(legacy).sort());
  assert.equal(guarded.totalKm, legacy.totalKm);
  assert.equal(guarded.date, '2026-11-13');
});
