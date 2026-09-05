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

    // If customer answers, immediately mark call_sessions as connected with answer timestamp
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

    // Agent: endConferenceOnExit=true, startConferenceOnEnter=false
    // Customer: endConferenceOnExit=false, startConferenceOnEnter=true
    const endOnExit = (role === 'agent') ? 'true' : 'false';
    const startOnEnter = (role === 'agent') ? 'false' : 'true';
    const appBaseUrl = getPlivoWebhookBaseUrl(req);

    const callbackUrl = `${appBaseUrl}/api/plivo/conference-callback?room=${roomName}&amp;customer_number=${encodeURIComponent(customerNumber)}`;
    const recordCallbackUrl = `${appBaseUrl}/api/plivo/recording-callback?room=${roomName}`;

    // Note: Ringing tone is handled client-side by the softphone widget so that it cuts off
    // instantly upon pickup without relying on Plivo conference waitSound streaming into the call mixer.
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
