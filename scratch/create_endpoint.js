const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
const authId = env.PLIVO_AUTH_ID;
const authToken = env.PLIVO_AUTH_TOKEN;
const b64 = Buffer.from(authId + ':' + authToken).toString('base64');

async function fix() {
  const password = 'PlivoTestPassword123';
  const username = 'testuser' + Date.now().toString().slice(-6); // 14 chars
  
  console.log('Creating endpoint:', username);
  
  const plivoRes = await fetch('https://api.plivo.com/v1/Account/' + authId + '/Endpoint/', {
    method: 'POST',
    headers: { 
      'Authorization': 'Basic ' + b64,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: username,
      password: password,
      alias: 'TestWebRTC'
    })
  });
  
  if (!plivoRes.ok) {
    console.error('Failed to create endpoint:', await plivoRes.text());
    return;
  }
  
  const endpointData = await plivoRes.json();
  console.log('Created endpoint:', endpointData);
  
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
      plivo_endpoint_key: 'TestWebRTC',
      plivo_username: endpointData.username,
      plivo_sip_uri: `sip:${endpointData.username}@phone.plivo.com`
    })
  });
  
  console.log('Assigned to DB');
}

fix().catch(console.error);
