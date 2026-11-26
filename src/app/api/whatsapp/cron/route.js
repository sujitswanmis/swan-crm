import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/supabase/adminClient';
import { processScheduledWhatsappQueue } from '@/app/actions/whatsappCampaigns';

async function isAuthorizedRequest(request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Allow manual execution by authenticated Admin / MasterAdmin session
  try {
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return false;
    const db = getAdminClient();
    const { data: role } = await db.from('user_roles').select('role,is_approved,module_access').eq('user_id', user.id).maybeSingle();
    if (!role || role.is_approved === false) return false;
    const r = String(role.role || '').trim().toLowerCase();
    return (
      String(user.email || '').toLowerCase() === 'supujacreations@gmail.com' ||
      role.module_access?.is_master_admin === true ||
      r.includes('admin') ||
      r === 'owner'
    );
  } catch {
    return false;
  }
}

export async function GET(request) {
  if (!(await isAuthorizedRequest(request))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const result = await processScheduledWhatsappQueue({ maxPerRun: 40 });
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function POST(request) {
  if (!(await isAuthorizedRequest(request))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const result = await processScheduledWhatsappQueue({ maxPerRun: 50 });
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
