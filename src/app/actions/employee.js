'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function getEmployeesMaster(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('employees')
    .select('*, designation:designations(designation_name, designation_level, category), reporting_manager:employees!employees_reporting_manager_id_fkey(emp_name, emp_code)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching employee master:', error);
    return [];
  }
  return data || [];
}

export async function createEmployeeMaster(employeeData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const empCode = employeeData.emp_code || `EMP-${Date.now().toString(36).toUpperCase()}`;

  const payload = {
    ...employeeData,
    emp_code: empCode,
    tenant_id: tenantId
  };

  const { data, error } = await adminClient
    .from('employees')
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Record history
  await adminClient.from('employee_designation_history').insert([{
    tenant_id: tenantId,
    employee_id: data.id,
    new_designation_id: data.designation_id,
    new_department_id: data.department_id,
    new_reporting_manager_id: data.reporting_manager_id,
    change_type: 'New Joining',
    change_reason: 'Initial Employee Onboarding'
  }]);

  return data;
}

export async function transferEmployeeDesignation(employeeId, transferData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();

  // Fetch current details
  const { data: currentEmp, error: fetchErr } = await adminClient
    .from('employees')
    .select('*')
    .eq('id', employeeId)
    .single();

  if (fetchErr || !currentEmp) throw new Error('Employee record not found');

  // Insert history entry
  await adminClient.from('employee_designation_history').insert([{
    tenant_id: tenantId,
    employee_id: employeeId,
    old_designation_id: currentEmp.designation_id,
    new_designation_id: transferData.new_designation_id || currentEmp.designation_id,
    old_department_id: currentEmp.department_id,
    new_department_id: transferData.new_department_id || currentEmp.department_id,
    old_reporting_manager_id: currentEmp.reporting_manager_id,
    new_reporting_manager_id: transferData.new_reporting_manager_id || currentEmp.reporting_manager_id,
    change_type: transferData.change_type || 'Transfer',
    change_reason: transferData.change_reason || 'Department / Designation Transfer',
    effective_from: transferData.effective_from || new Date().toISOString().split('T')[0]
  }]);

  // Update employee record
  const { data: updatedEmp, error: updateErr } = await adminClient
    .from('employees')
    .update({
      designation_id: transferData.new_designation_id || currentEmp.designation_id,
      designation_name: transferData.new_designation_name || currentEmp.designation_name,
      department_id: transferData.new_department_id || currentEmp.department_id,
      department_name: transferData.new_department_name || currentEmp.department_name,
      reporting_manager_id: transferData.new_reporting_manager_id || currentEmp.reporting_manager_id,
      reporting_manager_name: transferData.new_reporting_manager_name || currentEmp.reporting_manager_name,
      updated_at: new Date().toISOString()
    })
    .eq('id', employeeId)
    .select()
    .single();

  if (updateErr) throw new Error(updateErr.message);
  return updatedEmp;
}

export async function getEmployeeHistory(employeeId) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('employee_designation_history')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return data || [];
}
