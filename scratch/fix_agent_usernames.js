const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAndFix() {
  const { data: agents } = await adminClient.from('call_agents').select('*');
  console.log('Agents before fix:');
  console.table(agents.map(a => ({ name: a.display_name, key: a.plivo_endpoint_key, username: a.plivo_username, password: !!a.plivo_password })));
  
  const authId = env.PLIVO_AUTH_ID.trim();
  const authToken = env.PLIVO_AUTH_TOKEN.trim();
  const b64 = Buffer.from(`${authId}:${authToken}`).toString('base64');

  const res = await fetch(`https://api.plivo.com/v1/Account/${authId}/Endpoint/?limit=50`, {
    headers: { 'Authorization': 'Basic ' + b64 }
  });
  const data = await res.json();
  const plivoEndpoints = data.objects || [];
  
  for (const agent of agents) {
    if (agent.plivo_endpoint_key && !agent.plivo_username) {
      // Find the endpoint by alias (since agent.plivo_endpoint_key was storing the alias)
      const ep = plivoEndpoints.find(e => e.alias === agent.plivo_endpoint_key || e.endpoint_id === agent.plivo_endpoint_key);
      if (ep) {
        console.log(`Fixing ${agent.display_name}: setting username to ${ep.username}`);
        await adminClient.from('call_agents').update({
          plivo_username: ep.username,
          plivo_sip_uri: ep.sip_uri,
          plivo_endpoint_key: ep.endpoint_id // Update to the new endpoint_id format so the dropdown selects it correctly!
        }).eq('id', agent.id);
      } else {
        console.log(`Could not find Plivo endpoint for ${agent.plivo_endpoint_key}`);
      }
    }
  }
}
checkAndFix();
