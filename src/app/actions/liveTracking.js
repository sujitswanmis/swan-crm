'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { signFieldTelemetryToken } from '@/utils/fieldTelemetryToken';
import { haversineMeters, snapRouteSegmentsToRoad } from '@/utils/routeGeometryMatcher';

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
        const lat = Number(p.latitude);
        const lng = Number(p.longitude);
        if (isNaN(lat) || isNaN(lng) || (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01)) return false;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
        // Drop desktop IP / coarse cell-tower fixes (>300m accuracy) so routes stay road-accurate
        const rawAcc = p.accuracy_meters != null ? Number(p.accuracy_meters) : (p.accuracy != null ? Number(p.accuracy) : null);
        if (rawAcc != null && !isNaN(rawAcc) && rawAcc > 300) return false;
        return true;
      })
      .map(p => ({
        user_id: p.user_id,
        company: p.company || 'TNT00001',
        branch_code: p.branch_code || null,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy_meters: p.accuracy_meters != null ? Math.min(Math.round(p.accuracy_meters), 9999) : (p.accuracy != null ? Math.min(Math.round(p.accuracy), 9999) : null),
        speed_kmh: p.speed_kmh != null ? Math.min(Math.round(p.speed_kmh), 999) : (p.speed != null ? Math.min(Math.round(p.speed), 999) : 0),
        heading: p.heading != null ? Math.min(Math.round(p.heading), 360) : null,
        battery_pct: p.battery_pct != null ? Math.min(Math.max(Math.round(p.battery_pct), 0), 100) : (p.battery_level != null ? Math.min(Math.max(Math.round(p.battery_level), 0), 100) : null),
        is_charging: Boolean(p.is_charging),
        is_moving: Boolean(p.is_moving),
        is_mock_gps: Boolean(p.is_mock_gps),
        is_offline_synced: Boolean(p.is_offline_synced),
        recorded_at: p.recorded_at || new Date().toISOString()
      }));

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

// In-memory cache for reverse geocoding to prevent repetitive external API calls
const locationNameCache = new Map();

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

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
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
      locationNameCache.set(key, finalName);
      return finalName;
    }
  } catch (_) {}

  const fallback = `Location (${numLat.toFixed(4)}, ${numLng.toFixed(4)})`;
  locationNameCache.set(key, fallback);
  return fallback;
}

async function appendStoppageIfValid(currentStoppage, timeline) {
  if (!currentStoppage) return;
  const stoppageDurationMins = Math.round(
    (new Date(currentStoppage.endTime) - new Date(currentStoppage.startTime)) / 60000
  );
  // Require continuous stationary heartbeats (count >= 2) or <=30m gap so isolated 2.5h silence jumps never fake stoppages
  if (stoppageDurationMins >= 5 && (currentStoppage.count >= 2 || currentStoppage.maxGapSec <= 1800)) {
    const locName = await resolveLocationName(currentStoppage.lat, currentStoppage.lng);
    timeline.push({
      type: 'stoppage',
      durationMins: stoppageDurationMins,
      startTime: currentStoppage.startTime,
      endTime: currentStoppage.endTime,
      lat: currentStoppage.lat,
      lng: currentStoppage.lng,
      locationName: locName
    });
  }
}

/**
 * Single Employee 360° Route & Playback Data (Aapke Screenshot 1 Jaisa)
 * Fetches all breadcrumbs, detects stoppages, and matches client visits
 */
export async function getEmployee360Route(userId, dateStr) {
  if (!userId || !dateStr) return null;
  const supabase = getAdminClient();

  try {
    const startOfDay = `${dateStr}T00:00:00.000+05:30`;
    const endOfDay = `${dateStr}T23:59:59.999+05:30`;

    // 1. Fetch raw GPS breadcrumbs
    const { data: rawPings, error: pingsErr } = await supabase
      .from('employee_live_locations')
      .select('*')
      .eq('user_id', userId)
      .gte('recorded_at', startOfDay)
      .lte('recorded_at', endOfDay)
      .order('recorded_at', { ascending: true });

    if (pingsErr) {
      console.error('Error fetching employee 360 route pings:', pingsErr);
      return null;
    }

    const pings = rawPings || [];

    // 2. Fetch completed visits / tasks for that day
    const { data: visits } = await supabase
      .from('field_form_submissions')
      .select('*')
      .eq('field_user_id', userId)
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .order('created_at', { ascending: true });

    // 3. Fetch attendance punch-in & punch-out records for that employee on that date
    let attRecord = null;
    const { data: attData } = await supabase
      .from('attendance_records')
      .select('id, user_id, email, in_time, out_time, in_location, out_location, in_method, shift_name, status')
      .eq('attendance_date', dateStr)
      .or(`user_id.eq.${userId},id.eq.${userId}`)
      .maybeSingle();

    if (attData) {
      attRecord = attData;
    } else {
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
    let currentStoppage = null;

    // Parse Punch-In coordinates from attendance
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
          const inLocName = await resolveLocationName(pLat, pLng);
          timeline.push({
            type: 'punch_in',
            label: `Punch In (${new Date(attRecord.in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })})`,
            startTime: attRecord.in_time,
            lat: pLat,
            lng: pLng,
            locationName: inLocName || attRecord.in_location,
            shiftName: attRecord.shift_name,
            status: attRecord.status
          });
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
      let outLocLabel = attRecord.out_location || 'Office Web Terminal';

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

      let outLocName = outLocLabel;
      if (oLat != null && oLng != null && !isNaN(oLat) && !isNaN(oLng)) {
        const resolved = await resolveLocationName(oLat, oLng);
        if (resolved) {
          outLocName = /^GPS\s*\(/i.test(outLocLabel)
            ? `${resolved} (${oLat.toFixed(4)}, ${oLng.toFixed(4)})`
            : `${outLocLabel} (${resolved})`;
        }
      }

      timeline.push({
        type: 'punch_out',
        label: `Punch Out (${new Date(attRecord.out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })})`,
        startTime: attRecord.out_time,
        endTime: attRecord.out_time,
        locationName: outLocName,
        lat: oLat,
        lng: oLng,
        status: 'SHIFT_COMPLETED'
      });

      if (oLat != null && oLng != null && !isNaN(oLat) && !isNaN(oLng)) {
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

    let lastValidPing = null;
    for (let i = 0; i < routePings.length; i++) {
      const p = routePings[i];
      let isOffline = Boolean(p.is_offline_synced);

      if (lastValidPing) {
        const dist = haversineMeters(lastValidPing.latitude, lastValidPing.longitude, p.latitude, p.longitude);
        const timeDiffSec = (new Date(p.recorded_at) - new Date(lastValidPing.recorded_at)) / 1000;
        const speedKmh = timeDiffSec > 0 ? (dist / timeDiffSec) * 3.6 : (dist > 50 ? 999 : 0);

        // Reject impossible GPS teleportation spikes (>130 km/h over >250m within 5 mins)
        if (dist > 250 && speedKmh > 130 && timeDiffSec < 300) {
          continue;
        }

        // Gap > 8 minutes indicates phone was offline, app closed, or GPS signal was lost
        if (timeDiffSec > 480 || p.is_offline_synced) {
          isOffline = true;
        }

        if (speedKmh <= 130) {
          totalMeters += dist;
        }

        // Stoppage Detection: minimal distance (< 25m) and stationary speed (< 3 km/h)
        if (dist < 25 && (p.speed_kmh || 0) < 3) {
          if (!currentStoppage) {
            currentStoppage = {
              type: 'stoppage',
              startTime: lastValidPing.recorded_at,
              endTime: p.recorded_at,
              lat: p.latitude,
              lng: p.longitude,
              count: 1,
              maxGapSec: timeDiffSec
            };
          } else {
            currentStoppage.endTime = p.recorded_at;
            currentStoppage.count++;
            if (timeDiffSec > currentStoppage.maxGapSec) {
              currentStoppage.maxGapSec = timeDiffSec;
            }
          }
        } else {
          await appendStoppageIfValid(currentStoppage, timeline);
          currentStoppage = null;
        }
      }

      lastValidPing = p;
      polyline.push({
        lat: Number(p.latitude),
        lng: Number(p.longitude),
        time: p.recorded_at,
        speed: p.speed_kmh,
        accuracy_meters: p.accuracy_meters != null ? Number(p.accuracy_meters) : null,
        isOffline
      });
    }

    // Flush last stoppage if exists
    await appendStoppageIfValid(currentStoppage, timeline);

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

    // Sort timeline & polyline chronologically before snapping
    timeline.sort((a, b) => new Date(a.startTime || a.checkInTime) - new Date(b.startTime || b.checkInTime));
    if (polyline.length >= 2) {
      polyline.sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));
    }

    // Clean noise/jitter, collapse stationary drift, and snap continuous tracked trips without inventing offline roads
    let finalPolyline = polyline;
    let isRoadSnapped = false;
    let routeCleaned = false;
    let trackedRoadMeters = 0;
    let offlineGapMeters = 0;
    if (polyline.length >= 2) {
      try {
        const roadResult = await snapRouteSegmentsToRoad(polyline);
        finalPolyline = roadResult.polyline;
        totalMeters = roadResult.totalDistanceMeters;
        trackedRoadMeters = roadResult.trackedRoadMeters || 0;
        offlineGapMeters = roadResult.offlineGapMeters || 0;
        isRoadSnapped = Boolean(roadResult.hasSnappedRoad);
        routeCleaned = Boolean(roadResult.routeCleaned);
      } catch (snapErr) {
        console.warn('Road snapping step skipped:', snapErr?.message);
      }
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

    // Check active mobile/Android app session heartbeat to distinguish Data ON vs GPS OFF
    let mobileSessionLastActive = null;
    try {
      const { data: userSess } = await supabase
        .from('user_sessions')
        .select('device, last_active, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('last_active', { ascending: false })
        .limit(5);
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

    const { data: rawPings, error } = await query;
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

    // Also include today's currently punched-in employees whose in_location has GPS coordinates
    const todayIST = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    const { data: activeAttendance } = await supabase
      .from('attendance_records')
      .select('user_id, email, in_time, out_time, in_location, emp_name, tenant_id')
      .eq('attendance_date', todayIST)
      .not('in_time', 'is', null)
      .is('out_time', null);

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
    const userIds = activeEmployees.map(e => e.user_id);
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

    // Get user details
    const userIds = [...new Set((summaries || []).map(s => s.user_id))];
    let userDetailsMap = new Map();
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('user_roles')
        .select('id, name, email, phone, role, vehicle_type, conveyance_rate_per_km')
        .in('id', userIds);
      (users || []).forEach(u => userDetailsMap.set(u.id, u));
    }

    return (summaries || []).map(s => {
      const u = userDetailsMap.get(s.user_id) || {};
      return {
        ...s,
        employee_name: u.name || 'Field Person',
        phone: u.phone || '',
        role: u.role || 'Sales Executive',
        vehicle_type: s.vehicle_type || u.vehicle_type || 'BIKE',
        conveyance_rate_per_km: s.conveyance_rate_per_km || u.conveyance_rate_per_km || 4.50
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
    if (!userId) return { success: false, error: 'Missing userId' };
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
