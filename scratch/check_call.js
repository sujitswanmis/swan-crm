const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');

async function checkCall() {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const roomName = 'room_1781076946954_f7hdq';
  
  const { data: session } = await supabase
    .from('call_sessions')
    .select('*')
    .eq('room_name', roomName)
    .single();
    
  console.log('Session Details:', JSON.stringify(session, null, 2));

  const { data: events } = await supabase
    .from('call_events')
    .select('*')
    .eq('room_name', roomName)
    .order('created_at', { ascending: true });
    
  console.log('\n--- CALL EVENTS ---');
  events?.forEach(e => {
    console.log(e.created_at, e.event_type, JSON.stringify(e.raw_payload));
  });
}
checkCall().catch(console.error);
