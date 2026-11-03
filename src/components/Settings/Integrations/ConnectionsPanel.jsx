'use client';
import React,{useMemo,useState} from 'react';
import {formatIntegrationTime,LEAD_EVENTS} from '@/config/integrationsConfig';
import IntegrationTable from './IntegrationTable';
import MappingEditor,{Button,Field,Notice,inputStyle,panelStyle,gridStyle} from './MappingEditor';

const emptyForm=()=>({name:'',status:'paused',url:'',method:'GET',direction:'pull',auth_type:'none',auth_header:'X-API-Key',auth_mode:'hmac',records_path:'data',next_cursor_path:'',cursor_parameter:'cursor',sync_interval_minutes:15,events:['lead.created'],defaults:{},mapping:'{"name":"name","phone":"phone","email":"email","requirement":"requirement","external_id":"id"}',query:'{}',request_mapping:'{}',token:'',username:'',password:''});
export function ConnectionEditor({type='external',scope,scopeKey,bootstrap,canManage,onAction,loadRows,refreshKey}) {
  const [form,setForm]=useState(()=>({...emptyForm(),method:type==='outgoing'?'POST':'GET',mapping:type==='outgoing'?'{}':emptyForm().mapping}));
  const [editing,setEditing]=useState(null),[error,setError]=useState(''),[rotate,setRotate]=useState(null),[leadCode,setLeadCode]=useState(''),[copied,setCopied]=useState('');
  const title={external:'External API connection',incoming:'Incoming webhook',outgoing:'Outgoing webhook'}[type];
  const update=(key,value)=>setForm(previous=>({...previous,[key]:value}));
  const reset=()=>{setEditing(null);setError('');setForm({...emptyForm(),method:type==='outgoing'?'POST':'GET',mapping:type==='outgoing'?'{}':emptyForm().mapping});};
  const select=row=>{
    setEditing(row);setError('');setForm({...emptyForm(),...row.config,name:row.name,status:row.status==='enabled'?'enabled':'paused',mapping:JSON.stringify(row.config.mapping || {},null,2),query:JSON.stringify(row.config.query || {},null,2),request_mapping:JSON.stringify(row.config.request_mapping || {},null,2),token:'',username:'',password:''});
  };
  const copyUrl=async row=>{try{await navigator.clipboard.writeText(`${window.location.origin}/api/integrations/incoming/${row.code}`);setCopied(row.code);}catch{setError('Clipboard unavailable. Copy the endpoint shown below manually.');}};
  const columns=useMemo(()=>[
    {key:'name',label:'Connection',width:210},{key:'branch_code',label:'Branch',width:190,render:row=>row.branch_code || 'All Branches'},
    {key:'status',label:'Status',width:120},{key:'last_run_at',label:'Last run (IST)',width:200,render:row=>formatIntegrationTime(row.last_run_at)},
    {key:'actions',label:'Actions',width:360,render:row=><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
      <Button secondary onClick={()=>select(row)}>{canManage?'Edit':'View'}</Button>
      {type==='incoming'?<Button secondary onClick={()=>copyUrl(row)}>Copy endpoint</Button>:<Button secondary disabled={!canManage||row.status!=='enabled'} onClick={()=>onAction({command:'queue_connection',type,code:row.code,...(type==='external'&&row.config.direction==='push'?{leadCode}:{})})}>{type==='outgoing'?'Queue test':row.config.direction==='push'?'Push lead':'Run pull'}</Button>}
      {type==='external'&&row.config.direction==='pull'&&<Button secondary disabled={!canManage||!bootstrap.setup.enabled} onClick={()=>onAction({command:'test_connection',type,code:row.code})}>Test GET</Button>}
      {type!=='external'&&<Button secondary disabled={!canManage} onClick={()=>setRotate(row)}>Rotate secret</Button>}
    </div>},
  // Selection only copies row values; it does not capture the current draft.
  ],[canManage,type,leadCode,bootstrap.setup.enabled,onAction]);
  const submit=async event=>{
    event.preventDefault();setError('');
    try {
      const config={...form,mapping:JSON.parse(form.mapping),query:JSON.parse(form.query),request_mapping:JSON.parse(form.request_mapping)};
      for(const key of ['name','status','token','username','password']) delete config[key];
      const result=await onAction({command:'save_connection',type,code:editing?.code,expectedUpdatedAt:editing?.updated_at,name:form.name,status:form.status,config,credentials:{token:form.token,username:form.username,password:form.password}});
      if(result.success)reset();
    } catch{setError('Correct the JSON mapping/query configuration before saving.');}
  };
  return <>
    {error&&<Notice tone="error">{error}</Notice>}
    {copied&&<Notice>Webhook endpoint copied.</Notice>}
    {type==='external'&&<div style={{marginBottom:14}}><Field label="Lead code for manual push" help="Used by the Push lead button on a saved push connection."><input value={leadCode} onChange={event=>setLeadCode(event.target.value)} placeholder="CRM lead code" style={{...inputStyle,maxWidth:400}}/></Field></div>}
    <IntegrationTable columns={columns} resource="connections" type={type} loadRows={loadRows} refreshKey={refreshKey} scopeKey={scopeKey} statuses={['enabled','paused','reconnect']}/>
    {rotate&&<Notice>Rotate the signing secret for “{rotate.name}”? Current sender/receiver signatures will stop matching immediately.<div style={{display:'flex',gap:8,marginTop:10}}><Button disabled={!canManage} onClick={async()=>{const result=await onAction({command:'rotate_webhook_secret',type,code:rotate.code});if(result.success)setRotate(null);}}>Rotate now</Button><Button secondary onClick={()=>setRotate(null)}>Cancel</Button></div></Notice>}
    <form onSubmit={submit} style={panelStyle}>
      <div style={{display:'flex',justifyContent:'space-between',gap:10}}><h3 style={{marginTop:0}}>{editing?'Edit':'Create'} {title}</h3>{editing&&<Button secondary onClick={reset}>New connection</Button>}</div>
      {editing&&<p style={{fontSize:12,color:'var(--text-secondary)'}}>{editing.code} · {editing.branch_code || 'All Branches'}{editing.has_credentials?' · Credentials saved; leave credential fields blank to preserve them.':''}</p>}
      <div style={gridStyle}>
        <Field label="Connection name"><input required maxLength={120} value={form.name} onChange={event=>update('name',event.target.value)} style={inputStyle}/></Field>
        <Field label="Status"><select value={form.status} onChange={event=>update('status',event.target.value)} style={inputStyle}><option value="paused">Paused</option><option value="enabled" disabled={!bootstrap.setup.enabled}>Enabled</option></select></Field>
        {type!=='incoming'&&<Field label="Destination HTTPS URL"><input type="url" required value={form.url} onChange={event=>update('url',event.target.value)} style={inputStyle} placeholder="https://example.com/api/leads"/></Field>}
        {type==='external'&&<Field label="Direction"><select value={form.direction} onChange={event=>{update('direction',event.target.value);update('method',event.target.value==='pull'?'GET':'POST');}} style={inputStyle}><option value="pull">GET / Pull data into CRM</option><option value="push">POST/PATCH / Push a CRM lead</option></select></Field>}
        {type!=='incoming'&&<Field label="HTTP method"><select value={form.method} onChange={event=>update('method',event.target.value)} style={inputStyle}>{(type==='external'&&form.direction==='pull'?['GET']:['POST','PATCH']).map(method=><option key={method}>{method}</option>)}</select></Field>}
        {type==='incoming'?<Field label="Webhook authentication"><select value={form.auth_mode} onChange={event=>update('auth_mode',event.target.value)} style={inputStyle}><option value="hmac">HMAC signature + timestamp</option><option value="bearer">Bearer secret</option></select></Field>:<>
          <Field label="External authentication"><select value={form.auth_type} onChange={event=>update('auth_type',event.target.value)} style={inputStyle}>{['none','bearer','api_key','basic'].map(auth=><option key={auth}>{auth}</option>)}</select></Field>
          {form.auth_type==='api_key'&&<Field label="API key header"><input value={form.auth_header} onChange={event=>update('auth_header',event.target.value)} style={inputStyle}/></Field>}
          {['bearer','api_key'].includes(form.auth_type)&&<Field label="Token / API key"><input type="password" autoComplete="new-password" value={form.token} onChange={event=>update('token',event.target.value)} style={inputStyle}/></Field>}
          {form.auth_type==='basic'&&<><Field label="Username"><input autoComplete="off" value={form.username} onChange={event=>update('username',event.target.value)} style={inputStyle}/></Field><Field label="Password"><input type="password" autoComplete="new-password" value={form.password} onChange={event=>update('password',event.target.value)} style={inputStyle}/></Field></>}
        </>}
      </div>
      {type==='external'&&form.direction==='pull'&&<div style={{...gridStyle,marginTop:16}}>
        <Field label="Records array path" help="Use an empty path when the response itself is an array."><input value={form.records_path} onChange={event=>update('records_path',event.target.value)} style={inputStyle}/></Field>
        <Field label="Next cursor path (optional)"><input value={form.next_cursor_path} onChange={event=>update('next_cursor_path',event.target.value)} style={inputStyle}/></Field>
        <Field label="Cursor query parameter"><input value={form.cursor_parameter} onChange={event=>update('cursor_parameter',event.target.value)} style={inputStyle}/></Field>
        <Field label="Sync interval (minutes, IST schedule)"><input type="number" min={5} max={1440} value={form.sync_interval_minutes} onChange={event=>update('sync_interval_minutes',Number(event.target.value))} style={inputStyle}/></Field>
      </div>}
      {type==='outgoing'&&<div style={{display:'flex',gap:14,flexWrap:'wrap',margin:'1rem 0'}}>{LEAD_EVENTS.map(name=><label key={name} style={{fontSize:13}}><input type="checkbox" checked={form.events.includes(name)} onChange={event=>update('events',event.target.checked?[...form.events,name]:form.events.filter(item=>item!==name))}/> {name}</label>)}</div>}
      {(type==='incoming'||type==='external'&&form.direction==='pull')&&<div style={{...gridStyle,margin:'1rem 0'}}>
        <Field label="Default source"><input value={form.defaults.source || ''} onChange={event=>update('defaults',{...form.defaults,source:event.target.value})} style={inputStyle}/></Field>
        <Field label="Default lead stage"><select value={form.defaults.status || ''} onChange={event=>update('defaults',{...form.defaults,status:event.target.value})} style={inputStyle}><option value="">First active tenant stage</option>{bootstrap.lookups.stages.map(stage=><option key={stage.code} value={stage.code}>{stage.label}</option>)}</select></Field>
        <Field label="Default employee"><select value={form.defaults.assigned_to || ''} onChange={event=>update('defaults',{...form.defaults,assigned_to:event.target.value})} style={inputStyle}><option value="">Unassigned</option>{bootstrap.lookups.employees.map(employee=><option key={employee.name} value={employee.name}>{employee.code} — {employee.name}</option>)}</select></Field>
      </div>}
      <div style={{...gridStyle,marginTop:16}}>
        {type==='external'&&form.direction==='push'?<MappingEditor label="Push mapping (JSON)" value={form.request_mapping} onChange={value=>update('request_mapping',value)} help={'External field → CRM field. Example: {"customer_name":"name"}. Empty mapping sends the public lead.'}/>:<MappingEditor value={form.mapping} onChange={value=>update('mapping',value)} help={type==='outgoing'?'External field → event path, e.g. {"customer_name":"data.name"}. Empty mapping sends the signed event envelope.':'CRM field → source path. Include external_id for stable source identity.'}/>}
        {type==='external'&&form.direction==='pull'&&<MappingEditor label="GET query parameters (JSON)" value={form.query} onChange={value=>update('query',value)} help={'Non-secret query parameters. Example: {"limit":50}. Credentials belong in headers.'}/>}
      </div>
      <Button type="submit" disabled={!canManage||!form.name} style={{marginTop:16}}>Save {title}</Button>
      {type==='incoming'&&editing&&<div style={{marginTop:18}}><strong>Incoming endpoint</strong><code style={{display:'block',overflowWrap:'anywhere',marginTop:8}}>{typeof window!=='undefined'?window.location.origin:''}/api/integrations/incoming/{editing.code}</code><p style={{fontSize:12}}>HMAC: X-Integration-Timestamp = Unix seconds; X-Integration-Signature = sha256=HMAC-SHA256(secret, timestamp + &quot;.&quot; + exact request body). Bearer mode: Authorization: Bearer YOUR_WEBHOOK_SECRET.</p></div>}
    </form>
  </>;
}
export default function ConnectionsPanel(props) {return <ConnectionEditor {...props} type="external"/>;}
