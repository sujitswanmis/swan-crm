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
  const testLead = {
    name: "Trigger Explicit Test Lead",
    company: "Test Company",
    our_company: "NSMLR",
    phone: "8888888888",
    status: "None",
    lead_ref_id: "202606091234567" // Explicit 15-digit ID
  };

  const { data, error } = await supabase.from('leads').insert([testLead]).select();
  if (error) {
    console.error("Insert error:", error);
  } else {
    console.log("Inserted lead successfully with explicit ID:", data[0]);
    // Clean up
    await supabase.from('leads').delete().eq('id', data[0].id);
    console.log("Cleaned up test lead.");
  }
}
run();
