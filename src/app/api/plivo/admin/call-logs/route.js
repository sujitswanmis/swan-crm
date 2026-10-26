import { NextResponse } from 'next/server';
import { requireCallCenterAccess, readWorkspaceAdmin, readPageCalls, pageParameters, privateHeaders } from '@/lib/callCenterPageData';
import { getWorkspaceTelephonyConfig } from '@/utils/telephonyConfig';

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
    const url = new URL(`https://api.plivo.com/v1/Account/${config.authId}/Call/`);
    url.searchParams.set('limit', limit);
    url.searchParams.set('offset', offset);
    const start = params.get('start_date');
    const end = params.get('end_date');
    if (start && Number.isFinite(Date.parse(start))) url.searchParams.set('end_time__gte', start.replace('T', ' ').split('.')[0]);
    if (end && Number.isFinite(Date.parse(end))) url.searchParams.set('end_time__lte', end.replace('T', ' ').split('.')[0]);
    const response = await fetch(url, { headers: { Authorization: `Basic ${Buffer.from(`${config.authId}:${config.authToken}`).toString('base64')}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok) throw new Error('Provider call logs could not be loaded.');
    return NextResponse.json({ calls: data.objects || [], total: data.meta?.total_count || 0 }, { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ error: error.status ? error.message : 'Call logs could not be loaded. Please retry.' }, { status: error.status || 503, headers: privateHeaders });
  }
}
