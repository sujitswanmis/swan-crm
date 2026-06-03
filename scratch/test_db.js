const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');

async function checkDb() {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data: sessions } = await supabase.from('call_sessions').select('*').order('created_at', { ascending: false }).limit(2);
  console.log('Sessions:', JSON.stringify(sessions, null, 2));

  const { data: events } = await supabase.from('call_events').select('*').order('created_at', { ascending: false }).limit(5);
  console.log('Events:', JSON.stringify(events, null, 2));
}

checkDb().catch(console.error);
