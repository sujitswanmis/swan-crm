'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { logAuditAction } from '@/app/actions/audit';

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Fetch all published or draft custom forms for a tenant company
 */
export async function getTenantCustomForms(company = 'TNT00001') {
  const supabase = getAdminClient();
  try {
    const { data, error } = await supabase
      .from('tenant_custom_forms')
      .select('*')
      .eq('company', company)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tenant custom forms:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Error in getTenantCustomForms:', err);
    return [];
  }
}

export async function getPublishedForms(company = 'TNT00001') {
  return getTenantCustomForms(company);
}

/**
 * Save / Update a dynamic custom form schema
 */
export async function saveCustomForm(formPayload) {
  const supabase = getAdminClient();
  try {
    const {
      id = null,
      company = 'TNT00001',
      branch_code = null,
      tenant_id = null,
      title,
      description = '',
      data_type = 'CUSTOMER',
      status = 'PUBLISHED',
      fields = [],
      stages_config = { start: true, complete: true },
      created_by = null
    } = formPayload;

    if (!title || !title.trim()) {
      return { success: false, error: 'Form Title is required.' };
    }

    const formCode = formPayload.form_code || ('FORM_' + title.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 40));
    const fieldCount = Array.isArray(fields) ? fields.length : 0;

    const payload = {
      company,
      branch_code,
      tenant_id,
      form_code: formCode,
      title: title.trim(),
      description,
      data_type,
      status,
      field_count: fieldCount,
      has_form_table: true,
      fields,
      stages_config,
      updated_at: new Date().toISOString()
    };

    let result;
    if (id) {
      result = await supabase
        .from('tenant_custom_forms')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
    } else {
      payload.created_by = created_by;
      result = await supabase
        .from('tenant_custom_forms')
        .insert(payload)
        .select()
        .single();
    }

    if (result.error) {
      console.error('Error saving custom form:', result.error);
      return { success: false, error: result.error.message };
    }

    await logAuditAction('Custom Form Saved', `Form "${title}" (${status}) saved with ${fieldCount} fields`);

    return { success: true, form: result.data };
  } catch (err) {
    console.error('Error in saveCustomForm:', err);
    return { success: false, error: err.message || 'Failed to save form' };
  }
}

/**
 * Fetch dynamic form submissions for a specific custom form
 */
export async function getFormSubmissions(formId, options = {}) {
  const supabase = getAdminClient();
  try {
    let query = supabase
      .from('field_form_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (formId) {
      // Find tasks that used this formId
      const { data: tasks } = await supabase
        .from('field_tasks')
        .select('id')
        .eq('form_id', formId);

      const taskIds = (tasks || []).map(t => t.id);
      if (taskIds.length > 0) {
        query = query.in('task_id', taskIds);
      }
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching form submissions:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Error in getFormSubmissions:', err);
    return [];
  }
}
