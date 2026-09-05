import { NextResponse } from 'next/server';
import plivo from 'plivo';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const { roomName } = await req.json();
    if (!roomName) {
       return NextResponse.json({ error: 'Missing roomName' }, { status: 400 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1. Instantly update database call session status to ended to unblock the agent UI
    const endTime = new Date();
    const { data: session } = await adminClient
      .from('call_sessions')
      .update({
        status: 'ended',
        hangup_cause: 'agent_hangup',
        hangup_source: 'agent',
        end_time: endTime.toISOString()
      })
      .eq('room_name', roomName)
      .select()
      .single();

    // 2. Perform Plivo hangups in the background
    const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
    
    // Non-blocking background call hangups
    (async () => {
      try {
        await client.conferences.hangup(roomName);
      } catch (confErr) {
        console.log('Controls API: Conference hangup background status:', confErr.message);
      }

      // If customer call was still ringing, cancel it
      if (session && session.status !== 'connected' && session.customer_call_uuid) {
        try {
          await client.calls.cancel(session.customer_call_uuid);
        } catch (cancelErr) {
          try {
            await client.calls.hangup(session.customer_call_uuid);
          } catch (hangupErr) {
            console.error('Controls API: Background customer hangup error:', hangupErr.message);
          }
        }
      }
    })();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Hangup conference error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
