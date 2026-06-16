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
    console.log("Fetching all leads...");
    let allLeads = [];
    let page = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from('leads')
        .select('id, created_at, company, name, lead_ref_id')
        .order('created_at', { ascending: true }) // fetch in order to make sorting easier
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
    
    // Find the target lead mentioned by the user: b5aa95ce-ea14-4373-95c9-8dc98dd83f51
    const targetLeadId = 'b5aa95ce-ea14-4373-95c9-8dc98dd83f51';
    let targetIndex = -1;
    let targetFormattedId = '';
    
    const formattedLeads = allLeads.map((lead, idx) => {
      const d = new Date(lead.created_at || new Date());
      const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
      const seq = String(idx + 1).padStart(7, '0');
      const lead_formatted_id = dateStr + seq;
      
      if (lead.id === targetLeadId) {
        targetIndex = idx;
        targetFormattedId = lead_formatted_id;
      }
      
      return {
        ...lead,
        calculated_id: lead_formatted_id
      };
    });
    
    console.log(`\nTarget Lead ID inspection:`);
    if (targetIndex !== -1) {
      const target = formattedLeads[targetIndex];
      console.log(`Target Lead: ${target.name} (${target.company})`);
      console.log(`Target Index (0-based): ${targetIndex}`);
      console.log(`Calculated 15-digit ID: ${target.calculated_id}`);
      console.log(`Current DB lead_ref_id: ${target.lead_ref_id}`);
      console.log(`Does it match user's expected 202606050006840? ${target.calculated_id === '202606050006840' ? 'YES!' : 'NO'}`);
    } else {
      console.log("Target lead not found in database.");
    }
    
    // Let's preview a few leads around the target
    if (targetIndex !== -1) {
      console.log("\nSurrounding Leads Preview:");
      const start = Math.max(0, targetIndex - 2);
      const end = Math.min(formattedLeads.length - 1, targetIndex + 2);
      for (let i = start; i <= end; i++) {
        const l = formattedLeads[i];
        console.log(`Index ${i + 1}: ID: ${l.id}, Created: ${l.created_at}, CalcID: ${l.calculated_id}, DBID: ${l.lead_ref_id}, Co: ${l.company}`);
      }
    }
    
  } catch (error) {
    console.error("Error previewing migration:", error);
  }
}
run();
