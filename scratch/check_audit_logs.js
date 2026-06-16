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
  console.log("=== CHECKING AUDIT LOGS TODAY ===");
  const startOfDay = new Date();
  startOfDay.setHours(0,0,0,0);
  const startIso = startOfDay.toISOString();

  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('*')
    .gte('created_at', startIso);

  if (error) {
    console.error("Error fetching audit logs:", error);
    return;
  }

  console.log(`Total audit logs found: ${logs.length}`);
  
  // Count by user/action
  const stats = {};
  logs.forEach(l => {
    const key = `${l.emp_name} (${l.email})`;
    if (!stats[key]) stats[key] = {};
    stats[key][l.action] = (stats[key][l.action] || 0) + 1;
  });

  console.log("\nAudit logs statistics today:");
  console.log(JSON.stringify(stats, null, 2));

  console.log("\nSample logs for Tanu Sharma (if any):");
  const tanuLogs = logs.filter(l => String(l.emp_name).toLowerCase().includes('tanu'));
  tanuLogs.forEach(l => {
    console.log(`- Time: ${l.created_at} | Action: ${l.action} | Target: ${l.target}`);
  });
}

run();
