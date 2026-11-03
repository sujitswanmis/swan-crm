import { LEAD_FIELDS, integrationTimestamp } from '../../config/integrationsConfig.js';
import { IntegrationError, hashSecret, istDateBound } from './security.js';
import { checked } from './store.js';
import { requireTenantFeature } from './tenantPolicy.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LEAD_SELECT = 'id,lead_ref_id,name,phone,email,company,city_name,district_name,state_name,address,pin_code,requirement,source,source_name,priority,status,assigned_to,created_at,updated_at';
export function publicLead(row, tenantCode, branchCode = null) {
  const result = { tenant_code: tenantCode, branch_code: branchCode };
  for (const field of [...LEAD_FIELDS, 'created_at', 'updated_at']) {
    if (row[field] !== undefined) result[field] = ['created_at','updated_at'].includes(field)?integrationTimestamp(row[field]):typeof row[field] === 'string' && UUID.test(row[field]) ? null : row[field];
  }
  result.lead_code = !UUID.test(String(row.lead_ref_id)) ? row.lead_ref_id : null;
  return result;
}
export function normalizeLead(input, { create = true } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new IntegrationError('Lead must be a JSON object.');
  const forbidden = Object.keys(input).filter(key => !LEAD_FIELDS.includes(key) && !['tenant_code','branch_code','external_id'].includes(key));
  if (forbidden.length) throw new IntegrationError('Payload contains unsupported or internal fields.');
  if (input.external_id !== undefined && (typeof input.external_id !== 'string' || input.external_id.length>250)) throw new IntegrationError('external_id must be text up to 250 characters.');
  const result = {};
  for (const field of LEAD_FIELDS) {
    if (input[field] === undefined) continue;
    if (input[field] !== null && typeof input[field] !== 'string') throw new IntegrationError(`${field} must be text.`);
    const text = String(input[field] ?? '').trim();
    if (text.length > (field === 'requirement' || field === 'address' ? 4000 : 250)) throw new IntegrationError(`${field} is too long.`);
    if (/\u0000/.test(text)) throw new IntegrationError('Null characters are not supported.');
    result[field] = text;
  }
  if (result.phone) {
    let digits = result.phone.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    if (digits.length < 7 || digits.length > 15) throw new IntegrationError('Enter a valid phone number.');
    result.phone = digits;
  }
  if (result.email) {
    result.email = result.email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new IntegrationError('Enter a valid email address.');
  }
  if (create && !result.name && !result.phone && !result.email) throw new IntegrationError('A name, phone or email is required.');
  if (create && !result.name) result.name = 'Integration enquiry';
  if (!create && !Object.keys(result).length) throw new IntegrationError('Provide at least one supported field to update.');
  return result;
}
export function validatePayloadScope(input, context) {
  if (input.tenant_code && input.tenant_code !== context.tenant.code) throw new IntegrationError('Tenant access denied.',403,'scope_denied');
  if (input.branch_code && input.branch_code !== context.branchCode) throw new IntegrationError('Use an authorized branch scope in the request URL.',403,'scope_denied');
}
export async function leadLookups(context) {
  const db = context.db;
  const slug = context.tenant.name.trim().toLowerCase().replace(/[^a-z0-9]/g,'_');
  const configResult = await db.from('global_role_permissions').select('permissions').eq('id', `crm_config_${slug}`).maybeSingle();
  if (configResult.error) checked(configResult);
  let config = configResult.data?.permissions;
  if(!config) {
    const defaults=await db.from('global_role_permissions').select('permissions').eq('id','crm_main_config').maybeSingle();
    if(defaults.error) checked(defaults);
    config=defaults.data?.permissions || {};
  }
  const stages = Array.isArray(config.stages) && config.stages.length ? config.stages : [{name:'01 - New Stage',substages:['New Lead'],enabled:true}];
  const statuses = stages.filter(stage => stage.enabled !== false).flatMap((stage) => {
    const match = String(stage.name).match(/^(\d+)\s*-\s*(.+)$/);
    const number = match ? String(Number(match[1])) : '1';
    const title = match ? match[2] : stage.name;
    return (stage.substages || []).map(sub => ({ code:`${number};${number.padStart(2,'0')}>${title}>${sub}`,label:`${stage.name} / ${sub}` }));
  });
  const rows = checked(await db.from('user_roles').select('emp_name,email,emp_code,emp_id,branch_name,work_location_name,is_approved,role').eq('tenant_id',context.tenant.id).limit(1000)) || [];
  const branch = context.tenant.branches.find(item => item.code === context.branchCode);
  const employeesByName = new Map();
  for (const row of rows) {
    if (row.is_approved === false || (branch && ![branch.code,branch.name].includes(row.branch_name || row.work_location_name))) continue;
    const name=row.emp_name || row.email,rawCode=row.emp_code || row.emp_id || name;
    const code=UUID.test(String(rawCode))?name:rawCode;
    if (!code || !name) continue;
    // Lead assignment stores the name. One option per assignable value avoids
    // duplicate accounts without conflating different names sharing a legacy code.
    const existing=employeesByName.get(name);
    if (!existing || existing.code===name) employeesByName.set(name,{code,name});
  }
  const employees = [...employeesByName.values()];
  return { stages:statuses, employees, priorities:Array.isArray(config.priorities)?config.priorities:[], sources:Array.isArray(config.sources)?config.sources:[] };
}
export async function validateLeadChoices(payload, context) {
  const lookups = await leadLookups(context);
  if (payload.status && !lookups.stages.some(stage => stage.code === payload.status)) throw new IntegrationError('Select a configured tenant lead stage.');
  if (payload.assigned_to && !lookups.employees.some(employee => employee.name === payload.assigned_to)) throw new IntegrationError('Assigned employee is outside the authorized scope.');
  if (payload.priority && lookups.priorities.length && !lookups.priorities.includes(payload.priority)) throw new IntegrationError('Select a configured lead priority.');
  return lookups;
}
export async function listLeads(context, params = new URLSearchParams(), code) {
  await requireTenantFeature(context,context.integrationFeature || 'api_read');
  const page = Math.max(1,Number.parseInt(params.get('page') || '1',10)), pageSize = Number.parseInt(params.get('page_size') || '25',10);
  if (!Number.isSafeInteger(page) || page>10000 || ![10,25,50,100].includes(pageSize)) throw new IntegrationError('Use page >= 1 and page_size 10, 25, 50 or 100.');
  let query = context.db.from('leads').select(LEAD_SELECT,{count:'exact'}).eq('tenant_id',context.tenant.id);
  const branchById = new Map();
  if (context.branchCode) {
    // Join inside PostgreSQL through a bounded RPC; no unbounded client-side ID list or global queries.
    const data = checked(await context.db.rpc('integration_list_branch_leads', {
      p_tenant_id:context.tenant.id,p_branch_code:context.branchCode,p_code:code || null,
      p_page:page,p_size:pageSize,p_search:params.get('search') || '',p_status:params.get('status') || null,
      p_from:params.get('from_date')?istDateBound(params.get('from_date')):null,p_until:params.get('to_date')?istDateBound(params.get('to_date'),true):null,
    }));
    if (code && !data.rows?.length) throw new IntegrationError('Lead not found.',404,'not_found');
    return { data:(data.rows || []).map(row=>publicLead(row,context.tenant.code,context.branchCode)),page,page_size:pageSize,total:data.total || 0 };
  }
  if (code) query=query.eq('lead_ref_id',code);
  if (params.get('status')) query=query.eq('status',params.get('status'));
  if (params.get('from_date')) query=query.gte('created_at',istDateBound(params.get('from_date')));
  if (params.get('to_date')) query=query.lt('created_at',istDateBound(params.get('to_date'),true));
  const search = (params.get('search') || '').trim();
  if (search) {
    if (search.length>100 || /[,()\\%_*]/.test(search)) throw new IntegrationError('Search contains unsupported characters.');
    query=query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,lead_ref_id.ilike.%${search}%`);
  }
  const result=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).range((page-1)*pageSize,page*pageSize-1);
  const rows=checked(result) || [];
  if (code && rows.length!==1) throw new IntegrationError('Lead not found.',404,'not_found');
  if (rows.length) {
    const scopes=checked(await context.db.from('integration_record_scopes').select('record_id,branch_code').eq('tenant_id',context.tenant.id).eq('resource_type','lead').in('record_id',rows.map(row=>row.id))) || [];
    scopes.forEach(scope=>branchById.set(scope.record_id,scope.branch_code));
  }
  return { data:rows.map(row=>publicLead(row,context.tenant.code,branchById.get(row.id)||null)),page,page_size:pageSize,total:result.count || 0 };
}
export async function writeLead(context, input, identity, code = null, metadata = {}) {
  await requireTenantFeature(context,context.integrationFeature || 'api_write');
  validatePayloadScope(input,context);
  const payload=normalizeLead(input,{create:!code});
  const lookups=await validateLeadChoices(payload,context);
  if (!code) {
    payload.source ||= 'Integration';
    payload.status ||= lookups.stages[0]?.code;
    if (!payload.status) throw new IntegrationError('Configure an active lead stage first.');
  }
  const branch=context.tenant.branches.find(item=>item.code===context.branchCode);
  const result=await context.db.rpc('integration_write_lead',{
    p_tenant_id:context.tenant.id,p_branch_code:context.branchCode,p_actor:context.actorCode,
    p_payload:payload,p_identity:identity,p_request_hash:hashSecret(JSON.stringify({code,branch:context.branchCode,payload:Object.fromEntries(Object.entries(payload).sort(([a],[b])=>a.localeCompare(b)))})),
    p_lead_code:code,p_operating_company:branch?.operatingCompany || context.tenant.name,p_metadata:metadata,
  });
  if (result.error?.message?.includes('idempotency_conflict')) throw new IntegrationError('Idempotency key was already used with different data.',409,'idempotency_conflict');
  if (result.error?.message?.includes('lead_not_found')) throw new IntegrationError('Lead not found.',404,'not_found');
  if (result.error?.message?.includes('tenant_integration_disabled')) throw new IntegrationError('Integration access was disabled by Master Admin.',403,'tenant_integration_disabled');
  const saved=checked(result);
  return { status:saved.status,data:publicLead(saved.data,context.tenant.code,context.branchCode) };
}
