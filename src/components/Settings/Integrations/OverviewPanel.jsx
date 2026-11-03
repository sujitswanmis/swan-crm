'use client';
import React,{useState} from 'react';
import {Button,Field,Notice,inputStyle,panelStyle,gridStyle} from './MappingEditor';
export default function OverviewPanel({bootstrap,scope,canManage,onAction}) {
  const [leadCode,setLeadCode]=useState('');
  const cards=[['Active connections',bootstrap.counts.enabled || 0],['Paused',bootstrap.counts.paused || 0],['Needs reconnect',bootstrap.counts.reconnect || 0],['Queued / running',bootstrap.counts.pending || 0],['Failed jobs',bootstrap.counts.failed || 0]];
  const checks=[['Integration database',bootstrap.setup.databaseReady],['Master Admin activation',bootstrap.policy?.enabled===true],['Credential encryption',bootstrap.setup.encryptionReady],['Worker secret',bootstrap.setup.workerReady],['Background schedule',bootstrap.setup.scheduler.active],['Meta app configuration',bootstrap.setup.meta.ready]];
  return <><div style={gridStyle}>{cards.map(([label,value])=><div key={label} style={panelStyle}><div style={{color:'var(--text-secondary)',fontSize:13}}>{label}</div><strong style={{fontSize:30}}>{bootstrap.setup.databaseReady?value:'—'}</strong></div>)}</div>
    <div style={panelStyle}><h3 style={{marginTop:0}}>Connection readiness</h3>{checks.map(([label,ready])=><div key={label} style={{display:'flex',justifyContent:'space-between',padding:'0.6rem 0',borderBottom:'1px solid var(--border-light)'}}><span>{label}</span><strong style={{color:ready?'#16a34a':'#b45309'}}>{ready?'Ready':'Setup pending'}</strong></div>)}</div>
    <Notice>Tenant-wide API access uses verified lead ownership. Branch APIs and branch webhooks include only leads mapped to that branch. Existing employee calling, attendance and session workflows continue independently.</Notice>
    {bootstrap.tenantWide&&scope.branchCode&&<div style={panelStyle}><h3 style={{marginTop:0}}>Map an existing lead to this branch</h3><p style={{fontSize:13,color:'var(--text-secondary)'}}>Only a lead already belonging to this tenant can be mapped. Existing mappings to another branch cannot be overwritten here.</p><Field label="Existing lead code"><input disabled={!bootstrap.setup.databaseReady} value={leadCode} onChange={event=>setLeadCode(event.target.value)} style={{...inputStyle,maxWidth:400}} placeholder="Enter the CRM lead code"/></Field><Button disabled={!canManage||!leadCode||!bootstrap.setup.databaseReady} style={{marginTop:12}} onClick={async()=>{const result=await onAction({command:'map_lead_branch',leadCode});if(result.success)setLeadCode('');}}>Map to {scope.branchCode}</Button></div>}
  </>;
}
