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

    let { data: agentData } = await adminClient
      .from('call_agents')
      .select('plivo_username, plivo_password')
      .eq('user_id', user.id)
      .single();

    // Fallback: if logged-in user is admin or unassigned agent, pick first active Plivo SIP endpoint
    if (!agentData || !agentData.plivo_username || !agentData.plivo_password) {
      const { data: fallbackList } = await adminClient
        .from('call_agents')
        .select('plivo_username, plivo_password')
        .not('plivo_username', 'is', null)
        .not('plivo_password', 'is', null)
        .limit(1);

      if (fallbackList && fallbackList.length > 0) {
        agentData = fallbackList[0];
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
      password: agentData.plivo_password
    });

  } catch (error) {
    console.error('Token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
