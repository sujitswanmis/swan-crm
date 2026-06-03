const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
const authId = env.PLIVO_AUTH_ID;
const authToken = env.PLIVO_AUTH_TOKEN;
const b64 = Buffer.from(authId + ':' + authToken).toString('base64');

fetch('https://api.plivo.com/v1/Account/' + authId + '/Endpoint/', {
  headers: { 'Authorization': 'Basic ' + b64 }
})
.then(res => res.json())
.then(data => {
  const endpoint = data.objects.find(e => e.username === 'lsazhatezr355303542446081475479852');
  console.log(endpoint);
})
.catch(console.error);
