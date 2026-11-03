import test from 'node:test';
import assert from 'node:assert/strict';
import {INTEGRATION_FEATURES} from '../src/config/integrationsConfig.js';
import {effectiveTenantPolicy,normalizeTenantPolicy,assertTenantFeature,tenantCanManageIntegrations,loadTenantPolicy,resolvePolicyScope} from '../src/lib/integrations/tenantPolicy.js';
import {requireApiAccess} from '../src/lib/integrations/access.js';
import {createSecret,hashSecret} from '../src/lib/integrations/security.js';

const features=Object.fromEntries(INTEGRATION_FEATURES.map(feature=>[feature.id,true]));
test('Master policy scope rejects unknown codes and cross-tenant branches',()=>{
  const directory=[{code:'TNT00001',branches:[{code:'TNT00001-B0001'}]},{code:'TNT00002',branches:[{code:'TNT00002-B0001'}]}];
  assert.equal(resolvePolicyScope(directory,{tenantCode:'TNT00002',branchCode:'TNT00002-B0001'}).tenant.code,'TNT00002');
  assert.throws(()=>resolvePolicyScope(directory,{tenantCode:'TNT00001',branchCode:'TNT00002-B0001'}),error=>error.code==='scope_denied');
  assert.throws(()=>resolvePolicyScope(directory,{tenantCode:'unknown'}),error=>error.code==='scope_denied');
});
test('a missing policy is OFF and malformed or unknown feature flags cannot enable access',()=>{
  assert.equal(effectiveTenantPolicy(null).enabled,false);
  assert.throws(()=>assertTenantFeature(effectiveTenantPolicy(null),'api_read'),error=>error.code==='tenant_integration_disabled');
  for(const input of [{enabled:'true',features},{enabled:true,features:{...features,unknown:true}},{enabled:true,features:{api_read:'true'}},{enabled:true,features,tenant_id:'forged'}])assert.throws(()=>normalizeTenantPolicy(input));
  assert.deepEqual(normalizeTenantPolicy({inherit:true},{branch:true}),{inherit:true});
  assert.throws(()=>normalizeTenantPolicy({inherit:true}));
});
test('company OFF cannot be expanded by branch settings; company-wide scope cannot bypass branch restrictions',()=>{
  const row={enabled:false,features,branches:{'TNT00002-B0001':{enabled:true,features}}};
  assert.equal(effectiveTenantPolicy(row,'TNT00002-B0001').features.api_read,false);
  row.enabled=true;row.branches['TNT00002-B0001'].features={...features,api_write:false};
  assert.equal(effectiveTenantPolicy(row,'TNT00002-B0001').features.api_write,false);
  assert.equal(effectiveTenantPolicy(row).features.api_write,false);
  assert.equal(effectiveTenantPolicy(row).features.api_read,true);
  assert.equal(effectiveTenantPolicy(row,'TNT00002-B0002').features.api_write,true);
  row.features={...features,meta:false};
  assert.equal(effectiveTenantPolicy(row,'TNT00002-B0002').features.meta,false);
});
test('tenant admins manage enabled integrations; staff retain explicit powers and read-only limits',()=>{
  const permission={view:true,add:true,edit:true};
  assert.equal(tenantCanManageIntegrations({role:'Admin'},permission),true);
  assert.equal(tenantCanManageIntegrations({role:'manager'},permission),false);
  assert.equal(tenantCanManageIntegrations({role:'manager',module_access:{can_manage_integrations:true}},permission),true);
  assert.equal(tenantCanManageIntegrations({role:'Admin',can_write:false},permission),false);
  assert.equal(tenantCanManageIntegrations({role:'Admin'},{view:false,add:true}),false);
  assert.equal(tenantCanManageIntegrations({role:'Admin'},permission,true),true);
});
test('policy storage failures stay closed; only the setup screen may tolerate a missing migration',async()=>{
  const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({error:{code:'PGRST205'}})})})})};
  const policy=await loadTenantPolicy(db,'tenant',null,{tolerateSetup:true});
  assert.equal(policy.ready,false);assert.equal(policy.enabled,false);
  await assert.rejects(loadTenantPolicy(db,'tenant'),error=>error.code==='setup_required');
});
test('an already-issued API key follows OFF/ON changes on every authenticated request',async t=>{
  const originalFetch=globalThis.fetch;
  const envKeys=['INTEGRATIONS_ENABLED','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
  t.after(()=>{globalThis.fetch=originalFetch;for(const key of envKeys){if(previous[key]===undefined)Reflect.deleteProperty(process.env,key);else process.env[key]=previous[key];}});
  process.env.INTEGRATIONS_ENABLED='true';process.env.NEXT_PUBLIC_SUPABASE_URL='https://integration-policy.example.com';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-service-key';
  const tenantId='11111111-1111-4111-8111-111111111111',token=createSecret('crm');
  const key={code:'KEY_existing',tenant_id:tenantId,branch_code:null,key_hash:hashSecret(token),scopes:['leads:read','lookups:read'],requests_per_minute:120};
  let policy={enabled:false,features,branches:{}},lastUsedUpdates=0;
  globalThis.fetch=async(url,options={})=>{
    const path=new URL(url).pathname;
    if(path==='/rest/v1/rpc/integration_take_rate_limit')return Response.json(true);
    if(path==='/rest/v1/integration_api_keys') {
      if(options.method==='PATCH'){lastUsedUpdates++;return new Response(null,{status:204});}
      return Response.json([key]);
    }
    if(path==='/rest/v1/tenants')return Response.json([{id:tenantId,name:'Fixture tenant',tenant_code:'TNT90999',status:'ACTIVE'}]);
    if(path==='/rest/v1/tenant_branches')return Response.json([{tenant_id:tenantId,tenant_code:'TNT90999',branch_code:'TNT90999-B0001',branch_name:'HQ'}]);
    if(path==='/rest/v1/integration_tenant_policies')return Response.json([policy]);
    throw new Error('Unexpected fixture request: '+path);
  };
  const request=(query='')=>new Request('https://crm.example.com/api/integrations/v1/leads'+query,{headers:{Authorization:'Bearer '+token}});
  await assert.rejects(requireApiAccess(request(),'leads:read'),error=>error.code==='tenant_integration_disabled');
  assert.equal(lastUsedUpdates,0);
  policy={...policy,enabled:true};
  assert.equal((await requireApiAccess(request(),'leads:read')).tenant.code,'TNT90999');
  policy={...policy,branches:{'TNT90999-B0001':{enabled:false,features}}};
  await assert.rejects(requireApiAccess(request(),'leads:read'),error=>error.code==='tenant_integration_disabled');
  await assert.rejects(requireApiAccess(request('?branch_code=TNT90999-B0001'),'leads:read'),error=>error.code==='tenant_integration_disabled');
  policy={...policy,branches:{},enabled:false};
  await assert.rejects(requireApiAccess(request(),'leads:read'),error=>error.code==='tenant_integration_disabled');
  assert.equal(lastUsedUpdates,1);
});
