import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    const { data: users, error: userError } = await supabase.from('user_roles').select('user_id, emp_name, email, role');
    if (userError) throw userError;

    const { data: usages, error: usageError } = await supabase.from('ai_token_usage').select('*');
    if (usageError) throw usageError;

    const usageMap = {};
    if (usages) {
      usages.forEach(u => usageMap[u.user_id] = u);
    }

    const merged = users.map(u => ({
      ...u,
      id: u.user_id,
      name: u.emp_name,
      total_tokens: usageMap[u.user_id]?.total_tokens || 0,
      token_limit: usageMap[u.user_id]?.token_limit || 100000,
    }));

    return NextResponse.json({ users: merged });
  } catch (error) {
    console.error('Error fetching AI admin stats:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { userId, tokenLimit } = await req.json();
    if (!userId || tokenLimit === undefined) throw new Error('Missing params');

    // First ensure the row exists so upsert updates only the limit or creates a new one
    // We can just use an upsert. Wait, upsert might overwrite total_tokens to default 0 if it's missing in payload.
    // Let's do a SELECT first.
    const { data: existing } = await supabase.from('ai_token_usage').select('total_tokens').eq('user_id', userId).single();
    
    const { error } = await supabase
      .from('ai_token_usage')
      .upsert({ 
        user_id: userId, 
        token_limit: parseInt(tokenLimit),
        total_tokens: existing?.total_tokens || 0
      });
    
    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating AI token limit:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
