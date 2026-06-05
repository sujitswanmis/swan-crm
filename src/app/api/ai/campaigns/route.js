import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: campaigns, error } = await adminClient
      .from('ai_campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ campaigns }, { status: 200 });
  } catch (error) {
    console.error('Fetch Campaigns Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
