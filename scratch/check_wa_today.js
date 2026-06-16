const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const parts = trimmed.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    env[key] = val;
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("=== CHECKING WA MESSAGES CREATED TODAY ===");
  const startOfDay = new Date();
  startOfDay.setHours(0,0,0,0);
  const startIso = startOfDay.toISOString();
  console.log("Start ISO (local midnight):", startIso);

  const { data: messages, error } = await supabase
    .from('wa_messages')
    .select('*')
    .gte('created_at', startIso);

  if (error) {
    console.error("Error fetching wa_messages:", error);
    return;
  }

  console.log(`Total WA messages found today: ${messages.length}`);
  
  // Group by sender / context if we can find it
  // Let's print unique keys/properties of the first message
  if (messages.length > 0) {
    console.log("Keys in message:", Object.keys(messages[0]));
    console.log("Sample message:", JSON.stringify(messages[0], null, 2));
    
    const senders = {};
    messages.forEach(m => {
      const sender = m.sender || m.created_by || 'Unknown';
      senders[sender] = (senders[sender] || 0) + 1;
    });
    console.log("\nWA messages by sender:", senders);
  }
}

run();
