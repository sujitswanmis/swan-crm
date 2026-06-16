import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Parse Plivo webhook data
    const textData = await req.text();
    const searchParams = new URLSearchParams(textData);
    const event = Object.fromEntries(searchParams);

    // Get the global AI settings
    const { data: settings } = await adminClient
      .from('ai_settings')
      .select('*')
      .limit(1)
      .single();

    if (!settings || !settings.is_incoming_ai_enabled) {
      // If AI is disabled, we fallback to standard human routing or just return empty XML
      // Note: Ideally, Plivo should be configured to only route to AI Agent if enabled,
      // or we can return a Plivo XML here to bridge to human.
      // Assuming Plivo AI Agent is expecting context.
      return NextResponse.json({ 
        context: "AI is currently disabled. Tell the caller that all executives are busy and hang up.",
        transfer_number: settings?.human_transfer_number || null
      });
    }

    const callerNumber = event.From || event.from;
    const receiverNumber = event.To || event.to;
    const callUuid = event.CallUUID || event.call_uuid;

    // Log the incoming call start
    await adminClient.from('ai_call_logs').insert({
      call_direction: 'incoming',
      caller_number: callerNumber,
      receiver_number: receiverNumber,
      plivo_call_uuid: callUuid,
      call_status: 'in-progress',
      raw_payload: event
    });

    // Fetch Knowledge Base Documents
    let knowledgeContext = "";
    try {
      const { data: docs } = await adminClient
        .from('company_documents')
        .select('title, content')
        .limit(20);
      
      if (docs && docs.length > 0) {
        knowledgeContext = "\n\n--- COMPANY KNOWLEDGE BASE ---\nUse the following official company rules/policies to answer the caller:\n\n" + 
          docs.map(d => {
            const cleanTitle = d.title.replace(/^\[(text|url|pdf)\]/, '');
            return `Title: ${cleanTitle}\nContent: ${d.content}`;
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
