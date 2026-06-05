const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');
const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function setSujitEndpoint() {
  const { data, error } = await adminClient.from('call_agents')
    .update({
      plivo_endpoint_key: 'admin434792858589734357666520',
      plivo_username: 'admin434792858589734357666520',
      plivo_sip_uri: 'sip:admin434792858589734357666520@phone.plivo.com',
      plivo_password: 'Admin@102023'
    })
    .eq('id', '053cd078-374d-4f7c-987d-797eaf4fa08d');
    
  if (error) {
    console.error('Error updating:', error.message);
  } else {
    console.log('Successfully updated Sujit\'s endpoint and password!');
  }
}

setSujitEndpoint();
