import { NextResponse } from 'next/server';
import plivo from 'plivo';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const { roomName, agentId } = await req.json();
    if (!roomName && !agentId) {
       return NextResponse.json({ error: 'Missing roomName or agentId' }, { status: 400 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1. Instantly update database call session status to ended to unblock the agent UI
    const endTime = new Date();
    let query = adminClient.from('call_sessions').update({
      status: 'ended',
      hangup_cause: 'agent_hangup',
      hangup_source: 'agent',
      end_time: endTime.toISOString()
    });

    if (roomName) {
      query = query.eq('room_name', roomName);
    } else {
      query = query.eq('agent_id', agentId).in('status', ['initiated', 'ringing', 'agent_answered', 'connected', 'customer_ringing']);
    }

    const { data: session } = await query.select().order('created_at', { ascending: false }).limit(1).maybeSingle();
    const targetRoom = roomName || session?.room_name;

    // 2. Perform Plivo hangups in the background
    const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
    
    // Non-blocking background call hangups
    (async () => {
      try {
        if (targetRoom) await client.conferences.hangup(targetRoom);
      } catch (confErr) {
        console.log('Controls API: Conference hangup background status:', confErr.message);
      }

      // Hang up agent call leg so WebRTC softphone in browser disconnects immediately
      if (session?.agent_call_uuid) {
        try {
          await client.calls.hangup(session.agent_call_uuid);
        } catch (_e) {}
      }

      // If customer call was still ringing or active, terminate it
      if (session?.customer_call_uuid) {
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
