import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);

    const callUuid = event.CallUUID;
    const callStatus = event.CallStatus; // "ringing", "in-progress", "completed", "failed", "rejected", "no-answer", "busy"

    if (!callUuid || !callStatus) return new NextResponse('OK', { status: 200 });

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // If call failed/rejected/busy/no-answer before entering conference
    if (['failed', 'rejected', 'busy', 'no-answer', 'canceled'].includes(callStatus)) {
      // Find if this is the agent's leg or customer's leg
      const { data: session } = await adminClient
        .from('call_sessions')
        .select('*')
        .or(`agent_call_uuid.eq.${callUuid},customer_call_uuid.eq.${callUuid}`)
        .single();

      if (session && session.status !== 'ended') {
        await adminClient.from('call_sessions').update({
          status: 'failed',
          hangup_cause: callStatus,
          end_time: new Date().toISOString()
        }).eq('id', session.id);
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Ring callback error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}
