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
    const customerNumber = url.searchParams.get('customer_number');

    // Run processing sequentially so serverless function doesn't terminate early
    await processConferenceEvent(roomName, event, url.origin, customerNumber).catch(console.error);

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Conference callback error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}

async function processConferenceEvent(roomName, event, originUrl, customerNumber) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const eventType = event.ConferenceAction;
  const memberId = event.ConferenceMemberID;
  const callUuid = event.CallUUID;
  const conferenceName = event.ConferenceName;

  // 1. FAST PATH: Dial customer instantly before ANY database operations to guarantee 0 latency!
  if (eventType === 'enter' && event.ConferenceFirstMember === 'true' && customerNumber) {
      const authId = process.env.PLIVO_AUTH_ID;
      const authToken = process.env.PLIVO_AUTH_TOKEN;
      const fromNumber = process.env.PLIVO_FROM_NUMBER || '+918035340622';
      const client = new plivo.Client(authId, authToken);
      const appBaseUrl = 'https://swan-hosting.vercel.app';
      
      // Fire and forget the Plivo API call instantly!
      client.calls.create(
        fromNumber,
        customerNumber,
        `${appBaseUrl}/api/plivo/answer?room=${roomName}&role=customer`,
        {
          answerMethod: 'POST',
          fallbackMethod: 'POST',
          callbackUrl: `${appBaseUrl}/api/plivo/ring-callback`,
          callbackMethod: 'POST',
        }
      ).catch(console.error);

      // Explicitly play ringback tone to the agent while they wait
      client.conferences.playAudioToMember(roomName, memberId, `${appBaseUrl}/ringback.wav`).catch(console.error);
  }

  // 2. BACKGROUND DATABASE OPERATIONS (Runs after dialing)
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
    if (event.ConferenceFirstMember === 'true' || callUuid === session.agent_call_uuid) {
      // Agent joined
      await adminClient.from('call_sessions').update({
        agent_call_uuid: callUuid,
        agent_member_id: memberId,
        conference_name: conferenceName,
        agent_answer_time: new Date().toISOString(),
        status: 'agent_answered'
      }).eq('id', session.id);
      
    } else if (event.ConferenceFirstMember !== 'true' || callUuid === session.customer_call_uuid) {
      // Customer joined
      await adminClient.from('call_sessions').update({
        customer_call_uuid: callUuid, // Save it just in case
        customer_member_id: memberId,
        customer_answer_time: new Date().toISOString(),
        status: 'connected'
      }).eq('id', session.id);
      
      // Stop ringback for the agent
      if (session.agent_member_id) {
         try {
             const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
             await client.conferences.stopPlayingAudioToMember(roomName, session.agent_member_id);
         } catch(e) {}
      }
    }
  } else if (eventType === 'exit') {
     // If the AGENT leaves, end the conference for everyone
     if (memberId === session.agent_member_id && session.status !== 'ended') {
        const endTime = new Date();
        const customerAnsTime = session.customer_answer_time ? new Date(session.customer_answer_time) : null;
        const agentAnsTime = session.agent_answer_time ? new Date(session.agent_answer_time) : null;
        const startTime = session.start_time ? new Date(session.start_time) : (agentAnsTime || endTime);
        
        let ringingSec = null;
        let talkSec = null;

        if (customerAnsTime) {
           talkSec = Math.floor((endTime - customerAnsTime) / 1000);
           ringingSec = Math.floor((customerAnsTime - (agentAnsTime || startTime)) / 1000);
        } else {
           // Missed call / not answered by customer
           ringingSec = Math.floor((endTime - (agentAnsTime || startTime)) / 1000);
           talkSec = 0;
        }

        if (ringingSec < 0) ringingSec = 0;
        if (talkSec < 0) talkSec = 0;

        await adminClient.from('call_sessions').update({
           status: 'ended',
           end_time: endTime.toISOString(),
           ringing_duration_sec: ringingSec,
           talk_duration_sec: talkSec
        }).eq('id', session.id);
        
        try {
           const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
           await client.conferences.hangup(conferenceName);
        } catch(e) {}
     }
  }
}
