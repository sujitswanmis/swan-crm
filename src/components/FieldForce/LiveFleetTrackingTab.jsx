'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Users, Radio, Signal, Clock, Battery, BatteryCharging,
  Navigation, Search, Filter, RefreshCw, Maximize2, Minimize2,
  Layers, MapPin, LocateFixed, Eye, ChevronDown, X, ArrowUpRight,
  ShieldCheck, AlertTriangle, Play, CheckCircle2, Check
} from 'lucide-react';
import { resolveLocationName } from '@/app/actions/liveTracking';

const IST_TIME_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true
});

const IST_DATE_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});

function formatISTTime(dateStr) {
  if (!dateStr) return 'Unavailable';
  const d = new Date(dateStr);
  return Number.isFinite(d.getTime()) ? IST_TIME_FMT.format(d).toUpperCase() : 'Unavailable';
}

function getMinutesAgo(dateStr, nowMs) {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t) || t <= 0) return null;
  return Math.max(0, Math.floor((nowMs - t) / 60000));
}

function formatAge(dateStr, nowMs) {
  const mins = getMinutesAgo(dateStr, nowMs);
  if (mins == null) return 'No GPS data';
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1m ago';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h${remMins > 0 ? ` ${remMins}m` : ''} ago`;
}

function extractCleanEmpCode(emp) {
  const rawCode = emp.emp_code || emp.employee_id || emp.code;
  if (rawCode && typeof rawCode === 'string') {
    const trimmed = rawCode.trim();
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){0,4}$/i.test(trimmed)) {
      return trimmed;
    }
  }
  const nameStr = String(emp.name || emp.emp_name || '');
  const m = nameStr.match(/[-–]\s*([0-9A-Z]{3,8})\s*$/i);
  if (m) return m[1];
  return '';
}

// Configurable Tracking Freshness Thresholds
const LIVE_THRESHOLD_MINS = 2;       // < 2 mins -> Live (Green)
const DELAYED_THRESHOLD_MINS = 10;   // 2 to 10 mins -> Delayed (Yellow)

function getEmployeeTrackingStatus(emp, nowMs) {
  const lastPing = emp.recorded_at || emp.last_ping;
  const mins = getMinutesAgo(lastPing, nowMs);

  if (emp.is_offline || emp.device_status === 'offline') {
    return {
      key: 'offline',
      label: 'Offline',
      color: '#dc2626',
      badgeBg: '#fef2f2',
      badgeBorder: '#fecaca',
      tone: 'critical'
    };
  }

  if (mins == null) {
    return {
      key: 'unavailable',
      label: 'GPS Unavailable',
      color: '#94a3b8',
      badgeBg: '#f1f5f9',
      badgeBorder: '#e2e8f0',
      tone: 'muted'
    };
  }

  if (mins <= LIVE_THRESHOLD_MINS) {
    return {
      key: 'live',
      label: 'Live Online',
      color: '#16a34a',
      badgeBg: '#f0fdf4',
      badgeBorder: '#bbf7d0',
      tone: 'healthy'
    };
  }

  if (mins <= DELAYED_THRESHOLD_MINS) {
    return {
      key: 'delayed',
      label: 'Delayed (2-10m)',
      color: '#d97706',
      badgeBg: '#fffbeb',
      badgeBorder: '#fde68a',
      tone: 'warning'
    };
  }

  return {
    key: 'stale',
    label: 'Stale (>10m)',
    color: '#64748b',
    badgeBg: '#f8fafc',
    badgeBorder: '#e2e8f0',
    tone: 'stale'
  };
}

export default function LiveFleetTrackingTab({
  radarEmployees = [],
  activeEmployeesList = [],
  selectedCompany = 'TNT00001',
  selectedBranch = '',
  tenantId = null,
  effectiveBranchAccess = null,
  adminCompanyFilter = 'All',
  loadingRadar = false,
  onRefresh = () => {},
  onSelectEmployeeForHistory = () => {},
  leafletReady = false,
  liveNowMs: initialLiveNowMs = Date.now()
}) {
  const [liveNowMs, setLiveNowMs] = useState(initialLiveNowMs);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [expandedCluster, setExpandedCluster] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, LIVE, DELAYED, STALE, MOVING, STATIONARY
  const [mapStyle, setMapStyle] = useState('street'); // street, satellite, light
  const [followLive, setFollowLive] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState(null);
  const [loadingAddress, setLoadingAddress] = useState(false);

  // Dropdown Open State
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Map DOM & Leaflet Refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const addressCacheRef = useRef(new Map());

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isPickerOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isPickerOpen]);

  // Keep liveNowMs ticking every 15s to update age labels
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveNowMs(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Background Auto-Refresh Polling every 30 seconds
  useEffect(() => {
    const pollInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      onRefresh({ silent: true });
    }, 30000);
    return () => clearInterval(pollInterval);
  }, [onRefresh]);

  // Combine Active Employees with Radar Live Coordinates
  const enrichedFleet = useMemo(() => {
    const radarMap = new Map();
    (radarEmployees || []).forEach(r => {
      const id = String(r.user_id || '').trim();
      if (id) radarMap.set(id, r);
    });

    return (activeEmployeesList || []).map(emp => {
      const id = String(emp.user_id || emp.id || '').trim();
      const live = radarMap.get(id);

      const lat = live?.latitude != null ? Number(live.latitude) : null;
      const lng = live?.longitude != null ? Number(live.longitude) : null;
      const hasValidCoords = lat != null && lng != null && !isNaN(lat) && !isNaN(lng) && (Math.abs(lat) > 0.01 || Math.abs(lng) > 0.01);
      const recordedAt = live?.recorded_at || emp.last_ping || null;
      const speed = live?.speed_kmh != null ? Number(live.speed_kmh) : null;
      const isMoving = live?.is_moving === true || (speed != null && speed >= 3);
      const cleanCode = extractCleanEmpCode(emp);

      return {
        ...emp,
        user_id: id,
        name: emp.name || emp.emp_name || 'Field Executive',
        code: cleanCode,
        phone: emp.phone || emp.emp_mobile || '',
        role: emp.role || 'Field Staff',
        branch_name: emp.branch_name || emp.work_location_name || 'Main Branch',
        latitude: hasValidCoords ? lat : null,
        longitude: hasValidCoords ? lng : null,
        hasValidCoords,
        recorded_at: recordedAt,
        speed_kmh: speed,
        is_moving: isMoving,
        battery_pct: live?.battery_pct != null ? Number(live.battery_pct) : emp.battery_pct,
        accuracy_meters: live?.accuracy_meters != null ? Number(live.accuracy_meters) : null,
        status: live?.status || 'ACTIVE'
      };
    });
  }, [activeEmployeesList, radarEmployees]);

  // Selected Employee Record
  const selectedEmployee = useMemo(() => {
    if (!selectedUserId) return null;
    return enrichedFleet.find(e => e.user_id === selectedUserId) || null;
  }, [enrichedFleet, selectedUserId]);

  // Resolve human-readable address on employee selection
  useEffect(() => {
    if (!selectedEmployee || !selectedEmployee.hasValidCoords) {
      setResolvedAddress(null);
      return;
    }

    const { latitude: lat, longitude: lng } = selectedEmployee;
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (addressCacheRef.current.has(cacheKey)) {
      setResolvedAddress(addressCacheRef.current.get(cacheKey));
      return;
    }

    let isMounted = true;
    setLoadingAddress(true);
    resolveLocationName(lat, lng, { fullAddress: true })
      .then(addr => {
        if (!isMounted) return;
        const clean = addr || `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        addressCacheRef.current.set(cacheKey, clean);
        setResolvedAddress(clean);
      })
      .catch(() => {
        if (isMounted) setResolvedAddress(`Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      })
      .finally(() => {
        if (isMounted) setLoadingAddress(false);
      });

    return () => { isMounted = false; };
  }, [selectedEmployee]);

  // Calculate High-Level Monitoring Metrics
  const metrics = useMemo(() => {
    let total = enrichedFleet.length;
    let liveCount = 0;
    let delayedCount = 0;
    let staleCount = 0;
    let movingCount = 0;
    let stationaryCount = 0;

    enrichedFleet.forEach(emp => {
      const status = getEmployeeTrackingStatus(emp, liveNowMs);
      if (status.key === 'live') liveCount++;
      else if (status.key === 'delayed') delayedCount++;
      else if (status.key === 'stale' || status.key === 'offline') staleCount++;

      if (emp.hasValidCoords) {
        if (emp.is_moving) movingCount++;
        else stationaryCount++;
      }
    });

    return {
      total,
      liveCount,
      delayedCount,
      staleCount,
      movingCount,
      stationaryCount
    };
  }, [enrichedFleet, liveNowMs]);

  // Filtered Options for Search Dropdown
  const dropdownFilteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return enrichedFleet.filter(emp => {
      if (q) {
        const nameMatch = emp.name.toLowerCase().includes(q);
        const codeMatch = String(emp.code).toLowerCase().includes(q);
        const phoneMatch = String(emp.phone).includes(q);
        if (!nameMatch && !codeMatch && !phoneMatch) return false;
      }

      const status = getEmployeeTrackingStatus(emp, liveNowMs);
      if (statusFilter === 'LIVE' && status.key !== 'live') return false;
      if (statusFilter === 'DELAYED' && status.key !== 'delayed') return false;
      if (statusFilter === 'STALE' && status.key !== 'stale' && status.key !== 'offline') return false;
      if (statusFilter === 'MOVING' && (!emp.hasValidCoords || !emp.is_moving)) return false;
      if (statusFilter === 'STATIONARY' && (!emp.hasValidCoords || emp.is_moving)) return false;

      return true;
    });
  }, [enrichedFleet, searchQuery, statusFilter, liveNowMs]);

  // Initialize Leaflet Map with Bounded Dimensions
  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current || mapInstanceRef.current || typeof window === 'undefined' || !window.L) {
      return;
    }

    const L = window.L;
    const defaultCenter = [30.9010, 75.8573]; // Punjab central hub default
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 12,
      zoomControl: false,
      attributionControl: false
    });

    // Custom Zoom Controls top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Tile Layer
    const tileUrl = mapStyle === 'satellite'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : mapStyle === 'light'
      ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    const tileLayer = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);
    map.tileLayerInstance = tileLayer;

    // Feature group for markers
    const markersGroup = L.featureGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    // Invalidate size immediately so tiles render without gray box
    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      try {
        map.remove();
        mapInstanceRef.current = null;
      } catch (_) {}
    };
  }, [leafletReady]);

  // Update Map Tile Layer on style change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || !map.tileLayerInstance) return;

    const L = window.L;
    const tileUrl = mapStyle === 'satellite'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : mapStyle === 'light'
      ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    map.removeLayer(map.tileLayerInstance);
    const newLayer = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);
    map.tileLayerInstance = newLayer;
  }, [mapStyle]);

  // Center Map whenever Selected Employee changes (preserving zoom without zooming out)
  useEffect(() => {
    if (!selectedEmployee || !mapInstanceRef.current) return;

    if (selectedEmployee.hasValidCoords) {
      const map = mapInstanceRef.current;
      map.invalidateSize();
      const currentZoom = map.getZoom();
      const targetZoom = Math.max(currentZoom || 16, 17.5);
      map.setView([selectedEmployee.latitude, selectedEmployee.longitude], targetZoom, { animate: true });
    }
  }, [selectedEmployee]);

  // Render & Update Fleet Markers on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer || !window.L) return;

    const L = window.L;
    layer.clearLayers();

    const employeesWithCoords = enrichedFleet.filter(e => e.hasValidCoords);
    if (employeesWithCoords.length === 0) return;

    const latLngBounds = [];

    // Group close coordinates into clusters
    const thresholdMeters = 40;
    const clusters = [];

    employeesWithCoords.forEach(emp => {
      let addedToCluster = false;
      for (const cl of clusters) {
        const d = map.distance([emp.latitude, emp.longitude], [cl.latitude, cl.longitude]);
        if (d <= thresholdMeters) {
          cl.items.push(emp);
          addedToCluster = true;
          break;
        }
      }
      if (!addedToCluster) {
        clusters.push({
          latitude: emp.latitude,
          longitude: emp.longitude,
          items: [emp]
        });
      }
    });

    clusters.forEach(cl => {
      latLngBounds.push([cl.latitude, cl.longitude]);

      if (cl.items.length > 1) {
        // Render Cluster Bubble (or Spiderfied Individual User Icons if clicked)
        const count = cl.items.length;
        const isClusterExpanded = Boolean(
          (expandedCluster && (
            (Math.abs(expandedCluster.latitude - cl.latitude) < 0.0005 && Math.abs(expandedCluster.longitude - cl.longitude) < 0.0005) ||
            cl.items.some(e => expandedCluster.items?.some(ex => ex.user_id === e.user_id))
          )) ||
          (selectedUserId && cl.items.some(e => e.user_id === selectedUserId))
        );
        const hasLive = cl.items.some(e => getEmployeeTrackingStatus(e, liveNowMs).key === 'live');
        const clusterBg = hasLive ? '#16a34a' : '#1e40af';

        if (isClusterExpanded) {
          // Center Collapse Badge
          const centerIcon = L.divIcon({
            className: 'custom-fleet-cluster-expanded',
            html: `
              <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                <div style="width:34px;height:34px;border-radius:50%;background:#0f172a;color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;border:2.5px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.35);">
                  ✕
                </div>
              </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
          });

          L.marker([cl.latitude, cl.longitude], { icon: centerIcon, zIndexOffset: 2500 })
            .on('click', () => {
              setExpandedCluster(null);
              setSelectedUserId(null);
            })
            .bindTooltip('✕ Click to close cluster', { direction: 'top', offset: [0, -14] })
            .addTo(layer);

          // Spiderfy all individual employee markers in a circle around center
          const N = cl.items.length;
          const radiusMeters = Math.max(32, Math.min(80, 24 + N * 3.5));

          cl.items.forEach((emp, idx) => {
            const angle = (2 * Math.PI * idx) / N - (Math.PI / 2);
            const latOffset = (radiusMeters / 111111) * Math.cos(angle);
            const lngOffset = (radiusMeters / (111111 * Math.cos((cl.latitude * Math.PI) / 180))) * Math.sin(angle);
            const empLat = cl.latitude + latOffset;
            const empLng = cl.longitude + lngOffset;

            // Connecting dashed line
            L.polyline([[cl.latitude, cl.longitude], [empLat, empLng]], {
              color: '#64748b',
              weight: 1.5,
              dashArray: '3, 4',
              opacity: 0.8
            }).addTo(layer);

            // Render Employee Marker Icon
            const isSelected = emp.user_id === selectedUserId;
            const status = getEmployeeTrackingStatus(emp, liveNowMs);
            const initials = (emp.name || 'FE').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
            const ageText = formatAge(emp.recorded_at, liveNowMs);

            const markerHtml = `
              <div style="position:relative;width:42px;height:42px;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                ${isSelected ? '<div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(37,99,235,0.4);animation:pulse 1.4s infinite;border:2px solid #2563eb;"></div>' : ''}
                ${status.key === 'live' ? `<div style="position:absolute;inset:-2px;border-radius:50%;background:${status.color};opacity:0.35;animation:pulse 1.6s infinite;"></div>` : ''}
                <div style="width:32px;height:32px;border-radius:50%;background:${status.color};color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11.5px;border:2.5px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.3);position:relative;">
                  ${initials}
                  ${emp.is_moving ? '<span style="position:absolute;bottom:-2px;right:-2px;background:#0f172a;color:#fff;border-radius:50%;font-size:7.5px;padding:2px;display:flex;align-items:center;justify-content:center;">🚗</span>' : ''}
                </div>
                <!-- Floating Label Pill -->
                <div style="position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#0f172a;color:#ffffff;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.7);display:flex;align-items:center;gap:4px;pointer-events:none;z-index:20;">
                  <span style="width:6px;height:6px;border-radius:50%;background:${status.color};display:inline-block;"></span>
                  <span>${emp.name.split(' ')[0]}</span>
                </div>
              </div>
            `;

            const icon = L.divIcon({
              className: 'custom-fleet-emp-marker',
              html: markerHtml,
              iconSize: [42, 42],
              iconAnchor: [21, 21]
            });

            L.marker([empLat, empLng], {
              icon,
              zIndexOffset: isSelected ? 3000 : 2200
            })
              .on('click', () => {
                setExpandedCluster(cl);
                setSelectedUserId(emp.user_id);
              })
              .bindTooltip(`<b>${emp.name}</b><br/><span style="color:${status.color};font-weight:700;">${status.label} • ${ageText}</span><br/><span style="color:#64748b;font-size:10.5px;">${emp.role || 'Field Staff'} • ${emp.branch_name || 'Main Branch'}</span>`, { direction: 'top', offset: [0, -18] })
              .addTo(layer);
          });
        } else {
          const clusterIcon = L.divIcon({
            className: 'custom-fleet-cluster',
            html: `
              <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                <div style="position:absolute;inset:0;border-radius:50%;background:${clusterBg};opacity:0.25;animation:pulse 1.8s infinite;"></div>
                <div style="width:32px;height:32px;border-radius:50%;background:${clusterBg};color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;border:2.5px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.35);">
                  ${count}
                </div>
              </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
          });

          L.marker([cl.latitude, cl.longitude], { icon: clusterIcon, zIndexOffset: 1200 })
            .on('click', () => {
              setExpandedCluster(cl);
              setSelectedUserId(null);
              const currentZoom = map.getZoom();
              map.setView([cl.latitude, cl.longitude], Math.max(currentZoom || 16, 17.5), { animate: true });
            })
            .bindTooltip(`📍 Cluster: ${count} Employees here (Click to view employees)`, { direction: 'top', offset: [0, -14] })
            .addTo(layer);
        }
      } else {
        // Individual Employee Marker
        const emp = cl.items[0];
        const isSelected = emp.user_id === selectedUserId;
        const status = getEmployeeTrackingStatus(emp, liveNowMs);
        const initials = (emp.name || 'FE').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        const ageText = formatAge(emp.recorded_at, liveNowMs);

        const markerHtml = `
          <div style="position:relative;width:42px;height:42px;display:flex;align-items:center;justify-content:center;cursor:pointer;">
            ${isSelected ? '<div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(37,99,235,0.4);animation:pulse 1.4s infinite;border:2px solid #2563eb;"></div>' : ''}
            ${status.key === 'live' ? `<div style="position:absolute;inset:-2px;border-radius:50%;background:${status.color};opacity:0.35;animation:pulse 1.6s infinite;"></div>` : ''}
            <div style="width:32px;height:32px;border-radius:50%;background:${status.color};color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11.5px;border:2.5px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.3);position:relative;">
              ${initials}
              ${emp.is_moving ? '<span style="position:absolute;bottom:-2px;right:-2px;background:#0f172a;color:#fff;border-radius:50%;font-size:7.5px;padding:2px;display:flex;align-items:center;justify-content:center;">🚗</span>' : ''}
            </div>
            <!-- Floating Label Pill -->
            <div style="position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#0f172a;color:#ffffff;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.7);display:flex;align-items:center;gap:4px;pointer-events:none;z-index:20;">
              <span style="width:6px;height:6px;border-radius:50%;background:${status.color};display:inline-block;"></span>
              <span>${emp.name.split(' ')[0]}</span>
            </div>
          </div>
        `;

        const icon = L.divIcon({
          className: 'custom-fleet-emp-marker',
          html: markerHtml,
          iconSize: [42, 42],
          iconAnchor: [21, 21]
        });

        L.marker([emp.latitude, emp.longitude], {
          icon,
          zIndexOffset: isSelected ? 2500 : (status.key === 'live' ? 1500 : 1000)
        })
          .on('click', () => {
            setSelectedUserId(emp.user_id);
            map.invalidateSize();
            map.setView([emp.latitude, emp.longitude], 16, { animate: true });
          })
          .bindTooltip(`<b>${emp.name}</b><br/><span style="color:${status.color};font-weight:700;">${status.label} • ${ageText}</span><br/><span style="color:#64748b;font-size:10.5px;">${emp.role || 'Field Staff'} • ${emp.branch_name || 'Main Branch'}</span>`, { direction: 'top', offset: [0, -18] })
          .addTo(layer);

        if (isSelected && followLive) {
          map.panTo([emp.latitude, emp.longitude]);
        }
      }
    });

    // Auto fit bounds on initial load if no user selected
    if (!selectedUserId && latLngBounds.length > 0 && !map._hasFittedInitialFleet) {
      try {
        map.fitBounds(latLngBounds, { padding: [50, 50], maxZoom: 15 });
        map._hasFittedInitialFleet = true;
      } catch (_) {}
    }
  }, [enrichedFleet, selectedUserId, liveNowMs, followLive, expandedCluster]);

  // Fit all visible employees bounds
  const handleFitAllEmployees = useCallback(() => {
    setSelectedUserId(null);
    const map = mapInstanceRef.current;
    if (!map) return;

    map.invalidateSize();
    const coords = enrichedFleet.filter(e => e.hasValidCoords).map(e => [e.latitude, e.longitude]);
    if (coords.length === 0) return;

    try {
      map.fitBounds(coords, { padding: [50, 50], maxZoom: 15 });
    } catch (_) {}
  }, [enrichedFleet]);

  // Locate Now Action Button Handler
  const handleLocateNow = useCallback(() => {
    if (!selectedEmployee) return;

    onRefresh({ silent: false });

    if (selectedEmployee.hasValidCoords && mapInstanceRef.current) {
      const map = mapInstanceRef.current;
      map.invalidateSize();
      map.setView([selectedEmployee.latitude, selectedEmployee.longitude], 16.5, { animate: true });
    }
  }, [selectedEmployee, onRefresh]);

  const selectedStatus = selectedEmployee ? getEmployeeTrackingStatus(selectedEmployee, liveNowMs) : null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', background: '#f8fafc', padding: '10px 18px', gap: '10px', boxSizing: 'border-box' }}>
      {/* 1. TOP MONITORING METRIC CARDS (COMPACT ROW) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '8px',
        alignItems: 'center'
      }}>
        {/* Total Field Staff */}
        <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Users size={12} color="#2563eb" /> Total Employees
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', marginTop: 1 }}>
            {metrics.total}
          </div>
        </div>

        {/* Live GPS (<2m) */}
        <div style={{ background: '#f0fdf4', padding: '8px 12px', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: '10.5px', color: '#16a34a', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', animation: 'pulse 1.4s infinite' }}></span>
            Live Online
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#15803d', marginTop: 1 }}>
            {metrics.liveCount}
          </div>
        </div>

        {/* Delayed GPS (2-10m) */}
        <div style={{ background: '#fffbeb', padding: '8px 12px', borderRadius: '10px', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: '10.5px', color: '#d97706', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Clock size={12} color="#d97706" /> Delayed (2-10m)
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#b45309', marginTop: 1 }}>
            {metrics.delayedCount}
          </div>
        </div>

        {/* Stale / Offline (>10m) */}
        <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertTriangle size={12} color="#64748b" /> Stale / Offline
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#475569', marginTop: 1 }}>
            {metrics.staleCount}
          </div>
        </div>

        {/* Currently Moving */}
        <div style={{ background: '#eff6ff', padding: '8px 12px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: '10.5px', color: '#2563eb', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Navigation size={12} color="#2563eb" /> Moving Now
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#1d4ed8', marginTop: 1 }}>
            {metrics.movingCount}
          </div>
        </div>

        {/* Stationary */}
        <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
            <MapPin size={12} color="#64748b" /> Stationary
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', marginTop: 1 }}>
            {metrics.stationaryCount}
          </div>
        </div>
      </div>

      {/* 2. SEARCH & SELECT DROPDOWN + ACTION CONTROLS BAR */}
      <div style={{
        background: '#ffffff',
        padding: '10px 14px',
        borderRadius: '10px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        position: 'relative',
        zIndex: 50
      }}>
        {/* Left: Search & Select Employee Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', position: 'relative' }} ref={dropdownRef}>
          {/* Custom Searchable Select Button */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsPickerOpen(prev => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                background: selectedEmployee ? '#eff6ff' : '#ffffff',
                color: selectedEmployee ? '#1d4ed8' : '#0f172a',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                minWidth: '240px',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, overflow: 'hidden' }}>
                {selectedEmployee ? (
                  <>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: selectedStatus?.color || '#2563eb', flexShrink: 0 }}></span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {selectedEmployee.name}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                      ({selectedEmployee.role || 'Field Staff'})
                    </span>
                  </>
                ) : (
                  <>
                    <Users size={15} color="#64748b" />
                    <span>All Field Employees ({enrichedFleet.length})</span>
                  </>
                )}
              </div>
              <ChevronDown size={14} style={{ transform: isPickerOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }} />
            </button>

            {/* Dropdown Menu Modal / Box */}
            {isPickerOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                width: '340px',
                background: '#ffffff',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                zIndex: 1000,
                overflow: 'hidden',
                animation: 'fadeIn 0.15s ease-out'
              }}>
                {/* Search Box inside Dropdown */}
                <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search employee name, code, phone..."
                    style={{
                      width: '100%',
                      padding: '6px 10px 6px 30px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      outline: 'none',
                      background: '#f8fafc'
                    }}
                  />
                </div>

                {/* Status Filter Chips inside Dropdown */}
                <div style={{ display: 'flex', gap: 4, padding: '6px 10px', borderBottom: '1px solid #f1f5f9', overflowX: 'auto' }}>
                  {[
                    ['ALL', 'All'],
                    ['LIVE', '🟢 Live'],
                    ['DELAYED', '🟡 Delayed'],
                    ['STALE', '⚪ Stale'],
                    ['MOVING', '🚗 Moving'],
                    ['STATIONARY', '⏸️ Stopped']
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStatusFilter(key)}
                      style={{
                        padding: '2px 7px',
                        borderRadius: '5px',
                        border: '1px solid',
                        borderColor: statusFilter === key ? '#2563eb' : '#e2e8f0',
                        background: statusFilter === key ? '#eff6ff' : '#ffffff',
                        color: statusFilter === key ? '#1d4ed8' : '#64748b',
                        fontSize: '10px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Option 1: All Employees (Fit Bounds) */}
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  <div
                    onClick={() => {
                      handleFitAllEmployees();
                      setIsPickerOpen(false);
                      setSearchQuery('');
                    }}
                    style={{
                      padding: '9px 12px',
                      borderBottom: '1px solid #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      background: !selectedUserId ? '#eff6ff' : 'transparent',
                      fontWeight: 700,
                      fontSize: '12.5px',
                      color: !selectedUserId ? '#1d4ed8' : '#0f172a'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Users size={15} color="#2563eb" />
                      <span>All Field Employees ({enrichedFleet.length})</span>
                    </div>
                    {!selectedUserId && <Check size={14} color="#2563eb" />}
                  </div>

                  {/* List of Filtered Employees */}
                  {dropdownFilteredEmployees.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '11.5px' }}>
                      No matching employees found.
                    </div>
                  ) : (
                    dropdownFilteredEmployees.map(emp => {
                      const isSel = emp.user_id === selectedUserId;
                      const status = getEmployeeTrackingStatus(emp, liveNowMs);
                      const age = formatAge(emp.recorded_at, liveNowMs);

                      return (
                        <div
                          key={emp.user_id}
                          onClick={() => {
                            setSelectedUserId(emp.user_id);
                            setIsPickerOpen(false);
                            setSearchQuery('');
                          }}
                          style={{
                            padding: '8px 12px',
                            borderBottom: '1px solid #f8fafc',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            background: isSel ? '#eff6ff' : '#ffffff',
                            transition: 'background 0.1s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: status.color,
                              flexShrink: 0
                            }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {emp.name}
                              </div>
                              <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                                {emp.role || 'Field Staff'} • {emp.branch_name || 'Main Branch'}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <span style={{ fontSize: '10px', color: status.color, fontWeight: 700 }}>
                              {status.key === 'live' ? 'Live' : age}
                            </span>
                            {isSel && <Check size={14} color="#2563eb" />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Fit All Button */}
          <button
            type="button"
            onClick={handleFitAllEmployees}
            style={{
              padding: '6px 12px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#0f172a',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5
            }}
          >
            <LocateFixed size={13} color="#2563eb" />
            <span>Fit All ({enrichedFleet.filter(e => e.hasValidCoords).length})</span>
          </button>
        </div>

        {/* Right: Map Layers + Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Map Layer Switcher */}
          <div style={{
            background: '#f1f5f9',
            borderRadius: '7px',
            padding: '2px',
            display: 'flex',
            border: '1px solid #cbd5e1'
          }}>
            {[
              ['street', 'Street'],
              ['satellite', 'Satellite'],
              ['light', 'Clean Light']
            ].map(([styleId, label]) => (
              <button
                key={styleId}
                type="button"
                onClick={() => setMapStyle(styleId)}
                style={{
                  padding: '4px 9px',
                  borderRadius: '5px',
                  border: 'none',
                  background: mapStyle === styleId ? '#2563eb' : 'transparent',
                  color: mapStyle === styleId ? '#ffffff' : '#64748b',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onRefresh({ silent: false })}
            disabled={loadingRadar}
            title="Refresh GPS Tracking Data"
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '7px',
              padding: '6px 10px',
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            <RefreshCw size={13} style={loadingRadar ? { animation: 'spin 0.8s linear infinite' } : undefined} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 3. BOUNDED COMPACT MAP CANVAS (NO INFINITE SCROLL) */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh - 280px)',
        minHeight: '480px',
        maxHeight: '580px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        background: '#e2e8f0'
      }}>
        {/* Leaflet Map DOM Element */}
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />

        {/* FLOATING CLUSTER ROSTER PANEL (When clicking cluster e.g. 13) */}
        {expandedCluster && !selectedEmployee && (
          <div style={{
            position: 'absolute',
            bottom: 14,
            left: 14,
            right: 14,
            maxWidth: '460px',
            maxHeight: '340px',
            zIndex: 1000,
            background: '#ffffff',
            borderRadius: '14px',
            boxShadow: '0 12px 36px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              color: '#ffffff',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'rgba(37,99,235,0.3)',
                  border: '1.5px solid #60a5fa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#ffffff'
                }}>
                  {expandedCluster.items.length}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800 }}>
                    {expandedCluster.items.length} Employees at this Location
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                    Click an employee icon to view full info & current location
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedCluster(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 4
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable list of employee icons & cards */}
            <div style={{ overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {expandedCluster.items.map(emp => {
                const status = getEmployeeTrackingStatus(emp, liveNowMs);
                const initials = (emp.name || 'FE').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
                return (
                  <div
                    key={emp.user_id}
                    onClick={() => {
                      setSelectedUserId(emp.user_id);
                      mapInstanceRef.current?.setView([emp.latitude, emp.longitude], 17, { animate: true });
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '9px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      cursor: 'pointer',
                      transition: 'all 0.12s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#93c5fd'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{
                        position: 'relative',
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: status.color,
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 12,
                        flexShrink: 0
                      }}>
                        {initials}
                        <span style={{
                          position: 'absolute',
                          bottom: -1,
                          right: -1,
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          background: status.key === 'live' ? '#22c55e' : '#94a3b8',
                          border: '1.5px solid #ffffff'
                        }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {emp.name}
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>
                          {emp.role || 'Field Staff'} • {emp.branch_name || 'Main Branch'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: status.color,
                        background: '#ffffff',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0'
                      }}>
                        {status.label}
                      </span>
                      <button
                        type="button"
                        style={{
                          background: '#2563eb',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        View Info →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FLOATING SELECTED EMPLOYEE LOCATION DETAILS CARD */}
        {selectedEmployee && (
          <div style={{
            position: 'absolute',
            bottom: 14,
            left: 14,
            right: 14,
            maxWidth: '500px',
            zIndex: 1000,
            background: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              color: '#ffffff',
              padding: '9px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: selectedStatus?.color || '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '12px'
                }}>
                  {(selectedEmployee.name || 'F').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800 }}>
                    {selectedEmployee.name}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                    {selectedEmployee.role || 'Field Staff'} • {selectedEmployee.branch_name || 'Main Branch'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {expandedCluster && (
                  <button
                    type="button"
                    onClick={() => setSelectedUserId(null)}
                    style={{
                      background: 'rgba(255,255,255,0.18)',
                      color: '#ffffff',
                      border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    ⬅️ Cluster ({expandedCluster.items.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedUserId(null)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div style={{ padding: '10px 12px' }}>
              {selectedEmployee.hasValidCoords ? (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                      Current Location
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', lineHeight: 1.35, marginTop: 1 }}>
                      {loadingAddress ? (
                        <span style={{ color: '#2563eb' }}>📍 Resolving address...</span>
                      ) : (
                        <span>📍 {resolvedAddress || `Coordinates: ${selectedEmployee.latitude.toFixed(5)}, ${selectedEmployee.longitude.toFixed(5)}`}</span>
                      )}
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 6,
                    background: '#f8fafc',
                    padding: '6px 8px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    marginBottom: 10
                  }}>
                    <div>
                      <div style={{ fontSize: '9.5px', color: '#64748b', fontWeight: 600 }}>LAST UPDATE</div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
                        {formatISTTime(selectedEmployee.recorded_at)}
                      </div>
                      <div style={{ fontSize: '9px', color: '#16a34a', fontWeight: 600 }}>
                        {formatAge(selectedEmployee.recorded_at, liveNowMs)}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '9.5px', color: '#64748b', fontWeight: 600 }}>MOVEMENT</div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: selectedEmployee.is_moving ? '#2563eb' : '#0f172a' }}>
                        {selectedEmployee.is_moving ? `🚗 ${Math.round(selectedEmployee.speed_kmh || 0)} km/h` : '⏸️ Stationary'}
                      </div>
                      <div style={{ fontSize: '9px', color: '#64748b' }}>
                        Acc: ±{selectedEmployee.accuracy_meters ? Math.round(selectedEmployee.accuracy_meters) : 15}m
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '9.5px', color: '#64748b', fontWeight: 600 }}>BATTERY</div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: selectedEmployee.battery_pct <= 20 ? '#dc2626' : '#16a34a' }}>
                        🔋 {selectedEmployee.battery_pct != null ? `${selectedEmployee.battery_pct}%` : 'Unavailable'}
                      </div>
                      <div style={{ fontSize: '9px', color: '#16a34a', fontWeight: 600 }}>
                        GPS Active
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{
                  padding: '10px 12px',
                  background: '#fffbeb',
                  borderRadius: '7px',
                  border: '1px solid #fde68a',
                  color: '#b45309',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7
                }}>
                  <AlertTriangle size={16} color="#d97706" />
                  <div>
                    <strong>GPS Location Unavailable</strong>
                    <div style={{ fontSize: '10.5px', fontWeight: 400 }}>
                      No valid GPS coordinates reported today.
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleLocateNow}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: '7px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4
                  }}
                >
                  <LocateFixed size={13} />
                  <span>Locate Now</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFollowLive(prev => !prev)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '7px',
                    border: `1.5px solid ${followLive ? '#16a34a' : '#cbd5e1'}`,
                    background: followLive ? '#f0fdf4' : '#ffffff',
                    color: followLive ? '#15803d' : '#475569',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Radio size={13} color={followLive ? '#16a34a' : '#64748b'} />
                  <span>Follow: {followLive ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectEmployeeForHistory(selectedEmployee.user_id)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Clock size={13} color="#64748b" />
                  <span>Route History</span>
                  <ArrowUpRight size={12} color="#94a3b8" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
