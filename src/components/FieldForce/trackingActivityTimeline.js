import { haversineMeters } from '@/utils/routeGeometryMatcher';

const IST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
const UUID_TEXT = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const text = value => typeof value === 'string' ? value.replace(UUID_TEXT, '').trim() : '';

export function trackingActivityTimeMs(value) {
  if (value == null || value === '') return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const input = String(value).trim();
  const explicit = /^\d{4}-\d{2}-\d{2}$/.test(input) ? `${input}T00:00:00+05:30`
    : /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(input) ? `${input.replace(' ', 'T')}+05:30` : input;
  return Date.parse(explicit);
}

export function isTrackingActivityPosition(lat, lng) {
  if (lat == null || lng == null || lat === '' || lng === '') return false;
  const latitude = Number(lat), longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 &&
    (Math.abs(latitude) > 0.01 || Math.abs(longitude) > 0.01);
}

// Derive movement once from the existing cleaned daily geometry. Visit intervals
// can overlap; they never contribute distance or create extra travel segments.
export function buildTrackingActivityTimeline({ date, timeline = [], polyline = [], trackedRoadKm }) {
  const rows = timeline.map((event, index) => ({ ...event, sourceEventIndex: index, activityKey: `${date}:event:${index}` }));
  const points = polyline.map((point, index) => ({ ...point, ms: trackingActivityTimeMs(point.time), index }))
    .sort((a, b) => (Number.isFinite(a.ms) ? a.ms : Infinity) - (Number.isFinite(b.ms) ? b.ms : Infinity));
  const stops = timeline.filter(event => event.type === 'stoppage').map(event => ({
    start: trackingActivityTimeMs(event.startTime), end: trackingActivityTimeMs(event.endTime),
  })).filter(stop => Number.isFinite(stop.start) && stop.end >= stop.start);
  let movement = null;
  const finish = () => {
    if (movement && movement.distanceMeters >= 30 && movement.endMs > movement.startMs) {
      const { startMs, endMs, distanceMeters, index, lat, lng, offlineRecorded } = movement;
      rows.push({ type: 'travel', activityKey: `${date}:travel:${index}`, startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(), durationMins: (endMs - startMs) / 60000,
        distanceKm: distanceMeters / 1000, lat, lng, offlineRecorded });
    }
    movement = null;
  };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (!isTrackingActivityPosition(a.lat, a.lng) || !isTrackingActivityPosition(b.lat, b.lng) ||
        !Number.isFinite(a.ms) || !Number.isFinite(b.ms) || b.ms < a.ms ||
        IST_DAY.format(new Date(a.ms)) !== date || IST_DAY.format(new Date(b.ms)) !== date) { finish(); continue; }
    // Road-matching chunk boundaries can share a timestamp. They are not stops
    // and cannot contribute measurable travel at an instantaneous time jump.
    if (b.ms === a.ms) continue;
    const meters = haversineMeters(a.lat, a.lng, b.lat, b.lng);
    const seconds = (b.ms - a.ms) / 1000;
    if (meters >= 30 && (seconds > 300 || (b.isOffline && !b.isSnapped))) {
      finish();
      rows.push({ type: 'signal_gap', activityKey: `${date}:gap:${i}`, startTime: new Date(a.ms).toISOString(),
        endTime: new Date(b.ms).toISOString(), durationMins: seconds / 60, distanceKm: null, lat: Number(b.lat), lng: Number(b.lng) });
      continue;
    }
    const stationary = Math.max(Number(a.speed) || 0, Number(b.speed) || 0) <= 3;
    const insideStop = stationary && meters < 40 && stops.some(stop => a.ms >= stop.start && b.ms <= stop.end);
    if (meters < 1 || insideStop || (stationary && meters < 25 && seconds >= 60)) {
      if (insideStop || seconds >= 60) finish();
      continue;
    }
    if (movement && a.ms - movement.endMs > 60000) finish();
    if (!movement) movement = { startMs: a.ms, endMs: b.ms, distanceMeters: 0, index: i,
      lat: Number(a.lat), lng: Number(a.lng), offlineRecorded: false };
    movement.endMs = b.ms;
    movement.distanceMeters += meters;
    movement.offlineRecorded ||= Boolean(b.isOffline && b.isSnapped);
  }
  finish();
  const trips = rows.filter(row => row.type === 'travel');
  if (trips.length === 1 && !rows.some(row => row.type === 'signal_gap') && trackedRoadKm != null && Number.isFinite(Number(trackedRoadKm)) && Number(trackedRoadKm) > 0) {
    // With one continuous daily journey, the existing tracked-road metric is
    // authoritative; avoid adding tiny stitching chords to the displayed km.
    trips[0].distanceKm = Number(trackedRoadKm);
  }
  const rank = { punch_in: 0, stoppage: 1, visit: 2, travel: 3, signal_gap: 3, punch_out: 4 };
  return rows.sort((a, b) => {
    const left = trackingActivityTimeMs(a.startTime || a.checkInTime);
    const right = trackingActivityTimeMs(b.startTime || b.checkInTime);
    return (Number.isFinite(left) ? left : Infinity) - (Number.isFinite(right) ? right : Infinity) || (rank[a.type] ?? 5) - (rank[b.type] ?? 5);
  });
}

function stableVisitPayload(value) {
  if (Array.isArray(value)) return value.map(stableVisitPayload);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableVisitPayload(value[key])]));
  return value;
}

function groupRepeatedVisitSubmissions(rows, submissions) {
  const grouped = [];
  const positions = new Map();
  for (const row of rows) {
    const visit = row.type === 'visit' ? submissions.get(row.visitId) : null;
    const checkIn = trackingActivityTimeMs(visit?.check_in_time);
    // A task code alone does not identify a visit: genuine check-ins can reuse
    // the same task. Require the same recorded check-in and business payload.
    if (!visit?.task_id || !Number.isFinite(checkIn)) { grouped.push(row); continue; }
    const payload = ['party_name', 'customer_id', 'lead_id', 'connectivity_mode', 'pipeline_type', 'form_id',
      'lead_stage_updated', 'order_pipeline_stage', 'complaint_ticket_stage', 'outcome_status', 'order_value',
      'payment_collected', 'payment_mode', 'cheque_utr_no', 'form_data', 'discussion_notes', 'next_followup_at',
      'customer_signature_url', 'photo_watermark_urls'].map(field => visit[field] ?? null);
    const key = JSON.stringify([visit.field_user_id || '', visit.task_id, checkIn, stableVisitPayload(payload)]);
    if (!positions.has(key)) {
      positions.set(key, grouped.length);
      grouped.push({ ...row, submissionCount: 1 });
      continue;
    }
    const index = positions.get(key);
    const previous = grouped[index];
    const previousVisit = submissions.get(previous.visitId);
    const previousEnd = trackingActivityTimeMs(previous.checkOutTime);
    const nextEnd = trackingActivityTimeMs(row.checkOutTime);
    const endOrder = (Number.isFinite(nextEnd) ? nextEnd : -Infinity) - (Number.isFinite(previousEnd) ? previousEnd : -Infinity);
    const latest = endOrder > 0 || ((endOrder === 0 || Number.isNaN(endOrder)) &&
      trackingActivityTimeMs(visit.created_at) > trackingActivityTimeMs(previousVisit?.created_at));
    grouped[index] = { ...(latest ? row : previous), submissionCount: previous.submissionCount + 1 };
  }
  return grouped;
}

export async function enrichTrackingActivityTimeline({ date, timeline = [], polyline = [], trackedRoadKm, visits = [], tasks = [], resolveAddress }) {
  const submissions = new Map(visits.map(visit => [visit.id, visit]));
  const taskMap = new Map(tasks.map(task => [task.id, task]));
  const enriched = groupRepeatedVisitSubmissions(timeline.map(event => {
    const row = { ...event, locationName: text(event.locationName), fullAddress: '' };
    if (event.type === 'visit') {
      const visit = submissions.get(event.visitId) || {};
      const task = taskMap.get(visit.task_id) || {};
      row.visitCode = /^(CHK|TSK)-\d+$/i.test(text(task.task_code)) ? text(task.task_code) : null;
      row.partyName = text(visit.party_name) || text(task.party_name) || text(event.partyName);
      row.visitType = text(visit.form_data?.visit_type) || ({ PHYSICAL_VISIT: 'Visit', TELEPHONIC_CALL: 'Phone call', WHATSAPP_CHAT: 'WhatsApp', EMAIL_QUOTE: 'Email' }[event.connectivityMode]) || 'Visit';
      row.fullAddress = text(visit.party_address) || text(task.party_address);
      const position = [[visit.check_in_lat, visit.check_in_lng], [visit.check_out_lat, visit.check_out_lng], [event.lat, event.lng], [task.party_lat, task.party_lng]]
        .find(([lat, lng]) => isTrackingActivityPosition(lat, lng));
      row.lat = position ? Number(position[0]) : null;
      row.lng = position ? Number(position[1]) : null;
    } else if (!isTrackingActivityPosition(row.lat, row.lng)) { row.lat = null; row.lng = null; }
    return row;
  }), submissions);
  const locations = new Map();
  for (const row of enriched) {
    if (!row.fullAddress && isTrackingActivityPosition(row.lat, row.lng)) {
      const key = `${Number(row.lat).toFixed(4)},${Number(row.lng).toFixed(4)}`;
      if (!locations.has(key)) locations.set(key, { lat: row.lat, lng: row.lng, rows: [] });
      locations.get(key).rows.push(row);
    }
  }
  const pending = [...locations.values()];
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const location = pending[cursor++];
      let address = '';
      try { address = text(await resolveAddress?.(location.lat, location.lng)); } catch { /* optional metadata */ }
      if (/^(?:Location|GPS)\s*\(/i.test(address)) address = '';
      for (const row of location.rows) row.fullAddress = address || (/^(?:Location|GPS)\s*\(/i.test(row.locationName) ? '' : row.locationName);
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, pending.length) }, worker));
  return buildTrackingActivityTimeline({ date, polyline, trackedRoadKm, timeline: enriched });
}
