'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const SEED_TERRITORIES = [
  { territory_code: 'TERR-NORTH-ZONE', territory_name: 'North Zone', territory_type: 'ZONE', state_name: 'Punjab' },
  { territory_code: 'TERR-MALWA-SOUTH', territory_name: 'Malwa South Territory', territory_type: 'TERRITORY', state_name: 'Punjab' },
  { territory_code: 'TERR-MAJHA-REGION', territory_name: 'Majha Region', territory_type: 'REGION', state_name: 'Punjab' },
  { territory_code: 'TERR-NCR-REGION', territory_name: 'Delhi NCR Region', territory_type: 'REGION', state_name: 'Haryana' },
  { territory_code: 'TERR-WEST-UP', territory_name: 'West UP Territory', territory_type: 'TERRITORY', state_name: 'Uttar Pradesh' }
];

export async function getTerritories(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  let { data, error } = await adminClient
    .from('territories')
    .select('*, territory_location_mappings(*), territory_employee_assignments(*, employee:employees(emp_name, emp_code))')
    .eq('tenant_id', tenantId)
    .order('territory_name', { ascending: true });

  if (error || !data || data.length === 0) {
    const payload = SEED_TERRITORIES.map(t => ({ ...t, tenant_id: tenantId }));
    const { data: inserted } = await adminClient
      .from('territories')
      .insert(payload)
      .select();

    return inserted || payload.map((p, idx) => ({ id: `tr-${idx}`, ...p }));
  }

  return data || [];
}

export async function createTerritory(territoryData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const territoryCode = territoryData.territory_code || `TERR-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await adminClient
    .from('territories')
    .insert([{ ...territoryData, territory_code: territoryCode, tenant_id: tenantId }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function assignTerritoryEmployee(territoryId, employeeId, roleInTerritory = 'RSM', tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('territory_employee_assignments')
    .insert([{
      tenant_id: tenantId,
      territory_id: territoryId,
      employee_id: employeeId,
      role_in_territory: roleInTerritory
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
