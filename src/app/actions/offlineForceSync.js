'use server';

import { getAdminClient } from '@/utils/supabase/adminClient';

/**
 * Strips all non-database / virtual / computed fields before sending to Supabase
 */
function cleanLeadPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const clean = { ...payload };

  if (clean.next_follow_up_date && !clean.follow_up_date) {
    clean.follow_up_date = clean.next_follow_up_date;
  }

  const forbidden = [
    'id', 'is_offline_pending', 'queueId', 'lead_formatted_id', 'sr_no',
    'last_status', 'latest_remark', 'latest_emp_name', 'completion_count',
    'last_follow_up_duration', 'last_timestamp', 'next_follow_up_date',
    'lead_notes', 'noteText', 'business_contact_aio', 'business_email_aio',
    'cp_name_aio', 'cp_mobile_aio', 'cp_email_aio', 'actor', 'userName',
    'title', 'actionType', 'entityType', 'timestamp', 'retryCount',
    'updated_at', 'created_at', 'lastError'
  ];

  forbidden.forEach((f) => delete clean[f]);

  for (const k in clean) {
    if (clean[k] === '' && (k.endsWith('_date') || k.endsWith('_at') || k === 'assigned_to' || k.endsWith('_id'))) {
      clean[k] = null;
    }
  }

  return clean;
}

/**
 * Resilient Multi-Layer Server Action: Force Sync an offline item with dynamic column healing
 */
export async function forceSyncOfflineItem(item) {
  if (!item || !item.entityType) {
    return { success: false, error: 'Invalid sync item payload' };
  }

  try {
    const supabase = getAdminClient();

    if (item.entityType === 'lead') {
      const noteText = item.payload.noteText || item.payload.remarks;
      const actor = item.payload.created_by || item.payload.actor || 'System';

      if (item.actionType === 'create') {
        let payload = cleanLeadPayload(item.payload);
        let inserted = null;

        // Dynamic field healing loop: try up to 4 times stripping invalid columns if DB errors
        for (let attempt = 0; attempt < 4; attempt++) {
          const { data, error } = await supabase.from('leads').insert([payload]).select().single();
          if (!error) {
            inserted = data;
            break;
          }

          // Check if error mentions a missing column
          const match = error.message.match(/Could not find the '([^']+)' column/i);
          if (match && match[1] && payload[match[1]] !== undefined) {
            delete payload[match[1]];
          } else {
            throw error;
          }
        }

        if (inserted && noteText) {
          try {
            await supabase.from('lead_notes').insert([{
              lead_id: inserted.id,
              note_text: noteText,
              created_by: actor
            }]);
          } catch (e) {}
        }

        return { success: true, item: { ...item, title: payload.name || payload.company || 'New Lead' } };
      } else if (item.actionType === 'update') {
        const targetId = item.payload.id;
        if (!targetId || String(targetId).startsWith('queue_')) {
          return { success: true, discarded: true };
        }

        let payload = cleanLeadPayload(item.payload);

        // Dynamic field healing loop
        for (let attempt = 0; attempt < 4; attempt++) {
          if (Object.keys(payload).length === 0) break;

          const { error } = await supabase.from('leads').update(payload).eq('id', targetId);
          if (!error) break;

          const match = error.message.match(/Could not find the '([^']+)' column/i);
          if (match && match[1] && payload[match[1]] !== undefined) {
            delete payload[match[1]];
          } else {
            throw error;
          }
        }

        if (noteText) {
          try {
            await supabase.from('lead_notes').insert([{
              lead_id: targetId,
              note_text: noteText,
              created_by: actor
            }]);
          } catch (e) {}
        }

        return { success: true, item: { ...item, title: item.payload.name || item.payload.company || `Lead #${targetId}` } };
      } else if (item.actionType === 'delete') {
        if (item.payload.id && !String(item.payload.id).startsWith('queue_')) {
          await supabase.from('leads').delete().eq('id', item.payload.id);
        }
        return { success: true, item };
      }
    } else if (item.entityType === 'attendance') {
      const payload = item.payload;
      if (payload.out_time) {
        const { error } = await supabase
          .from('attendance_records')
          .update({
            out_time: payload.out_time,
            out_location: payload.out_location,
            out_method: payload.out_method,
            total_working_minutes: payload.total_working_minutes,
            status: payload.status,
            remarks: payload.remarks
          })
          .match({ email: payload.email, attendance_date: payload.attendance_date });

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('attendance_records')
          .upsert([payload], { onConflict: 'email,attendance_date' });

        if (error) throw error;
      }
      return { success: true, item };
    } else if (item.entityType === 'lead_note') {
      const payload = item.payload;
      if (payload.lead_id && !String(payload.lead_id).startsWith('queue_')) {
        const { error } = await supabase
          .from('lead_notes')
          .insert([{
            lead_id: payload.lead_id,
            note_text: payload.note_text,
            created_by: payload.created_by
          }]);
        if (error) throw error;
      }
      return { success: true, item };
    }

    return { success: true, item };
  } catch (err) {
    console.error('[FORCE SYNC ERROR]', item?.queueId, err);
    return { success: false, error: err.message || String(err) };
  }
}