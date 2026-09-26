import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPlivoWebhookBaseUrl } from '@/app/api/plivo/utils';
import { buildOutboundDialXml } from '@/app/api/plivo/outbound-dial-xml';

const hangupXml = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const roomName = url.searchParams.get('room') || '';
    if (!/^room_[A-Za-z0-9_]{1,64}$/.test(roomName)) {
      return new NextResponse(hangupXml, { headers: { 'Content-Type': 'application/xml' } });
    }
    const event = Object.fromEntries(new URLSearchParams(await req.text()));
    const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: session, error } = await adminClient.from('call_sessions').select('*').eq('room_name', roomName).maybeSingle();
    if (error || !session || ['ended', 'failed'].includes(session.status)) {
      return new NextResponse(hangupXml, { headers: { 'Content-Type': 'application/xml' } });
    }

    // The agent answered. Give Plivo a direct Dial leg so the agent hears the
    // carrier's real early media rather than a browser or conference ring tone.
    const update = {
      status: 'agent_answered',
      agent_answer_time: session.agent_answer_time || new Date().toISOString(),
      ...(event.CallUUID ? { agent_call_uuid: event.CallUUID } : {})
    };
    const { data: updated, error: updateError } = await adminClient.from('call_sessions')
      .update(update).eq('id', session.id)
      .in('status', ['initiated', 'ringing', 'agent_answered']).select('id');
    if (updateError || !updated?.length) {
      return new NextResponse(hangupXml, { headers: { 'Content-Type': 'application/xml' } });
    }

    const xml = buildOutboundDialXml({
      roomName,
      customerNumber: session.customer_number,
      callerId: process.env.PLIVO_FROM_NUMBER || '+918035340622',
      baseUrl: getPlivoWebhookBaseUrl(req)
    });
    return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Outbound Dial XML error:', error);
    return new NextResponse(hangupXml, { headers: { 'Content-Type': 'application/xml' } });
  }
}
