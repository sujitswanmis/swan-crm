import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('global_role_permissions')
      .select('*');

    if (error) throw error;

    // Convert array of { id, permissions } to an object keyed by role id
    const permissionsMap = {};
    if (data) {
      data.forEach(role => {
        permissionsMap[role.id] = role.permissions;
      });
    }

    return NextResponse.json({ permissions: permissionsMap });
  } catch (error) {
    console.error('Error fetching global role permissions:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { roleId, permissions } = await request.json();

    if (!roleId || !permissions) {
      return NextResponse.json({ error: 'Missing roleId or permissions' }, { status: 400 });
    }

    const { error } = await supabase
      .from('global_role_permissions')
      .upsert({ id: roleId, permissions: permissions });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating role permissions:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
