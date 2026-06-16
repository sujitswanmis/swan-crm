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

async function run() {
  try {
    console.log("Fetching all leads for migration...");
    let allLeads = [];
    let page = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from('leads')
        .select('id, created_at, lead_ref_id, company, name')
        .order('created_at', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);
        
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allLeads = allLeads.concat(data);
      if (data.length < pageSize) break;
      page++;
    }
    
    console.log(`Fetched ${allLeads.length} leads total.`);
    
    // Sort explicitly by created_at ASC, id ASC to be 100% stable
    allLeads.sort((a, b) => {
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      if (dateA - dateB !== 0) return dateA - dateB;
      return a.id.localeCompare(b.id);
    });
    
    // Calculate new 15-digit IDs
    const updates = allLeads.map((lead, idx) => {
      const d = new Date(lead.created_at || new Date());
      const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
      const seq = String(idx + 1).padStart(7, '0');
      const new_id = dateStr + seq;
      return {
        id: lead.id,
        name: lead.name,
        company: lead.company,
        old_ref_id: lead.lead_ref_id,
        new_ref_id: new_id
      };
    });
    
    // Save backup mapping to a local JSON file
    const backupPath = path.join(__dirname, 'migration_backup.json');
    fs.writeFileSync(backupPath, JSON.stringify(updates, null, 2), 'utf8');
    console.log(`Backup saved to ${backupPath}`);
    
    console.log("Starting DB update migration in batches...");
    const batchSize = 100;
    const total = updates.length;
    
    for (let i = 0; i < total; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      // Perform batch updates in parallel
      await Promise.all(batch.map(async (item) => {
        const { error } = await supabase
          .from('leads')
          .update({ lead_ref_id: item.new_ref_id })
          .eq('id', item.id);
          
        if (error) {
          console.error(`Error updating lead ${item.id}:`, error.message);
        }
      }));
      
      console.log(`Progress: ${Math.min(i + batchSize, total)} / ${total} leads updated...`);
    }
    
    console.log("\nMigration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

run();
