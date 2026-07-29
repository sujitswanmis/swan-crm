'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function getDirectReports(managerEmployeeId) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('employees')
    .select('*, designation:designations(designation_name, designation_level)')
    .eq('reporting_manager_id', managerEmployeeId)
    .eq('emp_status', 'Active');

  if (error) {
    console.error('Error fetching direct reports:', error);
    return [];
  }
  return data || [];
}

export async function getRecursiveSubordinatesTree(managerEmployeeId) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .rpc('get_recursive_subordinates', { mgr_emp_id: managerEmployeeId });

  if (error) {
    // Fallback recursive query in Javascript if RPC not executed yet
    return await fetchSubordinatesFallback(managerEmployeeId, adminClient);
  }
  return data || [];
}

async function fetchSubordinatesFallback(mgrId, adminClient, depth = 1, visited = new Set()) {
  if (visited.has(mgrId) || depth > 10) return [];
  visited.add(mgrId);

  const { data: directs } = await adminClient
    .from('employees')
    .select('id, emp_code, emp_name, designation_name')
    .eq('reporting_manager_id', mgrId)
    .eq('emp_status', 'Active');

  if (!directs || directs.length === 0) return [];

  let results = [];
  for (const emp of directs) {
    results.push({
      subordinate_id: emp.id,
      emp_code: emp.emp_code,
      emp_name: emp.emp_name,
      designation_name: emp.designation_name,
      depth
    });
    const subChildren = await fetchSubordinatesFallback(emp.id, adminClient, depth + 1, visited);
    results = results.concat(subChildren);
  }
  return results;
}
