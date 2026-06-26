'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

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
  return data;
}

export async function updateUserRole(userId, newRole) {
  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from('user_roles')
    .update({ role: newRole })
    .eq('user_id', userId);
    
  if (error) throw new Error(error.message);
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
      emp_designation: details.emp_designation || (isCustomer ? 'Customer' : undefined),
      emp_mobile: details.emp_mobile,
      emp_official_mail_id: details.emp_official_mail_id || email
    };

    if (isCustomer) {
      updatePayload.role = 'customer';
      updatePayload.is_approved = true;
      updatePayload.can_read = false;
      updatePayload.can_write = false;
    }

    const { error } = await adminClient
      .from('user_roles')
      .update(updatePayload)
      .eq('user_id', userId);
      
    if (error) return { success: false, error: error.message };
  } else {
    // Insert new user
    const { error } = await adminClient
      .from('user_roles')
      .insert({
        user_id: userId,
        email: email,
        role: isCustomer ? 'customer' : 'agent',
        is_approved: isCustomer ? true : false, // Auto-approve customers
        emp_id: resolvedEmpId || (isCustomer ? 'CUSTOMER' : ''),
        emp_name: details.emp_name,
        emp_department: details.emp_department || (isCustomer ? 'Customer Support' : ''),
        emp_designation: details.emp_designation || (isCustomer ? 'Customer' : ''),
        emp_mobile: details.emp_mobile,
        company: details.company || (isCustomer ? 'Public' : ''),
        emp_official_mail_id: details.emp_official_mail_id || email,
        can_read: isCustomer ? false : true,
        can_write: isCustomer ? false : true,
        can_import_export: false,
        module_access: {}
      });
      
    if (error) return { success: false, error: error.message };
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
    emp_designation: details.emp_designation,
    emp_mobile: details.emp_mobile,
    company: details.company,
  };

  if (details.email) {
    updateData.email = details.email;
    updateData.emp_official_mail_id = details.email;
  }

  const { error } = await adminClient
    .from('user_roles')
    .update(updateData)
    .eq('user_id', userId);
    
  if (error) {
    console.error('Error updating employee details:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function updateModuleAccess(userId, accessData) {
  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from('user_roles')
    .update({ module_access: accessData })
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating module access:', error);
    return { success: false, error: error.message };
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
      // Search for the existing customer in user_roles
      const { data: existingUser, error: findError } = await adminClient
        .from('user_roles')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (!findError && existingUser) {
        // If the user currently has the customer role, promote them to agent
        if (existingUser.role === 'customer') {
          const { error: updateError } = await adminClient
            .from('user_roles')
            .update({
              role: 'agent',
              emp_id: details.emp_id,
              emp_name: details.emp_name,
              emp_department: details.emp_department || 'Sales',
              emp_designation: details.emp_designation || 'Agent',
              emp_mobile: details.emp_mobile,
              company: details.company,
              is_approved: true,
              can_read: true,
              can_write: true
            })
            .eq('user_id', existingUser.user_id);

          if (updateError) {
            return { success: false, error: 'Failed to update existing user role: ' + updateError.message };
          }

          // Update password if a new one is provided
          if (password) {
            await adminClient.auth.admin.updateUserById(existingUser.user_id, { password });
          }

          return { success: true };
        } else {
          return { success: false, error: 'A staff member with this email is already registered.' };
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

  return { success: true };
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
