import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/supabase/adminClient';
import { sendFcmPushToUsers } from '@/utils/fcmPushSender';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const sessionClient = await createClient();
    const { data: { user }, error } = await sessionClient.auth.getUser();
    if (error || !user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const requestedIds = Array.isArray(body.userIds) && body.userIds.length > 0
      ? body.userIds
      : [user.id];

    // Non-admin users may only send a test push to their own user ID
    let targetIds = [user.id];
    const sendingToOthers = requestedIds.some((id) => String(id) !== String(user.id));
    if (sendingToOthers) {
      const admin = getAdminClient();
      const { data: actor } = admin
        ? await admin.from('user_roles').select('role, module_access').eq('user_id', user.id).maybeSingle()
        : { data: null };
      const role = String(actor?.role || '').toLowerCase();
      const isAdmin = role === 'admin' || role === 'masteradmin' || actor?.module_access?.is_master_admin === true;
      if (!isAdmin) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
      targetIds = requestedIds;
    }

    const result = await sendFcmPushToUsers(targetIds, {
      title: body.title || 'SPC Workspace',
      body: body.message || body.body || 'Test notification from SPC Workspace',
      data: body.data || {}
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ success: false, error: err?.message || 'Push send failed' }, { status: 500 });
  }
}
