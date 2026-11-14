// Field Force-only range orchestration. Daily GPS analysis remains in getEmployee360Route.
const DAY_MS = 86400000;
const IST_DAYS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
export const TRACKING_RANGE_PRESETS = [
  { id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This Week' }, { id: 'last_week', label: 'Last Week' },
  { id: 'last_7', label: 'Last 7 Days' }, { id: 'last_30', label: 'Last 30 Days' },
  { id: 'last_90', label: 'Last 90 Days' },
  { id: 'this_month', label: 'This Month' }, { id: 'last_month', label: 'Last Month' },
];

export function isTrackingDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00+05:30`);
  return Number.isFinite(date.getTime()) && IST_DAYS.format(date) === value;
}

export function resolveTrackingDateRange(preset, customStart = '', customEnd = '', now = Date.now()) {
  const today = IST_DAYS.format(new Date(now));
  const midnight = new Date(`${today}T00:00:00+05:30`).getTime();
  const daysAgo = count => IST_DAYS.format(new Date(midnight - count * DAY_MS));
  let startDate = today;
  let endDate = today;
  if (preset === 'yesterday') startDate = endDate = daysAgo(1);
  else if (preset === 'last_7' || preset === 'last_30' || preset === 'last_90') startDate = daysAgo(Number(preset.slice(5)) - 1);
  else if (preset === 'this_week' || preset === 'last_week') {
    const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(new Date(midnight));
    const sinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(day);
    startDate = daysAgo(sinceMonday + (preset === 'last_week' ? 7 : 0));
    if (preset === 'last_week') endDate = daysAgo(sinceMonday + 1);
  } else if (preset === 'this_month') startDate = `${today.slice(0, 7)}-01`;
  else if (preset === 'last_month') {
    endDate = IST_DAYS.format(new Date(new Date(`${today.slice(0, 7)}-01T00:00:00+05:30`).getTime() - DAY_MS));
    startDate = `${endDate.slice(0, 7)}-01`;
  } else if (preset === 'custom') {
    startDate = customStart || today;
    endDate = customEnd || startDate;
  }
  return { preset, startDate, endDate, label: TRACKING_RANGE_PRESETS.find(item => item.id === preset)?.label || 'Custom Range' };
}

export function enumerateTrackingDates(startDate, endDate) {
  if (!isTrackingDate(startDate) || !isTrackingDate(endDate) || startDate > endDate) return [];
  const start = new Date(`${startDate}T00:00:00+05:30`).getTime();
  const end = new Date(`${endDate}T00:00:00+05:30`).getTime();
  const result = [];
  for (let ms = start; ms <= end; ms += DAY_MS) result.push(IST_DAYS.format(new Date(ms)));
  return result;
}

const dayCache = new Map();
const TRACKING_CACHE_REVISION = 'activity-v2';
const dayRequests = new Map();
const queuedDailyRequests = [];
let activeDailyRequests = 0;
let dbPromise;

async function limitedDailyFetch(fetchDaily) {
  if (activeDailyRequests < 2) activeDailyRequests++;
  else await new Promise(resolve => queuedDailyRequests.push(resolve));
  try { return await fetchDaily(); }
  finally {
    const next = queuedDailyRequests.shift();
    if (next) next();
    else activeDailyRequests--;
  }
}

function rememberDay(key, record) {
  dayCache.delete(key);
  dayCache.set(key, record);
  if (dayCache.size > 180) dayCache.delete(dayCache.keys().next().value);
}

function openTrackingCache() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) dbPromise = new Promise(resolve => {
    try {
      const request = indexedDB.open('crm_field_tracking_ranges_v1', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('days')) request.result.createObjectStore('days', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

async function readStoredDay(key) {
  const db = await openTrackingCache();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const request = db.transaction('days', 'readonly').objectStore('days').get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

function storeDay(record) {
  // Persistence is secondary; a blocked IndexedDB request never blocks route playback.
  void openTrackingCache().then(db => {
    if (!db) return;
    try {
      const { rawPolyline: _raw, ...compact } = record.data;
      db.transaction('days', 'readwrite').objectStore('days').put({ ...record, data: compact });
    } catch { /* optional cache */ }
  }).catch(() => {});
}

function freshRecord(record, date, now) {
  const today = IST_DAYS.format(new Date(now));
  return record?.data && record.at > now - (date === today ? 15000 : 15 * 60000);
}

export function peekTrackingDay(userId, date) {
  return dayCache.get(`${TRACKING_CACHE_REVISION}:${userId}:${date}`)?.data || null;
}

export async function fetchTrackingDay(userId, date, fetchDaily, { forceFresh = false, now = Date.now() } = {}) {
  const key = `${TRACKING_CACHE_REVISION}:${userId}:${date}`;
  if (dayRequests.has(key)) return dayRequests.get(key);
  const promise = (async () => {
    if (!forceFresh) {
      let cached = dayCache.get(key);
      if (!cached) {
        // Bound cache waiting so browser storage cannot hold up a server refresh.
        let timer;
        cached = await Promise.race([readStoredDay(key), new Promise(resolve => { timer = setTimeout(() => resolve(null), 250); })]);
        clearTimeout(timer);
        if (cached) rememberDay(key, cached);
      }
      if (freshRecord(cached, date, now)) return cached.data;
    }
    const data = await limitedDailyFetch(() => fetchDaily(userId, date));
    if (!data || String(data.userId) !== String(userId) || data.date !== date) throw new Error('Route data unavailable for this date');
    const record = { key, at: now, data };
    rememberDay(key, record);
    storeDay(record);
    return data;
  })();
  dayRequests.set(key, promise);
  try { return await promise; } finally { if (dayRequests.get(key) === promise) dayRequests.delete(key); }
}

export async function loadTrackingRange({ userId, dates, fetchDaily, signal, forceFresh = false, onProgress, concurrency = 2 }) {
  const entries = {};
  let cursor = 0;
  let completed = 0;
  const publish = () => {
    if (!signal?.aborted) onProgress?.({ entries: { ...entries }, completed, total: dates.length, loading: completed < dates.length });
  };
  publish();
  async function worker() {
    while (!signal?.aborted && cursor < dates.length) {
      const date = dates[cursor++];
      try {
        const data = await fetchTrackingDay(userId, date, fetchDaily, { forceFresh });
        if (signal?.aborted) return;
        entries[date] = { status: 'success', data };
      } catch {
        if (signal?.aborted) return;
        entries[date] = { status: 'error', data: null };
      }
      completed++;
      publish();
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, Math.max(1, concurrency), dates.length) }, worker));
  return { entries, completed, total: dates.length, loading: false, cancelled: Boolean(signal?.aborted) };
}

export function summarizeTrackingRange(entries, dates) {
  const loaded = dates.filter(date => entries[date]?.status === 'success');
  const days = loaded.map(date => entries[date].data);
  const sum = field => days.reduce((total, day) => total + (Number(day[field]) || 0), 0);
  const timeline = days.flatMap(day => (day.timeline || []).map((event, index) => ({ ...event, trackingDate: day.date, trackingEventKey: `${day.date}:${index}` })));
  const activityTimeline = days.flatMap(day => (day.activityTimeline || day.timeline || []).map((event, index) => ({ ...event, trackingDate: day.date, trackingEventKey: `${day.date}:activity:${index}` })));
  const latest = [...days].reverse().find(day => day.lastPing || day.latestBattery) || null;
  return {
    totalKm: loaded.length ? Number(sum('totalKm').toFixed(2)) : null,
    trackedRoadKm: loaded.length ? Number(sum('trackedRoadKm').toFixed(2)) : null,
    offlineGapKm: loaded.length ? Number(sum('offlineGapKm').toFixed(2)) : null,
    visitsCount: loaded.length ? sum('visitsCount') : null,
    activityVisitsCount: loaded.length ? days.reduce((total, day) => total + (Number(day.activityVisitsCount ?? day.visitsCount) || 0), 0) : null,
    timeline, activityTimeline, latest, lastPing: latest?.lastPing || null, loadedDays: loaded.length, totalDays: dates.length,
    failedDays: dates.filter(date => entries[date]?.status === 'error').length,
    movementDays: loaded.filter(date => (entries[date].data.polyline?.length || 0) > 1),
  };
}

export function nextTrackingPlaybackDay(dates, entries, currentDate) {
  for (const date of dates.slice(dates.indexOf(currentDate) + 1)) {
    const entry = entries[date];
    if (!entry) return { date: '', waiting: true };
    if (entry.data?.polyline?.length > 1) return { date, waiting: false };
  }
  return { date: '', waiting: false };
}

// Runs are kept inside one calendar day and split at invalid points/connectivity/leg changes.
export function getTrackingOverviewRuns(data, split = {}) {
  const points = data?.polyline || [];
  const runs = [];
  let run = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const valid = point => point?.lat != null && point?.lng != null && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng));
    if (!valid(a) || !valid(b)) { run = null; continue; }
    const kind = b.isOffline && !b.isSnapped ? 'gap' : b.isOffline ? 'offline' : split.hasReturnTrip && i > split.turnaroundIdx ? 'return' : 'going';
    if (!run || run.kind !== kind) {
      run = { date: data.date, kind, coords: [[Number(a.lat), Number(a.lng)]] };
      runs.push(run);
    }
    run.coords.push([Number(b.lat), Number(b.lng)]);
  }
  return runs;
}
