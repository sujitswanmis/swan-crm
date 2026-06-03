import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import * as plivo from 'plivo';
import jwt from 'jsonwebtoken';

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

    // Verify endpoints and extract the Application ID dynamically
    let appId = '';
    console.log(`[Token Debug] AuthID prefix: ${authId.substring(0, 4)}... AuthToken prefix: ${authToken.substring(0, 4)}...`);
    try {
      const client = new plivo.Client(authId, authToken);
      const endpoints = await client.endpoints.list();
      const endpoint = endpoints.find(e => e.username === agentData.plivo_username);
      if (endpoint) {
        console.log(`[Token Debug] Target username: ${agentData.plivo_username} exists in account.`);
        if (endpoint.application) {
          const match = endpoint.application.match(/\/Application\/([^\/]+)\//);
          if (match) {
            appId = match[1];
            console.log(`[Token Debug] Found associated Plivo App ID: ${appId}`);
          }
        }
      } else {
        console.warn(`[Token Debug] Target username: ${agentData.plivo_username} NOT found in account endpoints!`);
      }
    } catch (err) {
      console.error(`[Token Debug] Failed to fetch endpoints from Plivo:`, err.message);
    }

    // Generate Plivo JWT Access Token locally with both 'per' and 'grants' claims
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      jti: `${agentData.plivo_username}-${Date.now()}`,
      iss: authId,
      sub: agentData.plivo_username,
      nbf: now - 300,       // 5 minutes in the past to prevent clock skew issues
      exp: now + 82800,     // Valid for 23 hours (lifetime nbf to exp is 83100, which is < 24 hours / 86400 limit)
      app: appId || undefined,
      per: {
        voice: {
          incoming_allow: true,
          outgoing_allow: true
        }
      },
      grants: {
        voice: {
          incoming_allow: true,
          outgoing_allow: true
        }
      }
    };

    const token = jwt.sign(payload, authToken, {
      header: {
        typ: 'JWT',
        cty: 'plivo;v=1'
      },
      noTimestamp: true
    });

    console.log(`[Token API] Locally generated token for ${agentData.plivo_username} with App ID: ${appId}`);
    return NextResponse.json({ token });

  } catch (error) {
    console.error('Token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

