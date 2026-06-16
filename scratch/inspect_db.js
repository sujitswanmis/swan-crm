const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }
    env[key] = value.trim();
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspect() {
  try {
    console.log("Connecting to Supabase...");
    
    // Get total count
    const { count, error: countError } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });
      
    if (countError) throw countError;
    console.log(`Total leads in DB: ${count}`);
    
    // Get oldest 5 leads
    const { data: oldest, error: oldestError } = await supabase
      .from('leads')
      .select('id, created_at, lead_ref_id, company, name')
      .order('created_at', { ascending: true })
      .limit(5);
      
    if (oldestError) throw oldestError;
    console.log("\nOldest 5 leads:");
    oldest.forEach((l, idx) => {
      console.log(`${idx + 1}. ID: ${l.id}, CreatedAt: ${l.created_at}, LeadRefID: ${l.lead_ref_id}, Company: ${l.company}, Name: ${l.name}`);
    });
    
    // Get newest 5 leads
    const { data: newest, error: newestError } = await supabase
      .from('leads')
      .select('id, created_at, lead_ref_id, company, name')
      .order('created_at', { ascending: false })
      .limit(5);
      
    if (newestError) throw newestError;
    console.log("\nNewest 5 leads:");
    newest.forEach((l, idx) => {
      console.log(`${idx + 1}. ID: ${l.id}, CreatedAt: ${l.created_at}, LeadRefID: ${l.lead_ref_id}, Company: ${l.company}, Name: ${l.name}`);
    });

    // Check how many have non-null lead_ref_id
    const { data: refIds, error: refError } = await supabase
      .from('leads')
      .select('lead_ref_id')
      .not('lead_ref_id', 'is', null);
      
    if (refError) throw refError;
    console.log(`\nLeads with non-null lead_ref_id: ${refIds.length}`);
    if (refIds.length > 0) {
      console.log("Sample lead_ref_id values:", refIds.slice(0, 5).map(r => r.lead_ref_id));
    }
  } catch (error) {
    console.error("Error inspecting database:", error);
  }
}

inspect();
