const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function verifyPasswords() {
  const { data, error } = await adminClient
    .from('call_agents')
    .select('id, display_name, plivo_username, plivo_password');
  
  if (error) { console.error('Error:', error.message); return; }
  
  console.log('=== call_agents table (with passwords) ===\n');
  data.forEach(a => {
    const hasPwd = a.plivo_password ? '✅' : '❌ MISSING';
    console.log(`${hasPwd} ${a.display_name}`);
    console.log(`   username: ${a.plivo_username || 'N/A'}`);
    console.log(`   password: ${a.plivo_password || 'N/A'}`);
    console.log('');
  });
}

verifyPasswords().catch(console.error);
