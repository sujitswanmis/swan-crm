'use server';

import { API_SCOPES, CONNECTION_TYPES, INTEGRATION_PAGE_IDS, INTEGRATION_FEATURES, integrationPageForType, integrationFeatureForConnection } from '../../config/integrationsConfig.js';
import { requireSessionAccess, requireMasterIntegrationAccess } from '../../lib/integrations/access.js';
import { loadTenantPolicy, normalizeTenantPolicy, requireTenantFeature, assertTenantFeature, resolvePolicyScope } from '../../lib/integrations/tenantPolicy.js';
import { checked, scopeQuery, connectionView, findConnection, audit, consumeRateLimit, integrationReadiness, integrationSetupPending } from '../../lib/integrations/store.js';
import { IntegrationError, publicError, createSecret, hashSecret, encryptSecret, decryptSecret, assertEnabled, safeRequest, istDateBound } from '../../lib/integrations/security.js';
import { validateConnectionConfig, authHeaders } from '../../lib/integrations/connectors.js';
import { leadLookups, validateLeadChoices, listLeads } from '../../lib/integrations/leadAdapter.js';
import { metaSetup, metaAssets, verifyMetaSelection } from '../../lib/integrations/meta.js';
import { enqueueJobs, connectionContext } from '../../lib/integrations/queue.js';

const RESOURCES={
  connections:{table:'integration_connections',select:'*'},
  keys:{table:'integration_api_keys',select:'code,name,branch_code,key_prefix,scopes,expires_at,revoked_at,last_used_at,created_at'},
  jobs:{table:'integration_jobs',select:'code,connection_code,branch_code,kind,status,attempts,error_code,available_at,created_at,completed_at'},
  attempts:{table:'integration_delivery_attempts',select:'code,job_code,connection_code,branch_code,status,http_status,attempt,error_code,created_at'},
  audit:{table:'integration_audit_logs',select:'code,branch_code,actor_code,operation,resource_code,created_at'},
};
function pageForRequest(input) {
  if(input.command==='list') return input.resource==='keys'?'integrations_api':input.resource==='connections'?integrationPageForType(input.type):'integrations_logs';
  if(['create_key','rotate_key','revoke_key'].includes(input.command)) return 'integrations_api';
  if(['save_connection','rotate_webhook_secret','queue_connection','test_connection'].includes(input.command)) return integrationPageForType(input.type);
  if(input.command==='meta_assets') return 'integrations_meta';
  if(input.command==='retry_job') return 'integrations_logs';
  return input.page || 'integrations';
}
async function bootstrap(context) {
  const readiness=await integrationReadiness(context.db,context.tenant.id,context.user.id);
  const setup={...readiness,databaseReady:readiness.databaseReady&&context.policy?.ready===true,enabled:process.env.INTEGRATIONS_ENABLED==='true',encryptionReady:/^[a-f0-9]{64}$/i.test(process.env.INTEGRATIONS_ENCRYPTION_KEY || ''),workerReady:Boolean(process.env.INTEGRATIONS_WORKER_SECRET?.length>=32),meta:metaSetup(),scheduler:{installed:false,active:false}};
  let lookups={stages:[],employees:[],sources:[],priorities:[]};
  try {lookups=await leadLookups(context);} catch {/* Configuration failure remains local to integrations. */}
  let counts={};
  if(setup.databaseReady) {
    try {
      const scheduler=await context.db.rpc('integration_scheduler_status');
      if(!scheduler.error && scheduler.data) setup.scheduler=scheduler.data;
      const results=await Promise.all(['enabled','paused','reconnect'].map(status=>scopeQuery(context.db.from('integration_connections').select('code',{head:true,count:'exact'}).eq('status',status),context)));
      ['enabled','paused','reconnect'].forEach((status,index)=>{checked(results[index]);counts[status]=results[index].count || 0;});
      const pending=await scopeQuery(context.db.from('integration_jobs').select('code',{head:true,count:'exact'}).in('status',['pending','running']),context);
      const failed=await scopeQuery(context.db.from('integration_jobs').select('code',{head:true,count:'exact'}).eq('status','failed'),context);
      checked(pending); checked(failed);
      counts.pending=pending.count || 0; counts.failed=failed.count || 0;
    } catch(error) {
      if(!integrationSetupPending(error)) throw error;
      setup.databaseReady=false;
      counts={};
    }
  }
  const policy=context.policy?{ready:context.policy.ready,enabled:context.policy.enabled,companyEnabled:context.policy.companyEnabled,features:context.policy.features,branchOverride:context.policy.branchOverride}:null;
  return {success:true,setup,counts,lookups,policy,canManage:context.canManage,tenantWide:context.tenantWide,
    tenantCode:context.tenant.code,branchCode:context.branchCode,
    tenants:context.directory.map(tenant=>({code:tenant.code,name:tenant.name})),
    branches:context.branches.map(branch=>({code:branch.code,name:branch.name}))};
}
async function masterTenantAccess(input) {
  const context=await requireMasterIntegrationAccess();
  const {tenant,branchCode}=resolvePolicyScope(context.directory,input);
  const current=await loadTenantPolicy(context.db,tenant.id,branchCode,{tolerateSetup:true});
  const readiness=await integrationReadiness(context.db,tenant.id,context.user.id);
  if(input.command==='tenant_access_save') {
    if(!current.ready || !readiness.databaseReady) throw new IntegrationError('Apply the tenant integration access migration first.',503,'setup_required');
    const policy=normalizeTenantPolicy(input.policy,{branch:Boolean(branchCode)});
    if(!Number.isSafeInteger(input.revision)||input.revision<0) throw new IntegrationError('Reload the current access policy before saving.');
    const result=await context.db.rpc('integration_set_tenant_policy',{p_tenant_id:tenant.id,p_tenant_code:tenant.code,p_branch_code:branchCode,p_policy:policy,p_actor:context.actorCode,p_revision:input.revision});
    if(result.error?.message?.includes('configuration_changed')) throw new IntegrationError('Access policy changed. Refresh before saving.',409,'configuration_changed');
    checked(result);
    return {success:true,message:'Tenant integration access saved.',revision:result.data};
  }
  const row=current.configuration;
  const selected=branchCode?row?.branches?.[branchCode]:row;
  return {success:true,tenantCode:tenant.code,branchCode,tenantWide:true,tenants:context.directory.map(item=>({code:item.code,name:item.name})),branches:tenant.branches.map(item=>({code:item.code,name:item.name})),
    setup:{databaseReady:current.ready&&readiness.databaseReady,enabled:process.env.INTEGRATIONS_ENABLED==='true',meta:metaSetup()},
    revision:current.revision,updatedAt:current.updatedAt,companyEnabled:row?.enabled===true,
    companyFeatures:Object.fromEntries(INTEGRATION_FEATURES.map(feature=>[feature.id,row?.features?.[feature.id]===true])),
    policy:{inherit:Boolean(branchCode&&!selected),enabled:selected?.enabled===true,features:Object.fromEntries(INTEGRATION_FEATURES.map(feature=>[feature.id,selected?.features?.[feature.id]===true]))},
    effective:{enabled:current.enabled,features:current.features}};
}
async function list(context,input) {
  const resource=RESOURCES[input.resource];
  if(!resource) throw new IntegrationError('Unsupported integration resource.');
  const page=Number(input.currentPage || 1),size=Number(input.pageSize || 25);
  if(!Number.isInteger(page)||page<1||page>10000||![10,25,50,100].includes(size)) throw new IntegrationError('Invalid pagination.');
  let query=scopeQuery(context.db.from(resource.table).select(resource.select,{count:'exact'}),context);
  if(input.resource==='connections') {
    if(!CONNECTION_TYPES.includes(input.type)) throw new IntegrationError('Select a connection type.');
    query=query.eq('type',input.type).neq('status','archived');
  }
  if(input.resource==='jobs') query=query.neq('kind','receipt');
  if(input.fromDate) query=query.gte('created_at',istDateBound(input.fromDate));
  if(input.toDate) query=query.lt('created_at',istDateBound(input.toDate,true));
  if(input.fromDate&&input.toDate&&input.fromDate>input.toDate) throw new IntegrationError('From date cannot be after To date.');
  if(input.status) query=query.eq('status',String(input.status).slice(0,30));
  if(input.search) {
    const search=String(input.search).slice(0,100);
    query=query.ilike(input.resource==='connections'||input.resource==='keys'?'name':'code',`%${search}%`);
  }
  const response=await query.order('created_at',{ascending:false}).range((page-1)*size,page*size-1);
  const rows=checked(response) || [];
  return {success:true,rows:input.resource==='connections'?rows.map(connectionView):rows,total:response.count || 0};
}
async function createKey(context,input,old) {
  const scopes=old?.scopes || input.scopes;
  if(!Array.isArray(scopes)||!scopes.length||scopes.some(scope=>!API_SCOPES.includes(scope))) throw new IntegrationError('Select valid API scopes.');
  const policy=await requireTenantFeature({...context,branchCode:old?.branch_code || context.branchCode});
  for(const scope of scopes) assertTenantFeature(policy,['leads:read','lookups:read'].includes(scope)?'api_read':'api_write');
  const name=String(old?.name || input.name || '').trim();
  if(!name || name.length>120) throw new IntegrationError('Enter a key name up to 120 characters.');
  const days=Number(input.expiresInDays ?? 90);
  if(!Number.isInteger(days)||days<1||days>365) throw new IntegrationError('Key validity must be between 1 and 365 days.');
  const token=createSecret('crm'),code=createSecret('KEY');
  const row={code,tenant_id:context.tenant.id,branch_code:old?.branch_code || context.branchCode,name,key_hash:hashSecret(token),key_prefix:token.slice(0,12)+'…',scopes,expires_at:new Date(Date.now()+days*86400000).toISOString(),requests_per_minute:120};
  checked(await context.db.rpc('integration_create_key',{p_row:row,p_actor:context.actorCode,p_revoke_code:old?.code || null}));
  return {success:true,code,secret:token,message:'Copy this API key now. It will not be shown again.'};
}
async function saveConnection(context,input) {
  if(!CONNECTION_TYPES.includes(input.type)) throw new IntegrationError('Unsupported connection type.');
  const old=input.code?await findConnection(context.db,context,input.code,[input.type]):null;
  if(old && (!input.expectedUpdatedAt || input.expectedUpdatedAt!==old.updated_at)) throw new IntegrationError('Connection changed. Reload it before saving.',409,'configuration_changed');
  const name=String(input.name || '').trim();
  if(!name || name.length>120) throw new IntegrationError('Enter a connection name up to 120 characters.');
  const config=await validateConnectionConfig(input.type,input.config);
  const scoped=old?connectionContext(context,old):context;
  await requireTenantFeature(scoped,integrationFeatureForConnection({type:input.type,config}));
  await validateLeadChoices(config.defaults,scoped);
  const status=input.status==='enabled'?'enabled':'paused';
  if(status==='enabled') assertEnabled();
  const credentials=old?.credentials?decryptSecret(old.credentials):{};
  let secret;
  if(['incoming','outgoing'].includes(input.type)&&!credentials.webhook_secret) credentials.webhook_secret=secret=createSecret('whsec');
  if(input.type!=='meta') {
    for(const key of ['token','username','password']) {
      const value=input.credentials?.[key];
      if(value!==undefined && (typeof value!=='string'||value.length>4000||/[\r\n\u0000]/.test(value))) throw new IntegrationError('Credential value is invalid.');
      if(value) credentials[key]=value;
    }
  }
  if(['external','outgoing'].includes(input.type)&&config.auth_type!=='none') {
    if(config.auth_type==='basic'? !credentials.username||!credentials.password : !credentials.token) throw new IntegrationError('Provide authentication credentials. Existing credentials are preserved when fields are left blank.');
  }
  if(input.type==='meta'&&status==='enabled') {
    if(!old?.credentials) throw new IntegrationError('Connect Meta before enabling this connection.');
    await verifyMetaSelection(old,config);
  }
  const row={code:old?.code || createSecret('CON'),tenant_id:context.tenant.id,branch_code:old?old.branch_code:context.branchCode,name,type:input.type,status,config,credentials:Object.keys(credentials).length?encryptSecret(credentials):null};
  const result=await context.db.rpc('integration_save_connection',{p_row:row,p_actor:context.actorCode,p_expected:old?.updated_at || null});
  if(result.error?.message?.includes('meta_form_already_mapped')) throw new IntegrationError('A selected Meta form already has an active mapping. Pause that mapping before enabling this one.',409,'mapping_conflict');
  if(result.error?.message?.includes('configuration_changed')) throw new IntegrationError('Connection changed. Reload before saving.',409,'configuration_changed');
  checked(result);
  return {success:true,code:row.code,...(secret?{secret,message:'Copy the webhook signing secret now. It will not be shown again.'}:{message:'Connection saved.'})};
}

export async function integrationAction(input = {}) {
  try {
    if(!input||typeof input!=='object'||Array.isArray(input)||JSON.stringify(input).length>65536) throw new IntegrationError('Integration request is invalid or too large.');
    if(['tenant_access_bootstrap','tenant_access_save'].includes(input.command)) return await masterTenantAccess(input);
    const page=pageForRequest(input);
    if(!INTEGRATION_PAGE_IDS.includes(page)) throw new IntegrationError('Integration page not found.',404);
    const commands=['bootstrap','list','create_key','rotate_key','revoke_key','save_connection','rotate_webhook_secret','queue_connection','test_connection','meta_assets','retry_job','map_lead_branch'];
    if(!commands.includes(input.command)) throw new IntegrationError('Unsupported integration operation.');
    const manages=!['bootstrap','list'].includes(input.command);
    const context=await requireSessionAccess(input,page,manages);
    if(input.command==='bootstrap') return await bootstrap(context);
    const policy=await requireTenantFeature(context);
    if(input.command==='list') {
      if(input.resource==='connections') assertTenantFeature(policy,input.type==='external'?null:input.type);
      if(input.resource==='keys'&&!policy.features.api_read&&!policy.features.api_write) throw new IntegrationError('API access is not enabled by Master Admin.',403,'tenant_integration_disabled');
    }
    await consumeRateLimit(context.db,`management:${context.user.id}`,60);
    if(input.command==='list') return await list(context,input);
    if(input.command==='create_key') return await createKey(context,input);
    if(['rotate_key','revoke_key'].includes(input.command)) {
      const row=checked(await scopeQuery(context.db.from('integration_api_keys').select('*').eq('code',String(input.code)),context).maybeSingle());
      if(!row || row.revoked_at) throw new IntegrationError('Active API key not found.',404);
      if(input.command==='rotate_key') return await createKey(context,input,row);
      checked(await context.db.rpc('integration_revoke_key',{p_tenant_id:context.tenant.id,p_branch_code:context.branchCode,p_code:row.code,p_actor:context.actorCode}));
      return {success:true,message:'API key revoked.'};
    }
    if(input.command==='save_connection') return await saveConnection(context,input);
    if(input.command==='map_lead_branch') {
      if(!['api_write','incoming','external_pull','meta'].some(feature=>policy.features[feature])) throw new IntegrationError('Lead integration access is not enabled.',403,'tenant_integration_disabled');
      if(!context.tenantWide || !context.branchCode) throw new IntegrationError('A tenant administrator must select the target branch.',403);
      const result=await context.db.rpc('integration_map_lead',{p_tenant_id:context.tenant.id,p_branch_code:context.branchCode,p_lead_code:String(input.leadCode || ''),p_actor:context.actorCode});
      if(result.error?.message?.includes('already_mapped')) throw new IntegrationError('This lead already belongs to a different branch. No ownership was changed.',409);
      if(result.error?.message?.includes('lead_not_found')) throw new IntegrationError('Lead not found in this tenant.',404);
      checked(result);return {success:true,message:'Existing tenant lead mapped to this branch.'};
    }
    if(input.command==='retry_job') {
      const row=checked(await scopeQuery(context.db.from('integration_jobs').select('id,code,status,kind,connection_code,branch_code').eq('code',String(input.code)),context).maybeSingle());
      if(!row || row.status!=='failed' || row.kind==='receipt') throw new IntegrationError('Only failed integration jobs can be retried.');
      const connection=await findConnection(context.db,context,row.connection_code,CONNECTION_TYPES);
      await requireTenantFeature({...context,branchCode:row.branch_code},integrationFeatureForConnection(connection));
      checked(await context.db.rpc('integration_retry_job',{p_tenant_id:context.tenant.id,p_branch_code:context.branchCode,p_code:row.code,p_actor:context.actorCode}));
      return {success:true,message:'Job queued for retry.'};
    }
    const connection=await findConnection(context.db,context,input.code,input.command==='meta_assets'?['meta']:[input.type]);
    const scoped=connectionContext(context,connection);
    await requireTenantFeature(scoped,integrationFeatureForConnection(connection));
    if(input.command==='meta_assets') return {success:true,...await metaAssets(connection,input.pageId || connection.config.page_id)};
    if(input.command==='rotate_webhook_secret') {
      if(!['incoming','outgoing'].includes(connection.type)) throw new IntegrationError('This connection has no webhook secret.');
      const secret=createSecret('whsec'),credentials={...decryptSecret(connection.credentials),webhook_secret:secret};
      checked(await context.db.rpc('integration_save_connection',{p_row:{...connection,credentials:encryptSecret(credentials)},p_actor:context.actorCode,p_expected:connection.updated_at}));
      return {success:true,secret,message:'Secret rotated. Update the sender/receiver before resuming deliveries.'};
    }
    assertEnabled();
    if(input.command==='test_connection') {
      if(connection.type!=='external'||connection.config.direction!=='pull') throw new IntegrationError('Use Queue test for outgoing webhooks, or Meta’s test-lead tool.');
      const response=await safeRequest(connection.config.url,{headers:authHeaders(connection),query:connection.config.query});
      await audit(context.db,scoped,'connection_tested',connection.code);
      return {success:true,message:`Test returned HTTP ${response.status}. No lead records were imported.`,http_status:response.status};
    }
    if(connection.status!=='enabled') throw new IntegrationError('Enable the connection before queuing a run.');
    let jobs;
    if(connection.type==='meta') {
      const since=input.since?Date.parse(istDateBound(input.since)):Date.now()-7*86400000;
      if(!Number.isFinite(since)||since>Date.now()||since<Date.now()-90*86400000) throw new IntegrationError('Select a valid IST date within the last 90 days. Meta availability may be more limited.');
      jobs=(connection.config.form_ids || []).map(formId=>({kind:'meta_sync',dedupe:`manual:${createSecret('run')}:${formId}`,payload:{form_id:formId,since:Math.floor(since/1000)}}));
    } else if(connection.type==='external'&&connection.config.direction==='pull') jobs=[{kind:'pull',dedupe:createSecret('manual'),payload:{}}];
    else if(connection.type==='external'&&connection.config.direction==='push') {
      await listLeads(scoped,new URLSearchParams(),input.leadCode);
      if(!input.leadCode) throw new IntegrationError('Enter a lead code to push.');
      jobs=[{kind:'delivery',dedupe:createSecret('manual'),payload:{lead_code:input.leadCode}}];
    } else if(connection.type==='outgoing') jobs=[{kind:'delivery',dedupe:createSecret('test'),payload:{test:true}}];
    else throw new IntegrationError('Use the incoming endpoint to receive leads.');
    await enqueueJobs(scoped,connection,jobs);
    await audit(context.db,scoped,'run_queued',connection.code);
    return {success:true,message:`${jobs.length} job(s) queued. The background worker will process them.`};
  } catch(error) { return publicError(error); }
}
