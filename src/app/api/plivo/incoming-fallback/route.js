import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'Plivo Incoming Fallback Webhook',
    method: 'POST only (configured in Plivo application)'
  });
}

export async function POST(req) {
  try {
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);

    const dialStatus = event.DialStatus || event.Event || '';
    const fromNumber = event.From || '';
    const toNumber = event.To || '+918035340622';

    console.log(`[Incoming Fallback Webhook] WebRTC DialStatus: ${dialStatus} for caller ${fromNumber}`);

    // If WebRTC call was answered successfully, no fallback needed
    if (dialStatus === 'completed' || dialStatus === 'answered') {
      return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
        status: 200,
        headers: { 'Content-Type': 'application/xml' }
      });
    }

    // Otherwise, WebRTC was not answered / timed out. Execute Mobile Fallback!
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let routeTo = process.env.DEFAULT_FORWARD_TO || '+917888399954';
    try {
      const { data: dbSettings } = await adminClient
        .from('call_agents')
        .select('mobile_number')
        .eq('plivo_username', 'system_settings_forward')
        .maybeSingle();
      if (dbSettings && dbSettings.mobile_number) {
        routeTo = dbSettings.mobile_number;
      }
    } catch (dbErr) {
      console.error('[Incoming Fallback] Error fetching global forwarding number:', dbErr);
    }
    routeTo = routeTo.replace(/['"]/g, '').trim();

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const missedCallActionUrl = `${protocol}://${host}/api/plivo/missed-call-handler`;

    console.log(`[Incoming Fallback Webhook] WebRTC failed/timed-out. Dialing Mobile Fallback: ${routeTo}`);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial callerId="${toNumber}" timeout="25" action="${missedCallActionUrl}">
        <Number>${routeTo}</Number>
    </Dial>
</Response>`;

    return new NextResponse(xml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' }
    });

  } catch (error) {
    console.error('Incoming fallback webhook error:', error);
    let routeTo = process.env.DEFAULT_FORWARD_TO || '+919988119276';
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="+918035340622"><Number>${routeTo}</Number></Dial></Response>`;
    return new NextResponse(xml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
  }
}
