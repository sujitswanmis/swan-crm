const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim();
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Fetching user roles...");
  const { data: users } = await supabase.from('user_roles').select('*');
  
  const prefixToName = {};
  users.forEach(u => {
    if (u.email && u.emp_name) {
      const prefix = u.email.split('@')[0];
      prefixToName[prefix] = u.emp_name;
    }
  });

  console.log("Fetching all lead notes with pagination...");
  let allNotes = [];
  let from = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data: notes, error } = await supabase
      .from('lead_notes')
      .select('*')
      .range(from, from + pageSize - 1);
      
    if (error) {
      console.error("Error fetching notes:", error);
      break;
    }
    
    if (notes.length === 0) {
      break;
    }
    
    allNotes = allNotes.concat(notes);
    from += pageSize;
  }
  
  console.log(`Fetched a total of ${allNotes.length} notes.`);

  const updates = [];

  for (const note of allNotes) {
    let newName = null;
    
    if (prefixToName[note.created_by]) {
      newName = prefixToName[note.created_by];
    }
    
    if (note.created_by === 'Agent' || note.created_by === 'System') {
      const { data: lead } = await supabase.from('leads').select('assigned_to').eq('id', note.lead_id).single();
      if (lead && lead.assigned_to) {
        const user = users.find(u => u.user_id === lead.assigned_to);
        if (user && user.emp_name) {
          newName = user.emp_name;
        }
      }
    }

    if (newName && newName !== note.created_by) {
      updates.push({ id: note.id, newName });
    }
  }

  console.log(`Found ${updates.length} notes to update.`);

  const chunk = 50;
  let processed = 0;
  for (let i = 0; i < updates.length; i += chunk) {
    const batch = updates.slice(i, i + chunk);
    await Promise.all(batch.map(u => 
      supabase.from('lead_notes').update({ created_by: u.newName }).eq('id', u.id)
    ));
    processed += batch.length;
    console.log(`Updated ${processed} / ${updates.length}`);
  }

  console.log(`Finished. Updated ${updates.length} notes.`);
}

run().catch(console.error);
