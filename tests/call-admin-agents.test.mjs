import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { getSubItemPermissions } from '../src/utils/permissionUtils.js';
import { normalizeIndianPhoneNumber } from '../src/app/api/plivo/phone-number.js';
import { outboundRoomToken } from '../src/app/api/plivo/outbound-intent.js';
import { buildOutboundDialXml } from '../src/app/api/plivo/outbound-dial-xml.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const copy = value => JSON.parse(JSON.stringify(value));
const source = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compile = (path, suffix = '') => swc.transformSync(source(path) + suffix, {
  filename: path,
  jsc: { parser: { syntax: 'ecmascript', jsx: path.endsWith('.jsx') }, target: 'es2022', transform: { react: { runtime: 'classic' } } },
  module: { type: 'commonjs' }
}).code;
const code = {
  team: compile('src/app/actions/team.js'),
  quota: compile('src/utils/telephonyConfig.js'),
  start: compile('src/app/api/plivo/start-call/route.js'),
  outbound: compile('src/app/api/plivo/outbound-dial/route.js'),
  token: compile('src/app/api/plivo/token/route.js'),
  incoming: compile('src/app/api/plivo/incoming/route.js'),
  endpointId: compile('src/app/api/plivo/agent-endpoint-id/route.js'),
  profile: compile('src/app/api/plivo/agent-profile/route.js'),
  ui: compile('src/components/CallCenter/CallAdminModule.jsx', '\nexport { TabAgents };'),
  widget: compile('src/components/CallCenter/GlobalSoftphoneWidget.jsx')
};
const PHONE = '+918065583111';
const DEFAULT_PHONE = '+918035340622';

function fixture(options = {}) {
  const roles = [
    { user_id: 'admin', role: 'admin', company: 'NSMLR', module_access: {}, email: 'admin@example.test' },
    { user_id: 'employee-a', emp_name: 'Asha Verma', emp_id: '50714', emp_status: 'Active', company: 'NSMLR', module_access: {}, email: 'asha@example.test' },
    { user_id: 'employee-b', emp_name: 'Bina Singh', emp_status: 'Active', company: 'NSMLR', module_access: {} },
    { user_id: 'other-tenant', emp_name: 'Other Employee', emp_status: 'Active', company: 'Client B', module_access: {} }
  ];
  const agents = [
    { id: 'agent-a', user_id: 'employee-a', display_name: 'Asha Verma', is_active: true, status: 'offline', agent_code: 'legacy-code-a', outgoing_caller_id: null, plivo_username: 'sip-a', plivo_password: 'test-password', plivo_sip_uri: 'sip:a@example.test', default_calling_mode: 'browser_webrtc' },
    { id: 'agent-b', user_id: 'employee-b', display_name: 'Bina Singh', is_active: true, status: 'offline', agent_code: 'legacy-code-b', outgoing_caller_id: null, plivo_username: 'sip-b', plivo_sip_uri: 'sip:b@example.test' },
    { id: 'agent-other', user_id: 'other-tenant', is_active: true, outgoing_caller_id: null },
    { id: 'system', user_id: null, is_active: false, plivo_username: 'system_settings_forward' }
  ];
  const tables = { user_roles: roles, call_agents: agents, call_sessions: [], agent_endpoint_registry: [], tenants: [], tenant_entitlements: [], leads: [] };
  const log = { queries: [], writes: [], provider: [], fetches: [], quota: [] };
  const db = { from(table) {
    let operation = 'select', payload, columns = '*', singular = false, maxRows = Infinity;
    const filters = [];
    const query = {
      select(value = '*') { columns = value; return this; },
      eq(key, value) { filters.push(row => row[key] === value); return this; },
      neq(key, value) { filters.push(row => row[key] !== value); return this; },
      is(key, value) { filters.push(row => value === null ? row[key] == null : row[key] === value); return this; },
      in(key, values) { filters.push(row => values.includes(row[key])); return this; },
      or() { return this; }, order() { return this; },
      limit(value) { maxRows = value; return this; },
      insert(value) { operation = 'insert'; payload = value; return this; },
      update(value) { operation = 'update'; payload = value; return this; },
      single() { singular = true; return this; }, maybeSingle() { singular = true; return this; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          log.queries.push({ table, operation, columns });
          if (options.legacySchema && columns.includes('outgoing_caller_id')) return { data: null, error: { code: '42703', message: 'column missing' } };
          if (options.legacyRoles && table === 'user_roles' && columns.includes('tenant_id')) return { data: null, error: { code: '42703' } };
          if (options.failWrite && operation !== 'select') return { data: null, error: { code: '23505', message: 'Synthetic save failure' } };
          if (options.profileReadFailure && table === 'call_agents' && operation === 'select') return { data: null, error: { message: 'Synthetic profile read failure' } };
          const rows = tables[table] || [];
          let matches = rows.filter(row => filters.every(filter => filter(row))).slice(0, maxRows);
          if (operation === 'insert') {
            const row = { id: `new-${rows.length}`, ...copy(payload) };
            rows.push(row); matches = [row];
          } else if (operation === 'update') {
            matches.forEach(row => Object.assign(row, copy(payload)));
          }
          if (operation !== 'select') log.writes.push({ table, payload: copy(payload) });
          const projected = matches.map(row => {
            if (columns === '*') return copy(row);
            return Object.fromEntries(columns.split(',').map(key => key.trim()).filter(key => key in row).map(key => [key, copy(row[key])]));
          });
          return { data: singular ? projected[0] || null : projected, error: null };
        }).then(resolve, reject);
      }
    };
    return query;
  } };
  const config = { authId: 'test-account', authToken: 'test-token', fromNumber: DEFAULT_PHONE, callingSeatLimit: 300 };
  const dependencies = {
    'next/server': require('next/server'),
    '@supabase/supabase-js': { createClient: () => db },
    '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: options.userId || 'admin' } } }) } }) },
    './adminMessageConfig': {}, './audit': {}, '@/lib/impersonateStore': {},
    '@/utils/reportingHierarchy': { getReportingFields: () => ({}) },
    '@/utils/permissionUtils': { getSubItemPermissions },
    '@/app/api/plivo/phone-number': { normalizeIndianPhoneNumber },
    '@/app/api/plivo/outbound-intent': { outboundRoomToken },
    '@/app/api/plivo/outbound-dial-xml': { buildOutboundDialXml },
    '@/app/api/plivo/utils': { getPlivoWebhookBaseUrl: () => 'https://webhook.example.test' },
    '@/utils/telephonyConfig': {
      getWorkspaceTelephonyConfig: async () => config,
      getWorkspaceCallingSeatQuota: async (...args) => { log.quota.push(args); return { used: 2, total: 300, canAdd: !options.fullQuota }; }
    },
    plivo: { Client: class {
      calls = { create: async (...args) => { log.provider.push(args); return { requestUuid: 'test-call' }; } };
      endpoints = { list: async () => [{ username: 'sip-a', sipRegistered: true }, { username: 'sip-b', sipRegistered: true }] };
    } }
  };
  function load(compiled, extra = {}) {
    const exports = {};
    vm.runInNewContext(compiled, {
      exports, Buffer, AbortSignal, AbortController, URL, URLSearchParams, global: {},
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-key', PLIVO_FROM_NUMBER: DEFAULT_PHONE } },
      console: { error() {}, warn() {}, log() {} },
      fetch: async url => {
        assert.match(String(url), /^https:\/\/api\.plivo\.com\/v1\/Account\/test-account\/(Number|Endpoint)\//);
        log.fetches.push(String(url));
        if (String(url).includes('/Endpoint/')) {
          const index = log.fetches.filter(value => value.includes('/Endpoint/')).length - 1;
          return { ok: !options.endpointFailure, json: async () => options.endpointPages?.[index] || {
            objects: [{ endpoint_id: '174793004058391', username: 'sip-a' }], meta: { next: null }
          } };
        }
        return { ok: true, json: async () => ({ objects: [{ number: PHONE.slice(1) }] }) };
      },
      require(name) { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
      ...extra
    });
    return exports;
  }
  return { tables, log, dependencies, load, team: load(code.team), quota: () => load(code.quota), config };
}

test('two employees can share a caller ID without altering legacy agent codes or credentials', async () => {
  const app = fixture();
  for (const id of ['agent-a', 'agent-b']) {
    const result = await app.team.saveCallAgentCallerIdAdmin(id, PHONE);
    assert.equal(result.success, true);
    assert.equal(result.data.outgoing_caller_id, PHONE);
  }
  assert.equal(app.tables.call_agents[0].agent_code, 'legacy-code-a');
  assert.equal(app.tables.call_agents[0].plivo_password, 'test-password');
  assert.equal(app.tables.call_agents[1].outgoing_caller_id, PHONE);
  assert.ok(app.log.writes.every(write => Object.keys(write.payload).join() === 'outgoing_caller_id'));
});

test('workspace default clears the dedicated override and failures are reported', async () => {
  const app = fixture();
  app.tables.call_agents[0].outgoing_caller_id = PHONE;
  assert.equal((await app.team.saveCallAgentCallerIdAdmin('agent-a', null)).success, true);
  assert.equal(app.tables.call_agents[0].outgoing_caller_id, null);
  assert.equal(app.log.fetches.length, 0);
  const failing = fixture({ failWrite: true });
  const result = await failing.team.saveCallAgentCallerIdAdmin('agent-a', PHONE);
  assert.equal(result.success, false);
  assert.match(result.error, /save failure/);
});

test('missing migration gives a precise error; unrelated numbers and foreign tenants cannot be changed', async () => {
  const legacy = fixture({ legacySchema: true });
  const result = await legacy.team.saveCallAgentCallerIdAdmin('agent-a', PHONE);
  assert.equal(result.success, false);
  assert.equal(result.migrationRequired, true);
  assert.match(result.error, /34_call_agent_outgoing_caller_id/);
  const app = fixture();
  assert.equal((await app.team.saveCallAgentCallerIdAdmin('agent-a', '+919999999999')).success, false);
  assert.equal((await app.team.saveCallAgentCallerIdAdmin('agent-other', PHONE)).success, false);
  assert.equal((await app.team.setCallAgentAuthorizationAdmin('system', false)).success, false);
  assert.equal(app.log.writes.length, 0);
});

test('unauthenticated and view-only users cannot save caller IDs or revoke access', async () => {
  const loggedOut = fixture({ noUser: true });
  assert.equal((await loggedOut.team.saveCallAgentCallerIdAdmin('agent-a', PHONE)).success, false);
  const app = fixture();
  Object.assign(app.tables.user_roles[0], { role: 'agent', module_access: { calladmin: { view: true, edit: false, add: false } } });
  assert.equal((await app.team.setCallAgentAuthorizationAdmin('agent-a', false)).success, false);
  assert.equal((await app.team.saveCallAgentCallerIdAdmin('agent-a', PHONE)).success, false);
  assert.equal(app.log.writes.length, 0);
});

test('revoke preserves call history and SIP settings; re-authorize restores the same profile', async () => {
  const app = fixture();
  app.tables.call_sessions.push({ id: 'history', agent_id: 'agent-a', status: 'ended' });
  const original = copy(app.tables.call_agents[0]);
  assert.equal((await app.team.setCallAgentAuthorizationAdmin('agent-a', false)).success, true);
  assert.equal(app.tables.call_agents[0].is_active, false);
  assert.equal(app.tables.call_agents[0].plivo_password, original.plivo_password);
  assert.equal(app.tables.call_agents[0].plivo_sip_uri, original.plivo_sip_uri);
  assert.equal((await app.team.addCallAgentAdmin('employee-a', 'Untrusted name', 'Client B')).success, true);
  assert.equal(app.tables.call_agents.length, 4);
  assert.equal(app.tables.call_agents[0].is_active, true);
  assert.equal(app.tables.call_agents[0].display_name, 'Asha Verma');
  assert.deepEqual(app.tables.call_sessions, [{ id: 'history', agent_id: 'agent-a', status: 'ended' }]);
});

test('active calls, busy agents and full seat allocations prevent unsafe changes', async () => {
  for (const status of ['initiated', 'ringing', 'agent_answered', 'customer_ringing', 'connected']) {
    const app = fixture();
    app.tables.call_sessions.push({ id: 'live', agent_id: 'agent-a', status });
    const result = await app.team.setCallAgentAuthorizationAdmin('agent-a', false);
    assert.equal(result.success, false);
    assert.match(result.error, /call in progress/);
    assert.equal(app.log.writes.length, 0);
  }
  const busy = fixture();
  busy.tables.call_agents[0].status = 'on_call';
  assert.equal((await busy.team.setCallAgentAuthorizationAdmin('agent-a', false)).success, false);
  const full = fixture({ fullQuota: true });
  full.tables.call_agents[0].is_active = false;
  assert.equal((await full.team.setCallAgentAuthorizationAdmin('agent-a', true)).success, false);
  assert.equal(full.tables.call_agents[0].is_active, false);
});

test('self-activation cannot bypass an administrator revocation', async () => {
  const app = fixture();
  app.tables.call_agents[0].is_active = false;
  const result = await app.team.autoProvisionCallAgent('employee-a', 'NSMLR');
  assert.equal(result.success, false);
  assert.match(result.error, /revoked/);
  assert.equal(app.log.writes.length, 0);
});

test('calling seats count only authorized employees and support the legacy user schema', async () => {
  const app = fixture({ legacyRoles: true });
  app.tables.call_agents[1].is_active = false;
  const quota = await app.quota().getWorkspaceCallingSeatQuota('New Swan Group');
  assert.equal(quota.used, 1);
  assert.equal(quota.total, 300);
  assert.equal(quota.available, 299);
  assert.equal(quota.canAdd, true);
  assert.equal((await app.quota().getWorkspaceCallingSeatQuota('Client B')).used, 1);
});

test('revoked agents cannot obtain SIP credentials or create outbound sessions', async () => {
  const app = fixture({ userId: 'employee-a' });
  app.tables.call_agents[0].is_active = false;
  const token = await app.load(code.token).POST({});
  assert.equal(token.status, 403);
  const body = await token.json();
  assert.equal(body.revoked, true);
  assert.equal(body.password, undefined);
  const start = await app.load(code.start).POST({ json: async () => ({ customerNumber: '9876543210', callingMode: 'browser_webrtc' }) });
  assert.equal(start.status, 403);
  assert.equal(app.tables.call_sessions.length, 0);
  assert.equal(app.log.provider.length, 0);
});

test('new caller ID reaches both outbound legs; clearing it uses workspace default despite a legacy code', async () => {
  for (const value of [PHONE, null]) {
    const app = fixture({ userId: 'employee-a' });
    app.tables.call_agents[0].agent_code = '+918012345678';
    app.tables.call_agents[0].outgoing_caller_id = value;
    const result = await app.load(code.start).POST({ json: async () => ({ customerNumber: '9876543210', callingMode: 'browser_webrtc', roomName: 'room_test' }) });
    assert.equal(result.status, 200);
    assert.equal(app.log.provider[0][0], value || DEFAULT_PHONE);
    const response = await app.load(code.outbound).POST({ url: 'https://webhook.example.test/api/plivo/outbound-dial?room=room_test', text: async () => 'CallUUID=test-call' });
    assert.ok((await response.text()).includes(`callerId="${value || DEFAULT_PHONE}"`));
  }
});

test('pending migration retains working legacy caller IDs on both outbound legs', async () => {
  const app = fixture({ userId: 'employee-a', legacySchema: true });
  app.tables.call_agents[0].agent_code = PHONE;
  const result = await app.load(code.start).POST({ json: async () => ({ customerNumber: '9876543210', callingMode: 'browser_webrtc', roomName: 'room_legacy' }) });
  assert.equal(result.status, 200);
  assert.equal(app.log.provider[0][0], PHONE);
  const response = await app.load(code.outbound).POST({ url: 'https://webhook.example.test/api/plivo/outbound-dial?room=room_legacy', text: async () => 'CallUUID=test-call' });
  assert.ok((await response.text()).includes(`callerId="${PHONE}"`));
});

test('sticky inbound routing skips revoked SIP endpoints and rings an authorized employee', async () => {
  const app = fixture();
  app.tables.call_agents[0].is_active = false;
  app.tables.call_sessions.push({ id: 'previous', agent_id: 'agent-a', customer_number: '+919876543210', status: 'ended' });
  const response = await app.load(code.incoming).POST({ text: async () => 'From=%2B919876543210&To=%2B918035340622', headers: { get: () => 'webhook.example.test' } });
  const xml = await response.text();
  assert.ok(!xml.includes('sip:a@example.test'));
  assert.ok(xml.includes('sip:b@example.test'));
});

function uiHarness(options = {}) {
  const app = fixture();
  const states = []; let cursor = 0;
  const hooks = { ...React,
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return states[i] ??= { current: initial }; },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect() {}
  };
  app.dependencies.react = hooks;
  app.dependencies['lucide-react'] = require('lucide-react');
  app.dependencies['@/components/common/MobileTableView'] = ({ children }) => children;
  app.dependencies['../PremiumProgressLoader'] = { PremiumProgressLoader: () => null };
  app.dependencies['@/utils/tableColumnResize'] = { useTableColumnResize: (_key, widths) => ({ colWidths: widths, getTotalTableWidth: () => 1500 }), ColumnResizer: () => null };
  app.dependencies['@/app/actions/team'] = {
    saveCallAgentCallerIdAdmin: async (id, value) => {
      if (options.failSave) return { success: false, error: 'Synthetic save failure' };
      Object.assign(app.tables.call_agents.find(agent => agent.id === id), { outgoing_caller_id: value });
      return { success: true, data: { id, outgoing_caller_id: value } };
    },
    setCallAgentAuthorizationAdmin: (...args) => app.team.setCallAgentAuthorizationAdmin(...args)
  };
  const ui = app.load(code.ui, { window: { confirm: () => true } });
  const props = { users: app.tables.user_roles, agents: app.tables.call_agents, endpoints: [], defaultCallerId: DEFAULT_PHONE,
    seatQuota: { canAdd: true, used: 3, total: 300 }, onRefresh: async () => {}, updateCallAgentAdmin: async () => ({ success: true }), addCallAgentAdmin: () => {} };
  return { ...app, props, render() { cursor = 0; return ui.TabAgents(props); } };
}

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap(child => nodes(child, predicate))];
}
const text = tree => !React.isValidElement(tree) ? String(tree ?? '') : React.Children.toArray(tree.props.children).map(text).join(' ');

test('agent table searches employee ID, email, SIP and caller ID without rendering system settings', () => {
  const app = uiHarness();
  app.tables.call_agents[0].outgoing_caller_id = PHONE;
  for (const query of ['50714', 'ASHA@EXAMPLE.TEST', 'sip:a@example.test', PHONE, 'Asha NSMLR']) {
    let tree = app.render();
    nodes(tree, node => node.props['aria-label'] === 'Search call agents')[0].props.onChange({ target: { value: query } });
    tree = app.render();
    const rows = nodes(tree, node => node.type === 'tbody')[0];
    assert.equal(nodes(rows, node => node.type === 'tr').length, 1);
    assert.match(text(rows), /Asha Verma/);
    assert.ok(!text(rows).includes('System Forwarding'));
  }
});

test('table header stays in a bounded scroll region and retains every column resizer', () => {
  const tree = uiHarness().render();
  const region = nodes(tree, node => node.props.id === 'calladmin-agents-scroll')[0];
  assert.equal(region.props.style.overflow, 'auto');
  assert.equal(region.props.style.maxHeight, '65vh');
  const header = nodes(region, node => node.type === 'thead')[0];
  assert.equal(header.props.style.position, 'sticky');
  assert.equal(header.props.style.top, 0);
  assert.equal(nodes(header, node => node.type === 'th').length, 7);
  assert.equal(nodes(header, node => node.props.colKey !== undefined).length, 7);
});

test('caller-ID UI displays confirmed saves and actual failures instead of an unconditional tick', async () => {
  for (const failSave of [false, true]) {
    const app = uiHarness({ failSave });
    let tree = app.render();
    await nodes(tree, node => node.props.title === 'Select specific Outgoing Caller ID for this agent')[0].props.onChange({ target: { value: PHONE } });
    tree = app.render();
    const feedback = nodes(tree, node => node.props.role === (failSave ? 'alert' : 'status'));
    assert.ok(feedback.some(node => text(node).includes(failSave ? 'Synthetic save failure' : 'Caller ID saved')));
    const input = nodes(tree, node => node.props.title === 'Select specific Outgoing Caller ID for this agent')[0];
    assert.equal(input.props.value, failSave ? '' : PHONE);
  }
});

test('numeric endpoint IDs and registry mappings do not require a provider lookup or alter assignments', async () => {
  const app = fixture({ userId: 'employee-a' });
  app.tables.call_agents[0].plivo_endpoint_key = '174793004058391';
  assert.equal((await app.team.getAgentEndpointId('employee-a')).endpointId, '174793004058391');
  app.tables.call_agents[0].plivo_endpoint_key = 'ADMIN0001';
  app.tables.agent_endpoint_registry.push({ username: 'sip-a', endpoint_id: '174793004058391' });
  assert.equal((await app.team.getAgentEndpointId('employee-a')).endpointId, '174793004058391');
  assert.equal(app.tables.call_agents[0].plivo_endpoint_key, 'ADMIN0001');
  assert.equal(app.log.fetches.length, 0);
  assert.equal(app.log.writes.length, 0);
});

test('legacy endpoint keys resolve by the assigned SIP username across provider pages and cache the numeric ID', async () => {
  const app = fixture({ userId: 'employee-a', endpointPages: [
    { objects: [{ endpoint_id: '999999', username: 'another-user', alias: 'ADMIN0001' }], meta: { next: 'next-page' } },
    { objects: [{ endpoint_id: '174793004058391', username: 'sip-a' }], meta: { next: null } }
  ] });
  app.tables.call_agents[0].plivo_endpoint_key = 'ADMIN0001';
  const original = copy(app.tables.call_agents[0]);
  const result = await app.team.getAgentEndpointId('employee-a');
  assert.equal(result.endpointId, '174793004058391');
  assert.equal(app.log.fetches.length, 2);
  assert.ok(app.log.fetches[1].endsWith('offset=1'));
  assert.equal((await app.team.getAgentEndpointId('employee-a')).endpointId, result.endpointId);
  assert.equal(app.log.fetches.length, 2);
  assert.deepEqual(app.tables.call_agents[0], original);
  assert.equal(app.log.writes.length, 0);
});

test('endpoint metadata failures never return the internal key or change the calling profile', async () => {
  const app = fixture({ userId: 'employee-a', endpointFailure: true });
  app.tables.call_agents[0].plivo_endpoint_key = 'ADMIN0001';
  const result = await app.team.getAgentEndpointId('employee-a');
  assert.equal(result.endpointId, null);
  assert.equal(app.tables.call_agents[0].plivo_endpoint_key, 'ADMIN0001');
  assert.equal(app.tables.call_agents[0].plivo_password, 'test-password');
  assert.equal(app.tables.call_agents[0].is_active, true);
  assert.equal(app.log.writes.length, 0);
});

test('endpoint ID lookup requires authentication and respects employee workspace boundaries', async () => {
  const loggedOut = fixture({ noUser: true });
  assert.equal((await loggedOut.team.getAgentEndpointId('employee-a')).endpointId, null);
  assert.equal(loggedOut.log.fetches.length, 0);
  const app = fixture({ userId: 'employee-a' });
  assert.equal((await app.team.getAgentEndpointId('other-tenant')).endpointId, null);
  assert.equal(app.log.fetches.length, 0);
});

function endpointWidgetHarness(lookup, options = {}) {
  const app = fixture();
  const state = { 0: false, 1: false, 3: 'online', 13: {
    id: 'agent-a', plivo_endpoint_key: 'ADMIN0001', plivo_username: 'sip-a', plivo_sip_uri: 'sip:a@example.test'
  } };
  if ('initialAgent' in options) state[13] = options.initialAgent;
  const storage = options.storage || new Map();
  const requests = [];
  const props = { userId: 'employee-a' };
  let cursor = 0;
  const effects = [];
  app.dependencies.react = { ...React,
    useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useRef: value => ({ current: value }), useCallback: fn => fn, useEffect: effect => effects.push(effect)
  };
  Object.assign(app.dependencies, {
    'lucide-react': require('lucide-react'), 'react-draggable': ({ children }) => children,
    './ActiveCallPanel': () => null, './Softphone.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
    './useSoftphoneContacts': { useSoftphoneContacts: () => number => options.contacts?.[normalizeIndianPhoneNumber(number)] || { name: 'UnKnow Person' } },
    '@/utils/supabase/client': { createClient: () => ({}) },
    '@/app/actions/team': { getRecentCalls: async () => [], getAgentEndpointId: () => { throw new Error('Display reads must not use the Server Action queue'); } },
    '@/lib/softphoneIncomingCall': { createIncomingCallGuard: () => ({}), incomingCallUuid: () => null }
  });
  const widget = app.load(code.widget, {
    window: { sessionStorage: {
      getItem(key) { if (options.storageFailure) throw new Error('Storage blocked'); return storage.get(key) || null; },
      setItem(key, value) { if (options.storageFailure) throw new Error('Storage blocked'); storage.set(key, value); }
    } },
    fetch: async (url, init) => {
      requests.push({ url, ...init });
      if (url.startsWith('/api/plivo/agent-profile?')) {
        return options.profileFetch ? options.profileFetch(url, init) : { ok: true, json: async () => ({ data: copy(state[13]) }) };
      }
      assert.ok(url.startsWith('/api/plivo/agent-endpoint-id?'));
      const result = await lookup(url, init);
      return { ok: options.endpointOk !== false, json: async () => result };
    }
  }).default;
  const render = () => { cursor = 0; effects.length = 0; return widget(props); };
  return { state, props, storage, requests, render,
    resolveEffect: () => effects.find(effect => String(effect).includes('resolveEndpointId')),
    profileEffect: () => effects.find(effect => String(effect).includes('fetchAgent')) };
}

test('softphone displays the actual numeric endpoint ID without changing the online connection or calling toggle', async () => {
  const app = endpointWidgetHarness(async () => ({ endpointId: '174793004058391', error: null }));
  let tree = app.render();
  assert.equal(text(nodes(tree, node => node.props.className === 'endpoint')[0]), 'Endpoint ID:  N/A');
  app.resolveEffect()();
  await new Promise(resolve => setImmediate(resolve));
  tree = app.render();
  assert.match(text(nodes(tree, node => node.props.className === 'endpoint')[0]), /Endpoint ID:.*174793004058391/);
  assert.ok(!text(nodes(tree, node => node.props.className === 'endpoint')[0]).includes('ADMIN0001'));
  assert.equal(app.state[3], 'online');
  assert.equal(app.state[13].plivo_endpoint_key, 'ADMIN0001');
  assert.equal(nodes(tree, node => node.props.role === 'group').length, 1);
});

test('an old endpoint lookup cannot change the label after the assignment changes or the widget unmounts', async () => {
  let complete;
  const app = endpointWidgetHarness(() => new Promise(resolve => { complete = resolve; }));
  app.render();
  const cleanup = app.resolveEffect()();
  await new Promise(resolve => setImmediate(resolve));
  cleanup();
  app.state[13] = { ...app.state[13], plivo_endpoint_key: 'TC0002', plivo_username: 'sip-b' };
  complete({ endpointId: '174793004058391' });
  await new Promise(resolve => setImmediate(resolve));
  const label = text(nodes(app.render(), node => node.props.className === 'endpoint')[0]);
  assert.ok(!label.includes('174793004058391'));
  assert.ok(!label.includes('TC0002'));
  assert.equal(app.state[3], 'online');
});

test('incoming and connecting caller cards display verified names instead of unverified SIP header names', () => {
  const number = '+916283362779';
  const app = endpointWidgetHarness(async () => ({}), { contacts: { [number]: { name: 'Tenant Party Business', source: 'party' } } });
  app.state[7] = { callerNumber: number, callerName: number, leadName: 'Unverified Header Name', leadCompany: 'Other Tenant' };
  let tree = app.render();
  assert.ok(text(tree).includes('Tenant Party Business'));
  assert.ok(!text(tree).includes('Unverified Header Name'));
  assert.ok(!text(tree).includes('Other Tenant'));
  app.state[7] = null;
  app.state[6] = { customerNumber: number };
  tree = app.render();
  assert.ok(text(tree).includes('Tenant Party Business'));
  assert.ok(text(tree).includes('6283362779'));
  app.state[6] = { customerNumber: '+919999999999' };
  assert.ok(text(app.render()).includes('UnKnow Person'));
});

test('endpoint metadata is reused immediately after refresh only for the same user and SIP assignment', async () => {
  const first = endpointWidgetHarness(async () => ({ endpointId: '174793004058391' }));
  first.render(); first.resolveEffect()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(first.requests.length, 1);
  assert.equal(first.requests[0].cache, 'no-store');
  assert.equal(first.requests[0].credentials, 'same-origin');
  assert.equal(first.storage.size, 1);
  const cached = JSON.parse([...first.storage.values()][0]);
  assert.deepEqual(Object.keys(cached).sort(), ['endpointId', 'expiresAt', 'reference']);
  assert.ok(!JSON.stringify(cached).includes('password'));

  const refreshed = endpointWidgetHarness(() => { throw new Error('A fresh cache must skip the network'); }, { storage: first.storage });
  refreshed.render(); refreshed.profileEffect()();
  await new Promise(resolve => setImmediate(resolve));
  refreshed.render(); refreshed.resolveEffect()();
  assert.match(text(nodes(refreshed.render(), node => node.props.className === 'endpoint')[0]), /174793004058391/);
  assert.equal(refreshed.requests.filter(request => request.url.startsWith('/api/plivo/agent-endpoint-id')).length, 0);

  for (const change of ['user', 'assignment', 'expiry']) {
    const storage = new Map(first.storage);
    const next = endpointWidgetHarness(async () => ({ endpointId: '222222222222222' }), { storage });
    if (change === 'user') next.props.userId = 'employee-b';
    if (change === 'assignment') next.state[13] = { ...next.state[13], plivo_username: 'sip-b' };
    if (change === 'expiry') storage.set([...storage.keys()][0], JSON.stringify({ ...cached, expiresAt: Date.now() - 1 }));
    next.render(); next.resolveEffect()();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(next.requests.length, 1, change);
    assert.ok(!text(nodes(next.render(), node => node.props.className === 'endpoint')[0]).includes('174793004058391'), change);
  }
});

test('blocked storage, HTTP errors and malformed metadata leave dialing state intact without caching failures', async () => {
  for (const options of [{ storageFailure: true }, { endpointOk: false }, { invalidId: true }]) {
    const app = endpointWidgetHarness(async () => ({ endpointId: options.invalidId ? 'ADMIN0001' : '174793004058391' }), options);
    app.render(); app.resolveEffect()();
    await new Promise(resolve => setImmediate(resolve));
    const tree = app.render();
    assert.equal(app.state[3], 'online');
    assert.equal(app.state[13].plivo_username, 'sip-a');
    assert.equal(nodes(tree, node => node.props.role === 'group').length, 1);
    assert.equal(app.storage.size, 0);
    if (!options.storageFailure) assert.match(text(nodes(tree, node => node.props.className === 'endpoint')[0]), /N\/A/);
  }
});

test('the softphone launcher renders before startup data arrives and loads the profile outside the action queue', async () => {
  let finishProfile;
  const app = endpointWidgetHarness(async () => ({ endpointId: null }), { initialAgent: null,
    profileFetch: () => new Promise(resolve => { finishProfile = resolve; }) });
  let tree = app.render();
  const loading = nodes(tree, node => node.props.title === 'Loading CRM Softphone')[0];
  assert.ok(loading);
  assert.equal(loading.props.disabled, true);
  assert.equal(loading.props['aria-busy'], true);
  assert.equal(nodes(tree, node => node.props.role === 'group').length, 0);
  app.profileEffect()();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].url, '/api/plivo/agent-profile?userId=employee-a');
  finishProfile({ ok: true, json: async () => ({ data: {
    id: 'agent-a', plivo_endpoint_key: 'ADMIN0001', plivo_username: 'sip-a',
    default_calling_mode: 'mobile', user_landing_mobile: '+919876543210'
  } }) });
  await new Promise(resolve => setImmediate(resolve));
  tree = app.render();
  assert.equal(nodes(tree, node => node.props.title === 'Loading CRM Softphone').length, 0);
  assert.equal(app.state[13].id, 'agent-a');
  assert.equal(app.state[15], 'mobile');
  assert.equal(app.state[16], '9876543210');
  assert.equal(app.storage.size, 0, 'The calling profile and SIP credentials are not persisted');
});

test('startup failures show retry, non-agents disappear, and canceled profile requests cannot restore old credentials', async () => {
  let attempts = 0;
  const retry = endpointWidgetHarness(async () => ({}), { initialAgent: null,
    profileFetch: async () => ({ ok: ++attempts > 1, json: async () => ({ data: null }) }) });
  retry.render(); retry.profileEffect()();
  await new Promise(resolve => setImmediate(resolve));
  const button = nodes(retry.render(), node => node.props.title === 'Retry loading CRM Softphone')[0];
  assert.equal(button.props.disabled, false);
  button.props.onClick();
  retry.render(); retry.profileEffect()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(retry.render(), null);
  assert.equal(attempts, 2);

  let finish;
  const old = endpointWidgetHarness(async () => ({}), { initialAgent: null,
    profileFetch: () => new Promise(resolve => { finish = resolve; }) });
  old.render(); const cleanup = old.profileEffect()();
  cleanup();
  assert.equal(old.requests[0].signal.aborted, true);
  finish({ ok: true, json: async () => ({ data: { id: 'old-agent', plivo_password: 'old-secret' } }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(old.state[13], null);
  assert.equal(old.storage.size, 0);

  const switched = endpointWidgetHarness(async () => ({}));
  switched.state[13].user_id = 'employee-a';
  switched.props.userId = 'employee-b';
  const switchedTree = switched.render();
  assert.equal(nodes(switchedTree, node => node.props.title === 'Loading CRM Softphone').length, 1);
  assert.equal(nodes(switchedTree, node => node.props.role === 'group').length, 0, 'A previous user cannot supply the new user\'s calling profile');
});

test('independent profile reads enforce authentication and tenant scope while preserving the existing profile API', async () => {
  const own = fixture({ userId: 'employee-a' });
  own.tables.user_roles[1].emp_mobile = '+919876543210';
  const result = await own.team.getSoftphoneAgentProfile('employee-a');
  assert.equal(result.status, 200);
  assert.equal(result.data.user_landing_mobile, '+919876543210');
  assert.equal(result.data.plivo_password, 'test-password');
  assert.equal((await own.team.getAgentProfile('employee-a')).data.id, result.data.id);
  assert.equal((await own.team.getSoftphoneAgentProfile('other-tenant')).status, 403);
  assert.equal((await fixture({ noUser: true }).team.getSoftphoneAgentProfile()).status, 401);
  assert.equal((await fixture({ profileReadFailure: true, userId: 'employee-a' }).team.getSoftphoneAgentProfile()).status, 503);
  const absent = fixture({ userId: 'employee-a' });
  absent.tables.call_agents[0].user_id = 'different';
  assert.equal((await absent.team.getSoftphoneAgentProfile()).data, null);
  assert.equal((await fixture().team.getSoftphoneAgentProfile('employee-a')).status, 200, 'Same-workspace admin access remains supported');
  assert.equal(own.log.writes.length, 0);
  assert.equal(own.log.fetches.length, 0);
});

test('startup GET routes return private non-cacheable responses and retain server-side access checks', async () => {
  for (const noUser of [false, true]) {
    const app = fixture({ userId: 'employee-a', noUser });
    app.dependencies['@/app/actions/team'] = app.team;
    const profile = await app.load(code.profile).GET(new Request('https://crm.example.test/api/plivo/agent-profile?userId=employee-a'));
    assert.equal(profile.status, noUser ? 401 : 200);
    assert.match(profile.headers.get('cache-control'), /private.*no-store/);
    assert.equal(profile.headers.get('vary'), 'Cookie');
    const endpoint = await app.load(code.endpointId).GET(new Request('https://crm.example.test/api/plivo/agent-endpoint-id?userId=employee-a'));
    assert.equal((await endpoint.json()).endpointId, noUser ? null : '174793004058391');
    assert.match(endpoint.headers.get('cache-control'), /private.*no-store/);
    assert.equal(app.log.writes.length, 0);
  }
  const app = fixture({ userId: 'employee-a' });
  app.dependencies['@/app/actions/team'] = app.team;
  const foreign = await app.load(code.profile).GET(new Request('https://crm.example.test/api/plivo/agent-profile?userId=other-tenant'));
  assert.equal(foreign.status, 403);
  assert.equal((await foreign.json()).data, null);
  const invalid = `https://crm.example.test/api?userId=${'a'.repeat(129)}`;
  assert.equal((await app.load(code.profile).GET(new Request(invalid))).status, 400);
  assert.equal((await app.load(code.endpointId).GET(new Request(invalid))).status, 400);
});
