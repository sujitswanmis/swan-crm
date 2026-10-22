import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPlivoWebhookBaseUrl } from '@/app/api/plivo/utils';
import { buildOutboundDialXml } from '@/app/api/plivo/outbound-dial-xml';

const hangupXml = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';

export async function POST(req) {
  try {
    const url = new URL(req.url);
    const roomName = url.searchParams.get('room') || '';
    if (!/^room_[A-Za-z0-9_]{1,64}$/.test(roomName)) {
      return new NextResponse(hangupXml, { headers: { 'Content-Type': 'application/xml' } });
    }
    const event = Object.fromEntries(new URLSearchParams(await req.text()));
    const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: session, error } = await adminClient.from('call_sessions').select('*').eq('room_name', roomName).maybeSingle();
    if (error || !session || ['ended', 'failed'].includes(session.status)) {
      return new NextResponse(hangupXml, { headers: { 'Content-Type': 'application/xml' } });
    }

    // The agent answered. Give Plivo a direct Dial leg so the agent hears the
    // carrier's real early media rather than a browser or conference ring tone.
    const update = {
      status: 'agent_answered',
      agent_answer_time: session.agent_answer_time || new Date().toISOString(),
      ...(event.CallUUID ? { agent_call_uuid: event.CallUUID } : {})
    };
    const { data: updated, error: updateError } = await adminClient.from('call_sessions')
      .update(update).eq('id', session.id)
      .in('status', ['initiated', 'ringing', 'agent_answered']).select('id');
    if (updateError || !updated?.length) {
      return new NextResponse(hangupXml, { headers: { 'Content-Type': 'application/xml' } });
    }

    // Look up agent-specific assigned caller ID or workspace fallback
    let effectiveCallerId = process.env.PLIVO_FROM_NUMBER || '+918035340622';
    if (session.agent_id) {
      let { data: ag, error: agentError } = await adminClient
        .from('call_agents')
        .select('agent_code, user_id, outgoing_caller_id')
        .eq('id', session.agent_id)
        .maybeSingle();

      if (agentError?.code === '42703' || agentError?.code === 'PGRST204') {
        const legacy = await adminClient.from('call_agents').select('agent_code, user_id')
          .eq('id', session.agent_id).maybeSingle();
        ag = legacy.data;
        agentError = legacy.error;
      }
      if (agentError || !ag) throw new Error('Agent caller ID could not be verified');

      const assignedCallerId = Object.hasOwn(ag, 'outgoing_caller_id') ? ag.outgoing_caller_id : ag.agent_code;
      if (assignedCallerId && /^\+?[0-9]{8,15}$/.test(String(assignedCallerId).trim())) {
        effectiveCallerId = String(assignedCallerId).trim();
      } else if (ag?.user_id) {
        let { data: ur, error: roleError } = await adminClient
          .from('user_roles')
          .select('company, tenant_id')
          .eq('user_id', ag.user_id)
          .maybeSingle();

        // Match start-call on databases that still scope users by company.
        // A missing tenant_id must not switch the customer leg to a caller ID
        // from the platform account or another workspace.
        if (roleError?.code === '42703') {
          const legacyRole = await adminClient
            .from('user_roles')
            .select('company')
            .eq('user_id', ag.user_id)
            .maybeSingle();
          ur = legacyRole.data;
          roleError = legacyRole.error;
        }
        if (roleError || !ur) {
          throw new Error('Calling workspace could not be verified for the customer leg');
        }

        if (ur?.company || ur?.tenant_id) {
          const { getWorkspaceTelephonyConfig } = await import('@/utils/telephonyConfig');
          const wsTel = await getWorkspaceTelephonyConfig(ur?.company || '', ur?.tenant_id || null);
          if (wsTel?.fromNumber) effectiveCallerId = wsTel.fromNumber;
        }
      }
    }

    const xml = buildOutboundDialXml({
      roomName,
      customerNumber: session.customer_number,
      callerId: effectiveCallerId,
      baseUrl: getPlivoWebhookBaseUrl(req)
    });
    return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Outbound Dial XML error:', error);
    return new NextResponse(hangupXml, { headers: { 'Content-Type': 'application/xml' } });
  }
}
