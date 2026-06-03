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
  // Get all endpoints
  const plivoRes = await fetch('https://api.plivo.com/v1/Account/' + authId + '/Endpoint/', {
    headers: { 'Authorization': 'Basic ' + b64 }
  });
  const data = await plivoRes.json();
  
  // Find an unregistered one
  const freeEndpoint = data.objects.find(e => e.sip_registered === 'false' || e.sip_registered === false || e.sip_registered === null);
  
  if (!freeEndpoint) {
    console.log('No free endpoints available!');
    return;
  }
  console.log('Found free endpoint:', freeEndpoint.alias);
  
  // Assign to user
  const sbRes = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/call_agents?user_id=eq.7712ec30-c633-4e21-94ca-b12408a8dafa', {
    method: 'PATCH',
    headers: { 
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ 
      plivo_endpoint_key: freeEndpoint.alias,
      plivo_username: freeEndpoint.username,
      plivo_sip_uri: freeEndpoint.sip_uri
    })
  });
  const sbData = await sbRes.json();
  console.log('Assigned to DB:', sbData[0].plivo_endpoint_key);
}

fix().catch(console.error);
