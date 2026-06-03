const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/call_agents?select=plivo_username,plivo_endpoint_key', {
  headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY }
}).then(res => res.json()).then(console.log).catch(console.error);
