const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCallAgents() {
  const { data, error } = await adminClient.from('call_agents').select('*');
  if (error) { console.error(error); return; }
  console.log('call_agents columns:', Object.keys(data[0] || {}));
  console.log('All agents data:');
  data.forEach(a => console.log(JSON.stringify(a)));
}

checkCallAgents().catch(console.error);
