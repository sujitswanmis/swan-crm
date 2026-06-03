const plivo = require('plivo');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testSimulate() {
  const roomName = `room_test_${Date.now()}`;
  
  const { data: sessionData } = await adminClient
      .from('call_sessions')
      .insert({
        room_name: roomName,
        agent_id: '053cd078-374d-4f7c-987d-797eaf4fa08d',
        customer_number: '6283362279',
        calling_mode: 'external_softphone',
        status: 'initiated',
        agent_dial_to: 'sip:test@phone.plivo.com'
      })
      .select()
      .single();
      
  console.log('Inserted session:', sessionData.id);

  const client = new plivo.Client(env.PLIVO_AUTH_ID, env.PLIVO_AUTH_TOKEN);
  const response = await client.calls.create(
      '+918035340622',
      'sip:test@phone.plivo.com',
      `https://swan-hosting.vercel.app/api/plivo/answer?room=${roomName}&role=agent`,
      { answerMethod: 'POST' }
    );
    
  console.log('Plivo response requestUuid:', response.requestUuid);
  
  const { error } = await adminClient
      .from('call_sessions')
      .update({ agent_call_uuid: response.requestUuid })
      .eq('id', sessionData.id);
      
  console.log('Update error:', error);
  
  const { data: updated } = await adminClient.from('call_sessions').select('*').eq('id', sessionData.id).single();
  console.log('Final agent_call_uuid in DB:', updated.agent_call_uuid);
}

testSimulate().catch(console.error);
