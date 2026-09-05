import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import plivo from 'plivo';

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const room = url.searchParams.get('room');
    const agentId = url.searchParams.get('agent_id');

    if (!room && !agentId) {
      return NextResponse.json({ error: 'Missing room or agent_id' }, { status: 400 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let query = adminClient.from('call_sessions').select('*');
    if (room) {
      query = query.eq('room_name', room);
    } else {
      query = query.eq('agent_id', agentId).order('created_at', { ascending: false }).limit(1);
    }

    const { data: sessionData, error } = await query.maybeSingle();

    if (error || !sessionData) {
      return NextResponse.json({ activeSession: null }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
    }

    let session = sessionData;
    let isConnected = session.status === 'connected' || !!session.customer_answer_time;
    let isEnded = session.status === 'ended' || session.status === 'failed';

    // Fast active check: If agent is waiting in conference and customer pickup hasn't synced yet,
    // inspect Plivo conference bridge in real time to catch customer entry immediately
    if (!isConnected && !isEnded && session.conference_name && session.agent_answer_time) {
      try {
        const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
        const conf = await client.conferences.get(session.conference_name);
        const members = conf?.members || [];

        if (members.length >= 2) {
          // Customer has entered the conference! Mark connected immediately
          isConnected = true;
          const nowIso = new Date().toISOString();
          session.status = 'connected';
          session.customer_answer_time = session.customer_answer_time || nowIso;

          // Non-blocking update in DB
          adminClient
            .from('call_sessions')
            .update({
              status: 'connected',
              customer_answer_time: session.customer_answer_time
            })
            .eq('id', session.id)
            .then(() => {});
        } else if (members.length === 0 && session.agent_call_uuid) {
          // Both members left or conference dissolved
          const confAgeMs = Date.now() - new Date(session.start_time || session.created_at).getTime();
          if (confAgeMs > 8000) {
            isEnded = true;
            session.status = 'ended';
          }
        }
      } catch (_confErr) {
        // Ignore conference check error
      }
    }

    return NextResponse.json({
      activeSession: session,
      isConnected,
      customerAnswered: isConnected,
      isEnded,
      status: session.status,
      hangupCause: session.hangup_cause,
      customerAnswerTime: session.customer_answer_time,
      agentAnswerTime: session.agent_answer_time,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

  } catch (err) {
    console.error('Session status API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { agentId, status } = await req.json();
    if (!agentId || !status) {
      return NextResponse.json({ error: 'Missing agentId or status' }, { status: 400 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await adminClient
      .from('call_agents')
      .update({ status })
      .eq('id', agentId);

    return NextResponse.json({ success: true, agentId, status });
  } catch (error) {
    console.error('Update agent status error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
