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

  // 1. FAST PATH: Dial customer instantly when agent is first member in conference
  if (eventType === 'enter' && event.ConferenceFirstMember === 'true' && customerNumber) {
    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;
    const fromNumber = process.env.PLIVO_FROM_NUMBER || '+918035340622';
    const client = new plivo.Client(authId, authToken);
    const appBaseUrl = originUrl;

    // NOTE: waitSound on the agent's Conference XML (answer/route.js) already handles
    // continuous ringback. The one-time playAudioToMember call is intentionally
    // removed to avoid duplicate/overlapping audio.

    // Dial customer with ring/hangup callbacks and explicit ring timeout.
    // SDK verified params: hangupUrl, hangupMethod, ringTimeout (call.js lines 704, 705, 718)
    try {
      console.log(`Dialing customer: from=${fromNumber}, to=${customerNumber}, room=${roomName}`);

      // Guard: check if customer call already exists for this session
      const { data: existingSession } = await adminClient
        .from('call_sessions')
        .select('id, customer_call_uuid, status')
        .eq('room_name', roomName)
        .single();

      if (existingSession && (
        existingSession.customer_call_uuid ||
        existingSession.status === 'customer_ringing' ||
        existingSession.status === 'connected'
      )) {
        console.log('Customer call already exists, skipping duplicate dial:', existingSession.status);
      } else {
        const ringCallbackUrl = `${appBaseUrl}/api/plivo/ring-callback?room=${roomName}&leg=customer`;
        const dialResponse = await client.calls.create(
          fromNumber,
          customerNumber,
          `${appBaseUrl}/api/plivo/answer?room=${roomName}&role=customer`,
          {
            answerMethod: 'POST',
            fallbackMethod: 'POST',
            hangupUrl: `${appBaseUrl}/api/plivo/ring-callback?room=${roomName}&leg=customer`,
            hangupMethod: 'POST',
            ringUrl: ringCallbackUrl,
            ringMethod: 'POST',
            ringTimeout: 25,
          }
        );

        console.log('Dial response object:', JSON.stringify(dialResponse));

        if (dialResponse && dialResponse.requestUuid) {
          const dbResult = await adminClient
            .from('call_sessions')
            .update({
              customer_call_uuid: dialResponse.requestUuid,
              status: 'customer_ringing',
            })
            .eq('room_name', roomName)
            .select();

          console.log('DB update for customer_call_uuid:', JSON.stringify(dbResult));
        } else {
          console.warn('Dial response missing requestUuid!');
        }
      }
    } catch (dialErr) {
      console.error('Error dialing customer outbound leg:', dialErr);

      // Customer call creation failed — clean up employee leg immediately
      try {
        const { data: failSession } = await adminClient
          .from('call_sessions')
          .select('id, agent_call_uuid, agent_member_id')
          .eq('room_name', roomName)
          .single();

        if (failSession && failSession.status !== 'ended' && failSession.status !== 'failed') {
          await adminClient.from('call_sessions').update({
            status: 'failed',
            hangup_cause: 'customer_dial_error',
            end_time: new Date().toISOString(),
            talk_duration_sec: 0,
          }).eq('id', failSession.id);
        }

        const cleanupClient = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
        try { await cleanupClient.conferences.hangup(roomName); } catch (_e) {}
        if (failSession?.agent_call_uuid) {
          try { await cleanupClient.calls.hangup(failSession.agent_call_uuid); } catch (_e) {}
        }
      } catch (cleanupErr) {
        console.error('Cleanup after dial error failed:', cleanupErr);
      }

      return;
    }
  }

  // 2. BACKGROUND DATABASE OPERATIONS
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
    // Determine if the entering call is agent or customer.
    let isAgent = false;
    let isCustomer = false;

    if (session.agent_call_uuid && callUuid === session.agent_call_uuid) {
      isAgent = true;
    } else if (session.customer_call_uuid && callUuid === session.customer_call_uuid) {
      isCustomer = true;
    } else if (!session.agent_answer_time || session.status === 'initiated') {
      isAgent = true;
    } else if (!session.customer_call_uuid || session.status === 'agent_answered' || session.status === 'customer_ringing') {
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
      // Customer joined — stop any lingering audio and mark connected
      await adminClient.from('call_sessions').update({
        customer_call_uuid: callUuid,
        customer_member_id: memberId,
        customer_answer_time: new Date().toISOString(),
        status: 'connected'
      }).eq('id', session.id);

      // Stop any residual audio that may still be playing for the agent member
      if (session.agent_member_id) {
        try {
          const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
          await client.conferences.stopPlayingAudioToMember(roomName, session.agent_member_id);
        } catch (_e) {
          // Ignore — waitSound already stops when conference starts; this is belt-and-suspenders
        }
      }
    }
  } else if (eventType === 'exit') {
    const isAgentExit = memberId === session.agent_member_id ||
      (session.agent_call_uuid && callUuid === session.agent_call_uuid);

    let membersCount = 0;
    try {
      const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
      const confDetails = await client.conferences.get(conferenceName);
      membersCount = confDetails.members ? confDetails.members.length : 0;
    } catch (_err) {
      console.log('Conference exit check: Conference not found or empty, count = 0');
    }

    // End the conference if the agent leaves, or if only one person remains
    const shouldEndConference = isAgentExit || membersCount <= 1;

    if (shouldEndConference && session.status !== 'ended') {
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
        console.log(`Hung up conference: ${conferenceName}`);
      } catch (confErr) {
        console.error('Error ending conference:', confErr.message);
      }

      // 2. Cancel/hangup customer call if still ringing (not answered)
      if (session.status !== 'connected' && session.customer_call_uuid) {
        try {
          await client.calls.cancel(session.customer_call_uuid);
          console.log(`Canceled customer call: ${session.customer_call_uuid}`);
        } catch (cancelErr) {
          console.log(`Cancel failed, trying hangup: ${cancelErr.message}`);
          try {
            await client.calls.hangup(session.customer_call_uuid);
          } catch (hangupErr) {
            console.error(`Failed to cancel/hangup customer call: ${hangupErr.message}`);
          }
        }
      }
    }
  } else if (eventType === 'record') {
    if (event.RecordUrl) {
      await adminClient.from('call_sessions').update({
        recording_url: event.RecordUrl
      }).eq('room_name', roomName);
    }
  }
}
