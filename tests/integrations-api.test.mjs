import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLead,publicLead,validatePayloadScope,leadLookups,validateLeadChoices} from '../src/lib/integrations/leadAdapter.js';
import {istDateBound,publicError} from '../src/lib/integrations/security.js';
import {integrationTimestamp} from '../src/config/integrationsConfig.js';
test('API lead writes normalize Indian phones and reject internal ownership fields',()=>{
  assert.deepEqual(normalizeLead({phone:'+91 98765 43210',email:' A@EXAMPLE.COM '}),{phone:'9876543210',email:'a@example.com',name:'Integration enquiry'});
  for(const field of ['id','tenant_id','created_by','our_company']) assert.throws(()=>normalizeLead({name:'A',[field]:'injected'}),/unsupported/);
  assert.throws(()=>normalizeLead({name:'A',external_id:{nested:true}}),/external_id/);
  assert.throws(()=>normalizeLead({},{create:false}),/at least one/);
  assert.throws(()=>normalizeLead({email:'invalid'}),/valid email/);
});
test('public API projections exclude database UUIDs and unapproved columns',()=>{
  const uuid='00000000-0000-0000-0000-000000000001';
  const result=publicLead({id:uuid,tenant_id:uuid,lead_ref_id:'LD-1',name:'A',assigned_to:uuid,password:'hidden'},'TNT00001','TNT00001-B0001');
  assert.equal(result.lead_code,'LD-1');assert.equal(result.assigned_to,null);
  assert.equal(JSON.stringify(result).includes(uuid),false);assert.equal('password' in result,false);
});
test('body selectors cannot replace authenticated request scope',()=>{
  const context={tenant:{code:'TNT00001'},branchCode:'TNT00001-B0001'};
  assert.throws(()=>validatePayloadScope({tenant_code:'TNT00002'},context),/denied/);
  assert.throws(()=>validatePayloadScope({branch_code:'TNT00001-B0002'},context),/authorized branch/);
});
test('IST date windows remain correct across UTC date boundaries and validate the calendar',()=>{
  assert.equal(istDateBound('2026-10-31'),'2026-10-30T18:30:00.000Z');
  assert.equal(istDateBound('2026-10-31',true),'2026-10-31T18:30:00.000Z');
  assert.throws(()=>istDateBound('2026-02-30'),/valid IST/);
  assert.throws(()=>istDateBound('31/10/2026'),/YYYY-MM-DD/);
  assert.equal(integrationTimestamp('2026-10-30T20:00:00Z'),'2026-10-31T01:30:00+05:30');
});
test('unexpected provider/database errors never leak their message to clients',()=>{
  assert.equal(JSON.stringify(publicError(new Error('SECRET_TOKEN customer phone'))).includes('SECRET_TOKEN'),false);
});

test('employee lookups preserve assignment names while deduplicating legacy codes and accounts within scope',async()=>{
  const uuid='00000000-0000-0000-0000-000000000001';
  const rows=[
    {emp_code:'Admin',emp_name:'Admin',branch_name:'Plant'},
    {emp_code:'EMP001',emp_name:'Admin',branch_name:'Plant'},
    {emp_code:'Admin',emp_name:'Branch Admin',branch_name:'Plant'},
    {emp_code:uuid,emp_name:'Operator',branch_name:'Plant'},
    {emp_code:'EMP003',emp_name:'Other branch',branch_name:'HQ'},
    {emp_code:'EMP004',emp_name:'Not approved',branch_name:'Plant',is_approved:false},
  ];
  const db={from:table=>({select:()=>({eq:(column,value)=>{
    if(table==='global_role_permissions')return {maybeSingle:async()=>({data:{permissions:{stages:[]}}})};
    assert.equal(table,'user_roles');assert.equal(column,'tenant_id');assert.equal(value,'tenant-a');
    return {limit:async()=>({data:rows})};
  }})})};
  const context={db,tenant:{id:'tenant-a',name:'Company A',branches:[{code:'TNT00001-B0001',name:'Plant'}]},branchCode:'TNT00001-B0001'};
  const {employees}=await leadLookups(context);
  assert.deepEqual(employees,[{code:'EMP001',name:'Admin'},{code:'Admin',name:'Branch Admin'},{code:'Operator',name:'Operator'}]);
  assert.equal(new Set(employees.map(employee=>employee.name)).size,employees.length);
  assert.equal(JSON.stringify(employees).includes(uuid),false);
  for(const employee of employees)await validateLeadChoices({assigned_to:employee.name},context);
  await assert.rejects(validateLeadChoices({assigned_to:'Other branch'},context),/outside the authorized scope/);
  await assert.rejects(validateLeadChoices({assigned_to:'Not approved'},context),/outside the authorized scope/);
});
