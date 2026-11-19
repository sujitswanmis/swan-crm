import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, postgres, PGlite, TENANT, OTHER, ACTOR, USER, REQUEST } from './saas-access.test.mjs';

test('overview and user dialog consistently exclude held users and internal configuration rows', async () => {
  const {actions}=harness({tables:{user_roles:[
    {user_id:ACTOR,tenant_id:TENANT,role:'masteradmin',is_approved:true,emp_status:'Active'},
    {user_id:USER,tenant_id:TENANT,role:'agent',is_approved:false,emp_status:'Active'},
    {user_id:OTHER,tenant_id:OTHER,company:'Audit Company',role:'agent',is_approved:true,emp_status:'Active'}
  ],tenant_entitlements:[{tenant_id:TENANT,module_key:'ATTENDANCE',is_enabled:true},{tenant_id:TENANT,module_key:'TELEPHONY_CONFIG',is_enabled:true}]}});
  const overview=await actions.getAllTenantsWithSubscriptions();
  const details=await actions.getTenantActiveUsers(TENANT);
  assert.equal(overview.tenants.find(t=>t.id===TENANT).active_users_count,1);
  assert.equal(details.activeUsers.length,1);
  assert.equal(details.heldUsers.length,1);
  assert.equal(details.activeUsers[0].can_hold,false);
  assert.deepEqual(Array.from(overview.tenants.find(t=>t.id===TENANT).entitlements),['ATTENDANCE']);
});
test('custom module entitlement saves and preserves existing deal terms', async () => {
  const {actions,calls}=harness({tables:{tenant_entitlements:[
    {tenant_id:'00000000-0000-0000-0000-000000000001',module_key:'SAAS_PRICING_CONFIG',config_json:{custom_modules:[{process_code:'CUSTOM_MODULE',display_name:'Custom',monthly_rate_per_user:10}]}},
    {tenant_id:TENANT,module_key:'CUSTOM_MODULE',config_json:{deal_terms:{deal_price:500}}}
  ]}});
  const result=await actions.updateTenantEntitlements(TENANT,['CUSTOM_MODULE']);
  assert.equal(result.success,true);
  const write=calls.find(q=>q.operation==='upsert');
  const custom=write.payload.find(r=>r.module_key==='CUSTOM_MODULE');
  assert.equal(custom.is_enabled,true);
  assert.equal(custom.config_json.deal_terms.deal_price,500);
  assert.equal(write.payload.some(r=>r.module_key==='TELEPHONY_CONFIG'),false);
});
test('workspace provisioning rejects existing auth users without overwriting roles', async () => {
  const {actions,calls}=harness({rpc:async name=>name==='saas_prepare_workspace'?{data:{tenant:{id:TENANT,tenant_code:'TNT00004'}},error:null}:{data:{},error:null},authAdmin:{
    createUser:async()=>({data:null,error:{message:'User already registered'}}),
    listUsers:async()=>({data:{users:[{id:USER,email:'existing@audit.invalid',user_metadata:{tenant_id:OTHER}}]},error:null})
  }});
  const result=await actions.createTenantWorkspace({companyName:'Audit Company',adminEmail:'existing@audit.invalid',adminPassword:'TestOnly123!',adminName:'Owner',requestId:REQUEST});
  assert.equal(result.success,false);
  assert.match(result.error,/existing account/);
  assert.equal(calls.some(q=>q.rpc==='saas_finalize_workspace'||q.table==='user_roles'&&q.operation!=='select'),false);
});
test('provisioning finalization failure reports failure and never claims activation', async () => {
  const {actions,calls}=harness({rpc:async name=>name==='saas_prepare_workspace'?{data:{tenant:{id:TENANT,tenant_code:'TNT00004'}},error:null}:{data:null,error:{message:'Role/subscription transaction failed'}}});
  const result=await actions.createTenantWorkspace({companyName:'New Company',adminEmail:'new@audit.invalid',adminPassword:'TestOnly123!',adminName:'Owner',requestId:REQUEST});
  assert.equal(result.success,false);
  assert.match(result.error,/transaction failed/);
  const finalize=calls.find(q=>q.rpc==='saas_finalize_workspace');
  assert.equal(finalize.args.p_admin_user_id,USER);
  assert.equal(finalize.args.p_subscription.user_seat_limit,5);
});
test('PostgreSQL: provisioning finalization binds the administrator to its new tenant and retries safely', {skip:!PGlite}, async()=>{
  const db=await postgres();
  try{
    const payload={company:'New Company',email:'new@audit.invalid',admin_name:'Owner',mobile:''};
    const prepared=(await db.query('SELECT saas_prepare_workspace($1,$2,$3) AS result',[ACTOR,REQUEST,JSON.stringify(payload)])).rows[0].result;
    assert.equal(prepared.tenant.status,'DRAFT');
    const args=[ACTOR,REQUEST,'dddddddd-dddd-4ddd-8ddd-dddddddddddd',JSON.stringify({plan_name:'SAAS_MODULAR',user_seat_limit:5,valid_from:'2026-11-16T00:00:00+05:30',valid_until:'2027-11-16T23:59:59+05:30',status:'ACTIVE',billing_cycle:'YEARLY',amount:100}),JSON.stringify([{module_key:'ATTENDANCE',config_json:{}}])];
    await db.query('SELECT saas_finalize_workspace($1,$2,$3,$4,$5)',args);
    await db.query('SELECT saas_finalize_workspace($1,$2,$3,$4,$5)',args);
    const role=(await db.query('SELECT tenant_id,company FROM user_roles WHERE user_id=$1',[args[2]])).rows[0];
    assert.equal(role.tenant_id,prepared.tenant.id);
    assert.equal(role.company,'New Company');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM tenant_subscriptions WHERE tenant_id=$1',[role.tenant_id])).rows[0].n,1);
  }finally{await db.close();}
});
test('PostgreSQL: existing email cannot allocate a new tenant', {skip:!PGlite}, async()=>{
  const db=await postgres();
  try{await assert.rejects(db.query('SELECT saas_prepare_workspace($1,$2,$3)',[ACTOR,REQUEST,JSON.stringify({company:'Invalid Copy',email:'owner@audit.invalid',admin_name:'Copy'})]),/already belongs/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM tenants')).rows[0].n,2);
  }finally{await db.close();}
});
