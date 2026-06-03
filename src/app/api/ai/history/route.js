import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ai_sessions')
      .select('sessions')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found, which is fine for a new user
      throw error;
    }

    return NextResponse.json({ sessions: data ? data.sessions : [] });
  } catch (error) {
    console.error('Fetch History Error:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { userId, sessions } = await req.json();

    if (!userId || !sessions) {
      return NextResponse.json({ error: 'Missing userId or sessions data' }, { status: 400 });
    }

    const { error } = await supabase
      .from('ai_sessions')
      .upsert({ user_id: userId, sessions: sessions, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save History Error:', error);
    return NextResponse.json({ error: 'Failed to save history' }, { status: 500 });
  }
}
