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
  const targetLeadId = 'b5aa95ce-ea14-4373-95c9-8dc98dd83f51';
  const { data, error } = await supabase.from('leads').select('id, lead_ref_id, company, name').eq('id', targetLeadId);
  if (error) {
    console.error(error);
  } else {
    console.log("Verified target lead in DB:", data[0]);
  }
}
run();
