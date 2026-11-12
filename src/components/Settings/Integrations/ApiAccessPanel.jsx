'use client';
import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {API_SCOPES,formatIntegrationTime} from '@/config/integrationsConfig';
import IntegrationTable from './IntegrationTable';
import {Button,Field,inputStyle,panelStyle,gridStyle,Notice} from './MappingEditor';
const scopeLabels={
  'leads:read':['Read leads / GET','Read lead data from the CRM.'],
  'leads:create':['Create leads / POST','Send new leads into the CRM.'],
  'leads:update':['Update leads / PATCH','Update an existing CRM lead.'],
  'lookups:read':['Read dropdown values / GET','Read allowed stages, employees and other lookup values.'],
};
const subscribeToOrigin=()=>()=>{};
const browserOrigin=()=>window.location.origin;
const serverOrigin=()=>'';
const powershellQuote=value=>`'${String(value).replace(/'/g,"''")}'`;
const shellQuote=value=>`'${String(value).replace(/'/g,"'\"'\"'")}'`;
export function apiRequestExamples(origin,scope) {
  if(!origin) return [];
  const base=new URL(origin);
  if(!['http:','https:'].includes(base.protocol)) return [];
  const definitions=[
    {id:'list',title:'Read leads',method:'GET',path:'leads',scope:'leads:read',pagination:true},
    {id:'one',title:'Read one lead',method:'GET',path:'leads/LEAD_CODE',scope:'leads:read'},
    {id:'lookups',title:'Read dropdown values',method:'GET',path:'lookups',scope:'lookups:read'},
    {id:'create',title:'Create a lead',method:'POST',path:'leads',scope:'leads:create',identity:'website-create-000001',body:{external_id:'website-enquiry-000001',name:'Example enquiry',phone:'9876543210',source:'Website'}},
    {id:'update',title:'Update a lead',method:'PATCH',path:'leads/LEAD_CODE',scope:'leads:update',identity:'website-update-000001',body:{requirement:'Updated requirement'}},
  ];
  return definitions.map(example=>{
    const url=new URL(`/api/integrations/v1/${example.path}`,base.origin);
    if(scope.tenantCode)url.searchParams.set('tenant_code',scope.tenantCode);
    if(scope.branchCode)url.searchParams.set('branch_code',scope.branchCode);
    if(example.pagination){url.searchParams.set('page','1');url.searchParams.set('page_size','25');}
    const headers={Authorization:'Bearer YOUR_API_KEY',...(example.identity?{'Idempotency-Key':example.identity}:{})};
    const body=example.body?JSON.stringify(example.body,null,2):null;
    const powershell=[
      '$headers = @{',...Object.entries(headers).map(([name,value])=>`  ${powershellQuote(name)} = ${powershellQuote(value)}`),'}',
      ...(body?["$body = @'",body,"'@"]:[]),
      `Invoke-RestMethod -Method ${example.method} -Uri ${powershellQuote(url.href)} -Headers $headers${body?" -ContentType 'application/json' -Body $body":''}`,
    ].join('\n');
    const curl=[`curl --request ${example.method} ${shellQuote(url.href)}`,
      ...Object.entries(headers).map(([name,value])=>`  --header ${shellQuote(`${name}: ${value}`)}`),
      ...(body?[`  --header 'Content-Type: application/json'`,`  --data-raw ${shellQuote(body)}`]:[]),
    ].join(' \\\n');
    return {...example,url:url.href,headers,body,powershell,curl};
  });
}
export default function ApiAccessPanel({scope,scopeKey,bootstrap,canManage,onAction,loadRows,refreshKey,apiSecret,onDismissSecret}) {
  const [name,setName]=useState(''),[days,setDays]=useState(90),[scopes,setScopes]=useState(['leads:read','lookups:read']),[confirm,setConfirm]=useState(null);
  const [copyResult,setCopyResult]=useState(null),[exampleFormat,setExampleFormat]=useState('powershell');
  const [neverExpires,setNeverExpires]=useState(false);
  const [issuedSecret,setIssuedSecret]=useState(null),[secretError,setSecretError]=useState('');
  const displayedSecret=issuedSecret || apiSecret;
  const keyBox=useRef(null),origin=useSyncExternalStore(subscribeToOrigin,browserOrigin,serverOrigin);
  useEffect(()=>{if(displayedSecret?.value)keyBox.current?.scrollIntoView?.({behavior:'smooth',block:'center'});},[displayedSecret]);
  const receiveIssuedKey=result=>{
    if(!result.success)return;
    if(typeof result.secret!=='string'||!result.secret.trim()){
      setSecretError('The key was saved, but its full secret was not returned. Report this issue before creating another key.');
      return;
    }
    setIssuedSecret({code:result.code,value:result.secret});setSecretError('');
  };
  const copyText=async(value,resource,message)=>{
    try{await navigator.clipboard.writeText(value);setCopyResult({resource,message,tone:'success'});}
    catch{setCopyResult({resource,message:'Automatic copy is unavailable. Select the text below and copy it manually.',tone:'error'});}
  };
  const columns=useMemo(()=>[
    {key:'name',label:'Key name',width:190},
    {key:'actions',label:'Key actions',width:240,render:row=>row.revoked_at?'Revoked':<div style={{display:'flex',gap:6,flexWrap:'wrap'}}><Button secondary disabled={!canManage} onClick={()=>setConfirm({row,command:'rotate_key',neverExpires:row.expires_at===null,days})}>Replace key</Button><Button secondary disabled={!canManage} onClick={()=>setConfirm({row,command:'revoke_key'})}>Revoke</Button></div>},
    {key:'branch_code',label:'Branch',width:190,render:row=>row.branch_code || 'All Branches'},
    {key:'key_prefix',label:'Saved prefix (identifier)',width:190},{key:'scopes',label:'Scopes',width:240,render:row=>(row.scopes || []).join(', ')},
    {key:'expires_at',label:'Expires (IST)',width:200,render:row=>row.expires_at===null?'Never':formatIntegrationTime(row.expires_at)},
    {key:'last_used_at',label:'Last used (IST)',width:200,render:row=>formatIntegrationTime(row.last_used_at)},
  ],[canManage,days]);
  const allowedScopes=API_SCOPES.filter(scope=>bootstrap.policy?.features?.[['leads:read','lookups:read'].includes(scope)?'api_read':'api_write']===true);
  const selectedScopes=scopes.filter(scope=>allowedScopes.includes(scope));
  const validDays=neverExpires||(Number.isInteger(days)&&days>=1&&days<=365);
  const disabledReason=!canManage
    ?bootstrap.canManage?'Please wait while integration access is refreshed.':'This account has view-only access. Ask your tenant admin to review write permissions.'
    :!name.trim()?'Enter a key name above. “ERP lead sync” is an example, not a filled value.'
    :!validDays?'Enter a validity between 1 and 365 whole days.'
    :!selectedScopes.length?'Select at least one allowed API permission.':'';
  const examples=apiRequestExamples(origin,scope),keyResource=`key:${displayedSecret?.code || ''}`;
  return <>
    <div style={panelStyle}>
      <h3 style={{marginTop:0}}>Create an API key</h3>
      <ol style={{fontSize:13,color:'var(--text-secondary)',paddingLeft:20,lineHeight:1.8}}><li>Enter a name for the system that will use this key.</li><li>Select the permissions it needs, then create the key.</li><li>Copy the secret shown once and add it to that system&apos;s Authorization header.</li></ol>
      <p style={{fontSize:13}}>This key will access <strong>{scope.tenantCode} / {scope.branchCode || 'All Branches'}</strong>.</p>
      <div style={gridStyle}>
        <Field label="Key name" help="Type a name, for example: Website leads or ERP lead sync."><input value={name} maxLength={120} onChange={event=>setName(event.target.value)} placeholder="Example: ERP lead sync" style={inputStyle}/></Field>
        <Field label="Expiration" help="Never expires stays valid until revoked, replaced, or blocked by Master Admin."><select value={neverExpires?'never':'days'} onChange={event=>setNeverExpires(event.target.value==='never')} style={inputStyle}><option value="days">After a number of days</option><option value="never">Never expires</option></select></Field>
        {!neverExpires&&<Field label="Validity (days)" help="Choose 1–365 days. The key stops working after expiry."><input type="number" min={1} max={365} value={days} onChange={event=>setDays(Number(event.target.value))} style={inputStyle}/></Field>}
      </div>
      <div style={{...gridStyle,margin:'1rem 0'}}>{API_SCOPES.map(scope=>{
        const allowed=allowedScopes.includes(scope),[label,description]=scopeLabels[scope];
        return <label key={scope} style={{fontSize:13,padding:10,border:'1px solid var(--border-light)',borderRadius:8,opacity:allowed?1:0.65}}><input type="checkbox" checked={selectedScopes.includes(scope)} disabled={!allowed} onChange={event=>setScopes(previous=>event.target.checked?[...previous,scope]:previous.filter(item=>item!==scope))}/> <strong>{label}</strong><span style={{display:'block',marginTop:5,color:'var(--text-secondary)'}}>{description} <code>{scope}</code>{!allowed&&<span style={{display:'block',marginTop:4}}>Not enabled by Master Admin for this scope.</span>}</span></label>;
      })}</div>
      {disabledReason&&<p id="integration-key-help" role="status" style={{fontSize:13,color:'var(--text-secondary)'}}>{disabledReason}</p>}
      <Button disabled={Boolean(disabledReason)} aria-describedby={disabledReason?'integration-key-help':undefined} onClick={async()=>{const result=await onAction({command:'create_key',name:name.trim(),scopes:selectedScopes,...(neverExpires?{neverExpires:true}:{expiresInDays:days})});if(result.success){receiveIssuedKey(result);setName('');}}}>Create API key</Button>
      {secretError&&<Notice tone="error">{secretError}</Notice>}
      {displayedSecret&&<div ref={keyBox} role="region" aria-label="New API key" style={{marginTop:18,padding:16,border:'2px solid #86efac',borderRadius:10,minWidth:0}}>
        <h4 style={{margin:'0 0 8px'}}>Full API key — copy now</h4>
        <p style={{fontSize:13,margin:'0 0 12px'}}>Copy and save this full secret before closing the box, reloading the page or changing tabs/company/branch. The saved list contains only its identifying prefix.</p>
        <textarea aria-label="Full API key" readOnly value={displayedSecret.value} rows={3} wrap="soft" spellCheck={false} autoComplete="off" onFocus={event=>event.currentTarget.select()} style={{...inputStyle,fontFamily:'monospace',fontSize:15,lineHeight:1.6,wordBreak:'break-all',overflowWrap:'anywhere',resize:'vertical',minHeight:100}}/>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}><Button onClick={()=>copyText(displayedSecret.value,keyResource,'Full API key copied.')}>Copy API key</Button><Button secondary onClick={()=>{setIssuedSecret(null);onDismissSecret?.();}}>Close key box</Button></div>
        {copyResult?.resource===keyResource&&<div style={{marginTop:12}}><Notice tone={copyResult.tone}>{copyResult.message}</Notice></div>}
      </div>}
    </div>
    {confirm&&<Notice><strong>{confirm.command==='rotate_key'?'Replace key':'Revoke'} “{confirm.row.name}”?</strong> Its current key will stop working immediately. {confirm.command==='rotate_key'&&<><p>A replacement generates a new full key to copy.</p><div style={gridStyle}><Field label="Replacement expiration"><select value={confirm.neverExpires?'never':'days'} onChange={event=>setConfirm(previous=>({...previous,neverExpires:event.target.value==='never'}))} style={inputStyle}><option value="days">After a number of days</option><option value="never">Never expires</option></select></Field>{!confirm.neverExpires&&<Field label="Replacement validity (days)"><input type="number" min={1} max={365} value={confirm.days} onChange={event=>setConfirm(previous=>({...previous,days:Number(event.target.value)}))} style={inputStyle}/></Field>}</div></>}<div style={{display:'flex',gap:8,marginTop:10}}><Button disabled={!canManage||(confirm.command==='rotate_key'&&!confirm.neverExpires&&(!Number.isInteger(confirm.days)||confirm.days<1||confirm.days>365))} onClick={async()=>{const result=await onAction({command:confirm.command,code:confirm.row.code,...(confirm.command==='rotate_key'?(confirm.neverExpires?{neverExpires:true}:{expiresInDays:confirm.days}):{})});if(result.success){if(confirm.command==='rotate_key')receiveIssuedKey(result);setConfirm(null);}}}>{confirm.command==='rotate_key'?'Replace and show new key':'Revoke key'}</Button><Button secondary onClick={()=>setConfirm(null)}>Cancel</Button></div></Notice>}
    <p style={{fontSize:13,color:'var(--text-secondary)'}}>Saved keys show an identifying prefix, which cannot authenticate API requests. If a full secret was not copied, use <strong>Replace key</strong> to generate a new one; confirmation is required before the current key stops working.</p>
    <IntegrationTable columns={columns} resource="keys" loadRows={loadRows} refreshKey={refreshKey} scopeKey={scopeKey}/>
    <div style={{...panelStyle,minWidth:0}}>
      <h3 style={{marginTop:0}}>Complete API examples</h3>
      <p style={{fontSize:13}}>Replace <code>YOUR_API_KEY</code> with your full secret and <code>LEAD_CODE</code> with an existing CRM lead code. Use a new Idempotency-Key for each new create/update operation; reuse it when retrying the same request.</p>
      <p style={{fontSize:13,overflowWrap:'anywhere'}}>API base URL: <strong>{origin?`${origin}/api/integrations/v1`:'Loading API address…'}</strong>. Localhost URLs work on this computer. External systems need your public HTTPS CRM address.</p>
      <Field label="Example format"><select value={exampleFormat} onChange={event=>setExampleFormat(event.target.value)} style={{...inputStyle,maxWidth:320}}><option value="powershell">PowerShell (Windows)</option><option value="curl">cURL (Bash / Linux / macOS)</option></select></Field>
      {examples.map(example=><section key={example.id} aria-label={`${example.title} example`} style={{marginTop:18,paddingTop:16,borderTop:'1px solid var(--border-light)',minWidth:0}}>
        <h4 style={{margin:'0 0 8px'}}>{example.title} · <code>{example.scope}</code></h4>
        <code style={{display:'block',whiteSpace:'pre-wrap',overflowWrap:'anywhere',wordBreak:'break-word',fontSize:13,marginBottom:10}}>{example.method} {example.url}</code>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button secondary onClick={()=>copyText(example[exampleFormat],example.id,`${example.title} example copied.`)}>Copy example</Button><Button secondary onClick={()=>copyText(example.url,example.id,'Complete request URL copied.')}>Copy URL</Button></div>
        {copyResult?.resource===example.id&&<div style={{marginTop:10}}><Notice tone={copyResult.tone}>{copyResult.message}</Notice></div>}
        <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',wordBreak:'break-word',fontSize:13,lineHeight:1.6,padding:12,background:'var(--bg-secondary)',borderRadius:8,maxWidth:'100%',boxSizing:'border-box'}}>{example[exampleFormat]}</pre>
      </section>)}
    </div>
  </>;
}
