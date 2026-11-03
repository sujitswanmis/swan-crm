import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(l => {
  const idx = l.indexOf('=');
  if (idx > 0) env[l.slice(0, idx).trim()] = l.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
});

const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testHierarchy() {
  const { data: states } = await adminClient
    .from('location_states')
    .select('id, name')
    .order('name', { ascending: true });

  const { data: dists } = await adminClient
    .from('location_districts')
    .select('id, state_id, name')
    .order('name', { ascending: true });

  const stateDistrictMap = {};
  const stateIdToName = {};
  states.forEach(s => {
    stateIdToName[s.id] = s.name;
    stateDistrictMap[s.name] = [];
  });

  dists.forEach(d => {
    const sName = stateIdToName[d.state_id];
    if (sName && stateDistrictMap[sName]) {
      stateDistrictMap[sName].push(d.name);
    }
  });

  console.log('Total states:', states.length);
  console.log('States list:', states.map(s => s.name));
  console.log('Delhi districts:', stateDistrictMap['Delhi']);
  console.log('Punjab districts count:', stateDistrictMap['Punjab']?.length);
  console.log('Uttar Pradesh districts count:', stateDistrictMap['Uttar Pradesh']?.length);
}

testHierarchy().catch(console.error);
