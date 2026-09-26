import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import plivo from 'plivo';
import { categorizeHangupCause } from '@/app/api/plivo/utils';

// All terminal customer-side call status values from Plivo (various spellings)
const TERMINAL_CUSTOMER_STATUSES = new Set([
  'busy',
  'busy-line',
  'busy line',
  'rejected',
  'no-answer',
  'no answer',
  'timeout',
  'ring-timeout',
  'ring-timeout-reached',
  'failed',
  'cancel',
  'canceled',
  'cancelled',
  'originator-cancel',
  'user_busy',
  'user busy',
  'call rejected',
  'call_rejected',
  'congestion',
  'unallocated',
  'completed'
]);



export async function GET() {
  return new NextResponse('Plivo Ring Callback Active', { status: 200 });
}

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);

    // Parse both query params and POST body
    const leg = url.searchParams.get('leg') || event.leg || '';
    const roomFromQuery = url.searchParams.get('room') || event.room || '';

    const callUuid = event.CallUUID || event.RequestUUID || '';
    const requestUuid = event.RequestUUID || '';
    const callStatus = (event.CallStatus || '').toLowerCase();
    const hangupCause = event.HangupCause || event.HangupCauseName || '';
    const hangupCauseCode = event.HangupCauseCode || event.HangupCauseCodeNumber || null;
    const hangupSource = event.HangupSource || '';

    // If completely empty payload, return 200 for idempotency
    if (!callStatus && !hangupCause && !callUuid) {
      return new NextResponse('OK', { status: 200 });
    }

    // Guest leg (3rd party participant) failure/hangup must NEVER terminate active agent session or conference
    if (leg === 'guest') {
      console.log(`ring-callback: guest leg ${callStatus} / cause=${hangupCause} ended for room=${roomFromQuery}`);
      return new NextResponse('OK', { status: 200 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (roomFromQuery) {
      // Keep the provider's raw cause and source for later carrier disputes.
      // A failed diagnostic insert must not change the call outcome.
      try {
        await adminClient.from('call_events').insert({
          room_name: roomFromQuery,
          call_uuid: callUuid || null,
          event_type: `plivo_${leg || 'unknown'}_${callStatus || 'event'}`,
          raw_payload: event
        });
      } catch (_error) {}
    }

    // --- Handle CUSTOMER leg terminal events (rejection, busy, no-answer, or customer hangup) ---
    const isTerminalStatus = TERMINAL_CUSTOMER_STATUSES.has(callStatus) ||
      callStatus.includes('busy') ||
      callStatus.includes('reject') ||
      callStatus.includes('timeout') ||
      callStatus.includes('cancel') ||
      hangupCause !== '';

    const isCustomerTerminal = (leg === 'customer' || !leg) && isTerminalStatus;

    if (isCustomerTerminal) {
      // Find session by room_name first (stable), fallback to call UUID
      let session = null;

      if (roomFromQuery) {
        const { data } = await adminClient
          .from('call_sessions')
          .select('*')
          .eq('room_name', roomFromQuery)
          .maybeSingle();
        session = data;
      }

      if (!session && (callUuid || requestUuid)) {
        const { data } = await adminClient
          .from('call_sessions')
          .select('*')
          .or(`customer_call_uuid.eq.${callUuid},customer_call_uuid.eq.${requestUuid},agent_call_uuid.eq.${callUuid},agent_call_uuid.eq.${requestUuid}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        session = data;
      }

      if (!session) {
        console.log('ring-callback: no session found for room/uuid, returning OK');
        return new NextResponse('OK', { status: 200 });
      }

      // If session was prematurely marked with a generic placeholder (like agent_hangup or failed),
      // upgrade it with the true customer telecom cause so realtime announcements fire accurately
      if (session.status === 'ended' || session.status === 'failed') {
        if (event.CallUUID && event.CallUUID !== session.customer_call_uuid) {
          await adminClient.from('call_sessions').update({ customer_call_uuid: event.CallUUID }).eq('id', session.id);
        }
        const isAgentCancellation = session.hangup_cause === 'agent_hangup' && session.hangup_source === 'agent';
        const isGeneric = !isAgentCancellation && (!session.hangup_cause || ['agent_hangup', 'failed', 'initiated', 'call_cancelled'].includes(session.hangup_cause));
        if (isGeneric && !session.customer_answer_time) {
          const ringingSec = session.ringing_duration_sec || (session.agent_answer_time ? Math.max(0, Math.floor((Date.now() - new Date(session.agent_answer_time).getTime()) / 1000)) : 0);
          const trueCause = categorizeHangupCause(callStatus, hangupCause, hangupSource, ringingSec, false, hangupCauseCode);
          if (trueCause && trueCause !== 'failed') {
            await adminClient.from('call_sessions').update({
              hangup_cause: trueCause,
              hangup_source: hangupSource || 'customer_leg',
              ...(event.CallUUID ? { customer_call_uuid: event.CallUUID } : {})
            }).eq('id', session.id);
            console.log(`ring-callback: upgraded ended session ${session.id} cause to ${trueCause}`);
          }
        } else {
          console.log(`ring-callback: session already ${session.status} (${session.hangup_cause}), skipping`);
        }
        return new NextResponse('OK', { status: 200 });
      }

      const endTime = new Date();
      const customerAnsTime = session.customer_answer_time ? new Date(session.customer_answer_time) : null;
      const agentAnsTime = session.agent_answer_time ? new Date(session.agent_answer_time) : null;
      const startTime = session.start_time ? new Date(session.start_time) : (agentAnsTime || endTime);

      let ringingSec = 0;
      let talkSec = 0;
      let determinedCause = 'rejected';

      if (customerAnsTime) {
        // Customer had answered and was in conversation, then hung up
        talkSec = Math.max(0, Math.floor((endTime - customerAnsTime) / 1000));
        ringingSec = Math.max(0, Math.floor((customerAnsTime - (agentAnsTime || startTime)) / 1000));
        determinedCause = 'customer_hangup';
      } else {
        // Customer disconnected or failed before answering
        ringingSec = agentAnsTime
          ? Math.max(0, Math.floor((endTime - agentAnsTime) / 1000))
          : Math.max(0, Math.floor((endTime - startTime) / 1000));
        talkSec = 0;
        determinedCause = categorizeHangupCause(callStatus, hangupCause, hangupSource, ringingSec, false, hangupCauseCode);
      }

      // Update DB with terminal status and normalized cause
      await adminClient.from('call_sessions').update({
        status: 'ended',
        hangup_cause: determinedCause,
        hangup_source: hangupSource || 'customer_leg',
        end_time: endTime.toISOString(),
        ringing_duration_sec: ringingSec,
        talk_duration_sec: talkSec,
        ...(event.CallUUID ? { customer_call_uuid: event.CallUUID } : {}),
      }).eq('id', session.id);

      console.log(`ring-callback: customer ${callStatus} / cause=${determinedCause} for room=${session.room_name}, hanging up conference/agent`);

      // Immediately clean up conference and employee leg
      const plivoClient = new plivo.Client(
        process.env.PLIVO_AUTH_ID,
        process.env.PLIVO_AUTH_TOKEN
      );

      // 1. Hangup conference (ends agent audio immediately)
      try {
        await plivoClient.conferences.hangup(session.room_name);
      } catch (_e) {
        // Conference may already be gone
      }

      // 2. Hangup agent call leg
      if (session.agent_call_uuid) {
        try {
          await plivoClient.calls.hangup(session.agent_call_uuid);
        } catch (_e) {}
      }

      return new NextResponse('OK', { status: 200 });
    }

    // --- Handle NON-customer-leg or ringing/in-progress status updates ---
    // Update DB status for agent or customer ringing events
    if (callStatus === 'ringing') {
      if (leg === 'customer' && roomFromQuery) {
        await adminClient.from('call_sessions').update({
          status: 'customer_ringing',
          ...(event.CallUUID ? { customer_call_uuid: event.CallUUID } : {})
        }).eq('room_name', roomFromQuery).in('status', ['initiated', 'agent_answered', 'customer_ringing']);
      } else if (callUuid) {
        const { data: agentSession } = await adminClient
          .from('call_sessions')
          .select('id, status')
          .eq('agent_call_uuid', callUuid)
          .maybeSingle();

        if (agentSession && agentSession.status === 'initiated') {
          await adminClient.from('call_sessions').update({
            status: 'ringing'
          }).eq('id', agentSession.id);
        }
      }
    }

    // Agent-leg failures must not be announced as customer telecom outcomes.
    if (isTerminalStatus && leg === 'agent') {
      let session = null;
      if (roomFromQuery) {
        const { data } = await adminClient.from('call_sessions').select('*')
          .eq('room_name', roomFromQuery).maybeSingle();
        session = data;
      }
      if (!session && callUuid) {
        const { data } = await adminClient
          .from('call_sessions')
          .select('*')
          .or(`agent_call_uuid.eq.${callUuid},agent_call_uuid.eq.${requestUuid}`)
          .maybeSingle();
        session = data;
      }

      if (session && ['initiated', 'ringing'].includes(session.status)) {
        await adminClient.from('call_sessions').update({
          status: 'failed',
          hangup_cause: 'agent_unavailable',
          hangup_source: hangupSource || 'agent_leg',
          end_time: new Date().toISOString(),
          talk_duration_sec: 0,
          ...(event.CallUUID ? { agent_call_uuid: event.CallUUID } : {})
        }).eq('id', session.id).in('status', ['initiated', 'ringing']);
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Ring callback error:', error);
    // Always return 200 to Plivo to prevent retries
    return new NextResponse('OK', { status: 200 });
  }
}
