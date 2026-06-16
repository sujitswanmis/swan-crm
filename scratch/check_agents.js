const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');

async function checkAgents() {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from('call_agents')
    .select('*')
    
  if (data) {
    console.log(data);
  }
}
checkAgents().catch(console.error);
