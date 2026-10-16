import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please login again.' }, { status: 401 });
    }

    const adminClient = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: agentData } = await adminClient
      .from('call_agents')
      .select('plivo_username, plivo_password')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!agentData || !agentData.plivo_username) {
      return NextResponse.json({
        enabled: false,
        fallbackMode: 'mobile',
        message: 'No dedicated Plivo SIP endpoint configured. Direct/Mobile calling active.'
      }, { status: 200 });
    }

    if (!agentData.plivo_password) {
      return NextResponse.json({
        enabled: false,
        fallbackMode: 'mobile',
        message: 'Agent missing Plivo password. Direct/Mobile calling active.'
      }, { status: 200 });
    }

    return NextResponse.json({
      enabled: true,
      username: agentData.plivo_username,
      password: agentData.plivo_password
    });

  } catch (error) {
    console.error('Token error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req) {
  return POST(req);
}

