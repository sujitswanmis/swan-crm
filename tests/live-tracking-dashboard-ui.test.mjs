import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const icons = new Proxy({}, { get: () => props => React.createElement('svg', { ...props, 'aria-hidden': true }) });
const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };

async function compile(path) {
  const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  return (await swc.transform(source, {
    filename: path,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } },
    module: { type: 'commonjs' },
  })).code;
}

function load(code, dependencies, globals = {}) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, {
    module: loadedModule, exports: loadedModule.exports, console, URL, AbortController, setTimeout, clearTimeout,
    ...globals,
    require: name => {
      if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return loadedModule.exports;
}

const uiCode = await compile('src/components/FieldForce/FieldTrackingDashboardUI.jsx');
const datePickerCode = await compile('src/components/common/DateRangePicker.jsx');
const datePicker = load(datePickerCode, { react: React, 'lucide-react': icons });
const rangeCode = await compile('src/components/FieldForce/trackingDateRanges.js');
const rangeHelpers = load(rangeCode, {});
const deviceStatusHelpers = load(await compile('src/components/FieldForce/trackingDeviceStatus.js'), {});
const ui = load(uiCode, { react: React, 'lucide-react': icons, './LiveTrackingDashboard.module.css': css, '@/components/common/DateRangePicker': datePicker, './trackingDateRanges': rangeHelpers });
const matcher = load(await compile('src/utils/routeGeometryMatcher.js'), {});
const mapCode = await compile('src/components/Attendance/LiveFieldTrackingMap.jsx');
const pureReact = {
  ...React,
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useRef: initial => ({ current: initial }),
  useMemo: fn => fn(),
  useCallback: fn => fn,
  useEffect: () => {},
};
const map = load(`${mapCode}\nmodule.exports.deviceStatusForTest = computeEmployeeLiveDeviceStatus;`, {
  react: pureReact,
  'lucide-react': icons,
  '@/app/actions/liveTracking': {},
  '@/app/actions/team': {},
  '@/utils/tableColumnResize': { __esModule: true, default: () => ({ colWidths: {} }), ColumnResizer: () => null },
  '@/components/common/StandardTablePagination': () => null,
  '@/utils/routeGeometryMatcher': matcher,
  '@/utils/branchAccess': load(await compile('src/utils/branchAccess.js'), {}),
  '@/components/FieldForce/FieldTrackingDashboardUI': ui,
  '@/components/FieldForce/LiveTrackingDashboard.module.css': css,
  '@/components/FieldForce/trackingDateRanges': rangeHelpers,
  '@/components/FieldForce/trackingDeviceStatus': deviceStatusHelpers,
});

const html = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const unwrap = Component => Component.type || Component;
const find = (tree, predicate) => {
  if (!tree || typeof tree !== 'object') return undefined;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props?.children)) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return undefined;
};
const now = new Date('2026-11-11T15:00:00.000Z').getTime();
const date = '2026-11-11';
const freshData = {
  userId: '11111111-1111-4111-8111-111111111111', date,
  totalKm: 4.69, visitsCount: 0, totalPings: 2,
  lastPing: { recorded_at: '2026-11-11T14:59:35.000Z', latitude: 30.9, longitude: 75.92, speed_kmh: 41, battery_pct: 45 },
  polyline: [
    { lat: 30.9, lng: 75.92, time: '2026-11-11T04:40:00.000Z', speed: 0 },
    { lat: 30.91, lng: 75.93, time: '2026-11-11T04:45:00.000Z', speed: 41 },
  ],
  timeline: [{ type: 'stoppage', startTime: '2026-11-10T18:40:00.000Z', endTime: '2026-11-11T04:36:00.000Z', durationMins: 596, locationName: 'Focal Point', lat: 30.9, lng: 75.92 }],
};
const freshStatus = map.deviceStatusForTest(freshData, date, now);

test('stale Ready badge becomes Status outdated with last report time, while fresh denied permission stays Online', () => {
  const health = { platform: 'Android App', status: 'HEALTHY', shortLabel: 'Ready', versionCode: 5,
    issueSummary: 'All permissions, battery, and APK version healthy',
    lastCheckedAt: new Date(now - 240000).toISOString(), hasForegroundLocation: true, hasBackgroundLocation: true, gpsProviderEnabled: true };
  const status = deviceStatusHelpers.deriveTrackingDeviceStatus(freshStatus, freshData, health, now);
  const output = html(ui.TrackingActivityPanel, { data: freshData, status, health });
  assert.match(output, /Status outdated · APK v5/);
  assert.match(output, /Last device report:.*IST/);
  assert.match(output, /Current permissions unconfirmed/);
  assert.doesNotMatch(output, /Ready|All permissions, battery, and APK version healthy/);
  const denied = { ...health, status: 'NEEDS_PERMISSION_FIX', shortLabel: 'Fix Permissions', issueSummary: 'Location permission denied',
    hasForegroundLocation: false, hasBackgroundLocation: false, lastCheckedAt: new Date(now - 1000).toISOString() };
  const updated = deviceStatusHelpers.deriveTrackingDeviceStatus(freshStatus, freshData, denied, now);
  const fresh = html(ui.TrackingActivityPanel, { data: freshData, status: updated, health: denied });
  assert.match(fresh, />Online</);
  assert.match(fresh, /Location permission denied/);
  assert.match(fresh, /Fix Permissions · APK v5/);
  assert.doesNotMatch(fresh, /Status outdated/);
  const archive = html(ui.TrackingActivityPanel, { data: freshData, status: { ...freshStatus, isToday: false }, health });
  assert.match(archive, /Ready · APK v5/);
});

test('permission denied and device switch OFF have separate GPS labels while fresh mobile heartbeat stays Online', () => {
  const health = { platform: 'Android App', lastCheckedAt: new Date(now - 10000).toISOString(), hasForegroundLocation: true, hasBackgroundLocation: true, gpsProviderEnabled: true };
  for (const [patch, expected] of [[{ hasForegroundLocation: false }, 'Location permission denied'], [{ gpsProviderEnabled: false }, 'Device GPS OFF'], [{ hasBackgroundLocation: false }, 'Background location restricted']]) {
    const status = deviceStatusHelpers.deriveTrackingDeviceStatus(freshStatus, freshData, { ...health, ...patch }, now);
    const summary = html(ui.TrackingSummary, { data: freshData, status });
    const panel = html(ui.TrackingActivityPanel, { data: freshData, status, employee: { name: 'Executive' } });
    assert.match(summary, new RegExp(expected));
    assert.match(panel, />Online</);
    assert.match(panel, new RegExp(expected));
    const latest = html(ui.TrackingPositionInfo, { mode: 'latest', data: freshData, status, date });
    assert.match(latest, new RegExp(expected));
    assert.doesNotMatch(latest, /Live online/);
    const replay = html(ui.TrackingPositionInfo, { mode: 'playback', data: freshData, status, date });
    assert.match(replay, /Historical playback/);
  }
});

test('IST formatting and human-readable duration preserve long recorded stops', () => {
  for (const [minutes, expected] of [[596, '9h 56m'], [391, '6h 31m'], [157, '2h 37m'], [60, '1h'], [0, '0m']]) {
    assert.equal(ui.formatTrackingDuration(minutes), expected);
  }
  for (const missing of [null, undefined, '', NaN, -1]) assert.equal(ui.formatTrackingDuration(missing), 'Unavailable');
  assert.match(ui.formatTrackingTime('2026-11-11T04:41:00Z'), /10:11.*AM/);
  assert.equal(ui.formatTrackingTime('invalid'), 'Unavailable');
  assert.match(ui.formatTrackingDate('2026-11-11'), /11 Nov 2026/);
});

test('actual tracking model distinguishes fresh GPS, stale GPS, ended shifts and history', () => {
  assert.equal(ui.getTrackingStatus(freshStatus).label, 'GPS active');
  const stale = map.deviceStatusForTest({ ...freshData, lastPing: { recorded_at: '2026-11-11T14:00:00Z' } }, date, now);
  assert.equal(ui.getTrackingStatus(stale).label, 'Last known location');
  const ended = map.deviceStatusForTest({ ...freshData, shiftCompleted: true, punchOutTime: '2026-11-11T14:29:00Z' }, date, now);
  assert.equal(ui.getTrackingStatus(ended).label, 'Shift ended');
  const historical = map.deviceStatusForTest(freshData, '2026-11-10', now);
  assert.equal(ui.getTrackingStatus(historical).label, 'Historical record');
  const offlineSync = map.deviceStatusForTest({ ...freshData, lastPing: { ...freshData.lastPing, is_offline_synced: true } }, date, now);
  assert.equal(ui.getTrackingStatus(offlineSync).label, 'Last known location');
});

test('playback never borrows live status or latest speed from the current device', () => {
  const output = html(ui.TrackingPositionInfo, { mode: 'playback', data: freshData, status: freshStatus, point: freshData.polyline[0], date });
  assert.match(output, /Historical playback/);
  assert.match(output, /Speed at playback position/);
  assert.match(output, /0 km\/h/);
  assert.doesNotMatch(output, /Live online|41 km\/h/);
});

test('map position card stays compact with optional GPS details collapsed initially', () => {
  const output = html(ui.TrackingPositionInfo, { mode: 'playback', data: { ...freshData, isRoadSnapped: true }, status: freshStatus, point: freshData.polyline[0], date });
  assert.match(output, /Show GPS position details/);
  assert.match(output, /aria-expanded="false"/);
  assert.match(output, /Historical playback/);
  assert.match(output, /0 km\/h/);
  assert.doesNotMatch(output, /OSRM road snapped/);
});

test('latest mode uses the actual latest GPS timestamp and speed; ended shifts are not live', () => {
  const output = html(ui.TrackingPositionInfo, { mode: 'latest', data: freshData, status: freshStatus, date });
  assert.match(output, /Live online/);
  assert.match(output, /41 km\/h/);
  assert.match(output, /08:29.*PM/);
  const ended = { ...freshStatus, isShiftCompleted: true };
  const history = html(ui.TrackingPositionInfo, { mode: 'latest', data: freshData, status: ended, date });
  assert.match(history, /Shift ended/);
  assert.doesNotMatch(history, /Live online/);
});

test('summary preserves zero values and displays unavailable values without fabricated metrics', () => {
  const output = html(ui.TrackingSummary, { data: freshData, status: freshStatus });
  assert.match(output, /4\.69 km/);
  assert.match(output, />0<\/strong>/);
  assert.match(output, /9h 56m across recorded stops/);
  assert.match(output, /45%/);
  const empty = html(ui.TrackingSummary, { data: null, status: null });
  assert.match(empty, /Tracking unavailable/);
  assert.doesNotMatch(empty, /0\.00 km|undefined|NaN/);
  assert.doesNotThrow(() => html(ui.TrackingSummary, { data: { lastPing: { recorded_at: 'invalid' } }, status: null }));
});

test('Client visits uses the grouped activity count while preserving raw legacy counts and zero', () => {
  for (const [data, count] of [
    [{ visitsCount: 5, activityVisitsCount: 3 }, 3],
    [{ visitsCount: 5, activityVisitsCount: 0 }, 0],
    [{ visitsCount: 5 }, 5],
  ]) {
    const output = html(ui.TrackingSummary, { data, status: null });
    assert.match(output, new RegExp(`Client visits<\\/div><strong[^>]*>${count}<\\/strong>`));
  }
});

test('timeline preserves order, event meaning, coordinates and source duration', () => {
  const data = { timeline: [
    { type: 'punch_in', startTime: freshData.timeline[0].startTime, lat: 30.9, lng: 75.92 },
    freshData.timeline[0],
    { type: 'visit', checkInTime: '2026-11-11T05:00:00Z', checkOutTime: '2026-11-11T05:30:00Z', durationMins: 30, partyName: 'Client A', lat: 30.91, lng: 75.93 },
    { type: 'punch_out', startTime: '2026-11-11T14:29:00Z', lat: 30.9, lng: 75.92 },
  ] };
  const before = JSON.stringify(data);
  const output = html(ui.TrackingActivityPanel, { data, expanded: true, onSelectEvent() {}, status: freshStatus });
  assert.match(output, /Stoppage of 09:56/);
  assert.match(output, /Client A/);
  assert.ok(output.indexOf('Punch in') < output.indexOf('Stoppage'));
  assert.ok(output.indexOf('Stoppage') < output.indexOf('Client visit'));
  assert.ok(output.indexOf('Client visit') < output.indexOf('Punch out'));
  assert.equal(JSON.stringify(data), before);
  let selected;
  const tree = unwrap(ui.TrackingActivityPanel)({ data, onSelectEvent: (event, index) => { selected = [event, index]; } });
  const button = find(tree, node => node.props?.['aria-label']?.startsWith('Stoppage,'));
  button.props.onClick();
  assert.equal(selected[0], freshData.timeline[0]);
  assert.equal(selected[1], 1);
});

test('rich timeline shows actual visit code, customer, type, full address, exact IST times and travel distance', () => {
  const events = [
    { type: 'stoppage', startTime: '2026-11-13T04:30:00Z', endTime: '2026-11-13T04:42:00Z', durationMins: 12, fullAddress: 'NH12, Berhampore, Murshidabad, West Bengal, 742101, India' },
    { type: 'travel', startTime: '2026-11-13T05:28:31Z', endTime: '2026-11-13T06:17:25Z', durationMins: 48, distanceKm: 14.39, lat: 30, lng: 75 },
    { type: 'visit', visitCode: 'CHK-41275', partyName: 'Truvox Private Limited', visitType: 'Visit', checkInTime: '2026-11-13T05:16:09Z', checkOutTime: '2026-11-13T05:28:31Z', durationMins: 12, fullAddress: 'NH12, West Bengal, 742101, India', lat: 30, lng: 75 },
  ];
  const output = html(ui.TrackingActivityPanel, { data: { timeline: [], activityTimeline: events }, expanded: true });
  for (const label of ['Stoppage of 00:12', 'Travelled (14.39 km)', '10:58:31', '11:47:25', '(00:48)', 'CHK-41275', 'Truvox Private Limited', 'Type: ', '742101, India', '3 events · IST']) assert.ok(output.includes(label), label);
  assert.doesNotMatch(output, /PHYSICAL_VISIT|until/);
  assert.equal(ui.formatActivityTime('2026-11-13T10:58:31'), '10:58:31', 'Timezone-free activity fields are interpreted as IST');
  assert.equal(ui.formatActivityTime('2026-11-12T18:30:00Z'), '00:00:00');
  assert.equal(ui.formatActivityDuration(1500), '25:00');
  assert.equal(ui.formatActivityDuration(null), 'Unavailable');
  assert.notEqual(map.computeRouteSignature({ ...freshData, activityTimeline: events }), map.computeRouteSignature({ ...freshData, activityTimeline: events.map(event => ({ ...event, fullAddress: 'Updated address' })) }));
});

test('timeline day separators, missing metadata and signal gaps remain explicit without UUID exposure or fake distance', () => {
  const uuid = '11111111-1111-4111-8111-111111111111';
  const events = [
    { type: 'visit', visitCode: uuid, partyName: uuid, checkInTime: '2026-11-12T10:00:00+05:30', durationMins: null, lat: 0, lng: 0, trackingDate: '2026-11-12' },
    { type: 'signal_gap', startTime: '2026-11-13T10:00:00+05:30', endTime: '2026-11-13T11:00:00+05:30', durationMins: 60, trackingDate: '2026-11-13' },
  ];
  const output = html(ui.TrackingActivityPanel, { data: { activityTimeline: events }, rangeMode: true });
  for (const label of ['12 Nov 2026', '13 Nov 2026', 'Customer unavailable', 'Address unavailable', 'Checkout time unavailable', 'GPS signal gap', 'Distance unavailable']) assert.ok(output.includes(label), label);
  assert.doesNotMatch(output, /11111111-1111|0\.00 km|undefined|NaN/);
  assert.match(output, /timelineEvent" disabled=""/);
});

test('playback controls dispatch play, reset, seek and all supported speeds', () => {
  const calls = [];
  const tree = unwrap(ui.TrackingPlaybackControls)({ playing: false, speed: 2, index: 1, total: 5, time: freshData.polyline[0].time, endTime: freshData.polyline[1].time,
    onToggle: () => calls.push('play'), onReset: () => calls.push('reset'), onSeek: value => calls.push(value), onSpeed: value => calls.push(`${value}x`) });
  find(tree, node => node.props?.['aria-label'] === 'Play route playback').props.onClick();
  find(tree, node => node.props?.['aria-label'] === 'Reset route playback').props.onClick();
  const slider = find(tree, node => node.type === 'input');
  slider.props.onChange({ target: { value: '3' } });
  let stopped = false;
  slider.props.onPointerDown({ stopPropagation() { stopped = true; } });
  assert.ok(stopped);
  for (const value of [1, 2, 5]) find(tree, node => node.props?.['aria-label'] === `Playback speed ${value}x`).props.onClick();
  assert.deepEqual(calls, ['play', 'reset', 3, '1x', '2x', '5x']);
  assert.equal(find(tree, node => node.props?.['aria-label'] === 'Playback speed 2x').props['aria-pressed'], true);
});

test('All Routes, Going and Return remain visible on one-way days without inventing a return leg', () => {
  const output = html(ui.TrackingRouteDock, { hasReturn: false, filter: 'ALL', onFilter() {} });
  assert.match(output, />All Routes<\/button>/);
  assert.match(output, />Going<\/button>/);
  assert.match(output, /data-leg="RETURN"[^>]*disabled=""[^>]*No return trip recorded for this day[^>]*>Return<\/button>/);
  const calls = [];
  const tree = load(uiCode, { react: pureReact, 'lucide-react': icons, './LiveTrackingDashboard.module.css': css,
    '@/components/common/DateRangePicker': datePicker, './trackingDateRanges': rangeHelpers });
  const dock = unwrap(tree.TrackingRouteDock)({ hasReturn: true, filter: 'RETURN', onFilter: value => calls.push(value) });
  for (const id of ['ALL', 'GOING', 'RETURN']) {
    const button = find(dock, node => node.props?.['data-leg'] === id);
    assert.equal(button.props.disabled, false);
    button.props.onClick();
  }
  assert.deepEqual(calls, ['ALL', 'GOING', 'RETURN']);
  assert.equal(find(dock, node => node.props?.['data-leg'] === 'RETURN').props['aria-pressed'], true);
});

test('empty routes disable play and seeking while navigation remains available', () => {
  const output = html(ui.TrackingPlaybackControls, { playing: false, speed: 1, index: 0, total: 0 });
  assert.match(output, /disabled="" aria-label="Play route playback"/);
  assert.match(output, /type="range"[^>]+disabled=""/);
  const header = html(ui.TrackingHeader, { employees: [], date, tab: '360_PLAYBACK' });
  for (const label of ['360° Route &amp; Playback', 'All-India Cluster Radar', 'Daily TA/DA Vouchers']) assert.ok(header.includes(label));
});

test('dashboard is opt-in: Attendance retains the legacy view by default', () => {
  const legacy = renderToStaticMarkup(map.default({}));
  const modern = renderToStaticMarkup(map.default({ presentation: 'field-force' }));
  assert.doesNotMatch(legacy, /aria-label="Tracking summary"/);
  assert.match(modern, /aria-label="Tracking summary"/);
  assert.match(modern, /aria-label="Map position mode"/);
  assert.match(legacy, /Field Force 360° Radar &amp; Live Tracking/);
  assert.match(legacy, /VISIT &amp; STOPPAGE TIMELINE/);
  const shell = fs.readFileSync(new URL('../src/components/CRMContainer.jsx', import.meta.url), 'utf8');
  assert.equal((shell.match(/presentation="field-force"/g) || []).length, 1);
});

test('shared CRM date picker is reused with the selected date range', () => {
  const tree = unwrap(ui.TrackingDatePicker);
  const output = html(ui.TrackingDatePicker, { range: { preset: 'custom', startDate: '2026-11-01', endDate: '2026-11-09' } });
  assert.match(output, /2026-11-09/);
  assert.match(output, /2026-11-01/);
  assert.match(output, /Date range totals/);
  assert.match(output, /Click to choose a date range/);
  assert.doesNotMatch(output, /type="date"/);
  assert.equal(typeof tree, 'function');
});

test('tracking date selection dispatches complete ranges and rejects invalid input', () => {
  const calls = [];
  const change = value => calls.push(value);
  for (const preset of ['today', 'yesterday', 'custom']) {
    assert.equal(ui.applyTrackingDateSelection({ preset, startDate: '2026-11-09', endDate: '2026-11-09' }, change), '');
  }
  assert.deepEqual(calls.map(item => item.startDate), ['2026-11-09', '2026-11-09', '2026-11-09']);
  assert.equal(ui.applyTrackingDateSelection({ startDate: '2026-11-01', endDate: '2026-11-09' }, change), '');
  assert.equal(calls[3].endDate, '2026-11-09');
  assert.match(ui.applyTrackingDateSelection({}, change), /valid start and end/);
  assert.match(ui.applyTrackingDateSelection({ startDate: '2026-02-31', endDate: '2026-02-31' }, change), /valid start and end/);
  assert.match(ui.applyTrackingDateSelection({ startDate: '2026-11-09', endDate: '2026-11-01' }, change), /on or before/);
  assert.equal(calls.length, 4, 'Rejected dates must not change the selected GPS range');
});

test('preset labels follow IST midnight and month/year boundaries through the shared resolver', () => {
  for (const [instant, today, yesterday] of [
    ['2026-11-11T18:29:59.000Z', '2026-11-11', '2026-11-10'],
    ['2026-11-11T18:30:00.000Z', '2026-11-12', '2026-11-11'],
    ['2026-12-31T18:30:00.000Z', '2027-01-01', '2026-12-31'],
    ['2026-02-28T18:30:00.000Z', '2026-03-01', '2026-02-28'],
  ]) {
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [instant])); }
      static now() { return new NativeDate(instant).getTime(); }
    }
    const fixedRanges = load(rangeCode, {}, { Date: FixedDate });
    const fixedUI = load(uiCode, { react: React, 'lucide-react': icons, './LiveTrackingDashboard.module.css': css, '@/components/common/DateRangePicker': datePicker, './trackingDateRanges': fixedRanges });
    assert.equal(fixedUI.getTrackingDatePreset(today), 'today', instant);
    assert.equal(fixedUI.getTrackingDatePreset(yesterday), 'yesterday', instant);
    assert.equal(fixedUI.getTrackingDatePreset('2025-01-01'), 'custom');
  }
});
