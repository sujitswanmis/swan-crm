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
  const { data, error } = await supabase.rpc('inspect_tables'); // Check if there's an RPC or query schemas
  if (error) {
    // If RPC doesn't exist, query some common tables or check tables using a raw SQL command if possible,
    // or try querying known settings tables. Let's try executing a basic query on information_schema via RPC if it exists,
    // or list tables by checking what table queries exist in the codebase.
    console.log("RPC inspect_tables failed, attempting direct schema query via SQL helper...");
    
    // Let's try to query pg_class / information_schema via standard postgres RPC if available, or just query a few likely table names
    const tables = [
      'whatsapp_settings', 'whatsapp_templates', 'whatsapp_automations', 'whatsapp_message_logs',
      'user_roles', 'user_sessions', 'audit_logs', 'leads', 'lead_notes',
      'call_agents', 'agent_endpoint_registry', 'call_sessions', 'call_events',
      'crm_config', 'plivo_settings', 'system_settings', 'settings', 'config'
    ];
    
    for (const t of tables) {
      const { data, error } = await supabase.from(t).select('*').limit(1);
      if (!error) {
        console.log(`Table exists: ${t}`);
      } else {
        if (error.code !== 'PGRST116' && error.message.indexOf('does not exist') === -1) {
          console.log(`Table exists (query error but schema match): ${t} (error: ${error.message})`);
        }
      }
    }
  } else {
    console.log("Tables:", data);
  }
}
run();
