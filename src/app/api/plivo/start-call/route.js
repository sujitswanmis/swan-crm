import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import plivo from 'plivo';

export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { customerNumber, callingMode, agentEndpoint, agentMobile } = body;

    if (!customerNumber || !callingMode) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;
    const fromNumber = process.env.PLIVO_FROM_NUMBER || '+918035340622';

    if (!authId || !authToken) {
      return NextResponse.json({ error: 'Plivo credentials not configured' }, { status: 500 });
    }

    const client = new plivo.Client(authId, authToken);
    const roomName = `room_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Create Call Session in DB
    const adminClient = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get Agent ID
    const { data: agentData } = await adminClient
      .from('call_agents')
      .select('id, plivo_sip_uri')
      .eq('user_id', user.id)
      .single();

    if (!agentData) {
      return NextResponse.json({ error: 'Agent profile not found' }, { status: 404 });
    }

    const { data: sessionData, error: sessionError } = await adminClient
      .from('call_sessions')
      .insert({
        room_name: roomName,
        agent_id: agentData.id,
        customer_number: customerNumber,
        calling_mode: callingMode,
        status: 'initiated',
        start_time: new Date().toISOString(),
        agent_dial_to: callingMode === 'mobile' ? agentMobile : (agentEndpoint || agentData.plivo_sip_uri)
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Session Error:', sessionError);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    let appBaseUrl = 'https://swan-hosting.vercel.app';
    // We only initiate the call to the AGENT first.
    // The answer URL will put the agent in the conference.
    // The conference callback will then dial the customer.
    
    let dialTo = '';
    if (callingMode === 'mobile') {
      dialTo = agentMobile;
    } else {
      // Browser WebRTC or External Softphone uses SIP URI
      dialTo = agentEndpoint || agentData.plivo_sip_uri;
    }

    if (!dialTo) {
       return NextResponse.json({ error: 'No endpoint or mobile number available for agent' }, { status: 400 });
    }

    const response = await client.calls.create(
      fromNumber,
      dialTo,
      `${appBaseUrl}/api/plivo/answer?room=${roomName}&role=agent&customer_number=${encodeURIComponent(customerNumber)}`,
      {
        answerMethod: 'POST',
        fallbackMethod: 'POST',
      }
    );

    await adminClient
      .from('call_sessions')
      .update({ agent_call_uuid: response.requestUuid })
      .eq('id', sessionData.id);

    return NextResponse.json({ success: true, roomName, callUuid: response.requestUuid });

  } catch (error) {
    console.error('Start call error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
