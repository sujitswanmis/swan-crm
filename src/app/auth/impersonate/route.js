import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get('token');
  const restoreToken = requestUrl.searchParams.get('restore');
  const targetName = requestUrl.searchParams.get('name') || 'Employee';
  const targetRole = requestUrl.searchParams.get('role') || 'agent';
  const origin = requestUrl.origin;

  if (!token) {
    return NextResponse.redirect(`${origin}/login?error=missing_token`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: token,
    type: 'magiclink',
  });

  if (error || !data?.session) {
    console.error('Failed to verify impersonation token:', error);
    return NextResponse.redirect(`${origin}/login?error=invalid_token`);
  }

  const destination = targetRole.toLowerCase() === 'customer' ? '/chat' : '/';
  const response = NextResponse.redirect(`${origin}${destination}`);

  // Set cookies for impersonation info and admin restore token
  if (restoreToken) {
    response.cookies.set('crm_admin_restore_token', restoreToken, {
      path: '/',
      httpOnly: false,
      maxAge: 60 * 60 * 24, // 24 hours
      sameSite: 'lax',
    });
  }

  response.cookies.set('crm_impersonator_info', JSON.stringify({
    impersonated: true,
    name: targetName,
    role: targetRole,
    loggedAt: new Date().toISOString()
  }), {
    path: '/',
    httpOnly: false,
    maxAge: 60 * 60 * 24,
    sameSite: 'lax',
  });

  return response;
}
