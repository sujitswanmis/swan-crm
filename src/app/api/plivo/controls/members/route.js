import { NextResponse } from 'next/server';
import plivo from 'plivo';

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const roomName = url.searchParams.get('room');
    if (!roomName) return NextResponse.json({ error: 'Missing room' }, { status: 400 });

    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;
    const client = new plivo.Client(authId, authToken);

    const conference = await client.conferences.get(roomName);
    
    // Extract members
    // Plivo returns `members` as an array
    const members = conference.members || [];
    
    return NextResponse.json({ members });
  } catch (error) {
    console.error('Fetch members error:', error);
    // If conference is not found, it means it hasn't started or already ended.
    return NextResponse.json({ members: [] });
  }
}
