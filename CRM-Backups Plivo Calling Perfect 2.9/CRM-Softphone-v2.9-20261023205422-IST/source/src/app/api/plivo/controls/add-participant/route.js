import { NextResponse } from 'next/server';
import plivo from 'plivo';
import { createClient } from '@supabase/supabase-js';
import { getPlivoWebhookBaseUrl } from '@/app/api/plivo/utils';
import { normalizeIndianPhoneNumber } from '@/app/api/plivo/phone-number';
import { transferDialToConference } from '@/app/api/plivo/transfer-to-conference';

export async function POST(req) {
  try {
    const { roomName, participantNumber } = await req.json();

    if (!roomName || !participantNumber) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const dialNumber = normalizeIndianPhoneNumber(participantNumber);
    if (!dialNumber) {
      return NextResponse.json(
        { error: 'Invalid participant phone number (10 digits required)' },
        { status: 400 }
      );
    }
    const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: session } = await adminClient.from('call_sessions').select('*')
      .eq('room_name', roomName).maybeSingle();
    if (!session || session.status !== 'connected') {
      return NextResponse.json({ error: 'Call is not connected' }, { status: 409 });
    }

    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;
    const fromNumber = process.env.PLIVO_FROM_NUMBER || '+918035340622';
    const client = new plivo.Client(authId, authToken);
    const appBaseUrl = getPlivoWebhookBaseUrl(req);

    if (!session.conference_name) {
      await transferDialToConference(session, adminClient, appBaseUrl);
    } else {
      try {
        const confCheck = await client.conferences.get(roomName);
        if (!confCheck || (confCheck.members || []).length < 2) {
          await transferDialToConference(session, adminClient, appBaseUrl, true);
        }
      } catch (_e) {
        await transferDialToConference(session, adminClient, appBaseUrl, true);
      }
    }

    let conferenceReady = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const conference = await client.conferences.get(roomName);
        if ((conference?.members || []).length >= 2) {
          conferenceReady = true;
          break;
        }
      } catch (_error) {}
      if (attempt < 11) await new Promise(resolve => setTimeout(resolve, 400));
    }
    if (!conferenceReady) {
      return NextResponse.json({ error: 'Conference is still connecting. Please retry in a moment.' }, { status: 409 });
    }

    // Dial 3rd/4th/Nth party directly into the live conference room as a "guest".
    // The conference is already running (agent + customer are in it).
    // No call transfer needed — this is a fresh independent call leg that joins
    // the same conference room. role=guest ensures endConferenceOnExit=false so
    // their hangup/dropout does NOT kill the ongoing agent+customer call.
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
