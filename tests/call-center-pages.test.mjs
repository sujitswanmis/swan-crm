import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { getModulePermissions, getSubItemPermissions, filterVisibleSubTabs } from '../src/utils/permissionUtils.js';
const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const source = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const compile = (file, suffix = '') => swc.transformSync(source(file) + suffix, { filename: file,
  jsc: { parser: { syntax: 'ecmascript', jsx: file.endsWith('.jsx') }, target: 'es2022', transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' }
}).code;
function load(code, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(code, { exports, URL, URLSearchParams, AbortSignal, Buffer, console, setTimeout, clearTimeout,
    process: { env: {} }, require(name) { if (name in imports) return imports[name]; throw new Error(`Unexpected import ${name}`); }, ...globals });
  return exports;
}
const cacheCode = compile('src/components/CallCenter/callCenterViewCache.js');
const pageCode = compile('src/lib/callCenterPageData.js');
const paginationCode = compile('src/components/CallCenter/CallCenterPagination.jsx');
const adminCode = compile('src/components/CallCenter/CallAdminModule.jsx', '\nexport { TabCallLogs, TabEndpoints, CallAdminPage };');
const deskCode = compile('src/components/CallCenter/CallCenterModule.jsx');
const nodes = (tree, predicate) => Array.isArray(tree) ? tree.flatMap(node => nodes(node, predicate)) : !React.isValidElement(tree) ? []
  : [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap(child => nodes(child, predicate))];
const text = tree => Array.isArray(tree) ? tree.map(text).join(' ') : !React.isValidElement(tree) ? String(tree ?? '') : React.Children.toArray(tree.props.children).map(text).join(' ');

test('page snapshots survive refresh, isolate user/tenant scope and exclude nested SIP secrets', () => {
  const storage = new Map();
  const window = { sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } };
  const cache = load(cacheCode, {}, { window });
  const scope = cache.viewScope('employee-a', 'tenant-a', 'Client A');
  cache.writeViewCache(scope, 'admin', { agents: [{ id: 'a', plivo_password: 'SIP-SECRET' }], endpoints: [{ password: 'ENDPOINT-SECRET' }], nested: { authToken: 'TOKEN-SECRET' } });
  const refreshed = load(cacheCode, {}, { window });
  assert.equal(refreshed.readViewCache(scope, 'admin').agents[0].has_password, true);
  assert.ok(![...storage.values()].join('').includes('SECRET'));
  assert.equal(refreshed.readViewCache(refreshed.viewScope('employee-b', 'tenant-a', 'Client A'), 'admin'), null);
  assert.equal(refreshed.readViewCache(refreshed.viewScope('employee-a', 'tenant-b', 'Client A'), 'admin'), null);
  refreshed.clearViewCache(scope, 'admin');
  assert.equal(refreshed.readViewCache(scope, 'admin'), null);
});

test('page snapshots expire and blocked storage does not stop rendering', () => {
  const storage = new Map();
  let time = 0;
  const globals = { Date: { now: () => time }, window: { sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } } };
  const cache = load(cacheCode, {}, globals);
  cache.writeViewCache('scope', 'desk', { data: { id: 'agent' } });
  time = 120001;
  assert.equal(cache.readViewCache('scope', 'desk'), null);
  const blocked = load(cacheCode, {}, { window: { sessionStorage: { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } } } });
  assert.equal(blocked.readViewCache('scope', 'desk'), null);
  assert.doesNotThrow(() => blocked.writeViewCache('scope', 'desk', {}));
});

test('complete live endpoint metadata merges with registry aliases and retains live-only entries', () => {
  const cache = load(cacheCode);
  const merged = cache.mergeEndpointLists([
    { endpoint_key: 'ADMIN0001', endpoint_id: '1', username: 'admin-sip', password: 'stored-example' }
  ], [
    { endpoint_id: '1', username: 'admin-sip', alias: 'Admin', password: null },
    { endpoint_id: '2', username: 'new-sip', alias: 'New Endpoint' }
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].endpoint_key, 'ADMIN0001');
  assert.equal(merged[0].password, 'stored-example');
  assert.equal(merged[1].alias, 'New Endpoint');
});

test('simultaneous page GETs are deduplicated, bounded and retried after failure', async () => {
  let count = 0, release;
  const cache = load(cacheCode, {}, { fetch: async (_url, init) => {
    count++; assert.equal(init.cache, 'no-store'); assert.ok(init.signal);
    await new Promise(resolve => { release = resolve; });
    return { ok: true, json: async () => ({ data: count }) };
  } });
  const first = cache.fetchPageData('/page?viewer=a');
  const second = cache.fetchPageData('/page?viewer=a');
  assert.equal(count, 1); release();
  await Promise.all([first, second]);
  const third = cache.fetchPageData('/page?viewer=a'); assert.equal(count, 2); release(); await third;
  let attempts = 0;
  const failed = load(cacheCode, {}, { fetch: async () => { attempts++; return { ok: false, status: 403, json: async () => ({ error: 'Access denied.' }) }; } });
  await assert.rejects(failed.fetchPageData('/page'), /Access denied/);
  await assert.rejects(failed.fetchPageData('/page'), /Access denied/);
  assert.equal(attempts, 2);
});

test('pagination provides the standard range, sizes, boundary states and last-page navigation', () => {
  const pagination = load(paginationCode, { react: React, 'lucide-react': require('lucide-react') }).default;
  const changes = [];
  let tree = pagination({ total: 83, page: 0, pageSize: 25, onPageChange: value => changes.push(value), onPageSizeChange() {} });
  assert.match(text(tree), /Showing\s+1\s+to\s+25\s+of\s+83\s+records/);
  assert.deepEqual(nodes(tree, node => node.type === 'option').map(node => node.props.value), [10, 25, 50, 100]);
  assert.equal(nodes(tree, node => node.props['aria-label'] === 'First page')[0].props.disabled, true);
  nodes(tree, node => node.props['aria-label'] === 'Last page')[0].props.onClick(); assert.equal(changes[0], 3);
  tree = pagination({ total: 83, page: 3, pageSize: 25, onPageChange() {}, onPageSizeChange() {} });
  assert.equal(nodes(tree, node => node.props['aria-label'] === 'Next page')[0].props.disabled, true);
});

test('a post-save refresh cannot reuse an older in-flight read or erase the newer pending request', async () => {
  const releases = [];
  const cache = load(cacheCode, {}, { fetch: async () => new Promise(resolve => releases.push(resolve)) });
  const old = cache.fetchPageData('/admin');
  const fresh = cache.fetchPageData('/admin', { fresh: true });
  assert.equal(releases.length, 2);
  releases[0]({ ok: true, json: async () => ({ value: 'old' }) }); await old;
  const shared = cache.fetchPageData('/admin');
  assert.equal(releases.length, 2);
  releases[1]({ ok: true, json: async () => ({ value: 'new' }) });
  assert.equal((await fresh).value, 'new'); assert.equal((await shared).value, 'new');
});

// Hook harness runs effects only when their real dependencies change.
function uiHarness() {
  const state = [], refs = [], effects = [], callbacks = []; let cursor = 0, queue = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const hooks = { ...React,
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return refs[i] ??= { current: initial }; },
    useMemo(fn) { cursor++; return fn(); },
    useCallback(fn, deps) { const i = cursor++; if (!equal(callbacks[i]?.deps, deps)) callbacks[i] = { fn, deps }; return callbacks[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!equal(effects[i]?.deps, deps)) queue.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); }
  };
  const requests = [], snapshots = new Map(); let resolver = async url => url.includes('section=profile') ? { data: { id: 'agent-a', display_name: 'Asha' } } : { calls: [], total: 0, agents: [], users: [], endpoints: [] };
  const cache = { mergeEndpointLists: load(cacheCode).mergeEndpointLists, viewScope: (...parts) => JSON.stringify(parts), readViewCache: (scope, key) => snapshots.get(`${scope}:${key}`),
    writeViewCache: (scope, key, value) => snapshots.set(`${scope}:${key}`, value), clearViewCache() {},
    fetchPageData: async url => { requests.push(url); return resolver(url); } };
  const imports = { react: hooks, 'lucide-react': require('lucide-react'), '@/utils/permissionUtils': { getSubItemPermissions, filterVisibleSubTabs },
    './callCenterViewCache': cache, './CallCenterPagination': load(paginationCode, { react: hooks, 'lucide-react': require('lucide-react') }),
    '@/components/common/MobileTableView': { default: ({ children }) => children, useTableViewPreference: () => hooks.useState('table'), TableViewToggle: () => null },
    '@/utils/tableColumnResize': { useTableColumnResize: (_key, widths) => ({ colWidths: widths, getTotalTableWidth: () => 1500 }), ColumnResizer: () => null },
    '../PremiumProgressLoader': { PremiumProgressLoader: () => null },
    '@/app/actions/team': new Proxy({}, { get: () => () => { throw new Error('Page reads must not use Server Actions'); } }) };
  const admin = load(adminCode, imports), desk = load(deskCode, imports).default;
  return { requests, snapshots, cache, admin, desk, setResolver(fn) { resolver = fn; },
    render(Component, props) { cursor = 0; queue = []; return Component(props); }, flush() { const pending = queue; queue = []; pending.forEach(fn => fn()); },
    cleanup() { effects.forEach(effect => effect?.cleanup?.()); } };
}
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 5)); };

test('Call Admin header and call-log tab render immediately without loading employees or live endpoints', () => {
  const app = uiHarness();
  const tree = app.render(app.admin.CallAdminPage, { userId: 'admin', userRole: 'admin', activeSubTab: 'calllogs' });
  assert.match(text(tree), /Call Center Administration/);
  app.flush();
  assert.equal(app.requests.length, 0);
  assert.equal(nodes(tree, node => node.type === app.admin.TabCallLogs).length, 1);
  app.cleanup();
});

test('SIP toolbar groups its title, quota, actions and single view switch above the table', () => {
  const app = uiHarness();
  const tree = app.render(app.admin.TabEndpoints, { initialEndpoints: [{ endpoint_id: '1', alias: 'Example' }] });
  const toolbar = nodes(tree, node => node.props['data-call-toolbar'] === 'endpoints')[0];
  const table = nodes(tree, node => node.props.id === 'CallCenter/CallAdminModule-2')[0];
  assert.match(text(toolbar), /Plivo SIP Endpoints/);
  assert.match(text(toolbar), /Create SIP Endpoint/);
  assert.equal(nodes(toolbar, node => node.props.view === 'table').length, 1);
  assert.equal(table.props.hideToggle, true);
  assert.equal(table.props.view, 'table');
  nodes(toolbar, node => node.props.view === 'table')[0].props.onChange('tiles');
  const next = app.render(app.admin.TabEndpoints, { initialEndpoints: [{ endpoint_id: '1', alias: 'Example' }] });
  assert.equal(nodes(next, node => node.props.id === 'CallCenter/CallAdminModule-2')[0].props.view, 'tiles');
  app.cleanup();
});

test('a late registry response cannot replace the complete live SIP selection list', async () => {
  const app = uiHarness(); let registry;
  app.setResolver(url => {
    if (url.includes('summary=1')) return Promise.resolve({ seatQuota: { total: 300, used: 1, canAdd: true } });
    if (url.includes('/endpoints?')) return Promise.resolve({ endpoints: [
      { endpoint_id: '1', username: 'existing', alias: 'Existing' }, { endpoint_id: '2', username: 'live-only', alias: 'Live Only' }
    ] });
    return new Promise(resolve => { registry = resolve; });
  });
  const props = { userId: 'admin', userRole: 'admin', activeSubTab: 'agents' };
  app.render(app.admin.CallAdminPage, props); app.flush(); await tick();
  registry({ agents: [], users: [], endpoints: [{ endpoint_id: '1', endpoint_key: 'LEGACY', username: 'existing' }] }); await tick();
  const tree = app.render(app.admin.CallAdminPage, props);
  const agents = nodes(tree, node => typeof node.type === 'function' && node.type.name === 'TabAgents')[0];
  assert.equal(agents.props.endpoints.length, 2);
  assert.equal(agents.props.endpointsReady, true);
  assert.equal(agents.props.endpoints[0].endpoint_key, 'LEGACY');
  app.cleanup();
});

test('Telecalling Desk loads its profile once and filters use only one independent call-log read', async () => {
  const app = uiHarness(), props = { userId: 'employee-a' };
  let tree = app.render(app.desk, props);
  assert.match(text(tree), /Telecalling Desk/);
  app.flush(); await tick();
  tree = app.render(app.desk, props); app.flush(); await tick();
  assert.equal(app.requests.filter(url => url.includes('section=profile')).length, 1);
  assert.equal(app.requests.filter(url => url.includes('section=calls')).length, 1);
  nodes(tree, node => node.type === 'input' && node.props.placeholder?.includes('Search'))[0].props.onChange({ target: { value: '9988' } });
  app.render(app.desk, props); app.flush();
  await new Promise(resolve => setTimeout(resolve, 220));
  assert.equal(app.requests.filter(url => url.includes('section=profile')).length, 1);
  assert.equal(app.requests.filter(url => url.includes('section=calls')).length, 2);
  assert.match(app.requests.at(-1), /search=9988/);
  app.cleanup();
});

test('a stale profile cannot replace the current user after a scope change', async () => {
  const app = uiHarness(); let old;
  app.setResolver(url => url.includes('viewer=old') ? new Promise(resolve => { old = resolve; }) : Promise.resolve({ data: { id: 'new-agent', display_name: 'Current Employee' } }));
  app.render(app.desk, { userId: 'old' }); app.flush();
  app.render(app.desk, { userId: 'new' }); app.flush(); await tick();
  old({ data: { id: 'old-agent', display_name: 'Wrong Employee' } }); await tick();
  const tree = app.render(app.desk, { userId: 'new' });
  assert.match(text(tree), /Current Employee/); assert.ok(!text(tree).includes('Wrong Employee'));
  app.cleanup();
});

function serverFixture(options = {}) {
  const role = { user_id: 'admin', role: options.viewOnly ? 'employee' : 'admin', company: 'Client A', tenant_id: 'tenant-a', module_access: options.viewOnly ? { calladmin: { view: true, edit: false } } : {} };
  const log = [];
  const db = { from(table) { let selection; return {
    select(value) { selection = value; return this; }, eq() { return this; }, maybeSingle() { return this; }, in(key, values) { log.push({ key, values }); return this; },
    gte(key, value) { log.push({ key, value }); return this; }, lte() { return this; }, or(value) { log.push({ search: value }); return this; }, order() { return this; },
    range(from, to) { log.push({ from, to }); return this; },
    then(resolve) { return Promise.resolve(table === 'user_roles' ? { data: role } : { data: options.failCalls ? null : [], count: 0, error: options.failCalls ? { message: 'Unavailable' } : null }).then(resolve); }
  }; } };
  const helpers = load(pageCode, { 'server-only': {}, '@supabase/supabase-js': { createClient: () => db },
    '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'admin' } } }) } }) },
    '@/utils/permissionUtils': { getSubItemPermissions, getModulePermissions },
    '@/app/actions/team': { getTeamMembers: async () => [
      { user_id: 'a', emp_name: 'Current Name', company: 'Client A', tenant_id: 'tenant-a', salary_amount: 999, module_access: { private: true } },
      { user_id: 'b', company: 'Client A', tenant_id: 'tenant-b' }
    ], getCallAdminData: async () => ({ agents: [{ id: 'agent-a', user_id: 'a', display_name: 'Old Name' }, { id: 'agent-b', user_id: 'b' }], endpoints: [] }) }
  });
  return { helpers, role, db, log };
}

test('page APIs authenticate and reject foreign tenant scope and read-only credential writes', async () => {
  await assert.rejects(serverFixture({ noUser: true }).helpers.requireCallCenterAccess({ url: 'http://localhost/page' }), error => error.status === 401);
  const app = serverFixture();
  await assert.rejects(app.helpers.requireCallCenterAccess({ url: 'http://localhost/page?tenant_id=tenant-b' }), error => error.status === 403);
  const context = await app.helpers.requireCallCenterAccess({ url: 'http://localhost/page?company=Other' });
  assert.equal(context.company, 'Client A');
  await assert.rejects(serverFixture({ viewOnly: true }).helpers.requireCallCenterAccess({ url: 'http://localhost/page' }, { operation: 'edit' }), error => error.status === 403);
});

test('page reads exclude foreign employees and unrelated salary/module data', async () => {
  const app = serverFixture();
  const data = await app.helpers.readWorkspaceAdmin({ company: 'Client A', tenantId: 'tenant-a' });
  assert.equal(data.users.length, 1); assert.equal(data.agents.length, 1);
  assert.ok(!JSON.stringify(data).includes('salary_amount'));
  assert.ok(!JSON.stringify(data).includes('module_access'));
  assert.equal(app.helpers.employeeLabel(data.agents[0], data.users), 'Current Name');
});

test('call-log query bounds pagination, applies search before range and preserves explicit IST boundaries', async () => {
  const app = serverFixture();
  await app.helpers.readPageCalls({ db: app.db }, new URLSearchParams({ limit: '999999', offset: '-10', search: '9988,()', start_date: '2026-10-26T00:00:00+05:30' }), [{ id: 'agent-a' }]);
  assert.ok(app.log.some(item => item.from === 0 && item.to === 99));
  assert.ok(app.log.some(item => item.search?.includes('customer_number.ilike.%9988%')));
  assert.ok(app.log.some(item => item.value === '2026-10-26T00:00:00+05:30'));
  await assert.rejects(serverFixture({ failCalls: true }).helpers.readPageCalls({ db: serverFixture({ failCalls: true }).db }, new URLSearchParams(), [{ id: 'agent-a' }]), /could not be loaded/);
});
