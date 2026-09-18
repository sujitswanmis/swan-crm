'use server';

import { getAdminClient } from '@/utils/supabase/adminClient';

const VALID_LEAD_DB_COLUMNS = new Set([
  'id', 'lead_ref_id', 'lead_date', 'name', 'company', 'our_company',
  'email', 'phone', 'status', 'priority', 'deal_value', 'source',
  'source_name', 'assigned_to', 'created_by', 'entry_by', 'created_at',
  'follow_up_date', 'business_type', 'business_gst', 'business_contact_1',
  'business_contact_2', 'business_alt_1', 'business_alt_2', 'business_email_1',
  'business_email_2', 'business_alt_email_1', 'business_alt_email_2',
  'cp1_name', 'cp1_mobile_2', 'cp1_alt_1', 'cp1_alt_2', 'cp1_email_2',
  'cp2_name', 'cp2_mobile_1', 'cp2_mobile_2', 'cp2_alt_1', 'cp2_alt_2',
  'cp2_email_1', 'cp2_email_2', 'cp3_name', 'cp3_mobile_1', 'cp3_mobile_2',
  'cp3_alt_1', 'cp3_alt_2', 'cp3_email_1', 'cp3_email_2', 'state_name',
  'district_name', 'city_name', 'tehsil_name', 'block_name', 'pin_code',
  'address', 'requirement', 'investment', 'buying_timeline', 'client_status'
]);

/**
 * Strips all non-database / virtual / computed fields before sending to Supabase
 * Strictly whitelists against real Postgres columns on the 'leads' table
 */
function cleanLeadPayload(payload, isUpdate = false) {
  if (!payload || typeof payload !== 'object') return {};
  const input = { ...payload };

  if (input.next_follow_up_date && !input.follow_up_date) {
    input.follow_up_date = input.next_follow_up_date;
  }

  const clean = {};
  for (const key of Object.keys(input)) {
    if (VALID_LEAD_DB_COLUMNS.has(key)) {
      clean[key] = input[key];
    }
  }

  if (isUpdate) {
    delete clean.id;
    delete clean.created_at;
  }

  for (const k in clean) {
    if (clean[k] === '' && (k.endsWith('_date') || k.endsWith('_at') || k.endsWith('timestamp') || k === 'assigned_to' || k.endsWith('_id'))) {
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
        let payload = cleanLeadPayload(item.payload, false);
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

        let payload = cleanLeadPayload(item.payload, true);

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