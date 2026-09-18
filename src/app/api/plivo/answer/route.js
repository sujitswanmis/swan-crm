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
    const fromNumber = process.env.PLIVO_FROM_NUMBER || '+918035340622';

    // 1. DIRECT CARRIER-BRIDGED CALLING VIA <Dial>:
    // When the agent answers, directly dial the customer. This bridges the audio stream immediately,
    // allowing the agent to hear real telecom early media:
    // - Operator voice announcements ("Number is switched off", "Out of coverage", "User busy")
    // - Customer's actual caller tune or telecom network ringing tone
    // - Immediate termination if customer cuts or rejects the call
    // - Instant two-way conversation with 0ms latency when customer answers
    if (role === 'agent' && customerNumber && roomName) {
      let cleanCustomer = String(customerNumber).trim().replace(/[^\d+]/g, '');
      if (!cleanCustomer.startsWith('+')) {
        const digits = cleanCustomer.replace(/\D/g, '').slice(-10);
        cleanCustomer = `+91${digits}`;
      }

      try {
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const updatePayload = {
          status: 'agent_answered',
          agent_answer_time: new Date().toISOString()
        };
        if (callUuid) {
          updatePayload.agent_call_uuid = callUuid;
        }
        await adminClient
          .from('call_sessions')
          .update(updatePayload)
          .eq('room_name', roomName);
      } catch (dbErr) {
        console.error('Error updating call session in answer:', dbErr);
      }

      const actionUrl = `${appBaseUrl}/api/plivo/dial-action?room=${encodeURIComponent(roomName)}`;
      const callbackUrl = `${appBaseUrl}/api/plivo/dial-callback?room=${encodeURIComponent(roomName)}`;
      const recordCallbackUrl = `${appBaseUrl}/api/plivo/recording-callback?room=${encodeURIComponent(roomName)}`;

      // Use redirect="false" so Plivo treats actionUrl as a status callback without disrupting active transfers
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Record recordSession="true" startOnDialAnswer="true" redirect="false" callbackUrl="${recordCallbackUrl}" callbackMethod="POST" />
    <Dial callerId="${fromNumber}" action="${actionUrl}" method="POST" callbackUrl="${callbackUrl}" callbackMethod="POST" timeout="35" redirect="false">
        <Number>${cleanCustomer}</Number>
    </Dial>
    <Hangup/>
</Response>`;

      return new NextResponse(xml, {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      });
    }

    // 2. Multi-Party / Conference Mode (for 2nd call merge, guest legs, or transferred sessions)
    if ((role === 'customer' || role === 'guest' || role === 'customer_conf' || role === 'agent_conf') && roomName) {
      try {
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const updatePayload = {
          conference_name: roomName
        };
        if (role === 'customer' || role === 'customer_conf' || role === 'guest') {
          updatePayload.status = 'connected';
          updatePayload.customer_answer_time = new Date().toISOString();
          if (callUuid && role !== 'guest') {
            updatePayload.customer_call_uuid = callUuid;
          }
        } else if (role === 'agent_conf') {
          if (callUuid) {
            updatePayload.agent_call_uuid = callUuid;
          }
        }
        await adminClient
          .from('call_sessions')
          .update(updatePayload)
          .eq('room_name', roomName);
      } catch (dbErr) {
        console.error('Error marking participant answered in answer route:', dbErr);
      }
    }

    const cleanRoom = String(roomName).trim();
    const callbackUrl = `${appBaseUrl}/api/plivo/conference-callback?room=${encodeURIComponent(cleanRoom)}`;
    const recordCallbackUrl = `${appBaseUrl}/api/plivo/recording-callback?room=${encodeURIComponent(cleanRoom)}`;

    // endConferenceOnExit is false so transient leg migrations or guest disconnects never abort ongoing calls
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Conference callbackUrl="${callbackUrl}" callbackMethod="POST" startConferenceOnEnter="true" endConferenceOnExit="false" record="true" recordCallbackUrl="${recordCallbackUrl}">${cleanRoom}</Conference>
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
