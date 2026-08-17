'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { sendAdminAccountEmailOtp } from './adminMessageConfig';

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
    can_self_reset_password: u.can_self_reset_password === true || (u.module_access && u.module_access.can_self_reset_password === true),
    can_import_export: u.can_import_export === true || (u.module_access && u.module_access.can_import_export === true)
  }));
}

export async function getRecruitersList() {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('user_roles')
    .select('emp_name, emp_designation, user_id, emp_id')
    .ilike('emp_designation', '%recruiter%')
    .order('emp_name', { ascending: true });

  if (error) {
    console.error('Error fetching recruiters list:', error);
    return [];
  }
  return (data || []).filter(u => u.emp_name);
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
      emp_official_mail_id: details.emp_official_mail_id || email,
      emp_status: details.emp_status || 'Active'
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

    if (error && (error.message.includes('emp_status') || error.code === 'PGRST204')) {
      delete updatePayload.emp_status;
      const { data: userData } = await adminClient
        .from('user_roles')
        .select('module_access')
        .eq('user_id', userId)
        .single();
      updatePayload.module_access = { ...(userData?.module_access || {}), emp_status: details.emp_status || 'Active' };
      const { error: fallbackErr } = await adminClient
        .from('user_roles')
        .update(updatePayload)
        .eq('user_id', userId);
      if (fallbackErr) return { success: false, error: fallbackErr.message };
    } else if (error) {
      return { success: false, error: error.message };
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
      emp_designation: details.emp_designation || (isCustomer ? 'Customer' : ''),
      emp_mobile: details.emp_mobile,
      company: details.company || (isCustomer ? 'Public' : ''),
      emp_official_mail_id: details.emp_official_mail_id || email,
      emp_status: details.emp_status || 'Active',
      can_read: isCustomer ? false : true,
      can_write: isCustomer ? false : true,
      can_import_export: false,
      module_access: {}
    };

    let { error } = await adminClient.from('user_roles').insert(insertPayload);
    if (error && (error.message.includes('emp_status') || error.code === 'PGRST204')) {
      delete insertPayload.emp_status;
      insertPayload.module_access = { emp_status: details.emp_status || 'Active' };
      const { error: insertErr } = await adminClient.from('user_roles').insert(insertPayload);
      if (insertErr) return { success: false, error: insertErr.message };
    } else if (error) {
      return { success: false, error: error.message };
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
    emp_designation: details.emp_designation,
    emp_mobile: details.emp_mobile,
    company: details.company,
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

  if (error && (error.message.includes('emp_status') || error.code === 'PGRST204')) {
    delete updateData.emp_status;
    const { data: userData } = await adminClient
      .from('user_roles')
      .select('module_access')
      .eq('user_id', userId)
      .single();

    const currentAccess = userData?.module_access || {};
    updateData.module_access = { ...currentAccess, emp_status: details.emp_status || 'Active' };

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
    return { success: true };
  } else if (error) {
    throw new Error(error.message);
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

  return { success: true };
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


