import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPlivoWebhookBaseUrl } from '@/app/api/plivo/utils';
import { transferDialToConference } from '@/app/api/plivo/transfer-to-conference';

export async function GET() {
  return new NextResponse('Plivo Dial Callback Active', { status: 200 });
}

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const roomName = url.searchParams.get('room') || '';
    if (!/^room_[A-Za-z0-9_]{1,64}$/.test(roomName)) return new NextResponse('OK');
    const event = Object.fromEntries(new URLSearchParams(await req.text()));
    const action = (event.DialAction || '').toLowerCase();
    const bLegUuid = event.DialBLegUUID || '';
    const aLegUuid = event.DialALegUUID || '';
    const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: session } = await adminClient.from('call_sessions').select('*').eq('room_name', roomName).maybeSingle();
    if (!session || ['ended', 'failed'].includes(session.status)) return new NextResponse('OK');

    if (action === 'answer' || action === 'connected') {
      const update = {
        status: 'connected',
        customer_answer_time: session.customer_answer_time || new Date().toISOString(),
        ...(bLegUuid ? { customer_call_uuid: bLegUuid } : {}),
        ...(aLegUuid ? { agent_call_uuid: aLegUuid } : {})
      };
      const { data: updatedRows, error: updateError } = await adminClient.from('call_sessions')
        .update(update).eq('id', session.id)
        .in('status', ['initiated', 'ringing', 'agent_answered', 'customer_ringing', 'connected'])
        .select('id');
      if (updateError || !updatedRows?.length) {
        if (updateError) console.error('Dial callback session update failed:', updateError);
        return new NextResponse('OK');
      }

      // Move both answered legs into the existing conference so recording,
      // guest participants and per-member controls continue to work. Transfer
      // only once; if it fails the two-way Dial stays connected as a fallback.
      if (action === 'connected' && aLegUuid && bLegUuid && !session.conference_name) {
        try {
          await transferDialToConference({ ...session, ...update }, adminClient, getPlivoWebhookBaseUrl(req));
        } catch (transferError) {
          console.error('Dial-to-conference transfer failed:', transferError);
        }
      }
    } else if (action === 'hangup' && bLegUuid && !session.customer_call_uuid) {
      // Dial action provides the final cause. Save the B-leg UUID now so the
      // status endpoint can recover its CDR if that action webhook is lost.
      await adminClient.from('call_sessions').update({ customer_call_uuid: bLegUuid })
        .eq('id', session.id).is('customer_call_uuid', null);
    }

    await adminClient.from('call_events').insert({
      room_name: roomName,
      call_uuid: bLegUuid || aLegUuid || null,
      event_type: `dial_${action || 'status'}`,
      raw_payload: event
    });
    return new NextResponse('OK');
  } catch (error) {
    console.error('Dial callback error:', error);
    return new NextResponse('OK');
  }
}
