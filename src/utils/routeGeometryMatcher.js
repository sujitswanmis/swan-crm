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
 * Cleans raw GPS points:
 * 1. Validates and chronologically sorts waypoints
 * 2. Drops coarse >300m fixes and cold-start >80m jumps adjacent (+/-45s) to sharp <=50m locks
 * 3. Rejects teleport spikes (>130 km/h over >250m within 5m)
 * 4. Collapses stationary drift (<32m) to sharpest anchor while keeping entry & departure timestamps
 */
export function filterRouteNoiseAndCoarseJumps(waypoints) {
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

  // 4. Drop cold-start >80m coarse cell-tower jumps when a crisp <=50m GPS lock exists within +/-45s
  const withoutColdJumps = valid.filter((p, idx) => {
    if (p.accuracy_meters != null && p.accuracy_meters > 80 && p.time) {
      const tP = new Date(p.time).getTime();
      const hasCrispNearby = valid.some((q, j) => {
        if (j === idx || q.accuracy_meters == null || q.accuracy_meters > 50 || !q.time) return false;
        return Math.abs(new Date(q.time).getTime() - tP) <= 45000;
      });
      if (hasCrispNearby) return false;
    }
    return true;
  });
  if (withoutColdJumps.length >= 1) valid = withoutColdJumps;

  // 5. Filter impossible teleportation spikes (>130 km/h over >250m within 5 mins)
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
    if (dist > 250 && spdKmh > 130 && dtSec < 300) continue;
    spikeFree.push(cur);
  }

  // 6. Collapse stationary drift within 32m of cluster anchor
  const collapsed = [];
  let cluster = [spikeFree[0]];
  let anchor = spikeFree[0];

  for (let i = 1; i < spikeFree.length; i++) {
    const cur = spikeFree[i];
    const distFromAnchor = haversineMeters(anchor.lat, anchor.lng, cur.lat, cur.lng);
    const curSpeed = Number(cur.speed || 0);
    const staysStationary = distFromAnchor <= 32 && (curSpeed <= 5 || distFromAnchor <= 25);

    if (staysStationary) {
      cluster.push(cur);
      const curAcc = getAccuracyValue(cur);
      const anchorAcc = getAccuracyValue(anchor);
      if (curAcc != null && (anchorAcc == null || curAcc < anchorAcc)) {
        anchor = cur;
      }
    } else {
      emitCollapsedCluster(cluster, collapsed);
      cluster = [cur];
      anchor = cur;
    }
  }
  emitCollapsedCluster(cluster, collapsed);

  return collapsed.map(({ _origIdx, ...rest }) => rest);
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

async function fetchOsrmMatchChunk(chunk) {
  const coordStr = chunk.map(p => `${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)}`).join(';');
  const radiusStr = chunk
    .map(p => {
      const acc = p.accuracy_meters != null ? Number(p.accuracy_meters) : NaN;
      if (isNaN(acc) || acc <= 0) return '35';
      return String(Math.min(Math.max(Math.round(acc), 25), 40));
    })
    .join(';');

  const matchUrl = `https://router.project-osrm.org/match/v1/driving/${coordStr}?overview=full&geometries=geojson&gaps=ignore&tidy=false&radiuses=${radiusStr}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(matchUrl, { headers: { Accept: 'application/json' }, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.code !== 'Ok' || !Array.isArray(json.matchings) || json.matchings.length === 0) return null;

    let coords = [];
    let distance = 0;
    for (const matching of json.matchings) {
      const road = matching.geometry?.coordinates;
      if (!road || road.length < 2) continue;
      distance += Number(matching.distance || 0);
      coords = coords.length === 0 ? road : coords.concat(road.slice(1));
    }
    return coords.length >= 2 ? { coords, distance } : null;
  } catch (_) {
    clearTimeout(timeoutId);
    return null;
  }
}

async function snapContinuousTripToRoad(tripPoints) {
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

  const movingPts = tripPoints.slice(movingStartIdx);
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

  const chunkSize = 90;
  const chunks = [];
  if (movingPts.length <= chunkSize) {
    chunks.push(movingPts);
  } else {
    for (let i = 0; i < movingPts.length - 1; i += chunkSize - 1) {
      chunks.push(movingPts.slice(i, i + chunkSize));
      if (i + chunkSize >= movingPts.length) break;
    }
  }

  let stitchedCoords = [];
  let totalSnappedDist = 0;
  for (const chunk of chunks) {
    if (chunk.length < 2) continue;
    const matched = await fetchOsrmMatchChunk(chunk);
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
  return {
    points: [...prefixPoints, ...aligned],
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
export async function snapRouteSegmentsToRoad(waypoints) {
  const cleaned = filterRouteNoiseAndCoarseJumps(waypoints);
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

  for (let t = 0; t < trips.length; t++) {
    const trip = trips[t];
    if (t > 0 && finalPolyline.length > 0 && trip.length > 0) {
      const prevEnd = finalPolyline[finalPolyline.length - 1];
      const nextStart = trip[0];
      offlineGapMeters += haversineMeters(prevEnd.lat, prevEnd.lng, nextStart.lat, nextStart.lng);
    }

    const snappedSeg = await snapContinuousTripToRoad(trip);
    trackedRoadMeters += snappedSeg.distanceMeters;
    if (snappedSeg.snapped) hasSnappedRoad = true;

    for (const pt of snappedSeg.points) {
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
