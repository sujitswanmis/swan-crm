import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeScope,authorizeKeyBranch,isMasterIdentity} from '../src/lib/integrations/access.js';
const directory=[{id:'tenant-a',code:'TNT00001',name:'Company A',status:'ACTIVE',branches:[{code:'TNT00001-B0001',name:'HQ'},{code:'TNT00001-B0002',name:'Plant'}]},{id:'tenant-b',code:'TNT00002',name:'Company B',status:'ACTIVE',branches:[{code:'TNT00002-B0001',name:'HQ'}]}];
test('tenant admin cannot cross tenants even when the requested branch looks valid',()=>{
  const base={directory,user:{email:'admin@example.com'},role:{role:'Admin',tenant_id:'tenant-a'}};
  assert.throws(()=>authorizeScope({...base,tenantCode:'TNT00002',branchCode:'TNT00002-B0001'}),/Tenant access denied/);
  assert.equal(authorizeScope({...base,tenantCode:'TNT00001'}).tenant.id,'tenant-a');
  assert.equal(isMasterIdentity(base.user,base.role),false);
});
test('ordinary Settings user stays within the verified assigned branch',()=>{
  const base={directory,user:{email:'manager@example.com'},role:{role:'manager',tenant_id:'tenant-a',branch_name:'Plant'}};
  assert.equal(authorizeScope(base).branchCode,'TNT00001-B0002');
  assert.throws(()=>authorizeScope({...base,branchCode:'TNT00001-B0001'}),/Branch access denied/);
  assert.throws(()=>authorizeScope({...base,role:{...base.role,branch_name:''}}),/authorized branches/);
});
test('tenant fallback never invents ownership from a default company or unknown identity',()=>{
  assert.throws(()=>authorizeScope({directory,user:{},role:{role:'admin',tenant_id:'missing',company:'Company A'},tenantCode:'TNT00001'}),/Tenant access denied/);
  assert.throws(()=>authorizeScope({directory,user:{},role:{role:'admin',company:'unknown'},tenantCode:'TNT00001'}),/Tenant access denied/);
});
test('branch keys cannot widen scope or request a different branch',()=>{
  assert.equal(authorizeKeyBranch({branch_code:'TNT00001-B0001'},null),'TNT00001-B0001');
  assert.throws(()=>authorizeKeyBranch({branch_code:'TNT00001-B0001'},'TNT00001-B0002'),/denied/);
  assert.throws(()=>authorizeKeyBranch({branch_code:null},'raw-uuid'),/Invalid/);
});
