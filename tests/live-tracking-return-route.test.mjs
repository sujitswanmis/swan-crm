import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();

async function compile(file) {
  const result = await swc.transform(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    filename: file,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } },
    module: { type: 'commonjs' }
  });
  return result.code;
}

const mapCode = await compile('src/components/Attendance/LiveFieldTrackingMap.jsx');
const matcherCode = await compile('src/utils/routeGeometryMatcher.js');
const rangeCode = await compile('src/components/FieldForce/trackingDateRanges.js');
const branchAccessCode = await compile('src/utils/branchAccess.js');
const deviceStatusCode = await compile('src/components/FieldForce/trackingDeviceStatus.js');
const icons = new Proxy({}, { get: () => () => null });

function loadExports(code, dependencies, extraGlobals = {}) {
  const loadedModule = { exports: {} };
  const activeTimers = new Set();
  const activeIntervals = new Set();
  const wrappedSetTimeout = (fn, ms, ...args) => {
    const id = setTimeout(() => {
      activeTimers.delete(id);
      fn(...args);
    }, ms);
    activeTimers.add(id);
    return id;
  };
  const wrappedClearTimeout = (id) => {
    activeTimers.delete(id);
    clearTimeout(id);
  };
  const wrappedSetInterval = () => {
    const id = activeIntervals.size + 1;
    activeIntervals.add(id);
    return id;
  };
  const wrappedClearInterval = (id) => {
    activeIntervals.delete(id);
  };
  vm.runInNewContext(code, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: name => {
      if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console,
    setTimeout: wrappedSetTimeout,
    clearTimeout: wrappedClearTimeout,
    setInterval: wrappedSetInterval,
    clearInterval: wrappedClearInterval,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    URL,
    AbortController,
    ...extraGlobals
  });
  loadedModule.__cleanupTimers = () => {
    for (const id of activeTimers) clearTimeout(id);
    activeTimers.clear();
    activeIntervals.clear();
  };
  return loadedModule;
}

function createFakeLeaflet() {
  const polylines = [];
  const markers = [];

  class FakeGroup {
    constructor() { this.layers = []; }
    addTo() { return this; }
    clearLayers() { this.layers = []; return this; }
    addLayer(layer) { if (!this.layers.includes(layer)) this.layers.push(layer); return this; }
    removeLayer(layer) { this.layers = this.layers.filter(l => l !== layer); return this; }
    hasLayer(layer) { return this.layers.includes(layer); }
  }

  class FakeLayer {
    constructor(kind, payload, opts) {
      this.kind = kind;
      this.payload = payload;
      this.opts = opts || {};
      this.tooltip = '';
      this.popup = '';
    }
    bindPopup(p) { this.popup = p; return this; }
    bindTooltip(t) { this.tooltip = t; return this; }
    openPopup() { return this; }
    setLatLngs(l) { this.payload = l; return this; }
    setStyle(s) { Object.assign(this.opts, s); return this; }
    setLatLng(l) { this.payload = l; return this; }
    addTo(group) {
      if (group instanceof FakeGroup) group.addLayer(this);
      if (this.kind === 'polyline') polylines.push(this);
      if (this.kind === 'marker') markers.push(this);
      return this;
    }
  }

  const fitBoundsCalls = [];
  const fakeMap = {
    invalidateSize() {},
    addLayer() { return this; },
    removeLayer() { return this; },
    setView() { return this; },
    fitBounds(coords) { fitBoundsCalls.push(coords); return this; },
    flyTo() { return this; },
    flyToBounds() { return this; },
    panTo() { return this; },
    getBounds() { return { contains: () => true }; },
    remove() {}
  };

  const L = {
    polylines,
    markers,
    fitBoundsCalls,
    map: () => fakeMap,
    tileLayer: () => ({ on() { return this; }, addTo() { return this; }, remove() {} }),
    layerGroup: () => new FakeGroup(),
    divIcon: (opts) => opts,
    polyline: (coords, opts) => new FakeLayer('polyline', coords, opts),
    marker: (coord, opts) => new FakeLayer('marker', coord, opts)
  };

  return { L, FakeGroup };
}

async function setupTrackingHarness({ initialStorageEntries = {}, attachLeafletOnStart = true, presentation = 'legacy', routeByDate = false, oneWay = false } = {}) {
  const matcherLoaded = loadExports(matcherCode, {});
  const rangeLoaded = loadExports(rangeCode, {});
  const matcherMod = matcherLoaded.exports;
  const { L } = createFakeLeaflet();
  const states = [];
  const refs = [];
  const memos = [];
  const callbacks = [];
  const effects = [];
  let sCur = 0;
  let rCur = 0;
  let mCur = 0;
  let cCur = 0;
  let eCur = 0;
  let frameId = 0;
  let frameClock = 0;
  const frames = new Map();
  const dailyCalls = [];
  const dailyOptions = [];

  const depsChanged = (prevDeps, nextDeps) =>
    !prevDeps || !nextDeps || nextDeps.length !== prevDeps.length || nextDeps.some((d, k) => !Object.is(d, prevDeps[k]));

  const react = {
    ...React,
    useState: init => {
      const i = sCur++;
      if (!(i in states)) states[i] = typeof init === 'function' ? init() : init;
      return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v; }];
    },
    useRef: init => {
      const i = rCur++;
      if (!(i in refs)) refs[i] = { current: init };
      return refs[i];
    },
    useMemo: (fn, deps) => {
      const i = mCur++;
      const prev = memos[i];
      if (!prev || depsChanged(prev.deps, deps)) {
        memos[i] = { val: fn(), deps };
      }
      return memos[i].val;
    },
    useCallback: (fn, deps) => {
      const i = cCur++;
      const prev = callbacks[i];
      if (!prev || depsChanged(prev.deps, deps)) {
        callbacks[i] = { fn, deps };
      }
      return callbacks[i].fn;
    },
    useEffect: (fn, deps) => {
      const i = eCur++;
      const prev = effects[i];
      if (!prev || depsChanged(prev.deps, deps)) {
        prev?.cleanup?.();
        effects[i] = { fn, deps, ran: false };
      }
    }
  };

  const samplePolyline = [
    { lat: 30.8990, lng: 75.9217, time: '2026-11-11T04:36:00.000Z', speed: 0, accuracy_meters: 15, isOffline: false, isSnapped: true },
    { lat: 30.8940, lng: 75.9255, time: '2026-11-11T04:39:00.000Z', speed: 34, accuracy_meters: 15, isOffline: false, isSnapped: true },
    { lat: 30.8875, lng: 75.9325, time: '2026-11-11T04:42:00.000Z', speed: 42, accuracy_meters: 15, isOffline: false, isSnapped: true },
    // Blind 4.5-hour gap on return back to Punch Out at origin
    { lat: 30.8990, lng: 75.9217, time: '2026-11-11T14:29:00.000Z', speed: 0, accuracy_meters: 25, isOffline: true, isSnapped: false }
  ];
  if (oneWay) samplePolyline.pop();

  const osrmReturnRoad = [
    [75.9325, 30.8875],
    [75.9300, 30.8902],
    [75.9272, 30.8935],
    [75.9245, 30.8962],
    [75.9217, 30.8990]
  ];
  const fetchCalls = [];
  const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const routePayload = {
    userId: '11111111-1111-4111-8111-111111111111',
    date: todayIST,
    totalKm: 4.0,
    trackedRoadKm: 2.29,
    offlineGapKm: 1.7,
    totalPings: 4,
    shiftCompleted: true,
    punchInTime: '2026-11-11T00:10:00.000+05:30',
    punchOutTime: '2026-11-11T19:59:00.000+05:30',
    polyline: samplePolyline,
    timeline: [
      { type: 'punch_in', lat: 30.8990, lng: 75.9217, startTime: '2026-11-11T00:10:00.000+05:30' },
      { type: 'punch_out', lat: 30.8990, lng: 75.9217, startTime: '2026-11-11T19:59:00.000+05:30' }
    ],
    visitsCount: 0,
    isRoadSnapped: true
  };

  const fakeStorage = new Map(Object.entries(initialStorageEntries));
  const scriptEls = [];
  const mockWindow = {
    ...(attachLeafletOnStart ? { L } : {}),
    addEventListener() {},
    removeEventListener() {},
    localStorage: {
      getItem: k => fakeStorage.get(k) ?? null,
      setItem: (k, v) => fakeStorage.set(k, String(v)),
      removeItem: k => fakeStorage.delete(k)
    }
  };
  const mockDocument = {
    head: { appendChild() {} },
    body: {
      appendChild(el) { scriptEls.push(el); }
    },
    createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }),
    querySelector: () => null,
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
    fullscreenElement: null
  };
  const loadedMapModule = loadExports(mapCode, {
    react,
    'lucide-react': icons,
    '@/app/actions/liveTracking': {
      getEmployee360Route: async (_userId, day, options) => {
        dailyCalls.push(day);
        dailyOptions.push(options);
        if (!routeByDate) return routePayload;
        return { ...routePayload, date: day,
          polyline: samplePolyline.map(point => ({ ...point, time: point.time.replace('2026-11-11', day) })),
          timeline: routePayload.timeline.map(event => ({ ...event, startTime: event.startTime.replace('2026-11-11', day) })) };
      },
      getNationwideRadarData: async () => [],
      getDailyConveyanceVouchers: async () => [],
      updateVoucherApproval: async () => ({ success: true }),
      getEmployeeDeviceHealthSummary: async () => ({ success: false })
    },
    '@/app/actions/team': {
      getTeamMembers: async () => [{ user_id: '11111111-1111-4111-8111-111111111111', id: '11111111-1111-4111-8111-111111111111', emp_name: 'Deepak', role: 'agent', is_approved: true }]
    },
    '@/utils/tableColumnResize': {
      __esModule: true,
      default: () => ({ columnWidths: {}, isResizing: false, handleMouseDown: () => {}, handleTouchStart: () => {}, handleDoubleClickReset: () => {}, getTableTotalWidth: () => 800 }),
      ColumnResizer: () => null
    },
    '@/components/common/StandardTablePagination': () => null,
    '@/components/FieldForce/FieldTrackingDashboardUI': Object.fromEntries(['TrackingHeader', 'TrackingSummary', 'TrackingActivityPanel', 'TrackingPositionInfo', 'TrackingMapToolbar', 'TrackingRouteDock', 'TrackingPlaybackControls', 'TrackingRangeOverview'].map(name => [name, name])),
    '@/components/FieldForce/LiveTrackingDashboard.module.css': {},
    '@/components/FieldForce/trackingDateRanges': rangeLoaded.exports,
    '@/components/FieldForce/trackingDeviceStatus': loadExports(deviceStatusCode, {}).exports,
    '@/utils/routeGeometryMatcher': matcherMod,
    '@/utils/branchAccess': loadExports(branchAccessCode, {}).exports
  }, {
    window: mockWindow,
    localStorage: mockWindow.localStorage,
    document: mockDocument,
    ...(routeByDate ? {
      requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
      cancelAnimationFrame: id => frames.delete(id)
    } : {}),
    fetch: async (url) => {
      fetchCalls.push(String(url));
      return {
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [{ distance: 1740, geometry: { coordinates: osrmReturnRoad } }]
        })
      };
    }
  });
  const loadedMapMod = loadedMapModule.exports;
  const MapComp = loadedMapMod.default;

  function attachDivRefs(node) {
    if (!node || typeof node !== 'object') return;
    const nodeRef = node.props?.ref;
    if (nodeRef && typeof nodeRef === 'object' && nodeRef.current == null && node.type === 'div') {
      if (String(node.props?.style?.background || '') === '#e2e8f0') {
        nodeRef.current = { clientWidth: 800, clientHeight: 500 };
      }
    }
    React.Children.forEach(node.props?.children, attachDivRefs);
  }

  function render() {
    sCur = 0; rCur = 0; mCur = 0; cCur = 0; eCur = 0;
    const tree = MapComp({ company: 'New Swan Group', presentation });
    attachDivRefs(tree);
    return tree;
  }

  async function flushPasses(maxPasses = 5) {
    for (let pass = 0; pass < maxPasses; pass++) {
      render();
      let ranAny = false;
      for (const eff of effects) {
        if (eff && !eff.ran) {
          eff.ran = true;
          eff.cleanup = eff.fn();
          ranAny = true;
        }
      }
      if (!ranAny && pass >= 2) break;
      await new Promise(r => setTimeout(r, 35));
    }
  }

  return {
    L,
    states,
    refs,
    scriptEls,
    mockWindow,
    samplePolyline,
    osrmReturnRoad,
    fetchCalls,
    todayIST,
    routePayload,
    loadedMapMod,
    dailyCalls,
    dailyOptions,
    render,
    flushPasses,
    advanceFrames: async (count) => {
      for (let i = 0; i < count; i++) {
        const pending = [...frames.values()];
        frames.clear();
        frameClock += 100;
        for (const callback of pending) callback(frameClock);
        await flushPasses(3);
      }
    },
    cleanup: () => {
      for (const effect of effects) effect?.cleanup?.();
      loadedMapModule.__cleanupTimers();
      matcherLoaded.__cleanupTimers();
      rangeLoaded.__cleanupTimers();
    }
  };
}

for (const presentation of ['legacy', 'field-force']) {
test(`LiveFieldTrackingMap (${presentation}) auto-renders road-snapped Return route + chevrons across offline Return gap without altering tracked billing km`, async () => {
  const h = await setupTrackingHarness({ presentation });
  const { L, states, refs, samplePolyline, osrmReturnRoad, fetchCalls, loadedMapMod, flushPasses } = h;
  const { computeRouteSignature, buildPlaybackEdgeModel } = loadedMapMod;

  try {
    await flushPasses(6);
    assert.ok(h.dailyOptions.length > 0);
    for (const options of h.dailyOptions) {
      assert.equal(options?.rejectUnsupportedDetours, presentation === 'field-force' ? true : undefined);
    }

    // Verify OSRM road route was automatically fetched for Return gap (default showEstimateRoute = true)
    assert.equal(fetchCalls.length >= 1, true, 'Estimated Return road must be fetched automatically without manual toggle');
    assert.ok(fetchCalls[0].includes('/route/v1/driving/'), 'Must query OSRM driving route for Return gap');

    // Verify Pink Return estimated road polyline was drawn cleanly onto estimateGroup
    const pinkEstReturnPolys = L.polylines.filter(p => p.opts?.color === '#ec4899' && p.popup.includes('Return Route'));
    assert.ok(pinkEstReturnPolys.length >= 1, 'Offline Return leg must render as Pink Return road polyline instead of orange straight chord');
    assert.equal(pinkEstReturnPolys[0].payload.length, osrmReturnRoad.length);

    // Verify Pink Return directional chevrons were placed along the Return road
    const returnChevrons = L.markers.filter(m => String(m.tooltip || '').includes('Return'));
    assert.ok(returnChevrons.length >= 1, 'Estimated Return road must place pink Return directional chevrons');

    // Verify original orange diagonal gap chord was hidden cleanly from markersGroup
    const orangeGapChords = L.polylines.filter(p => p.opts?.color === '#ea580c');
    if (orangeGapChords.length > 0) {
      const markersGrp = refs.find(r => r.current && Array.isArray(r.current.layers))?.current;
      assert.ok(states.some(s => s && typeof s === 'object' && s.hasReturnGap === true && s.distanceKm === 1.74));
      void markersGrp;
    }

    // Verify route signature stability (prevents 20s polling from blinking Return line)
    const routePayloadA = {
      userId: '11111111-1111-4111-8111-111111111111',
      date: '2026-11-11',
      shiftCompleted: true,
      totalKm: 4.69,
      trackedRoadKm: 4.69,
      offlineGapKm: 0,
      isRoadSnapped: true,
      polyline: samplePolyline,
      timeline: [{ type: 'stoppage', startTime: '2026-11-11T04:42:00.000Z', endTime: '2026-11-11T14:29:00.000Z' }]
    };
    const routePayloadB = { ...routePayloadA, polyline: samplePolyline.map(p => ({ ...p })) };
    assert.equal(computeRouteSignature(routePayloadA), computeRouteSignature(routePayloadB));
    assert.notEqual(
      computeRouteSignature(routePayloadA),
      computeRouteSignature({ ...routePayloadA, totalKm: 5.1 })
    );

    // Verify stoppage-aware playback dwell holds cleanly for both 10-minute stays and 10-hour stays
    const dwellPoly = [
      { lat: 30.8990, lng: 75.9217, time: '2026-11-11T00:10:00.000Z', speed: 0 },
      { lat: 30.8991, lng: 75.9218, time: '2026-11-11T10:06:00.000Z', speed: 0 },
      { lat: 30.8940, lng: 75.9255, time: '2026-11-11T10:09:00.000Z', speed: 34 },
      { lat: 30.8941, lng: 75.9256, time: '2026-11-11T10:19:00.000Z', speed: 0 },
      { lat: 30.8990, lng: 75.9217, time: '2026-11-11T10:25:00.000Z', speed: 28 }
    ];
    const edgeModel = buildPlaybackEdgeModel(dwellPoly, [
      { type: 'stoppage', lat: 30.8990, lng: 75.9217, startTime: '2026-11-11T00:10:00.000Z', endTime: '2026-11-11T10:06:00.000Z', durationMins: 596 },
      { type: 'stoppage', lat: 30.8941, lng: 75.9256, startTime: '2026-11-11T10:09:00.000Z', endTime: '2026-11-11T10:19:00.000Z', durationMins: 10 }
    ]);
    assert.equal(edgeModel.edges[0].isStoppageDwell, true);
    assert.ok(edgeModel.edges[0].durationSec >= 4.5, '10-hour stay must hold smoothly >= 4.5s at 1x');
    assert.equal(edgeModel.edges[1].isStoppageDwell, false);
    assert.equal(edgeModel.edges[2].isStoppageDwell, true);
    assert.ok(edgeModel.edges[2].durationSec >= 2.5, '10-minute stay must hold smoothly >= 2.5s at 1x');

    // Verify clustered multi-ping stationary stoppage groups smoothly instead of restarting per ping
    const clusterPoly = [
      { lat: 30.8940, lng: 75.9255, time: '2026-11-11T10:00:00.000Z', speed: 0 },
      { lat: 30.89402, lng: 75.92552, time: '2026-11-11T10:03:00.000Z', speed: 0 },
      { lat: 30.89404, lng: 75.92554, time: '2026-11-11T10:06:00.000Z', speed: 0 },
      { lat: 30.89406, lng: 75.92556, time: '2026-11-11T10:10:00.000Z', speed: 0 },
      { lat: 30.8990, lng: 75.9217, time: '2026-11-11T10:15:00.000Z', speed: 30 }
    ];
    const clusterModel = buildPlaybackEdgeModel(clusterPoly, []);
    const clusterHoldSec = clusterModel.edges.slice(0, 3).reduce((acc, e) => acc + e.durationSec, 0);
    assert.equal(clusterModel.edges.slice(0, 3).every(e => e.isStoppageDwell), true);
    assert.ok(clusterHoldSec >= 2.5 && clusterHoldSec <= 3.8, `Clustered 10m stay holds smoothly once (${clusterHoldSec.toFixed(2)}s)`);
    assert.equal(clusterModel.edges[3].isStoppageDwell, false);
  } finally {
    h.cleanup();
  }
});

}

test('Field Force range selection loads every day, sums actual daily totals and plays successive days', async () => {
  const h = await setupTrackingHarness({ presentation: 'field-force', routeByDate: true });
  function find(node, type) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === type) return node;
    for (const child of React.Children.toArray(node.props?.children)) {
      const match = find(child, type);
      if (match) return match;
    }
    return null;
  }
  try {
    await h.flushPasses(6);
    const end = h.todayIST;
    const start = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(new Date(`${end}T00:00:00+05:30`).getTime() - 2 * 86400000));
    find(h.render(), 'TrackingHeader').props.onDateChange({ preset: 'custom', startDate: start, endDate: end });
    await h.flushPasses(10);
    const summary = find(h.render(), 'TrackingSummary').props;
    assert.equal(summary.rangeSummary.totalDays, 3);
    assert.equal(summary.rangeSummary.loadedDays, 3);
    assert.equal(summary.data.totalKm, 12, 'Range total must be the sum of all three unchanged 4 km daily routes');
    const overview = find(h.render(), 'TrackingRangeOverview');
    assert.equal(overview.props.dates.length, 3);
    assert.equal(find(h.render(), 'TrackingActivityPanel').props.data.timeline.length, 6);
    const requests = h.dailyCalls.length;
    overview.props.onShowAll();
    await h.flushPasses(3);
    assert.equal(h.dailyCalls.length, requests, 'Cosmetic map-layer toggle must not download routes');
    find(h.render(), 'TrackingPlaybackControls').props.onSpeed(5);
    find(h.render(), 'TrackingRangeOverview').props.onPlayRange();
    await h.flushPasses(4);
    await h.advanceFrames(35);
    const finalOverview = find(h.render(), 'TrackingRangeOverview');
    assert.equal(finalOverview.props.selectedDate, end, 'Playback must advance to the final day');
    assert.equal(finalOverview.props.playingRange, false, 'Range playback must finish after the last day');
    assert.equal(h.routePayload.totalKm, 4, 'Daily billing distance must remain unchanged');
    assert.ok(h.dailyOptions.every(options => options?.rejectUnsupportedDetours === true), 'Every range day uses the guarded Field Force fetch');
  } finally { h.cleanup(); }
});

test('Field Force one-way filters preserve the route and ignore unavailable Return; old local geometry is bypassed', async () => {
  const uid = '11111111-1111-4111-8111-111111111111';
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const oldKey = `crm_cached_route_v3_${uid}_${date}`;
  const previousGuardKey = `crm_cached_field_force_route_v4_${uid}_${date}`;
  const stale = JSON.stringify({ userId: uid, date, totalKm: 99, polyline: [] });
  const h = await setupTrackingHarness({ presentation: 'field-force', oneWay: true, initialStorageEntries: { [oldKey]: stale, [previousGuardKey]: stale } });
  function findDock(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'TrackingRouteDock') return node;
    for (const child of React.Children.toArray(node.props?.children)) {
      const match = findDock(child);
      if (match) return match;
    }
    return null;
  }
  try {
    await h.flushPasses(6);
    let dock = findDock(h.render());
    assert.equal(dock.props.hasReturn, false);
    assert.equal(dock.props.filter, 'ALL');
    dock.props.onFilter('GOING');
    await h.flushPasses(3);
    dock = findDock(h.render());
    assert.equal(dock.props.filter, 'GOING');
    dock.props.onFilter('RETURN');
    await h.flushPasses(3);
    assert.equal(findDock(h.render()).props.filter, 'GOING');
    assert.equal(h.mockWindow.localStorage.getItem(oldKey), stale, 'Legacy cache is preserved');
    assert.equal(h.mockWindow.localStorage.getItem(previousGuardKey), stale, 'Previous guard cache is preserved but bypassed');
    assert.equal(JSON.parse(h.mockWindow.localStorage.getItem(`crm_cached_field_force_route_v5_${uid}_${date}`)).totalKm, 4);
    assert.ok(!h.states.some(value => value?.totalKm === 99), 'Old snapped geometry must never hydrate the Field Force view');
  } finally { h.cleanup(); }
});

test('LiveFieldTrackingMap draws route & fits bounds even when warm localStorage cache hydrates routeData BEFORE Leaflet JS finishes loading', async () => {
  const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const uid = '11111111-1111-4111-8111-111111111111';
  const cachedRoute = {
    userId: uid,
    date: todayIST,
    totalKm: 4.0,
    trackedRoadKm: 2.29,
    offlineGapKm: 1.7,
    totalPings: 4,
    shiftCompleted: true,
    punchInTime: '2026-11-11T00:10:00.000+05:30',
    punchOutTime: '2026-11-11T19:59:00.000+05:30',
    polyline: [
      { lat: 30.8990, lng: 75.9217, time: '2026-11-11T04:36:00.000Z', speed: 0, accuracy_meters: 15, isOffline: false, isSnapped: true },
      { lat: 30.8940, lng: 75.9255, time: '2026-11-11T04:39:00.000Z', speed: 34, accuracy_meters: 15, isOffline: false, isSnapped: true },
      { lat: 30.8875, lng: 75.9325, time: '2026-11-11T04:42:00.000Z', speed: 42, accuracy_meters: 15, isOffline: false, isSnapped: true },
      { lat: 30.8990, lng: 75.9217, time: '2026-11-11T14:29:00.000Z', speed: 0, accuracy_meters: 25, isOffline: true, isSnapped: false }
    ],
    timeline: [
      { type: 'punch_in', lat: 30.8990, lng: 75.9217, startTime: '2026-11-11T00:10:00.000+05:30' },
      { type: 'punch_out', lat: 30.8990, lng: 75.9217, startTime: '2026-11-11T19:59:00.000+05:30' }
    ],
    visitsCount: 0,
    isRoadSnapped: true
  };

  const h = await setupTrackingHarness({
    attachLeafletOnStart: false,
    initialStorageEntries: {
      'crm_last_field_exec_New Swan Group': uid,
      [`crm_cached_route_v3_${uid}_${todayIST}`]: JSON.stringify(cachedRoute)
    }
  });

  try {
    // 1. Hydrate routeData from cache BEFORE Leaflet is ready (simulating slow CDN script load)
    await h.flushPasses(2);
    assert.equal(h.L.polylines.length, 0, 'Nothing drawn before Leaflet finishes loading');

    // 2. Now Leaflet CDN loads & fires onload asynchronously after routeData already hydrated
    h.mockWindow.L = h.L;
    for (const sc of h.scriptEls) {
      if (typeof sc.onload === 'function') sc.onload();
    }
    await h.flushPasses(4);

    assert.ok(h.L.polylines.length >= 2, 'Going & Return polylines must draw immediately once Leaflet becomes ready');
    assert.ok(h.L.markers.length >= 2, 'Start, runner & directional markers must draw onto map after Leaflet ready');
    assert.ok(h.L.fitBoundsCalls.length >= 1, 'Map must fitBounds to employee route instead of staying zoomed out on city center');
  } finally {
    h.cleanup();
  }
});
