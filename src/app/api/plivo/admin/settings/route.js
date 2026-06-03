import { NextResponse } from 'next/server';

// GET /api/plivo/admin/settings - Fetch current Plivo app settings
export async function GET(req) {
  try {
    const authId = (process.env.PLIVO_AUTH_ID || '').trim().replace(/['\"]/g, '');
    const authToken = (process.env.PLIVO_AUTH_TOKEN || '').trim().replace(/['\"]/g, '');
    const b64 = Buffer.from(`${authId}:${authToken}`).toString('base64');

    const appsRes = await fetch(`https://api.plivo.com/v1/Account/${authId}/Application/`, {
      headers: { 'Authorization': 'Basic ' + b64 }
    });
    const appsData = await appsRes.json();

    return NextResponse.json({
      apps: appsData.objects || [],
      fromNumber: process.env.PLIVO_FROM_NUMBER || '',
      defaultForward: process.env.DEFAULT_FORWARD_TO || '',
    });
  } catch (error) {
    console.error('Admin settings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
