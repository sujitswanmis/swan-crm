const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const authId = env.PLIVO_AUTH_ID;
const authToken = env.PLIVO_AUTH_TOKEN;
const b64 = Buffer.from(authId + ':' + authToken).toString('base64');
const endpointId = '174793004058391'; // ADMIN0001

// Reset password to a known value so we can use username/password login
const newPassword = 'SwanCRM@2025!';

async function updateEndpointPassword() {
  const res = await fetch(`https://api.plivo.com/v1/Account/${authId}/Endpoint/${endpointId}/`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + b64,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password: newPassword })
  });
  
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text);
  console.log('');
  console.log('New password set to:', newPassword);
  console.log('Username: admin434792858589734357666520');
}

updateEndpointPassword().catch(console.error);
