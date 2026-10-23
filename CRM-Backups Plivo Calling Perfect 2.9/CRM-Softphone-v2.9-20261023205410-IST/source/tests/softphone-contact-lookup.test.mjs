import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { normalizeIndianPhoneNumber } from '../src/app/api/plivo/phone-number.js';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
const compile = file => swc.transformSync(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
  filename: file, jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' }
}).code;
const routeCode = compile('src/app/api/plivo/contact-name/route.js');
const hookCode = compile('src/components/CallCenter/useSoftphoneContacts.js');
const DEFAULT = '00000000-0000-0000-0000-000000000001';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PHONE = '+916283362779';
const USER_PHONE = '+919876543210';
const CANDIDATE_PHONE = '+919999999999';
const copy = value => JSON.parse(JSON.stringify(value));

function server(options = {}) {
  const log = [];
  const tables = {
    tenants: [{ id: A, name: 'Client A', tenant_code: 'CA' }, { id: B, name: 'Client B', tenant_code: 'CB' }],
    user_roles: [
      { user_id: 'owner-a', company: 'Client A', tenant_id: A, module_access: {} },
      { user_id: 'employee-a', company: 'Client A', tenant_id: A, emp_name: 'Employee A', emp_mobile: '98765 43210' },
      { user_id: 'employee-b', company: 'Client B', tenant_id: B, emp_name: 'Private Employee B', emp_mobile: USER_PHONE }
    ],
    leads: [
      { id: 'lead-a', tenant_id: A, our_company: 'Client A', name: 'Lead A', phone: PHONE },
      { id: 'lead-b', tenant_id: B, our_company: 'Client B', name: 'Private Lead B', phone: PHONE }
    ],
    recruitment_candidates: [
      { id: 'candidate-a', name: 'Candidate A', phone: CANDIDATE_PHONE, position_id: 'position-a' },
      { id: 'candidate-b', name: 'Private Candidate B', phone: CANDIDATE_PHONE, position_id: 'position-b' }
    ],
    recruitment_positions: [
      { id: 'position-a', jd_text: `Job\n<!--WORKSPACE:${JSON.stringify({ tenant_id: A, company: 'Client A' })}-->` },
      { id: 'position-b', jd_text: `Job\n<!--WORKSPACE:${JSON.stringify({ tenant_id: B, company: 'Client B' })}-->` }
    ],
    party_master: [], party_contacts: []
  };
  const db = { from(table) {
    const filters = [];
    let one = false, max = Infinity, phoneExpression = '';
    const columnsUsed = new Set();
    const query = {
      select() { return this; },
      eq(key, value) { columnsUsed.add(key); filters.push(row => row[key] === value); return this; },
      in(key, values) { columnsUsed.add(key); filters.push(row => values.includes(row[key])); return this; },
      is(key, value) { columnsUsed.add(key); filters.push(row => value === null ? row[key] == null : row[key] === value); return this; },
      or(expression) {
        phoneExpression = expression;
        const tests = expression.split(',').map(clause => {
          const [field, pattern] = clause.split('.ilike.');
          columnsUsed.add(field);
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return row => regex.test(String(field.includes('->>') ? row.module_access?.[field.split('->>')[1]] || '' : row[field] || ''));
        });
        filters.push(row => tests.some(matches => matches(row)));
        return this;
      },
      limit(value) { max = value; return this; },
      maybeSingle() { one = true; return this; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          log.push({ table, columns: [...columnsUsed], phoneExpression });
          if (options.failTable === table) return { data: null, error: { code: 'XX001', message: 'Synthetic read failure' } };
          const missing = [...columnsUsed].find(column => options.missing?.[table]?.includes(column));
          if (missing) return { data: null, error: { code: '42703', message: `column ${table}.${missing} does not exist` } };
          const rows = (tables[table] || []).filter(row => filters.every(matches => matches(row))).slice(0, max);
          return { data: one ? copy(rows[0] || null) : copy(rows), error: null };
        }).then(resolve, reject);
      }
    };
    return query;
  } };
  const exports = {};
  vm.runInNewContext(routeCode, { exports, process: { env: {} },
    require(name) {
      if (name === 'next/server') return require(name);
      if (name === '@supabase/supabase-js') return { createClient: () => db };
      if (name === '@/app/api/plivo/phone-number') return { normalizeIndianPhoneNumber };
      if (name === '@/app/actions/team') return { getSoftphoneAgentProfile: async target => {
        if (options.noUser) return { data: null, status: 401 };
        if (target && target !== 'owner-a') return { data: null, status: 403 };
        return { data: { user_id: 'owner-a', is_active: !options.revoked }, status: 200 };
      } };
      throw new Error(`Unexpected dependency ${name}`);
    }
  });
  const request = async (phones, extra = {}) => {
    const response = await exports.POST(new Request('https://crm.example.test/api/plivo/contact-name', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phones, ...extra })
    }));
    return { response, body: await response.json() };
  };
  return { tables, log, request };
}

test('lookup finds tenant lead, employee and recruiter names while returning only display metadata', async () => {
  const app = server();
  const { response, body } = await app.request([PHONE, USER_PHONE, CANDIDATE_PHONE]);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.deepEqual(body.contacts[PHONE], { name: 'Lead A', source: 'lead', recordId: 'lead-a' });
  assert.equal(body.contacts[USER_PHONE].name, 'Employee A');
  assert.equal(body.contacts[CANDIDATE_PHONE].name, 'Candidate A');
  assert.ok(!JSON.stringify(body).includes('Private'));
  assert.ok(Object.values(body.contacts).every(contact => Object.keys(contact).sort().join() === 'name,recordId,source'));
});

test('contact-person numbers select the matching name and formatted/alternate user phones normalize completely', async () => {
  const app = server();
  Object.assign(app.tables.leads[0], { phone: '+918888888888', cp2_name: 'Second Contact', cp2_mobile_2: '+91 62833-62779' });
  Object.assign(app.tables.user_roles[1], { emp_mobile: '', emp_alt_mobile: USER_PHONE });
  let result = await app.request([PHONE, USER_PHONE]);
  assert.equal(result.body.contacts[PHONE].name, 'Second Contact');
  assert.equal(result.body.contacts[USER_PHONE].name, 'Employee A');
  app.tables.user_roles[1].emp_alt_mobile = '';
  app.tables.user_roles[1].module_access = { emp_alt_mobile: '09876543210' };
  result = await app.request(['62833 62779', '09876543210']);
  assert.equal(result.body.contacts[USER_PHONE].name, 'Employee A');
  assert.equal(result.body.contacts[PHONE].name, 'Second Contact');
});

test('Lead Data business name takes priority for CP1, CP2 and CP3; a blank business falls back to the matching person', async () => {
  const app = server();
  Object.assign(app.tables.leads[0], { company: 'Business A', name: 'CP One',
    cp2_name: 'CP Two', cp2_mobile_1: USER_PHONE, cp3_name: 'CP Three', cp3_mobile_2: CANDIDATE_PHONE });
  let { body } = await app.request([PHONE, USER_PHONE, CANDIDATE_PHONE]);
  assert.ok(Object.values(body.contacts).every(contact => contact.name === 'Business A'));
  app.tables.leads[0].company = null;
  ({ body } = await app.request([PHONE, USER_PHONE, CANDIDATE_PHONE]));
  assert.equal(body.contacts[PHONE].name, 'CP One');
  assert.equal(body.contacts[USER_PHONE].name, 'CP Two');
  assert.equal(body.contacts[CANDIDATE_PHONE].name, 'CP Three');
  app.tables.leads[0].name = '';
  app.tables.leads[0].cp1_name = 'Legacy CP One';
  assert.equal((await app.request([PHONE])).body.contacts[PHONE].name, 'Legacy CP One');
});

test('Party Master metadata matches CP1, CP2 and CP3, preferring the business name before contact names', async () => {
  const app = server();
  const metadata = { our_company: 'Client A',
    contact_person_name_1: 'Party CP One', contact_mobile_1_1: PHONE,
    contact_person_name_2: 'Party CP Two', contact_mobile_2_2: USER_PHONE,
    contact_person_name_3: 'Party CP Three', contact_alt_mobile_3_1: CANDIDATE_PHONE };
  const party = { id: 'party-a', tenant_id: A, firm_name: 'Party Business A', primary_mobile: '+918888888888',
    business_nature: `SWAN_PARTY_META:${JSON.stringify(metadata)}` };
  app.tables.party_master.push(party);
  let { body } = await app.request([PHONE, USER_PHONE, CANDIDATE_PHONE]);
  assert.ok(Object.values(body.contacts).every(contact => contact.name === 'Party Business A' && contact.source === 'party'));
  party.firm_name = '  ';
  party.legal_name = 'Legal entity';
  party.trade_name = 'Other alias';
  ({ body } = await app.request([PHONE, USER_PHONE, CANDIDATE_PHONE]));
  assert.equal(body.contacts[PHONE].name, 'Party CP One');
  assert.equal(body.contacts[USER_PHONE].name, 'Party CP Two');
  assert.equal(body.contacts[CANDIDATE_PHONE].name, 'Party CP Three');
});

test('Party contact children and transferred lead links respect parent tenant ownership', async () => {
  const app = server();
  app.tables.party_master.push({ id: 'party-a', tenant_id: A, firm_name: 'Transferred Business', source_lead_id: 'lead-a' },
    { id: 'party-b', tenant_id: B, firm_name: 'Private Party B', primary_mobile: USER_PHONE });
  app.tables.party_contacts.push({ id: 'contact-a', party_id: 'party-a', contact_name: 'Party Contact A', alternate_mobile: USER_PHONE },
    { id: 'contact-b', party_id: 'party-b', contact_name: 'Private Contact B', primary_mobile: CANDIDATE_PHONE });
  let { body } = await app.request([PHONE, USER_PHONE, CANDIDATE_PHONE]);
  assert.equal(body.contacts[PHONE].name, 'Transferred Business');
  assert.equal(body.contacts[USER_PHONE].name, 'Transferred Business');
  assert.equal(body.contacts[CANDIDATE_PHONE].name, 'Candidate A');
  assert.ok(!JSON.stringify(body).includes('Private'));
  app.tables.party_master[0].firm_name = null;
  ({ body } = await app.request([USER_PHONE]));
  assert.equal(body.contacts[USER_PHONE].name, 'Party Contact A');
});

test('missing names, partial-number matches and names from another tenant produce the exact fallback', async () => {
  const app = server();
  app.tables.leads[0].name = '  ';
  app.tables.user_roles[1].emp_name = '';
  app.tables.recruitment_positions[0].jd_text = app.tables.recruitment_positions[1].jd_text;
  app.tables.leads.push({ id: 'wrong-number', tenant_id: A, our_company: 'Client A', name: 'Partial Match', phone: `+911${PHONE.slice(3)}` });
  const { body } = await app.request([PHONE, USER_PHONE, CANDIDATE_PHONE]);
  assert.ok(Object.values(body.contacts).every(contact => contact.name === 'UnKnow Person'));
  assert.ok(!JSON.stringify(body).includes('Private'));
});

test('authentication and employee ownership are checked before contact reads; caller-supplied workspace is ignored', async () => {
  for (const options of [{ noUser: true }, { revoked: true }]) {
    const app = server(options);
    assert.equal((await app.request([PHONE])).response.status, options.noUser ? 401 : 403);
    assert.equal(app.log.length, 0);
  }
  const app = server();
  assert.equal((await app.request([PHONE], { userId: 'owner-b' })).response.status, 403);
  assert.equal(app.log.length, 0);
  const { body } = await app.request([PHONE], { company: 'Client B', tenantId: B });
  assert.equal(body.contacts[PHONE].name, 'Lead A');
});

test('legacy company scoping and JSON mobile fields work without widening access after missing-column errors', async () => {
  const app = server({ missing: { user_roles: ['tenant_id', 'emp_alt_mobile'], leads: ['tenant_id', 'cp1_alt_1', 'cp2_alt_2'] } });
  for (const row of [...app.tables.leads, ...app.tables.user_roles]) delete row.tenant_id;
  app.tables.user_roles[0].module_access = { _tenantId: A };
  app.tables.user_roles[1].emp_mobile = '';
  app.tables.user_roles[1].module_access = { emp_alt_mobile: USER_PHONE };
  const { body } = await app.request([PHONE, USER_PHONE]);
  assert.equal(body.contacts[PHONE].name, 'Lead A');
  assert.equal(body.contacts[USER_PHONE].name, 'Employee A');
  assert.ok(!JSON.stringify(body).includes('Private'));
  assert.ok(app.log.some(query => query.columns.includes('our_company')));
});

test('verified legacy New Swan profiles resolve blank and null company rows while explicit foreign tenants remain excluded', async () => {
  const app = server({ missing: { user_roles: ['tenant_id'], leads: ['tenant_id'] } });
  Object.assign(app.tables.user_roles[0], { company: '', tenant_id: null, module_access: {}, email: 'admin@newswangroup.com' });
  Object.assign(app.tables.leads[0], { tenant_id: null, our_company: '', company: 'Legacy Swan Business' });
  Object.assign(app.tables.user_roles[1], { tenant_id: null, company: null });
  Object.assign(app.tables.leads[1], { our_company: '' });
  const { body } = await app.request([PHONE, USER_PHONE]);
  assert.equal(body.contacts[PHONE].name, 'Legacy Swan Business');
  assert.equal(body.contacts[USER_PHONE].name, 'Employee A');
  assert.ok(!JSON.stringify(body).includes('Private'));
  app.tables.user_roles[0].email = 'unverified@example.test';
  assert.equal((await app.request([PHONE])).response.status, 503);
});

test('explicit tenant mismatches override matching company labels; untagged recruiter positions stay in Swan', async () => {
  const app = server();
  Object.assign(app.tables.leads[0], { tenant_id: B });
  app.tables.recruitment_positions[0].jd_text = 'Legacy untagged job';
  const { body } = await app.request([PHONE, CANDIDATE_PHONE]);
  assert.equal(body.contacts[PHONE].name, 'UnKnow Person');
  assert.equal(body.contacts[CANDIDATE_PHONE].name, 'UnKnow Person');

  const swan = server();
  Object.assign(swan.tables.user_roles[0], { tenant_id: DEFAULT, company: 'NSMLR' });
  swan.tables.recruitment_positions[0].jd_text = 'Legacy untagged job';
  assert.equal((await swan.request([CANDIDATE_PHONE])).body.contacts[CANDIDATE_PHONE].name, 'Candidate A');
});

test('bounded invalid input and unavailable data degrade gracefully without a provider or database mutation', async () => {
  const app = server();
  assert.equal((await app.request(Array(13).fill(PHONE))).response.status, 400);
  assert.equal((await app.request('invalid')).response.status, 400);
  assert.deepEqual((await app.request(['123', 'sip:admin@phone.plivo.com'])).body.contacts, {});
  assert.equal((await server({ failTable: 'user_roles' }).request([PHONE])).response.status, 503);
  const partial = await server({ failTable: 'leads' }).request([PHONE, USER_PHONE]);
  assert.equal(partial.body.contacts[PHONE].name, 'UnKnow Person');
  assert.equal(partial.body.contacts[USER_PHONE].name, 'Employee A');
  const batch = await app.request(Array.from({ length: 12 }, (_, index) => `+9162833627${String(index).padStart(2, '0')}`));
  assert.equal(Object.keys(batch.body.contacts).length, 12);
  assert.ok(app.log.every(query => query.phoneExpression.length < 6000), 'Phone filters must fit within proxy URL limits');
});

function client(fetcher) {
  const runtime = { current: null, now: Date.now(), requests: [] };
  const exports = {};
  vm.runInNewContext(hookCode, { exports, AbortSignal, Date: { now: () => runtime.now },
    fetch(url, options) { runtime.requests.push({ url, options }); return fetcher(url, options); },
    require(name) {
      if (name === '@/app/api/plivo/phone-number') return { normalizeIndianPhoneNumber };
      if (name === 'react') return {
        useState(initial) {
          const h = runtime.current, index = h.cursor++;
          if (!(index in h.state)) h.state[index] = initial;
          return [h.state[index], next => { h.state[index] = next; h.updates++; }];
        },
        useEffect(effect) { runtime.current.effects.push(effect); }
      };
      throw new Error(`Unexpected dependency ${name}`);
    }
  });
  const mount = (userId = 'owner-a', phones = [PHONE], scope = 'agent-a') => {
    const h = { userId, phones, scope, state: [], effects: [], cursor: 0, updates: 0 };
    h.render = () => { runtime.current = h; h.cursor = 0; h.effects = []; return exports.useSoftphoneContacts(h.userId, h.phones, h.scope); };
    h.effect = () => h.effects[0]();
    return h;
  };
  return { runtime, mount };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = contacts => ({ ok: true, json: async () => ({ contacts }) });

test('name enrichment is non-blocking, deduplicates concurrent reads and reuses only user-scoped short-lived cache', async () => {
  const app = client(async (_url, options) => response({ [PHONE]: { name: JSON.parse(options.body).userId, source: 'lead', recordId: 'lead-a' } }));
  const one = app.mount(), two = app.mount();
  assert.equal(one.render()(PHONE).name, 'UnKnow Person');
  one.effect(); two.render(); two.effect();
  await flush();
  assert.equal(app.runtime.requests.length, 1);
  assert.equal(one.render()(PHONE).name, 'owner-a');
  assert.equal(two.render()(PHONE).name, 'owner-a');
  const remounted = app.mount(); remounted.render(); remounted.effect(); await flush();
  assert.equal(app.runtime.requests.length, 1);
  const other = app.mount('owner-b');
  assert.equal(other.render()(PHONE).name, 'UnKnow Person'); other.effect(); await flush();
  assert.equal(other.render()(PHONE).name, 'owner-b');
  app.runtime.now += 60001;
  const expired = app.mount(); expired.render(); expired.effect(); await flush();
  assert.equal(app.runtime.requests.length, 3);
  for (const request of app.runtime.requests) {
    assert.equal(request.options.credentials, 'same-origin');
    assert.equal(request.options.cache, 'no-store');
    assert.deepEqual(Object.keys(JSON.parse(request.options.body)).sort(), ['phones', 'userId']);
  }
});

test('late caller metadata cannot overwrite a new call or recreate a canceled incoming invite', async () => {
  let finish;
  const app = client(() => new Promise(resolve => { finish = resolve; }));
  const call = app.mount(); call.render(); const cancel = call.effect(); await flush();
  cancel(); call.phones = [USER_PHONE];
  finish(response({ [PHONE]: { name: 'Old Caller', source: 'lead' } })); await flush();
  assert.equal(call.updates, 0);
  assert.equal(call.render()(PHONE).name, 'UnKnow Person');
});

test('failed metadata requests do not cache failures or prevent retrying, including a synchronous transport failure', async () => {
  let attempts = 0;
  const app = client(() => {
    if (++attempts === 1) throw new Error('Synthetic network failure');
    return Promise.resolve(response({ [PHONE]: { name: 'Recovered Name', source: 'user' } }));
  });
  const first = app.mount(); first.render(); first.effect(); await flush();
  assert.equal(first.render()(PHONE).name, 'UnKnow Person');
  const retry = app.mount(); retry.render(); retry.effect(); await flush();
  assert.equal(retry.render()(PHONE).name, 'Recovered Name');
  assert.equal(attempts, 2);
});
