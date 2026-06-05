const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');

async function checkCall() {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data, error } = await supabase
    .from('call_sessions')
    .select('*')
    .eq('agent_call_uuid', 'a87731c8-b8d5-4e66-89b0-b01ca59cc190');
    
  if (data && data.length > 0) {
    console.log('Call details:', data[0].calling_mode, data[0].agent_dial_to);
  } else {
    console.log('Call not found in DB', error);
  }
}
checkCall().catch(console.error);
