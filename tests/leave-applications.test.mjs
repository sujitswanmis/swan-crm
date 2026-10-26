import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import * as attendanceUtils from '../src/utils/attendanceUtils.js';
import * as hierarchy from '../src/utils/reportingHierarchy.js';
import * as permissions from '../src/utils/permissionUtils.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const compiled = {};
for (const file of ['src/app/actions/attendance.js', 'src/components/Attendance/AttendanceModule.jsx']) {
  compiled[file] = (await swc.transform(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'ecmascript', jsx: file.endsWith('.jsx') }, transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' }
  })).code;
}
const TENANT = '00000000-0000-0000-0000-000000000001';
const OTHER = '922d3e72-6588-457f-a562-4f1bdbf10d98';
const EMP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EMAIL = 'employee@example.com';
const HOD_EMAIL = 'hod@example.com';
const copy = value => JSON.parse(JSON.stringify(value));
const quiet = { log() {}, error() {}, warn() {} };
const employee = { user_id: EMP_ID, email: EMAIL, emp_name: 'Employee', emp_id: 'E001', emp_department: 'Operations',
  role: 'agent', is_approved: true, date_of_joining: '2020-01-15', company: 'New Swan Group',
  module_access: { _tenantId: TENANT, hod_person: HOD_EMAIL, attendance: { view: true } } };
const hod = { ...employee, user_id: HOD_ID, email: HOD_EMAIL, emp_name: 'Team HOD', role: 'hod',
  module_access: { _tenantId: TENANT, attendance: { view: true, is_manager: true } } };
const unrelated = { ...employee, user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'unrelated@example.com',
  module_access: { ...employee.module_access, hod_person: 'other-hod@example.com' } };
const other = { ...employee, user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email: 'other@example.com',
  module_access: { ...employee.module_access, _tenantId: OTHER } };
const request = (overrides = {}) => ({ id: 'leave-existing', tenant_id: TENANT, user_id: EMP_ID, email: EMAIL,
  emp_name: 'Employee', emp_code: 'E001', department: 'Operations', leave_type: 'CL',
  from_date: '2026-10-27', to_date: '2026-10-27', total_days: 1, half_day_session: null,
  reason: 'Personal work', status: 'PENDING', applied_at: '2026-10-26T06:30:00.000Z', ...overrides });
const application = { email: EMAIL, tenantId: TENANT, leaveType: 'CL', fromDate: '2026-10-27', toDate: '2026-10-27', reason: 'Personal work' };
function load(file, mocks, globals = {}) {
  const loaded = { exports: {} };
  vm.runInNewContext(compiled[file], { module: loaded, exports: loaded.exports, process, console: quiet, ...globals,
    require(name) { if (Object.hasOwn(mocks, name)) return mocks[name]; throw new Error(`Unexpected import ${name}`); }
  }, { filename: file });
  return loaded.exports;
}

function server(options = {}) {
  const state = { now: '2026-10-26T06:30:00.000Z', actorId: EMP_ID, profiles: copy([employee, hod, unrelated, other]),
    leaves: [], attendance: [], local: { requests: [], cpl_grants: [] }, writes: [], diskWrites: 0,
    readErrors: {}, writeErrors: {}, ...options };
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return new Date(state.now).getTime(); }
  }
  const db = { from(table) {
    let operation = 'select', payload, config, single = false, start = 0, end = Infinity;
    const filters = [];
    const query = {
      select() { return this; },
      eq(key, value) { filters.push(row => (row[key] ?? null) === value); return this; },
      is(key, value) { return this.eq(key, value); },
      ilike(key, value) { filters.push(row => String(row[key]).toLowerCase() === String(value).toLowerCase()); return this; },
      gte(key, value) { filters.push(row => row[key] >= value); return this; },
      lte(key, value) { filters.push(row => row[key] <= value); return this; },
      in(key, values) { filters.push(row => values.includes(row[key])); return this; },
      order() { return this; },
      range(from, to) { start = from; end = to; return this; },
      maybeSingle() { single = true; return this; },
      insert(value) { operation = 'insert'; payload = copy(value); return this; },
      update(value) { operation = 'update'; payload = copy(value); return this; },
      upsert(value, settings) { operation = 'upsert'; payload = copy(value); config = settings; return this; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          const rows = table === 'user_roles' ? state.profiles : table === 'employee_leaves' ? state.leaves : table === 'attendance_records' ? state.attendance : [];
          const matches = row => filters.every(filter => filter(row));
          if (state.missingTable && table === 'employee_leaves') return { data: null, error: { code: 'PGRST205' } };
          if (operation === 'select') {
            if (state.readErrors[table]) return { data: null, error: state.readErrors[table] };
            const selected = rows.filter(matches).slice(start, end + 1);
            return { data: copy(single ? selected[0] || null : selected), error: null };
          }
          state.writes.push({ table, operation, payload: copy(payload) });
          if (state.writeErrors[table]) return { data: null, error: state.writeErrors[table] };
          if (operation === 'update' && table === 'employee_leaves' && state.beforeDecision) {
            state.beforeDecision(state); state.beforeDecision = null;
          }
          let changed = [];
          if (operation === 'update') {
            changed = rows.filter(matches);
            for (const row of changed) Object.assign(row, payload);
          } else {
            for (const item of Array.isArray(payload) ? payload : [payload]) {
              const existing = rows.find(row => table === 'attendance_records'
                ? row.email === item.email && row.attendance_date === item.attendance_date : row.id === item.id);
              if (existing && config?.ignoreDuplicates) continue;
              if (operation === 'insert' && rows.some(row => row.tenant_id === item.tenant_id && row.email === item.email
                && row.from_date === item.from_date && row.to_date === item.to_date && ['PENDING', 'APPROVED'].includes(row.status))) {
                return { data: null, error: { code: '23505' } };
              }
              if (existing) { Object.assign(existing, item); changed.push(existing); }
              else { rows.push(copy(item)); changed.push(rows.at(-1)); }
            }
          }
          return { data: copy(single ? changed[0] || null : changed), error: null };
        }).then(resolve, reject);
      }
    };
    return query;
  } };
  const actions = load('src/app/actions/attendance.js', {
    '@supabase/supabase-js': { createClient: () => db },
    '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.signedOut ? null : { id: state.actorId, email: state.profiles.find(profile => profile.user_id === state.actorId)?.email } } }) } }) },
    '@/utils/reportingHierarchy': hierarchy, './audit': { logAuditAction: async () => {} },
    '@/utils/attendanceUtils': { ...attendanceUtils, getTodayDateString: () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(state.now)), getIstDateParts: value => attendanceUtils.getIstDateParts(value || state.now) },
    '@/utils/geoAttendance': { calculateDistanceMeters: () => 0 }, path, crypto,
    'fs/promises': { readFile: async file => JSON.stringify(file.endsWith('employee_leaves.json') ? state.local : file.endsWith('attendance_data.json') ? { records: [], requests: [] } : {}),
      mkdir: async () => {}, writeFile: async () => { state.diskWrites++; } }
  }, { Date: TestDate });
  return { state, ...actions };
}

test('cloud application survives a fresh server/login and returns canonical history fields', async () => {
  const h = server();
  const saved = await h.applyEmployeeLeave(application);
  assert.equal(saved.success, true);
  assert.equal(saved.data.status, 'PENDING');
  assert.equal(saved.data.emp_code, 'E001');
  assert.equal(h.state.diskWrites, 0);
  const fresh = server({ leaves: copy(h.state.leaves) });
  const history = await fresh.getMyLeaveRequests({ email: EMAIL, tenantId: TENANT });
  assert.equal(history.success, true);
  assert.equal(history.data[0].id, saved.data.id);
  assert.equal(history.data[0].emp_email, EMAIL);
  assert.equal(history.data[0].days_count, 1);
});

test('write/setup failures cannot return success or create a local-only leave', async () => {
  for (const options of [{ missingTable: true }, { writeErrors: { employee_leaves: { code: '503' } } }]) {
    const h = server(options);
    const result = await h.applyEmployeeLeave(application);
    assert.equal(result.success, false);
    assert.equal(h.state.leaves.length, 0);
    assert.equal(h.state.local.requests.length, 0);
    assert.equal(h.state.diskWrites, 0);
  }
});

test('employees cannot impersonate others, switch tenants, or approve applications', async () => {
  const h = server({ leaves: [request()] });
  assert.equal((await h.applyEmployeeLeave({ ...application, email: unrelated.email })).success, false);
  assert.equal((await h.getMyLeaveRequests({ email: unrelated.email, tenantId: TENANT })).success, false);
  assert.equal((await h.getMyLeaveRequests({ email: EMAIL, tenantId: OTHER })).success, false);
  assert.equal((await h.getHodPendingLeaveRequests({ tenantId: TENANT })).success, false);
  assert.equal((await h.approveLeaveRequest({ requestId: 'leave-existing', tenantId: TENANT, approverId: HOD_ID })).success, false);
  assert.equal(h.state.leaves[0].status, 'PENDING');
  assert.equal(h.state.writes.length, 0);
  const signedOut = server({ signedOut: true });
  assert.equal((await signedOut.getMyLeaveRequests({ email: EMAIL })).success, false);
});

test('HOD sees and decides only mapped employees in the permitted workspace', async () => {
  const h = server({ actorId: HOD_ID, leaves: [request(), request({ id: 'unrelated', email: unrelated.email }), request({ id: 'other-tenant', tenant_id: OTHER, email: other.email })] });
  const queue = await h.getHodPendingLeaveRequests({ tenantId: TENANT });
  assert.equal(queue.success, true);
  assert.deepEqual(copy(queue.data.map(row => row.id)), ['leave-existing']);
  assert.equal((await h.approveLeaveRequest({ requestId: 'unrelated', tenantId: TENANT })).success, false);
  assert.equal((await h.approveLeaveRequest({ requestId: 'other-tenant', tenantId: TENANT })).success, false);
  assert.equal((await h.approveLeaveRequest({ requestId: 'leave-existing', tenantId: TENANT, approverName: 'Forged' })).success, true);
  assert.equal(h.state.leaves[0].approver_name, 'Team HOD');
});

test('approval persists status, balances, attendance dates and team ledger after reload', async () => {
  const h = server({ actorId: HOD_ID, leaves: [request({ to_date: '2026-10-28', total_days: 2 })] });
  assert.equal((await h.approveLeaveRequest({ requestId: 'leave-existing', tenantId: TENANT, remarks: 'Approved for personal work' })).success, true);
  assert.deepEqual(h.state.attendance.map(row => row.attendance_date), ['2026-10-27', '2026-10-28']);
  assert.ok(h.state.attendance.every(row => row.status === 'ON_LEAVE'));
  const fresh = server({ leaves: copy(h.state.leaves), actorId: EMP_ID });
  const balance = await fresh.getEmployeeLeaveBalance({ email: EMAIL, tenantId: TENANT });
  assert.equal(balance.data.cl.availed, 2);
  assert.equal(balance.data.cl.remaining, 6);
  fresh.state.actorId = HOD_ID;
  const ledger = await fresh.getTeamLeaveReport({ tenantId: TENANT, year: 2026 });
  assert.equal(ledger.success, true);
  assert.equal(ledger.data.history[0].status, 'APPROVED');
  assert.equal(ledger.data.kpis.totalLeavesTaken, 2);
});

test('approved leave never changes existing live/completed punch timestamps or status', async () => {
  const running = { id: 'attendance-running', tenant_id: TENANT, email: EMAIL, attendance_date: '2026-10-27', in_time: '2026-10-27T03:30:00Z', out_time: null, status: 'PRESENT' };
  const complete = { ...running, id: 'attendance-complete', attendance_date: '2026-10-28', out_time: '2026-10-28T13:00:00Z' };
  const h = server({ actorId: HOD_ID, leaves: [request({ to_date: '2026-10-28', total_days: 2 })], attendance: [copy(running), copy(complete)] });
  assert.equal((await h.approveLeaveRequest({ requestId: 'leave-existing', tenantId: TENANT })).success, true);
  assert.deepEqual(h.state.attendance, [running, complete]);
});

test('decision failures/races do not silently approve or change already processed requests', async () => {
  const failed = server({ actorId: HOD_ID, leaves: [request()], writeErrors: { employee_leaves: { code: '503' } } });
  assert.equal((await failed.approveLeaveRequest({ requestId: 'leave-existing', tenantId: TENANT })).success, false);
  assert.equal(failed.state.leaves[0].status, 'PENDING');
  assert.equal(failed.state.attendance.length, 0);
  const raced = server({ actorId: HOD_ID, leaves: [request()], beforeDecision: state => { state.leaves[0].status = 'REJECTED'; } });
  assert.equal((await raced.approveLeaveRequest({ requestId: 'leave-existing', tenantId: TENANT })).success, false);
  assert.equal(raced.state.leaves[0].status, 'REJECTED');
});

test('cloud decisions override stale fallback data and rejection remarks survive reload', async () => {
  const h = server({ actorId: HOD_ID, leaves: [request()], local: { requests: [request()], cpl_grants: [] } });
  assert.equal((await h.rejectLeaveRequest({ requestId: 'leave-existing', tenantId: TENANT, remarks: 'Please choose different dates' })).success, true);
  h.state.actorId = EMP_ID;
  const history = await h.getMyLeaveRequests({ email: EMAIL, tenantId: TENANT });
  assert.equal(history.data.length, 1);
  assert.equal(history.data[0].status, 'REJECTED');
  assert.equal(history.data[0].approver_remarks, 'Please choose different dates');
  assert.equal(h.state.local.requests[0].status, 'PENDING');
});

test('half days, IST date validation and overlapping requests are handled consistently', async () => {
  const h = server();
  const result = await h.applyEmployeeLeave({ ...application, leaveType: 'HD-L', halfDaySession: 'SECOND_HALF' });
  assert.equal(result.success, true);
  assert.equal(result.data.leave_type, 'HALF_DAY');
  assert.equal(result.data.total_days, 0.5);
  assert.equal((await h.applyEmployeeLeave(application)).success, false);
  for (const dates of [{ fromDate: '2026-02-30', toDate: '2026-02-30' }, { fromDate: '2026-10-28', toDate: '2026-10-27' }]) {
    assert.equal((await server().applyEmployeeLeave({ ...application, ...dates })).success, false);
  }
  assert.equal((await server().applyEmployeeLeave({ ...application, leaveType: 'HD-L', toDate: '2026-10-28' })).success, false);
});

test('sync errors are visible and retrying approval safely repairs attendance without counting leave twice', async () => {
  const h = server({ actorId: HOD_ID, leaves: [request()], writeErrors: { attendance_records: { code: '503' } } });
  const first = await h.approveLeaveRequest({ requestId: 'leave-existing', tenantId: TENANT });
  assert.equal(first.success, true);
  assert.ok(first.warning);
  assert.equal(h.state.leaves[0].status, 'APPROVED');
  h.state.writeErrors = {};
  const retry = await h.approveLeaveRequest({ requestId: 'leave-existing', tenantId: TENANT });
  assert.equal(retry.success, true);
  assert.equal(retry.warning, null);
  assert.equal(h.state.attendance.length, 1);
  h.state.actorId = EMP_ID;
  assert.equal((await h.getEmployeeLeaveBalance({ email: EMAIL, tenantId: TENANT })).data.cl.availed, 1);
});

test('read outages preserve historical fallback with a warning and block new uncertain applications', async () => {
  const h = server({ local: { requests: [request()], cpl_grants: [] }, readErrors: { employee_leaves: { code: '503' } } });
  const history = await h.getMyLeaveRequests({ email: EMAIL, tenantId: TENANT });
  assert.equal(history.success, true);
  assert.equal(history.data[0].id, 'leave-existing');
  assert.ok(history.warning);
  assert.equal((await h.applyEmployeeLeave({ ...application, fromDate: '2026-11-01', toDate: '2026-11-01' })).success, false);
});

test('year-crossing leave uses each IST calendar year quota separately', async () => {
  const h = server({ leaves: [request({ id: 'availed', from_date: '2026-10-01', to_date: '2026-10-07', total_days: 7, status: 'APPROVED' })] });
  const result = await h.applyEmployeeLeave({ ...application, fromDate: '2026-12-31', toDate: '2027-01-01' });
  assert.equal(result.success, true);
  h.state.actorId = HOD_ID;
  assert.equal((await h.approveLeaveRequest({ requestId: result.data.id, tenantId: TENANT })).success, true);
  h.state.actorId = EMP_ID;
  assert.equal((await h.getEmployeeLeaveBalance({ email: EMAIL, tenantId: TENANT, targetYear: 2026 })).data.cl.availed, 8);
  assert.equal((await h.getEmployeeLeaveBalance({ email: EMAIL, tenantId: TENANT, targetYear: 2027 })).data.cl.availed, 1);
});

test('mapped historical applications are imported only when decided and preserve the local source', async () => {
  const h = server({ actorId: HOD_ID, local: { requests: [request()], cpl_grants: [] } });
  assert.equal((await h.getHodPendingLeaveRequests({ tenantId: TENANT })).data.length, 1);
  assert.equal(h.state.leaves.length, 0);
  assert.equal((await h.approveLeaveRequest({ requestId: 'leave-existing', tenantId: TENANT })).success, true);
  assert.equal(h.state.leaves.length, 1);
  assert.equal(h.state.leaves[0].status, 'APPROVED');
  assert.equal(h.state.local.requests[0].status, 'PENDING');
  assert.equal(h.state.diskWrites, 0);
});

test('history paging reads all records rather than silently truncating at a database page limit', async () => {
  const h = server({ leaves: Array.from({ length: 620 }, (_, i) => request({ id: `history-${i}`, status: 'REJECTED' })) });
  const result = await h.getMyLeaveRequests({ email: EMAIL, tenantId: TENANT });
  assert.equal(result.success, true);
  assert.equal(result.data.length, 620);
});

test('explicit profile tenants remain authoritative when the company name uses a legacy mapping', async () => {
  const customTenant = '11111111-1111-1111-1111-111111111111';
  const h = server({ profiles: [{ ...employee, module_access: { ...employee.module_access, _tenantId: customTenant } }] });
  const result = await h.applyEmployeeLeave({ ...application, tenantId: customTenant, userCompany: 'New Swan Group' });
  assert.equal(result.success, true);
  assert.equal(result.data.tenant_id, customTenant);
  assert.equal((await h.getMyLeaveRequests({ email: EMAIL })).data.length, 1);
});

test('leave migration is isolated, additive, repeatable and service-role scoped', () => {
  const sql = fs.readFileSync(new URL('../migrations/39_employee_leaves_persistence.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.employee_leaves/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL.*anon, authenticated/);
  assert.match(sql, /SET LOCAL timezone = 'Asia\/Kolkata'/);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE)\b/i);
  assert.doesNotMatch(sql, /ALTER TABLE (?:public\.)?attendance_records/i);
});

function ui(options = {}) {
  const state = { storage: new Map(), cloud: [], queue: [], ...options };
  let cursor = 0, dirty = true, tree, pending = [], props = options.props || {};
  const slots = [], effects = [], listeners = new Map();
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    createElement: (type, elementProps, ...children) => ({ type, props: elementProps || {}, children }),
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => {
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: { current: initial } }; return slots[i].value; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!effects[i] || !same(effects[i].deps, deps)) pending.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; });
    }
  };
  const resizeCalls = [];
  const Resizer = () => null;
  const actions = new Proxy({
    async getMyLeaveRequests(args) { return state.read ? state.read(args) : { success: true, data: copy(state.cloud) }; },
    async applyEmployeeLeave(args) {
      if (state.apply) return state.apply(args);
      const saved = request({ id: 'saved-application', from_date: args.fromDate, to_date: args.toDate, reason: args.reason });
      state.cloud.unshift(saved);
      return { success: true, data: copy(saved), message: 'Leave application saved' };
    }
  }, { get: (target, key) => target[key] || (async () => ({ success: false })) });
  const exports = load('src/components/Attendance/AttendanceModule.jsx', {
    react, 'lucide-react': new Proxy({}, { get: (_, key) => key }),
    '@/components/common/MobileTableView': 'MobileTableView', '@/components/common/DateRangePicker': 'DateRangePicker',
    '@/app/actions/attendance': actions, '@/utils/attendanceUtils': { ...attendanceUtils, getTodayDateString: () => '2026-10-26' },
    '@/app/actions/tenantBranches': { getTenantBranches: async () => [] },
    '@/utils/geoAttendance': { getCurrentGPSLocation: async () => ({ success: false }) },
    '@/utils/offlineSync': { canPerformOfflineAction: () => ({ allowed: true }), enqueueOfflineAction: async () => 'queued' },
    '@/utils/permissionUtils': permissions,
    '@/utils/tableColumnResize': { ColumnResizer: Resizer, useTableColumnResize: (key, widths, minimums) => {
      resizeCalls.push({ key, widths, minimums });
      return { colWidths: widths, resizingCol: null, handleResizeStart() {}, resetColWidth() {}, getTotalTableWidth: () => 1200 };
    } }
  }, {
    window: { addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); }, removeEventListener: (name, fn) => listeners.get(name)?.delete(fn) },
    navigator: { onLine: true }, localStorage: { getItem: key => state.storage.get(key) || null, setItem: (key, value) => state.storage.set(key, value) },
    queueMicrotask, setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {}, fetch: async () => ({ ok: false })
  });
  const Component = options.parent ? exports.default : exports.LeaveApplicationsTable;
  if (options.parent) props = { userRole: 'agent', userEmail: EMAIL, userName: 'Employee', tenantId: TENANT, moduleAccess: { attendance: true }, ...props };
  const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...(value.children || []).flatMap(nodes)];
  const textOf = value => value == null || typeof value === 'boolean' ? '' : typeof value !== 'object' ? String(value) : Array.isArray(value) ? value.map(textOf).join('') : (value.children || []).map(textOf).join('');
  const harness = {
    state, resizeCalls, Resizer,
    get nodes() { return nodes(tree); },
    get text() { return textOf(tree); },
    get history() { return this.nodes.find(node => node.type === exports.LeaveApplicationsTable)?.props; },
    find(type, label) {
      const found = this.nodes.find(node => node.type === type && (node.props['aria-label'] === label || textOf(node).includes(label)));
      assert.ok(found, `Missing ${type}: ${label}`);
      return found;
    },
    async flush() {
      for (let frame = 0; frame < 30; frame++) {
        if (dirty) { dirty = false; cursor = 0; pending = []; tree = Component(props); for (const effect of pending) effect(); }
        await new Promise(resolve => setImmediate(resolve));
        if (!dirty) return;
      }
      throw new Error('Leave UI did not settle');
    },
    async update(next) { props = { ...props, ...next }; dirty = true; await this.flush(); },
    async click(label) { const button = this.find('button', label); assert.ok(!button.props.disabled); const result = button.props.onClick(); await this.flush(); return result; },
    async change(type, label, value) { this.find(type, label).props.onChange({ target: { value } }); await this.flush(); },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); }
  };
  return harness;
}

test('employee table has standard pagination, sticky headers, resizing and exact counts', async () => {
  const records = Array.from({ length: 60 }, (_, i) => request({ id: `leave-${i}`, reason: `Reason ${i}` }));
  const h = ui({ props: { records, scope: EMAIL } });
  await h.flush();
  assert.ok(h.text.includes('My Leave Applications'));
  assert.ok(h.text.includes('Showing 1 to 25 of 60 records'));
  assert.equal(h.nodes.filter(node => node.type === 'tr').length, 26);
  assert.equal(h.find('button', 'First Page').props.disabled, true);
  assert.ok(h.nodes.filter(node => node.type === 'th').every(node => node.props.style.position === 'sticky' && node.props.style.top === 0 && node.props.style.zIndex === 10));
  assert.equal(h.nodes.filter(node => node.type === h.Resizer).length, h.nodes.filter(node => node.type === 'th').length);
  assert.ok(Object.values(h.resizeCalls[0].minimums).every(value => value >= 60));
  await h.click('Last Page');
  assert.ok(h.text.includes('Showing 51 to 60 of 60 records'));
  assert.equal(h.find('button', 'Next Page').props.disabled, true);
  await h.change('input', 'Search my leave applications', 'Reason 59');
  assert.ok(h.text.includes('Showing 1 to 1 of 1 records'));
  assert.ok(h.text.includes('Page 1 of 1'));
});

test('status, page size, workspace and HOD filters reset pagination to page one', async () => {
  const records = Array.from({ length: 60 }, (_, i) => request({ id: `leave-${i}`, status: i % 2 ? 'APPROVED' : 'PENDING', approver_name: 'Team HOD', approver_remarks: 'Reviewed' }));
  const h = ui({ props: { records, scope: EMAIL } });
  await h.flush();
  await h.click('Next Page');
  await h.change('select', 'Rows per page', '10');
  assert.ok(h.text.includes('Page 1 of 6'));
  await h.click('Next Page');
  await h.change('select', 'Leave application status', 'APPROVED');
  assert.ok(h.text.includes('Showing 1 to 10 of 30 records'));
  assert.ok(h.text.includes('Reviewed'));
  await h.click('Next Page');
  await h.update({ scope: OTHER });
  assert.ok(h.text.includes('Page 1 of 3'));
  const team = ui({ props: { records, teamView: true, filterKey: 'ALL', onDecision() {} } });
  await team.flush();
  await team.click('Next Page');
  await team.update({ filterKey: 'PENDING' });
  assert.ok(team.text.includes('Page 1 of 3'));
  assert.ok(team.text.includes('Employee'));
});

test('empty/error states do not claim missing applications when the service failed', async () => {
  const h = ui({ props: { records: [], error: 'Leave history unavailable' } });
  await h.flush();
  assert.ok(h.text.includes('Leave history unavailable'));
  assert.ok(h.text.includes('Showing 0 to 0 of 0 records'));
  assert.ok(!h.text.includes('No leave applications found.'));
});

test('parent connects saved employee history and refreshes it after an application', async () => {
  const h = ui({ parent: true, cloud: [request()] });
  await h.flush();
  assert.equal(h.history.records.length, 1);
  await h.click('Apply Leave');
  const textarea = h.nodes.find(node => node.type === 'textarea' && node.props.placeholder?.includes('reason for leave'));
  assert.ok(textarea);
  textarea.props.onChange({ target: { value: 'Family work' } });
  await h.flush();
  const form = h.nodes.find(node => node.type === 'form');
  await form.props.onSubmit({ preventDefault() {} });
  await h.flush();
  assert.equal(h.history.records.length, 2);
  assert.equal(h.history.records[0].status, 'PENDING');
  assert.equal(h.history.records[0].reason, 'Family work');
  const reloaded = ui({ parent: true, cloud: copy(h.state.cloud) });
  await reloaded.flush();
  assert.equal(reloaded.history.records.length, 2);
});

test('double submission is blocked and failed saves leave the form/history intact', async () => {
  let resolve, calls = 0;
  const saving = new Promise(done => { resolve = done; });
  const h = ui({ parent: true, cloud: [request()], apply: () => { calls++; return saving; } });
  await h.flush();
  await h.click('Apply Leave');
  const submit = h.nodes.find(node => node.type === 'form').props.onSubmit;
  const first = submit({ preventDefault() {} });
  const second = submit({ preventDefault() {} });
  await h.flush();
  assert.equal(calls, 1);
  resolve({ success: false, error: 'Leave was not saved' });
  await Promise.all([first, second]);
  await h.flush();
  assert.equal(h.history.records.length, 1);
  assert.ok(h.nodes.some(node => node.type === 'form'));
  assert.ok(h.text.includes('Leave was not saved'));
});

test('late employee-history responses cannot expose another account/workspace history', async () => {
  let finish;
  const delayed = new Promise(resolve => { finish = resolve; });
  const h = ui({ parent: true, read: args => args.email === EMAIL ? delayed : { success: true, data: [] } });
  await h.flush();
  await h.update({ userEmail: 'new@example.com', tenantId: OTHER });
  finish({ success: true, data: [request()] });
  await h.flush();
  assert.equal(h.history.records.length, 0);
});
