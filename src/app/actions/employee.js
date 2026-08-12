'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const cleanUUID = (val) => (val && typeof val === 'string' && val.trim() !== '' ? val : null);

export async function getEmployeesMaster(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  
  try {
    // 1. Try relational join select
    const { data, error } = await adminClient
      .from('employees')
      .select('*, designation:designations(designation_name, designation_level, category)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data;
    }
  } catch (e) { console.warn('Relational join fetch fallback:', e.message); }

  // 2. Fallback to simple select
  try {
    const { data: simpleData } = await adminClient
      .from('employees')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (simpleData) return simpleData;
  } catch (e) { console.warn('Simple fetch fallback:', e.message); }

  return [];
}

export async function createEmployeeMaster(employeeData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const empCode = employeeData.emp_code || `EMP-${Date.now().toString(36).toUpperCase()}`;

  const payload = {
    ...employeeData,
    emp_code: empCode,
    tenant_id: tenantId,
    company_id: cleanUUID(employeeData.company_id),
    department_id: cleanUUID(employeeData.department_id),
    designation_id: cleanUUID(employeeData.designation_id),
    reporting_manager_id: cleanUUID(employeeData.reporting_manager_id)
  };

  const { data, error } = await adminClient
    .from('employees')
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Record history
  try {
    await adminClient.from('employee_designation_history').insert([{
      tenant_id: tenantId,
      employee_id: data.id,
      new_designation_id: cleanUUID(data.designation_id),
      new_department_id: cleanUUID(data.department_id),
      new_reporting_manager_id: cleanUUID(data.reporting_manager_id),
      change_type: 'New Joining',
      change_reason: 'Initial Employee Onboarding'
    }]);
  } catch (hErr) {
    console.warn('History insert warning:', hErr.message);
  }

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

  const newDesigId = cleanUUID(transferData.new_designation_id) || currentEmp.designation_id;
  const newDeptId = cleanUUID(transferData.new_department_id) || currentEmp.department_id;
  const newMgrId = cleanUUID(transferData.new_reporting_manager_id) || currentEmp.reporting_manager_id;

  // Insert history entry
  try {
    await adminClient.from('employee_designation_history').insert([{
      tenant_id: tenantId,
      employee_id: employeeId,
      old_designation_id: currentEmp.designation_id,
      new_designation_id: newDesigId,
      old_department_id: currentEmp.department_id,
      new_department_id: newDeptId,
      old_reporting_manager_id: currentEmp.reporting_manager_id,
      new_reporting_manager_id: newMgrId,
      change_type: transferData.change_type || 'Transfer',
      change_reason: transferData.change_reason || 'Department / Designation Transfer',
      effective_from: transferData.effective_from || new Date().toISOString().split('T')[0]
    }]);
  } catch (hErr) {
    console.warn('History record insert warning:', hErr.message);
  }

  // Update employee record
  const { data: updatedEmp, error: updateErr } = await adminClient
    .from('employees')
    .update({
      designation_id: newDesigId,
      designation_name: transferData.new_designation_name || currentEmp.designation_name,
      department_id: newDeptId,
      department_name: transferData.new_department_name || currentEmp.department_name,
      reporting_manager_id: newMgrId,
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
