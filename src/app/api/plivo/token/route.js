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

    const { data: agentRows } = await adminClient
      .from('call_agents')
      .select('plivo_username, plivo_password, plivo_sip_uri')
      .eq('user_id', user.id)
      .limit(1);

    let agentData = (agentRows && agentRows.length > 0) ? agentRows[0] : null;

    // Fallback: if logged-in user is admin or unassigned agent, pick first active Plivo SIP endpoint
    if (!agentData || !agentData.plivo_username || !agentData.plivo_password) {
      const { data: fallbackRows } = await adminClient
        .from('call_agents')
        .select('plivo_username, plivo_password, plivo_sip_uri')
        .not('plivo_username', 'is', null)
        .not('plivo_password', 'is', null)
        .limit(1);

      if (fallbackRows && fallbackRows.length > 0) {
        agentData = fallbackRows[0];
      }
    }

    if (!agentData || !agentData.plivo_username) {
      return NextResponse.json({ error: 'Agent missing Plivo endpoint' }, { status: 400 });
    }

    if (!agentData.plivo_password) {
      return NextResponse.json({ error: 'Agent missing Plivo password in database. Please contact admin.' }, { status: 400 });
    }

    console.log(`[Token API] Returning credentials for username: ${agentData.plivo_username}`);
    return NextResponse.json({
      username: agentData.plivo_username,
      password: agentData.plivo_password,
      sipUri: agentData.plivo_sip_uri || `sip:${agentData.plivo_username}@phone.plivo.com`
    });

  } catch (error) {
    console.error('Token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
