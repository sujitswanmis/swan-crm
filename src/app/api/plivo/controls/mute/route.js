import { NextResponse } from 'next/server';
import plivo from 'plivo';

export async function POST(req) {
  try {
    const { roomName, memberId, action } = await req.json();
    if (!roomName || !memberId || !action) {
       return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);

    if (action === 'mute') {
      await client.conferences.muteMember(roomName, memberId);
    } else if (action === 'unmute') {
      await client.conferences.unmuteMember(roomName, memberId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mute action error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
