const fs = require('fs');
const fetch = require('node-fetch');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const auth = Buffer.from(`${env.NEXT_PUBLIC_PLIVO_AUTH_ID}:${env.PLIVO_AUTH_TOKEN}`).toString('base64');

async function testApi() {
  const res = await fetch(`https://api.plivo.com/v1/Account/${env.NEXT_PUBLIC_PLIVO_AUTH_ID}/Endpoint/`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  const data = await res.json();
  console.log(data.objects[0]);
}
testApi();
