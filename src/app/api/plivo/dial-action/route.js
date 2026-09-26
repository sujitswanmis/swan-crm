import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import plivo from 'plivo';
import { categorizeHangupCause, getPlivoWebhookBaseUrl } from '@/app/api/plivo/utils';

const hangupXml = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';

function conferenceRedirectXml(roomName, baseUrl) {
  const conferenceUrl = `${baseUrl}/api/plivo/answer?room=${encodeURIComponent(roomName)}&amp;role=agent_conf`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${conferenceUrl}</Redirect></Response>`;
}

export async function GET() {
  return new NextResponse('Plivo Dial Action Active');
}

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const roomName = url.searchParams.get('room') || '';
    if (!/^room_[A-Za-z0-9_]{1,64}$/.test(roomName)) {
      return new NextResponse(hangupXml, { headers: { 'Content-Type': 'application/xml' } });
    }
    const event = Object.fromEntries(new URLSearchParams(await req.text()));
    const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: session } = await adminClient.from('call_sessions').select('*').eq('room_name', roomName).maybeSingle();
    if (!session) return new NextResponse(hangupXml, { headers: { 'Content-Type': 'application/xml' } });

    // Transfer to the conference ends the original Dial. It is not a call end.
    if (session.conference_name) {
      const xml = conferenceRedirectXml(roomName, getPlivoWebhookBaseUrl(req));
      return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml' } });
    }

    const bLegUuid = event.DialBLegUUID || session.customer_call_uuid || '';
    let causeName = event.DialBLegHangupCause || event.DialBLegHangupCauseName || event.DialHangupCause || event.HangupCause || '';
    let causeCode = event.DialBLegHangupCauseCode || event.DialHangupCauseCode || event.HangupCauseCode || null;
    let source = event.DialBLegHangupSource || event.HangupSource || 'plivo_dial';
    const dialRingStatus = event.DialRingStatus;
    let cdr = null;
    if (bLegUuid) {
      try {
        const client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
        const result = await client.calls.get(bLegUuid);
        if (result?.endTime) {
          cdr = result;
          causeName = result.hangupCauseName || causeName;
          causeCode = result.hangupCauseCode || causeCode;
          source = result.hangupSource || source;
        }
      } catch (_error) {
        // The Dial action can arrive before the CDR. Session polling retries it.
      }
    }

    const answeredAt = session.customer_answer_time || cdr?.answerTime || null;
    const status = (event.DialStatus || '').toLowerCase();
    const cause = answeredAt
      ? 'customer_hangup'
      : categorizeHangupCause(status, causeName, source, 0, false, causeCode, dialRingStatus);

    if (!['ended', 'failed'].includes(session.status)) {
      const endTime = cdr?.endTime ? new Date(cdr.endTime) : new Date();
      const agentAnswerTime = session.agent_answer_time ? new Date(session.agent_answer_time) : null;
      const customerAnswerTime = answeredAt ? new Date(answeredAt) : null;
      const ringSeconds = agentAnswerTime
        ? Math.max(0, Math.floor(((customerAnswerTime || endTime) - agentAnswerTime) / 1000))
        : null;
      const talkSeconds = customerAnswerTime
        ? Math.max(0, Math.floor((endTime - customerAnswerTime) / 1000))
        : 0;
      await adminClient.from('call_sessions').update({
        status: 'ended',
        hangup_cause: cause,
        hangup_source: source,
        end_time: endTime.toISOString(),
        customer_call_uuid: bLegUuid || session.customer_call_uuid,
        customer_answer_time: answeredAt,
        ringing_duration_sec: ringSeconds,
        talk_duration_sec: talkSeconds
      }).eq('id', session.id).is('conference_name', null)
        .in('status', ['initiated', 'ringing', 'agent_answered', 'customer_ringing', 'connected']);
    }

    await adminClient.from('call_events').insert({
      room_name: roomName,
      call_uuid: bLegUuid || event.DialALegUUID || null,
      event_type: 'dial_action',
      raw_payload: event
    });
    // The transfer may have claimed the conference while this action was
    // waiting on a CDR or database write. Never hang up a transferred A-leg.
    const { data: latestSession } = await adminClient.from('call_sessions')
      .select('conference_name, status').eq('id', session.id).maybeSingle();
    if (latestSession?.conference_name && latestSession.status === 'connected') {
      const xml = conferenceRedirectXml(roomName, getPlivoWebhookBaseUrl(req));
      return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml' } });
    }
    return new NextResponse(hangupXml, { headers: { 'Content-Type': 'application/xml' } });
  } catch (error) {
    console.error('Dial action error:', error);
    return new NextResponse(hangupXml, { headers: { 'Content-Type': 'application/xml' } });
  }
}
