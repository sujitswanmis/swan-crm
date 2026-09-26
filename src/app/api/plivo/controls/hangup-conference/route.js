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

    // 1. Fetch current session to preserve any customer-side termination cause
    let fetchQuery = adminClient.from('call_sessions').select('*');
    if (roomName) {
      fetchQuery = fetchQuery.eq('room_name', roomName);
    } else {
      fetchQuery = fetchQuery.eq('agent_id', agentId).in('status', ['initiated', 'ringing', 'agent_answered', 'connected', 'customer_ringing']);
    }
    const { data: session } = await fetchQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();

    const endTime = new Date();
    const preserveCause = session?.hangup_cause && !['agent_hangup', 'failed', 'initiated'].includes(session.hangup_cause);
    const hangupCause = preserveCause ? session.hangup_cause : 'agent_hangup';
    const hangupSource = preserveCause ? (session.hangup_source || 'customer_leg') : 'agent';

    if (session) {
      await adminClient.from('call_sessions').update({
        status: 'ended',
        hangup_cause: hangupCause,
        hangup_source: hangupSource,
        end_time: endTime.toISOString()
      }).eq('id', session.id).in('status', ['initiated', 'ringing', 'agent_answered', 'customer_ringing', 'connected']);
    }

    const targetRoom = roomName || session?.room_name;

    // 2. Finish Plivo cleanup before the serverless request exits. The browser
    // already returns to the dialpad immediately without awaiting this fetch.
    const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
    try {
      if (targetRoom) await client.conferences.hangup(targetRoom);
    } catch (confErr) {
      console.log('Controls API: Conference hangup status:', confErr.message);
    }

    if (session?.agent_call_uuid) {
      try { await client.calls.hangup(session.agent_call_uuid); } catch (_e) {}
    }

    if (session?.customer_call_uuid) {
      try {
        await client.calls.cancel(session.customer_call_uuid);
      } catch (_cancelErr) {
        try { await client.calls.hangup(session.customer_call_uuid); }
        catch (hangupErr) { console.error('Controls API: Customer hangup error:', hangupErr.message); }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Hangup conference error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
