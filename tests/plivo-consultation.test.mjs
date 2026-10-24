import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { normalizeIndianPhoneNumber } from '../src/app/api/plivo/phone-number.js';
import * as originalUtils from '../src/app/api/plivo/utils.js';
import { createSoftphoneConnectionRecovery } from '../src/lib/softphoneConnectionRecovery.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const compiled = new Map();
async function load(file, dependencies, globals = {}) {
  if (!compiled.has(file)) compiled.set(file, (await swc.transform(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'ecmascript', jsx: file.endsWith('.jsx') } }, module: { type: 'commonjs' },
  })).code);
  const loaded = { exports: {} };
  vm.runInNewContext(compiled.get(file), {
    module: loaded, exports: loaded.exports, URL, URLSearchParams, Buffer, AbortSignal, process,
    setTimeout, clearTimeout, fetch: async () => { throw new Error('Tests must never contact live Plivo'); },
    console: { error() {}, log() {} },
    require(name) {
      if (name in dependencies) return dependencies[name];
      if (name.startsWith('node:') || name === 'next/server') return require(name);
      throw new Error(`Unexpected dependency: ${name}`);
    },
    ...globals,
  });
  return loaded.exports;
}
const copy = value => JSON.parse(JSON.stringify(value));
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const AGENT = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = '33333333-3333-4333-8333-333333333333';
const GUEST = '44444444-4444-4444-8444-444444444444';
const USER = '55555555-5555-4555-8555-555555555555';
const BASE = 'https://updated.example.com';
const health = async () => ({ ok: true, json: async () => ({ protocol: 'crm-consultation-v1' }) });

function memoryDb(options) {
  const tables = {
    call_sessions: [{ id: SESSION_ID, room_name: 'room_test_123', agent_id: AGENT, status: 'connected',
      conference_name: null, agent_call_uuid: AGENT, customer_call_uuid: CUSTOMER, customer_answer_time: '2026-10-20T12:00:00+05:30' }],
    call_consultations: [], call_agents: [{ id: AGENT, user_id: USER }], user_roles: [{ user_id: USER, company: 'Test' }], call_events: [],
  };
  const queries = [];
  return { tables, queries, from(table) {
    const filters = []; let operation = 'select', payload, singular = false, columns;
    const query = {
      select(value) { columns = value; return this; }, eq(k, v) { filters.push(row => row[k] === v); return this; },
      is(k, v) { return this.eq(k, v); }, in(k, v) { filters.push(row => v.includes(row[k])); return this; },
      order() { return this; }, limit() { return this; },
      update(value) { operation = 'update'; payload = value; return this; },
      insert(value) { operation = 'insert'; payload = value; return this; },
      single() { singular = true; return this; }, maybeSingle() { singular = true; return this; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        queries.push({ table, operation, columns });
        if (table === 'call_agents' && columns?.includes('outgoing_caller_id')) {
          if (options.missingCallerIdColumn) return { data: null, error: { code: options.missingCallerIdColumn } };
          if (options.callerIdReadError) return { data: null, error: { code: 'XX001' } };
        }
        if (table === 'call_consultations' && options.missingTable) return { data: null, error: { code: 'PGRST205' } };
        if (table === 'call_sessions' && operation === 'update' && options.sessionWriteError) return { data: null, error: { message: 'offline' } };
        assert.ok(tables[table], table);
        let rows = tables[table].filter(row => filters.every(filter => filter(row)));
        if (operation === 'insert') {
          if (table === 'call_consultations' && tables[table].some(row => row.session_id === payload.session_id)) return { data: null, error: { code: '23505' } };
          const row = { revision: 0, updated_at: new Date().toISOString(), ...copy(payload) };
          tables[table].push(row); rows = [row];
        }
        if (operation === 'update') rows.forEach(row => Object.assign(row, copy(payload)));
        return { data: copy(singular ? rows[0] || null : rows), error: null };
      }).then(resolve, reject); },
    };
    return query;
  } };
}

async function setup(options = {}) {
  const db = memoryDb(options), log = [], live = [];
  let pendingOriginals = [], originalPolls = 0;
  const client = { multiPartyCalls: {
    async listParticipants() {
      log.push(['list']);
      if (options.listError) throw Object.assign(new Error('Provider unavailable'), { statusCode: options.listError });
      if (pendingOriginals.length && ++originalPolls >= options.delayedJoinPolls) {
        live.push(...pendingOriginals); pendingOriginals = [];
      }
      return { objects: copy(live) };
    },
    async updateParticipant(id, params) {
      log.push(['update', id, copy(params)]);
      if (options.failUnhold && params.hold === false) throw new Error('Unhold failed');
      const member = live.find(p => p.memberId === id);
      if (member && !(options.ignoreHold && params.hold === true) && !(options.ignoreUnhold && params.hold === false)) Object.assign(member, params);
    },
    async addParticipant(role, params) {
      log.push(['add', role, copy(params)]);
      assert.ok(live.find(p => p.callUuid === CUSTOMER)?.hold, 'Original caller must be held before dial');
      if (options.onAdd) return options.onAdd();
      return options.noIds ? {} : { calls: [{ requestUuid: 'guest-request', callUuid:
        log.filter(e => e[0] === 'add').length === 1 ? GUEST : '66666666-6666-4666-8666-666666666666' }] };
    },
    async kickParticipant(id, params) { log.push(['kick', id, copy(params)]); const at = live.findIndex(p => p.memberId === id); if (at >= 0) live.splice(at, 1); },
    async stop(params) { log.push(['stop', copy(params)]); live.splice(0); },
  }, calls: {
    async transfer(uuid, params) {
      log.push(['transfer', uuid, copy(params)]);
      if (options.transferError) throw Object.assign(new Error('Transfer rejected'), { statusCode: 400 });
      const originals = [{ memberId: '1', callUuid: AGENT, hold: false, mute: false },
        { memberId: '2', callUuid: CUSTOMER, hold: !options.ignoreHold, mute: false }];
      if (options.delayedJoinPolls) pendingOriginals = originals;
      else live.push(...originals);
    },
    async cancel(uuid) { log.push(['cancel', uuid]); if (options.cancelError) throw new Error('Not cancelled'); },
    async hangup(uuid) { log.push(['hangup', uuid]); if (options.cancelError) throw new Error('Not ended'); },
    async get(uuid) { log.push(['cdr', uuid]); return options.cdr || {}; },
  } };
  const dependencies = {
    plivo: { Client: function Client() { return client; } },
    '@supabase/supabase-js': { createClient: () => db },
    '@/utils/telephonyConfig': { getWorkspaceTelephonyConfig: async () => ({ authId: 'id', authToken: 'secret', fromNumber: '+918035340622' }) },
    '@/app/api/plivo/phone-number': { normalizeIndianPhoneNumber },
    '@/app/api/plivo/utils': originalUtils,
  };
  const api = await load('src/lib/plivoConsultation.js', dependencies);
  const ctx = await api.openConsultation('room_test_123', USER);
  const start = () => api.startConsultation(ctx, '9876543210', BASE, { fetcher: health, pollDelay: 0 });
  const row = () => db.tables.call_consultations[0];
  const nativeCtx = () => ({ ...ctx, session: copy(db.tables.call_sessions[0]) });
  const join = async () => {
    live.push({ memberId: '3', callUuid: GUEST, hold: false, mute: false });
    await api.consultationEvent(nativeCtx(), { EventName: 'ParticipantJoin', ParticipantCallUUID: GUEST, MemberID: '3' }, { role: 'guest', attempt: row().attempt_id });
  };
  return { api, ctx, nativeCtx, db, client, log, live, row, start, join, dependencies };
}

test('missing migration or unreachable public webhook leaves the original call untouched', async () => {
  for (const missingTable of [true, false]) {
    const s = await setup({ missingTable });
    await assert.rejects(s.api.startConsultation(s.ctx, '9876543210', BASE, {
      fetcher: async () => ({ ok: false }),
    }), /setup is not ready|not publicly reachable/);
    assert.equal(s.log.length, 0);
    assert.equal(s.db.tables.call_sessions[0].conference_name, null);
    assert.equal(s.db.tables.call_sessions[0].status, 'connected');
  }
});

test('Add Call holds the same original caller, uses real ringback, and never auto-merges on pickup', async () => {
  const s = await setup(); const view = await s.start();
  assert.equal(view.phase, 'dialing'); assert.equal(view.canMerge, false);
  const transfer = s.log.find(entry => entry[0] === 'transfer');
  assert.equal(transfer[1], AGENT); assert.equal(transfer[2].legs, 'both');
  assert.match(transfer[2].blegUrl, /role=customer/);
  const add = s.log.find(entry => entry[0] === 'add');
  assert.equal(add[1], 'customer'); assert.equal(add[2].dialMusic, 'real');
  assert.equal(add[2].to, '+919876543210');
  await assert.rejects(s.api.consultationAction(s.nativeCtx(), 'merge'), /controls changed/);
  await s.join();
  assert.equal(s.row().phase, 'consulting'); assert.equal(s.live[1].hold, true);
  assert.equal(s.db.tables.call_sessions[0].status, 'connected');
  const result = await s.api.consultationAction(s.nativeCtx(), 'merge', { attemptId: s.row().attempt_id });
  assert.equal(result.phase, 'merged'); assert.equal(s.live[1].hold, false);
  assert.equal(s.log.some(entry => ['hangup', 'stop'].includes(entry[0])), false);
});

test('third-person dialing uses the session agent selected outgoing caller ID instead of the rejected workspace default', async () => {
  const s = await setup();
  s.db.tables.call_agents[0].outgoing_caller_id = '+918065583111';
  s.db.tables.call_agents[0].agent_code = '+918064342111';
  await s.start();
  assert.equal(s.log.find(entry => entry[0] === 'add')[2].from, '+918065583111');
  assert.equal(s.row().data.outgoing_caller_id, '+918065583111');
  assert.equal(s.ctx.config.fromNumber, '+918035340622', 'Do not mutate shared workspace settings');
  assert.equal(s.live.find(p => p.callUuid === CUSTOMER).hold, true);
});

test('an empty or non-phone assignment retains this workspace default without reviving an old agent-code override', async () => {
  for (const assignment of [null, '', 'ADMIN0001']) {
    const s = await setup();
    Object.assign(s.db.tables.call_agents[0], { outgoing_caller_id: assignment, agent_code: '+918064342111' });
    s.ctx.config.fromNumber = '+918044440000';
    await s.start();
    assert.equal(s.log.find(entry => entry[0] === 'add')[2].from, '+918044440000');
  }
});

test('older caller-ID schemas retain their legacy phone assignment', async () => {
  for (const code of ['42703', 'PGRST204']) {
    const s = await setup({ missingCallerIdColumn: code });
    s.db.tables.call_agents[0].agent_code = '+918064342111';
    await s.start();
    assert.equal(s.log.find(entry => entry[0] === 'add')[2].from, '+918064342111');
    assert.ok(s.db.queries.some(q => q.table === 'call_agents' && q.columns === 'agent_code'));
  }
});

test('a failed caller-ID read or mismatched agent owner fails before holding, transferring or dialing', async () => {
  for (const failure of ['read', 'owner']) {
    const options = {}, s = await setup(options);
    if (failure === 'read') options.callerIdReadError = true;
    else s.db.tables.call_agents[0].user_id = 'another-user';
    await assert.rejects(s.start(), /caller ID could not be verified/i);
    assert.equal(s.log.length, 0);
    assert.equal(s.db.tables.call_sessions[0].conference_name, null);
    assert.equal(s.db.tables.call_consultations.length, 0);
  }
});

test('a selected caller ID works without a workspace default, but a completely missing number leaves the call untouched', async () => {
  for (const assignment of ['+918065583111', null]) {
    const s = await setup(); s.ctx.config.fromNumber = '';
    s.db.tables.call_agents[0].outgoing_caller_id = assignment;
    if (assignment) {
      await s.start(); assert.equal(s.log.find(entry => entry[0] === 'add')[2].from, assignment);
    } else {
      await assert.rejects(s.start(), /Calling number is not configured/);
      assert.equal(s.log.length, 0); assert.equal(s.db.tables.call_consultations.length, 0);
    }
  }
});

test('ringing callback keeps the first caller held and only explicit Cancel resumes them', async () => {
  const s = await setup(); await s.start();
  await s.api.consultationEvent(s.nativeCtx(), { CallStatus: 'ringing', CallUUID: GUEST }, { role: 'guest', attempt: s.row().attempt_id });
  assert.equal(s.row().phase, 'ringing'); assert.equal(s.live[1].hold, true);
  const result = await s.api.consultationAction(s.nativeCtx(), 'cancel');
  assert.equal(result.phase, 'active'); assert.equal(s.live[1].hold, false);
  assert.deepEqual(s.log.filter(e => e[0] === 'cancel').map(e => e[1]), ['guest-request']);
  assert.equal(s.db.tables.call_sessions[0].status, 'connected');
});

test('busy, no-answer, and media-anchoring rejection resume the caller without ending the session', async () => {
  for (const [status, code] of [['busy', '3010'], ['no-answer', '6010'], ['completed', '2070']]) {
    const s = await setup(); await s.start();
    await s.api.consultationEvent(s.nativeCtx(), { CallStatus: status, CallUUID: GUEST, HangupCauseCode: code }, { role: 'guest', attempt: s.row().attempt_id });
    assert.equal(s.row().phase, 'active'); assert.equal(s.row().data.provider_code, code);
    assert.equal(s.live[1].hold, false); assert.equal(s.db.tables.call_sessions[0].status, 'connected');
    assert.equal(s.log.some(e => ['hangup', 'stop'].includes(e[0])), false);
  }
});

test('Cancel after pickup removes only the guest before unholding the original caller', async () => {
  const s = await setup(); await s.start(); await s.join();
  await s.api.consultationAction(s.nativeCtx(), 'cancel');
  assert.deepEqual(s.live.map(p => p.callUuid), [AGENT, CUSTOMER]);
  assert.equal(s.row().phase, 'active');
  assert.ok(s.log.findIndex(e => e[0] === 'kick') < s.log.findIndex(e => e[0] === 'update' && e[2].hold === false));
});

test('duplicate Add Call cannot place a second outbound call', async () => {
  const s = await setup();
  const results = await Promise.allSettled([s.start(), s.start()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(s.log.filter(e => e[0] === 'add').length, 1);
});

test('Cancel during an in-flight invite keeps caller held until request cancellation is confirmed', async () => {
  let resolveInvite, notifyInvite;
  const entered = new Promise(resolve => { notifyInvite = resolve; });
  const options = { onAdd: () => { notifyInvite(); return new Promise(resolve => { resolveInvite = resolve; }); } };
  const s = await setup(options); const pending = s.start(); await entered;
  const result = await s.api.consultationAction(s.nativeCtx(), 'cancel');
  assert.equal(result.phase, 'cancelling'); assert.equal(s.live[1].hold, true);
  resolveInvite({ calls: [{ requestUuid: 'late-request', callUuid: GUEST }] });
  const final = await pending;
  assert.equal(final.phase, 'active'); assert.equal(s.live[1].hold, false);
  assert.ok(s.log.some(e => e[0] === 'cancel' && e[1] === 'late-request'));
});

test('unknown invite IDs and failed cancellation never expose the original caller', async () => {
  for (const options of [{ noIds: true }, { cancelError: true }]) {
    const s = await setup(options); await s.start();
    const result = await s.api.consultationAction(s.nativeCtx(), 'cancel');
    assert.equal(result.phase, 'cancelling'); assert.equal(s.live[1].hold, true);
    await s.api.consultationEvent(s.nativeCtx(), { CallStatus: 'completed', CallUUID: GUEST }, { role: 'guest', attempt: s.row().attempt_id });
    assert.equal(s.row().phase, 'active'); assert.equal(s.live[1].hold, false);
  }
});

test('very fast terminal callback before invite response does not reverse completed recovery', async () => {
  const options = {}; const s = await setup(options);
  options.onAdd = async () => {
    await s.api.consultationEvent(s.nativeCtx(), { CallStatus: 'busy', CallUUID: GUEST }, { role: 'guest', attempt: s.row().attempt_id });
    return { calls: [{ requestUuid: 'fast-request', callUuid: GUEST }] };
  };
  const result = await s.start();
  assert.equal(result.phase, 'active'); assert.equal(s.live[1].hold, false);
});

test('late callbacks from a previous attempt cannot merge, cancel, or unhold a new consultation', async () => {
  const s = await setup(); await s.start(); const oldAttempt = s.row().attempt_id;
  await s.api.consultationAction(s.nativeCtx(), 'cancel');
  await s.api.startConsultation(s.nativeCtx(), '9876543210', BASE, { fetcher: health });
  await s.api.consultationEvent(s.nativeCtx(), { CallStatus: 'completed', CallUUID: GUEST }, { role: 'guest', attempt: oldAttempt });
  await assert.rejects(s.api.consultationAction(s.nativeCtx(), 'cancel', { attemptId: oldAttempt }), /has changed/);
  assert.equal(s.row().phase, 'dialing'); assert.equal(s.live[1].hold, true);
});

test('subsequent Add Call preserves previously merged members and manual holds', async () => {
  const s = await setup(); await s.start(); await s.join();
  await s.api.consultationAction(s.nativeCtx(), 'merge');
  s.live[1].hold = true;
  await s.api.startConsultation(s.nativeCtx(), '9876543211', BASE, { fetcher: health });
  assert.equal(s.live[2].hold, true);
  await s.api.consultationAction(s.nativeCtx(), 'cancel');
  assert.equal(s.live[1].hold, true); assert.equal(s.live[2].hold, false);
  assert.equal(s.live.length, 3);
});

test('unconfirmed hold prevents dialing and transfer rejection leaves single-call state intact', async () => {
  for (const options of [{ ignoreHold: true }, { transferError: true }]) {
    const s = await setup(options);
    await assert.rejects(s.start(), /hold could not be confirmed|Transfer rejected/);
    assert.equal(s.log.filter(e => e[0] === 'add').length, 0);
    assert.equal(s.log.filter(e => ['hangup', 'stop'].includes(e[0])).length, 0);
    assert.equal(s.db.tables.call_sessions[0].status, 'connected');
    if (options.transferError) assert.equal(s.db.tables.call_sessions[0].conference_name, null);
  }
});

test('failed/unconfirmed Merge re-isolates callers and allows Cancel recovery', async () => {
  for (const options of [{ failUnhold: true }, { ignoreUnhold: true }]) {
    const s = await setup(options); await s.start(); await s.join();
    await assert.rejects(s.api.consultationAction(s.nativeCtx(), 'merge'), /Unhold failed|could not be confirmed/);
    assert.equal(s.row().phase, 'failed'); assert.equal(s.live[1].hold, true);
    options.failUnhold = false; options.ignoreUnhold = false;
    const result = await s.api.consultationAction(s.nativeCtx(), 'cancel');
    assert.equal(result.phase, 'active'); assert.equal(s.live[1].hold, false);
  }
});

test('resume must be observed at provider before reporting an active call', async () => {
  const options = { ignoreUnhold: true }; const s = await setup(options); await s.start();
  await assert.rejects(s.api.consultationAction(s.nativeCtx(), 'cancel'), /resume could not be confirmed/);
  assert.equal(s.row().phase, 'cancelling'); assert.equal(s.live[1].hold, true);
  options.ignoreUnhold = false;
  assert.equal((await s.api.consultationAction(s.nativeCtx(), 'cancel')).phase, 'active');
});

test('owner checks and mode/role/attempt-bound signatures reject unrelated access', async () => {
  const s = await setup();
  await assert.rejects(s.api.openConsultation('room_test_123', 'other-user'), /another agent/);
  await s.start();
  const signed = s.api.consultationWebhookUrl(s.ctx, s.row(), 'call', 'guest', s.row().attempt_id);
  assert.equal((await s.api.openConsultationWebhook(new Request(signed))).role, 'guest');
  for (const [key, value] of [['mode', 'answer'], ['role', 'agent'], ['attempt', 'stale'], ['token', '0'.repeat(64)]]) {
    const url = new URL(signed); url.searchParams.set(key, value);
    await assert.rejects(s.api.openConsultationWebhook(new Request(url)), /Invalid callback signature/);
  }
});

test('MPC XML holds customer, preserves agent, escapes signed URLs, and keeps private tokens out of UI', async () => {
  const s = await setup(); await s.start();
  const xml = s.api.consultationAnswerXml(s.ctx, s.row(), 'customer');
  assert.match(xml, /<MultiPartyCall role="Customer" hold="true"/);
  assert.match(xml, /endMpcOnExit="false"/); assert.match(xml, /&amp;token=/);
  assert.match(s.api.consultationAnswerXml(s.ctx, s.row(), 'agent'), /endMpcOnExit="true"/);
  assert.equal(s.api.consultationAnswerXml(s.ctx, s.row(), 'invalid'), s.api.hangupXml);
  const view = JSON.stringify(s.api.consultationView(s.row()));
  for (const secret of ['secret', 'token=', 'base_url', 'guest_request_uuid']) assert.equal(view.includes(secret), false);
  const timed = s.api.consultationView(s.row(), [{ memberId: '1', callUuid: AGENT, joinTime: '2026-10-20T12:00:00Z' }]);
  assert.match(timed.members[0].joinTime, /5:30:00/);
});

test('original Dial completion during transfer is not treated as an MPC hangup', async () => {
  const s = await setup(); await s.start();
  await s.api.consultationEvent(s.nativeCtx(), { CallUUID: AGENT, CallStatus: 'completed' });
  assert.equal(s.db.tables.call_sessions[0].status, 'connected');
  assert.equal(s.log.some(e => e[0] === 'stop'), false);
});

test('End Call targets this session only and a failed session write remains retryable', async () => {
  const options = {}; const s = await setup(options); await s.start();
  options.sessionWriteError = true;
  await assert.rejects(s.api.endConsultation(s.nativeCtx()), /setup is not ready/);
  assert.notEqual(s.row().phase, 'ended');
  options.sessionWriteError = false;
  await s.api.endConsultation(s.nativeCtx());
  assert.equal(s.row().phase, 'ended'); assert.equal(s.db.tables.call_sessions[0].status, 'ended');
  assert.deepEqual(s.log.filter(e => e[0] === 'hangup').map(e => e[1]), [AGENT, CUSTOMER]);
});

test('ordinary call status and Dial outcomes do not access consultation storage or MPC APIs', async () => {
  const s = await setup();
  const mocks = { ...s.dependencies, '@/lib/plivoConsultation': s.api };
  const status = await load('src/app/api/plivo/session-status/route.js', mocks);
  const response = await status.GET(new Request('https://crm.example.com/api/plivo/session-status?room=room_test_123'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).activeSession.status, 'connected');
  s.db.tables.call_sessions[0].customer_answer_time = null;
  s.db.tables.call_sessions[0].status = 'customer_ringing';
  const action = await load('src/app/api/plivo/dial-action/route.js', mocks);
  const result = await action.POST(new Request('https://crm.example.com/api/plivo/dial-action?room=room_test_123', {
    method: 'POST', body: new URLSearchParams({ DialStatus: 'busy', DialBLegHangupCauseCode: '3010' }),
  }));
  assert.match(await result.text(), /<Hangup\/>/);
  assert.equal(s.db.tables.call_sessions[0].hangup_cause, 'busy');
  assert.equal(s.db.queries.some(q => q.table === 'call_consultations'), false);
  assert.equal(s.log.some(e => ['list', 'add', 'transfer', 'stop'].includes(e[0])), false);
});

test('installed Plivo SDK accepts native MPC method signatures and request parameters', async () => {
  const s = await setup();
  const { MultiPartyCallInterface } = require('plivo/dist/resources/multiPartyCall.js');
  const wire = [];
  const native = new MultiPartyCallInterface(async (method, path, params) => {
    wire.push({ method, path, params: copy(params) });
    return { body: method === 'GET' ? { objects: copy(s.live) } : { calls: [{ request_uuid: 'wire-request', call_uuid: GUEST }] } };
  });
  // VM objects must be converted to the SDK's realm for its instanceof checks.
  s.client.multiPartyCalls = Object.fromEntries(['listParticipants', 'updateParticipant', 'addParticipant', 'kickParticipant', 'stop']
    .map(method => [method, (...args) => native[method](...args.map(arg => typeof arg === 'object' ? copy(arg) : arg))]));
  await s.start();
  const dial = wire.find(entry => entry.method === 'POST' && entry.path.endsWith('/Participant/'));
  assert.equal(dial.path, `MultiPartyCall/name_mpc_${SESSION_ID}/Participant/`);
  assert.equal(dial.params.role, 'customer'); assert.equal(dial.params.dialMusic, 'real');
  assert.equal(String(dial.params.hold), 'false'); assert.equal(String(dial.params.endMpcOnExit), 'false');
  assert.equal(s.row().data.guest_request_uuid, 'wire-request');
});

test('overlapping Cancel workers cannot resume a caller twice or unhold a later attempt', async () => {
  const s = await setup(); await s.start();
  let notify, release;
  const entered = new Promise(resolve => { notify = resolve; });
  const original = s.client.calls.cancel;
  s.client.calls.cancel = async uuid => {
    notify(); await new Promise(resolve => { release = resolve; }); return original(uuid);
  };
  const pending = s.api.consultationAction(s.nativeCtx(), 'cancel');
  await entered;
  const duplicate = await s.api.consultationAction(s.nativeCtx(), 'cancel');
  assert.equal(duplicate.phase, 'cancelling'); assert.equal(s.live[1].hold, true);
  release(); await pending;
  assert.equal(s.log.filter(e => e[0] === 'update' && e[2].hold === false).length, 1);
  assert.equal(s.row().data.cancel_worker, null);
});

test('native session status preserves connected and ended response fields used by the softphone', async () => {
  const s = await setup(); await s.start();
  const status = await load('src/app/api/plivo/session-status/route.js', { ...s.dependencies, '@/lib/plivoConsultation': s.api });
  const req = () => new Request('https://crm.example.com/api/plivo/session-status?room=room_test_123');
  const connected = await (await status.GET(req())).json();
  assert.equal(connected.isEnded, false); assert.equal(connected.isConnected, true);
  await s.api.endConsultation(s.nativeCtx(), 'customer_hangup');
  const ended = await (await status.GET(req())).json();
  assert.equal(ended.isEnded, true); assert.equal(ended.hangupCause, 'customer_hangup');
  assert.equal(ended.activeSession.status, 'ended');
});

test('signed answer webhook rejects the wrong call and transient failure returns retry XML', async () => {
  const options = {}; const s = await setup(options); await s.start();
  const hook = await load('src/app/api/plivo/consultation-webhook/route.js', { '@/lib/plivoConsultation': s.api });
  const url = s.api.consultationWebhookUrl(s.ctx, s.row(), 'answer', 'customer');
  const request = uuid => new Request(url, { method: 'POST', body: new URLSearchParams({ CallUUID: uuid }) });
  assert.equal((await hook.POST(request(GUEST))).status, 403);
  assert.match(await (await hook.POST(request(CUSTOMER))).text(), /role="Customer" hold="true"/);
  options.missingTable = true;
  const retry = await hook.POST(request(CUSTOMER));
  assert.equal(retry.status, 200); assert.match(await retry.text(), /<Wait length="2"\/><Redirect/);
});

test('transient MPC storage failure in Dial action does not hang up the transferred agent', async () => {
  const options = {}; const s = await setup(options); await s.start(); options.missingTable = true;
  const action = await load('src/app/api/plivo/dial-action/route.js', { ...s.dependencies, '@/lib/plivoConsultation': s.api });
  const result = await action.POST(new Request('https://crm.example.com/api/plivo/dial-action?room=room_test_123', { method: 'POST', body: '' }));
  const xml = await result.text();
  assert.match(xml, /<Wait length="2"\/>/); assert.doesNotMatch(xml, /<Hangup/);
  assert.equal(s.db.tables.call_sessions[0].status, 'connected');
});

test('temporary provider failure never ends a native call; a confirmed missing active MPC is reconciled', async () => {
  const options = {}; const s = await setup(options); await s.start(); await s.api.consultationAction(s.nativeCtx(), 'cancel');
  options.listError = 500;
  await assert.rejects(s.api.consultationStatus(s.nativeCtx()), /Provider unavailable/);
  assert.equal(s.db.tables.call_sessions[0].status, 'connected');
  options.listError = 404;
  assert.equal((await s.api.consultationStatus(s.nativeCtx())).phase, 'ended');
});

test('localhost cannot mix old production callbacks with a new consultation tunnel', async () => {
  const s = await setup();
  const savedConsultation = process.env.PLIVO_CONSULTATION_BASE_URL;
  const savedApp = process.env.NEXT_PUBLIC_APP_URL;
  try {
    delete process.env.PLIVO_CONSULTATION_BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const request = new Request('http://localhost:3000/api/plivo/consultation');
    assert.throws(() => s.api.consultationBaseUrl(request), /public HTTPS tunnel/);
    process.env.PLIVO_CONSULTATION_BASE_URL = BASE;
    assert.throws(() => s.api.consultationBaseUrl(request), /same updated public server/);
    process.env.NEXT_PUBLIC_APP_URL = BASE;
    assert.equal(s.api.consultationBaseUrl(request), BASE);
  } finally {
    if (savedConsultation === undefined) delete process.env.PLIVO_CONSULTATION_BASE_URL;
    else process.env.PLIVO_CONSULTATION_BASE_URL = savedConsultation;
    if (savedApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = savedApp;
  }
});

test('provider history with exitTime is excluded from live members and cannot block caller resume', async () => {
  const s = await setup(); await s.start(); await s.join();
  s.live.find(p => p.callUuid === GUEST).exitTime = '2026-10-20 17:55:41+00:00';
  s.live.push({ memberId: 'old', callUuid: 'old-call', exit_time: '2026-10-20T17:00:00Z', hold: null });
  await s.api.consultationEvent(s.nativeCtx(), { EventName: 'ParticipantExit', ParticipantCallUUID: GUEST },
    { role: 'guest', attempt: s.row().attempt_id });
  assert.equal(s.row().phase, 'active'); assert.equal(s.live.find(p => p.callUuid === CUSTOMER).hold, false);
  assert.equal(s.log.filter(e => e[0] === 'kick').length, 0);
  const view = await s.api.consultationStatus(s.nativeCtx());
  assert.deepEqual(Array.from(view.members, p => p.callUuid), [AGENT, CUSTOMER]);
});

test('guest exit between listing and kick is reconciled before resuming the original caller', async () => {
  const s = await setup(); await s.start(); await s.join();
  s.client.multiPartyCalls.kickParticipant = async id => {
    s.log.push(['kick', id]);
    s.live.find(p => p.memberId === id).exitTime = '2026-10-20 17:55:41+00:00';
    throw Object.assign(new Error('participant already exited, cannot perform kick MPC participant'), { statusCode: 400 });
  };
  const view = await s.api.consultationAction(s.nativeCtx(), 'cancel');
  assert.equal(view.phase, 'active'); assert.equal(s.live.find(p => p.callUuid === CUSTOMER).hold, false);
  assert.deepEqual(Array.from(view.members, p => p.callUuid), [AGENT, CUSTOMER]);
});

test('an unrelated kick failure keeps the original caller isolated', async () => {
  const s = await setup(); await s.start(); await s.join();
  s.client.multiPartyCalls.kickParticipant = async () => { throw new Error('Provider unavailable'); };
  await assert.rejects(s.api.consultationAction(s.nativeCtx(), 'cancel'), /Provider unavailable/);
  assert.equal(s.row().phase, 'cancelling'); assert.equal(s.live.find(p => p.callUuid === CUSTOMER).hold, true);
});

test('participant views expose full customer/guest phone numbers separately from role labels', async () => {
  const s = await setup();
  s.ctx.session.customer_number = '6283362279';
  s.db.tables.call_sessions[0].customer_number = '6283362279';
  await s.start(); await s.join();
  const view = await s.api.consultationStatus(s.nativeCtx());
  const customer = view.members.find(p => p.callUuid === CUSTOMER);
  const guest = view.members.find(p => p.callUuid === GUEST);
  assert.equal(customer.callerName, 'Customer'); assert.equal(customer.phoneNumber, '+916283362279');
  assert.equal(guest.callerName, 'Third person'); assert.equal(guest.phoneNumber, '+919876543210');
  assert.equal(view.members.find(p => p.callUuid === AGENT).phoneNumber, '');
  await s.api.consultationAction(s.nativeCtx(), 'merge');
  await s.api.startConsultation(s.nativeCtx(), '9876543211', BASE, { fetcher: health });
  const nextView = await s.api.consultationStatus(s.nativeCtx());
  assert.equal(nextView.members.find(p => p.callUuid === GUEST).phoneNumber, '+919876543210');
  assert.equal(nextView.members.find(p => p.callUuid === CUSTOMER).phoneNumber, '+916283362279');
});

test('initial XML and later invites use the same hold callback for both participant roles', async () => {
  const s = await setup(); await s.start();
  const holdUrl = s.api.consultationWebhookUrl(s.ctx, s.row(), 'hold');
  for (const role of ['agent', 'customer']) {
    const xml = s.api.consultationAnswerXml(s.ctx, s.row(), role);
    assert.match(xml, /agentHoldMusicUrl=/); assert.match(xml, /customerHoldMusicUrl=/);
    assert.match(xml, /agentHoldMusicMethod="GET"/); assert.match(xml, /customerHoldMusicMethod="GET"/);
  }
  const invite = s.log.find(entry => entry[0] === 'add')[2];
  assert.equal(invite.customerHoldMusicUrl, holdUrl); assert.equal(invite.agentHoldMusicUrl, holdUrl);
  const hook = await load('src/app/api/plivo/consultation-webhook/route.js', { '@/lib/plivoConsultation': s.api });
  const response = await hook.GET(new Request(holdUrl));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<Play loop="0">https:\/\/updated\.example\.com\/plivo-hold-tone\.wav<\/Play>/);
});

test('hold audio is a small non-silent mono PCM WAV suitable for telephone playback', () => {
  const wav = fs.readFileSync(new URL('../public/plivo-hold-tone.wav', import.meta.url));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(20), 1); assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 8000); assert.equal(wav.readUInt16LE(34), 16);
  assert.ok(wav.length < 100000);
  let energy = 0, peak = 0;
  for (let at = 44; at + 1 < wav.length; at += 2) {
    const sample = wav.readInt16LE(at); energy += sample * sample; peak = Math.max(peak, Math.abs(sample));
  }
  assert.ok(Math.sqrt(energy / ((wav.length - 44) / 2)) > 1000, 'Hold tone must contain audible signal');
  assert.ok(peak < 32767, 'Hold tone must not clip');
});

test('manual Hold promotes only the two connected callers and never dials a third person', async () => {
  const s = await setup();
  const view = await s.api.prepareCallControls(s.ctx, 'customer', 'hold', BASE, { fetcher: health, pollDelay: 0 });
  assert.equal(view.phase, 'active'); assert.equal(view.canMerge, false); assert.equal(view.busy, false);
  assert.equal(view.controlsOnly, true);
  assert.equal(view.members.length, 2);
  assert.equal(view.members.find(p => p.callUuid === CUSTOMER).held, true);
  assert.equal(view.members.find(p => p.callUuid === AGENT).held, false);
  assert.equal(s.log.filter(e => e[0] === 'transfer').length, 1);
  assert.equal(s.log.filter(e => ['add', 'cancel', 'hangup', 'kick'].includes(e[0])).length, 0);
  assert.equal(s.row().data.dial_requested, false);
  assert.equal(s.row().data.guest_number, '');
  const holdUrl = s.api.consultationWebhookUrl(s.ctx, s.row(), 'hold');
  assert.ok(holdUrl.startsWith(BASE));
  assert.match(s.api.consultationAnswerXml(s.ctx, s.row(), 'customer'), /customerHoldMusicUrl=/);
  const resumed = await s.api.consultationAction(s.nativeCtx(), 'unhold', { memberId: '2' });
  assert.equal(resumed.members.find(p => p.callUuid === CUSTOMER).held, false);
  assert.equal(s.log.filter(e => e[0] === 'transfer').length, 1);
});

test('mobile-agent Mute uses the same controlled promotion and resumes the customer after setup', async () => {
  const s = await setup();
  const view = await s.api.prepareCallControls(s.ctx, 'agent', 'mute', BASE, { fetcher: health, pollDelay: 0 });
  assert.equal(view.members.find(p => p.callUuid === AGENT).muted, true);
  assert.equal(view.members.find(p => p.callUuid === CUSTOMER).held, false);
  assert.equal(s.log.some(e => e[0] === 'add'), false);
  const unmuted = await s.api.prepareCallControls(s.nativeCtx(), 'agent', 'unmute', BASE);
  assert.equal(unmuted.members.find(p => p.callUuid === AGENT).muted, false);
  assert.equal(s.log.filter(e => e[0] === 'transfer').length, 1);
});

test('Add Call still holds, consults privately, and explicitly merges after manual controls were prepared', async () => {
  const s = await setup();
  await s.api.prepareCallControls(s.ctx, 'customer', 'hold', BASE, { fetcher: health, pollDelay: 0 });
  await s.api.consultationAction(s.nativeCtx(), 'unhold', { memberId: '2' });
  const dialing = await s.api.startConsultation(s.nativeCtx(), '9876543210', BASE, { fetcher: health });
  assert.equal(dialing.phase, 'dialing'); assert.equal(dialing.canMerge, false);
  assert.equal(dialing.controlsOnly, false);
  assert.equal(s.live.find(p => p.callUuid === CUSTOMER).hold, true);
  await s.join();
  const consulting = await s.api.consultationStatus(s.nativeCtx());
  assert.equal(consulting.phase, 'consulting'); assert.equal(consulting.canMerge, true);
  assert.equal(s.live.find(p => p.callUuid === CUSTOMER).hold, true);
  const merged = await s.api.consultationAction(s.nativeCtx(), 'merge', { attemptId: s.row().attempt_id });
  assert.equal(merged.phase, 'merged'); assert.equal(merged.members.length, 3);
  assert.equal(s.live.find(p => p.callUuid === CUSTOMER).hold, false);
  assert.equal(s.log.filter(e => e[0] === 'transfer').length, 1);
});

test('manual controls validate role/action and public readiness before touching a live call', async () => {
  for (const [role, action] of [['guest', 'hold'], ['agent', 'start'], ['customer', 'kick']]) {
    const s = await setup();
    await assert.rejects(s.api.prepareCallControls(s.ctx, role, action, BASE), /Invalid call control/);
    assert.equal(s.log.length, 0); assert.equal(s.db.tables.call_sessions[0].conference_name, null);
  }
  for (const missingTable of [false, true]) {
    const s = await setup({ missingTable });
    await assert.rejects(s.api.prepareCallControls(s.ctx, 'customer', 'hold', BASE, {
      fetcher: async () => ({ ok: false }),
    }), /setup is not ready|not publicly reachable/);
    assert.equal(s.log.length, 0); assert.equal(s.db.tables.call_sessions[0].conference_name, null);
  }
});

test('rejected manual-control transfer leaves no guest request and restores the direct-call marker', async () => {
  const s = await setup({ transferError: true });
  await assert.rejects(s.api.prepareCallControls(s.ctx, 'customer', 'hold', BASE, { fetcher: health, pollDelay: 0 }), /Transfer rejected/);
  assert.equal(s.db.tables.call_sessions[0].conference_name, null);
  assert.equal(s.db.tables.call_sessions[0].status, 'connected');
  assert.equal(s.row().phase, 'active'); assert.equal(s.log.some(e => e[0] === 'add'), false);
});

test('unconfirmed manual Hold resumes the customer and leaves a recoverable call', async () => {
  const s = await setup({ ignoreHold: true });
  await assert.rejects(s.api.prepareCallControls(s.ctx, 'customer', 'hold', BASE, { fetcher: health, pollDelay: 0 }), /could not be confirmed/);
  assert.equal(s.live.find(p => p.callUuid === CUSTOMER).hold, false);
  assert.equal(s.row().phase, 'active'); assert.equal(s.db.tables.call_sessions[0].status, 'connected');
  assert.equal(s.log.some(e => e[0] === 'add'), false);
});

test('manual Hold waits for delayed original callers beyond the old Add Call readiness window', async () => {
  const s = await setup({ delayedJoinPolls: 16 });
  const view = await s.api.prepareCallControls(s.ctx, 'customer', 'hold', BASE, { fetcher: health, pollDelay: 0 });
  assert.equal(view.phase, 'active'); assert.equal(view.controlsOnly, true);
  assert.equal(view.members.find(p => p.callUuid === CUSTOMER).held, true);
  assert.ok(s.log.filter(e => e[0] === 'list').length >= 16);
  assert.equal(s.log.some(e => e[0] === 'add'), false);
});

test('manual-control timeout is bounded, mentions no third person, and permits recovery', async () => {
  const s = await setup({ delayedJoinPolls: 1000 });
  await assert.rejects(s.api.prepareCallControls(s.ctx, 'customer', 'hold', BASE, { fetcher: health, pollDelay: 0 }),
    error => /taking longer to connect/.test(error.message) && !/third|Add Call/i.test(error.message));
  assert.equal(s.row().data.dial_requested, false);
  assert.equal(s.row().phase, 'active');
  assert.ok(s.log.filter(e => e[0] === 'list').length < 40);
  assert.equal(s.log.some(e => ['add', 'hangup', 'kick'].includes(e[0])), false);
});

test('a confirmed manual-control retry clears old setup errors while an unconfirmed retry retains them', async () => {
  const options = {};
  const s = await setup(options);
  await s.api.prepareCallControls(s.ctx, 'customer', 'hold', BASE, { fetcher: health, pollDelay: 0 });
  s.row().data.last_error = 'Old setup timeout';
  const resumed = await s.api.consultationAction(s.nativeCtx(), 'unhold', { memberId: '2' });
  assert.equal(resumed.error, ''); assert.equal(resumed.members.find(p => p.callUuid === CUSTOMER).held, false);
  s.row().data.last_error = 'Hold needs attention'; options.ignoreHold = true;
  const notHeld = await s.api.consultationAction(s.nativeCtx(), 'hold', { memberId: '2' });
  assert.equal(notHeld.error, 'Hold needs attention');
});

async function panelHarness({ consultation = null, onToggleMute, fetcher, onCallEnded = () => {}, shortcutControlsRef = { current: null }, durationLabel = '00:00', contacts = {} } = {}) {
  const React = require('react');
  const state = [
    [{ memberId: 'agent_leg', callUuid: AGENT, callerName: 'Agent (You)', muted: false },
      { memberId: 'customer_leg', callUuid: CUSTOMER, callerName: 'Customer', muted: false }],
    '', null, {}, false, consultation, '', { isOpen: false },
  ];
  const effects = [];
  const refs = [], callbacks = [];
  let cursor = 0, refAt = 0;
  const hooks = { ...React, useState(initial) {
    const at = cursor++;
    if (!(at in state)) state[at] = typeof initial === 'function' ? initial() : initial;
    return [state[at], value => { state[at] = typeof value === 'function' ? value(state[at]) : value; }];
  }, useRef: value => {
    const at = refAt++;
    const ref = refs[at] ||= { current: value };
    if (at === 0) ref.current = state[5];
    return ref;
  }, useEffect: fn => effects.push(fn), useCallback: fn => { callbacks.push(fn); return fn; } };
  const { default: Panel } = await load('src/components/CallCenter/ActiveCallPanel.jsx', {
    react: hooks, 'lucide-react': require('lucide-react'),
    '@/utils/supabase/client': { createClient: () => { throw new Error('No live DB in UI tests'); } },
    './useSoftphoneContacts': { useSoftphoneContacts: () => number => contacts[normalizeIndianPhoneNumber(number)] || { name: 'UnKnow Person' } },
    './Softphone.module.css': new Proxy({}, { get: (_, key) => key }),
  }, { fetch: fetcher || (async () => { throw new Error('Unexpected network request'); }) });
  const session = { id: SESSION_ID, room_name: 'room_test_123', status: 'connected',
    agent_call_uuid: AGENT, customer_call_uuid: CUSTOMER, customer_number: '9876543210' };
  const render = () => {
    cursor = 0;
    refAt = 0;
    effects.length = 0;
    callbacks.length = 0;
    const outer = Panel({ session, userId: USER, agentData: { id: AGENT, user_id: USER }, onCallEnded, onToggleMute, microphoneMuted: false, shortcutControlsRef, durationLabel });
    return outer.type(outer.props);
  };
  const flatten = tree => {
    if (!tree || typeof tree !== 'object') return [];
    return [tree, ...React.Children.toArray(tree.props?.children).flatMap(flatten)];
  };
  const text = node => typeof node === 'string' ? node :
    React.Children.toArray(node?.props?.children).map(child => typeof child === 'object' ? text(child) : String(child)).join('');
  const button = (label, tree = render()) => flatten(tree).find(node => node.type === 'button' && text(node) === label);
  return { state, session, render, flatten, text, button, effects, callbacks, shortcutControlsRef };
}

test('connected call duration is visible beside the call status and remains visible during Hold', async () => {
  const h = await panelHarness({ durationLabel: '02:05' });
  const duration = () => h.flatten(h.render()).find(node => node.props?.['aria-label'] === 'Call duration');
  assert.equal(h.text(duration()), '02:05');
  h.state[3] = { customer_leg: true };
  assert.equal(h.text(duration()), '02:05');
  assert.equal(h.button('Resume').props.disabled, false);
  h.session.status = 'customer_ringing';
  assert.equal(h.text(duration()), '00:00');
  h.session.customer_answer_time = '2026-10-23T19:57:03+05:30';
  assert.equal(h.text(duration()), '02:05');
  const defaultPanel = await panelHarness();
  assert.equal(defaultPanel.text(defaultPanel.flatten(defaultPanel.render()).find(node => node.props?.['aria-label'] === 'Call duration')), '00:00');
});

test('customer names appear in the call header and pending/live participants while numbers remain visible', async () => {
  const contacts = { '+919876543210': { name: 'Asha Verma', source: 'user' }, '+919999999999': { name: 'Recruiter Candidate', source: 'recruiter' } };
  const h = await panelHarness({ contacts });
  const heading = h.flatten(h.render()).find(node => node.props?.['aria-label'] === 'Call contact name');
  assert.equal(h.text(heading), 'Asha Verma');
  assert.ok(h.text(h.render()).includes('9876543210'));
  assert.ok(h.text(h.render()).includes('Agent (You)'));
  assert.ok(h.text(h.render()).split('Asha Verma').length >= 3);
  h.session.status = 'customer_ringing';
  assert.ok(h.text(h.render()).includes('Connecting to telecom line...') || h.text(h.render()).includes('Carrier connecting customer line...'));
  assert.ok(h.text(h.render()).includes('Asha Verma'));
  h.state[0].push({ memberId: 'guest', phoneNumber: '+919999999999', callUuid: GUEST });
  assert.ok(h.text(h.render()).includes('Recruiter Candidate'));
  delete contacts['+919876543210'];
  assert.equal(h.text(h.flatten(h.render()).find(node => node.props?.['aria-label'] === 'Call contact name')), 'UnKnow Person');
});

test('normal agent_leg/customer_leg calls render enabled Mute, Hold and End controls before participants', async () => {
  let muted = 0;
  const requests = [];
  const h = await panelHarness({ onToggleMute: () => { muted++; }, fetcher: async (url, options) => {
    requests.push([url, JSON.parse(options.body)]);
    return { ok: true, json: async () => ({ consultation: { phase: 'active', members: [
      { memberId: '1', callUuid: AGENT }, { memberId: '2', callUuid: CUSTOMER, held: true },
    ] } }) };
  } });
  const tree = h.render();
  for (const label of ['Mute', 'Hold', 'End Call']) assert.equal(h.button(label, tree).props.disabled, false, label);
  assert.ok(h.text(tree).indexOf('Mute') < h.text(tree).indexOf('Live Participants'));
  await h.button('Mute', tree).props.onClick(); assert.equal(muted, 1); assert.equal(requests.length, 0);
  await h.button('Hold', tree).props.onClick();
  assert.equal(requests[0][1].action, 'prepare-controls');
  assert.equal(requests[0][1].role, 'customer'); assert.equal(requests[0][1].control, 'hold');
  assert.equal(h.button('Resume').props.disabled, false);
});

test('Hold shows progress immediately, blocks duplicate actions and ignores an older in-flight participant poll', async () => {
  let finishPoll, finishHold, requests = 0;
  const h = await panelHarness({ fetcher: async (url, init) => {
    if (!init) return new Promise(resolve => { finishPoll = () => resolve({ ok: true, json: async () => ({ members: [
      { memberId: 'agent_leg', callUuid: AGENT }, { memberId: 'customer_leg', callUuid: CUSTOMER }
    ] }) }); });
    requests++;
    return new Promise(resolve => { finishHold = () => resolve({ ok: true, json: async () => ({ consultation: {
      phase: 'active', controlsOnly: true, members: [{ memberId: '1', callUuid: AGENT }, { memberId: '2', callUuid: CUSTOMER, held: true }]
    } }) }); });
  } });
  h.render(); const poll = h.callbacks[0]();
  const click = h.button('Hold').props.onClick, operation = click(); await click();
  assert.equal(h.button('Updating hold…').props['aria-busy'], true);
  assert.equal(h.button('Updating hold…').props.disabled, true); assert.equal(requests, 1);
  finishHold(); await operation; assert.equal(h.button('Resume').props.disabled, false);
  finishPoll(); await poll; assert.equal(h.button('Resume').props.disabled, false);
  assert.equal(h.state[0][1].memberId, '2');
});

test('failed Hold clears immediate progress and keeps the confirmed state available for retry', async () => {
  let finish;
  const h = await panelHarness({ fetcher: () => new Promise(resolve => {
    finish = () => resolve({ ok: false, json: async () => ({ error: 'Provider unavailable' }) });
  }) });
  const operation = h.button('Hold').props.onClick();
  assert.equal(h.button('Updating hold…').props.disabled, true);
  finish(); await operation;
  assert.equal(h.button('Hold').props.disabled, false); assert.match(h.state[6], /Provider unavailable/);
});

test('legacy participant removal still refreshes confirmed members while owning its action lock', async () => {
  const requests = [];
  const h = await panelHarness({ fetcher: async (url) => {
    requests.push(url);
    return { ok: true, json: async () => ({ members: [{ memberId: 'agent_leg', callUuid: AGENT }, { memberId: 'customer_leg', callUuid: CUSTOMER }] }) };
  } });
  h.state[0].push({ memberId: '3', callUuid: GUEST });
  h.flatten(h.render()).filter(node => node.props?.title === 'Kick Participant').at(-1).props.onClick();
  await h.state[7].onConfirm();
  assert.equal(h.state[0].length, 2); assert.equal(requests.length, 2);
});

test('End Call reacts immediately and a late Hold response cannot clear its pending state or report success early', async () => {
  let finishHold, finishEnd, ended = 0;
  const h = await panelHarness({ onCallEnded: () => { ended++; }, fetcher: (url) => new Promise(resolve => {
    if (url.endsWith('/hangup-conference')) finishEnd = () => resolve({ ok: true });
    else finishHold = () => resolve({ ok: true, json: async () => ({ consultation: { phase: 'active', controlsOnly: true, members: [] } }) });
  }) });
  const hold = h.button('Hold').props.onClick();
  const end = h.button('End Call').props.onClick();
  assert.equal(h.button('Ending call…').props.disabled, true); assert.equal(ended, 0);
  finishHold(); await hold;
  assert.equal(h.button('Ending call…').props.disabled, true);
  assert.equal(h.state[5], null, 'Superseded Hold response must not repaint the call');
  finishEnd(); await end; assert.equal(ended, 1);
});

test('Merge is visible above participants while ringing and enables in consulting even without a busy flag', async () => {
  const requests = [];
  const h = await panelHarness({ consultation: { phase: 'ringing', canMerge: false }, fetcher: async (url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ consultation: { phase: 'merged', members: [] } }) };
  } });
  assert.equal(h.button('Merge Calls').props.disabled, true);
  h.state[5] = { phase: 'consulting', canMerge: true, attemptId: 'current-attempt' };
  const tree = h.render();
  assert.equal(h.button('Merge Calls', tree).props.disabled, false);
  assert.equal(h.button('Cancel & Resume', tree).props.disabled, false);
  assert.ok(h.text(tree).indexOf('Merge Calls') < h.text(tree).indexOf('Live Participants'));
  await h.button('Merge Calls', tree).props.onClick();
  assert.equal(requests[0].action, 'merge'); assert.equal(requests[0].attemptId, 'current-attempt');
});

test('End Call does not report success when the server rejects hangup', async () => {
  let ended = 0;
  const h = await panelHarness({ onCallEnded: () => { ended++; }, fetcher: async () => ({ ok: false }) });
  await h.button('End Call').props.onClick();
  assert.equal(h.state[7].isOpen, false);
  assert.equal(ended, 0); assert.match(h.state[6], /could not be ended/);
});

test('normal two-person calls end directly, including calls promoted only for manual Hold', async () => {
  for (const consultation of [null, { phase: 'active', controlsOnly: true }]) {
    let ended = 0;
    const requests = [];
    const h = await panelHarness({ consultation, onCallEnded: () => { ended++; }, fetcher: async (url, options) => {
      requests.push([url, JSON.parse(options.body)]); return { ok: true };
    } });
    await h.button('End Call').props.onClick();
    assert.equal(h.state[7].isOpen, false); assert.equal(ended, 1);
    assert.equal(requests.length, 1); assert.equal(requests[0][1].roomName, 'room_test_123');
  }
});

test('merged calls require End All Calls confirmation and Cancel keeps every participant connected', async () => {
  let ended = 0;
  const requests = [];
  const h = await panelHarness({ consultation: { phase: 'merged' }, onCallEnded: () => { ended++; },
    fetcher: async (url, options) => { requests.push([url, JSON.parse(options.body)]); return { ok: true }; } });
  h.state[0].push({ memberId: '3', callUuid: GUEST, callerName: 'Third person' });
  h.button('End All').props.onClick();
  assert.equal(h.state[7].title, 'End All Calls?'); assert.equal(h.state[7].confirmLabel, 'End All Calls');
  assert.equal(requests.length, 0); assert.equal(ended, 0);
  h.button('Cancel').props.onClick();
  assert.equal(h.state[7].isOpen, false); assert.equal(requests.length, 0);
  h.button('End All').props.onClick(); await h.state[7].onConfirm();
  assert.equal(requests.length, 1); assert.equal(ended, 1);
});

test('keyboard registration uses the same Mute/Hold/End guards and never bypasses a conference confirmation', async () => {
  const requests = [];
  const h = await panelHarness({ consultation: { phase: 'merged' }, fetcher: async (url, options) => {
    requests.push([url, JSON.parse(options.body)]); return { ok: true };
  } });
  h.state[0].push({ memberId: '3', callUuid: GUEST });
  h.render(); const cleanup = h.effects.at(-1)();
  assert.equal(h.shortcutControlsRef.current.requiresEndConfirmation, true);
  assert.equal(h.shortcutControlsRef.current.canHold, true);
  h.shortcutControlsRef.current.end();
  assert.equal(h.state[7].isOpen, true); assert.equal(requests.length, 0);
  cleanup(); assert.equal(h.shortcutControlsRef.current, null);
});

async function widgetShortcutHarness({ active = true, hidden = false, minimized = false, controls, dialog = false, durationSeconds = 0 } = {}) {
  const React = require('react'), effects = [], listeners = new Map();
  const state = { 0: minimized, 1: hidden, 3: 'online',
    9: durationSeconds,
    10: active ? { id: SESSION_ID, room_name: 'room_test_123', status: 'connected', calling_mode: 'mobile' } : null,
    13: { id: AGENT, plivo_endpoint_key: '123', plivo_sip_uri: 'sip:test@phone.plivo.com' } };
  let cursor = 0;
  const hooks = { ...React, useState(initial) {
    const at = cursor++;
    if (!(at in state)) state[at] = typeof initial === 'function' ? initial() : initial;
    return [state[at], value => { state[at] = typeof value === 'function' ? value(state[at]) : value; }];
  }, useRef: value => ({ current: value }), useEffect: effect => effects.push(effect), useCallback: fn => fn };
  const windowMock = { addEventListener(name, listener, capture) {
    assert.equal(name, 'keydown'); assert.equal(capture, true); listeners.set(name, listener);
  }, removeEventListener(name, listener, capture) {
    assert.equal(listeners.get(name), listener); assert.equal(capture, true); listeners.delete(name);
  } };
  const ActivePanel = () => null;
  const { default: Widget } = await load('src/components/CallCenter/GlobalSoftphoneWidget.jsx', {
    react: hooks, 'lucide-react': require('lucide-react'), 'react-draggable': props => props.children,
    './ActiveCallPanel': ActivePanel, './Softphone.module.css': new Proxy({}, { get: (_, key) => key }),
    './useSoftphoneContacts': { useSoftphoneContacts: () => () => ({ name: 'UnKnow Person' }) },
    './useIncomingRingtone': { useIncomingRingtone: () => ({ enabled: true, stop() {}, silence() {}, toggleEnabled() {} }) },
    '@/utils/supabase/client': { createClient: () => ({}) }, '@/app/actions/team': { getRecentCalls: async () => [] },
    '@/app/api/plivo/phone-number': { normalizeIndianPhoneNumber },
    '@/app/api/plivo/outbound-intent': { incomingMatchesOutboundRoom: () => false, shouldAutoAnswerOutbound: () => false },
    '@/lib/softphoneIncomingCall': { createIncomingCallGuard: () => ({}), incomingCallUuid: () => null },
    '@/lib/softphoneConnectionRecovery': { createSoftphoneConnectionRecovery },
  }, { window: windowMock, document: { querySelector: () => dialog ? {} : null } });
  const flatten = node => !node || typeof node !== 'object' ? [] :
    [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)];
  const render = () => { cursor = 0; return flatten(Widget({ userId: USER })); };
  const nodes = render();
  const panel = nodes.find(node => node.type === ActivePanel);
  if (panel) panel.props.shortcutControlsRef.current = controls;
  const effect = effects.find(fn => String(fn).includes('handleCallShortcut'));
  assert.ok(effect, 'Shortcut listener must be registered');
  const cleanup = effect();
  const press = (key, extra = {}) => {
    const result = { prevented: 0, stopped: 0 };
    listeners.get('keydown')({ key, ctrlKey: true, altKey: false, metaKey: false, shiftKey: false,
      preventDefault() { result.prevented++; }, stopPropagation() { result.stopped++; }, ...extra });
    return result;
  };
  return { state, nodes, panel, press, cleanup, listeners, render };
}

test('the existing softphone timer reaches the single active panel and updates while docked or minimized', async () => {
  for (const visibility of [{ hidden: false, minimized: false }, { hidden: true, minimized: true }]) {
    const h = await widgetShortcutHarness({ ...visibility, durationSeconds: 125, controls: {} });
    assert.equal(h.panel.props.durationLabel, '02:05');
    assert.equal(h.nodes.filter(node => node.type === h.panel.type).length, 1);
    assert.equal(h.nodes.filter(node => node.props?.title === 'End Call (Hang Up)').length, 0, 'Do not duplicate the standalone call card');
    h.state[9] = 126;
    assert.equal(h.render().find(node => node.type === h.panel.type).props.durationLabel, '02:06');
    h.cleanup();
  }
});

test('Ctrl+M/H/E use the active call controls, suppress defaults, and ignore held-key repeats', async () => {
  let muted = false, held = false, ended = 0;
  const h = await widgetShortcutHarness({ controls: { canMute: true, canHold: true, canEnd: true,
    mute() { muted = !muted; }, hold() { held = !held; }, end() { ended++; } } });
  assert.equal(h.press('m').prevented, 1); assert.equal(muted, true);
  h.press('m', { repeat: true }); assert.equal(muted, true);
  h.press('M'); assert.equal(muted, false);
  assert.equal(h.press('h').prevented, 1); assert.equal(held, true);
  h.press('h'); assert.equal(held, false);
  assert.equal(h.press('e').prevented, 1); assert.equal(ended, 1);
  h.press('e', { repeat: true }); assert.equal(ended, 1);
  h.cleanup(); assert.equal(h.listeners.size, 0);
});

test('shortcuts preserve disabled controls, modal confirmation, unrelated keys and idle browser defaults', async () => {
  let actions = 0;
  const controls = { canMute: false, canHold: false, canEnd: false,
    mute() { actions++; }, hold() { actions++; }, end() { actions++; } };
  const disabled = await widgetShortcutHarness({ controls });
  for (const key of ['m', 'h', 'e']) disabled.press(key);
  assert.equal(actions, 0);
  assert.equal(disabled.press('k').prevented, 0);
  assert.equal(disabled.press('m', { ctrlKey: false }).prevented, 0);
  assert.equal(disabled.press('m', { shiftKey: true }).prevented, 0);
  disabled.cleanup();
  const modal = await widgetShortcutHarness({ controls: { ...controls, canEnd: true, modalOpen: true } });
  modal.press('e'); assert.equal(actions, 0); modal.cleanup();
  const idle = await widgetShortcutHarness({ active: false });
  for (const key of ['m', 'h', 'e']) assert.equal(idle.press(key).prevented, 0);
  idle.cleanup();
});

test('docked/minimized calls retain controls and Ctrl+E reveals the required conference confirmation', async () => {
  let confirmations = 0;
  const h = await widgetShortcutHarness({ hidden: true, minimized: true, controls: {
    canEnd: true, requiresEndConfirmation: true, end() { confirmations++; },
  } });
  assert.ok(h.panel, 'Active controls must stay mounted while docked/minimized');
  h.press('e'); assert.equal(confirmations, 1);
  assert.equal(h.state[0], false); assert.equal(h.state[1], false);
  h.cleanup();
});

test('calling method has only Browser and Via Mobile toggles and shows the agent number only for Mobile', async () => {
  const React = require('react');
  const state = { 0: false, 1: false, 3: 'online', 13: { id: AGENT, plivo_endpoint_key: '123', plivo_username: 'test', plivo_sip_uri: 'sip:test@phone.plivo.com' },
    14: '9876543210', 15: 'browser_webrtc', 16: '9876543211' };
  let cursor = 0;
  const hooks = { ...React, useState(initial) {
    const at = cursor++;
    if (!(at in state)) state[at] = typeof initial === 'function' ? initial() : initial;
    return [state[at], value => { state[at] = typeof value === 'function' ? value(state[at]) : value; }];
  }, useRef: value => ({ current: value }), useEffect() {}, useCallback: fn => fn };
  const { default: Widget } = await load('src/components/CallCenter/GlobalSoftphoneWidget.jsx', {
    react: hooks, 'lucide-react': require('lucide-react'), 'react-draggable': props => props.children,
    './ActiveCallPanel': () => null, './Softphone.module.css': new Proxy({}, { get: (_, key) => key }),
    './useSoftphoneContacts': { useSoftphoneContacts: () => () => ({ name: 'UnKnow Person' }) },
    './useIncomingRingtone': { useIncomingRingtone: () => ({ enabled: true, stop() {}, silence() {}, toggleEnabled() {} }) },
    '@/utils/supabase/client': { createClient: () => ({}) }, '@/app/actions/team': { getRecentCalls: async () => [] },
    '@/app/api/plivo/phone-number': { normalizeIndianPhoneNumber },
    '@/app/api/plivo/outbound-intent': { incomingMatchesOutboundRoom: () => false, shouldAutoAnswerOutbound: () => false },
    '@/lib/softphoneIncomingCall': { createIncomingCallGuard: () => ({}), incomingCallUuid: () => null },
    '@/lib/softphoneConnectionRecovery': { createSoftphoneConnectionRecovery },
  });
  const flatten = node => !node || typeof node !== 'object' ? [] :
    [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)];
  const render = () => { cursor = 0; return flatten(Widget({ userId: USER })); };
  let nodes = render();
  const group = nodes.find(node => node.props?.role === 'group');
  const buttons = React.Children.toArray(group.props.children);
  assert.equal(buttons.length, 2); assert.equal(buttons[0].props['aria-pressed'], true);
  assert.equal(nodes.some(node => node.type === 'select'), false);
  assert.equal(nodes.some(node => node.props?.id === 'crm-softphone-agent-mobile'), false);
  buttons[1].props.onClick(); nodes = render();
  assert.equal(state[15], 'mobile');
  assert.equal(nodes.some(node => node.props?.id === 'crm-softphone-agent-mobile'), true);
  const mobileButtons = React.Children.toArray(nodes.find(node => node.props?.role === 'group').props.children);
  assert.equal(mobileButtons[1].props['aria-pressed'], true);
  mobileButtons[0].props.onClick(); nodes = render();
  assert.equal(state[15], 'browser_webrtc');
  assert.equal(nodes.some(node => node.props?.id === 'crm-softphone-agent-mobile'), false);
});
