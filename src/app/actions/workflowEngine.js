'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { getSubItemPermissions } from '@/utils/permissionUtils';
import { tatHours, validatePlanningMode } from '@/utils/workflowTiming.mjs';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const isUUID = value => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(value || ''));

async function access(operation = 'view', tenantId) {
  const session = await createSessionClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) throw new Error('Sign in to access workflows');
  const client = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: actor, error: roleError } = await client.from('user_roles').select('*').eq('user_id', user.id).maybeSingle();
  if (roleError || !actor) throw new Error('Workflow permission denied');
  const role = String(actor.role || '').toLowerCase();
  const admin = ['admin', 'superadmin', 'masteradmin'].includes(role);
  if (!admin) {
    const hasWorkflowSub = getSubItemPermissions(actor.module_access, role, 'workplace', 'workflow')?.[operation];
    const hasWorkplacePerm = actor.module_access?.['workplace']?.[operation] !== false && (actor.module_access?.['workplace']?.view === true || actor.module_access?.['team']?.view === true);
    if (!hasWorkflowSub && !hasWorkplacePerm) {
      throw new Error('Workflow permission denied');
    }
  }
  const resolvedTenant = actor.tenant_id || DEFAULT_TENANT_ID;
  if (tenantId && tenantId !== resolvedTenant) throw new Error('Workflow tenant mismatch');
  return { client, tenantId: resolvedTenant, actor, user, admin };
}

function checked(result) {
  if (result.error) {
    const missingMigration = ['PGRST202', 'PGRST204', '42703'].includes(result.error.code);
    throw new Error(missingMigration
      ? 'Workflow database upgrade required: apply migrations/27_workflow_timing_persistence.sql in Supabase SQL Editor.'
      : result.error.message);
  }
  return result.data;
}

function normalizeWorkflow(row) {
  const versions = [...(row.workflow_versions || [])].sort((a, b) => b.version_number - a.version_number);
  const stages = (versions[0]?.workflow_stages || []).filter(s => !s.is_archived).sort((a, b) => a.stage_order - b.stage_order).map(s => {
    const config = s.configuration_json || {};
    return { ...config, ...s,
      planned_tat_hours: config.tat_value ? tatHours(config.tat_value, config.tat_unit || 'HOURS') : Number(s.planned_tat_hours),
      approver_designation_id: config.approver_designation_id || s.approver_designation_id,
      fields: (s.stage_field_mappings || []).filter(f => !f.is_archived).sort((a, b) => a.display_order - b.display_order)
        .map(f => ({ ...f, field_name: f.display_label, is_required: f.is_mandatory,
          data_type: f.data_type === 'STRING' ? 'TEXT' : f.data_type,
          snapshot_mode: f.snapshot_mode === 'SNAPSHOT_AT_STAGE_START' ? 'STAGE_SNAPSHOT' : f.snapshot_mode })) };
  });
  return { ...row, workflow_versions: versions, stages, persisted: true,
    planning_mode: row.planning_mode || 'ACTUAL_PLUS_TAT', status: row.is_deleted ? 'DELETED' : row.status };
}

async function definitions(ctx) {
  const rows = checked(await ctx.client.from('workflow_definitions')
    .select('*, workflow_versions(*, workflow_stages(*, stage_field_mappings(*)))')
    .eq('tenant_id', ctx.tenantId).order('workflow_name'));
  return (rows || []).filter(w => !w.is_purged).map(normalizeWorkflow);
}

async function workflowById(ctx, id) {
  if (!isUUID(id)) throw new Error('Save this local workflow to Supabase first');
  const row = checked(await ctx.client.from('workflow_definitions')
    .select('*, workflow_versions(*, workflow_stages(*, stage_field_mappings(*)))')
    .eq('tenant_id', ctx.tenantId).eq('id', id).single());
  if (row.is_purged) throw new Error('Workflow not found');
  return normalizeWorkflow(row);
}

async function versionWorkflow(ctx, versionId) {
  if (!isUUID(versionId)) throw new Error('Save this local workflow to Supabase first');
  const version = checked(await ctx.client.from('workflow_versions').select('workflow_id').eq('id', versionId).single());
  const wf = await workflowById(ctx, version.workflow_id);
  if (wf.workflow_versions[0]?.id !== versionId) throw new Error('Refresh to use the current workflow version');
  return wf;
}

function prepareWorkflow(wf) {
  validatePlanningMode(wf.planning_mode);
  if (wf.stages) {
    if (!Array.isArray(wf.stages) || wf.stages.length > 100) throw new Error('Maximum 100 workflow stages');
    const ids = wf.stages.filter(s => isUUID(s.id)).map(s => s.id);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate workflow stages');
    for (const stage of wf.stages) {
      if (!String(stage.stage_name || '').trim()) throw new Error('Stage name is required');
      if (stage.assignee_type === 'BY_DESIGNATION' && !stage.assigned_designation_id) throw new Error('Select a worker designation');
      if (['BY_EMPLOYEE','SPECIFIC_EMPLOYEE'].includes(stage.assignee_type) && !stage.assigned_employee_id) throw new Error('Select a worker');
      if (stage.approval_required && !stage.approver_designation_id) throw new Error('Select an approver designation');
      const keys = (stage.fields || []).map(f => f.field_key || String(f.field_name || '').trim().toLowerCase().replace(/\W+/g, '_'));
      if (keys.some(k => !k || k.startsWith('_')) || new Set(keys).size !== keys.length) throw new Error('Stage field keys must be nonempty and unique');
    }
  }
  const stages = wf.stages?.map((s, index) => ({
    id: s.id, stage_name: String(s.stage_name || '').trim(), stage_order: index + 1,
    stage_code: s.stage_code || `S${String(index).padStart(2, '0')}`,
    execution_type: s.execution_type || 'SEQUENTIAL',
    planned_tat_hours: s.tat_value ? tatHours(s.tat_value, s.tat_unit || 'HOURS') : tatHours(s.planned_tat_hours),
    ...(s.tat_value ? { tat_value: s.tat_value, tat_unit: s.tat_unit || 'HOURS' } : {}),
    tat_formatted_display: s.tat_formatted_display || '', assignee_type: s.assignee_type,
    assigned_designation_id: s.assigned_designation_id || null, assigned_designation_name: s.assigned_designation_name || '',
    assigned_employee_id: s.assigned_employee_id || null, assigned_employee_name: s.assigned_employee_name || '',
    approval_required: !!s.approval_required, approver_designation_id: s.approver_designation_id || null,
    approver_designation_name: s.approver_designation_name || '',
    fields: (s.fields || []).map(f => ({ id: f.id,
      field_key: f.field_key || String(f.field_name || '').trim().toLowerCase().replace(/\W+/g, '_'),
      field_name: String(f.field_name || f.display_label || '').trim(),
      data_type: f.data_type || 'TEXT', snapshot_mode: f.snapshot_mode || 'LIVE_REFERENCE',
      is_required: f.is_required ?? f.is_mandatory ?? false,
    })) }));
  return { id: wf.id, workflow_name: String(wf.workflow_name || '').trim(), workflow_code: String(wf.workflow_code || '').trim(),
    description: wf.description || '', category: wf.category === 'LOGISTICS' ? 'DISPATCH' : wf.category,
    planning_mode: validatePlanningMode(wf.planning_mode), expected_updated_at: wf.updated_at,
    ...(stages ? { stages } : {}) };
}

async function save(ctx, wf) {
  const id = checked(await ctx.client.rpc('crm_save_workflow', { p_tenant_id: ctx.tenantId, p_workflow: prepareWorkflow(wf) }));
  return workflowById(ctx, id);
}

export async function getWorkflowDefinitions(tenantId) {
  return definitions(await access('view', tenantId));
}

export async function createWorkflowDefinition(workflowData, tenantId) {
  const ctx = await access('add', tenantId);
  // Never accept client supplied database IDs on the creation endpoint.
  const workflow = await save(ctx, { workflow_name: workflowData.workflow_name,
    workflow_code: workflowData.workflow_code || `WF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    category: workflowData.category || 'PRODUCTION', description: workflowData.description || '',
    planning_mode: workflowData.planning_mode || 'ACTUAL_PLUS_TAT', stages: [] });
  return { workflow };
}

export async function importWorkflowDefinition(workflowData) {
  const ctx = await access('add');
  const existing = (await definitions(ctx)).find(w => w.workflow_code === workflowData.workflow_code);
  if (existing) throw new Error('This code already exists in Supabase. Local data has been preserved; review it before merging.');
  const workflow = await save(ctx, { ...workflowData, id: null, updated_at: null,
    stages: (workflowData.stages || []).map(s => ({ ...s, id: null,
      fields: (s.fields || []).map(f => ({ ...f, id: null })) })) });
  return { workflow };
}

export async function setWorkflowPlanningMode(id, mode) {
  const ctx = await access('edit');
  const wf = await workflowById(ctx, id);
  // Metadata only: existing stages and running snapshots remain untouched.
  return save(ctx, { id: wf.id, workflow_name: wf.workflow_name, workflow_code: wf.workflow_code,
    description: wf.description, updated_at: wf.updated_at, planning_mode: validatePlanningMode(mode) });
}

export async function addWorkflowStage(versionId, stageData) {
  const ctx = await access('edit');
  const wf = await versionWorkflow(ctx, versionId);
  const marker = `local-${crypto.randomUUID()}`;
  const saved = await save(ctx, { ...wf, stages: [...wf.stages, { ...stageData, id: marker }] });
  return saved.stages.at(-1);
}

export async function mapStageField(stageId, mappingData) {
  const ctx = await access('edit');
  const stage = checked(await ctx.client.from('workflow_stages').select('workflow_version_id').eq('id', stageId).single());
  const wf = await versionWorkflow(ctx, stage.workflow_version_id);
  const marker = `local-${crypto.randomUUID()}`;
  const saved = await save(ctx, { ...wf, stages: wf.stages.map(s => s.id === stageId
    ? { ...s, fields: [...s.fields, { ...mappingData, id: marker }] } : s) });
  return saved.stages.find(s => s.id === stageId).fields.at(-1);
}

export async function updateWorkflowStageField(stageId, fieldId, changes, archive = false) {
  const ctx = await access('edit');
  const stage = checked(await ctx.client.from('workflow_stages').select('workflow_version_id').eq('id', stageId).single());
  const wf = await versionWorkflow(ctx, stage.workflow_version_id);
  if (!wf.stages.find(s => s.id === stageId)?.fields.some(f => f.id === fieldId)) throw new Error('Field not found');
  return save(ctx, { ...wf, stages: wf.stages.map(s => s.id === stageId ? { ...s,
    fields: archive ? s.fields.filter(f => f.id !== fieldId) : s.fields.map(f => f.id === fieldId ? {
      ...f, field_name: changes.field_name, data_type: changes.data_type, is_required: !!changes.is_required } : f) } : s) });
}

export async function reorderWorkflowStages(versionId, orderedIds) {
  const ctx = await access('edit');
  const wf = await versionWorkflow(ctx, versionId);
  if (!Array.isArray(orderedIds) || orderedIds.length !== wf.stages.length || new Set(orderedIds).size !== orderedIds.length
    || orderedIds.some(id => !wf.stages.some(s => s.id === id))) throw new Error('Stage list changed. Refresh and retry.');
  return save(ctx, { ...wf, stages: orderedIds.map(id => wf.stages.find(s => s.id === id)) });
}

async function setVisibility(id, changes) {
  const ctx = await access('delete');
  await workflowById(ctx, id);
  checked(await ctx.client.from('workflow_definitions').update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id).eq('tenant_id', ctx.tenantId).select('id').single());
  return { success: true };
}
export async function deleteWorkflowDefinition(id) { return setVisibility(id, { is_deleted: true }); }
export async function restoreWorkflowDefinition(id) { return setVisibility(id, { is_deleted: false }); }
// Preserve historical references: purge hides the template rather than deleting rows.
export async function purgeWorkflowDefinition(id) { return setVisibility(id, { is_deleted: true, is_purged: true }); }

function normalizeInstance(row) {
  const context = row.s00_context_json || {};
  const stages = context.workflow_snapshot || [];
  const runs = row.stage_instances || [];
  const history = stages.map(s => {
    const run = runs.find(r => r.stage_id === s.id) || {};
    return { ...s, ...run, fields: (s.fields || []).map(f => ({ ...f, field_name: f.display_label || f.field_name,
      is_required: f.is_mandatory ?? f.is_required })), stage_id: s.id, stage_instance_id: run.id };
  });
  const currentIndex = Math.max(0, stages.findIndex(s => s.id === row.current_stage_id));
  return { ...row, workflow_name: context.workflow_name || row.workflow_versions?.workflow_definitions?.workflow_name,
    category: context.category, reference_no: context.reference_no || row.instance_code,
    customer_name: context.customer_name || 'Internal Order', notes: context.notes,
    planning_mode: context.planning_mode || 'ACTUAL_PLUS_TAT', current_stage_index: currentIndex,
    total_stages: stages.length, current_stage: history[currentIndex], history,
    status: row.instance_status === 'COMPLETED' ? 'COMPLETED' : row.instance_status === 'RUNNING' ? 'IN_PROGRESS' : row.instance_status };
}

async function instanceById(ctx, id) {
  const row = checked(await ctx.client.from('workflow_instances').select('*, stage_instances(*)')
    .eq('tenant_id', ctx.tenantId).eq('id', id).single());
  return normalizeInstance(row);
}

export async function getWorkflowInstances(tenantId) {
  const ctx = await access('view', tenantId);
  const rows = checked(await ctx.client.from('workflow_instances').select('*, stage_instances(*)')
    .eq('tenant_id', ctx.tenantId).order('started_at', { ascending: false }).limit(100));
  return (rows || []).map(normalizeInstance);
}

export async function startWorkflowInstance(workflowVersionId, s00Context = {}, partyId = null, tenantId) {
  const ctx = await access('add', tenantId);
  await versionWorkflow(ctx, workflowVersionId);
  const context = { reference_no: String(s00Context.reference_no || '').slice(0, 150),
    customer_name: String(s00Context.customer_name || '').slice(0, 200), notes: String(s00Context.notes || '').slice(0, 2000),
    request_key: isUUID(s00Context.request_key) ? s00Context.request_key : crypto.randomUUID(), started_by: ctx.user.id };
  const id = checked(await ctx.client.rpc('crm_start_workflow', { p_tenant_id: ctx.tenantId,
    p_version_id: workflowVersionId, p_context: context, p_party_id: partyId }));
  return instanceById(ctx, id);
}

export async function advanceWorkflowInstance(id, expectedStageInstanceId, values = {}, approvalConfirmed = false) {
  const ctx = await access('edit');
  const inst = await instanceById(ctx, id);
  const stage = inst.history.find(s => s.stage_instance_id === expectedStageInstanceId);
  if (!stage) throw new Error('Stage instance not found');
  if (stage.status === 'COMPLETED') return inst;
  let workerMatches = ['BY_EMPLOYEE', 'SPECIFIC_EMPLOYEE'].includes(stage.assignee_type)
    ? [ctx.user.id, ctx.actor.id].includes(stage.assigned_employee_id)
    : stage.assignee_type === 'BY_DESIGNATION' && stage.assigned_designation_name
      ? String(ctx.actor.emp_designation || ctx.actor.designation || '').toLowerCase() === stage.assigned_designation_name.toLowerCase()
      : false;
  if (!ctx.admin && !workerMatches && ['BY_EMPLOYEE', 'SPECIFIC_EMPLOYEE'].includes(stage.assignee_type) && isUUID(stage.assigned_employee_id)) {
    const employee = checked(await ctx.client.from('employees').select('*').eq('id', stage.assigned_employee_id).maybeSingle());
    workerMatches = !!employee && [employee.work_email, employee.personal_email, employee.email]
      .filter(Boolean).some(email => String(email).toLowerCase() === String(ctx.user.email).toLowerCase());
  }
  if (!ctx.admin && stage.assignee_type === 'REPORTING_MANAGER' && isUUID(inst.s00_context_json?.started_by)) {
    const owner = checked(await ctx.client.from('user_roles').select('*').eq('user_id', inst.s00_context_json.started_by).maybeSingle());
    workerMatches = !!owner && [owner.primary_reporting_person, owner.reporting_manager_id]
      .filter(Boolean).some(person => [ctx.user.id, ctx.actor.id, ctx.user.email]
        .filter(Boolean).some(identity => String(person).toLowerCase() === String(identity).toLowerCase()));
  }
  const approverMatches = stage.approval_required && stage.approver_designation_name
    && String(ctx.actor.emp_designation || ctx.actor.designation || '').toLowerCase() === stage.approver_designation_name.toLowerCase();
  if (!ctx.admin && !workerMatches && !approverMatches) throw new Error('Only the assigned worker/approver can complete this stage');
  if (stage.approval_required && (!approvalConfirmed || (!ctx.admin && !approverMatches))) {
    throw new Error('Approval must be confirmed by the configured approver or administrator');
  }
  const data = {};
  for (const field of stage.fields || []) {
    const value = values[field.field_key];
    if (field.is_required && (value === undefined || value === null || String(value).trim() === '')) {
      throw new Error(`Required: ${field.field_name}`);
    }
    if (value !== undefined && value !== '') {
      if (field.data_type === 'NUMBER' && !Number.isFinite(Number(value))) throw new Error(`Invalid number: ${field.field_name}`);
      if (field.data_type === 'DATE' && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error(`Invalid date: ${field.field_name}`);
      if (['JSON','FILE'].includes(field.data_type)) throw new Error('JSON/file stage inputs need a dedicated input form');
      data[field.field_key] = field.data_type === 'NUMBER' ? Number(value) : String(value).slice(0, 5000);
    }
  }
  data._completed_by = ctx.user.id;
  if (stage.approval_required) data._approved_by = ctx.user.id;
  const savedId = checked(await ctx.client.rpc('crm_advance_workflow', { p_tenant_id: ctx.tenantId,
    p_instance_id: id, p_expected_stage_instance_id: expectedStageInstanceId, p_values: data }));
  return instanceById(ctx, savedId);
}
