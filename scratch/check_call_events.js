const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    env[match[1]] = (match[2] || '').replace(/^['"]|['"]$/g, '').trim();
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase.from('call_events').select('*').order('created_at', { ascending: false }).limit(20);
  if (error) {
    console.error(error);
  } else {
    console.log("Latest 20 Call Events in DB:");
    data.forEach(e => {
      console.log(`Time: ${e.created_at} | Room: ${e.room_name} | Type: ${e.event_type} | Action: ${e.raw_payload?.ConferenceAction || 'N/A'}`);
    });
  }
}
run();
