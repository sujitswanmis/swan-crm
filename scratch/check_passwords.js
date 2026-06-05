const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAgentPassword() {
  const { data, error } = await adminClient
    .from('call_agents')
    .select('id, display_name, plivo_username, plivo_password');
    
  if (error) {
    console.error('Error fetching agents:', error.message);
    return;
  }
  
  console.log('Call Agents Data:');
  console.log(data);
}

checkAgentPassword();
