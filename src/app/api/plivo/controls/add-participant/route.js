import { NextResponse } from 'next/server';
import plivo from 'plivo';
import { createClient } from '@supabase/supabase-js';
import { getPlivoWebhookBaseUrl } from '@/app/api/plivo/utils';

export async function POST(req) {
  try {
    const { roomName, participantNumber } = await req.json();
    
    if (!roomName || !participantNumber) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const cleanNum = String(participantNumber).replace(/\D/g, '').slice(-10);
    if (cleanNum.length < 10) {
      return NextResponse.json({ error: 'Invalid participant phone number (10 digits required)' }, { status: 400 });
    }
    const dialNumber = `+91${cleanNum}`;

    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;
    const fromNumber = process.env.PLIVO_FROM_NUMBER || '+918035340622';
    const client = new plivo.Client(authId, authToken);
    const appBaseUrl = getPlivoWebhookBaseUrl(req);

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1. Fetch active call session to get call UUIDs
    const { data: session } = await adminClient
      .from('call_sessions')
      .select('*')
      .eq('room_name', roomName)
      .maybeSingle();

    // 2. If the current call was in standard 2-party <Dial> mode and not yet conferenced,
    // seamlessly transfer both legs (agent A-leg and customer B-leg) into <Conference>!
    if (session?.agent_call_uuid && session.status !== 'ended' && !session.conference_name) {
      // Mark session as conferenced BEFORE calling transfer so dial-action does not terminate the call
      await adminClient.from('call_sessions').update({
        conference_name: roomName
      }).eq('id', session.id);

      const confAgentUrl = `${appBaseUrl}/api/plivo/answer?room=${encodeURIComponent(roomName)}&role=agent_conf`;
      const confCustUrl = `${appBaseUrl}/api/plivo/answer?room=${encodeURIComponent(roomName)}&role=customer_conf`;

      try {
        await client.calls.transfer(session.agent_call_uuid, {
          legs: 'both',
          aleg_url: confAgentUrl,
          alegUrl: confAgentUrl,
          aleg_method: 'POST',
          alegMethod: 'POST',
          bleg_url: confCustUrl,
          blegUrl: confCustUrl,
          bleg_method: 'POST',
          blegMethod: 'POST'
        });
        console.log(`Successfully transferred both call legs for room ${roomName} to conference`);
      } catch (transferErr) {
        console.warn('Transfer both legs failed, falling back to individual leg transfers:', transferErr?.message || transferErr);
        try {
          await client.calls.transfer(session.agent_call_uuid, {
            legs: 'aleg',
            aleg_url: confAgentUrl,
            alegUrl: confAgentUrl,
            aleg_method: 'POST',
            alegMethod: 'POST'
          });
        } catch (_e1) {}

        if (session.customer_call_uuid) {
          try {
            await client.calls.transfer(session.customer_call_uuid, {
              legs: 'aleg',
              aleg_url: confCustUrl,
              alegUrl: confCustUrl,
              aleg_method: 'POST',
              alegMethod: 'POST'
            });
          } catch (_e2) {}
        }
      }
    }

    // 3. Dial the 2nd participant and route them into the SAME conference
    // We pass role=guest so that endConferenceOnExit is false
    const response = await client.calls.create(
      fromNumber,
      dialNumber,
      `${appBaseUrl}/api/plivo/answer?room=${encodeURIComponent(roomName)}&role=guest`,
      {
        answerMethod: 'POST',
        fallbackMethod: 'POST',
        hangupUrl: `${appBaseUrl}/api/plivo/ring-callback?room=${encodeURIComponent(roomName)}&leg=guest`,
        hangupMethod: 'POST',
        ringTimeout: 35,
      }
    );

    return NextResponse.json({ success: true, callUuid: response.requestUuid });
  } catch (error) {
    console.error('Add participant error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
