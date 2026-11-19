import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const swc = require('next/dist/build/swc');
await swc.loadBindings();
export const TENANT = '11111111-1111-4111-8111-111111111111';
export const OTHER = '22222222-2222-4222-8222-222222222222';
export const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const REQUEST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const root = new URL('../', import.meta.url);
export const source = file => fs.readFileSync(new URL(file, root), 'utf8');
export async function compile(file) {
  return (await swc.transform(source(file), { filename: file, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } } }, module: { type: 'commonjs' } })).code;
}
export function load(code, dependencies, extra = {}) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, { module:loadedModule, exports: loadedModule.exports, require(name) {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, console: { error() {}, warn() {} }, Date, Math, JSON, Promise, Map, Set, Buffer, ...extra });
  return loadedModule.exports;
}
const billingCode = await compile('src/lib/saasBilling.js');
const accessCode = await compile('src/lib/saasAccess.js');
const actionsCode = await compile('src/app/actions/saasSubscription.js');
const entitlements = load(await compile('src/utils/saasEntitlements.js'), {});
const branches = load(await compile('src/utils/branchAccess.js'), {});
export const billing = load(billingCode, {});

export function harness(options = {}) {
  const calls = [];
  const tables = {
    tenants: [{ id: TENANT, name: 'Audit Company', tenant_code: 'TNT00004', primary_contact_email: 'owner@audit.invalid', status: 'ACTIVE' }, { id: OTHER, name: 'Other Company', tenant_code: 'TNT00005', status: 'ACTIVE' }],
    user_roles: [{ user_id: ACTOR, tenant_id: TENANT, company: 'Audit Company', role: options.role || 'masteradmin', is_approved: true, emp_status: 'Active' }],
    tenant_subscriptions: [{ id: USER, tenant_id: TENANT, user_seat_limit: 5, status: 'ACTIVE', valid_until: '2028-12-31T18:29:59Z', created_at: '2026-01-01T00:00:00Z' }],
    tenant_entitlements: [], saas_billing_events: [], call_agents: [], ...options.tables
  };
  const admin = {
    auth: { admin: options.authAdmin || { createUser: async () => ({ data: { user: { id: USER } }, error: null }), listUsers: async () => ({ data: { users: [] }, error: null }) } },
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return options.rpc ? options.rpc(name, args) : { data: null, error: { code: 'PGRST202', message: 'RPC unavailable' } }; },
    from(table) {
      const q = { table, operation: 'select', filters: [] };
      const query = {
        select() { return query; }, order() { return query; }, limit() { return query; }, or() { return query; },
        eq(key, value) { q.filters.push([key, value]); return query; }, in(key, values) { q.filters.push([key, values]); return query; },
        maybeSingle() { q.single = true; return query; }, single() { q.single = true; return query; },
        upsert(payload) { q.operation = 'upsert'; q.payload = payload; return query; },
        insert(payload) { q.operation = 'insert'; q.payload = payload; return query; },
        update(payload) { q.operation = 'update'; q.payload = payload; return query; },
        delete() { throw new Error('Deletion is forbidden during verification.'); },
        then(resolve, reject) { return Promise.resolve().then(() => {
          calls.push(q);
          if (options.fail?.(q)) return { data: null, error: { message: 'Injected database failure', code: 'XX001' } };
          const rows = (tables[table] || []).filter(row => q.filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
          return { data: q.single ? rows[0] || null : rows, error: null };
        }).then(resolve, reject); }
      };
      return query;
    }
  };
  const session = { auth: { getUser: async () => options.anonymous ? { data: { user: null }, error: null } : { data: { user: { id: ACTOR, email: options.email || 'actor@audit.invalid' } }, error: null } } };
  const access = load(accessCode, { 'server-only': {}, '@/utils/supabase/server': { createClient: async () => session }, '@/utils/saasEntitlements': entitlements });
  const actions = load(actionsCode, {
    '@supabase/supabase-js': { createClient: () => admin },
    'fs/promises': { readFile: async () => '{}', mkdir: async () => {}, writeFile: async () => { throw new Error('Disk writes forbidden in tests'); } }, path,
    'node:crypto': crypto, '@/utils/branchAccess':branches, '@/utils/saasEntitlements': entitlements, '@/lib/saasAccess': access, '@/lib/saasBilling': billing,
    '@/app/actions/tenantBranches': { saveTenantBranch: async () => options.branchFailure ? { success: false, error: 'Branch unavailable' } : { success: true } }
  }, { process: { cwd: () => '.', env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only' } } });
  return { actions, access, calls, tables, admin };
}

export let PGlite;
try { PGlite = require('@electric-sql/pglite').PGlite; } catch { /* Optional local SQL verification engine; never a runtime dependency. */ }
export async function postgres() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE tenants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_code text UNIQUE,name text,primary_contact_email text,primary_contact_mobile text,status text,updated_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE user_roles(user_id uuid PRIMARY KEY,tenant_id uuid,company text,role text,module_access jsonb DEFAULT '{}',is_approved boolean,emp_status text,email text,emp_official_mail_id text,can_read boolean,can_write boolean,emp_id text,emp_name text,emp_mobile text,emp_designation text,emp_department text);
    CREATE TABLE tenant_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid REFERENCES tenants(id),plan_name text,user_seat_limit integer,valid_from timestamptz,valid_until timestamptz,status text,billing_cycle text,amount numeric,created_at timestamptz DEFAULT now());
    CREATE TABLE tenant_entitlements(tenant_id uuid REFERENCES tenants(id),module_key text,is_enabled boolean,config_json jsonb,UNIQUE(tenant_id,module_key));
    CREATE TABLE companies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid REFERENCES tenants(id),code text,name text,status text);
    INSERT INTO tenants(id,tenant_code,name,primary_contact_email,status) VALUES ('${TENANT}','TNT00004','Audit Company','owner@audit.invalid','ACTIVE'),('${OTHER}','TNT00005','Other Company','other@audit.invalid','ACTIVE');
    INSERT INTO tenant_subscriptions(id,tenant_id,user_seat_limit,valid_until,status,billing_cycle,amount) VALUES ('${USER}','${TENANT}',5,'2028-12-31T23:59:59+05:30','ACTIVE','YEARLY',100);
    INSERT INTO user_roles(user_id,tenant_id,company,role,is_approved,emp_status,email) VALUES ('${ACTOR}','${TENANT}','Audit Company','admin',true,'Active','owner@audit.invalid'),('${USER}','${OTHER}','Other Company','agent',true,'Active','employee@other.invalid');`);
  await db.exec(source('migrations/54_saas_billing_safety.sql'));
  return db;
}
export async function operation(db, kind, payload, request = REQUEST, tenant = TENANT) {
  const result = await db.query('SELECT saas_apply_billing_operation($1,$2,$3,$4,$5) AS result', [tenant, ACTOR, request, kind, JSON.stringify(payload)]);
  return result.rows[0].result;
}

if (process.argv[1]?.endsWith('saas-access.test.mjs')) {
  test('anonymous callers cannot list workspaces or change pricing', async () => {
    const { actions, calls } = harness({ anonymous: true });
    assert.equal((await actions.getAllTenantsWithSubscriptions()).success, false);
    assert.equal((await actions.updateProcessRate('ATTENDANCE', 1)).success, false);
    assert.equal(calls.filter(q => q.operation === 'upsert').length, 0);
  });
  test('ordinary administrators cannot use Master Admin actions', async () => {
    const { actions } = harness({ role: 'admin' });
    assert.equal((await actions.updateProcessRate('ATTENDANCE', 1)).success, false);
    assert.equal((await actions.getAllMasterInvoices()).success, false);
  });
  test('employees can read only their own subscription and entitlements', async () => {
    const { actions } = harness({ role: 'agent' });
    assert.equal((await actions.getTenantSubscription(TENANT)).success, true);
    assert.equal((await actions.getTenantSubscription(OTHER)).success, false);
    assert.equal((await actions.getTenantEntitlements(OTHER)).success, false);
  });
  test('regular employees cannot request add-ons', async () => {
    const { actions, calls } = harness({ role: 'agent' });
    assert.equal((await actions.purchaseAddonSeats(TENANT, 1, REQUEST)).success, false);
    assert.equal(calls.filter(q => q.rpc).length, 0);
  });
  test('Master Admin retains the overview shape used by Email Config, User Management and Call Admin', async () => {
    const { actions } = harness();
    const result = await actions.getAllTenantsWithSubscriptions();
    assert.equal(result.success, true);
    const tenant = result.tenants.find(t => t.id === TENANT);
    for (const key of ['id','tenant_code','name','subscription','entitlements','active_users_count','user_seat_limit','smtp_accounts_limit','calling_seats_limit','calling_mode','telephony_config']) assert.ok(key in tenant, key);
  });
  test('unknown tenant aliases fail instead of resolving to New Swan', async () => {
    const { actions } = harness();
    assert.equal((await actions.getTenantSubscription('unknown-company')).success, false);
  });
  test('held users cannot read tenant data', async () => {
    const { actions } = harness({ role: 'agent', tables: { user_roles: [{ user_id: ACTOR, tenant_id: TENANT, role: 'agent', is_approved: false }] } });
    assert.equal((await actions.getTenantEntitlements(TENANT)).success, false);
  });
}
