import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { saveUserPushToken } from '@/utils/fcmPushSender';

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
    const fcmToken = String(body?.fcmToken || '').trim();
    if (!fcmToken || fcmToken.length < 20) {
      return NextResponse.json({ success: false, error: 'Valid fcmToken is required' }, { status: 400 });
    }

    const res = await saveUserPushToken({
      userId: user.id,
      company: body?.company || 'TNT00001',
      platform: body?.platform || 'android',
      fcmToken,
      appVersionCode: body?.appVersionCode ?? null,
      deviceModel: body?.deviceModel ?? null
    });

    return NextResponse.json({ success: true, ...res });
  } catch (err) {
    return NextResponse.json({ success: false, error: err?.message || 'Registration failed' }, { status: 500 });
  }
}
