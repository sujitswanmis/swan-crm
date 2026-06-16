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
    name: "Upsert Test Lead",
    company: "Test Company",
    our_company: "NSMLR",
    phone: "6666666666",
    status: "None"
  };

  const { data: insertData, error: insertError } = await supabase.from('leads').insert([testLead]).select();
  if (insertError) {
    console.error("Insert error:", insertError);
    return;
  }
  
  const inserted = insertData[0];
  console.log("Inserted lead initially:", inserted);

  // Attempt to upsert only id and lead_ref_id
  const upsertPayload = {
    id: inserted.id,
    lead_ref_id: "202606099999999"
  };

  const { data: upsertData, error: upsertError } = await supabase
    .from('leads')
    .upsert(upsertPayload)
    .select();

  if (upsertError) {
    console.error("Upsert error:", upsertError);
  } else {
    console.log("Upserted lead:", upsertData[0]);
  }

  // Clean up
  await supabase.from('leads').delete().eq('id', inserted.id);
  console.log("Cleaned up test lead.");
}
run();
