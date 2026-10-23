import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { controlIncomingCall } from '@/lib/plivoIncomingRouting';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers });
    const body = await req.json();
    if (body.userId && body.userId !== user.id) return NextResponse.json({ error: 'Access denied.' }, { status: 403, headers });
    return NextResponse.json(await controlIncomingCall(req, user.id, body), { headers });
  } catch (error) {
    return NextResponse.json({ error: error.status ? error.message : 'Incoming action could not be verified. Please retry.' }, { status: error.status || 503, headers });
  }
}
