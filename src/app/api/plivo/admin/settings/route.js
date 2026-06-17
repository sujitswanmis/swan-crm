import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET /api/plivo/admin/settings - Fetch current Plivo app settings
export async function GET(req) {
  try {
    const authId = (process.env.PLIVO_AUTH_ID || '').trim().replace(/['"]/g, '');
    const authToken = (process.env.PLIVO_AUTH_TOKEN || '').trim().replace(/['"]/g, '');
    const b64 = Buffer.from(`${authId}:${authToken}`).toString('base64');

    const appsRes = await fetch(`https://api.plivo.com/v1/Account/${authId}/Application/`, {
      headers: { 'Authorization': 'Basic ' + b64 }
    });
    const appsData = await appsRes.json();

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: dbSettings } = await adminClient
      .from('call_agents')
      .select('mobile_number')
      .eq('plivo_username', 'system_settings_forward')
      .maybeSingle();

    return NextResponse.json({
      apps: appsData.objects || [],
      fromNumber: process.env.PLIVO_FROM_NUMBER || '',
      defaultForward: dbSettings?.mobile_number || process.env.DEFAULT_FORWARD_TO || '',
    });
  } catch (error) {
    console.error('Admin settings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/plivo/admin/settings - Update default forwarding number
export async function POST(req) {
  try {
    const { defaultForward } = await req.json();
    if (defaultForward === undefined) {
      return NextResponse.json({ error: 'Missing defaultForward' }, { status: 400 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await adminClient
      .from('call_agents')
      .update({ mobile_number: defaultForward })
      .eq('plivo_username', 'system_settings_forward');

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save admin settings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
