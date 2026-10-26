import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const code = swc.transformSync(fs.readFileSync(new URL('../src/app/api/plivo/admin/endpoints/route.js', import.meta.url), 'utf8'), {
  filename: 'route.js', jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' }
}).code;

function fixture(options = {}) {
  const rows = options.empty ? [] : [
    { id: 'agent-a', user_id: 'employee-a', plivo_username: 'actual-sip-user', plivo_endpoint_key: 'LEGACY_ALIAS', plivo_password: 'old-secret', status: 'offline', is_active: true },
    { id: 'shadow', user_id: null, plivo_username: 'ACTUAL-SIP-USER', plivo_endpoint_key: '174793004058391', plivo_password: 'old-secret', status: 'offline' }
  ];
  const log = { provider: [], writes: [], access: [] };
  let verification = false;
  const db = { from() {
    let operation = 'read', payload, columns = '*'; const filters = [];
    return {
      select(value = '*') { columns = value; return this; },
      not(key, _op, value) { filters.push(row => row[key] !== value); return this; },
      in(key, values) { filters.push(row => values.includes(row[key])); return this; },
      eq(key, value) { filters.push(row => row[key] === value); return this; },
      or() { filters.push(row => row.plivo_username?.toLowerCase() === 'actual-sip-user' || row.plivo_endpoint_key === '174793004058391'); return this; },
      update(value) { operation = 'update'; payload = value; return this; },
      insert(value) { operation = 'insert'; payload = value; return this; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (options.failRead && operation === 'read') return { error: { message: 'Read unavailable' }, data: null };
        if (options.failWrite && operation !== 'read') return { error: { message: 'Write unavailable' }, data: null };
        let data = rows.filter(row => filters.every(filter => filter(row)));
        if (operation !== 'read') {
          log.writes.push({ operation, payload }); verification = true;
          if (options.zeroWrite) return { data: [], error: null };
          if (operation === 'update') data.forEach(row => Object.assign(row, payload));
          else { const row = { id: 'new-shadow', ...payload }; rows.push(row); data = [row]; }
        }
        data = data.map(row => ({ ...row }));
        if (options.badVerification && verification && operation === 'read' && columns.includes('plivo_password')) data.forEach(row => { row.plivo_password = 'different'; });
        return { data, error: null };
      }).then(resolve, reject); }
    };
  } };
  const context = { db, company: 'NSMLR', tenantId: null };
  const exports = {};
  vm.runInNewContext(code, {
    exports, Buffer, URL, AbortSignal, process: { env: {} }, console: { error() {}, warn() {} },
    fetch: async (url, init = {}) => {
      assert.match(String(url), /^https:\/\/api\.plivo\.com\/v1\/Account\/test-account\/Endpoint\//);
      log.provider.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
      if (init.method === 'POST') return { ok: !options.providerReject, json: async () => ({ error: 'Provider rejected update' }) };
      const endpoint = { endpoint_id: '174793004058391', username: 'actual-sip-user', alias: 'Calling Agent', sip_uri: 'sip:actual-sip-user@phone.plivo.com' };
      return { ok: !options.endpointMissing, json: async () => String(url).includes('?')
        ? options.endpointPages?.[Math.floor(Number(new URL(url).searchParams.get('offset') || 0) / 20)] || { objects: [endpoint], meta: { next: null, total_count: 1 } } : endpoint };
    },
    require(name) {
      if (name === 'next/server') return require('next/server');
      if (name === '@supabase/supabase-js') return { createClient: () => db };
      if (name === '@/utils/telephonyConfig') return { getCompanySlug: value => value.toLowerCase().replace(/\W/g, '_'), getWorkspaceTelephonyConfig: async () => ({ authId: 'test-account', authToken: 'test-token', isSwan: !options.foreignEndpoint, mode: 'managed' }) };
      if (name === '@/lib/callCenterPageData') return {
        privateHeaders: { 'Cache-Control': 'private, no-store' },
        requireCallCenterAccess: async (_req, input) => {
          log.access.push(input);
          if (options.noUser) throw Object.assign(new Error('Please sign in again.'), { status: 401 });
          return context;
        },
        readWorkspaceAdmin: async () => ({ agents: options.foreignAssignment ? [] : rows.filter(row => row.user_id), endpoints: [] })
      };
      throw new Error(`Unexpected import ${name}`);
    }
  });
  const post = async (extra = {}) => {
    const response = await exports.POST({ url: 'http://localhost/api/plivo/admin/endpoints', json: async () => ({
      action: 'update_password', endpointId: '174793004058391', username: 'untrusted-browser-user', password: 'new-example-password', ...extra
    }) });
    return { status: response.status, data: await response.json() };
  };
  return { rows, log, post, GET: exports.GET };
}

test('SIP password save uses the verified provider username and synchronizes assigned and shadow records', async () => {
  const app = fixture();
  const result = await app.post();
  assert.equal(result.data.success, true);
  assert.ok(app.rows.every(row => row.plivo_password === 'new-example-password'));
  assert.equal(app.rows[0].plivo_endpoint_key, 'LEGACY_ALIAS');
  assert.equal(app.rows[0].is_active, true);
  assert.deepEqual(Object.keys(app.log.writes[0].payload), ['plivo_password']);
  assert.equal(app.log.access[0].operation, 'edit');
  const response = await app.GET({ url: 'http://localhost/api/plivo/admin/endpoints' });
  assert.equal((await response.json()).endpoints[0].password, 'new-example-password');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('an unassigned endpoint gets verified inactive credential storage without an employee assignment', async () => {
  const app = fixture({ empty: true });
  assert.equal((await app.post()).data.success, true);
  assert.equal(app.rows.length, 1);
  assert.equal(app.rows[0].user_id, null);
  assert.equal(app.rows[0].is_active, false);
});

for (const option of ['failWrite', 'zeroWrite', 'badVerification']) {
  test(`SIP save reports partial synchronization when ${option} occurs`, async () => {
    const app = fixture({ [option]: true });
    const result = await app.post();
    assert.equal(result.status, 503);
    assert.equal(result.data.success, false);
    assert.equal(result.data.providerUpdated, true);
    assert.match(result.data.error, /Retry saving the same password/);
    assert.ok(!JSON.stringify(result.data).includes('new-example-password'));
  });
}

for (const option of ['noUser', 'foreignAssignment', 'foreignEndpoint', 'endpointMissing', 'failRead']) {
  test(`SIP preflight stops unsafe provider mutation for ${option}`, async () => {
    const app = fixture({ [option]: true, ...(option === 'foreignEndpoint' ? { foreignAssignment: true, empty: true } : {}) });
    const result = await app.post();
    assert.notEqual(result.status, 200);
    assert.ok(!app.log.provider.some(call => call.method === 'POST'));
    assert.equal(app.log.writes.length, 0);
  });
}

test('provider failure and invalid passwords never write a CRM credential', async () => {
  const app = fixture({ providerReject: true });
  assert.notEqual((await app.post()).status, 200);
  assert.equal(app.log.writes.length, 0);
  const invalid = fixture();
  assert.equal((await invalid.post({ password: 'abc' })).status, 400);
  assert.equal(invalid.log.provider.length, 0);
});

test('the assignment selector loads every provider page even when total_count is missing', async () => {
  const endpoint = id => ({ endpoint_id: String(id), username: `sip-${id}`, alias: `Endpoint ${id}` });
  const app = fixture({ endpointPages: [
    { objects: Array.from({ length: 20 }, (_, index) => endpoint(index + 1)), meta: { next: '/next-page' } },
    { objects: [endpoint(21), endpoint(22), endpoint(23)], meta: { next: null } }
  ] });
  const response = await app.GET({ url: 'http://localhost/api/plivo/admin/endpoints?purpose=assignment' });
  const data = await response.json();
  assert.equal(data.endpoints.length, 23);
  assert.equal(app.log.provider.length, 2);
  assert.equal(app.log.access[0].section, 'agents');
  assert.equal(data.endpoints.at(-1).endpoint_id, '23');
});
