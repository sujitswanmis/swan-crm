import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { aiWebhookAuthorized, parseAiWebhook, normalizeIstDeadline } from '@/lib/aiCallCenter';

export async function POST(req) {
  if (!aiWebhookAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // AI agent could send JSON or Form data based on configuration
    const data = await parseAiWebhook(req);

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

    if (!call_uuid) return NextResponse.json({ error: 'Missing call UUID' }, { status: 400 });
    const deadline = normalizeIstDeadline(callback_datetime);
    const { data: existingLog, error: lookupError } = await adminClient.from('ai_call_logs')
      .select('id,call_status').eq('plivo_call_uuid', call_uuid).eq('call_direction', 'incoming').limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    if (!existingLog) return NextResponse.json({ error: 'Incoming call not found' }, { status: 404 });
    if ((recording_url || transcript) && !purpose && !caller_name && !product_interest && !callback_required && !transfer_required) {
      const extras = {};
      if (recording_url) extras.recording_url = recording_url;
      if (transcript) extras.transcript = transcript;
      if (ai_summary) extras.ai_summary = ai_summary;
      const { error } = await adminClient.from('ai_call_logs').update(extras).eq('id', existingLog.id);
      if (error) throw error;
      return NextResponse.json({ success: true, enrichment_only: true });
    }
    const { data: updatedLog, error: updateError } = await adminClient
        .from('ai_call_logs')
        .update({
          call_status: 'completed',
          ai_summary,
          transcript,
          recording_url,
          duration_seconds: parseInt(duration_seconds) || 0,
          callback_required: callback_required === 'true' || callback_required === true,
          callback_datetime: deadline,
          transfer_required: transfer_required === 'true' || transfer_required === true,
          customer_intent: purpose,
          call_result: purpose ? 'answered' : 'unknown'
        })
        .eq('id', existingLog.id).neq('call_status', 'completed').select('id').maybeSingle();
    if (updateError) throw updateError;
    if (!updatedLog) {
      const extras = {};
      if (recording_url) extras.recording_url = recording_url;
      if (transcript) extras.transcript = transcript;
      if (ai_summary) extras.ai_summary = ai_summary;
      if (Object.keys(extras).length) await adminClient.from('ai_call_logs').update(extras).eq('id', existingLog.id);
    }

    // Only create a lead if the caller showed actual interest or provided their details
    if (caller_name || purpose || product_interest) {
      const { data: existingLead } = await adminClient.from('ai_incoming_leads').select('id')
        .eq('call_log_id', existingLog.id).limit(1).maybeSingle();
      if (!existingLead) {
      const { error: leadError } = await adminClient.from('ai_incoming_leads').insert({
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
        callback_datetime: deadline,
        transfer_required: transfer_required === 'true' || transfer_required === true,
        call_log_id: existingLog.id,
        lead_status: (transfer_required === 'true' || transfer_required === true) ? 'transfer_requested'
          : ((callback_required === 'true' || callback_required === true) ? 'callback_requested' : 'new')
      });
      if (leadError) throw leadError;
      }
    }

    return NextResponse.json({ success: true, duplicate: !updatedLog }, { status: 200 });
  } catch (error) {
    console.error('Incoming AI Save Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
