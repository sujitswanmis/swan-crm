import { LEAD_FIELDS, LEAD_EVENTS, integrationTimestamp } from '../../config/integrationsConfig.js';
import { IntegrationError, decryptSecret, encryptSecret, hashSecret, safeRequest, signPayload, validateDestination } from './security.js';
import { checked } from './store.js';
import { publicLead } from './leadAdapter.js';

const unsafePart = part => ['__proto__','prototype','constructor'].includes(part);
export function readPath(value, path = '') {
  if (!path) return value;
  const parts=String(path).split('.');
  if (parts.length>8 || parts.some(part=>!/^\w+$/.test(part)||unsafePart(part))) throw new IntegrationError('Use simple dot-separated field paths.');
  let result=value;
  for(const part of parts) result=result !== null && typeof result==='object' && Object.hasOwn(result,part) ? result[part] : undefined;
  return result;
}
export function validateMapping(mapping, incoming = true) {
  if (!mapping || typeof mapping!=='object' || Array.isArray(mapping) || Object.keys(mapping).length>40) throw new IntegrationError('Field mapping must be a JSON object with at most 40 fields.');
  for(const [key,value] of Object.entries(mapping)) {
    if (unsafePart(key)||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || (incoming && ![...LEAD_FIELDS,'external_id'].includes(key))) throw new IntegrationError('Mapping contains an unsupported destination field.');
    if(typeof value!=='string' || value.length>120 || !value) throw new IntegrationError('Mapping values must be source field paths.');
    readPath({},value);
  }
  return mapping;
}
export function mapRecord(record, mapping = {}) {
  if (!record || typeof record!=='object' || Array.isArray(record)) throw new IntegrationError('Each source record must be an object.');
  const mapped=Object.create(null);
  for(const [key,path] of Object.entries(mapping)) {
    const value=readPath(record,path);
    if(value !== undefined && value !== null) {
      if(typeof value==='object') throw new IntegrationError('Map individual scalar fields, not nested objects.');
      mapped[key]=String(value);
    }
  }
  return mapped;
}
export function applyDefaults(record, config) {
  const result={...record};
  for(const key of ['source','source_name','status','assigned_to']) if(!result[key] && config.defaults?.[key]) result[key]=config.defaults[key];
  return result;
}
export async function validateConnectionConfig(type, config = {}) {
  if(!config || typeof config!=='object' || Array.isArray(config)) throw new IntegrationError('Connection configuration is invalid.');
  const result={ mapping:validateMapping(config.mapping || {},type!=='outgoing'), defaults:{} };
  for(const key of ['source','source_name','status','assigned_to']) if(config.defaults?.[key]) result.defaults[key]=String(config.defaults[key]).slice(0,250);
  if(['external','outgoing'].includes(type)) {
    await validateDestination(config.url);
    result.url=new URL(config.url).toString();
    result.method=String(config.method || (type==='outgoing'?'POST':'GET')).toUpperCase();
    if(!(['GET','POST','PATCH'].includes(result.method)) || (type==='outgoing'&&result.method==='GET')) throw new IntegrationError('Select a supported HTTP method.');
    result.auth_type=['none','bearer','api_key','basic'].includes(config.auth_type)?config.auth_type:'none';
    result.auth_header=config.auth_header || 'X-API-Key';
    if(!/^[A-Za-z0-9-]{1,60}$/.test(result.auth_header)||/^(host|cookie|connection|content-length|transfer-encoding)$/i.test(result.auth_header)) throw new IntegrationError('Unsupported authentication header.');
  }
  if(type==='external') {
    result.direction=config.direction==='push'?'push':'pull';
    if(result.direction==='pull'&&result.method!=='GET') throw new IntegrationError('Pull connections use GET.');
    if(result.direction==='push'&&result.method==='GET') throw new IntegrationError('Push connections use POST or PATCH.');
    result.records_path=config.records_path===undefined?'data':String(config.records_path); readPath({},result.records_path);
    result.next_cursor_path=String(config.next_cursor_path || ''); if(result.next_cursor_path) readPath({},result.next_cursor_path);
    result.cursor_parameter=String(config.cursor_parameter || 'cursor');
    if(!/^[A-Za-z][A-Za-z0-9_]{0,50}$/.test(result.cursor_parameter)) throw new IntegrationError('Invalid cursor parameter.');
    result.query=config.query || {};
    if(typeof result.query!=='object'||Array.isArray(result.query)||Object.keys(result.query).length>20) throw new IntegrationError('Query parameters must be an object.');
    for(const [key,value] of Object.entries(result.query)) if(!/^[A-Za-z][A-Za-z0-9_]{0,50}$/.test(key)||/token|secret|password|api.?key/i.test(key)||!['string','number','boolean'].includes(typeof value)||String(value).length>250) throw new IntegrationError('Use non-secret scalar query parameters.');
    result.request_mapping=validateMapping(config.request_mapping || {},false);
    result.sync_interval_minutes=Math.min(1440,Math.max(5,Number.parseInt(config.sync_interval_minutes || '15',10)));
    if(!Number.isFinite(result.sync_interval_minutes)) throw new IntegrationError('Enter a valid sync interval.');
  }
  if(type==='incoming') result.auth_mode=config.auth_mode==='bearer'?'bearer':'hmac';
  if(type==='outgoing') {
    result.events=Array.isArray(config.events)?config.events.filter(event=>LEAD_EVENTS.includes(event)):[];
    if(!result.events.length) throw new IntegrationError('Select at least one outgoing event.');
  }
  if(type==='meta') {
    result.page_id=String(config.page_id || '');
    result.form_ids=[...new Set(Array.isArray(config.form_ids)?config.form_ids.map(String):[])];
    if((result.page_id&&!/^\d{1,30}$/.test(result.page_id))||result.form_ids.length>50||result.form_ids.some(id=>!/^\d{1,30}$/.test(id))) throw new IntegrationError('Select valid Meta Page and form IDs.');
    result.sync_interval_minutes=Math.min(1440,Math.max(15,Number.parseInt(config.sync_interval_minutes || '60',10)));
    if(!Number.isFinite(result.sync_interval_minutes)) throw new IntegrationError('Enter a valid sync interval.');
  }
  return result;
}
export function authHeaders(connection) {
  const credentials=connection.credentials?decryptSecret(connection.credentials):{};
  const config=connection.config;
  if(config.auth_type==='bearer') return {Authorization:`Bearer ${credentials.token || ''}`};
  if(config.auth_type==='api_key') return {[config.auth_header]:credentials.token || ''};
  if(config.auth_type==='basic') return {Authorization:`Basic ${Buffer.from(`${credentials.username || ''}:${credentials.password || ''}`).toString('base64')}`};
  return {};
}
export async function pullExternal(context, connection, enqueue) {
  const config=connection.config;
  const response=await safeRequest(config.url,{headers:authHeaders(connection),query:{...config.query,...(config.cursor?{[config.cursor_parameter]:config.cursor}:{})}});
  if(!response.ok) throw new IntegrationError('External pull failed.',502,`http_${response.status}`);
  const records=readPath(response.data,config.records_path);
  if(!Array.isArray(records)||records.length>100) throw new IntegrationError('External response must contain at most 100 records per page.',422,'invalid_source_page');
  const jobs=records.map(record=>{
    const data=applyDefaults(mapRecord(record,config.mapping),config);
    const externalId=data.external_id || hashSecret(JSON.stringify(record));
    return {kind:'incoming',dedupe:`pull:${connection.code}:${hashSecret(String(externalId))}`,payload:{record:encryptSecret(data)}};
  });
  await enqueue(context,connection,jobs);
  const cursor=config.next_cursor_path?readPath(response.data,config.next_cursor_path):null;
  if(cursor!==undefined && cursor!==null && (typeof cursor==='object'||String(cursor).length>500)) throw new IntegrationError('Invalid source pagination cursor.',422);
  checked(await context.db.from('integration_connections').update({config:{...config,cursor:cursor?String(cursor):null},last_run_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('code',connection.code).eq('tenant_id',context.tenant.id).eq('updated_at',connection.updated_at));
  return {record_count:records.length,has_more:Boolean(cursor)};
}
export async function deliverOutgoing(context, connection, event) {
  const secret=decryptSecret(connection.credentials).webhook_secret;
  if(!secret) throw new IntegrationError('Outgoing signing secret is missing.',503,'setup_required');
  const data=publicLead(event.payload.data || {},context.tenant.code,event.branch_code);
  const envelope={event_id:event.code,event_type:event.event_type,occurred_at:integrationTimestamp(event.occurred_at),tenant_code:context.tenant.code,branch_code:event.branch_code,data};
  const body=JSON.stringify(Object.keys(connection.config.mapping || {}).length?mapRecord(envelope,connection.config.mapping):envelope);
  const timestamp=String(Math.floor(Date.now()/1000));
  const response=await safeRequest(connection.config.url,{method:connection.config.method,headers:{...authHeaders(connection),'X-Integration-Event-Id':event.code,'X-Integration-Timestamp':timestamp,'X-Integration-Signature':signPayload(secret,body,timestamp)},body});
  if(!response.ok) throw new IntegrationError('Webhook delivery failed.',502,`http_${response.status}`);
  return {http_status:response.status};
}
