import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const tables = ['location_subdistricts', 'location_blocks', 'location_districts', 'location_states'];
  const results = {};

  for (const table of tables) {
    const { data, error } = await adminClient
      .from(table)
      .select('*')
      .limit(1);

    if (error) {
      results[table] = { error: error.message };
    } else if (data && data.length > 0) {
      results[table] = { columns: Object.keys(data[0]) };
    } else {
      // Table empty — try inserting nothing to get schema error which reveals columns
      results[table] = { columns: 'empty table - no row to read columns from', data };
    }
  }

  return NextResponse.json(results);
}
