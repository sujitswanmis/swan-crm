import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const bodyText = await req.text();
    let data;
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = Object.fromEntries(new URLSearchParams(bodyText));
    }

    const {
      call_uuid,
      customer_number, // Plivo To number
      ai_result, // Interested, Callback, Not Interested, etc.
      ai_summary,
      transcript,
      recording_url,
      duration_seconds,
      callback_datetime
    } = data;

    const callerNumber = customerNumber || data.To || data.to;

    // Find the call log
    const { data: callLog } = await adminClient
      .from('ai_call_logs')
      .select('id, contact_id, campaign_id')
      .eq('receiver_number', callerNumber)
      .eq('call_direction', 'outgoing')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (callLog) {
      // Update Call Log
      await adminClient.from('ai_call_logs').update({
        call_status: 'completed',
        call_result: ai_result || 'completed',
        ai_summary,
        transcript,
        recording_url,
        duration_seconds: parseInt(duration_seconds) || 0,
        callback_datetime: callback_datetime || null
      }).eq('id', callLog.id);

      if (callLog.contact_id) {
        // Update Contact
        await adminClient.from('ai_campaign_contacts').update({
          call_status: 'completed',
          ai_result: ai_result || 'completed',
          callback_datetime: callback_datetime || null
        }).eq('id', callLog.contact_id);

        // Update Campaign Counts
        if (callLog.campaign_id) {
           const { data: campaign } = await adminClient.from('ai_campaigns').select('*').eq('id', callLog.campaign_id).single();
           if (campaign) {
             const updates = { completed_calls: (campaign.completed_calls || 0) + 1 };
             if (ai_result?.toLowerCase() === 'interested') updates.interested_count = (campaign.interested_count || 0) + 1;
             else if (ai_result?.toLowerCase() === 'callback') updates.callback_count = (campaign.callback_count || 0) + 1;
             else if (ai_result?.toLowerCase() === 'not interested') updates.not_interested_count = (campaign.not_interested_count || 0) + 1;
             
             await adminClient.from('ai_campaigns').update(updates).eq('id', campaign.id);
           }
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Call Result Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
