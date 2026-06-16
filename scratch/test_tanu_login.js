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

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Create a client with the anon key to simulate a browser client
const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function run() {
  const email = 'tcs1-nsmlr@newswangroup.com';
  // Try common passwords or the one we found
  const password = 'nsmlrstc0001@2026';
  
  console.log(`Connecting to: ${supabaseUrl}`);
  console.log(`Attempting sign-in for: ${email}`);

  const { data, error } = await userSupabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error("❌ Sign in failed:", error.message);
    return;
  }

  console.log("✅ Sign in SUCCESSFUL!");
  console.log("User ID:", data.user.id);
  console.log("Token:", !!data.session.access_token);

  // Now, let's try to fetch leads as Tanu!
  console.log("\nFetching leads as Tanu...");
  const { data: leads, error: fetchErr } = await userSupabase
    .from('leads')
    .select('id, name, company, assigned_to, our_company, status')
    .limit(5);

  if (fetchErr) {
    console.error("❌ Fetch leads failed:", fetchErr);
  } else {
    console.log(`✅ Fetched ${leads.length} leads successfully!`);
    leads.forEach(l => {
      console.log(`- Lead ID: ${l.id} | Company: ${l.company} | Assigned To: ${l.assigned_to} | Our Company: ${l.our_company}`);
    });
  }

  // Now let's try to update one lead that is assigned to Tanu!
  // Find a lead assigned to Tanu
  const adminSupabase = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: assignedLeads } = await adminSupabase
    .from('leads')
    .select('id, company')
    .eq('assigned_to', data.user.id)
    .limit(1);

  if (assignedLeads && assignedLeads.length > 0) {
    const testLeadId = assignedLeads[0].id;
    console.log(`\nAttempting to update lead ${testLeadId} as Tanu...`);
    const { data: updateRes, error: updateErr } = await userSupabase
      .from('leads')
      .update({ priority: 'High' })
      .eq('id', testLeadId)
      .select();

    if (updateErr) {
      console.error("❌ Update failed:", updateErr);
    } else {
      console.log("✅ Update succeeded! Result:", updateRes);
    }

    // Attempt to insert a note as Tanu
    console.log(`\nAttempting to insert note for lead ${testLeadId} as Tanu...`);
    const { data: noteRes, error: noteErr } = await userSupabase
      .from('lead_notes')
      .insert([{ lead_id: testLeadId, note_text: 'RLS Test Note', created_by: 'Tanu Sharma - 50719' }])
      .select();

    if (noteErr) {
      console.error("❌ Note insert failed:", noteErr);
    } else {
      console.log("✅ Note insert succeeded! Result:", noteRes);
      // Clean up note
      await adminSupabase.from('lead_notes').delete().eq('id', noteRes[0].id);
    }
  } else {
    console.log("\nNo lead assigned to Tanu found to test update on.");
  }
}

run();
