import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import * as attendanceUtils from '../src/utils/attendanceUtils.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const sources = {};
for (const file of ['src/app/actions/attendance.js', 'src/components/Attendance/AttendanceModule.jsx']) {
  sources[file] = (await swc.transform(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    filename: file,
    jsc: { parser: { syntax: 'ecmascript', jsx: file.endsWith('.jsx') }, transform: { react: { runtime: 'classic' } } },
    module: { type: 'commonjs' }
  })).code;
}

const TENANT = '00000000-0000-0000-0000-000000000001';
const OTHER_TENANT = '922d3e72-6588-457f-a562-4f1bdbf10d98';
const EMAIL = 'employee@example.com';
const OPTIONAL = ['short_leave_type', 'is_grace_applied', 'shift_name'];
const copy = value => JSON.parse(JSON.stringify(value));
const input = { email: EMAIL, empName: 'Employee', tenantId: TENANT };
const quiet = { log() {}, warn() {}, error() {} };
const dayOf = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(now));
const sample = (overrides = {}) => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenant_id: TENANT, email: EMAIL,
  emp_name: 'Employee', attendance_date: '2026-10-26', in_time: '2026-10-26T03:30:00.000Z',
  out_time: null, total_working_minutes: 0, status: 'PRESENT', ...overrides
});

function loadCompiled(file, mocks, globals = {}) {
  const loaded = { exports: {} };
  vm.runInNewContext(sources[file], {
    module: loaded, exports: loaded.exports, console: quiet, process, ...globals,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unexpected import: ${name}`);
    }
  }, { filename: file });
  return loaded.exports;
}

function serverHarness(options = {}) {
  const state = {
    rows: [], now: '2026-10-26T06:30:00.000Z', supported: OPTIONAL,
    local: { records: [], requests: [] }, writes: [], queries: [], ...options
  };
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return new Date(state.now).getTime(); }
  }
  const db = { from(table) {
    let operation = 'select', payload, settings, single = false;
    const filters = [];
    const query = {
      select() { return this; },
      eq(key, value) { filters.push([key, 'eq', value]); return this; },
      is(key, value) { filters.push([key, 'eq', value]); return this; },
      ilike(key, value) { filters.push([key, 'ilike', value]); return this; },
      gte(key, value) { filters.push([key, 'gte', value]); return this; },
      lte(key, value) { filters.push([key, 'lte', value]); return this; },
      order() { return this; },
      maybeSingle() { single = true; return this; },
      upsert(row, config) { operation = 'upsert'; payload = copy(row); settings = config; return this; },
      update(row) { operation = 'update'; payload = copy(row); return this; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (table !== 'attendance_records') return { data: null, error: null };
          state.queries.push({ operation, filters: copy(filters) });
          const matches = row => filters.every(([key, op, value]) => {
            if (op === 'ilike') return String(row[key]).toLowerCase() === value.toLowerCase();
            if (op === 'gte') return row[key] >= value;
            if (op === 'lte') return row[key] <= value;
            return (row[key] ?? null) === value;
          });
          if (operation === 'select') {
            if (state.readError) return { data: null, error: state.readError };
            const found = state.rows.filter(matches);
            return { data: copy(single ? found[0] || null : found), error: null };
          }
          state.writes.push({ operation, payload: copy(payload), settings });
          if (state.writeError) return { data: null, error: state.writeError };
          const missing = OPTIONAL.find(key => Object.hasOwn(payload, key) && !state.supported.includes(key));
          if (missing) return { data: null, error: {
            code: state.schemaErrorCode || 'PGRST204',
            message: `Could not find the '${missing}' column of 'attendance_records' in the schema cache`
          } };
          if (state.race) {
            const row = state.rows.find(row => row.id === state.race.id);
            if (row) Object.assign(row, copy(state.race));
            else state.rows.push(copy(state.race));
            state.race = null;
          }
          if (operation === 'update') {
            const row = state.rows.find(matches);
            if (!row) return { data: null, error: null };
            Object.assign(row, payload);
            return { data: copy(row), error: null };
          }
          const existing = state.rows.find(row => row.email === payload.email && row.attendance_date === payload.attendance_date);
          if (existing && settings?.ignoreDuplicates) return { data: null, error: null };
          if (existing) Object.assign(existing, payload);
          else state.rows.push(copy(payload));
          return { data: copy(existing || payload), error: null };
        }).then(resolve, reject);
      }
    };
    return query;
  } };
  const actions = loadCompiled('src/app/actions/attendance.js', {
    '@supabase/supabase-js': { createClient: () => db },
    '@/utils/supabase/server': {}, '@/utils/reportingHierarchy': {}, './audit': { logAuditAction: async () => {} },
    '@/utils/attendanceUtils': {
      ...attendanceUtils, getTodayDateString: () => dayOf(state.now),
      getIstDateParts: date => attendanceUtils.getIstDateParts(date || state.now)
    },
    '@/utils/geoAttendance': { calculateDistanceMeters: () => 0 },
    'fs/promises': {
      readFile: async file => JSON.stringify(file.endsWith('attendance_data.json') ? state.local : {}),
      mkdir: async () => {},
      writeFile: async (file, data) => {
        if (state.readOnlyDisk) throw new Error('EROFS');
        if (file.endsWith('attendance_data.json')) state.local = JSON.parse(data);
      }
    }, path, crypto
  }, { Date: TestDate });
  return { ...actions, state };
}

test('legacy schema saves durably and reloads after loss of local disk/cache', async () => {
  const h = serverHarness({ supported: [], readOnlyDisk: true });
  const saved = await h.punchIn(input);
  assert.equal(saved.success, true);
  assert.equal(h.state.writes.length, 4);
  assert.equal(h.state.rows.length, 1);
  assert.equal(saved.data.short_leave_type, 'NONE');
  const nextServer = serverHarness({ rows: copy(h.state.rows), local: { records: [], requests: [] } });
  const restored = await nextServer.getTodayAttendance(EMAIL, '', TENANT);
  assert.equal(restored.success, true);
  assert.equal(restored.data.in_time, saved.data.in_time);
  assert.equal(restored.data.out_time, null);
  const duplicate = await nextServer.punchIn(input);
  assert.equal(duplicate.alreadyPunched, true);
  assert.equal(duplicate.data.in_time, saved.data.in_time);
  assert.equal(nextServer.state.writes.length, 0);
});

test('modern schema retains shift fields without a retry', async () => {
  const h = serverHarness();
  assert.equal((await h.punchIn(input)).success, true);
  assert.equal(h.state.writes.length, 1);
  for (const column of OPTIONAL) assert.ok(Object.hasOwn(h.state.rows[0], column));
});

test('PostgreSQL missing-column errors also retry only optional shift fields', async () => {
  const h = serverHarness({ supported: [], schemaErrorCode: '42703' });
  assert.equal((await h.punchIn(input)).success, true);
  assert.equal(h.state.writes.length, 4);
});

test('database write failures never return success or save a local-only punch', async () => {
  for (const error of [{ code: '23514', message: 'check violation' }, { code: 'PGRST204', message: "Missing 'email' column" }]) {
    const h = serverHarness({ writeError: error });
    assert.equal((await h.punchIn(input)).success, false);
    assert.equal(h.state.rows.length, 0);
    assert.equal(h.state.local.records.length, 0);
    assert.equal(h.state.writes.length, 1);
  }
});

test('read outages remain errors and block uncertain mutations', async () => {
  const h = serverHarness({ readError: { code: '503', message: 'Unavailable' } });
  assert.equal((await h.getTodayAttendance(EMAIL, '', TENANT)).success, false);
  assert.equal((await h.punchIn(input)).success, false);
  assert.equal((await h.punchOut(input)).success, false);
  assert.equal(h.state.writes.length, 0);
});

test('concurrent punch-ins and cross-tenant conflicts cannot replace original timestamps', async () => {
  const original = sample();
  const h = serverHarness({ race: original });
  const result = await h.punchIn(input);
  assert.equal(result.alreadyPunched, true);
  assert.equal(result.data.in_time, original.in_time);
  assert.equal(h.state.rows.length, 1);
  const otherTenant = serverHarness({ rows: [sample({ tenant_id: OTHER_TENANT })] });
  assert.equal((await otherTenant.punchIn(input)).success, false);
  assert.equal(otherTenant.state.rows[0].tenant_id, OTHER_TENANT);
  assert.equal(otherTenant.state.rows[0].in_time, original.in_time);
});

test('punch-out saves on legacy schema; failed/duplicate punch-outs preserve original times', async () => {
  const h = serverHarness({ rows: [sample()], supported: [] });
  const originalIn = h.state.rows[0].in_time;
  const result = await h.punchOut(input);
  assert.equal(result.success, true);
  assert.equal(result.data.in_time, originalIn);
  assert.equal(h.state.rows[0].out_time, h.state.now);
  const finalOut = result.data.out_time;
  h.state.now = '2026-10-26T07:30:00.000Z';
  assert.equal((await h.punchOut(input)).alreadyPunchedOut, true);
  assert.equal(h.state.rows[0].out_time, finalOut);
  const failed = serverHarness({ rows: [sample()], writeError: { code: '503', message: 'Unavailable' } });
  assert.equal((await failed.punchOut(input)).success, false);
  assert.equal(failed.state.rows[0].out_time, null);
});

test('a simultaneous punch-out preserves the first confirmed punch-out', async () => {
  const final = sample({ out_time: '2026-10-26T06:00:00.000Z', total_working_minutes: 150 });
  const h = serverHarness({ rows: [sample()], race: final });
  const result = await h.punchOut(input);
  assert.equal(result.alreadyPunchedOut, true);
  assert.equal(result.data.out_time, final.out_time);
  assert.equal(h.state.rows[0].out_time, final.out_time);
});

test('IST month boundary and default tenant are used consistently on UTC servers', async () => {
  const h = serverHarness({ now: '2026-10-31T20:00:00.000Z' });
  const result = await h.punchIn({ ...input, tenantId: 'default' });
  assert.equal(result.success, true);
  assert.equal(result.data.attendance_date, '2026-11-01');
  assert.equal(result.data.tenant_id, TENANT);
  assert.ok(h.state.queries.some(query => query.filters.some(([key, op, value]) => key === 'attendance_date' && op === 'gte' && value === '2026-11-01')));
});

// Exercise the actual component's handlers/effects with a small hook runtime.
// Each mount has fresh React state; only the explicit device/cloud stores survive.
function stationHarness(options = {}) {
  const state = {
    now: '2026-10-26T06:30:00.000Z', cloud: null, online: true,
    storage: new Map(), queue: [], queueAvailable: true, ...options
  };
  let props = { userEmail: EMAIL, userName: 'Employee', tenantId: TENANT };
  const slots = [], effects = [], listeners = new Map(), intervals = new Map();
  let cursor = 0, dirty = true, tree, pendingEffects = [], timerId = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    createElement: (type, elementProps, ...children) => ({ type, props: elementProps || {}, children }),
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => {
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: { current: initial } };
      return slots[index].value;
    },
    useMemo(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: fn(), deps };
      return slots[index].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!effects[index] || !same(effects[index].deps, deps)) {
        pendingEffects.push(() => {
          effects[index]?.cleanup?.();
          effects[index] = { deps, cleanup: fn() };
        });
      }
    }
  };
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return new Date(state.now).getTime(); }
  }
  const actions = new Proxy({
    async getTodayAttendance(...args) {
      if (state.read) return state.read(...args);
      return state.readError ? { success: false, error: 'Unable to verify attendance' }
        : { success: true, data: state.cloud ? copy(state.cloud) : null };
    },
    async punchIn() {
      if (state.saveIn) return state.saveIn();
      state.cloud = sample({ in_time: state.now });
      return { success: true, data: copy(state.cloud), message: 'Punch In saved' };
    },
    async punchOut() {
      if (state.saveOut) return state.saveOut();
      state.cloud = { ...state.cloud, out_time: state.now, total_working_minutes: 180 };
      return { success: true, data: copy(state.cloud), message: 'Punch Out saved' };
    }
  }, { get: (target, key) => target[key] || (async () => ({ success: false })) });
  const component = loadCompiled('src/components/Attendance/AttendanceModule.jsx', {
    react, 'lucide-react': new Proxy({}, { get: (_, key) => key }),
    '@/components/common/MobileTableView': () => null, '@/components/common/DateRangePicker': () => null,
    '@/app/actions/attendance': actions,
    '@/utils/attendanceUtils': { ...attendanceUtils, getTodayDateString: () => dayOf(state.now) },
    '@/app/actions/tenantBranches': { getTenantBranches: async () => [] },
    '@/utils/geoAttendance': { getCurrentGPSLocation: async () => ({ success: false }) },
    '@/utils/offlineSync': {
      canPerformOfflineAction: () => ({ allowed: true }),
      enqueueOfflineAction: async (...args) => {
        if (!state.queueAvailable) return null;
        state.queue.push(copy(args));
        return 'queue-committed';
      }
    },
    '@/utils/tableColumnResize': { useTableColumnResize: (_, widths) => ({ colWidths: widths, getTotalTableWidth: () => 1000 }), ColumnResizer: () => null }
  }, {
    Date: TestDate,
    navigator: { get onLine() { return state.online; } },
    window: {
      addEventListener: (event, callback) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(callback);
      },
      removeEventListener: (event, callback) => listeners.get(event)?.delete(callback)
    },
    localStorage: { getItem: key => state.storage.get(key) || null, setItem: (key, value) => state.storage.set(key, value) },
    setInterval: callback => { intervals.set(++timerId, callback); return timerId; },
    clearInterval: id => intervals.delete(id), setTimeout: () => 0, clearTimeout() {}, queueMicrotask,
    fetch: async () => ({ ok: false })
  }).default;
  const textOf = node => {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node !== 'object') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join('');
    return (node.children || []).map(textOf).join('');
  };
  const allNodes = node => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(allNodes);
    return [node, ...(node.children || []).flatMap(allNodes)];
  };
  const harness = {
    state,
    get text() { return textOf(tree); },
    button(label) {
      const button = allNodes(tree).find(node => node.type === 'button' && textOf(node).includes(label));
      assert.ok(button, `Missing button: ${label}`);
      return button;
    },
    async flush() {
      for (let frame = 0; frame < 30; frame++) {
        if (dirty) {
          dirty = false; cursor = 0; pendingEffects = [];
          tree = component(props);
          for (const effect of pendingEffects) effect();
        }
        await new Promise(resolve => setImmediate(resolve));
        if (!dirty) return;
      }
      throw new Error('Attendance component did not settle');
    },
    async click(label) {
      const button = this.button(label);
      assert.ok(!button.props.disabled, `Button is disabled: ${label}`);
      const result = button.props.onClick();
      await this.flush();
      return result;
    },
    async tick(now) {
      state.now = now;
      for (const callback of intervals.values()) callback();
      await this.flush();
    },
    async updateProps(next) { props = { ...props, ...next }; dirty = true; await this.flush(); },
    async focus() { for (const callback of listeners.get('focus') || []) callback(); await this.flush(); },
    unmount() { for (const effect of effects) effect?.cleanup?.(); }
  };
  return harness;
}

test('station resumes from the original cloud punch after refresh and fresh login', async () => {
  const storage = new Map();
  for (let mount = 0; mount < 3; mount++) {
    const h = stationHarness({ storage: mount === 2 ? new Map() : storage, cloud: sample() });
    await h.flush();
    assert.ok(h.text.includes('03h 00m 00s'));
    assert.ok(h.text.includes('● LIVE RUNNING'));
    assert.equal(h.button('✓ Punched In').props.disabled, true);
    assert.equal(h.button('Punch Out').props.disabled, false);
    await h.tick('2026-10-26T06:31:10.000Z');
    assert.ok(h.text.includes('03h 01m 10s'));
    h.unmount();
    assert.equal(h.state.cloud.out_time, null);
  }
});

test('failed reads keep a confirmed cached punch; workspace/user/day caches stay isolated', async () => {
  const storage = new Map([[`att_today_record_${TENANT}_${EMAIL}_2026-10-26`, JSON.stringify(sample())]]);
  const h = stationHarness({ storage, readError: true });
  await h.flush();
  assert.ok(h.text.includes('03h 00m 00s'));
  assert.ok(h.text.includes('Unable to verify attendance'));
  await h.updateProps({ tenantId: OTHER_TENANT });
  assert.ok(h.text.includes('(Not Started)'));
  await h.updateProps({ tenantId: TENANT, userEmail: 'other@example.com' });
  assert.ok(h.text.includes('(Not Started)'));
  const nextDay = stationHarness({ storage, now: '2026-10-27T06:30:00.000Z', readError: true });
  await nextDay.flush();
  assert.ok(nextDay.text.includes('(Not Started)'));
});

test('failed saves cannot start or stop the live timer', async () => {
  const h = stationHarness({ saveIn: async () => ({ success: false, error: 'Punch In not saved' }) });
  await h.flush();
  await h.click('Punch In');
  await h.click('✓ Punch In Confirm');
  assert.ok(h.text.includes('(Not Started)'));
  assert.ok(h.text.includes('Punch In not saved'));
  const running = stationHarness({ cloud: sample(), saveOut: async () => ({ success: false, error: 'Punch Out not saved' }) });
  await running.flush();
  await running.click('Punch Out');
  await running.click('✓ Punch Out Confirm');
  assert.ok(running.text.includes('● LIVE RUNNING'));
  assert.equal(running.state.cloud.out_time, null);
});

test('pending saves do not claim a punch and duplicate confirmation clicks write only once', async () => {
  let finish, calls = 0;
  const saving = new Promise(resolve => { finish = resolve; });
  const h = stationHarness({ saveIn: () => { calls++; return saving; } });
  await h.flush();
  await h.click('Punch In');
  const confirm = h.button('✓ Punch In Confirm').props.onClick;
  const first = confirm();
  const second = confirm();
  await h.flush();
  assert.equal(calls, 1);
  assert.ok(h.text.includes('(Not Started)'));
  assert.ok(h.text.includes('Punching...'));
  h.state.cloud = sample({ in_time: h.state.now });
  finish({ success: true, data: copy(h.state.cloud), message: 'Saved' });
  await Promise.all([first, second]);
  await h.flush();
  assert.ok(h.text.includes('● LIVE RUNNING'));
  assert.equal(h.button('✓ Punched In').props.disabled, true);
});

test('retry status clears a resolved read error without losing elapsed time', async () => {
  const h = stationHarness({ readError: true, cloud: sample() });
  await h.flush();
  assert.ok(h.text.includes('Unable to verify attendance'));
  h.state.readError = false;
  await h.click('Retry Status');
  assert.ok(!h.text.includes('Unable to verify attendance'));
  assert.ok(h.text.includes('03h 00m 00s'));
});

test('offline punches require a committed queue and survive refresh until cloud sync', async () => {
  const storage = new Map();
  const h = stationHarness({ storage, online: false });
  await h.flush();
  await h.click('Punch In');
  await h.click('✓ Punch In Confirm');
  assert.ok(h.text.includes('● LIVE RUNNING'));
  assert.ok(h.text.includes('Sync Pending'));
  assert.equal(h.state.queue[0][2].tenant_id, TENANT);
  const refreshed = stationHarness({ storage, cloud: null });
  await refreshed.flush();
  assert.ok(refreshed.text.includes('● LIVE RUNNING'));
  refreshed.state.cloud = sample({ in_time: h.state.now });
  await refreshed.focus();
  assert.ok(!refreshed.text.includes('Sync Pending'));
  const failed = stationHarness({ online: false, queueAvailable: false });
  await failed.flush();
  await failed.click('Punch In');
  await failed.click('✓ Punch In Confirm');
  assert.ok(failed.text.includes('(Not Started)'));
  assert.ok(failed.text.includes('Punch save nahi hua'));
});

test('late reads from a previous employee cannot overwrite the active employee', async () => {
  let finish;
  const oldRead = new Promise(resolve => { finish = resolve; });
  const h = stationHarness({ read: email => email === EMAIL ? oldRead : { success: true, data: null } });
  await h.flush();
  await h.updateProps({ userEmail: 'other@example.com' });
  finish({ success: true, data: sample() });
  await h.flush();
  assert.ok(h.text.includes('(Not Started)'));
  assert.equal(h.button('Punch In').props.disabled, false);
});
