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

    // Bypass JWT and fetch the actual endpoint password from Plivo to login directly
    const b64 = Buffer.from(authId + ':' + authToken).toString('base64');
    const plivoRes = await fetch(`https://api.plivo.com/v1/Account/${authId}/Endpoint/`, {
      headers: { 'Authorization': 'Basic ' + b64 }
    });
    
    if (!plivoRes.ok) {
       return NextResponse.json({ error: 'Failed to fetch Plivo endpoints' }, { status: 500 });
    }
    
    const plivoData = await plivoRes.json();
    const endpoint = plivoData.objects.find(e => e.username === agentData.plivo_username);
    
    if (!endpoint || !endpoint.password) {
       return NextResponse.json({ error: 'Endpoint password not found' }, { status: 500 });
    }

    return NextResponse.json({ username: endpoint.username, password: endpoint.password });

  } catch (error) {
    console.error('Token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

