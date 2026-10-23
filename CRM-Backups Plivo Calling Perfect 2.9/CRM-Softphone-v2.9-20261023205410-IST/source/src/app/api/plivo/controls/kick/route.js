import { NextResponse } from 'next/server';
import plivo from 'plivo';

export async function POST(req) {
  try {
    const { roomName, memberId } = await req.json();
    if (!roomName || !memberId) {
       return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);

    await client.conferences.hangupMember(roomName, memberId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Kick action error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
