import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const restoreToken = requestUrl.searchParams.get('token') || request.cookies.get('crm_admin_restore_token')?.value;
  const origin = requestUrl.origin;

  if (!restoreToken) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: restoreToken,
    type: 'magiclink',
  });

  const response = NextResponse.redirect(`${origin}/`);
  // Clear impersonation cookies
  response.cookies.delete('crm_admin_restore_token');
  response.cookies.delete('crm_impersonator_info');

  if (error || !data?.session) {
    console.error('Failed to restore admin session:', error);
    return NextResponse.redirect(`${origin}/login?error=admin_restore_failed`);
  }

  return response;
}
