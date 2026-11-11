'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { signFieldTelemetryToken } from '@/utils/fieldTelemetryToken';
import { haversineMeters, snapRouteSegmentsToRoad, stripNoisyGpsOutliers } from '@/utils/routeGeometryMatcher';

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => Boolean(v && UUID_REGEX.test(String(v).trim()));

function clampBoundedInt(val, min, max, fallback = null) {
  if (val == null || val === '') return fallback;
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

/**
 * Record a batch of live GPS pings (from live tracking or offline delta sync)
 */
export async function recordLocationPingBatch(pings) {
  if (!Array.isArray(pings) || pings.length === 0) return { success: true, count: 0 };
  const supabase = getAdminClient();

  try {
    const formatted = pings
      .filter(p => {
        if (!p || !isUuid(p.user_id)) return false;
        const lat = Number(p.latitude);
        const lng = Number(p.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01)) return false;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
        // Drop desktop IP / coarse cell-tower fixes (>300m accuracy) so routes stay road-accurate
        const rawAcc = p.accuracy_meters != null ? Number(p.accuracy_meters) : (p.accuracy != null ? Number(p.accuracy) : null);
        if (rawAcc != null && Number.isFinite(rawAcc) && rawAcc > 300) return false;
        return true;
      })
      .map(p => {
        const rawHeading = p.heading != null ? Number(p.heading) : null;
        const safeHeading = (rawHeading != null && Number.isFinite(rawHeading) && rawHeading >= 0)
          ? Math.min(Math.round(rawHeading), 360)
          : null;
        return {
          user_id: String(p.user_id).trim(),
          company: p.company || 'TNT00001',
          branch_code: p.branch_code || null,
          latitude: Number(Number(p.latitude).toFixed(7)),
          longitude: Number(Number(p.longitude).toFixed(7)),
          accuracy_meters: clampBoundedInt(p.accuracy_meters ?? p.accuracy, 0, 9999, null),
          speed_kmh: clampBoundedInt(p.speed_kmh ?? p.speed, 0, 999, 0),
          heading: safeHeading,
          battery_pct: clampBoundedInt(p.battery_pct ?? p.battery_level, 0, 100, null),
          is_charging: Boolean(p.is_charging),
          is_moving: Boolean(p.is_moving),
          is_mock_gps: Boolean(p.is_mock_gps),
          is_offline_synced: Boolean(p.is_offline_synced),
          recorded_at: p.recorded_at || new Date().toISOString()
        };
      });

    if (formatted.length === 0) {
      return { success: true, count: 0, skippedLowAccuracy: pings.length };
    }

    const { error } = await supabase
      .from('employee_live_locations')
      .insert(formatted);

    if (error) {
      console.error('Error inserting location pings batch:', error);
      return { success: false, error: error.message };
    }

    return { success: true, count: formatted.length };
  } catch (err) {
    console.error('Exception in recordLocationPingBatch:', err);
    return { success: false, error: err.message };
  }
}

// In-memory cache & in-flight deduplication for reverse geocoding
const locationNameCache = new Map();
const inFlightLocationLookups = new Map();

/**
 * Resolves coordinates to human-readable address / landmark name (OpenStreetMap Nominatim with caching)
 */
export async function resolveLocationName(lat, lng) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (numLat === 0 && numLng === 0) return null;

  const key = `${numLat.toFixed(4)},${numLng.toFixed(4)}`;
  if (locationNameCache.has(key)) return locationNameCache.get(key);
  if (inFlightLocationLookups.has(key)) return inFlightLocationLookups.get(key);

  const lookupPromise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2200);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${numLat.toFixed(6)}&lon=${numLng.toFixed(6)}&zoom=16&addressdetails=1`,
        {
          headers: { 'User-Agent': 'SPC-CRM-LiveTracking/2.5' },
          signal: controller.signal
        }
      );
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        const a = json.address || {};
        const primary = a.road || a.neighbourhood || a.industrial || a.commercial || a.suburb;
        const secondary = [a.village, a.town || a.city || a.state_district].find(
          (v) => v && v !== primary
        );
        const parts = [primary, secondary].filter(Boolean);

        let name = parts.slice(0, 2).join(', ');
        if (!name && json.display_name) {
          name = json.display_name.split(',').slice(0, 3).join(', ').trim();
        }
        const finalName = name || `Location (${numLat.toFixed(4)}, ${numLng.toFixed(4)})`;
        if (locationNameCache.size >= 500) {
          const oldest = locationNameCache.keys().next().value;
          if (oldest !== undefined) locationNameCache.delete(oldest);
        }
        locationNameCache.set(key, finalName);
        return finalName;
      }
    } catch (_) {}

    // Return fallback coordinate string without permanently poisoning cache on transient Nominatim throttling
    return `Location (${numLat.toFixed(4)}, ${numLng.toFixed(4)})`;
  })();

  inFlightLocationLookups.set(key, lookupPromise);
  try {
    return await lookupPromise;
  } finally {
    inFlightLocationLookups.delete(key);
  }
}

function pushStoppageIfValid(currentStoppage, timeline) {
  if (!currentStoppage) return;
  const stoppageDurationMins = Math.round(
    (new Date(currentStoppage.endTime) - new Date(currentStoppage.startTime)) / 60000
  );
  // Require continuous stationary heartbeats (count >= 2) or <=30m gap so isolated 2.5h silence jumps never fake stoppages
  if (stoppageDurationMins >= 5 && (currentStoppage.count >= 2 || currentStoppage.maxGapSec <= 1800)) {
    timeline.push({
      type: 'stoppage',
      durationMins: stoppageDurationMins,
      startTime: currentStoppage.startTime,
      endTime: currentStoppage.endTime,
      lat: currentStoppage.lat,
      lng: currentStoppage.lng,
      locationName: null
    });
  }
}

/**
 * Single Employee 360° Route & Playback Data (Aapke Screenshot 1 Jaisa)
 * Fetches all breadcrumbs, detects stoppages, and matches client visits
 */
export async function getEmployee360Route(userId, dateStr) {
  if (!isUuid(userId) || !dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr).trim())) return null;
  userId = String(userId).trim();
  dateStr = String(dateStr).trim();
  const supabase = getAdminClient();

  try {
    const startOfDay = `${dateStr}T00:00:00.000+05:30`;
    const endOfDay = `${dateStr}T23:59:59.999+05:30`;

    // 1-3b. Fetch GPS breadcrumbs, visits, attendance & mobile session concurrently
    const [
      { data: rawPings, error: pingsErr },
      { data: visits },
      { data: attData },
      { data: userSess }
    ] = await Promise.all([
      supabase
        .from('employee_live_locations')
        .select('latitude, longitude, accuracy_meters, speed_kmh, battery_pct, is_charging, is_moving, is_offline_synced, recorded_at')
        .eq('user_id', userId)
        .gte('recorded_at', startOfDay)
        .lte('recorded_at', endOfDay)
        .order('recorded_at', { ascending: true }),
      supabase
        .from('field_form_submissions')
        .select('*')
        .eq('field_user_id', userId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: true }),
      supabase
        .from('attendance_records')
        .select('id, user_id, email, in_time, out_time, in_location, out_location, in_method, shift_name, status')
        .eq('attendance_date', dateStr)
        .or(`user_id.eq.${userId},id.eq.${userId}`)
        .maybeSingle(),
      supabase
        .from('user_sessions')
        .select('device, last_active, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('last_active', { ascending: false })
        .limit(5)
    ]);

    if (pingsErr) {
      console.error('Error fetching employee 360 route pings:', pingsErr);
      return null;
    }

    const pings = rawPings || [];
    let attRecord = attData || null;

    if (!attRecord) {
      // Resolve user's email if userId is from user_roles
      const { data: uRole } = await supabase
        .from('user_roles')
        .select('email')
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .maybeSingle();
      if (uRole?.email) {
        const { data: attByEmail } = await supabase
          .from('attendance_records')
          .select('id, user_id, email, in_time, out_time, in_location, out_location, in_method, shift_name, status')
          .eq('attendance_date', dateStr)
          .ilike('email', uRole.email)
          .maybeSingle();
        if (attByEmail) attRecord = attByEmail;
      }
    }

    // 4. Stoppage & Route Analysis Algorithm:
    // Calculates total distance and identifies stoppages (speed < 3 km/h for > 5 mins)
    let totalMeters = 0;
    const timeline = [];
    const polyline = [];
    const geoJobs = [];
    let currentStoppage = null;

    // Parse Punch-In coordinates from attendance (geocode deferred into parallel batch)
    let punchInPoint = null;
    let punchOutPoint = null;
    if (attRecord?.in_location) {
      const matchIn = attRecord.in_location.match(/GPS\s*\(\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*\)/i);
      if (matchIn) {
        const pLat = parseFloat(matchIn[1]);
        const pLng = parseFloat(matchIn[2]);
        if (!isNaN(pLat) && !isNaN(pLng)) {
          punchInPoint = {
            lat: pLat,
            lng: pLng,
            time: attRecord.in_time,
            speed: 0,
            accuracy_meters: 25,
            isOffline: false,
            label: 'Punch In'
          };
          const punchInEntry = {
            type: 'punch_in',
            label: `Punch In (${new Date(attRecord.in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })})`,
            startTime: attRecord.in_time,
            lat: pLat,
            lng: pLng,
            locationName: attRecord.in_location,
            shiftName: attRecord.shift_name,
            status: attRecord.status
          };
          timeline.push(punchInEntry);
          geoJobs.push(
            resolveLocationName(pLat, pLng).then(name => {
              if (name) punchInEntry.locationName = name;
            })
          );
        }
      } else {
        timeline.push({
          type: 'punch_in',
          label: `Punch In (${new Date(attRecord.in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })})`,
          startTime: attRecord.in_time,
          lat: null,
          lng: null,
          locationName: attRecord.in_location,
          shiftName: attRecord.shift_name,
          status: attRecord.status
        });
      }
    }

    const attInMs = attRecord?.in_time ? new Date(attRecord.in_time).getTime() : null;
    const attOutMs = attRecord?.out_time ? new Date(attRecord.out_time).getTime() : null;

    // Clamp breadcrumbs to duty window when attendance exists so pre-shift / post-shift pings stay excluded
    const dutyPings = attRecord
      ? pings.filter((p) => {
          const t = p?.recorded_at ? new Date(p.recorded_at).getTime() : NaN;
          if (isNaN(t)) return false;
          if (attInMs != null && !isNaN(attInMs) && t < attInMs - 60000) return false;
          if (attOutMs != null && !isNaN(attOutMs) && t > attOutMs + 60000) return false;
          return true;
        })
      : pings;

    // Always include Punch Out if employee has punched out on this date
    if (attRecord?.out_time) {
      let oLat = null;
      let oLng = null;
      const outLocLabel = attRecord.out_location || 'Office Web Terminal';

      if (attRecord.out_location) {
        const matchOut = attRecord.out_location.match(/GPS\s*\(\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*\)/i);
        if (matchOut) {
          oLat = parseFloat(matchOut[1]);
          oLng = parseFloat(matchOut[2]);
        }
      }

      // If out_location was not GPS format, fallback to latest accurate duty ping or punchIn coordinates
      const usableOutPings = dutyPings.filter(p => p.accuracy_meters == null || Number(p.accuracy_meters) <= 300);
      const fallbackOutSource = usableOutPings.length > 0 ? usableOutPings : dutyPings;
      if (oLat == null || oLng == null || isNaN(oLat) || isNaN(oLng)) {
        if (fallbackOutSource.length > 0) {
          const lp = fallbackOutSource[fallbackOutSource.length - 1];
          oLat = Number(lp.latitude);
          oLng = Number(lp.longitude);
        } else if (punchInPoint) {
          oLat = punchInPoint.lat;
          oLng = punchInPoint.lng;
        }
      }

      const punchOutEntry = {
        type: 'punch_out',
        label: `Punch Out (${new Date(attRecord.out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })})`,
        startTime: attRecord.out_time,
        endTime: attRecord.out_time,
        locationName: outLocLabel,
        lat: oLat,
        lng: oLng,
        status: 'SHIFT_COMPLETED'
      };
      timeline.push(punchOutEntry);

      if (oLat != null && oLng != null && !isNaN(oLat) && !isNaN(oLng)) {
        geoJobs.push(
          resolveLocationName(oLat, oLng).then(resolved => {
            if (resolved) {
              punchOutEntry.locationName = /^GPS\s*\(/i.test(outLocLabel)
                ? `${resolved} (${oLat.toFixed(4)}, ${oLng.toFixed(4)})`
                : `${outLocLabel} (${resolved})`;
            }
          })
        );
        punchOutPoint = {
          lat: oLat,
          lng: oLng,
          time: attRecord.out_time,
          speed: 0,
          accuracy_meters: 25,
          isOffline: false,
          label: 'Punch Out'
        };
      }
    }

    // Filter out low-accuracy (>300m desktop/IP/cell) pings when accurate GPS/attendance points exist
    const accuratePings = dutyPings.filter(p => {
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      if (isNaN(lat) || isNaN(lng) || (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01)) return false;
      const acc = p.accuracy_meters != null ? Number(p.accuracy_meters) : null;
      return acc == null || isNaN(acc) || acc <= 300;
    });
    const routePings = (accuratePings.length > 0 || punchInPoint || (visits || []).length > 0)
      ? accuratePings
      : dutyPings;

    const cleanedRawPings = stripNoisyGpsOutliers(
      routePings.map(p => ({
        lat: Number(p.latitude),
        lng: Number(p.longitude),
        time: p.recorded_at,
        speed: p.speed_kmh != null ? Number(p.speed_kmh) : 0,
        accuracy_meters: p.accuracy_meters != null ? Number(p.accuracy_meters) : null,
        isOffline: Boolean(p.is_offline_synced)
      }))
    );

    let lastValidPing = null;
    for (let i = 0; i < cleanedRawPings.length; i++) {
      const p = cleanedRawPings[i];
      let isOffline = Boolean(p.isOffline);

      if (lastValidPing) {
        const dist = haversineMeters(lastValidPing.lat, lastValidPing.lng, p.lat, p.lng);
        const timeDiffSec = (new Date(p.time) - new Date(lastValidPing.time)) / 1000;
        const speedKmh = timeDiffSec > 0 ? (dist / timeDiffSec) * 3.6 : (dist > 50 ? 999 : 0);

        // Gap > 8 minutes indicates phone was offline, app closed, or GPS signal was lost
        if (timeDiffSec > 480 || p.isOffline) {
          isOffline = true;
        }

        if (speedKmh <= 130) {
          totalMeters += dist;
        }

        // Stoppage Detection on noise-free pings: minimal distance (< 28m) and stationary speed (< 3 km/h)
        if (dist < 28 && (p.speed || 0) < 3) {
          if (!currentStoppage) {
            currentStoppage = {
              type: 'stoppage',
              startTime: lastValidPing.time,
              endTime: p.time,
              lat: p.lat,
              lng: p.lng,
              count: 1,
              maxGapSec: timeDiffSec
            };
          } else {
            currentStoppage.endTime = p.time;
            currentStoppage.count++;
            if (timeDiffSec > currentStoppage.maxGapSec) {
              currentStoppage.maxGapSec = timeDiffSec;
            }
          }
        } else {
          pushStoppageIfValid(currentStoppage, timeline);
          currentStoppage = null;
        }
      }

      lastValidPing = p;
      polyline.push({
        lat: Number(p.lat),
        lng: Number(p.lng),
        time: p.time,
        speed: p.speed,
        accuracy_meters: p.accuracy_meters != null ? Number(p.accuracy_meters) : null,
        isOffline
      });
    }

    // Flush last stoppage if exists
    pushStoppageIfValid(currentStoppage, timeline);

    // Merge completed visits into timeline
    (visits || []).forEach(v => {
      timeline.push({
        type: 'visit',
        visitId: v.id,
        partyName: v.party_name,
        connectivityMode: v.connectivity_mode,
        durationMins: v.duration_minutes || 0,
        outcomeStatus: v.outcome_status,
        orderValue: v.order_value,
        paymentCollected: v.payment_collected,
        lat: Number(v.check_in_lat || v.check_out_lat),
        lng: Number(v.check_in_lng || v.check_out_lng),
        checkInTime: v.check_in_time,
        checkOutTime: v.check_out_time,
        isGeofenceFlagged: v.is_geofence_flagged,
        photos: v.photo_watermark_urls
      });
    });

    // If no breadcrumbs were recorded in employee_live_locations, build polyline from visit waypoints
    if (polyline.length === 0 && (visits || []).length > 0) {
      (visits || []).forEach((v, idx) => {
        const vLat = Number(v.check_in_lat || v.check_out_lat);
        const vLng = Number(v.check_in_lng || v.check_out_lng);
        if (vLat && vLng) {
          polyline.push({
            lat: vLat,
            lng: vLng,
            time: v.check_in_time || v.created_at,
            speed: 25,
            partyName: v.party_name
          });
          if (idx > 0) {
            const prev = polyline[idx - 1];
            totalMeters += haversineMeters(prev.lat, prev.lng, vLat, vLng);
          }
        }
      });
    }

    // Include Punch In & Punch Out points in polyline
    if (punchInPoint) {
      if (polyline.length === 0) {
        polyline.push(punchInPoint);
      } else {
        const first = polyline[0];
        const distToFirst = haversineMeters(punchInPoint.lat, punchInPoint.lng, first.lat, first.lng);
        if (distToFirst > 25) {
          polyline.unshift(punchInPoint);
          totalMeters += distToFirst;
        }
      }
    }

    if (punchOutPoint) {
      if (polyline.length === 0) {
        polyline.push(punchOutPoint);
      } else {
        const last = polyline[polyline.length - 1];
        const distToLast = haversineMeters(last.lat, last.lng, punchOutPoint.lat, punchOutPoint.lng);
        if (distToLast > 25) {
          polyline.push(punchOutPoint);
          totalMeters += distToLast;
        }
      }
    }

    // Clamp initial stoppage boundary to Punch-In time and sort shift events deterministically
    if (attInMs != null && !isNaN(attInMs)) {
      for (const item of timeline) {
        if (item.type === 'stoppage' && item.startTime && new Date(item.startTime).getTime() < attInMs) {
          item.startTime = attRecord.in_time;
          item.durationMins = Math.max(
            1,
            Math.round((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 60000)
          );
        }
      }
    }

    const getTimelineRank = (type) => (type === 'punch_in' ? 0 : type === 'punch_out' ? 2 : 1);
    timeline.sort((a, b) => {
      const rankDiff = getTimelineRank(a.type) - getTimelineRank(b.type);
      if (rankDiff !== 0) return rankDiff;
      return new Date(a.startTime || a.checkInTime) - new Date(b.startTime || b.checkInTime);
    });

    // Coalesce consecutive same-spot stoppages separated only by brief (<10m) micro-jitter / glitch
    const mergedTimeline = [];
    for (const item of timeline) {
      const prev = mergedTimeline[mergedTimeline.length - 1];
      if (
        prev &&
        prev.type === 'stoppage' &&
        item.type === 'stoppage' &&
        haversineMeters(prev.lat, prev.lng, item.lat, item.lng) <= 65 &&
        new Date(item.startTime).getTime() - new Date(prev.endTime).getTime() <= 10 * 60 * 1000
      ) {
        prev.endTime = item.endTime;
        prev.durationMins = Math.max(
          1,
          Math.round((new Date(prev.endTime).getTime() - new Date(prev.startTime).getTime()) / 60000)
        );
        if (/^Location\s*\(/i.test(prev.locationName || '') && item.locationName && !/^Location\s*\(/i.test(item.locationName)) {
          prev.locationName = item.locationName;
        }
      } else {
        mergedTimeline.push(item);
      }
    }
    timeline.length = 0;
    timeline.push(...mergedTimeline);

    // Enqueue reverse geocoding for merged stoppages (deduplicated & executed alongside OSRM)
    for (const item of timeline) {
      if (item.type === 'stoppage' && !item.locationName) {
        geoJobs.push(
          resolveLocationName(item.lat, item.lng).then(name => {
            if (name) item.locationName = name;
          })
        );
      }
    }

    if (polyline.length >= 2) {
      polyline.sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));
    }

    // Run OSRM road snapping and Nominatim reverse geocoding in parallel
    let finalPolyline = polyline;
    let isRoadSnapped = false;
    let routeCleaned = false;
    let trackedRoadMeters = 0;
    let offlineGapMeters = 0;
    const snapPromise =
      polyline.length >= 2
        ? snapRouteSegmentsToRoad(polyline).catch(snapErr => {
            console.warn('Road snapping step skipped:', snapErr?.message);
            return null;
          })
        : Promise.resolve(null);

    const [roadResult] = await Promise.all([snapPromise, ...geoJobs]);
    if (roadResult) {
      finalPolyline = roadResult.polyline;
      totalMeters = roadResult.totalDistanceMeters;
      trackedRoadMeters = roadResult.trackedRoadMeters || 0;
      offlineGapMeters = roadResult.offlineGapMeters || 0;
      isRoadSnapped = Boolean(roadResult.hasSnappedRoad);
      routeCleaned = Boolean(roadResult.routeCleaned);
    }

    const totalKm = (totalMeters / 1000).toFixed(2);
    const trackedRoadKm = Number((trackedRoadMeters / 1000).toFixed(2));
    const offlineGapKm = Number((offlineGapMeters / 1000).toFixed(2));
    const lastPing = accuratePings.length > 0
      ? accuratePings[accuratePings.length - 1]
      : (dutyPings.length > 0 ? dutyPings[dutyPings.length - 1] : (polyline.length > 0 ? polyline[polyline.length - 1] : null));

    // Preserve latest non-null battery reading within shift (fallback to day pings if shift pings lack battery)
    let latestBattery = null;
    const batterySources = [dutyPings, pings];
    for (const src of batterySources) {
      if (latestBattery) break;
      for (let i = src.length - 1; i >= 0; i--) {
        if (src[i]?.battery_pct != null) {
          latestBattery = {
            pct: Number(src[i].battery_pct),
            isCharging: Boolean(src[i].is_charging),
            recordedAt: src[i].recorded_at
          };
          break;
        }
      }
    }

    // Read active mobile/Android app session heartbeat from initial parallel query
    let mobileSessionLastActive = null;
    try {
      const mobSess = (userSess || []).find(s =>
        /Android|iPhone|iPad|iPod|Mobile|SPC Workspace APK|Capacitor/i.test(s.device || '')
      );
      if (mobSess?.last_active) {
        mobileSessionLastActive = mobSess.last_active;
      }
    } catch (_) {}

    return {
      userId,
      date: dateStr,
      totalKm: Number(totalKm),
      trackedRoadKm,
      offlineGapKm,
      totalPings: Math.max(dutyPings.length, finalPolyline.length),
      lastPing,
      latestBattery,
      mobileSessionLastActive,
      shiftCompleted: Boolean(attRecord?.out_time),
      punchInTime: attRecord?.in_time || null,
      punchOutTime: attRecord?.out_time || null,
      hadOfflineSync: Boolean(routePings.some(p => p.is_offline_synced)),
      polyline: finalPolyline,
      rawPolyline: polyline,
      isRoadSnapped,
      routeCleaned,
      timeline,
      visitsCount: (visits || []).length
    };
  } catch (err) {
    console.error('Error in getEmployee360Route:', err);
    return null;
  }
}

/**
 * All-India Radar & State Clustering Data (Aapke Screenshot 2 Jaisa)
 */
export async function getNationwideRadarData(company = 'TNT00001', branchCode = null) {
  const supabase = getAdminClient();
  try {
    // Look for active pings in the last 6 hours
    const recentThreshold = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    const isAllCompanies = !company || String(company).toLowerCase() === 'all' || String(company).toLowerCase() === 'all companies';

    let query = supabase
      .from('employee_live_locations')
      .select('user_id, latitude, longitude, accuracy_meters, speed_kmh, battery_pct, is_moving, recorded_at, branch_code, company')
      .gte('recorded_at', recentThreshold)
      .order('recorded_at', { ascending: false });

    if (!isAllCompanies) {
      query = query.eq('company', company);
    }

    if (branchCode) {
      query = query.eq('branch_code', branchCode);
    }

    const todayIST = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    const [{ data: rawPings, error }, { data: activeAttendance }] = await Promise.all([
      query,
      supabase
        .from('attendance_records')
        .select('user_id, email, in_time, out_time, in_location, emp_name, tenant_id')
        .eq('attendance_date', todayIST)
        .not('in_time', 'is', null)
        .is('out_time', null)
    ]);

    if (error) {
      console.error('Error fetching radar data:', error);
      return [];
    }

    // Keep latest accurate (<=300m or null) ping per user; fallback to any ping only if none accurate
    const userMap = new Map();
    (rawPings || []).forEach(p => {
      const existing = userMap.get(p.user_id);
      const isCurAcc = p.accuracy_meters == null || Number(p.accuracy_meters) <= 300;
      if (!existing) {
        userMap.set(p.user_id, p);
      } else {
        const isExistingAcc = existing.accuracy_meters == null || Number(existing.accuracy_meters) <= 300;
        if (!isExistingAcc && isCurAcc) {
          userMap.set(p.user_id, p);
        }
      }
    });

    (activeAttendance || []).forEach(att => {
      const uId = att.user_id;
      if (uId && !userMap.has(uId) && att.in_location) {
        const match = att.in_location.match(/GPS\s*\(\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*\)/i);
        if (match) {
          const lat = parseFloat(match[1]);
          const lng = parseFloat(match[2]);
          if (!isNaN(lat) && !isNaN(lng)) {
            userMap.set(uId, {
              user_id: uId,
              latitude: lat,
              longitude: lng,
              speed_kmh: 0,
              battery_pct: 90,
              is_moving: false,
              recorded_at: att.in_time,
              branch_code: null,
              company: att.tenant_id === '00000000-0000-0000-0000-000000000001' ? 'New Swan Group' : company,
              status: 'ON_DUTY_ACTIVE_SHIFT'
            });
          }
        }
      }
    });

    const activeEmployees = Array.from(userMap.values());

    // Fetch employee names & details from user_roles
    const userIds = activeEmployees.map(e => e.user_id).filter(isUuid);
    let userDetailsMap = new Map();
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('user_roles')
        .select('id, user_id, emp_name, email, emp_mobile, role, company, branch_name')
        .or(`id.in.(${userIds.join(',')}),user_id.in.(${userIds.join(',')})`);
      (users || []).forEach(u => {
        if (u.id) userDetailsMap.set(u.id, u);
        if (u.user_id) userDetailsMap.set(u.user_id, u);
      });
    }

    return activeEmployees.map(e => {
      const details = userDetailsMap.get(e.user_id) || {};
      return {
        ...e,
        name: details.emp_name || details.email || 'Field Person',
        phone: details.emp_mobile || '',
        role: details.role || 'Sales Executive'
      };
    });
  } catch (err) {
    console.error('Error in getNationwideRadarData:', err);
    return [];
  }
}

/**
 * Fetch daily conveyance vouchers & TA/DA claims for accounts approval
 */
export async function getDailyConveyanceVouchers(company = 'TNT00001', branchCode = null, dateStr = null) {
  const supabase = getAdminClient();
  try {
    const targetDate = dateStr || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    let query = supabase
      .from('daily_travel_summaries')
      .select('*')
      .eq('company', company)
      .eq('date', targetDate)
      .order('total_km', { ascending: false });

    if (branchCode) {
      query = query.eq('branch_code', branchCode);
    }

    const { data: summaries, error } = await query;
    if (error) {
      console.error('Error fetching travel summaries:', error);
      return [];
    }

    // Get user details (`user_roles` uses `emp_name` and `emp_mobile`)
    const userIds = [...new Set((summaries || []).map(s => s.user_id).filter(isUuid))];
    let userDetailsMap = new Map();
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('user_roles')
        .select('id, user_id, emp_name, email, emp_mobile, role, vehicle_type, conveyance_rate_per_km')
        .or(`id.in.(${userIds.join(',')}),user_id.in.(${userIds.join(',')})`);
      (users || []).forEach(u => {
        if (u.id) userDetailsMap.set(u.id, u);
        if (u.user_id) userDetailsMap.set(u.user_id, u);
      });
    }

    return (summaries || []).map(s => {
      const u = userDetailsMap.get(s.user_id) || {};
      const resolvedVehicle = s.vehicle_type || u.vehicle_type || 'BIKE';
      return {
        ...s,
        employee_name: u.emp_name || u.email || 'Field Person',
        phone: u.emp_mobile || '',
        role: u.role || 'Sales Executive',
        vehicle_type: resolvedVehicle,
        conveyance_rate_per_km: s.conveyance_rate_per_km ?? u.conveyance_rate_per_km ?? (resolvedVehicle === 'NONE' ? 0 : 4.50)
      };
    });
  } catch (err) {
    console.error('Error in getDailyConveyanceVouchers:', err);
    return [];
  }
}

/**
 * Approve or Reject Conveyance Voucher
 */
export async function updateVoucherApproval(voucherId, status, approverUserId) {
  const supabase = getAdminClient();
  try {
    const { data, error } = await supabase
      .from('daily_travel_summaries')
      .update({
        approval_status: status,
        approved_by: approverUserId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', voucherId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, voucher: data };
  } catch (err) {
    console.error('Error updating voucher approval:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Issues a signed user-scoped telemetry token for native Android background location sync.
 */
export async function issueFieldTelemetryToken({ userId, company = 'TNT00001', branchCode = null } = {}) {
  try {
    if (!isUuid(userId)) return { success: false, error: 'Missing or invalid userId' };
    userId = String(userId).trim();
    const authClient = await createServerSupabase();
    const {
      data: { user }
    } = await authClient.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    let authorized = String(user.id) === String(userId);
    if (!authorized) {
      const admin = getAdminClient();
      const { data: roleRows } = await admin
        .from('user_roles')
        .select('id, user_id, email')
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .limit(5);
      const userEmail = String(user.email || '').toLowerCase();
      authorized = (roleRows || []).some(
        (r) =>
          String(r.user_id || '') === String(user.id) ||
          (userEmail && String(r.email || '').toLowerCase() === userEmail)
      );
    }

    if (!authorized) {
      return { success: false, error: 'Forbidden' };
    }

    const token = signFieldTelemetryToken({ userId, company, branchCode });
    return { success: true, token };
  } catch (err) {
    console.error('Error issuing field telemetry token:', err);
    return { success: false, error: err?.message || 'Token error' };
  }
}

function isMissingHealthRelationError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

async function readJsonFileSafe(primaryPath, tmpPath, defaultValue) {
  const fs = await import('fs/promises');
  for (const candidate of [primaryPath, tmpPath]) {
    try {
      const content = await fs.readFile(candidate, 'utf-8');
      if (content) return JSON.parse(content);
    } catch {
      // Try next path
    }
  }
  return defaultValue;
}

async function writeJsonFileSafe(primaryPath, tmpPath, data) {
  const fs = await import('fs/promises');
  const path = await import('path');
  const serialized = JSON.stringify(data, null, 2);
  for (const candidate of [primaryPath, tmpPath]) {
    try {
      await fs.mkdir(path.dirname(candidate), { recursive: true });
      await fs.writeFile(candidate, serialized, 'utf-8');
      return true;
    } catch {
      // Fallback to /tmp if app directory is read-only
    }
  }
  return false;
}

async function resolvePolicyPaths() {
  const path = await import('path');
  const os = await import('os');
  return {
    primary: path.join(process.cwd(), 'src', 'config', 'app_release_policy.json'),
    tmp: path.join(os.tmpdir(), 'spc_app_release_policy.json')
  };
}

async function resolveHealthStorePaths() {
  const path = await import('path');
  const os = await import('os');
  return {
    primary: path.join(process.cwd(), 'src', 'config', 'device_health_store.json'),
    tmp: path.join(os.tmpdir(), 'spc_device_health_store.json')
  };
}

async function buildCompanyMatchAliases(companyInput = 'TNT00001') {
  const raw = String(companyInput || '').trim();
  if (!raw || raw.toUpperCase() === 'ALL' || raw.toLowerCase() === 'all companies') {
    return { isAll: true, tenantCode: null, companyName: 'All Companies', aliases: [] };
  }
  const { resolveKnownTenant } = await import('@/app/actions/tenantBranches');
  const info = await resolveKnownTenant(raw);
  const aliases = new Set([raw.toLowerCase()]);
  if (info?.tenantCode) {
    aliases.add(info.tenantCode.toLowerCase());
    if (info.tenantCode === 'TNT00001') {
      ['supuja', 'supuja creations', 'supuja_creations', 'supuja creation'].forEach((a) => aliases.add(a));
    } else if (info.tenantCode === 'TNT00002') {
      ['new swan', 'new swan group', 'new_swan_group', 'nstl', 'nstlp', 'nsmlr', 'swan agro', 'default'].forEach((a) => aliases.add(a));
    } else if (info.tenantCode === 'TNT00003') {
      ['testing new swan group', 'testing_new_swan_group', 'testing nsg'].forEach((a) => aliases.add(a));
    }
  }
  if (info?.companyName) aliases.add(info.companyName.toLowerCase());
  if (info?.tenantId) aliases.add(info.tenantId.toLowerCase());
  return {
    isAll: false,
    tenantCode: info?.tenantCode || raw.toUpperCase(),
    companyName: info?.companyName || raw,
    tenantId: info?.tenantId || null,
    aliases: Array.from(aliases)
  };
}

function getISTDayWindowISO(dateStr = null) {
  const dayStr = dateStr || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const start = new Date(`${dayStr}T00:00:00+05:30`);
  const end = new Date(`${dayStr}T23:59:59.999+05:30`);
  return { dayStr, startISO: start.toISOString(), endISO: end.toISOString() };
}

export async function getAppReleasePolicy() {
  const { DEFAULT_ANDROID_RELEASE_POLICY, sanitizeReleasePolicy } = await import('@/config/appReleaseConfig');
  try {
    const admin = getAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from('app_release_policies')
        .select('*')
        .eq('platform', 'android')
        .maybeSingle();
      if (!error && data) {
        return { success: true, policy: sanitizeReleasePolicy(data), source: 'database' };
      }
    }
  } catch {
    // Fallback to JSON
  }

  const paths = await resolvePolicyPaths();
  const cached = await readJsonFileSafe(paths.primary, paths.tmp, null);
  if (cached) {
    return { success: true, policy: sanitizeReleasePolicy(cached), source: 'json_fallback' };
  }
  return { success: true, policy: sanitizeReleasePolicy(DEFAULT_ANDROID_RELEASE_POLICY), source: 'default' };
}

export async function updateAppReleasePolicy(payload = {}) {
  try {
    const { createClient } = await import('@/utils/supabase/server');
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const admin = getAdminClient();
    if (!admin) {
      return { success: false, error: 'Database client unavailable' };
    }

    const { data: roleRows } = await admin
      .from('user_roles')
      .select('role, module_access')
      .eq('user_id', user.id)
      .limit(1);
    const r = roleRows?.[0];
    const roleLower = String(r?.role || '').trim().toLowerCase();
    const isAllowed =
      roleLower === 'masteradmin' ||
      roleLower === 'master_admin' ||
      roleLower === 'admin' ||
      roleLower === 'superadmin' ||
      roleLower === 'manager' ||
      roleLower === 'hod' ||
      roleLower === 'hr' ||
      r?.module_access?.is_master_admin === true ||
      r?.module_access?.field_force?.is_manager === true;

    if (!isAllowed) {
      return { success: false, error: 'Only Admin, HR, or Manager can update mobile release policy.' };
    }

    const { sanitizeReleasePolicy } = await import('@/config/appReleaseConfig');
    const nextPolicy = sanitizeReleasePolicy({
      ...payload,
      updated_by: user.email || user.id,
      updated_at: new Date().toISOString()
    });

    const paths = await resolvePolicyPaths();
    await writeJsonFileSafe(paths.primary, paths.tmp, nextPolicy);

    const { data: upserted, error } = await admin
      .from('app_release_policies')
      .upsert(nextPolicy, { onConflict: 'platform' })
      .select()
      .maybeSingle();

    if (error && !isMissingHealthRelationError(error)) {
      return { success: false, error: error.message || 'Failed to update release policy' };
    }

    return {
      success: true,
      policy: upserted ? sanitizeReleasePolicy(upserted) : nextPolicy,
      storage: error ? 'json_fallback' : 'database'
    };
  } catch (err) {
    console.error('[updateAppReleasePolicy] Error:', err);
    return { success: false, error: err?.message || 'Unexpected error' };
  }
}

export async function reportEmployeeDeviceHealth(snapshot = {}) {
  try {
    const { createClient } = await import('@/utils/supabase/server');
    const { resolveKnownTenant } = await import('@/app/actions/tenantBranches');
    const { classifyDeviceHealth } = await import('@/config/appReleaseConfig');
    const { headers } = await import('next/headers');
    const { resolvePlatformFromRequest } = await import('@/utils/platformDetection');

    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    const effectiveUserId = String(snapshot?.userId || snapshot?.user_id || user?.id || '').trim();
    if (!user || !effectiveUserId || effectiveUserId !== user.id) {
      return { success: false, error: 'Unauthorized device telemetry sender' };
    }

    let reqUa = '';
    try {
      const h = await headers();
      reqUa = h.get('user-agent') || '';
    } catch {
      // Ignore header read failures
    }

    const resolvedReqPlatform = resolvePlatformFromRequest({
      userAgent: reqUa,
      explicitPlatform: snapshot?.platform || '',
      explicitDetails: snapshot?.platform_details || snapshot?.platformDetails || ''
    });

    const resolvedByTenant = snapshot?.tenantId ? await resolveKnownTenant(snapshot.tenantId) : null;
    const resolvedByComp = await resolveKnownTenant(snapshot?.company || 'TNT00001');
    const tenantInfo = resolvedByTenant?.tenantCode ? resolvedByTenant : resolvedByComp;
    const canonicalCompany = tenantInfo?.tenantCode || String(snapshot?.company || 'TNT00001').trim();

    let branchCode = snapshot?.branchCode || snapshot?.branch_code || null;
    const admin = getAdminClient();
    if (!branchCode && admin) {
      try {
        const { data: roleRow } = await admin
          .from('user_roles')
          .select('tenant_id, company, branch_name, work_location_name, module_access')
          .eq('user_id', effectiveUserId)
          .limit(1)
          .maybeSingle();
        branchCode = roleRow?.module_access?.branch_code || roleRow?.branch_name || roleRow?.work_location_name || null;
      } catch {
        // Non-blocking lookup
      }
    }

    const policyRes = await getAppReleasePolicy();
    const policy = policyRes.policy;
    const nowIso = new Date().toISOString();

    const rawTenantCandidate = tenantInfo?.tenantId || snapshot?.tenantId || null;
    const rawRecord = {
      user_id: effectiveUserId,
      tenant_id: isUuid(rawTenantCandidate) ? String(rawTenantCandidate).trim() : null,
      tenant_code: tenantInfo?.tenantCode || canonicalCompany,
      branch_code: branchCode || null,
      company: canonicalCompany,
      platform: snapshot?.platform || resolvedReqPlatform?.platform || 'Web App',
      platform_details: snapshot?.platform_details || snapshot?.platformDetails || resolvedReqPlatform?.details || '',
      app_version_code:
        snapshot?.appVersionCode != null && Number.isFinite(Number(snapshot.appVersionCode))
          ? Number(snapshot.appVersionCode)
          : snapshot?.app_version_code != null && Number.isFinite(Number(snapshot.app_version_code))
            ? Number(snapshot.app_version_code)
            : null,
      app_version_name: snapshot?.appVersionName || snapshot?.app_version_name || null,
      os_version: snapshot?.osVersion || snapshot?.os_version || null,
      sdk_int:
        snapshot?.sdkInt != null && Number.isFinite(Number(snapshot.sdkInt))
          ? Number(snapshot.sdkInt)
          : null,
      device_manufacturer: snapshot?.deviceManufacturer || snapshot?.device_manufacturer || null,
      device_model: snapshot?.deviceModel || snapshot?.device_model || null,
      has_foreground_location:
        snapshot?.hasForegroundLocation !== undefined
          ? Boolean(snapshot.hasForegroundLocation)
          : snapshot?.has_foreground_location !== undefined
            ? Boolean(snapshot.has_foreground_location)
            : null,
      has_background_location:
        snapshot?.hasBackgroundLocation !== undefined
          ? Boolean(snapshot.hasBackgroundLocation)
          : snapshot?.has_background_location !== undefined
            ? Boolean(snapshot.has_background_location)
            : null,
      battery_unrestricted:
        snapshot?.batteryUnrestricted !== undefined
          ? Boolean(snapshot.batteryUnrestricted)
          : snapshot?.battery_unrestricted !== undefined
            ? Boolean(snapshot.battery_unrestricted)
            : null,
      notifications_enabled:
        snapshot?.notificationsEnabled !== undefined
          ? Boolean(snapshot.notificationsEnabled)
          : snapshot?.notifications_enabled !== undefined
            ? Boolean(snapshot.notifications_enabled)
            : null,
      gps_provider_enabled:
        snapshot?.gpsProviderEnabled !== undefined
          ? Boolean(snapshot.gpsProviderEnabled)
          : snapshot?.gps_provider_enabled !== undefined
            ? Boolean(snapshot.gps_provider_enabled)
            : null,
      service_running: Boolean(snapshot?.running ?? snapshot?.service_running),
      pending_queue_count: Math.max(0, parseInt(snapshot?.pendingCount ?? snapshot?.pending_queue_count ?? 0, 10) || 0),
      location_mode: snapshot?.locationMode || snapshot?.location_mode || 'unknown'
    };

    const evaluation = classifyDeviceHealth(rawRecord, policy);
    const dbPayload = {
      ...rawRecord,
      location_mode: evaluation.locationMode,
      health_status: evaluation.status,
      issue_summary: evaluation.issueSummary,
      last_checked_at: nowIso,
      updated_at: nowIso
    };

    // Always update JSON fallback store in memory/disk gracefully
    const paths = await resolveHealthStorePaths();
    const store = await readJsonFileSafe(paths.primary, paths.tmp, {});
    const storeKey = `${effectiveUserId}::${canonicalCompany}`;
    store[storeKey] = dbPayload;
    await writeJsonFileSafe(paths.primary, paths.tmp, store);

    if (admin) {
      const { error } = await admin
        .from('employee_device_health')
        .upsert(dbPayload, { onConflict: 'user_id,company' });
      if (error && !isMissingHealthRelationError(error)) {
        console.warn('[reportEmployeeDeviceHealth] Supabase upsert warning:', error.message);
      }
    }

    return { success: true, record: dbPayload, evaluation, policy };
  } catch (err) {
    console.warn('[reportEmployeeDeviceHealth] Non-blocking fallback:', err?.message || err);
    return { success: false, error: err?.message || 'Health telemetry failed' };
  }
}

export async function getEmployeeDeviceHealthSummary(userId, company = 'TNT00001') {
  try {
    if (!isUuid(userId)) return { success: false, summary: null };
    const { classifyDeviceHealth, HEALTH_STATUS_META } = await import('@/config/appReleaseConfig');
    const policyRes = await getAppReleasePolicy();
    const policy = policyRes.policy;
    const admin = getAdminClient();

    let latestRecord = null;
    if (admin) {
      try {
        const { data, error } = await admin
          .from('employee_device_health')
          .select('*')
          .eq('user_id', String(userId))
          .order('last_checked_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) latestRecord = data;
      } catch {
        // Fallback to JSON store
      }
    }

    if (!latestRecord) {
      const paths = await resolveHealthStorePaths();
      const store = await readJsonFileSafe(paths.primary, paths.tmp, {});
      const matching = Object.values(store || {}).filter((row) => String(row?.user_id || '') === String(userId));
      matching.sort((a, b) => new Date(b?.last_checked_at || 0).getTime() - new Date(a?.last_checked_at || 0).getTime());
      if (matching[0]) latestRecord = matching[0];
    }

    // Fallback inference from user_sessions if employee hasn't opened updated web tracker yet
    if (!latestRecord && admin) {
      try {
        const { parseBrowserAndOsDetails, PLATFORM_LABELS } = await import('@/utils/platformDetection');
        const { data: sessions } = await admin
          .from('user_sessions')
          .select('user_id, device, last_active, is_active')
          .eq('user_id', String(userId))
          .order('last_active', { ascending: false })
          .limit(5);

        const mobileSess = (sessions || []).find((s) => /Android|iPhone|iPad|Mobile|SPC Workspace APK|; wv\)/i.test(String(s?.device || '')));
        if (mobileSess) {
          const ua = String(mobileSess.device || '');
          const isWv = /;\s*wv\)|spcworkspaceandroid|spc workspace apk/i.test(ua);
          latestRecord = {
            user_id: String(userId),
            company: company || 'TNT00001',
            platform: isWv ? PLATFORM_LABELS.ANDROID_APP : PLATFORM_LABELS.WEB_APP,
            platform_details: isWv ? 'Legacy APK (pre-v4 signature)' : parseBrowserAndOsDetails(ua),
            app_version_code: null,
            last_checked_at: mobileSess.last_active
          };
        }
      } catch {
        // Ignore session fallback failure
      }
    }

    const evaluation = classifyDeviceHealth(latestRecord, policy);
    const meta = HEALTH_STATUS_META[evaluation.status] || HEALTH_STATUS_META.OFFLINE;

    return {
      success: true,
      summary: {
        status: evaluation.status,
        label: meta.label,
        shortLabel: meta.shortLabel,
        color: meta.color,
        bg: meta.bg,
        border: meta.border,
        versionCode: latestRecord?.app_version_code ?? null,
        versionName: latestRecord?.app_version_name ?? null,
        locationMode: evaluation.locationMode,
        batteryUnrestricted: latestRecord?.battery_unrestricted ?? null,
        gpsProviderEnabled: latestRecord?.gps_provider_enabled ?? null,
        notificationsEnabled: latestRecord?.notifications_enabled ?? null,
        serviceRunning: Boolean(latestRecord?.service_running),
        deviceModel: [latestRecord?.device_manufacturer, latestRecord?.device_model].filter(Boolean).join(' ') || null,
        osVersion: latestRecord?.os_version || null,
        platform: latestRecord?.platform || null,
        platformDetails: latestRecord?.platform_details || null,
        issues: evaluation.issues,
        issueSummary: evaluation.issueSummary,
        lastCheckedAt: latestRecord?.last_checked_at || null,
        policy
      }
    };
  } catch (err) {
    return { success: false, summary: null, error: err?.message || 'Summary lookup failed' };
  }
}

export async function getDeviceHealthFleetReport(company = 'ALL', branchCode = null) {
  try {
    const { createClient } = await import('@/utils/supabase/server');
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized', rows: [] };
    }

    const admin = getAdminClient();
    if (!admin) {
      return { success: false, error: 'Database unavailable', rows: [] };
    }

    const { data: callerRows } = await admin
      .from('user_roles')
      .select('role, company, tenant_id, email, branch_name, work_location_name, module_access')
      .eq('user_id', user.id)
      .limit(1);
    const callerRole = callerRows?.[0];
    const callerLower = String(callerRole?.role || '').trim().toLowerCase();
    const isMasterCaller =
      callerLower === 'masteradmin' ||
      callerLower === 'master_admin' ||
      callerRole?.module_access?.is_master_admin === true ||
      String(user.email || '').trim().toLowerCase() === 'supujacreations@gmail.com';

    const canViewFleet =
      isMasterCaller ||
      ['admin', 'superadmin', 'hr', 'manager', 'hod'].includes(callerLower) ||
      callerRole?.module_access?.field_force?.is_manager === true;

    if (!canViewFleet) {
      return { success: false, error: 'Forbidden: supervisory access required', rows: [] };
    }

    const { resolveKnownTenant, getTenantBranches } = await import('@/app/actions/tenantBranches');
    const { classifyDeviceHealth, HEALTH_STATUS_META, DEVICE_HEALTH_STATUS } = await import('@/config/appReleaseConfig');
    const { parseBrowserAndOsDetails, PLATFORM_LABELS } = await import('@/utils/platformDetection');

    // Load dynamic tenant catalog from public.tenants (no hardcoded tenant lock-in)
    const { data: dbTenants } = await admin
      .from('tenants')
      .select('id, tenant_code, name, status')
      .order('tenant_code', { ascending: true });

    const tenantCatalog = Array.isArray(dbTenants) && dbTenants.length > 0
      ? dbTenants.map((t) => ({
          tenantId: t.id,
          tenantCode: String(t.tenant_code || '').toUpperCase().trim(),
          companyName: t.name || t.tenant_code
        }))
      : [
          { tenantId: '0a37b8e8-1c28-4e19-8891-951fc3f8f8af', tenantCode: 'TNT00001', companyName: 'SuPuja Creations' },
          { tenantId: '00000000-0000-0000-0000-000000000001', tenantCode: 'TNT00002', companyName: 'New Swan Group' },
          { tenantId: '922d3e72-6588-457f-a562-4f1bdbf10d98', tenantCode: 'TNT00003', companyName: 'Testing New Swan Group' }
        ];

    const findTenantFromCatalog = async (tid, comp) => {
      const cleanTid = String(tid || '').trim().toLowerCase();
      const cleanComp = String(comp || '').trim().toLowerCase();
      if (cleanTid) {
        const byId = tenantCatalog.find((t) => String(t.tenantId || '').toLowerCase() === cleanTid || String(t.tenantCode || '').toLowerCase() === cleanTid);
        if (byId) return byId;
      }
      if (cleanComp) {
        const byCodeOrName = tenantCatalog.find(
          (t) => String(t.tenantCode || '').toLowerCase() === cleanComp || String(t.companyName || '').toLowerCase() === cleanComp
        );
        if (byCodeOrName) return byCodeOrName;
      }
      const fallbackTid = cleanTid ? await resolveKnownTenant(tid) : null;
      if (fallbackTid?.tenantCode) {
        return tenantCatalog.find((t) => t.tenantCode === fallbackTid.tenantCode) || fallbackTid;
      }
      const fallbackComp = cleanComp ? await resolveKnownTenant(comp) : null;
      if (fallbackComp?.tenantCode) {
        return tenantCatalog.find((t) => t.tenantCode === fallbackComp.tenantCode) || fallbackComp;
      }
      return null;
    };

    // Enforce multi-tenant scope: non-MasterAdmin callers can ONLY inspect their own tenant!
    const callerOwnTenant =
      (await findTenantFromCatalog(callerRole?.tenant_id, callerRole?.company)) ||
      tenantCatalog[0];

    let targetTenantCode = 'ALL';
    let targetTenantObj = null;
    if (!isMasterCaller) {
      targetTenantObj = callerOwnTenant;
      targetTenantCode = callerOwnTenant.tenantCode;
    } else {
      const requested = String(company || 'ALL').trim();
      if (requested && requested.toUpperCase() !== 'ALL' && requested.toLowerCase() !== 'all companies') {
        targetTenantObj = await findTenantFromCatalog(requested, requested);
        targetTenantCode = targetTenantObj?.tenantCode || requested.toUpperCase();
      }
    }

    const availableTenants = isMasterCaller ? tenantCatalog : [callerOwnTenant];

    // Load branches strictly for the active selected tenant (when specific tenant is scoped)
    let activeBranches = [];
    if (targetTenantObj && targetTenantCode !== 'ALL') {
      const brRes = await getTenantBranches(targetTenantObj.tenantId || targetTenantObj.tenantCode);
      activeBranches = Array.isArray(brRes?.branches) ? brRes.branches : [];
    }

    const policyRes = await getAppReleasePolicy();
    const policy = policyRes.policy;
    const companyFilter = targetTenantCode === 'ALL'
      ? { isAll: true, aliases: [] }
      : await buildCompanyMatchAliases(targetTenantObj?.tenantCode || targetTenantCode);
    if (!companyFilter.isAll && targetTenantObj) {
      if (targetTenantObj.tenantId) companyFilter.aliases.push(String(targetTenantObj.tenantId).toLowerCase());
      if (targetTenantObj.tenantCode) companyFilter.aliases.push(String(targetTenantObj.tenantCode).toLowerCase());
      if (targetTenantObj.companyName) companyFilter.aliases.push(String(targetTenantObj.companyName).toLowerCase());
    }

    const { dayStr, startISO, endISO } = getISTDayWindowISO();

    // Parallel non-blocking reads (`user_roles` uses `emp_name`, not `name`)
    const [
      { data: roleRows, error: roleErr },
      healthDbRes,
      { data: sessionRows },
      { data: pingRows },
      { data: attRows }
    ] = await Promise.all([
      admin.from('user_roles').select('*').order('emp_name', { ascending: true }),
      admin.from('employee_device_health').select('*').order('last_checked_at', { ascending: false }),
      admin.from('user_sessions').select('user_id, device, ip_address, last_active, is_active').order('last_active', { ascending: false }).limit(800),
      admin.from('employee_live_locations').select('user_id, recorded_at, battery_pct').gte('recorded_at', startISO).lte('recorded_at', endISO).order('recorded_at', { ascending: false }).limit(2000),
      admin.from('attendance_records').select('user_id, email, attendance_date, in_time, out_time').eq('attendance_date', dayStr)
    ]);

    if (roleErr) {
      console.error('[getDeviceHealthFleetReport] user_roles error:', roleErr);
    }

    // Load branch lookup cache per tenant code when MasterAdmin views ALL tenants
    const branchCacheByTenant = new Map();
    if (targetTenantCode !== 'ALL') {
      branchCacheByTenant.set(targetTenantCode, activeBranches);
    } else {
      await Promise.all(
        availableTenants.map(async (t) => {
          try {
            const brRes = await getTenantBranches(t.tenantId || t.tenantCode);
            branchCacheByTenant.set(t.tenantCode, Array.isArray(brRes?.branches) ? brRes.branches : []);
          } catch {
            branchCacheByTenant.set(t.tenantCode, []);
          }
        })
      );
    }

    const paths = await resolveHealthStorePaths();
    const jsonStore = await readJsonFileSafe(paths.primary, paths.tmp, {});

    // Merge Supabase + JSON fallback records (keep freshest per user_id)
    const healthByUser = new Map();
    const considerHealth = (row) => {
      if (!row?.user_id) return;
      const uid = String(row.user_id);
      const existing = healthByUser.get(uid);
      if (!existing || new Date(row.last_checked_at || 0).getTime() >= new Date(existing.last_checked_at || 0).getTime()) {
        healthByUser.set(uid, row);
      }
    };
    if (!healthDbRes?.error && Array.isArray(healthDbRes.data)) {
      healthDbRes.data.forEach(considerHealth);
    }
    Object.values(jsonStore || {}).forEach(considerHealth);

    const mobileSessionByUser = new Map();
    for (const s of sessionRows || []) {
      const uid = String(s?.user_id || '');
      if (!uid || mobileSessionByUser.has(uid)) continue;
      const dev = String(s?.device || '');
      if (/Android|iPhone|iPad|Mobile|SPC Workspace APK|; wv\)/i.test(dev)) {
        mobileSessionByUser.set(uid, s);
      }
    }

    const latestPingByUser = new Map();
    for (const p of pingRows || []) {
      const uid = String(p?.user_id || '');
      if (!uid || latestPingByUser.has(uid)) continue;
      latestPingByUser.set(uid, p);
    }

    const attByUser = new Map();
    for (const a of attRows || []) {
      if (a?.user_id) attByUser.set(String(a.user_id), a);
    }

    const tenantResolveCache = new Map();
    const resolveEmployeeTenantCached = async (emp) => {
      const tid = String(emp?.tenant_id || '').trim();
      const comp = String(emp?.company || '').trim();
      const key = `${tid}::${comp}`;
      if (tenantResolveCache.has(key)) return tenantResolveCache.get(key);
      const matched = (await findTenantFromCatalog(tid, comp)) || tenantCatalog[0];
      tenantResolveCache.set(key, matched);
      return matched;
    };

    const resolveEmployeeBranchMatch = (emp, tenantCode, branchesList) => {
      const rawCandidates = [
        emp?.module_access?.branch_code,
        emp?.branch_name,
        emp?.work_location_name,
        emp?.company
      ]
        .map((v) => String(v || '').trim())
        .filter(Boolean);

      for (const branch of branchesList || []) {
        const branchAliases = [
          branch?.branch_code,
          branch?.id,
          branch?.custom_code,
          branch?.legacy_code,
          branch?.branch_name
        ]
          .map((v) => String(v || '').trim().toLowerCase())
          .filter(Boolean);

        const hit = rawCandidates.some((cand) => branchAliases.includes(cand.toLowerCase()));
        if (hit) {
          const code = branch.branch_code || branch.id;
          const shortTag = branch.custom_code || branch.legacy_code || '';
          return {
            branchCode: code,
            displayLabel: shortTag ? `${code} (${shortTag})` : code,
            branchAliases
          };
        }
      }

      const defaultCode = branchesList?.[0]?.branch_code || branchesList?.[0]?.id || `${tenantCode}-B0001`;
      const unitHint = String(emp?.company || '').trim();
      const isGenericTenantName = tenantCatalog.some((t) => t.companyName.toLowerCase() === unitHint.toLowerCase());
      return {
        branchCode: defaultCode,
        displayLabel: unitHint && !isGenericTenantName ? `${defaultCode} (${unitHint})` : defaultCode,
        branchAliases: [defaultCode.toLowerCase(), ...rawCandidates.map((c) => c.toLowerCase())]
      };
    };

    const selectedBranchObj =
      branchCode && branchCode !== 'ALL'
        ? activeBranches.find(
            (b) =>
              String(b.branch_code || b.id || '').toLowerCase() === String(branchCode).toLowerCase() ||
              String(b.custom_code || '').toLowerCase() === String(branchCode).toLowerCase()
          )
        : null;
    const selectedBranchAliases = selectedBranchObj
      ? [
          selectedBranchObj.branch_code,
          selectedBranchObj.id,
          selectedBranchObj.custom_code,
          selectedBranchObj.legacy_code,
          selectedBranchObj.branch_name
        ]
          .map((v) => String(v || '').trim().toLowerCase())
          .filter(Boolean)
      : branchCode && branchCode !== 'ALL'
        ? [String(branchCode).trim().toLowerCase()]
        : [];

    const rows = [];
    for (const emp of roleRows || []) {
      const empStatus = String(emp?.emp_status || emp?.module_access?.emp_status || 'Active').toLowerCase();
      if (['inactive', 'in_active', 'terminated', 'resigned', 'trash', 'draft'].includes(empStatus)) continue;
      if (emp?.is_approved !== true) continue;
      if (String(emp?.role || '').toLowerCase() === 'customer') continue;

      const uid = String(emp?.user_id || emp?.id || '').trim();
      if (!uid) continue;

      const resolvedEmpTenant = await resolveEmployeeTenantCached(emp);
      const tenantCode = resolvedEmpTenant?.tenantCode || 'TNT00001';
      const companyName = resolvedEmpTenant?.companyName || emp?.company || 'SuPuja Creations';

      if (!companyFilter.isAll) {
        const empCompLower = String(emp?.company || '').trim().toLowerCase();
        const empTidLower = String(emp?.tenant_id || '').trim().toLowerCase();
        const empCodeLower = tenantCode.toLowerCase();
        const matchesTenant =
          companyFilter.aliases.includes(empCodeLower) ||
          companyFilter.aliases.includes(empCompLower) ||
          (empTidLower && companyFilter.aliases.includes(empTidLower));
        if (!matchesTenant) continue;
      }

      const tBranches = branchCacheByTenant.get(tenantCode) || [];
      const resolvedBranch = resolveEmployeeBranchMatch(emp, tenantCode, tBranches);

      if (selectedBranchAliases.length > 0) {
        const branchHit =
          selectedBranchAliases.includes(String(resolvedBranch.branchCode || '').toLowerCase()) ||
          resolvedBranch.branchAliases.some((a) => selectedBranchAliases.includes(a));
        if (!branchHit) continue;
      }

      let healthRecord = healthByUser.get(uid) || null;
      const mobSess = mobileSessionByUser.get(uid) || null;
      const todayPing = latestPingByUser.get(uid) || null;
      const todayAtt = attByUser.get(uid) || null;

      if (!healthRecord && mobSess) {
        const ua = String(mobSess.device || '');
        const isWv = /;\s*wv\)|spcworkspaceandroid|spc workspace apk/i.test(ua);
        healthRecord = {
          user_id: uid,
          company: tenantCode,
          platform: isWv ? PLATFORM_LABELS.ANDROID_APP : PLATFORM_LABELS.WEB_APP,
          platform_details: isWv ? 'Legacy APK (pre-v4 signature)' : parseBrowserAndOsDetails(ua),
          app_version_code: null,
          last_checked_at: mobSess.last_active
        };
      } else if (!healthRecord && todayPing) {
        healthRecord = {
          user_id: uid,
          company: tenantCode,
          platform: PLATFORM_LABELS.ANDROID_APP,
          platform_details: 'Legacy GPS Ping Source (pre-v4 APK)',
          app_version_code: null,
          last_checked_at: todayPing.recorded_at
        };
      }

      const evaluation = classifyDeviceHealth(healthRecord, policy);
      const statusMeta = HEALTH_STATUS_META[evaluation.status] || HEALTH_STATUS_META[DEVICE_HEALTH_STATUS.OFFLINE];

      rows.push({
        userId: uid,
        employeeName: String(emp?.emp_name || emp?.name || emp?.email || 'Unknown').trim(),
        phone: emp?.emp_mobile || emp?.emp_alt_mobile || emp?.phone || '',
        email: emp?.email || emp?.emp_official_mail_id || '',
        role: emp?.role || 'employee',
        tenantCode,
        companyName,
        branchCode: resolvedBranch.displayLabel,
        status: evaluation.status,
        statusLabel: statusMeta.label,
        statusShortLabel: statusMeta.shortLabel,
        statusColor: statusMeta.color,
        statusBg: statusMeta.bg,
        statusBorder: statusMeta.border,
        platform: healthRecord?.platform || (todayAtt?.in_time ? 'Desktop / Unreported' : 'Not Active'),
        platformDetails: healthRecord?.platform_details || '',
        appVersionCode: healthRecord?.app_version_code ?? null,
        appVersionName: healthRecord?.app_version_name ?? null,
        osVersion: healthRecord?.os_version || null,
        deviceName: [healthRecord?.device_manufacturer, healthRecord?.device_model].filter(Boolean).join(' ') || null,
        locationMode: evaluation.locationMode,
        batteryUnrestricted: healthRecord?.battery_unrestricted ?? null,
        notificationsEnabled: healthRecord?.notifications_enabled ?? null,
        gpsProviderEnabled: healthRecord?.gps_provider_enabled ?? null,
        serviceRunning: Boolean(healthRecord?.service_running),
        pendingQueueCount: healthRecord?.pending_queue_count || 0,
        issues: evaluation.issues,
        issueSummary: evaluation.issueSummary,
        lastCheckedAt: healthRecord?.last_checked_at || null,
        lastGpsPingAt: todayPing?.recorded_at || null,
        punchedInToday: Boolean(todayAtt?.in_time)
      });
    }

    const PRIORITY_ORDER = {
      FORCE_UPGRADE: 1,
      NEEDS_PERMISSION_FIX: 2,
      BROWSER_ONLY: 3,
      OUTDATED_APK: 4,
      OFFLINE: 5,
      HEALTHY: 6
    };
    rows.sort((a, b) => (PRIORITY_ORDER[a.status] || 99) - (PRIORITY_ORDER[b.status] || 99) || a.employeeName.localeCompare(b.employeeName));

    const summaryCounts = {
      total: rows.length,
      healthy: rows.filter((r) => r.status === DEVICE_HEALTH_STATUS.HEALTHY).length,
      needsPermissionFix: rows.filter((r) => r.status === DEVICE_HEALTH_STATUS.NEEDS_PERMISSION_FIX).length,
      outdatedApk: rows.filter((r) => r.status === DEVICE_HEALTH_STATUS.OUTDATED_APK || r.status === DEVICE_HEALTH_STATUS.FORCE_UPGRADE).length,
      browserOnly: rows.filter((r) => r.status === DEVICE_HEALTH_STATUS.BROWSER_ONLY).length,
      offline: rows.filter((r) => r.status === DEVICE_HEALTH_STATUS.OFFLINE).length
    };

    return {
      success: true,
      rows,
      summaryCounts,
      policy,
      isMasterScope: isMasterCaller,
      activeTenantCode: targetTenantCode,
      availableTenants,
      availableBranches: activeBranches,
      generatedAtIST: new Date().toISOString()
    };
  } catch (err) {
    console.error('[getDeviceHealthFleetReport] Error:', err);
    return { success: false, error: err?.message || 'Failed to generate device health report', rows: [] };
  }
}
