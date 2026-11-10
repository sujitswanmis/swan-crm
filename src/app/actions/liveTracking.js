'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Calculates distance in meters between two lat/long points (Haversine)
 */
function haversineMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Record a batch of live GPS pings (from live tracking or offline delta sync)
 */
export async function recordLocationPingBatch(pings) {
  if (!Array.isArray(pings) || pings.length === 0) return { success: true, count: 0 };
  const supabase = getAdminClient();

  try {
    const formatted = pings.map(p => ({
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
      const parts = [
        a.road || a.suburb || a.neighbourhood || a.industrial || a.commercial,
        a.city || a.town || a.county || a.state_district,
        a.state
      ].filter(Boolean);

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

/**
 * Snaps waypoints to real OpenStreetMap road geometry via OSRM Driving Engine.
 * Supports multi-chunk stitching for long routes (>35 waypoints) with graceful fallback.
 */
async function snapWaypointsToRoad(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return { polyline: waypoints, totalDistanceMeters: 0, snapped: false };
  }

  try {
    const valid = waypoints.filter(p => {
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
    });

    if (valid.length < 2) {
      return { polyline: waypoints, totalDistanceMeters: 0, snapped: false };
    }

    // Split points into chunks of 35 with 1 overlapping point between chunks
    const chunkSize = 35;
    const chunks = [];
    if (valid.length <= chunkSize) {
      chunks.push(valid);
    } else {
      for (let i = 0; i < valid.length - 1; i += (chunkSize - 1)) {
        chunks.push(valid.slice(i, i + chunkSize));
        if (i + chunkSize >= valid.length) break;
      }
    }

    let stitchedCoords = [];
    let totalDistanceMeters = 0;

    for (const chunk of chunks) {
      if (chunk.length < 2) continue;
      const coordStr = chunk.map(p => `${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) continue;

      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
        const road = data.routes[0].geometry.coordinates;
        totalDistanceMeters += (data.routes[0].distance || 0);
        if (stitchedCoords.length === 0) {
          stitchedCoords = road;
        } else {
          stitchedCoords = stitchedCoords.concat(road.slice(1));
        }
      }
    }

    if (stitchedCoords.length < 2) {
      return { polyline: waypoints, totalDistanceMeters: 0, snapped: false };
    }

    const tStart = valid[0].time ? new Date(valid[0].time).getTime() : Date.now();
    const tEnd = valid[valid.length - 1].time ? new Date(valid[valid.length - 1].time).getTime() : tStart + 3600000;
    const timeSpan = Math.max(1000, tEnd - tStart);

    const snappedPolyline = stitchedCoords.map(([lng, lat], idx) => {
      const progress = idx / (stitchedCoords.length - 1);
      const curT = tStart + progress * timeSpan;
      const interpolatedTime = new Date(curT).toISOString();

      // Check if this point falls into an offline gap (> 8 mins)
      const isPointOffline = valid.some((w, wIdx) => {
        if (wIdx === 0) return false;
        const wPrev = valid[wIdx - 1];
        const t1 = new Date(wPrev.time).getTime();
        const t2 = new Date(w.time).getTime();
        return (w.isOffline || (t2 - t1) > 480000) && curT >= t1 && curT <= t2;
      });

      return {
        lat,
        lng,
        time: interpolatedTime,
        speed: 25,
        isSnapped: true,
        isOffline: Boolean(isPointOffline)
      };
    });

    return {
      polyline: snappedPolyline,
      totalDistanceMeters,
      snapped: true
    };
  } catch (err) {
    console.warn('OSRM road snapping fallback:', err?.message || err);
    return { polyline: waypoints, totalDistanceMeters: 0, snapped: false };
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

      // If out_location was not GPS format, fallback to latest ping or punchIn coordinates
      if (oLat == null || oLng == null || isNaN(oLat) || isNaN(oLng)) {
        if (pings.length > 0) {
          const lp = pings[pings.length - 1];
          oLat = Number(lp.latitude);
          oLng = Number(lp.longitude);
        } else if (punchInPoint) {
          oLat = punchInPoint.lat;
          oLng = punchInPoint.lng;
        }
      }

      let outLocName = outLocLabel;
      if (oLat && oLng) {
        const resolved = await resolveLocationName(oLat, oLng);
        if (resolved) outLocName = `${outLocLabel} (${resolved})`;
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
          isOffline: false,
          label: 'Punch Out'
        };
      }
    }

    for (let i = 0; i < pings.length; i++) {
      const p = pings[i];
      let isOffline = Boolean(p.is_offline_synced);

      if (i > 0) {
        const prev = pings[i - 1];
        const dist = haversineMeters(prev.latitude, prev.longitude, p.latitude, p.longitude);
        const timeDiffSec = (new Date(p.recorded_at) - new Date(prev.recorded_at)) / 1000;
        
        // Gap > 8 minutes indicates phone was offline, app closed, or GPS signal was lost
        if (timeDiffSec > 480 || p.is_offline_synced) {
          isOffline = true;
        }

        const speedKmh = timeDiffSec > 0 ? (dist / timeDiffSec) * 3.6 : 0;
        if (speedKmh <= 130) {
          totalMeters += dist;
        }

        // Stoppage Detection: If distance moved is minimal (< 20m) and speed < 3 km/h
        if (dist < 20 && p.speed_kmh < 3) {
          if (!currentStoppage) {
            currentStoppage = {
              type: 'stoppage',
              startTime: prev.recorded_at,
              endTime: p.recorded_at,
              lat: p.latitude,
              lng: p.longitude,
              count: 1
            };
          } else {
            currentStoppage.endTime = p.recorded_at;
            currentStoppage.count++;
          }
        } else {
          if (currentStoppage) {
            const stoppageDurationMins = Math.round((new Date(currentStoppage.endTime) - new Date(currentStoppage.startTime)) / 60000);
            if (stoppageDurationMins >= 5) {
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
            currentStoppage = null;
          }
        }
      }

      polyline.push({
        lat: Number(p.latitude),
        lng: Number(p.longitude),
        time: p.recorded_at,
        speed: p.speed_kmh,
        isOffline
      });
    }

    // Flush last stoppage if exists
    if (currentStoppage) {
      const stoppageDurationMins = Math.round((new Date(currentStoppage.endTime) - new Date(currentStoppage.startTime)) / 60000);
      if (stoppageDurationMins >= 5) {
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

    // Sort timeline chronologically
    timeline.sort((a, b) => new Date(a.startTime || a.checkInTime) - new Date(b.startTime || b.checkInTime));

    // Snap route to real street geometry via OSRM Driving Engine
    let finalPolyline = polyline;
    let isRoadSnapped = false;
    if (polyline.length >= 2) {
      try {
        const roadResult = await snapWaypointsToRoad(polyline);
        if (roadResult.snapped && roadResult.polyline.length > 0) {
          finalPolyline = roadResult.polyline;
          if (roadResult.totalDistanceMeters > 0) {
            totalMeters = roadResult.totalDistanceMeters;
          }
          isRoadSnapped = true;
        }
      } catch (snapErr) {
        console.warn('Road snapping step skipped:', snapErr?.message);
      }
    }

    const totalKm = (totalMeters / 1000).toFixed(2);
    const lastPing = pings.length > 0 ? pings[pings.length - 1] : (polyline.length > 0 ? polyline[polyline.length - 1] : null);

    return {
      userId,
      date: dateStr,
      totalKm: Number(totalKm),
      totalPings: Math.max(pings.length, finalPolyline.length),
      lastPing,
      polyline: finalPolyline,
      rawPolyline: polyline,
      isRoadSnapped,
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
      .select('user_id, latitude, longitude, speed_kmh, battery_pct, is_moving, recorded_at, branch_code, company')
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

    // Keep only the latest ping per user
    const userMap = new Map();
    (rawPings || []).forEach(p => {
      if (!userMap.has(p.user_id)) {
        userMap.set(p.user_id, p);
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
