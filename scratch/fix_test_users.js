const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Manual parsing of .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing keys. URL:", supabaseUrl, "Key:", supabaseKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixTestUsers() {
  console.log("Fetching users...");
  const { data: users, error } = await supabase
    .from('user_roles')
    .select('user_id, email, role, is_approved');

  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  console.log("Current Users in DB:", users);

  let updatedCount = 0;
  for (const user of users) {
    // If the user has "test" or "customer" in their email, or role = 'agent' and is_approved = false,
    // convert them to approved customer so they can log in instantly.
    const isTest = user.email.includes('test') || user.email.includes('customer') || user.email.includes('cust') || (!user.is_approved && user.role === 'agent');
    
    if (isTest && user.role !== 'admin' && user.role !== 'Admin') {
      console.log(`Updating user ${user.email} to approved customer...`);
      const { error: updateErr } = await supabase
        .from('user_roles')
        .update({
          role: 'customer',
          is_approved: true,
          can_read: false,
          can_write: false
        })
        .eq('user_id', user.user_id);

      if (updateErr) {
        console.error(`Failed to update ${user.email}:`, updateErr.message);
      } else {
        updatedCount++;
      }
    }
  }

  console.log(`Successfully fixed ${updatedCount} test users.`);
}

fixTestUsers();
