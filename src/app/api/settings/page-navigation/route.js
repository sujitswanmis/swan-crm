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
      .select('permissions')
      .eq('id', 'crm_page_navigation_config')
      .maybeSingle();

    if (error) {
      console.error('Error reading page navigation settings:', error.message);
      return NextResponse.json({
        settings: {
          pageNumberingJump: 7,
          defaultPageSize: '15',
          availablePageSizes: '3, 5, 10, 15, 20, 50, 100'
        }
      });
    }

    const settings = data?.permissions || {
      pageNumberingJump: 7,
      defaultPageSize: '15',
      availablePageSizes: '3, 5, 10, 15, 20, 50, 100'
    };

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Error in GET /api/settings/page-navigation:', error);
    return NextResponse.json({
      settings: {
        pageNumberingJump: 7,
        defaultPageSize: '15',
        availablePageSizes: '3, 5, 10, 15, 20, 50, 100'
      }
    });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { pageNumberingJump, defaultPageSize, availablePageSizes } = body;

    const finalSettings = {
      pageNumberingJump: parseInt(pageNumberingJump, 10) || 7,
      defaultPageSize: defaultPageSize === 'All' ? 'All' : (parseInt(defaultPageSize, 10) || 15),
      availablePageSizes: availablePageSizes || '3, 5, 10, 15, 20, 50, 100'
    };

    const { error } = await supabase
      .from('global_role_permissions')
      .upsert({
        id: 'crm_page_navigation_config',
        permissions: finalSettings
      });

    if (error) {
      console.error('Error saving page navigation settings to database:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, settings: finalSettings });
  } catch (error) {
    console.error('Error in POST /api/settings/page-navigation:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
