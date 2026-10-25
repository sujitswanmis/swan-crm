import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();

const tenantId = '00000000-0000-0000-0000-000000000001';
const tick = () => new Promise(resolve => setImmediate(resolve));
let moduleNumber = 0;
const cacheModule = () => import(`../src/utils/partyWorkspaceCache.js?test=${++moduleNumber}`);
const context = { tenantId, company: 'New Swan Group', userId: 'employee-1', userRole: 'employee' };

function browser({ blockedStorage = false, holdReads = false } = {}) {
  const snapshots = new Map();
  const storage = new Map();
  const reads = [];
  const events = [];
  const listeners = new Map();
  const db = {
    objectStoreNames: { contains: () => true }, close() {},
    transaction() {
      return { objectStore: () => ({
        get(key) {
          const request = {};
          const result = snapshots.get(key);
          const finish = () => { request.result = result; request.onsuccess?.(); };
          if (holdReads) reads.push(finish); else queueMicrotask(finish);
          return request;
        },
        put(value, key) { snapshots.set(key, structuredClone(value)); }
      }) };
    }
  };
  globalThis.window = {
    localStorage: {
      getItem(key) { if (blockedStorage) throw new Error('Blocked'); return storage.get(key) || null; },
      setItem(key, value) { if (blockedStorage) throw new Error('Blocked'); storage.set(key, value); }
    },
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
    dispatchEvent(event) { events.push(event); listeners.get(event.type)?.forEach(callback => callback(event)); },
    indexedDB: { open() { const request = { result: db }; queueMicrotask(() => request.onsuccess?.()); return request; } }
  };
  return { snapshots, events, releaseReads: () => reads.splice(0).forEach(finish => finish()) };
}

test('refresh restores persisted rows without fetching; user, tenant, company and permissions are isolated', async () => {
  browser();
  const cache = await cacheModule();
  const scope = cache.createPartyWorkspaceScope(context);
  await cache.fetchPartyWorkspaceResource(scope, 'parties', async () => [{ id: 'party-1' }]);
  await tick();
  const afterReload = await cacheModule();
  assert.deepEqual(await afterReload.readPartyWorkspaceCache(scope, 'parties'), [{ id: 'party-1' }]);
  for (const change of [{ userId: 'employee-2' }, { tenantId: 'another' }, { company: 'another' }, { userRole: 'admin' }, { moduleAccess: { party: false } }]) {
    assert.equal(await afterReload.readPartyWorkspaceCache(afterReload.createPartyWorkspaceScope({ ...context, ...change }), 'parties'), null);
  }
  assert.equal(cache.createPartyWorkspaceScope({ tenantId }), null);
});

test('overlapping loads share one request; revalidation still fetches current data', async () => {
  browser();
  const cache = await cacheModule();
  const scope = cache.createPartyWorkspaceScope(context);
  let calls = 0;
  let release;
  const loader = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const first = cache.fetchPartyWorkspaceResource(scope, 'queue', loader);
  const second = cache.fetchPartyWorkspaceResource(scope, 'queue', loader);
  await tick();
  assert.equal(calls, 1);
  release(['old']);
  assert.deepEqual(await Promise.all([first, second]), [['old'], ['old']]);
  assert.deepEqual(await cache.fetchPartyWorkspaceResource(scope, 'queue', async () => ['new']), ['new']);
  assert.deepEqual(await cache.readPartyWorkspaceCache(scope, 'queue'), ['new']);
});

test('failed refresh retains successful rows and can be retried', async () => {
  browser();
  const cache = await cacheModule();
  const scope = cache.createPartyWorkspaceScope(context);
  await cache.fetchPartyWorkspaceResource(scope, 'queue', async () => ['saved']);
  await assert.rejects(cache.fetchPartyWorkspaceResource(scope, 'queue', async () => { throw new Error('Offline'); }), /Offline/);
  assert.deepEqual(await cache.readPartyWorkspaceCache(scope, 'queue'), ['saved']);
  assert.deepEqual(await cache.fetchPartyWorkspaceResource(scope, 'queue', async () => []), []);
  assert.deepEqual(await cache.readPartyWorkspaceCache(scope, 'queue'), []);
});

test('save invalidation prevents an older in-flight request from restoring stale rows', async () => {
  const env = browser();
  const cache = await cacheModule();
  const scope = cache.createPartyWorkspaceScope(context);
  let release;
  const old = cache.fetchPartyWorkspaceResource(scope, 'queue', () => new Promise(resolve => { release = resolve; }));
  await tick();
  cache.invalidatePartyWorkspace(scope, 'channel');
  await cache.fetchPartyWorkspaceResource(scope, 'queue', async () => ['after-save']);
  release(['before-save']);
  await assert.rejects(old, /newer refresh/);
  assert.deepEqual(await cache.readPartyWorkspaceCache(scope, 'queue'), ['after-save']);
  assert.equal(env.events.at(-1).detail.source, 'channel');
});

test('cache expiry and IST date rollover reject old snapshots', async () => {
  const env = browser();
  const cache = await cacheModule();
  const scope = cache.createPartyWorkspaceScope(context);
  await cache.fetchPartyWorkspaceResource(scope, 'queue', async () => ['saved']);
  await tick();
  const entry = [...env.snapshots.values()][0];
  entry.savedAt = Date.now() - 31 * 60 * 1000;
  assert.equal(await (await cacheModule()).readPartyWorkspaceCache(scope, 'queue'), null);
  entry.savedAt = Date.now();
  entry.day = '2000-01-01';
  assert.equal(await (await cacheModule()).readPartyWorkspaceCache(scope, 'queue'), null);
});

test('a slow disk-cache read cannot overwrite a newer network result', async () => {
  const env = browser({ holdReads: true });
  const cache = await cacheModule();
  const scope = cache.createPartyWorkspaceScope(context);
  await cache.fetchPartyWorkspaceResource(scope, 'queue', async () => ['old']);
  await tick();
  const afterReload = await cacheModule();
  const restore = afterReload.readPartyWorkspaceCache(scope, 'queue');
  await tick();
  await afterReload.fetchPartyWorkspaceResource(scope, 'queue', async () => ['new']);
  env.releaseReads();
  assert.deepEqual(await restore, ['new']);
  assert.deepEqual(await afterReload.readPartyWorkspaceCache(scope, 'queue'), ['new']);
});

test('storage disabled still permits network reads and in-memory invalidation', async () => {
  browser({ blockedStorage: true });
  const cache = await cacheModule();
  const scope = cache.createPartyWorkspaceScope(context);
  await cache.fetchPartyWorkspaceResource(scope, 'queue', async () => ['saved']);
  assert.deepEqual(await cache.readPartyWorkspaceCache(scope, 'queue'), ['saved']);
  cache.invalidatePartyWorkspace(scope, 'party');
  assert.equal(await cache.readPartyWorkspaceCache(scope, 'queue'), null);
  assert.deepEqual(await cache.fetchPartyWorkspaceResource(null, 'queue', async () => ['network']), ['network']);
});

function loadActions(filename, dependencies, fixedTime = null) {
  const source = fs.readFileSync(new URL(filename, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const names = Object.keys(dependencies);
  const Clock = fixedTime ? class extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedTime])); }
    static now() { return new Date(fixedTime).getTime(); }
  } : Date;
  return new Function(...names, 'Date', `${source}\nreturn { ${filename.includes('partyWorkspaceData') ? 'getPartyWorkspaceData, getChannelWorkspaceData' : filename.includes('partyMaster') ? 'getPartyList' : 'getPartyOrderSchedules, getDailyOrderFollowupQueue'} };`)(...Object.values(dependencies), Clock);
}

function queryClient(tables, started = [], gate = null) {
  return { from(table) {
    const query = {
      select() { return query; }, eq(field, value) { assert.equal(field, 'tenant_id'); assert.equal(value, tenantId); return query; },
      in() { return query; },
      order() { return query; },
      then(resolve, reject) {
        started.push(table);
        return Promise.resolve(gate?.(table)).then(() => tables[table] || { data: [] }).then(resolve, reject);
      }
    };
    return query;
  } };
}

function dependencies(client, getPartyList) {
  const unexpected = () => { throw new Error('An unrelated tab was fetched'); };
  return {
    getAdminClient: () => client, getPartyList,
    getOrderFollowups: unexpected, getOrderFeedbackList: unexpected, getMonthlyFeedbackList: unexpected,
    getComplaintsList: unexpected, getEmployeesMaster: unexpected, getStatesCentral: unexpected,
    getDistrictsCentral: unexpected, getTransferredLeads: unexpected, getOrderPipelineList: unexpected,
    getDeliveredOrdersPendingFeedback: unexpected
  };
}

test('daily queue reads parties once and starts independent database reads concurrently', async () => {
  const started = [];
  let releaseParties;
  const parties = new Promise(resolve => { releaseParties = resolve; });
  const client = queryClient({}, started);
  const actions = loadActions('../src/app/actions/partyWorkspaceData.js', dependencies(client, () => { started.push('parties'); return parties; }));
  const response = actions.getChannelWorkspaceData(tenantId, 'order_followup');
  await tick();
  assert.deepEqual(new Set(started), new Set(['parties', 'party_order_schedules', 'party_order_followups']));
  assert.equal(started.filter(name => name === 'parties').length, 1);
  releaseParties([{ id: 'p1', firm_name: 'Partner' }]);
  const result = await response;
  assert.equal(result.success, true);
  assert.equal(result.data[0].party.firm_name, 'Partner');
});

test('optimized frequency and queue preserve existing records, defaults and call counts', async () => {
  const parties = [{ id: 'p1', firm_name: 'Partner' }, { id: 'p2', firm_name: 'New Partner' }];
  const tables = {
    party_order_schedules: { data: [{ id: 's1', party_id: 'p1', frequency_type: 'WEEKLY', weekly_days: ['FRI'], next_due_date: '2026-10-24', is_active: false }] },
    party_order_followups: { data: [
      { id: 'f2', party_id: 'p1', created_at: '2026-10-26T06:30:00Z', call_status: 'ORDER_PLACED', assigned_caller_name: 'Caller' },
      { id: 'f1', party_id: 'p1', created_at: '2026-10-24T06:30:00Z', call_status: 'NO_ORDER' }
    ] }
  };
  const client = queryClient(tables);
  const getPartyList = async () => parties;
  const now = '2026-10-26T07:00:00Z';
  const optimized = loadActions('../src/app/actions/partyWorkspaceData.js', dependencies(client, getPartyList), now);
  const original = loadActions('../src/app/actions/orderFulfillment.js', { getAdminClient: () => client, getPartyList }, now);
  assert.deepEqual((await optimized.getChannelWorkspaceData(tenantId, 'frequency_rules')).data, await original.getPartyOrderSchedules(tenantId));
  assert.deepEqual((await optimized.getChannelWorkspaceData(tenantId, 'order_followup')).data, await original.getDailyOrderFollowupQueue(tenantId));
});

test('queue completion uses IST even when the UTC calendar date differs', async () => {
  const client = queryClient({ party_order_followups: { data: [{ id: 'f1', party_id: 'p1', created_at: '2026-10-25T20:00:00Z' }] } });
  const actions = loadActions('../src/app/actions/partyWorkspaceData.js', dependencies(client, async () => [{ id: 'p1' }]), '2026-10-25T20:30:00Z');
  const response = await actions.getChannelWorkspaceData(tenantId, 'order_followup');
  assert.equal(response.data[0].next_due_date, '2026-10-26');
  assert.equal(response.data[0].isCompletedToday, true);
});

test('database failures are reported instead of replacing cached queue with an empty success', async () => {
  const client = queryClient({ party_order_followups: { error: { message: 'Database unavailable' } } });
  const actions = loadActions('../src/app/actions/partyWorkspaceData.js', dependencies(client, async () => [{ id: 'p1' }]));
  assert.equal((await actions.getChannelWorkspaceData(tenantId, 'order_followup')).success, false);
  assert.equal((await actions.getChannelWorkspaceData('bad-tenant', 'order_followup')).success, false);
});

test('Party list enrichment stays backward compatible while lead and optional reads overlap', async () => {
  const started = [];
  let releaseLead;
  const leadReady = new Promise(resolve => { releaseLead = resolve; });
  const tables = {
    party_master: { data: [{ id: 'p1', firm_name: 'Partner', source_lead_id: 'l1', party_contacts: [{ contact_name: 'Contact' }] }] },
    leads: { data: [{ id: 'l1', state: 'Punjab', phone: '9999999999' }] },
    party_product_authorizations: { data: [{ party_id: 'p1', product_category: 'Rotavator' }] },
    party_territory_allocations: { data: [{ party_id: 'p1', zone: 'North' }] },
    party_team_assignments: { data: [{ party_id: 'p1', role: 'CRM' }] }
  };
  const client = queryClient(tables, started, table => table === 'leads' ? leadReady : undefined);
  const actions = loadActions('../src/app/actions/partyMaster.js', { createSupabaseClient: () => client });
  const response = actions.getPartyList(null);
  await tick();
  assert.equal(started.includes('leads'), true);
  assert.equal(started.includes('party_product_authorizations'), true);
  assert.equal(started.includes('party_territory_allocations'), true);
  assert.equal(started.includes('party_team_assignments'), true);
  releaseLead();
  const [party] = await response;
  assert.equal(party.firm_name, 'Partner');
  assert.equal(party.contact_person_name_1, 'Contact');
  assert.equal(party.contact_mobile_1_1, '9999999999');
  assert.equal(party.product_category, 'Rotavator');
  assert.equal(party.zone, 'North');
  assert.equal(party.team_assignments[0].role, 'CRM');
  const failing = loadActions('../src/app/actions/partyMaster.js', {
    createSupabaseClient: () => queryClient({ party_master: { error: new Error('Unavailable') } })
  });
  assert.deepEqual(await failing.getPartyList(tenantId), []);
  await assert.rejects(failing.getPartyList(tenantId, { throwOnError: true }), /Unavailable/);
});

function componentHarness(filename, modules) {
  const source = fs.readFileSync(new URL(filename, import.meta.url), 'utf8');
  const compiled = swc.transformSync(source, {
    filename, jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022', transform: { react: { runtime: 'classic' } } },
    module: { type: 'commonjs' }
  }).code;
  const cells = [];
  const effects = [];
  const components = new Map();
  const timers = new Map();
  let cursor = 0;
  let timerId = 0;
  let tree;
  let props;
  let changed = true;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!cells[index]) cells[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [cells[index].value, next => {
        const value = typeof next === 'function' ? next(cells[index].value) : next;
        if (!Object.is(value, cells[index].value)) { cells[index].value = value; changed = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return (cells[index] ||= { current: initial }); },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!same(cells[index]?.deps, deps)) cells[index] = { value: factory(), deps };
      return cells[index].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!same(cells[index]?.deps, deps)) {
        effects.push(() => { cells[index]?.cleanup?.(); cells[index] = { deps, cleanup: effect() }; });
      }
    }
  };
  const resize = (first, second) => ({ columnWidths: typeof first === 'object' ? first : second,
    startResize() {}, resetWidths() {}, getTableTotalWidth: () => 1200 });
  const exports = {};
  const noop = () => {};
  vm.runInNewContext(compiled, {
    exports, console, window: globalThis.window, CustomEvent, Intl, Date,
    setTimeout(callback, ms = 0) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id), setInterval: () => 0, clearInterval: noop,
    require(name) {
      if (name === 'react') return hooks;
      if (modules[name]) return modules[name];
      if (name.includes('tableColumnResize')) return { __esModule: true, default: resize, useTableColumnResize: resize, ColumnResizer: noop };
      if (name.includes('MobileTableView')) return { __esModule: true, default: noop, useTableViewPreference: () => ['table', noop], TableViewToggle: noop };
      if (name.includes('indianStateDistricts')) return { INDIAN_STATE_DISTRICTS: {}, ALL_INDIAN_STATES: [] };
      if (name.includes('productCatalog')) return { PRODUCT_GROUPS: [{ name: 'Default product' }] };
      if (name.includes('StageConfigModal')) return { __esModule: true, default: noop, B2B_OPERATIONAL_STATUSES: [] };
      if (name.includes('supabase/client')) return { createClient: () => ({ channel() { return this; }, on() { return this; }, subscribe() { return this; }, removeChannel() {} }) };
      if (name === 'lucide-react') return new Proxy({}, { get: () => noop });
      if (!components.has(name)) components.set(name, function Component() {});
      return components.get(name);
    }
  });
  function render() {
    cursor = 0;
    changed = false;
    tree = exports.default(props);
    effects.splice(0).forEach(run => run());
  }
  return {
    async update(next) {
      props = next;
      changed = true;
      await this.flush();
    },
    async flush() {
      for (let step = 0; step < 10; step++) {
        if (changed) render();
        for (const [id, timer] of timers) if (timer.ms === 0) { timers.delete(id); timer.callback(); }
        await tick();
        if (!changed && ![...timers.values()].some(timer => timer.ms === 0)) break;
      }
    },
    find(predicate) {
      const found = [];
      function visit(node) {
        if (Array.isArray(node)) { node.forEach(visit); return; }
        if (!node || typeof node !== 'object') return;
        if (predicate(node)) found.push(node);
        visit(node.props?.children);
      }
      visit(tree);
      return found;
    },
    component(name) { return components.get(name); },
    unmount() { cells.forEach(cell => cell.cleanup?.()); }
  };
}

test('real Channel module displays cached rows while revalidating and loads only the selected tab', async () => {
  browser();
  const cache = await cacheModule();
  const props = { tenantId, userCompany: context.company, userId: context.userId, userRole: context.userRole, initialSubTab: 'order_followup' };
  const scope = cache.createPartyWorkspaceScope(context);
  await cache.fetchPartyWorkspaceResource(scope, 'channel:order_followup', async () => [{ party_id: 'saved' }]);
  const calls = [];
  let release;
  const ui = componentHarness('../src/components/Party/ChannelOperationsModule.jsx', {
    '@/utils/partyWorkspaceCache': cache,
    '@/app/actions/partyWorkspaceData': { getChannelWorkspaceData: async (_tenant, tab) => {
      calls.push(tab);
      return new Promise(resolve => { release = resolve; });
    } }
  });
  await ui.update(props);
  const child = () => ui.find(node => node.type === ui.component('../Orders/DailyFollowupQueueTable'))[0];
  assert.equal(child().props.queue[0].party_id, 'saved');
  assert.equal(child().props.loading, false);
  assert.deepEqual(calls, ['order_followup']);
  release({ success: true, data: [{ party_id: 'latest' }] });
  await ui.flush();
  assert.equal(child().props.queue[0].party_id, 'latest');
  await ui.update({ ...props, activeSubTab: 'frequency_rules' });
  assert.deepEqual(calls, ['order_followup', 'frequency_rules']);
  release({ success: true, data: [] });
  await ui.flush();
  ui.unmount();
});

test('real Party module renders the list before supporting requests complete', async () => {
  browser();
  const cache = await cacheModule();
  const calls = [];
  const ui = componentHarness('../src/components/Party/PartyMasterModule.jsx', {
    '@/utils/partyWorkspaceCache': cache,
    '@/app/actions/partyWorkspaceData': { getPartyWorkspaceData: async (_tenant, section = 'parties') => {
      calls.push(section);
      if (section === 'parties') return { success: true, data: [{ id: 'p1', firm_name: 'Loaded Partner' }] };
      return new Promise(() => {});
    } }
  });
  await ui.update({ tenantId, userCompany: context.company, userEmail: 'caller@example.com', userRole: context.userRole });
  const dashboard = ui.find(node => node.type === ui.component('./PartyMasterDashboard'))[0];
  assert.equal(dashboard.props.parties[0].firm_name, 'Loaded Partner');
  assert.equal(calls[0], 'parties');
  assert.equal(calls.filter(section => section === 'parties').length, 1);
  ui.unmount();
});

test('real Daily table defers ledger/products and preserves Order Punch pricing and save payload', async () => {
  browser();
  const cache = await cacheModule();
  let productReads = 0;
  let ledgerReads = 0;
  let refreshed = 0;
  let saved;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const ui = componentHarness('../src/components/Orders/DailyFollowupQueueTable.jsx', {
    '@/utils/partyWorkspaceCache': cache,
    '@/utils/orderFrequency': { formatISTDateTime: value => value, formatISTShortDate: value => value },
    '@/app/actions/tenantProducts': { getTenantProducts: async () => { productReads++; return [{ name: 'Configured product', price: 1250 }]; } },
    '@/app/actions/orderFulfillment': {
      getDailyCallLogLedger: async () => { ledgerReads++; return []; },
      saveOrderFollowupAndRecur: async payload => { saved = payload; return { success: true, generated_order_no: 'SO1' }; }
    }
  });
  await ui.update({ tenantId, userCompany: context.company, userId: context.userId, onRefresh: () => refreshed++,
    queue: [{ party_id: 'p1', next_due_date: today, party: { id: 'p1', firm_name: 'Partner' } }] });
  assert.equal(productReads, 0);
  assert.equal(ledgerReads, 0);
  const punch = ui.find(node => node.type === 'button' && React.Children.toArray(node.props.children).some(child => child === 'Order Punch'))[0];
  assert.ok(punch);
  await punch.props.onClick();
  await ui.flush();
  assert.equal(productReads, 1);
  const form = ui.find(node => node.type === 'form')[0];
  await form.props.onSubmit({ preventDefault() {} });
  assert.equal(saved.party_id, 'p1');
  assert.equal(saved.order_line_items[0].product, 'Configured product');
  assert.equal(saved.order_line_items[0].rate, 1250);
  assert.equal(refreshed, 1);
  assert.equal(ledgerReads, 0);
  ui.unmount();
});
