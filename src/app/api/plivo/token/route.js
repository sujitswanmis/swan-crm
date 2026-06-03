import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import * as plivo from 'plivo';

export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authId = (process.env.PLIVO_AUTH_ID || '').trim().replace(/"/g, '');
    const authToken = (process.env.PLIVO_AUTH_TOKEN || '').trim().replace(/"/g, '');

    if (!authId || !authToken) {
      return NextResponse.json({ error: 'Plivo credentials missing' }, { status: 500 });
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

    // Diagnostics to help verify Vercel environment variables & Plivo account mismatch
    console.log(`[Token Debug] AuthID prefix: ${authId.substring(0, 4)}... AuthToken prefix: ${authToken.substring(0, 4)}...`);
    try {
      const client = new plivo.Client(authId, authToken);
      const endpoints = await client.endpoints.list();
      const usernames = endpoints.map(e => e.username);
      const exists = usernames.includes(agentData.plivo_username);
      console.log(`[Token Debug] Target username: ${agentData.plivo_username}. Exists in Plivo account endpoints: ${exists}. Available endpoints: ${usernames.join(', ')}`);
    } catch (err) {
      console.error(`[Token Debug] Failed to verify endpoints on Plivo:`, err.message);
    }

    // Use Plivo SDK to generate a JWT Access Token for the browser SDK
    const token = new plivo.AccessToken(
      authId,
      authToken,
      agentData.plivo_username,
      { validTill: Math.floor(Date.now() / 1000) + 86400 },
      user.id
    );
    
    token.addVoiceGrants(true, true);

    return NextResponse.json({ token: token.toJwt() });

  } catch (error) {
    console.error('Token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

