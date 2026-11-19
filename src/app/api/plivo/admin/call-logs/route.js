import { NextResponse } from 'next/server';
import { requireCallCenterAccess, readWorkspaceAdmin, readPageCalls, pageParameters, privateHeaders } from '@/lib/callCenterPageData';
import { getWorkspaceTelephonyConfig } from '@/utils/telephonyConfig';

const plivoCountCache = new Map();

function toPlivoUtcTimestamp(dateStr) {
  if (!dateStr || !Number.isFinite(Date.parse(dateStr))) return null;
  // Convert ISO/IST date into UTC 'YYYY-MM-DD HH:mm:ss' which Plivo API strictly requires
  return new Date(dateStr).toISOString().replace('T', ' ').slice(0, 19);
}

async function resolvePlivoTotalCount(config, authHeader, startUtc, endUtc) {
  const cacheKey = `${config.authId}:${startUtc || 'all'}:${endUtc || 'all'}`;
  const cached = plivoCountCache.get(cacheKey);
  const now = Date.now();
  if (cached && (now - cached.timestamp < 60000)) {
    return cached.count;
  }

  const buildProbeUrl = (offset) => {
    const url = new URL(`https://api.plivo.com/v1/Account/${config.authId}/Call/`);
    url.searchParams.set('limit', '1');
    url.searchParams.set('offset', String(offset));
    if (startUtc) url.searchParams.set('end_time__gte', startUtc);
    if (endUtc) url.searchParams.set('end_time__lte', endUtc);
    return url;
  };

  const checkOffset = async (offset) => {
    try {
      const res = await fetch(buildProbeUrl(offset), {
        headers: { Authorization: authHeader },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000)
      });
      const data = await res.json();
      return Boolean(data.objects && data.objects.length > 0);
    } catch {
      return false;
    }
  };

  try {
    // Round 1: Coarse brackets in parallel
    const coarse = [0, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800];
    const r1 = await Promise.all(coarse.map(checkOffset));

    let lowIdx = -1;
    for (let i = 0; i < coarse.length; i++) {
      if (r1[i]) lowIdx = i;
    }

    if (lowIdx === -1) {
      plivoCountCache.set(cacheKey, { count: 0, timestamp: now });
      return 0;
    }

    const low = coarse[lowIdx];
    const high = (lowIdx + 1 < coarse.length) ? coarse[lowIdx + 1] : low + 50;

    // Round 2: Subdivisions in parallel
    const step = Math.max(1, Math.floor((high - low) / 10));
    const subOffsets = [];
    for (let cur = low + step; cur < high; cur += step) {
      subOffsets.push(cur);
    }

    const r2 = await Promise.all(subOffsets.map(checkOffset));
    let subLow = low;
    let subHigh = high;
    for (let i = 0; i < subOffsets.length; i++) {
      if (r2[i]) {
        subLow = subOffsets[i];
      } else {
        subHigh = subOffsets[i];
        break;
      }
    }

    // Round 3: Binary search in small range (< 20 elements)
    let l = subLow;
    let r = subHigh;
    let best = subLow;
    while (l <= r) {
      const mid = Math.floor((l + r) / 2);
      if (await checkOffset(mid)) {
        best = mid;
        l = mid + 1;
      } else {
        r = mid - 1;
      }
    }

    const count = best + 1;
    plivoCountCache.set(cacheKey, { count, timestamp: now });
    return count;
  } catch (err) {
    console.error('Error resolving Plivo total count:', err);
    return null;
  }
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
    const { limit, offset, isAll } = pageParameters(params);

    const startUtc = toPlivoUtcTimestamp(params.get('start_date'));
    const endUtc = toPlivoUtcTimestamp(params.get('end_date'));

    const authHeader = `Basic ${Buffer.from(`${config.authId}:${config.authToken}`).toString('base64')}`;

    // Plivo caps each request to maximum 20 records.
    // Paginate in chunks of up to 20 to fulfill the requested page size (e.g. 25, 50, 100, or up to 500 for 'All').
    const maxChunk = 20;
    let remaining = isAll ? 500 : limit;
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

    let total = apiTotalCount;
    if (total == null) {
      if (offset === 0 && !hasMore) {
        total = allCalls.length;
      } else {
        const resolved = await resolvePlivoTotalCount(config, authHeader, startUtc, endUtc);
        if (resolved != null && resolved >= offset + allCalls.length) {
          total = resolved;
        } else {
          total = hasMore ? offset + allCalls.length + 1 : offset + allCalls.length;
        }
      }
    }

    return NextResponse.json({
      calls: allCalls,
      total,
      hasMore: total > (offset + allCalls.length)
    }, { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: error.status ? error.message : (error.message || 'Call logs could not be loaded. Please retry.') },
      { status: error.status || 503, headers: privateHeaders }
    );
  }
}
