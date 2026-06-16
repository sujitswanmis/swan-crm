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

async function assignIds() {
  console.log("Fetching customer users...");
  const { data: users, error } = await supabase
    .from('user_roles')
    .select('user_id, email, created_at, emp_id')
    .eq('role', 'customer')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  console.log(`Found ${users.length} customer users.`);

  let index = 1;
  for (const user of users) {
    const generatedId = `CUST-${String(index).padStart(10, '0')}`;
    console.log(`Updating user ${user.email} (${user.emp_id}) to have ID: ${generatedId}`);
    
    const { error: updateErr } = await supabase
      .from('user_roles')
      .update({ emp_id: generatedId })
      .eq('user_id', user.user_id);

    if (updateErr) {
      console.error(`Failed to update ${user.email}:`, updateErr.message);
    } else {
      console.log(`Successfully assigned ${generatedId} to ${user.email}`);
    }
    index++;
  }

  console.log("Done assigning customer IDs.");
}

assignIds();
