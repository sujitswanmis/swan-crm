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
    const role = url.searchParams.get('role') || event.role || 'agent';
    const callUuid = event.CallUUID || event.CallUuid || '';
    const appBaseUrl = getPlivoWebhookBaseUrl(req);

    // The agent conference-enter callback records the agent UUID and answer
    // time. Avoid a database round trip on this latency-sensitive answer URL.
    if (roomName && role !== 'agent') {
      try {
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const updatePayload = {};

        if (role === 'customer' || role === 'customer_conf') {
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
            .eq('room_name', roomName)
            .in('status', ['initiated', 'ringing', 'agent_answered', 'customer_ringing', 'connected']);
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

    const noAutoDial = role === 'agent' ? '' : '&amp;autodial=0';
    const callbackUrl = `${appBaseUrl}/api/plivo/conference-callback?room=${encodeURIComponent(cleanRoom)}${noAutoDial}`;
    const recordCallbackUrl = `${appBaseUrl}/api/plivo/recording-callback?room=${encodeURIComponent(cleanRoom)}`;
    const waitSound = isAgentRole ? ` waitSound="${appBaseUrl}/api/plivo/wait-silence"` : '';
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Conference callbackUrl="${callbackUrl}" callbackMethod="POST" startConferenceOnEnter="${startOnEnter}" endConferenceOnExit="${endOnExit}"${waitSound} record="true" recordCallbackUrl="${recordCallbackUrl}">
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
