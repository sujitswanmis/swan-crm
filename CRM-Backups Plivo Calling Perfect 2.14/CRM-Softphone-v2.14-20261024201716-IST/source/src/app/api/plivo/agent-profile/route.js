import { NextResponse } from 'next/server';
import { getSoftphoneAgentProfile } from '@/app/actions/team';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };

export async function GET(request) {
  try {
    const userId = new URL(request.url).searchParams.get('userId') || null;
    if (userId && userId.length > 128) {
      return NextResponse.json({ data: null, error: 'Invalid user.' }, { status: 400, headers });
    }
    const { data, error, status } = await getSoftphoneAgentProfile(userId);
    return NextResponse.json({ data, error }, { status, headers });
  } catch {
    return NextResponse.json({ data: null, error: 'Softphone profile could not be loaded.' }, { status: 503, headers });
  }
}
