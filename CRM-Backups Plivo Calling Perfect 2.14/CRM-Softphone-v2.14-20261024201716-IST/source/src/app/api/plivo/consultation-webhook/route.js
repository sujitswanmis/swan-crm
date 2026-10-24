import { NextResponse } from 'next/server';
import {
  CONSULTATION_PROTOCOL, CONSULTATION_HOLD_AUDIO, ConsultationError, openConsultationWebhook,
  consultationAnswerXml, consultationEvent, consultationRetryXml, hangupXml,
} from '@/lib/plivoConsultation';

export const maxDuration = 60;
const xml = body => new NextResponse(body, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'no-store' } });

async function handle(req) {
  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.get('health') === '1') {
    return NextResponse.json({ protocol: CONSULTATION_PROTOCOL }, { headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const { ctx, row, mode, role, attempt } = await openConsultationWebhook(req);
    const event = req.method === 'POST' ? Object.fromEntries(new URLSearchParams(await req.text())) : Object.fromEntries(url.searchParams);
    if (mode === 'answer') {
      const expectedCall = row.data[role === 'agent' ? 'agent_call_uuid' : 'customer_call_uuid'];
      if (!['agent', 'customer'].includes(role) || !event.CallUUID || event.CallUUID !== expectedCall) {
        return new NextResponse('Invalid call callback', { status: 403 });
      }
      return xml(consultationAnswerXml(ctx, row, role));
    }
    if (mode === 'hold') {
      return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Play loop="0">${row.data.base_url}${CONSULTATION_HOLD_AUDIO}</Play></Response>`);
    }
    if (!['events', 'call', 'record', 'exit'].includes(mode)) throw new ConsultationError('Invalid callback mode.', 400);
    await consultationEvent(ctx, mode === 'exit' ? { ...event, EventName: 'ParticipantExit' } : event, { mode, role, attempt });
    return mode === 'exit' ? xml(hangupXml) : new NextResponse('OK');
  } catch (error) {
    console.error('Consultation callback:', error.message);
    if (url.searchParams.get('mode') === 'answer' && !(error instanceof ConsultationError && error.status < 500)) {
      return xml(consultationRetryXml(req));
    }
    // Reject invalid signatures, but let Plivo retry transient storage/provider
    // failures instead of treating a failed callback as a successful action.
    return new NextResponse('Callback could not be processed', {
      status: error instanceof ConsultationError && error.status < 500 ? error.status : 503,
    });
  }
}

export const GET = handle;
export const POST = handle;
