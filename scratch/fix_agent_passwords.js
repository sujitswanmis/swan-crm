const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const plivoCredentialsMap = {
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

async function fixAgentPassword() {
  const { data, error } = await adminClient
    .from('call_agents')
    .select('id, display_name, plivo_endpoint_key, plivo_username');
    
  if (error) {
    console.error('Error fetching agents:', error.message);
    return;
  }
  
  for (const agent of data) {
    if (agent.plivo_username) {
        const password = plivoCredentialsMap[agent.plivo_username];
        if (password) {
            const { error: updateError } = await adminClient.from('call_agents').update({ plivo_password: password }).eq('id', agent.id);
            if (updateError) {
                console.error(`Error updating password for ${agent.display_name}:`, updateError.message);
            } else {
                console.log(`Successfully updated password for ${agent.display_name}`);
            }
        } else {
            console.warn(`No password found for username ${agent.plivo_username}`);
        }
    }
  }
}

fixAgentPassword();
