'use client';
import MobileTableView, { TableViewToggle, useTableViewPreference } from '@/components/common/MobileTableView';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  PhoneCall, Users, Clock, Database, Loader2, ShieldAlert,
  Calendar, Search, RefreshCw, FileSpreadsheet, Play, Pause,
  Download, PhoneIncoming, PhoneOutgoing
} from 'lucide-react';
import CallCenterPagination, { stickyHeader, tableScroll } from './CallCenterPagination';
import { viewScope, readViewCache, writeViewCache, clearViewCache, fetchPageData } from './callCenterViewCache';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';

const CALL_CENTER_DEFAULT_COL_WIDTHS = {
  time: 175,
  direction: 110,
  customer: 155,
  status: 125,
  answer_time: 175,
  end_time: 175,
  ringing: 130,
  talk: 130,
  recording: 110
};

const CALL_CENTER_MIN_COL_WIDTHS = {
  time: 120,
  direction: 80,
  customer: 110,
  status: 90,
  answer_time: 120,
  end_time: 120,
  ringing: 90,
  talk: 90,
  recording: 80
};

// ─── Strict IST Helpers ───────────────────────────────────────────
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

const directionBadge = (dir) => dir === 'inbound'
  ? <span style={{ color: '#7c3aed', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}><PhoneIncoming size={12} />Inbound</span>
  : <span style={{ color: '#0369a1', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}><PhoneOutgoing size={12} />Outbound</span>;

const callStatusBadge = (s) => {
  const map = {
    initiated:        ['#dbeafe', '#1e40af'],
    answered:         ['#dcfce7', '#166534'],
    connected:        ['#dcfce7', '#166534'],
    completed:        ['#f0fdf4', '#15803d'],
    ended:            ['#f1f5f9', '#475569'],
    failed:           ['#fee2e2', '#991b1b'],
    missed:           ['#fef3c7', '#92400e'],
    ringing:          ['#ede9fe', '#5b21b6'],
    customer_ringing: ['#ede9fe', '#5b21b6'],
    agent_answered:   ['#dcfce7', '#166534'],
  };
  const [bg, color] = map[s] || ['#f1f5f9', '#475569'];
  return <span style={{ padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.74rem', fontWeight: 600, background: bg, color }}>{s || '—'}</span>;
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

export default function CallCenterModule({ userId, userCompany = '', tenantId = null }) {
  const scope = viewScope(userId, tenantId, userCompany);
  const [agentData, setAgentData] = useState(() => readViewCache(scope, 'desk-profile')?.data || null);
  const [deskError, setDeskError] = useState('');
  const profileRequest = useRef(0);
  const callsRequest = useRef(0);
  const [loading, setLoading] = useState(true);
  const [callsLoading, setCallsLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState('offline');
  const [activating, setActivating] = useState(false);

  // Call Logs & Pagination
  const [recentCalls, setRecentCalls] = useState([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [page, setPage] = useState(0);
  const [callLogView, setCallLogView] = useTableViewPreference('CallCenter/CallCenterModule-1');

  // Interactive Column Resizing
  const {
    colWidths,
    resizingCol,
    handleResizeStart,
    resetColWidth,
    getTotalTableWidth
  } = useTableColumnResize(
    'callcenter_agent_col_widths',
    CALL_CENTER_DEFAULT_COL_WIDTHS,
    CALL_CENTER_MIN_COL_WIDTHS
  );

  const [pageSize, setPageSize] = useState(25);

  // Quick Date Presets (Strict IST)
  const [datePreset, setDatePreset] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [search, setSearch] = useState('');

  // Audio Playback
  const [playingCallId, setPlayingCallId] = useState(null);
  const [audio] = useState(() => typeof window !== 'undefined' ? new Audio() : null);

  // Export to Excel
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
      audio.play().catch(err => console.error('Playback failed:', err));
      setPlayingCallId(callId);
    }
  };

  const fetchCalls = useCallback(async (agentId, pg, pSize, preset, cStart, cEnd, searchTerm) => {
    if (!agentId) return;
    const request = ++callsRequest.current;
    const { startDate, endDate } = getISTDateRange(preset, cStart, cEnd);
    const q = new URLSearchParams({ section: 'calls', limit: String(pSize), offset: String(pg * pSize),
      start_date: startDate, end_date: endDate, search: searchTerm || '', viewer: userId });
    const key = `desk-calls:${q}`;
    const cached = readViewCache(scope, key);
    setRecentCalls(cached?.calls || []); setTotalCalls(cached?.total || 0);
    setCallsLoading(true); setDeskError('');
    try {
      const data = await fetchPageData(`/api/plivo/desk-data?${q}`);
      if (request !== callsRequest.current) return;
      setRecentCalls(data.calls || []); setTotalCalls(data.total || 0); writeViewCache(scope, key, data);
      const last = Math.max(0, Math.ceil((data.total || 0) / pSize) - 1);
      if (pg > last) setPage(last);
    } catch (error) {
      if (request !== callsRequest.current) return;
      setDeskError(error.message);
      if ([401, 403].includes(error.status)) { setRecentCalls([]); setTotalCalls(0); clearViewCache(scope, key); }
    } finally { if (request === callsRequest.current) setCallsLoading(false); }
  }, [scope, userId]);

  const fetchAgentProfile = useCallback(async () => {
    const request = ++profileRequest.current;
    setLoading(true); setDeskError('');
    const cached = readViewCache(scope, 'desk-profile');
    setAgentData(cached?.data || null);
    try {
      const result = await fetchPageData(`/api/plivo/desk-data?section=profile&viewer=${encodeURIComponent(userId || '')}`);
      if (request !== profileRequest.current) return;
      setAgentData(result.data || null); setAgentStatus(result.data?.status || 'offline');
      writeViewCache(scope, 'desk-profile', result);
    } catch (error) {
      if (request !== profileRequest.current) return;
      setDeskError(error.message);
      if ([401, 403].includes(error.status)) { setAgentData(null); clearViewCache(scope, 'desk-profile'); }
    } finally { if (request === profileRequest.current) setLoading(false); }
  }, [userId, scope]);

  useEffect(() => {
    fetchAgentProfile();
    return () => { profileRequest.current += 1; callsRequest.current += 1; };
  }, [fetchAgentProfile]);

  useEffect(() => {
    if (!agentData?.id) return;
    const timer = setTimeout(() => fetchCalls(agentData.id, page, pageSize, datePreset, customStartDate, customEndDate, search), search.trim() ? 200 : 0);
    return () => { clearTimeout(timer); callsRequest.current += 1; };
  }, [agentData?.id, page, pageSize, datePreset, customStartDate, customEndDate, search, fetchCalls]);

  const exportToExcel = async () => {
    if (recentCalls.length === 0) {
      alert('No call records available to export.');
      return;
    }
    setExportingExcel(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const { saveAs } = await import('file-saver');

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('My Call Logs');
      worksheet.columns = [
        { header: 'Calling Timestamp', key: 'time', width: 22 },
        { header: 'Customer Number', key: 'customer', width: 18 },
        { header: 'Direction', key: 'direction', width: 14 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Answer Time (IST)', key: 'answer_time', width: 22 },
        { header: 'End Time (IST)', key: 'end_time', width: 22 },
        { header: 'Ringing (s)', key: 'ringing', width: 14 },
        { header: 'Talk Duration (s)', key: 'talk', width: 16 },
        { header: 'Recording URL', key: 'recording', width: 45 }
      ];

      recentCalls.forEach(c => {
        worksheet.addRow({
          time: fmtDate(c.created_at || c.start_time),
          customer: c.customer_number || '—',
          direction: (c.direction || 'outbound').toUpperCase(),
          status: (c.status || '—').toUpperCase(),
          answer_time: fmtDate(c.agent_answer_time || c.customer_answer_time),
          end_time: fmtDate(c.end_time),
          ringing: c.ringing_duration_sec != null ? c.ringing_duration_sec : '—',
          talk: c.talk_duration_sec != null ? c.talk_duration_sec : '—',
          recording: c.recording_url || '—'
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
      const nowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      saveAs(new Blob([buffer]), `My_Call_Logs_${nowStr}.xlsx`);
    } catch (err) {
      console.error('Export Excel failed:', err);
      alert('Failed to export Excel: ' + err.message);
    } finally {
      setExportingExcel(false);
    }
  };

  const handleSelfActivate = async () => {
    setActivating(true);
    try {
      const { autoProvisionCallAgent } = await import('@/app/actions/team');
      const res = await autoProvisionCallAgent(userId, userCompany);
      if (res.success && res.data) {
        setAgentData(res.data);
        if (res.data.status) setAgentStatus(res.data.status);
        await fetchCalls(res.data.id, page, pageSize, datePreset, customStartDate, customEndDate, search);
      } else {
        alert(res.error || 'Failed to activate agent extension');
      }
    } catch (err) {
      console.error(err);
      alert('Error activating agent extension: ' + (err.message || 'Unknown error'));
    } finally {
      setActivating(false);
    }
  };

  if (!agentData && (loading || deskError)) {
    return <div style={{ padding: '1.5rem' }}>
      <h1 style={{ fontSize: '1.6rem', color: '#1e293b' }}>Telecalling Desk</h1>
      <p>My Call Logs</p>
      {deskError ? <div role="alert">{deskError} <button type="button" onClick={fetchAgentProfile}>Retry</button></div>
        : <p role="status" style={{ color: '#64748b' }}><Loader2 size={16} className="spin" /> Loading your call records…</p>}
    </div>;
  }

  if (!agentData) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80%', padding: '2rem' }}>
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '2.5rem',
          maxWidth: '520px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: '#eff6ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
            color: '#3b82f6'
          }}>
            <PhoneCall size={32} />
          </div>
          <span style={{
            display: 'inline-block',
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            background: '#f1f5f9',
            color: '#475569',
            fontSize: '0.78rem',
            fontWeight: 600,
            marginBottom: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            {userCompany || 'Workspace Telecalling'}
          </span>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
            Telecalling Desk Activation
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.75rem' }}>
            Welcome to your workspace Telecalling Desk. Click below to activate your telecalling extension and start tracking customer calls, dialer history, and calling analytics.
          </p>
          <button
            onClick={handleSelfActivate}
            disabled={activating}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '0.85rem 1.5rem',
              borderRadius: '10px',
              background: '#2563eb',
              color: 'white',
              fontWeight: 600,
              fontSize: '0.95rem',
              border: 'none',
              cursor: activating ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.25)',
              opacity: activating ? 0.7 : 1,
              transition: 'all 0.15s ease-in-out'
            }}
          >
            {activating ? (
              <>
                <Loader2 size={18} className="spin" />
                <span>Activating Extension...</span>
              </>
            ) : (
              <>
                <PhoneCall size={18} />
                <span>Activate Telecalling Extension</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem', height: '100%', overflowY: 'auto', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PhoneCall size={26} color="#3b82f6" /> Telecalling Dashboard
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.2rem' }}>
            Agent: <strong>{agentData.display_name || 'Agent'}</strong> | SIP: {agentData.plivo_sip_uri || 'Not Assigned'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'white', padding: '0.45rem 1rem', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: agentStatus === 'available' ? '#10b981' : '#cbd5e1' }} />
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}>
            {agentStatus === 'available' ? 'Agent Ready' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Controls Bar: Search, Quick IST Date Presets, Excel Export, Refresh, Total Records */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '0.85rem 1rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            placeholder="Search customer number..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            style={{ width: '100%', padding: '0.5rem 1rem 0.5rem 2.25rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: 'white', boxSizing: 'border-box' }}
          />
        </div>

        {/* Quick Date Presets (Strict IST) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#f8fafc', padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => { setCustomStartDate(e.target.value); setPage(0); }}
                style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', background: 'white' }}
              />
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => { setCustomEndDate(e.target.value); setPage(0); }}
                style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', background: 'white' }}
              />
            </div>
          )}
        </div>

        {/* Excel Export Button */}
        <button 
          onClick={exportToExcel} 
          disabled={exportingExcel || recentCalls.length === 0}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', 
            background: '#0284c7', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', 
            fontWeight: 600, fontSize: '0.82rem', opacity: (exportingExcel || recentCalls.length === 0) ? 0.6 : 1,
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}
          title="Export displayed call records to Excel"
        >
          <FileSpreadsheet size={14} /> {exportingExcel ? 'Exporting...' : 'Export Excel'}
        </button>

        {/* Refresh Button */}
        <button 
          onClick={() => {
            if (agentData?.id) {
              fetchCalls(agentData.id, page, pageSize, datePreset, customStartDate, customEndDate, search);
            }
          }} 
          disabled={callsLoading}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', 
            background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', 
            fontWeight: 600, fontSize: '0.82rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}
        >
          <RefreshCw size={14} className={callsLoading ? 'spin' : ''} /> Refresh
        </button>

        {/* Total Records Badge */}
        <span style={{ color: '#64748b', fontSize: '0.82rem', background: '#f1f5f9', padding: '0.4rem 0.75rem', borderRadius: '6px' }}>
          Total: <strong style={{ color: '#0f172a' }}>{totalCalls}</strong>
        </span>
      </div>

      {deskError && <div role="alert" style={{ padding: 12, color: "#b91c1c" }}>{deskError}</div>}
      {/* Main Call Logs Card */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Clock size={16} color="#3b82f6" /> My Call Logs
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Strict IST (Asia/Kolkata)
            </span>
            <TableViewToggle view={callLogView} onChange={setCallLogView} />
          </div>
        </div>

        {/* Responsive Table with Draggable Resizable Columns */}
        <div style={tableScroll}>
          <MobileTableView id="CallCenter/CallCenterModule-1" view={callLogView} hideToggle={true}><table style={{ width: `${Math.max(1185, getTotalTableWidth())}px`, tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead style={stickyHeader}>
              <tr style={{ fontSize: '0.76rem', textTransform: 'uppercase', color: 'var(--text-secondary, #64748b)', borderBottom: '1px solid #e2e8f0', letterSpacing: '0.04em' }}>
                <th style={{ width: `${colWidths.time}px`, padding: '0.65rem 0.75rem', fontWeight: 700, ...stickyHeader, boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Calling Timestamp</span>
                  </div>
                  <ColumnResizer colKey="time" isResizing={resizingCol === 'time'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.direction}px`, padding: '0.65rem 0.75rem', fontWeight: 700, ...stickyHeader, boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Direction</span>
                  </div>
                  <ColumnResizer colKey="direction" isResizing={resizingCol === 'direction'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.customer}px`, padding: '0.65rem 0.75rem', fontWeight: 700, ...stickyHeader, boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Customer Number</span>
                  </div>
                  <ColumnResizer colKey="customer" isResizing={resizingCol === 'customer'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.status}px`, padding: '0.65rem 0.75rem', fontWeight: 700, ...stickyHeader, boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Status</span>
                  </div>
                  <ColumnResizer colKey="status" isResizing={resizingCol === 'status'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.answer_time}px`, padding: '0.65rem 0.75rem', fontWeight: 700, ...stickyHeader, boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Answer Time (IST)</span>
                  </div>
                  <ColumnResizer colKey="answer_time" isResizing={resizingCol === 'answer_time'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.end_time}px`, padding: '0.65rem 0.75rem', fontWeight: 700, ...stickyHeader, boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>End Time (IST)</span>
                  </div>
                  <ColumnResizer colKey="end_time" isResizing={resizingCol === 'end_time'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.ringing}px`, padding: '0.65rem 0.75rem', fontWeight: 700, ...stickyHeader, boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Ringing Duration</span>
                  </div>
                  <ColumnResizer colKey="ringing" isResizing={resizingCol === 'ringing'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.talk}px`, padding: '0.65rem 0.75rem', fontWeight: 700, ...stickyHeader, boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Talk Duration</span>
                  </div>
                  <ColumnResizer colKey="talk" isResizing={resizingCol === 'talk'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
                <th style={{ width: `${colWidths.recording}px`, padding: '0.65rem 0.75rem', fontWeight: 700, ...stickyHeader, boxSizing: 'border-box', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                    <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Recording</span>
                  </div>
                  <ColumnResizer colKey="recording" isResizing={resizingCol === 'recording'} onResizeStart={handleResizeStart} onReset={resetColWidth} />
                </th>
              </tr>
            </thead>
            <tbody>
              {callsLoading && !recentCalls.length ? (
                <tr>
                  <td colSpan={9} style={{ padding: '3rem', textAlign: 'center' }}>
                    <Loader2 className="spin" size={24} color="#3b82f6" style={{ margin: '0 auto 0.5rem' }} />
                    <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Loading call records...</div>
                  </td>
                </tr>
              ) : recentCalls.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                    No call records found for the selected criteria.
                  </td>
                </tr>
              ) : (
                recentCalls.map((call, idx) => (
                  <tr key={call.id || `call-${idx}`} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                    {/* Calling Timestamp */}
                    <td style={{ width: `${colWidths.time}px`, padding: '0.75rem 1rem', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', boxSizing: 'border-box' }} title={fmtDate(call.created_at || call.start_time)}>
                      {fmtDate(call.created_at || call.start_time)}
                    </td>

                    {/* Direction */}
                    <td style={{ width: `${colWidths.direction}px`, padding: '0.75rem 1rem', whiteSpace: 'nowrap', boxSizing: 'border-box' }} title={call.direction || 'outbound'}>
                      {directionBadge(call.direction || 'outbound')}
                    </td>

                    {/* Customer */}
                    <td style={{ width: `${colWidths.customer}px`, padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a', fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', boxSizing: 'border-box' }} title={call.customer_number || '—'}>
                      {call.customer_number || '—'}
                    </td>

                    {/* Status */}
                    <td style={{ width: `${colWidths.status}px`, padding: '0.75rem 1rem', whiteSpace: 'nowrap', boxSizing: 'border-box' }} title={call.status || '—'}>
                      {callStatusBadge(call.status)}
                    </td>

                    {/* Answer Time (IST) */}
                    <td style={{ width: `${colWidths.answer_time}px`, padding: '0.75rem 1rem', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', boxSizing: 'border-box' }} title={fmtDate(call.agent_answer_time || call.customer_answer_time)}>
                      {fmtDate(call.agent_answer_time || call.customer_answer_time)}
                    </td>

                    {/* End Time (IST) */}
                    <td style={{ width: `${colWidths.end_time}px`, padding: '0.75rem 1rem', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', boxSizing: 'border-box' }} title={fmtDate(call.end_time)}>
                      {fmtDate(call.end_time)}
                    </td>

                    {/* Ringing Duration */}
                    <td style={{ width: `${colWidths.ringing}px`, padding: '0.75rem 1rem', color: '#475569', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', boxSizing: 'border-box' }} title={call.ringing_duration_sec != null ? `${call.ringing_duration_sec}s` : '—'}>
                      {call.ringing_duration_sec != null ? `${call.ringing_duration_sec}s` : '—'}
                    </td>

                    {/* Talk Duration */}
                    <td style={{ width: `${colWidths.talk}px`, padding: '0.75rem 1rem', color: '#0f172a', fontWeight: 500, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', boxSizing: 'border-box' }} title={call.talk_duration_sec != null ? `${call.talk_duration_sec}s` : '—'}>
                      {call.talk_duration_sec != null ? `${call.talk_duration_sec}s` : '—'}
                    </td>

                    {/* Recording Audio & Download */}
                    <td style={{ width: `${colWidths.recording}px`, padding: '0.75rem 1rem', fontSize: '0.82rem', whiteSpace: 'nowrap', boxSizing: 'border-box' }}>
                      {call.recording_url ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button
                            onClick={() => togglePlay(call.id, call.recording_url)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              border: 'none',
                              background: playingCallId === call.id ? '#ef4444' : '#1e3a8a',
                              color: 'white',
                              cursor: 'pointer',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                              transition: 'all 0.2s'
                            }}
                            title={playingCallId === call.id ? 'Pause Recording' : 'Play Recording'}
                          >
                            {playingCallId === call.id ? <Pause size={12} /> : <Play size={12} />}
                          </button>

                          <a
                            href={call.recording_url}
                            download={`recording_${call.id || idx}.mp3`}
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
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                              transition: 'all 0.2s'
                            }}
                            title="Download Recording"
                          >
                            <Download size={12} />
                          </a>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table></MobileTableView>
        </div>

        <CallCenterPagination total={totalCalls} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} disabled={callsLoading} />
      </div>
    </div>
  );
}
