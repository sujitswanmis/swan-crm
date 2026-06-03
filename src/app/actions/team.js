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
  
  // First check if the user already exists
  const { data: existingUser } = await adminClient
    .from('user_roles')
    .select('role, is_approved')
    .eq('user_id', userId)
    .single();

  if (existingUser) {
    // Just update the employee details, do NOT overwrite role or is_approved
    const { error } = await adminClient
      .from('user_roles')
      .update({
        emp_id: details.emp_id,
        emp_name: details.emp_name,
        emp_department: details.emp_department,
        emp_designation: details.emp_designation,
        emp_official_mail_id: details.emp_official_mail_id
      })
      .eq('user_id', userId);
      
    if (error) return { success: false, error: error.message };
  } else {
    // Insert new user
    const { error } = await adminClient
      .from('user_roles')
      .insert({
        user_id: userId,
        email: email,
        role: 'agent',
        is_approved: false,
        emp_id: details.emp_id,
        emp_name: details.emp_name,
        emp_department: details.emp_department,
        emp_designation: details.emp_designation,
        company: details.company,
        emp_official_mail_id: details.emp_official_mail_id,
        can_read: true,
        can_write: true,
        can_import_export: false,
        module_access: {}
      });
      
    if (error) return { success: false, error: error.message };
  }
  
  return { success: true };
}

export async function updateEmployeeDetailsAdmin(userId, details) {
  const adminClient = getAdminClient();
  const { error } = await adminClient
    .from('user_roles')
    .update({
      emp_id: details.emp_id,
      emp_name: details.emp_name,
      emp_department: details.emp_department,
      emp_designation: details.emp_designation,
      company: details.company,
      // intentionally not updating email here since that's tied to Auth
    })
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

export async function updateCallAgentAdmin(agentId, updates) {
  const adminClient = getAdminClient();
  const { error } = await adminClient.from('call_agents').update(updates).eq('id', agentId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getAgentProfile(userId) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('call_agents')
    .select('*')
    .eq('user_id', userId)
    .single();
  return { data, error: error?.message };
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
