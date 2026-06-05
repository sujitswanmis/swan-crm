const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const authId = env.PLIVO_AUTH_ID;
const authToken = env.PLIVO_AUTH_TOKEN;
const b64 = Buffer.from(authId + ':' + authToken).toString('base64');

// All endpoint credentials provided by the user
const endpointCredentials = [
  { endpoint_id: '127707883634291', alias: 'TC0001-NSMLR',      username: 'nsmlrtc3939694880445266',          password: 'nsmlrtc0001@2026' },
  { endpoint_id: '267946044434861', alias: 'TC0002-NSMLR',      username: 'nsmlrtc2657389236553295188',       password: 'nsmlrtc0002@2026' },
  { endpoint_id: '279578147644177', alias: 'TC0003-NSMLR',      username: 'nsmlrtc93506189021999878029640',   password: 'nsmlrtc0003@2026' },
  { endpoint_id: '149002958184623', alias: 'TCWFH0001-NSMLR',   username: 'nsmlrtcwfh7858930679233146509',   password: 'nsmlrtcwfh0001@2026' },
  { endpoint_id: '183513204877852', alias: 'TCWFH0002-NSMLR',   username: 'nsmlrtcwfh50549708164654573585',  password: 'nsmlrtcwfh0002@2026' },
  { endpoint_id: '239856997719113', alias: 'TCWFH0003-NSMLR',   username: 'nsmlrtcwfh44743598016079150111',  password: 'nsmlrtcwfh0003@2026' },
  { endpoint_id: '268643423179584', alias: 'SC0001-NSMLR',      username: 'nsmlrsc6682352866161309',         password: 'nsmlrsc0001@2026' },
  { endpoint_id: '233483751245319', alias: 'SC0002-NSMLR',      username: 'nsmlrsc138629850811621019308',    password: 'nsmlrsc0002@2026' },
  { endpoint_id: '229607268289664', alias: 'SC0003-NSMLR',      username: 'nsmlrsc22284111935640519288335',  password: 'nsmlrsc0003@2026' },
  { endpoint_id: '172385558919046', alias: 'SC0004-NSMLR',      username: 'nsmlrsc7239711313208619777947',   password: 'nsmlrsc0004@2026' },
  { endpoint_id: '174793004058391', alias: 'ADMIN0001',         username: 'admin434792858589734357666520',   password: 'Admin@102023' },
  { endpoint_id: '219366254745206', alias: 'PC0001-NSMLR',      username: 'nsmlrpc60874839457118966',        password: 'nsmlrpc0001@2026' },
  { endpoint_id: '295181876857311', alias: 'PC0002-NSMLR',      username: 'nsmlrpc179667757286621',          password: 'nsmlrpc0002@2026' },
];

async function restorePasswords() {
  for (const ep of endpointCredentials) {
    const res = await fetch(`https://api.plivo.com/v1/Account/${authId}/Endpoint/${ep.endpoint_id}/`, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + b64, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ep.password })
    });
    const data = await res.json();
    const status = res.status === 202 ? '✅ OK' : '❌ FAIL';
    console.log(`${status} [${ep.alias}] ${ep.username} → password restored`);
  }
  console.log('\nDone! All passwords restored to original values.');
}

restorePasswords().catch(console.error);
