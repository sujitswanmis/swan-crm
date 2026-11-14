import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as lifecycle from '../src/utils/clientRegistrationLifecycle.js';
import * as permissions from '../src/utils/permissionUtils.js';
import * as branches from '../src/utils/branchAccess.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const source = fs.readFileSync(new URL('../src/app/actions/clientRegistrationSync.js', import.meta.url), 'utf8');
const compiled = await swc.transform(source, { filename: 'clientRegistrationSync.js', jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' } });
const copy = value => JSON.parse(JSON.stringify(value));
const draft = { id: 'draft-1', lead_ref_id: '202611130001', status: 'DRAFT', company: 'Example Motors', our_company: 'NSMLR', created_by: 'Monika', entry_by: 'Monika', created_at: '2026-11-13T10:00:00.000Z', updated_at: '2026-11-13T10:00:00.000Z' };

function harness(overrides = {}) {
  const state = {
    user: { id: 'actor-1', email: 'monika@example.com' },
    member: { role: 'admin', emp_name: 'Monika', company: 'New Swan Group', is_approved: true, module_access: {} },
    rows: [copy(draft)], writes: [], filters: [], partyCalls: 0, ...overrides,
  };
  class Query {
    constructor(table) { this.table = table; this.predicates = []; this.operation = 'read'; }
    select() { return this; }
    eq(key, value) { state.filters.push(['eq', key, value]); this.predicates.push(row => row[key] === value); return this; }
    is(key, value) { this.predicates.push(row => (row[key] ?? null) === value); return this; }
    in(key, values) { state.filters.push(['in', key, values]); this.predicates.push(row => values.includes(row[key])); return this; }
    not(key, _operator, _value) { this.predicates.push(row => row[key] != null); return this; }
    gt(key, value) { state.filters.push(['gt', key, value]); this.predicates.push(row => row[key] > value); return this; }
    lte(key, value) { this.predicates.push(row => row[key] <= value); return this; }
    or(expression) {
      state.filters.push(['or', expression]);
      if (expression === 'status.eq.DRAFT,registration_submitted_at.not.is.null') this.predicates.push(row => row.status === 'DRAFT' || row.registration_submitted_at != null);
      else {
        const clauses = [...expression.matchAll(/(entry_by|created_by)\.eq\.("(?:[^"\\]|\\.)*")/g)];
        this.predicates.push(row => clauses.some(([, key, value]) => row[key] === JSON.parse(value)));
      }
      return this;
    }
    order() { return this; }
    update(payload) { this.operation = 'update'; this.payload = payload; return this; }
    insert(payload) { this.operation = 'insert'; this.payload = payload; return this; }
    execute() {
      if (this.table === 'user_roles') return { data: state.member, error: null };
      if (this.table === 'party_master') { state.partyCalls++; return { data: null, error: null }; }
      if (this.table !== 'leads') return { data: [], error: null };
      if (this.operation === 'update' && state.beforeUpdate) { const fn = state.beforeUpdate; state.beforeUpdate = null; fn(state); }
      const matches = state.rows.filter(row => this.predicates.every(test => test(row)));
      if (this.operation === 'update') {
        if (state.writeError) return { data: null, error: { message: state.writeError } };
        for (const row of matches) { Object.assign(row, this.payload); state.writes.push(copy(this.payload)); }
      } else if (this.operation === 'insert') {
        const inserted = this.payload.map(row => ({ ...row, id: row.id || 'new-lead' }));
        state.rows.push(...inserted); state.writes.push(...inserted); return { data: copy(inserted), error: null };
      }
      return { data: copy(matches), error: null };
    }
    async maybeSingle() { const result = this.execute(); return { ...result, data: Array.isArray(result.data) ? result.data[0] || null : result.data }; }
    async single() { return this.maybeSingle(); }
    async range(start, end) { const result = this.execute(); return { ...result, data: result.data?.slice(start, end + 1) }; }
    then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject); }
  }
  const db = { from: table => new Query(table) };
  const loaded = { exports: {} };
  vm.runInNewContext(compiled.code, { module: loaded, exports: loaded.exports, process: { env: {} }, console: { error() {}, warn() {} },
    require: name => {
      if (name === '@supabase/supabase-js') return { createClient: () => db };
      if (name === '@/utils/supabase/server') return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) };
      if (name === '@/app/actions/audit') return { logAuditAction: async () => {} };
      if (name === '@/app/actions/partyMaster') return { resolveDbTenantUuid: async () => 'tenant', createPartyMaster: async () => { state.partyCalls++; return null; } };
      if (name === '@/utils/branchAccess') return branches;
      if (name === '@/utils/permissionUtils') return permissions;
      if (name === '@/utils/clientRegistrationLifecycle') return lifecycle;
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return { actions: loaded.exports, state };
}

test('draft submission updates the same lead and returns the committed non-draft row', async () => {
  const { actions, state } = harness();
  const result = await actions.submitClientRegistrationAndSync({ ...draft, fromSavedDraft: true }, 'New Swan Group', 'forged-actor');
  assert.equal(result.success, true);
  assert.equal(state.rows.length, 1);
  assert.equal(result.lead.id, draft.id);
  assert.equal(result.lead.lead_ref_id, draft.lead_ref_id);
  assert.equal(result.lead.created_at, draft.created_at);
  assert.equal(result.lead.our_company, 'NSMLR');
  assert.notEqual(result.lead.status, 'DRAFT');
  assert.equal(result.lead.registration_submitted_by, 'Monika');
  assert.ok(result.lead.registration_submitted_at);
});

test('selected custom pipeline stage survives submission and repeat submissions do not overwrite it', async () => {
  const { actions, state } = harness();
  const result = await actions.submitClientRegistrationAndSync({ ...draft, status: '3;02>Qualification Stage>Qualified', fromSavedDraft: true });
  const writeCount = state.writes.length;
  const again = await actions.submitClientRegistrationAndSync({ ...draft, company: 'Stale form', fromSavedDraft: true });
  assert.equal(result.lead.status, '3;02>Qualification Stage>Qualified');
  assert.equal(again.lead.company, draft.company);
  assert.equal(again.lead.status, result.lead.status);
  assert.equal(state.writes.length, writeCount);
});

test('missing or rejected database updates cannot report successful submission', async () => {
  for (const override of [{ rows: [] }, { writeError: 'Database unavailable' }]) {
    const { actions, state } = harness(override);
    const result = await actions.submitClientRegistrationAndSync({ ...draft, fromSavedDraft: true });
    assert.equal(result.success, false);
    assert.equal(state.writes.length, 0);
    if (state.rows[0]) assert.equal(state.rows[0].status, 'DRAFT');
  }
});

test('archive requires a reason, preserves the record, and attributes the authenticated actor', async () => {
  const { actions, state } = harness();
  assert.equal((await actions.deleteClientRegistrationDraft(draft.id, ' ')).success, false);
  assert.equal(state.writes.length, 0);
  const result = await actions.deleteClientRegistrationDraft(draft.id, 'Duplicate — already registered');
  assert.equal(result.success, true);
  assert.equal(state.rows.length, 1);
  assert.equal(state.rows[0].status, 'DRAFT');
  assert.equal(state.rows[0].registration_delete_reason, 'Duplicate — already registered');
  assert.equal(state.rows[0].registration_deleted_by, 'Monika');
  const again = await actions.deleteClientRegistrationDraft(draft.id, 'Different retry reason');
  assert.equal(again.success, true);
  assert.equal(state.writes.length, 1);
  assert.equal(again.draft.registration_delete_reason, 'Duplicate — already registered');
});

test('submitted leads cannot be archived and archived drafts cannot be submitted or resumed for saving', async () => {
  const registered = harness({ rows: [{ ...draft, status: 'Qualified' }] });
  assert.equal((await registered.actions.deleteClientRegistrationDraft(draft.id, 'Duplicate')).success, false);
  const archived = harness({ rows: [{ ...draft, registration_deleted_at: '2026-11-14T00:00:00Z' }] });
  assert.equal((await archived.actions.submitClientRegistrationAndSync({ ...draft, fromSavedDraft: true })).success, false);
  assert.equal((await archived.actions.saveClientRegistrationDraft(draft)).success, false);
  assert.equal(archived.state.writes.length, 0);
});

test('concurrent archive wins safely against a stale final submission', async () => {
  const { actions, state } = harness({ beforeUpdate: state => { state.rows[0].registration_deleted_at = '2026-11-14T00:00:00Z'; } });
  const result = await actions.submitClientRegistrationAndSync({ ...draft, fromSavedDraft: true });
  assert.equal(result.success, false);
  assert.equal(state.rows[0].status, 'DRAFT');
  assert.equal(state.writes.length, 0);
});

test('concurrent submission prevents a stale archive from hiding a registered lead', async () => {
  const { actions, state } = harness({ beforeUpdate: state => { state.rows[0].status = 'Qualified'; state.rows[0].registration_submitted_at = '2026-11-14T01:00:00Z'; } });
  const result = await actions.deleteClientRegistrationDraft(draft.id, 'Duplicate');
  assert.equal(result.success, false);
  assert.equal(state.rows[0].status, 'Qualified');
  assert.equal(state.rows[0].registration_deleted_at, undefined);
});

test('offline draft creation keeps its stable ID and a retry cannot overwrite later edits', async () => {
  const { actions, state } = harness({ rows: [] });
  const payload = { ...draft, id: 'offline-draft', offlineCreate: true };
  const first = await actions.saveClientRegistrationDraft(payload);
  assert.equal(first.success, true);
  assert.equal(first.draft.id, payload.id);
  state.rows[0].company = 'Newer saved form';
  const retry = await actions.saveClientRegistrationDraft(payload);
  assert.equal(retry.success, true);
  assert.equal(retry.draft.company, 'Newer saved form');
  assert.equal(state.rows.length, 1);
  assert.equal(state.writes.length, 1);
});

test('requesting All cannot expand a regular employee beyond their own company and drafts', async () => {
  const { actions } = harness({ member: { role: 'agent', company: 'NSMLR', emp_name: 'Monika', module_access: { registration: { view: true } } }, rows: [copy(draft), { ...draft, id: 'other-company', our_company: 'Acme' }, { ...draft, id: 'other-employee', entry_by: 'Other', created_by: 'Other' }] });
  const result = await actions.getClientRegistrationDrafts('All', 'Other', true, ['Acme', 'NSMLR']);
  assert.equal(result.success, true);
  assert.deepEqual(copy(result.drafts.map(row => row.id)), [draft.id]);
});

test('anonymous callers, other tenants and other employees cannot mutate a draft', async () => {
  const regular = { role: 'agent', company: 'NSMLR', emp_name: 'Someone Else', module_access: { registration: { view: true, write: true } } };
  const otherUser = { id: 'other-user', email: 'someone@example.com' };
  for (const override of [{ user: null }, { member: { ...regular, company: 'Acme' }, user: otherUser }, { member: regular, user: otherUser }]) {
    const { actions, state } = harness(override);
    assert.equal((await actions.submitClientRegistrationAndSync({ ...draft, fromSavedDraft: true }, 'All', 'Monika')).success, false);
    assert.equal((await actions.deleteClientRegistrationDraft(draft.id, 'Duplicate')).success, false);
    assert.equal(state.writes.length, 0);
  }
});

test('history stays default-denied for regular users and module managers, including legacy grants', () => {
  for (const registration of [true, { view: true }, { view: true, is_manager: true }]) {
    const access = { registration };
    assert.equal(permissions.getSubItemPermissions(access, 'agent', 'registration', 'form').view, true);
    assert.equal(permissions.getSubItemPermissions(access, 'agent', 'registration', 'drafts').view, true);
    assert.equal(permissions.getSubItemPermissions(access, 'agent', 'registration', 'submitted').view, false);
    assert.equal(permissions.getSubItemPermissions(access, 'agent', 'registration', 'deleted').view, false);
  }
  assert.equal(permissions.getSubItemPermissions({ registration: { view: true, sub_items: { submitted: { view: true } } } }, 'agent', 'registration', 'submitted').view, true);
});

test('server rejects ungranted history views even when client claims view-all permission', async () => {
  const { actions } = harness({ member: { role: 'agent', company: 'NSMLR', emp_name: 'Monika', module_access: { registration: { view: true, is_manager: true } } } });
  assert.equal((await actions.getClientRegistrationDrafts('All', 'Monika', true, null, { view: 'submitted' })).success, false);
  assert.equal((await actions.getClientRegistrationDrafts('All', 'Monika', true, null, { view: 'deleted' })).success, false);
});

test('draft delta includes tombstones and uses modified-time filtering', async () => {
  const submitted = { ...draft, status: 'Qualified', registration_submitted_at: '2026-11-14T01:00:00Z', updated_at: '2026-11-14T01:00:00Z' };
  const { actions, state } = harness({ rows: [submitted] });
  const result = await actions.getClientRegistrationDrafts('NSMLR', 'Monika', true, null, { since: '2026-11-13T12:00:00Z' });
  assert.equal(result.success, true);
  assert.deepEqual(copy(result.drafts), [{ id: draft.id, _removed: true }]);
  assert.ok(state.filters.some(filter => filter[0] === 'gt' && filter[1] === 'updated_at'));
  assert.equal(lifecycle.mergeRegistrationRows([draft], result.drafts, 'drafts').length, 0);
});

test('history and draft lists remain mutually exclusive after transitions', () => {
  const submitted = { ...draft, status: 'Qualified', registration_submitted_at: '2026-11-14T01:00:00Z' };
  const deleted = { ...draft, registration_deleted_at: '2026-11-14T01:00:00Z' };
  assert.equal(lifecycle.mergeRegistrationRows([draft], [submitted], 'drafts').length, 0);
  assert.equal(lifecycle.mergeRegistrationRows([], [submitted], 'submitted').length, 1);
  assert.equal(lifecycle.mergeRegistrationRows([draft], [deleted], 'drafts').length, 0);
  assert.equal(lifecycle.mergeRegistrationRows([], [deleted], 'deleted').length, 1);
  assert.equal(lifecycle.mergeRegistrationRows([], [draft], 'submitted').length, 0);
});

test('all four route IDs match the permission catalog and role defaults', async () => {
  async function load(relative) {
    const moduleRequire = createRequire(new URL(relative, import.meta.url));
    const code = await swc.transform(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'), { filename: relative, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' } });
    const loaded = { exports: {} };
    vm.runInNewContext(code.code, { module: loaded, exports: loaded.exports, require: name => {
      if (name === 'react') return { createElement: () => null };
      if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
      if (name.startsWith('@/')) return require(new URL(`../src/${name.slice(2)}${/\.js$/.test(name) ? '' : '.js'}`, import.meta.url));
      return moduleRequire(name);
    } });
    return loaded.exports;
  }
  const catalog = await load('../src/config/modulesConfig.jsx');
  assert.deepEqual(copy(catalog.MODULES_CONFIG.find(module => module.id === 'registration').subItems.map(tab => tab.id)), lifecycle.REGISTRATION_TABS.map(tab => tab.id));
  const { ROLE_PRESETS } = await load('../src/components/UserManagement/utils/rolePresets.js');
  for (const preset of ROLE_PRESETS) {
    const admin = ['admin', 'master_admin'].includes(preset.key);
    for (const id of ['submitted', 'deleted']) assert.equal(preset.presetData.registration.sub_items[id].view, admin, `${preset.key}: ${id}`);
  }
  for (const tab of lifecycle.REGISTRATION_TABS) assert.equal(lifecycle.registrationView(tab.path), tab.id);
});

async function registrationUI({ online = true, result, queueResult = { queueId: 'queued' } } = {}) {
  const slots = []; let cursor = 0;
  const state = { requests: [], queued: [], callbacks: [], cached: [], alerts: [], pathname: '/registration/drafts', archiving: [] };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn,
  };
  const columns = { colWidths: {}, getTotalTableWidth: () => 1500, handleResizeStart() {}, resetColWidth() {} };
  const file = new URL('../src/components/ClientRegistration.jsx', import.meta.url);
  const code = await swc.transform(fs.readFileSync(file, 'utf8'), { filename: 'ClientRegistration.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' } });
  const loaded = { exports: {} };
  const storage = { getItem: () => null, setItem() {} };
  const supabase = { auth: { getUser: async () => ({ data: { user: { email: 'admin@example.com' } } }) } };
  vm.runInNewContext(code.code, { module: loaded, exports: loaded.exports, console: { error() {}, warn() {} }, Intl, Date, Map, Set,
    window: { history: { pushState(_a, _b, path) { state.pathname = path; } }, localStorage: storage, dispatchEvent() {}, scrollTo() {}, confirm: () => true },
    localStorage: storage, navigator: { onLine: online }, CustomEvent: class {}, alert: message => state.alerts.push(message),
    require: name => {
      if (name === 'react') return react;
      if (name === 'next/navigation') return { usePathname: () => state.pathname };
      if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
      if (name === '@/utils/supabase/client') return { createClient: () => supabase };
      if (name === '@/constants/indianLocations') return { INDIAN_STATES: [], INDIAN_DISTRICTS_MAP: {}, getDistrictsForState: () => [] };
      if (name === '@/utils/permissionUtils') return permissions;
      if (name === '@/utils/branchAccess') return branches;
      if (name === '@/utils/tableColumnResize') return { default: () => columns, useTableColumnResize: () => columns, ColumnResizer: 'resizer', __esModule: true };
      if (name === '@/utils/clientRegistrationLifecycle') return { ...lifecycle, getRegistrationSnapshot: key => ({ rows: key.endsWith(':drafts') ? [copy(draft)] : [], cursor: null }), notifyRegistrationChanged() {} };
      if (name === '@/utils/dataSanitizer') return { normalizeLeadRecord: row => ({ ...row }), normalizeEmployeeName: name => name, resolveTeamMemberId: () => null };
      if (name === '@/utils/offlineSync') return { sanitizeLeadPayloadForDb: row => ({ ...row }), canPerformOfflineAction: () => ({ allowed: true }),
        enqueueOfflineAction: async (...args) => { state.queued.push(args); return queueResult; }, upsertLeadsLocally: async rows => state.cached.push(...rows), showSyncToast() {} };
      if (name === '@/app/actions/clientRegistrationSync') return {
        submitClientRegistrationAndSync: async payload => { state.requests.push(payload); return result || { success: true, lead: { ...draft, status: 'Qualified', registration_submitted_at: '2026-11-14T01:00:00Z' } }; },
        deleteClientRegistrationDraft: async (...args) => { state.archiving.push(args); return { success: true, draft: { ...draft, registration_deleted_at: '2026-11-14T01:00:00Z' } }; },
      };
      return new Proxy({}, { get: (_target, key) => key === 'default' ? () => null : () => [] });
    },
  });
  function walk(node, predicate) {
    if (node && typeof node === 'object') {
      if (predicate(node)) return node;
      for (const child of node.children || []) { const found = walk(child, predicate); if (found) return found; }
    }
    return null;
  }
  const props = { userId: 'actor', userRole: 'admin', userCompany: 'New Swan Group', userName: 'Admin',
    onRegistrationSuccess: row => state.callbacks.push(row), branchAccess: { isAllBranches: true, allowedCompanies: ['NSMLR'] } };
  function render() { cursor = 0; return loaded.exports.default(props); }
  const find = (tree, type, text = '') => walk(tree, node => node.type === type && (!text || JSON.stringify(node.children).includes(text)));
  function resume() {
    const tree = render();
    const button = walk(tree, node => node.type === 'button' && node.props.title === 'Resume & Complete Registration');
    assert.ok(button); button.props.onClick();
    return render();
  }
  return { state, render, find, resume, walk };
}

test('actual form handler submits a resumed draft ID and publishes only the canonical response', async () => {
  const ui = await registrationUI();
  const form = ui.find(ui.resume(), 'form');
  assert.ok(form);
  await form.props.onSubmit({ preventDefault() {} });
  assert.equal(ui.state.requests.length, 1);
  assert.equal(ui.state.requests[0].id, draft.id);
  assert.equal(ui.state.requests[0].fromSavedDraft, true);
  assert.notEqual(ui.state.requests[0].status, 'DRAFT');
  assert.equal(ui.state.callbacks[0].status, 'Qualified');
  assert.equal(ui.state.cached[0].id, draft.id);
  assert.equal(ui.state.archiving.length, 0, 'final submit never invokes draft deletion');
});

test('failed final submission keeps the form open and publishes no lead or success callback', async () => {
  const ui = await registrationUI({ result: { success: false, error: 'Database rejected update' } });
  await ui.find(ui.resume(), 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(ui.state.callbacks.length, 0);
  assert.equal(ui.state.cached.length, 0);
  assert.ok(ui.state.alerts.some(message => message.includes('Database rejected update')));
  assert.ok(ui.find(ui.render(), 'form'));
});

test('offline final submission queues the original draft without claiming cloud success', async () => {
  const ui = await registrationUI({ online: false });
  await ui.find(ui.resume(), 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(ui.state.requests.length, 0);
  assert.equal(ui.state.queued[0][0], 'submit');
  assert.equal(ui.state.queued[0][1], 'registration_lifecycle');
  assert.equal(ui.state.queued[0][2].id, draft.id);
  assert.equal(ui.state.callbacks.length, 0);
});

test('an uncommitted offline queue preserves the form and reports an error', async () => {
  const ui = await registrationUI({ online: false, queueResult: null });
  await ui.find(ui.resume(), 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(ui.state.callbacks.length, 0);
  assert.ok(ui.state.alerts.some(message => message.includes('Your draft has been preserved')));
});

test('delete dialog requires a reason and sends it together with the original draft ID', async () => {
  const ui = await registrationUI();
  const button = ui.walk(ui.render(), node => node.type === 'button' && node.props.title === 'Delete Draft');
  button.props.onClick();
  let tree = ui.render();
  assert.equal(ui.find(tree, 'button', 'Delete with Reason').props.disabled, true);
  ui.find(tree, 'textarea').props.onChange({ target: { value: 'Duplicate lead already exists' } });
  tree = ui.render();
  await ui.find(tree, 'button', 'Delete with Reason').props.onClick();
  assert.deepEqual(ui.state.archiving[0], [draft.id, 'Duplicate lead already exists']);
});
