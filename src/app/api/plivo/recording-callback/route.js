import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const roomName = url.searchParams.get('room');
    
    // Parse Plivo webhook form data
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);
    
    const recordUrl = event.RecordUrl || event.RecordingUrl || event.DialBLegRecordingUrl || '';
    const recordDuration = parseInt(event.RecordDuration || event.RecordingDuration || event.DialBLegDuration || '0', 10);
    const callUuid = event.CallUUID || event.DialBLegUUID || event.DialALegUUID || '';

    if (recordUrl) {
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      let targetSession = null;
      if (roomName) {
        const { data } = await adminClient.from('call_sessions').select('id, talk_duration_sec').eq('room_name', roomName).maybeSingle();
        targetSession = data;
      }
      if (!targetSession && callUuid) {
        const { data } = await adminClient.from('call_sessions').select('id, talk_duration_sec')
          .or(`agent_call_uuid.eq.${callUuid},customer_call_uuid.eq.${callUuid}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        targetSession = data;
      }

      if (targetSession) {
        const updatePayload = { recording_url: recordUrl };
        if (recordDuration && (!targetSession.talk_duration_sec || targetSession.talk_duration_sec === 0)) {
          updatePayload.talk_duration_sec = recordDuration;
        }
        await adminClient.from('call_sessions').update(updatePayload).eq('id', targetSession.id);
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Recording callback error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}
