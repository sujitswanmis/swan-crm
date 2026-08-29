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
  const employeeMap = new Map();

  // 1. Fetch all team members & employees from user_roles (Primary CRM User Store)
  try {
    const { data: userRoles, error: rolesErr } = await adminClient
      .from('user_roles')
      .select('*')
      .order('emp_name', { ascending: true });

    if (!rolesErr && Array.isArray(userRoles)) {
      userRoles.forEach(u => {
        const email = (u.email || '').trim().toLowerCase();
        if (!email) return;

        const name = u.emp_name || u.name || u.email.split('@')[0];
        const status = u.emp_status || (u.module_access && u.module_access.emp_status) || 'Active';
        if (status === 'InActive' || status === 'Trash' || status === 'Terminated') return;

        employeeMap.set(email, {
          id: u.user_id || u.id || email,
          user_id: u.user_id || u.id,
          emp_code: u.emp_id || u.emp_code || '',
          emp_name: name,
          name: name,
          email: email,
          department: u.emp_department || u.department || 'General',
          emp_department: u.emp_department || u.department || 'General',
          designation: u.emp_designation || u.designation || u.role || 'Staff',
          emp_designation: u.emp_designation || u.designation || u.role || 'Staff',
          role: u.role || 'agent',
          status: status,
          primary_reporting_person: u.primary_reporting_person || '',
          secondary_reporting_person: u.secondary_reporting_person || '',
          hod_person: u.hod_person || ''
        });
      });
    }
  } catch (e) {
    console.warn('Error fetching from user_roles in getEmployeesMaster:', e.message);
  }

  // 2. Fetch from employees master table and merge
  try {
    const { data: empData, error: empErr } = await adminClient
      .from('employees')
      .select('*, designation:designations(designation_name, designation_level, category)')
      .eq('tenant_id', tenantId)
      .order('first_name', { ascending: true });

    if (!empErr && Array.isArray(empData)) {
      empData.forEach(e => {
        const email = (e.work_email || e.personal_email || e.email || '').trim().toLowerCase();
        const fullName = [e.first_name, e.last_name].filter(Boolean).join(' ') || e.name || e.emp_name || email;
        const desigName = e.designation?.designation_name || e.designation || 'Staff';

        if (email) {
          const existing = employeeMap.get(email) || {};
          employeeMap.set(email, {
            ...existing,
            id: e.id || existing.id || email,
            emp_code: e.emp_code || existing.emp_code || '',
            emp_name: existing.emp_name || fullName,
            name: existing.name || fullName,
            email: email,
            department: existing.department || e.department || 'General',
            emp_department: existing.emp_department || e.department || 'General',
            designation: existing.designation || desigName,
            emp_designation: existing.emp_designation || desigName,
            status: e.status || existing.status || 'Active'
          });
        }
      });
    }
  } catch (e) {
    console.warn('Error fetching from employees table in getEmployeesMaster:', e.message);
  }

  const list = Array.from(employeeMap.values());
  // Sort alphabetically by employee name
  list.sort((a, b) => (a.name || a.emp_name || '').localeCompare(b.name || b.emp_name || ''));
  return list;
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
