import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaign_name, language, script } = await req.json();

    if (!campaign_name || !script) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const adminClient = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: campaign, error } = await adminClient
      .from('ai_campaigns')
      .insert({
        campaign_name,
        language: language || 'Hindi',
        script,
        created_by: user.id
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, campaign }, { status: 200 });
  } catch (error) {
    console.error('Create Campaign Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
