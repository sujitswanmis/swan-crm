'use client';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ChevronsLeft,ChevronLeft,ChevronRight,ChevronsRight} from 'lucide-react';
import {useTableColumnResize,ColumnResizer} from '@/utils/tableColumnResize';
import {Button,Notice,inputStyle} from './MappingEditor';

const sticky={position:'sticky',top:0,zIndex:10,backgroundColor:'var(--bg-surface)',boxShadow:'inset 0 -1px 0 var(--border-light)'};
export default function IntegrationTable({columns,resource,type,loadRows,refreshKey,scopeKey,statuses=[],dateFilters=false}) {
  const [query,setQuery]=useState({currentPage:1,pageSize:25,search:'',status:'',fromDate:'',toDate:''});
  const [search,setSearch]=useState(''),[data,setData]=useState({rows:[],total:0,loading:true,error:''});
  const timer=useRef();
  const widths=useMemo(()=>Object.fromEntries(columns.map(column=>[column.key,column.width || 180])),[columns]);
  const minimums=useMemo(()=>Object.fromEntries(columns.map(column=>[column.key,column.minWidth || 110])),[columns]);
  const resize=useTableColumnResize(`integrations:${scopeKey}:${resource}:${type || ''}`,widths,minimums);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
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
  const pages=Math.max(1,Math.ceil(data.total/query.pageSize)),from=data.total?(query.currentPage-1)*query.pageSize+1:0,to=Math.min(query.currentPage*query.pageSize,data.total);
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
        <tbody>{data.loading?<tr><td colSpan={columns.length} style={{padding:'2rem'}}>Loading records…</td></tr>:data.rows.length?data.rows.map(row=><tr key={row.code}>{columns.map(column=><td key={column.key} style={{padding:'0.8rem',borderBottom:'1px solid var(--border-light)',verticalAlign:'top',overflowWrap:'anywhere'}}>{column.render?column.render(row):String(row[column.key] ?? '—')}</td>)}</tr>):<tr><td colSpan={columns.length} style={{padding:'3rem',textAlign:'center',color:'var(--text-secondary)'}}>No records in this scope.</td></tr>}</tbody>
      </table>
    </div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',padding:'0.85rem 0',fontSize:'0.82rem'}}>
      <span>Showing <strong>{from}</strong> to <strong>{to}</strong> of <strong>{data.total}</strong> records</span>
      <label>Rows per page <select aria-label="Rows per page" value={query.pageSize} onChange={event=>update({pageSize:Number(event.target.value)})} style={{...inputStyle,width:80,display:'inline-block'}}>{[10,25,50,100].map(size=><option key={size}>{size}</option>)}</select></label>
      <div style={{display:'flex',alignItems:'center',gap:5}}>
        <Button secondary aria-label="First page" disabled={data.loading||query.currentPage===1} onClick={()=>setQuery(previous=>({...previous,currentPage:1}))}><ChevronsLeft size={16}/></Button>
        <Button secondary aria-label="Previous page" disabled={data.loading||query.currentPage===1} onClick={()=>setQuery(previous=>({...previous,currentPage:previous.currentPage-1}))}><ChevronLeft size={16}/></Button>
        <Button secondary disabled aria-current="page">Page {query.currentPage} of {pages}</Button>
        <Button secondary aria-label="Next page" disabled={data.loading||query.currentPage>=pages} onClick={()=>setQuery(previous=>({...previous,currentPage:previous.currentPage+1}))}><ChevronRight size={16}/></Button>
        <Button secondary aria-label="Last page" disabled={data.loading||query.currentPage>=pages} onClick={()=>setQuery(previous=>({...previous,currentPage:pages}))}><ChevronsRight size={16}/></Button>
      </div>
    </div>
  </div>;
}
