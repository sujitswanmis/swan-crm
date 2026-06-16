const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = val;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("=== DIAGNOSING TANU SHARMA 30-DAY NOTES ===");

  // 30 days ago
  const start30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: notes, error } = await supabase
    .from('lead_notes')
    .select('id, created_at, created_by, note_text, lead_id')
    .gte('created_at', start30d);

  if (error) {
    console.error("Error:", error);
    return;
  }

  const tanuNotes = notes.filter(n => {
    const cb = String(n.created_by).toLowerCase();
    return cb.includes('tanu');
  });

  console.log(`Tanu Sharma notes in last 30 days: ${tanuNotes.length}`);
  
  // Group by date (YYYY-MM-DD in local timezone)
  const groupedByLocalDate = {};
  tanuNotes.forEach(n => {
    const localDateStr = new Date(n.created_at).toLocaleDateString();
    if (!groupedByLocalDate[localDateStr]) {
      groupedByLocalDate[localDateStr] = { count: 0, uniqueLeads: new Set() };
    }
    groupedByLocalDate[localDateStr].count++;
    groupedByLocalDate[localDateStr].uniqueLeads.add(n.lead_id);
  });

  console.log("\nTanu's notes grouped by local date:");
  for (const date in groupedByLocalDate) {
    console.log(`- Date: ${date} | Notes/Updates: ${groupedByLocalDate[date].count} | Unique Leads: ${groupedByLocalDate[date].uniqueLeads.size}`);
  }
}
run();
