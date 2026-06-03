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

    const authId = (process.env.PLIVO_AUTH_ID || '').trim().replace(/['"]/g, '');
    const authToken = (process.env.PLIVO_AUTH_TOKEN || '').trim().replace(/['"]/g, '');

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

    // Use Plivo API to generate a JWT Access Token for the browser SDK
    const now = Math.floor(Date.now() / 1000);
    const b64 = Buffer.from(`${authId}:${authToken}`).toString('base64');
    const plivoUrl = `https://api.plivo.com/v1/Account/${authId}/JWT/Token/`;
    
    const plivoRes = await fetch(plivoUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + b64,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        iss: authId,
        sub: agentData.plivo_username,
        nbf: now - 300,       // 5 minutes in the past to prevent clock skew issues
        exp: now + 86400,     // Valid for 24 hours
        per: {
          voice: {
            incoming_allow: true,
            outgoing_allow: true
          }
        }
      })
    });

    const plivoData = await plivoRes.json();
    if (!plivoRes.ok) {
      throw new Error(plivoData.error || 'Failed to generate token from Plivo API');
    }

    return NextResponse.json({ token: plivoData.token });

  } catch (error) {
    console.error('Token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

