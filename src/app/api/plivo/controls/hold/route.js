import { NextResponse } from 'next/server';
import plivo from 'plivo';

export async function POST(req) {
  try {
    const { roomName, memberId, action } = await req.json();
    if (!roomName || !memberId || !action) {
       return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);

    if (action === 'hold') {
      await client.conferences.deafMember(roomName, memberId);
      await client.conferences.muteMember(roomName, memberId);
    } else if (action === 'unhold') {
      await client.conferences.undeafMember(roomName, memberId);
      await client.conferences.unmuteMember(roomName, memberId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Hold action error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
