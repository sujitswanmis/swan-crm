'use client';
import React,{useMemo,useState} from 'react';
import {formatIntegrationTime} from '@/config/integrationsConfig';
import IntegrationTable from './IntegrationTable';
import {Button,Field,Notice,inputStyle} from './MappingEditor';
export default function IntegrationLogsPanel({scopeKey,canManage,onAction,loadRows,refreshKey}) {
  const [resource,setResource]=useState('jobs');
  const columns=useMemo(()=>[
    {key:'code',label:resource==='jobs'?'Job code':resource==='audit'?'Audit code':'Attempt code',width:260},
    {key:'branch_code',label:'Branch',width:190,render:row=>row.branch_code || 'All Branches'},
    ...(resource==='audit'?[{key:'operation',label:'Operation',width:190},{key:'actor_code',label:'Actor',width:170},{key:'resource_code',label:'Resource',width:250}]:[
      {key:'connection_code',label:'Connection',width:250},{key:'status',label:'Status',width:130},{key:resource==='jobs'?'attempts':'attempt',label:'Attempts',width:110},{key:'error_code',label:'Error code',width:190},
      ...(resource==='jobs'?[{key:'kind',label:'Job type',width:130},{key:'actions',label:'Actions',width:140,render:row=>row.status==='failed'?<Button secondary disabled={!canManage} onClick={()=>onAction({command:'retry_job',code:row.code})}>Retry job</Button>:'—'}]:[{key:'http_status',label:'HTTP status',width:120}]),
    ]),
    {key:'created_at',label:'Created (IST)',width:200,render:row=>formatIntegrationTime(row.created_at)},
  ],[resource,canManage,onAction]);
  return <><Field label="Log type"><select value={resource} onChange={event=>setResource(event.target.value)} style={{...inputStyle,maxWidth:300,marginBottom:16}}><option value="jobs">Jobs & retries</option><option value="attempts">Delivery / processing attempts</option><option value="audit">Configuration audit</option></select></Field><Notice>Logs contain operational metadata. Credentials and lead payloads are excluded. Retrying a delivery retains its event ID so the receiver can deduplicate it.</Notice><IntegrationTable key={resource} columns={columns} resource={resource} loadRows={loadRows} refreshKey={refreshKey} scopeKey={scopeKey} statuses={resource==='jobs'?['pending','running','completed','failed']:resource==='attempts'?['success','failed']:[]} dateFilters/></>;
}
