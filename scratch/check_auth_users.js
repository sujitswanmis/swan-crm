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
  console.log("=== CHECKING AUTH USERS ===");
  const { data: { users }, error } = await supabase.auth.admin.listUsers();

  if (error) {
    console.error("Error fetching users:", error);
    return;
  }

  console.log(`Total auth users: ${users.length}`);
  users.forEach(u => {
    console.log(`- ID: ${u.id} | Email: ${u.email} | CreatedAt: ${u.created_at} | LastSignIn: ${u.last_sign_in_at}`);
  });
}

run();
