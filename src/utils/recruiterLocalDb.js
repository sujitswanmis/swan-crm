'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { applyRecruiterMutation, autoAssignUnclaimedPositions, readRecruiterSync } from '@/app/actions/recruitment';
import { canPerformOfflineAction, enqueueOfflineAction, syncPendingQueue } from '@/utils/offlineSync';

export const RECRUITER_SYNC_EVENT = 'crm_recruiter_sync';
const DATABASE = 'supuja_recruiter_cache';
const PREVIEW_LIMIT = 200;
const EMPTY_LISTS = { positions: [], candidates: [], notes: [] };
const synchronized = new Map();
const assignmentChecks = new Map();
let database;

export function recruiterScopeKey({ userId, tenantId, filter, permissions, candidateId }) {
  if (!userId || !tenantId) return '';
  return JSON.stringify([userId, tenantId, filter || 'All', permissions || '', candidateId || '']);
}

function openCache() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Recruiter LocalDB is unavailable.'));
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const rows = db.createObjectStore('records', { keyPath: ['scope', 'entity', 'id'] });
        rows.createIndex('scope', 'scope');
        db.createObjectStore('sync', { keyPath: 'scope' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Recruiter LocalDB is blocked.'));
    }).catch(error => {
      database = null;
      throw error;
    });
  }
  return database;
}

function result(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function committed(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Recruiter cache write failed.'));
  });
}

function snapshotKey(scope) {
  return `crm_recruiter_preview_v1:${scope}`;
}

export function readRecruiterPreview(scope) {
  if (!scope) return null;
  try { return JSON.parse(sessionStorage.getItem(snapshotKey(scope)) || 'null'); }
  catch { return null; }
}

function savePreview(scope, rows) {
  try {
    const preview = {};
    for (const entity of ['positions', 'candidates', 'notes']) {
      preview[entity] = rows[entity].slice(0, PREVIEW_LIMIT);
    }
    let serialized = JSON.stringify(preview);
    if (serialized.length > 400000) {
      for (const entity of Object.keys(preview)) preview[entity] = preview[entity].slice(0, 30);
      serialized = JSON.stringify(preview);
    }
    if (serialized.length <= 400000) sessionStorage.setItem(snapshotKey(scope), serialized);
  } catch { /* IndexedDB remains the source for the complete cache. */ }
}

export function mergeRecruiterRows(current, changes) {
  const maps = Object.fromEntries(['positions', 'candidates', 'notes'].map(entity => [
    entity, new Map((current?.[entity] || []).map(row => [row.id, row]))
  ]));
  for (const { entity, id, row } of changes) {
    if (row) maps[entity].set(id, row);
    else maps[entity].delete(id);
  }
  const visiblePositions = maps.positions;
  if (visiblePositions.size || current?.positions?.length || changes.some(change => change.entity === 'positions')) {
    for (const [id, candidate] of maps.candidates) {
      const position = visiblePositions.get(candidate.position_id);
      if (!position) maps.candidates.delete(id);
      else if (candidate.recruitment_positions?.title !== position.title ||
        candidate.recruitment_positions?.department !== position.department) {
        maps.candidates.set(id, { ...candidate, recruitment_positions: { title: position.title, department: position.department } });
      }
    }
  }
  return Object.fromEntries(Object.entries(maps).map(([entity, values]) => [
    entity, [...values.values()].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || String(b.id).localeCompare(String(a.id)))
  ]));
}

async function readCache(scope) {
  const db = await openCache();
  const tx = db.transaction(['records', 'sync']);
  const [meta, rows] = await Promise.all([
    result(tx.objectStore('sync').get(scope)),
    result(tx.objectStore('records').index('scope').getAll(scope))
  ]);
  return { meta, rows: mergeRecruiterRows(null, rows.map(({ entity, id, row }) => ({ entity, id, row }))) };
}

async function persist(scope, previous, meta, changes, rows, replace) {
  const db = await openCache();
  const tx = db.transaction(['records', 'sync'], 'readwrite');
  const complete = committed(tx);
  const status = tx.objectStore('sync');
  const records = tx.objectStore('records');
  let accepted = false;
  const check = status.get(scope);
  check.onsuccess = () => {
    if (check.result?.cursor !== previous?.cursor || check.result?.token !== previous?.token) return;
    accepted = true;
    if (replace) {
      const cursor = records.index('scope').openKeyCursor(scope);
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (entry) {
          records.delete(entry.primaryKey);
          entry.continue();
        } else {
          for (const [entity, items] of Object.entries(rows)) {
            for (const row of items) records.put({ scope, entity, id: row.id, row });
          }
        }
      };
    } else {
      for (const { entity, id, row } of changes) {
        if (row) records.put({ scope, entity, id, row });
        else records.delete([scope, entity, id]);
      }
    }
    status.put({ scope, ...meta });
  };
  await complete;
  return accepted;
}

export async function hydrateRecruiterCache(scope) {
  return scope ? (await readCache(scope)).rows : null;
}

export function syncRecruiterRecords(scope, request) {
  if (!scope) return Promise.reject(new Error('Recruiter session is not available.'));
  if (synchronized.has(scope)) return synchronized.get(scope);
  const pending = (async () => {
    let saved;
    try { saved = await readCache(scope); }
    catch { saved = { rows: mergeRecruiterRows(null, []), meta: undefined }; }
    let rows = saved.rows;
    let meta = saved.meta;
    let continuation = null;
    let replacement = !meta;
    const changes = [];
    do {
      const response = await readRecruiterSync({
        ...request,
        token: meta?.token,
        cursor: meta?.cursor,
        continuation
      });
      if (!response?.success) {
        const error = new Error(response?.error || 'Recruiter sync failed.');
        error.code = response?.code;
        throw error;
      }
      if (response.reset) {
        replacement = true;
        meta = undefined;
        continuation = null;
        changes.length = 0;
        continue;
      }
      changes.push(...response.changes);
      continuation = response.continuation;
      if (!continuation) meta = { cursor: response.cursor, token: response.token };
    } while (continuation || !meta);

    rows = mergeRecruiterRows(replacement ? null : rows, changes);
    try {
      if (await persist(scope, saved.meta, meta, changes, rows, replacement)) savePreview(scope, rows);
      else rows = (await readCache(scope)).rows;
    } catch { /* Keep the fresh server data visible when storage is unavailable. */ }
    return rows;
  })().finally(() => synchronized.delete(scope));
  synchronized.set(scope, pending);
  return pending;
}

export function notifyRecruiterSync(detail = {}) {
  window.dispatchEvent(new CustomEvent(RECRUITER_SYNC_EVENT, { detail }));
  try {
    const channel = new BroadcastChannel(RECRUITER_SYNC_EVENT);
    channel.postMessage(detail);
    channel.close();
  } catch { /* Realtime, visibility and reconnect still check the server cursor. */ }
}

export async function submitRecruiterChange(scope, operation, payload, options = {}) {
  if (!scope?.userId || !scope?.tenantId) return { success: false, error: 'Recruiter session is not available.' };
  const id = payload.id || crypto.randomUUID();
  const request = {
    scope: { userId: scope.userId, tenantId: scope.tenantId, filter: scope.filter },
    mutationId: crypto.randomUUID(),
    operation,
    payload: { ...payload, id },
    expected: options.expected || null,
    note: options.note || '',
    create: !payload.id && ['position:save', 'candidate:save'].includes(operation)
  };
  try {
    if (navigator.onLine !== false) {
      const response = await applyRecruiterMutation(request);
      if (response?.success) notifyRecruiterSync({ tenantId: scope.tenantId, candidateId: options.candidateId || null });
      return response;
    }
  } catch {
    // The response may have been lost after commit. Replay uses the same mutation ID.
  }
  const permission = canPerformOfflineAction('recruiter');
  if (!permission.allowed) return { success: false, error: permission.reason };
  const queued = await enqueueOfflineAction(operation, 'recruiter', request);
  if (!queued) return { success: false, error: 'Recruiter change could not be stored on this device.' };
  return { success: true, queued: true, data: { id } };
}

export function flushRecruiterQueue(supabase) {
  return syncPendingQueue(supabase, null, { entityType: 'recruiter' });
}

export function useRecruiterLists(scope, supabase) {
  const key = recruiterScopeKey(scope);
  const [state, setState] = useState(() => ({ key, rows: readRecruiterPreview(key), loading: true }));
  const [manual, setManual] = useState(false);
  const refresh = useRef(null);
  const loadData = useCallback((manually = false) => refresh.current?.(manually), []);

  useEffect(() => {
    if (!key) return;
    let current = true;
    let pending = null;
    let again = false;
    let timer;
    let hasHydrated = false;
    const request = { userId: scope.userId, tenantId: scope.tenantId, filter: scope.filter };
    const publish = (rows, error = '') => {
      if (!current) return;
      setState(previous => ({ key, loading: false, error,
        rows: rows ?? (previous.key === key ? previous.rows : readRecruiterPreview(key)) }));
    };
    const pull = (manually = false) => {
      if (!current) return;
      if (manually) setManual(true);
      if (pending) {
        again = true;
        return pending;
      }
      pending = (async () => {
        if (!hasHydrated) {
          hasHydrated = true;
          try {
            const local = await hydrateRecruiterCache(key);
            if (local?.positions.length || local?.candidates.length) publish(local);
          } catch { /* Live reads can still succeed. */ }
        }
        if (!current) return;
        if (navigator.onLine === false) {
          publish(null);
          return;
        }
        try {
          const rows = await syncRecruiterRecords(key, request);
          publish(rows);
          const now = Date.now();
          if (scope.autoAssign && now - (assignmentChecks.get(key) || 0) >= 3600000 &&
            rows.positions.some(row => (!row.recruiter_assigned || row.recruiter_assigned === 'All') &&
              ['S00', 'S01'].includes(row.status) && now - Date.parse(row.created_at) >= 86400000)) {
            assignmentChecks.set(key, now);
            autoAssignUnclaimedPositions(request).then(result => {
              if (current && result?.count) schedule();
            }).catch(() => {});
          }
        } catch (error) {
          publish(error.code === 'denied' ? EMPTY_LISTS : null, error.message);
        }
      })().finally(() => {
        pending = null;
        if (!current) return;
        if (again) {
          again = false;
          schedule();
        }
        setManual(false);
      });
      return pending;
    };
    const schedule = event => {
      if (event?.detail?.tenantId && event.detail.tenantId !== scope.tenantId) return;
      if (event?.type === 'visibilitychange' && document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      timer = setTimeout(() => pull(), 200);
    };
    const reconnect = () => {
      flushRecruiterQueue(supabase).catch(() => {});
      schedule();
    };
    const channel = supabase.channel(`recruiter_sync_${scope.userId}_${scope.tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recruitment_positions' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recruitment_candidates' }, schedule)
      .subscribe(status => { if (status === 'SUBSCRIBED') schedule(); });
    let broadcast;
    try {
      broadcast = new BroadcastChannel(RECRUITER_SYNC_EVENT);
      broadcast.onmessage = event => {
        if (!event.data?.tenantId || event.data.tenantId === scope.tenantId) {
          window.dispatchEvent(new CustomEvent(RECRUITER_SYNC_EVENT, { detail: event.data }));
        }
      };
    } catch { /* Periodic reconciliation works without BroadcastChannel. */ }
    refresh.current = pull;
    const interval = setInterval(schedule, 60000);
    window.addEventListener(RECRUITER_SYNC_EVENT, schedule);
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', schedule);
    schedule();
    if (navigator.onLine !== false) flushRecruiterQueue(supabase).catch(() => {});
    return () => {
      current = false;
      refresh.current = null;
      clearTimeout(timer);
      clearInterval(interval);
      broadcast?.close();
      supabase.removeChannel(channel);
      window.removeEventListener(RECRUITER_SYNC_EVENT, schedule);
      window.removeEventListener('online', reconnect);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [key, scope.userId, scope.tenantId, scope.filter, scope.autoAssign, supabase]);

  const local = state.key === key ? state : { rows: readRecruiterPreview(key), loading: true };
  return { ...local, rows: local.rows || EMPTY_LISTS, loading: !!key && local.loading && !local.rows, manual, loadData };
}

export function useRecruiterNotes(scope, candidateId, active, supabase) {
  const key = recruiterScopeKey({ ...scope, candidateId });
  const [state, setState] = useState(() => ({ key, notes: readRecruiterPreview(key)?.notes || [], loading: true }));
  useEffect(() => {
    if (!active || !key || !candidateId) return;
    let current = true;
    let sequence = 0;
    const refresh = async () => {
      const attempt = ++sequence;
      let local;
      try { local = await hydrateRecruiterCache(key); } catch { /* Live read can still succeed. */ }
      if (!current || attempt !== sequence) return;
      if (local?.notes.length) setState({ key, notes: local.notes, loading: false });
      if (navigator.onLine === false) {
        setState(previous => previous.key === key
          ? { ...previous, loading: false }
          : { key, notes: local?.notes || [], loading: false });
        return;
      }
      try {
        const rows = await syncRecruiterRecords(key, {
          userId: scope.userId, tenantId: scope.tenantId, filter: scope.filter, candidateId
        });
        if (current && attempt === sequence) setState({ key, notes: rows.notes, loading: false });
      } catch (error) {
        if (current && attempt === sequence) {
          setState(previous => ({ key, loading: false, error: error.message,
            notes: error.code !== 'denied' && previous.key === key ? previous.notes : [] }));
        }
      }
    };
    refresh();
    const check = event => {
      if (!event.detail?.candidateId || event.detail.candidateId === candidateId) refresh();
    };
    window.addEventListener(RECRUITER_SYNC_EVENT, check);
    window.addEventListener('online', refresh);
    const channel = supabase.channel(`recruiter_notes_${candidateId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recruitment_candidate_notes', filter: `candidate_id=eq.${candidateId}` }, refresh)
      .subscribe();
    return () => {
      current = false;
      supabase.removeChannel(channel);
      window.removeEventListener(RECRUITER_SYNC_EVENT, check);
      window.removeEventListener('online', refresh);
    };
  }, [active, key, candidateId, scope?.userId, scope?.tenantId, scope?.filter, supabase]);
  return state.key === key ? state : { notes: [], loading: true };
}
