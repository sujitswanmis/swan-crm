import { NextResponse } from 'next/server';

// GET /api/plivo/admin/endpoints - Fetch all endpoints with live registration status
export async function GET(req) {
  try {
    const authId = (process.env.PLIVO_AUTH_ID || '').trim().replace(/['\"]/g, '');
    const authToken = (process.env.PLIVO_AUTH_TOKEN || '').trim().replace(/['\"]/g, '');
    const b64 = Buffer.from(`${authId}:${authToken}`).toString('base64');

    const res = await fetch(`https://api.plivo.com/v1/Account/${authId}/Endpoint/?limit=50`, {
      headers: { 'Authorization': 'Basic ' + b64 }
    });

    const data = await res.json();
    const endpoints = (data.objects || []).map(ep => ({
      endpoint_id: ep.endpoint_id,
      alias: ep.alias,
      username: ep.username,
      sip_uri: ep.sip_uri,
      sip_registered: ep.sip_registered,
      application: ep.application,
    }));

    return NextResponse.json({ endpoints });
  } catch (error) {
    console.error('Admin endpoints error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
