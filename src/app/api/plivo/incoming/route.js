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

    // 1. Fetch Global Forwarding Mobile Number
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

    // Fetch Inbound Settings (Routing Strategy, Inbound Agents, Sticky Agent)
    let routingMode = 'simultaneous'; // 'simultaneous' | 'round_robin' | 'first_available'
    let stickyEnabled = true;
    let allowedAgentIds = [];

    try {
      const { data: inboundSettings } = await adminClient
        .from('call_agents')
        .select('agent_code, plivo_endpoint_key, plivo_password')
        .eq('plivo_username', 'system_settings_inbound')
        .maybeSingle();

      if (inboundSettings) {
        if (inboundSettings.agent_code) routingMode = inboundSettings.agent_code;
        if (inboundSettings.plivo_endpoint_key === 'false') stickyEnabled = false;
        if (inboundSettings.plivo_password) {
          try {
            const parsed = JSON.parse(inboundSettings.plivo_password);
            if (Array.isArray(parsed)) allowedAgentIds = parsed;
          } catch(e) {}
        }
      }
    } catch (sErr) {
      console.error('[Incoming Webhook] Error fetching inbound settings:', sErr);
    }

    const plivo = require('plivo');
    const plivoClient = new plivo.Client(
      (process.env.PLIVO_AUTH_ID || '').trim().replace(/['"]/g, ''),
      (process.env.PLIVO_AUTH_TOKEN || '').trim().replace(/['"]/g, '')
    );

    // 2. Fetch registered SIP endpoints in 1 fast API call
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

    // 3. Lead Lookup: Find if caller is an existing lead in CRM
    const cleanDigits = fromNumber.replace(/\D/g, '').slice(-10);
    const searchPatterns = cleanDigits ? [
      `+91${cleanDigits}`,
      cleanDigits,
      `91${cleanDigits}`,
      `0${cleanDigits}`
    ] : [];

    let matchedLead = null;
    if (searchPatterns.length > 0) {
      try {
        const orCond = searchPatterns
          .map(p => `phone.eq.${p},business_contact_1.eq.${p},business_contact_2.eq.${p},cp1_mobile_2.eq.${p}`)
          .join(',');

        const { data: leads } = await adminClient
          .from('leads')
          .select('id, name, company, phone, status, assigned_to')
          .or(orCond)
          .limit(1);

        if (leads && leads.length > 0) {
          matchedLead = leads[0];
          console.log(`[Incoming Webhook] Matched CRM Lead: "${matchedLead.name || matchedLead.company}" (ID: ${matchedLead.id})`);
        }
      } catch (leadErr) {
        console.error('[Incoming Webhook] Error querying lead:', leadErr);
      }
    }

    // 4. Target Agents Determination
    let targetAgents = [];

    // Sticky Agent Check (Priority 1)
    if (stickyEnabled && searchPatterns.length > 0) {
      const { data: lastCall } = await adminClient
        .from('call_sessions')
        .select('agent_id')
        .in('customer_number', searchPatterns)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const candidateAgentId = lastCall?.agent_id || matchedLead?.assigned_to;
      if (candidateAgentId) {
        const { data: stickyAgent } = await adminClient
          .from('call_agents')
          .select('id, plivo_username, plivo_sip_uri, status')
          .eq('id', candidateAgentId)
          .maybeSingle();

        if (stickyAgent?.plivo_username) {
          const isRegistered = registeredUsernames.has(stickyAgent.plivo_username) || (registeredUsernames.size === 0 && stickyAgent.status === 'available');
          if (isRegistered && stickyAgent.plivo_sip_uri) {
            targetAgents = [stickyAgent];
            console.log(`[Incoming Webhook] Found STICKY online agent: ${stickyAgent.plivo_sip_uri}`);
            adminClient.from('call_agents').update({ status: 'available' }).eq('id', stickyAgent.id).then(() => {});
          }
        }
      }
    }

    // Inbound Team Routing (Priority 2: If no sticky agent online)
    if (targetAgents.length === 0) {
      let query = adminClient
        .from('call_agents')
        .select('id, plivo_username, plivo_sip_uri, status')
        .eq('is_active', true)
        .neq('plivo_username', 'system_settings_forward')
        .neq('plivo_username', 'system_settings_inbound');

      // Filter to only selected inbound agents if admin specified a list
      if (allowedAgentIds.length > 0) {
        query = query.in('id', allowedAgentIds);
      }

      const { data: poolAgents } = await query;
      const onlineAgents = (poolAgents || []).filter(a =>
        a.plivo_username && (registeredUsernames.has(a.plivo_username) || (registeredUsernames.size === 0 && a.status === 'available'))
      );

      console.log(`[Incoming Webhook] Online Inbound Agents count: ${onlineAgents.length} (Strategy: ${routingMode})`);

      if (onlineAgents.length > 0) {
        if (routingMode === 'simultaneous') {
          // Option 1: All online inbound agents ring together!
          targetAgents = onlineAgents;
        } else {
          // Option 2 & 3: Pick single target agent
          targetAgents = [onlineAgents[0]];
        }

        // Auto-heal status to available for target agents
        targetAgents.forEach(a => {
          adminClient.from('call_agents').update({ status: 'available' }).eq('id', a.id).then(() => {});
        });
      }
    }

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const fallbackActionUrl = `${protocol}://${host}/api/plivo/incoming-fallback`;

    // 5. Generate Response XML with Custom Lead Headers
    let xml = '';

    if (targetAgents.length > 0) {
      const leadNameSafe = encodeURIComponent(matchedLead?.name || '');
      const leadCompanySafe = encodeURIComponent(matchedLead?.company || '');
      const leadIdSafe = matchedLead?.id || '';
      const sipHeaders = `X-Lead-Name=${leadNameSafe},X-Lead-Company=${leadCompanySafe},X-Lead-Id=${leadIdSafe}`;

      const callerDisplayName = matchedLead
        ? (matchedLead.name && matchedLead.company ? `${matchedLead.name} - ${matchedLead.company}` : (matchedLead.name || matchedLead.company))
        : fromNumber;

      const userElements = targetAgents
        .map(a => `        <User sipHeaders="${sipHeaders}">${a.plivo_sip_uri}</User>`)
        .join('\n');

      console.log(`[Incoming Webhook] Ringing ${targetAgents.length} agent(s) (Lead: "${callerDisplayName}"). Timeout: 25s.`);

      xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial callerId="${fromNumber}" callerName="${callerDisplayName}" timeout="25" action="${fallbackActionUrl}">
${userElements}
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
    let routeTo = process.env.DEFAULT_FORWARD_TO || '+917888399954';
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${event?.To || '+918035340622'}"><Number>${routeTo}</Number></Dial></Response>`;
    return new NextResponse(xml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
  }
}
