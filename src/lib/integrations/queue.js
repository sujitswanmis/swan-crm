import { IntegrationError, assertEnabled, decryptSecret, hashSecret, safeRequest } from './security.js';
import { checked, consumeRateLimit, integrationDb } from './store.js';
import { tenantDirectory } from './access.js';
import { writeLead, listLeads } from './leadAdapter.js';
import { authHeaders, deliverOutgoing, mapRecord, pullExternal } from './connectors.js';
import { fetchMetaLead, syncMetaPage } from './meta.js';
import { integrationFeatureForConnection } from '../../config/integrationsConfig.js';
import { loadTenantPolicy, requireTenantFeature } from './tenantPolicy.js';

export function connectionContext(context,connection) {
  if(connection.tenant_id!==context.tenant.id || (context.branchCode && connection.branch_code && context.branchCode!==connection.branch_code)) throw new IntegrationError('Connection scope denied.',403,'scope_denied');
  return {...context,branchCode:connection.branch_code || context.branchCode || null,actorCode:connection.code,integrationFeature:integrationFeatureForConnection(connection)};
}
export async function enqueueJobs(context,connection,jobs) {
  if(!jobs.length) return 0;
  if(jobs.length>100) throw new IntegrationError('Too many jobs in a batch.',413);
  const scoped=connectionContext(context,connection);
  const rows=jobs.map(job=>({tenant_id:context.tenant.id,branch_code:scoped.branchCode,connection_code:connection.code,kind:job.kind,dedupe_key:job.dedupe,payload:job.payload}));
  checked(await context.db.from('integration_jobs').upsert(rows,{onConflict:'tenant_id,dedupe_key',ignoreDuplicates:true}));
  return rows.length;
}
export function retryableJobError(error) {
  return !(error instanceof IntegrationError) || error.status===429 || error.status>=500;
}
async function scheduleConnections(db) {
  const now=new Date().toISOString();
  const connections=checked(await db.from('integration_connections').select('*').eq('status','enabled').in('type',['external','meta']).or(`next_run_at.is.null,next_run_at.lte.${now}`).order('next_run_at',{nullsFirst:true}).limit(20)) || [];
  const directory=await tenantDirectory(db);
  for(const connection of connections) {
    if(connection.type==='external'&&connection.config.direction!=='pull') continue;
    const tenant=directory.find(item=>item.id===connection.tenant_id);
    if(!tenant || ['SUSPENDED','ARCHIVED','DRAFT'].includes(String(tenant.status).toUpperCase())) continue;
    const policy=await loadTenantPolicy(db,tenant.id,connection.branch_code);
    if(!policy.enabled || !policy.features[integrationFeatureForConnection(connection)]) continue;
    const context={db,tenant,branchCode:connection.branch_code,actorCode:connection.code};
    // Stable schedule identities make retries/crashes safe. Advance only after durable enqueue.
    const slot=connection.next_run_at || connection.created_at;
    const jobs=connection.type==='meta'
      ? (connection.config.form_ids || []).map(formId=>({kind:'meta_sync',dedupe:`scheduled:${connection.code}:${slot}:${formId}`,payload:{form_id:formId,since:Math.floor((Date.now()-2*86400000)/1000)}}))
      : [{kind:'pull',dedupe:`scheduled:${connection.code}:${slot}`,payload:{}}];
    await enqueueJobs(context,connection,jobs);
    let query=db.from('integration_connections').update({next_run_at:new Date(Date.now()+(connection.config.sync_interval_minutes || 15)*60000).toISOString()}).eq('code',connection.code).eq('tenant_id',tenant.id);
    query=connection.next_run_at?query.eq('next_run_at',connection.next_run_at):query.is('next_run_at',null);
    checked(await query);
  }
}
async function executeJob(db,directory,job) {
  const tenant=directory.find(item=>item.id===job.tenant_id);
  if(!tenant || ['SUSPENDED','ARCHIVED','DRAFT'].includes(String(tenant.status).toUpperCase())) throw new IntegrationError('Tenant is inactive.',403,'tenant_inactive');
  const connection=checked(await db.from('integration_connections').select('*').eq('tenant_id',job.tenant_id).eq('code',job.connection_code).maybeSingle());
  if(!connection || connection.status!=='enabled') throw new IntegrationError('Connection is paused or requires reconnection.',409,'connection_paused');
  const context=connectionContext({db,tenant,branchCode:job.branch_code,actorCode:connection.code},connection);
  await requireTenantFeature(context,context.integrationFeature);
  if(context.branchCode && !tenant.branches.some(branch=>branch.code===context.branchCode)) throw new IntegrationError('Branch is no longer active.',403,'scope_denied');
  await consumeRateLimit(db,`worker:${tenant.id}`,120);
  if(job.kind==='incoming' && ['incoming','external'].includes(connection.type)) {
    const record=decryptSecret(job.payload.record);
    const saved=await writeLead(context,record,`${connection.code}:${hashSecret(job.dedupe_key)}`);
    return {lead_code:saved.data.lead_code,status:saved.status};
  }
  if(job.kind==='pull'&&connection.type==='external'&&connection.config.direction==='pull') return pullExternal(context,connection,enqueueJobs);
  if(job.kind==='meta_sync'&&connection.type==='meta') return syncMetaPage(context,connection,job.payload,enqueueJobs);
  if(job.kind==='meta_lead'&&connection.type==='meta') {
    const lead=await fetchMetaLead(connection,job.payload);
    const saved=await writeLead(context,lead.record,`${connection.code}:meta:${job.payload.lead_id}`,null,lead.metadata);
    return {lead_code:saved.data.lead_code,status:saved.status};
  }
  if(job.kind==='delivery'&&connection.type==='outgoing') {
    const event=job.payload.test?{code:job.code,event_type:'lead.created',branch_code:context.branchCode,occurred_at:job.created_at,payload:{data:{lead_ref_id:'TEST-LEAD',name:'Integration test',source:'Integration Test'}}}
      : checked(await db.from('integration_events').select('*').eq('tenant_id',tenant.id).eq('code',job.payload.event_code).maybeSingle());
    if(!event || (context.branchCode && event.branch_code!==context.branchCode)) throw new IntegrationError('Event scope denied.',403,'scope_denied');
    return deliverOutgoing(context,connection,event);
  }
  if(job.kind==='delivery'&&connection.type==='external'&&connection.config.direction==='push') {
    const rows=await listLeads(context,new URLSearchParams(),job.payload.lead_code);
    const lead=rows.data[0];
    const body=Object.keys(connection.config.request_mapping || {}).length?mapRecord(lead,connection.config.request_mapping):lead;
    const response=await safeRequest(connection.config.url,{method:connection.config.method,headers:authHeaders(connection),body});
    if(!response.ok) throw new IntegrationError('External push failed.',502,`http_${response.status}`);
    return {http_status:response.status,lead_code:lead.lead_code};
  }
  throw new IntegrationError('Job does not match its configured connection.',422,'invalid_job');
}
export async function runWorker() {
  assertEnabled();
  const db=integrationDb();
  await consumeRateLimit(db,'integration-worker-invocations',4);
  // Recover a worker that died during its final attempt, preserving the failed job for review.
  checked(await db.from('integration_jobs').update({status:'failed',error_code:'lease_exhausted',completed_at:new Date().toISOString()}).eq('status','running').gte('attempts',6).lt('lease_until',new Date().toISOString()));
  await scheduleConnections(db);
  checked(await db.rpc('integration_dispatch_events',{p_limit:50}));
  const jobs=checked(await db.rpc('integration_claim_jobs',{p_limit:5})) || [];
  const directory=await tenantDirectory(db);
  const results=await Promise.all(jobs.map(async job=>{
    let result={},error=null;
    try { result=await executeJob(db,directory,job); }
    catch(cause) {
      error=cause instanceof IntegrationError?cause:new IntegrationError('Job failed.',503,'job_failed');
      if(error.code==='tenant_integration_disabled') {
        const released=checked(await db.rpc('integration_release_paused_job',{p_id:job.id,p_lease:job.lease_token}));
        return {job_code:job.code,status:released?'paused':'lease_changed'};
      }
      if(error.code==='meta_reconnect') checked(await db.from('integration_connections').update({status:'reconnect',updated_at:new Date().toISOString()}).eq('tenant_id',job.tenant_id).eq('code',job.connection_code));
    }
    const finished=checked(await db.rpc('integration_finish_job',{p_id:job.id,p_lease:job.lease_token,p_success:!error,p_result:result,p_error:error?.code || null,p_retryable:error?retryableJobError(error):false}));
    if(finished) {
      checked(await db.from('integration_delivery_attempts').insert({tenant_id:job.tenant_id,branch_code:job.branch_code,job_code:job.code,connection_code:job.connection_code,status:error?'failed':'success',attempt:job.attempts,http_status:result.http_status || null,error_code:error?.code || null}));
      if(!error) checked(await db.from('integration_connections').update({last_run_at:new Date().toISOString()}).eq('tenant_id',job.tenant_id).eq('code',job.connection_code));
    }
    return {job_code:job.code,status:!finished?'lease_changed':error?'failed':'completed'};
  }));
  return {processed:results.length,results};
}
