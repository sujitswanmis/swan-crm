const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

async function testEndpoint() {
  const authId = env.PLIVO_AUTH_ID;
  const authToken = env.PLIVO_AUTH_TOKEN;
  const b64 = Buffer.from(authId + ':' + authToken).toString('base64');
  
  const res = await fetch(`https://api.plivo.com/v1/Account/${authId}/Endpoint/`, {
    headers: { 'Authorization': 'Basic ' + b64 }
  });
  
  const data = await res.json();
  data.objects.forEach(e => console.log(e.username));
}

testEndpoint().catch(console.error);
