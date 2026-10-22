import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { buildOutboundDialXml } from '../src/app/api/plivo/outbound-dial-xml.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const compiled = await swc.transform(fs.readFileSync(new URL('../src/app/api/plivo/outbound-dial/route.js', import.meta.url), 'utf8'), {
  filename: 'outbound-dial/route.js',
  jsc: { parser: { syntax: 'ecmascript' } },
  module: { type: 'commonjs' },
});
const BASE = 'https://working-webhook.example.com';
const ROOM = 'room_customer_test';
const PLATFORM_CALLER_ID = '+918035340622';
const TENANT_CALLER_ID = '+918035342111';
const USER = 'tenant-agent-user';
const copy = value => JSON.parse(JSON.stringify(value));

function setup(options = {}) {
  const log = { queries: [], configs: [], errors: [] };
  const session = { id: 'session-id', room_name: ROOM, agent_id: 'agent-id', customer_number: '+919876543210', status: 'initiated' };
  const db = { from(table) {
    let columns, operation = 'select', payload, singular = false;
    const filters = [];
    return {
      select(value) { columns = value; return this; },
      eq(key, value) { filters.push([key, value]); return this; },
      in(key, value) { filters.push([key, value]); return this; },
      update(value) { operation = 'update'; payload = value; return this; },
      maybeSingle() { singular = true; return this; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          log.queries.push({ table, columns, operation, filters: copy(filters) });
          if (table === 'call_sessions') {
            if (operation === 'update') Object.assign(session, copy(payload));
            return { data: singular ? copy(session) : [{ id: session.id }], error: null };
          }
          if (table === 'call_agents') return { data: { user_id: USER, agent_code: options.agentCallerId || '' }, error: null };
          assert.equal(table, 'user_roles');
          assert.ok(filters.some(([key, value]) => key === 'user_id' && value === USER));
          if (columns.includes('tenant_id') && options.roleError) return { data: null, error: options.roleError };
          if (columns === 'company' && options.fallbackError) return { data: null, error: options.fallbackError };
          return { data: options.missingRole ? null : { company: 'Tenant A', tenant_id: 'tenant-a', ...options.role }, error: null };
        }).then(resolve, reject);
      },
    };
  } };
  const dependencies = {
    'next/server': require('next/server'),
    '@supabase/supabase-js': { createClient: () => db },
    '@/app/api/plivo/utils': { getPlivoWebhookBaseUrl: () => BASE },
    '@/app/api/plivo/outbound-dial-xml': { buildOutboundDialXml },
    '@/utils/telephonyConfig': { getWorkspaceTelephonyConfig: async (...args) => {
      log.configs.push(copy(args));
      return { fromNumber: options.tenantCallerId || TENANT_CALLER_ID };
    } },
  };
  const loaded = { exports: {} };
  vm.runInNewContext(compiled.code, {
    module: loaded, exports: loaded.exports, URL, URLSearchParams,
    process: { env: { PLIVO_FROM_NUMBER: PLATFORM_CALLER_ID } },
    console: { error: (...args) => log.errors.push(args.map(String)) },
    fetch: () => { throw new Error('Tests must never contact live services'); },
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return { log, session, request: () => loaded.exports.POST({ url: `${BASE}/api/plivo/outbound-dial?room=${ROOM}`, text: async () => 'CallUUID=agent-call' }) };
}

test('customer Dial uses tenant caller ID with a tenant-aware profile schema', async () => {
  const { request, log, session } = setup();
  const response = await request();
  const xml = await response.text();
  assert.equal(response.headers.get('content-type'), 'application/xml');
  assert.match(xml, new RegExp(`callerId="${TENANT_CALLER_ID.replace('+', '\\+')}"`));
  assert.ok(!xml.includes(PLATFORM_CALLER_ID));
  assert.deepEqual(log.configs, [['Tenant A', 'tenant-a']]);
  assert.equal(session.status, 'agent_answered');
  assert.equal(session.agent_call_uuid, 'agent-call');
});

test('legacy schema retains tenant caller ID, real carrier ringback, recording and Dial callbacks', async () => {
  const { request, log } = setup({ roleError: { code: '42703' }, role: { tenant_id: undefined } });
  const xml = await (await request()).text();
  assert.ok(xml.includes(`callerId="${TENANT_CALLER_ID}"`));
  assert.ok(!xml.includes(PLATFORM_CALLER_ID));
  assert.deepEqual(log.configs, [['Tenant A', null]]);
  assert.deepEqual(log.queries.filter(q => q.table === 'user_roles').map(q => q.columns), ['company, tenant_id', 'company']);
  assert.match(xml, /dialMusic="real"/);
  assert.match(xml, /startOnDialAnswer="true"/);
  assert.ok(xml.includes(`${BASE}/api/plivo/dial-callback?room=${ROOM}`));
  assert.ok(xml.includes(`${BASE}/api/plivo/dial-action?room=${ROOM}`));
  assert.match(xml, /<Number>\+919876543210<\/Number>/);
});

test('different legacy tenants receive their own customer-leg caller IDs', async () => {
  for (const [company, tenantCallerId] of [['Tenant A', TENANT_CALLER_ID], ['Tenant B', '+918035343111']]) {
    const { request, log } = setup({ roleError: { code: '42703' }, role: { company, tenant_id: undefined }, tenantCallerId });
    const xml = await (await request()).text();
    assert.ok(xml.includes(`callerId="${tenantCallerId}"`));
    assert.deepEqual(log.configs, [[company, null]]);
  }
});

test('an explicitly assigned agent caller ID retains priority', async () => {
  const { request, log } = setup({ agentCallerId: '+918035349999' });
  assert.ok((await (await request()).text()).includes('callerId="+918035349999"'));
  assert.equal(log.configs.length, 0);
});

test('workspace lookup failures never dial a customer with the platform fallback caller ID', async () => {
  for (const options of [
    { roleError: { code: 'PGRST000' } },
    { roleError: { code: '42703' }, fallbackError: { code: 'PGRST000' } },
    { missingRole: true },
  ]) {
    const { request, log } = setup(options);
    const xml = await (await request()).text();
    assert.match(xml, /<Hangup\/>/);
    assert.ok(!xml.includes('<Dial'));
    assert.equal(log.configs.length, 0);
    assert.equal(log.errors.length, 1);
  }
});

test('existing legacy profiles with no company retain the platform default caller ID', async () => {
  const { request, log } = setup({ roleError: { code: '42703' }, role: { company: '', tenant_id: undefined } });
  const xml = await (await request()).text();
  assert.ok(xml.includes(`callerId="${PLATFORM_CALLER_ID}"`));
  assert.equal(log.configs.length, 0);
});
