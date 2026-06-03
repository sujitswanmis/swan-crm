import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import plivo from 'plivo';

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const roomName = url.searchParams.get('room');
    
    // Parse Plivo webhook form data
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);

    // Run async background processing so we return 200 OK fast to Plivo
    processConferenceEvent(roomName, event, url.origin).catch(console.error);

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Conference callback error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}

async function processConferenceEvent(roomName, event, originUrl) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const eventType = event.ConferenceAction;
  const memberId = event.ConferenceMemberID;
  const callUuid = event.CallUUID;
  const conferenceName = event.ConferenceName;

  // Save event
  await adminClient.from('call_events').insert({
    room_name: roomName,
    call_uuid: callUuid,
    event_type: eventType,
    raw_payload: event
  });

  const { data: session } = await adminClient
    .from('call_sessions')
    .select('*')
    .eq('room_name', roomName)
    .single();

  if (!session) return;

  if (eventType === 'enter') {
    // Member joined
    if (callUuid === session.agent_call_uuid) {
      // Agent joined! Now dial the customer into the conference.
      await adminClient.from('call_sessions').update({
        agent_member_id: memberId,
        conference_name: conferenceName,
        agent_answer_time: new Date().toISOString(),
        status: 'agent_answered'
      }).eq('id', session.id);

      const authId = process.env.PLIVO_AUTH_ID;
      const authToken = process.env.PLIVO_AUTH_TOKEN;
      const fromNumber = process.env.PLIVO_FROM_NUMBER || '+918035340622';
      const client = new plivo.Client(authId, authToken);

      const appBaseUrl = 'https://swan-hosting.vercel.app';
      
      const response = await client.calls.create(
        fromNumber,
        session.customer_number,
        `${appBaseUrl}/api/plivo/answer?room=${roomName}&role=customer`,
        {
          answerMethod: 'POST',
          fallbackMethod: 'POST',
          callbackUrl: `${appBaseUrl}/api/plivo/ring-callback`,
          callbackMethod: 'POST',
        }
      );

      await adminClient.from('call_sessions').update({
        customer_call_uuid: response.requestUuid
      }).eq('id', session.id);
      
    } else if (callUuid === session.customer_call_uuid) {
      // Customer joined
      await adminClient.from('call_sessions').update({
        customer_member_id: memberId,
        customer_answer_time: new Date().toISOString(),
        status: 'connected'
      }).eq('id', session.id);
    }
  } else if (eventType === 'exit') {
     // If either leaves, end conference
     if (session.status !== 'ended') {
        await adminClient.from('call_sessions').update({
           status: 'ended',
           end_time: new Date().toISOString()
        }).eq('id', session.id);
        
        try {
           const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
           await client.conferences.hangup(conferenceName);
        } catch(e) {}
     }
  }
}
