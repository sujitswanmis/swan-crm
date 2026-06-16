const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const parts = trimmed.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    env[key] = val;
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("=== CHECKING ALL LEADS COMPANIES AND ASSIGNMENTS ===");
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, assigned_to, our_company, status');

  if (error) {
    console.error("Error:", error);
    return;
  }

  const groups = {};
  leads.forEach(l => {
    const key = `Company: ${l.our_company || 'null'} | AssignedTo: ${l.assigned_to || 'null'}`;
    groups[key] = (groups[key] || 0) + 1;
  });

  console.log("Groups:");
  console.log(JSON.stringify(groups, null, 2));
}

run();
