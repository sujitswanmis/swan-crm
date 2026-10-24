import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'Plivo Hangup Webhook',
    method: 'POST only (configured in Plivo application)'
  });
}

export async function POST(req) {
  try {
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);

    const callUuid = event.CallUUID;
    const hangupCause = event.HangupCause;
    const hangupSource = event.HangupSource;
    const billDuration = event.BillDuration;
    const totalCost = event.TotalCost;

    if (!callUuid) return new NextResponse('OK', { status: 200 });

    processHangupAsync(callUuid, event).catch(console.error);

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Hangup error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}

async function processHangupAsync(callUuid, event) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  await adminClient.from('call_events').insert({
    call_uuid: callUuid,
    event_type: 'hangup',
    raw_payload: event
  });

  // Check if it's customer call UUID
  let { data: session } = await adminClient
    .from('call_sessions')
    .select('*')
    .eq('customer_call_uuid', callUuid)
    .single();

  if (!session) {
    // Check if it's agent call uuid
    const { data: agentSession } = await adminClient
      .from('call_sessions')
      .select('*')
      .eq('agent_call_uuid', callUuid)
      .single();
    session = agentSession;
  }

  if (session) {
    await adminClient.from('call_sessions').update({
      hangup_cause: event.HangupCause,
      hangup_source: event.HangupSource,
      talk_duration_sec: parseInt(event.BillDuration) || 0,
      total_cost: parseFloat(event.TotalCost) || 0,
      status: 'ended',
      end_time: new Date().toISOString()
    }).eq('id', session.id);
  }
}
