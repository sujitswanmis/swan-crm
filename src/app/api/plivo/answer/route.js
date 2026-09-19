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

    // Update DB based on role
    if (roomName) {
      try {
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const updatePayload = {};

        if (role === 'agent') {
          updatePayload.status = 'agent_answered';
          updatePayload.agent_answer_time = new Date().toISOString();
          if (callUuid) updatePayload.agent_call_uuid = callUuid;
        } else if (role === 'customer' || role === 'customer_conf') {
          updatePayload.status = 'connected';
          updatePayload.customer_answer_time = new Date().toISOString();
          updatePayload.conference_name = roomName;
          if (callUuid) updatePayload.customer_call_uuid = callUuid;
        } else if (role === 'agent_conf') {
          updatePayload.conference_name = roomName;
          if (callUuid) updatePayload.agent_call_uuid = callUuid;
        } else if (role === 'guest') {
          updatePayload.conference_name = roomName;
        }

        if (Object.keys(updatePayload).length > 0) {
          await adminClient
            .from('call_sessions')
            .update(updatePayload)
            .eq('room_name', roomName);
        }
      } catch (dbErr) {
        console.error('Error updating call session in answer:', dbErr);
      }
    }

    const cleanRoom = String(roomName).trim();

    // ALL legs join the same <Conference> room directly.
    // Agent:        endConferenceOnExit=true,  startConferenceOnEnter=false  (waits for customer)
    // Customer:     endConferenceOnExit=false, startConferenceOnEnter=true   (starts audio, stays if agent leaves)
    // Guest (3rd+): endConferenceOnExit=false, startConferenceOnEnter=true   (adding doesn't end call on exit)
    const isAgentRole = (role === 'agent' || role === 'agent_conf');
    const endOnExit = isAgentRole ? 'true' : 'false';
    const startOnEnter = isAgentRole ? 'false' : 'true';

    // Pass customer_number in agent leg's callbackUrl so conference-callback can auto-dial customer
    // when ConferenceFirstMember=true fires. For customer/guest legs it's not needed.
    // CRITICAL: In XML attributes, '&' must be escaped as '&amp;' or Plivo throws 'Invalid Answer XML (8011)'!
    const custParam = (role === 'agent' && customerNumber)
      ? `&amp;customer_number=${encodeURIComponent(customerNumber)}`
      : '';
    const callbackUrl = `${appBaseUrl}/api/plivo/conference-callback?room=${encodeURIComponent(cleanRoom)}${custParam}`;
    const recordCallbackUrl = `${appBaseUrl}/api/plivo/recording-callback?room=${encodeURIComponent(cleanRoom)}`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Conference callbackUrl="${callbackUrl}" callbackMethod="POST" startConferenceOnEnter="${startOnEnter}" endConferenceOnExit="${endOnExit}" record="true" recordCallbackUrl="${recordCallbackUrl}">
        ${cleanRoom}
    </Conference>
</Response>`;

    return new NextResponse(xml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error) {
    console.error('Answer webhook error:', error);
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>', {
      status: 500,
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}
