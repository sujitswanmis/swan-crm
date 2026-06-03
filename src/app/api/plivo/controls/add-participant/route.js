import { NextResponse } from 'next/server';
import plivo from 'plivo';

export async function POST(req) {
  try {
    const { roomName, participantNumber } = await req.json();
    
    if (!roomName || !participantNumber) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;
    const fromNumber = process.env.PLIVO_FROM_NUMBER || '+918035340622';
    const client = new plivo.Client(authId, authToken);
    const appBaseUrl = 'https://swan-hosting.vercel.app';

    // Dial the new participant and route them into the SAME conference
    // We pass role=guest so that endConferenceOnExit is false
    const response = await client.calls.create(
      fromNumber,
      `+91${participantNumber}`,
      `${appBaseUrl}/api/plivo/answer?room=${roomName}&role=guest`,
      {
        answerMethod: 'POST',
        fallbackMethod: 'POST',
      }
    );

    return NextResponse.json({ success: true, callUuid: response.requestUuid });
  } catch (error) {
    console.error('Add participant error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
