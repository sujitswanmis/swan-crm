'use client';
import React from 'react';
import {Field,inputStyle,gridStyle} from './MappingEditor';
export default function IntegrationScopeSelector({data,onChange,disabled}) {
  return <div style={{...gridStyle,maxWidth:850,marginBottom:'1.25rem'}}>
    <Field label="Company / Tenant"><select value={data.tenantCode} disabled={disabled} style={inputStyle} onChange={event=>onChange({tenantCode:event.target.value,branchCode:null})}>{data.tenants.map(tenant=><option key={tenant.code} value={tenant.code}>{tenant.code} — {tenant.name}</option>)}</select></Field>
    <Field label="Branch / Plant"><select value={data.branchCode || ''} disabled={disabled} style={inputStyle} onChange={event=>onChange({tenantCode:data.tenantCode,branchCode:event.target.value || null})}>{data.tenantWide&&<option value="">All Branches — tenant-wide configuration</option>}{data.branches.map(branch=><option key={branch.code} value={branch.code}>{branch.code} — {branch.name}</option>)}</select></Field>
  </div>;
}
