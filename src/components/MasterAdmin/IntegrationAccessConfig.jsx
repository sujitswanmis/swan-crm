'use client';
import React,{useEffect,useState,useTransition} from 'react';
import {RefreshCw,ShieldCheck} from 'lucide-react';
import {INTEGRATION_FEATURES,formatIntegrationTime} from '@/config/integrationsConfig';
import IntegrationScopeSelector from '../Settings/Integrations/IntegrationScopeSelector';
import {Button,Notice,panelStyle,gridStyle} from '../Settings/Integrations/MappingEditor';

async function request(input) {
  const response=await fetch('/api/integrations/v1/lookups',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Integration-Console':'1'},body:JSON.stringify(input),signal:AbortSignal.timeout(45000)});
  return response.json();
}
export default function IntegrationAccessConfig() {
  const [scope,setScope]=useState(null),[snapshot,setSnapshot]=useState(null),[form,setForm]=useState(null),[notice,setNotice]=useState(null),[refresh,setRefresh]=useState(0);
  const [pending,startTransition]=useTransition();
  useEffect(()=>{
    let active=true;
    startTransition(async()=>{
      try {
        const result=await request({command:'tenant_access_bootstrap',...(scope || {})});
        if(!active)return;
        if(result.success){setSnapshot(result);setForm(result.policy);setNotice(previous=>previous?.error?null:previous);}
        else {setSnapshot(null);setNotice({error:result.error});}
      } catch {if(active)setNotice({error:'Tenant integration access could not be loaded. Refresh to retry.'});}
    });
    return()=>{active=false;};
  },[scope,refresh]);
  const save=event=>{
    event.preventDefault();
    startTransition(async()=>{
      try {
        const result=await request({command:'tenant_access_save',tenantCode:snapshot.tenantCode,branchCode:snapshot.branchCode,revision:snapshot.revision,policy:snapshot.branchCode&&form.inherit?{inherit:true}:{enabled:form.enabled,features:form.features}});
        if(result.success){setNotice({message:result.message});setRefresh(value=>value+1);}
        else setNotice({error:result.error});
      } catch {setNotice({error:'Access policy could not be saved. Refresh before retrying.'});}
    });
  };
  return <section aria-label="Tenant API & Integrations">
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:16}}><div><h2 style={{margin:0,display:'flex',gap:8,alignItems:'center'}}><ShieldCheck size={23}/> Tenant API & Integrations</h2><p style={{color:'var(--text-secondary)',fontSize:14}}>Enable integration access for each company and apply branch restrictions. New tenants start with access off.</p></div><Button secondary disabled={pending} onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={16}/> Refresh</Button></div>
    {notice?.error&&<Notice tone="error">{notice.error}</Notice>}
    {notice?.message&&<Notice tone="success">{notice.message}</Notice>}
    {!snapshot&&!notice?.error&&<p role="status">Loading Master Admin controls…</p>}
    {snapshot&&form&&<>
      <IntegrationScopeSelector data={snapshot} disabled={pending} onChange={value=>{setScope(value);setSnapshot(null);setForm(null);setNotice(null);}}/>
      {!snapshot.setup.databaseReady&&<Notice>Tenant access setup is pending. Apply the tenant integration access migration, then refresh.</Notice>}
      {!snapshot.setup.enabled&&<Notice>Platform integration traffic is paused. You can prepare access policies now; data exchange starts after the server is activated.</Notice>}
      {snapshot.branchCode&&!snapshot.companyEnabled&&<Notice>Company-level access is off. Branch rules take effect only after company access is enabled under All Branches.</Notice>}
      <form onSubmit={save} style={panelStyle}>
        <h3 style={{marginTop:0}}>{snapshot.tenantCode}{snapshot.branchCode?` / ${snapshot.branchCode}`:' / All Branches'}</h3>
        {snapshot.branchCode&&<label style={{display:'block',marginBottom:18}}><input type="checkbox" checked={form.inherit} disabled={pending||!snapshot.setup.databaseReady} onChange={event=>{const inherit=event.target.checked;setForm(previous=>({...previous,inherit,...(!inherit?{enabled:true,features:{...snapshot.companyFeatures}}:{})}));}}/> Use company defaults</label>}
        <fieldset disabled={pending||!snapshot.setup.databaseReady||Boolean(snapshot.branchCode&&form.inherit)} style={{border:0,padding:0,margin:0}}>
          <label style={{display:'block',fontWeight:700,marginBottom:18}}><input type="checkbox" checked={snapshot.branchCode&&form.inherit?snapshot.companyEnabled:form.enabled} onChange={event=>setForm(previous=>({...previous,enabled:event.target.checked}))}/> {snapshot.branchCode?'Allow integrations in this branch':'Enable integrations for this company'}</label>
          <div style={gridStyle}>{INTEGRATION_FEATURES.map(feature=>{
            const inherited=snapshot.branchCode&&form.inherit;
            const checked=inherited?snapshot.companyFeatures[feature.id]:form.features[feature.id];
            return <label key={feature.id} style={{padding:12,border:'1px solid var(--border-light)',borderRadius:8,fontSize:14}}><input type="checkbox" checked={Boolean(checked)} disabled={Boolean(snapshot.branchCode&&!snapshot.companyFeatures[feature.id])} onChange={event=>{const enabled=event.target.checked;setForm(previous=>({...previous,features:{...previous.features,[feature.id]:enabled}}));}}/> {feature.label}{snapshot.branchCode&&!snapshot.companyFeatures[feature.id]&&<small style={{display:'block',color:'var(--text-secondary)',marginTop:5}}>Not allowed by company policy</small>}</label>;
          })}</div>
        </fieldset>
        <p style={{fontSize:13,color:'var(--text-secondary)',marginTop:18}}>Switching access off blocks new requests, including existing keys. Queued jobs and saved configuration are retained. An operation already in progress may finish.</p>
        <Button type="submit" disabled={pending||!snapshot.setup.databaseReady}>Save access policy</Button>
        <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:0}}>Last saved: {formatIntegrationTime(snapshot.updatedAt)} · Revision {snapshot.revision}</p>
      </form>
      <Notice>Company-wide keys and connections must use an explicit enabled branch when any branch restricts that feature. Tenant admins can manage enabled integrations in their own scope; staff still require the appropriate permissions.</Notice>
      {!snapshot.setup.meta.ready&&<Notice>Meta app setup is pending. API and webhook access can be configured independently. Meta Lead Ads becomes connectable after the platform Meta app is configured.</Notice>}
    </>}
  </section>;
}
