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
  console.log("=== CHECKING USER ROLES ===");
  const { data: roles, error } = await supabase
    .from('user_roles')
    .select('*');

  if (error) {
    console.error("Error fetching user roles:", error);
    return;
  }

  console.log(`Total user roles records: ${roles.length}`);
  roles.forEach(r => {
    console.log(`- UserID: ${r.user_id} | Name: ${r.emp_name} | Role: ${r.role_name} | Company: ${r.company} | Email: ${r.emp_email}`);
  });
}

run();
