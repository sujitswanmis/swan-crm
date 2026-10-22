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

    const { data: agentData, error: agentError } = await adminClient
      .from('call_agents')
      .select('plivo_username, plivo_password, is_active')
      .eq('user_id', user.id)
      .maybeSingle();

    if (agentError) return NextResponse.json({ error: 'Agent authorization could not be verified. Please retry.' }, { status: 503 });
    if (agentData?.is_active === false) {
      return NextResponse.json({ enabled: false, revoked: true, message: 'Your call center access has been revoked. Contact your administrator.' }, { status: 403 });
    }

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

