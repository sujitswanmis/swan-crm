import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixStuckSessions() {
  const { data, error } = await supabase
    .from('call_sessions')
    .select('id, status, created_at')
    .in('status', ['initiated', 'ringing', 'agent_answered', 'connected']);

  if (error) {
    console.error('Error fetching sessions:', error);
    return;
  }

  console.log(`Found ${data.length} active sessions.`);
  let count = 0;
  const now = new Date();

  for (const session of data) {
    const createdAt = new Date(session.created_at);
    // If older than 1 hour, mark as ended
    if (now - createdAt > 1000 * 60 * 60) {
      await supabase.from('call_sessions').update({ status: 'ended', duration: 0 }).eq('id', session.id);
      count++;
    }
  }
  
  console.log(`Fixed ${count} stuck sessions.`);
}

fixStuckSessions();
