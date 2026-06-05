const fs = require('fs');
const plivo = require('plivo');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const client = new plivo.Client(env.PLIVO_AUTH_ID, env.PLIVO_AUTH_TOKEN);

async function testGet() {
  // Test getting by username
  try {
    const ep = await client.endpoints.get('admin434792858589734357666520');
    console.log('Get by username succeeded. App:', ep.application);
  } catch(e) {
    console.error('Get by username failed:', e.message);
  }

  // Test getting by ID
  try {
    const ep = await client.endpoints.get('174793004058391');
    console.log('Get by ID succeeded. App:', ep.application);
  } catch(e) {
    console.error('Get by ID failed:', e.message);
  }
}

testGet().catch(console.error);
