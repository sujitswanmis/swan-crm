'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, Play, Pause, RotateCcw, FastForward, Navigation, Battery,
  BatteryCharging, Smartphone, Clock, Calendar, Search, Filter,
  Download, CheckCircle, XCircle, AlertTriangle, User, ChevronRight,
  TrendingUp, Award, Layers, ShieldCheck, RefreshCw, Eye
} from 'lucide-react';
import {
  getEmployee360Route,
  getNationwideRadarData,
  getDailyConveyanceVouchers,
  updateVoucherApproval
} from '@/app/actions/liveTracking';
import { getTeamMembers } from '@/app/actions/team';
import useTableColumnResize, { ColumnResizer } from '@/utils/tableColumnResize';
import StandardTablePagination from '@/components/common/StandardTablePagination';

const DEFAULT_VOUCHER_WIDTHS = {
  employee: 200,
  date: 120,
  vehicle: 110,
  roadKm: 110,
  physicalVisits: 130,
  ratePerKm: 100,
  totalConveyance: 140,
  status: 120,
  actions: 140
};

export default function LiveFieldTrackingMap({ company = 'TNT00001', branchCode = null, currentUserRole = 'ADMIN' }) {
  const [activeMainTab, setActiveMainTab] = useState('360_PLAYBACK'); // '360_PLAYBACK', 'ALL_INDIA_RADAR', 'CONVEYANCE_VOUCHERS'

  // Global Filter State
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  });
  const [selectedCompany, setSelectedCompany] = useState(company);
  const [selectedBranch, setSelectedBranch] = useState(branchCode || '');

  // 1. Single Employee 360 Route Playback State
  const [activeEmployeesList, setActiveEmployeesList] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [routeData, setRouteData] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

  // Video-like Animated Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1, 2, 5
  const playbackTimerRef = useRef(null);

  // 2. All-India Radar State
  const [radarEmployees, setRadarEmployees] = useState([]);
  const [loadingRadar, setLoadingRadar] = useState(false);
  const [selectedStateFilter, setSelectedStateFilter] = useState('ALL');

  // 3. Conveyance Vouchers State
  const [vouchers, setVouchers] = useState([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [voucherSearch, setVoucherSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const s = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
        if (s.defaultPageSize) return s.defaultPageSize === 'All' ? 100000 : parseInt(s.defaultPageSize, 10) || 25;
      } catch (e) {}
    }
    return 25;
  });

  const { colWidths, resizingCol, handleResizeStart, resetColumnWidth } = useTableColumnResize(
    'live_conveyance_vouchers_table',
    DEFAULT_VOUCHER_WIDTHS
  );

  // -------------------------------------------------------------
  // Initial Data Fetching
  // -------------------------------------------------------------
  useEffect(() => {
    loadRadarAndEmployees();
  }, [selectedCompany, selectedBranch]);

  useEffect(() => {
    if (activeMainTab === 'CONVEYANCE_VOUCHERS') {
      loadVouchers();
    }
  }, [activeMainTab, selectedCompany, selectedBranch, selectedDate]);

  useEffect(() => {
    if (selectedUserId && activeMainTab === '360_PLAYBACK') {
      loadEmployeeRoute(selectedUserId, selectedDate);
    }
  }, [selectedUserId, selectedDate, activeMainTab]);

  const loadRadarAndEmployees = async () => {
    setLoadingRadar(true);
    try {
      const [radarData, allMembers] = await Promise.all([
        getNationwideRadarData(selectedCompany, selectedBranch || null),
        getTeamMembers(selectedCompany)
      ]);
      setRadarEmployees(radarData || []);

      // Build active employees list combining radar data and all team members
      const memberList = (allMembers && allMembers.length > 0) ? allMembers : (radarData || []);
      const combined = memberList.map(m => {
        const id = m.user_id || m.id;
        const pingMatch = (radarData || []).find(r => r.user_id === id);
        return {
          user_id: id,
          name: m.emp_name || m.name || m.email || id,
          role: m.role || 'Field Staff',
          hasPings: Boolean(pingMatch),
          battery_pct: pingMatch?.battery_pct,
          last_ping: pingMatch?.last_ping
        };
      });

      setActiveEmployeesList(combined);
      if (combined.length > 0 && !selectedUserId) {
        setSelectedUserId(combined[0].user_id);
      }
    } catch (err) {
      console.error('Failed to load radar data:', err);
    } finally {
      setLoadingRadar(false);
    }
  };

  const loadEmployeeRoute = async (userId, dateStr) => {
    setLoadingRoute(true);
    setIsPlaying(false);
    setPlaybackIndex(0);
    try {
      const data = await getEmployee360Route(userId, dateStr);
      setRouteData(data);
    } catch (err) {
      console.error('Failed to load 360 route:', err);
    } finally {
      setLoadingRoute(false);
    }
  };

  const loadVouchers = async () => {
    setLoadingVouchers(true);
    try {
      const data = await getDailyConveyanceVouchers(selectedCompany, selectedBranch || null, selectedDate);
      setVouchers(data || []);
    } catch (err) {
      console.error('Failed to load conveyance vouchers:', err);
    } finally {
      setLoadingVouchers(false);
    }
  };

  // -------------------------------------------------------------
  // Animated Route Playback Engine
  // -------------------------------------------------------------
  useEffect(() => {
    if (isPlaying && routeData?.polyline && routeData.polyline.length > 1) {
      const intervalMs = Math.max(100, Math.floor(600 / playbackSpeed));
      playbackTimerRef.current = setInterval(() => {
        setPlaybackIndex(prev => {
          if (prev >= routeData.polyline.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      clearInterval(playbackTimerRef.current);
    }
    return () => clearInterval(playbackTimerRef.current);
  }, [isPlaying, playbackSpeed, routeData]);

  // -------------------------------------------------------------
  // All-India State Clustered Counts
  // -------------------------------------------------------------
  const stateClusters = React.useMemo(() => {
    // Basic approximate mapping of coordinates to Northern/Indian states
    const clusters = {
      'Punjab': { count: 0, lat: 31.1471, lng: 75.3412 },
      'Haryana': { count: 0, lat: 29.0588, lng: 76.0856 },
      'Delhi NCR': { count: 0, lat: 28.7041, lng: 77.1025 },
      'Uttar Pradesh': { count: 0, lat: 26.8467, lng: 80.9462 },
      'Rajasthan': { count: 0, lat: 27.0238, lng: 74.2179 },
      'Maharashtra': { count: 0, lat: 19.7515, lng: 75.7139 },
      'Other': { count: 0, lat: 22.5937, lng: 78.9629 }
    };

    radarEmployees.forEach(emp => {
      const lat = emp.latitude;
      const lng = emp.longitude;
      if (lat >= 30.0 && lat <= 32.5 && lng >= 74.5 && lng <= 76.9) {
        clusters['Punjab'].count++;
      } else if (lat >= 28.0 && lat <= 30.5 && lng >= 75.5 && lng <= 77.5) {
        clusters['Haryana'].count++;
      } else if (lat >= 28.4 && lat <= 28.9 && lng >= 76.8 && lng <= 77.4) {
        clusters['Delhi NCR'].count++;
      } else if (lat >= 24.0 && lat <= 30.0 && lng >= 77.0 && lng <= 84.5) {
        clusters['Uttar Pradesh'].count++;
      } else if (lat >= 24.5 && lat <= 30.0 && lng >= 69.5 && lng <= 77.0) {
        clusters['Rajasthan'].count++;
      } else if (lat >= 15.5 && lat <= 22.0 && lng >= 72.5 && lng <= 80.5) {
        clusters['Maharashtra'].count++;
      } else {
        clusters['Other'].count++;
      }
    });

    return clusters;
  }, [radarEmployees]);

  // -------------------------------------------------------------
  // Conveyance Voucher Approval Handler
  // -------------------------------------------------------------
  const handleVoucherStatus = async (voucherId, status) => {
    try {
      const res = await updateVoucherApproval(voucherId, status, 'CURRENT_ADMIN');
      if (res.success) {
        setVouchers(prev => prev.map(v => v.id === voucherId ? { ...v, approval_status: status } : v));
      } else {
        alert(`Error: ${res.error}`);
      }
    } catch (err) {
      console.error('Failed to update voucher status:', err);
    }
  };

  // -------------------------------------------------------------
  // 1-Click CSV / Excel Export for Conveyance
  // -------------------------------------------------------------
  const handleExportConveyanceCSV = () => {
    if (vouchers.length === 0) {
      alert('No conveyance records to export for this date.');
      return;
    }
    const headers = ['Employee Name', 'Phone', 'Role', 'Date', 'Vehicle Type', 'Total Road KM', 'Verified Physical Visits', 'Rate/KM (INR)', 'Daily Allowance (INR)', 'Total Amount (INR)', 'Approval Status'];
    const rows = vouchers.map(v => [
      `"${v.employee_name}"`,
      `"${v.phone || ''}"`,
      `"${v.role || ''}"`,
      `"${v.date}"`,
      `"${v.vehicle_type}"`,
      v.total_km,
      v.physical_visits_count || 0,
      v.conveyance_rate_per_km,
      v.daily_allowance,
      v.total_conveyance_amount,
      `"${v.approval_status}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Conveyance_Claims_${selectedCompany}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Pagination for Vouchers Table
  const filteredVouchers = vouchers.filter(v =>
    v.employee_name?.toLowerCase().includes(voucherSearch.toLowerCase()) ||
    v.phone?.includes(voucherSearch)
  );
  const totalRecords = filteredVouchers.length;
  const totalPages = Math.ceil(totalRecords / rowsPerPage) || 1;
  const paginatedVouchers = filteredVouchers.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const currentRunnerPoint = routeData?.polyline?.[playbackIndex] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 'calc(100vh - 120px)', background: 'var(--bg-canvas, #f8fafc)' }}>
      {/* Top Header & View Switcher */}
      <div style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 8, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Navigation size={20} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Field Force 360° Radar & Live Tracking
            </h1>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Live GPS pings, animated route playback, stoppage audit, and automated TA/DA vouchers
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', background: '#f1f5f9', padding: 3, borderRadius: 8, gap: 2 }}>
          <button
            onClick={() => setActiveMainTab('360_PLAYBACK')}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              border: 'none',
              background: activeMainTab === '360_PLAYBACK' ? '#ffffff' : 'transparent',
              color: activeMainTab === '360_PLAYBACK' ? '#2563eb' : '#64748b',
              boxShadow: activeMainTab === '360_PLAYBACK' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Play size={13} />
            360° Route & Playback
          </button>

          <button
            onClick={() => setActiveMainTab('ALL_INDIA_RADAR')}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              border: 'none',
              background: activeMainTab === 'ALL_INDIA_RADAR' ? '#ffffff' : 'transparent',
              color: activeMainTab === 'ALL_INDIA_RADAR' ? '#2563eb' : '#64748b',
              boxShadow: activeMainTab === 'ALL_INDIA_RADAR' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Layers size={13} />
            All-India Cluster Radar
          </button>

          <button
            onClick={() => setActiveMainTab('CONVEYANCE_VOUCHERS')}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              border: 'none',
              background: activeMainTab === 'CONVEYANCE_VOUCHERS' ? '#ffffff' : 'transparent',
              color: activeMainTab === 'CONVEYANCE_VOUCHERS' ? '#2563eb' : '#64748b',
              boxShadow: activeMainTab === 'CONVEYANCE_VOUCHERS' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Award size={13} />
            Daily TA/DA Vouchers
          </button>
        </div>

        {/* Date & Filter controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: '4px 10px' }}>
            <Calendar size={14} color="#64748b" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, color: '#1e293b', outline: 'none' }}
            />
          </div>

          <button
            onClick={() => {
              if (activeMainTab === '360_PLAYBACK' && selectedUserId) loadEmployeeRoute(selectedUserId, selectedDate);
              else if (activeMainTab === 'ALL_INDIA_RADAR') loadRadarAndEmployees();
              else if (activeMainTab === 'CONVEYANCE_VOUCHERS') loadVouchers();
            }}
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
              color: '#475569'
            }}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* ============================================================= */}
      {/* VIEW 1: SINGLE EMPLOYEE 360° ROUTE & PLAYBACK (SCREENSHOT 1)  */}
      {/* ============================================================= */}
      {activeMainTab === '360_PLAYBACK' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left Panel: Employee Selector & Timeline */}
          <div style={{
            width: 360,
            background: '#ffffff',
            borderRight: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto'
          }}>
            {/* Employee Selector dropdown */}
            <div style={{ padding: 14, borderBottom: '1px solid #f1f5f9' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                SELECT FIELD EXECUTIVE
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#0f172a'
                }}
              >
                {activeEmployeesList.map(emp => (
                  <option key={emp.user_id} value={emp.user_id}>
                    {emp.name} ({emp.phone || 'Field Person'})
                  </option>
                ))}
              </select>
            </div>

            {/* Header Device & Stats Bar (Aapke Screenshot 1 Jaisa) */}
            {routeData && (
              <div style={{ padding: 14, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>TOTAL DISTANCE</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#2563eb' }}>{routeData.totalKm} km</div>
                  </div>

                  <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>CLIENT VISITS</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>{routeData.visitsCount} Completed</div>
                  </div>

                  <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Battery size={12} /> BATTERY
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                      {routeData.lastPing?.battery_pct ? `${routeData.lastPing.battery_pct}%` : '85%'}
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> LAST PING
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                      {routeData.lastPing?.recorded_at ? new Date(routeData.lastPing.recorded_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Chronological Stoppage & Visit Timeline */}
            <div style={{ padding: 14, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>VISIT & STOPPAGE TIMELINE</span>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
                  {routeData?.timeline?.length || 0} Events
                </span>
              </div>

              {loadingRoute ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b', fontSize: 13 }}>
                  <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  <div style={{ marginTop: 6 }}>Calculating route breadcrumbs...</div>
                </div>
              ) : !routeData || routeData.timeline?.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94a3b8', fontSize: 12 }}>
                  No GPS movement or client visits recorded on this date.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {routeData.timeline.map((item, idx) => {
                    const isVisit = item.type === 'visit';
                    return (
                      <div
                        key={idx}
                        style={{
                          background: isVisit ? '#f0fdf4' : '#fffbeb',
                          border: `1px solid ${isVisit ? '#bbf7d0' : '#fde68a'}`,
                          borderRadius: 8,
                          padding: '10px 12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: isVisit ? '#166534' : '#92400e',
                            color: '#ffffff'
                          }}>
                            {isVisit ? 'CLIENT VISIT' : 'STOPPAGE'}
                          </span>
                          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                            {item.durationMins} mins
                          </span>
                        </div>

                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                          {isVisit ? item.partyName : `Stoppage (${item.durationMins} mins)`}
                        </div>

                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {item.checkInTime ? new Date(item.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : (item.startTime ? new Date(item.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '')}
                          {item.connectivityMode && ` • ${item.connectivityMode}`}
                        </div>

                        {item.isGeofenceFlagged && (
                          <div style={{ color: '#dc2626', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle size={11} /> 🚨 Geofence Mismatch Flagged!
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Center Map & Video-Like Animated Playback Slider */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc', position: 'relative' }}>
            {/* Interactive SVG Canvas / Route Map View */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* Simulated High-Res Vector Route Canvas */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: '#f8fafc',
                backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px)',
                backgroundSize: '24px 24px'
              }} />

              {/* Map Route Polyline Container */}
              {routeData?.polyline && routeData.polyline.length > 0 ? (
                <div style={{ position: 'relative', width: '92%', height: '84%', border: '1px solid #cbd5e1', borderRadius: 12, overflow: 'hidden', background: '#ffffff', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                  {/* SVG Route Visualization */}
                  <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
                    <defs>
                      <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#2563eb" />
                        <stop offset="50%" stopColor="#0284c7" />
                        <stop offset="100%" stopColor="#16a34a" />
                      </linearGradient>
                    </defs>

                    {/* Polyline path */}
                    <path
                      d={routeData.polyline.map((p, i) => {
                        const x = 50 + ((p.lng - 75.0) * 800) % 700;
                        const y = 50 + ((32.0 - p.lat) * 800) % 450;
                        return `${i === 0 ? 'M' : 'L'} ${Math.max(40, Math.min(750, x))} ${Math.max(40, Math.min(450, y))}`;
                      }).join(' ')}
                      fill="none"
                      stroke="url(#routeGradient)"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Stoppage Circles */}
                    {routeData.timeline?.filter(t => t.type === 'stoppage').map((st, i) => {
                      const cx = 50 + ((st.lng - 75.0) * 800) % 700;
                      const cy = 50 + ((32.0 - st.lat) * 800) % 450;
                      return (
                        <circle key={i} cx={Math.max(40, Math.min(750, cx))} cy={Math.max(40, Math.min(450, cy))} r="8" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />
                      );
                    })}

                    {/* Client Visit Markers */}
                    {routeData.timeline?.filter(t => t.type === 'visit').map((vt, i) => {
                      const cx = 50 + ((vt.lng - 75.0) * 800) % 700;
                      const cy = 50 + ((32.0 - vt.lat) * 800) % 450;
                      return (
                        <g key={i}>
                          <circle cx={Math.max(40, Math.min(750, cx))} cy={Math.max(40, Math.min(450, cy))} r="10" fill="#10b981" stroke="#ffffff" strokeWidth="2.5" />
                          <text x={Math.max(40, Math.min(750, cx)) + 14} y={Math.max(40, Math.min(450, cy)) + 4} fill="#0f172a" fontSize="11" fontWeight="bold">
                            {vt.partyName}
                          </text>
                        </g>
                      );
                    })}

                    {/* Active Playhead Runner Marker */}
                    {currentRunnerPoint && (
                      <g>
                        <circle
                          cx={Math.max(40, Math.min(750, 50 + ((currentRunnerPoint.lng - 75.0) * 800) % 700))}
                          cy={Math.max(40, Math.min(450, 50 + ((32.0 - currentRunnerPoint.lat) * 800) % 450))}
                          r="14"
                          fill="#ef4444"
                          stroke="#ffffff"
                          strokeWidth="3"
                          style={{ filter: 'drop-shadow(0 2px 6px rgba(239,68,68,0.5))' }}
                        />
                      </g>
                    )}
                  </svg>

                  {/* Top Overlay Badge */}
                  <div style={{ position: 'absolute', top: 12, left: 14, background: 'rgba(255,255,255,0.95)', padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1', color: '#0f172a', fontSize: 12, boxShadow: '0 2px 4px rgba(0,0,0,0.06)' }}>
                    📍 Live Runner: <strong>{currentRunnerPoint?.speed || 0} km/h</strong> • {currentRunnerPoint?.time ? new Date(currentRunnerPoint.time).toLocaleTimeString('en-IN') : 'Start'}
                  </div>
                </div>
              ) : (
                <div style={{ color: '#64748b', textAlign: 'center', background: '#ffffff', padding: '30px 40px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <Navigation size={42} style={{ opacity: 0.4, margin: '0 auto 10px', color: '#2563eb' }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Select an Employee to View 360° Route</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Pick any field person from the left panel to replay their journey.</div>
                </div>
              )}
            </div>

            {/* Video-Like Animated Playback Controls Bottom Bar */}
            <div style={{
              background: '#ffffff',
              borderTop: '1px solid #e2e8f0',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 16
            }}>
              {/* Play / Pause button */}
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: '#2563eb',
                  border: 'none',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.3)'
                }}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
              </button>

              <button
                type="button"
                onClick={() => { setPlaybackIndex(0); setIsPlaying(false); }}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Reset to Start"
              >
                <RotateCcw size={16} />
              </button>

              {/* Progress Slider */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: '#64748b', minWidth: 45, fontWeight: 600 }}>
                  {routeData?.polyline?.[playbackIndex]?.time ? new Date(routeData.polyline[playbackIndex].time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '00:00'}
                </span>

                <input
                  type="range"
                  min="0"
                  max={Math.max(0, (routeData?.polyline?.length || 1) - 1)}
                  value={playbackIndex}
                  onChange={(e) => setPlaybackIndex(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }}
                />

                <span style={{ fontSize: 11, color: '#64748b', minWidth: 45, fontWeight: 600 }}>
                  {routeData?.polyline?.length ? new Date(routeData.polyline[routeData.polyline.length - 1].time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '00:00'}
                </span>
              </div>

              {/* Speed Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {[1, 2, 5].map(spd => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setPlaybackSpeed(spd)}
                    style={{
                      background: playbackSpeed === spd ? '#2563eb' : '#f1f5f9',
                      color: playbackSpeed === spd ? '#ffffff' : '#334155',
                      border: '1px solid #e2e8f0',
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* VIEW 2: ALL-INDIA CLUSTER RADAR MAP (SCREENSHOT 2)            */}
      {/* ============================================================= */}
      {activeMainTab === 'ALL_INDIA_RADAR' && (
        <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* State Bubbles Row (Screenshot 2 Match) */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(stateClusters).map(([stateName, cluster]) => (
              <div
                key={stateName}
                onClick={() => setSelectedStateFilter(stateName)}
                style={{
                  background: selectedStateFilter === stateName ? '#2563eb' : '#ffffff',
                  color: selectedStateFilter === stateName ? '#ffffff' : '#0f172a',
                  border: `1.5px solid ${selectedStateFilter === stateName ? '#2563eb' : '#e2e8f0'}`,
                  borderRadius: 12,
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{stateName}</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{cluster.count}</div>
                </div>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: selectedStateFilter === stateName ? 'rgba(255,255,255,0.2)' : '#eff6ff',
                  color: selectedStateFilter === stateName ? '#ffffff' : '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 12
                }}>
                  {cluster.count}
                </div>
              </div>
            ))}
          </div>

          {/* Active Field Personnel List */}
          <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                Field Force Distribution ({radarEmployees.length} Active Today)
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {radarEmployees.map((emp, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#f8fafc',
                      borderRadius: 10,
                      padding: 14,
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{emp.name}</span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: emp.is_moving ? '#dcfce7' : '#f1f5f9',
                        color: emp.is_moving ? '#166534' : '#475569'
                      }}>
                        {emp.is_moving ? '🟢 Moving' : '⚪ Stationary'}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Role: <strong>{emp.role}</strong> • Branch: {emp.branch_code || 'Main Plant'}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#475569', paddingTop: 6, borderTop: '1px solid #e2e8f0' }}>
                      <span>Speed: {emp.speed_kmh} km/h</span>
                      <span>Battery: {emp.battery_pct}%</span>
                      <span>{new Date(emp.recorded_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* VIEW 3: DAILY CONVEYANCE & TA/DA VOUCHERS (ACCOUNTS EXPORT)   */}
      {/* ============================================================= */}
      {activeMainTab === 'CONVEYANCE_VOUCHERS' && (
        <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Controls Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', width: 260 }}>
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 10 }} />
                <input
                  type="text"
                  placeholder="Search executive or phone..."
                  value={voucherSearch}
                  onChange={(e) => { setVoucherSearch(e.target.value); setCurrentPage(1); }}
                  style={{
                    width: '100%',
                    padding: '7px 10px 7px 32px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <button
              onClick={handleExportConveyanceCSV}
              style={{
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 6px rgba(22,163,74,0.3)'
              }}
            >
              <Download size={14} />
              Export to Excel / CSV
            </button>
          </div>

          {/* Standard Resizable Table with Sticky Header */}
          <div style={{
            background: '#ffffff',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 310px)', minHeight: '380px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ width: colWidths.employee, position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', padding: '10px 14px', fontWeight: 700, color: '#475569' }}>
                      Executive Name
                      <ColumnResizer colKey="employee" onResizeStart={handleResizeStart} onReset={resetColumnWidth} isResizing={resizingCol === 'employee'} />
                    </th>
                    <th style={{ width: colWidths.date, position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', padding: '10px 14px', fontWeight: 700, color: '#475569' }}>
                      Date (IST)
                      <ColumnResizer colKey="date" onResizeStart={handleResizeStart} onReset={resetColumnWidth} isResizing={resizingCol === 'date'} />
                    </th>
                    <th style={{ width: colWidths.vehicle, position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', padding: '10px 14px', fontWeight: 700, color: '#475569' }}>
                      Vehicle
                      <ColumnResizer colKey="vehicle" onResizeStart={handleResizeStart} onReset={resetColumnWidth} isResizing={resizingCol === 'vehicle'} />
                    </th>
                    <th style={{ width: colWidths.roadKm, position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', padding: '10px 14px', fontWeight: 700, color: '#475569' }}>
                      Road KM
                      <ColumnResizer colKey="roadKm" onResizeStart={handleResizeStart} onReset={resetColumnWidth} isResizing={resizingCol === 'roadKm'} />
                    </th>
                    <th style={{ width: colWidths.physicalVisits, position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', padding: '10px 14px', fontWeight: 700, color: '#475569' }}>
                      Physical Visits
                      <ColumnResizer colKey="physicalVisits" onResizeStart={handleResizeStart} onReset={resetColumnWidth} isResizing={resizingCol === 'physicalVisits'} />
                    </th>
                    <th style={{ width: colWidths.ratePerKm, position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', padding: '10px 14px', fontWeight: 700, color: '#475569' }}>
                      Rate / KM
                      <ColumnResizer colKey="ratePerKm" onResizeStart={handleResizeStart} onReset={resetColumnWidth} isResizing={resizingCol === 'ratePerKm'} />
                    </th>
                    <th style={{ width: colWidths.totalConveyance, position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', padding: '10px 14px', fontWeight: 700, color: '#475569' }}>
                      Total TA/DA (₹)
                      <ColumnResizer colKey="totalConveyance" onResizeStart={handleResizeStart} onReset={resetColumnWidth} isResizing={resizingCol === 'totalConveyance'} />
                    </th>
                    <th style={{ width: colWidths.status, position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', padding: '10px 14px', fontWeight: 700, color: '#475569' }}>
                      Approval Status
                      <ColumnResizer colKey="status" onResizeStart={handleResizeStart} onReset={resetColumnWidth} isResizing={resizingCol === 'status'} />
                    </th>
                    <th style={{ width: colWidths.actions, position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', padding: '10px 14px', fontWeight: 700, color: '#475569' }}>
                      Actions
                      <ColumnResizer colKey="actions" onResizeStart={handleResizeStart} onReset={resetColumnWidth} isResizing={resizingCol === 'actions'} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loadingVouchers ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        Loading vouchers...
                      </td>
                    </tr>
                  ) : paginatedVouchers.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        No conveyance vouchers found for this date.
                      </td>
                    </tr>
                  ) : (
                    paginatedVouchers.map((v, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{v.employee_name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{v.phone || v.role}</div>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#334155' }}>{v.date}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                            {v.vehicle_type}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>{v.total_km} km</td>
                        <td style={{ padding: '10px 14px', color: '#16a34a', fontWeight: 600 }}>{v.physical_visits_count || 0}</td>
                        <td style={{ padding: '10px 14px' }}>₹{v.conveyance_rate_per_km}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 800, color: '#047857' }}>
                          ₹{v.total_conveyance_amount || ((v.total_km * v.conveyance_rate_per_km) + (v.daily_allowance || 150)).toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: v.approval_status === 'APPROVED' ? '#dcfce7' : v.approval_status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                            color: v.approval_status === 'APPROVED' ? '#166534' : v.approval_status === 'REJECTED' ? '#991b1b' : '#92400e'
                          }}>
                            {v.approval_status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {v.approval_status === 'PENDING' ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => handleVoucherStatus(v.id, 'APPROVED')}
                                style={{ background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleVoucherStatus(v.id, 'REJECTED')}
                                style={{ background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>Processed</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Standard Unified Bottom Navigation Bar */}
            <StandardTablePagination
              currentPage={currentPage}
              totalRecords={totalRecords}
              pageSize={rowsPerPage === 'All' ? 100000 : Number(rowsPerPage)}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setRowsPerPage(newSize);
                setCurrentPage(1);
              }}
              style={{ borderRadius: '0 0 10px 10px' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
