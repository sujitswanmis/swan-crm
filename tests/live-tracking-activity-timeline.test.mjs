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
function load(code, dependencies = {}, globals = {}) {
  const loaded = { exports: {} };
  vm.runInNewContext(code, { module: loaded, exports: loaded.exports, console, setTimeout, clearTimeout, AbortController,
    require: name => { if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected dependency: ${name}`); return dependencies[name]; }, ...globals });
  return loaded.exports;
}
const geometry = load(await compile('src/utils/routeGeometryMatcher.js'));
const activity = load(await compile('src/components/FieldForce/trackingActivityTimeline.js'), { '@/utils/routeGeometryMatcher': geometry });
const serverCode = await compile('src/app/actions/liveTracking.js');
const plain = value => JSON.parse(JSON.stringify(value));
const date = '2026-11-13';
const at = time => `${date}T${time}+05:30`;
const point = (time, offset, speed = 12) => ({ lat: 30, lng: 75 + offset * 0.001, time: at(time), speed, isSnapped: true });

test('travel rows use cleaned GPS geometry once even when visit and stoppage intervals overlap', () => {
  const timeline = [
    { type: 'punch_in', startTime: at('09:00:00') },
    { type: 'stoppage', startTime: at('09:00:00'), endTime: at('09:05:00'), durationMins: 5 },
    { type: 'visit', checkInTime: at('09:07:00'), checkOutTime: at('09:12:00'), durationMins: 5 },
    { type: 'visit', checkInTime: at('09:07:00'), checkOutTime: at('09:12:00'), durationMins: 5 },
  ];
  const polyline = [point('09:00:00', 0, 0), point('09:05:00', 0, 0), point('09:06:00', 1), point('09:07:00', 2),
    point('09:12:00', 2, 0), point('09:13:00', 3), point('09:14:00', 4)];
  const before = JSON.stringify({ timeline, polyline });
  const rows = activity.buildTrackingActivityTimeline({ date, timeline, polyline });
  const trips = rows.filter(row => row.type === 'travel');
  assert.equal(trips.length, 2);
  assert.equal(trips[0].startTime, new Date(at('09:05:00')).toISOString());
  assert.equal(trips[0].endTime, new Date(at('09:07:00')).toISOString());
  assert.equal(trips[1].startTime, new Date(at('09:12:00')).toISOString());
  assert.equal(trips[1].durationMins, 2);
  const meters = polyline.slice(1).reduce((sum, p, i) => sum + geometry.haversineMeters(polyline[i].lat, polyline[i].lng, p.lat, p.lng), 0);
  assert.ok(Math.abs(trips.reduce((sum, row) => sum + row.distanceKm * 1000, 0) - meters) < 0.01);
  assert.equal(rows.filter(row => row.type === 'visit').length, 2, 'Source submissions are not deleted or silently collapsed');
  assert.equal(JSON.stringify({ timeline, polyline }), before);
});

test('blind gaps are explicit with unknown distance; synced recorded movement remains travelled', () => {
  const gap = [point('09:00:00', 0), { ...point('09:20:00', 5), isOffline: true, isSnapped: false }];
  const rows = activity.buildTrackingActivityTimeline({ date, polyline: gap });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'signal_gap');
  assert.equal(rows[0].distanceKm, null);
  const synced = [point('09:00:00', 0), { ...point('09:01:00', 1), isOffline: true }];
  const recorded = activity.buildTrackingActivityTimeline({ date, polyline: synced });
  assert.equal(recorded[0].type, 'travel');
  assert.equal(recorded[0].offlineRecorded, true);
});

test('invalid fixes and IST midnight boundaries never generate connecting travel or overnight distance', () => {
  const polyline = [point('09:00:00', 0), { time: at('09:01:00'), lat: null, lng: null }, point('09:02:00', 2)];
  assert.equal(activity.buildTrackingActivityTimeline({ date, polyline }).length, 0);
  const overnight = [{ ...point('09:00:00', 0), time: '2026-11-12T23:59:30+05:30' }, point('00:00:30', 2)];
  assert.equal(activity.buildTrackingActivityTimeline({ date, polyline: overnight }).length, 0);
  assert.equal(activity.trackingActivityTimeMs('2026-11-13T09:00:00'), Date.parse(at('09:00:00')));
  assert.equal(activity.trackingActivityTimeMs('2026-11-13'), Date.parse(at('00:00:00')));
  assert.ok(Number.isNaN(activity.trackingActivityTimeMs('bad date')));
});

test('stationary heartbeats stay a stoppage instead of becoming fake travel', () => {
  const stop = { type: 'stoppage', startTime: at('09:00:00'), endTime: at('09:20:00'), durationMins: 20 };
  const polyline = [point('09:00:00', 0, 0), point('09:05:00', 0.1, 0), point('09:10:00', 0, 0), point('09:20:00', 0.1, 0)];
  const rows = activity.buildTrackingActivityTimeline({ date, timeline: [stop], polyline });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].durationMins, 20);
});

test('equal-time road vertices do not split one journey and its km reuse the authoritative daily tracked distance', () => {
  const polyline = [point('09:00:00', 0), point('09:01:00', 1), point('09:01:00', 1.1), point('09:02:00', 2)];
  const rows = activity.buildTrackingActivityTimeline({ date, polyline, trackedRoadKm: 0.2 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'travel');
  assert.equal(rows[0].durationMins, 2);
  assert.equal(rows[0].distanceKm, 0.2);
});

test('visit metadata uses the actual linked CHK code, customer, type, address and recorded coordinates', async () => {
  const visits = [{ id: 'visit-1', task_id: 'task-1', party_name: 'Customer A', form_data: { visit_type: 'Lead Pipeline' }, check_in_lat: 30, check_in_lng: 75 }];
  const tasks = [{ id: 'task-1', task_code: 'CHK-000001', party_address: 'NH12, West Bengal, 742101, India' }];
  const timeline = [{ type: 'visit', visitId: 'visit-1', checkInTime: at('09:00:00'), checkOutTime: at('09:12:00'), durationMins: 12 }];
  const before = JSON.stringify({ visits, tasks, timeline });
  const rows = await activity.enrichTrackingActivityTimeline({ date, timeline, visits, tasks, resolveAddress: () => { throw new Error('Task address should be reused'); } });
  assert.equal(rows[0].visitCode, 'CHK-000001');
  assert.equal(rows[0].partyName, 'Customer A');
  assert.equal(rows[0].visitType, 'Lead Pipeline');
  assert.equal(rows[0].fullAddress, tasks[0].party_address);
  assert.equal(rows[0].lat, 30);
  assert.equal(rows[0].durationMins, 12);
  assert.equal(JSON.stringify({ visits, tasks, timeline }), before);
});

test('three saved copies of one check-in display once using the latest checkout; every source record is preserved', async () => {
  const repeated = [2, 5, 1].map(second => ({ id: `repeat-${second}`, task_id: 'task-1', field_user_id: 'employee-1', party_name: 'Customer A',
    check_in_time: at('12:55:45'), check_out_time: at(`18:22:0${second}`), created_at: at(`18:22:0${second}`), duration_minutes: 326,
    form_data: second === 2 ? { notes: 'Same visit', nested: { b: 2, a: 1 } } : { nested: { a: 1, b: 2 }, notes: 'Same visit' } }));
  const visits = [...repeated, { id: 'unknown', check_in_time: at('12:55:45') },
    { id: 'another', task_id: 'task-2', check_in_time: at('22:11:46'), check_out_time: at('22:40:58'), party_name: 'Customer B' }];
  const timeline = visits.map(visit => ({ type: 'visit', visitId: visit.id, checkInTime: visit.check_in_time,
    checkOutTime: visit.check_out_time, durationMins: visit.duration_minutes }));
  const before = JSON.stringify({ visits, timeline });
  const rows = await activity.enrichTrackingActivityTimeline({ date, visits, timeline,
    tasks: [{ id: 'task-1', task_code: 'CHK-000001' }, { id: 'task-2', task_code: 'CHK-000002' }] });
  assert.equal(rows.filter(row => row.type === 'visit').length, 3);
  const grouped = rows.find(row => row.visitCode === 'CHK-000001');
  assert.equal(grouped.checkOutTime, at('18:22:05'));
  assert.equal(grouped.durationMins, 326);
  assert.equal(grouped.visitId, 'repeat-5');
  assert.equal(grouped.submissionCount, 3);
  assert.equal(rows.filter(row => row.visitCode === 'CHK-000001').length, 1);
  assert.equal(JSON.stringify({ visits, timeline }), before);
});

test('reused task codes with different check-ins, employees, tasks or business data remain separate visits', async () => {
  const base = { task_id: 'task-1', field_user_id: 'employee-1', party_name: 'Customer A', check_in_time: at('12:55:45'),
    check_out_time: at('18:22:01'), form_data: { outcome: 'Meeting completed' } };
  const visits = [
    { ...base, id: 'first' },
    { ...base, id: 'new-check-in', check_in_time: at('19:00:00'), check_out_time: at('19:20:00') },
    { ...base, id: 'new-employee', field_user_id: 'employee-2' },
    { ...base, id: 'new-task', task_id: 'task-2' },
    { ...base, id: 'new-form', form_data: { outcome: 'Order booked' } },
    { ...base, id: 'no-task', task_id: null },
    { ...base, id: 'no-check-in', check_in_time: null },
  ];
  const timeline = visits.map(visit => ({ type: 'visit', visitId: visit.id, checkInTime: visit.check_in_time, checkOutTime: visit.check_out_time }));
  const rows = await activity.enrichTrackingActivityTimeline({ date, visits, timeline,
    tasks: [{ id: 'task-1', task_code: 'CHK-000001' }, { id: 'task-2', task_code: 'CHK-000001' }] });
  assert.equal(rows.filter(row => row.type === 'visit').length, visits.length);
});

test('a later saved record with an invalid checkout cannot replace the latest valid checkout', async () => {
  const visits = [
    { id: 'valid', task_id: 'task', check_in_time: at('09:00:00'), check_out_time: at('09:12:00'), created_at: at('09:12:00') },
    { id: 'invalid', task_id: 'task', check_in_time: at('09:00:00'), check_out_time: null, created_at: at('09:13:00') },
  ];
  const rows = await activity.enrichTrackingActivityTimeline({ date, visits,
    timeline: visits.map(visit => ({ type: 'visit', visitId: visit.id, checkInTime: visit.check_in_time, checkOutTime: visit.check_out_time })) });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].checkOutTime, at('09:12:00'));
});

test('missing location and human identifiers remain unavailable, without UUID labels or invented coordinates', async () => {
  const uuid = '11111111-1111-4111-8111-111111111111';
  let lookups = 0;
  const rows = await activity.enrichTrackingActivityTimeline({ date,
    timeline: [{ type: 'visit', visitId: 'v', lat: 0, lng: 0 }],
    visits: [{ id: 'v', task_id: 't', party_name: uuid, check_in_lat: '0', check_in_lng: '0' }],
    tasks: [{ id: 't', task_code: uuid }], resolveAddress: async () => { lookups++; return 'Invented'; } });
  assert.equal(rows[0].visitCode, null);
  assert.equal(rows[0].partyName, '');
  assert.equal(rows[0].lat, null);
  assert.equal(rows[0].fullAddress, '');
  assert.equal(lookups, 0);
});

test('address lookups deduplicate coordinates, stay bounded to two workers and tolerate individual failures', async () => {
  let inFlight = 0, peak = 0, calls = 0;
  const timeline = Array.from({ length: 6 }, (_, i) => ({ type: 'stoppage', startTime: at(`09:0${i}:00`), lat: 30 + Math.floor(i / 2) * 0.01, lng: 75, locationName: 'Known landmark' }));
  const rows = await activity.enrichTrackingActivityTimeline({ date, timeline, resolveAddress: async lat => {
    calls++; inFlight++; peak = Math.max(peak, inFlight);
    await new Promise(resolve => setTimeout(resolve, 3));
    inFlight--;
    if (lat === 30.01) throw new Error('Temporary geocoder failure');
    return 'Road, District, State, 742101, India';
  } });
  assert.equal(calls, 3);
  assert.equal(peak, 2);
  assert.equal(rows[2].fullAddress, 'Known landmark');
  assert.equal(rows[0].fullAddress, 'Road, District, State, 742101, India');
});

function serverFixture({ taskError = false } = {}) {
  const userId = '11111111-1111-4111-8111-111111111111';
  const taskId = '22222222-2222-4222-8222-222222222222';
  const requests = [];
  const polyline = [point('09:00:00', 0), point('09:01:00', 1), point('09:02:00', 2)];
  const visits = [{ id: 'visit-1', task_id: taskId, field_user_id: userId, party_name: 'Customer A', connectivity_mode: 'PHYSICAL_VISIT',
    check_in_lat: 30, check_in_lng: 75, check_in_time: at('09:00:00'), check_out_time: at('09:12:00'), duration_minutes: 12 }];
  const datasets = { employee_live_locations: polyline.map(p => ({ latitude: p.lat, longitude: p.lng, speed_kmh: p.speed, accuracy_meters: 4, recorded_at: p.time })),
    field_form_submissions: visits, attendance_records: null, user_roles: null, user_sessions: [],
    field_tasks: [{ id: taskId, task_code: 'CHK-000042', party_name: 'Customer A', party_address: 'Recorded customer address, India' }] };
  const client = { from(table) {
    const entry = { table, filters: [] }; requests.push(entry);
    const query = { then: (resolve, reject) => Promise.resolve({ data: taskError && table === 'field_tasks' ? null : datasets[table],
      error: taskError && table === 'field_tasks' ? { message: 'Lookup unavailable' } : null }).then(resolve, reject) };
    for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'range', 'or', 'maybeSingle', 'limit', 'abortSignal']) query[method] = (...args) => { entry.filters.push([method, ...args]); return query; };
    return query;
  } };
  let geoCalls = 0;
  const server = load(serverCode, {
    '@supabase/supabase-js': { createClient: () => client }, '@/utils/supabase/server': {}, '@/utils/fieldTelemetryToken': {},
    '@/components/FieldForce/trackingActivityTimeline': activity,
    '@/utils/routeGeometryMatcher': { ...geometry, snapRouteSegmentsToRoad: async () => ({ polyline, totalDistanceMeters: 200, trackedRoadMeters: 200, offlineGapMeters: 0, hasSnappedRoad: true, routeCleaned: true }) },
  }, { process: { env: {} }, fetch: async () => { geoCalls++; return { ok: true, json: async () => ({
    address: { road: 'NH12', city: 'Berhampore', state: 'West Bengal', postcode: '742101', country: 'India' },
    display_name: 'NH12, Berhampore, West Bengal, 742101, India',
  }) }; } });
  return { server, requests, userId, taskId, geoCalls: () => geoCalls };
}

test('server timeline enrichment is opt-in, read-only and scoped to linked tasks for the selected employee', async () => {
  const f = serverFixture();
  const legacy = await f.server.getEmployee360Route(f.userId, date);
  assert.ok(!Object.hasOwn(legacy, 'activityTimeline'));
  assert.ok(!f.requests.some(request => request.table === 'field_tasks'));
  const enriched = await f.server.getEmployee360Route(f.userId, date, { rejectUnsupportedDetours: true, includeActivityDetails: true });
  const { activityTimeline, activityVisitsCount, ...core } = enriched;
  assert.deepEqual(plain(core), plain(legacy), 'Existing GPS metrics, visits, shift and timeline are unchanged');
  assert.equal(activityTimeline.find(row => row.type === 'visit').visitCode, 'CHK-000042');
  assert.equal(activityVisitsCount, 1);
  assert.equal(activityTimeline.filter(row => row.type === 'travel').length, 1);
  const taskRequest = f.requests.find(request => request.table === 'field_tasks');
  assert.ok(taskRequest.filters.some(filter => filter[0] === 'eq' && filter[1] === 'assigned_to_user_id' && filter[2] === f.userId));
  assert.ok(taskRequest.filters.some(filter => filter[0] === 'in' && filter[1] === 'id' && filter[2][0] === f.taskId));
});

test('metadata failure keeps GPS route available and full-address geocoding preserves the short-name default', async () => {
  const f = serverFixture({ taskError: true });
  const route = await f.server.getEmployee360Route(f.userId, date, { includeActivityDetails: true });
  assert.equal(route.totalKm, 0.2);
  const visit = route.activityTimeline.find(row => row.type === 'visit');
  assert.equal(visit.visitCode, null);
  assert.equal(visit.partyName, 'Customer A');
  assert.equal(visit.fullAddress, 'NH12, Berhampore, West Bengal, 742101, India');
  assert.equal(await f.server.resolveLocationName(30, 75), 'NH12, Berhampore');
  const calls = f.geoCalls();
  assert.equal(await f.server.resolveLocationName(30, 75, { fullAddress: true }), visit.fullAddress);
  assert.equal(f.geoCalls(), calls, 'Full address must reuse the geocoder cache');
});
