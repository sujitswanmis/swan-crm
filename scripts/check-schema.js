// Run: node scripts/check-schema.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const tables = ['location_subdistricts', 'location_blocks', 'location_districts', 'location_states'];

  for (const table of tables) {
    const { data, error } = await adminClient.rpc('exec_sql', {
      sql: `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${table}' ORDER BY ordinal_position`
    });

    if (error) {
      // fallback: just select one row
      const { data: row, error: e2 } = await adminClient.from(table).select('*').limit(1);
      if (e2) {
        console.log(`\n${table}: ERROR - ${e2.message}`);
      } else if (row && row.length > 0) {
        console.log(`\n${table} COLUMNS:`, Object.keys(row[0]).join(', '));
      } else {
        console.log(`\n${table}: empty table`);
      }
    } else {
      console.log(`\n${table} COLUMNS:`, data?.map(r => r.column_name).join(', '));
    }
  }
}

main().catch(console.error);
