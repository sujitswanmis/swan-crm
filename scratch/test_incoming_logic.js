const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    env[match[1]] = (match[2] || '').replace(/^['"]|['"]$/g, '').trim();
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function testIncomingRoute(fromNumber) {
  console.log(`--- Testing incoming call routing from: ${fromNumber} ---`);
  
  let routeTo = env.DEFAULT_FORWARD_TO || '+919988119276';
  // Strip any quotes if present in env variable
  routeTo = routeTo.replace(/['"]/g, '').trim();

  // 1. Find the last agent who talked to this customer
  const { data: lastCall, error: lastCallError } = await supabase
    .from('call_sessions')
    .select('agent_id')
    .eq('customer_number', fromNumber)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastCallError) {
    console.error("Database error fetching last call:", lastCallError.message);
  }

  console.log("Last call session:", lastCall);

  let targetAgentSip = null;
  let targetAgentMobile = null;
  let fallbackGroup = null;

  if (lastCall && lastCall.agent_id) {
    // 2. Check if this agent is online/available
    const { data: agentData, error: agentError } = await supabase
      .from('call_agents')
      .select('plivo_username, plivo_sip_uri, status, mobile_number')
      .eq('id', lastCall.agent_id)
      .single();

    if (agentError) {
      console.error("Database error fetching agent data:", agentError.message);
    }
    console.log("Agent data:", agentData);

    if (agentData) {
      if (agentData.status === 'available') {
        targetAgentSip = agentData.plivo_sip_uri;
        targetAgentMobile = agentData.mobile_number;
      } else {
        // Find their department/group from user_roles
        const { data: userData } = await supabase
          .from('user_roles')
          .select('emp_department')
          .eq('user_id', (await supabase.from('call_agents').select('user_id').eq('id', lastCall.agent_id).single()).data?.user_id)
          .single();
        
        console.log("Offline agent user roles data:", userData);
        if (userData && userData.emp_department) {
           fallbackGroup = userData.emp_department;
        }
      }
    }
  }

  // 3. If target agent is offline, try to find ANY available agent in the same group
  if (!targetAgentSip && fallbackGroup) {
    const { data: groupUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('emp_department', fallbackGroup);
      
    if (groupUsers && groupUsers.length > 0) {
      const userIds = groupUsers.map(u => u.user_id);
      const { data: availableGroupAgents } = await supabase
        .from('call_agents')
        .select('id, plivo_username, plivo_sip_uri, mobile_number')
        .in('user_id', userIds)
        .eq('status', 'available');
        
      console.log("Available group agents:", availableGroupAgents);
      if (availableGroupAgents && availableGroupAgents.length > 0) {
        // For simplicity, take the first one
        targetAgentSip = availableGroupAgents[0].plivo_sip_uri;
        targetAgentMobile = availableGroupAgents[0].mobile_number;
      }
    }
  }

  console.log("targetAgentSip:", targetAgentSip);
  console.log("targetAgentMobile:", targetAgentMobile);

  let dialContent = "";
  if (targetAgentSip) {
    // If agent is available, dial BOTH WebRTC and agent's mobile simultaneously!
    // If no agent mobile, dial WebRTC and the default forward mobile simultaneously!
    const sipDest = `<User>${targetAgentSip}</User>`;
    const mobileToDial = targetAgentMobile || routeTo;
    const cleanMobile = mobileToDial.replace(/['"]/g, '').trim();
    const mobileDest = `<Number>${cleanMobile}</Number>`;
    dialContent = `\n        ${sipDest}\n        ${mobileDest}`;
  } else {
    // Dial the default forwarding mobile
    const cleanForward = routeTo.replace(/['"]/g, '').trim();
    dialContent = `<Number>${cleanForward}</Number>`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial callerId="+918035340622">${dialContent}
    </Dial>
</Response>`;

  console.log("\nGenerated XML:");
  console.log(xml);
}

async function run() {
  // Test with a customer number that exists in DB
  await testIncomingRoute("+919956349526");
  
  // Test with a customer number that does not exist in DB
  await testIncomingRoute("+910000000000");
}

run();
