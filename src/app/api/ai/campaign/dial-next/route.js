import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { dialNextAiContact } from '@/lib/aiCallCenter';

export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaign_id } = await req.json();
    if (!campaign_id) return NextResponse.json({ error: 'Missing campaign_id' }, { status: 400 });

    const adminClient = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const result = await dialNextAiContact(adminClient, campaign_id);
    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (error) {
    console.error('Dial Next Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
