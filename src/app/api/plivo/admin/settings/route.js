import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET /api/plivo/admin/settings - Fetch current Plivo app settings
export async function GET(req) {
  try {
    const authId = (process.env.PLIVO_AUTH_ID || '').trim().replace(/['"]/g, '');
    const authToken = (process.env.PLIVO_AUTH_TOKEN || '').trim().replace(/['"]/g, '');
    const b64 = Buffer.from(`${authId}:${authToken}`).toString('base64');

    const SWAN_COMPANIES = ['nsmlr', 'nstlp', 'nstl', 'new swan group', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl'];
    const company = (req.nextUrl?.searchParams?.get('company') || '').toLowerCase().trim();
    const isSwan = !company || SWAN_COMPANIES.includes(company);
    const scopeSlug = isSwan ? '' : company.replace(/[^a-z0-9]/g, '_');
    const forwardKey = isSwan ? 'system_settings_forward' : `system_settings_forward_${scopeSlug}`;
    const inboundKey = isSwan ? 'system_settings_inbound' : `system_settings_inbound_${scopeSlug}`;

    let appsList = [];
    if (isSwan) {
      try {
        const appsRes = await fetch(`https://api.plivo.com/v1/Account/${authId}/Application/`, {
          headers: { 'Authorization': 'Basic ' + b64 }
        });
        const appsData = await appsRes.json();
        appsList = appsData.objects || [];
      } catch (err) {
        console.warn('Plivo apps fetch warning:', err);
      }
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: dbSettings } = await adminClient
      .from('call_agents')
      .select('mobile_number')
      .eq('plivo_username', forwardKey)
      .maybeSingle();

    const { data: inboundSettings } = await adminClient
      .from('call_agents')
      .select('agent_code, plivo_endpoint_key, plivo_password')
      .eq('plivo_username', inboundKey)
      .maybeSingle();

    let inboundAgentIds = [];
    try {
      if (inboundSettings?.plivo_password) {
        inboundAgentIds = JSON.parse(inboundSettings.plivo_password);
      }
    } catch(e) {}

    return NextResponse.json({
      apps: appsList,
      fromNumber: process.env.PLIVO_FROM_NUMBER || '',
      defaultForward: dbSettings?.mobile_number || (isSwan ? (process.env.DEFAULT_FORWARD_TO || '') : ''),
      routingMode: inboundSettings?.agent_code || 'simultaneous',
      stickyAgent: inboundSettings?.plivo_endpoint_key !== 'false',
      inboundAgentIds: Array.isArray(inboundAgentIds) ? inboundAgentIds : []
    });
  } catch (error) {
    console.error('Admin settings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/plivo/admin/settings - Update default forwarding number & inbound routing
export async function POST(req) {
  try {
    const body = await req.json();
    const { defaultForward, routingMode, stickyAgent, inboundAgentIds, company } = body;

    const SWAN_COMPANIES = ['nsmlr', 'nstlp', 'nstl', 'new swan group', 'swan agro', 'nse-1', 'nse-2', 'nse-6', 'nscpl', 'nsacpl'];
    const compLower = (company || '').toLowerCase().trim();
    const isSwan = !compLower || SWAN_COMPANIES.includes(compLower);
    const scopeSlug = isSwan ? '' : compLower.replace(/[^a-z0-9]/g, '_');
    const forwardKey = isSwan ? 'system_settings_forward' : `system_settings_forward_${scopeSlug}`;
    const inboundKey = isSwan ? 'system_settings_inbound' : `system_settings_inbound_${scopeSlug}`;

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (defaultForward !== undefined) {
      const { data: existingFwd } = await adminClient
        .from('call_agents')
        .select('id')
        .eq('plivo_username', forwardKey)
        .maybeSingle();

      if (existingFwd) {
        await adminClient
          .from('call_agents')
          .update({ mobile_number: defaultForward })
          .eq('plivo_username', forwardKey);
      } else {
        await adminClient
          .from('call_agents')
          .insert({
            display_name: isSwan ? 'System Forwarding Number' : `System Forwarding (${company})`,
            plivo_username: forwardKey,
            mobile_number: defaultForward,
            default_calling_mode: 'mobile',
            is_active: false,
            status: 'offline'
          });
      }
    }

    if (routingMode !== undefined || stickyAgent !== undefined || inboundAgentIds !== undefined) {
      const updatePayload = {};
      if (routingMode !== undefined) updatePayload.agent_code = routingMode;
      if (stickyAgent !== undefined) updatePayload.plivo_endpoint_key = String(stickyAgent);
      if (inboundAgentIds !== undefined) updatePayload.plivo_password = JSON.stringify(inboundAgentIds);

      const { data: existing } = await adminClient
        .from('call_agents')
        .select('id')
        .eq('plivo_username', inboundKey)
        .maybeSingle();

      if (existing) {
        await adminClient
          .from('call_agents')
          .update(updatePayload)
          .eq('plivo_username', inboundKey);
      } else {
        await adminClient
          .from('call_agents')
          .insert({
            display_name: isSwan ? 'System Inbound Routing Settings' : `Inbound Routing (${company})`,
            plivo_username: inboundKey,
            default_calling_mode: 'browser_webrtc',
            agent_code: routingMode || 'simultaneous',
            plivo_endpoint_key: String(stickyAgent ?? true),
            plivo_password: JSON.stringify(inboundAgentIds || []),
            is_active: false,
            status: 'offline'
          });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save admin settings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
