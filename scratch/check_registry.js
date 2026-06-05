const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkEndpointRegistry() {
  const { data, error } = await adminClient
    .from('agent_endpoint_registry')
    .select('*')
    .limit(1);
    
  if (error) {
    console.error('Error fetching registry:', error.message);
    return;
  }
  
  if (data.length > 0) {
    console.log('Columns in agent_endpoint_registry:', Object.keys(data[0]));
  } else {
    console.log('No data in agent_endpoint_registry');
  }
}

checkEndpointRegistry();
