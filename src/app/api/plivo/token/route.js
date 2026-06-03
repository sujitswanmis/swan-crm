import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req) {
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

    const { data: agentData } = await adminClient
      .from('call_agents')
      .select('plivo_username')
      .eq('user_id', user.id)
      .single();

    if (!agentData || !agentData.plivo_username) {
      return NextResponse.json({ error: 'Agent missing Plivo endpoint' }, { status: 400 });
    }

    // Return username + password for direct SIP login (most reliable for SIP registration)
    // Password is stored as env variable per-account (one shared password for all endpoints)
    // This is the most reliable method — loginWithAccessToken does not always trigger SIP REGISTER
    const plivoEndpointPassword = process.env.PLIVO_ENDPOINT_PASSWORD || 'SwanCRM@2025!';

    console.log(`[Token API] Returning credentials for username: ${agentData.plivo_username}`);
    return NextResponse.json({
      username: agentData.plivo_username,
      password: plivoEndpointPassword
    });

  } catch (error) {
    console.error('Token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
