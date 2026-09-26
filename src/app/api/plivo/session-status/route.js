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
    let conferenceChecked = !session.agent_answer_time || !session.conference_name;

    // Dial calls have no conference until the answered legs are transferred.
    // Recover a missed Dial action callback from the customer's CDR.
    if (!isEnded && !session.conference_name && session.customer_call_uuid && session.agent_answer_time) {
      try {
        const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
        const customerCall = await client.calls.get(session.customer_call_uuid);
        if (customerCall?.endTime) {
          const answeredAt = session.customer_answer_time || customerCall.answerTime || null;
          const cause = answeredAt
            ? 'customer_hangup'
            : categorizeHangupCause('', customerCall.hangupCauseName, customerCall.hangupSource, 0, false, customerCall.hangupCauseCode);
          const { data: endedRows } = await adminClient.from('call_sessions').update({
            status: 'ended',
            hangup_cause: cause,
            hangup_source: customerCall.hangupSource || 'Plivo',
            end_time: new Date(customerCall.endTime).toISOString()
          }).eq('id', session.id).is('conference_name', null)
            .in('status', ['initiated', 'ringing', 'agent_answered', 'customer_ringing', 'connected']).select('id');
          if (endedRows?.length) {
            isEnded = true;
            session.status = 'ended';
            session.hangup_cause = cause;
            session.hangup_source = customerCall.hangupSource || 'Plivo';
            if (session.agent_call_uuid) {
              try { await client.calls.hangup(session.agent_call_uuid); } catch (_error) {}
            }
          }
        }
      } catch (_error) {}
    }

    // Fast active check: If agent is waiting in conference, check customer leg status in real time
    if (!isConnected && !isEnded && session.conference_name && session.agent_answer_time) {
      try {
        const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);

        // 1. Instant check: Did customer call terminate (decline, switched off, busy, reject)?
        if (session.customer_call_uuid) {
          try {
            const custCall = await client.calls.get(session.customer_call_uuid);
            if (custCall && (custCall.endTime || custCall.hangupCauseName)) {
              const ringSec = session.agent_answer_time
                ? Math.max(0, Math.floor((Date.now() - new Date(session.agent_answer_time).getTime()) / 1000))
                : 0;
              const cause = categorizeHangupCause('', custCall.hangupCauseName, custCall.hangupSource, ringSec, false, custCall.hangupCauseCode);
              const source = custCall.hangupSource || 'Carrier';
              const { data: endedRows } = await adminClient
                .from('call_sessions')
                .update({
                  status: 'ended',
                  hangup_cause: cause,
                  hangup_source: source,
                  end_time: new Date().toISOString()
                })
                .eq('id', session.id)
                .in('status', ['initiated', 'ringing', 'customer_ringing', 'agent_answered'])
                .select('id');
              if (endedRows?.length) {
                isEnded = true;
                session.status = 'ended';
                session.hangup_cause = cause;
                session.hangup_source = source;
                try { await client.conferences.hangup(session.conference_name); } catch (_e) {}
                if (session.agent_call_uuid) {
                  try { await client.calls.hangup(session.agent_call_uuid); } catch (_e) {}
                }
              } else {
                const { data: latest } = await adminClient.from('call_sessions').select('*').eq('id', session.id).maybeSingle();
                if (latest) {
                  session = latest;
                  isConnected = latest.status === 'connected' || !!latest.customer_answer_time;
                  isEnded = latest.status === 'ended' || latest.status === 'failed';
                }
              }
            }
          } catch (_callErr) {}
        }

        // 2. If customer hasn't terminated, check conference bridge for pickup
        if (!isEnded) {
          const conf = await client.conferences.get(session.conference_name);
          conferenceChecked = true;
          const members = conf?.members || [];

          if (members.length >= 2) {
            // Customer has entered the conference! Mark connected immediately
            isConnected = true;
            const nowIso = new Date().toISOString();
            session.status = 'connected';
            session.customer_answer_time = session.customer_answer_time || nowIso;

            await adminClient
              .from('call_sessions')
              .update({
                status: 'connected',
                customer_answer_time: session.customer_answer_time
              })
              .eq('id', session.id)
              .in('status', ['initiated', 'ringing', 'customer_ringing', 'agent_answered']);
          }
        }
      } catch (confErr) {
        // A missing conference can safely age out; a transient API failure
        // cannot prove that a live conference has ended.
        if (confErr?.statusCode === 404 || /not found|\b404\b/i.test(confErr?.message || '')) {
          conferenceChecked = true;
        }
      }
    }

    // Recover from lost webhooks only after checking the live customer leg and
    // conference membership. Elapsed time alone is not a no-answer reason.
    if (!isConnected && !isEnded && ['initiated', 'ringing', 'customer_ringing', 'agent_answered'].includes(session.status)) {
      const waitingSince = session.agent_answer_time || session.created_at || session.start_time;
      const ageMs = Date.now() - new Date(waitingSince).getTime();
      if (conferenceChecked && ageMs > (session.agent_answer_time ? 55000 : 45000)) {
        isEnded = true;
        session.status = 'ended';
        session.hangup_cause = session.hangup_cause || 'failed';
        const { data: expiredRows } = await adminClient.from('call_sessions').update({
          status: 'ended',
          hangup_cause: session.hangup_cause,
          end_time: new Date().toISOString()
        }).eq('id', session.id).in('status', ['initiated', 'ringing', 'customer_ringing', 'agent_answered']).select('id');
        if (!expiredRows?.length) {
          const { data: latest } = await adminClient.from('call_sessions').select('*').eq('id', session.id).maybeSingle();
          if (latest) {
            session = latest;
            isConnected = latest.status === 'connected' || !!latest.customer_answer_time;
            isEnded = latest.status === 'ended' || latest.status === 'failed';
          }
        } else {
          try {
            const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
            if (session.conference_name) await client.conferences.hangup(session.conference_name);
            if (session.customer_call_uuid) {
              try { await client.calls.cancel(session.customer_call_uuid); }
              catch (_e) { try { await client.calls.hangup(session.customer_call_uuid); } catch (_e2) {} }
            }
            if (session.agent_call_uuid) await client.calls.hangup(session.agent_call_uuid);
          } catch (_e) {}
        }
      }
    }

    // If session ended without customer answering, but cause is generic/missing, query Plivo customer call leg to retrieve definitive telecom cause
    if (isEnded && !session.customer_answer_time && session.customer_call_uuid && !(session.hangup_cause === 'agent_hangup' && session.hangup_source === 'agent') && (!session.hangup_cause || ['agent_hangup', 'failed', 'initiated', 'call_cancelled'].includes(session.hangup_cause))) {
      try {
        const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
        const custCall = await client.calls.get(session.customer_call_uuid);
        if (custCall && (custCall.endTime || custCall.hangupCauseName)) {
          const ringSec = session.agent_answer_time
            ? Math.max(0, Math.floor((new Date(custCall.endTime || Date.now()).getTime() - new Date(session.agent_answer_time).getTime()) / 1000))
            : (session.ringing_duration_sec || 0);
          const trueCause = categorizeHangupCause('', custCall.hangupCauseName, custCall.hangupSource, ringSec, false, custCall.hangupCauseCode);
          if (trueCause && trueCause !== 'failed') {
            session.hangup_cause = trueCause;
            session.hangup_source = custCall.hangupSource || 'Carrier';
            await adminClient
              .from('call_sessions')
              .update({
                hangup_cause: trueCause,
                hangup_source: session.hangup_source
              })
              .eq('id', session.id)
              .eq('status', 'ended');
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
