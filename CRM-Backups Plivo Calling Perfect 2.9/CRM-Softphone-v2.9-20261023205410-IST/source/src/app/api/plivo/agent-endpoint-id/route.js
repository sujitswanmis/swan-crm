import { NextResponse } from 'next/server';
import { getAgentEndpointId } from '@/app/actions/team';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };

export async function GET(request) {
  try {
    const userId = new URL(request.url).searchParams.get('userId') || null;
    if (userId && userId.length > 128) {
      return NextResponse.json({ endpointId: null, error: 'Invalid user.' }, { status: 400, headers });
    }
    // The resolver authenticates the caller and checks access to the requested employee.
    const result = await getAgentEndpointId(userId);
    return NextResponse.json(result, { status: result.error ? 503 : 200, headers });
  } catch {
    return NextResponse.json({ endpointId: null, error: 'Endpoint ID could not be loaded.' }, { status: 503, headers });
  }
}
