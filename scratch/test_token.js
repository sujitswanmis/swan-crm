const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');

async function testToken() {
  const authId = env.PLIVO_AUTH_ID;
  const authToken = env.PLIVO_AUTH_TOKEN;
  const b64 = Buffer.from(authId + ':' + authToken).toString('base64');
  
  const plivoRes = await fetch(`https://api.plivo.com/v1/Account/${authId}/Endpoint/`, {
    headers: { 'Authorization': 'Basic ' + b64 }
  });
  
  const plivoData = await plivoRes.json();
  const endpoint = plivoData.objects.find(e => e.username === 'admin434792858589734357666520');
  
  console.log('Username:', endpoint.username);
  console.log('Password:', endpoint.password);
}

testToken().catch(console.error);
