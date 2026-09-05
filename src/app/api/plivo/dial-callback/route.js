import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  return new NextResponse('Plivo Dial Callback Active', { status: 200 });
}

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);

    const roomName = url.searchParams.get('room') || event.room || '';
    const bLegUuid = event.DialBLegUUID || event.CallUUID || '';
    const dialStatus = (event.DialStatus || event.CallStatus || '').toLowerCase();

    console.log(`dial-callback: room=${roomName}, status=${dialStatus}, bLeg=${bLegUuid}`);

    if (roomName) {
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const updateData = {};
      if (bLegUuid) updateData.customer_call_uuid = bLegUuid;

      if (dialStatus === 'answered' || dialStatus === 'in-progress' || dialStatus === 'completed') {
        updateData.status = 'connected';
        updateData.customer_answer_time = new Date().toISOString();
      } else if (dialStatus === 'ringing') {
        updateData.status = 'customer_ringing';
      }

      if (Object.keys(updateData).length > 0) {
        await adminClient
          .from('call_sessions')
          .update(updateData)
          .eq('room_name', roomName);
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('dial-callback error:', error);
    return new NextResponse('OK', { status: 200 });
  }
}
