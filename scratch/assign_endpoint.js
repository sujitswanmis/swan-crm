const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});

fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/call_agents?plivo_endpoint_key=eq.TCWFH0001-NSMLR', {
  method: 'PATCH',
  headers: { 
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 
    'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  body: JSON.stringify({ 
    plivo_endpoint_key: 'cx_newswangroup_5035',
    plivo_username: 'lsazhatezr355303542446081475479852',
    plivo_sip_uri: 'sip:lsazhatezr355303542446081475479852@phone.plivo.com'
  })
}).then(res => res.json()).then(console.log).catch(console.error);
