'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings, Users, Phone, Loader2, RefreshCw, PhoneCall,
  PhoneOff, Clock, Activity, Shield, Wifi, WifiOff,
  CheckCircle, XCircle, AlertCircle, BarChart2, Download,
  UserPlus, Edit2, Trash2, ChevronRight, Server, Radio,
  PhoneIncoming, PhoneOutgoing, ArrowRight, Eye, Filter,
  Calendar, Search, ToggleLeft, ToggleRight, Save, Bell
} from 'lucide-react';
import { getTeamMembers, getCallAdminData, addCallAgentAdmin, updateCallAgentAdmin } from '@/app/actions/team';

// ─── Helpers ────────────────────────────────────────────────
const TABS = [
  { id: 'agents',    label: 'Agents & Endpoints', icon: Users },
  { id: 'endpoints', label: 'SIP Endpoints',       icon: Server },
  { id: 'calllogs',  label: 'Call Logs',           icon: PhoneCall },
  { id: 'monitor',   label: 'Live Monitor',         icon: Activity },
  { id: 'settings',  label: 'Settings',             icon: Settings },
];

const statusBadge = (status) => {
  const map = {
    available:   { bg: '#dcfce7', color: '#166534', label: 'Available' },
    offline:     { bg: '#f1f5f9', color: '#64748b', label: 'Offline' },
    busy:        { bg: '#fef3c7', color: '#92400e', label: 'Busy' },
    on_call:     { bg: '#dbeafe', color: '#1e40af', label: 'On Call' },
  };
  const s = map[status] || map.offline;
  return (
    <span style={{
      padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem',
      fontWeight: 600, background: s.bg, color: s.color
    }}>{s.label}</span>
  );
};

const sipBadge = (reg) => reg === 'true'
  ? <span style={{ display:'flex',alignItems:'center',gap:'0.3rem',color:'#16a34a',fontSize:'0.8rem',fontWeight:600 }}><Wifi size={13}/>Registered</span>
  : <span style={{ display:'flex',alignItems:'center',gap:'0.3rem',color:'#dc2626',fontSize:'0.8rem',fontWeight:600 }}><WifiOff size={13}/>Not Registered</span>;

const directionBadge = (dir) => dir === 'inbound'
  ? <span style={{color:'#7c3aed',fontSize:'0.78rem',fontWeight:600,display:'flex',alignItems:'center',gap:'0.25rem'}}><PhoneIncoming size={12}/>Inbound</span>
  : <span style={{color:'#0369a1',fontSize:'0.78rem',fontWeight:600,display:'flex',alignItems:'center',gap:'0.25rem'}}><PhoneOutgoing size={12}/>Outbound</span>;

const callStatusBadge = (s) => {
  const map = {
    initiated:  ['#dbeafe','#1e40af'],
    answered:   ['#dcfce7','#166534'],
    completed:  ['#f0fdf4','#15803d'],
    failed:     ['#fee2e2','#991b1b'],
    missed:     ['#fef3c7','#92400e'],
    ringing:    ['#ede9fe','#5b21b6'],
  };
  const [bg, color] = map[s] || ['#f1f5f9','#475569'];
  return <span style={{padding:'0.15rem 0.55rem',borderRadius:'999px',fontSize:'0.73rem',fontWeight:600,background:bg,color}}>{s}</span>;
};

const fmtDate = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle:'short', timeStyle:'short' }) : '—';
const fmtDur  = (s) => {
  if (!s && s !== 0) return '—';
  const m = Math.floor(s/60), sec = s%60;
  return `${m}:${String(sec).padStart(2,'0')}`;
};

// ─── Sub-components ─────────────────────────────────────────

// ── Tab: Agents ──────────────────────────────────────────────
function TabAgents({ agents, endpoints, users, onRefresh, updateCallAgentAdmin, addCallAgentAdmin }) {
  const [saving, setSaving] = useState({});
  const [selectedUserId, setSelectedUserId] = useState('');
  const [adding, setAdding] = useState(false);
  const unassigned = users.filter(u => !agents.some(a => a.user_id === u.user_id));

  const handleAdd = async () => {
    if (!selectedUserId) return;
    setAdding(true);
    const user = users.find(u => u.user_id === selectedUserId);
    const res = await addCallAgentAdmin(selectedUserId, user?.emp_name || 'Agent');
    if (!res.success) alert('Failed: ' + res.error);
    else { setSelectedUserId(''); await onRefresh(); }
    setAdding(false);
  };

  const handleUpdate = async (agentId, field, value) => {
    setSaving(p => ({ ...p, [agentId]: true }));
    await updateCallAgentAdmin(agentId, { [field]: value });
    setSaving(p => ({ ...p, [agentId]: false }));
    await onRefresh();
  };

  const handleEndpoint = async (agentId, endpointKey) => {
    setSaving(p => ({ ...p, [agentId]: true }));
    const ep = endpoints.find(e => e.endpoint_id === endpointKey || e.endpoint_key === endpointKey);
    await updateCallAgentAdmin(agentId, {
      plivo_endpoint_key: endpointKey || null,
      plivo_username:     ep?.username || null,
      plivo_sip_uri:      ep?.sip_uri  || null,
      plivo_password:     ep?.password || null,
    });
    setSaving(p => ({ ...p, [agentId]: false }));
    await onRefresh();
  };

  const handleSetPassword = async (agentId) => {
    const newPassword = prompt("Enter the SIP password for this endpoint:");
    if (!newPassword) return;

    setSaving(p => ({ ...p, [agentId]: true }));
    await updateCallAgentAdmin(agentId, { plivo_password: newPassword });
    setSaving(p => ({ ...p, [agentId]: false }));
    await onRefresh();
  };

  return (
    <div>
      {/* Add Agent */}
      <div style={{ background:'white', borderRadius:'12px', padding:'1.5rem', marginBottom:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0' }}>
        <h3 style={{ fontSize:'1rem', fontWeight:600, marginBottom:'1rem', display:'flex', alignItems:'center', gap:'0.5rem', color:'#1e293b' }}>
          <UserPlus size={18} color="#3b82f6" /> Add User to Call Center
        </h3>
        <div style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            style={{ flex:1, padding:'0.65rem 1rem', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'0.9rem', background:'white' }}
          >
            <option value="">Select Team Member…</option>
            {unassigned.map(u => (
              <option key={u.user_id} value={u.user_id}>{u.emp_name} ({u.emp_department || 'No Dept'})</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={adding || !selectedUserId}
            style={{ padding:'0.65rem 1.5rem', background:'#3b82f6', color:'white', border:'none', borderRadius:'8px', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:'0.5rem', opacity: adding||!selectedUserId ? 0.6 : 1 }}
          >
            {adding ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />}
            Authorize
          </button>
        </div>
        {unassigned.length === 0 && <p style={{ color:'#94a3b8', fontSize:'0.85rem', marginTop:'0.75rem' }}>All team members are already in the call center.</p>}
      </div>

      {/* Agents Table */}
      <div style={{ background:'white', borderRadius:'12px', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', overflow:'hidden' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h3 style={{ fontSize:'1rem', fontWeight:600, color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <Phone size={18} color="#3b82f6" /> Call Agents ({agents.length})
          </h3>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#f8fafc', fontSize:'0.78rem', textTransform:'uppercase', color:'#64748b', letterSpacing:'0.05em' }}>
                {['Agent','Calling Mode','SIP Endpoint','Password Set','Status','Actions'].map(h => (
                  <th key={h} style={{ padding:'0.75rem 1rem', textAlign:'left', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((agent, i) => (
                <tr key={agent.id} style={{ borderBottom:'1px solid #f1f5f9', background: i%2===0?'white':'#fafafa' }}>
                  <td style={{ padding:'1rem', fontWeight:600, fontSize:'0.9rem', color:'#1e293b', whiteSpace:'nowrap' }}>
                    <div>{agent.display_name}</div>
                    {agent.mobile_number && <div style={{ fontSize:'0.75rem', color:'#94a3b8' }}>{agent.mobile_number}</div>}
                  </td>
                  <td style={{ padding:'1rem' }}>
                    <select
                      value={agent.default_calling_mode || 'browser_webrtc'}
                      onChange={e => handleUpdate(agent.id, 'default_calling_mode', e.target.value)}
                      style={{ padding:'0.4rem 0.6rem', borderRadius:'6px', border:'1px solid #cbd5e1', fontSize:'0.85rem', background:'white', cursor:'pointer' }}
                    >
                      <option value="browser_webrtc">🖥️ Browser WebRTC</option>
                      <option value="mobile">📱 Mobile Number</option>
                      <option value="external_softphone">☎️ External Softphone</option>
                    </select>
                  </td>
                  <td style={{ padding:'1rem' }}>
                    <select
                      value={agent.plivo_endpoint_key || ''}
                      onChange={e => handleEndpoint(agent.id, e.target.value)}
                      style={{ padding:'0.4rem 0.6rem', borderRadius:'6px', border:'1px solid #cbd5e1', fontSize:'0.85rem', background:'white', minWidth:'200px', cursor:'pointer' }}
                    >
                      <option value="">— No Endpoint —</option>
                      {endpoints.map(ep => {
                        const epKey = ep.endpoint_id || ep.endpoint_key;
                        return <option key={epKey} value={epKey}>{ep.alias}</option>;
                      })}
                    </select>
                    {agent.plivo_sip_uri && (
                      <div style={{ fontSize:'0.7rem', color:'#94a3b8', marginTop:'0.2rem', fontFamily:'monospace' }}>
                        {agent.plivo_sip_uri}
                      </div>
                    )}
                  </td>
                  <td style={{ padding:'1rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                      {agent.plivo_password
                        ? <CheckCircle size={18} color="#16a34a" />
                        : <XCircle size={18} color="#dc2626" />}
                      <button
                        onClick={() => handleSetPassword(agent.id)}
                        style={{ padding:'0.2rem 0.5rem', fontSize:'0.75rem', borderRadius:'4px', border:'1px solid #cbd5e1', background:'white', cursor:'pointer', color:'#475569' }}
                        title="Manually set or update SIP Password"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                  <td style={{ padding:'1rem' }}>{statusBadge(agent.status)}</td>
                  <td style={{ padding:'1rem' }}>
                    {saving[agent.id]
                      ? <Loader2 size={16} className="spin" color="#3b82f6" />
                      : <CheckCircle size={16} color="#16a34a" />}
                  </td>
                </tr>
              ))}
              {agents.length === 0 && (
                <tr><td colSpan="6" style={{ padding:'3rem', textAlign:'center', color:'#94a3b8' }}>No call center agents yet. Add a team member above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab: SIP Endpoints ────────────────────────────────────────
function TabEndpoints() {
  const [endpoints, setEndpoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchEndpoints = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/plivo/admin/endpoints');
      const data = await res.json();
      setEndpoints(data.endpoints || []);
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEndpoints(); }, [fetchEndpoints]);

  const registered = endpoints.filter(e => e.sip_registered === 'true').length;

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
        {[
          { label:'Total Endpoints', value: endpoints.length, color:'#3b82f6', icon: Server },
          { label:'Registered',      value: registered,       color:'#16a34a', icon: Wifi },
          { label:'Not Registered',  value: endpoints.length - registered, color:'#dc2626', icon: WifiOff },
        ].map(stat => (
          <div key={stat.label} style={{ background:'white', borderRadius:'12px', padding:'1.25rem 1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:'1rem' }}>
            <div style={{ width:44, height:44, borderRadius:'10px', background: stat.color+'15', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <stat.icon size={22} color={stat.color} />
            </div>
            <div>
              <div style={{ fontSize:'1.6rem', fontWeight:800, color:'#1e293b' }}>{loading ? '…' : stat.value}</div>
              <div style={{ fontSize:'0.78rem', color:'#64748b', fontWeight:500 }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background:'white', borderRadius:'12px', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', overflow:'hidden' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h3 style={{ fontSize:'1rem', fontWeight:600, color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <Server size={18} color="#3b82f6" /> Plivo SIP Endpoints
          </h3>
          <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
            {lastRefresh && <span style={{ fontSize:'0.75rem', color:'#94a3b8' }}>Updated {lastRefresh.toLocaleTimeString()}</span>}
            <button onClick={fetchEndpoints} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.5rem 1rem', background:'#f1f5f9', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.85rem', fontWeight:500 }}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#f8fafc', fontSize:'0.78rem', textTransform:'uppercase', color:'#64748b' }}>
                {['Alias','Username','SIP URI','App Linked','Status'].map(h => (
                  <th key={h} style={{ padding:'0.75rem 1rem', textAlign:'left', fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ padding:'3rem', textAlign:'center', color:'#94a3b8' }}><Loader2 className="spin" size={24} /></td></tr>
              ) : endpoints.map((ep, i) => (
                <tr key={ep.endpoint_id} style={{ borderBottom:'1px solid #f1f5f9', background: i%2===0?'white':'#fafafa' }}>
                  <td style={{ padding:'1rem', fontWeight:600, color:'#1e293b' }}>{ep.alias}</td>
                  <td style={{ padding:'1rem', fontFamily:'monospace', fontSize:'0.8rem', color:'#475569', maxWidth:'220px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ep.username}</td>
                  <td style={{ padding:'1rem', fontFamily:'monospace', fontSize:'0.78rem', color:'#64748b', maxWidth:'260px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ep.sip_uri}</td>
                  <td style={{ padding:'1rem' }}>
                    {ep.application
                      ? <span style={{ color:'#16a34a', fontSize:'0.8rem', display:'flex', alignItems:'center', gap:'0.3rem' }}><CheckCircle size={13}/>Linked</span>
                      : <span style={{ color:'#dc2626', fontSize:'0.8rem', display:'flex', alignItems:'center', gap:'0.3rem' }}><XCircle size={13}/>No App</span>}
                  </td>
                  <td style={{ padding:'1rem' }}>{sipBadge(ep.sip_registered)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Call Logs ────────────────────────────────────────────
function TabCallLogs() {
  const [calls, setCalls] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('db');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE = 20;

  const fetchLogs = useCallback(async (src, pg) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/plivo/admin/call-logs?source=${src}&limit=${PAGE}&offset=${pg * PAGE}`);
      const data = await res.json();
      setCalls(data.calls || []);
      setTotal(data.total || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(source, page); }, [source, page, fetchLogs]);

  const filtered = search
    ? calls.filter(c => JSON.stringify(c).toLowerCase().includes(search.toLowerCase()))
    : calls;

  return (
    <div>
      {/* Controls */}
      <div style={{ background:'white', borderRadius:'12px', padding:'1rem 1.5rem', marginBottom:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', display:'flex', gap:'1rem', alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ display:'flex', background:'#f1f5f9', borderRadius:'8px', padding:'0.25rem' }}>
          {[{v:'db',l:'📂 DB Records'},{v:'plivo',l:'☁️ Plivo CDR'}].map(opt => (
            <button key={opt.v} onClick={() => { setSource(opt.v); setPage(0); }}
              style={{ padding:'0.5rem 1rem', borderRadius:'6px', border:'none', cursor:'pointer', fontWeight:600, fontSize:'0.85rem', background: source===opt.v?'white':'transparent', color: source===opt.v?'#1e293b':'#64748b', boxShadow: source===opt.v?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
              {opt.l}
            </button>
          ))}
        </div>
        <div style={{ position:'relative', flex:1, minWidth:'200px' }}>
          <Search size={15} style={{ position:'absolute', left:'0.75rem', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
          <input
            placeholder="Search calls…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width:'100%', padding:'0.6rem 1rem 0.6rem 2.25rem', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'0.9rem', background:'white', boxSizing:'border-box' }}
          />
        </div>
        <button onClick={() => fetchLogs(source, page)} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.6rem 1rem', background:'#3b82f6', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:600, fontSize:'0.85rem' }}>
          <RefreshCw size={14} className={loading?'spin':''} /> Refresh
        </button>
        <span style={{ color:'#64748b', fontSize:'0.85rem' }}>Total: <strong>{total}</strong></span>
      </div>

      <div style={{ background:'white', borderRadius:'12px', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#f8fafc', fontSize:'0.78rem', textTransform:'uppercase', color:'#64748b' }}>
                {source === 'db'
                  ? ['Time','CallUUID','Agent','Customer','Direction','Status','StartTime','AnswerTime','EndTime','Ringing (s)','Talk (s)','Recording','Room'].map(h => <th key={h} style={{ padding:'0.75rem 1rem', textAlign:'left', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>)
                  : ['Time','From','To','Direction','Duration','Hangup Cause','Cost'].map(h => <th key={h} style={{ padding:'0.75rem 1rem', textAlign:'left', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="13" style={{ padding:'3rem', textAlign:'center' }}><Loader2 className="spin" size={24} color="#3b82f6" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="13" style={{ padding:'3rem', textAlign:'center', color:'#94a3b8' }}>No call records found.</td></tr>
              ) : source === 'db' ? filtered.map((c, i) => (
                <tr key={c.id} style={{ borderBottom:'1px solid #f1f5f9', background: i%2===0?'white':'#fafafa' }}>
                  <td style={{ padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#475569', whiteSpace:'nowrap' }}>{fmtDate(c.created_at)}</td>
                  <td style={{ padding:'0.85rem 1rem', fontFamily:'monospace', fontSize:'0.72rem', color:'#94a3b8', maxWidth:'100px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={c.agent_call_uuid}>{c.agent_call_uuid || '—'}</td>
                  <td style={{ padding:'0.85rem 1rem', fontSize:'0.85rem', fontWeight:500, whiteSpace:'nowrap' }}>{c.call_agents?.display_name || '—'}</td>
                  <td style={{ padding:'0.85rem 1rem', fontFamily:'monospace', fontSize:'0.82rem' }}>{c.customer_number || '—'}</td>
                  <td style={{ padding:'0.85rem 1rem' }}>{directionBadge(c.direction || 'outbound')}</td>
                  <td style={{ padding:'0.85rem 1rem' }}>{callStatusBadge(c.status)}</td>
                  <td style={{ padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#475569', whiteSpace:'nowrap' }}>{fmtDate(c.start_time)}</td>
                  <td style={{ padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#475569', whiteSpace:'nowrap' }}>{fmtDate(c.agent_answer_time || c.customer_answer_time)}</td>
                  <td style={{ padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#475569', whiteSpace:'nowrap' }}>{fmtDate(c.end_time)}</td>
                  <td style={{ padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#475569' }}>{c.ringing_duration_sec != null ? `${c.ringing_duration_sec}s` : '—'}</td>
                  <td style={{ padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#475569' }}>{c.talk_duration_sec != null ? `${c.talk_duration_sec}s` : '—'}</td>
                  <td style={{ padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#3b82f6' }}>{c.recording_url ? <a href={c.recording_url} target="_blank" rel="noopener noreferrer">Play</a> : '—'}</td>
                  <td style={{ padding:'0.85rem 1rem', fontFamily:'monospace', fontSize:'0.72rem', color:'#94a3b8', maxWidth:'120px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.room_name || '—'}</td>
                </tr>
              )) : filtered.map((c, i) => (
                <tr key={c.call_uuid} style={{ borderBottom:'1px solid #f1f5f9', background: i%2===0?'white':'#fafafa' }}>
                  <td style={{ padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#475569', whiteSpace:'nowrap' }}>{fmtDate(c.initiation_time)}</td>
                  <td style={{ padding:'0.85rem 1rem', fontFamily:'monospace', fontSize:'0.82rem' }}>{c.from_number || '—'}</td>
                  <td style={{ padding:'0.85rem 1rem', fontFamily:'monospace', fontSize:'0.82rem', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.to_number || '—'}</td>
                  <td style={{ padding:'0.85rem 1rem' }}>{directionBadge(c.call_direction)}</td>
                  <td style={{ padding:'0.85rem 1rem', fontSize:'0.82rem' }}>{fmtDur(c.call_duration)}</td>
                  <td style={{ padding:'0.85rem 1rem', fontSize:'0.8rem', color:'#dc2626' }}>{c.hangup_cause_name || '—'}</td>
                  <td style={{ padding:'0.85rem 1rem', fontSize:'0.8rem', color:'#475569' }}>{c.total_amount ? `₹${c.total_amount}` : '₹0.00'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div style={{ padding:'1rem 1.5rem', borderTop:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:'0.82rem', color:'#64748b' }}>
            Showing {page*PAGE+1}–{Math.min((page+1)*PAGE, total)} of {total}
          </span>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page===0} style={{ padding:'0.4rem 0.9rem', border:'1px solid #cbd5e1', borderRadius:'6px', background:'white', cursor:'pointer', fontSize:'0.85rem', opacity: page===0?0.4:1 }}>← Prev</button>
            <button onClick={() => setPage(p => p+1)} disabled={(page+1)*PAGE >= total} style={{ padding:'0.4rem 0.9rem', border:'1px solid #cbd5e1', borderRadius:'6px', background:'white', cursor:'pointer', fontSize:'0.85rem', opacity: (page+1)*PAGE>=total?0.4:1 }}>Next →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Live Monitor ─────────────────────────────────────────
function TabMonitor({ agents, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(onRefresh, 10000);
    return () => clearInterval(t);
  }, [autoRefresh, onRefresh]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  const groups = {
    available: agents.filter(a => a.status === 'available'),
    on_call:   agents.filter(a => a.status === 'on_call' || a.status === 'busy'),
    offline:   agents.filter(a => a.status === 'offline'),
  };

  return (
    <div>
      {/* Header controls */}
      <div style={{ background:'white', borderRadius:'12px', padding:'1rem 1.5rem', marginBottom:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background:'#16a34a', boxShadow:'0 0 0 3px #bbf7d0', animation:'pulse 2s infinite' }} />
          <span style={{ fontWeight:600, color:'#1e293b' }}>Live Agent Monitor</span>
          <span style={{ fontSize:'0.8rem', color:'#64748b' }}>Auto-refresh every 10s</span>
        </div>
        <div style={{ display:'flex', gap:'0.75rem', alignItems:'center' }}>
          <label style={{ display:'flex', alignItems:'center', gap:'0.5rem', cursor:'pointer', fontSize:'0.85rem', color:'#475569' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto Refresh
          </label>
          <button onClick={handleRefresh} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.5rem 1rem', background:'#f1f5f9', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:500, fontSize:'0.85rem' }}>
            <RefreshCw size={14} className={refreshing?'spin':''} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
        {[
          { label:'Total Agents', value: agents.length,      color:'#3b82f6', bg:'#eff6ff' },
          { label:'Available',    value: groups.available.length, color:'#16a34a', bg:'#f0fdf4' },
          { label:'On Call',      value: groups.on_call.length,   color:'#7c3aed', bg:'#f5f3ff' },
          { label:'Offline',      value: groups.offline.length,   color:'#64748b', bg:'#f8fafc' },
        ].map(stat => (
          <div key={stat.label} style={{ background:'white', borderRadius:'12px', padding:'1.25rem', border:`2px solid ${stat.color}20`, textAlign:'center', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize:'2rem', fontWeight:800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize:'0.78rem', color:'#64748b', fontWeight:500, marginTop:'0.25rem' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Agent cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:'1rem' }}>
        {agents.map(agent => {
          const statusColor = agent.status === 'available' ? '#16a34a' : agent.status === 'on_call' || agent.status === 'busy' ? '#7c3aed' : '#94a3b8';
          return (
            <div key={agent.id} style={{ background:'white', borderRadius:'12px', padding:'1.25rem', border:`1px solid ${statusColor}30`, boxShadow:'0 1px 3px rgba(0,0,0,0.06)', borderLeft:`4px solid ${statusColor}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.75rem' }}>
                <div>
                  <div style={{ fontWeight:700, color:'#1e293b', fontSize:'0.95rem' }}>{agent.display_name}</div>
                  <div style={{ fontSize:'0.75rem', color:'#94a3b8', marginTop:'0.15rem' }}>{agent.default_calling_mode === 'browser_webrtc' ? '🖥️ Browser' : agent.default_calling_mode === 'mobile' ? '📱 Mobile' : '☎️ External'}</div>
                </div>
                {statusBadge(agent.status)}
              </div>
              <div style={{ fontSize:'0.78rem', color:'#64748b', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {agent.plivo_sip_uri || 'No SIP endpoint assigned'}
              </div>
              {agent.mobile_number && (
                <div style={{ fontSize:'0.78rem', color:'#64748b', marginTop:'0.25rem' }}>📱 {agent.mobile_number}</div>
              )}
            </div>
          );
        })}
        {agents.length === 0 && (
          <div style={{ gridColumn:'1/-1', textAlign:'center', color:'#94a3b8', padding:'3rem' }}>No agents to monitor.</div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Settings ─────────────────────────────────────────────
function TabSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/plivo/admin/settings')
      .then(r => r.json())
      .then(d => { setSettings(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign:'center', padding:'3rem' }}><Loader2 className="spin" size={24} color="#3b82f6" /></div>;

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem' }}>
      {/* Account Info */}
      <div style={{ background:'white', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0' }}>
        <h3 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'1.25rem', color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <Shield size={18} color="#3b82f6" /> Plivo Account
        </h3>
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          {[
            { label: 'Auth ID',          value: process.env.NEXT_PUBLIC_PLIVO_AUTH_ID || 'MAMJFH***' },
            { label: 'From Number',      value: settings?.fromNumber || '+918035340622' },
            { label: 'Default Forward',  value: settings?.defaultForward || 'Not set' },
            { label: 'Data Region',      value: 'India 🇮🇳' },
          ].map(row => (
            <div key={row.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.75rem', background:'#f8fafc', borderRadius:'8px' }}>
              <span style={{ fontSize:'0.85rem', color:'#64748b', fontWeight:500 }}>{row.label}</span>
              <span style={{ fontSize:'0.85rem', color:'#1e293b', fontWeight:600, fontFamily: row.label.includes('ID')||row.label.includes('Number')||row.label.includes('Forward') ? 'monospace' : 'inherit' }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Applications */}
      <div style={{ background:'white', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0' }}>
        <h3 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'1.25rem', color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <Radio size={18} color="#3b82f6" /> Plivo Applications
        </h3>
        {settings?.apps?.length > 0 ? (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            {settings.apps.map(app => (
              <div key={app.app_id} style={{ padding:'0.75rem 1rem', background:'#f8fafc', borderRadius:'8px', borderLeft:'3px solid #3b82f6' }}>
                <div style={{ fontWeight:600, color:'#1e293b', fontSize:'0.9rem' }}>{app.app_name}</div>
                <div style={{ fontSize:'0.75rem', color:'#64748b', marginTop:'0.25rem', fontFamily:'monospace' }}>ID: {app.app_id}</div>
                <div style={{ fontSize:'0.72rem', color:'#94a3b8', marginTop:'0.2rem', wordBreak:'break-all' }}>Answer URL: {app.answer_url}</div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color:'#94a3b8', fontSize:'0.85rem' }}>No applications found.</p>
        )}
      </div>

      {/* Routing Rules */}
      <div style={{ background:'white', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', gridColumn:'1/-1' }}>
        <h3 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'1.25rem', color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <ArrowRight size={18} color="#3b82f6" /> Call Routing Flow
        </h3>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
          {[
            { label:'Inbound Call', color:'#3b82f6' },
            { label:'Sticky Agent Check', color:'#7c3aed' },
            { label:'SIP Registration Verify', color:'#0891b2' },
            { label:'Route to Agent Browser', color:'#16a34a' },
            { label:'Fallback: Department Group', color:'#f59e0b' },
            { label:'Final Fallback: Forward Mobile', color:'#ef4444' },
          ].map((step, i, arr) => (
            <React.Fragment key={step.label}>
              <div style={{ padding:'0.5rem 1rem', background:step.color+'15', border:`1px solid ${step.color}40`, borderRadius:'8px', fontSize:'0.8rem', fontWeight:600, color:step.color }}>
                {i+1}. {step.label}
              </div>
              {i < arr.length-1 && <ChevronRight size={16} color="#94a3b8" />}
            </React.Fragment>
          ))}
        </div>
        <div style={{ marginTop:'1rem', padding:'0.75rem 1rem', background:'#f0f9ff', borderRadius:'8px', border:'1px solid #bae6fd', fontSize:'0.82rem', color:'#0369a1' }}>
          <strong>Note:</strong> Incoming webhook checks real-time Plivo API for SIP registration before routing. If agent's browser is disconnected, the call auto-heals and routes to the next available agent or falls back to <code>{settings?.defaultForward || '+91XXXXXXXXXX'}</code>.
        </div>
      </div>

      {/* Widget Settings */}
      <div style={{ background:'white', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', gridColumn:'1/-1' }}>
        <h3 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'1.25rem', color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <Settings size={18} color="#3b82f6" /> Softphone Preferences (Browser Local)
        </h3>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontWeight:600, color:'#1e293b', fontSize:'0.95rem' }}>Auto-Answer Outbound Calls</div>
            <div style={{ fontSize:'0.8rem', color:'#64748b', marginTop:'0.25rem' }}>When dialing a number, connect immediately without requiring the agent to click "Accept".</div>
          </div>
          <button 
            onClick={() => {
              const current = localStorage.getItem('CRM_AUTO_ANSWER_OUTBOUND') !== 'false';
              localStorage.setItem('CRM_AUTO_ANSWER_OUTBOUND', (!current).toString());
              // Force re-render just to show toggle state
              setSettings({...settings});
            }}
            style={{ background:'none', border:'none', cursor:'pointer' }}
          >
            {localStorage.getItem('CRM_AUTO_ANSWER_OUTBOUND') !== 'false' ? (
              <ToggleRight size={36} color="#10b981" />
            ) : (
              <ToggleLeft size={36} color="#94a3b8" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────
export default function CallAdminModule() {
  const [activeTab, setActiveTab] = useState('agents');
  const [agents, setAgents] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [userData, adminData, endpointsRes] = await Promise.all([
        getTeamMembers(),
        getCallAdminData(),
        fetch('/api/plivo/admin/endpoints').then(r => r.json()).catch(() => ({ endpoints: [] }))
      ]);
      if (userData) setUsers(userData.filter(u => u.emp_name?.trim()));
      setEndpoints(endpointsRes.endpoints || []);
      setAgents(adminData.agents || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:'1rem', color:'#64748b' }}>
      <Loader2 size={32} className="spin" color="#3b82f6" />
      <span>Loading Call Center Administration…</span>
    </div>
  );

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:'#f8fafc' }}>
      {/* Header */}
      <div style={{ padding:'1.5rem 2rem 0', background:'white', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
        <div style={{ marginBottom:'1.25rem' }}>
          <h1 style={{ fontSize:'1.6rem', fontWeight:800, color:'#1e293b', display:'flex', alignItems:'center', gap:'0.6rem', margin:0 }}>
            <Settings size={26} color="#3b82f6" /> Call Center Administration
          </h1>
          <p style={{ color:'#64748b', fontSize:'0.88rem', marginTop:'0.25rem' }}>Manage agents, endpoints, call logs, and routing settings</p>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:'0', borderBottom:'2px solid #f1f5f9' }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display:'flex', alignItems:'center', gap:'0.5rem',
                  padding:'0.75rem 1.25rem',
                  border:'none', background:'transparent', cursor:'pointer',
                  fontSize:'0.88rem', fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#3b82f6' : '#64748b',
                  borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                  marginBottom:'-2px',
                  transition:'all 0.15s', whiteSpace:'nowrap'
                }}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ flex:1, overflowY:'auto', padding:'1.5rem 2rem' }}>
        {activeTab === 'agents' && (
          <TabAgents
            agents={agents}
            endpoints={endpoints}
            users={users}
            onRefresh={fetchData}
            updateCallAgentAdmin={updateCallAgentAdmin}
            addCallAgentAdmin={addCallAgentAdmin}
          />
        )}
        {activeTab === 'endpoints' && <TabEndpoints />}
        {activeTab === 'calllogs' && <TabCallLogs />}
        {activeTab === 'monitor' && <TabMonitor agents={agents} onRefresh={fetchData} />}
        {activeTab === 'settings' && <TabSettings />}
      </div>
    </div>
  );
}
