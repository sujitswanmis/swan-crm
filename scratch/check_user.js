const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

let supabaseUrl = '';
let supabaseAnonKey = '';
let supabaseServiceKey = '';

try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/['"]/g, '');
        if (key === 'NEXT_PUBLIC_SUPABASE_URL') {
          supabaseUrl = val;
        } else if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
          supabaseAnonKey = val;
        } else if (key === 'SUPABASE_SERVICE_ROLE_KEY') {
          supabaseServiceKey = val;
        }
      }
    }
  }
} catch (e) {
  console.error("Failed to parse env file:", e);
}

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.error("Missing Supabase configuration. URL:", supabaseUrl, "Anon Key:", !!supabaseAnonKey, "Service Key:", !!supabaseServiceKey);
  process.exit(1);
}

const clientSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  const email = 'sujitswanmis@gmail.com';
  const password = '8881119276';

  console.log(`Connecting to: ${supabaseUrl}`);
  console.log(`Attempting auth.signInWithPassword for: ${email}`);

  const { data, error } = await clientSupabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error(`❌ Sign in failed:`, error.message);
  } else {
    console.log(`\n✅ Sign in SUCCESSFUL!`);
    console.log(`User ID: ${data.user.id}`);
    console.log(`Session Active: ${!!data.session}`);
  }
}

main().catch(console.error);
