'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

export function normalizeMobile(phone) {
  if (!phone) return '';
  const digitsOnly = String(phone).replace(/\D/g, '');
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return digitsOnly.slice(2);
  }
  if (digitsOnly.length >= 10) {
    return digitsOnly.slice(-10);
  }
  return digitsOnly;
}

export async function getAtomicNextLeadId() {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient.rpc('generate_atomic_lead_id');
  if (error || !data) {
    // Safe fallback if RPC not installed yet
    const fallbackRef = `SWAN-LD-${Date.now().toString().slice(-6)}`;
    return fallbackRef;
  }
  return data;
}

export async function checkDuplicateLead({ phone, email, firmName, district }) {
  const adminClient = getAdminClient();
  const normalized = normalizeMobile(phone);

  let query = adminClient.from('leads').select('id, lead_ref_id, name, company, phone, status, assigned_to, created_at');

  if (normalized && normalized.length === 10) {
    query = query.or(`phone.ilike.%${normalized}%,business_contact_1.ilike.%${normalized}%`);
  } else if (email) {
    query = query.ilike('email', email);
  } else {
    return { isDuplicate: false, matches: [] };
  }

  const { data, error } = await query.limit(5);

  if (error || !data || data.length === 0) {
    return { isDuplicate: false, matches: [] };
  }

  return {
    isDuplicate: true,
    matches: data
  };
}

export async function getLeadsPaginated({ page = 1, pageSize = 100, stageFilter, search, assignedTo, sortBy = 'created_at', sortOrder = 'desc' }) {
  const adminClient = getAdminClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = adminClient
    .from('leads')
    .select('*', { count: 'exact' });

  if (stageFilter) {
    query = query.ilike('status', `${stageFilter}%`);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%,phone.ilike.%${search}%,lead_ref_id.ilike.%${search}%`);
  }

  if (assignedTo) {
    query = query.eq('assigned_to', assignedTo);
  }

  query = query.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error in getLeadsPaginated:', error);
    return { leads: [], totalCount: 0, page, pageSize };
  }

  return {
    leads: data || [],
    totalCount: count || 0,
    page,
    pageSize
  };
}

export async function executeBulkAssignment({ selectedLeadIds, source, sourceName, targetEmployeeId, targetEmployeeName, assignmentMode = 'REASSIGN_ALL', remarks = '' }) {
  const adminClient = getAdminClient();
  if (!selectedLeadIds || selectedLeadIds.length === 0 || !targetEmployeeName) {
    throw new Error('Invalid parameters for bulk assignment');
  }

  // 1. Create assignment batch record
  const batchRef = `BATCH-${Date.now().toString(36).toUpperCase()}`;
  const { data: batch } = await adminClient
    .from('lead_bulk_assignment_batches')
    .insert([{
      batch_ref_code: batchRef,
      source: source || 'ALL',
      source_name: sourceName || 'ALL',
      total_selected: selectedLeadIds.length,
      assigned_count: selectedLeadIds.length,
      target_employee_id: targetEmployeeId || null,
      target_employee_name: targetEmployeeName,
      assignment_mode: assignmentMode,
      remarks
    }])
    .select()
    .single();

  // 2. Perform bulk update on leads table
  const { error: updateErr } = await adminClient
    .from('leads')
    .update({ assigned_to: targetEmployeeName })
    .in('id', selectedLeadIds);

  if (updateErr) throw new Error(updateErr.message);

  return {
    success: true,
    batchRef,
    assignedCount: selectedLeadIds.length
  };
}
