import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Normalize DialStatus / DialHangupCause to user-friendly CRM status
function mapDialOutcome(dialStatus, hangupCause) {
  const s = (dialStatus || '').toLowerCase();
  const h = (hangupCause || '').toLowerCase();

  if (s === 'busy' || h.includes('busy') || h.includes('user_busy')) {
    return 'busy';
  }
  if (s === 'no-answer' || s === 'timeout' || h.includes('timeout') || h.includes('no_answer')) {
    return 'no_answer';
  }
  if (s === 'cancel' || h.includes('cancel')) {
    return 'agent_hangup';
  }
  if (h.includes('reject') || h.includes('call rejected')) {
    return 'rejected';
  }
  if (s === 'completed') {
    return 'customer_hangup';
  }
  if (s === 'failed') {
    return 'failed';
  }
  return s || 'failed';
}

export async function GET() {
  return new NextResponse('Plivo Dial Action Active', { status: 200 });
}

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);

    const roomName = url.searchParams.get('room') || event.room || '';
    const dialStatus = event.DialStatus || '';
    const hangupCause = event.DialHangupCause || event.HangupCause || '';
    const bLegUuid = event.DialBLegUUID || '';
    const aLegUuid = event.DialALegUUID || event.CallUUID || '';
    const duration = parseInt(event.DialBLegDuration || event.Duration || '0', 10);
    const ringStatus = event.DialRingStatus;

    console.log(`dial-action: room=${roomName}, DialStatus=${dialStatus}, cause=${hangupCause}, duration=${duration}`);

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let session = null;
    if (roomName) {
      const { data } = await adminClient
        .from('call_sessions')
        .select('*')
        .eq('room_name', roomName)
        .maybeSingle();
      session = data;
    }

    if (!session && (aLegUuid || bLegUuid)) {
      const { data } = await adminClient
        .from('call_sessions')
        .select('*')
        .or(`agent_call_uuid.eq.${aLegUuid},customer_call_uuid.eq.${bLegUuid}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      session = data;
    }

    const recordUrl = event.DialBLegRecordingUrl || event.RecordingUrl || event.RecordUrl || '';

    if (session && session.status !== 'ended') {
      const determinedCause = mapDialOutcome(dialStatus, hangupCause);
      const endTime = new Date();
      const customerAnsTime = session.customer_answer_time ? new Date(session.customer_answer_time) : null;
      const agentAnsTime = session.agent_answer_time ? new Date(session.agent_answer_time) : null;
      const startTime = session.start_time ? new Date(session.start_time) : (agentAnsTime || endTime);

      let talkSec = duration;
      let ringingSec = 0;

      if (customerAnsTime) {
        talkSec = Math.max(talkSec, Math.floor((endTime - customerAnsTime) / 1000));
        ringingSec = Math.max(0, Math.floor((customerAnsTime - (agentAnsTime || startTime)) / 1000));
      } else {
        ringingSec = Math.max(0, Math.floor((endTime - (agentAnsTime || startTime)) / 1000));
      }

      const updateData = {
        status: 'ended',
        hangup_cause: determinedCause,
        hangup_source: 'plivo_dial',
        end_time: endTime.toISOString(),
        customer_call_uuid: bLegUuid || session.customer_call_uuid,
        talk_duration_sec: talkSec,
        ringing_duration_sec: ringingSec
      };

      if (recordUrl) {
        updateData.recording_url = recordUrl;
      }

      await adminClient.from('call_sessions').update(updateData).eq('id', session.id);
    }

    // Return Hangup XML so Plivo cleanly terminates the call flow
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Hangup/>
</Response>`;

    return new NextResponse(xml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' }
    });
  } catch (error) {
    console.error('dial-action error:', error);
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>', {
      status: 200,
      headers: { 'Content-Type': 'application/xml' }
    });
  }
}
