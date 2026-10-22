import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const actionSource = fs.readFileSync(new URL('../src/app/actions/offlineRules.js', import.meta.url), 'utf8');
const actionCode = actionSource.slice(actionSource.indexOf('const DEFAULT_OFFLINE_RULES'))
  .replaceAll('export async function', 'async function');

function policyHarness({ savedFeatures = {}, readError = null } = {}) {
  let saved;
  const admin = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          if (table === 'user_roles') return { data: { role: 'admin', emp_name: 'Admin' }, error: null };
          return { data: savedFeatures ? { permissions: { features: savedFeatures } } : null, error: readError };
        },
        async upsert(row) { saved = row.permissions; return { error: null }; }
      };
    }
  };
  const context = {
    getAdminClient: () => admin,
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-id', email: 'admin@example.com' } } }) } }),
    logAuditAction: async () => {},
    console: { warn() {}, error() {} }
  };
  const actions = vm.runInNewContext(`${actionCode}\n({ getOfflineRuleSettings, saveOfflineRuleSettings, DEFAULT_OFFLINE_RULES })`, context);
  return { ...actions, get saved() { return saved; } };
}

test('every policy toggle survives cloud save and reload', async () => {
  const harness = policyHarness({ savedFeatures: { leadNotes: true } });
  const requested = Object.fromEntries(Object.keys(harness.DEFAULT_OFFLINE_RULES.features).map((key) => [key, true]));
  requested.leadNotes = false;
  const result = await harness.saveOfflineRuleSettings({
    isOfflineEnabled: true, dailyQuotaHours: 5, monthlyQuotaHours: 50,
    features: requested, autoSyncOnReconnect: true, maxQueueItemsPerDevice: 500
  });
  assert.equal(result.success, true);
  assert.deepEqual(Object.keys(harness.saved.features).sort(), Object.keys(requested).sort());
  assert.equal(harness.saved.features.leadNotes, false);
  assert.equal(harness.saved.features.workplaceWms, true);
});

test('old partial policy submissions preserve stored feature values', async () => {
  const harness = policyHarness({ savedFeatures: { delegationCreate: false, checklistSubmit: true } });
  const result = await harness.saveOfflineRuleSettings({
    isOfflineEnabled: true, features: { leadNotes: false }
  });
  assert.equal(result.success, true);
  assert.equal(harness.saved.features.delegationCreate, false);
  assert.equal(harness.saved.features.checklistSubmit, true);
  assert.equal(harness.saved.features.leadNotes, false);
});

test('policy read failure is reported instead of replacing device rules with defaults', async () => {
  const harness = policyHarness({ readError: { message: 'network error' } });
  const result = await harness.getOfflineRuleSettings();
  assert.equal(result.success, false);
  assert.equal(result.settings, undefined);
});

function serviceWorkerHarness() {
  const handlers = {};
  const cacheMaps = new Map();
  let online = true;
  const cacheKey = (request) => typeof request === 'string' ? request : request.url;
  const caches = {
    async open(name) {
      if (!cacheMaps.has(name)) cacheMaps.set(name, new Map());
      const entries = cacheMaps.get(name);
      return {
        async match(request) { return entries.get(cacheKey(request))?.clone(); },
        async put(request, response) { entries.set(cacheKey(request), response.clone()); }
      };
    }
  };
  const self = {
    location: { origin: 'https://crm.test' },
    addEventListener(name, handler) { handlers[name] = handler; },
    skipWaiting() {},
    clients: { async claim() {} }
  };
  const fetch = async (request) => {
    if (!online) throw new Error('offline');
    const url = new URL(typeof request === 'string' ? request : request.url);
    const response = new Response(`<html>${url.pathname}</html>`, {
      status: 200, headers: { 'content-type': 'text/html' }
    });
    Object.defineProperty(response, 'url', { value: url.href });
    return response;
  };
  vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self, caches, Request, Response, URL, fetch, console, Promise, encodeURIComponent
  });
  const message = async (data) => {
    const work = [];
    handlers.message({ data, waitUntil(promise) { work.push(promise); } });
    await Promise.all(work);
  };
  const navigate = async (path) => {
    let responsePromise;
    const work = [];
    handlers.fetch({
      request: { method: 'GET', mode: 'navigate', url: `https://crm.test${path}` },
      respondWith(promise) { responsePromise = promise; },
      waitUntil(promise) { work.push(promise); }
    });
    await Promise.all(work);
    return responsePromise ? responsePromise : null;
  };
  return { message, navigate, setOnline(value) { online = value; } };
}

test('offline refresh uses only the active account’s cached workspace', async () => {
  const sw = serviceWorkerHarness();
  await sw.message({ type: 'OFFLINE_SESSION_READY', userId: 'user-a', pageUrl: 'https://crm.test/checklist' });
  sw.setOnline(false);
  assert.match(await (await sw.navigate('/checklist')).text(), /<html>\/checklist<\/html>/);
  await sw.message({ type: 'OFFLINE_SESSION_READY', userId: 'user-b', pageUrl: 'https://crm.test/checklist' });
  const otherAccount = await sw.navigate('/checklist');
  assert.equal(otherAccount.status, 503);
  assert.doesNotMatch(await otherAccount.text(), /<html>\/checklist<\/html>/);
});

test('attendance queue sync sends only database fields with the correct tenant and original punch time', async () => {
  const source = fs.readFileSync(new URL('../src/utils/offlineSync.js', import.meta.url), 'utf8');
  const start = source.indexOf('function toAttendanceDbPayload');
  const end = source.indexOf('/**\n * Determines whether an entire module', start);
  assert.ok(start > 0 && end > start);
  let inserted;
  const queue = [{
    queueId: 'queue-1', entityType: 'attendance', actionType: 'create',
    payload: {
      email: 'EMPLOYEE@EXAMPLE.COM', userId: 'c2dba786-d4e4-4c91-b850-5ca5ab37bce0',
      empName: 'Employee', tenantId: 'tenant-123', attendance_date: '2026-10-17',
      in_time: '2026-10-17T03:30:00.000Z', in_location: 'Office', status: 'PRESENT'
    }
  }];
  const sync = vm.runInNewContext(`${source.slice(start, end).replace('export async function syncPendingQueue', 'async function syncPendingQueue')}\nsyncPendingQueue`, {
    navigator: { onLine: true },
    getPendingQueue: async () => queue,
    removeQueueItem: async () => {},
    console: { warn() {}, error() {} }
  });
  const client = { from(table) {
    assert.equal(table, 'attendance_records');
    return { async upsert(rows) { inserted = rows[0]; return { error: null }; } };
  } };
  const result = await sync(client);
  assert.equal(result.count, 1);
  assert.equal(inserted.tenant_id, 'tenant-123');
  assert.equal(inserted.in_time, '2026-10-17T03:30:00.000Z');
  assert.equal(inserted.email, 'employee@example.com');
  assert.equal('userId' in inserted, false);
  assert.equal('empName' in inserted, false);
});

test('sync processes older offline actions before later actions', async () => {
  const source = fs.readFileSync(new URL('../src/utils/offlineSync.js', import.meta.url), 'utf8');
  const start = source.indexOf('function toAttendanceDbPayload');
  const end = source.indexOf('/**\n * Determines whether an entire module', start);
  const calls = [];
  const sync = vm.runInNewContext(`${source.slice(start, end).replace('export async function syncPendingQueue', 'async function syncPendingQueue')}\nsyncPendingQueue`, {
    navigator: { onLine: true },
    getPendingQueue: async () => [
      { queueId: 'later', timestamp: 2, entityType: 'attendance', payload: { email: 'later@example.com', attendance_date: '2026-10-17' } },
      { queueId: 'earlier', timestamp: 1, entityType: 'attendance', payload: { email: 'earlier@example.com', attendance_date: '2026-10-17' } }
    ],
    removeQueueItem: async () => {},
    console: { warn() {}, error() {} }
  });
  const client = { from() { return { async upsert(rows) { calls.push(rows[0].email); return { error: null }; } }; } };
  const result = await sync(client);
  assert.equal(result.count, 2);
  assert.deepEqual(calls, ['earlier@example.com', 'later@example.com']);
});

test('attendance force sync scopes punch-out to its tenant', async () => {
  const source = fs.readFileSync(new URL('../src/app/actions/offlineForceSync.js', import.meta.url), 'utf8');
  const start = source.indexOf('const VALID_LEAD_DB_COLUMNS');
  let filter;
  let updated;
  const action = vm.runInNewContext(`${source.slice(start).replace('export async function forceSyncOfflineItem', 'async function forceSyncOfflineItem')}\nforceSyncOfflineItem`, {
    getAdminClient: () => ({ from(table) {
      assert.equal(table, 'attendance_records');
      return {
        update(payload) { updated = payload; return this; },
        match(value) { filter = value; return this; },
        async select() { return { data: [{ id: 'attendance-1' }], error: null }; }
      };
    } }),
    console: { error() {} }
  });
  const result = await action({ entityType: 'attendance', payload: {
    tenantId: 'tenant-a', email: 'EMPLOYEE@EXAMPLE.COM', attendance_date: '2026-10-17',
    out_time: '2026-10-17T12:00:00.000Z', out_method: 'WEB_PUNCH'
  } });
  assert.equal(result.success, true);
  assert.equal(updated.out_time, '2026-10-17T12:00:00.000Z');
  assert.deepEqual({ ...filter }, {
    email: 'employee@example.com', attendance_date: '2026-10-17', tenant_id: 'tenant-a'
  });
});

test('failed delegation sync stays queued when no matching force fallback exists', async () => {
  const source = fs.readFileSync(new URL('../src/utils/offlineSync.js', import.meta.url), 'utf8');
  const start = source.indexOf('function toAttendanceDbPayload');
  const end = source.indexOf('/**\n * Determines whether an entire module', start);
  let removed = false;
  const sync = vm.runInNewContext(`${source.slice(start, end).replace('export async function syncPendingQueue', 'async function syncPendingQueue')}\nsyncPendingQueue`, {
    navigator: { onLine: true },
    getPendingQueue: async () => [{ queueId: 'task-1', timestamp: 1, entityType: 'delegation_task', payload: { title: 'Offline task' } }],
    removeQueueItem: async () => { removed = true; },
    openOfflineDB: async () => null,
    console: { warn() {}, error() {} }
  });
  const result = await sync({});
  assert.equal(result.failed, 1);
  assert.equal(removed, false);
});
