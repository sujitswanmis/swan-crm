const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCallSessions() {
  const { data, error } = await adminClient
    .from('call_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);
  
  if (error) { console.error(error); return; }
  
  if (data.length > 0) {
    console.log('call_sessions columns:', Object.keys(data[0]));
    console.log('\nSample record:');
    console.log(JSON.stringify(data[0], null, 2));
  }
}

checkCallSessions().catch(console.error);
