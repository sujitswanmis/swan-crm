import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import plivo from 'plivo';
import { randomUUID } from 'node:crypto';
import { getPlivoWebhookBaseUrl, categorizeHangupCause } from '@/app/api/plivo/utils';
import { normalizeIndianPhoneNumber } from '@/app/api/plivo/phone-number';

export async function GET() {
  return new NextResponse('Plivo Conference Callback Active', { status: 200 });
}

export async function POST(req) {
  try {
    // Parse Plivo webhook form data
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);

    const url = new URL(req.url);
    const roomName = url.searchParams.get('room') || event.room || event.ConferenceName;
    const baseUrl = getPlivoWebhookBaseUrl(req);
    // Old in-flight conference calls have no flag. Only transferred Dial legs
    // explicitly opt out so their first-member event cannot redial the customer.
    const autoDial = url.searchParams.get('autodial') !== '0';

    // Run processing sequentially so serverless function doesn't terminate early
    await processConferenceEvent(roomName, event, baseUrl, autoDial);

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Conference callback error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}

async function processConferenceEvent(roomName, event, originUrl, autoDial) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const eventType = event.ConferenceAction;
  const memberId = event.ConferenceMemberID;
  const callUuid = event.CallUUID;
  const conferenceName = event.ConferenceName;

  // 1. Dial the saved customer as soon as the agent joins the conference.
  if (autoDial && eventType === 'enter' && event.ConferenceFirstMember === 'true') {
    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;
    const fromNumber = process.env.PLIVO_FROM_NUMBER || '+918035340622';
    const client = new plivo.Client(authId, authToken);
    const appBaseUrl = originUrl;

    // The agent's Conference XML supplies silence while the carrier tries the
    // customer line. A ring callback does not prove the handset is alerting.

    // Dial customer with ring/hangup callbacks and explicit ring timeout.
    // SDK verified params: hangupUrl, hangupMethod, ringTimeout (call.js lines 704, 705, 718)
    const dialClaim = randomUUID();
    let ownClaim = false;
    try {
      // Claim the dial atomically. Duplicate conference-enter webhooks must
      // never create two customer calls for the same room.
      const { data: claimed, error: claimError } = await adminClient
        .from('call_sessions')
        .update({ customer_call_uuid: dialClaim })
        .eq('room_name', roomName)
        .is('customer_call_uuid', null)
        .in('status', ['initiated', 'ringing', 'agent_answered'])
        .select('id, customer_number');
      if (claimError) throw claimError;
      if (claimed?.length) {
        ownClaim = true;
        const customerNumber = normalizeIndianPhoneNumber(claimed[0].customer_number);
        if (!customerNumber) throw new Error('Invalid saved customer number');
        const dialResponse = await client.calls.create(
          fromNumber,
          customerNumber,
          `${appBaseUrl}/api/plivo/answer?room=${roomName}&role=customer`,
          {
            answerMethod: 'POST',
            fallbackMethod: 'POST',
            ringUrl: `${appBaseUrl}/api/plivo/ring-callback?room=${roomName}&leg=customer`,
            ringMethod: 'POST',
            hangupUrl: `${appBaseUrl}/api/plivo/ring-callback?room=${roomName}&leg=customer`,
            hangupMethod: 'POST',
            ringTimeout: 35,
          }
        );

        if (!dialResponse?.requestUuid) throw new Error('Provider did not accept the customer call');
        const { data: savedDial, error: saveError } = await adminClient.from('call_sessions')
          .update({ customer_call_uuid: dialResponse.requestUuid, status: 'agent_answered' })
          .eq('room_name', roomName)
          .eq('customer_call_uuid', dialClaim)
          .in('status', ['initiated', 'ringing', 'agent_answered'])
          .select('id');
        if (saveError) console.error('Customer call UUID update failed:', saveError);
        if (!savedDial?.length) {
          const { data: latest } = await adminClient.from('call_sessions')
            .select('status').eq('room_name', roomName).maybeSingle();
          if (['ended', 'failed'].includes(latest?.status)) {
            try { await client.calls.cancel(dialResponse.requestUuid); }
            catch (_e) { try { await client.calls.hangup(dialResponse.requestUuid); } catch (_e2) {} }
          }
        }
      }
    } catch (dialErr) {
      console.error('Error dialing customer outbound leg:', dialErr);
      if (!ownClaim) throw dialErr;

      // Customer call creation failed — clean up employee leg immediately
      try {
        const { data: failSession } = await adminClient
          .from('call_sessions')
          .select('id, agent_call_uuid, agent_member_id, status')
          .eq('room_name', roomName)
          .single();

        if (failSession && failSession.status !== 'ended' && failSession.status !== 'failed') {
          await adminClient.from('call_sessions').update({
            status: 'failed',
            hangup_cause: 'customer_dial_error',
            customer_call_uuid: null,
            end_time: new Date().toISOString(),
            talk_duration_sec: 0,
          }).eq('id', failSession.id).eq('customer_call_uuid', dialClaim);
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
    } else if (event.ConferenceFirstMember === 'true' || (session.agent_member_id && memberId === session.agent_member_id)) {
      isAgent = true;
    } else if (!session.agent_answer_time || session.status === 'initiated') {
      isAgent = true;
    } else if (!session.customer_call_uuid || session.status === 'agent_answered' || session.status === 'customer_ringing') {
      isCustomer = true;
    }

    if (isAgent) {
      // Agent joined
      const agentUpdate = {
        agent_call_uuid: callUuid,
        agent_member_id: memberId,
        conference_name: conferenceName,
        agent_answer_time: new Date().toISOString(),
      };
      // Only set agent_answered if customer has not yet been dialed
      if (session.status !== 'customer_ringing' && !session.customer_call_uuid) {
        agentUpdate.status = 'agent_answered';
      }
      await adminClient.from('call_sessions').update(agentUpdate).eq('id', session.id)
        .in('status', ['initiated', 'ringing', 'agent_answered', 'customer_ringing', 'connected']);

    } else if (isCustomer) {
      // Customer joined — stop any lingering audio and mark connected
      await adminClient.from('call_sessions').update({
        customer_call_uuid: callUuid,
        customer_member_id: memberId,
        customer_answer_time: new Date().toISOString(),
        status: 'connected'
      }).eq('id', session.id).in('status', ['initiated', 'ringing', 'agent_answered', 'customer_ringing', 'connected']);

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

    // End the conference if the agent leaves, or if customer leaves in 1-on-1 call (only 1 member remaining), or if room empty
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

      let hangupCause = session.hangup_cause;
      let hangupSource = session.hangup_source;
      if (!hangupCause || hangupCause === 'initiated') {
        if (session.status === 'connected' || session.customer_answer_time) {
          if (isAgentExit) {
            hangupCause = 'agent_hangup';
            hangupSource = 'agent';
          } else {
            hangupCause = 'customer_hangup';
            hangupSource = 'customer';
          }
        } else {
          if (isAgentExit) {
            // If agent exited before customer pickup, check if customer leg already failed/rejected/switched off
            let custDeterminedCause = null;
            if (session.customer_call_uuid) {
              try {
                const plivoCl = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
                const custCall = await plivoCl.calls.get(session.customer_call_uuid);
                if (custCall && (custCall.endTime || custCall.hangupCauseName)) {
                  custDeterminedCause = categorizeHangupCause('', custCall.hangupCauseName, custCall.hangupSource, ringingSec, false, custCall.hangupCauseCode);
                  if (custCall.hangupSource) hangupSource = custCall.hangupSource;
                }
              } catch (_e) {}
            }
            // An agent exit can be caused by the customer leg failing first.
            // Leave the cause open for the customer's hangup callback or CDR.
            hangupCause = custDeterminedCause && custDeterminedCause !== 'failed' ? custDeterminedCause : 'failed';
            if (!custDeterminedCause || custDeterminedCause === 'failed') hangupSource = 'conference';
          } else {
            // A bridge exit alone cannot tell whether the customer declined.
            hangupCause = 'failed';
            hangupSource = 'conference';
          }
        }
      }

      await adminClient.from('call_sessions').update({
        status: 'ended',
        hangup_cause: hangupCause,
        hangup_source: hangupSource,
        end_time: endTime.toISOString(),
        ringing_duration_sec: ringingSec,
        talk_duration_sec: talkSec
      }).eq('id', session.id).in('status', ['initiated', 'ringing', 'agent_answered', 'customer_ringing', 'connected']);

      const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);

      // 1. End the conference
      try {
        await client.conferences.hangup(conferenceName);
        console.log(`Hung up conference: ${conferenceName}`);
      } catch (confErr) {
        console.error('Error ending conference:', confErr.message);
      }

      // 2. Hangup agent call leg so WebRTC browser disconnects immediately
      if (session.agent_call_uuid) {
        try {
          await client.calls.hangup(session.agent_call_uuid);
        } catch (_e) {}
      }

      // 3. Cancel/hangup customer call if still ringing (not answered)
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
