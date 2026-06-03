const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');

async function checkEvents() {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
  // Get recent sessions
  const { data: sessions } = await supabase.from('call_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3);
      
  console.log('--- RECENT SESSIONS ---');
  sessions.forEach(s => console.log(s.created_at, s.status, s.customer_number, s.room_name));

  // Get recent events
  const { data: events } = await supabase.from('call_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
      
  console.log('\n--- RECENT EVENTS ---');
  events.forEach(e => console.log(e.created_at, e.event_type, e.call_uuid));
}

checkEvents().catch(console.error);
