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
        .select('plivo_sip_uri, status')
        .eq('id', lastCall.agent_id)
        .single();

      if (agentData) {
        if (agentData.status === 'available') {
          targetAgentSip = agentData.plivo_sip_uri;
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
        const { data: availableGroupAgent } = await adminClient
          .from('call_agents')
          .select('plivo_sip_uri')
          .in('user_id', userIds)
          .eq('status', 'available')
          .limit(1)
          .single();
          
        if (availableGroupAgent) {
          targetAgentSip = availableGroupAgent.plivo_sip_uri;
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
    const routeTo = process.env.DEFAULT_FORWARD_TO || '+919988119276';
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Number>${routeTo}</Number></Dial></Response>`;
    return new NextResponse(xml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
  }
}
