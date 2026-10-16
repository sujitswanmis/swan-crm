import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { aiReadiness } from '@/lib/aiCallCenter';

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

    return NextResponse.json({ settings, readiness: aiReadiness() }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const submitted = await req.json();
    const updates = {
      is_incoming_ai_enabled: submitted.is_incoming_ai_enabled === true,
      incoming_agent_prompt: String(submitted.incoming_agent_prompt || '').slice(0, 12000),
      default_language: ['Hindi', 'English', 'Punjabi'].includes(submitted.default_language) ? submitted.default_language : 'Hindi',
      human_transfer_number: submitted.human_transfer_number || null
    };
    if (updates.human_transfer_number && !/^\+?[1-9]\d{9,14}$/.test(updates.human_transfer_number)) {
      return NextResponse.json({ error: 'Enter a valid transfer number' }, { status: 400 });
    }

    const adminClient = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: settings } = await adminClient.from('ai_settings').select('id').limit(1).single();

    if (settings) {
      const { error } = await adminClient.from('ai_settings').update(updates).eq('id', settings.id);
      if (error) throw error;
    } else {
      const { error } = await adminClient.from('ai_settings').insert(updates);
      if (error) throw error;
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
