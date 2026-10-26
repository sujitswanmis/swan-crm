import { NextResponse } from 'next/server';
import { requireCallCenterAccess, readWorkspaceAdmin, privateHeaders } from '@/lib/callCenterPageData';
import { getWorkspaceTelephonyConfig, getWorkspaceCallingSeatQuota } from '@/utils/telephonyConfig';

export async function GET(req) {
  try {
    const section = new URL(req.url).searchParams.get('section') || 'agents';
    if (!['agents', 'endpoints', 'monitor', 'settings', 'telephony'].includes(section)) {
      return NextResponse.json({ error: 'Invalid administration section.' }, { status: 400, headers: privateHeaders });
    }
    const context = await requireCallCenterAccess(req, { section });
    // Quota/settings are optional secondary data; they never hold the employee table open.
    if (new URL(req.url).searchParams.get('summary') === '1') {
      const [quota, config] = await Promise.all([
        getWorkspaceCallingSeatQuota(context.company, context.tenantId),
        getWorkspaceTelephonyConfig(context.company, context.tenantId)
      ]);
      return NextResponse.json({ seatQuota: quota, defaultCallerId: config.fromNumber || '' }, { headers: privateHeaders });
    }
    const data = await readWorkspaceAdmin(context);
    if (!['agents', 'endpoints'].includes(section)) {
      data.agents = data.agents.map(({ plivo_password, ...agent }) => ({ ...agent, has_password: Boolean(plivo_password) }));
      data.endpoints = data.endpoints.map(({ password, ...endpoint }) => ({ ...endpoint, has_password: Boolean(password) }));
    }
    return NextResponse.json(data, { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ error: error.status ? error.message : 'Call administration could not be loaded.' }, { status: error.status || 503, headers: privateHeaders });
  }
}
