import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import plivo from 'plivo';

export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaign_id, batch_size = 1 } = await req.json();

    const adminClient = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Verify campaign is running
    const { data: campaign } = await adminClient
      .from('ai_campaigns')
      .select('status, language')
      .eq('id', campaign_id)
      .single();

    if (!campaign || campaign.status !== 'running') {
      return NextResponse.json({ error: 'Campaign is not running' }, { status: 400 });
    }

    // Get next pending contacts
    const { data: contacts } = await adminClient
      .from('ai_campaign_contacts')
      .select('*')
      .eq('campaign_id', campaign_id)
      .eq('call_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(batch_size);

    if (!contacts || contacts.length === 0) {
      // Mark campaign as completed if no more pending contacts
      await adminClient.from('ai_campaigns').update({ status: 'completed' }).eq('id', campaign_id);
      return NextResponse.json({ message: 'No more pending contacts' }, { status: 200 });
    }

    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;
    const fromNumber = process.env.PLIVO_FROM_NUMBER;
    const aiAgentAnswerUrl = process.env.PLIVO_AI_AGENT_OUTBOUND_URL; // The URL provided by Plivo AI Agent Platform

    if (!aiAgentAnswerUrl) {
      return NextResponse.json({ error: 'PLIVO_AI_AGENT_OUTBOUND_URL is not configured' }, { status: 500 });
    }

    const client = new plivo.Client(authId, authToken);
    const results = [];

    for (const contact of contacts) {
      try {
        // Mark as dialing
        await adminClient.from('ai_campaign_contacts').update({ call_status: 'dialing', call_attempts: contact.call_attempts + 1, last_call_at: new Date().toISOString() }).eq('id', contact.id);

        const response = await client.calls.create(
          fromNumber,
          contact.mobile.startsWith('+') ? contact.mobile : `+91${contact.mobile}`, // Ensure proper format
          `${aiAgentAnswerUrl}?contact_id=${contact.id}&campaign_id=${campaign_id}`, // Pass context via query params
          {
            answerMethod: 'POST',
            machineDetection: 'true'
          }
        );

        results.push({ contact_id: contact.id, status: 'success', request_uuid: response.requestUuid });

        // Create initial call log
        await adminClient.from('ai_call_logs').insert({
          campaign_id,
          contact_id: contact.id,
          call_direction: 'outgoing',
          caller_number: fromNumber,
          receiver_number: contact.mobile,
          plivo_request_uuid: response.requestUuid,
          call_status: 'dialing'
        });

      } catch (err) {
        console.error(`Failed to dial contact ${contact.id}:`, err);
        await adminClient.from('ai_campaign_contacts').update({ call_status: 'failed', ai_result: err.message }).eq('id', contact.id);
        results.push({ contact_id: contact.id, status: 'failed', error: err.message });
      }
    }

    return NextResponse.json({ success: true, dialed: results.length, results }, { status: 200 });
  } catch (error) {
    console.error('Dial Next Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
