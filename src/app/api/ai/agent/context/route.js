import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  try {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Parse Plivo webhook/function node data
    const textData = await req.text();
    let data;
    try {
      data = JSON.parse(textData);
    } catch {
      data = Object.fromEntries(new URLSearchParams(textData));
    }

    // Usually Plivo sends "To" and "From" for outbound calls. "To" is the customer.
    const customerNumber = data.To || data.to || data.customer_number;

    if (!customerNumber) {
      return NextResponse.json({ error: 'Missing customer number' }, { status: 400 });
    }

    // Find the latest dialing/in-progress call log for this number
    const { data: callLog } = await adminClient
      .from('ai_call_logs')
      .select('contact_id, campaign_id')
      .eq('receiver_number', customerNumber)
      .eq('call_direction', 'outgoing')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

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
