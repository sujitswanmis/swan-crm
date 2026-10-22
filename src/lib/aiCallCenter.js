import { normalizeIndianPhoneNumber } from '../app/api/plivo/phone-number.js';

const IST_OFFSET_MS = 330 * 60 * 1000;

export function istNow() {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().replace('Z', '+05:30');
}

export function validAiTriggerUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !/^(your-|example\.|localhost$)/i.test(url.hostname)
      && !url.pathname.startsWith('/api/ai/');
  } catch {
    return false;
  }
}

export function aiReadiness(env = process.env) {
  const missing = [];
  if (!validAiTriggerUrl(env.PLIVO_AI_AGENT_OUTBOUND_URL)) missing.push('PLIVO_AI_AGENT_OUTBOUND_URL');
  if (!env.PLIVO_AUTH_ID) missing.push('PLIVO_AUTH_ID');
  if (!env.PLIVO_AUTH_TOKEN) missing.push('PLIVO_AUTH_TOKEN');
  if (!normalizeIndianPhoneNumber(env.PLIVO_FROM_NUMBER)) missing.push('PLIVO_FROM_NUMBER');
  if (!env.AI_CALL_CENTER_WEBHOOK_SECRET || env.AI_CALL_CENTER_WEBHOOK_SECRET.length < 24) missing.push('AI_CALL_CENTER_WEBHOOK_SECRET');
  return { outgoingReady: missing.length === 0, missing, schedulerReady: Boolean(env.CRON_SECRET) };
}

export function aiWebhookAuthorized(request, secret = process.env.AI_CALL_CENTER_WEBHOOK_SECRET) {
  if (!secret || secret.length < 24) return false;
  const header = request.headers.get('authorization') || '';
  const candidate = header.startsWith('Bearer ') ? header.slice(7) : new URL(request.url).searchParams.get('token');
  if (!candidate || candidate.length !== secret.length) return false;
  let difference = 0;
  for (let index = 0; index < secret.length; index++) difference |= candidate.charCodeAt(index) ^ secret.charCodeAt(index);
  return difference === 0;
}

export async function parseAiWebhook(request) {
  const raw = await request.text();
  try { return JSON.parse(raw); } catch { return Object.fromEntries(new URLSearchParams(raw)); }
}

// Plivo AI Agent events wrap flow variables under data.object.event_data. The
// conversation node can be renamed, so match extracted variables by suffix.
export function normalizeAiCallbackData(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const object = payload.data?.object;
  if (!object || typeof object !== 'object') return payload;
  const eventData = object.event_data && typeof object.event_data === 'object' ? object.event_data : {};
  const usable = (value) => {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const text = String(value).trim();
    return text && !/^\{\{.*\}\}$/.test(text) ? text : null;
  };
  const variable = (...names) => {
    for (const name of names) {
      const direct = usable(eventData[name]);
      if (direct) return direct;
      const entry = Object.entries(eventData).find(([key, value]) => key.endsWith(`.${name}`) && usable(value));
      if (entry) return usable(entry[1]);
    }
    return null;
  };
  return {
    event_name: usable(object.event_name),
    call_log_id: variable('call_log_id'),
    contact_id: variable('contact_id'),
    call_uuid: usable(object.call_uuid) || variable('uuid'),
    ai_result: variable('ai_result'),
    callback_datetime: variable('callback_datetime', 'preferred_callback_datetime'),
    duration_seconds: variable('call_duration', 'duration_seconds'),
    recording_url: variable('recording_url'),
    transcript: variable('transcript', 'transcription'),
    ai_summary: variable('ai_summary', 'summary')
  };
}

export function normalizeAiOutcome(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'interested') return 'Interested';
  if (text === 'callback' || text === 'call back') return 'Callback';
  if (text === 'not interested') return 'Not Interested';
  return text ? 'Other' : 'Unknown';
}

export function normalizeAiNumber(value) {
  return normalizeIndianPhoneNumber(value);
}

export function normalizeIstDeadline(value) {
  if (!value) return null;
  const text = String(value).trim();
  const withZone = /(?:Z|[+-]\d\d:\d\d)$/i.test(text) ? text : `${text.replace(' ', 'T')}+05:30`;
  const parsed = new Date(withZone);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() + IST_OFFSET_MS).toISOString().replace('Z', '+05:30');
}

export async function triggerAiCall({ contact, campaign, callLogId, env = process.env, fetcher = fetch }) {
  const readiness = aiReadiness(env);
  if (!readiness.outgoingReady) throw new Error(`AI setup incomplete: ${readiness.missing.join(', ')}`);
  const to = normalizeAiNumber(contact.mobile);
  if (!to) throw new Error('Invalid Indian phone number');
  const url = env.PLIVO_AI_AGENT_OUTBOUND_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${env.PLIVO_AUTH_ID}:${env.PLIVO_AUTH_TOKEN}`).toString('base64')}`
      },
      body: JSON.stringify({
        from: normalizeAiNumber(env.PLIVO_FROM_NUMBER), to,
        contact_id: contact.id, campaign_id: campaign.id, call_log_id: callLogId,
        customer_name: contact.name || '', company_name: contact.company_name || '',
        product_interest: contact.product_interest || '',
        language: campaign.language || 'Hindi', script: campaign.script || ''
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Plivo AI trigger failed (HTTP ${response.status})`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function dialNextAiContact(adminClient, campaignId) {
  const readiness = aiReadiness();
  if (!readiness.outgoingReady) throw new Error(`AI setup incomplete: ${readiness.missing.join(', ')}`);
  const { data: campaign, error: campaignError } = await adminClient.from('ai_campaigns')
    .select('id,status,language,script').eq('id', campaignId).single();
  if (campaignError || !campaign || campaign.status !== 'running') throw new Error('Campaign is not running');

  // Conditional update claims one pending contact even when a manual click and cron overlap.
  const { data: pending, error: pendingError } = await adminClient.from('ai_campaign_contacts')
    .select('id,mobile,name,company_name,product_interest,call_attempts')
    .eq('campaign_id', campaignId).eq('call_status', 'pending')
    .order('created_at', { ascending: true }).limit(1);
  if (pendingError) throw pendingError;
  if (!pending?.length) {
    const { count } = await adminClient.from('ai_campaign_contacts')
      .select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('call_status', 'dialing');
    if (!count) await adminClient.from('ai_campaigns').update({ status: 'completed' }).eq('id', campaignId).eq('status', 'running');
    return { dialed: 0, message: count ? 'Waiting for active calls' : 'No more pending contacts' };
  }

  const contact = pending[0];
  const to = normalizeAiNumber(contact.mobile);
  if (!to) {
    await adminClient.from('ai_campaign_contacts').update({ call_status: 'failed', ai_result: 'Invalid phone number' })
      .eq('id', contact.id).eq('call_status', 'pending');
    return { dialed: 0, message: 'Invalid contact number skipped' };
  }
  const { data: claimed, error: claimError } = await adminClient.from('ai_campaign_contacts')
    .update({ call_status: 'dialing', call_attempts: (contact.call_attempts || 0) + 1, last_call_at: istNow() })
    .eq('id', contact.id).eq('call_status', 'pending').select('id').maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { dialed: 0, message: 'Contact already claimed' };

  const { data: log, error: logError } = await adminClient.from('ai_call_logs').insert({
    campaign_id: campaignId, contact_id: contact.id, call_direction: 'outgoing',
    caller_number: normalizeAiNumber(process.env.PLIVO_FROM_NUMBER), receiver_number: to,
    call_status: 'dialing'
  }).select('id').single();
  if (logError || !log) {
    await adminClient.from('ai_campaign_contacts').update({ call_status: 'failed', ai_result: 'Call log could not be created' }).eq('id', contact.id);
    throw logError || new Error('Call log could not be created');
  }

  try {
    const trigger = await triggerAiCall({ contact: { ...contact, mobile: to }, campaign, callLogId: log.id });
    const requestUuid = trigger.request_uuid || trigger.requestUuid || trigger.call_uuid || null;
    if (requestUuid) await adminClient.from('ai_call_logs').update({ plivo_request_uuid: requestUuid }).eq('id', log.id);
    return { dialed: 1, contact_id: contact.id };
  } catch (error) {
    await adminClient.from('ai_call_logs').update({ call_status: 'failed', ai_summary: error.message }).eq('id', log.id);
    await adminClient.from('ai_campaign_contacts').update({ call_status: 'failed', ai_result: error.message }).eq('id', contact.id);
    throw error;
  }
}
