import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // AI agent could send JSON or Form data based on configuration
    const bodyText = await req.text();
    let data;
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = Object.fromEntries(new URLSearchParams(bodyText));
    }

    const {
      call_uuid,
      caller_number,
      caller_name,
      location,
      purpose,
      product_interest,
      quantity,
      business_name,
      district,
      state,
      ai_summary,
      transcript,
      recording_url,
      duration_seconds,
      callback_required,
      callback_datetime,
      transfer_required
    } = data;

    // Update the call log
    let callLogId = null;
    if (call_uuid) {
      const { data: updatedLog } = await adminClient
        .from('ai_call_logs')
        .update({
          call_status: 'completed',
          ai_summary,
          transcript,
          recording_url,
          duration_seconds: parseInt(duration_seconds) || 0,
          callback_required: callback_required === 'true' || callback_required === true,
          callback_datetime: callback_datetime || null,
          transfer_required: transfer_required === 'true' || transfer_required === true,
          customer_intent: purpose,
          call_result: purpose ? 'answered' : 'unknown'
        })
        .eq('plivo_call_uuid', call_uuid)
        .select()
        .single();
      
      if (updatedLog) {
        callLogId = updatedLog.id;
      }
    }

    // Only create a lead if the caller showed actual interest or provided their details
    if (caller_name || purpose || product_interest) {
      await adminClient.from('ai_incoming_leads').insert({
        caller_number,
        caller_name,
        location,
        purpose,
        product_interest,
        quantity,
        business_name,
        district,
        state,
        ai_summary,
        callback_required: callback_required === 'true' || callback_required === true,
        callback_datetime: callback_datetime || null,
        transfer_required: transfer_required === 'true' || transfer_required === true,
        call_log_id: callLogId,
        lead_status: transfer_required ? 'transfer_requested' : (callback_required ? 'callback_requested' : 'new')
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Incoming AI Save Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
