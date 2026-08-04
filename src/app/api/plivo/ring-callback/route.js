import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import plivo from 'plivo';

// All terminal customer-side call status values from Plivo (various spellings)
const TERMINAL_CUSTOMER_STATUSES = new Set([
  'busy',
  'busy-line',
  'rejected',
  'no-answer',
  'timeout',
  'ring-timeout',
  'ring-timeout-reached',
  'failed',
  'cancel',
  'canceled',
  'cancelled',
  'originator-cancel',
]);

// Map Plivo terminal status to a user-visible DB status
function terminalStatusLabel(callStatus, hangupCause) {
  const s = (callStatus || '').toLowerCase();
  const h = (hangupCause || '').toLowerCase();
  if (s === 'busy' || s === 'busy-line') return 'failed';
  if (s === 'rejected') return 'failed';
  if (s === 'no-answer' || s.includes('timeout') || s.includes('ring-timeout')) return 'failed';
  if (h.includes('cancel') || s.includes('cancel')) return 'failed';
  if (s === 'failed') return 'failed';
  return 'failed';
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

    // Always return 200 for idempotency
    if (!callStatus) {
      return new NextResponse('OK', { status: 200 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // --- Handle CUSTOMER leg terminal events ---
    if (leg === 'customer' && TERMINAL_CUSTOMER_STATUSES.has(callStatus)) {
      // Find session by room_name first (stable), fallback to call UUID
      let session = null;

      if (roomFromQuery) {
        const { data } = await adminClient
          .from('call_sessions')
          .select('*')
          .eq('room_name', roomFromQuery)
          .single();
        session = data;
      }

      if (!session && callUuid) {
        const { data } = await adminClient
          .from('call_sessions')
          .select('*')
          .or(`customer_call_uuid.eq.${callUuid},customer_call_uuid.eq.${requestUuid}`)
          .single();
        session = data;
      }

      if (!session) {
        console.log('ring-callback: no session found for room/uuid, returning OK');
        return new NextResponse('OK', { status: 200 });
      }

      // Idempotency: skip if already connected or ended
      if (session.customer_answer_time || session.status === 'connected' || session.status === 'ended') {
        console.log(`ring-callback: session already ${session.status}, skipping terminal handling`);
        return new NextResponse('OK', { status: 200 });
      }

      const endTime = new Date();
      const agentAnsTime = session.agent_answer_time ? new Date(session.agent_answer_time) : null;
      const startTime = session.start_time ? new Date(session.start_time) : (agentAnsTime || endTime);
      const ringingSec = agentAnsTime
        ? Math.max(0, Math.floor((endTime - agentAnsTime) / 1000))
        : Math.max(0, Math.floor((endTime - startTime) / 1000));

      const newStatus = terminalStatusLabel(callStatus, hangupCause);

      // Update DB with terminal status and cause
      await adminClient.from('call_sessions').update({
        status: newStatus,
        hangup_cause: callStatus,
        hangup_source: hangupSource || 'customer_leg',
        end_time: endTime.toISOString(),
        ringing_duration_sec: ringingSec,
        talk_duration_sec: 0,
      }).eq('id', session.id);

      console.log(`ring-callback: customer ${callStatus} for room=${session.room_name}, hanging up conference/agent`);

      // Immediately clean up conference and employee leg
      const plivoClient = new plivo.Client(
        process.env.PLIVO_AUTH_ID,
        process.env.PLIVO_AUTH_TOKEN
      );

      // 1. Hangup conference (ends agent audio/waitSound immediately)
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

      // 3. Cancel/hangup customer leg if still active (e.g. ring-callback fired before hangup)
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
    // Update DB status for agent or generic leg ringing events
    if (callStatus === 'ringing') {
      // Agent ringing — update status to ringing if still initiated
      if (callUuid) {
        const { data: agentSession } = await adminClient
          .from('call_sessions')
          .select('id, status')
          .eq('agent_call_uuid', callUuid)
          .single();

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
          .single();
        session = data;
      }

      if (session && session.status !== 'ended' && session.status !== 'connected') {
        await adminClient.from('call_sessions').update({
          status: 'failed',
          hangup_cause: callStatus,
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
