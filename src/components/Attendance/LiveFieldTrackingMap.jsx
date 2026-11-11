'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MapPin, Play, Pause, RotateCcw, FastForward, Navigation, Battery,
  BatteryCharging, Smartphone, Clock, Calendar, Search, Filter,
  Download, CheckCircle, XCircle, AlertTriangle, User, ChevronRight,
  TrendingUp, Award, Layers, ShieldCheck, RefreshCw, Eye, ChevronDown, Check, X,
  Wifi, WifiOff, Satellite, LocateFixed, Maximize2, Minimize2, Route, Globe, Sun, Map as MapIcon
} from 'lucide-react';
import {
  getEmployee360Route,
  getNationwideRadarData,
  getDailyConveyanceVouchers,
  updateVoucherApproval,
  getEmployeeDeviceHealthSummary
} from '@/app/actions/liveTracking';
import { getTeamMembers } from '@/app/actions/team';
import useTableColumnResize, { ColumnResizer } from '@/utils/tableColumnResize';
import StandardTablePagination from '@/components/common/StandardTablePagination';
import { snapRouteSegmentsToRoad, haversineMeters } from '@/utils/routeGeometryMatcher';

const isValidExecUuid = (v) => Boolean(v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v).trim()));

const MAP_TILE_STYLES = {
  street: {
    id: 'street',
    label: 'Street Map',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxNativeZoom: 19,
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    subdomains: '',
    maxNativeZoom: 18,
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri — World Imagery'
  },
  light: {
    id: 'light',
    label: 'Clean Light',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxNativeZoom: 19,
    maxZoom: 19,
    tileClassName: 'crm-clean-light-tiles',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }
};

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

// Angle/Bearing calculation in degrees (0 to 360) between two coordinates
function calculateBearing(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const dLon = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((Number(lat2) * Math.PI) / 180);
  const x =
    Math.cos((Number(lat1) * Math.PI) / 180) * Math.sin((Number(lat2) * Math.PI) / 180) -
    Math.sin((Number(lat1) * Math.PI) / 180) * Math.cos((Number(lat2) * Math.PI) / 180) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Splits a route into Going (Outward) and Return (Inward) only when a genuine turnaround occurs
 * (prevents false return legs on one-way trips or sparse 2-point gap days).
 */
function splitGoingAndReturnRoute(polyline) {
  if (!Array.isArray(polyline) || polyline.length === 0) {
    return { turnaroundIdx: 0, hasReturnTrip: false, maxDistMeters: 0, returnGainMeters: 0 };
  }

  const originLat = Number(polyline[0]?.lat);
  const originLng = Number(polyline[0]?.lng);
  if (isNaN(originLat) || isNaN(originLng) || polyline.length < 3) {
    return {
      turnaroundIdx: Math.max(0, polyline.length - 1),
      hasReturnTrip: false,
      maxDistMeters: 0,
      returnGainMeters: 0
    };
  }

  let maxIdx = 0;
  let maxDistMeters = 0;
  for (let i = 1; i < polyline.length; i++) {
    const lat = Number(polyline[i]?.lat);
    const lng = Number(polyline[i]?.lng);
    if (isNaN(lat) || isNaN(lng)) continue;
    const d = haversineMeters(originLat, originLng, lat, lng);
    if (d > maxDistMeters) {
      maxDistMeters = d;
      maxIdx = i;
    }
  }

  const endLat = Number(polyline[polyline.length - 1]?.lat);
  const endLng = Number(polyline[polyline.length - 1]?.lng);
  const endDistMeters =
    !isNaN(endLat) && !isNaN(endLng) ? haversineMeters(originLat, originLng, endLat, endLng) : maxDistMeters;
  const returnGainMeters = Math.max(0, maxDistMeters - endDistMeters);

  const hasReturnTrip =
    maxIdx > 0 &&
    maxIdx < polyline.length - 1 &&
    maxDistMeters >= 150 &&
    (returnGainMeters >= 100 || (maxDistMeters > 0 && returnGainMeters / maxDistMeters >= 0.25));

  return {
    turnaroundIdx: hasReturnTrip ? maxIdx : polyline.length - 1,
    hasReturnTrip,
    maxDistMeters,
    returnGainMeters
  };
}

const LIVE_OFFLINE_THRESHOLD_SEC = 90; // 1.5 minutes (3 missed ~25s heartbeats => truly offline)

function getTodayISTDateStr(nowMs = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(nowMs));
}

function formatDurationSeconds(totalSeconds) {
  if (totalSeconds == null || isNaN(totalSeconds)) return '0s';
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const remSec = s % 60;
  if (mins < 2 && remSec > 0) return `${mins}m ${remSec}s`;
  const hrs = Math.floor(mins / 60);
  const remMin = mins % 60;
  return hrs > 0 ? `${hrs}h ${remMin}m` : `${mins}m`;
}

function computeEmployeeLiveDeviceStatus(routeData, selectedDate, nowMs, fallbackEmployee = null) {
  const todayIST = getTodayISTDateStr(nowMs);
  const isToday = selectedDate === todayIST;

  if (!routeData) {
    const fallbackPingMs = fallbackEmployee?.last_ping ? new Date(fallbackEmployee.last_ping).getTime() : null;
    const fbGapSec = fallbackPingMs != null ? Math.max(0, Math.floor((nowMs - fallbackPingMs) / 1000)) : null;
    if (!isToday) {
      return {
        isToday: false,
        isShiftCompleted: false,
        lastPingMs: fallbackPingMs,
        lastPingTimeIST: null,
        gapSeconds: fbGapSec,
        battPct: fallbackEmployee?.battery_pct ?? null,
        isCharging: false,
        battColor: '#64748b',
        battLabel: 'N/A',
        mobileDataState: { label: 'Archive', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', isOff: false },
        gpsStatusState: { label: 'Archive', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', isOff: false },
        headerBadge: { label: 'Archive', color: '#64748b', dot: '#94a3b8' }
      };
    }
    const isFbLive = fbGapSec != null && fbGapSec <= LIVE_OFFLINE_THRESHOLD_SEC;
    return {
      isToday: true,
      isShiftCompleted: false,
      lastPingMs: fallbackPingMs,
      lastPingTimeIST: fallbackPingMs
        ? new Date(fallbackPingMs).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
        : null,
      gapSeconds: fbGapSec,
      battPct: fallbackEmployee?.battery_pct ?? null,
      isCharging: false,
      battColor: '#64748b',
      battLabel: fallbackEmployee?.battery_pct != null ? `${fallbackEmployee.battery_pct}%` : 'N/A',
      mobileDataState: isFbLive
        ? { label: 'Online', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', isOff: false }
        : {
            label: fbGapSec != null ? `Offline (${formatDurationSeconds(fbGapSec)} ago)` : 'No Data Yet',
            color: fbGapSec != null ? '#ea580c' : '#64748b',
            bg: fbGapSec != null ? '#fff7ed' : '#f8fafc',
            border: fbGapSec != null ? '#fed7aa' : '#e2e8f0',
            isOff: fbGapSec != null
          },
      gpsStatusState: isFbLive
        ? { label: fbGapSec < 10 ? 'Active (Live)' : `Active (${formatDurationSeconds(fbGapSec)} ago)`, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', isOff: false }
        : {
            label: fbGapSec != null ? `Offline (${formatDurationSeconds(fbGapSec)} ago)` : 'No GPS Ping',
            color: fbGapSec != null ? '#ea580c' : '#64748b',
            bg: fbGapSec != null ? '#fff7ed' : '#f8fafc',
            border: fbGapSec != null ? '#fed7aa' : '#e2e8f0',
            isOff: fbGapSec != null
          },
      headerBadge: isFbLive
        ? { label: 'Live Active', color: '#16a34a', dot: '#16a34a' }
        : fbGapSec != null
          ? { label: `Offline (${formatDurationSeconds(fbGapSec)} ago)`, color: '#ea580c', dot: '#ea580c' }
          : { label: 'No Signal', color: '#64748b', dot: '#94a3b8' }
    };
  }

  const lp = routeData.lastPing;
  const isShiftCompleted = Boolean(routeData.shiftCompleted);

  const battObj = routeData.latestBattery;
  const battPct = battObj?.pct != null ? battObj.pct : (lp?.battery_pct != null ? Number(lp.battery_pct) : null);
  const isCharging = battObj != null ? Boolean(battObj.isCharging) : Boolean(lp?.is_charging);
  const battColor = battPct == null ? '#64748b' : battPct <= 15 ? '#dc2626' : battPct <= 30 ? '#d97706' : '#16a34a';
  const battLabel = battPct != null ? `${battPct}%` : 'N/A';

  const lastPingMs = lp?.recorded_at ? new Date(lp.recorded_at).getTime() : null;
  const gapSeconds = lastPingMs != null ? Math.max(0, Math.floor((nowMs - lastPingMs) / 1000)) : null;
  const mobSessMs = routeData.mobileSessionLastActive ? new Date(routeData.mobileSessionLastActive).getTime() : null;
  const mobSessGapSeconds = mobSessMs != null ? Math.max(0, Math.floor((nowMs - mobSessMs) / 1000)) : null;
  const lastPingTimeIST = lp?.recorded_at
    ? new Date(lp.recorded_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    : null;

  let mobileDataState = { label: 'No Data Yet', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', isOff: false };
  let gpsStatusState = { label: 'No GPS Ping', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', isOff: false };
  let headerBadge = { label: 'No Signal', color: '#64748b', dot: '#94a3b8' };

  if (!isToday || isShiftCompleted) {
    mobileDataState = routeData.hadOfflineSync
      ? { label: 'Offline Gaps Synced', color: '#d97706', bg: '#fffbeb', border: '#fde68a', isOff: false }
      : lastPingMs
        ? { label: 'Tracked Online', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', isOff: false }
        : { label: 'No Data Logged', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', isOff: false };

    if (isShiftCompleted && routeData.punchOutTime) {
      const outTimeIST = new Date(routeData.punchOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
      gpsStatusState = { label: `Shift Ended (${outTimeIST})`, color: '#475569', bg: '#f1f5f9', border: '#cbd5e1', isOff: false };
      headerBadge = { label: `Shift Ended (${outTimeIST})`, color: '#475569', dot: '#64748b' };
    } else {
      gpsStatusState = { label: `Archive (${routeData.totalPings || 0} pings)`, color: '#475569', bg: '#f1f5f9', border: '#cbd5e1', isOff: false };
      headerBadge = { label: `Archive (${routeData.totalPings || 0})`, color: '#475569', dot: '#64748b' };
    }
  } else if (lastPingMs == null) {
    if (mobSessGapSeconds != null && mobSessGapSeconds <= LIVE_OFFLINE_THRESHOLD_SEC) {
      mobileDataState = { label: 'Online (App Active)', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', isOff: false };
      gpsStatusState = { label: 'GPS Off / No Lock', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', isOff: true };
      headerBadge = { label: 'GPS Off (App Online)', color: '#ea580c', dot: '#f59e0b' };
    }
  } else {
    const isLastPingOfflineSync = Boolean(lp?.is_offline_synced);
    const isGpsInactive = gapSeconds > LIVE_OFFLINE_THRESHOLD_SEC || isLastPingOfflineSync;
    const isMobileAppAlive =
      mobSessGapSeconds != null &&
      mobSessGapSeconds <= LIVE_OFFLINE_THRESHOLD_SEC &&
      !isLastPingOfflineSync;

    if (!isGpsInactive) {
      const agoText = gapSeconds < 10 ? 'Live' : `${formatDurationSeconds(gapSeconds)} ago`;
      mobileDataState = { label: 'Online', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', isOff: false };
      gpsStatusState = {
        label: gapSeconds < 10 ? 'Active (Live)' : `Active (${agoText})`,
        color: '#16a34a',
        bg: '#f0fdf4',
        border: '#bbf7d0',
        isOff: false
      };
      headerBadge = { label: 'Live Active', color: '#16a34a', dot: '#16a34a' };
    } else {
      const gapText = formatDurationSeconds(gapSeconds);
      const sinceLabel = `Off since ${lastPingTimeIST} (${gapText} ago)`;
      gpsStatusState = { label: sinceLabel, color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', isOff: true };
      mobileDataState = isMobileAppAlive
        ? { label: 'Online (App Active)', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', isOff: false }
        : { label: `Offline (${gapText} ago)`, color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', isOff: true };
      headerBadge = isMobileAppAlive
        ? { label: 'GPS Off (App Online)', color: '#ea580c', dot: '#f59e0b' }
        : { label: `Offline (${gapText} ago)`, color: '#ea580c', dot: '#ea580c' };
    }
  }

  return {
    isToday,
    isShiftCompleted,
    lastPingMs,
    lastPingTimeIST,
    gapSeconds,
    battPct,
    isCharging,
    battColor,
    battLabel,
    mobileDataState,
    gpsStatusState,
    headerBadge
  };
}

export default function LiveFieldTrackingMap({ company = 'New Swan Group', branchCode = null, currentUserRole = 'ADMIN', tenantId = null, onOpenDeviceHealth = null }) {
  const [activeMainTab, setActiveMainTab] = useState('360_PLAYBACK'); // '360_PLAYBACK', 'ALL_INDIA_RADAR', 'CONVEYANCE_VOUCHERS'

  // Global Filter State
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  });
  const [selectedCompany, setSelectedCompany] = useState(company || 'New Swan Group');
  const [selectedBranch, setSelectedBranch] = useState(branchCode || '');

  useEffect(() => {
    if (company) setSelectedCompany(company);
  }, [company]);

  // 1. Single Employee 360 Route Playback State (0ms Instant Client Hydration)
  const [activeEmployeesList, setActiveEmployeesList] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(`crm_cached_field_executives_${company || 'New Swan Group'}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (_) {}
    }
    return [];
  });

  const [selectedUserId, setSelectedUserId] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const lastSelected = localStorage.getItem(`crm_last_field_exec_${company || 'New Swan Group'}`);
        if (isValidExecUuid(lastSelected)) return String(lastSelected).trim();
        const cached = localStorage.getItem(`crm_cached_field_executives_${company || 'New Swan Group'}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          const firstValid = Array.isArray(parsed) ? parsed.find(item => isValidExecUuid(item?.user_id)) : null;
          if (firstValid) return String(firstValid.user_id).trim();
        }
      } catch (_) {}
    }
    return '';
  });

  const [routeData, setRouteData] = useState(null);
  const [deviceHealthState, setDeviceHealthState] = useState({ userId: '', summary: null });
  const [loadingRoute, setLoadingRoute] = useState(false);

  const selectedDeviceHealth =
    selectedUserId && deviceHealthState.userId === String(selectedUserId)
      ? deviceHealthState.summary
      : null;

  useEffect(() => {
    let active = true;
    const targetId = String(selectedUserId || '');
    if (!targetId) return undefined;
    getEmployeeDeviceHealthSummary(targetId, selectedCompany)
      .then((res) => {
        if (active && res?.success) {
          setDeviceHealthState({ userId: targetId, summary: res.summary || null });
        }
      })
      .catch(() => {
        // Non-blocking device health lookup
      });
    return () => { active = false; };
  }, [selectedUserId, selectedCompany]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onSelectExec = (ev) => {
      const targetId = ev?.detail?.userId;
      if (targetId) setSelectedUserId(String(targetId));
    };
    window.addEventListener('crm_select_field_exec', onSelectExec);
    return () => window.removeEventListener('crm_select_field_exec', onSelectExec);
  }, []);
  const [syncingRoute, setSyncingRoute] = useState(false);
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const [executiveSearch, setExecutiveSearch] = useState('');
  const [isExecutiveDropdownOpen, setIsExecutiveDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const routeCacheRef = useRef({});
  const lastRouteFetchMetaRef = useRef({ key: '', at: 0 });
  const routeFetchSeqRef = useRef(0);
  const lastFitRouteKeyRef = useRef('');

  useEffect(() => {
    if (isExecutiveDropdownOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isExecutiveDropdownOpen]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsExecutiveDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredExecutives = useMemo(() => {
    const q = executiveSearch.toLowerCase().trim();
    if (!q) return activeEmployeesList;
    return activeEmployeesList.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.phone.includes(q) ||
      e.role.toLowerCase().includes(q)
    );
  }, [activeEmployeesList, executiveSearch]);

  const selectedEmployee = useMemo(() => {
    return activeEmployeesList.find(e => e.user_id === selectedUserId) || null;
  }, [activeEmployeesList, selectedUserId]);

  const liveDeviceStatus = useMemo(() => {
    return computeEmployeeLiveDeviceStatus(routeData, selectedDate, liveNowMs, selectedEmployee);
  }, [routeData, selectedDate, liveNowMs, selectedEmployee]);

  // Video-like Animated Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1, 2, 5
  // Interactive Leaflet Map Refs & Dynamic Trail Refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersGroupRef = useRef(null);
  const estimateGroupRef = useRef(null);
  const tileLayerRef = useRef(null);
  const mapFullscreenWrapperRef = useRef(null);
  const runnerMarkerRef = useRef(null);
  const traveledTrailRef = useRef(null);
  const offlineGapLayersRef = useRef([]);
  const animFrameRef = useRef(null);
  const lastFrameTimeRef = useRef(null);
  const progressRef = useRef(0);
  const estimateSeqRef = useRef(0);
  const showEstimateRouteRef = useRef(false);
  const routeSplitInfoRef = useRef({ turnaroundIdx: 0, hasReturnTrip: false, maxDistMeters: 0, returnGainMeters: 0 });
  const effectiveTripFilterRef = useRef('ALL');
  const [currentTelemetry, setCurrentTelemetry] = useState(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [mapStyle, setMapStyle] = useState('street');
  const [showMapStyleMenu, setShowMapStyleMenu] = useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [showEstimateRoute, setShowEstimateRoute] = useState(false);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [estimateSummary, setEstimateSummary] = useState(null);
  const [routeTripFilter, setRouteTripFilter] = useState('ALL'); // 'ALL' | 'GOING' | 'RETURN'

  const routeSplitInfo = useMemo(() => splitGoingAndReturnRoute(routeData?.polyline), [routeData?.polyline]);
  const effectiveTripFilter = routeSplitInfo.hasReturnTrip ? routeTripFilter : 'ALL';

  const routeSpeedStats = useMemo(() => {
    const poly = routeData?.polyline || [];
    if (poly.length === 0) return { avgSpeed: 0, maxSpeed: 0 };
    const startIdx =
      routeSplitInfo.hasReturnTrip && effectiveTripFilter === 'RETURN'
        ? routeSplitInfo.turnaroundIdx
        : 0;
    const endIdx =
      routeSplitInfo.hasReturnTrip && effectiveTripFilter === 'GOING'
        ? routeSplitInfo.turnaroundIdx
        : poly.length - 1;

    let maxSpeed = 0;
    let sumMoving = 0;
    let movingCount = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      const pt = poly[i];
      if (!pt || pt.isOffline) continue;
      const spd = Math.round(Number(pt.speed || 0));
      if (isNaN(spd) || spd <= 0) continue;
      if (spd > maxSpeed) maxSpeed = spd;
      if (spd >= 4) {
        sumMoving += spd;
        movingCount++;
      }
    }
    return {
      avgSpeed: movingCount > 0 ? Math.round(sumMoving / movingCount) : 0,
      maxSpeed
    };
  }, [routeData?.polyline, routeSplitInfo, effectiveTripFilter]);

  useEffect(() => {
    routeSplitInfoRef.current = routeSplitInfo;
    effectiveTripFilterRef.current = effectiveTripFilter;
  }, [routeSplitInfo, effectiveTripFilter]);

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
  // Initial Data Fetching & Dynamic Leaflet Loader (Resilient Multi-CDN)
  // -------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.L) {
      setLeafletReady(true);
      return;
    }

    // 1. Ensure Leaflet CSS is in head
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      link.onerror = () => {
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      };
      document.head.appendChild(link);
    }

    // 2. Ensure Leaflet JS is loaded
    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      script.async = true;
      script.onload = () => {
        if (window.L) setLeafletReady(true);
      };
      script.onerror = () => {
        const fb = document.createElement('script');
        fb.id = 'leaflet-js-fallback';
        fb.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        fb.onload = () => {
          if (window.L) setLeafletReady(true);
        };
        document.body.appendChild(fb);
      };
      document.body.appendChild(script);
    }

    // 3. Active Poller to detect window.L if already in DOM / loading
    const poller = setInterval(() => {
      if (window.L) {
        setLeafletReady(true);
        clearInterval(poller);
      }
    }, 100);

    const safetyTimer = setTimeout(() => {
      clearInterval(poller);
    }, 8000);

    return () => {
      clearInterval(poller);
      clearTimeout(safetyTimer);
    };
  }, []);

  const loadRadarAndEmployees = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoadingRadar(true);
    try {
      const [radarData, allMembers] = await Promise.all([
        getNationwideRadarData(selectedCompany, selectedBranch || null),
        getTeamMembers(selectedCompany, tenantId)
      ]);
      setRadarEmployees(radarData || []);

      // Build active employees list strictly for genuine, approved active employees of this tenant
      const rawList = (allMembers && allMembers.length > 0) ? allMembers : (radarData || []);
      const filteredMembers = rawList.filter(m => {
        const role = String(m.role || '').toLowerCase();
        if (role === 'customer') return false;
        if (m.emp_status && String(m.emp_status).toLowerCase() !== 'active') return false;
        if (m.is_approved === false) return false;
        return true;
      });

      const nowMs = Date.now();
      const combined = filteredMembers
        .filter(m => isValidExecUuid(m.user_id || m.id))
        .map(m => {
          const id = String(m.user_id || m.id).trim();
          const pingMatch = (radarData || []).find(r => r.user_id === id);
          return {
            user_id: id,
            name: (m.emp_name || m.name || m.email || id).trim(),
            role: m.role || 'Field Staff',
            phone: m.emp_mobile || m.phone || '',
            hasPings: Boolean(pingMatch),
            battery_pct: pingMatch?.battery_pct,
            last_ping: pingMatch?.recorded_at || pingMatch?.last_ping || null
          };
        });

      // Sort: Truly live online (<=90s) first, then recent pings descending, then alphabetically
      combined.sort((a, b) => {
        const aTime = a.last_ping ? new Date(a.last_ping).getTime() : 0;
        const bTime = b.last_ping ? new Date(b.last_ping).getTime() : 0;
        const aLive = aTime > 0 && ((nowMs - aTime) / 1000) <= LIVE_OFFLINE_THRESHOLD_SEC;
        const bLive = bTime > 0 && ((nowMs - bTime) / 1000) <= LIVE_OFFLINE_THRESHOLD_SEC;
        if (aLive !== bLive) return aLive ? -1 : 1;
        if (a.hasPings !== b.hasPings) return a.hasPings ? -1 : 1;
        if (aTime !== bTime) return bTime - aTime;
        return a.name.localeCompare(b.name);
      });

      setActiveEmployeesList(combined);
      setLiveNowMs(nowMs);
      if (typeof window !== 'undefined' && combined.length > 0) {
        try {
          localStorage.setItem(`crm_cached_field_executives_${selectedCompany}`, JSON.stringify(combined));
        } catch (_) {}
      }

      // Auto-select active user if none selected or if current selection is not in list
      if (combined.length > 0) {
        setSelectedUserId(prevId => {
          if (isValidExecUuid(prevId) && combined.some(m => m.user_id === prevId)) return prevId;
          const liveUser = combined.find(m => m.hasPings);
          if (liveUser) return liveUser.user_id;
          const adminUser = combined.find(m => String(m.role || '').toLowerCase().includes('admin') || String(m.name).toLowerCase().includes('admin'));
          const finalId = adminUser ? adminUser.user_id : combined[0].user_id;
          if (typeof window !== 'undefined' && isValidExecUuid(finalId)) {
            try {
              localStorage.setItem(`crm_last_field_exec_${selectedCompany}`, finalId);
            } catch (_) {}
          }
          return finalId || '';
        });
      }
    } catch (err) {
      console.error('Failed to load radar data:', err);
    } finally {
      if (!silent) setLoadingRadar(false);
    }
  }, [selectedCompany, selectedBranch, tenantId]);

  const loadEmployeeRoute = useCallback(async (userId, dateStr, { silent = false, forceFresh = false } = {}) => {
    if (!isValidExecUuid(userId)) return;
    const cacheKey = `${userId}_${dateStr}`;
    const storageKey = `crm_cached_route_v2_${cacheKey}`;
    const todayIST = getTodayISTDateStr();

    let cachedRoute = routeCacheRef.current[cacheKey] || null;
    if (!cachedRoute && typeof window !== 'undefined') {
      try {
        const rawCached = localStorage.getItem(storageKey);
        if (rawCached) {
          const parsed = JSON.parse(rawCached);
          if (parsed && parsed.userId === userId && parsed.date === dateStr) {
            cachedRoute = parsed;
            routeCacheRef.current[cacheKey] = parsed;
          }
        }
      } catch (_) {}
    }

    let shouldBackgroundRefresh = false;
    if (!forceFresh && cachedRoute) {
      setRouteData(cachedRoute);
      setLoadingRoute(false);
      setIsPlaying(false);
      setPlaybackIndex(0);
      setLiveNowMs(Date.now());
      if (dateStr === todayIST) {
        const elapsed = Date.now() - (lastRouteFetchMetaRef.current.at || 0);
        if (lastRouteFetchMetaRef.current.key !== cacheKey || elapsed >= 8000) {
          shouldBackgroundRefresh = true;
        } else {
          return;
        }
      } else {
        return;
      }
    }

    const isSilent = silent || shouldBackgroundRefresh;
    const reqSeq = ++routeFetchSeqRef.current;
    lastRouteFetchMetaRef.current = { key: cacheKey, at: Date.now() };

    if (!isSilent) {
      setLoadingRoute(true);
      setIsPlaying(false);
      setPlaybackIndex(0);
    } else if (shouldBackgroundRefresh) {
      setSyncingRoute(true);
    }
    try {
      const data = await getEmployee360Route(userId, dateStr);
      if (reqSeq !== routeFetchSeqRef.current) return;
      if (data?.polyline && data.polyline.length >= 2 && !data.routeCleaned && !data.isRoadSnapped) {
        try {
          const clientSnapped = await snapRouteSegmentsToRoad(data.polyline);
          if (reqSeq !== routeFetchSeqRef.current) return;
          if (clientSnapped?.polyline?.length > 0) {
            data.polyline = clientSnapped.polyline;
            data.isRoadSnapped = Boolean(clientSnapped.hasSnappedRoad);
            data.routeCleaned = Boolean(clientSnapped.routeCleaned);
            data.totalKm = Number((clientSnapped.totalDistanceMeters / 1000).toFixed(2));
            data.trackedRoadKm = Number(((clientSnapped.trackedRoadMeters || 0) / 1000).toFixed(2));
            data.offlineGapKm = Number(((clientSnapped.offlineGapMeters || 0) / 1000).toFixed(2));
          }
        } catch (_) {}
      }
      if (data) {
        routeCacheRef.current[cacheKey] = data;
        if (typeof window !== 'undefined') {
          try {
            // Keep persisted cache lightweight (<25KB) by omitting rawPolyline
            const { rawPolyline: _omit, ...compactData } = data;
            const routeKeys = Object.keys(localStorage).filter(k => k.startsWith('crm_cached_route_v2_'));
            if (routeKeys.length >= 4 && !routeKeys.includes(storageKey)) {
              localStorage.removeItem(routeKeys[0]);
            }
            localStorage.setItem(storageKey, JSON.stringify(compactData));
          } catch (_) {}
        }
      }
      setRouteData(data);
      setLiveNowMs(Date.now());
    } catch (err) {
      console.error('Failed to load 360 route:', err);
    } finally {
      if (reqSeq === routeFetchSeqRef.current) {
        if (!isSilent) setLoadingRoute(false);
        setSyncingRoute(false);
      }
    }
  }, []);

  const loadVouchers = useCallback(async () => {
    setLoadingVouchers(true);
    try {
      const data = await getDailyConveyanceVouchers(selectedCompany, selectedBranch || null, selectedDate);
      setVouchers(data || []);
    } catch (err) {
      console.error('Failed to load conveyance vouchers:', err);
    } finally {
      setLoadingVouchers(false);
    }
  }, [selectedCompany, selectedBranch, selectedDate]);

  useEffect(() => {
    loadRadarAndEmployees();
  }, [loadRadarAndEmployees]);

  useEffect(() => {
    if (activeMainTab === 'CONVEYANCE_VOUCHERS') {
      loadVouchers();
    }
  }, [activeMainTab, loadVouchers]);

  useEffect(() => {
    const syncClockAndLiveRoute = () => {
      setLiveNowMs(Date.now());
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const todayIST = getTodayISTDateStr();
      if (activeMainTab === '360_PLAYBACK' && selectedUserId && selectedDate === todayIST && !isPlaying) {
        const key = `${selectedUserId}_${selectedDate}`;
        const elapsed = Date.now() - (lastRouteFetchMetaRef.current.at || 0);
        if (lastRouteFetchMetaRef.current.key !== key || elapsed >= 8000) {
          loadEmployeeRoute(selectedUserId, selectedDate, { silent: true, forceFresh: true });
        }
      } else if (activeMainTab === 'ALL_INDIA_RADAR') {
        loadRadarAndEmployees({ silent: true });
      }
    };

    const ticker = setInterval(() => setLiveNowMs(Date.now()), 5000);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', syncClockAndLiveRoute);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', syncClockAndLiveRoute);
    }
    return () => {
      clearInterval(ticker);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', syncClockAndLiveRoute);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', syncClockAndLiveRoute);
      }
    };
  }, [activeMainTab, selectedUserId, selectedDate, isPlaying, loadEmployeeRoute, loadRadarAndEmployees]);

  useEffect(() => {
    if (selectedUserId && activeMainTab === '360_PLAYBACK') {
      loadEmployeeRoute(selectedUserId, selectedDate);
    }
  }, [selectedUserId, selectedDate, activeMainTab, loadEmployeeRoute]);

  useEffect(() => {
    const autoSync = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const todayIST = getTodayISTDateStr();
      if (activeMainTab === '360_PLAYBACK' && selectedUserId && selectedDate === todayIST && !isPlaying) {
        loadEmployeeRoute(selectedUserId, selectedDate, { silent: true, forceFresh: true });
      } else if (activeMainTab === 'ALL_INDIA_RADAR') {
        loadRadarAndEmployees({ silent: true });
      }
    }, 20000);
    return () => clearInterval(autoSync);
  }, [selectedUserId, selectedDate, activeMainTab, isPlaying, loadEmployeeRoute, loadRadarAndEmployees]);

  // -------------------------------------------------------------
  // Leaflet Map Engine Setup & Route Rendering
  // -------------------------------------------------------------
  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current || typeof window === 'undefined' || !window.L) return;

    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.invalidateSize();
      } catch (_) {}
      return;
    }

    try {
      const canvasRenderer = typeof window.L.canvas === 'function'
        ? window.L.canvas({ padding: 0.5, tolerance: 8 })
        : undefined;
      const map = window.L.map(mapContainerRef.current, {
        center: [30.9010, 75.8573],
        zoom: 12,
        zoomControl: true,
        zoomSnap: 0.5,
        zoomDelta: 0.5,
        preferCanvas: true,
        ...(canvasRenderer ? { renderer: canvasRenderer } : {}),
        fadeAnimation: true,
        markerZoomAnimation: true
      });

      // Default Street Tile Layer (swappable via Map Style toolbar)
      const initialStyle = MAP_TILE_STYLES.street;
      const tileLayer = window.L.tileLayer(initialStyle.url, {
        maxZoom: initialStyle.maxZoom,
        ...(initialStyle.maxNativeZoom ? { maxNativeZoom: initialStyle.maxNativeZoom } : {}),
        ...(initialStyle.subdomains ? { subdomains: initialStyle.subdomains } : {}),
        ...(initialStyle.tileClassName ? { className: initialStyle.tileClassName } : {}),
        attribution: initialStyle.attribution
      });

      tileLayer.on('tileerror', (e) => {
        console.warn('Map tile load notice:', e);
      });

      tileLayer.addTo(map);
      tileLayerRef.current = tileLayer;

      const estimateGroup = window.L.layerGroup().addTo(map);
      estimateGroupRef.current = estimateGroup;

      const markersGroup = window.L.layerGroup().addTo(map);
      markersGroupRef.current = markersGroup;
      mapInstanceRef.current = map;

      // Multi-stage invalidateSize to guarantee proper rendering on dynamic tab load
      const t1 = setTimeout(() => { if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize(); }, 60);
      const t2 = setTimeout(() => { if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize(); }, 200);
      const t3 = setTimeout(() => { if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize(); }, 500);

      let ro = null;
      if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
        ro = new ResizeObserver(() => {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.invalidateSize();
          }
        });
        ro.observe(mapContainerRef.current);
      }

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        if (ro) ro.disconnect();
      };
    } catch (err) {
      console.warn('Map initialization notice:', err);
    }
  }, [leafletReady, activeMainTab]);

  // Swap Leaflet TileLayer cleanly when Map Style changes (Street / Satellite / Light)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!leafletReady || !map || typeof window === 'undefined' || !window.L) return;
    const styleCfg = MAP_TILE_STYLES[mapStyle] || MAP_TILE_STYLES.street;
    try {
      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }
      const nextTile = window.L.tileLayer(styleCfg.url, {
        maxZoom: styleCfg.maxZoom,
        ...(styleCfg.maxNativeZoom ? { maxNativeZoom: styleCfg.maxNativeZoom } : {}),
        ...(styleCfg.subdomains ? { subdomains: styleCfg.subdomains } : {}),
        ...(styleCfg.tileClassName ? { className: styleCfg.tileClassName } : {}),
        attribution: styleCfg.attribution
      });
      nextTile.addTo(map);
      if (typeof nextTile.bringToBack === 'function') nextTile.bringToBack();
      tileLayerRef.current = nextTile;
    } catch (err) {
      console.warn('Tile style switch notice:', err);
    }
  }, [mapStyle, leafletReady]);

  // Sync fullscreen state on native fullscreen exit / Escape key and resize Leaflet cleanly
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFsChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsMapFullscreen(active);
      setTimeout(() => mapInstanceRef.current?.invalidateSize(), 80);
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setIsMapFullscreen(false);
        setShowMapStyleMenu(false);
        setTimeout(() => mapInstanceRef.current?.invalidateSize(), 80);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const getFilteredRouteCoords = useCallback((filterMode = effectiveTripFilter) => {
    const raw = (routeData?.polyline || [])
      .map(p => [Number(p.lat), Number(p.lng)])
      .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0);
    if (raw.length === 0 || !routeSplitInfo.hasReturnTrip || filterMode === 'ALL') return raw;
    if (filterMode === 'GOING') return raw.slice(0, routeSplitInfo.turnaroundIdx + 1);
    if (filterMode === 'RETURN') return raw.slice(routeSplitInfo.turnaroundIdx);
    return raw;
  }, [routeData, routeSplitInfo, effectiveTripFilter]);

  const handleRecenterRoute = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const pts = getFilteredRouteCoords();
    try {
      if (pts.length === 1) {
        map.setView(pts[0], 15, { animate: true });
      } else if (pts.length > 1) {
        map.fitBounds(pts, { padding: [55, 55], maxZoom: 16, animate: true });
      } else {
        map.setView([30.9010, 75.8573], 12, { animate: true });
      }
    } catch (_) {}
  }, [getFilteredRouteCoords]);

  const handleSelectTripFilter = useCallback((nextFilter) => {
    setRouteTripFilter(nextFilter);
    setIsPlaying(false);
    const poly = routeData?.polyline || [];
    if (poly.length > 0) {
      const targetIdx =
        nextFilter === 'RETURN' && routeSplitInfo.hasReturnTrip
          ? routeSplitInfo.turnaroundIdx
          : 0;
      progressRef.current = targetIdx;
      setPlaybackIndex(targetIdx);
      const map = mapInstanceRef.current;
      const focusPts = getFilteredRouteCoords(nextFilter);
      try {
        if (map && focusPts.length === 1) {
          map.flyTo(focusPts[0], 15, { duration: 0.55 });
        } else if (map && focusPts.length > 1) {
          map.flyToBounds(focusPts, { padding: [55, 55], maxZoom: 16, duration: 0.55 });
        }
      } catch (_) {}
    }
  }, [routeData, routeSplitInfo, getFilteredRouteCoords]);

  const handleToggleFullscreen = useCallback(async () => {
    const next = !isMapFullscreen;
    setIsMapFullscreen(next);
    try {
      if (next && mapFullscreenWrapperRef.current?.requestFullscreen && !document.fullscreenElement) {
        await mapFullscreenWrapperRef.current.requestFullscreen();
      } else if (!next && document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch (_) {
      // CSS fixed-overlay fallback keeps fullscreen working even inside restrictive WebViews
    }
    setTimeout(() => mapInstanceRef.current?.invalidateSize(), 80);
    setTimeout(() => mapInstanceRef.current?.invalidateSize(), 240);
  }, [isMapFullscreen]);

  const restoreOfflineGapChords = useCallback(() => {
    const markersGroup = markersGroupRef.current;
    if (!markersGroup) return;
    for (const entry of offlineGapLayersRef.current) {
      if (entry?.layer && !markersGroup.hasLayer(entry.layer)) {
        markersGroup.addLayer(entry.layer);
      }
    }
  }, []);

  const hideOfflineGapChordForSegment = useCallback((startPt, endPt) => {
    const markersGroup = markersGroupRef.current;
    if (!markersGroup || !startPt || !endPt) return;
    for (const entry of offlineGapLayersRef.current) {
      if (!entry?.layer || !entry.p1 || !entry.p2) continue;
      const matchesForward =
        haversineMeters(entry.p1[0], entry.p1[1], startPt.lat, startPt.lng) < 5 &&
        haversineMeters(entry.p2[0], entry.p2[1], endPt.lat, endPt.lng) < 5;
      if (matchesForward && markersGroup.hasLayer(entry.layer)) {
        markersGroup.removeLayer(entry.layer);
      }
    }
  }, []);

  const renderEstimatedGapPreview = useCallback(async (data) => {
    const group = estimateGroupRef.current;
    if (!group || typeof window === 'undefined' || !window.L) return;
    group.clearLayers();
    restoreOfflineGapChords();
    const seq = ++estimateSeqRef.current;

    const poly = data?.polyline || [];
    const split = splitGoingAndReturnRoute(poly);
    const activeFilter = split.hasReturnTrip ? effectiveTripFilter : 'ALL';
    const blindGaps = [];
    for (let i = 1; i < poly.length; i++) {
      const prev = poly[i - 1];
      const cur = poly[i];
      const leg = split.hasReturnTrip && i > split.turnaroundIdx ? 'RETURN' : 'GOING';
      if (activeFilter !== 'ALL' && leg !== activeFilter) continue;
      const isBlindOffline = Boolean(cur?.isOffline) && !Boolean(cur?.isSnapped);
      if (isBlindOffline && haversineMeters(prev.lat, prev.lng, cur.lat, cur.lng) >= 30) {
        blindGaps.push([prev, cur]);
      }
    }

    if (blindGaps.length === 0) {
      setEstimateSummary({ distanceKm: 0, noGaps: true });
      setLoadingEstimate(false);
      return;
    }

    setLoadingEstimate(true);
    let totalEstMeters = 0;
    let gapRendered = 0;

    try {
      for (const [startPt, endPt] of blindGaps) {
        if (seq !== estimateSeqRef.current || !showEstimateRouteRef.current) return;
        const coordStr = `${Number(startPt.lng).toFixed(6)},${Number(startPt.lat).toFixed(6)};${Number(endPt.lng).toFixed(6)},${Number(endPt.lat).toFixed(6)}`;
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 7000);
          const res = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&alternatives=true`,
            { headers: { Accept: 'application/json' }, signal: ctrl.signal }
          );
          clearTimeout(timer);
          if (seq !== estimateSeqRef.current || !showEstimateRouteRef.current) return;
          if (res.ok) {
            const json = await res.json();
            const validRoutes = Array.isArray(json?.routes)
              ? json.routes.filter(r => Array.isArray(r?.geometry?.coordinates) && r.geometry.coordinates.length >= 2)
              : [];
            const route = validRoutes.reduce(
              (best, r) => (Number(r.distance ?? Infinity) < Number(best?.distance ?? Infinity) ? r : best),
              validRoutes[0]
            );
            const roadCoords = route?.geometry?.coordinates;
            if (json?.code === 'Ok' && Array.isArray(roadCoords) && roadCoords.length >= 2) {
              const latLngs = roadCoords.map(([lng, lat]) => [lat, lng]);
              const segEstKm = ((route.distance || 0) / 1000).toFixed(2);
              totalEstMeters += Number(route.distance || 0);
              gapRendered++;
              hideOfflineGapChordForSegment(startPt, endPt);
              window.L.polyline(latLngs, {
                color: '#9333ea',
                weight: 4.5,
                opacity: 0.9,
                dashArray: '4, 7',
                smoothFactor: 0.5,
                lineJoin: 'round',
                lineCap: 'round'
              })
              .bindPopup(`<b>🟣 Estimated Road Preview (Unverified)</b><br/><span style="color:#64748b;font-size:11px;">Shortest OSRM road suggestion: ~${segEstKm} km<br/>Note: Replaces straight gap chord visually while Preview is ON</span>`)
              .addTo(group);
            }
          }
        } catch (_) {}
      }

      if (seq === estimateSeqRef.current && showEstimateRouteRef.current) {
        setEstimateSummary({
          distanceKm: Number((totalEstMeters / 1000).toFixed(2)),
          segmentCount: gapRendered,
          noGaps: gapRendered === 0
        });
      }
    } finally {
      if (seq === estimateSeqRef.current) setLoadingEstimate(false);
    }
  }, [restoreOfflineGapChords, hideOfflineGapChordForSegment, effectiveTripFilter]);

  const handleToggleEstimateRoute = useCallback(() => {
    const next = !showEstimateRouteRef.current;
    showEstimateRouteRef.current = next;
    setShowEstimateRoute(next);
    if (!next) {
      estimateSeqRef.current++;
      estimateGroupRef.current?.clearLayers();
      restoreOfflineGapChords();
      setEstimateSummary(null);
      setLoadingEstimate(false);
    } else {
      renderEstimatedGapPreview(routeData);
    }
  }, [routeData, renderEstimatedGapPreview, restoreOfflineGapChords]);

  useEffect(() => {
    estimateGroupRef.current?.clearLayers();
    restoreOfflineGapChords();
    let cancelled = false;
    if (showEstimateRouteRef.current && routeData?.polyline) {
      Promise.resolve().then(() => {
        if (!cancelled && showEstimateRouteRef.current) {
          renderEstimatedGapPreview(routeData);
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [routeData, renderEstimatedGapPreview, restoreOfflineGapChords]);

  // Synchronize runner position, dynamic trail, and telemetry smoothly
  const updateRunnerPosition = (progress, polyline) => {
    if (!polyline || polyline.length === 0 || !markersGroupRef.current) return;

    const total = polyline.length;
    const clamped = Math.max(0, Math.min(progress, total - 1));
    const idx = Math.floor(clamped);
    const nextIdx = Math.min(idx + 1, total - 1);
    const frac = clamped - idx;

    const p1 = polyline[idx];
    const p2 = polyline[nextIdx];

    const lat = Number(p1.lat) + (Number(p2.lat) - Number(p1.lat)) * frac;
    const lng = Number(p1.lng) + (Number(p2.lng) - Number(p1.lng)) * frac;

    if (isNaN(lat) || isNaN(lng)) return;

    // Calculate heading/bearing
    const brng = idx < total - 1 ? calculateBearing(p1.lat, p1.lng, p2.lat, p2.lng) : 0;

    // Interpolate telemetry time and speed
    const t1 = p1.time ? new Date(p1.time).getTime() : Date.now();
    const t2 = p2.time ? new Date(p2.time).getTime() : t1;
    const interpTime = new Date(t1 + frac * (t2 - t1)).toISOString();
    const s1 = p1.speed != null ? Number(p1.speed) : 0;
    const s2 = p2.speed != null ? Number(p2.speed) : s1;
    const interpSpeed = Math.round(s1 + frac * (s2 - s1));

    const isCurrentOffline = Boolean((nextIdx > idx ? p2?.isOffline : p1?.isOffline) ?? p1?.isOffline);
    const splitMeta = routeSplitInfoRef.current;
    const isReturningLeg = Boolean(splitMeta.hasReturnTrip && nextIdx > splitMeta.turnaroundIdx);

    setCurrentTelemetry({
      lat,
      lng,
      speed: interpSpeed,
      time: interpTime,
      bearing: brng,
      isOffline: isCurrentOffline,
      tripPhase: isReturningLeg ? 'RETURN' : 'GOING'
    });

    // Update runner marker position
    if (runnerMarkerRef.current) {
      runnerMarkerRef.current.setLatLng([lat, lng]);

      // Rotate vehicle direction arrow smoothly and morph Going (Blue) <-> Return (Magenta) <-> Offline (Orange)
      const rotator = document.getElementById('runner-vehicle-rotator');
      const pulseRing = document.getElementById('runner-pulse-ring');
      if (rotator) {
        rotator.style.transform = `rotate(${Math.round(brng)}deg)`;
        if (isCurrentOffline) {
          rotator.style.background = 'linear-gradient(135deg, #c2410c 0%, #ea580c 100%)';
          rotator.style.boxShadow = '0 4px 14px rgba(234,88,12,0.75)';
          if (pulseRing) pulseRing.style.background = 'rgba(234,88,12,0.3)';
        } else if (isReturningLeg) {
          rotator.style.background = 'linear-gradient(135deg, #be185d 0%, #ec4899 100%)';
          rotator.style.boxShadow = '0 4px 16px rgba(236,72,153,0.75)';
          if (pulseRing) pulseRing.style.background = 'rgba(236,72,153,0.32)';
        } else {
          rotator.style.background = 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)';
          rotator.style.boxShadow = '0 4px 14px rgba(37,99,235,0.7)';
          if (pulseRing) pulseRing.style.background = 'rgba(37,99,235,0.25)';
        }
      }

      // Keep in view if animating
      if (isPlaying && mapInstanceRef.current) {
        if (!mapInstanceRef.current.getBounds().contains([lat, lng])) {
          mapInstanceRef.current.panTo([lat, lng], { animate: true, duration: 0.25 });
        }
      }
    }

    // Dynamic Trail Polylines (respect trip leg filter + skip blind gap chords while Estimated Road Preview is active)
    if (traveledTrailRef.current) {
      const activeFilter = splitMeta.hasReturnTrip ? effectiveTripFilterRef.current : 'ALL';
      const startWalkIdx = activeFilter === 'RETURN' ? splitMeta.turnaroundIdx : 0;
      const walkEndIdx = activeFilter === 'GOING' ? Math.min(idx, splitMeta.turnaroundIdx) : idx;
      if ((isCurrentOffline && showEstimateRouteRef.current) || idx < startWalkIdx) {
        traveledTrailRef.current.setStyle({ opacity: 0 });
      } else {
        const runs = [];
        let curRun = [[Number(polyline[startWalkIdx].lat), Number(polyline[startWalkIdx].lng)]];
        for (let k = startWalkIdx + 1; k <= walkEndIdx; k++) {
          const pt = polyline[k];
          const isGapEdge = Boolean(pt?.isOffline) && !Boolean(pt?.isSnapped);
          if (isGapEdge && showEstimateRouteRef.current) {
            if (curRun.length >= 2) runs.push(curRun);
            curRun = [[Number(pt.lat), Number(pt.lng)]];
          } else {
            curRun.push([Number(pt.lat), Number(pt.lng)]);
          }
        }
        const isNextGapEdge = Boolean(polyline[nextIdx]?.isOffline) && !Boolean(polyline[nextIdx]?.isSnapped);
        if (!(isNextGapEdge && showEstimateRouteRef.current) && (activeFilter !== 'GOING' || idx < splitMeta.turnaroundIdx)) {
          curRun.push([lat, lng]);
        }
        if (curRun.length >= 2) runs.push(curRun);
        traveledTrailRef.current.setLatLngs(runs);
        traveledTrailRef.current.setStyle({
          opacity: runs.length > 0 ? 0.95 : 0,
          color: isCurrentOffline ? '#ea580c' : isReturningLeg ? '#ec4899' : '#2563eb',
          dashArray: isCurrentOffline ? '8, 6' : isReturningLeg ? '8, 8' : null
        });
      }
    }
  };

  // 60 FPS requestAnimationFrame Smooth Road Playback Engine
  useEffect(() => {
    if (!isPlaying || !routeData?.polyline || routeData.polyline.length < 2) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      lastFrameTimeRef.current = null;
      return;
    }

    const poly = routeData.polyline;
    const totalPoints = poly.length;

    const animate = (now) => {
      if (!lastFrameTimeRef.current) lastFrameTimeRef.current = now;
      const dt = (now - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = now;

      // Rate of progress: traverse entire route in ~20-30 seconds adjusted by speed
      const baseDurationSec = Math.max(15, Math.min(45, totalPoints * 0.4));
      const pointsPerSec = (totalPoints / baseDurationSec) * playbackSpeed;
      let nextProg = progressRef.current + pointsPerSec * dt;
      const endBoundIdx =
        effectiveTripFilterRef.current === 'GOING' && routeSplitInfoRef.current.hasReturnTrip
          ? routeSplitInfoRef.current.turnaroundIdx
          : totalPoints - 1;

      if (nextProg >= endBoundIdx) {
        nextProg = endBoundIdx;
        progressRef.current = nextProg;
        setPlaybackIndex(Math.floor(nextProg));
        updateRunnerPosition(nextProg, poly);
        setIsPlaying(false);
        lastFrameTimeRef.current = null;
        return;
      }

      progressRef.current = nextProg;
      setPlaybackIndex(Math.floor(nextProg));
      updateRunnerPosition(nextProg, poly);

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, playbackSpeed, routeData]);

  // Update Route Polyline, Directional Chevrons, Turnaround Beacon & Markers on Map
  useEffect(() => {
    if (!mapInstanceRef.current || !markersGroupRef.current || !window.L) return;

    markersGroupRef.current.clearLayers();
    offlineGapLayersRef.current = [];
    runnerMarkerRef.current = null;
    traveledTrailRef.current = null;

    if (routeData?.polyline && routeData.polyline.length > 0) {
      const validPoints = routeData.polyline.filter((p) => {
        const lat = Number(p?.lat);
        const lng = Number(p?.lng);
        return !isNaN(lat) && !isNaN(lng) && (Math.abs(lat) > 0.01 || Math.abs(lng) > 0.01);
      });
      const coords = validPoints.map(p => [Number(p.lat), Number(p.lng)]);

      if (coords.length > 0) {
        const { hasReturnTrip, turnaroundIdx, maxDistMeters } = routeSplitInfo;
        const activeFilter = hasReturnTrip ? effectiveTripFilter : 'ALL';

        // 1. Partition edges by connectivity mode (ONLINE / OFFLINE_ROAD / OFFLINE_GAP) AND tripLeg (GOING / RETURN)
        const segments = [];
        for (let i = 1; i < coords.length; i++) {
          const pt = validPoints[i];
          const mode = !pt?.isOffline ? 'ONLINE' : (pt?.isSnapped ? 'OFFLINE_ROAD' : 'OFFLINE_GAP');
          const tripLeg = hasReturnTrip && i > turnaroundIdx ? 'RETURN' : 'GOING';
          const prevCoord = coords[i - 1];
          const curCoord = coords[i];
          const lastSeg = segments[segments.length - 1];

          if (lastSeg && lastSeg.mode === mode && lastSeg.tripLeg === tripLeg) {
            lastSeg.coords.push(curCoord);
            lastSeg.times.push(pt?.time || null);
            lastSeg.speeds.push(Math.max(0, Math.round(Number(pt?.speed || 0))));
            lastSeg.endTime = pt?.time;
          } else {
            segments.push({
              mode,
              tripLeg,
              isOffline: Boolean(pt?.isOffline),
              coords: [prevCoord, curCoord],
              times: [validPoints[i - 1]?.time || null, pt?.time || null],
              speeds: [
                Math.max(0, Math.round(Number(validPoints[i - 1]?.speed || 0))),
                Math.max(0, Math.round(Number(pt?.speed || 0)))
              ],
              startTime: validPoints[i - 1]?.time || pt?.time,
              endTime: pt?.time
            });
          }
        }

        // 2. Draw Going segments first, then Return segments on top (so Return dashed lines pop cleanly on overlapping roads)
        const basePolylineOpts = {
          smoothFactor: 0.5,
          lineJoin: 'round',
          lineCap: 'round'
        };
        const visibleSegments = segments.filter(
          seg => activeFilter === 'ALL' || seg.tripLeg === activeFilter
        );
        const orderedSegments = [
          ...visibleSegments.filter(s => s.tripLeg === 'GOING'),
          ...visibleSegments.filter(s => s.tripLeg === 'RETURN')
        ];

        const drawDirectionalChevrons = (segList, legType) => {
          let legTotalMeters = 0;
          segList.forEach(s => {
            if (s.mode === 'OFFLINE_GAP') return;
            for (let j = 1; j < s.coords.length; j++) {
              legTotalMeters += haversineMeters(s.coords[j - 1][0], s.coords[j - 1][1], s.coords[j][0], s.coords[j][1]);
            }
          });
          if (legTotalMeters < 110) return;

          const spacing = Math.max(130, Math.round(legTotalMeters / 16));
          let distSinceArrow = spacing * 0.55;
          let placedCount = 0;
          const isRet = legType === 'RETURN';
          const bgHex = isRet ? '#ec4899' : '#2563eb';
          const legLabel = isRet ? 'Return (Inward)' : 'Going (Outward)';
          const turnaroundCoord = hasReturnTrip ? coords[turnaroundIdx] : null;
          const originCoord = coords[0];
          const destCoord = coords[coords.length - 1];

          segList.forEach(s => {
            if (s.mode === 'OFFLINE_GAP' || placedCount >= 24) return;
            for (let j = 1; j < s.coords.length && placedCount < 24; j++) {
              const pA = s.coords[j - 1];
              const pB = s.coords[j];
              const stepDist = haversineMeters(pA[0], pA[1], pB[0], pB[1]);
              if (stepDist < 8) continue;
              distSinceArrow += stepDist;
              if (distSinceArrow < spacing) continue;

              const midLat = (pA[0] + pB[0]) / 2;
              const midLng = (pA[1] + pB[1]) / 2;
              const tooCloseOrigin = haversineMeters(midLat, midLng, originCoord[0], originCoord[1]) < 45;
              const tooCloseDest = haversineMeters(midLat, midLng, destCoord[0], destCoord[1]) < 45;
              const tooCloseTurn = turnaroundCoord
                ? haversineMeters(midLat, midLng, turnaroundCoord[0], turnaroundCoord[1]) < 45
                : false;
              if (tooCloseOrigin || tooCloseDest || tooCloseTurn) continue;

              distSinceArrow = 0;
              placedCount++;
              const brng = calculateBearing(pA[0], pA[1], pB[0], pB[1]);
              const tStamp = s.times?.[j]
                ? new Date(s.times[j]).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
                : '';
              const segSpd = Math.max(0, Math.round(Number(s.speeds?.[j] ?? s.speeds?.[j - 1] ?? 0)));
              const spdText = segSpd > 0 ? ` • ${segSpd} km/h` : '';

              const chevIcon = window.L.divIcon({
                className: 'crm-chevron-marker',
                html: `<div class="crm-chevron-badge" style="width:18px;height:18px;border-radius:50%;background:${bgHex};border:1.5px solid #ffffff;box-shadow:0 2px 6px rgba(15,23,42,0.28);display:flex;align-items:center;justify-content:center;transform:rotate(${Math.round(brng)}deg);"><svg width="10" height="10" viewBox="0 0 24 24" fill="#ffffff"><polygon points="12 3 20 19 12 15 4 19 12 3"/></svg></div>`,
                iconSize: [18, 18],
                iconAnchor: [9, 9]
              });
              window.L.marker([midLat, midLng], {
                icon: chevIcon,
                zIndexOffset: isRet ? 780 : 650
              })
                .bindTooltip(`${isRet ? '🩷' : '🔵'} ${legLabel}${spdText}${tStamp ? ` • ${tStamp}` : ''}`, {
                  direction: 'top',
                  offset: [0, -8]
                })
                .addTo(markersGroupRef.current);
            }
          });
        };

        orderedSegments.forEach(seg => {
          const timeRange = `${seg.startTime ? new Date(seg.startTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'} - ${seg.endTime ? new Date(seg.endTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}`;
          const isReturn = seg.tripLeg === 'RETURN';
          const movingSegSpeeds = (seg.speeds || []).filter(sp => sp >= 4);
          const segMaxSpd = (seg.speeds || []).reduce((mx, sp) => (sp > mx ? sp : mx), 0);
          const segAvgSpd = movingSegSpeeds.length > 0
            ? Math.round(movingSegSpeeds.reduce((a, b) => a + b, 0) / movingSegSpeeds.length)
            : 0;
          const segSpeedHtml = segMaxSpd > 0
            ? `<br/>⚡ Speed: <b>Avg ${segAvgSpd} km/h</b> • <b>Top ${segMaxSpd} km/h</b>`
            : '';

          if (seg.mode === 'OFFLINE_GAP') {
            for (let k = 1; k < seg.coords.length; k++) {
              const p1 = seg.coords[k - 1];
              const p2 = seg.coords[k];
              const gapPoly = window.L.polyline([p1, p2], {
                ...basePolylineOpts,
                color: '#ea580c',
                weight: 4.5,
                opacity: 0.92,
                dashArray: '8, 6'
              })
              .bindPopup(`<b>🟠 Offline Gap (GPS/Data Off)${isReturn ? ' • Return Leg' : ''}</b><br/><span style="color:#64748b;font-size:11px;">Direct estimate — actual road not tracked during signal loss<br/>Time: ${timeRange}</span>`)
              .addTo(markersGroupRef.current);
              offlineGapLayersRef.current.push({ layer: gapPoly, p1, p2 });
            }
          } else if (seg.mode === 'OFFLINE_ROAD') {
            window.L.polyline(seg.coords, {
              ...basePolylineOpts,
              color: isReturn ? '#ec4899' : '#d97706',
              weight: isReturn ? 4.2 : 5.5,
              opacity: 0.95,
              dashArray: isReturn ? '8, 8' : null
            })
            .bindPopup(`<b>${isReturn ? '🩷 Return Offline-Tracked Road' : '🟡 Going Offline-Tracked Road'}</b><br/><span style="color:#64748b;font-size:11px;">Recorded offline via device GPS vault & synced automatically<br/>Time: ${timeRange}${segSpeedHtml}</span>`)
            .addTo(markersGroupRef.current);
          } else if (isReturn) {
            window.L.polyline(seg.coords, {
              ...basePolylineOpts,
              color: '#ec4899',
              weight: 4.2,
              opacity: 0.96,
              dashArray: '8, 8'
            })
            .bindPopup(`<b>🩷 Return Route (Inward Tracking)</b><br/><span style="color:#64748b;font-size:11px;">Return journey along road<br/>Time: ${timeRange}${segSpeedHtml}</span>`)
            .addTo(markersGroupRef.current);
          } else {
            window.L.polyline(seg.coords, {
              ...basePolylineOpts,
              color: '#2563eb',
              weight: 6,
              opacity: 0.88
            })
            .bindPopup(`<b>🔵 Going Route (Outward Tracking)</b><br/><span style="color:#64748b;font-size:11px;">Active: ${timeRange}${segSpeedHtml}</span>`)
            .addTo(markersGroupRef.current);
          }
        });

        // Directional Arrow Decorators (Going first, Return on top)
        if (activeFilter === 'ALL' || activeFilter === 'GOING') {
          drawDirectionalChevrons(orderedSegments.filter(s => s.tripLeg === 'GOING'), 'GOING');
        }
        if (hasReturnTrip && (activeFilter === 'ALL' || activeFilter === 'RETURN')) {
          drawDirectionalChevrons(orderedSegments.filter(s => s.tripLeg === 'RETURN'), 'RETURN');
        }

        // 3. Traveled dynamic glowing polyline (changes dynamically during playback)
        const runnerInitIdx =
          activeFilter === 'RETURN' && hasReturnTrip
            ? turnaroundIdx
            : 0;
        const isInitReturn = hasReturnTrip && runnerInitIdx > turnaroundIdx;
        const traveledTrail = window.L.polyline([coords[runnerInitIdx] || coords[0]], {
          ...basePolylineOpts,
          color: validPoints[runnerInitIdx]?.isOffline ? '#ea580c' : isInitReturn ? '#ec4899' : '#2563eb',
          weight: 6,
          opacity: 0
        }).addTo(markersGroupRef.current);
        traveledTrailRef.current = traveledTrail;

        // 5. Start Marker / Punch In Marker (Green Pin + Hover Tooltip)
        const isSinglePunch = coords.length === 1;
        const startTimeIST = validPoints[0]?.time
          ? new Date(validPoints[0].time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
          : '-';
        const startIcon = window.L.divIcon({
          className: 'custom-start-marker',
          html: `<div style="background:#16a34a;color:#fff;border-radius:50%;width:${isSinglePunch ? 34 : 28}px;height:${isSinglePunch ? 34 : 28}px;display:flex;align-items:center;justify-content:center;font-size:${isSinglePunch ? 16 : 13}px;border:3px solid #ffffff;box-shadow:0 3px 10px rgba(22,163,74,0.6);">🚩</div>`,
          iconSize: [isSinglePunch ? 34 : 28, isSinglePunch ? 34 : 28],
          iconAnchor: [isSinglePunch ? 17 : 14, isSinglePunch ? 17 : 14]
        });
        const startMarker = window.L.marker(coords[0], { icon: startIcon, zIndexOffset: 950 })
          .bindTooltip(`🚩 Start (Origin) • ${startTimeIST}`, { direction: 'top', offset: [0, -12] })
          .bindPopup(`<b>🚩 ${isSinglePunch ? 'Attendance Punch In (On Duty)' : 'Route Start Point (Origin)'}</b><br/><span style="color:#64748b;font-size:11px;">Time: ${startTimeIST}</span>`)
          .addTo(markersGroupRef.current);

        const fitKey = `${routeData.userId || ''}_${routeData.date || ''}`;
        const prevFitPrefix = `${fitKey}:`;
        const prevFitCount = lastFitRouteKeyRef.current.startsWith(prevFitPrefix)
          ? Number(lastFitRouteKeyRef.current.slice(prevFitPrefix.length) || 0)
          : -1;

        if (isSinglePunch && prevFitCount === -1) {
          startMarker.openPopup();
        }

        // 5B. Turnaround / Farthest Destination Pulsing Beacon Marker (only when genuine round trip detected)
        if (hasReturnTrip && coords[turnaroundIdx]) {
          let turnLat = coords[turnaroundIdx][0];
          let turnLng = coords[turnaroundIdx][1];
          const collidesVisitOrStop = (routeData.timeline || []).some(
            t =>
              (t.type === 'visit' || t.type === 'stoppage') &&
              t.lat &&
              t.lng &&
              haversineMeters(turnLat, turnLng, Number(t.lat), Number(t.lng)) < 25
          );
          if (collidesVisitOrStop) {
            turnLat += 0.00012;
            turnLng += 0.00012;
          }
          const turnTimeIST = validPoints[turnaroundIdx]?.time
            ? new Date(validPoints[turnaroundIdx].time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
            : '-';
          const distFromOriginKm = (maxDistMeters / 1000).toFixed(2);
          const turnIcon = window.L.divIcon({
            className: 'custom-turnaround-marker',
            html: `
              <div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
                <div style="position:absolute;width:38px;height:38px;border-radius:50%;background:rgba(249,115,22,0.28);animation:crmBeaconPulse 1.9s infinite;"></div>
                <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#f59e0b 0%,#ea580c 100%);color:#ffffff;border:2.5px solid #ffffff;box-shadow:0 3px 10px rgba(234,88,12,0.65);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;">↩</div>
              </div>
            `,
            iconSize: [38, 38],
            iconAnchor: [19, 19]
          });
          window.L.marker([turnLat, turnLng], { icon: turnIcon, zIndexOffset: 980 })
            .bindTooltip(`↩️ Turnaround (${distFromOriginKm} km) • ${turnTimeIST}`, { direction: 'top', offset: [0, -14] })
            .bindPopup(
              `<b>↩️ Turnaround / Farthest Destination</b><br/><span style="color:#64748b;font-size:11px;">Peak Distance from Origin: <b>${distFromOriginKm} km</b><br/>Return Started Around: <b>${turnTimeIST}</b></span>`
            )
            .addTo(markersGroupRef.current);
        }

        // 6. Punch Out Marker or End Marker (with hover tooltip + slight offset if exact return to start)
        const punchOutTimeline = (routeData.timeline || []).find(t => t.type === 'punch_out');
        if (punchOutTimeline && punchOutTimeline.lat && punchOutTimeline.lng) {
          let outLat = Number(punchOutTimeline.lat);
          let outLng = Number(punchOutTimeline.lng);
          if (haversineMeters(outLat, outLng, coords[0][0], coords[0][1]) < 20) {
            outLat -= 0.00011;
            outLng += 0.00011;
          }
          const outIcon = window.L.divIcon({
            className: 'custom-punchout-marker',
            html: '<div style="background:#dc2626;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2.5px solid #ffffff;box-shadow:0 3px 10px rgba(220,38,38,0.6);">🏁</div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          });
          const timeText = punchOutTimeline.startTime ? new Date(punchOutTimeline.startTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-';
          const locText = punchOutTimeline.locationName ? `<br/><span style="color:#64748b;font-size:11px;">📍 ${punchOutTimeline.locationName}</span>` : '';
          window.L.marker([outLat, outLng], { icon: outIcon, zIndexOffset: 960 })
            .bindTooltip(`🏁 Punch Out (End) • ${timeText}`, { direction: 'top', offset: [0, -12] })
            .bindPopup(`<b>🏁 Attendance Punch Out (Shift Completed)</b><br/><span style="color:#64748b;font-size:11px;">Time: ${timeText}</span>${locText}`)
            .addTo(markersGroupRef.current);
        } else if (coords.length > 1) {
          let endLat = coords[coords.length - 1][0];
          let endLng = coords[coords.length - 1][1];
          if (haversineMeters(endLat, endLng, coords[0][0], coords[0][1]) < 20) {
            endLat -= 0.00011;
            endLng += 0.00011;
          }
          const endTimeIST = validPoints[coords.length - 1]?.time
            ? new Date(validPoints[coords.length - 1].time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
            : '-';
          const endIcon = window.L.divIcon({
            className: 'custom-end-marker',
            html: '<div style="background:#dc2626;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(220,38,38,0.5);">🏁</div>',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });
          window.L.marker([endLat, endLng], { icon: endIcon, zIndexOffset: 960 })
            .bindTooltip(`🏁 Final Point • ${endTimeIST}`, { direction: 'top', offset: [0, -12] })
            .bindPopup(`<b>🏁 Latest Known Location</b><br/><span style="color:#64748b;font-size:11px;">Time: ${endTimeIST}</span>`)
            .addTo(markersGroupRef.current);
        }

        // 7. Client Visit Markers (with hover tooltip + full popup)
        (routeData.timeline || []).filter(t => t.type === 'visit').forEach(vt => {
          if (!vt.lat || !vt.lng) return;
          const visitTimeText = vt.checkInTime
            ? new Date(vt.checkInTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
            : '-';
          const visitIcon = window.L.divIcon({
            className: 'custom-visit-marker',
            html: '<div style="background:#0284c7;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(2,132,199,0.5);">🏢</div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          });
          const popupHtml = `
            <div style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;min-width:190px;line-height:1.4;">
              <strong style="font-size:13px;color:#0f172a;display:block;">${vt.partyName}</strong>
              <div style="color:#0284c7;font-weight:700;margin-top:2px;font-size:11px;">📍 Verified Physical Visit</div>
              <div style="color:#475569;margin-top:4px;">Check-In: <strong>${visitTimeText}</strong></div>
              <div style="color:#475569;">Duration: <strong>${vt.durationMins || 0} mins</strong></div>
              ${vt.outcomeStatus ? `<div style="color:#16a34a;font-weight:600;margin-top:2px;font-size:11px;">Outcome: ${vt.outcomeStatus}</div>` : ''}
              ${vt.photos && vt.photos.length > 0 ? `<div style="margin-top:6px;"><img src="${vt.photos[0]}" style="width:100%;max-height:80px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;"/></div>` : ''}
            </div>
          `;
          window.L.marker([Number(vt.lat), Number(vt.lng)], { icon: visitIcon, zIndexOffset: 900 })
            .bindTooltip(`🏢 ${vt.partyName} • ${visitTimeText}`, { direction: 'top', offset: [0, -12] })
            .bindPopup(popupHtml)
            .addTo(markersGroupRef.current);
        });

        // 8. Stoppage Markers (with hover tooltip + popup)
        (routeData.timeline || []).filter(t => t.type === 'stoppage').forEach(st => {
          if (!st.lat || !st.lng) return;
          const stopIcon = window.L.divIcon({
            className: 'custom-stop-marker',
            html: '<div style="background:#f59e0b;color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(245,158,11,0.5);">⏸️</div>',
            iconSize: [26, 26],
            iconAnchor: [13, 13]
          });
          const stopStartIST = new Date(st.startTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
          const stopEndIST = new Date(st.endTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
          const locText = st.locationName ? `<br/><span style="color:#2563eb;font-weight:600;font-size:11px;">📍 ${st.locationName}</span>` : '';
          window.L.marker([Number(st.lat), Number(st.lng)], { icon: stopIcon, zIndexOffset: 850 })
            .bindTooltip(`⏸️ ${st.durationMins}m Stop (${stopStartIST})`, { direction: 'top', offset: [0, -10] })
            .bindPopup(`<div style="font-size:12px;"><strong>⏸️ Stoppage: ${st.durationMins} Mins</strong>${locText}<br/><span style="color:#64748b;">${stopStartIST} - ${stopEndIST}</span></div>`)
            .addTo(markersGroupRef.current);
        });

        // 9. Animated Runner Marker with Rotatable Direction Arrow & Morphing Pulse Ring
        const runnerNextIdx = Math.min(runnerInitIdx + 1, coords.length - 1);
        const initialBearing =
          runnerNextIdx > runnerInitIdx
            ? calculateBearing(coords[runnerInitIdx][0], coords[runnerInitIdx][1], coords[runnerNextIdx][0], coords[runnerNextIdx][1])
            : 0;
        const initRingBg = activeFilter === 'RETURN' && hasReturnTrip ? 'rgba(236,72,153,0.32)' : 'rgba(37,99,235,0.25)';
        const initOrbBg =
          activeFilter === 'RETURN' && hasReturnTrip
            ? 'linear-gradient(135deg, #be185d 0%, #ec4899 100%)'
            : 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)';
        const initOrbShadow =
          activeFilter === 'RETURN' && hasReturnTrip
            ? '0 4px 16px rgba(236,72,153,0.75)'
            : '0 4px 14px rgba(37,99,235,0.7)';

        const runnerIcon = window.L.divIcon({
          className: 'runner-marker-container',
          html: `
            <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
              <div id="runner-pulse-ring" style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: ${initRingBg}; transition: background 0.35s ease; animation: pulse 1.6s infinite;"></div>
              <div id="runner-vehicle-rotator" style="transform: rotate(${Math.round(initialBearing)}deg); transition: transform 0.15s ease-out, background 0.35s ease, box-shadow 0.35s ease; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; background: ${initOrbBg}; border-radius: 50%; border: 2.5px solid #ffffff; box-shadow: ${initOrbShadow};">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 19 21 12 17 5 21 12 2" fill="#ffffff" />
                </svg>
              </div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        });

        const runner = window.L.marker(coords[runnerInitIdx] || coords[0], { icon: runnerIcon, zIndexOffset: 2000 })
          .bindPopup('<b>🚗 Live Playhead Runner</b>')
          .addTo(markersGroupRef.current);
        runnerMarkerRef.current = runner;

        // Auto Fit Bounds on initial route view or transition from single point to multi-point route
        try {
          if (prevFitCount === -1 || (prevFitCount <= 1 && coords.length > 1)) {
            if (coords.length === 1) {
              mapInstanceRef.current.setView(coords[0], 15);
            } else {
              mapInstanceRef.current.fitBounds(coords, { padding: [55, 55], maxZoom: 16 });
            }
            lastFitRouteKeyRef.current = `${fitKey}:${coords.length}`;
          }
        } catch (_) {}

        // Invalidate map size after bounds fitting to ensure crystal clear render
        setTimeout(() => {
          if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
        }, 150);
      }
    }
  }, [routeData, effectiveTripFilter, routeSplitInfo]);

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
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setRouteTripFilter('ALL');
              }}
              style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, color: '#1e293b', outline: 'none' }}
            />
          </div>

          <button
            onClick={() => {
              if (activeMainTab === '360_PLAYBACK' && selectedUserId) {
                delete routeCacheRef.current[`${selectedUserId}_${selectedDate}`];
                lastFitRouteKeyRef.current = '';
                loadEmployeeRoute(selectedUserId, selectedDate, { forceFresh: true });
                loadRadarAndEmployees({ silent: true });
              }
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
            {/* Searchable Executive Selector Combobox */}
            <div style={{ padding: 14, borderBottom: '1px solid #f1f5f9', position: 'relative' }} ref={dropdownRef}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                  SELECT FIELD EXECUTIVE ({activeEmployeesList.length})
                </label>
                {selectedEmployee && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: liveDeviceStatus.headerBadge.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: liveDeviceStatus.headerBadge.dot, display: 'inline-block' }}></span>
                    {liveDeviceStatus.headerBadge.label}
                  </span>
                )}
              </div>

              {/* Trigger Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExecutiveDropdownOpen(prev => !prev);
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: isExecutiveDropdownOpen ? '1px solid #2563eb' : '1px solid #cbd5e1',
                  background: '#ffffff',
                  boxShadow: isExecutiveDropdownOpen ? '0 0 0 3px rgba(37,99,235,0.1)' : '0 1px 2px rgba(0,0,0,0.05)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  userSelect: 'none',
                  transition: 'all 0.12s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', pointerEvents: 'none' }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background:
                      !liveDeviceStatus.gpsStatusState.isOff && liveDeviceStatus.isToday && !liveDeviceStatus.isShiftCompleted && liveDeviceStatus.lastPingMs
                        ? '#dcfce7'
                        : selectedEmployee?.hasPings
                          ? '#fff7ed'
                          : '#f1f5f9',
                    color:
                      !liveDeviceStatus.gpsStatusState.isOff && liveDeviceStatus.isToday && !liveDeviceStatus.isShiftCompleted && liveDeviceStatus.lastPingMs
                        ? '#15803d'
                        : selectedEmployee?.hasPings
                          ? '#ea580c'
                          : '#475569',
                    fontWeight: 700,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {selectedEmployee?.name ? selectedEmployee.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {selectedEmployee ? selectedEmployee.name : 'Choose an executive...'}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {selectedEmployee?.phone ? `${selectedEmployee.phone} • ` : ''}{selectedEmployee?.role || 'Field Staff'}
                    </div>
                  </div>
                </div>
                <ChevronDown size={16} color="#64748b" style={{ transform: isExecutiveDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', pointerEvents: 'none' }} />
              </button>

              {/* Dropdown Menu Popup */}
              {isExecutiveDropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 14,
                  right: 14,
                  background: '#ffffff',
                  borderRadius: 10,
                  border: '1px solid #cbd5e1',
                  boxShadow: '0 12px 28px rgba(0,0,0,0.14)',
                  zIndex: 1000,
                  maxHeight: 340,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}>
                  {/* Search Input Field */}
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Search size={14} color="#64748b" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Type name, phone, role..."
                      value={executiveSearch}
                      onChange={(e) => setExecutiveSearch(e.target.value)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        fontSize: 12,
                        width: '100%',
                        outline: 'none',
                        color: '#0f172a',
                        fontWeight: 500
                      }}
                    />
                    {executiveSearch && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExecutiveSearch('');
                          searchInputRef.current?.focus();
                        }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: '#94a3b8' }}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  {/* List of Filtered Executives */}
                  <div style={{ overflowY: 'auto', flex: 1, padding: 4 }}>
                    {filteredExecutives.length === 0 ? (
                      <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
                        No active executives found for "{executiveSearch}"
                      </div>
                    ) : (
                      filteredExecutives.map(emp => {
                        const isSelected = emp.user_id === selectedUserId;
                        const empPingMs = emp.last_ping ? new Date(emp.last_ping).getTime() : null;
                        const empGapSec = empPingMs != null ? Math.max(0, Math.floor((liveNowMs - empPingMs) / 1000)) : null;
                        const empDotColor =
                          empGapSec != null && empGapSec <= LIVE_OFFLINE_THRESHOLD_SEC
                            ? '#16a34a'
                            : emp.hasPings
                              ? '#f59e0b'
                              : '#cbd5e1';
                        return (
                          <div
                            key={emp.user_id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUserId(emp.user_id);
                              setRouteTripFilter('ALL');
                              if (typeof window !== 'undefined') {
                                try {
                                  localStorage.setItem(`crm_last_field_exec_${selectedCompany}`, emp.user_id);
                                } catch (_) {}
                              }
                              setIsExecutiveDropdownOpen(false);
                              setExecutiveSearch('');
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 6,
                              background: isSelected ? '#eff6ff' : 'transparent',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              transition: 'background 0.1s ease',
                              marginBottom: 2
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                              <div style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: empDotColor,
                                flexShrink: 0
                              }} />
                              <div style={{ overflow: 'hidden' }}>
                                <div style={{ fontSize: 12, fontWeight: isSelected ? 700 : 600, color: isSelected ? '#1d4ed8' : '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                  {emp.name}
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                  {emp.phone ? `${emp.phone} • ` : ''}{emp.role}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <Check size={14} color="#2563eb" style={{ flexShrink: 0 }} />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Header Device & Stats Bar */}
            {routeData && (() => {
              const {
                battColor,
                battLabel,
                isCharging,
                lastPingTimeIST,
                mobileDataState,
                gpsStatusState
              } = liveDeviceStatus;

              return (
                <div style={{ padding: 14, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {/* Row 1: Distance + Visits */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 8 }}>
                    <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>TOTAL DISTANCE</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#2563eb' }}>{routeData.totalKm} km</div>
                      {routeSpeedStats.maxSpeed > 0 && (
                        <div style={{ fontSize: 10, color: '#0f172a', fontWeight: 700, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          <span style={{ color: '#0284c7' }}>⚡ Avg: {routeSpeedStats.avgSpeed} km/h</span>
                          <span style={{ color: '#94a3b8' }}>•</span>
                          <span style={{ color: routeSpeedStats.maxSpeed >= 60 ? '#ea580c' : '#334155' }}>Top: {routeSpeedStats.maxSpeed} km/h</span>
                        </div>
                      )}
                      {routeData.offlineGapKm > 0 && (
                        <div style={{ fontSize: 9.5, color: '#c2410c', fontWeight: 600, marginTop: 2, lineHeight: 1.25 }}>
                          <span style={{ whiteSpace: 'nowrap' }}>Road: {routeData.trackedRoadKm ?? 0} km</span>{' '}
                          • <span style={{ whiteSpace: 'nowrap' }}>Offline: {routeData.offlineGapKm} km</span>
                        </div>
                      )}
                    </div>
                    <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>CLIENT VISITS</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>{routeData.visitsCount} Completed</div>
                    </div>
                  </div>

                  {/* Row 2: Battery + Last Ping */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 8 }}>
                    <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 8, border: `1px solid ${battColor}33` }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {isCharging ? <BatteryCharging size={12} color="#16a34a" /> : <Battery size={12} color={battColor} />}
                        {isCharging ? 'BATTERY (⚡ CHARGING)' : 'BATTERY'}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: battColor }}>
                        {battLabel}
                        {isCharging && <span style={{ fontSize: 10, color: '#16a34a', marginLeft: 4, fontWeight: 600 }}>Charging</span>}
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} /> LAST PING
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                        {lastPingTimeIST || 'No Ping'}
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Mobile Data + GPS Status */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    <div style={{ background: mobileDataState.bg, padding: '8px 10px', borderRadius: 8, border: `1px solid ${mobileDataState.border}` }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {mobileDataState.isOff ? <WifiOff size={12} color={mobileDataState.color} /> : <Wifi size={12} color={mobileDataState.color} />}
                        MOBILE DATA
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: mobileDataState.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: mobileDataState.color, display: 'inline-block', flexShrink: 0 }} />
                        {mobileDataState.label}
                      </div>
                    </div>

                    <div style={{ background: gpsStatusState.bg, padding: '8px 10px', borderRadius: 8, border: `1px solid ${gpsStatusState.border}` }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Satellite size={12} color={gpsStatusState.color} /> GPS STATUS
                      </div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: gpsStatusState.color, lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {gpsStatusState.isOff ? (
                          <span>🔴 {gpsStatusState.label}</span>
                        ) : (
                          <>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: gpsStatusState.color, display: 'inline-block', flexShrink: 0 }} />
                            <span>{gpsStatusState.label}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Row 4: Clickable App & Permission Health Summary Chip */}
                  {selectedDeviceHealth && (
                    <button
                      type="button"
                      onClick={() => onOpenDeviceHealth?.()}
                      style={{
                        marginTop: 8,
                        width: '100%',
                        textAlign: 'left',
                        background: selectedDeviceHealth.bg || '#f8fafc',
                        border: `1px solid ${selectedDeviceHealth.border || '#cbd5e1'}`,
                        borderRadius: 8,
                        padding: '7px 10px',
                        cursor: onOpenDeviceHealth ? 'pointer' : 'default',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8
                      }}
                      title={selectedDeviceHealth.issueSummary || 'Inspect device permissions & APK version'}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: selectedDeviceHealth.color || '#334155', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                          {selectedDeviceHealth.status === 'HEALTHY' ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
                          <span>{selectedDeviceHealth.shortLabel || 'App Health'}</span>
                          <span>•</span>
                          <span>
                            {selectedDeviceHealth.versionCode != null
                              ? `APK v${selectedDeviceHealth.versionCode}`
                              : selectedDeviceHealth.platform?.includes('Android')
                                ? 'Old APK (v<=3)'
                                : (selectedDeviceHealth.platform || 'No APK')}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: '#475569', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {selectedDeviceHealth.locationMode === 'all_the_time'
                            ? 'GPS: All the Time'
                            : selectedDeviceHealth.locationMode === 'while_using'
                              ? 'GPS: While Using Only'
                              : selectedDeviceHealth.locationMode === 'denied'
                                ? 'GPS: Denied'
                                : selectedDeviceHealth.locationMode === 'browser'
                                  ? 'Browser Only'
                                  : 'Location: Pending'}
                          {selectedDeviceHealth.batteryUnrestricted === false
                            ? ' • Battery Restricted'
                            : selectedDeviceHealth.batteryUnrestricted === true
                              ? ' • Battery Unrestricted'
                              : ''}
                        </div>
                      </div>
                      {onOpenDeviceHealth && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: selectedDeviceHealth.color || '#1d4ed8', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          Audit →
                        </span>
                      )}
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Fallback Device Health Chip when employee has no route data yet */}
            {!routeData && selectedDeviceHealth && (
              <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => onOpenDeviceHealth?.()}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: selectedDeviceHealth.bg || '#ffffff',
                    border: `1px solid ${selectedDeviceHealth.border || '#cbd5e1'}`,
                    borderRadius: 8,
                    padding: '7px 10px',
                    cursor: onOpenDeviceHealth ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: selectedDeviceHealth.color || '#334155', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {selectedDeviceHealth.status === 'HEALTHY' ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
                      <span>{selectedDeviceHealth.shortLabel || 'App Health'}</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                      {selectedDeviceHealth.issueSummary}
                    </div>
                  </div>
                  {onOpenDeviceHealth && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: selectedDeviceHealth.color || '#1d4ed8', whiteSpace: 'nowrap' }}>
                      Audit →
                    </span>
                  )}
                </button>
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
                    const isPunchIn = item.type === 'punch_in';
                    const isPunchOut = item.type === 'punch_out';

                    let badgeText = 'STOPPAGE';
                    let badgeBg = '#92400e';
                    let cardBg = '#fffbeb';
                    let cardBorder = '#fde68a';
                    let itemTitle = `Stoppage (${item.durationMins || 0} mins)`;

                    if (isVisit) {
                      badgeText = 'CLIENT VISIT';
                      badgeBg = '#166534';
                      cardBg = '#f0fdf4';
                      cardBorder = '#bbf7d0';
                      itemTitle = item.partyName || 'Client Visit';
                    } else if (isPunchIn) {
                      badgeText = '🚩 PUNCH IN';
                      badgeBg = '#15803d';
                      cardBg = '#f0fdf4';
                      cardBorder = '#86efac';
                      itemTitle = item.label || 'Attendance Punch In (On Duty)';
                    } else if (isPunchOut) {
                      badgeText = '🏁 PUNCH OUT';
                      badgeBg = '#6b21a8';
                      cardBg = '#faf5ff';
                      cardBorder = '#d8b4fe';
                      itemTitle = item.label || 'Attendance Punch Out (Shift Completed)';
                    }

                    return (
                      <div
                        key={idx}
                        style={{
                          background: cardBg,
                          border: `1px solid ${cardBorder}`,
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
                            background: badgeBg,
                            color: '#ffffff'
                          }}>
                            {badgeText}
                          </span>
                          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                            {isPunchIn ? (item.shiftName || 'On Duty') : isPunchOut ? 'Shift End' : `${item.durationMins || 0} mins`}
                          </span>
                        </div>

                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                          {itemTitle}
                        </div>

                        {/* Location Name / Landmark Display */}
                        {item.locationName && (
                          <div style={{ fontSize: 11, color: '#334155', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                            <MapPin size={12} color={isPunchIn ? '#16a34a' : isPunchOut ? '#7c3aed' : '#d97706'} />
                            <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{item.locationName}</span>
                          </div>
                        )}

                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {item.type === 'stoppage' && item.startTime && item.endTime ? (
                            <span>
                              {new Date(item.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} – {new Date(item.endTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                            </span>
                          ) : (
                            <span>
                              {item.checkInTime ? new Date(item.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : (item.startTime ? new Date(item.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '')}
                            </span>
                          )}
                          {item.connectivityMode && ` • ${item.connectivityMode}`}
                          {isPunchOut && ' • Shift Completed'}
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
          <div
            ref={mapFullscreenWrapperRef}
            style={
              isMapFullscreen
                ? {
                    position: 'fixed',
                    inset: 0,
                    zIndex: 99995,
                    width: '100vw',
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#f8fafc'
                  }
                : {
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#f8fafc',
                    position: 'relative',
                    minHeight: 'calc(100vh - 220px)',
                    height: '100%'
                  }
            }
          >
            {/* Interactive OpenStreetMap Leaflet Engine */}
            <style>{`
              .leaflet-tile-pane .crm-clean-light-tiles { filter: grayscale(92%) brightness(1.06) contrast(0.90); }
              @keyframes pulse {
                0% { transform: scale(0.92); opacity: 0.78; }
                70% { transform: scale(1.42); opacity: 0; }
                100% { transform: scale(1.42); opacity: 0; }
              }
              @keyframes crmBeaconPulse {
                0% { transform: scale(0.85); opacity: 0.8; }
                75% { transform: scale(1.65); opacity: 0; }
                100% { transform: scale(1.65); opacity: 0; }
              }
              @keyframes crmChevronPop {
                0% { opacity: 0; filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
                100% { opacity: 1; filter: drop-shadow(0 2px 4px rgba(15,23,42,0.18)); }
              }
              .crm-chevron-badge { animation: crmChevronPop 0.35s ease-out both; transition: filter 0.18s ease, box-shadow 0.18s ease; }
              .crm-chevron-marker:hover .crm-chevron-badge { box-shadow: 0 0 0 3px rgba(255,255,255,0.9), 0 4px 10px rgba(15,23,42,0.35) !important; }
            `}</style>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: isMapFullscreen ? 0 : 'calc(100vh - 280px)', height: '100%', width: '100%' }}>
              {/* Leaflet DOM Container */}
              <div ref={mapContainerRef} style={{ width: '100%', height: '100%', minHeight: isMapFullscreen ? 0 : 'calc(100vh - 280px)', background: '#e2e8f0', zIndex: 1, position: 'relative' }} />

              {/* Clean Map Loading Overlay (blocks only on very first cold load with zero cached route) */}
              {(!leafletReady || (loadingRoute && !routeData)) && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 200,
                  background: 'rgba(248, 250, 252, 0.92)',
                  backdropFilter: 'blur(3px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12
                }}>
                  <div style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    border: '3.5px solid #bfdbfe',
                    borderTopColor: '#2563eb',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>
                    {!leafletReady ? 'Initializing 360° Interactive Radar Map...' : 'Loading Live Route...'}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Official Standard OpenStreetMap Navigation
                  </div>
                </div>
              )}

              {/* Subtle Non-Blocking Sync Pill (when updating cached route or switching executive) */}
              {leafletReady && ((loadingRoute && routeData) || syncingRoute) && (
                <div style={{
                  position: 'absolute',
                  top: 14,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 560,
                  pointerEvents: 'none',
                  background: 'rgba(255, 255, 255, 0.96)',
                  border: '1px solid #bfdbfe',
                  borderRadius: 999,
                  padding: '5px 14px',
                  boxShadow: '0 4px 12px rgba(37,99,235,0.16)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#1d4ed8'
                }}>
                  <RefreshCw size={12} style={{ animation: 'spin 0.9s linear infinite' }} />
                  <span>{loadingRoute ? 'Loading Selected Route...' : 'Syncing Live GPS...'}</span>
                </div>
              )}

              {/* Status / No Movement Overlay if empty */}
              {leafletReady && !loadingRoute && (!routeData?.polyline || routeData.polyline.length === 0) && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10,
                  background: 'rgba(255,255,255,0.96)',
                  padding: '24px 32px',
                  borderRadius: 12,
                  border: '1px solid #cbd5e1',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  textAlign: 'center',
                  maxWidth: 380
                }}>
                  <Navigation size={38} style={{ color: '#2563eb', margin: '0 auto 8px', opacity: 0.8 }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                    No Movement Recorded for This Date
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    Pick an active date or check an executive who performed field visits.
                  </div>
                </div>
              )}

              {/* Active on Duty Pill (When Punched In Awaiting Movement) */}
              {routeData?.polyline && routeData.polyline.length === 1 && (
                <div style={{
                  position: 'absolute',
                  top: 14,
                  right: 68,
                  zIndex: 500,
                  background: 'rgba(255,255,255,0.96)',
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #86efac',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#166534'
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }}></span>
                  <span>Punched In at {routeData.polyline[0].time ? new Date(routeData.polyline[0].time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : ''} • Active on Duty</span>
                </div>
              )}

              {/* Floating Right-Side Map Toolbar: Map Style, Recenter, Fullscreen & Estimate Route Toggle */}
              {leafletReady && (
                <div style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  zIndex: 550,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  alignItems: 'flex-end'
                }}>
                  {/* 1. Map Style Selector Button & Popover */}
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      title="Switch Map Style (Street / Satellite / Light)"
                      onClick={() => setShowMapStyleMenu(prev => !prev)}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: showMapStyleMenu || mapStyle !== 'street' ? '#eff6ff' : 'rgba(255,255,255,0.96)',
                        border: showMapStyleMenu || mapStyle !== 'street' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: showMapStyleMenu || mapStyle !== 'street' ? '#2563eb' : '#334155'
                      }}
                    >
                      <Layers size={18} />
                    </button>

                    {showMapStyleMenu && (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 46,
                        background: '#ffffff',
                        borderRadius: 10,
                        border: '1px solid #cbd5e1',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
                        padding: 6,
                        minWidth: 150,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', padding: '2px 8px', textTransform: 'uppercase' }}>
                          Map Style
                        </div>
                        {Object.values(MAP_TILE_STYLES).map((st) => {
                          const active = mapStyle === st.id;
                          const IconComp = st.id === 'satellite' ? Globe : st.id === 'light' ? Sun : MapIcon;
                          return (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => {
                                setMapStyle(st.id);
                                setShowMapStyleMenu(false);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                                padding: '7px 10px',
                                borderRadius: 7,
                                border: 'none',
                                background: active ? '#eff6ff' : 'transparent',
                                color: active ? '#1d4ed8' : '#334155',
                                fontSize: 12,
                                fontWeight: active ? 700 : 600,
                                cursor: 'pointer',
                                textAlign: 'left'
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <IconComp size={14} />
                                {st.label}
                              </span>
                              {active && <Check size={13} color="#2563eb" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 2. Recenter & Fullscreen Group */}
                  <div style={{
                    background: 'rgba(255,255,255,0.96)',
                    borderRadius: 10,
                    border: '1px solid #cbd5e1',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <button
                      type="button"
                      title="Recenter Route to Fit Screen"
                      onClick={handleRecenterRoute}
                      style={{
                        width: 38,
                        height: 38,
                        border: 'none',
                        borderBottom: '1px solid #e2e8f0',
                        background: 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#334155'
                      }}
                    >
                      <LocateFixed size={17} />
                    </button>
                    <button
                      type="button"
                      title={isMapFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen Map'}
                      onClick={handleToggleFullscreen}
                      style={{
                        width: 38,
                        height: 38,
                        border: 'none',
                        background: isMapFullscreen ? '#eff6ff' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: isMapFullscreen ? '#2563eb' : '#334155'
                      }}
                    >
                      {isMapFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                    </button>
                  </div>

                  {/* 3. See Estimate Route Toggle */}
                  <button
                    type="button"
                    title={showEstimateRoute ? 'Hide Estimated Road Preview' : 'See Estimated Road Route Across Offline Gaps'}
                    onClick={handleToggleEstimateRoute}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: showEstimateRoute ? '#f3e8ff' : 'rgba(255,255,255,0.96)',
                      border: showEstimateRoute ? '1.5px solid #9333ea' : '1px solid #cbd5e1',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: showEstimateRoute ? '#7e22ce' : '#334155'
                    }}
                  >
                    {loadingEstimate ? (
                      <RefreshCw size={17} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Route size={18} />
                    )}
                  </button>
                </div>
              )}

              {/* Estimate Route Floating Notice Badge (when toggled ON) */}
              {showEstimateRoute && estimateSummary && (
                <div style={{
                  position: 'absolute',
                  top: 56,
                  left: 56,
                  zIndex: 500,
                  background: 'rgba(250, 245, 255, 0.96)',
                  padding: '5px 11px',
                  borderRadius: 8,
                  border: '1px solid #d8b4fe',
                  color: '#6b21a8',
                  fontSize: 11,
                  fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <Route size={13} color="#7e22ce" />
                  {estimateSummary.noGaps ? (
                    <span>No Offline Gaps Today • Actual Route Shown</span>
                  ) : (
                    <span>Estimated Gap Road: ~{estimateSummary.distanceKm} km (Preview Only)</span>
                  )}
                </div>
              )}

              {/* Top Overlay Badge with Speed, Time & Trip Phase */}
              {routeData?.polyline && routeData.polyline.length > 0 && (
                <div style={{ position: 'absolute', top: 12, left: 56, right: 64, maxWidth: 'fit-content', zIndex: 500, background: 'rgba(255,255,255,0.96)', padding: '6px 14px', borderRadius: 8, border: '1px solid #cbd5e1', color: '#0f172a', fontSize: 12, fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>🚗 Live Playhead:</span>
                  <span style={{ color: currentTelemetry?.isOffline ? '#ea580c' : currentTelemetry?.tripPhase === 'RETURN' ? '#db2777' : '#2563eb' }}>
                    {currentTelemetry?.speed != null ? currentTelemetry.speed : (routeData.polyline[playbackIndex]?.speed ?? 0)} km/h
                  </span>
                  <span style={{ color: '#64748b' }}>•</span>
                  <span>
                    {currentTelemetry?.time ? new Date(currentTelemetry.time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : (routeData.polyline[playbackIndex]?.time ? new Date(routeData.polyline[playbackIndex].time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Start')}
                  </span>
                  {routeSplitInfo.hasReturnTrip && (
                    <span style={{
                      marginLeft: 4,
                      fontSize: 11,
                      background: currentTelemetry?.tripPhase === 'RETURN' ? '#fdf2f8' : '#eff6ff',
                      color: currentTelemetry?.tripPhase === 'RETURN' ? '#be185d' : '#1d4ed8',
                      padding: '2px 8px',
                      borderRadius: 12,
                      border: currentTelemetry?.tripPhase === 'RETURN' ? '1px solid #fbcfe8' : '1px solid #bfdbfe',
                      fontWeight: 700,
                      transition: 'all 0.25s ease'
                    }}>
                      {currentTelemetry?.tripPhase === 'RETURN' ? '🩷 Return (Inward)' : '🔵 Going (Outward)'}
                    </span>
                  )}
                  {currentTelemetry?.isOffline ? (
                    <span style={{ marginLeft: 4, fontSize: 11, background: '#fff7ed', color: '#c2410c', padding: '2px 8px', borderRadius: 12, border: '1px solid #fed7aa', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ea580c' }}></span>
                      🟠 Offline Gap
                    </span>
                  ) : (
                    <span style={{ marginLeft: 4, fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 12, border: '1px solid #bfdbfe', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb' }}></span>
                      🔵 Live Online
                    </span>
                  )}
                  {routeData?.isRoadSnapped && (
                    <span style={{ marginLeft: 4, fontSize: 11, background: '#f8fafc', color: '#475569', padding: '2px 8px', borderRadius: 12, border: '1px solid #cbd5e1', fontWeight: 600 }}>
                      🛣️ Road-Snapped (OSRM)
                    </span>
                  )}
                  {routeSpeedStats.maxSpeed > 0 && (
                    <span style={{ marginLeft: 4, fontSize: 11, background: '#f0f9ff', color: '#0369a1', padding: '2px 8px', borderRadius: 12, border: '1px solid #bae6fd', fontWeight: 700 }}>
                      ⚡ Avg {routeSpeedStats.avgSpeed} • Top {routeSpeedStats.maxSpeed} km/h
                    </span>
                  )}
                </div>
              )}

              {/* Bottom-Left Floating Interactive Trip Filter Pill Bar */}
              {routeData?.polyline && routeData.polyline.length > 1 && (
                <div style={{
                  position: 'absolute',
                  bottom: 16,
                  left: 14,
                  zIndex: 520,
                  background: 'rgba(255, 255, 255, 0.96)',
                  backdropFilter: 'blur(6px)',
                  padding: 4,
                  borderRadius: 10,
                  border: '1px solid #cbd5e1',
                  boxShadow: '0 4px 14px rgba(15,23,42,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  {routeSplitInfo.hasReturnTrip ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSelectTripFilter('ALL')}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 7,
                          border: 'none',
                          background: effectiveTripFilter === 'ALL' ? '#0f172a' : 'transparent',
                          color: effectiveTripFilter === 'ALL' ? '#ffffff' : '#475569',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.18s ease'
                        }}
                      >
                        All Routes
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTripFilter('GOING')}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 7,
                          border: 'none',
                          background: effectiveTripFilter === 'GOING' ? '#2563eb' : 'transparent',
                          color: effectiveTripFilter === 'GOING' ? '#ffffff' : '#1e40af',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.18s ease'
                        }}
                      >
                        Going Only (━━➤)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTripFilter('RETURN')}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 7,
                          border: 'none',
                          background: effectiveTripFilter === 'RETURN' ? '#ec4899' : 'transparent',
                          color: effectiveTripFilter === 'RETURN' ? '#ffffff' : '#be185d',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.18s ease'
                        }}
                      >
                        Return Only (╍╍◀)
                      </button>
                    </>
                  ) : (
                    <div style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 14, height: 3, background: '#2563eb', borderRadius: 2, display: 'inline-block' }}></span>
                      <span>Single Outward Route (No Return Yet)</span>
                    </div>
                  )}
                </div>
              )}

              {/* Route Status Legend Overlay */}
              {routeData?.polyline && routeData.polyline.length > 1 && (
                <div style={{
                  position: 'absolute',
                  bottom: 16,
                  right: 14,
                  zIndex: 500,
                  background: 'rgba(255, 255, 255, 0.96)',
                  backdropFilter: 'blur(4px)',
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontSize: 11,
                  fontWeight: 600,
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 14, height: 4, background: '#2563eb', borderRadius: 2, display: 'inline-block' }}></span>
                    <span style={{ color: '#1e293b' }}>{routeSplitInfo.hasReturnTrip ? 'Going (Outward)' : 'Live Online'}</span>
                  </div>
                  {routeSplitInfo.hasReturnTrip && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 14, height: 0, borderTop: '3px dashed #ec4899', display: 'inline-block' }}></span>
                      <span style={{ color: '#be185d' }}>Return (Inward)</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 14, height: 4, background: '#d97706', borderRadius: 2, display: 'inline-block' }}></span>
                    <span style={{ color: '#1e293b' }}>Offline Recorded</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 14, height: 0, borderTop: '3px dashed #ea580c', display: 'inline-block' }}></span>
                    <span style={{ color: '#1e293b' }}>Signal Lost Gap</span>
                  </div>
                  {showEstimateRoute && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 14, height: 0, borderTop: '3px dotted #9333ea', display: 'inline-block' }}></span>
                      <span style={{ color: '#6b21a8' }}>Estimated Road</span>
                    </div>
                  )}
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
                onClick={() => {
                  if (!isPlaying && routeData?.polyline) {
                    const legStartIdx =
                      effectiveTripFilter === 'RETURN' && routeSplitInfo.hasReturnTrip
                        ? routeSplitInfo.turnaroundIdx
                        : 0;
                    const legEndIdx =
                      effectiveTripFilter === 'GOING' && routeSplitInfo.hasReturnTrip
                        ? routeSplitInfo.turnaroundIdx
                        : routeData.polyline.length - 1;
                    if (progressRef.current >= legEndIdx || progressRef.current < legStartIdx) {
                      progressRef.current = legStartIdx;
                      setPlaybackIndex(legStartIdx);
                      updateRunnerPosition(legStartIdx, routeData.polyline);
                    }
                  }
                  setIsPlaying(!isPlaying);
                }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: effectiveTripFilter === 'RETURN' ? '#ec4899' : '#2563eb',
                  border: 'none',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: effectiveTripFilter === 'RETURN' ? '0 2px 10px rgba(236,72,153,0.35)' : '0 2px 8px rgba(37,99,235,0.3)',
                  transition: 'background 0.25s ease'
                }}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
              </button>

              <button
                type="button"
                onClick={() => {
                  const legStartIdx =
                    effectiveTripFilter === 'RETURN' && routeSplitInfo.hasReturnTrip
                      ? routeSplitInfo.turnaroundIdx
                      : 0;
                  progressRef.current = legStartIdx;
                  setPlaybackIndex(legStartIdx);
                  setIsPlaying(false);
                  if (routeData?.polyline) {
                    updateRunnerPosition(legStartIdx, routeData.polyline);
                  }
                }}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Reset to Start"
              >
                <RotateCcw size={16} />
              </button>

              {/* Progress Slider */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: '#64748b', minWidth: 45, fontWeight: 600 }}>
                  {routeData?.polyline?.[playbackIndex]?.time ? new Date(routeData.polyline[playbackIndex].time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '00:00'}
                </span>

                <input
                  type="range"
                  min="0"
                  max={Math.max(0, (routeData?.polyline?.length || 1) - 1)}
                  value={playbackIndex}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    progressRef.current = val;
                    setPlaybackIndex(val);
                    if (routeData?.polyline) {
                      updateRunnerPosition(val, routeData.polyline);
                    }
                  }}
                  style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }}
                />

                <span style={{ fontSize: 11, color: '#64748b', minWidth: 45, fontWeight: 600 }}>
                  {routeData?.polyline?.length ? new Date(routeData.polyline[routeData.polyline.length - 1].time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '00:00'}
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
                Field Force Distribution ({radarEmployees.filter(e => e.recorded_at && Math.max(0, Math.floor((liveNowMs - new Date(e.recorded_at).getTime()) / 1000)) <= LIVE_OFFLINE_THRESHOLD_SEC).length} Online Now • {radarEmployees.length} Active Today)
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {radarEmployees.map((emp, idx) => {
                  const empGapSec = emp.recorded_at ? Math.max(0, Math.floor((liveNowMs - new Date(emp.recorded_at).getTime()) / 1000)) : null;
                  const isEmpOnline = empGapSec != null && empGapSec <= LIVE_OFFLINE_THRESHOLD_SEC;
                  return (
                  <div
                    key={idx}
                    style={{
                      background: '#f8fafc',
                      borderRadius: 10,
                      padding: 14,
                      border: `1px solid ${isEmpOnline ? '#bbf7d0' : '#fed7aa'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{emp.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 6,
                          background: isEmpOnline ? '#dcfce7' : '#fff7ed',
                          color: isEmpOnline ? '#166534' : '#c2410c'
                        }}>
                          {isEmpOnline ? '🟢 Online' : `🔴 Offline (${empGapSec != null ? formatDurationSeconds(empGapSec) : 'No ping'})`}
                        </span>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 6,
                          background: emp.is_moving ? '#e0f2fe' : '#f1f5f9',
                          color: emp.is_moving ? '#0369a1' : '#475569'
                        }}>
                          {emp.is_moving ? 'Moving' : 'Stationary'}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Role: <strong>{emp.role}</strong> • Branch: {emp.branch_code || 'Main Plant'}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#475569', paddingTop: 6, borderTop: '1px solid #e2e8f0' }}>
                      <span>Speed: {emp.speed_kmh} km/h</span>
                      <span>Battery: {emp.battery_pct != null ? `${emp.battery_pct}%` : 'N/A'}</span>
                      <span>{emp.recorded_at ? new Date(emp.recorded_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '-'}</span>
                    </div>
                  </div>
                  );
                })}
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
