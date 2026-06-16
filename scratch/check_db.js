const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    // Remove quotes
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[key] = value.trim();
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAndAddColumn() {
  console.log("Checking company_documents columns...");
  
  // Try to fetch one row to inspect columns
  const { data, error } = await supabase
    .from('company_documents')
    .select('*')
    .limit(1);
    
  if (error) {
    console.error("Error fetching table:", error);
    return;
  }
  
  console.log("Sample row:", data);
  console.log("Sample row keys:", data.length > 0 ? Object.keys(data[0]) : "No rows found");
}

checkAndAddColumn();
