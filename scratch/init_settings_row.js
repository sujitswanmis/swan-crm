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
  console.log("Checking if settings row exists...");
  const { data: existing, error: findError } = await supabase
    .from('call_agents')
    .select('*')
    .eq('plivo_username', 'system_settings_forward')
    .maybeSingle();

  if (findError) {
    console.error("Error finding row:", findError.message);
    return;
  }

  if (existing) {
    console.log("Settings row already exists:", existing);
  } else {
    console.log("Settings row not found. Creating a new one...");
    const { data: inserted, error: insertError } = await supabase
      .from('call_agents')
      .insert({
        plivo_username: 'system_settings_forward',
        display_name: 'System Forwarding Number',
        mobile_number: '+917888399954',
        status: 'offline',
        is_active: false // Keep it inactive so it doesn't show in active agent lists
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting row:", insertError.message);
    } else {
      console.log("Successfully created settings row:", inserted);
    }
  }
}
run();
