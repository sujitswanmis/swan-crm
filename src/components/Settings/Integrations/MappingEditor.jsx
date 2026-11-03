'use client';
import React from 'react';
export const inputStyle={width:'100%',padding:'0.65rem 0.75rem',border:'1px solid var(--border-light)',borderRadius:8,background:'var(--bg-surface)',color:'var(--text-primary)',boxSizing:'border-box',fontSize:'0.9rem'};
export const panelStyle={padding:'1.25rem',border:'1px solid var(--border-light)',borderRadius:12,background:'var(--bg-surface)',marginBottom:'1rem'};
export const gridStyle={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'1rem'};
export function Field({label,children,help}) {return <label style={{display:'block',fontSize:'0.85rem',fontWeight:600}}><span style={{display:'block',marginBottom:6}}>{label}</span>{children}{help&&<span style={{display:'block',fontWeight:400,color:'var(--text-secondary)',marginTop:5,fontSize:'0.78rem'}}>{help}</span>}</label>;}
export function Button({children,secondary=false,...props}) {return <button type="button" {...props} className={secondary?'btn btn-secondary':'btn btn-primary'} style={{padding:'0.55rem 0.85rem',borderRadius:8,cursor:props.disabled?'not-allowed':'pointer',opacity:props.disabled?0.5:1,...props.style}}>{children}</button>;}
export function Notice({children,tone='info'}) {return <div role={tone==='error'?'alert':'status'} style={{padding:'0.85rem 1rem',borderRadius:8,background:tone==='error'?'#fef2f2':tone==='success'?'#f0fdf4':'var(--bg-secondary, #f1f5f9)',color:tone==='error'?'#991b1b':tone==='success'?'#166534':'var(--text-primary)',marginBottom:'1rem',fontSize:'0.85rem'}}>{children}</div>;}
export default function MappingEditor({value,onChange,label='Field mapping (JSON)',help='Destination field → source path. Example: {"name":"full_name","phone":"contact.mobile"}'}) {
  let valid=true;
  try {const parsed=JSON.parse(value || '{}');valid=Boolean(parsed&&typeof parsed==='object'&&!Array.isArray(parsed));}catch{valid=false;}
  return <Field label={label} help={valid?help:'Enter a valid JSON object before saving.'}><textarea rows={5} spellCheck={false} value={value} onChange={event=>onChange(event.target.value)} aria-invalid={!valid} style={{...inputStyle,fontFamily:'monospace',resize:'vertical',borderColor:valid?undefined:'#ef4444'}} /></Field>;
}
