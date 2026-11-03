import { createHmac } from 'node:crypto';
import { IntegrationError, createSecret, encryptSecret, decryptSecret, hashSecret, safeRequest, safeEqual } from './security.js';
import { checked } from './store.js';
import { mapRecord, applyDefaults } from './connectors.js';

export function metaSetup() {
  return { ready:Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && /^v\d+\.\d+$/.test(process.env.META_GRAPH_API_VERSION || '') && process.env.META_WEBHOOK_VERIFY_TOKEN && process.env.INTEGRATIONS_PUBLIC_ORIGIN), version:process.env.META_GRAPH_API_VERSION || '' };
}
function metaConfig() {
  if(!metaSetup().ready) throw new IntegrationError('Complete Meta app, API version, webhook token and public origin configuration first.',503,'setup_required');
  const origin=new URL(process.env.INTEGRATIONS_PUBLIC_ORIGIN);
  if(origin.protocol!=='https:' || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash) throw new IntegrationError('Configure a public HTTPS origin for Meta.',503,'setup_required');
  return {version:process.env.META_GRAPH_API_VERSION,appId:process.env.META_APP_ID,secret:process.env.META_APP_SECRET,origin:origin.origin};
}
export async function metaRequest(path, token, { query = {}, method = 'GET', body } = {}) {
  const config=metaConfig();
  if(!/^(me(?:\/accounts)?|oauth\/access_token|\d+(?:\/(leadgen_forms|leads|subscribed_apps))?)$/.test(path)) throw new IntegrationError('Invalid Meta resource.');
  const headers=token?{Authorization:`Bearer ${token}`}:{'Content-Type':'application/x-www-form-urlencoded'};
  const proof=token?{appsecret_proof:createHmac('sha256',config.secret).update(token).digest('hex')}:{};
  const response=await safeRequest(`https://graph.facebook.com/${config.version}/${path}`,{method,headers,query:{...query,...proof},body});
  if(!response.ok || response.data?.error) {
    const errorCode=response.data?.error?.code;
    if([190,10,200].includes(errorCode)) throw new IntegrationError('Meta access expired or required permissions were removed. Reconnect this connection.',401,'meta_reconnect');
    if(response.status===429 || [4,17,32,613].includes(errorCode)) throw new IntegrationError('Meta rate limit reached; sync will retry.',429,'meta_rate_limited');
    throw new IntegrationError('Meta could not complete this request. Check Page access, selected forms and app permissions.',response.status>=500?502:422,'meta_request_failed');
  }
  if(!response.data) throw new IntegrationError('Meta returned an empty response.',502,'meta_empty_response');
  return response.data;
}
async function metaPages(token,request=metaRequest) {
  const pages=[]; let after;
  for(let count=0;count<5;count++) {
    const result=await request('me/accounts',token,{query:{fields:'id,name,access_token',limit:100,...(after?{after}:{})}});
    pages.push(...(result.data || []));
    after=result.paging?.next?result.paging?.cursors?.after:null;
    if(!after) return pages;
  }
  throw new IntegrationError('This account has more Pages than one connection supports. Use a Meta login configuration restricted to the required Pages.',422);
}
export async function beginMetaConnect(context,connection) {
  const config=metaConfig(), state=createSecret('oauth');
  checked(await context.db.from('integration_oauth_states').insert({state_hash:hashSecret(state),tenant_id:context.tenant.id,branch_code:context.branchCode,user_id:context.user.id,connection_code:connection.code,expires_at:new Date(Date.now()+5*60000).toISOString()}));
  const url=new URL(`https://www.facebook.com/${config.version}/dialog/oauth`);
  url.searchParams.set('client_id',config.appId);
  url.searchParams.set('redirect_uri',`${config.origin}/api/integrations/meta/callback`);
  url.searchParams.set('state',state); url.searchParams.set('response_type','code');
  if(process.env.META_LOGIN_CONFIG_ID) url.searchParams.set('config_id',process.env.META_LOGIN_CONFIG_ID);
  else url.searchParams.set('scope',process.env.META_OAUTH_SCOPES || 'pages_show_list,pages_read_engagement,pages_manage_metadata,leads_retrieval,ads_management');
  return url.toString();
}
export async function completeMetaConnect(context,connection,code,{request=metaRequest}={}) {
  const config=metaConfig();
  const body=new URLSearchParams({client_id:config.appId,client_secret:config.secret,redirect_uri:`${config.origin}/api/integrations/meta/callback`,code}).toString();
  const initial=await request('oauth/access_token',null,{method:'POST',body});
  if(typeof initial.access_token!=='string') throw new IntegrationError('Meta authorization did not return a token.',502);
  const exchange=new URLSearchParams({grant_type:'fb_exchange_token',client_id:config.appId,client_secret:config.secret,fb_exchange_token:initial.access_token}).toString();
  const result=await request('oauth/access_token',null,{method:'POST',body:exchange});
  if(typeof result.access_token!=='string') throw new IntegrationError('Meta did not return a long-lived token. Reconnect after verifying app access.',502);
  // Derive Page tokens from the long-lived user token, rather than a short-lived login token.
  const [identity,pages]=await Promise.all([request('me',result.access_token,{query:{fields:'id'}}),metaPages(result.access_token,request)]);
  const credentials={user_token:result.access_token,expires_at:result.expires_in?new Date(Date.now()+result.expires_in*1000).toISOString():null,pages:Object.fromEntries(pages.filter(page=>page.access_token).map(page=>[page.id,{name:page.name,token:page.access_token}]))};
  if(!Object.keys(credentials.pages).length) throw new IntegrationError('No authorized Pages were returned. Grant Page and lead access, then reconnect.',422);
  checked(await context.db.from('integration_connections').update({credentials:encryptSecret(credentials),provider_subject_hash:hashSecret(String(identity.id)),status:'paused',updated_at:new Date().toISOString()}).eq('tenant_id',context.tenant.id).eq('code',connection.code));
}
export async function metaAssets(connection,pageId) {
  if(!connection.credentials) return {pages:[],forms:[]};
  const credentials=decryptSecret(connection.credentials);
  const pages=Object.entries(credentials.pages || {}).map(([id,page])=>({id,name:page.name}));
  if(!pageId) return {pages,forms:[]};
  const page=credentials.pages?.[pageId];
  if(!page) throw new IntegrationError('Page was not granted to this connection.',403);
  const forms=[];let after;
  for(let count=0;count<5;count++) {
    const result=await metaRequest(`${pageId}/leadgen_forms`,page.token,{query:{fields:'id,name,status',limit:100,...(after?{after}:{})}});
    forms.push(...(result.data || []).map(form=>({id:form.id,name:form.name,status:form.status})));
    after=result.paging?.next?result.paging?.cursors?.after:null;
    if(!after) return {pages,forms};
  }
  throw new IntegrationError('This Page has more than 500 forms. Connect a Page with a smaller selected form set.',422);
}
export async function verifyMetaSelection(connection,config) {
  const assets=await metaAssets(connection,config.page_id);
  if(!config.page_id || !config.form_ids.length || config.form_ids.some(id=>!assets.forms.some(form=>form.id===id))) throw new IntegrationError('Select authorized Meta Page and forms before enabling sync.');
  const credentials=decryptSecret(connection.credentials);
  await metaRequest(`${config.page_id}/subscribed_apps`,credentials.pages[config.page_id].token,{method:'POST',body:{subscribed_fields:['leadgen']}});
}
export function metaLeadRecord(lead,config) {
  const fields={};
  for(const field of lead.field_data || []) {
    if(typeof field.name==='string' && !['__proto__','constructor','prototype'].includes(field.name)) fields[field.name]=(field.values || []).map(String).join(', ');
  }
  const defaults={name:fields.full_name || [fields.first_name,fields.last_name].filter(Boolean).join(' '),phone:fields.phone_number || fields.phone,email:fields.email,company:fields.company_name || fields.company};
  const mapped=Object.keys(config.mapping || {}).length?mapRecord(fields,config.mapping):Object.fromEntries(Object.entries(defaults).filter(([,value])=>value));
  const used=new Set(Object.values(config.mapping || {}));
  const extra=Object.entries(fields).filter(([key])=>!used.has(key)&&!['full_name','first_name','last_name','phone_number','phone','email','company','company_name'].includes(key)).map(([key,value])=>`${key}: ${value}`).join('\n');
  if(extra) mapped.requirement=[mapped.requirement,extra].filter(Boolean).join('\n').slice(0,4000);
  mapped.source ||= config.defaults?.source || 'Facebook';
  mapped.source_name ||= config.defaults?.source_name || `Meta form ${lead.form_id || ''}${lead.ad_id?` · Ad ${lead.ad_id}`:''}`;
  return applyDefaults(mapped,config);
}
export async function fetchMetaLead(connection,payload) {
  const config=connection.config,credentials=decryptSecret(connection.credentials);
  if(payload.page_id!==config.page_id || !config.form_ids.includes(payload.form_id)) throw new IntegrationError('Meta form is outside this connection.',403,'scope_denied');
  const token=credentials.pages?.[config.page_id]?.token;
  if(!token) throw new IntegrationError('Reconnect the Meta Page.',401,'meta_reconnect');
  const lead=await metaRequest(payload.lead_id,token,{query:{fields:'id,created_time,ad_id,form_id,field_data'}});
  if(String(lead.id)!==payload.lead_id || String(lead.form_id)!==payload.form_id) throw new IntegrationError('Meta lead ownership could not be verified.',403,'scope_denied');
  return {record:metaLeadRecord(lead,config),metadata:{provider:'meta',lead_id:lead.id,page_id:config.page_id,form_id:lead.form_id,ad_id:lead.ad_id || null,submitted_at:lead.created_time}};
}
export async function syncMetaPage(context,connection,payload,enqueue) {
  const config=connection.config,token=decryptSecret(connection.credentials).pages?.[config.page_id]?.token;
  if(!token || !config.form_ids.includes(payload.form_id)) throw new IntegrationError('Meta form access is unavailable.',401,'meta_reconnect');
  const filtering=JSON.stringify([{field:'time_created',operator:'GREATER_THAN',value:payload.since}]);
  const result=await metaRequest(`${payload.form_id}/leads`,token,{query:{fields:'id,form_id',limit:50,filtering,...(payload.after?{after:payload.after}:{})}});
  const rows=result.data || [];
  await enqueue(context,connection,rows.map(row=>({kind:'meta_lead',dedupe:`meta:${connection.code}:${row.id}`,payload:{lead_id:String(row.id),form_id:payload.form_id,page_id:config.page_id}})));
  const after=result.paging?.next?result.paging?.cursors?.after:null;
  if(after) await enqueue(context,connection,[{kind:'meta_sync',dedupe:`sync:${connection.code}:${payload.form_id}:${payload.since}:${hashSecret(after)}`,payload:{...payload,after}}]);
  return {record_count:rows.length,has_more:Boolean(after)};
}
export function parseMetaEvents(body) {
  if(body.object!=='page' || !Array.isArray(body.entry) || body.entry.length>100) throw new IntegrationError('Invalid Meta event payload.');
  const events=[];
  for(const entry of body.entry) {
    if(!Array.isArray(entry.changes)||entry.changes.length>100) throw new IntegrationError('Invalid Meta changes.');
    for(const change of entry.changes) if(change.field==='leadgen') {
      const value=change.value || {};
      const event={lead_id:String(value.leadgen_id || ''),page_id:String(value.page_id || entry.id || ''),form_id:String(value.form_id || '')};
      if(Object.values(event).some(id=>!/^\d{1,30}$/.test(id))||event.page_id!==String(entry.id)) throw new IntegrationError('Invalid Meta lead identifiers.');
      events.push(event);
      if(events.length>100) throw new IntegrationError('Too many Meta events.',413);
    }
  }
  return events;
}
export function verifyMetaSignedRequest(value,secret,now=Date.now()) {
  if(typeof value!=='string' || value.length>10000 || !secret) return null;
  const parts=value.split('.');
  if(parts.length!==2) return null;
  const [signature,payload]=parts;
  const expected=createHmac('sha256',secret).update(payload).digest('base64url');
  if(!safeEqual(signature,expected)) return null;
  try {
    const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    if(data.algorithm!=='HMAC-SHA256'||!/^\d{1,30}$/.test(String(data.user_id))||!Number.isFinite(data.issued_at)||Math.abs(now/1000-data.issued_at)>86400) return null;
    return data;
  } catch{return null;}
}
