'use client';
import React,{useMemo,useState} from 'react';
import {formatIntegrationTime} from '@/config/integrationsConfig';
import IntegrationTable from './IntegrationTable';
import MappingEditor,{Button,Field,Notice,inputStyle,panelStyle,gridStyle} from './MappingEditor';
const empty=()=>({name:'',status:'paused',page_id:'',form_ids:[],mapping:'{}',defaults:{},sync_interval_minutes:60});
export default function MetaLeadAdsPanel({scope,scopeKey,bootstrap,canManage,onAction,loadRows,refreshKey}) {
  const [selected,setSelected]=useState(null),[form,setForm]=useState(empty),[assets,setAssets]=useState({pages:[],forms:[]}),[error,setError]=useState(''),[since,setSince]=useState('');
  const update=(key,value)=>setForm(previous=>({...previous,[key]:value}));
  const columns=useMemo(()=>[
    {key:'name',label:'Meta connection',width:210},{key:'branch_code',label:'Branch',width:190,render:row=>row.branch_code || 'All Branches'},
    {key:'status',label:'Status',width:130},{key:'forms',label:'Forms',width:110,render:row=>row.config.form_ids?.length || 0},
    {key:'last_run_at',label:'Last sync (IST)',width:200,render:row=>formatIntegrationTime(row.last_run_at)},
    {key:'actions',label:'Actions',width:230,render:row=><div style={{display:'flex',gap:6}}><Button secondary onClick={()=>{setSelected(row);setForm({...empty(),...row.config,name:row.name,status:row.status==='enabled'?'enabled':'paused',mapping:JSON.stringify(row.config.mapping || {},null,2)});setAssets({pages:[],forms:[]});setError('');}}>Select</Button><Button secondary disabled={!canManage||row.status!=='enabled'} onClick={()=>onAction({command:'queue_connection',type:'meta',code:row.code,since})}>Sync leads</Button></div>},
  ],[canManage,onAction,since]);
  const loadAssets=async pageId=>{
    const result=await onAction({command:'meta_assets',code:selected.code,pageId:pageId || undefined});
    if(result.success)setAssets({pages:result.pages,forms:result.forms});
  };
  const save=async event=>{
    event.preventDefault();setError('');
    try {
      const result=await onAction({command:'save_connection',type:'meta',code:selected?.code,expectedUpdatedAt:selected?.updated_at,name:form.name,status:form.status,config:{...form,mapping:JSON.parse(form.mapping)}});
      if(result.success){setSelected(null);setForm(empty());setAssets({pages:[],forms:[]});}
    }catch{setError('Correct the JSON mapping before saving.');}
  };
  return <>
    {!bootstrap.setup.meta.ready&&<Notice>Meta app setup is pending. Configure the app credentials, supported Graph API version, public HTTPS origin and webhook verification token before connecting.</Notice>}
    {typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('integration_result')==='connected'&&<Notice tone="success">Meta authorization completed. Select the connection, load its authorized Pages, choose forms, and enable sync.</Notice>}
    {error&&<Notice tone="error">{error}</Notice>}
    <Field label="Manual sync from date (IST)" help="Leave blank for the last 7 days. Historical availability depends on Meta; the requested range is limited to 90 days."><input type="date" value={since} onChange={event=>setSince(event.target.value)} style={{...inputStyle,maxWidth:280,marginBottom:14}}/></Field>
    <IntegrationTable columns={columns} resource="connections" type="meta" loadRows={loadRows} refreshKey={refreshKey} scopeKey={scopeKey} statuses={['enabled','paused','reconnect']}/>
    <form onSubmit={save} style={panelStyle}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12}}><h3 style={{marginTop:0}}>{selected?'Configure':'Create'} Meta Lead Ads connection</h3>{selected&&<Button secondary onClick={()=>{setSelected(null);setForm(empty());setAssets({pages:[],forms:[]});}}>New connection</Button>}</div>
      <p style={{fontSize:13,color:'var(--text-secondary)'}}>Create a paused connection, connect Meta, select authorized Page/forms, then enable it. Each form has one active routing destination.</p>
      <div style={gridStyle}><Field label="Connection name"><input required maxLength={120} value={form.name} onChange={event=>update('name',event.target.value)} style={inputStyle}/></Field><Field label="Status"><select value={form.status} onChange={event=>update('status',event.target.value)} style={inputStyle}><option value="paused">Paused</option><option value="enabled" disabled={!selected?.has_credentials||!bootstrap.setup.enabled}>Enabled</option></select></Field><Field label="Catch-up interval (minutes)"><input type="number" min={15} max={1440} value={form.sync_interval_minutes} onChange={event=>update('sync_interval_minutes',Number(event.target.value))} style={inputStyle}/></Field></div>
      {selected&&<div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'1rem 0'}}><a className="btn btn-primary" aria-disabled={!canManage||!bootstrap.setup.enabled||!bootstrap.setup.meta.ready} href={canManage&&bootstrap.setup.enabled&&bootstrap.setup.meta.ready?`/api/integrations/meta/connect?${new URLSearchParams({tenant:scope.tenantCode,connection:selected.code,...(selected.branch_code || scope.branchCode?{branch:selected.branch_code || scope.branchCode}:{})})}`:undefined} style={{padding:'0.55rem 0.85rem',borderRadius:8,opacity:canManage&&bootstrap.setup.enabled&&bootstrap.setup.meta.ready?1:0.5}}>{selected.has_credentials?'Reconnect Meta':'Connect Meta'}</a><Button secondary disabled={!canManage||!selected.has_credentials} onClick={()=>loadAssets(form.page_id)}>Load authorized Pages & forms</Button></div>}
      {assets.pages.length>0&&<div style={{...gridStyle,margin:'1rem 0'}}><Field label="Facebook Page"><select value={form.page_id} style={inputStyle} onChange={event=>{const id=event.target.value;update('page_id',id);update('form_ids',[]);setAssets(previous=>({...previous,forms:[]}));if(id)loadAssets(id);}}><option value="">Select Page</option>{assets.pages.map(page=><option key={page.id} value={page.id}>{page.name} · {page.id}</option>)}</select></Field><div><strong style={{fontSize:13}}>Instant Forms</strong><div style={{maxHeight:240,overflow:'auto',marginTop:8}}>{assets.forms.map(item=><label key={item.id} style={{display:'block',padding:'0.5rem 0',fontSize:13}}><input type="checkbox" checked={form.form_ids.includes(item.id)} onChange={event=>update('form_ids',event.target.checked?[...form.form_ids,item.id]:form.form_ids.filter(id=>id!==item.id))}/> {item.name} · {item.id}</label>)}{!assets.forms.length&&<p>Select a Page to load its forms.</p>}</div></div></div>}
      {selected&&!assets.pages.length&&<p style={{fontSize:12}}>Saved Page: {form.page_id || 'Not selected'} · {form.form_ids.length} selected form(s)</p>}
      <div style={{...gridStyle,margin:'1rem 0'}}><Field label="Default lead stage"><select value={form.defaults.status || ''} onChange={event=>update('defaults',{...form.defaults,status:event.target.value})} style={inputStyle}><option value="">First active tenant stage</option>{bootstrap.lookups.stages.map(stage=><option key={stage.code} value={stage.code}>{stage.label}</option>)}</select></Field><Field label="Default employee"><select value={form.defaults.assigned_to || ''} onChange={event=>update('defaults',{...form.defaults,assigned_to:event.target.value})} style={inputStyle}><option value="">Unassigned</option>{bootstrap.lookups.employees.map(employee=><option key={employee.name} value={employee.name}>{employee.code} — {employee.name}</option>)}</select></Field><Field label="Default source"><input value={form.defaults.source || ''} onChange={event=>update('defaults',{...form.defaults,source:event.target.value})} placeholder="Facebook" style={inputStyle}/></Field></div>
      <MappingEditor value={form.mapping} onChange={value=>update('mapping',value)} help={'CRM field → Meta question field name. Empty mapping recognizes full_name, phone_number, email and company_name. Unmapped custom answers are preserved in the requirement.'}/>
      <Button type="submit" disabled={!canManage||!form.name} style={{marginTop:14}}>Save Meta connection</Button>
    </form>
    <Notice>Meta webhook callback: <code>/api/integrations/meta/webhook</code>. Subscribe to the Page <code>leadgen</code> field and verify one test lead before production activation. API version and approved permissions must match your Meta app.</Notice>
  </>;
}
