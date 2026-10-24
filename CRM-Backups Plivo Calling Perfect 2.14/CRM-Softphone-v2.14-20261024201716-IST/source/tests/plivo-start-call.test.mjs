import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { normalizeIndianPhoneNumber } from '../src/app/api/plivo/phone-number.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const compiled = await swc.transform(fs.readFileSync(new URL('../src/app/api/plivo/start-call/route.js', import.meta.url), 'utf8'), {
  filename: 'start-call/route.js',
  jsc: { parser: { syntax: 'ecmascript' } },
  module: { type: 'commonjs' },
});
const BASE = 'https://working-webhook.example.com';
const USER = 'agent-user';
const ROOM = 'room_tenant_test';
const copy = value => JSON.parse(JSON.stringify(value));

function setup(options = {}) {
  const log = { queries: [], config: [], provider: [], calls: [] };
  let session;
  const db = { from(table) {
    let columns, operation = 'select', payload;
    const filters = [];
    return {
      select(value) { columns = value; return this; },
      eq(key, value) { filters.push([key, value]); return this; },
      is(key, value) { filters.push([key, value]); return this; },
      insert(value) { operation = 'insert'; payload = value; return this; },
      update(value) { operation = 'update'; payload = value; return this; },
      single() { return this; }, maybeSingle() { return this; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          log.queries.push({ table, columns, operation, filters: copy(filters) });
          if (table === 'user_roles') {
            assert.ok(filters.some(([key, value]) => key === 'user_id' && value === USER));
            if (columns.includes('tenant_id') && options.roleError) return { data: null, error: options.roleError };
            if (columns === 'company' && options.fallbackError) return { data: null, error: options.fallbackError };
            return { data: options.missingRole ? null : { company: 'Tenant A', tenant_id: 'tenant-a', ...options.role }, error: null };
          }
          if (table === 'call_agents') return { data: { id: 'agent-id', plivo_sip_uri: 'sip:agent@example.com', agent_code: options.agentCallerId || '' }, error: null };
          assert.equal(table, 'call_sessions');
          if (operation === 'insert') {
            session = { id: 'session-id', ...copy(payload) };
            return { data: copy(session), error: null };
          }
          if (operation === 'update') {
            Object.assign(session, copy(payload));
            return { data: [copy(session)], error: null };
          }
          return { data: copy(session), error: null };
        }).then(resolve, reject);
      },
    };
  } };
  class PlivoClient {
    constructor(authId, authToken) {
      log.provider.push([authId, authToken]);
      this.calls = { async create(...args) {
        log.calls.push(copy(args));
        if (options.providerError) throw new Error('Provider rejected call');
        return { requestUuid: 'provider-agent-request' };
      } };
    }
  }
  const dependencies = {
    'next/server': require('next/server'),
    '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.unauthorized ? null : { id: USER } } }) } }) },
    '@supabase/supabase-js': { createClient: () => db },
    plivo: { Client: PlivoClient },
    '@/app/api/plivo/utils': { getPlivoWebhookBaseUrl: () => BASE },
    '@/app/api/plivo/phone-number': { normalizeIndianPhoneNumber },
    '@/app/api/plivo/outbound-intent': { outboundRoomToken: () => 'room-marker' },
    '@/utils/telephonyConfig': { getWorkspaceTelephonyConfig: async (...args) => {
      log.config.push(copy(args));
      return { authId: options.authId || 'tenant-auth', authToken: 'tenant-token', fromNumber: '+918035340622' };
    } },
  };
  const loaded = { exports: {} };
  vm.runInNewContext(compiled.code, {
    module: loaded, exports: loaded.exports,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.com', SUPABASE_SERVICE_ROLE_KEY: 'test-key' } },
    console: { error() {} },
    fetch: () => { throw new Error('Tests must never contact live services'); },
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return { log, getSession: () => session, request: () => loaded.exports.POST({ json: async () => ({ customerNumber: '9876543210', callingMode: 'browser_webrtc', roomName: ROOM }) }) };
}

test('tenant-aware schema passes the caller company and tenant ID to the credential resolver', async () => {
  const { request, log, getSession } = setup();
  const response = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(log.config, [['Tenant A', 'tenant-a']]);
  assert.deepEqual(log.provider, [['tenant-auth', 'tenant-token']]);
  assert.equal(log.queries.filter(q => q.table === 'user_roles').length, 1);
  assert.equal(getSession().conference_name, null);
  assert.equal(getSession().agent_call_uuid, 'provider-agent-request');
});

test('missing tenant_id retries company lookup and retains the original direct-call URL and SIP marker', async () => {
  const { request, log } = setup({ roleError: { code: '42703' }, role: { tenant_id: undefined } });
  assert.equal((await request()).status, 200);
  assert.deepEqual(log.config, [['Tenant A', null]]);
  assert.deepEqual(log.queries.filter(q => q.table === 'user_roles').map(q => q.columns), ['company, tenant_id', 'company']);
  assert.equal(log.calls.length, 1);
  const [from, to, answer, params] = log.calls[0];
  assert.equal(from, '+918035340622');
  assert.equal(to, 'sip:agent@example.com');
  assert.equal(answer, `${BASE}/api/plivo/outbound-dial?room=${ROOM}`);
  assert.equal(params.answerMethod, 'POST');
  assert.equal(params.sipHeaders, 'X-PH-CrmRoom=room-marker');
  assert.equal(params.hangupUrl, `${BASE}/api/plivo/ring-callback?room=${ROOM}&leg=agent`);
});

test('different legacy companies remain separate inputs to tenant credential selection', async () => {
  for (const company of ['Tenant A', 'Tenant B']) {
    const { request, log } = setup({ roleError: { code: '42703' }, role: { company, tenant_id: undefined }, authId: `${company}-auth` });
    assert.equal((await request()).status, 200);
    assert.deepEqual(log.config, [[company, null]]);
    assert.equal(log.provider[0][0], `${company}-auth`);
  }
});

test('unrelated workspace lookup errors fail before credentials, sessions or provider requests', async () => {
  const { request, log } = setup({ roleError: { code: 'PGRST000' } });
  const response = await request();
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /workspace could not be verified/);
  assert.equal(log.queries.length, 1);
  assert.equal(log.config.length, 0);
  assert.equal(log.calls.length, 0);
});

test('a failed legacy lookup cannot silently dial through platform credentials', async () => {
  const { request, log } = setup({ roleError: { code: '42703' }, fallbackError: { code: 'PGRST000' } });
  assert.equal((await request()).status, 503);
  assert.equal(log.config.length, 0);
  assert.equal(log.queries.filter(q => q.operation === 'insert').length, 0);
  assert.equal(log.calls.length, 0);
});

test('missing profile fails before selecting any calling account', async () => {
  const { request, log } = setup({ missingRole: true });
  assert.equal((await request()).status, 403);
  assert.equal(log.config.length, 0);
  assert.equal(log.calls.length, 0);
});

test('an existing legacy platform profile retains its empty-company default mapping', async () => {
  const { request, log } = setup({ roleError: { code: '42703' }, role: { company: '', tenant_id: undefined } });
  assert.equal((await request()).status, 200);
  assert.deepEqual(log.config, [['', null]]);
});

test('assigned caller ID and provider failure cleanup remain intact', async () => {
  const { request, log, getSession } = setup({ agentCallerId: '+918035340999', providerError: true });
  assert.equal((await request()).status, 500);
  assert.equal(log.calls[0][0], '+918035340999');
  assert.equal(getSession().status, 'failed');
  assert.equal(getSession().hangup_cause, 'agent_dial_error');
});

test('unauthenticated requests cannot resolve credentials or create sessions', async () => {
  const { request, log } = setup({ unauthorized: true });
  assert.equal((await request()).status, 401);
  assert.equal(log.queries.length, 0);
  assert.equal(log.calls.length, 0);
});
