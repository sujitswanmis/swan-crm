import { getBroadcastAudience, getBroadcastReport, getMyBroadcastNotifications } from '@/app/actions/broadcastNotifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff'
};

// Reads deliberately use GET so they cannot queue behind unrelated CRM mutations.
// Every underlying read verifies the current session and its required permissions.
// Sending and acknowledgement remain authenticated Server Actions.
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const mode = params.get('mode') || 'audience';
    let result;
    if (mode === 'audience') {
      const locationsText = params.get('locations') || '[]';
      if (locationsText.length > 40000) return Response.json({ success: false, error: 'Too many branches selected.' }, { status: 400, headers: PRIVATE_HEADERS });
      let locations;
      try { locations = JSON.parse(locationsText); }
      catch { return Response.json({ success: false, error: 'Invalid branch selection.' }, { status: 400, headers: PRIVATE_HEADERS }); }
      if (!Array.isArray(locations) || locations.length > 500 || locations.some(id => typeof id !== 'string')) {
        return Response.json({ success: false, error: 'Invalid branch selection.' }, { status: 400, headers: PRIVATE_HEADERS });
      }
      result = await getBroadcastAudience(params.has('scope') ? {
        scope: params.get('scope'), workspace: params.get('workspace') || '', locations
      } : null);
      if (result.success) {
        // Preserve the action contract, but avoid sending the same user list twice over HTTP.
        result = { success: true, directory: result.directory, recipientCount: result.recipients.length, fingerprint: result.fingerprint };
      }
    } else if (mode === 'report') {
      result = await getBroadcastReport(params.get('id') || null);
    } else if (mode === 'inbox') {
      result = await getMyBroadcastNotifications(params.get('currentId') || null);
    } else {
      return Response.json({ success: false, error: 'Invalid notification request.' }, { status: 400, headers: PRIVATE_HEADERS });
    }
    return Response.json(result, { status: result.success ? 200 : result.status || 500, headers: PRIVATE_HEADERS });
  } catch {
    return Response.json({ success: false, error: 'Could not load notifications. Please retry.' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
