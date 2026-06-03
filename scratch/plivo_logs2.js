const plivo = require('plivo');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const client = new plivo.Client(env.PLIVO_AUTH_ID, env.PLIVO_AUTH_TOKEN);

async function getLogs() {
  try {
    const calls = await client.calls.list({
      limit: 10,
    });
    
    calls.forEach(call => {
      console.log(`Time: ${call.callTime}, From: ${call.fromNumber}, To: ${call.toNumber}, Duration: ${call.billDuration}, Status: ${call.hangupCauseCode} ${call.hangupCauseName}`);
    });
  } catch (err) {
    console.error(err);
  }
}

getLogs();
