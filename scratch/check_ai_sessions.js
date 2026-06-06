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

async function check() {
  console.log('Checking ai_sessions table...');
  const { data, error } = await supabase.from('ai_sessions').select('*').limit(5);
  console.log('Error:', error);
  console.log('Data:', data ? data.length + ' rows' : 'No data');
  if (data && data.length > 0) {
    console.log('Sample userId:', data[0].user_id);
  }
}

check();
