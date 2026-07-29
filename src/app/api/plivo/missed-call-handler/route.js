import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);

    const dialStatus = event.DialStatus || event.Event || '';
    const fromNumber = event.From || '';
    const toNumber = event.To || '';
    const parentCallUuid = event.CallUUID || event.parent_call_uuid || null;

    console.log(`[Missed Call Webhook] Mobile DialStatus: ${dialStatus} for caller ${fromNumber}`);

    if (dialStatus !== 'completed' && dialStatus !== 'answered') {
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      // 1. Log Missed Call Session in call_sessions
      await adminClient.from('call_sessions').insert([{
        call_direction: 'inbound',
        customer_number: fromNumber,
        provider_call_id: parentCallUuid,
        status: 'missed',
        remarks: `Incoming call missed (WebRTC & Mobile un-answered. Status: ${dialStatus})`
      }]);

      console.log(`[Missed Call Webhook] Logged missed call for caller ${fromNumber}`);
    }

    return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' }
    });

  } catch (error) {
    console.error('Missed call handler webhook error:', error);
    return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, { status: 200, headers: { 'Content-Type': 'application/xml' } });
  }
}
