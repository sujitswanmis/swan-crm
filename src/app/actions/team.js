'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { sendAdminAccountEmailOtp } from './adminMessageConfig';
import { logAuditAction } from './audit';
import { saveImpersonateToken } from '@/lib/impersonateStore';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

export async function getTeamMembers() {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('user_roles')
    .select('*')
    .order('created_at', { ascending: true });
    
  if (error) {
    console.error('Error fetching team members:', error);
    return [];
  }

  return (data || []).map(u => ({
    ...u,
    emp_status: u.emp_status || (u.module_access && u.module_access.emp_status) || 'Active',
    emp_sub_department: u.emp_sub_department || (u.module_access && u.module_access.emp_sub_department) || '',
    emp_alt_mobile: u.emp_alt_mobile || (u.module_access && u.module_access.emp_alt_mobile) || '',
    work_location_type: u.work_location_type || (u.module_access && u.module_access.work_location_type) || '',
    work_location_name: u.work_location_name || (u.module_access && u.module_access.work_location_name) || '',
    primary_reporting_person: u.primary_reporting_person || (u.module_access && u.module_access.primary_reporting_person) || '',
    secondary_reporting_person: u.secondary_reporting_person || (u.module_access && u.module_access.secondary_reporting_person) || '',
    hod_person: u.hod_person || (u.module_access && u.module_access.hod_person) || '',
    can_self_reset_password: u.can_self_reset_password === true || (u.module_access && u.module_access.can_self_reset_password === true),
    can_import_export: u.can_import_export === true || (u.module_access && u.module_access.can_import_export === true)
  }));
}

export async function getRecruitersList() {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('user_roles')
    .select('emp_name, emp_designation, user_id, emp_id, emp_status, module_access')
    .ilike('emp_designation', '%recruiter%')
    .order('emp_name', { ascending: true });

  if (error) {
    console.error('Error fetching recruiters list:', error);
    return [];
  }
  return (data || []).filter(u => u.emp_name && (u.emp_status === 'Active' || (!u.emp_status && u.module_access?.emp_status !== 'InActive' && u.module_access?.emp_status !== 'Trash' && u.module_access?.emp_status !== 'Terminated')));
}

export async function updateUserRole(userId, newRole) {
  const adminClient = getAdminClient();
  const { data: userRole } = await adminClient.from('user_roles').select('emp_name, email').eq('user_id', userId).maybeSingle();
  const { error } = await adminClient
    .from('user_roles')
    .update({ role: newRole })
    .eq('user_id', userId);
    
  if (error) throw new Error(error.message);

  try {
    await logAuditAction('Update User Role', `Updated role for ${userRole?.emp_name || userRole?.email || userId} to "${newRole}"`);
  } catch (e) {
    console.error('Audit Log failed', e);
  }

  return true;
}

export async function toggleUserApproval(userId, isApproved) {
  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from('user_roles')
    .update({ is_approved: isApproved })
    .eq('user_id', userId);
    
  if (error) throw new Error(error.message);
  return true;
}

export async function toggleUserPermissions(userId, canImportExport) {
  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from('user_roles')
    .update({ can_import_export: canImportExport })
    .eq('user_id', userId);
    
  if (error) console.error('Error toggling permissions:', error);
  return { success: !error };
}

export async function toggleReadPermissions(userId, canRead) {
  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from('user_roles')
    .update({ can_read: canRead })
    .eq('user_id', userId);
  if (error) console.error('Error toggling read permissions:', error);
  return { success: !error };
}

export async function toggleWritePermissions(userId, canWrite) {
  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from('user_roles')
    .update({ can_write: canWrite })
    .eq('user_id', userId);
  if (error) console.error('Error toggling write permissions:', error);
  return { success: !error };
}

export async function registerEmployeeDetails(userId, email, details) {
  const adminClient = getAdminClient();
  const isCustomer = details.role === 'customer';
  
  if (isCustomer) {
    // Auto-confirm the user's email in Supabase Auth to allow instant login!
    try {
      await adminClient.auth.admin.updateUserById(userId, { email_confirm: true });
    } catch (err) {
      console.error("Failed to auto-confirm customer email:", err);
    }
  }

  // First check if the user already exists (e.g. created by auth trigger)
  const { data: existingUser } = await adminClient
    .from('user_roles')
    .select('role, is_approved, emp_id')
    .eq('user_id', userId)
    .single();

  let resolvedEmpId = details.emp_id;
  if (isCustomer) {
    if (existingUser && existingUser.emp_id && existingUser.emp_id.startsWith('CUST-') && existingUser.emp_id.length === 15) {
      resolvedEmpId = existingUser.emp_id;
    } else if (!resolvedEmpId || resolvedEmpId === 'CUSTOMER') {
      const { count } = await adminClient
        .from('user_roles')
        .select('user_id', { count: 'exact', head: true })
        .eq('role', 'customer');
      const nextNum = (count || 0) + 1;
      resolvedEmpId = `CUST-${String(nextNum).padStart(10, '0')}`;
    }
  }

  if (existingUser) {
    // Just update the details, do NOT overwrite role or is_approved UNLESS they are a customer
    const updatePayload = {
      emp_id: resolvedEmpId || (isCustomer ? 'CUSTOMER' : undefined),
      emp_name: details.emp_name,
      emp_department: details.emp_department || (isCustomer ? 'Customer Support' : undefined),
      emp_sub_department: details.emp_sub_department || '',
      emp_designation: details.emp_designation || (isCustomer ? 'Customer' : undefined),
      emp_mobile: details.emp_mobile,
      emp_alt_mobile: details.emp_alt_mobile || '',
      company: details.company || (isCustomer ? 'Public' : undefined),
      work_location_type: details.work_location_type || '',
      work_location_name: details.work_location_name || '',
      emp_official_mail_id: details.emp_official_mail_id || email,
      emp_status: details.emp_status || 'Active',
      primary_reporting_person: details.primary_reporting_person || '',
      secondary_reporting_person: details.secondary_reporting_person || '',
      hod_person: details.hod_person || ''
    };

    if (isCustomer) {
      updatePayload.role = 'customer';
      updatePayload.is_approved = true;
      updatePayload.can_read = false;
      updatePayload.can_write = false;
    }

    let { error } = await adminClient
      .from('user_roles')
      .update(updatePayload)
      .eq('user_id', userId);

    if (error) {
      // Fallback: save extra fields inside module_access JSON if columns are not present
      delete updatePayload.emp_status;
      delete updatePayload.emp_sub_department;
      delete updatePayload.emp_alt_mobile;
      delete updatePayload.work_location_type;
      delete updatePayload.work_location_name;
      delete updatePayload.primary_reporting_person;
      delete updatePayload.secondary_reporting_person;
      delete updatePayload.hod_person;

      const { data: userData } = await adminClient
        .from('user_roles')
        .select('module_access')
        .eq('user_id', userId)
        .single();
      updatePayload.module_access = { 
        ...(userData?.module_access || {}), 
        emp_status: details.emp_status || 'Active',
        emp_sub_department: details.emp_sub_department || '',
        emp_alt_mobile: details.emp_alt_mobile || '',
        work_location_type: details.work_location_type || '',
        work_location_name: details.work_location_name || '',
        primary_reporting_person: details.primary_reporting_person || '',
        secondary_reporting_person: details.secondary_reporting_person || '',
        hod_person: details.hod_person || ''
      };
      const { error: fallbackErr } = await adminClient
        .from('user_roles')
        .update(updatePayload)
        .eq('user_id', userId);
      if (fallbackErr) return { success: false, error: fallbackErr.message };
    }
  } else {
    // Insert new user
    const insertPayload = {
      user_id: userId,
      email: email,
      role: isCustomer ? 'customer' : 'agent',
      is_approved: isCustomer ? true : false, // Auto-approve customers
      emp_id: resolvedEmpId || (isCustomer ? 'CUSTOMER' : ''),
      emp_name: details.emp_name,
      emp_department: details.emp_department || (isCustomer ? 'Customer Support' : ''),
      emp_sub_department: details.emp_sub_department || '',
      emp_designation: details.emp_designation || (isCustomer ? 'Customer' : ''),
      emp_mobile: details.emp_mobile,
      emp_alt_mobile: details.emp_alt_mobile || '',
      company: details.company || (isCustomer ? 'Public' : ''),
      work_location_type: details.work_location_type || '',
      work_location_name: details.work_location_name || '',
      emp_official_mail_id: details.emp_official_mail_id || email,
      emp_status: details.emp_status || 'Active',
      primary_reporting_person: details.primary_reporting_person || '',
      secondary_reporting_person: details.secondary_reporting_person || '',
      hod_person: details.hod_person || '',
      can_read: isCustomer ? false : true,
      can_write: isCustomer ? false : true,
      can_import_export: false,
      module_access: {
        emp_status: details.emp_status || 'Active',
        emp_sub_department: details.emp_sub_department || '',
        emp_alt_mobile: details.emp_alt_mobile || '',
        work_location_type: details.work_location_type || '',
        work_location_name: details.work_location_name || '',
        primary_reporting_person: details.primary_reporting_person || '',
        secondary_reporting_person: details.secondary_reporting_person || '',
        hod_person: details.hod_person || ''
      }
    };

    let { error } = await adminClient.from('user_roles').insert(insertPayload);
    if (error) {
      delete insertPayload.emp_status;
      delete insertPayload.emp_sub_department;
      delete insertPayload.emp_alt_mobile;
      delete insertPayload.work_location_type;
      delete insertPayload.work_location_name;
      delete insertPayload.primary_reporting_person;
      delete insertPayload.secondary_reporting_person;
      delete insertPayload.hod_person;
      const { error: insertErr } = await adminClient.from('user_roles').insert(insertPayload);
      if (insertErr) return { success: false, error: insertErr.message };
    }
  }
  
  return { success: true };
}

export async function updateEmployeeDetailsAdmin(userId, details) {
  const adminClient = getAdminClient();

  // If email is provided and is different, update it in auth.users
  if (details.email) {
    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
      email: details.email,
      email_confirm: true // Auto confirm so they don't get stuck
    });
    if (authError) {
      console.error('Error updating auth email:', authError);
      return { success: false, error: 'Auth Error: ' + authError.message };
    }
  }

  const updateData = {
    emp_id: details.emp_id,
    emp_name: details.emp_name,
    emp_department: details.emp_department,
    emp_sub_department: details.emp_sub_department || '',
    emp_designation: details.emp_designation,
    emp_mobile: details.emp_mobile,
    emp_alt_mobile: details.emp_alt_mobile || '',
    company: details.company,
    work_location_type: details.work_location_type || '',
    work_location_name: details.work_location_name || '',
    primary_reporting_person: details.primary_reporting_person || '',
    secondary_reporting_person: details.secondary_reporting_person || '',
    hod_person: details.hod_person || ''
  };

  if (details.emp_status) {
    updateData.emp_status = details.emp_status;
  }

  if (details.email) {
    updateData.email = details.email;
    updateData.emp_official_mail_id = details.email;
  }

  let { error } = await adminClient
    .from('user_roles')
    .update(updateData)
    .eq('user_id', userId);

  if (error) {
    delete updateData.emp_status;
    delete updateData.emp_sub_department;
    delete updateData.emp_alt_mobile;
    delete updateData.work_location_type;
    delete updateData.work_location_name;
    delete updateData.primary_reporting_person;
    delete updateData.secondary_reporting_person;
    delete updateData.hod_person;

    const { data: userData } = await adminClient
      .from('user_roles')
      .select('module_access')
      .eq('user_id', userId)
      .single();

    const currentAccess = userData?.module_access || {};
    updateData.module_access = { 
      ...currentAccess, 
      emp_status: details.emp_status || 'Active',
      emp_sub_department: details.emp_sub_department || '',
      emp_alt_mobile: details.emp_alt_mobile || '',
      work_location_type: details.work_location_type || '',
      work_location_name: details.work_location_name || '',
      primary_reporting_person: details.primary_reporting_person || '',
      secondary_reporting_person: details.secondary_reporting_person || '',
      hod_person: details.hod_person || ''
    };

    const { error: fallbackErr } = await adminClient
      .from('user_roles')
      .update(updateData)
      .eq('user_id', userId);

    error = fallbackErr;
  }
    
  if (error) {
    console.error('Error updating employee details:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function updateEmpStatus(userId, empStatus) {
  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from('user_roles')
    .update({ emp_status: empStatus })
    .eq('user_id', userId);

  if (error && (error.message.includes('emp_status') || error.code === 'PGRST204')) {
    const { data: user } = await adminClient
      .from('user_roles')
      .select('module_access')
      .eq('user_id', userId)
      .single();
      
    const currentAccess = user?.module_access || {};
    const { error: fallbackErr } = await adminClient
      .from('user_roles')
      .update({ module_access: { ...currentAccess, emp_status: empStatus } })
      .eq('user_id', userId);

    if (fallbackErr) throw new Error(fallbackErr.message);
  } else if (error) {
    throw new Error(error.message);
  }

  try {
    const { data: userRole } = await adminClient.from('user_roles').select('emp_name, email').eq('user_id', userId).maybeSingle();
    await logAuditAction('Update User Status', `Changed status of user ${userRole?.emp_name || userRole?.email || userId} to "${empStatus}"`);
  } catch (e) {
    console.error('Audit Log failed', e);
  }

  return { success: true };
}

export async function updateModuleAccess(userId, accessData) {
  const adminClient = getAdminClient();
  
  const updatePayload = { 
    module_access: accessData,
    can_self_reset_password: accessData.can_self_reset_password === true,
    can_import_export: accessData.can_import_export === true
  };

  let { error } = await adminClient
    .from('user_roles')
    .update(updatePayload)
    .eq('user_id', userId);

  if (error) {
    // Fallback if specific columns don't exist
    const res = await adminClient
      .from('user_roles')
      .update({ module_access: accessData })
      .eq('user_id', userId);
    error = res.error;
  }

  if (error) {
    console.error('Error updating module access:', error);
    return { success: false, error: error.message };
  }

  try {
    const { data: userRole } = await adminClient.from('user_roles').select('emp_name, email').eq('user_id', userId).maybeSingle();
    await logAuditAction('Update User Permissions', `Updated module permissions and access control for ${userRole?.emp_name || userRole?.email || userId}`);
  } catch (e) {
    console.error('Audit Log failed', e);
  }

  return { success: true };
}

export async function createAccountAdmin(email, password, details) {
  const adminClient = getAdminClient();
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  
  if (authError) {
    // Check if user already exists
    const isAlreadyRegistered = authError.status === 422 || 
      authError.message.includes('already been registered') || 
      authError.message.includes('already exists');

    if (isAlreadyRegistered) {
      // Search for existing user in user_roles
      const { data: existingUser, error: findError } = await adminClient
        .from('user_roles')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (!findError && existingUser) {
        // Smart Upsert: Update existing employee details
        const updateRes = await updateEmployeeDetailsAdmin(existingUser.user_id, {
          ...details,
          email
        });

        if (!updateRes.success) {
          return { success: false, error: updateRes.error };
        }

        // If user was a customer, promote them to agent
        if (existingUser.role === 'customer') {
          await adminClient.from('user_roles').update({
            role: 'agent',
            is_approved: true,
            can_read: true,
            can_write: true
          }).eq('user_id', existingUser.user_id);
        }

        // Note: Existing user's password is preserved 100% untouched and safe so they never get locked out
        return { success: true, isNew: false, updated: true, userId: existingUser.user_id };
      } else {
        // User exists in auth.users but not yet in user_roles
        try {
          const { data: listData } = await adminClient.auth.admin.listUsers();
          const targetAuthUser = (listData?.users || []).find(u => u.email?.toLowerCase() === email?.toLowerCase());
          if (targetAuthUser) {
            const regResult = await registerEmployeeDetails(targetAuthUser.id, email, details);
            if (regResult.success) {
              await toggleUserApproval(targetAuthUser.id, true);
              return { success: true, isNew: false, updated: true, userId: targetAuthUser.id };
            }
          }
        } catch (lookupErr) {
          console.error('Auth lookup error:', lookupErr);
        }
      }
    }
    return { success: false, error: authError.message };
  }
  
  // Register employee details
  const regResult = await registerEmployeeDetails(authData.user.id, email, details);
  if (!regResult.success) return regResult;

  // Approve them automatically since admin created it
  await toggleUserApproval(authData.user.id, true);

  try {
    await logAuditAction('Create User', `Created new employee account for ${details?.emp_name || email} (${details?.role || 'agent'})`);
  } catch (e) {
    console.error('Audit Log failed', e);
  }

  return { success: true, isNew: true, created: true, userId: authData.user.id };
}

export async function bulkImportEmployeesFast(records = []) {
  if (!records || records.length === 0) {
    return { success: true, createdCount: 0, updatedCount: 0, failCount: 0, results: [] };
  }

  const adminClient = getAdminClient();

  // 1. Fetch all existing users from user_roles once in 1 lightning fast query
  const { data: existingRoles } = await adminClient
    .from('user_roles')
    .select('user_id, email, emp_id, role, is_approved, module_access');

  const byEmail = new Map();
  const byEmpId = new Map();

  (existingRoles || []).forEach(r => {
    if (r.email) byEmail.set(r.email.trim().toLowerCase(), r);
    if (r.emp_id) byEmpId.set(r.emp_id.trim().toLowerCase(), r);
  });

  let createdCount = 0;
  let updatedCount = 0;
  let failCount = 0;
  const results = [];

  const processOne = async (record) => {
    const {
      rowIndex = '',
      emp_id = '',
      emp_name = 'Team Member',
      emp_department = 'Sales',
      emp_sub_department = '',
      emp_designation = 'Executive',
      emp_mobile = '',
      emp_alt_mobile = '',
      company = 'NSMLR',
      work_location_type = '',
      work_location_name = '',
      emp_status = 'Active',
      primary_reporting_person = '',
      secondary_reporting_person = '',
      hod_person = '',
      password = 'Swan@12345'
    } = record;

    let email = (record.email || '').trim();
    if (!email || !email.includes('@')) {
      return {
        success: false,
        error: 'Missing/Invalid email in CSV',
        skippedNoEmail: true,
        emp_id,
        emp_name,
        email: '',
        rowIndex
      };
    }

    const emailKey = email.toLowerCase();
    const empIdKey = emp_id.trim().toLowerCase();

    // Check if user already exists
    const existing = byEmail.get(emailKey) || (empIdKey ? byEmpId.get(empIdKey) : null);

    if (existing) {
      // Existing User -> Directly update user_roles (1 fast DB update)
      const updateData = {
        emp_id: emp_id || existing.emp_id,
        emp_name,
        emp_department,
        emp_sub_department,
        emp_designation,
        emp_mobile,
        emp_alt_mobile,
        company,
        work_location_type,
        work_location_name,
        emp_status: emp_status || 'Active',
        primary_reporting_person,
        secondary_reporting_person,
        hod_person,
        emp_official_mail_id: email
      };

      if (existing.role === 'customer') {
        updateData.role = 'agent';
        updateData.is_approved = true;
        updateData.can_read = true;
        updateData.can_write = true;
      }

      const { error: updErr } = await adminClient
        .from('user_roles')
        .update(updateData)
        .eq('user_id', existing.user_id);

      if (updErr) {
        // fallback to module_access JSON
        delete updateData.emp_status;
        delete updateData.emp_sub_department;
        delete updateData.emp_alt_mobile;
        delete updateData.work_location_type;
        delete updateData.work_location_name;
        delete updateData.primary_reporting_person;
        delete updateData.secondary_reporting_person;
        delete updateData.hod_person;
        updateData.module_access = {
          ...(existing.module_access || {}),
          emp_status: emp_status || 'Active',
          emp_sub_department,
          emp_alt_mobile,
          work_location_type,
          work_location_name,
          primary_reporting_person,
          secondary_reporting_person,
          hod_person
        };
        await adminClient.from('user_roles').update(updateData).eq('user_id', existing.user_id);
      }

      return { success: true, updated: true, emp_id, emp_name, email, rowIndex };
    }

    // New User -> Create auth user + insert user_roles
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      if (authError.message.includes('already been registered') || authError.status === 422) {
        const { data: userRole } = await adminClient.from('user_roles').select('*').eq('email', email).maybeSingle();
        if (userRole) {
          await adminClient.from('user_roles').update({
            emp_id, emp_name, emp_department, emp_sub_department, emp_designation,
            emp_mobile, emp_alt_mobile, company, work_location_type, work_location_name,
            emp_status: emp_status || 'Active', primary_reporting_person, secondary_reporting_person, hod_person
          }).eq('user_id', userRole.user_id);
          return { success: true, updated: true, emp_id, emp_name, email, rowIndex };
        }
      }
      return { success: false, error: authError.message, emp_id, emp_name, email, rowIndex };
    }

    const regRes = await registerEmployeeDetails(authData.user.id, email, {
      emp_id, emp_name, emp_department, emp_sub_department, emp_designation,
      emp_mobile, emp_alt_mobile, company, work_location_type, work_location_name,
      emp_status: emp_status || 'Active', primary_reporting_person, secondary_reporting_person, hod_person
    });

    if (!regRes.success) {
      return { success: false, error: regRes.error, emp_id, emp_name, email, rowIndex };
    }

    await toggleUserApproval(authData.user.id, true);
    return { success: true, created: true, emp_id, emp_name, email, rowIndex };
  };

  const outcomes = await Promise.all(records.map(r => processOne(r)));

  outcomes.forEach(o => {
    if (o.success) {
      if (o.updated) updatedCount++;
      else createdCount++;
    } else {
      failCount++;
    }
    results.push(o);
  });

  return { success: true, createdCount, updatedCount, failCount, results };
}

// CALL CENTER ADMIN ACTIONS
export async function getCallAdminData() {
  const adminClient = getAdminClient();
  const { data: endpoints } = await adminClient.from('agent_endpoint_registry').select('*').order('alias');
  const { data: agents } = await adminClient.from('call_agents').select('*');
  return { endpoints: endpoints || [], agents: agents || [] };
}

export async function addCallAgentAdmin(userId, displayName) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient.from('call_agents').insert({
    user_id: userId,
    display_name: displayName,
    default_calling_mode: 'browser_webrtc',
    status: 'offline'
  }).select().single();
  
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

const plivoCredentialsMap = {
  'nsmlrtc3939694880445266':          'nsmlrtc0001@2026',
  'nsmlrtc2657389236553295188':       'nsmlrtc0002@2026',
  'nsmlrtc93506189021999878029640':   'nsmlrtc0003@2026',
  'nsmlrtcwfh7858930679233146509':    'nsmlrtcwfh0001@2026',
  'nsmlrtcwfh50549708164654573585':   'nsmlrtcwfh0002@2026',
  'nsmlrtcwfh44743598016079150111':   'nsmlrtcwfh0003@2026',
  'nsmlrsc6682352866161309':          'nsmlrsc0001@2026',
  'nsmlrsc138629850811621019308':     'nsmlrsc0002@2026',
  'nsmlrsc22284111935640519288335':   'nsmlrsc0003@2026',
  'nsmlrsc7239711313208619777947':    'nsmlrsc0004@2026',
  'admin434792858589734357666520':    'Admin@102023',
  'nsmlrpc60874839457118966':         'nsmlrpc0001@2026',
  'nsmlrpc179667757286621':           'nsmlrpc0002@2026',
};

export async function updateCallAgentAdmin(agentId, updates) {
  const adminClient = getAdminClient();

  if (updates.plivo_username !== undefined) {
    if (updates.plivo_username === null) {
      updates.plivo_password = null;
    } else if (updates.plivo_password === undefined) {
      // Only auto-populate from map if the frontend didn't explicitly send a plivo_password
      updates.plivo_password = plivoCredentialsMap[updates.plivo_username] || null;
    }
  }

  const { error } = await adminClient.from('call_agents').update(updates).eq('id', agentId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getAgentProfile(userId) {
  const adminClient = getAdminClient();
  const { data: agentData, error: agentError } = await adminClient
    .from('call_agents')
    .select('*')
    .eq('user_id', userId)
    .single();
    
  if (agentError) return { data: null, error: agentError.message };
  
  // Also fetch user role to get employee mobile number (emp_mobile)
  try {
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('emp_mobile')
      .eq('user_id', userId)
      .single();
      
    if (roleData && roleData.emp_mobile) {
      agentData.mobile_number = roleData.emp_mobile;
    }
  } catch (err) {
    console.error('Error fetching role details for mobile number:', err);
  }
  
  return { data: agentData, error: null };
}

export async function getRecentCalls(agentId) {
  const adminClient = getAdminClient();
  const { data } = await adminClient
    .from('call_sessions')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(10);
  return { data: data || [] };
}

export async function moveToTrashUser(userId) {
  return await updateEmpStatus(userId, 'Trash');
}

export async function restoreUserFromTrash(userId, targetStatus = 'Active') {
  return await updateEmpStatus(userId, targetStatus);
}

export async function deleteUserAdmin(userId) {
  const adminClient = getAdminClient();

  // 1. Delete from user_roles
  const { error: roleError } = await adminClient
    .from('user_roles')
    .delete()
    .eq('user_id', userId);

  if (roleError) {
    console.error('Error deleting from user_roles:', roleError);
    return { success: false, error: roleError.message };
  }

  // 2. Delete from auth.users via admin API
  try {
    const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
    if (authError) {
      console.warn('Warning: Could not delete from auth.users:', authError.message);
    }
  } catch (err) {
    console.warn('Auth user delete warning:', err);
  }

  try {
    await logAuditAction('Delete User', `Permanently deleted user account ID: ${userId}`);
  } catch (e) {
    console.error('Audit Log failed', e);
  }

  return { success: true };
}

export async function cleanupDummyImportAccounts() {
  const adminClient = getAdminClient();
  const { data: allUsers, error } = await adminClient
    .from('user_roles')
    .select('user_id, email, emp_id, emp_name, role');

  if (error || !allUsers) return { success: false, error: error?.message || 'Failed to fetch users' };

  // Find auto-generated dummy accounts (matching {digits}@swanagro.in or emp_{digits}@swanagro.in)
  const dummyAccounts = allUsers.filter(u => {
    if (u.role === 'admin' || u.role === 'Admin') return false;
    const email = (u.email || '').trim().toLowerCase();
    return /^[0-9]+@swanagro\.in$/.test(email) || /^emp_?[0-9]+@swanagro\.in$/.test(email);
  });

  if (dummyAccounts.length === 0) {
    return { success: true, count: 0, message: 'No dummy accounts found.' };
  }

  let deletedCount = 0;
  for (const account of dummyAccounts) {
    await deleteUserAdmin(account.user_id);
    deletedCount++;
  }

  return { success: true, count: deletedCount, message: `Successfully deleted ${deletedCount} dummy test accounts.` };
}

// =========================================================================
// PASSWORD RESET & EMAIL OTP AUTH ACTIONS
// =========================================================================

// In-memory OTP storage with 10-minute automatic TTL
const OTP_STORE = global.__SWAN_OTP_CACHE || new Map();
if (!global.__SWAN_OTP_CACHE) global.__SWAN_OTP_CACHE = OTP_STORE;

export async function toggleSelfPasswordReset(userId, currentStatus) {
  const adminClient = getAdminClient();
  const nextStatus = !currentStatus;

  const { error } = await adminClient
    .from('user_roles')
    .update({ can_self_reset_password: nextStatus })
    .eq('user_id', userId);

  if (error) {
    // Fallback inside module_access
    const { data: userRole } = await adminClient
      .from('user_roles')
      .select('module_access')
      .eq('user_id', userId)
      .single();

    const existingAccess = userRole?.module_access || {};
    const updatedAccess = { ...existingAccess, can_self_reset_password: nextStatus };
    await adminClient
      .from('user_roles')
      .update({ module_access: updatedAccess })
      .eq('user_id', userId);
  }

  return { success: true, can_self_reset_password: nextStatus };
}

export async function requestPasswordResetOtp(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) return { success: false, error: 'Please provide a valid email address.' };

  const adminClient = getAdminClient();

  // Find user by email
  const { data: user, error } = await adminClient
    .from('user_roles')
    .select('*')
    .or(`email.ilike.${cleanEmail},emp_official_mail_id.ilike.${cleanEmail}`)
    .maybeSingle();

  if (error || !user) {
    return { success: false, error: 'No employee account found with this email address.' };
  }

  // Check if self-reset is permitted - strictly opt-in (default false)
  const isAllowed = user.can_self_reset_password === true || user.module_access?.can_self_reset_password === true;
  const isAdmin = user.role === 'admin' || user.role === 'Admin';

  if (!isAllowed && !isAdmin) {
    return {
      success: false,
      error: 'Self password reset is disabled for your account. Please contact your CRM Administrator.'
    };
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  OTP_STORE.set(cleanEmail, {
    otp,
    userId: user.user_id,
    expiresAt,
    attempts: 0
  });

  // Send email via SuPuja Creations Admin SMTP
  const sendRes = await sendAdminAccountEmailOtp(
    cleanEmail,
    otp,
    'password_reset_otp',
    {
      name: user.emp_name || 'User',
      email: cleanEmail,
      company: 'Swan CRM'
    }
  );

  if (!sendRes.success) {
    return { success: false, error: 'Failed to send OTP email: ' + sendRes.error };
  }

  return { success: true, message: 'A 6-digit security OTP has been sent to your email.' };
}

export async function verifyPasswordResetOtpAndSetPassword(email, otp, newPassword) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanOtp = (otp || '').trim();

  if (!cleanEmail || !cleanOtp || !newPassword) {
    return { success: false, error: 'All fields are required.' };
  }

  if (newPassword.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' };
  }

  const record = OTP_STORE.get(cleanEmail);
  if (!record) {
    return { success: false, error: 'No active OTP request found. Please request a new OTP.' };
  }

  if (Date.now() > record.expiresAt) {
    OTP_STORE.delete(cleanEmail);
    return { success: false, error: 'OTP has expired. Please request a new one.' };
  }

  if (record.otp !== cleanOtp) {
    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts >= 5) {
      OTP_STORE.delete(cleanEmail);
      return { success: false, error: 'Too many incorrect attempts. Please request a new OTP.' };
    }
    return { success: false, error: 'Invalid verification code. Please check and try again.' };
  }

  // Update password in Supabase Auth
  const adminClient = getAdminClient();
  try {
    const { error: authError } = await adminClient.auth.admin.updateUserById(
      record.userId,
      { password: newPassword }
    );

    if (authError) {
      return { success: false, error: 'Error updating password: ' + authError.message };
    }

    // Clear OTP from store
    OTP_STORE.delete(cleanEmail);

    return { success: true, message: 'Password updated successfully! You can now sign in.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function sendAdminPasswordResetLink(userId) {
  const adminClient = getAdminClient();
  const { data: user, error } = await adminClient
    .from('user_roles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !user) {
    return { success: false, error: 'User not found.' };
  }

  const email = user.email || user.emp_official_mail_id;
  if (!email) {
    return { success: false, error: 'User does not have an official email address.' };
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  OTP_STORE.set(email.toLowerCase(), {
    otp,
    userId: user.user_id,
    expiresAt,
    attempts: 0
  });

  const sendRes = await sendAdminAccountEmailOtp(
    email,
    otp,
    'welcome_employee',
    {
      name: user.emp_name || 'Employee',
      emp_id: user.emp_id || '',
      email: email,
      reset_link: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/login?mode=reset&email=${encodeURIComponent(email)}&code=${otp}`
    }
  );

  if (!sendRes.success) {
    return { success: false, error: sendRes.error };
  }

  return { success: true, message: `Password setup email sent to ${email}!` };
}

/**
 * Request OTP for passwordless email login
 */
export async function requestLoginOtp(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Please provide a valid official email address.' };
  }

  const adminClient = getAdminClient();

  // Find user by email in user_roles
  const { data: user, error } = await adminClient
    .from('user_roles')
    .select('*')
    .or(`email.ilike.${cleanEmail},emp_official_mail_id.ilike.${cleanEmail}`)
    .maybeSingle();

  if (error || !user) {
    return { success: false, error: 'No workplace account found with this email. Please register or contact administrator.' };
  }

  // Check approval
  if (user.is_approved === false && user.role !== 'admin' && user.role !== 'Admin') {
    return { success: false, error: 'Your account is pending administrator approval before you can sign in.' };
  }

  // Generate Supabase Auth magiclink token_hash
  const targetEmail = user.email || user.emp_official_mail_id || cleanEmail;
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('Failed to generate auth token link:', linkError);
    return { success: false, error: 'Authentication service temporarily unavailable. Please sign in with password.' };
  }

  // Generate 6-digit user-facing OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  OTP_STORE.set(`login_${cleanEmail}`, {
    otp,
    userId: user.user_id,
    tokenHash: linkData.properties.hashed_token,
    expiresAt,
    attempts: 0
  });

  // Send email via SuPuja Creations Admin SMTP
  const sendRes = await sendAdminAccountEmailOtp(
    cleanEmail,
    otp,
    'login_otp',
    {
      name: user.emp_name || 'User',
      email: cleanEmail,
      company: 'Swan CRM'
    }
  );

  if (!sendRes.success) {
    return { success: false, error: 'Failed to send OTP email: ' + sendRes.error };
  }

  return { 
    success: true, 
    message: `A 6-digit login code has been sent to ${cleanEmail}.` 
  };
}

/**
 * Verify OTP for passwordless email login
 */
export async function verifyLoginOtp(email, otp) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanOtp = (otp || '').trim();

  if (!cleanEmail || !cleanOtp) {
    return { success: false, error: 'Email and 6-digit OTP are required.' };
  }

  const key = `login_${cleanEmail}`;
  const record = OTP_STORE.get(key);

  if (!record) {
    return { success: false, error: 'No active login OTP found. Please request a new code.' };
  }

  if (Date.now() > record.expiresAt) {
    OTP_STORE.delete(key);
    return { success: false, error: 'Login OTP has expired. Please request a new code.' };
  }

  if (record.otp !== cleanOtp) {
    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts >= 5) {
      OTP_STORE.delete(key);
      return { success: false, error: 'Too many incorrect attempts. Please request a new OTP.' };
    }
    return { success: false, error: 'Invalid verification code. Please check and re-enter.' };
  }

  const tokenHash = record.tokenHash;
  OTP_STORE.delete(key);

  return {
    success: true,
    tokenHash,
    message: 'OTP verified successfully!'
  };
}

/**
 * Impersonate a user (Admin only)
 * Generates a secure session token to log in as the target user.
 */
export async function impersonateUserAdmin(targetUserId) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized. Please sign in.' };
    }

    const adminClient = getAdminClient();
    // Verify caller is admin
    const { data: callerRole } = await adminClient
      .from('user_roles')
      .select('role, emp_name, email')
      .eq('user_id', user.id)
      .maybeSingle();

    const isAdmin = callerRole?.role === 'admin' || callerRole?.role === 'Admin';
    if (!isAdmin) {
      return { success: false, error: 'Permission denied. Only administrators can log in as other users.' };
    }

    // Retrieve target user
    const { data: targetUser, error: targetError } = await adminClient
      .from('user_roles')
      .select('user_id, email, emp_official_mail_id, emp_name, role, emp_id, emp_department, emp_designation')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (targetError || !targetUser) {
      return { success: false, error: 'Target employee not found.' };
    }

    const targetEmail = targetUser.email || targetUser.emp_official_mail_id;
    if (!targetEmail) {
      return { success: false, error: 'Target employee does not have a registered email.' };
    }

    // Generate magic link / token hash
    const linkRes = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: targetEmail
    });

    // Generate admin restore token so admin can seamlessly switch back
    const adminEmail = callerRole?.email || user.email;
    let adminRestoreToken = null;
    if (adminEmail) {
      const adminLinkRes = await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email: adminEmail
      });
      adminRestoreToken = adminLinkRes.data?.properties?.hashed_token || null;
    }

    // Activate target user session in user_sessions to clear any stale termination
    try {
      await adminClient.from('user_sessions')
        .update({ is_active: true, last_active: new Date().toISOString() })
        .eq('user_id', targetUserId);
    } catch (sessionErr) {
      console.error('Failed to pre-activate user session:', sessionErr);
    }

    // Save temporary one-time impersonation key (expires in 5 min, single use)
    const oneTimeKey = saveImpersonateToken({
      tokenHash: linkRes.data.properties.hashed_token,
      adminRestoreToken,
      name: targetUser.emp_name || targetEmail,
      role: targetUser.role || 'agent'
    });

    // Log audit event
    await logAuditAction(
      'User Impersonation',
      `Admin (${callerRole?.emp_name || user.email}) logged in as user: ${targetUser.emp_name || targetEmail} (Role: ${targetUser.role}, ID: ${targetUser.emp_id || targetUserId})`
    );

    return {
      success: true,
      key: oneTimeKey,
      tokenHash: linkRes.data.properties.hashed_token,
      adminRestoreToken,
      email: targetEmail,
      empName: targetUser.emp_name || targetEmail,
      empId: targetUser.emp_id || '',
      empDesignation: targetUser.emp_designation || '',
      empDepartment: targetUser.emp_department || '',
      role: targetUser.role || 'agent',
      targetUserId: targetUser.user_id
    };
  } catch (err) {
    console.error('Error in impersonateUserAdmin:', err);
    return { success: false, error: err.message || 'An unexpected error occurred during user impersonation.' };
  }
}

/**
 * Restore Admin session using a valid restore token
 */
export async function restoreAdminSession(restoreToken) {
  try {
    if (!restoreToken) {
      return { success: false, error: 'No restore token provided.' };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: restoreToken,
      type: 'magiclink'
    });

    if (error || !data?.session) {
      return { success: false, error: error?.message || 'Failed to restore admin session.' };
    }

    await logAuditAction('Restore Admin Session', 'Admin session successfully restored after impersonation');

    return { success: true, message: 'Admin session restored successfully!' };
  } catch (err) {
    console.error('Error restoring admin session:', err);
    return { success: false, error: err.message || 'An unexpected error occurred.' };
  }
}

/**
 * Grant Smart Checklist (My Checklists) & Delegation Tasks (To Me, By Me) to all approved users
 */
export async function grantChecklistAndDelegationToAllApprovedUsers() {
  const adminClient = getAdminClient();
  try {
    const { data: users, error } = await adminClient
      .from('user_roles')
      .select('user_id, emp_name, email, role, module_access, is_approved, emp_status')
      .eq('is_approved', true);

    if (error) throw error;

    let updatedCount = 0;
    for (const u of (users || [])) {
      const currentAccess = u.module_access || {};
      const isRoleAdminOrMgr = ['admin', 'Admin', 'manager', 'hod'].includes(u.role);

      // Checklist module access
      const existingChecklist = currentAccess.checklist || {};
      const existingChecklistSubs = existingChecklist.sub_items || {};
      const checklistAccess = {
        view: true,
        add: true,
        edit: true,
        delete: existingChecklist.delete === true || isRoleAdminOrMgr,
        sub_items: {
          ...existingChecklistSubs,
          my_checklists: { view: true, add: true, edit: true, delete: false },
          templates: existingChecklistSubs.templates !== undefined ? existingChecklistSubs.templates : { view: isRoleAdminOrMgr, add: isRoleAdminOrMgr, edit: isRoleAdminOrMgr, delete: isRoleAdminOrMgr },
          compliance: existingChecklistSubs.compliance !== undefined ? existingChecklistSubs.compliance : { view: isRoleAdminOrMgr, add: isRoleAdminOrMgr, edit: isRoleAdminOrMgr, delete: false }
        }
      };

      // Delegation module access
      const existingDelegation = currentAccess.delegation || {};
      const existingDelegationSubs = existingDelegation.sub_items || {};
      const delegationAccess = {
        view: true,
        add: true,
        edit: true,
        delete: existingDelegation.delete === true || isRoleAdminOrMgr,
        sub_items: {
          ...existingDelegationSubs,
          to_me: { view: true, add: true, edit: true, delete: false },
          by_me: { view: true, add: true, edit: true, delete: false },
          all: existingDelegationSubs.all !== undefined ? existingDelegationSubs.all : { view: isRoleAdminOrMgr, add: isRoleAdminOrMgr, edit: isRoleAdminOrMgr, delete: false }
        }
      };

      const updatedModuleAccess = {
        ...currentAccess,
        checklist: checklistAccess,
        delegation: delegationAccess
      };

      const { error: updateErr } = await adminClient
        .from('user_roles')
        .update({ module_access: updatedModuleAccess })
        .eq('user_id', u.user_id);

      if (!updateErr) updatedCount++;
    }

    return { success: true, updatedCount, totalApprovedUsers: (users || []).length };
  } catch (err) {
    console.error('Error granting checklist and delegation access:', err);
    return { success: false, error: err.message };
  }
}



