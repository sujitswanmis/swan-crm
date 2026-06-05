const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAndFixAllKeys() {
  const { data: agents } = await adminClient.from('call_agents').select('*');
  
  const authId = env.PLIVO_AUTH_ID.trim();
  const authToken = env.PLIVO_AUTH_TOKEN.trim();
  const b64 = Buffer.from(`${authId}:${authToken}`).toString('base64');

  const res = await fetch(`https://api.plivo.com/v1/Account/${authId}/Endpoint/?limit=50`, {
    headers: { 'Authorization': 'Basic ' + b64 }
  });
  const data = await res.json();
  const plivoEndpoints = data.objects || [];
  
  for (const agent of agents) {
    if (agent.plivo_endpoint_key) {
      // Find by alias
      const epByAlias = plivoEndpoints.find(e => e.alias === agent.plivo_endpoint_key);
      if (epByAlias) {
        console.log(`Fixing ${agent.display_name}: converting key from alias ${agent.plivo_endpoint_key} to endpoint_id ${epByAlias.endpoint_id}`);
        await adminClient.from('call_agents').update({
          plivo_endpoint_key: epByAlias.endpoint_id
        }).eq('id', agent.id);
      }
    }
  }
}
checkAndFixAllKeys();
