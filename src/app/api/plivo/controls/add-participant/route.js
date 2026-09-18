import { NextResponse } from 'next/server';
import plivo from 'plivo';
import { getPlivoWebhookBaseUrl } from '@/app/api/plivo/utils';

export async function POST(req) {
  try {
    const { roomName, participantNumber } = await req.json();

    if (!roomName || !participantNumber) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const cleanNum = String(participantNumber).replace(/\D/g, '').slice(-10);
    if (cleanNum.length < 10) {
      return NextResponse.json(
        { error: 'Invalid participant phone number (10 digits required)' },
        { status: 400 }
      );
    }
    const dialNumber = `+91${cleanNum}`;

    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;
    const fromNumber = process.env.PLIVO_FROM_NUMBER || '+918035340622';
    const client = new plivo.Client(authId, authToken);
    const appBaseUrl = getPlivoWebhookBaseUrl(req);

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
