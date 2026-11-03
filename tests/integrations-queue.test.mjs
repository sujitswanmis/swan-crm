import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {connectionContext,enqueueJobs,retryableJobError} from '../src/lib/integrations/queue.js';
import {IntegrationError} from '../src/lib/integrations/security.js';
import {INTEGRATION_FEATURES} from '../src/config/integrationsConfig.js';
test('queued jobs bind to the connection tenant/branch and cannot widen scope',async()=>{
  const context={tenant:{id:'tenant-a'},branchCode:'TNT00001-B0001'};
  assert.throws(()=>connectionContext(context,{tenant_id:'tenant-b'}),/denied/);
  assert.throws(()=>connectionContext(context,{tenant_id:'tenant-a',branch_code:'TNT00001-B0002'}),/denied/);
  let inserted;
  const db={from:()=>({upsert:async(rows,options)=>{inserted={rows,options};return {data:null};}})};
  await enqueueJobs({...context,db},{tenant_id:'tenant-a',branch_code:null,code:'CON_test'},[{kind:'incoming',dedupe:'stable-event',payload:{record:'ciphertext'}}]);
  assert.equal(inserted.rows[0].tenant_id,'tenant-a');assert.equal(inserted.rows[0].branch_code,'TNT00001-B0001');assert.equal(inserted.options.ignoreDuplicates,true);
});

test('isolated PostgreSQL migrations, atomic writes, branch isolation, leases and permissions', {skip:!process.env.INTEGRATION_SQL_TEST_MODULE}, async t=>{
  const {PGlite}=await import(pathToFileURL(process.env.INTEGRATION_SQL_TEST_MODULE).href);
  const db=new PGlite();
  const tenantA='00000000-0000-0000-0000-000000000001',tenantB='00000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE tenants(id uuid PRIMARY KEY,name text,tenant_code text,status text DEFAULT 'ACTIVE');
      CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,lead_ref_id varchar(20),lead_date date,name text CHECK(name<>'reject_atomic'),phone text,business_contact_1 text,email text,company text,our_company text,city_name text,district_name text,state_name text,address text,pin_code text,requirement text,source text,source_name text,priority text,status text,assigned_to text,created_by text,entry_by text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      INSERT INTO tenants(id,name,tenant_code) VALUES('${tenantA}','A','TNT00001'),('${tenantB}','B','TNT00002');`);
    for(const filename of ['20261031_integrations_core.sql','20261031_integrations_lead_events.sql','20261031_integrations_scheduler.sql','20261101_integrations_tenant_access.sql']) {
      const sql=await readFile(new URL('../migrations/'+filename,import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
    }
    const write=(tenant,branch,payload,identity,hash,code=null)=>db.query('SELECT integration_write_lead($1::uuid,$2,$3,$4::jsonb,$5,$6,$7,$8,$9::jsonb) AS result',[tenant,branch,'API',JSON.stringify(payload),identity,hash,code,'Company','{}']).then(result=>result.rows[0].result);
    const allFeatures=Object.fromEntries(INTEGRATION_FEATURES.map(feature=>[feature.id,true]));
    const policy=async(tenant,code,enabled=true,branch=null,features=allFeatures,inherit=false)=>{
      const revision=(await db.query('SELECT revision FROM integration_tenant_policies WHERE tenant_id=$1::uuid',[tenant])).rows[0]?.revision || 0;
      return db.query('SELECT integration_set_tenant_policy($1::uuid,$2,$3,$4::jsonb,$5,$6::bigint)',[tenant,code,branch,JSON.stringify(inherit?{inherit:true}:{enabled,features}),'Master Admin',revision]);
    };
    await t.test('new tenants are off and cannot write before Master Admin activation',async()=>{
      await assert.rejects(write(tenantA,null,{name:'Blocked'},'off-write','off-hash'),/tenant_integration_disabled/);
      assert.equal((await db.query('SELECT count(*)::integer AS n FROM leads')).rows[0].n,0);
    });
    await policy(tenantA,'TNT00001');await policy(tenantB,'TNT00002');
    const payload={name:'Example',phone:'9876543210',status:'1;01>New Stage>New Lead',source:'Website'};
    const first=await write(tenantA,'TNT00001-B0001',payload,'request-one','hash-one');
    await t.test('same request replays once and conflicting bodies fail without a second lead',async()=>{
      assert.equal(first.status,'created');assert.deepEqual(await write(tenantA,'TNT00001-B0001',payload,'request-one','hash-one'),first);
      assert.ok(first.data.lead_ref_id.length<=20);
      assert.equal((await db.query("SELECT lead_date=timezone('Asia/Kolkata',now())::date AS ist FROM leads LIMIT 1")).rows[0].ist,true);
      await assert.rejects(write(tenantA,'TNT00001-B0001',{...payload,name:'Changed'},'request-one','hash-changed'),/idempotency_conflict/);
      assert.equal((await db.query('SELECT count(*)::integer AS n FROM leads')).rows[0].n,1);
    });
    await t.test('same phone in another tenant or branch cannot update the first lead',async()=>{
      const other=await write(tenantB,'TNT00002-B0001',{...payload,name:'Other tenant'},'request-two','hash-two');
      assert.equal(other.status,'created');assert.notEqual(other.data.lead_ref_id,first.data.lead_ref_id);
      const branch2=await write(tenantA,'TNT00001-B0002',{...payload,name:'Other branch'},'request-three','hash-three');assert.equal(branch2.status,'created');
      await assert.rejects(write(tenantA,'TNT00001-B0002',{name:'Overwrite'},'wrong-branch','hash-four',first.data.lead_ref_id),/lead_not_found/);
      const listed=(await db.query('SELECT integration_list_branch_leads($1::uuid,$2) AS result',[tenantA,'TNT00001-B0001'])).rows[0].result;
      assert.equal(listed.total,1);assert.equal(listed.rows[0].name,'Example');
    });
    await t.test('duplicate contact preserves the employee record and failed insert rolls back receipts',async()=>{
      await db.query('UPDATE leads SET phone=$1 WHERE tenant_id=$2::uuid AND lead_ref_id=$3',['+91 98765 43210',tenantA,first.data.lead_ref_id]);
      const duplicate=await write(tenantA,'TNT00001-B0001',{...payload,name:'Do not overwrite'},'new-delivery','new-hash');assert.equal(duplicate.status,'duplicate');assert.equal(duplicate.data.name,'Example');
      await assert.rejects(write(tenantA,'TNT00001-B0001',{name:'reject_atomic'},'failed-write','fail-hash'),/check constraint/);
      assert.equal((await db.query("SELECT count(*)::integer AS n FROM integration_jobs WHERE dedupe_key='write:failed-write'")).rows[0].n,0);
    });
    await t.test('no browser role can read integration tables or execute privileged RPCs',async()=>{
      const permissions=(await db.query("SELECT has_table_privilege('anon','integration_api_keys','SELECT') AS anon_read,has_table_privilege('authenticated','integration_connections','SELECT') AS browser_read,has_function_privilege('anon','integration_claim_jobs(integer)','EXECUTE') AS anon_rpc")).rows[0];
      assert.deepEqual(permissions,{anon_read:false,browser_read:false,anon_rpc:false});
      assert.equal((await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='crm_integrations_lead_events'")).rows[0].tgenabled,'D');
    });
    await t.test('atomic rate limits reset the window without accumulating history rows',async()=>{
      for(const expected of [true,true,false]) assert.equal((await db.query("SELECT integration_take_rate_limit('tenant:test',2) AS allowed")).rows[0].allowed,expected);
      await db.query("UPDATE integration_rate_limits SET period=now()-interval '2 minutes' WHERE identity='tenant:test'");
      assert.equal((await db.query("SELECT integration_take_rate_limit('tenant:test',2) AS allowed")).rows[0].allowed,true);
      assert.equal((await db.query("SELECT count(*)::integer AS n FROM integration_rate_limits WHERE identity='tenant:test'")).rows[0].n,1);
    });
    await t.test('event fanout is branch-scoped, repeatable and protected by processing leases',async()=>{
      await db.query("INSERT INTO integration_connections(code,tenant_id,branch_code,name,type,status,config) VALUES('CON_A',$1::uuid,'TNT00001-B0001','A','outgoing','enabled',$2::jsonb),('CON_B',$1::uuid,'TNT00001-B0002','B','outgoing','enabled',$2::jsonb)",[tenantA,JSON.stringify({events:['lead.created']})]);
      await write(tenantA,'TNT00001-B0001',{...payload,phone:'9988776655'},'outgoing-event','outgoing-hash');
      await db.query('SELECT integration_dispatch_events(50)');await db.query('SELECT integration_dispatch_events(50)');
      const deliveries=(await db.query("SELECT * FROM integration_jobs WHERE kind='delivery'")).rows;
      assert.ok(deliveries.length>=1);assert.ok(deliveries.every(job=>job.connection_code==='CON_A'&&job.branch_code==='TNT00001-B0001'));
      const claimed=(await db.query('SELECT * FROM integration_claim_jobs(1)')).rows[0];assert.equal(claimed.attempts,1);
      await db.query("UPDATE integration_jobs SET lease_until=now()-interval '1 second' WHERE id=$1::uuid",[claimed.id]);
      const reclaimed=(await db.query('SELECT * FROM integration_claim_jobs(1)')).rows[0];assert.equal(reclaimed.id,claimed.id);assert.notEqual(reclaimed.lease_token,claimed.lease_token);
      const finish=(token)=>db.query('SELECT integration_finish_job($1::uuid,$2::uuid,true,$3::jsonb,NULL) AS accepted',[claimed.id,token,'{}']);
      assert.equal((await finish(claimed.lease_token)).rows[0].accepted,false);assert.equal((await finish(reclaimed.lease_token)).rows[0].accepted,true);
    });
    await t.test('key rotation revokes the old key atomically and preserves branch scope',async()=>{
      const row={code:'KEY_A',tenant_id:tenantA,branch_code:'TNT00001-B0001',name:'ERP',key_hash:'hash-a',key_prefix:'crm_a',scopes:['leads:read'],expires_at:'2027-01-01T00:00:00+05:30',requests_per_minute:120};
      await db.query('SELECT integration_create_key($1::jsonb,$2)',[JSON.stringify(row),'Admin']);
      await assert.rejects(db.query('SELECT integration_create_key($1::jsonb,$2,$3)',[JSON.stringify({...row,code:'KEY_WRONG',key_hash:'wrong',branch_code:'TNT00001-B0002'}),'Admin','KEY_A']),/key_unavailable/);
      assert.equal((await db.query("SELECT revoked_at FROM integration_api_keys WHERE code='KEY_A'")).rows[0].revoked_at,null);
      await db.query('SELECT integration_create_key($1::jsonb,$2,$3)',[JSON.stringify({...row,code:'KEY_B',key_hash:'hash-b'}),'Admin','KEY_A']);
      assert.ok((await db.query("SELECT revoked_at FROM integration_api_keys WHERE code='KEY_A'")).rows[0].revoked_at);
      await assert.rejects(db.query('SELECT integration_revoke_key($1::uuid,$2,$3,$4)',[tenantA,'TNT00001-B0002','KEY_B','Admin']),/key_unavailable/);
      assert.equal((await db.query("SELECT revoked_at FROM integration_api_keys WHERE code='KEY_B'")).rows[0].revoked_at,null);
      await db.query('SELECT integration_revoke_key($1::uuid,$2,$3,$4)',[tenantA,'TNT00001-B0001','KEY_B','Admin']);
      assert.equal((await db.query("SELECT count(*)::integer AS n FROM integration_audit_logs WHERE operation='key_revoked' AND resource_code='KEY_B'")).rows[0].n,1);
    });
    await t.test('failed job retry and its audit record change atomically within scope',async()=>{
      await db.query("INSERT INTO integration_jobs(code,tenant_id,branch_code,kind,dedupe_key,status,attempts) VALUES('JOB_retry',$1::uuid,'TNT00001-B0001','incoming','retry-test','failed',6)",[tenantA]);
      await assert.rejects(db.query('SELECT integration_retry_job($1::uuid,$2,$3,$4)',[tenantA,'TNT00001-B0002','JOB_retry','Admin']),/job_unavailable/);
      assert.equal((await db.query("SELECT count(*)::integer AS n FROM integration_audit_logs WHERE operation='job_retry' AND resource_code='JOB_retry'")).rows[0].n,0);
      await db.query('SELECT integration_retry_job($1::uuid,$2,$3,$4)',[tenantA,'TNT00001-B0001','JOB_retry','Admin']);
      assert.deepEqual((await db.query("SELECT status,attempts FROM integration_jobs WHERE code='JOB_retry'")).rows[0],{status:'pending',attempts:0});
      assert.equal((await db.query("SELECT count(*)::integer AS n FROM integration_audit_logs WHERE operation='job_retry' AND resource_code='JOB_retry'")).rows[0].n,1);
    });
    await t.test('overlapping Meta forms cannot be activated for a second tenant',async()=>{
      const row={code:'CON_META_A',tenant_id:tenantA,branch_code:'TNT00001-B0001',name:'Meta A',type:'meta',status:'enabled',config:{page_id:'123',form_ids:['456']},credentials:'encrypted'};
      await db.query('SELECT integration_save_connection($1::jsonb,$2)',[JSON.stringify(row),'Admin']);
      await assert.rejects(db.query('SELECT integration_save_connection($1::jsonb,$2)',[JSON.stringify({...row,code:'CON_META_B',tenant_id:tenantB,branch_code:'TNT00002-B0001'}),'Admin']),/meta_form_already_mapped/);
    });
    await t.test('policy changes are revision checked, audited and tenant-scoped',async()=>{
      const revision=(await db.query('SELECT revision FROM integration_tenant_policies WHERE tenant_id=$1::uuid',[tenantA])).rows[0].revision;
      await assert.rejects(db.query('SELECT integration_set_tenant_policy($1::uuid,$2,$3,$4::jsonb,$5,$6::bigint)',[tenantA,'TNT00001','TNT00002-B0001',JSON.stringify({enabled:true,features:allFeatures}),'Master Admin',revision]),/scope_denied/);
      await assert.rejects(db.query('SELECT integration_set_tenant_policy($1::uuid,$2,NULL,$3::jsonb,$4,0)',[tenantA,'TNT00001',JSON.stringify({enabled:false,features:allFeatures}),'Master Admin']),/configuration_changed/);
      assert.ok((await db.query("SELECT count(*)::integer AS n FROM integration_audit_logs WHERE operation='tenant_access_changed'")).rows[0].n>=2);
    });
    await t.test('Meta imports use their own feature permission independently of API Write',async()=>{
      await policy(tenantA,'TNT00001',true,null,{...allFeatures,api_write:false});
      await assert.rejects(write(tenantA,'TNT00001-B0001',{name:'No API write'},'write-disabled','hash'),/tenant_integration_disabled/);
      const result=await db.query("SELECT integration_write_lead($1::uuid,'TNT00001-B0001','CON_META_A',$2::jsonb,'meta-import','meta-hash') AS result",[tenantA,JSON.stringify({name:'Meta import'})]);
      assert.equal(result.rows[0].result.status,'created');
      await policy(tenantA,'TNT00001');
    });
    await t.test('company OFF blocks an existing key scope and preserves queued jobs without attempts',async()=>{
      await db.query("INSERT INTO integration_jobs(code,tenant_id,branch_code,connection_code,kind,dedupe_key,status,payload) VALUES('JOB_policy',$1::uuid,'TNT00001-B0001','CON_A','delivery','policy-pause','pending','{}')",[tenantA]);
      await policy(tenantA,'TNT00001',false);
      assert.equal((await db.query("SELECT integration_policy_allows($1::uuid,'TNT00001-B0001','api_read') AS allowed",[tenantA])).rows[0].allowed,false);
      assert.equal((await db.query('SELECT * FROM integration_claim_jobs(5)')).rows.some(job=>job.code==='JOB_policy'),false);
      assert.deepEqual((await db.query("SELECT status,attempts FROM integration_jobs WHERE code='JOB_policy'")).rows[0],{status:'pending',attempts:0});
      await assert.rejects(write(tenantA,'TNT00001-B0001',{name:'Still blocked'},'off-again','hash'),/tenant_integration_disabled/);
      assert.equal((await db.query("SELECT count(*)::integer AS n FROM integration_api_keys WHERE code='KEY_B'")).rows[0].n,1);
    });
    await t.test('branch restrictions cannot be bypassed by company-wide scope or another tenant',async()=>{
      await policy(tenantA,'TNT00001');
      await policy(tenantA,'TNT00001',false,'TNT00001-B0001');
      for(const branch of [null,'TNT00001-B0001'])assert.equal((await db.query("SELECT integration_policy_allows($1::uuid,$2,'api_read') AS allowed",[tenantA,branch])).rows[0].allowed,false);
      assert.equal((await db.query("SELECT integration_policy_allows($1::uuid,'TNT00001-B0002','api_read') AS allowed",[tenantA])).rows[0].allowed,true);
      assert.equal((await db.query("SELECT integration_policy_allows($1::uuid,'TNT00002-B0001','api_read') AS allowed",[tenantB])).rows[0].allowed,true);
      await policy(tenantA,'TNT00001',true,'TNT00001-B0001',allFeatures,true);
      await policy(tenantA,'TNT00001',true,'TNT00001-B0002',{...allFeatures,outgoing:false});
      assert.equal((await db.query("SELECT integration_policy_allows($1::uuid,NULL,'outgoing') AS allowed",[tenantA])).rows[0].allowed,false);
      assert.equal((await db.query("SELECT integration_policy_allows($1::uuid,NULL,'api_read') AS allowed",[tenantA])).rows[0].allowed,true);
      await policy(tenantA,'TNT00001',true,'TNT00001-B0002',allFeatures,true);
    });
    await t.test('a policy change after claim releases a job without consuming a retry and ON resumes it',async()=>{
      const claimed=(await db.query('SELECT * FROM integration_claim_jobs(5)')).rows.find(job=>job.code==='JOB_policy');
      assert.ok(claimed);await policy(tenantA,'TNT00001',false);
      assert.equal((await db.query('SELECT integration_release_paused_job($1::uuid,$2::uuid) AS released',[claimed.id,claimed.lease_token])).rows[0].released,true);
      assert.deepEqual((await db.query("SELECT status,attempts,lease_token FROM integration_jobs WHERE code='JOB_policy'")).rows[0],{status:'pending',attempts:0,lease_token:null});
      await policy(tenantA,'TNT00001');
      await db.query("UPDATE integration_jobs SET available_at=now() WHERE code='JOB_policy'");
      assert.ok((await db.query('SELECT * FROM integration_claim_jobs(5)')).rows.find(job=>job.code==='JOB_policy'));
    });
    await t.test('browser roles cannot edit policies and service_role cannot bypass the guarded writer',async()=>{
      for(const role of ['anon','authenticated']) {
        await db.exec('SET ROLE '+role);
        try {
          await assert.rejects(db.query('SELECT * FROM integration_tenant_policies'),/permission denied/);
          await assert.rejects(db.query("SELECT integration_set_tenant_policy($1::uuid,'TNT00001',NULL,$2::jsonb,'forged',1)",[tenantA,JSON.stringify({enabled:true,features:allFeatures})]),/permission denied/);
        } finally {await db.exec('RESET ROLE');}
      }
      await db.exec('SET ROLE service_role');
      try {await assert.rejects(db.query("SELECT integration_write_lead_base($1::uuid,NULL,'API','{}'::jsonb,'bypass','hash')",[tenantA]),/permission denied/);}
      finally {await db.exec('RESET ROLE');}
    });
  } finally {await db.close();}
});
test('permanent scope errors stop retries while timeouts and rate limits remain retryable',()=>{
  assert.equal(retryableJobError(new IntegrationError('forbidden',403)),false);
  assert.equal(retryableJobError(new IntegrationError('rate limited',429)),true);
  assert.equal(retryableJobError(new IntegrationError('timeout',504)),true);
});
test('database queue uses leases and locked atomic receipts; optional lead trigger starts disabled',async()=>{
  const core=await readFile(new URL('../migrations/20261031_integrations_core.sql',import.meta.url),'utf8');
  const events=await readFile(new URL('../migrations/20261031_integrations_lead_events.sql',import.meta.url),'utf8');
  assert.match(core,/FOR UPDATE SKIP LOCKED/);assert.match(core,/lease_token=p_lease/);assert.match(core,/pg_advisory_xact_lock/);assert.match(core,/idempotency_conflict/);
  assert.match(events,/DISABLE TRIGGER crm_integrations_lead_events/);assert.match(events,/EXCEPTION WHEN OTHERS/);
  assert.doesNotMatch(events,/net\.http|fetch\(/);assert.doesNotMatch(core,/\bDROP\s+(TABLE|COLUMN|TRIGGER)\b/i);
});
