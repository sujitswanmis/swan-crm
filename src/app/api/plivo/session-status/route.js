import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import plivo from 'plivo';
import { categorizeHangupCause } from '@/app/api/plivo/utils';

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
      // When room is not provided, only search for currently active/ongoing sessions for this agent
      query = query.eq('agent_id', agentId)
        .in('status', ['initiated', 'ringing', 'customer_ringing', 'agent_answered', 'connected'])
        .order('created_at', { ascending: false })
        .limit(1);
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

    // 45s Hard Cutoff: Prevent ghost ringing from ever surviving telecom timeout
    if (!isConnected && !isEnded && ['initiated', 'ringing', 'customer_ringing', 'agent_answered'].includes(session.status)) {
      const ageMs = Date.now() - new Date(session.created_at || session.start_time).getTime();
      if (ageMs > 45000) {
        isEnded = true;
        session.status = 'ended';
        session.hangup_cause = session.hangup_cause || 'no_answer';
        adminClient
          .from('call_sessions')
          .update({
            status: 'ended',
            hangup_cause: session.hangup_cause,
            end_time: new Date().toISOString()
          })
          .eq('id', session.id)
          .then(() => {});
      }
    }

    // Fast active check: If agent is waiting in conference, check customer leg status in real time
    if (!isConnected && !isEnded && session.conference_name && session.agent_answer_time) {
      try {
        const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);

        // 1. Instant check: Did customer call terminate (decline, switched off, busy, reject)?
        if (session.customer_call_uuid) {
          try {
            const custCall = await client.calls.get(session.customer_call_uuid);
            if (custCall && (custCall.endTime || custCall.hangupCauseName || custCall.callState === 'completed' || custCall.callState === 'hangup')) {
              isEnded = true;
              session.status = 'ended';
              const ringSec = session.agent_answer_time
                ? Math.max(0, Math.floor((Date.now() - new Date(session.agent_answer_time).getTime()) / 1000))
                : 0;
              const cause = categorizeHangupCause(custCall.callState, custCall.hangupCauseName, custCall.hangupSource, ringSec, false);
              session.hangup_cause = cause;
              session.hangup_source = custCall.hangupSource || 'Carrier';

              // Terminate conference & agent leg immediately so softphone stops ringing
              try { await client.conferences.hangup(session.conference_name); } catch (_e) {}
              if (session.agent_call_uuid) {
                try { await client.calls.hangup(session.agent_call_uuid); } catch (_e) {}
              }

              // Update DB non-blocking
              adminClient
                .from('call_sessions')
                .update({
                  status: 'ended',
                  hangup_cause: cause,
                  hangup_source: session.hangup_source,
                  end_time: new Date().toISOString()
                })
                .eq('id', session.id)
                .then(() => {});
            }
          } catch (_callErr) {}
        }

        // 2. If customer hasn't terminated, check conference bridge for pickup
        if (!isEnded) {
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
        }
      } catch (_confErr) {
        // Ignore conference check error
      }
    }

    // If session ended without customer answering, but cause is generic/missing, query Plivo customer call leg to retrieve definitive telecom cause
    if (isEnded && !session.customer_answer_time && session.customer_call_uuid && (!session.hangup_cause || ['agent_hangup', 'failed', 'initiated'].includes(session.hangup_cause))) {
      try {
        const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
        const custCall = await client.calls.get(session.customer_call_uuid);
        if (custCall && (custCall.endTime || custCall.hangupCauseName || custCall.callState === 'completed' || custCall.callState === 'hangup')) {
          const ringSec = session.agent_answer_time
            ? Math.max(0, Math.floor((new Date(custCall.endTime || Date.now()).getTime() - new Date(session.agent_answer_time).getTime()) / 1000))
            : (session.ringing_duration_sec || 0);
          const trueCause = categorizeHangupCause(custCall.callState, custCall.hangupCauseName, custCall.hangupSource, ringSec, false);
          if (trueCause && trueCause !== 'failed') {
            session.hangup_cause = trueCause;
            session.hangup_source = custCall.hangupSource || 'Carrier';
            adminClient
              .from('call_sessions')
              .update({
                hangup_cause: trueCause,
                hangup_source: session.hangup_source
              })
              .eq('id', session.id)
              .then(() => {});
          }
        }
      } catch (_e) {}
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
