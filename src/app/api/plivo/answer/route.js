import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPlivoWebhookBaseUrl } from '@/app/api/plivo/utils';

export async function GET() {
  return new NextResponse('Plivo Answer Webhook Active', { status: 200 });
}

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const roomName = url.searchParams.get('room');
    const customerNumber = url.searchParams.get('customer_number') || '';
    const role = url.searchParams.get('role') || 'agent';
    const appBaseUrl = getPlivoWebhookBaseUrl(req);
    const fromNumber = process.env.PLIVO_FROM_NUMBER || '+918035340622';

    // 1. DIRECT CARRIER-BRIDGED CALLING VIA <Dial>:
    // When the agent answers, directly dial the customer. This bridges the audio stream immediately,
    // allowing the agent to hear real telecom early media:
    // - Operator voice announcements ("Number is switched off", "Out of coverage", "User busy")
    // - Customer's actual caller tune or telecom network ringing tone
    // - Immediate termination if customer cuts or rejects the call
    if (role === 'agent' && customerNumber && roomName) {
      try {
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        await adminClient
          .from('call_sessions')
          .update({
            status: 'customer_ringing',
            agent_answer_time: new Date().toISOString()
          })
          .eq('room_name', roomName);
      } catch (dbErr) {
        console.error('Error updating call session in answer:', dbErr);
      }

      const actionUrl = `${appBaseUrl}/api/plivo/dial-action?room=${roomName}`;
      const callbackUrl = `${appBaseUrl}/api/plivo/dial-callback?room=${roomName}`;
      const recordCallbackUrl = `${appBaseUrl}/api/plivo/recording-callback?room=${roomName}`;

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial callerId="${fromNumber}" action="${actionUrl}" method="POST" callbackUrl="${callbackUrl}" callbackMethod="POST" timeout="35" record="true" recordCallbackUrl="${recordCallbackUrl}">
        <Number>${customerNumber}</Number>
    </Dial>
</Response>`;

      return new NextResponse(xml, {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    // 2. Fallback Conference Mode (for multi-party merge/guest legs)
    if (role === 'customer' && roomName) {
      try {
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        await adminClient
          .from('call_sessions')
          .update({
            status: 'connected',
            customer_answer_time: new Date().toISOString()
          })
          .eq('room_name', roomName);
      } catch (dbErr) {
        console.error('Error marking customer answered in answer route:', dbErr);
      }
    }

    const endOnExit = (role === 'agent') ? 'true' : 'false';
    const startOnEnter = (role === 'agent') ? 'false' : 'true';

    const callbackUrl = `${appBaseUrl}/api/plivo/conference-callback?room=${roomName}&amp;customer_number=${encodeURIComponent(customerNumber)}`;
    const recordCallbackUrl = `${appBaseUrl}/api/plivo/recording-callback?room=${roomName}`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Conference callbackUrl="${callbackUrl}" callbackMethod="POST" startConferenceOnEnter="${startOnEnter}" endConferenceOnExit="${endOnExit}" record="true" recordCallbackUrl="${recordCallbackUrl}">
        ${roomName}
    </Conference>
</Response>`;

    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
      },
    });
  } catch (error) {
    console.error('Answer webhook error:', error);
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>', {
      status: 500,
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}
