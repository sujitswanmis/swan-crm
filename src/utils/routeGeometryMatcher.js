/**
 * Shared GPS Route Noise Filter, Stationary Drift Collapser, Offline-Gap Segmenter,
 * and OSRM /match Road Snapper (used consistently on both server & client).
 */

export function haversineMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);
  if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) return 0;
  if ((Math.abs(nLat1) < 0.01 && Math.abs(nLon1) < 0.01) || (Math.abs(nLat2) < 0.01 && Math.abs(nLon2) < 0.01)) {
    return 0;
  }
  const R = 6371000;
  const dLat = ((nLat2 - nLat1) * Math.PI) / 180;
  const dLon = ((nLon2 - nLon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((nLat1 * Math.PI) / 180) *
      Math.cos((nLat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getAccuracyValue(p) {
  const raw = p?.accuracy_meters != null ? Number(p.accuracy_meters) : NaN;
  return isNaN(raw) ? null : raw;
}

function pickBestClusterCoordinate(cluster) {
  let best = cluster[cluster.length - 1];
  let bestAcc = getAccuracyValue(best);
  if (bestAcc == null) bestAcc = Infinity;

  for (let i = 0; i < cluster.length; i++) {
    const acc = getAccuracyValue(cluster[i]);
    if (acc != null && acc <= bestAcc) {
      bestAcc = acc;
      best = cluster[i];
    }
  }
  return best;
}

function emitCollapsedCluster(cluster, output) {
  if (!cluster || cluster.length === 0) return;
  const best = pickBestClusterCoordinate(cluster);
  const first = cluster[0];
  const last = cluster[cluster.length - 1];
  const prevEmitted = output.length > 0 ? output[output.length - 1] : null;

  let entryIsOffline = false;
  if (prevEmitted) {
    const distFromPrev = haversineMeters(prevEmitted.lat, prevEmitted.lng, best.lat, best.lng);
    const dtPrevSec =
      first.time && prevEmitted.time
        ? Math.max(0, (new Date(first.time).getTime() - new Date(prevEmitted.time).getTime()) / 1000)
        : 0;
    entryIsOffline = Boolean(first.isOffline || dtPrevSec > 300 || (distFromPrev > 1000 && dtPrevSec > 60));
  }

  const entryPoint = {
    ...first,
    lat: best.lat,
    lng: best.lng,
    accuracy_meters: getAccuracyValue(best) ?? getAccuracyValue(first),
    speed: Math.max(0, Math.round(Number(first.speed || 0))),
    isOffline: entryIsOffline
  };
  output.push(entryPoint);

  const clusterSpanSec =
    first.time && last.time
      ? Math.max(0, (new Date(last.time).getTime() - new Date(first.time).getTime()) / 1000)
      : 0;

  if (cluster.length > 1 && clusterSpanSec >= 30) {
    output.push({
      ...last,
      lat: best.lat,
      lng: best.lng,
      accuracy_meters: getAccuracyValue(best) ?? getAccuracyValue(last),
      speed: 0,
      isOffline: false
    });
  }
}

/**
 * Removes invalid coordinates, chronologically sorts waypoints, strips indoor/cell-tower accuracy
 * bounces, and filters impossible teleportation / triangle sawtooth glitches without collapsing stops.
 */
export function stripNoisyGpsOutliers(waypoints, { rejectUnsupportedDetours = false } = {}) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return [];

  // 1. Validate finite non-zero coordinates and normalize
  const normalized = waypoints
    .filter(p => {
      const lat = Number(p?.lat);
      const lng = Number(p?.lng);
      return (
        !isNaN(lat) &&
        !isNaN(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180 &&
        (Math.abs(lat) > 0.01 || Math.abs(lng) > 0.01)
      );
    })
    .map((p, idx) => ({
      ...p,
      _origIdx: idx,
      lat: Number(p.lat),
      lng: Number(p.lng),
      accuracy_meters: getAccuracyValue(p),
      speed: p.speed != null ? Number(p.speed) : 0,
      isOffline: Boolean(p.isOffline)
    }));

  if (normalized.length === 0) return [];

  // 2. Chronological order
  normalized.sort((a, b) => {
    const tA = a.time ? new Date(a.time).getTime() : 0;
    const tB = b.time ? new Date(b.time).getTime() : 0;
    if (tA !== tB) return tA - tB;
    return a._origIdx - b._origIdx;
  });

  // 3. Drop >300m network/IP fixes when acceptable fixes exist
  const under300 = normalized.filter(p => p.accuracy_meters == null || p.accuracy_meters <= 300);
  let valid = under300.length >= 2 || (normalized.length === 1 && under300.length === 1) ? under300 : normalized;

  if (rejectUnsupportedDetours) {
    // Some network fixes claim 15–25m accuracy and zero speed during a moving
    // 4m GPS trace. Compare them with time-bracketing GPS fixes, rather than
    // snapping to the nearest fix (which can itself create backwards travel).
    const sharp = valid.filter(point => point.accuracy_meters != null && point.accuracy_meters <= 8 && Number.isFinite(Date.parse(point.time)));
    let cursor = 0;
    valid = valid.filter(point => {
      const time = Date.parse(point.time);
      while (cursor < sharp.length && Date.parse(sharp[cursor].time) <= time) cursor++;
      const before = sharp[cursor - 1];
      const after = before && Date.parse(before.time) === time ? before : sharp[cursor];
      if (!before || !after || !Number.isFinite(time) || point.accuracy_meters == null ||
          point.accuracy_meters < Math.max(12, 3 * Math.max(before.accuracy_meters, after.accuracy_meters)) ||
          point.speed > 3 || Math.max(before.speed, after.speed) <= 5) return true;
      const start = Date.parse(before.time);
      const end = Date.parse(after.time);
      if (time - start > 30000 || end - time > 30000) return true;
      const fraction = end > start ? (time - start) / (end - start) : 0;
      const expectedLat = before.lat + (after.lat - before.lat) * fraction;
      const expectedLng = before.lng + (after.lng - before.lng) * fraction;
      return haversineMeters(point.lat, point.lng, expectedLat, expectedLng) <= Math.max(25, point.accuracy_meters * 1.5);
    });
  }

  // 4. Drop displaced indoor/cell-tower jumps, while preserving same-spot (<=35m) timestamps:
  //    a) >80m blurry fixes when a crisp <=35m GPS lock exists within +/-5 mins
  //    b) >30m network fixes when a sharp <=20m GPS lock exists within +/-30s (prevents side-street driving spikes)
  const findNearestCrispAnchor = (p, idx, maxAcc, maxWindowMs) => {
    const tP = new Date(p.time).getTime();
    let best = null;
    let bestDt = Infinity;
    for (let j = 0; j < valid.length; j++) {
      if (j === idx) continue;
      const q = valid[j];
      if (q.accuracy_meters == null || q.accuracy_meters > maxAcc || !q.time) continue;
      const dt = Math.abs(new Date(q.time).getTime() - tP);
      if (dt <= maxWindowMs && dt < bestDt) {
        bestDt = dt;
        best = q;
      }
    }
    return best;
  };

  const withoutCoarseBounces = [];
  for (let idx = 0; idx < valid.length; idx++) {
    const p = valid[idx];
    const acc = p.accuracy_meters;
    if (acc == null || !p.time) {
      withoutCoarseBounces.push(p);
      continue;
    }

    const crispAnchor =
      (acc > 30 ? findNearestCrispAnchor(p, idx, 20, 30000) : null) ||
      (acc > 80 ? findNearestCrispAnchor(p, idx, 35, 300000) : null);

    if (crispAnchor) {
      const distFromAnchor = haversineMeters(p.lat, p.lng, crispAnchor.lat, crispAnchor.lng);
      if (distFromAnchor > 35) {
        continue; // Spatial bounce/spike — drop completely
      }
      // Same physical spot (<=35m): preserve timestamp for accurate dwell duration using crisp coordinates
      withoutCoarseBounces.push({
        ...p,
        lat: crispAnchor.lat,
        lng: crispAnchor.lng,
        accuracy_meters: crispAnchor.accuracy_meters
      });
      continue;
    }

    withoutCoarseBounces.push(p);
  }
  if (withoutCoarseBounces.length >= 1) valid = withoutCoarseBounces;

  // 5a. Drop single-point sawtooth / cell-tower V-detour glitches between accurate points
  const sawtoothFree = [];
  for (let i = 0; i < valid.length; i++) {
    const cur = valid[i];
    if (sawtoothFree.length > 0 && i + 1 < valid.length) {
      const prev = sawtoothFree[sawtoothFree.length - 1];
      const next = valid[i + 1];
      const dPrevCur = haversineMeters(prev.lat, prev.lng, cur.lat, cur.lng);
      const dCurNext = haversineMeters(cur.lat, cur.lng, next.lat, next.lng);
      const dPrevNext = haversineMeters(prev.lat, prev.lng, next.lat, next.lng);
      const dtWindowSec =
        prev.time && next.time
          ? Math.max(0, (new Date(next.time).getTime() - new Date(prev.time).getTime()) / 1000)
          : 60;
      const curAcc = cur.accuracy_meters ?? 25;
      const anchorMaxAcc = Math.max(prev.accuracy_meters ?? 25, next.accuracy_meters ?? 25);
      const isShortWindowJump = dtWindowSec <= 45 && dPrevCur + dCurNext > dPrevNext * 1.55 + 70;
      const curIsLowerQuality = curAcc > anchorMaxAcc * 1.5 || (cur.speed === 0 && (prev.speed > 10 || next.speed > 10));
      if (isShortWindowJump && curIsLowerQuality) {
        continue;
      }
    }
    sawtoothFree.push(cur);
  }
  valid = sawtoothFree;

  // 5b. Filter impossible teleportation spikes (>130 km/h over >250m within 5m, or >140 km/h over >60m within 30s)
  const spikeFree = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    const prev = spikeFree[spikeFree.length - 1];
    const cur = valid[i];
    const dist = haversineMeters(prev.lat, prev.lng, cur.lat, cur.lng);
    const dtSec =
      prev.time && cur.time
        ? Math.max(0, (new Date(cur.time).getTime() - new Date(prev.time).getTime()) / 1000)
        : 60;
    const spdKmh = dtSec > 0 ? (dist / dtSec) * 3.6 : dist > 50 ? 999 : 0;
    if ((dist > 250 && spdKmh > 130 && dtSec < 300) || (dist > 60 && spdKmh > 140 && dtSec < 30)) {
      continue;
    }
    spikeFree.push(cur);
  }

  return spikeFree.map(({ _origIdx, ...rest }) => rest);
}

/**
 * Cleans raw GPS points and collapses stationary drift (<32m) to sharpest anchor while keeping entry & departure timestamps.
 */
export function filterRouteNoiseAndCoarseJumps(waypoints, { rejectUnsupportedDetours = false } = {}) {
  const spikeFree = stripNoisyGpsOutliers(waypoints, { rejectUnsupportedDetours });
  if (spikeFree.length === 0) return [];

  // 6. Collapse stationary drift (<32m, or <=65m indoor/compound bounce that returns cleanly without real travel)
  const collapsed = [];
  let cluster = [spikeFree[0]];
  let anchor = spikeFree[0];

  for (let i = 1; i < spikeFree.length; i++) {
    const cur = spikeFree[i];
    const curAcc = getAccuracyValue(cur);
    const curSpeed = Number(cur.speed || 0);
    const distFromAnchor = haversineMeters(anchor.lat, anchor.lng, cur.lat, cur.lng);

    let isStationaryCompoundOscillation = false;
    if (
      distFromAnchor > 32 &&
      distFromAnchor <= 65 &&
      (curSpeed <= 3 || (curAcc != null && curAcc >= 20 && curSpeed <= 12))
    ) {
      const curMs = cur.time ? new Date(cur.time).getTime() : 0;
      let maxLookaheadDist = distFromAnchor;
      let returnsNearAnchor = false;
      for (let k = i + 1; k < Math.min(spikeFree.length, i + 5); k++) {
        const fut = spikeFree[k];
        const futMs = fut.time ? new Date(fut.time).getTime() : curMs;
        if (curMs && futMs && futMs - curMs > 5 * 60 * 1000) break;
        const dFut = haversineMeters(anchor.lat, anchor.lng, fut.lat, fut.lng);
        if (dFut > maxLookaheadDist) maxLookaheadDist = dFut;
        if (maxLookaheadDist > 85) break;
        if (dFut <= 32) {
          returnsNearAnchor = true;
          break;
        }
      }
      isStationaryCompoundOscillation = returnsNearAnchor && maxLookaheadDist <= 85;
    }

    const staysStationary =
      (distFromAnchor <= 32 && (curSpeed <= 5 || distFromAnchor <= 25)) ||
      isStationaryCompoundOscillation;

    if (staysStationary) {
      cluster.push(cur);
      const anchorAcc = getAccuracyValue(anchor);
      if (
        distFromAnchor <= 32 &&
        curAcc != null &&
        (anchorAcc == null || curAcc < anchorAcc)
      ) {
        anchor = cur;
      }
    } else {
      emitCollapsedCluster(cluster, collapsed);
      cluster = [cur];
      anchor = cur;
    }
  }
  emitCollapsedCluster(cluster, collapsed);

  return collapsed;
}

/**
 * Aligns snapped OSRM road coordinates monotonically back to trip waypoints
 * so each road vertex keeps accurate segment timing, calculated speed, and offline-sync flags.
 */
export function alignSnappedSegmentToWaypoints(stitchedCoords, tripPoints) {
  if (!Array.isArray(stitchedCoords) || stitchedCoords.length < 2 || !Array.isArray(tripPoints) || tripPoints.length < 2) {
    return tripPoints || [];
  }

  const N = stitchedCoords.length;
  const M = tripPoints.length;
  const cumDist = new Array(N).fill(0);
  for (let j = 1; j < N; j++) {
    cumDist[j] =
      cumDist[j - 1] +
      haversineMeters(stitchedCoords[j - 1][1], stitchedCoords[j - 1][0], stitchedCoords[j][1], stitchedCoords[j][0]);
  }

  const anchors = new Array(M).fill(0);
  anchors[0] = 0;
  anchors[M - 1] = N - 1;
  for (let i = 1; i < M - 1; i++) {
    let bestIdx = anchors[i - 1];
    let bestDist = Infinity;
    for (let k = anchors[i - 1]; k < N; k++) {
      const d = haversineMeters(tripPoints[i].lat, tripPoints[i].lng, stitchedCoords[k][1], stitchedCoords[k][0]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = k;
      }
      if (bestDist < 50 && d > 200) break;
    }
    anchors[i] = Math.max(anchors[i - 1], bestIdx);
  }

  const snappedPolyline = [];
  let lastEmitted = -1;
  for (let i = 0; i < M - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const t1 = tripPoints[i].time ? new Date(tripPoints[i].time).getTime() : Date.now();
    const t2 = tripPoints[i + 1].time ? new Date(tripPoints[i + 1].time).getTime() : t1;
    const gapMs = Math.max(0, t2 - t1);
    const segIsOffline = Boolean(tripPoints[i + 1].isOffline);
    const segDist = Math.max(0, cumDist[b] - cumDist[a]);
    const calcSpeed =
      gapMs > 2000 && segDist > 10
        ? Math.min(Math.round((segDist / (gapMs / 1000)) * 3.6), 120)
        : Math.max(0, Math.round(Number(tripPoints[i + 1].speed || tripPoints[i].speed || 0)));

    const startK = Math.max(a, lastEmitted + 1);
    const endK = i === M - 2 ? b : Math.max(a, b - 1);
    for (let k = startK; k <= endK; k++) {
      const frac = segDist > 0 ? Math.min(1, Math.max(0, (cumDist[k] - cumDist[a]) / segDist)) : 0;
      snappedPolyline.push({
        lat: stitchedCoords[k][1],
        lng: stitchedCoords[k][0],
        time: new Date(t1 + frac * gapMs).toISOString(),
        speed: calcSpeed,
        isSnapped: true,
        isOffline: k === 0 ? Boolean(tripPoints[0].isOffline) : segIsOffline
      });
      lastEmitted = k;
    }
  }

  return snappedPolyline.length >= 2 ? snappedPolyline : tripPoints;
}

const osrmChunkCache = new Map();

function rememberOsrmChunk(cacheKey, value) {
  if (osrmChunkCache.size >= 150) {
    const oldestKey = osrmChunkCache.keys().next().value;
    if (oldestKey !== undefined) osrmChunkCache.delete(oldestKey);
  }
  osrmChunkCache.set(cacheKey, value);
}

async function fetchOsrmMatchChunk(chunk, { wideFallback = false, rejectUnsupportedDetours = false } = {}) {
  if (!Array.isArray(chunk) || chunk.length < 2) return null;

  const minRad = wideFallback ? 28 : 15;
  const maxRad = wideFallback ? 45 : 35;
  const defRad = wideFallback ? '35' : '24';

  const coordStr = chunk.map(p => `${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)}`).join(';');
  const radiusStr = chunk
    .map(p => {
      const acc = p.accuracy_meters != null ? Number(p.accuracy_meters) : NaN;
      if (isNaN(acc) || acc <= 0) return defRad;
      return String(Math.min(Math.max(Math.round(acc + 4), minRad), maxRad));
    })
    .join(';');

  const cacheKey = `${rejectUnsupportedDetours ? 'guarded-v2:' : ''}${wideFallback ? 'W' : 'T'}:${coordStr}|${radiusStr}`;
  if (osrmChunkCache.has(cacheKey)) {
    return osrmChunkCache.get(cacheKey);
  }

  const matchUrl = `https://router.project-osrm.org/match/v1/driving/${coordStr}?overview=full&geometries=geojson&gaps=ignore&tidy=false&radiuses=${radiusStr}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(matchUrl, { headers: { Accept: 'application/json' }, signal: controller.signal });
    clearTimeout(timeoutId);
    const json = await res.json().catch(() => null);

    // Public OSRM /match caps tracepoints (currently 10): automatically bisect if TooBig ever triggers
    if (json?.code === 'TooBig' && chunk.length > 3) {
      const mid = Math.ceil(chunk.length / 2);
      const left = await fetchOsrmMatchChunk(chunk.slice(0, mid), { wideFallback, rejectUnsupportedDetours });
      const right = await fetchOsrmMatchChunk(chunk.slice(mid - 1), { wideFallback, rejectUnsupportedDetours });
      if (!left || !right) return null;
      return {
        coords: left.coords.concat(right.coords.slice(1)),
        distance: left.distance + right.distance
      };
    }

    // Retry once with wider snap radius only if tight colony-precision matching reports NoMatch/NoSegment
    if (!wideFallback && (json?.code === 'NoMatch' || json?.code === 'NoSegment')) {
      return fetchOsrmMatchChunk(chunk, { wideFallback: true, rejectUnsupportedDetours });
    }

    if (!res.ok || json?.code !== 'Ok' || !Array.isArray(json.matchings) || json.matchings.length === 0) {
      return null;
    }

    let coords = [];
    let distance = 0;
    for (const matching of json.matchings) {
      const road = matching.geometry?.coordinates;
      if (!road || road.length < 2) continue;
      distance += Number(matching.distance || 0);
      coords = coords.length === 0 ? road : coords.concat(road.slice(1));
    }
    if (coords.length >= 2) {
      if (rejectUnsupportedDetours) {
        const recordedDistance = chunk.slice(1).reduce((sum, point, index) =>
          sum + haversineMeters(chunk[index].lat, chunk[index].lng, point.lat, point.lng), 0);
        const lowConfidence = json.matchings.some(matching =>
          matching.confidence != null && Number(matching.confidence) < 0.1);
        // A short divided-road chunk can contain an invented out-and-back while the
        // whole-trip distance still passes the legacy sanity limit. Prefer the GPS
        // trace when the added road travel has no reliable matching evidence.
        if ((lowConfidence && distance > recordedDistance * 1.25 + 60) ||
            distance > recordedDistance * 1.65 + 100) return null;
      }
      const result = { coords, distance };
      rememberOsrmChunk(cacheKey, result);
      return result;
    }
    return null;
  } catch (_) {
    clearTimeout(timeoutId);
    return null;
  }
}

async function snapContinuousTripToRoad(tripPoints, { rejectUnsupportedDetours = false } = {}) {
  // Collapse exact 0m entry/exit stationary points before OSRM matching, then restore entry timestamp
  const prefixPoints = [];
  let movingStartIdx = 0;
  while (
    movingStartIdx + 1 < tripPoints.length &&
    haversineMeters(
      tripPoints[movingStartIdx].lat,
      tripPoints[movingStartIdx].lng,
      tripPoints[movingStartIdx + 1].lat,
      tripPoints[movingStartIdx + 1].lng
    ) < 5
  ) {
    prefixPoints.push({ ...tripPoints[movingStartIdx], isSnapped: false });
    movingStartIdx++;
  }

  let movingPts = tripPoints.slice(movingStartIdx);
  if (movingPts.length < 2) {
    return { points: tripPoints.map(p => ({ ...p, isSnapped: false })), distanceMeters: 0, snapped: false };
  }

  let rawDist = 0;
  for (let i = 1; i < movingPts.length; i++) {
    rawDist += haversineMeters(movingPts[i - 1].lat, movingPts[i - 1].lng, movingPts[i].lat, movingPts[i].lng);
  }

  if (rawDist < 30) {
    return { points: tripPoints.map(p => ({ ...p, isSnapped: false })), distanceMeters: 0, snapped: false };
  }

  // Preserve final dwell timestamps without pulling the arrival anchor out of OSRM trace
  // (keeps street-corner road geometry intact instead of drawing a diagonal shortcut across buildings).
  const trailingDwells = [];
  const endAnchor = movingPts[movingPts.length - 1];
  const endIsStationaryArrival =
    Number(endAnchor?.speed || 0) <= 5 &&
    (endAnchor?.accuracy_meters == null || Number(endAnchor.accuracy_meters) <= 35);
  if (endIsStationaryArrival) {
    while (
      movingPts.length > 3 &&
      Number(movingPts[movingPts.length - 2]?.speed || 0) <= 5 &&
      haversineMeters(
        movingPts[movingPts.length - 2].lat,
        movingPts[movingPts.length - 2].lng,
        movingPts[movingPts.length - 1].lat,
        movingPts[movingPts.length - 1].lng
      ) <= 15
    ) {
      const last = movingPts.pop();
      trailingDwells.unshift({ ...last, isSnapped: false });
    }
  }

  // Deduplicate adjacent <6m stops before chunking so OSRM's 10-point trace slots focus on moving geometry
  const condensedForMatch = [movingPts[0]];
  for (let i = 1; i < movingPts.length; i++) {
    const prev = condensedForMatch[condensedForMatch.length - 1];
    const isLast = i === movingPts.length - 1;
    if (isLast || haversineMeters(prev.lat, prev.lng, movingPts[i].lat, movingPts[i].lng) >= 6) {
      condensedForMatch.push(movingPts[i]);
    }
  }

  const chunkSize = 10;
  const chunks = [];
  if (condensedForMatch.length <= chunkSize) {
    chunks.push(condensedForMatch);
  } else {
    for (let i = 0; i < condensedForMatch.length - 1; i += chunkSize - 1) {
      chunks.push(condensedForMatch.slice(i, i + chunkSize));
      if (i + chunkSize >= condensedForMatch.length) break;
    }
  }

  let stitchedCoords = [];
  let totalSnappedDist = 0;
  const validChunks = chunks.filter(c => c.length >= 2);
  const chunkResults = new Array(validChunks.length);
  const CONCURRENCY = 4;
  for (let b = 0; b < validChunks.length; b += CONCURRENCY) {
    const batch = validChunks.slice(b, b + CONCURRENCY);
    const resolved = await Promise.all(batch.map(ch => fetchOsrmMatchChunk(ch, { rejectUnsupportedDetours })));
    for (let k = 0; k < resolved.length; k++) {
      chunkResults[b + k] = resolved[k];
    }
  }

  if (rejectUnsupportedDetours && chunkResults.some(result => !result)) {
    // Retain verified road geometry in the other chunks. A bad match must not
    // turn the whole trip into straight GPS chords through buildings.
    const indices = new Map(movingPts.map((point, index) => [point, index]));
    const points = [];
    let distanceMeters = 0;
    let snapped = false;
    for (let i = 0; i < validChunks.length; i++) {
      const chunk = validChunks[i];
      const source = movingPts.slice(indices.get(chunk[0]), indices.get(chunk[chunk.length - 1]) + 1);
      const matched = chunkResults[i];
      const segment = matched
        ? alignSnappedSegmentToWaypoints(matched.coords, source)
        : source.map(point => ({ ...point, isSnapped: false }));
      points.push(...segment.slice(i === 0 ? 0 : 1));
      distanceMeters += matched ? matched.distance : source.slice(1).reduce((sum, point, index) =>
        sum + haversineMeters(source[index].lat, source[index].lng, point.lat, point.lng), 0);
      snapped ||= Boolean(matched);
    }
    const arrival = points[points.length - 1];
    const dwells = trailingDwells.map(point => ({ ...point, lat: arrival.lat, lng: arrival.lng, isSnapped: Boolean(arrival.isSnapped), speed: 0 }));
    return { points: [...prefixPoints, ...points, ...dwells], distanceMeters, snapped };
  }

  for (const matched of chunkResults) {
    if (!matched) {
      // Do NOT fall back to OSRM /route (prevents fabricating turn-by-turn detours the user never drove)
      return {
        points: tripPoints.map(p => ({ ...p, isSnapped: false })),
        distanceMeters: rawDist,
        snapped: false
      };
    }
    totalSnappedDist += matched.distance;
    stitchedCoords = stitchedCoords.length === 0 ? matched.coords : stitchedCoords.concat(matched.coords.slice(1));
  }

  // Sanity guard against OSRM carriageway-flip U-turn loops
  const maxAllowedSnappedDist = Math.max(rawDist * 2.2 + 250, rawDist + 600);
  if (stitchedCoords.length < 2 || totalSnappedDist <= 0 || totalSnappedDist > maxAllowedSnappedDist) {
    return {
      points: tripPoints.map(p => ({ ...p, isSnapped: false })),
      distanceMeters: rawDist,
      snapped: false
    };
  }

  const aligned = alignSnappedSegmentToWaypoints(stitchedCoords, movingPts);
  const snappedEnd = aligned[aligned.length - 1];
  const snappedTrailingDwells =
    snappedEnd && trailingDwells.length > 0
      ? trailingDwells.map(sp => ({
          ...sp,
          lat: snappedEnd.lat,
          lng: snappedEnd.lng,
          isSnapped: Boolean(snappedEnd.isSnapped),
          speed: 0
        }))
      : trailingDwells;

  return {
    points: [...prefixPoints, ...aligned, ...snappedTrailingDwells],
    distanceMeters: totalSnappedDist,
    snapped: true
  };
}

/**
 * Full pipeline:
 * - Filters noise, cold-start tower jumps, teleport spikes, and stationary jitter
 * - Splits trips at true blind offline gaps (>5m or >1km without intermediate breadcrumbs)
 * - Snaps ONLY continuous tracked road trips via OSRM /match with detour sanity guard
 * - Connects blind offline gaps directly (no fabricated turn-by-turn road guessing)
 */
export async function snapRouteSegmentsToRoad(waypoints, { rejectUnsupportedDetours = false } = {}) {
  const cleaned = filterRouteNoiseAndCoarseJumps(waypoints, { rejectUnsupportedDetours });
  if (cleaned.length < 2) {
    return {
      polyline: cleaned,
      totalDistanceMeters: 0,
      trackedRoadMeters: 0,
      offlineGapMeters: 0,
      snapped: false,
      hasSnappedRoad: false,
      routeCleaned: true
    };
  }

  // Partition into continuous tracked segments separated by blind offline jumps
  const trips = [];
  let curTrip = [cleaned[0]];

  for (let i = 1; i < cleaned.length; i++) {
    const prev = cleaned[i - 1];
    const cur = cleaned[i];
    const stepDist = haversineMeters(prev.lat, prev.lng, cur.lat, cur.lng);
    const stepSec =
      prev.time && cur.time
        ? Math.max(0, (new Date(cur.time).getTime() - new Date(prev.time).getTime()) / 1000)
        : 60;

    // A >5m time gap with movement >=30m OR >1km single-hop jump has no recorded intermediate road
    const isBlindGap = stepDist > 1000 || (stepDist >= 30 && stepSec > 300);

    if (isBlindGap) {
      trips.push(curTrip);
      curTrip = [{ ...cur, isOffline: true }];
    } else {
      curTrip.push(cur);
    }
  }
  if (curTrip.length > 0) trips.push(curTrip);

  const finalPolyline = [];
  let trackedRoadMeters = 0;
  let offlineGapMeters = 0;
  let hasSnappedRoad = false;

  const snappedTrips = new Array(trips.length);
  const TRIP_CONCURRENCY = 4;
  for (let b = 0; b < trips.length; b += TRIP_CONCURRENCY) {
    const batch = trips.slice(b, b + TRIP_CONCURRENCY);
    const resolved = await Promise.all(batch.map(tr => snapContinuousTripToRoad(tr, { rejectUnsupportedDetours })));
    for (let k = 0; k < resolved.length; k++) {
      snappedTrips[b + k] = resolved[k];
    }
  }

  for (let t = 0; t < snappedTrips.length; t++) {
    const snappedSeg = snappedTrips[t];
    const tripPts = snappedSeg?.points || [];
    if (t > 0 && finalPolyline.length > 0 && tripPts.length > 0) {
      const prevEnd = finalPolyline[finalPolyline.length - 1];
      const nextStart = tripPts[0];
      offlineGapMeters += haversineMeters(prevEnd.lat, prevEnd.lng, nextStart.lat, nextStart.lng);
    }

    trackedRoadMeters += snappedSeg.distanceMeters;
    if (snappedSeg.snapped) hasSnappedRoad = true;

    for (const pt of tripPts) {
      finalPolyline.push(pt);
    }
  }

  return {
    polyline: finalPolyline,
    totalDistanceMeters: trackedRoadMeters + offlineGapMeters,
    trackedRoadMeters,
    offlineGapMeters,
    snapped: hasSnappedRoad,
    hasSnappedRoad,
    routeCleaned: true
  };
}
