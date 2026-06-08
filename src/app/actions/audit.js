'use server';

import { createClient } from '@/utils/supabase/server';

// Function to fetch the current user's name/email and log the action
export async function logAuditAction(action, target) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: roleData } = await supabase.from('user_roles').select('emp_name').eq('user_id', user.id).single();
    
    // Attempt to get IP from headers if running in Next.js (hard without request object, but we'll try or just leave null)
    // For now we'll just log action, target, name, email
    const { error } = await supabase.from('audit_logs').insert([{
      user_id: user.id,
      emp_name: roleData?.emp_name || 'System User',
      email: user.email,
      action,
      target,
      ip_address: 'Logged via Web App'
    }]);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('Audit Log Error:', err);
    return { success: false, error: err.message };
  }
}

export async function logUserSession(deviceInfo) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: roleData } = await supabase.from('user_roles').select('emp_name').eq('user_id', user.id).single();

    // Check if a session already exists for this user/device, and update it, else insert
    const { data: existingRecords } = await supabase.from('user_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('device', deviceInfo)
      .order('last_active', { ascending: false })
      .limit(1);

    const existing = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;

    if (existing) {
      await supabase.from('user_sessions').update({
        last_active: new Date().toISOString(),
        is_active: true
      }).eq('id', existing.id);
    } else {
      await supabase.from('user_sessions').insert([{
        user_id: user.id,
        emp_name: roleData?.emp_name || 'System User',
        email: user.email,
        device: deviceInfo,
        ip_address: 'Logged via Web App',
        is_active: true
      }]);
    }

    return { success: true };
  } catch (err) {
    console.error('Session Log Error:', err);
    return { success: false, error: err.message };
  }
}

export async function forceLogoutSession(sessionId) {
  try {
    const supabase = await createClient();
    await supabase.from('user_sessions').update({ is_active: false }).eq('id', sessionId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function forceLogoutAllOtherSessions(currentDevice) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated' };
      
      // Deactivate all devices for this user EXCEPT the current one
      if (currentDevice) {
        await supabase.from('user_sessions')
          .update({ is_active: false })
          .eq('user_id', user.id)
          .neq('device', currentDevice);
      } else {
        await supabase.from('user_sessions')
          .update({ is_active: false })
          .eq('user_id', user.id);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
}
