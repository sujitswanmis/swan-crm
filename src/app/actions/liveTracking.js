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
      accuracy_meters: p.accuracy_meters || p.accuracy || null,
      speed_kmh: p.speed_kmh || p.speed || 0,
      heading: p.heading || null,
      battery_pct: p.battery_pct !== undefined ? p.battery_pct : (p.battery_level || null),
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

    // 3. Stoppage & Route Analysis Algorithm:
    // Calculates total distance and identifies stoppages (speed < 3 km/h for > 5 mins)
    let totalMeters = 0;
    const timeline = [];
    const polyline = [];
    let currentStoppage = null;

    for (let i = 0; i < pings.length; i++) {
      const p = pings[i];
      polyline.push({ lat: Number(p.latitude), lng: Number(p.longitude), time: p.recorded_at, speed: p.speed_kmh });

      if (i > 0) {
        const prev = pings[i - 1];
        const dist = haversineMeters(prev.latitude, prev.longitude, p.latitude, p.longitude);
        const timeDiffSec = (new Date(p.recorded_at) - new Date(prev.recorded_at)) / 1000;
        
        // Filter out GPS teleportation jumps (> 130 km/h)
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
              timeline.push({
                type: 'stoppage',
                durationMins: stoppageDurationMins,
                startTime: currentStoppage.startTime,
                endTime: currentStoppage.endTime,
                lat: currentStoppage.lat,
                lng: currentStoppage.lng
              });
            }
            currentStoppage = null;
          }
        }
      }
    }

    // Flush last stoppage if exists
    if (currentStoppage) {
      const stoppageDurationMins = Math.round((new Date(currentStoppage.endTime) - new Date(currentStoppage.startTime)) / 60000);
      if (stoppageDurationMins >= 5) {
        timeline.push({
          type: 'stoppage',
          durationMins: stoppageDurationMins,
          startTime: currentStoppage.startTime,
          endTime: currentStoppage.endTime,
          lat: currentStoppage.lat,
          lng: currentStoppage.lng
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
        lat: v.check_in_lat || v.check_out_lat,
        lng: v.check_in_lng || v.check_out_lng,
        checkInTime: v.check_in_time,
        checkOutTime: v.check_out_time,
        isGeofenceFlagged: v.is_geofence_flagged,
        photos: v.photo_watermark_urls
      });
    });

    // Sort timeline chronologically
    timeline.sort((a, b) => new Date(a.startTime || a.checkInTime) - new Date(b.startTime || b.checkInTime));

    const totalKm = (totalMeters / 1000).toFixed(2);
    const lastPing = pings.length > 0 ? pings[pings.length - 1] : null;

    return {
      userId,
      date: dateStr,
      totalKm: Number(totalKm),
      totalPings: pings.length,
      lastPing,
      polyline,
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

    let query = supabase
      .from('employee_live_locations')
      .select('user_id, latitude, longitude, speed_kmh, battery_pct, is_moving, recorded_at, branch_code')
      .eq('company', company)
      .gte('recorded_at', recentThreshold)
      .order('recorded_at', { ascending: false });

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

    const activeEmployees = Array.from(userMap.values());

    // Fetch employee names & details from user_roles
    const userIds = activeEmployees.map(e => e.user_id);
    let userDetailsMap = new Map();
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('user_roles')
        .select('id, name, email, phone, role, company, branch_code')
        .in('id', userIds);
      (users || []).forEach(u => userDetailsMap.set(u.id, u));
    }

    return activeEmployees.map(e => {
      const details = userDetailsMap.get(e.user_id) || {};
      return {
        ...e,
        name: details.name || 'Field Person',
        phone: details.phone || '',
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
