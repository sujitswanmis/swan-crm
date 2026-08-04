import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const roomName = url.searchParams.get('room');
    const customerNumber = url.searchParams.get('customer_number') || '';

    const role = url.searchParams.get('role') || 'agent';
    // Agent: endConferenceOnExit=true, startConferenceOnEnter=false
    // Customer: endConferenceOnExit=false, startConferenceOnEnter=true
    const endOnExit = (role === 'agent') ? 'true' : 'false';
    const startOnEnter = (role === 'agent') ? 'false' : 'true';
    const appBaseUrl = url.origin;

    const callbackUrl = `${appBaseUrl}/api/plivo/conference-callback?room=${roomName}&amp;customer_number=${encodeURIComponent(customerNumber)}`;
    const recordCallbackUrl = `${appBaseUrl}/api/plivo/recording-callback?room=${roomName}`;

    // waitSound loops ringback.wav for the AGENT while waiting for customer.
    // Only set on the agent leg — customer leg has no waitSound.
    // Audio stops automatically when startConferenceOnEnter fires (customer joins).
    const waitSoundAttr = (role === 'agent')
      ? ` waitSound="${appBaseUrl}/ringback.wav"`
      : '';

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Conference callbackUrl="${callbackUrl}" callbackMethod="POST" startConferenceOnEnter="${startOnEnter}" endConferenceOnExit="${endOnExit}" record="true" recordCallbackUrl="${recordCallbackUrl}"${waitSoundAttr}>
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
