import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = require('@supabase/supabase-js').createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: userRoleData } = await adminClient
      .from('user_roles')
      .select('module_access')
      .eq('user_id', user.id)
      .single();

    const ai_models = (userRoleData?.module_access || {}).ai_models || ['gpt-4o-mini'];

    return NextResponse.json({ ai_models }, { status: 200 });
  } catch (error) {
    console.error('Error fetching my AI models:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
