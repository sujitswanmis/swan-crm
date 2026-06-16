import { NextResponse } from 'next/server';
import plivo from 'plivo';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const { roomName } = await req.json();
    if (!roomName) {
       return NextResponse.json({ error: 'Missing roomName' }, { status: 400 });
    }

    const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);

    // This hangs up the entire conference for all participants
    try {
      await client.conferences.hangup(roomName);
    } catch (confErr) {
      console.error('Controls API: Error hanging up conference:', confErr.message);
    }

    // Also fetch the customer_call_uuid and hang it up directly if the customer was still ringing
    try {
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const { data: session } = await adminClient
        .from('call_sessions')
        .select('*')
        .eq('room_name', roomName)
        .single();

      if (session && session.status !== 'connected' && session.customer_call_uuid) {
         try {
            await client.calls.cancel(session.customer_call_uuid);
            console.log(`Controls API: Successfully canceled customer call request: ${session.customer_call_uuid}`);
         } catch (cancelErr) {
            console.log(`Controls API: Could not cancel request, trying hangup: ${cancelErr.message}`);
            try {
               await client.calls.hangup(session.customer_call_uuid);
               console.log(`Controls API: Successfully hung up customer call uuid: ${session.customer_call_uuid}`);
            } catch (hangupErr) {
               console.error(`Controls API: Failed to cancel or hang up call: ${hangupErr.message}`);
            }
         }
      }
    } catch (dbErr) {
      console.error('Database fetch/hangup error in controls hangup-conference:', dbErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Hangup conference error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
