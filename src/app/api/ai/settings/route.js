import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let { data: settings } = await adminClient.from('ai_settings').select('*').limit(1).single();
    
    if (!settings) {
      await adminClient.from('ai_settings').insert({ is_incoming_ai_enabled: false });
      const { data: newSettings } = await adminClient.from('ai_settings').select('*').limit(1).single();
      settings = newSettings;
    }

    return NextResponse.json({ settings }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const updates = await req.json();

    const adminClient = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: settings } = await adminClient.from('ai_settings').select('id').limit(1).single();

    if (settings) {
      await adminClient.from('ai_settings').update(updates).eq('id', settings.id);
    } else {
      await adminClient.from('ai_settings').insert(updates);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
