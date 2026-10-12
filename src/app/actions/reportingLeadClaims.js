'use server';

import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/supabase/adminClient';
import { logAuditAction } from './audit';
import { getPrimaryClaimAssignees, canClaimPrimaryTeamLead } from '@/utils/reportingHierarchy';

export async function claimPrimaryReportingLead(leadId, expectedAssignee) {
  try {
    if ((!leadId || !['string', 'number'].includes(typeof leadId)) || typeof expectedAssignee !== 'string') {
      return { success: false, error: 'Invalid lead claim.' };
    }
    const client = await createClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth?.user) return { success: false, error: 'Please sign in again.' };
    const admin = getAdminClient();
    const [usersResult, leadResult] = await Promise.all([
      admin.from('user_roles').select('*'),
      admin.from('leads').select('*').eq('id', leadId).maybeSingle()
    ]);
    if (usersResult.error || leadResult.error) return { success: false, error: 'Could not verify this lead. Please retry.' };
    const employees = usersResult.data || [];
    const employee = employees.find(row => row.user_id === auth.user.id);
    const lead = leadResult.data;
    if (!employee || !lead || employee.role === 'customer') return { success: false, error: 'Lead claim is not permitted.' };
    const status = String(employee.emp_status || employee.module_access?.emp_status || 'Active').trim().toLowerCase();
    if (['inactive', 'in_active', 'trash', 'terminated'].includes(status)) return { success: false, error: 'Lead claim is not permitted.' };
    if (lead.assigned_to !== expectedAssignee) return { success: false, conflict: true, error: 'This lead was reassigned. Refresh and try again.' };
    const primaryAssignees = getPrimaryClaimAssignees(employees, employee);
    if (!canClaimPrimaryTeamLead(lead, employee, primaryAssignees)) {
      return { success: false, error: 'You can claim only your primary reporting team leads in your permitted stages.' };
    }

    // Keep the original owner and stage as compare-and-set conditions.
    // A concurrent reassignment or stage move must never be overwritten.
    let update = admin.from('leads').update({ assigned_to: auth.user.id })
      .eq('id', leadId).eq('assigned_to', expectedAssignee);
    update = lead.status == null ? update.is('status', null) : update.eq('status', lead.status);
    const { data: updated, error: updateError } = await update.select('*').maybeSingle();
    if (updateError) return { success: false, error: 'Lead claim failed. Please retry.' };
    if (!updated) return { success: false, conflict: true, error: 'This lead changed while you were claiming it. Refresh and try again.' };

    let note = null;
    const actor = employee.emp_name || auth.user.email || 'Primary Reporting Person';
    try {
      const istTimestamp = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).format(new Date()).replace(' ', 'T') + '+05:30';
      const result = await admin.from('lead_notes').insert([{
        lead_id: leadId, note_text: `Lead claimed by Primary Reporting Person: ${actor}`,
        created_by: actor, created_at: istTimestamp
      }]).select('*').maybeSingle();
      if (!result.error) note = result.data;
    } catch (error) {
      console.warn('Primary lead claim note could not be saved:', error.message);
    }
    try {
      await logAuditAction('Claim Reporting Team Lead', `${actor} claimed lead ${updated.lead_ref_id || leadId}`);
    } catch (error) {
      console.warn('Primary lead claim audit could not be saved:', error.message);
    }
    return { success: true, lead: updated, note };
  } catch (error) {
    console.warn('Primary reporting lead claim failed:', error.message);
    return { success: false, error: 'Could not claim this lead. Check your connection and retry.' };
  }
}
