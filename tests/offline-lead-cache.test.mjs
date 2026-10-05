import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { isCompleteLeadCache, isDisplayableLeadCache, matchesLeadCacheContext, mergeLeadCacheForDisplay } from '../src/utils/leadCachePolicy.js';
import {
  getFastLeadsSnapshot,
  getLeadStagePreview,
  matchesLeadPreviewStage,
  getLocalLeads,
  getLocalLeadsPreview,
  saveFastLeadsSnapshot,
  saveLeadsLocally,
  saveLocalLeadsPreview,
  setLeadCacheScope,
  upsertLeadsLocally
} from '../src/utils/offlineSync.js';

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

let previousDb;
function fakeIndexedDB({ holdBulk = false, bulkError = false, withIndex = false } = {}) {
  previousDb?.onversionchange?.();
  const rows = new Map();
  const stats = { bulkReads: 0, cursorReads: 0, indexReads: 0 };
  const bulkRequests = [];
  let failNextWrite = false;
  const selectRows = range => [...rows.values()].filter(row => !range ||
    (row.__cacheScope === range[0] && row.__cacheGeneration === range[1]));
  const db = {
    transaction(_store, mode) {
      const tx = { error: null };
      tx.objectStore = () => ({
        indexNames: { contains: () => withIndex },
        index() {
          return { getAll(range) { stats.indexReads++; return bulkRead(range); },
            openCursor(range) { return cursorRead(range); } };
        },
        put(row) {
          if (failNextWrite) {
            failNextWrite = false;
            queueMicrotask(() => tx.onabort?.());
            return;
          }
          rows.set(row.id, row);
          queueMicrotask(() => tx.oncomplete?.());
        },
        getAll() {
          return bulkRead();
        },
        get(id) {
          const request = { result: null };
          queueMicrotask(() => {
            request.result = rows.get(id);
            request.onsuccess?.();
          });
          return request;
        },
        openCursor() {
          return cursorRead();
        }
      });
      return tx;
    },
    close() {}
  };
  previousDb = db;
  function bulkRead(range) {
    stats.bulkReads++;
    const request = {};
    const finish = () => {
      if (bulkError) { request.error = new Error('Bulk read failed'); request.onerror?.(); }
      else { request.result = selectRows(range); request.onsuccess?.(); }
    };
    if (holdBulk) bulkRequests.push(finish);
    else queueMicrotask(finish);
    return request;
  }
  function cursorRead(range) {
    stats.cursorReads++;
    const request = {};
    const values = selectRows(range);
    let index = 0;
    const advance = () => queueMicrotask(() => {
      const value = values[index++];
      request.onsuccess?.({ target: { result: value === undefined ? null : { value, continue: advance } } });
    });
    advance();
    return request;
  }
  return {
    open() {
      const request = { result: db };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
    failNextWrite: () => { failNextWrite = true; },
    releaseBulk: () => bulkRequests.splice(0).forEach(finish => finish()),
    rows, stats
  };
}

test('lead cache writes are scoped, bounded, and report transaction failures', async () => {
  const indexedDB = fakeIndexedDB();
  globalThis.window = { indexedDB };
  globalThis.sessionStorage = storage();
  globalThis.localStorage = storage();

  setLeadCacheScope('employee-a');
  localStorage.setItem('crm_leads_complete_cache_v1_employee-a', JSON.stringify({ generation: 'a1' }));
  const notes = Array.from({ length: 30 }, (_, id) => ({ id }));
  assert.equal(await saveLeadsLocally([{ id: 1, company: 'A', lead_notes: notes }], 'a1'), true);
  assert.equal(await saveLocalLeadsPreview([{ id: 1, company: 'A' }], 'a1', 'Company A', 'agent'), true);
  assert.deepEqual((await getLocalLeadsPreview('Company A', 'agent')).map(lead => lead.id), [1]);
  assert.deepEqual(await getLocalLeadsPreview('Company B', 'agent'), []);
  assert.deepEqual((await getLocalLeads()).map(lead => lead.id), [1]);
  assert.equal((await getLocalLeads())[0].lead_notes.length, 15);

  // A later full sync excludes stale rows without clearing unrelated records.
  assert.equal(await saveLeadsLocally([{ id: 4, company: 'A new' }], 'a2'), true);
  localStorage.setItem('crm_leads_complete_cache_v1_employee-a', JSON.stringify({ generation: 'a2' }));
  assert.deepEqual(await getLocalLeadsPreview('Company A', 'agent'), []);
  assert.deepEqual((await getLocalLeads()).map(lead => lead.id), [4]);

  saveFastLeadsSnapshot([{ id: 1, company: 'A', lead_ref_id: 'A-1' }], 'employee-a');
  assert.equal(getFastLeadsSnapshot('employee-a')[0].company, 'A');
  assert.deepEqual(getFastLeadsSnapshot('employee-b'), []);

  setLeadCacheScope('employee-b');
  localStorage.setItem('crm_leads_complete_cache_v1_employee-b', JSON.stringify({ generation: 'b1' }));
  assert.deepEqual(await getLocalLeads(), []);
  assert.equal(await upsertLeadsLocally([{ id: 2, company: 'B' }]), true);
  assert.deepEqual((await getLocalLeads()).map(lead => lead.id), [2]);

  indexedDB.failNextWrite();
  assert.equal(await upsertLeadsLocally([{ id: 3, company: 'B' }]), false);
});

test('large local lead reads publish a preview before the complete cache', async () => {
  const indexedDB = fakeIndexedDB();
  globalThis.window = { indexedDB };
  globalThis.sessionStorage = storage();
  globalThis.localStorage = storage();
  setLeadCacheScope('employee-preview');
  localStorage.setItem('crm_leads_complete_cache_v1_employee-preview', JSON.stringify({ generation: 'preview-1' }));

  const leads = Array.from({ length: 305 }, (_, id) => ({ id: id + 1000, company: 'Preview' }));
  assert.equal(await saveLeadsLocally(leads, 'preview-1'), true);
  assert.equal(await saveLocalLeadsPreview(leads, 'preview-1', 'Company A', 'agent'), true);

  let preview = [];
  const all = await getLocalLeads({ onPreview: firstRows => { preview = firstRows; } });
  assert.equal(preview.length, 100);
  assert.equal(all.length, 305);
  assert.equal(indexedDB.stats.bulkReads, 1);
  assert.equal(indexedDB.stats.cursorReads, 0);
});

test('bulk reads use the scope-generation index and capture their original user', async () => {
  const indexedDB = fakeIndexedDB({ holdBulk: true, withIndex: true });
  globalThis.window = { indexedDB, IDBKeyRange: { only: value => value } };
  globalThis.sessionStorage = storage();
  globalThis.localStorage = storage();
  setLeadCacheScope('bulk-user');
  localStorage.setItem('crm_leads_complete_cache_v1_bulk-user', JSON.stringify({ generation: 'g1' }));
  indexedDB.rows.set(1, { id: 1, __cacheScope: 'bulk-user', __cacheGeneration: 'g1' });
  indexedDB.rows.set(2, { id: 2, __cacheScope: 'other-user', __cacheGeneration: 'g1' });
  indexedDB.rows.set(3, { id: 3, __cacheScope: 'bulk-user', __cacheGeneration: 'old' });
  const pending = getLocalLeads({ onPreview() {} });
  await new Promise(resolve => setImmediate(resolve));
  setLeadCacheScope('other-user');
  indexedDB.releaseBulk();
  assert.deepEqual((await pending).map(row => row.id), [1]);
  assert.equal(indexedDB.stats.indexReads, 1);
});

test('a failed bulk read falls back to cursor without losing the complete list', async () => {
  const indexedDB = fakeIndexedDB({ bulkError: true });
  globalThis.window = { indexedDB };
  globalThis.sessionStorage = storage();
  globalThis.localStorage = storage();
  setLeadCacheScope('fallback-user');
  localStorage.setItem('crm_leads_complete_cache_v1_fallback-user', JSON.stringify({ generation: 'g1' }));
  const rows = Array.from({ length: 2000 }, (_, i) => ({ id: i + 1 }));
  await saveLeadsLocally(rows, 'g1');
  assert.equal((await getLocalLeads({ onPreview() {} })).length, rows.length);
  assert.equal(indexedDB.stats.cursorReads, 1);
});

test('fast snapshot falls back to a smaller payload when storage is nearly full', () => {
  const limitedStorage = storage();
  const setItem = limitedStorage.setItem;
  limitedStorage.setItem = (key, value) => {
    if (String(value).length > 2500) throw new Error('QuotaExceededError');
    setItem(key, value);
  };
  globalThis.window = {};
  globalThis.sessionStorage = limitedStorage;
  globalThis.localStorage = limitedStorage;

  const leads = Array.from({ length: 300 }, (_, id) => ({ id, company: 'Acme', remarks: 'long note '.repeat(100) }));
  saveFastLeadsSnapshot(leads, 'employee-quota');
  assert.ok(getFastLeadsSnapshot('employee-quota').length > 0);
});

test('fast snapshot rejects a changed role, company, or cache generation', () => {
  globalThis.window = {};
  globalThis.sessionStorage = storage();
  globalThis.localStorage = storage();
  const context = { userCompany: 'Company A', userRole: 'agent' };
  saveFastLeadsSnapshot([{ id: 42, company: 'A' }], 'employee-context', context);
  assert.equal(getFastLeadsSnapshot('employee-context', context).length, 1);
  sessionStorage.setItem('supuja_fast_leads_snapshot_employee-context', '{broken');
  assert.equal(getFastLeadsSnapshot('employee-context', context).length, 1);
  assert.deepEqual(getFastLeadsSnapshot('employee-context', { ...context, userRole: 'admin' }), []);
  localStorage.setItem('crm_leads_complete_cache_v1_employee-context', JSON.stringify({ generation: 'new-generation' }));
  assert.deepEqual(getFastLeadsSnapshot('employee-context', context), []);
});

test('the selected stage restores from a scoped preview while the full cache is still reading', async () => {
  const indexedDB = fakeIndexedDB({ holdBulk: true });
  globalThis.window = { indexedDB };
  globalThis.sessionStorage = storage();
  globalThis.localStorage = storage();
  setLeadCacheScope('stage-user');
  localStorage.setItem('crm_leads_complete_cache_v1_stage-user', JSON.stringify({ generation: 'g1' }));
  const context = { userCompany: 'A', userRole: 'agent' };
  const stage = '04 - Follow Up Stage';
  const leads = [
    ...Array.from({ length: 300 }, (_, i) => ({ id: i + 1, status: '1; New' })),
    { id: 1000, status: '4; Follow up', phone: 'synthetic' }
  ];
  await saveLeadsLocally(leads, 'g1');
  saveFastLeadsSnapshot(leads, 'stage-user', context);
  saveFastLeadsSnapshot(leads, 'stage-user', { ...context, stageKey: stage });
  await saveLocalLeadsPreview(leads, 'g1', 'A', 'agent');
  await saveLocalLeadsPreview(leads, 'g1', 'A', 'agent', stage);
  const pending = getLocalLeads();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(getFastLeadsSnapshot('stage-user', { ...context, stageKey: stage }).map(row => row.id), [1000]);
  assert.deepEqual((await getLocalLeadsPreview('A', 'agent', stage)).map(row => row.id), [1000]);
  assert.equal(getFastLeadsSnapshot('stage-user', context).length, 300, 'stage preview does not overwrite the general preview');
  assert.deepEqual(await getLocalLeadsPreview('A', 'admin', stage), []);
  assert.deepEqual(getFastLeadsSnapshot('other-user', { ...context, stageKey: stage }), []);
  indexedDB.releaseBulk();
  assert.equal((await pending).length, leads.length);
  localStorage.setItem('crm_leads_complete_cache_v1_stage-user', JSON.stringify({ generation: 'g2' }));
  assert.deepEqual(getFastLeadsSnapshot('stage-user', { ...context, stageKey: stage }), []);
  assert.deepEqual(await getLocalLeadsPreview('A', 'agent', stage), []);
});

test('stage preview uses the existing table predicate and falls back to a compatible general preview', async () => {
  const rows = [{ id: 1, status: 'New' }, { id: 2, status: '2; Contact' }, { id: 3, status: '04 - Follow Up Stage' }];
  // The existing New Stage filter also includes statuses without a numeric prefix.
  assert.deepEqual(getLeadStagePreview(rows, '01 - New Stage').map(row => row.id), [1, 3]);
  assert.deepEqual(getLeadStagePreview(rows, '02 - Contact Stage').map(row => row.id), [2]);
  assert.deepEqual(getLeadStagePreview(rows, '04 - Follow Up Stage').map(row => row.id), [3]);
  assert.equal(matchesLeadPreviewStage(rows[1], 'all'), true);
  const indexedDB = fakeIndexedDB();
  globalThis.window = { indexedDB };
  globalThis.sessionStorage = storage();
  globalThis.localStorage = storage();
  setLeadCacheScope('stage-fallback');
  localStorage.setItem('crm_leads_complete_cache_v1_stage-fallback', JSON.stringify({ generation: 'g1' }));
  const context = { userCompany: 'A', userRole: 'agent' };
  saveFastLeadsSnapshot(rows, 'stage-fallback', context);
  await saveLocalLeadsPreview(rows, 'g1', 'A', 'agent');
  assert.deepEqual(getFastLeadsSnapshot('stage-fallback', { ...context, stageKey: '02 - Contact Stage' }).map(row => row.id), [2]);
  assert.deepEqual((await getLocalLeadsPreview('A', 'agent', '02 - Contact Stage')).map(row => row.id), [2]);
});

test('cache timings report only duration/count/mode and a failing observer cannot break loading', async () => {
  const indexedDB = fakeIndexedDB();
  globalThis.window = { indexedDB };
  globalThis.sessionStorage = storage();
  globalThis.localStorage = storage();
  setLeadCacheScope('timing-user');
  await saveLeadsLocally([{ id: 1 }], 'g1');
  localStorage.setItem('crm_leads_complete_cache_v1_timing-user', JSON.stringify({ generation: 'g1' }));
  let timing;
  const rows = await getLocalLeads({ onTiming: event => { timing = event; throw new Error('Observer failed'); } });
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(timing).sort(), ['count', 'durationMs', 'mode']);
  assert.equal(timing.count, 1);
  assert.equal(timing.mode, 'bulk');
  assert.ok(timing.durationMs >= 0);
});

test('delta sync requires a complete, current cache for the same user and role', () => {
  const now = Date.parse('2026-10-01T10:00:00.000Z');
  const scope = { userId: 'employee-a', userCompany: 'Company A', userRole: 'agent', now };
  const meta = { ...scope, count: 2, generation: 'gen-1', syncedAt: '2026-10-01T09:00:00.000Z', fullSyncedAt: '2026-10-01T08:00:00.000Z' };
  const leads = [1, 2].map(id => ({ id, __cacheScope: scope.userId, __cacheGeneration: meta.generation }));
  assert.equal(isCompleteLeadCache(meta, leads, scope), true);
  assert.equal(isCompleteLeadCache(meta, leads.slice(0, 1), scope), false);
  assert.equal(isCompleteLeadCache({ ...meta, fullSyncedAt: null }, leads, scope), false);
  assert.equal(isCompleteLeadCache(meta, [{ ...leads[0], __cacheGeneration: 'old' }, leads[1]], scope), false);
  assert.equal(isCompleteLeadCache(meta, leads, { ...scope, userCompany: 'Company B' }), false);
  assert.equal(isCompleteLeadCache({ ...meta, fullSyncedAt: '2026-09-29T08:00:00.000Z' }, leads, scope), false);
  assert.equal(isDisplayableLeadCache({ ...meta, fullSyncedAt: '2026-09-29T08:00:00.000Z' }, leads, scope), true);
  assert.equal(isCompleteLeadCache(meta, [leads[0], leads[0]], scope), false);
  assert.equal(isCompleteLeadCache(meta, [...leads, { ...leads[0], id: 3 }], scope), true);
});

test('cache hydration preserves pending edits, newer live rows and realtime deletes', () => {
  const cached = [1, 2, 3, 4].map(id => ({ id, status: 'Cold', updated_at: '2026-10-05T09:00:00+05:30', lead_notes: [{ id: id + 10 }] }));
  const current = [
    { id: 1, status: 'Hot', is_offline_pending: true, lead_notes: [] },
    { id: 2, status: 'Warm', updated_at: '2026-10-05T10:00:00+05:30' },
    { id: 3, status: 'Won' },
    { id: 5, status: 'New' }
  ];
  const restored = mergeLeadCacheForDisplay(cached, current, { protectedIds: new Set([3]), removedIds: new Set([4]) });
  assert.deepEqual(restored.map(row => row.id), [1, 2, 3, 5]);
  assert.deepEqual(restored.slice(0, 3).map(row => row.status), ['Hot', 'Warm', 'Won']);
  assert.equal(restored[0].lead_notes.length, 1);
  assert.equal(mergeLeadCacheForDisplay(cached, current, { keepMissing: false }).some(row => row.id === 5), false);
});

// Execute the actual nested refresh function with controlled storage/network
// boundaries, so these tests cover the cache-vs-download decision and UI rows.
const require = createRequire(import.meta.url);
const crmSource = fs.readFileSync(new URL('../src/components/CRMContainer.jsx', import.meta.url), 'utf8');
const crmAst = require('@babel/parser').parse(crmSource, { sourceType: 'module', plugins: ['jsx'] });
const crmNode = crmAst.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration;
const stageInitializer = crmNode.body.body.flatMap(node => node.declarations || [])
  .find(node => node.id.type === 'ArrayPattern' && node.id.elements[0]?.name === 'initialLeadStage').init.arguments[0];
const bootstrapHook = crmNode.body.body.find(node => node.type === 'ExpressionStatement' &&
  crmSource.slice(node.start, node.end).includes("markLeadStartupTiming('app-mounted'"));

test('startup chooses the saved stage before the first view and explicit All overrides storage', () => {
  const saved = storage();
  saved.setItem('crmActiveStage', '02 - Contact Stage');
  const initialize = initialSearchParams => vm.runInNewContext(
    `(${crmSource.slice(stageInitializer.start, stageInitializer.end)})()`,
    { initialSearchParams, window: {}, localStorage: saved });
  assert.equal(initialize(null), '02 - Contact Stage');
  assert.equal(initialize({ stage: 'all' }), null);
  assert.equal(initialize({ stage: '04 - Follow Up Stage' }), '04 - Follow Up Stage');
  assert.equal(vm.runInNewContext(`(${crmSource.slice(stageInitializer.start, stageInitializer.end)})()`,
    { initialSearchParams: null }), null, 'server rendering never accesses browser storage');
});

test('cached startup opens the hydration gate during layout without waiting for bulk or network work', () => {
  assert.equal(bootstrapHook.expression.callee.property.name, 'useLayoutEffect',
    'passive mount updates previously kept the table hidden after the complete cache was ready');
  const preview = [{ id: 1, status: '2; Contact' }];
  const state = { mounted: false, loading: true };
  const context = {
    userId: 'layout-user', userCompany: 'A', userRole: 'agent', initialLeadStage: '02 - Contact Stage',
    window: { location: { pathname: '/leads' } }, rawLeadsRef: { current: [] },
    setIsMounted: value => { state.mounted = value; }, setLeadCacheScope() {},
    getFastLeadsSnapshot: () => preview,
    getLocalLeadsPreview: () => { throw new Error('fast preview must not wait for IndexedDB'); },
    setRawLeads: value => { state.raw = value; }, setLeads: value => { state.leads = value; },
    setLoadingLeads: value => { state.loading = value; }, markLeadStartupTiming() {}
  };
  const callback = bootstrapHook.expression.arguments[0];
  const bootstrap = vm.runInNewContext(`(${crmSource.slice(callback.start, callback.end)})`, context);
  const cleanup = bootstrap();
  assert.equal(state.mounted, true);
  assert.equal(state.loading, false);
  assert.equal(state.leads, preview);
  assert.equal(context.rawLeadsRef.current, preview);
  assert.equal(typeof cleanup, 'function');
  cleanup();
});

let refreshSource;
function findRefresh(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'loadLeads') refreshSource = crmSource.slice(node.start, node.end);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(findRefresh);
    else if (value && typeof value === 'object') findRefresh(value);
  }
}
findRefresh(crmAst);

function refreshHarness({ cached, meta, server = cached, readCache = async () => cached, onRequest }) {
  const storage = new Map([['crm_leads_complete_cache_v1_refresh-user', JSON.stringify(meta)]]);
  const publications = [], requests = [], timers = [];
  const context = {
    effectActive: true, userId: 'refresh-user', userCompany: '', userRole: 'Admin', userName: 'Admin',
    moduleAccess: {}, globalRolePermissions: {}, removedDuringSync: new Set(), changedDuringSync: new Set(),
    rawLeadsRef: { current: [] }, leadSyncInFlightRef: { current: false },
    pendingLeadSyncRef: { current: null }, loadLeadsRef: { current: null },
    recentLocalUpdatesRef: { current: new Map() },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    matchesLeadCacheContext, isCompleteLeadCache, mergeLeadCacheForDisplay,
    markLeadStartupTiming() {}, refreshStagePreview() {},
    setRawLeads: rows => { publications.push(rows); context.rawLeadsRef.current = rows; },
    setLeadCacheScope() {}, setIsSyncing() {}, setSyncLoadedCount() {}, setSyncTotalCount() {}, setLoadingLeads() {},
    getLocalLeads: readCache, saveFastLeadsSnapshot() {}, saveLocalLeadsPreview: async () => true,
    saveLeadsLocally: async () => true, upsertLeadsLocally: async () => true,
    sortLeadsByDateDesc: (a, b) => b.id - a.id, console, queueMicrotask,
    setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.cancelled = true; },
    createClient: () => ({ from(table) {
      let countOnly = false, changedOnly = false, from = 0, to = 999;
      const query = {
        select(_fields, options) { countOnly = options?.head; return query; },
        order() { return query; }, eq() { return query; }, in() { return query; }, or() { return query; },
        gt() { changedOnly = true; return query; },
        range(start, end) { from = start; to = end; return query; },
        then(resolve, reject) {
          requests.push({ table, countOnly, changedOnly });
          onRequest?.({ table, countOnly, changedOnly, context });
          const data = table === 'lead_notes' || changedOnly ? [] : server.slice(from, to + 1);
          return Promise.resolve({ data, count: countOnly ? server.length : null, error: null }).then(resolve, reject);
        }
      };
      return query;
    } })
  };
  const refresh = vm.runInNewContext(`(${refreshSource})`, context);
  return { refresh, context, publications, requests, timers };
}

function refreshFixture({ aged = false, count = 2000 } = {}) {
  const now = Date.now();
  const meta = { userId: 'refresh-user', userCompany: '', userRole: 'Admin', generation: 'g1', count,
    fullSyncedAt: new Date(now - (aged ? 48 * 60 * 60 * 1000 : 60 * 60 * 1000)).toISOString(),
    syncedAt: new Date(now - 30 * 60 * 1000).toISOString() };
  const cached = Array.from({ length: count }, (_, i) => ({ id: i + 1,
    __cacheScope: meta.userId, __cacheGeneration: meta.generation,
    created_at: meta.fullSyncedAt, updated_at: meta.fullSyncedAt, lead_notes: [] }));
  return { cached, meta };
}

test('refresh waits for a slow complete cache instead of downloading after 3.5 seconds', async () => {
  const fixture = refreshFixture();
  let release;
  const readCache = () => new Promise(resolve => { release = resolve; });
  const harness = refreshHarness({ ...fixture, readCache });
  const pending = harness.refresh();
  for (const timer of harness.timers) if (timer.delay <= 4000 && !timer.cancelled) timer.callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.requests.length, 0, 'cache still reading must not trigger a full download');
  release(fixture.cached);
  await pending;
  assert.equal(harness.publications[0].length, fixture.cached.length);
  assert.equal(harness.requests.some(request => request.countOnly), false, 'fresh complete cache uses delta');
  assert.equal(harness.context.leadSyncInFlightRef.current, false);
});

test('aged full cache remains visible while server pages reconcile in background', async () => {
  const fixture = refreshFixture({ aged: true });
  const harness = refreshHarness(fixture);
  await harness.refresh();
  assert.ok(harness.requests.some(request => request.countOnly));
  assert.ok(harness.publications.every(rows => rows.length === fixture.cached.length));
});

test('reconciliation preserves edits and realtime inserts received during sync without reviving deleted leads', async () => {
  const fixture = refreshFixture({ aged: true });
  let changed = false;
  const harness = refreshHarness({ ...fixture, onRequest: ({ table, countOnly, context }) => {
    if (changed || table !== 'leads' || countOnly) return;
    changed = true;
    context.recentLocalUpdatesRef.current.set(1, Date.now());
    context.changedDuringSync.add(2001);
    context.removedDuringSync.add(2);
    context.rawLeadsRef.current = [
      ...context.rawLeadsRef.current.filter(lead => lead.id !== 2)
        .map(lead => lead.id === 1 ? { ...lead, status: 'calling' } : lead),
      { id: 2001, status: 'new', created_at: new Date().toISOString(), lead_notes: [] }
    ];
  } });
  await harness.refresh();
  const final = harness.publications.at(-1);
  assert.equal(final.find(lead => lead.id === 1).status, 'calling');
  assert.equal(final.some(lead => lead.id === 2), false);
  assert.equal(final.some(lead => lead.id === 2001), true);
});

test('repeated refreshes use the saved complete cache; cold and partial caches recover fully', async () => {
  const fixture = refreshFixture();
  const warm = refreshHarness(fixture);
  await warm.refresh();
  await warm.refresh();
  assert.equal(warm.requests.some(request => request.countOnly), false);
  const partial = refreshHarness({ ...fixture, cached: fixture.cached.slice(0, 100), server: fixture.cached });
  await partial.refresh();
  assert.ok(partial.requests.some(request => request.countOnly));
  assert.equal(partial.publications.at(-1).length, fixture.cached.length);
  const cold = refreshHarness({ ...fixture, cached: [], meta: null, server: fixture.cached });
  await cold.refresh();
  assert.equal(cold.publications.at(-1).length, fixture.cached.length);
});

test('a user-context change never hydrates another role cache and cancelled reads release the sync lock', async () => {
  const fixture = refreshFixture();
  const mismatched = refreshHarness({ ...fixture, meta: { ...fixture.meta, userRole: 'agent' } });
  await mismatched.refresh();
  assert.ok(mismatched.requests.some(request => request.countOnly));
  assert.equal(mismatched.publications[0].length, 1000);
  let release;
  const cancelled = refreshHarness({ ...fixture, readCache: () => new Promise(resolve => { release = resolve; }) });
  const pending = cancelled.refresh();
  cancelled.context.effectActive = false;
  release(fixture.cached);
  await pending;
  assert.equal(cancelled.publications.length, 0);
  assert.equal(cancelled.context.leadSyncInFlightRef.current, false);
});

// Exercise the real table preparation/effect without mounting the softphone or
// issuing production requests. Controlled tasks expose cancellation/edit races.
const tableSource = fs.readFileSync(new URL('../src/components/LeadTable.jsx', import.meta.url), 'utf8');
const tableAst = require('@babel/parser').parse(tableSource, { sourceType: 'module', plugins: ['jsx'] });
const prepareNode = tableAst.program.body.find(node => node.type === 'ExportNamedDeclaration' &&
  node.declaration?.id?.name === 'prepareLeadTableRows').declaration;
const prepareRows = vm.runInNewContext(`(${tableSource.slice(prepareNode.start, prepareNode.end)})`, { console });
const tableNode = tableAst.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration;
const initialNode = tableNode.body.body.flatMap(node => node.declarations || [])
  .find(node => node.id.type === 'ArrayPattern' && node.id.elements[0]?.name === 'initialPreparation').init.arguments[0];
const effectNode = tableNode.body.body.find(node => node.type === 'ExpressionStatement' &&
  node.expression.callee?.name === 'useEffect' &&
  tableSource.slice(node.start, node.end).includes('localRowsAtStart')).expression.arguments[0];
const compareNode = tableAst.program.body.flatMap(node => node.declarations || [])
  .find(node => node.id.name === 'isLeadContentChanged').init;
const compareRows = vm.runInNewContext(`(${tableSource.slice(compareNode.start, compareNode.end)})`);

function tableHarness(rows) {
  const tasks = [], calls = [];
  const members = [];
  const processRows = (source, _members, offset = 0) => {
    calls.push(...source.map(row => row.id));
    return source.map((row, index) => ({ ...row, sr_no: offset + index + 1 }));
  };
  const initial = vm.runInNewContext(`(${tableSource.slice(initialNode.start, initialNode.end)})()`, {
    initialData: rows, teamMembers: members, processLeads: processRows
  });
  let data = initial.prepared;
  const context = {
    initialData: rows, teamMembers: members, initialPreparation: initial,
    prevInitialDataRef: { current: rows.length <= 400 ? rows : null },
    prevTeamMembersRef: { current: members }, localUpdatedLeadIdsRef: { current: new Set() },
    latestTableDataRef: { current: data },
    isLeadContentChanged: compareRows, processLeads: processRows,
    performance, markLeadStartupTiming() {},
    setData: next => { data = typeof next === 'function' ? next(data) : next; },
    prepareLeadTableRows: (source, team, options) => prepareRows(source, team, {
      ...options, processRows,
      schedule: callback => { const task = { callback }; tasks.push(task); return task; },
      cancel: task => { task.cancelled = true; }
    })
  };
  const effect = vm.runInNewContext(`(${tableSource.slice(effectNode.start, effectNode.end)})`, context);
  return { context, calls, tasks, effect, get data() { return data; },
    setData(next) { data = next; context.latestTableDataRef.current = next; },
    drain() { while (tasks.length) { const task = tasks.shift(); if (!task.cancelled) task.callback(); } }
  };
}

test('45,000 table rows publish a bounded first view and each row is prepared exactly once', () => {
  const rows = Array.from({ length: 45000 }, (_, id) => ({ id: id + 1, status: 'New' }));
  const table = tableHarness(rows);
  assert.equal(table.calls.length, 400, 'first render never formats the complete cache');
  table.effect();
  assert.equal(table.calls.length, 400, 'the first render batch is reused');
  assert.equal(table.data.length, 400);
  assert.equal(table.context.prevInitialDataRef.current, null, 'partial work cannot enter the targeted fast path');
  table.drain();
  assert.equal(table.data.length, rows.length);
  assert.equal(new Set(table.calls).size, rows.length);
  assert.equal(table.calls.length, rows.length, 'no duplicate normalization pass');
  assert.equal(table.data.at(-1).sr_no, rows.length);
  assert.equal(rows[0].sr_no, undefined, 'preparation never mutates source leads');
  const prepared = table.data;
  table.effect();
  assert.equal(table.data, prepared);
  assert.equal(table.calls.length, rows.length, 'unchanged arrays are not reformatted');
});

test('small stage previews are ready immediately without a duplicate mount effect', () => {
  const table = tableHarness(Array.from({ length: 52 }, (_, id) => ({ id: id + 1 })));
  table.effect();
  assert.equal(table.data.length, 52);
  assert.equal(table.calls.length, 52);
  assert.equal(table.tasks.length, 0);
});

test('the selected-stage preview stays visible while unrelated first rows prepare in background', () => {
  const preview = Array.from({ length: 52 }, (_, id) => ({ id: id + 1000, status: '2; Contact' }));
  const table = tableHarness(preview);
  table.context.initialData = [
    ...Array.from({ length: 900 }, (_, id) => ({ id: id + 1, status: '1; New' })), ...preview
  ];
  table.effect();
  assert.equal(table.data.length, 52);
  assert.ok(table.data.every(row => row.status === '2; Contact'));
  table.drain();
  assert.equal(table.data.length, 952);
  assert.equal(table.data.filter(row => row.status === '2; Contact').length, 52);
});

test('a same-length update during background preparation cancels stale work and finishes the newest list', () => {
  const rows = Array.from({ length: 900 }, (_, id) => ({ id: id + 1, status: 'New' }));
  const table = tableHarness(rows);
  const cancel = table.effect();
  cancel();
  table.context.initialData = rows.map(row => row.id === 1 ? { ...row, status: 'Hot' } : row);
  table.effect();
  table.drain();
  assert.equal(table.data.length, rows.length);
  assert.equal(table.data[0].status, 'Hot');
  assert.equal(table.context.prevInitialDataRef.current, table.context.initialData);
});

test('in-flight local edits survive preparation; an older local marker does not block newer server data', () => {
  const rows = Array.from({ length: 900 }, (_, id) => ({ id: id + 1, status: 'New' }));
  const table = tableHarness(rows);
  table.effect();
  table.context.localUpdatedLeadIdsRef.current.add(1);
  table.setData(table.data.map(row => row.id === 1 ? { ...row, status: 'Hot' } : row));
  table.drain();
  assert.equal(table.data[0].status, 'Hot');
  table.context.latestTableDataRef.current = table.data;
  table.context.initialData = rows.map(row => ({ ...row, status: 'Cold' }));
  table.effect();
  table.drain();
  assert.equal(table.data[0].status, 'Cold', 'a prior edit must not override a later authoritative dataset');
});
