import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { aiWebhookAuthorized, parseAiWebhook } from '@/lib/aiCallCenter';

export async function POST(req) {
  if (!aiWebhookAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Parse Plivo webhook data
    const event = await parseAiWebhook(req);

    // Get the global AI settings
    const { data: settings } = await adminClient
      .from('ai_settings')
      .select('*')
      .limit(1)
      .single();

    if (!settings || !settings.is_incoming_ai_enabled) {
      return NextResponse.json({ 
        enabled: false,
        context: 'AI is unavailable. Offer a callback or transfer to the configured human number.',
        transfer_number: settings?.human_transfer_number || null
      });
    }

    const callerNumber = event.From || event.from;
    const receiverNumber = event.To || event.to;
    const callUuid = event.CallUUID || event.call_uuid;

    // Log the incoming call start
    if (!callUuid) return NextResponse.json({ error: 'Missing call UUID' }, { status: 400 });
    const { data: existingLog } = await adminClient.from('ai_call_logs').select('id')
      .eq('plivo_call_uuid', callUuid).eq('call_direction', 'incoming').limit(1).maybeSingle();
    if (!existingLog) {
      const { error: logError } = await adminClient.from('ai_call_logs').insert({
        call_direction: 'incoming', caller_number: callerNumber, receiver_number: receiverNumber,
        plivo_call_uuid: callUuid, call_status: 'in-progress', raw_payload: event
      });
      if (logError) throw logError;
    }

    // Fetch Knowledge Base Documents
    let knowledgeContext = "";
    try {
      const { data: docs } = await adminClient
        .from('company_documents')
        .select('title, content')
        .limit(12);
      
      if (docs && docs.length > 0) {
        knowledgeContext = "\n\n--- COMPANY KNOWLEDGE BASE ---\nUse the following official company rules/policies to answer the caller:\n\n" + 
          docs.map(d => {
            const cleanTitle = String(d.title || '').replace(/^\[(text|url|pdf)\]/, '');
            return `Title: ${cleanTitle}\nContent: ${String(d.content || '').slice(0, 2000)}`;
          }).join('\n\n') +
          "\n--- END KNOWLEDGE BASE ---\n";
      }
    } catch (err) {
      console.error('Failed to load knowledge base for call:', err);
    }

    const fullContext = (settings.incoming_agent_prompt || "") + knowledgeContext;

    // Return the dynamic context for Plivo AI Agent
    return NextResponse.json({
      context: fullContext,
      language: settings.default_language,
      transfer_number: settings.human_transfer_number
    }, { status: 200 });
  } catch (error) {
    console.error('Incoming AI Start Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
