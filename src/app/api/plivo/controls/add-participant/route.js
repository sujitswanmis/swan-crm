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

    // Tag session with conference_name
    await adminClient.from('call_sessions').update({
      conference_name: roomName
    }).eq('room_name', roomName);

    // Dial the new participant and route them into the SAME conference
    // We pass role=guest so that startConferenceOnEnter is true and endConferenceOnExit is false
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
