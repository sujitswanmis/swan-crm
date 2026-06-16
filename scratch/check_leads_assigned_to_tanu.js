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

const leadIds = [
  '02f63817-3df1-4a07-ba10-b759eb7f7529',
  '066e759d-be2d-43ef-9480-c0297fe4460b',
  '03c6c71e-d090-488c-9538-6fe060bb8596',
  '0aa30bad-8092-4d59-ad9b-a3134180a406',
  '0c5f08d7-924f-428c-8897-bccac3285e0e',
  '112ac927-da99-4aad-bf11-8b20649613bf',
  '16ecbc46-f37a-42fd-a804-1812097c98a3',
  '1cb3a5c6-f12f-43b2-a755-3105cf46a865',
  '4fafe1d9-670b-4f13-8459-9cc0e844d444'
];

async function run() {
  console.log("=== CHECKING TANU'S SPECFIC UPDATED LEADS ===");
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, name, company, assigned_to, our_company, status')
    .in('id', leadIds);

  if (error) {
    console.error("Error:", error);
    return;
  }

  leads.forEach(l => {
    console.log(`- ID: ${l.id} | Company: ${l.company} | Assigned To: ${l.assigned_to} | Our Company: ${l.our_company} | Status: ${l.status}`);
  });
}

run();
