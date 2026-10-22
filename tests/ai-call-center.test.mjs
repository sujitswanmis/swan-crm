import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aiReadiness, aiWebhookAuthorized, normalizeAiCallbackData, normalizeAiOutcome, normalizeAiNumber,
  normalizeIstDeadline, triggerAiCall, validAiTriggerUrl
} from '../src/lib/aiCallCenter.js';

const env = {
  PLIVO_AI_AGENT_OUTBOUND_URL: 'https://agent.example.net/trigger',
  PLIVO_AUTH_ID: 'account', PLIVO_AUTH_TOKEN: 'token',
  PLIVO_FROM_NUMBER: '+919876543210',
  AI_CALL_CENTER_WEBHOOK_SECRET: '0123456789abcdef0123456789abcdef'
};

test('placeholder agent URL blocks calling and complete setup passes', () => {
  assert.equal(validAiTriggerUrl('https://your-vercel-app.vercel.app/api/ai/agent'), false);
  assert.equal(aiReadiness({ ...env, PLIVO_AI_AGENT_OUTBOUND_URL: 'https://your-vercel-app.vercel.app/agent' }).outgoingReady, false);
  assert.equal(aiReadiness(env).outgoingReady, true);
});

test('webhooks reject missing or wrong secrets', () => {
  assert.equal(aiWebhookAuthorized(new Request('https://crm.example/api/ai/call/result'), env.AI_CALL_CENTER_WEBHOOK_SECRET), false);
  assert.equal(aiWebhookAuthorized(new Request('https://crm.example/api/ai/call/result?token=wrong'), env.AI_CALL_CENTER_WEBHOOK_SECRET), false);
  assert.equal(aiWebhookAuthorized(new Request(`https://crm.example/api/ai/call/result?token=${env.AI_CALL_CENTER_WEBHOOK_SECRET}`), env.AI_CALL_CENTER_WEBHOOK_SECRET), true);
});

test('Indian numbers and callback times are normalized', () => {
  assert.equal(normalizeAiNumber('9876543210'), '+919876543210');
  assert.equal(normalizeAiNumber('12345'), null);
  assert.equal(normalizeAiOutcome('call back'), 'Callback');
  assert.equal(normalizeIstDeadline('2026-10-16 15:30:00'), '2026-10-16T15:30:00.000+05:30');
});

test('agent trigger receives contact identity and campaign context', async () => {
  let called = false;
  await triggerAiCall({
    contact: { id: 'contact-1', mobile: '9876543210', name: 'Asha' },
    campaign: { id: 'campaign-1', language: 'Hindi', script: 'Ask about product' },
    callLogId: 'log-1', env,
    fetcher: async (url, options) => {
      called = true;
      assert.equal(url, env.PLIVO_AI_AGENT_OUTBOUND_URL);
      assert.match(options.headers.Authorization, /^Basic /);
      const body = JSON.parse(options.body);
      assert.equal(body.to, '+919876543210');
      assert.equal(body.call_log_id, 'log-1');
      assert.equal(body.script, 'Ask about product');
      return { ok: true, json: async () => ({ request_uuid: 'request-1' }) };
    }
  });
  assert.equal(called, true);
});

test('Plivo hangup event extracts renamed conversation node variables', () => {
  const data = normalizeAiCallbackData({ data: { object: {
    call_uuid: 'call-1', event_name: 'hangup', event_data: {
      'Start.http.params.call_log_id': 'log-1',
      'Start.http.params.contact_id': 'contact-1',
      'Hindi Call Screening.ai_result': 'Callback',
      'Hindi Call Screening.preferred_callback_datetime': '2026-10-16 15:30:00',
      call_duration: '42'
    }
  } } });
  assert.deepEqual(data, {
    event_name: 'hangup', call_log_id: 'log-1', contact_id: 'contact-1', call_uuid: 'call-1',
    ai_result: 'Callback', callback_datetime: '2026-10-16 15:30:00', duration_seconds: '42',
    recording_url: null, transcript: null, ai_summary: null
  });
});

test('Plivo recording event extracts its URL and call identity', () => {
  const data = normalizeAiCallbackData({ data: { object: {
    call_uuid: 'call-1', event_name: 'recording', event_data: { recording_url: 'https://example.test/recording.mp3' }
  } } });
  assert.equal(data.call_uuid, 'call-1');
  assert.equal(data.recording_url, 'https://example.test/recording.mp3');
  assert.equal(data.ai_result, null);
});

test('existing flat callbacks keep their field names', () => {
  const flat = { call_log_id: 'log-1', ai_result: 'Interested', duration_seconds: 30 };
  assert.deepEqual(normalizeAiCallbackData(flat), flat);
});
