import { NextResponse } from 'next/server';
import plivo from 'plivo';

export async function POST(req) {
  try {
    const { roomName } = await req.json();
    if (!roomName) {
       return NextResponse.json({ error: 'Missing roomName' }, { status: 400 });
    }

    const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);

    // This hangs up the entire conference for all participants
    await client.conferences.hangup(roomName);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Hangup conference error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
