import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { verifyFieldTelemetryToken } from '@/utils/fieldTelemetryToken';
import { recordLocationPingBatch, reportFieldDeviceHeartbeat } from '@/app/actions/liveTracking';

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// In-memory cache to avoid querying attendance_records on every high-frequency ping (40s TTL):
const attendanceDutyCache = new Map();

async function checkUserOnDuty(userId) {
  if (!userId) return false;
  const now = Date.now();
  const cached = attendanceDutyCache.get(userId);
  if (cached && now < cached.expiresAt) {
    return cached.isPunchedIn;
  }
  try {
    const admin = getAdminClient();
    const todayIST = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    const { data, error } = await admin
      .from('attendance_records')
      .select('id, in_time, out_time')
      .eq('user_id', userId)
      .eq('attendance_date', todayIST)
      .order('in_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[telemetry/route] checkUserOnDuty error:', error.message);
      return true; // Fail-safe: don't block valid tracking on temporary DB read error
    }

    const isPunchedIn = Boolean(data && data.in_time && !data.out_time);
    attendanceDutyCache.set(userId, { isPunchedIn, expiresAt: now + 40000 });
    return isPunchedIn;
  } catch (err) {
    console.warn('[telemetry/route] checkUserOnDuty exception:', err?.message || err);
    return true; // Fail-safe fallback
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
    }

    const authHeader = request.headers.get('authorization') || '';
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    const token = bearerToken || body.token || '';

    const claims = verifyFieldTelemetryToken(token);
    if (!claims) {
      return NextResponse.json({ success: false, error: 'Invalid or expired telemetry token' }, { status: 401 });
    }

    let statusAccepted;
    if (body.deviceStatus !== undefined) {
      // A rejected diagnostic must never prevent the existing GPS queue from syncing.
      try { statusAccepted = (await reportFieldDeviceHeartbeat(token, body.deviceStatus))?.success === true; }
      catch { statusAccepted = false; }
    }
    const rawPings = Array.isArray(body.pings) ? body.pings : [];
    if (rawPings.length === 0) {
      return NextResponse.json({ success: true, count: 0, ...(statusAccepted !== undefined ? { statusAccepted } : {}) });
    }

    // Verify whether the employee is currently on official duty (punched in today without punch-out)
    const isOnDuty = await checkUserOnDuty(claims.uid);
    const nowMs = Date.now();

    // Bind every ping strictly to the authenticated token's userId and tenant metadata.
    // IMPORTANT: Buffered/offline pings (recorded earlier while tracking was active on duty, e.g. synced after Punch-Out
    // or after reconnecting from offline mode) MUST be preserved and saved, never silently dropped & deleted from SQLite.
    const sanitizedPings = rawPings
      .slice(0, 200)
      .filter((p) => {
        if (isOnDuty) return true;
        const isBufferedOffline = Boolean(p?.is_offline_synced);
        const recMs = p?.recorded_at ? Date.parse(p.recorded_at) : NaN;
        const isHistoricalFix = Number.isFinite(recMs) && (nowMs - recMs > 45000);
        return isBufferedOffline || isHistoricalFix;
      })
      .map((p) => ({
        ...p,
        user_id: claims.uid,
        company: p?.company || claims.cmp || 'TNT00001',
        branch_code: p?.branch_code ?? claims.br ?? null
      }));

    if (sanitizedPings.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        dutyStatus: 'OFF_DUTY',
        message: 'Tracking inactive outside official punch-in duty hours',
        ...(statusAccepted !== undefined ? { statusAccepted } : {})
      });
    }

    const result = await recordLocationPingBatch(sanitizedPings);
    if (!result?.success) {
      return NextResponse.json(
        { success: false, error: result?.error || 'Failed to persist telemetry batch' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: result.count || 0,
      ...(statusAccepted !== undefined ? { statusAccepted } : {}),
      skippedLowAccuracy: result.skippedLowAccuracy || 0
    });
  } catch (err) {
    console.error('Field telemetry endpoint error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
