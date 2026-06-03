const plivo = require('plivo');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const client = new plivo.Client(env.PLIVO_AUTH_ID, env.PLIVO_AUTH_TOKEN);

async function testCall() {
  try {
    const res = await client.calls.create(
      '+918035340622',
      'sip:admin434792858589734357666520@phone.plivo.com',
      'https://swan-hosting.vercel.app/api/plivo/answer?room=test&role=agent',
      { answerMethod: 'POST' }
    );
    console.log('Response:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error(err);
  }
}

testCall();
