import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { logAuditAction } from '@/app/actions/audit';

async function recordLogoutAudit(supabase, reason = '') {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await logAuditAction({
      action: 'User Logout',
      target: reason ? `User logged out (${reason})` : 'User logged out',
      userId: user.id,
      userEmail: user.email,
      userName: user.user_metadata?.full_name || user.user_metadata?.emp_name || (user.email ? user.email.split('@')[0] : 'User')
    });
  } catch (_) {}
}

export async function POST(request) {
  const supabase = await createClient();
  await recordLogoutAudit(supabase);
  await supabase.auth.signOut({ scope: 'local' });
  
  return NextResponse.redirect(new URL('/login', request.url));
}

export async function GET(request) {
  const supabase = await createClient();
  const searchParams = request.nextUrl.searchParams;
  const reason = searchParams.get('reason');
  await recordLogoutAudit(supabase, reason || '');
  await supabase.auth.signOut({ scope: 'local' });
  
  const redirectUrl = new URL('/login', request.url);
  if (reason) redirectUrl.searchParams.set('reason', reason);

  return NextResponse.redirect(redirectUrl);
}
