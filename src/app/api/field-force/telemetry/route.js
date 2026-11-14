import { NextResponse } from 'next/server';
import { verifyFieldTelemetryToken } from '@/utils/fieldTelemetryToken';
import { recordLocationPingBatch, reportFieldDeviceHeartbeat } from '@/app/actions/liveTracking';

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

    // Bind every ping strictly to the authenticated token's userId and tenant metadata
    const sanitizedPings = rawPings.slice(0, 200).map((p) => ({
      ...p,
      user_id: claims.uid,
      company: p?.company || claims.cmp || 'TNT00001',
      branch_code: p?.branch_code ?? claims.br ?? null
    }));

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
