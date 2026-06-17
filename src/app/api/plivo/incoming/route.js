import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);

    const fromNumber = event.From;
    const toNumber = event.To; // This is the Plivo Number (+918035340622)

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Default Forward Number
    let routeTo = process.env.DEFAULT_FORWARD_TO || '+919988119276';
    try {
      const { data: dbSettings } = await adminClient
        .from('call_agents')
        .select('mobile_number')
        .eq('plivo_username', 'system_settings_forward')
        .maybeSingle();
      if (dbSettings && dbSettings.mobile_number) {
        routeTo = dbSettings.mobile_number;
      }
    } catch (dbErr) {
      console.error('Error fetching global default forwarding number:', dbErr);
    }
    routeTo = routeTo.replace(/['"]/g, '').trim();

    const plivo = require('plivo');
    const plivoClient = new plivo.Client(
      (process.env.PLIVO_AUTH_ID || '').trim().replace(/['"]/g, ''),
      (process.env.PLIVO_AUTH_TOKEN || '').trim().replace(/['"]/g, '')
    );

    // Helper to verify if SIP endpoint is registered on Plivo
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

    // Sticky Agent Routing Logic
    // 1. Find the last agent who talked to this customer
    const { data: lastCall } = await adminClient
      .from('call_sessions')
      .select('agent_id')
      .eq('customer_number', fromNumber)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let targetAgentSip = null;
    let fallbackGroup = null;

    if (lastCall && lastCall.agent_id) {
      // 2. Check if this agent is online/available
      const { data: agentData } = await adminClient
        .from('call_agents')
        .select('plivo_username, plivo_sip_uri, status')
        .eq('id', lastCall.agent_id)
        .single();

      if (agentData) {
        if (agentData.status === 'available') {
          // Double-check real registration status on Plivo
          const isRegistered = await verifySipRegistered(agentData.plivo_username);
          if (isRegistered) {
            targetAgentSip = agentData.plivo_sip_uri;
          } else {
            console.warn(`[Incoming Webhook] Last agent ${agentData.plivo_username} is offline on Plivo. Updating status in DB.`);
            // Auto-heal agent status to offline
            await adminClient
              .from('call_agents')
              .update({ status: 'offline' })
              .eq('id', lastCall.agent_id);
            
            // Get department to try group fallback
            const { data: userData } = await adminClient
              .from('user_roles')
              .select('emp_department')
              .eq('user_id', (await adminClient.from('call_agents').select('user_id').eq('id', lastCall.agent_id).single()).data?.user_id)
              .single();
            
            if (userData && userData.emp_department) {
               fallbackGroup = userData.emp_department;
            }
          }
        } else {
          // Find their department/group from user_roles
          const { data: userData } = await adminClient
            .from('user_roles')
            .select('emp_department')
            .eq('user_id', (await adminClient.from('call_agents').select('user_id').eq('id', lastCall.agent_id).single()).data?.user_id)
            .single();
          
          if (userData && userData.emp_department) {
             fallbackGroup = userData.emp_department;
          }
        }
      }
    }

    // 3. If target agent is offline, try to find ANY available agent in the same group
    if (!targetAgentSip && fallbackGroup) {
      // Find user_ids in this department
      const { data: groupUsers } = await adminClient
        .from('user_roles')
        .select('user_id')
        .eq('emp_department', fallbackGroup);
        
      if (groupUsers && groupUsers.length > 0) {
        const userIds = groupUsers.map(u => u.user_id);
        const { data: availableGroupAgents } = await adminClient
          .from('call_agents')
          .select('id, plivo_username, plivo_sip_uri')
          .in('user_id', userIds)
          .eq('status', 'available');
          
        if (availableGroupAgents && availableGroupAgents.length > 0) {
          // Find the first agent in the group who is actually registered on Plivo
          for (const agent of availableGroupAgents) {
            const isRegistered = await verifySipRegistered(agent.plivo_username);
            if (isRegistered) {
              targetAgentSip = agent.plivo_sip_uri;
              break;
            } else {
              console.warn(`[Incoming Webhook] Group agent ${agent.plivo_username} is offline on Plivo. Updating status in DB.`);
              await adminClient
                .from('call_agents')
                .update({ status: 'offline' })
                .eq('id', agent.id);
            }
          }
        }
      }
    }

    if (targetAgentSip) {
      routeTo = targetAgentSip;
    }

    // Return Dial XML
    const isSip = routeTo.startsWith('sip:');
    const dialContent = isSip ? `<User>${routeTo}</User>` : `<Number>${routeTo}</Number>`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial callerId="${toNumber}">
        ${dialContent}
    </Dial>
</Response>`;

    return new NextResponse(xml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });

  } catch (error) {
    console.error('Incoming webhook error:', error);
    // Fallback Dial XML
    let routeTo = process.env.DEFAULT_FORWARD_TO || '+919988119276';
    try {
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const { data: dbSettings } = await adminClient
        .from('call_agents')
        .select('mobile_number')
        .eq('plivo_username', 'system_settings_forward')
        .maybeSingle();
      if (dbSettings && dbSettings.mobile_number) {
        routeTo = dbSettings.mobile_number;
      }
    } catch (e) {
      console.error('Catch fallback db fetch failed:', e);
    }
    routeTo = routeTo.replace(/['"]/g, '').trim();
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${toNumber || '+918035340622'}"><Number>${routeTo}</Number></Dial></Response>`;
    return new NextResponse(xml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
  }
}
