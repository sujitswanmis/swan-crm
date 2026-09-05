import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import plivo from 'plivo';

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

// Normalize Plivo terminal cause for voice and UI announcement
function categorizeHangupCause(callStatus, hangupCause, hangupSource) {
  const s = (callStatus || '').toLowerCase();
  const h = (hangupCause || '').toLowerCase();
  
  if (s === 'rejected' || h.includes('reject') || h.includes('call rejected')) {
    return 'rejected';
  }
  if (s === 'busy' || s.includes('busy') || h.includes('busy') || h.includes('user_busy')) {
    return 'busy';
  }
  if (s.includes('timeout') || s === 'no-answer' || h.includes('timeout') || h.includes('no_answer') || h.includes('no answer')) {
    return 'no_answer';
  }
  if (s.includes('cancel') || h.includes('cancel')) {
    return 'rejected';
  }
  if (s === 'failed' || h.includes('failed') || h.includes('unallocated') || h.includes('absent')) {
    return 'failed';
  }
  return s || h || 'failed';
}

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
    const hangupSource = event.HangupSource || '';

    // If completely empty payload, return 200 for idempotency
    if (!callStatus && !hangupCause && !callUuid) {
      return new NextResponse('OK', { status: 200 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

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

      // Idempotency: skip only if already marked ended or failed
      if (session.status === 'ended' || session.status === 'failed') {
        console.log(`ring-callback: session already ${session.status}, skipping terminal handling`);
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
        determinedCause = categorizeHangupCause(callStatus, hangupCause, hangupSource);
      }

      // Update DB with terminal status and normalized cause
      await adminClient.from('call_sessions').update({
        status: 'ended',
        hangup_cause: determinedCause,
        hangup_source: hangupSource || 'customer_leg',
        end_time: endTime.toISOString(),
        ringing_duration_sec: ringingSec,
        talk_duration_sec: talkSec,
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

      // 3. Cancel/hangup customer leg if still active
      const customerUuid = session.customer_call_uuid || callUuid;
      if (customerUuid && callStatus !== 'completed') {
        try {
          await plivoClient.calls.cancel(customerUuid);
        } catch (_e) {
          try { await plivoClient.calls.hangup(customerUuid); } catch (_e2) {}
        }
      }

      return new NextResponse('OK', { status: 200 });
    }

    // --- Handle NON-customer-leg or ringing/in-progress status updates ---
    // Update DB status for agent or customer ringing events
    if (callStatus === 'ringing') {
      if (leg === 'customer' && roomFromQuery) {
        await adminClient.from('call_sessions').update({
          status: 'customer_ringing'
        }).eq('room_name', roomFromQuery);
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

    // Handle agent-leg terminal failures
    if (['failed', 'rejected', 'busy', 'no-answer', 'canceled'].includes(callStatus) && leg !== 'customer') {
      let session = null;
      if (callUuid) {
        const { data } = await adminClient
          .from('call_sessions')
          .select('*')
          .or(`agent_call_uuid.eq.${callUuid},customer_call_uuid.eq.${callUuid}`)
          .maybeSingle();
        session = data;
      }

      if (session && session.status !== 'ended' && session.status !== 'connected') {
        const normalizedCause = categorizeHangupCause(callStatus, hangupCause, hangupSource);
        await adminClient.from('call_sessions').update({
          status: 'failed',
          hangup_cause: normalizedCause,
          end_time: new Date().toISOString(),
          talk_duration_sec: 0,
        }).eq('id', session.id);
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Ring callback error:', error);
    // Always return 200 to Plivo to prevent retries
    return new NextResponse('OK', { status: 200 });
  }
}
