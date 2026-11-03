'use client';
import React,{useCallback,useEffect,useState,useTransition} from 'react';
import {Plug,RefreshCw,Copy,X} from 'lucide-react';
import {INTEGRATION_TABS,INTEGRATION_PAGE_IDS,INTEGRATION_FEATURES,resolveIntegrationTab,integrationTabHref} from '@/config/integrationsConfig';
import {getSubItemPermissions} from '@/utils/permissionUtils';
import IntegrationScopeSelector from './IntegrationScopeSelector';
import OverviewPanel from './OverviewPanel';
import ApiAccessPanel from './ApiAccessPanel';
import ConnectionsPanel from './ConnectionsPanel';
import IncomingWebhooksPanel from './IncomingWebhooksPanel';
import OutgoingWebhooksPanel from './OutgoingWebhooksPanel';
import MetaLeadAdsPanel from './MetaLeadAdsPanel';
import IntegrationLogsPanel from './IntegrationLogsPanel';
import {Button,Notice,panelStyle} from './MappingEditor';

// Independent HTTP requests avoid serializing Meta/network waits with calling Server Actions.
async function consoleRequest(input) {
  const response=await fetch('/api/integrations/v1/lookups',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json','X-Integration-Console':'1'},
    body:JSON.stringify(input),signal:AbortSignal.timeout(45000),
  });
  return response.json();
}

export default function IntegrationsContainer({moduleAccess,userRole}) {
  const [requestedTab,setRequestedTab]=useState(()=>typeof window==='undefined'?'integrations':resolveIntegrationTab(window.location.pathname,window.location.search));
  const [scope,setScope]=useState(null),[snapshot,setSnapshot]=useState(null),[refreshKey,setRefreshKey]=useState(0),[notice,setNotice]=useState(null),[secret,setSecret]=useState(null);
  const [pending,startTransition]=useTransition();
  const tabs=INTEGRATION_TABS.filter(tab=>getSubItemPermissions(moduleAccess,userRole,'settings',tab.id).view);
  const activePage=String(tabs.some(tab=>tab.id===requestedTab)?requestedTab:tabs[0]?.id || '');
  useEffect(()=>{
    const sync=()=>{
      const sub=window.location.pathname.replace(/^\/+|\/+$/g,'').toLowerCase().split('/')[1];
      const params=new URLSearchParams(window.location.search);
      const legacy=params.get('setting') || params.get('subtab') || params.get('tab');
      if(!INTEGRATION_PAGE_IDS.includes(sub) && !INTEGRATION_PAGE_IDS.includes(legacy)) return;
      const tab=resolveIntegrationTab(window.location.pathname,window.location.search);
      const href=integrationTabHref(tab,window.location.search);
      if(window.location.pathname+window.location.search!==href) window.history.replaceState(null,'',href);
      // The scope/tab effect clears secrets only when the actual selection changes.
      // Repeated sidebar events for this same tab must preserve a newly issued key.
      startTransition(()=>setRequestedTab(tab));
    };
    sync();
    window.addEventListener('popstate',sync);
    window.addEventListener('setting_subtab_change',sync);
    return()=>{window.removeEventListener('popstate',sync);window.removeEventListener('setting_subtab_change',sync);};
  },[]);
  useEffect(()=>{
    let timer,lastRefresh=0;
    const refreshOnReturn=()=>{
      clearTimeout(timer);
      if(document.visibilityState==='hidden') return;
      // Focus and visibility often fire together. Coalesce them without polling.
      timer=setTimeout(()=>{
        lastRefresh=Date.now();
        startTransition(()=>setRefreshKey(value=>value+1));
      },Math.max(150,1500-(Date.now()-lastRefresh)));
    };
    window.addEventListener('focus',refreshOnReturn);
    document.addEventListener('visibilitychange',refreshOnReturn);
    return()=>{clearTimeout(timer);window.removeEventListener('focus',refreshOnReturn);document.removeEventListener('visibilitychange',refreshOnReturn);};
  },[]);
  useEffect(()=>{
    if(!activePage) return;
    let active=true;
    startTransition(async()=>{
      try {
        const result=await consoleRequest({command:'bootstrap',page:activePage,...(scope || {})});
        if(active){if(result.success){setSnapshot({...result,page:activePage});setNotice(previous=>previous?.error?null:previous);}else{setSnapshot(null);setNotice({error:result.error});}}
      } catch {if(active)setNotice({error:'Integration settings could not be loaded. Other CRM pages remain available.'});}
    });
    return()=>{active=false;};
  },[scope,activePage,refreshKey]);
  useEffect(()=>{startTransition(()=>{setSecret(null);setNotice(null);});},[scope,activePage]);
  const tenantCode=scope?.tenantCode || snapshot?.tenantCode,branchCode=scope?scope.branchCode:snapshot?.branchCode;
  const loadRows=useCallback(query=>consoleRequest({...query,command:'list',tenantCode,branchCode}),[tenantCode,branchCode]);
  const onAction=useCallback(input=>new Promise(resolve=>{
    startTransition(async()=>{
      try {
        const result=await consoleRequest({...input,tenantCode,branchCode,page:activePage});
        if(result.success){if(result.message)setNotice({message:result.message});if(!['meta_assets','test_connection'].includes(input.command))setRefreshKey(value=>value+1);if(result.secret)setSecret({value:result.secret,message:result.message,code:result.code,page:activePage,tenantCode,branchCode,kind:['create_key','rotate_key'].includes(input.command)?'api_key':'webhook'});}
        else setNotice({error:result.error});
        resolve(result);
      } catch {const result={success:false,error:'Integration request could not be completed. Please retry.'};setNotice({error:result.error});resolve(result);}
    });
  }),[tenantCode,branchCode,activePage]);
  const changeTab=tabId=>{
    if(!tabs.some(tab=>tab.id===tabId)) return;
    if(tabId===activePage) return;
    setRequestedTab(tabId);
    window.history.pushState(null,'',integrationTabHref(tabId,window.location.search));
  };
  const onTabKeyDown=(event,index)=>{
    const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
    if(next===null) return;
    event.preventDefault();
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
    changeTab(tabs[next].id);
  };
  const components={integrations:OverviewPanel,integrations_api:ApiAccessPanel,integrations_connections:ConnectionsPanel,integrations_incoming:IncomingWebhooksPanel,integrations_outgoing:OutgoingWebhooksPanel,integrations_meta:MetaLeadAdsPanel,integrations_logs:IntegrationLogsPanel};
  const Panel=components[activePage] || OverviewPanel;
  const activeTab=tabs.find(tab=>tab.id===activePage);
  const currentSnapshot=snapshot?.page===activePage;
  const featureAvailable=snapshot?.policy?.enabled && (!activeTab?.features || activeTab.features.some(feature=>snapshot.policy.features[feature]));
  const enabledFeatures=INTEGRATION_FEATURES.filter(feature=>snapshot?.policy?.features?.[feature.id]).map(feature=>feature.label);
  const scopeKey=`${tenantCode || 'default'}:${branchCode || 'all'}`;
  const visibleSecret=secret?.page===activePage&&secret.tenantCode===tenantCode&&(secret.branchCode || null)===(branchCode || null)&&snapshot?.canManage?secret:null;
  return <section style={{padding:'1.5rem',maxWidth:1600,width:'100%',margin:'0 auto',boxSizing:'border-box'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:12}}><div><h2 style={{display:'flex',alignItems:'center',gap:10,margin:0}}><Plug size={23}/> Integrations & API</h2><p style={{color:'var(--text-secondary)',fontSize:'0.87rem'}}>Connect your company and branches to external systems and Meta Lead Ads.</p></div><Button secondary disabled={pending} onClick={()=>setRefreshKey(value=>value+1)}><RefreshCw size={16}/> Refresh</Button></div>
    {snapshot&&<IntegrationScopeSelector data={{...snapshot,tenantCode,branchCode}} disabled={pending} onChange={value=>{setSecret(null);setSnapshot(null);setScope(value);}}/>}
    <nav role="tablist" aria-label="Integration tabs" style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:20}}>{tabs.map((tab,index)=><Button key={tab.id} id={`integration-tab-${tab.id}`} role="tab" aria-selected={activePage===tab.id} aria-controls="integration-tab-panel" tabIndex={activePage===tab.id?0:-1} secondary={activePage!==tab.id} onClick={()=>changeTab(tab.id)} onKeyDown={event=>onTabKeyDown(event,index)}>{tab.label}</Button>)}</nav>
    {!tabs.length&&<Notice>You do not have access to any integration tabs.</Notice>}
    {notice?.error&&<Notice tone="error">{notice.error}</Notice>}
    {currentSnapshot&&<>
      {!snapshot.setup.databaseReady?<Notice><strong>Integration setup is incomplete.</strong> Your workspace administrator needs to finish the integration database setup. You can browse the tabs and check readiness; data actions will be available after setup. Refresh this page once setup is complete.</Notice>:<>
        {!snapshot.policy?.enabled&&<Notice>Master Admin has not enabled integrations for this company and branch. Activation is controlled from Config Master → Tenant API & Integrations.</Notice>}
        {snapshot.policy?.enabled&&<Notice tone="success"><strong>Access enabled · {tenantCode} / {branchCode || 'All Branches'}</strong><br/>Allowed features: {enabledFeatures.length?enabledFeatures.join(', '):'None in this scope. Select an enabled branch or ask Master Admin to enable a feature.'}</Notice>}
        {snapshot.policy?.enabled&&!featureAvailable&&activePage!=='integrations'&&<Notice>This feature is restricted by Master Admin for the selected scope. Select an enabled branch or request activation.</Notice>}
        {!snapshot.setup.enabled&&<Notice>Integrations are paused at the server. Configuration can be prepared; receiving and delivering data starts after activation.</Notice>}
        {snapshot.policy?.enabled&&!snapshot.canManage&&<Notice>This account has view-only integration access. Ask your tenant admin to review your write permissions or the company&apos;s read-only status.</Notice>}
        {visibleSecret&&visibleSecret.kind!=='api_key'&&<div style={{...panelStyle,borderColor:'#86efac'}}><div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{visibleSecret.message}</strong><Button secondary aria-label="Dismiss secret" onClick={()=>setSecret(null)}><X size={16}/></Button></div><code style={{display:'block',overflowWrap:'anywhere',padding:'1rem 0',userSelect:'all'}}>{visibleSecret.value}</code><Button secondary onClick={async()=>{try{await navigator.clipboard.writeText(visibleSecret.value);setNotice({message:'Secret copied.'});}catch{setNotice({error:'Clipboard unavailable. Select and copy the secret manually.'});}}}><Copy size={15}/> Copy secret</Button></div>}
        {notice?.message&&!visibleSecret&&<Notice tone="success">{notice.message}</Notice>}
      </>}
      <div id="integration-tab-panel" role="tabpanel" aria-labelledby={`integration-tab-${activePage}`} tabIndex={0}>
        {activePage!=='integrations'&&(!snapshot.setup.databaseReady||!featureAvailable)?<div style={panelStyle}><h3 style={{marginTop:0}}>{activeTab.label}</h3><p style={{color:'var(--text-secondary)'}}>{activeTab.description}</p><Button disabled>{!snapshot.setup.databaseReady?'Available after setup':snapshot.policy?.enabled?'Feature not enabled for this scope':'Master Admin activation required'}</Button></div>:<Panel key={`${activePage}:${scopeKey}`} scope={{tenantCode,branchCode}} scopeKey={scopeKey} bootstrap={snapshot} canManage={snapshot.setup.databaseReady&&snapshot.canManage&&!pending} onAction={onAction} loadRows={loadRows} refreshKey={refreshKey} apiSecret={visibleSecret?.kind==='api_key'?visibleSecret:null} onDismissSecret={()=>setSecret(null)}/>}
      </div>
    </>}
    {activePage&&!currentSnapshot&&!notice?.error&&<p role="status">Loading authorized integration scope…</p>}
  </section>;
}
