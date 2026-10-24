import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { normalizeIndianPhoneNumber } from '../src/app/api/plivo/phone-number.js';

const require = createRequire(import.meta.url), swc = require('next/dist/build/swc');
await swc.loadBindings();
const compile = file => swc.transformSync(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
  filename: file, jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' }
}).code;
const code = Object.fromEntries(Object.entries({
  helper: 'src/lib/plivoIncomingRouting.js', control: 'src/app/api/plivo/incoming-control/route.js',
  stage: 'src/app/api/plivo/incoming-route/route.js', fallback: 'src/app/api/plivo/incoming-fallback/route.js',
  incoming: 'src/app/api/plivo/incoming/route.js'
}).map(([key, file]) => [key, compile(file)]));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PARENT = '11111111-1111-4111-8111-111111111111', INVITE = '22222222-2222-4222-8222-222222222222';
const TENANT = '33333333-3333-4333-8333-333333333333', DEFAULT = '00000000-0000-0000-0000-000000000001';
const CUSTOMER = '+919876543210', CALLED = '+918035340622', FORWARD = '+917888399954';
const copy = value => JSON.parse(JSON.stringify(value));
const unescape = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
// Execute the installed SDK's actual incoming-header filter without starting
// WebRTC, so transport limits cannot be hidden by a permissive SDK mock.
const browserSdk = fs.readFileSync(require.resolve('plivo-browser-sdk'), 'utf8');
const headerModule = browserSdk.match(/"\.\/lib\/utils\/headers\.ts":function\(e,t,n\)\{([\s\S]*?)\},"\.\/lib\/utils\/loggerUtil\.ts"/);
assert.ok(headerModule, 'Locate the installed Plivo browser SDK header parser');
const browserHeaders = {};
vm.runInNewContext(`(function(e,t,n){${headerModule[1]}})`)({}, browserHeaders, () => {});
const tokenFor = (xml, sip = 'agent-a') => {
  const user = [...xml.matchAll(/<User sipHeaders="([^"]+)">([^<]+)<\/User>/g)].find(match => match[2].includes(`sip:${sip}@`));
  if (!user) return undefined;
  const wire = Object.fromEntries(unescape(user[1]).split(',').map(header => {
    const equals = header.indexOf('='); return [`X-PH-${header.slice(0, equals)}`, header.slice(equals + 1)];
  }));
  const delivered = browserHeaders.receiveExtraHeader({ getHeader: key => wire[key] }, wire);
  const count = Number(delivered['X-PH-CrmInboundParts']);
  const parts = Array.from({ length: count }, (_, index) => delivered[`X-PH-CrmInbound${index + 1}`]);
  return count && parts.every(Boolean) ? parts.join('') : undefined;
};
const urlFor = (xml, mode) => unescape([...xml.matchAll(/https:\/\/[^"<]+/g)].map(match => match[0]).find(url => url.includes(`mode=${mode}`)));

function fixture(options = {}) {
  const tables = {
    call_agents: [
      ...[[A, 'a'], [B, 'b'], [C, 'c'], [D, 'foreign']].map(([id, user]) => ({ id, user_id: user,
        plivo_username: `agent-${user}`, plivo_sip_uri: `sip:agent-${user}@phone.plivo.com`, is_active: true, status: user === 'c' ? 'busy' : 'available' })),
      { id: 'forward-settings', plivo_username: 'system_settings_forward', mobile_number: FORWARD }
    ],
    user_roles: [
      { user_id: 'a', company: '', email: 'admin@newswangroup.com' },
      { user_id: 'b', company: 'NSMLR' }, { user_id: 'c', company: 'NSTLP' },
      { user_id: 'foreign', company: 'Other Tenant', tenant_id: TENANT }
    ],
    tenants: [{ id: TENANT, name: 'Other Tenant', tenant_code: 'OT' }], tenant_entitlements: [],
    call_sessions: [], call_incoming_routing: [], leads: []
  };
  const log = { writes: [], transfers: [], hangups: [], reads: [], accounts: [] };
  const db = { from(table) {
    const filters = []; let operation = 'select', payload, singular = false, max = Infinity;
    const query = {
      select() { return this; }, eq(key, value) { filters.push(row => row[key] === value); return this; },
      neq(key, value) { filters.push(row => row[key] !== value); return this; },
      in(key, values) { filters.push(row => values.includes(row[key])); return this; },
      ilike(key, value) { filters.push(row => String(row[key] || '').toLowerCase() === String(value).toLowerCase()); return this; },
      or() { return this; }, order() { return this; }, limit(value) { max = value; return this; },
      maybeSingle() { singular = true; return this; }, insert(value) { operation = 'insert'; payload = value; return this; },
      update(value) { operation = 'update'; payload = value; return this; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (options.missingTable && table === 'call_incoming_routing') return { data: null, error: { code: 'PGRST205' } };
        if (options.failReads === table && operation === 'select') return { data: null, error: { code: 'XX001' } };
        assert.ok(table in tables, `Unexpected table ${table}`);
        let rows = tables[table].filter(row => filters.every(filter => filter(row))).slice(0, max);
        if (operation === 'insert') {
          if (table === 'call_incoming_routing' && tables[table].some(row => row.parent_call_uuid === payload.parent_call_uuid)) return { data: null, error: { code: '23505' } };
          const row = { operation_id: null, requested_by: null, next_agent_id: null, ...copy(payload) };
          tables[table].push(row); rows = [row]; log.writes.push({ table, operation });
        }
        if (operation === 'update') { rows.forEach(row => Object.assign(row, copy(payload))); log.writes.push({ table, operation, count: rows.length }); }
        return { data: copy(singular ? rows[0] || null : rows), error: null };
      }).then(resolve, reject); }
    };
    return query;
  } };
  let childReads = 0;
  const provider = {
    getLiveCall: async uuid => {
      log.reads.push(uuid);
      if (options.readFailure) throw new Error('Provider unreachable');
      if (uuid === PARENT) return { callUuid: uuid, direction: options.outboundParent ? 'outbound' : 'inbound', from: CUSTOMER, to: CALLED, callStatus: 'in-progress' };
      assert.equal(uuid, INVITE);
      childReads++;
      return { callUuid: uuid, to: options.foreignLeg ? 'sip:other-agent@phone.plivo.com' : 'sip:agent-a@phone.plivo.com',
        callStatus: options.answered || (options.answerAfterClaim && childReads === 2) ? 'in-progress' : 'ringing' };
    },
    hangup: async uuid => { log.hangups.push(uuid); if (options.providerError) throw options.providerError; return { message: 'call hungup' }; },
    transfer: async (uuid, params) => {
      log.transfers.push([uuid, params]);
      if (options.onTransfer) await options.onTransfer();
      if (options.providerError) throw options.providerError;
      return { message: 'call transferred' };
    }
  };
  const config = { authId: 'test-account', authToken: 'test-token', fromNumber: CALLED };
  let lib;
  const dependencies = {
    'node:crypto': crypto, 'next/server': require('next/server'),
    '@supabase/supabase-js': { createClient: () => db },
    '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.loggedOut ? null : { id: options.user || 'a' } } }) } }) },
    '@/utils/telephonyConfig': { SWAN_COMPANIES: ['nsmlr', 'nstlp', 'new swan group'], getCompanySlug: value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '_'),
      getWorkspaceTelephonyConfig: async () => config },
    '@/app/api/plivo/utils': { getPlivoWebhookBaseUrl: () => 'https://webhook.example.test', isPrivateOrLocalHost: host => /localhost|127\.|192\./.test(host) },
    '@/app/api/plivo/phone-number': { normalizeIndianPhoneNumber },
    plivo: { validateV3Signature: (...args) => options.validateSignature ? options.validateSignature(...args) : !options.badSignature, Client: class {
      constructor(account) { log.accounts.push(account); }
      calls = provider;
      endpoints = { list: async () => [{ username: 'agent-a', sipRegistered: true }, { username: 'agent-b', sipRegistered: true }] };
    } }
  };
  const load = compiled => {
    const loaded = { exports: {} };
    vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, Buffer, URL, URLSearchParams,
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only', PLIVO_AUTH_ID: 'test-account' } },
      console: { warn() {}, log() {}, error() {} },
      require(name) { if (name === '@/lib/plivoIncomingRouting') return lib; assert.ok(name in dependencies, `Unexpected import ${name}`); return dependencies[name]; }
    });
    return loaded.exports;
  };
  lib = load(code.helper);
  const req = { url: options.incomingUrl || 'https://webhook.example.test/api/plivo/incoming', headers: { get: name => name === 'x-plivo-signature-v3' ? options.signature || 'test-signature' : name.includes('signature') ? 'test-signature' : 'webhook.example.test' } };
  const app = { lib, tables, log, db, config, options, load, provider,
    async prepare(targets = [tables.call_agents[0]], allowed = []) {
      const result = await lib.prepareIncomingRouting(db, { CallUUID: PARENT, From: CUSTOMER, To: CALLED, AuthId: 'test-account' }, targets, allowed, req);
      this.tracked = result;
      this.xml = result ? lib.incomingAgentDialXml(req, result.ctx, result.row, targets) : '';
      this.token = tokenFor(this.xml); return result;
    },
    async action(action, extra = {}) {
      const body = { action, token: this.token, inviteUuid: INVITE, operationId: crypto.randomUUID(), ...extra };
      const response = await load(code.control).POST({ url: 'https://webhook.example.test/api/plivo/incoming-control', json: async () => body });
      return { status: response.status, data: await response.json(), body, response };
    },
    async callback(url, event = {}) {
      return lib.incomingRouteXml({ url }, { CallUUID: PARENT, ...event });
    },
    async fallback(mode = 'fallback', event = {}, xml = this.xml) {
      return lib.incomingFallbackXml({ url: urlFor(xml, mode) }, { CallUUID: PARENT, ...event });
    }
  };
  return app;
}

test('tracked incoming calls carry per-agent signed invitations and public notification-only Dial callbacks', async () => {
  const app = fixture(); await app.prepare([app.tables.call_agents[0], app.tables.call_agents[1]]);
  assert.ok(app.token); assert.notEqual(app.token, tokenFor(app.xml, 'agent-b'));
  assert.match(app.xml, /redirect="false"/); assert.match(app.xml, /<Redirect method="POST">https:\/\/webhook.example.test/);
  assert.ok(!app.xml.includes('test-token')); assert.ok(!app.xml.includes('localhost'));
  const row = app.tables.call_incoming_routing[0];
  assert.deepEqual(row.eligible_agent_ids.sort(), [A, B, C].sort()); assert.equal(row.tenant_id, DEFAULT);
  assert.ok(app.log.writes.every(write => write.table === 'call_incoming_routing'));
});

test('options find only available authorized agents in the same workspace and a configured non-looping default number', async () => {
  const app = fixture(); await app.prepare();
  let result = await app.action('options');
  assert.equal(result.status, 200); assert.deepEqual(result.data, { canNext: true, canForward: true, canDecline: true });
  app.tables.call_sessions.push({ agent_id: B, status: 'connected' });
  assert.equal((await app.action('options')).data.canNext, false);
  app.tables.call_sessions.length = 0; app.tables.call_agents[1].is_active = false;
  assert.equal((await app.action('options')).data.canNext, false);
  app.tables.call_agents[4].mobile_number = CUSTOMER;
  assert.equal((await app.action('options')).data.canForward, false);
  app.tables.call_agents[4].mobile_number = CALLED;
  assert.equal((await app.action('options')).data.canForward, false);
  assert.equal(app.log.hangups.length + app.log.transfers.length, 0);
});

test('Decline terminates the original customer leg and prevents every later mobile fallback', async () => {
  const app = fixture(); await app.prepare();
  const result = await app.action('decline');
  assert.equal(result.status, 200); assert.equal(result.data.message, 'Call Declined'); assert.equal(result.data.success, true);
  assert.deepEqual(app.log.hangups, [PARENT]); assert.equal(app.log.transfers.length, 0);
  assert.equal(app.tables.call_incoming_routing[0].status, 'declined');
  for (const status of ['busy', 'failed', 'cancel', 'timeout', 'no-answer']) {
    assert.ok(!(await app.fallback('notice', { DialStatus: status })).includes('<Dial'));
    assert.ok(!(await app.fallback('fallback', { DialStatus: status })).includes('<Dial'));
  }
  assert.equal((await app.action('next')).status, 409);
});

test('Default Forward transfers only the parent leg to signed XML and dials the configured mobile once', async () => {
  const app = fixture(); await app.prepare();
  const result = await app.action('forward'); assert.equal(result.status, 200); assert.equal(result.data.success, true);
  assert.equal(app.log.transfers.length, 1); assert.equal(app.log.transfers[0][0], PARENT);
  const params = app.log.transfers[0][1]; assert.equal(params.legs, 'aleg'); assert.equal(params.alegMethod, 'POST');
  const xml = await app.callback(params.alegUrl);
  assert.match(xml, new RegExp(`<Number>\\${FORWARD}</Number>`));
  assert.equal(app.tables.call_incoming_routing[0].status, 'forwarded');
  assert.ok(!(await app.fallback('notice', { DialStatus: 'cancel' })).includes('<Dial'));
  assert.equal(app.log.hangups.length, 0);
  const retry = await app.action('forward', { operationId: result.body.operationId });
  assert.ok([200, 409].includes(retry.status)); assert.equal(app.log.transfers.length, 1);
});

test('Next Agent routes to another agent, preserves the customer number, and does not loop to an earlier agent', async () => {
  const app = fixture(); await app.prepare();
  await app.action('next'); const nextXml = await app.callback(app.log.transfers[0][1].alegUrl);
  assert.ok(nextXml.includes('sip:agent-b@phone.plivo.com')); assert.ok(!nextXml.includes('sip:agent-a@phone.plivo.com'));
  assert.ok(nextXml.includes(`callerId="${CUSTOMER}"`)); assert.ok(tokenFor(nextXml, 'agent-b'));
  const row = app.tables.call_incoming_routing[0]; assert.deepEqual(row.ringing_agent_ids, [B]); assert.ok(row.visited_agent_ids.includes(A));
  assert.ok(!(await app.fallback('notice', { DialStatus: 'cancel' })).includes('<Dial'));
  const late = await app.action('decline'); assert.equal(late.status, 409); assert.equal(app.log.hangups.length, 0);
  app.options.user = 'b'; app.token = tokenFor(nextXml, 'agent-b');
  assert.equal((await app.action('options')).data.canNext, false);
});

test('Next Agent honors configured eligible agents and does not forward when none are available', async () => {
  const app = fixture(); await app.prepare(undefined, [A, C]);
  assert.equal((await app.action('options')).data.canNext, false);
  assert.equal((await app.action('next')).status, 409);
  assert.equal(app.log.transfers.length + app.log.hangups.length, 0);
  assert.equal(app.tables.call_incoming_routing[0].status, 'ringing');
});

test('busy/timeout still follows automatic fallback; answered calls and stale notifications never start another Dial', async () => {
  const timeout = fixture(); await timeout.prepare();
  assert.ok(!(await timeout.fallback('notice', { DialStatus: 'timeout' })).includes('<Dial'));
  assert.ok((await timeout.fallback()).includes(`<Number>${FORWARD}</Number>`));
  const answered = fixture(); await answered.prepare();
  await answered.callback(urlFor(answered.xml, 'event'), { DialAction: 'connected', DialBLegUUID: INVITE });
  assert.equal((await answered.action('decline')).status, 409);
  assert.ok(!(await answered.fallback('fallback', { DialStatus: 'completed' })).includes('<Dial'));
  assert.equal(answered.tables.call_incoming_routing[0].status, 'ended');
});

test('authentication, revoked access, foreign tenants, tampered/expired tokens and outbound legs fail before a provider mutation', async () => {
  for (const scenario of ['loggedOut', 'otherAgent', 'revoked', 'foreignTenant', 'tampered', 'expired', 'outboundParent', 'foreignLeg', 'answered', 'answerAfterClaim']) {
    const app = fixture({ [scenario]: true }); await app.prepare();
    if (scenario === 'otherAgent') app.options.user = 'b';
    if (scenario === 'revoked') app.tables.call_agents[0].is_active = false;
    if (scenario === 'foreignTenant') app.tables.user_roles[0].tenant_id = TENANT;
    if (scenario === 'tampered') app.token = app.token.replace(/.$/, app.token.endsWith('A') ? 'B' : 'A');
    if (scenario === 'expired') app.tables.call_incoming_routing[0].expires_at = '2020-01-01T00:00:00+05:30';
    const result = await app.action('decline'); assert.ok(result.status >= 400, scenario);
    assert.equal(app.log.hangups.length + app.log.transfers.length, 0, scenario);
  }
});

test('concurrent agent actions claim one revision and cannot create duplicate transfers or hangups', async () => {
  const app = fixture(); await app.prepare();
  const results = await Promise.all([app.action('next'), app.action('decline'), app.action('forward')]);
  assert.equal(results.filter(result => result.data.success).length, 1);
  assert.equal(app.log.transfers.length + app.log.hangups.length, 1);
});

test('provider failures restore a rejected request, while ambiguous timeouts keep the intent locked without retrying', async () => {
  const rejected = fixture({ providerError: Object.assign(new Error('Bad transfer'), { statusCode: 400 }) }); await rejected.prepare();
  assert.equal((await rejected.action('forward')).status, 409);
  assert.equal(rejected.tables.call_incoming_routing[0].status, 'ringing');
  const pending = fixture({ providerError: new Error('Network timeout') }); await pending.prepare();
  const result = await pending.action('forward'); assert.equal(result.data.pending, true); assert.equal(result.data.success, false);
  const status = await pending.action('status', { operationId: result.body.operationId }); assert.equal(status.data.pending, true);
  assert.equal((await pending.action('decline')).status, 409); assert.equal(pending.log.transfers.length, 1);
});

test('a missing migration, invalid provider signature or mixed-tenant selection leaves legacy incoming behavior available', async () => {
  for (const options of [{ missingTable: true }, { badSignature: true }]) {
    const app = fixture(options); assert.equal(await app.prepare(), null); assert.equal(app.log.transfers.length, 0);
  }
  const mixed = fixture(); assert.equal(await mixed.prepare([mixed.tables.call_agents[0], mixed.tables.call_agents[3]]), null);
  assert.equal(await mixed.lib.incomingFallbackXml({ url: 'https://webhook.example.test/api/plivo/incoming-fallback' }, {}), null);
});

test('the actual incoming route attaches verified controls, while untracked fallback retains its existing mobile behavior', async () => {
  const app = fixture();
  const response = await app.load(code.incoming).POST({ url: 'https://webhook.example.test/api/plivo/incoming',
    text: async () => new URLSearchParams({ CallUUID: PARENT, From: CUSTOMER, To: CALLED, AuthId: 'test-account' }).toString(),
    headers: { get: name => name.includes('signature') ? 'test-signature' : 'webhook.example.test' } });
  const xml = await response.text(); assert.equal(response.status, 200); assert.ok(tokenFor(xml)); assert.match(xml, /redirect="false"/);
  const legacy = await app.load(code.fallback).POST({ url: 'https://webhook.example.test/api/plivo/incoming-fallback',
    text: async () => new URLSearchParams({ CallUUID: PARENT, From: CUSTOMER, To: CALLED, DialStatus: 'busy' }).toString(),
    headers: { get: () => 'webhook.example.test' } });
  assert.ok((await legacy.text()).includes(`<Number>${FORWARD}</Number>`));
});

test('completion capabilities last through a long conversation while browser invitation capabilities expire quickly', async () => {
  const app = fixture(); await app.prepare();
  const decodePayload = token => JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
  const invitation = decodePayload(app.token);
  const notice = decodePayload(new URL(urlFor(app.xml, 'notice')).searchParams.get('token'));
  assert.ok(invitation.e - Date.now() <= 120000); assert.ok(notice.e - Date.now() > 4 * 3600000);
  await app.callback(urlFor(app.xml, 'event'), { DialAction: 'connected' });
  assert.ok(Date.parse(app.tables.call_incoming_routing[0].expires_at) - Date.now() > 3 * 3600000);
});

test('routes keep authentication private and reject mismatched webhook call IDs without executing fallback', async () => {
  const app = fixture(); await app.prepare();
  const result = await app.action('options'); assert.match(result.response.headers.get('cache-control'), /private, no-store/);
  await assert.rejects(() => app.callback(urlFor(app.xml, 'event'), { CallUUID: INVITE, DialAction: 'answer' }), /does not match/);
  const response = await app.load(code.fallback).POST({ url: urlFor(app.xml, 'fallback'), text: async () => `CallUUID=${INVITE}&DialStatus=busy` });
  assert.equal(response.status, 403); assert.ok(!(await response.text()).includes('<Dial'));
  assert.ok(app.log.writes.every(write => write.table === 'call_incoming_routing'));
});

test('native Plivo call SDK accepts the exact live lookup, parent transfer and hangup method signatures', async () => {
  const { CallInterface } = require('plivo/dist/resources/call.js');
  for (const action of ['forward', 'decline']) {
    const app = fixture(); await app.prepare(); const wire = [];
    const native = new CallInterface(async (method, path, params) => {
      wire.push({ method, path, params: copy(params) });
      if (method === 'GET') return { body: await app.provider.originalGet(path.includes(INVITE) ? INVITE : PARENT) };
      return { body: { message: 'success' } };
    });
    app.provider.originalGet = app.provider.getLiveCall;
    for (const method of ['getLiveCall', 'transfer', 'hangup']) app.provider[method] = (...args) => native[method](...args.map(arg => typeof arg === 'object' ? copy(arg) : arg));
    assert.equal((await app.action(action)).data.success, true);
    assert.ok(wire.some(request => request.method === 'GET' && request.path.includes(INVITE) && request.params.status === 'live'));
    const mutation = wire.filter(request => request.method !== 'GET'); assert.equal(mutation.length, 1);
    assert.match(mutation[0].path, new RegExp(`Call/${PARENT}`));
    if (action === 'forward') {
      assert.equal(mutation[0].method, 'POST'); assert.equal(mutation[0].params.legs, 'aleg');
      assert.ok(mutation[0].params.alegUrl.startsWith('https://webhook.example.test/api/plivo/incoming-route'));
    } else assert.equal(mutation[0].method, 'DELETE');
  }
});

test('provider V3 signature validation works with the installed SDK and the public inbound host survives local agent actions', async () => {
  const plivo = require('plivo'), uri = 'https://webhook.example.test/api/plivo/incoming';
  const event = { CallUUID: PARENT, From: CUSTOMER, To: CALLED, AuthId: 'test-account' };
  const values = Object.keys(event).sort().map(key => key + event[key]).join('');
  const signature = crypto.createHmac('sha256', 'test-token').update(`${uri}?${values}.test-signature`).digest('base64');
  const app = fixture({ validateSignature: plivo.validateV3Signature, signature });
  assert.ok(await app.prepare());
  const xml = app.lib.incomingAgentDialXml({ url: 'http://localhost:3000/calladmin' }, app.tracked.ctx, app.tracked.row, [app.tables.call_agents[0]], 'X-Lead-Name=' + 'a'.repeat(800));
  const headers = xml.match(/sipHeaders="([^"]+)"/)[1];
  assert.ok(Buffer.byteLength(headers) < 480); assert.ok(headers.startsWith('CrmInboundParts=')); assert.ok(!headers.startsWith('X-PH-'));
  assert.ok(tokenFor(xml), 'The installed browser SDK must deliver every token part');
  assert.ok(!xml.includes('localhost'));
  await app.action('forward'); assert.ok(app.log.transfers[0][1].alegUrl.startsWith('https://webhook.example.test/'));
});

test('routing capabilities survive the installed SDK 120-character limit for production and tunnel origins', async () => {
  assert.equal(browserHeaders.checkExtraHeaderVal('a'.repeat(120)), true);
  assert.equal(browserHeaders.checkExtraHeaderVal('a'.repeat(121)), false);
  for (const origin of ['https://app.supujacreations.com', 'https://stop-offering-transform-directors.trycloudflare.com']) {
    const app = fixture({ incomingUrl: `${origin}/api/plivo/incoming` }); await app.prepare();
    assert.ok(app.token.length > 120);
    assert.equal(browserHeaders.checkExtraHeaderVal(app.token), false, 'The previous single header was discarded');
    const headers = app.xml.match(/sipHeaders="([^"]+)"/)[1];
    assert.ok(Buffer.byteLength(headers) < 480);
    assert.ok(headers.split(',').every(header => header.slice(header.indexOf('=') + 1).length <= 100));
    assert.equal((await app.action('options')).data.canDecline, true);
  }
});

test('the migration is additive, denies browser access, and grants only server reads/inserts/updates', () => {
  const sql = fs.readFileSync(new URL('../migrations/35_call_incoming_routing.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public.call_incoming_routing/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/); assert.match(sql, /REVOKE ALL .* FROM anon, authenticated/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE .* TO service_role/);
  assert.ok(!/\b(DROP|DELETE|TRUNCATE)\b/i.test(sql));
  assert.ok(!/ALTER TABLE public\.(call_sessions|call_agents|leads|user_roles)\b/.test(sql));
});
