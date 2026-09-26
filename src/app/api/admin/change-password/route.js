import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';

export async function POST(req) {
  try {
    const sessionClient = await createServerClient();
    const { data: { user }, error: sessionError } = await sessionClient.auth.getUser();
    if (sessionError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { userId, newPassword } = await req.json();

    if (!userId || !newPassword) {
      return NextResponse.json({ error: 'Missing userId or newPassword' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: actor, error: actorError } = await supabaseAdmin
      .from('user_roles')
      .select('role, module_access')
      .eq('user_id', user.id)
      .maybeSingle();
    if (actorError || !actor) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }
    const isAdmin = ['admin', 'superadmin', 'masteradmin'].includes((actor.role || '').toLowerCase());
    const canManageUsers = actor.module_access?.user_management_new?.write === true || actor.module_access?.team?.write === true;
    if (!isAdmin && !canManageUsers) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, message: 'Password updated successfully' }, { status: 200 });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update password' }, { status: 500 });
  }
}
