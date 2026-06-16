import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import plivo from 'plivo';

export async function POST(req) {
  try {
    // Parse Plivo webhook form data
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);

    const url = new URL(req.url);
    const roomName = url.searchParams.get('room') || event.room || event.ConferenceName;
    const customerNumber = url.searchParams.get('customer_number') || event.customer_number;

    // Run processing sequentially so serverless function doesn't terminate early
    await processConferenceEvent(roomName, event, url.origin, customerNumber);

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
      
      // Play ringback tone to the agent while they wait
      try {
         await client.conferences.playAudioToMember(roomName, memberId, `${appBaseUrl}/ringback.wav`);
      } catch (audioErr) {
         console.error('Error playing ringback tone:', audioErr);
      }

      // Dial customer, obtain call UUID and save to DB (Awaited to prevent early freeze)
      try {
         console.log(`Dialing customer: from=${fromNumber}, to=${customerNumber}, roomName=${roomName}`);
         const dialResponse = await client.calls.create(
           fromNumber,
           customerNumber,
           `${appBaseUrl}/api/plivo/answer?room=${roomName}&role=customer`,
           {
             answerMethod: 'POST',
             fallbackMethod: 'POST',
           }
         );
         
         console.log('Dial response object:', JSON.stringify(dialResponse));
         
         if (dialResponse && dialResponse.requestUuid) {
            const dbResult = await adminClient.from('call_sessions').update({
              customer_call_uuid: dialResponse.requestUuid
            }).eq('room_name', roomName).select();
            
            console.log('Database update result for customer_call_uuid:', JSON.stringify(dbResult));
         } else {
            console.warn('Dial response is empty or requestUuid is missing!');
         }
      } catch (dialErr) {
         console.error('Error dialing customer outbound leg:', dialErr);
      }
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
    // Determine if the entering call is the agent or customer.
    // 1. If callUuid matches agent_call_uuid, it's definitely the agent.
    // 2. If callUuid matches customer_call_uuid, it's definitely the customer.
    // 3. Fallback: If agent hasn't joined yet (status is 'initiated' or agent_call_uuid is null), it's the agent.
    // 4. Otherwise, if agent has already joined, it's the customer.
    let isAgent = false;
    let isCustomer = false;
    
    if (session.agent_call_uuid && callUuid === session.agent_call_uuid) {
      isAgent = true;
    } else if (session.customer_call_uuid && callUuid === session.customer_call_uuid) {
      isCustomer = true;
    } else if (!session.agent_answer_time || session.status === 'initiated') {
      isAgent = true;
    } else {
      isCustomer = true;
    }

    if (isAgent) {
      // Agent joined
      await adminClient.from('call_sessions').update({
        agent_call_uuid: callUuid,
        agent_member_id: memberId,
        conference_name: conferenceName,
        agent_answer_time: new Date().toISOString(),
        status: 'agent_answered'
      }).eq('id', session.id);
      
    } else if (isCustomer) {
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
        
        const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);

        // 1. End the conference
        try {
           await client.conferences.hangup(conferenceName);
           console.log(`Successfully hung up conference: ${conferenceName}`);
        } catch (confErr) {
           console.error('Error ending conference:', confErr.message);
        }

        // 2. If the customer hasn't answered yet, cancel/hang up their call leg directly to stop ringing!
        if (session.status !== 'connected' && session.customer_call_uuid) {
           try {
              await client.calls.cancel(session.customer_call_uuid);
              console.log(`Successfully canceled customer call request: ${session.customer_call_uuid}`);
           } catch (cancelErr) {
              console.log(`Could not cancel request, trying hangup: ${cancelErr.message}`);
              try {
                 await client.calls.hangup(session.customer_call_uuid);
                 console.log(`Successfully hung up customer call uuid: ${session.customer_call_uuid}`);
              } catch (hangupErr) {
                 console.error(`Failed to cancel or hang up call: ${hangupErr.message}`);
              }
           }
        }
     }
  }
}
