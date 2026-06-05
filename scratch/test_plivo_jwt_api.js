const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const authId = env.PLIVO_AUTH_ID;
const authToken = env.PLIVO_AUTH_TOKEN;
const b64 = Buffer.from(authId + ':' + authToken).toString('base64');

async function testApi() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: authId,
    sub: 'admin434792858589734357666520',
    nbf: now - 300,
    exp: now + 3600,
    app: '18308736089742385',
    per: {
      voice: {
        incoming_allow: true,
        outgoing_allow: true
      }
    },
    grants: {
      voice: {
        incoming_allow: true,
        outgoing_allow: true
      }
    }
  };

  console.log('Sending request to Plivo JWT Token endpoint...');
  const res = await fetch(`https://api.plivo.com/v1/Account/${authId}/JWT/Token/`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + b64,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  console.log('Status:', res.status);
  const data = await res.text();
  console.log('Response:', data);
}

testApi().catch(console.error);
