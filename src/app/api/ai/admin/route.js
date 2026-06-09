import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    const { data: users, error: userError } = await supabase.from('user_roles').select('user_id, emp_name, email, role, module_access');
    if (userError) throw userError;

    const { data: usages, error: usageError } = await supabase.from('ai_token_usage').select('*');
    if (usageError) throw usageError;

    const usageMap = {};
    if (usages) {
      usages.forEach(u => usageMap[u.user_id] = u);
    }

    const merged = users.map(u => {
      const ma = u.module_access || {};
      return {
        ...u,
        id: u.user_id,
        name: u.emp_name,
        ai_models: ma.ai_models || ['gpt-4o-mini'],
        premium_limit: ma.premium_limit || 10000,
        total_tokens: usageMap[u.user_id]?.total_tokens || 0,
        token_limit: usageMap[u.user_id]?.token_limit || 100000,
      };
    });

    return NextResponse.json({ users: merged });
  } catch (error) {
    console.error('Error fetching AI admin stats:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { userId, tokenLimit, premiumLimit, aiModels } = await req.json();
    if (!userId) throw new Error('Missing userId');

    // Update Token Limit if provided
    if (tokenLimit !== undefined) {
      const { data: existing } = await supabase.from('ai_token_usage').select('total_tokens').eq('user_id', userId).single();
      
      const { error: usageError } = await supabase
        .from('ai_token_usage')
        .upsert({ 
          user_id: userId, 
          token_limit: parseInt(tokenLimit),
          total_tokens: existing?.total_tokens || 0
        });
      
      if (usageError) throw usageError;
    }

    // Update AI Models and Premium Limit in user_roles.module_access
    if (aiModels || premiumLimit !== undefined) {
      const { data: userData, error: fetchErr } = await supabase.from('user_roles').select('module_access').eq('user_id', userId).single();
      if (!fetchErr && userData) {
        const newModuleAccess = { ...(userData.module_access || {}) };
        if (aiModels) newModuleAccess.ai_models = aiModels;
        if (premiumLimit !== undefined) newModuleAccess.premium_limit = parseInt(premiumLimit);
        
        const { error: roleError } = await supabase.from('user_roles').update({ module_access: newModuleAccess }).eq('user_id', userId);
        if (roleError) throw roleError;
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating AI settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
