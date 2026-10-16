'use client';
import MobileTableView from '@/components/common/MobileTableView';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings, Users, Phone, Loader2, RefreshCw, PhoneCall,
  PhoneOff, Clock, Activity, Shield, Wifi, WifiOff,
  CheckCircle, XCircle, AlertCircle, BarChart2, Download,
  Play, Pause,
  UserPlus, Edit2, Trash2, ChevronRight, Server, Radio,
  PhoneIncoming, PhoneOutgoing, ArrowRight, Eye, Filter,
  Calendar, Search, ToggleLeft, ToggleRight, Save, Bell, FileSpreadsheet,
  Plus, X, Key, KeyRound, ShieldCheck, Cpu, Copy
} from 'lucide-react';
import { getTeamMembers, getCallAdminData, addCallAgentAdmin, updateCallAgentAdmin } from '@/app/actions/team';
import { PremiumProgressLoader } from '../PremiumProgressLoader';
import { filterVisibleSubTabs, getSubItemPermissions } from '@/utils/permissionUtils';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';

const CALL_ADMIN_DB_DEFAULT_COL_WIDTHS = {
  time: 170,
  call_uuid: 130,
  agent: 140,
  customer: 140,
  direction: 110,
  status: 110,
  start_time: 160,
  answer_time: 160,
  end_time: 160,
  ringing: 110,
  talk: 110,
  recording: 110,
  room: 130
};

const CALL_ADMIN_DB_MIN_COL_WIDTHS = {
  time: 120,
  call_uuid: 80,
  agent: 90,
  customer: 100,
  direction: 80,
  status: 80,
  start_time: 110,
  answer_time: 110,
  end_time: 110,
  ringing: 80,
  talk: 80,
  recording: 80,
  room: 80
};

const CALL_ADMIN_PLIVO_DEFAULT_COL_WIDTHS = {
  time: 170,
  from: 140,
  to: 160,
  direction: 110,
  duration: 110,
  hangup: 160,
  cost: 110
};

const CALL_ADMIN_PLIVO_MIN_COL_WIDTHS = {
  time: 120,
  from: 100,
  to: 100,
  direction: 80,
  duration: 80,
  hangup: 100,
  cost: 80
};

const CALL_ADMIN_AGENTS_DEFAULT_COL_WIDTHS = {
  agent: 200,
  calling_mode: 180,
  sip_endpoint: 240,
  password_set: 130,
  status: 120,
  actions: 90
};

const CALL_ADMIN_AGENTS_MIN_COL_WIDTHS = {
  agent: 130,
  calling_mode: 130,
  sip_endpoint: 160,
  password_set: 90,
  status: 80,
  actions: 70
};

const CALL_ADMIN_ENDPOINTS_DEFAULT_COL_WIDTHS = {
  alias: 180,
  username: 200,
  sip_uri: 260,
  password: 180,
  app_linked: 130,
  status: 130
};

const CALL_ADMIN_ENDPOINTS_MIN_COL_WIDTHS = {
  alias: 120,
  username: 130,
  sip_uri: 160,
  password: 130,
  app_linked: 90,
  status: 90
};

// ─── Helpers ────────────────────────────────────────────────
const TABS = [
  { id: 'agents',    label: 'Agents & Endpoints', icon: Users },
  { id: 'endpoints', label: 'SIP Endpoints',       icon: Server },
  { id: 'telephony', label: 'Telephony & Seats',   icon: KeyRound },
  { id: 'calllogs',  label: 'Call Logs',           icon: PhoneCall },
  { id: 'monitor',   label: 'Live Monitor',         icon: Activity },
  { id: 'settings',  label: 'Routing & Rules',      icon: Settings },
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

// Strict IST Date Formatter
const fmtDate = (d) => {
  if (!d) return '—';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(date).replace(',', '');
  } catch (e) {
    return '—';
  }
};

const fmtDur  = (s) => {
  if (!s && s !== 0) return '—';
  const m = Math.floor(s/60), sec = s%60;
  return `${m}:${String(sec).padStart(2,'0')}`;
};

// Strict IST Date Boundaries Calculator for API Filters
const getISTDateRange = (preset, customStart, customEnd) => {
  if (preset === 'all') return { startDate: '', endDate: '' };

  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  const istYear = istNow.getUTCFullYear();
  const istMonth = istNow.getUTCMonth();
  const istDay = istNow.getUTCDate();

  const formatIST = (y, m, d, hh = 0, mm = 0, ss = 0) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${y}-${pad(m + 1)}-${pad(d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}+05:30`;
  };

  if (preset === 'today') {
    return {
      startDate: formatIST(istYear, istMonth, istDay, 0, 0, 0),
      endDate: formatIST(istYear, istMonth, istDay, 23, 59, 59)
    };
  }

  if (preset === 'yesterday') {
    const yest = new Date(Date.UTC(istYear, istMonth, istDay - 1));
    const yY = yest.getUTCFullYear();
    const yM = yest.getUTCMonth();
    const yD = yest.getUTCDate();
    return {
      startDate: formatIST(yY, yM, yD, 0, 0, 0),
      endDate: formatIST(yY, yM, yD, 23, 59, 59)
    };
  }

  if (preset === 'last_7_days') {
    const start7 = new Date(Date.UTC(istYear, istMonth, istDay - 6));
    return {
      startDate: formatIST(start7.getUTCFullYear(), start7.getUTCMonth(), start7.getUTCDate(), 0, 0, 0),
      endDate: formatIST(istYear, istMonth, istDay, 23, 59, 59)
    };
  }

  if (preset === 'this_month') {
    return {
      startDate: formatIST(istYear, istMonth, 1, 0, 0, 0),
      endDate: formatIST(istYear, istMonth, istDay, 23, 59, 59)
    };
  }

  if (preset === 'last_month') {
    const firstOfLastMonth = new Date(Date.UTC(istYear, istMonth - 1, 1));
    const lastOfLastMonth = new Date(Date.UTC(istYear, istMonth, 0));
    return {
      startDate: formatIST(firstOfLastMonth.getUTCFullYear(), firstOfLastMonth.getUTCMonth(), 1, 0, 0, 0),
      endDate: formatIST(lastOfLastMonth.getUTCFullYear(), lastOfLastMonth.getUTCMonth(), lastOfLastMonth.getUTCDate(), 23, 59, 59)
    };
  }

  if (preset === 'custom') {
    let s = '', e = '';
    if (customStart) s = `${customStart}T00:00:00+05:30`;
    if (customEnd) e = `${customEnd}T23:59:59+05:30`;
    return { startDate: s, endDate: e };
  }

  return { startDate: '', endDate: '' };
};

// ─── Sub-components ─────────────────────────────────────────

// ── Tab: Agents ──────────────────────────────────────────────
function TabAgents({ agents, endpoints, users, onRefresh, updateCallAgentAdmin, addCallAgentAdmin, userCompany = '', seatQuota = null }) {
  const [saving, setSaving] = useState({});
  const [selectedUserId, setSelectedUserId] = useState('');
  const [adding, setAdding] = useState(false);
  const unassigned = users.filter(u => !agents.some(a => a.user_id === u.user_id));
  const userMap = new Map((users || []).map(u => [u.user_id, u]));

  // Column Resizing Hook (Lead Data Pattern)
  const {
    colWidths,
    resizingCol,
    handleResizeStart,
    resetColWidth,
    getTotalTableWidth
  } = useTableColumnResize(
    'calladmin_agents_col_widths',
    CALL_ADMIN_AGENTS_DEFAULT_COL_WIDTHS,
    CALL_ADMIN_AGENTS_MIN_COL_WIDTHS
  );

  const handleAdd = async () => {
    if (!selectedUserId) return;
    if (seatQuota && !seatQuota.canAdd) {
      alert(`Calling seat limit reached (${seatQuota.used}/${seatQuota.total}). Please increase calling seat allocation in Settings before adding more agents.`);
      return;
    }
    setAdding(true);
    const user = users.find(u => u.user_id === selectedUserId);
    const res = await addCallAgentAdmin(selectedUserId, user?.emp_name || 'Agent', userCompany);
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
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.5rem' }}>
          <h3 style={{ fontSize:'1rem', fontWeight:600, margin:0, display:'flex', alignItems:'center', gap:'0.5rem', color:'#1e293b' }}>
            <UserPlus size={18} color="#3b82f6" /> Add User to Call Center
          </h3>
          {seatQuota && (
            <div style={{
              display:'flex', alignItems:'center', gap:'0.5rem',
              background: seatQuota.canAdd ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${seatQuota.canAdd ? '#bbf7d0' : '#fecaca'}`,
              padding:'0.35rem 0.85rem', borderRadius:'8px', fontSize:'0.82rem'
            }}>
              <Users size={15} color={seatQuota.canAdd ? '#16a34a' : '#dc2626'} />
              <span style={{ fontWeight: 600, color: seatQuota.canAdd ? '#15803d' : '#b91c1c' }}>
                Calling Seats: {seatQuota.used} / {seatQuota.total} Used (HQ + Branches)
              </span>
              {!seatQuota.canAdd && (
                <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: '0.25rem', fontSize:'0.75rem' }}>
                  (Limit Reached)
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            disabled={seatQuota && !seatQuota.canAdd}
            style={{ flex:1, padding:'0.65rem 1rem', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'0.9rem', background:'white' }}
          >
            <option value="">Select Team Member…</option>
            {unassigned.map(u => {
              const loc = u.work_location_name || u.work_location_type || 'Headquarter';
              const dept = u.emp_department || 'General';
              return (
                <option key={u.user_id} value={u.user_id}>
                  {u.emp_name} ({dept} • 🏢 {loc})
                </option>
              );
            })}
          </select>
          <button
            onClick={handleAdd}
            disabled={adding || !selectedUserId || (seatQuota && !seatQuota.canAdd)}
            style={{
              padding:'0.65rem 1.5rem',
              background: (seatQuota && !seatQuota.canAdd) ? '#94a3b8' : '#3b82f6',
              color:'white', border:'none', borderRadius:'8px', fontWeight:600,
              cursor: (seatQuota && !seatQuota.canAdd) ? 'not-allowed' : 'pointer',
              display:'flex', alignItems:'center', gap:'0.5rem',
              opacity: (adding || !selectedUserId || (seatQuota && !seatQuota.canAdd)) ? 0.6 : 1
            }}
          >
            {adding ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />}
            Authorize
          </button>
        </div>
        {seatQuota && !seatQuota.canAdd && (
          <p style={{ color:'#dc2626', fontSize:'0.82rem', marginTop:'0.75rem', fontWeight: 500 }}>
            ⚠️ Calling seat allocation full ({seatQuota.used}/{seatQuota.total}). To add more agents, increase the calling seat quota under Settings.
          </p>
        )}
        {unassigned.length === 0 && (!seatQuota || seatQuota.canAdd) && (
          <p style={{ color:'#94a3b8', fontSize:'0.85rem', marginTop:'0.75rem' }}>All team members are already in the call center.</p>
        )}
      </div>

      {/* Agents Table */}
      <div style={{ background:'white', borderRadius:'12px', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', overflow:'hidden' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h3 style={{ fontSize:'1rem', fontWeight:600, color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <Phone size={18} color="#3b82f6" /> Call Agents ({agents.length})
          </h3>
        </div>
        <div style={{ overflowX:'auto' }}>
          <MobileTableView id="CallCenter/CallAdminModule-1"><table style={{ width: `${getTotalTableWidth()}px`, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead style={{ backgroundColor: 'var(--th-bg)' }}>
              <tr style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                <th style={{ width: `${colWidths.agent}px`, padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Agent</span>
                  </div>
                  <ColumnResizer colKey="agent" isResizing={resizingCol === 'agent'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.calling_mode}px`, padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Calling Mode</span>
                  </div>
                  <ColumnResizer colKey="calling_mode" isResizing={resizingCol === 'calling_mode'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.sip_endpoint}px`, padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>SIP Endpoint</span>
                  </div>
                  <ColumnResizer colKey="sip_endpoint" isResizing={resizingCol === 'sip_endpoint'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.password_set}px`, padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Password Set</span>
                  </div>
                  <ColumnResizer colKey="password_set" isResizing={resizingCol === 'password_set'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.status}px`, padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Status</span>
                  </div>
                  <ColumnResizer colKey="status" isResizing={resizingCol === 'status'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.actions}px`, padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25 }}>Actions</span>
                  </div>
                  <ColumnResizer colKey="actions" isResizing={resizingCol === 'actions'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent, i) => {
                const u = userMap.get(agent.user_id);
                const loc = u?.work_location_name || u?.work_location_type || 'Headquarter';
                const dept = u?.emp_department || '';
                return (
                  <tr key={agent.id || `agent-${i}`} style={{ borderBottom:'1px solid #f1f5f9', background: i%2===0?'white':'#fafafa' }}>
                    <td style={{ width: `${colWidths.agent}px`, padding:'1rem', fontWeight:600, fontSize:'0.9rem', color:'#1e293b', boxSizing: 'border-box', verticalAlign: 'top' }} title={agent.display_name}>
                      <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}>{agent.display_name}</div>
                      {agent.mobile_number && <div style={{ fontSize:'0.75rem', color:'#94a3b8', whiteSpace: 'normal', wordBreak: 'break-word', marginTop: '0.2rem' }}>{agent.mobile_number}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                        {dept && (
                          <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#475569', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                            {dept}
                          </span>
                        )}
                        <span style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#047857', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                          🏢 {loc}
                        </span>
                      </div>
                    </td>
                  <td style={{ width: `${colWidths.calling_mode}px`, padding:'1rem', boxSizing: 'border-box' }}>
                    <select
                      value={agent.default_calling_mode || 'browser_webrtc'}
                      onChange={e => handleUpdate(agent.id, 'default_calling_mode', e.target.value)}
                      style={{ padding:'0.4rem 0.6rem', borderRadius:'6px', border:'1px solid #cbd5e1', fontSize:'0.85rem', background:'white', cursor:'pointer', width: '100%', maxWidth: '100%' }}
                    >
                      <option value="browser_webrtc">🖥️ Browser WebRTC</option>
                      <option value="mobile">📱 Mobile Number</option>
                      <option value="external_softphone">☎️ External Softphone</option>
                    </select>
                  </td>
                  <td style={{ width: `${colWidths.sip_endpoint}px`, padding:'1rem', boxSizing: 'border-box' }}>
                    <select
                      value={agent.plivo_endpoint_key || ''}
                      onChange={e => handleEndpoint(agent.id, e.target.value)}
                      style={{ padding:'0.4rem 0.6rem', borderRadius:'6px', border:'1px solid #cbd5e1', fontSize:'0.85rem', background:'white', width: '100%', maxWidth: '100%', cursor:'pointer' }}
                    >
                      <option value="">— No Endpoint —</option>
                      {endpoints.map((ep, epIdx) => {
                        const epKey = ep.endpoint_id || ep.endpoint_key || `ep-${epIdx}`;
                        return <option key={epKey} value={epKey}>{ep.alias}</option>;
                      })}
                    </select>
                    {agent.plivo_sip_uri && (
                      <div style={{ fontSize:'0.7rem', color:'#94a3b8', marginTop:'0.2rem', fontFamily:'monospace', whiteSpace: 'normal', wordBreak: 'break-all', lineHeight: 1.25 }} title={agent.plivo_sip_uri}>
                        {agent.plivo_sip_uri}
                      </div>
                    )}
                  </td>
                  <td style={{ width: `${colWidths.password_set}px`, padding:'1rem', boxSizing: 'border-box' }}>
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
                  <td style={{ width: `${colWidths.status}px`, padding:'1rem', boxSizing: 'border-box' }}>{statusBadge(agent.status)}</td>
                  <td style={{ width: `${colWidths.actions}px`, padding:'1rem', boxSizing: 'border-box' }}>
                    {saving[agent.id]
                      ? <Loader2 size={16} className="spin" color="#3b82f6" />
                      : <CheckCircle size={16} color="#16a34a" />}
                  </td>
                </tr>
              );
            })}
              {agents.length === 0 && (
                <tr><td colSpan="6" style={{ padding:'3rem', textAlign:'center', color:'#94a3b8' }}>No call center agents yet. Add a team member above.</td></tr>
              )}
            </tbody>
          </table></MobileTableView>
        </div>
      </div>
    </div>
  );
}

// ── Tab: SIP Endpoints ────────────────────────────────────────
function TabEndpoints({ userCompany = '', tenantId = null, agents = [], onRefresh = null }) {
  const [endpoints, setEndpoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Endpoint Creation Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [assignAgentId, setAssignAgentId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const {
    colWidths,
    resizingCol,
    handleResizeStart,
    resetColWidth,
    getTotalTableWidth
  } = useTableColumnResize(
    'calladmin_endpoints_col_widths',
    CALL_ADMIN_ENDPOINTS_DEFAULT_COL_WIDTHS,
    CALL_ADMIN_ENDPOINTS_MIN_COL_WIDTHS
  );

  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [copiedEndpoint, setCopiedEndpoint] = useState(null);

  const togglePasswordVisibility = (key) => {
    setVisiblePasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopyPassword = (pwd, key) => {
    if (!pwd) return;
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(pwd);
      setCopiedEndpoint(key);
      setTimeout(() => setCopiedEndpoint(null), 2500);
    } else {
      prompt("Copy SIP password:", pwd);
    }
  };

  const handleUpdatePassword = async (ep) => {
    const newPwd = prompt(`Enter new SIP Password for "${ep.alias}" (${ep.username}):`, ep.password || '');
    if (!newPwd || !newPwd.trim()) return;

    try {
      const res = await fetch('/api/plivo/admin/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_password',
          endpointId: ep.endpoint_id,
          username: ep.username,
          password: newPwd.trim(),
          company: userCompany,
          tenantId: tenantId
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update password');
      }
      alert('Password updated successfully on Plivo and CRM!');
      await fetchEndpoints();
      if (onRefresh) await onRefresh();
    } catch (err) {
      alert('Error updating password: ' + err.message);
    }
  };

  const handleUpdateAlias = async (ep) => {
    const currentAlias = ep.alias || '';
    const newAlias = prompt(`Enter new Friendly Name / Alias for endpoint (${ep.username}):`, currentAlias);
    if (newAlias === null) return;
    const trimmed = newAlias.trim();
    if (!trimmed) {
      alert('Alias cannot be empty!');
      return;
    }
    if (trimmed === currentAlias) return;

    try {
      const res = await fetch('/api/plivo/admin/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_alias',
          endpointId: ep.endpoint_id,
          username: ep.username,
          alias: trimmed,
          company: userCompany,
          tenantId: tenantId
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update alias');
      }
      alert(`Endpoint alias updated to "${trimmed}"!`);
      await fetchEndpoints();
      if (onRefresh) await onRefresh();
    } catch (err) {
      alert('Error updating alias: ' + err.message);
    }
  };

  const fetchEndpoints = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (userCompany) q.set('company', userCompany);
      if (tenantId) q.set('tenant_id', tenantId);
      const res = await fetch(`/api/plivo/admin/endpoints?${q.toString()}`);
      const data = await res.json();
      setEndpoints(data.endpoints || []);
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [userCompany, tenantId]);

  useEffect(() => { fetchEndpoints(); }, [fetchEndpoints]);

  const generateRandomCredentials = () => {
    const rand = Math.random().toString(36).substring(2, 7);
    const cleanComp = (userCompany || 'agent').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    setNewUsername(`ep_${cleanComp}_${rand}`);
    setNewPassword(`Sip#${Math.random().toString(36).substring(2, 8)}!${Math.floor(100 + Math.random() * 900)}`);
  };

  const handleCreateEndpoint = async (e) => {
    if (e) e.preventDefault();
    if (!newAlias.trim()) { setCreateError('Alias is required'); return; }
    if (!newUsername.trim()) { setCreateError('Username is required'); return; }
    if (!newPassword.trim()) { setCreateError('Password is required'); return; }
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/plivo/admin/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: userCompany,
          tenant_id: tenantId,
          alias: newAlias.trim(),
          username: newUsername.trim().toLowerCase(),
          password: newPassword.trim(),
          assignToAgentId: assignAgentId || null
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create endpoint');
      }
      setShowCreateModal(false);
      setNewAlias('');
      setNewUsername('');
      setNewPassword('');
      setAssignAgentId('');
      await fetchEndpoints();
      if (onRefresh) await onRefresh();
      alert(`Endpoint "${data.alias || newAlias}" created successfully!`);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

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
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem' }}>
          <h3 style={{ fontSize:'1rem', fontWeight:600, color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem', margin:0 }}>
            <Server size={18} color="#3b82f6" /> Plivo SIP Endpoints
          </h3>
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
            {lastRefresh && <span style={{ fontSize:'0.75rem', color:'#94a3b8' }}>Updated {lastRefresh.toLocaleTimeString()}</span>}
            <button
              onClick={() => {
                generateRandomCredentials();
                setCreateError('');
                setShowCreateModal(true);
              }}
              style={{
                display:'flex', alignItems:'center', gap:'0.4rem',
                padding:'0.5rem 1rem', background:'#2563eb', color:'white',
                border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.85rem', fontWeight:600,
                boxShadow:'0 1px 2px rgba(37,99,235,0.2)'
              }}
            >
              <Plus size={15} /> Create SIP Endpoint
            </button>
            <button onClick={fetchEndpoints} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.5rem 1rem', background:'#f1f5f9', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.85rem', fontWeight:500 }}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <MobileTableView id="CallCenter/CallAdminModule-2"><table style={{ width: `${getTotalTableWidth()}px`, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead style={{ backgroundColor: 'var(--th-bg)' }}>
              <tr style={{ fontSize:'0.78rem', textTransform:'uppercase', color:'var(--text-secondary)' }}>
                {[
                  { key: 'alias', label: 'Alias', width: colWidths.alias },
                  { key: 'username', label: 'Username', width: colWidths.username },
                  { key: 'sip_uri', label: 'SIP URI', width: colWidths.sip_uri },
                  { key: 'password', label: 'SIP Password', width: colWidths.password },
                  { key: 'app_linked', label: 'App Linked', width: colWidths.app_linked },
                  { key: 'status', label: 'Status', width: colWidths.status },
                ].map(col => (
                  <th
                    key={col.key}
                    style={{
                      width: `${col.width}px`,
                      padding: '0.75rem 1rem',
                      textAlign: 'left',
                      fontWeight: 600,
                      position: 'relative',
                      boxSizing: 'border-box'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      lineHeight: 1.25,
                      paddingRight: '10px'
                    }}>
                      <span>{col.label}</span>
                    </div>
                    <ColumnResizer
                      colKey={col.key}
                      isResizing={resizingCol === col.key}
                      onResizeStart={handleResizeStart}
                      onReset={resetColWidth}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ padding:'3rem', textAlign:'center', color:'#94a3b8' }}><Loader2 className="spin" size={24} /></td></tr>
              ) : endpoints.map((ep, i) => (
                <tr key={ep.endpoint_id || ep.endpoint_key || ep.id || `ep-row-${i}`} style={{ borderBottom:'1px solid #f1f5f9', background: i%2===0?'white':'#fafafa' }}>
                  <td style={{ width: `${colWidths.alias}px`, padding:'0.85rem 1rem', boxSizing: 'border-box', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                      <span style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }} title={ep.alias}>
                        {ep.alias}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateAlias(ep)}
                        title="Edit Endpoint Alias / Friendly Name"
                        style={{
                          padding: '0.15rem 0.45rem',
                          fontSize: '0.72rem',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          background: 'white',
                          cursor: 'pointer',
                          color: '#2563eb',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          flexShrink: 0
                        }}
                      >
                        <Edit2 size={12} /> Rename
                      </button>
                    </div>
                  </td>
                  <td style={{ width: `${colWidths.username}px`, padding:'1rem', fontFamily:'monospace', fontSize:'0.8rem', color:'#475569', boxSizing: 'border-box', whiteSpace: 'normal', wordBreak: 'break-all', lineHeight: 1.3, verticalAlign: 'top' }} title={ep.username}>{ep.username}</td>
                  <td style={{ width: `${colWidths.sip_uri}px`, padding:'1rem', fontFamily:'monospace', fontSize:'0.78rem', color:'#64748b', boxSizing: 'border-box', whiteSpace: 'normal', wordBreak: 'break-all', lineHeight: 1.3, verticalAlign: 'top' }} title={ep.sip_uri}>{ep.sip_uri}</td>
                  <td style={{ width: `${colWidths.password}px`, padding:'1rem', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: ep.password ? '#1e293b' : '#94a3b8' }}>
                        {ep.password
                          ? (visiblePasswords[ep.endpoint_id || ep.endpoint_key] ? ep.password : '••••••••')
                          : 'Not Stored'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {ep.password && (
                          <>
                            <button
                              type="button"
                              onClick={() => togglePasswordVisibility(ep.endpoint_id || ep.endpoint_key)}
                              title={visiblePasswords[ep.endpoint_id || ep.endpoint_key] ? 'Hide Password' : 'Show Password'}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#64748b', display: 'flex' }}
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyPassword(ep.password, ep.endpoint_id || ep.endpoint_key)}
                              title="Copy Password"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: copiedEndpoint === (ep.endpoint_id || ep.endpoint_key) ? '#16a34a' : '#64748b', display: 'flex' }}
                            >
                              {copiedEndpoint === (ep.endpoint_id || ep.endpoint_key) ? <CheckCircle size={14} color="#16a34a" /> : <Copy size={14} />}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleUpdatePassword(ep)}
                          title="Set or Change SIP Password"
                          style={{ padding: '0.15rem 0.45rem', fontSize: '0.72rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', color: '#2563eb', fontWeight: 600 }}
                        >
                          {ep.password ? 'Edit' : 'Set'}
                        </button>
                      </div>
                    </div>
                  </td>
                  <td style={{ width: `${colWidths.app_linked}px`, padding:'1rem', boxSizing: 'border-box' }}>
                    {ep.application
                      ? <span style={{ color:'#16a34a', fontSize:'0.8rem', display:'flex', alignItems:'center', gap:'0.3rem' }}><CheckCircle size={13}/>Linked</span>
                      : <span style={{ color:'#dc2626', fontSize:'0.8rem', display:'flex', alignItems:'center', gap:'0.3rem' }}><XCircle size={13}/>No App</span>}
                  </td>
                  <td style={{ width: `${colWidths.status}px`, padding:'1rem', boxSizing: 'border-box' }}>{sipBadge(ep.sip_registered)}</td>
                </tr>
              ))}
              {endpoints.length === 0 && !loading && (
                <tr>
                  <td colSpan="6" style={{ padding:'3.5rem 2rem', textAlign:'center', color:'#64748b' }}>
                    <div style={{ maxWidth: '440px', margin: '0 auto' }}>
                      <Server size={36} color="#94a3b8" style={{ margin: '0 auto 0.75rem' }} />
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem', marginBottom: '0.35rem' }}>
                        No SIP Endpoints Registered
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5, marginBottom: '1rem' }}>
                        Create a Plivo SIP endpoint using the button above to assign softphone calling lines to telecallers.
                      </div>
                      <button
                        onClick={() => {
                          generateRandomCredentials();
                          setCreateError('');
                          setShowCreateModal(true);
                        }}
                        style={{
                          padding:'0.5rem 1rem', background:'#2563eb', color:'white',
                          border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.85rem', fontWeight:600
                        }}
                      >
                        <Plus size={15} style={{ display:'inline', verticalAlign:'middle', marginRight:'4px' }} />
                        Create First Endpoint
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table></MobileTableView>
        </div>
      </div>

      {/* Direct Plivo SIP Endpoint Creation Modal */}
      {showCreateModal && (
        <div style={{
          position:'fixed', inset:0, zIndex:9999,
          background:'rgba(15,23,42,0.6)', backdropFilter:'blur(4px)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem'
        }}>
          <div style={{
            background:'white', borderRadius:'14px', maxWidth:'520px', width:'100%',
            boxShadow:'0 20px 25px -5px rgba(0,0,0,0.2)', border:'1px solid #e2e8f0',
            overflow:'hidden'
          }}>
            <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.6rem' }}>
                <div style={{ width:36, height:36, borderRadius:'8px', background:'#eff6ff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Server size={18} color="#2563eb" />
                </div>
                <div>
                  <h3 style={{ margin:0, fontSize:'1.05rem', fontWeight:700, color:'#1e293b' }}>Create Plivo SIP Endpoint</h3>
                  <p style={{ margin:0, fontSize:'0.75rem', color:'#64748b' }}>Creates live endpoint on Plivo API instantly</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', padding:'4px', display:'flex' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateEndpoint} style={{ padding:'1.5rem', display:'flex', flexDirection:'column', gap:'1.1rem' }}>
              {createError && (
                <div style={{ padding:'0.75rem 1rem', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'8px', color:'#dc2626', fontSize:'0.82rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                  <AlertCircle size={16} />
                  <span>{createError}</span>
                </div>
              )}

              <div>
                <label style={{ display:'block', fontSize:'0.82rem', fontWeight:600, color:'#334155', marginBottom:'0.35rem' }}>
                  Endpoint Alias / Friendly Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sales Desk 1 or Telecaller Seat 3"
                  value={newAlias}
                  onChange={e => setNewAlias(e.target.value)}
                  style={{ width:'100%', boxSizing:'border-box', padding:'0.6rem 0.85rem', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'0.88rem' }}
                  required
                />
              </div>

              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.35rem' }}>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, color:'#334155' }}>
                    SIP Username *
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomCredentials}
                    style={{ background:'none', border:'none', color:'#2563eb', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}
                  >
                    🎲 Auto Generate
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. ep_telecaller_01 (lowercase letters/digits)"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  style={{ width:'100%', boxSizing:'border-box', padding:'0.6rem 0.85rem', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'0.88rem', fontFamily:'monospace' }}
                  required
                />
              </div>

              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.35rem' }}>
                  <label style={{ fontSize:'0.82rem', fontWeight:600, color:'#334155' }}>
                    SIP Password *
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewPassword(`Sip#${Math.random().toString(36).substring(2, 8)}!${Math.floor(100 + Math.random() * 900)}`)}
                    style={{ background:'none', border:'none', color:'#2563eb', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}
                  >
                    🎲 New Password
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Secure password for WebRTC / Softphone registration"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  style={{ width:'100%', boxSizing:'border-box', padding:'0.6rem 0.85rem', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'0.88rem', fontFamily:'monospace' }}
                  required
                />
              </div>

              {agents?.length > 0 && (
                <div>
                  <label style={{ display:'block', fontSize:'0.82rem', fontWeight:600, color:'#334155', marginBottom:'0.35rem' }}>
                    Assign Directly to Agent (Optional)
                  </label>
                  <select
                    value={assignAgentId}
                    onChange={e => setAssignAgentId(e.target.value)}
                    style={{ width:'100%', boxSizing:'border-box', padding:'0.6rem 0.85rem', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'0.88rem', background:'white' }}
                  >
                    <option value="">— Leave Unassigned (Keep Available in Pool) —</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.display_name} {a.plivo_endpoint_key ? '(Has Endpoint)' : '(No Endpoint)'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem', marginTop:'0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                  style={{ padding:'0.6rem 1.25rem', borderRadius:'8px', border:'1px solid #cbd5e1', background:'white', color:'#475569', fontWeight:600, fontSize:'0.85rem', cursor:'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    padding:'0.6rem 1.4rem', borderRadius:'8px', border:'none',
                    background:'#2563eb', color:'white', fontWeight:700, fontSize:'0.85rem',
                    cursor:'pointer', display:'flex', alignItems:'center', gap:'0.5rem',
                    opacity: creating ? 0.7 : 1
                  }}
                >
                  {creating ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                  {creating ? 'Creating on Plivo...' : 'Create Endpoint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Call Logs ────────────────────────────────────────────
function TabCallLogs({ userCompany = '', tenantId = null }) {
  const [calls, setCalls] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('db');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  // Column Resizing for DB and Plivo tables
  const dbColResize = useTableColumnResize(
    'calladmin_db_col_widths',
    CALL_ADMIN_DB_DEFAULT_COL_WIDTHS,
    CALL_ADMIN_DB_MIN_COL_WIDTHS
  );

  const plivoColResize = useTableColumnResize(
    'calladmin_plivo_col_widths',
    CALL_ADMIN_PLIVO_DEFAULT_COL_WIDTHS,
    CALL_ADMIN_PLIVO_MIN_COL_WIDTHS
  );

  // Lead Data Page Size settings (from crmPageNavSettings)
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const settings = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (settings.defaultPageSize) {
          if (settings.defaultPageSize === 'All') return 10000;
          return parseInt(settings.defaultPageSize, 10) || 20;
        }
      } catch (e) {}
    }
    return 20;
  });

  const [availablePageSizes, setAvailablePageSizes] = useState(() => {
    let sizes = [10, 20, 50, 100];
    if (typeof window !== 'undefined') {
      try {
        const settings = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (settings.availablePageSizes) {
          const parsed = settings.availablePageSizes.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
          if (parsed.length > 0) sizes = parsed;
        }
      } catch (e) {}
    }
    return sizes;
  });

  useEffect(() => {
    const handleNavUpdate = () => {
      try {
        const cached = localStorage.getItem('crmPageNavSettings');
        if (cached) {
          const settings = JSON.parse(cached);
          if (settings.defaultPageSize !== undefined) {
            let size = 20;
            if (settings.defaultPageSize === 'All') size = 10000;
            else size = parseInt(settings.defaultPageSize, 10) || 20;
            setPageSize(size);
          }
          if (settings.availablePageSizes) {
            const sizes = settings.availablePageSizes.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
            if (sizes.length > 0) setAvailablePageSizes(sizes);
          }
        }
      } catch (e) {}
    };

    window.addEventListener('crm_page_nav_updated', handleNavUpdate);
    window.addEventListener('crm_config_updated', handleNavUpdate);
    return () => {
      window.removeEventListener('crm_page_nav_updated', handleNavUpdate);
      window.removeEventListener('crm_config_updated', handleNavUpdate);
    };
  }, []);

  // Quick Date Presets (Strict IST)
  const [datePreset, setDatePreset] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Audio Playback
  const [playingCallId, setPlayingCallId] = useState(null);
  const [audio] = useState(() => typeof window !== 'undefined' ? new Audio() : null);

  // Multi-Page Persistent Row Selection (Map of rowSelectId -> call object)
  const [selectedCallsMap, setSelectedCallsMap] = useState(new Map());

  // Zipping & Excel Export states
  const [zippingProgress, setZippingProgress] = useState(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  useEffect(() => {
    if (!audio) return;
    const handleEnded = () => setPlayingCallId(null);
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [audio]);

  const togglePlay = (callId, url) => {
    if (playingCallId === callId) {
      audio.pause();
      setPlayingCallId(null);
    } else {
      audio.src = url;
      audio.play().catch(err => console.error("Playback failed:", err));
      setPlayingCallId(callId);
    }
  };

  // Only clear selection when switching source (DB <-> Plivo), NEVER on page change!
  useEffect(() => {
    setSelectedCallsMap(new Map());
    if (audio) {
      audio.pause();
      setPlayingCallId(null);
    }
  }, [source]);

  const fetchLogs = useCallback(async (src, pg, pSize, preset, cStart, cEnd) => {
    setLoading(true);
    try {
      const { startDate, endDate } = getISTDateRange(preset, cStart, cEnd);
      let queryUrl = `/api/plivo/admin/call-logs?source=${src}&limit=${pSize}&offset=${pg * pSize}`;
      if (userCompany) queryUrl += `&company=${encodeURIComponent(userCompany)}`;
      if (tenantId) queryUrl += `&tenant_id=${encodeURIComponent(tenantId)}`;
      if (startDate) queryUrl += `&start_date=${encodeURIComponent(startDate)}`;
      if (endDate) queryUrl += `&end_date=${encodeURIComponent(endDate)}`;

      const res = await fetch(queryUrl);
      const data = await res.json();
      setCalls(data.calls || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error('fetchLogs error:', e);
    } finally {
      setLoading(false);
    }
  }, [userCompany, tenantId]);

  useEffect(() => {
    fetchLogs(source, page, pageSize, datePreset, customStartDate, customEndDate);
  }, [source, page, pageSize, datePreset, customStartDate, customEndDate, fetchLogs]);

  const filtered = search
    ? calls.filter(c => JSON.stringify(c).toLowerCase().includes(search.toLowerCase()))
    : calls;

  // Multi-page persistent selection handlers
  const isAllCurrentPageSelected = filtered.length > 0 && filtered.every((c, i) => {
    const id = c.id || c.call_uuid || `row-${i}`;
    return selectedCallsMap.has(id);
  });

  const toggleSelectAllCurrentPage = () => {
    setSelectedCallsMap(prev => {
      const next = new Map(prev);
      if (isAllCurrentPageSelected) {
        filtered.forEach((c, i) => {
          const id = c.id || c.call_uuid || `row-${i}`;
          next.delete(id);
        });
      } else {
        filtered.forEach((c, i) => {
          const id = c.id || c.call_uuid || `row-${i}`;
          next.set(id, c);
        });
      }
      return next;
    });
  };

  const toggleSelectRow = (call, id) => {
    setSelectedCallsMap(prev => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.set(id, call);
      }
      return next;
    });
  };

  // Bulk ZIP Download
  const downloadBulkRecordingsZip = async () => {
    const selectedList = Array.from(selectedCallsMap.values()).filter(c => c.recording_url);
    if (selectedList.length === 0) {
      alert("No call recordings selected for download. Please select calls that have a recording URL.");
      return;
    }

    setZippingProgress({ current: 0, total: selectedList.length });
    try {
      const JSZip = (await import('jszip')).default;
      const { saveAs } = await import('file-saver');
      const zip = new JSZip();
      const folder = zip.folder("call_recordings");

      let downloadedCount = 0;
      for (let i = 0; i < selectedList.length; i++) {
        const c = selectedList[i];
        setZippingProgress({ current: i + 1, total: selectedList.length });
        try {
          const resp = await fetch(c.recording_url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const blob = await resp.blob();

          const timeStr = c.created_at ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(c.created_at)) : 'rec';
          const agentName = (c.call_agents?.display_name || 'agent').replace(/[^a-zA-Z0-9_-]/g, '_');
          const customerNum = (c.customer_number || 'customer').replace(/[^0-9+]/g, '');
          const filename = `${timeStr}_${agentName}_${customerNum}_${c.id || i + 1}.mp3`;

          folder.file(filename, blob);
          downloadedCount++;
        } catch (err) {
          console.warn(`Failed to download recording for call ${c.id}:`, err);
        }
      }

      if (downloadedCount === 0) {
        alert("Failed to download selected recordings. They may be blocked by network or CORS.");
        return;
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const nowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      saveAs(zipBlob, `Call_Recordings_${nowStr}.zip`);
    } catch (err) {
      console.error("ZIP creation failed:", err);
      alert("Failed to create ZIP file: " + err.message);
    } finally {
      setZippingProgress(null);
    }
  };

  // Excel Export for DB Records & Plivo CDR
  const exportToExcel = async () => {
    setExportingExcel(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const { saveAs } = await import('file-saver');

      const workbook = new ExcelJS.Workbook();
      const recordsToExport = selectedCallsMap.size > 0 
        ? Array.from(selectedCallsMap.values()) 
        : filtered;

      if (recordsToExport.length === 0) {
        alert("No call records found to export.");
        return;
      }

      const nowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

      if (source === 'db') {
        const worksheet = workbook.addWorksheet('DB Call Records');
        worksheet.columns = [
          { header: 'Call Date/Time (IST)', key: 'time', width: 22 },
          { header: 'Call UUID', key: 'call_uuid', width: 36 },
          { header: 'Agent Name', key: 'agent', width: 24 },
          { header: 'Customer Number', key: 'customer', width: 18 },
          { header: 'Direction', key: 'direction', width: 14 },
          { header: 'Status', key: 'status', width: 14 },
          { header: 'Start Time (IST)', key: 'start_time', width: 22 },
          { header: 'Answer Time (IST)', key: 'answer_time', width: 22 },
          { header: 'End Time (IST)', key: 'end_time', width: 22 },
          { header: 'Ringing Duration (s)', key: 'ringing', width: 18 },
          { header: 'Talk Duration (s)', key: 'talk', width: 16 },
          { header: 'Recording URL', key: 'recording', width: 45 },
          { header: 'Room Name', key: 'room', width: 20 }
        ];

        recordsToExport.forEach(c => {
          worksheet.addRow({
            time: fmtDate(c.created_at),
            call_uuid: c.agent_call_uuid || c.customer_call_uuid || c.id || '—',
            agent: c.call_agents?.display_name || '—',
            customer: c.customer_number || '—',
            direction: (c.direction || 'outbound').toUpperCase(),
            status: (c.status || '—').toUpperCase(),
            start_time: fmtDate(c.start_time),
            answer_time: fmtDate(c.agent_answer_time || c.customer_answer_time),
            end_time: fmtDate(c.end_time),
            ringing: c.ringing_duration_sec != null ? c.ringing_duration_sec : '—',
            talk: c.talk_duration_sec != null ? c.talk_duration_sec : '—',
            recording: c.recording_url || '—',
            room: c.room_name || '—'
          });
        });

        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E3A8A' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 24;

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Call_Logs_DB_Records_${nowStr}.xlsx`);
      } else {
        const worksheet = workbook.addWorksheet('Plivo CDR Records');
        worksheet.columns = [
          { header: 'Call Time (IST)', key: 'time', width: 22 },
          { header: 'Call UUID', key: 'call_uuid', width: 36 },
          { header: 'From Number', key: 'from', width: 20 },
          { header: 'To Number', key: 'to', width: 24 },
          { header: 'Direction', key: 'direction', width: 14 },
          { header: 'Duration', key: 'duration', width: 14 },
          { header: 'Hangup Cause', key: 'hangup', width: 24 },
          { header: 'Total Cost', key: 'cost', width: 14 }
        ];

        recordsToExport.forEach(c => {
          worksheet.addRow({
            time: fmtDate(c.initiation_time),
            call_uuid: c.call_uuid || '—',
            from: c.from_number || '—',
            to: c.to_number || '—',
            direction: (c.call_direction || '—').toUpperCase(),
            duration: fmtDur(c.call_duration),
            hangup: c.hangup_cause_name || '—',
            cost: c.total_amount ? `₹${c.total_amount}` : '₹0.00'
          });
        });

        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0D9488' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 24;

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Call_Logs_Plivo_CDR_${nowStr}.xlsx`);
      }
    } catch (err) {
      console.error("Export Excel failed:", err);
      alert("Failed to export Excel: " + err.message);
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div>
      {/* Controls */}
      <div style={{ background:'white', borderRadius:'12px', padding:'1rem 1.25rem', marginBottom:'1.25rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
        {/* Source Switcher */}
        <div style={{ display:'flex', background:'#f1f5f9', borderRadius:'8px', padding:'0.25rem' }}>
          {[{v:'db',l:'📂 DB Records'},{v:'plivo',l:'☁️ Plivo CDR'}].map(opt => (
            <button key={opt.v} onClick={() => { setSource(opt.v); setPage(0); setCalls([]); }}
              style={{ padding:'0.45rem 0.9rem', borderRadius:'6px', border:'none', cursor:'pointer', fontWeight:600, fontSize:'0.82rem', background: source===opt.v?'white':'transparent', color: source===opt.v?'#1e293b':'#64748b', boxShadow: source===opt.v?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
              {opt.l}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div style={{ position:'relative', flex:1, minWidth:'180px' }}>
          <Search size={15} style={{ position:'absolute', left:'0.75rem', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
          <input
            placeholder="Search calls…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width:'100%', padding:'0.55rem 1rem 0.55rem 2.25rem', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'0.85rem', background:'white', boxSizing:'border-box' }}
          />
        </div>

        {/* Quick Date Presets (Strict IST) */}
        <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.35rem', background:'#f8fafc', padding:'0.35rem 0.6rem', borderRadius:'8px', border:'1px solid #cbd5e1' }}>
            <Calendar size={14} color="#64748b" />
            <select
              value={datePreset}
              onChange={(e) => {
                setDatePreset(e.target.value);
                setPage(0);
              }}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#1e293b',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="all">📅 All Time</option>
              <option value="today">⚡ Today (IST)</option>
              <option value="yesterday">⏪ Yesterday (IST)</option>
              <option value="last_7_days">📆 Last 7 Days (IST)</option>
              <option value="this_month">🗓️ This Month (IST)</option>
              <option value="last_month">⏮️ Last Month (IST)</option>
              <option value="custom">🛠️ Custom Range</option>
            </select>
          </div>

          {datePreset === 'custom' && (
            <div style={{ display:'flex', alignItems:'center', gap:'0.3rem' }}>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => { setCustomStartDate(e.target.value); setPage(0); }}
                style={{ padding:'0.35rem 0.5rem', borderRadius:'6px', border:'1px solid #cbd5e1', fontSize:'0.8rem', background:'white' }}
              />
              <span style={{ fontSize:'0.8rem', color:'#94a3b8' }}>to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => { setCustomEndDate(e.target.value); setPage(0); }}
                style={{ padding:'0.35rem 0.5rem', borderRadius:'6px', border:'1px solid #cbd5e1', fontSize:'0.8rem', background:'white' }}
              />
            </div>
          )}
        </div>

        {/* Excel Export Button */}
        <button 
          onClick={exportToExcel} 
          disabled={exportingExcel}
          style={{ 
            display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.55rem 0.9rem', 
            background:'#0284c7', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', 
            fontWeight:600, fontSize:'0.82rem', boxShadow:'0 1px 2px rgba(0,0,0,0.05)'
          }}
          title={selectedCallsMap.size > 0 ? `Export ${selectedCallsMap.size} selected records to Excel` : "Export current records to Excel"}
        >
          <FileSpreadsheet size={14} /> {exportingExcel ? 'Exporting...' : 'Export Excel'}
        </button>

        {/* Refresh Button */}
        <button 
          onClick={() => fetchLogs(source, page, pageSize, datePreset, customStartDate, customEndDate)} 
          style={{ 
            display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.55rem 0.9rem', 
            background:'#3b82f6', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', 
            fontWeight:600, fontSize:'0.82rem', boxShadow:'0 1px 2px rgba(0,0,0,0.05)'
          }}
        >
          <RefreshCw size={14} className={loading?'spin':''} /> Refresh
        </button>

        {/* Total Records Badge */}
        <span style={{ color:'#64748b', fontSize:'0.82rem', background:'#f1f5f9', padding:'0.4rem 0.75rem', borderRadius:'6px' }}>
          Total: <strong style={{ color:'#0f172a' }}>{total}</strong>
        </span>
      </div>

      {/* Multi-Page Persistent Selection Banner */}
      {source === 'db' && selectedCallsMap.size > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 1.25rem',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: '10px',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#065f46', fontWeight: 700 }}>
            <CheckCircle size={17} color="#059669" />
            <span>{selectedCallsMap.size} call record{selectedCallsMap.size > 1 ? 's' : ''} selected across pages</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={downloadBulkRecordingsZip}
              disabled={zippingProgress !== null}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.85rem',
                background: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.82rem',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              <Download size={13} /> {zippingProgress ? `Zipping (${zippingProgress.current}/${zippingProgress.total})...` : `Download Recordings ZIP (${Array.from(selectedCallsMap.values()).filter(c => c.recording_url).length})`}
            </button>
            <button
              onClick={exportToExcel}
              disabled={exportingExcel}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.85rem',
                background: '#1e3a8a',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.82rem',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              <FileSpreadsheet size={13} /> Export Selected ({selectedCallsMap.size}) to Excel
            </button>
            <button
              onClick={() => setSelectedCallsMap(new Map())}
              style={{
                padding: '0.4rem 0.75rem',
                background: 'white',
                color: '#ef4444',
                border: '1px solid #fca5a5',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.82rem'
              }}
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

        {/* Main Table */}
        <div style={{ background:'white', borderRadius:'12px', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <MobileTableView id="CallCenter/CallAdminModule-3"><table style={{ width: source === 'db' ? `${Math.max(1400, dbColResize.getTotalTableWidth() + 40)}px` : `${Math.max(900, plivoColResize.getTotalTableWidth())}px`, tableLayout: 'fixed', borderCollapse:'collapse' }}>
              <thead style={{ backgroundColor: 'var(--th-bg, #f8fafc)' }}>
                <tr style={{ fontSize:'0.78rem', textTransform:'uppercase', color:'var(--text-secondary, #64748b)', borderBottom:'1px solid #e2e8f0' }}>
                  {source === 'db' && (
                    <th style={{ padding:'0.75rem 1rem', width:'40px', textAlign:'center', boxSizing:'border-box' }}>
                      <input 
                        type="checkbox" 
                        checked={isAllCurrentPageSelected} 
                        onChange={toggleSelectAllCurrentPage} 
                        style={{ cursor:'pointer' }}
                        title="Select / Deselect all records on this page"
                      />
                    </th>
                  )}
                  {source === 'db' ? [
                    { id: 'time', label: 'Time (IST)' },
                    { id: 'call_uuid', label: 'CallUUID' },
                    { id: 'agent', label: 'Agent' },
                    { id: 'customer', label: 'Customer' },
                    { id: 'direction', label: 'Direction' },
                    { id: 'status', label: 'Status' },
                    { id: 'start_time', label: 'StartTime (IST)' },
                    { id: 'answer_time', label: 'AnswerTime (IST)' },
                    { id: 'end_time', label: 'EndTime (IST)' },
                    { id: 'ringing', label: 'Ringing (s)' },
                    { id: 'talk', label: 'Talk (s)' },
                    { id: 'recording', label: 'Recording' },
                    { id: 'room', label: 'Room' }
                  ].map(h => (
                    <th key={h.id} style={{ width: `${dbColResize.colWidths[h.id]}px`, padding:'0.65rem 0.75rem', textAlign:'left', fontWeight:700, position:'relative', boxSizing:'border-box', verticalAlign:'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>{h.label}</span>
                      </div>
                      <ColumnResizer colKey={h.id} isResizing={dbColResize.resizingCol === h.id} onResizeStart={dbColResize.handleResizeStart} onReset={dbColResize.resetColWidth} />
                    </th>
                  )) : [
                    { id: 'time', label: 'Time (IST)' },
                    { id: 'from', label: 'From' },
                    { id: 'to', label: 'To' },
                    { id: 'direction', label: 'Direction' },
                    { id: 'duration', label: 'Duration' },
                    { id: 'hangup', label: 'Hangup Cause' },
                    { id: 'cost', label: 'Cost' }
                  ].map(h => (
                    <th key={h.id} style={{ width: `${plivoColResize.colWidths[h.id]}px`, padding:'0.65rem 0.75rem', textAlign:'left', fontWeight:700, position:'relative', boxSizing:'border-box', verticalAlign:'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>{h.label}</span>
                      </div>
                      <ColumnResizer colKey={h.id} isResizing={plivoColResize.resizingCol === h.id} onResizeStart={plivoColResize.handleResizeStart} onReset={plivoColResize.resetColWidth} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={source === 'db' ? 14 : 7} style={{ padding:'3rem', textAlign:'center' }}><Loader2 className="spin" size={24} color="#3b82f6" /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={source === 'db' ? 14 : 7} style={{ padding:'3rem', textAlign:'center', color:'#94a3b8' }}>No call records found.</td></tr>
                ) : source === 'db' ? filtered.map((c, i) => {
                  const rowSelectId = c.id || c.call_uuid || `row-${i}`;
                  const rowKey = `db-${c.id || c.agent_call_uuid || c.customer_call_uuid || i}`;
                  return (
                    <tr key={rowKey} style={{ borderBottom:'1px solid #f1f5f9', background: i%2===0?'white':'#fafafa' }}>
                      <td style={{ padding:'0.85rem 1rem', textAlign:'center', width:'40px', boxSizing:'border-box' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedCallsMap.has(rowSelectId)} 
                          onChange={() => toggleSelectRow(c, rowSelectId)} 
                          style={{ cursor:'pointer' }}
                        />
                      </td>
                      <td style={{ width: `${dbColResize.colWidths.time}px`, padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#475569', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', boxSizing:'border-box' }}>{fmtDate(c.created_at)}</td>
                      <td style={{ width: `${dbColResize.colWidths.call_uuid}px`, padding:'0.85rem 1rem', fontFamily:'monospace', fontSize:'0.72rem', color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', boxSizing:'border-box' }} title={c.agent_call_uuid}>{c.agent_call_uuid || '—'}</td>
                      <td style={{ width: `${dbColResize.colWidths.agent}px`, padding:'0.85rem 1rem', fontSize:'0.85rem', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', boxSizing:'border-box' }}>{c.call_agents?.display_name || '—'}</td>
                      <td style={{ width: `${dbColResize.colWidths.customer}px`, padding:'0.85rem 1rem', fontFamily:'monospace', fontSize:'0.82rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', boxSizing:'border-box' }}>{c.customer_number || '—'}</td>
                      <td style={{ width: `${dbColResize.colWidths.direction}px`, padding:'0.85rem 1rem', whiteSpace:'nowrap', boxSizing:'border-box' }}>{directionBadge(c.direction || 'outbound')}</td>
                      <td style={{ width: `${dbColResize.colWidths.status}px`, padding:'0.85rem 1rem', whiteSpace:'nowrap', boxSizing:'border-box' }}>{callStatusBadge(c.status)}</td>
                      <td style={{ width: `${dbColResize.colWidths.start_time}px`, padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#475569', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', boxSizing:'border-box' }}>{fmtDate(c.start_time)}</td>
                      <td style={{ width: `${dbColResize.colWidths.answer_time}px`, padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#475569', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', boxSizing:'border-box' }}>{fmtDate(c.agent_answer_time || c.customer_answer_time)}</td>
                      <td style={{ width: `${dbColResize.colWidths.end_time}px`, padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#475569', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', boxSizing:'border-box' }}>{fmtDate(c.end_time)}</td>
                      <td style={{ width: `${dbColResize.colWidths.ringing}px`, padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#475569', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', boxSizing:'border-box' }}>{c.ringing_duration_sec != null ? `${c.ringing_duration_sec}s` : '—'}</td>
                      <td style={{ width: `${dbColResize.colWidths.talk}px`, padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#475569', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', boxSizing:'border-box' }}>{c.talk_duration_sec != null ? `${c.talk_duration_sec}s` : '—'}</td>
                      <td style={{ width: `${dbColResize.colWidths.recording}px`, padding:'0.85rem 1rem', fontSize:'0.82rem', whiteSpace:'nowrap', boxSizing:'border-box' }}>
                        {c.recording_url ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button 
                              onClick={() => togglePlay(c.id, c.recording_url)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                border: 'none',
                                background: playingCallId === c.id ? '#ef4444' : 'var(--accent-color, #1e3a8a)',
                                color: 'white',
                                cursor: 'pointer',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                transition: 'all 0.2s'
                              }}
                              title={playingCallId === c.id ? "Pause Recording" : "Play Recording"}
                            >
                              {playingCallId === c.id ? <Pause size={12} /> : <Play size={12} />}
                            </button>
                            
                            <a 
                              href={c.recording_url} 
                              download={`recording_${c.id || i}.mp3`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                border: '1px solid #cbd5e1',
                                background: 'white',
                                color: '#475569',
                                cursor: 'pointer',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                transition: 'all 0.2s'
                              }}
                              title="Download Recording"
                            >
                              <Download size={12} />
                            </a>
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ width: `${dbColResize.colWidths.room}px`, padding:'0.85rem 1rem', fontFamily:'monospace', fontSize:'0.72rem', color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', boxSizing:'border-box' }}>{c.room_name || '—'}</td>
                    </tr>
                  );
                }) : filtered.map((c, i) => {
                  const rowKey = `plivo-${c.call_uuid || c.id || i}`;
                  return (
                    <tr key={rowKey} style={{ borderBottom:'1px solid #f1f5f9', background: i%2===0?'white':'#fafafa' }}>
                      <td style={{ width: `${plivoColResize.colWidths.time}px`, padding:'0.85rem 1rem', fontSize:'0.82rem', color:'#475569', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', boxSizing:'border-box' }}>{fmtDate(c.initiation_time)}</td>
                      <td style={{ width: `${plivoColResize.colWidths.from}px`, padding:'0.85rem 1rem', fontFamily:'monospace', fontSize:'0.82rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', boxSizing:'border-box' }}>{c.from_number || '—'}</td>
                      <td style={{ width: `${plivoColResize.colWidths.to}px`, padding:'0.85rem 1rem', fontFamily:'monospace', fontSize:'0.82rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', boxSizing:'border-box' }}>{c.to_number || '—'}</td>
                      <td style={{ width: `${plivoColResize.colWidths.direction}px`, padding:'0.85rem 1rem', whiteSpace:'nowrap', boxSizing:'border-box' }}>{directionBadge(c.call_direction)}</td>
                      <td style={{ width: `${plivoColResize.colWidths.duration}px`, padding:'0.85rem 1rem', fontSize:'0.82rem', whiteSpace:'nowrap', boxSizing:'border-box' }}>{fmtDur(c.call_duration)}</td>
                      <td style={{ width: `${plivoColResize.colWidths.hangup}px`, padding:'0.85rem 1rem', fontSize:'0.8rem', color:'#dc2626', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', boxSizing:'border-box' }}>{c.hangup_cause_name || '—'}</td>
                      <td style={{ width: `${plivoColResize.colWidths.cost}px`, padding:'0.85rem 1rem', fontSize:'0.8rem', color:'#475569', whiteSpace:'nowrap', boxSizing:'border-box' }}>{c.total_amount ? `₹${c.total_amount}` : '₹0.00'}</td>
                    </tr>
                  );
                })}
              </tbody>
          </table></MobileTableView>
        </div>

        {/* Pagination & Lead Data Page Size Controls */}
        <div style={{ padding:'1rem 1.5rem', borderTop:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', flexWrap:'wrap' }}>
            <span style={{ fontSize:'0.82rem', color:'#64748b' }}>
              Showing {total === 0 ? 0 : page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total} records
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                setPageSize(newSize);
                setPage(0);
              }}
              style={{
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                background: 'white',
                color: '#1e293b',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {(() => {
                const optionsSet = new Set(availablePageSizes);
                if (pageSize !== 10000 && !isNaN(pageSize)) optionsSet.add(pageSize);
                const list = Array.from(optionsSet).sort((a, b) => a - b);
                list.push(10000);
                return list.map(sz => (
                  <option key={sz} value={sz}>
                    {sz === 10000 ? 'All' : `Show ${sz}`}
                  </option>
                ));
              })()}
            </select>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <button 
              onClick={() => setPage(p => Math.max(0, p - 1))} 
              disabled={page === 0} 
              style={{ padding:'0.4rem 0.9rem', border:'1px solid #cbd5e1', borderRadius:'6px', background:'white', cursor:'pointer', fontSize:'0.85rem', opacity: page === 0 ? 0.4 : 1 }}
            >
              ← Prev
            </button>
            <span style={{ fontSize:'0.82rem', color:'#475569', fontWeight:600 }}>
              Page {total === 0 ? 1 : page + 1} of {Math.max(1, Math.ceil(total / pageSize))}
            </span>
            <button 
              onClick={() => setPage(p => p + 1)} 
              disabled={(page + 1) * pageSize >= total} 
              style={{ padding:'0.4rem 0.9rem', border:'1px solid #cbd5e1', borderRadius:'6px', background:'white', cursor:'pointer', fontSize:'0.85rem', opacity: (page + 1) * pageSize >= total ? 0.4 : 1 }}
            >
              Next →
            </button>
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
        {agents.map((agent, aIdx) => {
          const statusColor = agent.status === 'available' ? '#16a34a' : agent.status === 'on_call' || agent.status === 'busy' ? '#7c3aed' : '#94a3b8';
          return (
            <div key={agent.id || `agent-card-${aIdx}`} style={{ background:'white', borderRadius:'12px', padding:'1.25rem', border:`1px solid ${statusColor}30`, boxShadow:'0 1px 3px rgba(0,0,0,0.06)', borderLeft:`4px solid ${statusColor}` }}>
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

// ── Tab: Telephony & Seats (Workspace Telephony Authorization) ───────
function TabTelephonyGateway({ userCompany = '', tenantId = null, onRefresh = null }) {
  const [loading, setLoading] = useState(true);
  const [telephonyMode, setTelephonyMode] = useState('managed'); // 'byoc' | 'managed'
  const [plivoAuthId, setPlivoAuthId] = useState('');
  const [plivoAuthToken, setPlivoAuthToken] = useState('');
  const [callerId, setCallerId] = useState('');
  const [callingSeatLimit, setCallingSeatLimit] = useState(5);
  const [seatQuota, setSeatQuota] = useState(null);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchTelephonySettings = useCallback(() => {
    setLoading(true);
    fetch(`/api/plivo/admin/settings?company=${encodeURIComponent(userCompany || '')}&tenant_id=${tenantId || ''}`)
      .then(r => r.json())
      .then(d => {
        setTelephonyMode(d.telephonyMode || (d.isSwan ? 'managed' : (d.plivoAuthId ? 'byoc' : 'managed')));
        setPlivoAuthId(d.plivoAuthId || '');
        setPlivoAuthToken(d.plivoAuthToken || '');
        setCallerId(d.callerId || d.fromNumber || '');
        setCallingSeatLimit(d.callingSeatLimit || (d.isSwan ? 300 : 5));
        if (d.seatQuota) setSeatQuota(d.seatQuota);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userCompany, tenantId]);

  useEffect(() => {
    fetchTelephonySettings();
  }, [fetchTelephonySettings]);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/plivo/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_connection',
          company: userCompany,
          tenantId,
          plivoAuthId,
          plivoAuthToken
        })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/plivo/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: userCompany,
          tenantId,
          telephonyMode,
          plivoAuthId,
          plivoAuthToken,
          callerId,
          callingSeatLimit: parseInt(callingSeatLimit, 10) || 5
        })
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
        fetchTelephonySettings();
        if (onRefresh) onRefresh();
      } else {
        alert('Error saving telephony settings: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error saving telephony settings: ' + err.message);
    }
    setSaving(false);
  };

  if (loading) return <PremiumProgressLoader message="Loading Telephony Gateway" active={loading} />;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem', maxWidth:'1280px', margin:'0 auto' }}>
      
      {/* Top Banner & Save Action */}
      <div style={{ background:'white', borderRadius:'12px', padding:'1.25rem 1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem' }}>
        <div>
          <h2 style={{ fontSize:'1.2rem', fontWeight:800, color:'#1e293b', margin:0, display:'flex', alignItems:'center', gap:'0.6rem' }}>
            <KeyRound size={22} color="#2563eb" /> Telephony Gateway &amp; Workspace Authorization
          </h2>
          <p style={{ color:'#64748b', fontSize:'0.85rem', margin:'0.25rem 0 0 0' }}>
            Authorize Plivo credentials (BYOC vs Managed), set Caller ID, and manage active concurrent calling seats.
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
          {saveSuccess && (
            <span style={{ display:'flex', alignItems:'center', gap:'0.35rem', color:'#16a34a', fontSize:'0.85rem', fontWeight:600, background:'#dcfce7', padding:'0.4rem 0.85rem', borderRadius:'6px' }}>
              <CheckCircle size={16} /> Telephony Settings Saved!
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display:'flex', alignItems:'center', gap:'0.5rem',
              padding:'0.6rem 1.4rem', borderRadius:'8px', border:'none',
              background:'#2563eb', color:'white', fontWeight:700, fontSize:'0.88rem',
              cursor:'pointer', opacity: saving ? 0.7 : 1,
              boxShadow:'0 2px 4px rgba(37,99,235,0.2)'
            }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Telephony & Seats'}
          </button>
        </div>
      </div>

      {/* Telephony Gateway & BYOC Configuration Card */}
      <div style={{ background:'white', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', display:'flex', flexDirection:'column', gap:'1.25rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'0.75rem' }}>
          <div>
            <h3 style={{ fontSize:'1.05rem', fontWeight:700, margin:0, color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem' }}>
              <ShieldCheck size={18} color="#2563eb" /> Telephony Connection Mode
            </h3>
            <p style={{ color:'#64748b', fontSize:'0.82rem', marginTop:'0.25rem' }}>
              Configure how this client workspace connects to Plivo (Shared Platform Gateway vs Client BYOC).
            </p>
          </div>
          {seatQuota && (
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', background:'#eff6ff', border:'1px solid #bfdbfe', padding:'0.4rem 0.85rem', borderRadius:'8px', fontSize:'0.82rem' }}>
              <Users size={16} color="#2563eb" />
              <span style={{ fontWeight:700, color:'#1e40af' }}>
                Calling Seats: {seatQuota.used} / {seatQuota.total} Used (Across Headquarter &amp; Branches)
              </span>
            </div>
          )}
        </div>

        {/* Telephony Mode Selection */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:'1rem' }}>
          <label
            onClick={() => setTelephonyMode('managed')}
            style={{
              display:'flex', alignItems:'flex-start', gap:'0.85rem', padding:'1rem',
              borderRadius:'10px',
              border: telephonyMode === 'managed' ? '2px solid #2563eb' : '1px solid #e2e8f0',
              background: telephonyMode === 'managed' ? '#eff6ff' : '#f8fafc',
              cursor:'pointer', transition:'all 0.15s'
            }}
          >
            <input
              type="radio"
              name="tabTelephonyMode"
              value="managed"
              checked={telephonyMode === 'managed'}
              onChange={() => setTelephonyMode('managed')}
              style={{ marginTop:'0.2rem', accentColor:'#2563eb' }}
            />
            <div>
              <div style={{ fontWeight:700, color:'#1e293b', fontSize:'0.9rem', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                <Cpu size={16} color="#2563eb" /> Managed Telephony (Platform)
              </div>
              <div style={{ fontSize:'0.78rem', color:'#64748b', marginTop:'0.25rem', lineHeight:1.4 }}>
                Uses platform&apos;s managed Plivo gateway and pre-allotted SIP endpoints. Ideal for turnkey calling without customer-provided Plivo keys.
              </div>
            </div>
          </label>

          <label
            onClick={() => setTelephonyMode('byoc')}
            style={{
              display:'flex', alignItems:'flex-start', gap:'0.85rem', padding:'1rem',
              borderRadius:'10px',
              border: telephonyMode === 'byoc' ? '2px solid #2563eb' : '1px solid #e2e8f0',
              background: telephonyMode === 'byoc' ? '#eff6ff' : '#f8fafc',
              cursor:'pointer', transition:'all 0.15s'
            }}
          >
            <input
              type="radio"
              name="tabTelephonyMode"
              value="byoc"
              checked={telephonyMode === 'byoc'}
              onChange={() => setTelephonyMode('byoc')}
              style={{ marginTop:'0.2rem', accentColor:'#2563eb' }}
            />
            <div>
              <div style={{ fontWeight:700, color:'#1e293b', fontSize:'0.9rem', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                <ShieldCheck size={16} color="#16a34a" /> BYOC (Bring Your Own Plivo)
              </div>
              <div style={{ fontSize:'0.78rem', color:'#64748b', marginTop:'0.25rem', lineHeight:1.4 }}>
                Client workspace uses their own Plivo Auth ID, Auth Token, and rented caller numbers. Full billing isolation and independent endpoints.
              </div>
            </div>
          </label>
        </div>

        {/* BYOC Credentials Form (shown when BYOC is active) */}
        {telephonyMode === 'byoc' && (
          <div style={{ padding:'1.25rem', background:'#f8fafc', borderRadius:'10px', border:'1px solid #e2e8f0', display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:'0.88rem', fontWeight:700, color:'#1e293b' }}>
                Plivo API Credentials &amp; Caller ID
              </div>
              <span style={{ fontSize:'0.75rem', color:'#64748b' }}>
                Enter credentials from your Plivo Dashboard (Account &gt; Overview)
              </span>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'1rem' }}>
              <div>
                <label style={{ display:'block', fontSize:'0.8rem', fontWeight:600, color:'#475569', marginBottom:'0.3rem' }}>
                  Plivo Auth ID *
                </label>
                <input
                  type="text"
                  placeholder="e.g. MAMJFHXXXXXXXXXXXXXXXX (Alphanumeric Auth ID, not email)"
                  value={plivoAuthId}
                  onChange={e => setPlivoAuthId(e.target.value.trim())}
                  style={{ width:'100%', boxSizing:'border-box', padding:'0.55rem 0.8rem', borderRadius:'6px', border:'1px solid #cbd5e1', fontSize:'0.85rem', fontFamily:'monospace', background:'white' }}
                />
                <span style={{ fontSize:'0.72rem', color:'#94a3b8', marginTop:'0.2rem', display:'block' }}>
                  Copy your Auth ID from Plivo Console (do not enter your email address).
                </span>
              </div>

              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.3rem' }}>
                  <label style={{ fontSize:'0.8rem', fontWeight:600, color:'#475569' }}>
                    Plivo Auth Token *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAuthToken(!showAuthToken)}
                    style={{ background:'none', border:'none', color:'#2563eb', fontSize:'0.72rem', cursor:'pointer' }}
                  >
                    {showAuthToken ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showAuthToken ? 'text' : 'password'}
                  placeholder="e.g. NTdiOWXXXXXXXXXXXXXXXXXXXXXXXXXX"
                  value={plivoAuthToken}
                  onChange={e => setPlivoAuthToken(e.target.value.trim())}
                  style={{ width:'100%', boxSizing:'border-box', padding:'0.55rem 0.8rem', borderRadius:'6px', border:'1px solid #cbd5e1', fontSize:'0.85rem', fontFamily:'monospace', background:'white' }}
                />
              </div>

              <div>
                <label style={{ display:'block', fontSize:'0.8rem', fontWeight:600, color:'#475569', marginBottom:'0.3rem' }}>
                  Caller ID (From Phone Number) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. +918035340622"
                  value={callerId}
                  onChange={e => setCallerId(e.target.value.trim())}
                  style={{ width:'100%', boxSizing:'border-box', padding:'0.55rem 0.8rem', borderRadius:'6px', border:'1px solid #cbd5e1', fontSize:'0.85rem', fontFamily:'monospace', background:'white' }}
                />
                <span style={{ fontSize:'0.72rem', color:'#94a3b8', marginTop:'0.2rem', display:'block' }}>
                  Purchased Plivo number with country code (used as outgoing Caller ID).
                </span>
              </div>
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:'1rem', marginTop:'0.5rem', flexWrap:'wrap' }}>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection || !plivoAuthId || !plivoAuthToken}
                style={{
                  display:'flex', alignItems:'center', gap:'0.4rem',
                  padding:'0.5rem 1rem', borderRadius:'6px', border:'1px solid #cbd5e1',
                  background:'white', color:'#1e293b', fontWeight:600, fontSize:'0.82rem',
                  cursor:'pointer', opacity: (testingConnection || !plivoAuthId || !plivoAuthToken) ? 0.6 : 1
                }}
              >
                {testingConnection ? <Loader2 size={14} className="spin" /> : <Activity size={14} color="#2563eb" />}
                {testingConnection ? 'Testing Connection...' : 'Test Plivo Connection'}
              </button>

              {testResult && (
                <div style={{
                  display:'flex', alignItems:'center', gap:'0.4rem',
                  padding:'0.4rem 0.75rem', borderRadius:'6px', fontSize:'0.8rem', fontWeight:600,
                  background: testResult.success ? '#dcfce7' : '#fee2e2',
                  color: testResult.success ? '#15803d' : '#b91c1c'
                }}>
                  {testResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  <span>{testResult.success ? `Connected! Account: ${testResult.accountName || 'Active'}` : `Failed: ${testResult.error}`}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Calling Seat Quota Setting */}
        <div style={{ padding:'1rem 1.25rem', background:'#f8fafc', borderRadius:'10px', border:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <div style={{ fontWeight:700, color:'#1e293b', fontSize:'0.9rem', display:'flex', alignItems:'center', gap:'0.4rem' }}>
              <Users size={16} color="#7c3aed" /> Workspace Calling Seat Allocation
            </div>
            <div style={{ fontSize:'0.78rem', color:'#64748b', marginTop:'0.2rem', lineHeight:1.4 }}>
              Set maximum number of telecallers allowed to use the Softphone concurrently across Headquarter and all Branches.
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <span style={{ fontSize:'0.82rem', color:'#475569', fontWeight:600 }}>Seat Limit:</span>
            <input
              type="number"
              min="1"
              max="500"
              value={callingSeatLimit}
              onChange={e => setCallingSeatLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{
                width:'90px', padding:'0.45rem 0.65rem', borderRadius:'6px',
                border:'1px solid #cbd5e1', fontSize:'0.9rem', fontWeight:700,
                textAlign:'center', background:'white'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Settings ─────────────────────────────────────────────
function TabSettings({ agents = [], userCompany = '', tenantId = null }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [defaultForward, setDefaultForward] = useState('');
  const [routingMode, setRoutingMode] = useState('simultaneous');
  const [stickyAgent, setStickyAgent] = useState(true);
  const [inboundAgentIds, setInboundAgentIds] = useState([]);
  const [agentSearch, setAgentSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Telephony Gateway & BYOC State
  const [telephonyMode, setTelephonyMode] = useState('managed'); // 'byoc' | 'managed'
  const [plivoAuthId, setPlivoAuthId] = useState('');
  const [plivoAuthToken, setPlivoAuthToken] = useState('');
  const [callerId, setCallerId] = useState('');
  const [callingSeatLimit, setCallingSeatLimit] = useState(5);
  const [seatQuota, setSeatQuota] = useState(null);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const fetchSettings = useCallback(() => {
    setLoading(true);
    fetch(`/api/plivo/admin/settings?company=${encodeURIComponent(userCompany || '')}&tenant_id=${tenantId || ''}`)
      .then(r => r.json())
      .then(d => {
        setSettings(d);
        setDefaultForward(d.defaultForward || '');
        setRoutingMode(d.routingMode || 'simultaneous');
        setStickyAgent(d.stickyAgent !== false);
        setInboundAgentIds(Array.isArray(d.inboundAgentIds) ? d.inboundAgentIds : []);
        setTelephonyMode(d.telephonyMode || (d.isSwan ? 'managed' : (d.plivoAuthId ? 'byoc' : 'managed')));
        setPlivoAuthId(d.plivoAuthId || '');
        setPlivoAuthToken(d.plivoAuthToken || '');
        setCallerId(d.callerId || d.fromNumber || '');
        setCallingSeatLimit(d.callingSeatLimit || (d.isSwan ? 300 : 5));
        if (d.seatQuota) setSeatQuota(d.seatQuota);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userCompany, tenantId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/plivo/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_connection',
          company: userCompany,
          tenantId,
          plivoAuthId,
          plivoAuthToken
        })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const cleanNum = (defaultForward || '').replace(/['"]/g, '').trim();
      const res = await fetch('/api/plivo/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: userCompany,
          tenantId,
          defaultForward: cleanNum,
          routingMode,
          stickyAgent,
          inboundAgentIds,
          telephonyMode,
          plivoAuthId,
          plivoAuthToken,
          callerId,
          callingSeatLimit: parseInt(callingSeatLimit, 10) || 5
        })
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
        fetchSettings();
      } else {
        alert('Error saving settings: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error saving settings: ' + err.message);
    }
    setSaving(false);
  };

  // Filter actual human agents
  const humanAgents = (agents || []).filter(a =>
    !a.plivo_username?.startsWith('system_settings_') &&
    a.display_name &&
    !a.display_name.startsWith('System ')
  );

  const filteredAgents = humanAgents.filter(a => {
    const term = (agentSearch || '').toLowerCase();
    return (
      (a.display_name || '').toLowerCase().includes(term) ||
      (a.plivo_sip_uri || '').toLowerCase().includes(term) ||
      (a.plivo_username || '').toLowerCase().includes(term) ||
      (a.agent_code || '').toLowerCase().includes(term)
    );
  });

  const toggleAgent = (agentId) => {
    setInboundAgentIds(prev =>
      prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId]
    );
  };

  const selectAllFiltered = () => {
    const ids = filteredAgents.map(a => a.id);
    setInboundAgentIds(prev => Array.from(new Set([...prev, ...ids])));
  };

  const clearSelection = () => {
    setInboundAgentIds([]);
  };

  if (loading) return <PremiumProgressLoader message="Loading Call Settings" active={loading} />;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem', maxWidth:'1280px', margin:'0 auto' }}>
      
      {/* Top Banner & Save Action */}
      <div style={{ background:'white', borderRadius:'12px', padding:'1.25rem 1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem' }}>
        <div>
          <h2 style={{ fontSize:'1.2rem', fontWeight:800, color:'#1e293b', margin:0, display:'flex', alignItems:'center', gap:'0.6rem' }}>
            <PhoneIncoming size={22} color="#3b82f6" /> Inbound Call Routing & Softphone Distribution
          </h2>
          <p style={{ color:'#64748b', fontSize:'0.85rem', margin:'0.25rem 0 0 0' }}>
            Control how incoming customer calls to <strong>{settings?.fromNumber || '+918035340622'}</strong> ring on agents&apos; CRM Softphone screens.
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
          {saveSuccess && (
            <span style={{ display:'flex', alignItems:'center', gap:'0.35rem', color:'#16a34a', fontSize:'0.85rem', fontWeight:600, background:'#dcfce7', padding:'0.4rem 0.85rem', borderRadius:'6px' }}>
              <CheckCircle size={16} /> Settings Saved!
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display:'flex', alignItems:'center', gap:'0.5rem',
              padding:'0.6rem 1.4rem', borderRadius:'8px', border:'none',
              background:'#2563eb', color:'white', fontWeight:700, fontSize:'0.88rem',
              cursor:'pointer', opacity: saving ? 0.7 : 1,
              boxShadow:'0 2px 4px rgba(37,99,235,0.2)'
            }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Routing Rules'}
          </button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(520px, 1fr))', gap:'1.5rem' }}>
        
        {/* Card 1: Routing Mode / Strategy */}
        <div style={{ background:'white', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', display:'flex', flexDirection:'column', gap:'1.25rem' }}>
          <div>
            <h3 style={{ fontSize:'1rem', fontWeight:700, margin:0, color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem' }}>
              <Radio size={18} color="#3b82f6" /> 1. Inbound Ringing Strategy
            </h3>
            <p style={{ color:'#64748b', fontSize:'0.8rem', marginTop:'0.25rem' }}>
              Select how incoming calls should be dispatched among online softphones.
            </p>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            {/* Option 1: Simultaneous Ring */}
            <label
              onClick={() => setRoutingMode('simultaneous')}
              style={{
                display:'flex', alignItems:'flex-start', gap:'0.85rem', padding:'0.9rem 1rem',
                borderRadius:'10px', border: routingMode === 'simultaneous' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                background: routingMode === 'simultaneous' ? '#eff6ff' : '#f8fafc',
                cursor:'pointer', transition:'all 0.15s'
              }}
            >
              <input
                type="radio"
                name="routingMode"
                value="simultaneous"
                checked={routingMode === 'simultaneous'}
                onChange={() => setRoutingMode('simultaneous')}
                style={{ marginTop:'0.2rem', accentColor:'#2563eb' }}
              />
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                  <span style={{ fontWeight:700, color:'#1e293b', fontSize:'0.9rem' }}>Simultaneous Ring (Blast All)</span>
                  <span style={{ fontSize:'0.7rem', fontWeight:700, padding:'0.15rem 0.5rem', background:'#dcfce7', color:'#15803d', borderRadius:'999px' }}>Recommended</span>
                </div>
                <div style={{ fontSize:'0.78rem', color:'#64748b', marginTop:'0.25rem', lineHeight:1.4 }}>
                  All online softphones ring simultaneously on their screens. The first telecaller to click <strong>Answer</strong> connects immediately; Plivo cancels ringing on everyone else. <em>Best to prevent missed customer calls.</em>
                </div>
              </div>
            </label>

            {/* Option 2: Round Robin */}
            <label
              onClick={() => setRoutingMode('round_robin')}
              style={{
                display:'flex', alignItems:'flex-start', gap:'0.85rem', padding:'0.9rem 1rem',
                borderRadius:'10px', border: routingMode === 'round_robin' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                background: routingMode === 'round_robin' ? '#eff6ff' : '#f8fafc',
                cursor:'pointer', transition:'all 0.15s'
              }}
            >
              <input
                type="radio"
                name="routingMode"
                value="round_robin"
                checked={routingMode === 'round_robin'}
                onChange={() => setRoutingMode('round_robin')}
                style={{ marginTop:'0.2rem', accentColor:'#2563eb' }}
              />
              <div style={{ flex:1 }}>
                <span style={{ fontWeight:700, color:'#1e293b', fontSize:'0.9rem' }}>Round Robin (Equal Distribution)</span>
                <div style={{ fontSize:'0.78rem', color:'#64748b', marginTop:'0.25rem', lineHeight:1.4 }}>
                  Distributes incoming customer calls evenly one-by-one in circular rotation across eligible online agents.
                </div>
              </div>
            </label>

            {/* Option 3: First Available */}
            <label
              onClick={() => setRoutingMode('first_available')}
              style={{
                display:'flex', alignItems:'flex-start', gap:'0.85rem', padding:'0.9rem 1rem',
                borderRadius:'10px', border: routingMode === 'first_available' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                background: routingMode === 'first_available' ? '#eff6ff' : '#f8fafc',
                cursor:'pointer', transition:'all 0.15s'
              }}
            >
              <input
                type="radio"
                name="routingMode"
                value="first_available"
                checked={routingMode === 'first_available'}
                onChange={() => setRoutingMode('first_available')}
                style={{ marginTop:'0.2rem', accentColor:'#2563eb' }}
              />
              <div style={{ flex:1 }}>
                <span style={{ fontWeight:700, color:'#1e293b', fontSize:'0.9rem' }}>First Available Agent</span>
                <div style={{ fontSize:'0.78rem', color:'#64748b', marginTop:'0.25rem', lineHeight:1.4 }}>
                  Routes the call straight to the first available telecaller currently in ready status.
                </div>
              </div>
            </label>
          </div>

          {/* Sticky Agent Toggle */}
          <div style={{ marginTop:'0.5rem', padding:'1rem', background:'#f8fafc', borderRadius:'10px', border:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem' }}>
            <div>
              <div style={{ fontWeight:700, color:'#1e293b', fontSize:'0.88rem', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                <PhoneCall size={16} color="#7c3aed" /> Sticky Agent Routing (Returning Leads)
              </div>
              <div style={{ fontSize:'0.78rem', color:'#64748b', marginTop:'0.2rem', lineHeight:1.4 }}>
                If an existing CRM lead calls back, prioritize ringing the specific telecaller assigned to that lead or who last spoke with them. If offline, auto-falls back to the inbound group.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStickyAgent(!stickyAgent)}
              style={{ background:'none', border:'none', cursor:'pointer', padding:0, flexShrink:0 }}
            >
              {stickyAgent ? <ToggleRight size={38} color="#2563eb" /> : <ToggleLeft size={38} color="#94a3b8" />}
            </button>
          </div>
        </div>

        {/* Card 2: Option 4 - Dedicated Inbound Telecallers Selection */}
        <div style={{ background:'white', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0', display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'0.5rem' }}>
            <div>
              <h3 style={{ fontSize:'1rem', fontWeight:700, margin:0, color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                <Users size={18} color="#3b82f6" /> 2. Inbound Agent Selection List
              </h3>
              <p style={{ color:'#64748b', fontSize:'0.8rem', marginTop:'0.25rem' }}>
                Choose specific telecallers (e.g. 1, 2, or 3) to receive new inbound calls so other team members are not disturbed.
              </p>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
              <button
                type="button"
                onClick={selectAllFiltered}
                style={{ fontSize:'0.75rem', fontWeight:600, color:'#2563eb', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'6px', padding:'0.25rem 0.6rem', cursor:'pointer' }}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearSelection}
                style={{ fontSize:'0.75rem', fontWeight:600, color:'#64748b', background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:'6px', padding:'0.25rem 0.6rem', cursor:'pointer' }}
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Selection summary badge */}
          <div style={{ padding:'0.6rem 0.85rem', borderRadius:'8px', background: inboundAgentIds.length === 0 ? '#f0fdf4' : '#eff6ff', border: inboundAgentIds.length === 0 ? '1px solid #bbf7d0' : '1px solid #bfdbfe', fontSize:'0.8rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ color: inboundAgentIds.length === 0 ? '#166534' : '#1e40af', fontWeight:600 }}>
              {inboundAgentIds.length === 0
                ? '🌐 All Online Agents Eligible (No filter applied)'
                : `🎯 ${inboundAgentIds.length} Dedicated Agent(s) Selected for Inbound Calls`}
            </span>
            <span style={{ fontSize:'0.72rem', color:'#64748b' }}>
              Total: {humanAgents.length} Agents
            </span>
          </div>

          {/* Search agents */}
          <div style={{ position:'relative' }}>
            <Search size={15} color="#94a3b8" style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search agent by name, SIP username or ID..."
              value={agentSearch}
              onChange={e => setAgentSearch(e.target.value)}
              style={{
                width:'100%', boxSizing:'border-box', padding:'0.45rem 0.75rem 0.45rem 2rem',
                borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'0.82rem', background:'#f8fafc'
              }}
            />
          </div>

          {/* Agent Checkbox List */}
          <div style={{ maxHeight:'280px', overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'0.5rem', display:'flex', flexDirection:'column', gap:'0.4rem', background:'#fafafa' }}>
            {filteredAgents.map((agent, aIdx) => {
              const isChecked = inboundAgentIds.includes(agent.id);
              const isOnline = agent.status === 'available' || agent.status === 'on_call';
              return (
                <label
                  key={agent.id || `filter-agent-${aIdx}`}
                  style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'0.5rem 0.75rem', borderRadius:'6px',
                    background: isChecked ? '#eff6ff' : 'white',
                    border: isChecked ? '1px solid #93c5fd' : '1px solid #f1f5f9',
                    cursor:'pointer', transition:'background 0.15s'
                  }}
                >
                  <div style={{ display:'flex', alignItems:'center', gap:'0.65rem' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleAgent(agent.id)}
                      style={{ width:'16px', height:'16px', accentColor:'#2563eb', cursor:'pointer' }}
                    />
                    <div>
                      <div style={{ fontSize:'0.85rem', fontWeight:600, color:'#1e293b', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                        {agent.display_name}
                        {agent.agent_code && (
                          <span style={{ fontSize:'0.7rem', color:'#64748b', background:'#e2e8f0', padding:'0.1rem 0.4rem', borderRadius:'4px' }}>
                            {agent.agent_code}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:'0.72rem', color:'#94a3b8', fontFamily:'monospace' }}>
                        {agent.plivo_sip_uri || agent.plivo_username}
                      </div>
                    </div>
                  </div>

                  <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
                    {isOnline ? (
                      <span style={{ display:'flex', alignItems:'center', gap:'0.25rem', fontSize:'0.72rem', fontWeight:600, color:'#16a34a', background:'#dcfce7', padding:'0.15rem 0.5rem', borderRadius:'999px' }}>
                        <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#16a34a' }}></span>
                        {agent.status}
                      </span>
                    ) : (
                      <span style={{ display:'flex', alignItems:'center', gap:'0.25rem', fontSize:'0.72rem', fontWeight:500, color:'#94a3b8', background:'#f1f5f9', padding:'0.15rem 0.5rem', borderRadius:'999px' }}>
                        <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#94a3b8' }}></span>
                        offline
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
            {filteredAgents.length === 0 && (
              <div style={{ textAlign:'center', color:'#94a3b8', fontSize:'0.82rem', padding:'1.5rem' }}>
                No agents match &quot;{agentSearch}&quot;
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Account Info & Fallback Forward Settings */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(480px, 1fr))', gap:'1.5rem' }}>
        
        {/* Plivo Account & Fallback */}
        <div style={{ background:'white', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0' }}>
          <h3 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'1.25rem', color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <Shield size={18} color="#3b82f6" /> Plivo Account & Fallback Forwarding
          </h3>
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            {[
              { label: 'Auth ID',          value: process.env.NEXT_PUBLIC_PLIVO_AUTH_ID || 'MAMJFH***' },
              { label: 'Company Plivo Number', value: settings?.fromNumber || '+918035340622' },
              { label: 'Data Region',      value: 'India 🇮🇳' },
            ].map(row => (
              <div key={row.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.75rem', background:'#f8fafc', borderRadius:'8px' }}>
                <span style={{ fontSize:'0.85rem', color:'#64748b', fontWeight:500 }}>{row.label}</span>
                <span style={{ fontSize:'0.85rem', color:'#1e293b', fontWeight:600, fontFamily: row.label.includes('ID')||row.label.includes('Number') ? 'monospace' : 'inherit' }}>{row.value}</span>
              </div>
            ))}

            {/* Edit Default Forward */}
            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem', padding:'0.85rem', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0' }}>
              <label style={{ fontSize:'0.85rem', color:'#1e293b', fontWeight:600, display:'flex', alignItems:'center', gap:'0.35rem' }}>
                <PhoneCall size={14} color="#ef4444" /> Final Fallback Forward Mobile Number
              </label>
              <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.25rem' }}>
                <input 
                  type="text" 
                  value={defaultForward} 
                  onChange={e => setDefaultForward(e.target.value)}
                  placeholder="+91XXXXXXXXXX"
                  style={{
                    flex: 1,
                    padding: '0.45rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                    background: 'white'
                  }}
                />
              </div>
              <span style={{ fontSize:'0.72rem', color:'#64748b', marginTop:'0.2rem' }}>
                If no softphones are online or the incoming call is not answered within 30 seconds, the call forwards automatically to this phone.
              </span>
            </div>
          </div>
        </div>

        {/* Applications */}
        <div style={{ background:'white', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0' }}>
          <h3 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'1.25rem', color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <Radio size={18} color="#3b82f6" /> Plivo Webhook Applications
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
      </div>

      {/* Routing Rules Diagram */}
      <div style={{ background:'white', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0' }}>
        <h3 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'1.25rem', color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <ArrowRight size={18} color="#3b82f6" /> Live Inbound Call Routing Flow
        </h3>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
          {[
            { label:'Customer Dials +918035340622', color:'#3b82f6' },
            { label:'CRM Lead Lookup (Name & Company)', color:'#0891b2' },
            { label:'Sticky Agent Check (Priority)', color:'#7c3aed' },
            { label:`Inbound Team Ring (${routingMode.replace('_',' ').toUpperCase()})`, color:'#16a34a' },
            { label:`Fallback Mobile: ${defaultForward || '+91XXXXXXXXXX'}`, color:'#ef4444' },
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
          <strong>Real-Time SIP Verification:</strong> Before dispatching XML, Plivo verifies softphone registration via live endpoint status. If softphones are connected in the browser, customer calls ring directly on screen with <strong>Caller Name, Company, and Lead Status badge</strong>!
        </div>
      </div>

      {/* Widget Preferences */}
      <div style={{ background:'white', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.07)', border:'1px solid #e2e8f0' }}>
        <h3 style={{ fontSize:'1rem', fontWeight:700, marginBottom:'1.25rem', color:'#1e293b', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <Settings size={18} color="#3b82f6" /> Softphone Preferences (Browser Local)
        </h3>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontWeight:600, color:'#1e293b', fontSize:'0.95rem' }}>Auto-Answer Outbound Calls</div>
            <div style={{ fontSize:'0.8rem', color:'#64748b', marginTop:'0.25rem' }}>When dialing a number, connect immediately without requiring the agent to click &quot;Accept&quot;.</div>
          </div>
          <button 
            onClick={() => {
              const current = localStorage.getItem('CRM_AUTO_ANSWER_OUTBOUND') !== 'false';
              localStorage.setItem('CRM_AUTO_ANSWER_OUTBOUND', (!current).toString());
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
export default function CallAdminModule({ 
  moduleAccess = {}, 
  userRole = '', 
  activeSubTab = null, 
  onSubTabChange = null,
  userCompany = '',
  tenantId = null
}) {
  const visibleTabs = filterVisibleSubTabs(moduleAccess, userRole, 'calladmin', TABS);

  const [activeTab, setActiveTab] = useState(() => {
    if (activeSubTab && visibleTabs.some(t => t.id === activeSubTab)) return activeSubTab;
    return visibleTabs[0]?.id || 'agents';
  });

  useEffect(() => {
    if (activeSubTab && visibleTabs.some(t => t.id === activeSubTab)) {
      setActiveTab(activeSubTab);
    }
  }, [activeSubTab, visibleTabs]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    if (onSubTabChange) {
      onSubTabChange(tabId);
    } else if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `/calladmin?tab=${tabId}`);
    }
  };

  const [agents, setAgents] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [users, setUsers] = useState([]);
  const [seatQuota, setSeatQuota] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (userCompany) q.set('company', userCompany);
      if (tenantId) q.set('tenant_id', tenantId);

      const [userData, adminData, endpointsRes, settingsRes] = await Promise.all([
        getTeamMembers(userCompany),
        getCallAdminData(userCompany, tenantId),
        fetch(`/api/plivo/admin/endpoints?${q.toString()}`).then(r => r.json()).catch(() => ({ endpoints: [] })),
        fetch(`/api/plivo/admin/settings?${q.toString()}`).then(r => r.json()).catch(() => ({}))
      ]);
      if (userData) setUsers(userData.filter(u => u.emp_name?.trim()));
      setEndpoints(adminData.endpoints?.length ? adminData.endpoints : (endpointsRes.endpoints || []));
      setAgents(adminData.agents || []);
      if (settingsRes?.seatQuota) {
        setSeatQuota(settingsRes.seatQuota);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userCompany, tenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <PremiumProgressLoader message="Loading Call Center Administration" active={loading} />;

  if (visibleTabs.length === 0) {
    return (
      <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <h3 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Access Denied</h3>
        <p>You do not have permission to view any sub-pages in Call Admin.</p>
      </div>
    );
  }

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
        <div style={{ display:'flex', gap:'0', borderBottom:'2px solid #f1f5f9', overflowX: 'auto' }}>
          {visibleTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
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
            userCompany={userCompany}
            seatQuota={seatQuota}
          />
        )}
        {activeTab === 'endpoints' && <TabEndpoints userCompany={userCompany} tenantId={tenantId} agents={agents} onRefresh={fetchData} />}
        {activeTab === 'telephony' && <TabTelephonyGateway userCompany={userCompany} tenantId={tenantId} onRefresh={fetchData} />}
        {activeTab === 'calllogs' && <TabCallLogs userCompany={userCompany} tenantId={tenantId} />}
        {activeTab === 'monitor' && <TabMonitor agents={agents} onRefresh={fetchData} />}
        {activeTab === 'settings' && <TabSettings agents={agents} userCompany={userCompany} tenantId={tenantId} />}
      </div>
    </div>
  );
}
