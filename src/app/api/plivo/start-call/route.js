import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import plivo from 'plivo';
import { getPlivoWebhookBaseUrl } from '@/app/api/plivo/utils';
import { normalizeIndianPhoneNumber } from '@/app/api/plivo/phone-number';
import { outboundRoomToken } from '@/app/api/plivo/outbound-intent';

export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { customerNumber, callingMode, agentMobile, roomName: clientRoomName } = body;

    if (!customerNumber || !callingMode) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    if (!['browser_webrtc', 'mobile', 'external_softphone'].includes(callingMode)) {
      return NextResponse.json({ error: 'Invalid calling mode' }, { status: 400 });
    }
    if (clientRoomName && !/^room_[A-Za-z0-9_]{1,64}$/.test(clientRoomName)) {
      return NextResponse.json({ error: 'Invalid call room' }, { status: 400 });
    }
    const normalizedCustomerNumber = normalizeIndianPhoneNumber(customerNumber);
    if (!normalizedCustomerNumber) {
      return NextResponse.json({ error: 'Valid 10-digit Indian phone number required' }, { status: 400 });
    }

    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;
    const fromNumber = process.env.PLIVO_FROM_NUMBER || '+918035340622';

    if (!authId || !authToken) {
      return NextResponse.json({ error: 'Plivo credentials not configured' }, { status: 500 });
    }

    const client = new plivo.Client(authId, authToken);
    const roomName = clientRoomName || `room_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const outboundToken = outboundRoomToken(roomName);

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
    const dialTo = callingMode === 'mobile'
      ? normalizeIndianPhoneNumber(agentMobile)
      : agentData.plivo_sip_uri;
    if (!dialTo) {
      return NextResponse.json({ error: 'Valid agent endpoint or mobile number required' }, { status: 400 });
    }

    const { data: sessionData, error: sessionError } = await adminClient
      .from('call_sessions')
      .insert({
        room_name: roomName,
        agent_id: agentData.id,
        customer_number: normalizedCustomerNumber,
        calling_mode: callingMode,
        status: 'initiated',
        start_time: new Date().toISOString(),
        agent_dial_to: dialTo,
        conference_name: (process.env.PLIVO_OUTBOUND_FLOW === 'conference' || body?.flow === 'conference') ? roomName : null
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Session Error:', sessionError);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    let appBaseUrl = getPlivoWebhookBaseUrl(req);
    // Direct Dial with real carrier audio is the default (v1.0.668).
    // The conference path remains available when multi-party conference is explicitly selected.
    const isConference = (process.env.PLIVO_OUTBOUND_FLOW === 'conference' || body?.flow === 'conference');
    const answerPath = isConference
      ? `/api/plivo/answer?room=${roomName}&role=agent`
      : `/api/plivo/outbound-dial?room=${roomName}`;
    
    let response;
    try {
      response = await client.calls.create(
        fromNumber,
        dialTo,
        `${appBaseUrl}${answerPath}`,
        {
          answerMethod: 'POST',
          fallbackMethod: 'POST',
          hangupUrl: `${appBaseUrl}/api/plivo/ring-callback?room=${roomName}&leg=agent`,
          hangupMethod: 'POST',
          ringTimeout: 35,
          ...(callingMode === 'browser_webrtc' ? {
            sipHeaders: `CrmRoom=${outboundToken}`,
            callerName: `CRM${outboundToken}`,
          } : {}),
        }
      );
      if (!response?.requestUuid) throw new Error('Provider did not accept the agent call');
    } catch (dialError) {
      await adminClient.from('call_sessions').update({
        status: 'failed',
        hangup_cause: 'agent_dial_error',
        end_time: new Date().toISOString()
      }).eq('id', sessionData.id);
      throw dialError;
    }

    const { data: updatedRows } = await adminClient
      .from('call_sessions')
      .update({ agent_call_uuid: response.requestUuid })
      .eq('id', sessionData.id)
      .is('agent_call_uuid', null)
      .select('*');

    let updatedSession = updatedRows?.[0];
    if (!updatedSession) {
      const { data: latestSession } = await adminClient.from('call_sessions')
        .select('*').eq('id', sessionData.id).maybeSingle();
      updatedSession = latestSession || { ...sessionData, agent_call_uuid: response.requestUuid };
    }

    return NextResponse.json({ 
      success: true, 
      roomName, 
      callUuid: response.requestUuid,
      session: updatedSession
    });

  } catch (error) {
    console.error('Start call error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
