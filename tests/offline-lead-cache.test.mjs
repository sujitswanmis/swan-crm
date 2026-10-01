import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCompleteLeadCache } from '../src/utils/leadCachePolicy.js';
import {
  getFastLeadsSnapshot,
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

function fakeIndexedDB() {
  const rows = new Map();
  let failNextWrite = false;
  const db = {
    transaction(_store, mode) {
      const tx = { error: null };
      tx.objectStore = () => ({
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
          const request = { result: null };
          queueMicrotask(() => {
            request.result = [...rows.values()];
            request.onsuccess?.();
          });
          return request;
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
          const request = {};
          const values = [...rows.values()];
          let index = 0;
          const advance = () => queueMicrotask(() => {
            const value = values[index++];
            request.onsuccess?.({ target: { result: value === undefined ? null : { value, continue: advance } } });
          });
          advance();
          return request;
        }
      });
      return tx;
    },
    close() {}
  };
  return {
    open() {
      const request = { result: db };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
    failNextWrite: () => { failNextWrite = true; }
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
  globalThis.window = { indexedDB: fakeIndexedDB() };
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
});
