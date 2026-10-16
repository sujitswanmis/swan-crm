import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { aiWebhookAuthorized, parseAiWebhook, normalizeAiNumber } from '@/lib/aiCallCenter';

export async function POST(req) {
  if (!aiWebhookAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Parse Plivo webhook/function node data
    const data = await parseAiWebhook(req);

    // Usually Plivo sends "To" and "From" for outbound calls. "To" is the customer.
    const customerNumber = normalizeAiNumber(data.To || data.to || data.customer_number);
    const contactId = data.contact_id;

    if (!customerNumber && !contactId) {
      return NextResponse.json({ error: 'Missing contact identity' }, { status: 400 });
    }

    // Find the latest dialing/in-progress call log for this number
    let query = adminClient
      .from('ai_call_logs')
      .select('contact_id, campaign_id')
      .eq('call_direction', 'outgoing')
      .eq('call_status', 'dialing');
    query = contactId ? query.eq('contact_id', contactId) : query.eq('receiver_number', customerNumber);
    const { data: callLog } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (!callLog || !callLog.contact_id) {
       return NextResponse.json({ error: 'No active context found for this number' }, { status: 404 });
    }

    // Fetch Campaign and Contact details
    const { data: campaign } = await adminClient
      .from('ai_campaigns')
      .select('script, language')
      .eq('id', callLog.campaign_id)
      .single();

    const { data: contact } = await adminClient
      .from('ai_campaign_contacts')
      .select('*')
      .eq('id', callLog.contact_id)
      .single();

    return NextResponse.json({
      success: true,
      context: campaign?.script || '',
      language: campaign?.language || 'Hindi',
      customer: {
        name: contact?.name || '',
        company_name: contact?.company_name || '',
        product_interest: contact?.product_interest || '',
        custom_1: contact?.custom_1 || '',
        custom_2: contact?.custom_2 || ''
      }
    }, { status: 200 });
  } catch (error) {
    console.error('Agent Context Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
