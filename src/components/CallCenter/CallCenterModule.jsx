'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  PhoneCall, Users, Clock, Database, Loader2, ShieldAlert,
  Calendar, Search, RefreshCw, FileSpreadsheet, Play, Pause,
  Download, PhoneIncoming, PhoneOutgoing
} from 'lucide-react';
import { getAgentProfile, getRecentCalls, updateCallAgentAdmin } from '@/app/actions/team';

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

export default function CallCenterModule({ userId }) {
  const [agentData, setAgentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [callsLoading, setCallsLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState('offline');

  // Call Logs & Pagination
  const [recentCalls, setRecentCalls] = useState([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [page, setPage] = useState(0);

  // Rows per page (synced with crmPageNavSettings)
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
    setCallsLoading(true);
    try {
      const { startDate, endDate } = getISTDateRange(preset, cStart, cEnd);
      const res = await getRecentCalls(agentId, {
        limit: pSize,
        offset: pg * pSize,
        startDate,
        endDate,
        search: searchTerm
      });

      if (res.data) {
        setRecentCalls(res.data);
        setTotalCalls(res.total || 0);
      }
    } catch (err) {
      console.error('Error fetching call logs:', err);
    } finally {
      setCallsLoading(false);
    }
  }, []);

  const fetchAgentProfile = useCallback(async () => {
    try {
      const { data, error } = await getAgentProfile(userId);
      if (data) {
        setAgentData(data);
        if (data.status) {
          setAgentStatus(data.status);
        }
        await fetchCalls(data.id, page, pageSize, datePreset, customStartDate, customEndDate, search);
      }
    } catch (err) {
      console.error('Error fetching agent profile', err);
    } finally {
      setLoading(false);
    }
  }, [userId, page, pageSize, datePreset, customStartDate, customEndDate, search, fetchCalls]);

  useEffect(() => {
    fetchAgentProfile();
  }, [fetchAgentProfile]);

  // Refetch calls when pagination, datePreset, or search changes
  useEffect(() => {
    if (agentData?.id) {
      fetchCalls(agentData.id, page, pageSize, datePreset, customStartDate, customEndDate, search);
    }
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
        { header: 'Call Date/Time (IST)', key: 'time', width: 22 },
        { header: 'Customer Number', key: 'customer', width: 18 },
        { header: 'Direction', key: 'direction', width: 14 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Start Time (IST)', key: 'start_time', width: 22 },
        { header: 'Answer Time (IST)', key: 'answer_time', width: 22 },
        { header: 'End Time (IST)', key: 'end_time', width: 22 },
        { header: 'Ringing (s)', key: 'ringing', width: 14 },
        { header: 'Talk Duration (s)', key: 'talk', width: 16 },
        { header: 'Recording URL', key: 'recording', width: 45 }
      ];

      recentCalls.forEach(c => {
        worksheet.addRow({
          time: fmtDate(c.created_at),
          customer: c.customer_number || '—',
          direction: (c.direction || 'outbound').toUpperCase(),
          status: (c.status || '—').toUpperCase(),
          start_time: fmtDate(c.start_time),
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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#666', gap: '0.5rem' }}>
        <Loader2 className="spin" size={24} color="#3b82f6" />
        <span>Loading Call Center...</span>
      </div>
    );
  }

  if (!agentData) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#666' }}>
        <ShieldAlert size={48} style={{ margin: '0 auto 1rem', color: '#ef4444' }} />
        <h2 style={{ color: '#1e293b', marginBottom: '0.5rem' }}>Call Center Access Denied</h2>
        <p style={{ color: '#64748b' }}>You have not been assigned as a Call Center Agent. Please contact the administrator.</p>
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

      {/* Main Call Logs Card */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Clock size={16} color="#3b82f6" /> My Call Logs
          </h3>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Strict IST (Asia/Kolkata)
          </span>
        </div>

        {/* Responsive Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead style={{ backgroundColor: 'var(--th-bg, #f8fafc)' }}>
              <tr style={{ fontSize: '0.76rem', textTransform: 'uppercase', color: 'var(--text-secondary, #64748b)', borderBottom: '1px solid #e2e8f0', letterSpacing: '0.04em' }}>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, whiteSpace: 'nowrap' }}>Date & Time (IST)</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, whiteSpace: 'nowrap' }}>Direction</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, whiteSpace: 'nowrap' }}>Customer Number</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, whiteSpace: 'nowrap' }}>Start Time (IST)</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, whiteSpace: 'nowrap' }}>Answer Time (IST)</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, whiteSpace: 'nowrap' }}>End Time (IST)</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, whiteSpace: 'nowrap' }}>Ringing Duration</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, whiteSpace: 'nowrap' }}>Talk Duration</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, whiteSpace: 'nowrap' }}>Recording</th>
              </tr>
            </thead>
            <tbody>
              {callsLoading ? (
                <tr>
                  <td colSpan={10} style={{ padding: '3rem', textAlign: 'center' }}>
                    <Loader2 className="spin" size={24} color="#3b82f6" style={{ margin: '0 auto 0.5rem' }} />
                    <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Loading call records...</div>
                  </td>
                </tr>
              ) : recentCalls.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                    No call records found for the selected criteria.
                  </td>
                </tr>
              ) : (
                recentCalls.map((call, idx) => (
                  <tr key={call.id || `call-${idx}`} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                    {/* Date & Time */}
                    <td style={{ padding: '0.75rem 1rem', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {fmtDate(call.created_at)}
                    </td>

                    {/* Direction */}
                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                      {directionBadge(call.direction || 'outbound')}
                    </td>

                    {/* Customer */}
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a', fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                      {call.customer_number || '—'}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                      {callStatusBadge(call.status)}
                    </td>

                    {/* Start Time (IST) */}
                    <td style={{ padding: '0.75rem 1rem', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {fmtDate(call.start_time)}
                    </td>

                    {/* Answer Time (IST) */}
                    <td style={{ padding: '0.75rem 1rem', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {fmtDate(call.agent_answer_time || call.customer_answer_time)}
                    </td>

                    {/* End Time (IST) */}
                    <td style={{ padding: '0.75rem 1rem', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {fmtDate(call.end_time)}
                    </td>

                    {/* Ringing Duration */}
                    <td style={{ padding: '0.75rem 1rem', color: '#475569', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {call.ringing_duration_sec != null ? `${call.ringing_duration_sec}s` : '—'}
                    </td>

                    {/* Talk Duration */}
                    <td style={{ padding: '0.75rem 1rem', color: '#0f172a', fontWeight: 500, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {call.talk_duration_sec != null ? `${call.talk_duration_sec}s` : '—'}
                    </td>

                    {/* Recording Audio & Download */}
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
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
          </table>
        </div>

        {/* Pagination & Rows Per Page Controls */}
        <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
              Showing {totalCalls === 0 ? 0 : page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCalls)} of {totalCalls} records
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button 
              onClick={() => setPage(p => Math.max(0, p - 1))} 
              disabled={page === 0 || callsLoading} 
              style={{ padding: '0.4rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500, opacity: page === 0 || callsLoading ? 0.4 : 1 }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>
              Page {totalCalls === 0 ? 1 : page + 1} of {Math.max(1, Math.ceil(totalCalls / pageSize))}
            </span>
            <button 
              onClick={() => setPage(p => p + 1)} 
              disabled={(page + 1) * pageSize >= totalCalls || callsLoading} 
              style={{ padding: '0.4rem 0.9rem', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500, opacity: (page + 1) * pageSize >= totalCalls || callsLoading ? 0.4 : 1 }}
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
