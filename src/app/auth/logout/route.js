import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  
  return NextResponse.redirect(new URL('/login', request.url));
}

export async function GET(request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  
  const searchParams = request.nextUrl.searchParams;
  const reason = searchParams.get('reason');
  const redirectUrl = new URL('/login', request.url);
  if (reason) redirectUrl.searchParams.set('reason', reason);

  return NextResponse.redirect(redirectUrl);
}
