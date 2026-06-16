const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

let supabaseUrl = '';
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
        } else if (key === 'SUPABASE_SERVICE_ROLE_KEY') {
          supabaseServiceKey = val;
        }
      }
    }
  }
} catch (e) {
  console.error("Failed to parse env file:", e);
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase configuration. URL:", supabaseUrl, "Service Key:", !!supabaseServiceKey);
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  const userId = '7712ec30-c633-4e21-94ca-b12408a8dafa';
  const email = 'sujitswanmis@gmail.com';
  const newPassword = '8881119276';

  console.log(`Connecting to: ${supabaseUrl}`);
  console.log(`Resetting password for user ${email} (ID: ${userId}) to: ${newPassword}`);

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
    userId,
    { password: newPassword }
  );

  if (error) {
    console.error(`❌ Password reset failed:`, error.message);
  } else {
    console.log(`\n✅ Password reset SUCCESSFUL!`);
    console.log(`User ID: ${data.user.id}`);
    console.log(`Email: ${data.user.email}`);
    console.log(`Updated At: ${data.user.updated_at}`);
  }
}

main().catch(console.error);
