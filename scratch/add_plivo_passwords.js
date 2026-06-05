const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Map username → password (original values from Plivo console)
const credentialsMap = {
  'nsmlrtc3939694880445266':          'nsmlrtc0001@2026',
  'nsmlrtc2657389236553295188':       'nsmlrtc0002@2026',
  'nsmlrtc93506189021999878029640':   'nsmlrtc0003@2026',
  'nsmlrtcwfh7858930679233146509':    'nsmlrtcwfh0001@2026',
  'nsmlrtcwfh50549708164654573585':   'nsmlrtcwfh0002@2026',
  'nsmlrtcwfh44743598016079150111':   'nsmlrtcwfh0003@2026',
  'nsmlrsc6682352866161309':          'nsmlrsc0001@2026',
  'nsmlrsc138629850811621019308':     'nsmlrsc0002@2026',
  'nsmlrsc22284111935640519288335':   'nsmlrsc0003@2026',
  'nsmlrsc7239711313208619777947':    'nsmlrsc0004@2026',
  'admin434792858589734357666520':    'Admin@102023',
  'nsmlrpc60874839457118966':         'nsmlrpc0001@2026',
  'nsmlrpc179667757286621':           'nsmlrpc0002@2026',
};

async function addPasswordColumn() {
  // Step 1: Add plivo_password column using RPC (raw SQL)
  const { error: colErr } = await adminClient.rpc('exec_sql', {
    sql: `ALTER TABLE call_agents ADD COLUMN IF NOT EXISTS plivo_password TEXT;`
  });
  if (colErr) {
    console.log('Column add via RPC failed (might not have exec_sql):', colErr.message);
    console.log('Please add this column manually via Supabase SQL editor:');
    console.log('ALTER TABLE call_agents ADD COLUMN IF NOT EXISTS plivo_password TEXT;');
  } else {
    console.log('✅ plivo_password column added successfully!');
  }

  // Step 2: Fetch all agents
  const { data: agents, error: fetchErr } = await adminClient
    .from('call_agents')
    .select('id, plivo_username');
  
  if (fetchErr) { console.error('Fetch error:', fetchErr.message); return; }
  
  // Step 3: Update each agent with their password
  let updated = 0;
  for (const agent of agents) {
    if (!agent.plivo_username) continue;
    const password = credentialsMap[agent.plivo_username];
    if (!password) {
      console.log(`⚠️  No password found for username: ${agent.plivo_username}`);
      continue;
    }
    const { error: updateErr } = await adminClient
      .from('call_agents')
      .update({ plivo_password: password })
      .eq('id', agent.id);
    
    if (updateErr) {
      console.log(`❌ Failed to update ${agent.plivo_username}:`, updateErr.message);
    } else {
      console.log(`✅ Updated ${agent.plivo_username} with password`);
      updated++;
    }
  }
  
  console.log(`\nDone! Updated ${updated}/${agents.length} agents.`);
}

addPasswordColumn().catch(console.error);
