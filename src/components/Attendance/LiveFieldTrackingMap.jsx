'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MapPin, Play, Pause, RotateCcw, FastForward, Navigation, Battery,
  BatteryCharging, Smartphone, Clock, Calendar, Search, Filter,
  Download, CheckCircle, XCircle, AlertTriangle, User, ChevronRight,
  TrendingUp, Award, Layers, ShieldCheck, RefreshCw, Eye, ChevronDown, Check, X,
  Wifi, WifiOff, Satellite
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

// Local Haversine distance in meters for map matching alignment
function haversineDistMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const R = 6371000;
  const dLat = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const dLon = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((Number(lat1) * Math.PI) / 180) * Math.cos((Number(lat2) * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Align snapped road geometry monotonically back to original GPS waypoints for timing/speed/offline status
function alignSnappedPolylineClient(stitchedCoords, valid) {
  const N = stitchedCoords.length;
  const M = valid.length;
  const cumDist = new Array(N).fill(0);
  for (let j = 1; j < N; j++) {
    cumDist[j] = cumDist[j - 1] + haversineDistMeters(
      stitchedCoords[j - 1][1], stitchedCoords[j - 1][0],
      stitchedCoords[j][1], stitchedCoords[j][0]
    );
  }

  const anchors = new Array(M).fill(0);
  anchors[0] = 0;
  anchors[M - 1] = N - 1;
  for (let i = 1; i < M - 1; i++) {
    let bestIdx = anchors[i - 1];
    let bestDist = Infinity;
    for (let k = anchors[i - 1]; k < N; k++) {
      const d = haversineDistMeters(valid[i].lat, valid[i].lng, stitchedCoords[k][1], stitchedCoords[k][0]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = k;
      }
      if (bestDist < 50 && d > 200) break;
    }
    anchors[i] = Math.max(anchors[i - 1], bestIdx);
  }

  const snappedPolyline = [];
  let lastEmitted = -1;
  for (let i = 0; i < M - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const t1 = valid[i].time ? new Date(valid[i].time).getTime() : Date.now();
    const t2 = valid[i + 1].time ? new Date(valid[i + 1].time).getTime() : t1;
    const gapMs = Math.max(0, t2 - t1);
    const segIsOffline = Boolean(valid[i + 1].isOffline || gapMs > 480000);
    const segDist = Math.max(0, cumDist[b] - cumDist[a]);
    const calcSpeed = (gapMs > 2000 && segDist > 10)
      ? Math.min(Math.round((segDist / (gapMs / 1000)) * 3.6), 120)
      : Math.max(0, Math.round(Number(valid[i + 1].speed || valid[i].speed || 0)));

    const startK = Math.max(a, lastEmitted + 1);
    const endK = (i === M - 2) ? b : Math.max(a, b - 1);
    for (let k = startK; k <= endK; k++) {
      const frac = segDist > 0 ? Math.min(1, Math.max(0, (cumDist[k] - cumDist[a]) / segDist)) : 0;
      snappedPolyline.push({
        lat: stitchedCoords[k][1],
        lng: stitchedCoords[k][0],
        time: new Date(t1 + frac * gapMs).toISOString(),
        speed: calcSpeed,
        isSnapped: true,
        isOffline: segIsOffline
      });
      lastEmitted = k;
    }
  }
  return snappedPolyline;
}

// Client-side OSRM Map Matching fallback — uses /match (HMM) with radiuses <= 40m
async function snapPolylineToRoadClient(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return null;

  let valid = waypoints.filter(p => {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    return !isNaN(lat) && !isNaN(lng) &&
           lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
           (Math.abs(lat) > 0.01 || Math.abs(lng) > 0.01);
  });
  if (valid.length < 2) return null;

  const accFiltered = valid.filter(p => {
    const acc = p.accuracy_meters != null ? Number(p.accuracy_meters) : null;
    return acc == null || isNaN(acc) || acc <= 300;
  });
  if (accFiltered.length >= 2) valid = accFiltered;

  const cleaned = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const cur = valid[i];
    const dist = haversineDistMeters(prev.lat, prev.lng, cur.lat, cur.lng);
    const dtSec = (prev.time && cur.time) ? Math.max(0, (new Date(cur.time) - new Date(prev.time)) / 1000) : 60;
    const spdKmh = dtSec > 0 ? (dist / dtSec) * 3.6 : (dist > 50 ? 999 : 0);
    if (dist > 250 && spdKmh > 130 && dtSec < 300) continue;
    if (dist >= 8 || cur.isOffline || i === valid.length - 1) cleaned.push(cur);
  }
  if (cleaned.length >= 2) valid = cleaned;

  const chunkSize = 90;
  const chunks = [];
  if (valid.length <= chunkSize) {
    chunks.push(valid);
  } else {
    for (let i = 0; i < valid.length - 1; i += (chunkSize - 1)) {
      chunks.push(valid.slice(i, i + chunkSize));
      if (i + chunkSize >= valid.length) break;
    }
  }

  try {
    let stitchedCoords = [];
    let totalDist = 0;

    for (const chunk of chunks) {
      if (chunk.length < 2) continue;
      const coordStr = chunk.map(p => `${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)}`).join(';');
      const radiusStr = chunk
        .map(p => {
          const acc = p.accuracy_meters != null ? Number(p.accuracy_meters) : NaN;
          if (isNaN(acc) || acc <= 0) return '35';
          return String(Math.min(Math.max(Math.round(acc), 25), 40));
        })
        .join(';');

      const matchUrl = `https://router.project-osrm.org/match/v1/driving/${coordStr}?overview=full&geometries=geojson&gaps=ignore&tidy=false&radiuses=${radiusStr}`;
      let matched = false;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(matchUrl, { headers: { Accept: 'application/json' }, signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const json = await res.json();
          if (json.code === 'Ok' && Array.isArray(json.matchings) && json.matchings.length > 0) {
            for (const matching of json.matchings) {
              const road = matching.geometry?.coordinates;
              if (!road?.length) continue;
              totalDist += (matching.distance || 0);
              stitchedCoords = stitchedCoords.length === 0 ? road : stitchedCoords.concat(road.slice(1));
              matched = true;
            }
          }
        }
      } catch (_) {}

      if (!matched) {
        try {
          const rCtrl = new AbortController();
          const rTimer = setTimeout(() => rCtrl.abort(), 6000);
          const unlimitedRads = chunk.map(() => 'unlimited').join(';');
          const rRes = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&continue_straight=true&radiuses=${unlimitedRads}`,
            { headers: { Accept: 'application/json' }, signal: rCtrl.signal }
          );
          clearTimeout(rTimer);
          if (rRes.ok) {
            const rJson = await rRes.json();
            const road = rJson.routes?.[0]?.geometry?.coordinates;
            if (rJson.code === 'Ok' && road?.length > 0) {
              totalDist += (rJson.routes[0].distance || 0);
              stitchedCoords = stitchedCoords.length === 0 ? road : stitchedCoords.concat(road.slice(1));
            }
          }
        } catch (_) {}
      }
    }

    if (stitchedCoords.length < 2) return null;

    return {
      polyline: alignSnappedPolylineClient(stitchedCoords, valid),
      totalDistanceMeters: totalDist
    };
  } catch (err) {
    console.warn('Client map matching error:', err?.message || err);
    return null;
  }
}

export default function LiveFieldTrackingMap({ company = 'New Swan Group', branchCode = null, currentUserRole = 'ADMIN', tenantId = null }) {
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
        if (lastSelected) return lastSelected;
        const cached = localStorage.getItem(`crm_cached_field_executives_${company || 'New Swan Group'}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].user_id;
        }
      } catch (_) {}
    }
    return '';
  });

  const [routeData, setRouteData] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [executiveSearch, setExecutiveSearch] = useState('');
  const [isExecutiveDropdownOpen, setIsExecutiveDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const routeCacheRef = useRef({});

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

  // Video-like Animated Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1, 2, 5
  // Interactive Leaflet Map Refs & Dynamic Trail Refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersGroupRef = useRef(null);
  const runnerMarkerRef = useRef(null);
  const traveledTrailRef = useRef(null);
  const upcomingTrailRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastFrameTimeRef = useRef(null);
  const progressRef = useRef(0);
  const [currentTelemetry, setCurrentTelemetry] = useState(null);
  const [leafletReady, setLeafletReady] = useState(false);

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

      const combined = filteredMembers.map(m => {
        const id = m.user_id || m.id;
        const pingMatch = (radarData || []).find(r => r.user_id === id);
        return {
          user_id: id,
          name: (m.emp_name || m.name || m.email || id).trim(),
          role: m.role || 'Field Staff',
          phone: m.emp_mobile || m.phone || '',
          hasPings: Boolean(pingMatch),
          battery_pct: pingMatch?.battery_pct,
          last_ping: pingMatch?.last_ping
        };
      });

      // Sort: Employees with live pings / on-duty today first, then alphabetically by name
      combined.sort((a, b) => {
        if (a.hasPings && !b.hasPings) return -1;
        if (!a.hasPings && b.hasPings) return 1;
        return a.name.localeCompare(b.name);
      });

      setActiveEmployeesList(combined);
      if (typeof window !== 'undefined' && combined.length > 0) {
        try {
          localStorage.setItem(`crm_cached_field_executives_${selectedCompany}`, JSON.stringify(combined));
        } catch (_) {}
      }

      // Auto-select active user if none selected or if current selection is not in list
      if (combined.length > 0) {
        setSelectedUserId(prevId => {
          if (prevId && combined.some(m => m.user_id === prevId)) return prevId;
          const liveUser = combined.find(m => m.hasPings);
          if (liveUser) return liveUser.user_id;
          const adminUser = combined.find(m => String(m.role || '').toLowerCase().includes('admin') || String(m.name).toLowerCase().includes('admin'));
          const finalId = adminUser ? adminUser.user_id : combined[0].user_id;
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(`crm_last_field_exec_${selectedCompany}`, finalId);
            } catch (_) {}
          }
          return finalId;
        });
      }
    } catch (err) {
      console.error('Failed to load radar data:', err);
    } finally {
      setLoadingRadar(false);
    }
  };

  const loadEmployeeRoute = async (userId, dateStr) => {
    if (!userId) return;
    const cacheKey = `${userId}_${dateStr}`;
    if (routeCacheRef.current[cacheKey]) {
      setRouteData(routeCacheRef.current[cacheKey]);
      setLoadingRoute(false);
      setIsPlaying(false);
      setPlaybackIndex(0);
      return;
    }

    setLoadingRoute(true);
    setIsPlaying(false);
    setPlaybackIndex(0);
    try {
      const data = await getEmployee360Route(userId, dateStr);
      if (data?.polyline && data.polyline.length >= 2 && !data.isRoadSnapped) {
        try {
          const clientSnapped = await snapPolylineToRoadClient(data.polyline);
          if (clientSnapped?.polyline?.length > 0) {
            data.polyline = clientSnapped.polyline;
            data.isRoadSnapped = true;
            if (clientSnapped.totalDistanceMeters > 0) {
              data.totalKm = Number((clientSnapped.totalDistanceMeters / 1000).toFixed(2));
            }
          }
        } catch (_) {}
      }
      if (data) {
        routeCacheRef.current[cacheKey] = data;
      }
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
      const map = window.L.map(mapContainerRef.current, {
        center: [30.9010, 75.8573],
        zoom: 12,
        zoomControl: true,
        fadeAnimation: true,
        markerZoomAnimation: true
      });

      // Official Standard OpenStreetMap Tiles (100% Free, Zero Watermark, No API Key Required)
      const tileLayer = window.L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
      );

      tileLayer.on('tileerror', (e) => {
        console.warn('OpenStreetMap tile load notice:', e);
      });

      tileLayer.addTo(map);

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

    const isCurrentOffline = Boolean(p1?.isOffline);

    setCurrentTelemetry({
      lat,
      lng,
      speed: interpSpeed,
      time: interpTime,
      bearing: brng,
      isOffline: isCurrentOffline
    });

    // Update runner marker position
    if (runnerMarkerRef.current) {
      runnerMarkerRef.current.setLatLng([lat, lng]);

      // Rotate vehicle direction arrow smoothly and update live/offline theme
      const rotator = document.getElementById('runner-vehicle-rotator');
      if (rotator) {
        rotator.style.transform = `rotate(${Math.round(brng)}deg)`;
        if (isCurrentOffline) {
          rotator.style.background = 'linear-gradient(135deg, #c2410c 0%, #ea580c 100%)';
          rotator.style.boxShadow = '0 4px 14px rgba(234,88,12,0.75)';
        } else {
          rotator.style.background = 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)';
          rotator.style.boxShadow = '0 4px 14px rgba(37,99,235,0.7)';
        }
      }

      // Keep in view if animating
      if (isPlaying && mapInstanceRef.current) {
        if (!mapInstanceRef.current.getBounds().contains([lat, lng])) {
          mapInstanceRef.current.panTo([lat, lng], { animate: true, duration: 0.25 });
        }
      }
    }

    // Dynamic Trail Polylines
    if (traveledTrailRef.current) {
      const traveledCoords = polyline.slice(0, idx + 1).map(p => [Number(p.lat), Number(p.lng)]);
      traveledCoords.push([lat, lng]);
      traveledTrailRef.current.setLatLngs(traveledCoords);
      traveledTrailRef.current.setStyle({
        color: isCurrentOffline ? '#ea580c' : '#2563eb'
      });
    }

    if (upcomingTrailRef.current) {
      const upcomingCoords = [[lat, lng], ...polyline.slice(nextIdx).map(p => [Number(p.lat), Number(p.lng)])];
      upcomingTrailRef.current.setLatLngs(upcomingCoords);
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

      if (nextProg >= totalPoints - 1) {
        nextProg = totalPoints - 1;
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

  // Update Route Polyline & Markers on Map
  useEffect(() => {
    if (!mapInstanceRef.current || !markersGroupRef.current || !window.L) return;

    markersGroupRef.current.clearLayers();
    runnerMarkerRef.current = null;
    traveledTrailRef.current = null;
    upcomingTrailRef.current = null;

    if (routeData?.polyline && routeData.polyline.length > 0) {
      const coords = routeData.polyline
        .map(p => [Number(p.lat), Number(p.lng)])
        .filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0);

      if (coords.length > 0) {
        // 1. Group route into continuous segments: Live Online (Blue) vs Offline Gap (Orange)
        const segments = [];
        let curSeg = {
          isOffline: Boolean(routeData.polyline[0]?.isOffline),
          coords: [coords[0]],
          startTime: routeData.polyline[0]?.time,
          endTime: routeData.polyline[0]?.time
        };

        for (let i = 1; i < coords.length; i++) {
          const pt = routeData.polyline[i];
          const isOff = Boolean(pt?.isOffline);
          const c = coords[i];

          if (isOff === curSeg.isOffline) {
            curSeg.coords.push(c);
            curSeg.endTime = pt?.time;
          } else {
            curSeg.coords.push(c); // Bridge point to prevent gaps
            segments.push(curSeg);
            curSeg = {
              isOffline: isOff,
              coords: [coords[i - 1], c],
              startTime: pt?.time,
              endTime: pt?.time
            };
          }
        }
        if (curSeg.coords.length >= 2) {
          segments.push(curSeg);
        }

        // 2. Draw segmented polylines (Blue = Live Online, Orange = Offline Gap)
        segments.forEach(seg => {
          if (seg.isOffline) {
            window.L.polyline(seg.coords, {
              color: '#ea580c',
              weight: 5.5,
              opacity: 0.95,
              dashArray: '8, 6',
              lineJoin: 'round',
              lineCap: 'round'
            })
            .bindPopup(`<b>🟠 Offline Gap (Signal Lost / GPS Inactive)</b><br/><span style="color:#64748b;font-size:11px;">Time: ${seg.startTime ? new Date(seg.startTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'} - ${seg.endTime ? new Date(seg.endTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</span>`)
            .addTo(markersGroupRef.current);
          } else {
            window.L.polyline(seg.coords, {
              color: '#2563eb',
              weight: 5.5,
              opacity: 0.95,
              lineJoin: 'round',
              lineCap: 'round'
            })
            .bindPopup(`<b>🔵 Live Online Tracking (GPS Active)</b><br/><span style="color:#64748b;font-size:11px;">Active: ${seg.startTime ? new Date(seg.startTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'} - ${seg.endTime ? new Date(seg.endTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</span>`)
            .addTo(markersGroupRef.current);
          }
        });

        // 3. Traveled dynamic glowing polyline (changes dynamically during playback)
        const traveledTrail = window.L.polyline([coords[0]], {
          color: routeData.polyline[0]?.isOffline ? '#ea580c' : '#2563eb',
          weight: 6,
          opacity: 0.95,
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(markersGroupRef.current);
        traveledTrailRef.current = traveledTrail;

        // 4. Upcoming route polyline (subtle dashed slate ahead of vehicle)
        const upcomingTrail = window.L.polyline(coords, {
          color: '#64748b',
          weight: 2.5,
          opacity: 0.5,
          dashArray: '4, 6',
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(markersGroupRef.current);
        upcomingTrailRef.current = upcomingTrail;

        // 5. Start Marker / Punch In Marker
        const isSinglePunch = coords.length === 1;
        const startIcon = window.L.divIcon({
          className: 'custom-start-marker',
          html: `<div style="background:#16a34a;color:#fff;border-radius:50%;width:${isSinglePunch ? 34 : 28}px;height:${isSinglePunch ? 34 : 28}px;display:flex;align-items:center;justify-content:center;font-size:${isSinglePunch ? 16 : 13}px;border:3px solid #ffffff;box-shadow:0 3px 10px rgba(22,163,74,0.6);">🚩</div>`,
          iconSize: [isSinglePunch ? 34 : 28, isSinglePunch ? 34 : 28],
          iconAnchor: [isSinglePunch ? 17 : 14, isSinglePunch ? 17 : 14]
        });
        const startMarker = window.L.marker(coords[0], { icon: startIcon })
          .bindPopup(`<b>🚩 ${isSinglePunch ? 'Attendance Punch In (On Duty)' : 'Route Start Point'}</b><br/><span style="color:#64748b;font-size:11px;">Time: ${routeData.polyline[0].time ? new Date(routeData.polyline[0].time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</span>`)
          .addTo(markersGroupRef.current);

        if (isSinglePunch) {
          startMarker.openPopup();
        }

        // 6. Punch Out Marker or End Marker
        const punchOutTimeline = (routeData.timeline || []).find(t => t.type === 'punch_out');
        if (punchOutTimeline && punchOutTimeline.lat && punchOutTimeline.lng) {
          const outIcon = window.L.divIcon({
            className: 'custom-punchout-marker',
            html: '<div style="background:#7c3aed;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2.5px solid #ffffff;box-shadow:0 3px 10px rgba(124,58,237,0.6);">🏁</div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          });
          const timeText = punchOutTimeline.startTime ? new Date(punchOutTimeline.startTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-';
          const locText = punchOutTimeline.locationName ? `<br/><span style="color:#64748b;font-size:11px;">📍 ${punchOutTimeline.locationName}</span>` : '';
          window.L.marker([Number(punchOutTimeline.lat), Number(punchOutTimeline.lng)], { icon: outIcon })
            .bindPopup(`<b>🏁 Attendance Punch Out (Shift Completed)</b><br/><span style="color:#64748b;font-size:11px;">Time: ${timeText}</span>${locText}`)
            .addTo(markersGroupRef.current);
        } else if (coords.length > 1) {
          const endIcon = window.L.divIcon({
            className: 'custom-end-marker',
            html: '<div style="background:#dc2626;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">🏁</div>',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });
          window.L.marker(coords[coords.length - 1], { icon: endIcon })
            .bindPopup(`<b>🏁 Latest Known Location</b><br/><span style="color:#64748b;font-size:11px;">Time: ${routeData.polyline[coords.length - 1].time ? new Date(routeData.polyline[coords.length - 1].time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</span>`)
            .addTo(markersGroupRef.current);
        }

        // 6. Client Visit Markers
        (routeData.timeline || []).filter(t => t.type === 'visit').forEach(vt => {
          if (!vt.lat || !vt.lng) return;
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
              <div style="color:#475569;margin-top:4px;">Check-In: <strong>${vt.checkInTime ? new Date(vt.checkInTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</strong></div>
              <div style="color:#475569;">Duration: <strong>${vt.durationMins || 0} mins</strong></div>
              ${vt.outcomeStatus ? `<div style="color:#16a34a;font-weight:600;margin-top:2px;font-size:11px;">Outcome: ${vt.outcomeStatus}</div>` : ''}
              ${vt.photos && vt.photos.length > 0 ? `<div style="margin-top:6px;"><img src="${vt.photos[0]}" style="width:100%;max-height:80px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;"/></div>` : ''}
            </div>
          `;
          window.L.marker([Number(vt.lat), Number(vt.lng)], { icon: visitIcon })
            .bindPopup(popupHtml)
            .addTo(markersGroupRef.current);
        });

        // 7. Stoppage Markers
        (routeData.timeline || []).filter(t => t.type === 'stoppage').forEach(st => {
          if (!st.lat || !st.lng) return;
          const stopIcon = window.L.divIcon({
            className: 'custom-stop-marker',
            html: '<div style="background:#f59e0b;color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(245,158,11,0.5);">⏸️</div>',
            iconSize: [26, 26],
            iconAnchor: [13, 13]
          });
          const locText = st.locationName ? `<br/><span style="color:#2563eb;font-weight:600;font-size:11px;">📍 ${st.locationName}</span>` : '';
          window.L.marker([Number(st.lat), Number(st.lng)], { icon: stopIcon })
            .bindPopup(`<div style="font-size:12px;"><strong>⏸️ Stoppage: ${st.durationMins} Mins</strong>${locText}<br/><span style="color:#64748b;">${new Date(st.startTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} - ${new Date(st.endTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</span></div>`)
            .addTo(markersGroupRef.current);
        });

        // 8. Animated Runner Marker with Rotatable Direction Arrow
        const initialBearing = coords.length > 1 ? calculateBearing(coords[0][0], coords[0][1], coords[1][0], coords[1][1]) : 0;
        const runnerIcon = window.L.divIcon({
          className: 'runner-marker-container',
          html: `
            <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
              <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(37,99,235,0.25); animation: pulse 1.6s infinite;"></div>
              <div id="runner-vehicle-rotator" style="transform: rotate(${Math.round(initialBearing)}deg); transition: transform 0.15s ease-out; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%); border-radius: 50%; border: 2.5px solid #ffffff; box-shadow: 0 4px 14px rgba(37,99,235,0.7);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 19 21 12 17 5 21 12 2" fill="#ffffff" />
                </svg>
              </div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22]
        });

        const runner = window.L.marker(coords[0], { icon: runnerIcon, zIndexOffset: 2000 })
          .bindPopup('<b>🚗 Live Playhead Runner</b>')
          .addTo(markersGroupRef.current);
        runnerMarkerRef.current = runner;

        // Auto Fit Bounds to road route
        try {
          if (coords.length === 1) {
            mapInstanceRef.current.setView(coords[0], 15);
          } else {
            mapInstanceRef.current.fitBounds(coords, { padding: [50, 50], maxZoom: 16 });
          }
        } catch (_) {}

        // Invalidate map size after bounds fitting to ensure crystal clear render
        setTimeout(() => {
          if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
        }, 150);
      }
    }
  }, [routeData]);

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
              if (activeMainTab === '360_PLAYBACK' && selectedUserId) {
                delete routeCacheRef.current[`${selectedUserId}_${selectedDate}`];
                loadEmployeeRoute(selectedUserId, selectedDate);
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
                {selectedEmployee?.hasPings && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }}></span>
                    Live Active
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
                    background: selectedEmployee?.hasPings ? '#dcfce7' : '#f1f5f9',
                    color: selectedEmployee?.hasPings ? '#15803d' : '#475569',
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
                        return (
                          <div
                            key={emp.user_id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUserId(emp.user_id);
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
                                background: emp.hasPings ? '#16a34a' : '#cbd5e1',
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
              const lp = routeData.lastPing;

              // --- Battery ---
              const battPct = lp?.battery_pct != null ? lp.battery_pct : null;
              const isCharging = Boolean(lp?.is_charging);
              const battColor = battPct == null ? '#64748b' : battPct <= 15 ? '#dc2626' : battPct <= 30 ? '#d97706' : '#16a34a';
              const battLabel = battPct != null ? `${battPct}%` : 'N/A';

              // --- Mobile Data / Network ---
              // is_offline_synced = true means that ping was recorded offline & synced later
              // If the last ping itself is offline-synced, data was off at that moment
              const isLastPingOfflineSync = Boolean(lp?.is_offline_synced);
              // Also infer from time gap: if last ping > 10 mins ago and not today's fresh ping, data may be off
              const lastPingMs = lp?.recorded_at ? new Date(lp.recorded_at).getTime() : null;
              const nowMs = Date.now();
              const gapMins = lastPingMs ? Math.floor((nowMs - lastPingMs) / 60000) : null;
              const isMobileDataOff = isLastPingOfflineSync || (gapMins != null && gapMins > 10);

              // --- GPS Status ---
              // GPS considered "off" if last ping gap > 10 minutes from now
              const isGpsOff = gapMins != null && gapMins > 10;
              const gpsOffSinceLabel = isGpsOff && lp?.recorded_at
                ? (() => {
                    const t = new Date(lp.recorded_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
                    const hrs = Math.floor(gapMins / 60);
                    const mins = gapMins % 60;
                    const ago = hrs > 0 ? `${hrs}h ${mins}m ago` : `${mins}m ago`;
                    return `Off since ${t} (${ago})`;
                  })()
                : null;

              return (
                <div style={{ padding: 14, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {/* Row 1: Distance + Visits */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 8 }}>
                    <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>TOTAL DISTANCE</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#2563eb' }}>{routeData.totalKm} km</div>
                    </div>
                    <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>CLIENT VISITS</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>{routeData.visitsCount} Completed</div>
                    </div>
                  </div>

                  {/* Row 2: Battery + Last Ping */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 8 }}>
                    {/* Battery — fixed accuracy (was using truthy check, 0% would show 85%) */}
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

                    {/* Last Ping */}
                    <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} /> LAST PING
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                        {lp?.recorded_at ? new Date(lp.recorded_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : 'Active'}
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Mobile Data + GPS Status */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {/* Mobile Data ON/OFF */}
                    <div style={{ background: isMobileDataOff ? '#fff7ed' : '#f0fdf4', padding: '8px 10px', borderRadius: 8, border: `1px solid ${isMobileDataOff ? '#fed7aa' : '#bbf7d0'}` }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {isMobileDataOff ? <WifiOff size={12} color="#ea580c" /> : <Wifi size={12} color="#16a34a" />}
                        MOBILE DATA
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: isMobileDataOff ? '#ea580c' : '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: isMobileDataOff ? '#ea580c' : '#16a34a', display: 'inline-block', flexShrink: 0 }} />
                        {isMobileDataOff ? 'Offline / No Data' : 'Online'}
                      </div>
                    </div>

                    {/* GPS Status */}
                    <div style={{ background: isGpsOff ? '#fff7ed' : '#f0fdf4', padding: '8px 10px', borderRadius: 8, border: `1px solid ${isGpsOff ? '#fed7aa' : '#bbf7d0'}` }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Satellite size={12} color={isGpsOff ? '#ea580c' : '#16a34a'} /> GPS STATUS
                      </div>
                      {isGpsOff ? (
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#ea580c', lineHeight: 1.3 }}>
                          🔴 {gpsOffSinceLabel || 'Signal Lost'}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', display: 'inline-block', flexShrink: 0 }} />
                          Active
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

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
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc', position: 'relative', minHeight: 'calc(100vh - 220px)', height: '100%' }}>
            {/* Interactive OpenStreetMap Leaflet Engine */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 'calc(100vh - 280px)', height: '100%', width: '100%' }}>
              {/* Leaflet DOM Container */}
              <div ref={mapContainerRef} style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 280px)', background: '#e2e8f0', zIndex: 1, position: 'relative' }} />

              {/* Clean Map Loading / Snapping Overlay */}
              {(!leafletReady || loadingRoute) && (
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
                    {!leafletReady ? 'Initializing 360° Interactive Radar Map...' : 'Snapping GPS Coordinates to Road Network (OSRM)...'}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Official Standard OpenStreetMap Navigation
                  </div>
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
                  right: 14,
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

              {/* Top Overlay Badge with Speed & Time (Placed cleanly to the right of the Zoom +/- controls) */}
              {routeData?.polyline && routeData.polyline.length > 0 && (
                <div style={{ position: 'absolute', top: 12, left: 56, zIndex: 500, background: 'rgba(255,255,255,0.96)', padding: '6px 14px', borderRadius: 8, border: '1px solid #cbd5e1', color: '#0f172a', fontSize: 12, fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🚗 Live Playhead:</span>
                  <span style={{ color: currentTelemetry?.isOffline ? '#ea580c' : '#2563eb' }}>
                    {currentTelemetry?.speed != null ? currentTelemetry.speed : (routeData.polyline[playbackIndex]?.speed ?? 0)} km/h
                  </span>
                  <span style={{ color: '#64748b' }}>•</span>
                  <span>
                    {currentTelemetry?.time ? new Date(currentTelemetry.time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : (routeData.polyline[playbackIndex]?.time ? new Date(routeData.polyline[playbackIndex].time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Start')}
                  </span>
                  {currentTelemetry?.isOffline ? (
                    <span style={{ marginLeft: 6, fontSize: 11, background: '#fff7ed', color: '#c2410c', padding: '2px 8px', borderRadius: 12, border: '1px solid #fed7aa', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ea580c' }}></span>
                      🟠 Offline Gap
                    </span>
                  ) : (
                    <span style={{ marginLeft: 6, fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 12, border: '1px solid #bfdbfe', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb' }}></span>
                      🔵 Live Online
                    </span>
                  )}
                  {routeData?.isRoadSnapped && (
                    <span style={{ marginLeft: 6, fontSize: 11, background: '#f8fafc', color: '#475569', padding: '2px 8px', borderRadius: 12, border: '1px solid #cbd5e1', fontWeight: 600 }}>
                      🛣️ Road-Snapped (OSRM)
                    </span>
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
                  fontWeight: 600
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 14, height: 4, background: '#2563eb', borderRadius: 2, display: 'inline-block' }}></span>
                    <span style={{ color: '#1e293b' }}>Live Online Route</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 14, height: 0, borderTop: '3px dashed #ea580c', display: 'inline-block' }}></span>
                    <span style={{ color: '#1e293b' }}>Offline Gap (Signal Lost)</span>
                  </div>
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
                    if (progressRef.current >= routeData.polyline.length - 1) {
                      progressRef.current = 0;
                      setPlaybackIndex(0);
                      updateRunnerPosition(0, routeData.polyline);
                    }
                  }
                  setIsPlaying(!isPlaying);
                }}
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
                onClick={() => {
                  progressRef.current = 0;
                  setPlaybackIndex(0);
                  setIsPlaying(false);
                  if (routeData?.polyline) {
                    updateRunnerPosition(0, routeData.polyline);
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
