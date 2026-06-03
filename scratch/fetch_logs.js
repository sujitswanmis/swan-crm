const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
const authId = env.PLIVO_AUTH_ID;
const authToken = env.PLIVO_AUTH_TOKEN;
const b64 = Buffer.from(authId + ':' + authToken).toString('base64');

async function getLogs() {
  const plivoRes = await fetch(`https://api.plivo.com/v1/Account/${authId}/Call/?limit=5`, {
    headers: { 'Authorization': 'Basic ' + b64 }
  });
  const data = await plivoRes.json();
  console.log(JSON.stringify(data.objects.map(c => ({
    from: c.from_number,
    to: c.to_number,
    state: c.call_state,
    direction: c.call_direction,
    hangup_cause_name: c.hangup_cause_name,
    hangup_cause_code: c.hangup_cause_code,
    hangup_source: c.hangup_source
  })), null, 2));
}

getLogs().catch(console.error);
