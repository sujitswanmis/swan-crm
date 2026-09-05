import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'Plivo Incoming Call Webhook',
    method: 'POST only (configured in Plivo application)'
  });
}

export async function POST(req) {
  try {
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);

    const fromNumber = event.From || '';
    const toNumber = event.To || '+918035340622'; // Plivo Production Number

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Fetch Global Forwarding Mobile Number
    let defaultForwardMobile = process.env.DEFAULT_FORWARD_TO || '+917888399954';
    try {
      const { data: dbSettings } = await adminClient
        .from('call_agents')
        .select('mobile_number')
        .eq('plivo_username', 'system_settings_forward')
        .maybeSingle();
      if (dbSettings && dbSettings.mobile_number) {
        defaultForwardMobile = dbSettings.mobile_number;
      }
    } catch (dbErr) {
      console.error('[Incoming Webhook] Error fetching global default forwarding number:', dbErr);
    }
    defaultForwardMobile = defaultForwardMobile.replace(/['"]/g, '').trim();

    const plivo = require('plivo');
    const plivoClient = new plivo.Client(
      (process.env.PLIVO_AUTH_ID || '').trim().replace(/['"]/g, ''),
      (process.env.PLIVO_AUTH_TOKEN || '').trim().replace(/['"]/g, '')
    );

    // Fetch registered SIP endpoints in 1 fast API call
    let registeredUsernames = new Set();
    try {
      const endpoints = await plivoClient.endpoints.list();
      registeredUsernames = new Set(
        (endpoints || [])
          .filter(e => e.sipRegistered === 'true' || e.sipRegistered === true)
          .map(e => e.username)
      );
      console.log(`[Incoming Webhook] Currently registered Plivo endpoints:`, Array.from(registeredUsernames));
    } catch (epErr) {
      console.error('[Incoming Webhook] Error checking registered endpoints:', epErr.message);
    }

    let targetAgentSip = null;

    // 1. Normalize From number and search for STICKY AGENT
    const cleanDigits = fromNumber.replace(/\D/g, '').slice(-10);
    const searchPatterns = cleanDigits ? [
      `+91${cleanDigits}`,
      cleanDigits,
      `91${cleanDigits}`,
      `0${cleanDigits}`
    ] : [];

    if (searchPatterns.length > 0) {
      const { data: lastCall } = await adminClient
        .from('call_sessions')
        .select('agent_id')
        .in('customer_number', searchPatterns)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastCall && lastCall.agent_id) {
        const { data: agentData } = await adminClient
          .from('call_agents')
          .select('id, plivo_username, plivo_sip_uri, status')
          .eq('id', lastCall.agent_id)
          .maybeSingle();

        if (agentData && agentData.plivo_username) {
          const isRegistered = registeredUsernames.has(agentData.plivo_username) || (registeredUsernames.size === 0 && agentData.status === 'available');
          if (isRegistered && agentData.plivo_sip_uri) {
            targetAgentSip = agentData.plivo_sip_uri;
            console.log(`[Incoming Webhook] Found STICKY agent online: ${targetAgentSip}`);
            adminClient.from('call_agents').update({ status: 'available' }).eq('id', agentData.id).then(() => {});
          }
        }
      }
    }

    // 2. ANY AVAILABLE AGENT ROUTING: If no sticky agent online, find ANY online registered agent in system
    if (!targetAgentSip) {
      const { data: activeAgents } = await adminClient
        .from('call_agents')
        .select('id, plivo_username, plivo_sip_uri, status')
        .eq('is_active', true)
        .neq('plivo_username', 'system_settings_forward');

      if (activeAgents && activeAgents.length > 0) {
        for (const agent of activeAgents) {
          if (agent.plivo_username && (registeredUsernames.has(agent.plivo_username) || (registeredUsernames.size === 0 && agent.status === 'available'))) {
            targetAgentSip = agent.plivo_sip_uri;
            console.log(`[Incoming Webhook] Found AVAILABLE agent online: ${targetAgentSip}`);
            adminClient.from('call_agents').update({ status: 'available' }).eq('id', agent.id).then(() => {});
            break;
          }
        }
      }
    }

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const fallbackActionUrl = `${protocol}://${host}/api/plivo/incoming-fallback`;

    // 3. GENERATE PLIVO XML RESPONSE
    let xml = '';

    if (targetAgentSip) {
      console.log(`[Incoming Webhook] WebRTC Agent Found: ${targetAgentSip}. Ringing WebRTC widget with 25s timeout.`);
      const callerIdToDisplay = fromNumber || toNumber;
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial callerId="${callerIdToDisplay}" timeout="25" action="${fallbackActionUrl}">
        <User>${targetAgentSip}</User>
    </Dial>
</Response>`;
    } else {
      console.log(`[Incoming Webhook] No online WebRTC agent available. Forwarding call directly to mobile ${defaultForwardMobile}.`);
      const missedCallActionUrl = `${protocol}://${host}/api/plivo/missed-call-handler`;
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial callerId="${toNumber}" timeout="25" action="${missedCallActionUrl}">
        <Number>${defaultForwardMobile}</Number>
    </Dial>
</Response>`;
    }

    return new NextResponse(xml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });

  } catch (error) {
    console.error('Incoming webhook error:', error);
    let routeTo = process.env.DEFAULT_FORWARD_TO || '+919988119276';
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${event?.To || '+918035340622'}"><Number>${routeTo}</Number></Dial></Response>`;
    return new NextResponse(xml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
  }
}
