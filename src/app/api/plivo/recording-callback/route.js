import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const roomName = url.searchParams.get('room');
    
    // Parse Plivo webhook form data
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);
    
    const recordUrl = event.RecordUrl;
    const recordDuration = event.RecordDuration;

    if (roomName && recordUrl) {
      const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      await adminClient.from('call_sessions').update({
        recording_url: recordUrl
      }).eq('room_name', roomName);
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Recording callback error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}
