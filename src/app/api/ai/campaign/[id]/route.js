import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req, { params }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { id } = resolvedParams;

    const adminClient = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: campaign, error: cError } = await adminClient
      .from('ai_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (cError) throw cError;

    const { data: contacts } = await adminClient
      .from('ai_campaign_contacts')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false });

    return NextResponse.json({ campaign, contacts }, { status: 200 });
  } catch (error) {
    console.error('Fetch Campaign Detail Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
