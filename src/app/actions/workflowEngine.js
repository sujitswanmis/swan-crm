'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function getWorkflowDefinitions(tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('workflow_definitions')
    .select('*, workflow_versions(*, workflow_stages(*, stage_field_mappings(*)))')
    .eq('tenant_id', tenantId)
    .order('workflow_name', { ascending: true });

  if (error) {
    console.error('Error fetching workflows:', error);
    return [];
  }
  return data || [];
}

export async function createWorkflowDefinition(workflowData, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const workflowCode = workflowData.workflow_code || `WF-${Date.now().toString(36).toUpperCase()}`;

  // 1. Create definition
  const { data: wf, error: wfErr } = await adminClient
    .from('workflow_definitions')
    .insert([{
      ...workflowData,
      workflow_code: workflowCode,
      tenant_id: tenantId
    }])
    .select()
    .single();

  if (wfErr) throw new Error(wfErr.message);

  // 2. Create version 1
  const { data: ver } = await adminClient
    .from('workflow_versions')
    .insert([{
      workflow_id: wf.id,
      version_number: 1,
      is_published: true,
      published_at: new Date().toISOString()
    }])
    .select()
    .single();

  return { workflow: wf, version: ver };
}

export async function addWorkflowStage(versionId, stageData) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('workflow_stages')
    .insert([{
      ...stageData,
      workflow_version_id: versionId
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function mapStageField(stageId, mappingData) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('stage_field_mappings')
    .insert([{
      ...mappingData,
      stage_id: stageId
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function startWorkflowInstance(workflowVersionId, s00Context = {}, partyId = null, tenantId = DEFAULT_TENANT_ID) {
  const adminClient = getAdminClient();
  const instanceCode = `INST-${Date.now().toString(36).toUpperCase()}`;

  // Fetch initial stage
  const { data: stages } = await adminClient
    .from('workflow_stages')
    .select('id')
    .eq('workflow_version_id', workflowVersionId)
    .order('stage_order', { ascending: true })
    .limit(1);

  const initialStageId = stages && stages.length > 0 ? stages[0].id : null;

  const { data: instance, error } = await adminClient
    .from('workflow_instances')
    .insert([{
      tenant_id: tenantId,
      instance_code: instanceCode,
      workflow_version_id: workflowVersionId,
      s00_context_json: s00Context,
      party_id: partyId,
      current_stage_id: initialStageId,
      instance_status: 'RUNNING'
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (initialStageId) {
    await adminClient.from('stage_instances').insert([{
      workflow_instance_id: instance.id,
      stage_id: initialStageId,
      actual_start: new Date().toISOString(),
      status: 'IN_PROGRESS'
    }]);
  }

  return instance;
}
