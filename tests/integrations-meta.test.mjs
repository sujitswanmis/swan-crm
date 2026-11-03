import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {metaLeadRecord,parseMetaEvents,verifyMetaSignedRequest,completeMetaConnect} from '../src/lib/integrations/meta.js';
import {decryptSecret} from '../src/lib/integrations/security.js';
test('Meta custom answers and selected routing defaults survive lead mapping',()=>{
  const record=metaLeadRecord({id:'10',form_id:'20',ad_id:'30',field_data:[{name:'full_name',values:['Example']},{name:'phone_number',values:['9876543210']},{name:'product_interest',values:['Tractor']} ]},{mapping:{},defaults:{source:'Meta campaign',assigned_to:'Agent'}});
  assert.equal(record.name,'Example');assert.equal(record.source,'Meta campaign');assert.equal(record.assigned_to,'Agent');assert.match(record.requirement,/product_interest: Tractor/);
});
test('Meta notifications retain only validated lead, Page and form identifiers',()=>{
  const event={object:'page',entry:[{id:'123',changes:[{field:'leadgen',value:{page_id:'123',leadgen_id:'456',form_id:'789'}}]}]};
  assert.deepEqual(parseMetaEvents(event),[{page_id:'123',lead_id:'456',form_id:'789'}]);
  assert.throws(()=>parseMetaEvents({...event,entry:[{...event.entry[0],id:'999'}]}),/identifiers/);
});
test('Meta deauthorization accepts only signed, current, matching-algorithm requests',()=>{
  const now=1793428200000,body={algorithm:'HMAC-SHA256',user_id:'123',issued_at:now/1000};
  const payload=Buffer.from(JSON.stringify(body)).toString('base64url'),signature=createHmac('sha256','app-secret').update(payload).digest('base64url');
  assert.equal(verifyMetaSignedRequest(`${signature}.${payload}`,'app-secret',now).user_id,'123');
  assert.equal(verifyMetaSignedRequest(`${signature}.${payload}`,'wrong',now),null);
  assert.equal(verifyMetaSignedRequest(`${signature}.${payload}`,'app-secret',now+86401000),null);
});
test('Meta Page tokens are obtained using the long-lived exchange and stored encrypted',async()=>{
  const values={META_APP_ID:'123',META_APP_SECRET:'app-secret',META_GRAPH_API_VERSION:'v99.0',META_WEBHOOK_VERIFY_TOKEN:'verify',INTEGRATIONS_PUBLIC_ORIGIN:'https://crm.example.com',INTEGRATIONS_ENCRYPTION_KEY:'ab'.repeat(32)};
  const previous=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
  Object.assign(process.env,values);
  const calls=[];let saved,exchanges=0;
  const query={eq(){return this;},then(resolve,reject){return Promise.resolve({data:null}).then(resolve,reject);}};
  const context={tenant:{id:'tenant'},db:{from:()=>({update:value=>{saved=value;return query;}})}};
  try {
    await completeMetaConnect(context,{code:'CON_test'},'authorization-code',{request:async(path,token,options)=>{
      calls.push({path,token,options});
      if(path==='oauth/access_token')return ++exchanges===1?{access_token:'short-lived'}:{access_token:'long-lived',expires_in:5184000};
      if(path==='me')return {id:'123'};
      return {data:[{id:'456',name:'Page',access_token:'page-token'}]};
    }});
    assert.equal(new URLSearchParams(calls[1].options.body).get('grant_type'),'fb_exchange_token');
    assert.ok(calls.filter(call=>call.path!=='oauth/access_token').every(call=>call.token==='long-lived'));
    assert.equal(saved.credentials.includes('page-token'),false);
    assert.equal(decryptSecret(saved.credentials).pages['456'].token,'page-token');
    assert.equal(saved.status,'paused');
  }finally{for(const key of Object.keys(values))process.env[key]=previous[key] || '';}
});
