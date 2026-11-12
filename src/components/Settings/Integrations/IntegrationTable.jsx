'use client';
import React,{startTransition,useEffect,useMemo,useRef,useState} from 'react';
import {useTableColumnResize,ColumnResizer} from '@/utils/tableColumnResize';
import StandardTablePagination from '@/components/common/StandardTablePagination';
import {Notice,inputStyle} from './MappingEditor';

const sticky={position:'sticky',top:0,zIndex:10,backgroundColor:'var(--bg-surface)',boxShadow:'inset 0 -1px 0 var(--border-light)'};
export function integrationPageSize(value) {
  if(!['number','string'].includes(typeof value))return 25;
  if(value==='All'||Number(value)===100000)return 100000;
  const size=Number(value);
  return Number.isSafeInteger(size)&&size>=1&&size<=1000?size:25;
}
export default function IntegrationTable({columns,resource,type,loadRows,refreshKey,scopeKey,statuses=[],dateFilters=false}) {
  const [query,setQuery]=useState(()=>{
    let initialSize = 25;
    if (typeof window !== 'undefined') {
      try {
        const s = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (s.defaultPageSize!==undefined) initialSize = integrationPageSize(s.defaultPageSize);
      } catch { /* Keep the safe default if cached settings cannot be read. */ }
    }
    return {currentPage:1,pageSize:initialSize,search:'',status:'',fromDate:'',toDate:''};
  });
  const [search,setSearch]=useState(''),[data,setData]=useState({rows:[],total:0,loading:true,error:''});
  const timer=useRef();
  const selection=useRef({scopeKey,resource,type});
  const widths=useMemo(()=>Object.fromEntries(columns.map(column=>[column.key,column.width || 180])),[columns]);
  const minimums=useMemo(()=>Object.fromEntries(columns.map(column=>[column.key,column.minWidth || 110])),[columns]);
  const resize=useTableColumnResize(`integrations:${scopeKey}:${resource}:${type || ''}`,widths,minimums);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{
    const previous=selection.current;
    selection.current={scopeKey,resource,type};
    if(previous.scopeKey!==scopeKey||previous.resource!==resource||previous.type!==type)startTransition(()=>setQuery(current=>({...current,currentPage:1})));
  },[scopeKey,resource,type]);
  useEffect(()=>{
    let active=true;
    // No polling. Pagination/filter requests run only while this page is mounted.
    Promise.resolve().then(()=>{if(active)setData(previous=>({...previous,loading:true,error:''}));return loadRows({resource,type,...query});}).then(result=>{
      if(!active)return;
      if(!result.success){setData({rows:[],total:0,loading:false,error:result.error});return;}
      const last=Math.max(1,Math.ceil(result.total/query.pageSize));
      if(query.currentPage>last){setQuery(previous=>({...previous,currentPage:last}));return;}
      setData({rows:result.rows,total:result.total,loading:false,error:''});
    }).catch(()=>{if(active)setData({rows:[],total:0,loading:false,error:'This integration list could not be loaded. Retry with Refresh.'});});
    return()=>{active=false;};
  },[query,resource,type,loadRows,refreshKey]);
  const update=patch=>setQuery(previous=>({...previous,...patch,currentPage:1}));
  return <div>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:12}}>
      <input aria-label="Search integration records" placeholder="Search records…" value={search} style={{...inputStyle,width:250}} onChange={event=>{const value=event.target.value;setSearch(value);clearTimeout(timer.current);timer.current=setTimeout(()=>update({search:value}),300);}} />
      {statuses.length>0&&<select aria-label="Filter status" value={query.status} style={{...inputStyle,width:170}} onChange={event=>update({status:event.target.value})}><option value="">All statuses</option>{statuses.map(status=><option key={status}>{status}</option>)}</select>}
      {dateFilters&&<><label style={{fontSize:12}}>From (IST)<input aria-label="From date IST" type="date" style={inputStyle} value={query.fromDate} onChange={event=>update({fromDate:event.target.value})}/></label><label style={{fontSize:12}}>To (IST)<input aria-label="To date IST" type="date" style={inputStyle} value={query.toDate} onChange={event=>update({toDate:event.target.value})}/></label></>}
    </div>
    {data.error&&<Notice tone="error">{data.error}</Notice>}
    <div style={{overflow:'auto',maxHeight:'calc(100vh - 390px)',minHeight:380,border:'1px solid var(--border-light)',borderRadius:8}} aria-busy={data.loading}>
      <table style={{tableLayout:'fixed',borderCollapse:'separate',borderSpacing:0,width:resize.getTotalTableWidth(),minWidth:'100%',fontSize:'0.83rem'}}>
        <thead style={sticky}><tr>{columns.map(column=><th key={column.key} style={{...sticky,position:'sticky',textAlign:'left',padding:'0.85rem',width:resize.colWidths[column.key],minWidth:column.minWidth || 110}}>{column.label}<ColumnResizer colKey={column.key} isResizing={resize.resizingCol===column.key} onResizeStart={resize.handleResizeStart} onReset={resize.resetColWidth}/></th>)}</tr></thead>
        <tbody>{data.loading?<tr><td colSpan={columns.length} style={{padding:'2rem'}}>Loading records…</td></tr>:data.error?<tr><td colSpan={columns.length} style={{padding:'2rem'}}>Records could not be loaded. Use Refresh to retry.</td></tr>:data.rows.length?data.rows.map(row=><tr key={row.code}>{columns.map(column=><td key={column.key} style={{padding:'0.8rem',borderBottom:'1px solid var(--border-light)',verticalAlign:'top',overflowWrap:'anywhere'}}>{column.render?column.render(row):String(row[column.key] ?? '—')}</td>)}</tr>):<tr><td colSpan={columns.length} style={{padding:'3rem',textAlign:'center',color:'var(--text-secondary)'}}>No records in this scope.</td></tr>}</tbody>
      </table>
    </div>
    <StandardTablePagination
      currentPage={query.currentPage}
      totalRecords={data.total}
      pageSize={query.pageSize}
      onPageChange={page => setQuery(prev => ({ ...prev, currentPage: page }))}
      onPageSizeChange={size => update({ pageSize: integrationPageSize(size) })}
    />
  </div>;
}
