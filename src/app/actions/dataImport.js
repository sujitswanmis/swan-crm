'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function createImportBatch(importModule, isDryRun = true, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const batchRef = `IMP-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await adminClient
    .from('data_import_batches')
    .insert([{
      tenant_id: tenantId,
      batch_ref_code: batchRef,
      import_module: importModule,
      is_dry_run: isDryRun,
      status: 'PENDING'
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function executeImportDryRun(batchId, records = []) {
  const adminClient = getAdminClient();
  let successCount = 0;
  let failCount = 0;
  const errors = [];

  records.forEach((rec, idx) => {
    if (!rec || Object.keys(rec).length === 0) {
      failCount++;
      errors.push({ line: idx + 1, error: 'Empty record row' });
    } else {
      successCount++;
    }
  });

  const status = failCount === 0 ? 'DRY_RUN_PASSED' : 'FAILED';

  const { data, error } = await adminClient
    .from('data_import_batches')
    .update({
      total_records: records.length,
      successful_records: successCount,
      failed_records: failCount,
      status,
      error_report_json: errors
    })
    .eq('id', batchId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
