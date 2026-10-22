import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { aiReadiness, dialNextAiContact } from '@/lib/aiCallCenter';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const readiness = aiReadiness();
  if (!readiness.outgoingReady) {
    return NextResponse.json({ error: `AI setup incomplete: ${readiness.missing.join(', ')}` }, { status: 503 });
  }
  try {
    const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: campaigns, error } = await adminClient.from('ai_campaigns')
      .select('id').eq('status', 'running').order('created_at', { ascending: true }).limit(5);
    if (error) throw error;
    const results = [];
    // One contact per campaign per invocation caps usage and avoids a blocking worker.
    for (const campaign of campaigns || []) {
      try { results.push({ campaign_id: campaign.id, ...await dialNextAiContact(adminClient, campaign.id) }); }
      catch (cause) { results.push({ campaign_id: campaign.id, error: cause.message }); }
    }
    return NextResponse.json({ results });
  } catch (error) {
    console.error('AI campaign scheduler:', error);
    return NextResponse.json({ error: 'Scheduler failed' }, { status: 500 });
  }
}
