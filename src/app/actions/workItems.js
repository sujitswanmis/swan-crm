'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

export async function createStageWorkItem(stageInstanceId, workItemData) {
  const adminClient = getAdminClient();
  const itemCode = workItemData.work_item_code || `WI-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await adminClient
    .from('stage_work_items')
    .insert([{
      ...workItemData,
      work_item_code: itemCode,
      stage_instance_id: stageInstanceId
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function assignEmployeeToWorkItem(workItemId, employeeId, roleInStage = 'OPERATOR') {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('work_item_assignments')
    .insert([{
      work_item_id: workItemId,
      employee_id: employeeId,
      role_in_stage: roleInStage
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
