const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const authId = (process.env.PLIVO_AUTH_ID || '').trim().replace(/['"]/g, '');
  const authToken = (process.env.PLIVO_AUTH_TOKEN || '').trim().replace(/['"]/g, '');
  const b64 = Buffer.from(`${authId}:${authToken}`).toString('base64');
  const url = `https://api.plivo.com/v1/Account/${authId}/Endpoint/?limit=20&offset=0`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${b64}` } });
  const data = await res.json();
  console.log('Plivo status:', res.status, 'Total count:', data?.meta?.total_count, 'Objects:', data?.objects?.length);

  const { data: dbAgents, error: credError } = await db
    .from('call_agents')
    .select('plivo_username, plivo_endpoint_key, plivo_password')
    .not('plivo_password', 'is', null);
  console.log('dbAgents count:', dbAgents?.length, 'credError:', credError);

  const { data: calls, error: callError } = await db.from('call_sessions').select('*').limit(5);
  console.log('call_sessions count:', calls?.length, 'callError:', callError);
}

run().catch(console.error);
