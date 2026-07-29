import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // Helper to verify if SIP endpoint is currently registered on Plivo
    const verifySipRegistered = async (username) => {
      if (!username) return false;
      try {
        const endpoints = await plivoClient.endpoints.list();
        const ep = endpoints.find(e => e.username === username);
        const registered = ep && ep.sipRegistered === 'true';
        console.log(`[Incoming Webhook] Endpoint ${username} registration check: ${registered}`);
        return registered;
      } catch (err) {
        console.error(`[Incoming Webhook] Error checking registration for ${username}:`, err.message);
        return true; // Fallback to true on API error to avoid blocking call
      }
    };

    let targetAgentSip = null;
    let fallbackGroup = null;

    // 1. STICKY AGENT ROUTING: Find last agent who talked to this caller
    const { data: lastCall } = await adminClient
      .from('call_sessions')
      .select('agent_id')
      .eq('customer_number', fromNumber)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lastCall && lastCall.agent_id) {
      const { data: agentData } = await adminClient
        .from('call_agents')
        .select('id, plivo_username, plivo_sip_uri, status')
        .eq('id', lastCall.agent_id)
        .single();

      if (agentData && agentData.status === 'available') {
        const isRegistered = await verifySipRegistered(agentData.plivo_username);
        if (isRegistered) {
          targetAgentSip = agentData.plivo_sip_uri;
        } else {
          // Auto-heal offline agent status
          await adminClient.from('call_agents').update({ status: 'offline' }).eq('id', lastCall.agent_id);
        }
      }
    }

    // 2. ANY AVAILABLE AGENT ROUTING: If no sticky agent, find ANY online available agent in system
    if (!targetAgentSip) {
      const { data: availableAgents } = await adminClient
        .from('call_agents')
        .select('id, plivo_username, plivo_sip_uri')
        .eq('status', 'available')
        .neq('plivo_username', 'system_settings_forward');

      if (availableAgents && availableAgents.length > 0) {
        for (const agent of availableAgents) {
          const isRegistered = await verifySipRegistered(agent.plivo_username);
          if (isRegistered && agent.plivo_sip_uri) {
            targetAgentSip = agent.plivo_sip_uri;
            break;
          } else {
            await adminClient.from('call_agents').update({ status: 'offline' }).eq('id', agent.id);
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
      console.log(`[Incoming Webhook] WebRTC Agent Found: ${targetAgentSip}. Ringing WebRTC first with 20s timeout.`);
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial callerId="${toNumber}" timeout="20" action="${fallbackActionUrl}">
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
