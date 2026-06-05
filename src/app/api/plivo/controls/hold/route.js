import { NextResponse } from 'next/server';
import plivo from 'plivo';

export async function POST(req) {
  try {
    const { roomName, memberId, action } = await req.json();
    if (!roomName || !memberId || !action) {
       return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
    const appBaseUrl = 'https://swan-hosting.vercel.app';

    if (action === 'hold') {
      await client.conferences.deafMember(roomName, memberId);
      await client.conferences.muteMember(roomName, memberId);
      try {
        await client.conferences.playAudioToMember(roomName, memberId, `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3`);
      } catch (e) {
        console.error('Failed to play hold music:', e);
      }
    } else if (action === 'unhold') {
      try {
        await client.conferences.stopPlayingAudioToMember(roomName, memberId);
      } catch (e) {
        console.error('Failed to stop hold music:', e);
      }
      await client.conferences.undeafMember(roomName, memberId);
      await client.conferences.unmuteMember(roomName, memberId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Hold action error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
