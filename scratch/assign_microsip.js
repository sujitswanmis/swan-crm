const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

async function fix() {
  const targetUsername = 'admin434792858589734357666520';
  
  // Assign to DB
  const sbRes = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/call_agents?user_id=eq.7712ec30-c633-4e21-94ca-b12408a8dafa', {
    method: 'PATCH',
    headers: { 
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ 
      plivo_endpoint_key: targetUsername,
      plivo_username: targetUsername,
      plivo_sip_uri: `sip:${targetUsername}@phone.plivo.com`
    })
  });
  
  console.log('Assigned to DB:', targetUsername);
}

fix().catch(console.error);
