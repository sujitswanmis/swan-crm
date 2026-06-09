import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const { data, error } = await supabase
      .from('company_documents')
      .select('content')
      .eq('id', id)
      .single();

    if (error) throw error;
    
    return NextResponse.json({ content: data.content });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
