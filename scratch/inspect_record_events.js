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
  const { data, error } = await supabase
    .from('call_events')
    .select('*')
    .eq('event_type', 'record')
    .order('created_at', { ascending: false })
    .limit(3);
  if (error) {
    console.error(error);
  } else {
    console.log("Latest 3 Record Events raw payload:");
    console.log(JSON.stringify(data, null, 2));
  }
}
run();
