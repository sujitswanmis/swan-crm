import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { aiWebhookAuthorized, parseAiWebhook, normalizeAiCallbackData, normalizeAiOutcome, normalizeIstDeadline } from '@/lib/aiCallCenter';

export async function POST(req) {
  if (!aiWebhookAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const data = normalizeAiCallbackData(await parseAiWebhook(req));
    if (!data.call_log_id && !data.contact_id && !data.call_uuid) {
      return NextResponse.json({ error: 'Missing call identity' }, { status: 400 });
    }
    let query = adminClient.from('ai_call_logs')
      .select('id,contact_id,campaign_id,call_status,call_result').eq('call_direction', 'outgoing');
    if (data.call_log_id) query = query.eq('id', data.call_log_id);
    else if (data.contact_id) query = query.eq('contact_id', data.contact_id);
    else query = query.eq('plivo_call_uuid', data.call_uuid);
    const { data: callLog, error: lookupError } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    if (!callLog) return NextResponse.json({ error: 'Call not found' }, { status: 404 });

    if (!data.ai_result) {
      const extras = {};
      if (data.call_uuid) extras.plivo_call_uuid = data.call_uuid;
      if (data.recording_url) extras.recording_url = data.recording_url;
      if (data.transcript) extras.transcript = data.transcript;
      if (data.ai_summary) extras.ai_summary = data.ai_summary;
      if (data.event_name !== 'hangup') {
        if (!Object.keys(extras).length) return NextResponse.json({ error: 'Missing call result' }, { status: 400 });
        const { error } = await adminClient.from('ai_call_logs').update(extras).eq('id', callLog.id);
        if (error) throw error;
        return NextResponse.json({ success: true, enrichment_only: true });
      }
    }

    const outcome = callLog.call_status === 'completed' ? (callLog.call_result || normalizeAiOutcome(data.ai_result))
      : (data.ai_result ? normalizeAiOutcome(data.ai_result) : 'Other');
    const deadline = normalizeIstDeadline(data.callback_datetime);
    const update = {
      call_status: 'completed', call_result: outcome,
      duration_seconds: Number.parseInt(data.duration_seconds, 10) || 0,
      callback_datetime: deadline
    };
    if (data.call_uuid) update.plivo_call_uuid = data.call_uuid;
    if (data.ai_summary) update.ai_summary = data.ai_summary;
    if (data.transcript) update.transcript = data.transcript;
    if (data.recording_url) update.recording_url = data.recording_url;
    const { data: completed, error: updateError } = await adminClient.from('ai_call_logs')
      .update(update).eq('id', callLog.id).neq('call_status', 'completed').select('id').maybeSingle();
    if (updateError) throw updateError;
    if (!completed) {
      const extras = {};
      if (data.call_uuid) extras.plivo_call_uuid = data.call_uuid;
      if (data.recording_url) extras.recording_url = data.recording_url;
      if (data.transcript) extras.transcript = data.transcript;
      if (data.ai_summary) extras.ai_summary = data.ai_summary;
      if (Object.keys(extras).length) await adminClient.from('ai_call_logs').update(extras).eq('id', callLog.id);
    }

    if (callLog.contact_id) {
      const { error: contactError } = await adminClient.from('ai_campaign_contacts').update({
        call_status: 'completed', ai_result: outcome, callback_datetime: deadline
      }).eq('id', callLog.contact_id).eq('call_status', 'dialing');
      if (contactError) throw contactError;
    }
    if (callLog.campaign_id) {
      const counts = await Promise.all(['completed', 'Interested', 'Callback', 'Not Interested'].map(async (status) => {
        let countQuery = adminClient.from('ai_campaign_contacts').select('id', { count: 'exact', head: true }).eq('campaign_id', callLog.campaign_id);
        countQuery = status === 'completed' ? countQuery.eq('call_status', status) : countQuery.eq('ai_result', status);
        const { count, error } = await countQuery;
        if (error) throw error;
        return count || 0;
      }));
      const { error: campaignError } = await adminClient.from('ai_campaigns').update({
        completed_calls: counts[0], interested_count: counts[1], callback_count: counts[2], not_interested_count: counts[3]
      }).eq('id', callLog.campaign_id);
      if (campaignError) throw campaignError;
      const { count: pending } = await adminClient.from('ai_campaign_contacts').select('id', { count: 'exact', head: true })
        .eq('campaign_id', callLog.campaign_id).in('call_status', ['pending', 'dialing']);
      if (!pending) await adminClient.from('ai_campaigns').update({ status: 'completed' })
        .eq('id', callLog.campaign_id).eq('status', 'running');
    }
    return NextResponse.json({ success: true, duplicate: !completed });
  } catch (error) {
    console.error('Call Result Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
