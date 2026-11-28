import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/supabase/adminClient';
import { NextResponse } from 'next/server';
import { logAuditAction } from '@/app/actions/audit';

async function markMatchingSessionLoggedOut(supabase, request, reason = '') {
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

    const admin = getAdminClient();
    if (!admin) return;
    const ua = request?.headers?.get('user-agent') || '';
    const isMobileReq = /Android|iPhone|iPad|iPod|Mobile|; wv\)/i.test(ua);
    const { data: activeRows } = await admin
      .from('user_sessions')
      .select('id, device')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (Array.isArray(activeRows) && activeRows.length > 0) {
      const matchingIds = activeRows
        .filter((r) => {
          const rowIsMobile = /Android|iPhone|iPad|iPod|Mobile|SPC Workspace APK|; wv\)/i.test(String(r?.device || ''));
          return rowIsMobile === isMobileReq;
        })
        .map((r) => r.id);

      const idsToClose = matchingIds.length > 0 ? matchingIds : activeRows.map((r) => r.id);
      await admin
        .from('user_sessions')
        .update({ is_active: false, last_active: new Date().toISOString() })
        .in('id', idsToClose);
    }
  } catch (_) {}
}

export async function POST(request) {
  const supabase = await createClient();
  await markMatchingSessionLoggedOut(supabase, request);
  await supabase.auth.signOut({ scope: 'local' });
  
  return NextResponse.redirect(new URL('/login', request.url));
}

export async function GET(request) {
  const supabase = await createClient();
  const searchParams = request.nextUrl.searchParams;
  const reason = searchParams.get('reason');
  await markMatchingSessionLoggedOut(supabase, request, reason || '');
  await supabase.auth.signOut({ scope: 'local' });
  
  const redirectUrl = new URL('/login', request.url);
  if (reason) redirectUrl.searchParams.set('reason', reason);

  return NextResponse.redirect(redirectUrl);
}
