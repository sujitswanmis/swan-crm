import { NextResponse } from 'next/server';
import { requireCallCenterAccess, readWorkspaceAdmin, readPageCalls, pageParameters, privateHeaders } from '@/lib/callCenterPageData';
import { getWorkspaceTelephonyConfig } from '@/utils/telephonyConfig';

function toPlivoUtcTimestamp(dateStr) {
  if (!dateStr || !Number.isFinite(Date.parse(dateStr))) return null;
  // Convert ISO/IST date into UTC 'YYYY-MM-DD HH:mm:ss' which Plivo API strictly requires
  return new Date(dateStr).toISOString().replace('T', ' ').slice(0, 19);
}

export async function GET(req) {
  try {
    const context = await requireCallCenterAccess(req, { section: 'calllogs' });
    const params = new URL(req.url).searchParams;
    if (params.get('source') !== 'plivo') {
      const workspace = await readWorkspaceAdmin(context, { includeEndpoints: false });
      const result = await readPageCalls(context, params, workspace.agents, workspace.users);
      return NextResponse.json(result, { headers: privateHeaders });
    }
    const config = await getWorkspaceTelephonyConfig(context.company, context.tenantId);
    // Preserve the existing restriction on raw provider CDR access.
    if (!config.isSwan) return NextResponse.json({ calls: [], total: 0 }, { headers: privateHeaders });
    const { limit, offset } = pageParameters(params);

    const startUtc = toPlivoUtcTimestamp(params.get('start_date'));
    const endUtc = toPlivoUtcTimestamp(params.get('end_date'));

    const authHeader = `Basic ${Buffer.from(`${config.authId}:${config.authToken}`).toString('base64')}`;

    // Plivo caps each request to maximum 20 records.
    // Paginate in chunks of up to 20 to fulfill the requested page size (e.g. 25, 50, 100).
    const maxChunk = 20;
    let remaining = limit;
    let currentOffset = offset;
    let allCalls = [];
    let hasMore = false;
    let apiTotalCount = null;

    while (remaining > 0) {
      const fetchLimit = Math.min(maxChunk, remaining);
      const url = new URL(`https://api.plivo.com/v1/Account/${config.authId}/Call/`);
      url.searchParams.set('limit', String(fetchLimit));
      url.searchParams.set('offset', String(currentOffset));
      if (startUtc) url.searchParams.set('end_time__gte', startUtc);
      if (endUtc) url.searchParams.set('end_time__lte', endUtc);

      const response = await fetch(url, {
        headers: { Authorization: authHeader },
        cache: 'no-store',
        signal: AbortSignal.timeout(15000)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Provider call logs could not be loaded.');
      }

      if (data.meta?.total_count != null) {
        apiTotalCount = Number(data.meta.total_count);
      }

      const batch = data.objects || [];
      allCalls = allCalls.concat(batch);
      hasMore = Boolean(data.meta?.next);

      if (batch.length < fetchLimit || !hasMore) {
        break;
      }

      remaining -= batch.length;
      currentOffset += batch.length;
    }

    const computedTotal = apiTotalCount != null
      ? apiTotalCount
      : (hasMore ? offset + allCalls.length + 1 : offset + allCalls.length);

    return NextResponse.json({
      calls: allCalls,
      total: computedTotal,
      hasMore
    }, { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: error.status ? error.message : (error.message || 'Call logs could not be loaded. Please retry.') },
      { status: error.status || 503, headers: privateHeaders }
    );
  }
}
