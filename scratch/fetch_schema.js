const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    env[match[1]] = (match[2] || '').replace(/^['"]|['"]$/g, '').trim();
  }
});

async function run() {
  try {
    const url = env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/';
    console.log(`Fetching OpenAPI spec from: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`);
    }
    
    const spec = await response.json();
    console.log("\nExposed paths (tables and functions):");
    const paths = Object.keys(spec.paths);
    paths.forEach(p => {
      if (p.startsWith('/rpc/')) {
        console.log(`- RPC: ${p}`);
      } else {
        console.log(`- Table/View: ${p}`);
      }
    });
  } catch (error) {
    console.error("Error fetching schema:", error);
  }
}

run();
