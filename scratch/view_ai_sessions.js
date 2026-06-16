const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function view() {
  const { data, error } = await supabase.from('ai_sessions').select('*');
  if (error) {
    console.error("Error:", error);
    return;
  }
  console.log("Total sessions rows:", data.length);
  data.forEach((row, i) => {
    console.log(`\nRow ${i+1}: user_id = ${row.user_id}`);
    console.log("Sessions structure:", JSON.stringify(row.sessions, null, 2));
  });
}

view();
