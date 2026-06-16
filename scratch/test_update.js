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
    name: "Trigger Update Test Lead",
    company: "Test Company",
    our_company: "NSMLR",
    phone: "7777777777",
    status: "None"
  };

  const { data: insertData, error: insertError } = await supabase.from('leads').insert([testLead]).select();
  if (insertError) {
    console.error("Insert error:", insertError);
    return;
  }
  
  const inserted = insertData[0];
  console.log("Inserted lead initially:", inserted);

  // Attempt to update lead_ref_id
  const { data: updateData, error: updateError } = await supabase
    .from('leads')
    .update({ lead_ref_id: "202606091234567" })
    .eq('id', inserted.id)
    .select();

  if (updateError) {
    console.error("Update error:", updateError);
  } else {
    console.log("Updated lead:", updateData[0]);
  }

  // Clean up
  await supabase.from('leads').delete().eq('id', inserted.id);
  console.log("Cleaned up test lead.");
}
run();
