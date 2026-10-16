import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { aiReadiness } from '@/lib/aiCallCenter';

export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaign_id } = await req.json();

    if (!campaign_id) {
      return NextResponse.json({ error: 'Missing campaign_id' }, { status: 400 });
    }
    const readiness = aiReadiness();
    if (!readiness.outgoingReady) {
      return NextResponse.json({ error: `AI setup incomplete: ${readiness.missing.join(', ')}` }, { status: 503 });
    }

    const adminClient = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await adminClient
      .from('ai_campaigns')
      .update({ status: 'running' })
      .eq('id', campaign_id);
    if (error) throw error;

    return NextResponse.json({ success: true, message: readiness.schedulerReady
      ? 'Campaign ready for scheduler calls'
      : 'Campaign ready; use Dial Next Contact until a scheduler is configured' }, { status: 200 });
  } catch (error) {
    console.error('Start Campaign Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
