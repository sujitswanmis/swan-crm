import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPlivoWebhookBaseUrl } from '@/app/api/plivo/utils';

export async function GET() {
  return new NextResponse('Plivo Answer Webhook Active', { status: 200 });
}

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);

    const roomName = url.searchParams.get('room') || event.room || '';
    const customerNumber = url.searchParams.get('customer_number') || event.customer_number || '';
    const role = url.searchParams.get('role') || event.role || 'agent';
    const callUuid = event.CallUUID || event.CallUuid || '';
    const appBaseUrl = getPlivoWebhookBaseUrl(req);

    if (roomName) {
      try {
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const updatePayload = {
          conference_name: roomName
        };

        if (role === 'agent') {
          updatePayload.status = 'agent_answered';
          updatePayload.agent_answer_time = new Date().toISOString();
          if (callUuid) updatePayload.agent_call_uuid = callUuid;
        } else if (role === 'customer') {
          updatePayload.status = 'connected';
          updatePayload.customer_answer_time = new Date().toISOString();
          if (callUuid) updatePayload.customer_call_uuid = callUuid;
        }

        await adminClient
          .from('call_sessions')
          .update(updatePayload)
          .eq('room_name', roomName);
      } catch (dbErr) {
        console.error('Error updating call session in answer route:', dbErr);
      }
    }

    const cleanRoom = String(roomName).trim();
    // Agent: endConferenceOnExit=true, startConferenceOnEnter=false
    // Customer / Guest: endConferenceOnExit=false, startConferenceOnEnter=true
    const endOnExit = (role === 'agent') ? 'true' : 'false';
    const startOnEnter = (role === 'agent') ? 'false' : 'true';

    const callbackUrl = `${appBaseUrl}/api/plivo/conference-callback?room=${encodeURIComponent(cleanRoom)}&customer_number=${encodeURIComponent(customerNumber)}`;
    const recordCallbackUrl = `${appBaseUrl}/api/plivo/recording-callback?room=${encodeURIComponent(cleanRoom)}`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Conference callbackUrl="${callbackUrl}" callbackMethod="POST" startConferenceOnEnter="${startOnEnter}" endConferenceOnExit="${endOnExit}" record="true" recordCallbackUrl="${recordCallbackUrl}">
        ${cleanRoom}
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
