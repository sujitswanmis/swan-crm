'use client';

import MobileTableView from '@/components/common/MobileTableView';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock, Calendar, CheckCircle2, XCircle, AlertCircle, RefreshCw, Send,
  UserCheck, ShieldCheck, FileSpreadsheet, Filter, Search, ChevronLeft,
  ChevronRight, ArrowRight, Check, X, Building, MapPin, Laptop, Smartphone,
  Info, AlertTriangle, FileText, User, Users, Download, Volume2, VolumeX, Play, Sparkles, BookOpen,
  Award, Sliders, Settings, Plus, Edit2, Trash2, Navigation
} from 'lucide-react';
import DateRangePicker from '@/components/common/DateRangePicker';
import {
  getTodayAttendance,
  punchIn,
  punchOut,
  getMyAttendanceHistory,
  applyMissingAttendance,
  getMyRegularizationRequests,
  getHodPendingRequests,
  approveRegularizationRequest,
  rejectRegularizationRequest,
  bulkApproveRegularizationRequests,
  bulkRejectRegularizationRequests,
  getTeamAttendanceMaster,
  getTeamMonthlyMatrix,
  getEmployeeLeaveBalance,
  applyEmployeeLeave,
  getMyLeaveRequests,
  getHodPendingLeaveRequests,
  approveLeaveRequest,
  rejectLeaveRequest,
  grantEmployeeCPLCredit,
  updateTenantLeavePolicy,
  getAllTenantLeavePolicies,
  getTeamLeaveReport,
  getTenantAttendancePolicy,
  saveTenantAttendancePolicy
} from '@/app/actions/attendance';
import { 
  formatMinutesToHours, 
  getTodayDateString,
  evaluateMorningInPunch,
  evaluateEveningOutPunch,
  calculateMonthlyShortLeaveUsage,
  SHIFT_RULES
} from '@/utils/attendanceUtils';
import { getTenantBranches } from '@/app/actions/tenantBranches';
import { getCurrentGPSLocation, calculateDistanceMeters } from '@/utils/geoAttendance';
import { enqueueOfflineAction, canPerformOfflineAction } from '@/utils/offlineSync';
import { useTableColumnResize, ColumnResizer } from '@/utils/tableColumnResize';

const ATTENDANCE_TEAM_DEFAULT_COL_WIDTHS = {
  emp_code: 100,
  emp_name: 160,
  date: 120,
  email: 180,
  department: 130,
  in_time: 110,
  out_time: 110,
  duration: 110,
  status: 140,
  regularization: 130
};

const ATTENDANCE_TEAM_MIN_COL_WIDTHS = {
  emp_code: 75,
  emp_name: 110,
  date: 90,
  email: 120,
  department: 90,
  in_time: 80,
  out_time: 80,
  duration: 80,
  status: 100,
  regularization: 90
};

const ATTENDANCE_SHIFTS_DEFAULT_COL_WIDTHS = {
  code: 110,
  shift_name: 190,
  timings: 170,
  grace: 100,
  short_leave_1: 160,
  short_leave_2: 160,
  min_hours: 150,
  status: 120,
  actions: 140
};

const ATTENDANCE_SHIFTS_MIN_COL_WIDTHS = {
  code: 80,
  shift_name: 130,
  timings: 120,
  grace: 80,
  short_leave_1: 120,
  short_leave_2: 120,
  min_hours: 110,
  status: 90,
  actions: 90
};

const ATTENDANCE_GEOFENCE_DEFAULT_COL_WIDTHS = {
  name: 210,
  coordinates: 190,
  radius: 130,
  address: 230,
  status: 120,
  actions: 140
};

const ATTENDANCE_GEOFENCE_MIN_COL_WIDTHS = {
  name: 140,
  coordinates: 130,
  radius: 90,
  address: 140,
  status: 90,
  actions: 100
};

const ATTENDANCE_LEAVE_POLICIES_DEFAULT_COL_WIDTHS = {
  company: 210,
  cl_sl: 140,
  el: 200,
  cpl: 240,
  rules: 250,
  updated: 180,
  actions: 130
};

const ATTENDANCE_LEAVE_POLICIES_MIN_COL_WIDTHS = {
  company: 140,
  cl_sl: 100,
  el: 150,
  cpl: 170,
  rules: 180,
  updated: 130,
  actions: 100
};

const REASON_CATEGORIES = [
  'Forgot to Punch In / Out',
  'Client Onsite Visit',
  'Field Work / Official Duty',
  'System / Network / Browser Issue',
  'Biometric / Terminal Hardware Glitch',
  'Work From Home / Remote Approved',
  'Emergency Duty',
  'Other'
];

export const formatTimeIST = (timeInput, options = { hour: '2-digit', minute: '2-digit', hour12: true }) => {
  if (!timeInput) return '—';
  try {
    const d = new Date(timeInput);
    if (isNaN(d.getTime())) return String(timeInput);
    return d.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', ...options });
  } catch {
    return String(timeInput);
  }
};

export const formatDateIST = (dateInput, options = { day: '2-digit', month: 'short', year: 'numeric' }) => {
  if (!dateInput) return '—';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', ...options });
  } catch {
    return String(dateInput);
  }
};

export default function AttendanceModule({
  userRole = 'agent',
  userId = '',
  userName = 'User',
  userEmail = '',
  moduleAccess = {},
  initialSubTab = 'my_attendance',
  onSubTabChange = null,
  userCompany = '',
  tenantId = null,
  isMasterAdmin = false
}) {
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
  const isHodOrManager = isAdmin || userRole === 'manager' || userRole === 'hod' || moduleAccess?.attendance?.is_manager === true;

  const effectiveTenantId = useMemo(() => {
    if (tenantId && tenantId !== 'default' && tenantId !== '00000000-0000-0000-0000-000000000001') {
      return tenantId;
    }
    const comp = (userCompany || '').toLowerCase().trim();
    if (comp.includes('supuja')) return '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
    if (comp.includes('testing')) return '922d3e72-6588-457f-a562-4f1bdbf10d98';
    return tenantId || '00000000-0000-0000-0000-000000000001';
  }, [tenantId, userCompany]);

  // Active Sub-Tab: 'my_attendance' | 'monthly_logs' | 'regularization' | 'hod_approvals' | 'team_report'
  const [activeTab, setActiveTab] = useState(initialSubTab || 'my_attendance');

  // Dynamic Multi-Tenant & Multi-Shift Policy State
  const initialCompany = (userCompany && userCompany.toLowerCase().includes('supuja'))
    ? 'SuPuja Creations'
    : (userCompany && userCompany.toLowerCase().includes('testing'))
      ? 'Testing New Swan Group'
      : 'New Swan Group';
  const [selectedShiftPolicyCompany, setSelectedShiftPolicyCompany] = useState(initialCompany);
  const [selectedShiftPolicyBranch, setSelectedShiftPolicyBranch] = useState('All Branches');
  const [availablePolicyBranches, setAvailablePolicyBranches] = useState([]);
  const [tenantShiftPolicy, setTenantShiftPolicy] = useState(null);
  const [loadingShiftPolicy, setLoadingShiftPolicy] = useState(false);
  const [activeShiftIndex, setActiveShiftIndex] = useState(0);
  const [showShiftConfigModal, setShowShiftConfigModal] = useState(false);
  const [shiftConfigForm, setShiftConfigForm] = useState(null);
  const [savingShiftConfig, setSavingShiftConfig] = useState(false);
  const [shiftConfigToast, setShiftConfigToast] = useState(null);

  // Office Geofencing Policy State
  const [geofenceSettings, setGeofenceSettings] = useState({
    enable_geofence: false,
    require_gps: 'OFF',
    geofence_mode: 'STRICT_BLOCK',
    geofence_locations: []
  });
  const [savingGeofence, setSavingGeofence] = useState(false);
  const [geofenceToast, setGeofenceToast] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocationIndex, setEditingLocationIndex] = useState(null);
  const [locationForm, setLocationForm] = useState({
    name: '',
    latitude: '',
    longitude: '',
    radius_meters: 200,
    address: '',
    is_active: true
  });
  const [testingGps, setTestingGps] = useState(false);
  const [liveGpsResult, setLiveGpsResult] = useState(null);

  // Time formatter helper
  const formatTime12h = (time24) => {
    if (!time24) return '—';
    const parts = String(time24).split(':');
    const h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    if (isNaN(h)) return time24;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${m} ${period}`;
  };

  // Helper to resolve specific tenant ID by company name
  const getCompanyTenantId = (comp) => {
    const c = (comp || '').toLowerCase().trim();
    if (c.includes('supuja')) return '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
    if (c.includes('testing')) return '922d3e72-6588-457f-a562-4f1bdbf10d98';
    return '00000000-0000-0000-0000-000000000001';
  };

  // Fetch branches for selected company
  useEffect(() => {
    (async () => {
      try {
        const res = await getTenantBranches(selectedShiftPolicyCompany);
        const branchList = Array.isArray(res) ? res : (res?.branches || []);
        setAvailablePolicyBranches(branchList);
      } catch (e) {
        console.warn('Failed to load branches for shift policy:', e);
      }
    })();
  }, [selectedShiftPolicyCompany]);

  // Fetch dynamic shift policy from backend
  const fetchTenantShiftPolicy = async (comp = selectedShiftPolicyCompany, branch = selectedShiftPolicyBranch) => {
    setLoadingShiftPolicy(true);
    try {
      const targetTenantId = getCompanyTenantId(comp);
      const res = await getTenantAttendancePolicy(targetTenantId, comp, branch);
      if (res?.success && res.data) {
        setTenantShiftPolicy(res.data);
      }
    } catch (e) {
      console.warn('Failed to fetch tenant shift policy:', e);
    } finally {
      setLoadingShiftPolicy(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'shift_rules' || activeTab === 'geofencing') {
      fetchTenantShiftPolicy(selectedShiftPolicyCompany, selectedShiftPolicyBranch);
    } else if (activeTab === 'my_attendance') {
      fetchTenantShiftPolicy(initialCompany, 'All Branches');
    }
  }, [activeTab, selectedShiftPolicyCompany, selectedShiftPolicyBranch, initialCompany]);

  // Sync Geofence Settings with Loaded Policy
  useEffect(() => {
    if (tenantShiftPolicy) {
      setGeofenceSettings({
        enable_geofence: Boolean(tenantShiftPolicy.enable_geofence),
        require_gps: tenantShiftPolicy.require_gps || 'OFF',
        geofence_mode: tenantShiftPolicy.geofence_mode || 'STRICT_BLOCK',
        geofence_locations: Array.isArray(tenantShiftPolicy.geofence_locations) ? tenantShiftPolicy.geofence_locations : []
      });
    }
  }, [tenantShiftPolicy]);

  // Fetch policy when entering geofencing tab
  useEffect(() => {
    if (activeTab === 'geofencing') {
      fetchTenantShiftPolicy(selectedShiftPolicyCompany, selectedShiftPolicyBranch);
    }
  }, [activeTab, selectedShiftPolicyCompany, selectedShiftPolicyBranch]);

  // Save Geofence Policy
  const handleSaveGeofencePolicy = async () => {
    setSavingGeofence(true);
    setGeofenceToast(null);
    try {
      const targetTenantId = getCompanyTenantId(selectedShiftPolicyCompany);
      const updatedPolicyData = {
        ...(tenantShiftPolicy || {}),
        company_name: selectedShiftPolicyCompany,
        branch_name: selectedShiftPolicyBranch,
        enable_geofence: Boolean(geofenceSettings.enable_geofence),
        require_gps: geofenceSettings.require_gps,
        geofence_mode: geofenceSettings.geofence_mode,
        geofence_locations: geofenceSettings.geofence_locations || []
      };

      const res = await saveTenantAttendancePolicy(
        targetTenantId,
        selectedShiftPolicyCompany,
        updatedPolicyData,
        userName || 'Admin',
        selectedShiftPolicyBranch
      );

      if (res?.success) {
        setGeofenceToast({ type: 'success', message: '🎉 Office Geofencing Policy & GPS Rules saved successfully!' });
        await fetchTenantShiftPolicy(selectedShiftPolicyCompany, selectedShiftPolicyBranch);
        setTimeout(() => setGeofenceToast(null), 3000);
      } else {
        setGeofenceToast({ type: 'error', message: res?.error || 'Failed to save geofence policy' });
      }
    } catch (err) {
      setGeofenceToast({ type: 'error', message: err.message });
    } finally {
      setSavingGeofence(false);
    }
  };

  // Test Device Live GPS
  const handleTestLiveGPS = async () => {
    setTestingGps(true);
    setLiveGpsResult(null);
    try {
      const loc = await getCurrentGPSLocation({ timeout: 5000, enableHighAccuracy: true });
      if (!loc.success) {
        setLiveGpsResult({ success: false, error: loc.error || 'Failed to capture GPS coordinates' });
      } else {
        const activeLocations = (geofenceSettings.geofence_locations || []).filter(l => l.is_active !== false && l.latitude && l.longitude);
        let nearestOffice = null;
        let minDistance = Infinity;
        for (const office of activeLocations) {
          const d = calculateDistanceMeters(loc.latitude, loc.longitude, Number(office.latitude), Number(office.longitude));
          if (d < minDistance) {
            minDistance = d;
            nearestOffice = office;
          }
        }
        setLiveGpsResult({
          success: true,
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy,
          mapsUrl: loc.mapsUrl,
          nearestOffice,
          minDistance: minDistance === Infinity ? null : minDistance,
          isWithin: nearestOffice ? (minDistance <= Number(nearestOffice.radius_meters || 200)) : null
        });
      }
    } catch (err) {
      setLiveGpsResult({ success: false, error: err.message });
    } finally {
      setTestingGps(false);
    }
  };

  // Office Location Handlers
  const handleOpenAddLocation = () => {
    setEditingLocationIndex(null);
    setLocationForm({
      name: '',
      latitude: '',
      longitude: '',
      radius_meters: 200,
      address: '',
      is_active: true
    });
    setShowLocationModal(true);
  };

  const handleEditLocation = (index) => {
    setEditingLocationIndex(index);
    const loc = geofenceSettings.geofence_locations[index];
    setLocationForm({
      name: loc.name || '',
      latitude: loc.latitude || '',
      longitude: loc.longitude || '',
      radius_meters: loc.radius_meters || 200,
      address: loc.address || '',
      is_active: loc.is_active !== false
    });
    setShowLocationModal(true);
  };

  const handleSaveLocationForm = (e) => {
    e.preventDefault();
    if (!locationForm.name.trim() || !locationForm.latitude || !locationForm.longitude) {
      alert('Please provide Campus Name, Latitude, and Longitude');
      return;
    }
    const cleanLocation = {
      id: editingLocationIndex !== null ? (geofenceSettings.geofence_locations[editingLocationIndex]?.id || `loc_${Date.now()}`) : `loc_${Date.now()}`,
      name: locationForm.name.trim(),
      latitude: Number(locationForm.latitude),
      longitude: Number(locationForm.longitude),
      radius_meters: Number(locationForm.radius_meters || 200),
      address: locationForm.address.trim(),
      is_active: Boolean(locationForm.is_active)
    };

    let updatedLocations = [...(geofenceSettings.geofence_locations || [])];
    if (editingLocationIndex !== null) {
      updatedLocations[editingLocationIndex] = cleanLocation;
    } else {
      updatedLocations.push(cleanLocation);
    }

    setGeofenceSettings({
      ...geofenceSettings,
      geofence_locations: updatedLocations
    });
    setShowLocationModal(false);
  };

  const handleRemoveLocation = (index) => {
    if (!confirm('Are you sure you want to remove this office geofence location?')) return;
    const updated = (geofenceSettings.geofence_locations || []).filter((_, i) => i !== index);
    setGeofenceSettings({
      ...geofenceSettings,
      geofence_locations: updated
    });
  };

  const handleFetchCurrentCoordsForForm = async () => {
    try {
      const loc = await getCurrentGPSLocation({ timeout: 5000, enableHighAccuracy: true });
      if (loc.success) {
        setLocationForm(prev => ({
          ...prev,
          latitude: loc.latitude,
          longitude: loc.longitude
        }));
      } else {
        alert(loc.error || 'Failed to get current GPS location');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Active shifts list
  const activeShiftsList = useMemo(() => {
    if (tenantShiftPolicy?.shifts && Array.isArray(tenantShiftPolicy.shifts) && tenantShiftPolicy.shifts.length > 0) {
      return tenantShiftPolicy.shifts;
    }
    return [{
      id: 'default_shift',
      shift_code: 'GEN',
      shift_name: tenantShiftPolicy?.shift_name || 'Regular Shift',
      is_default: true,
      start_time: tenantShiftPolicy?.start_time || '09:00',
      end_time: tenantShiftPolicy?.end_time || '18:30',
      grace_minutes: tenantShiftPolicy?.grace_minutes ?? 5,
      short_leave_1_name: tenantShiftPolicy?.short_leave_1_name || '20-Minute Short Leave',
      short_leave_1_minutes: tenantShiftPolicy?.short_leave_1_minutes ?? 20,
      short_leave_1_quota: tenantShiftPolicy?.short_leave_1_quota ?? 2,
      short_leave_2_name: tenantShiftPolicy?.short_leave_2_name || '2-Hour Short Leave',
      short_leave_2_minutes: tenantShiftPolicy?.short_leave_2_minutes ?? 120,
      short_leave_2_quota: tenantShiftPolicy?.short_leave_2_quota ?? 2,
      min_half_day_minutes: tenantShiftPolicy?.min_half_day_minutes ?? 270,
      min_full_day_minutes: tenantShiftPolicy?.min_full_day_minutes ?? 450
    }];
  }, [tenantShiftPolicy]);

  const currentShift = activeShiftsList[activeShiftIndex] || activeShiftsList[0] || {};


  // Open Shift Config Modal
  const handleOpenShiftConfig = (indexToFocus = null) => {
    if (typeof indexToFocus === 'number' && indexToFocus >= 0) {
      setActiveShiftIndex(indexToFocus);
    }
    setShiftConfigForm({
      company_name: selectedShiftPolicyCompany,
      branch_name: selectedShiftPolicyBranch,
      shifts: JSON.parse(JSON.stringify(activeShiftsList))
    });
    setShowShiftConfigModal(true);
  };

  // Save Shift Policy
  const handleSaveShiftConfig = async (e) => {
    e.preventDefault();
    setSavingShiftConfig(true);
    setShiftConfigToast(null);
    try {
      const targetTenantId = getCompanyTenantId(selectedShiftPolicyCompany);
      const res = await saveTenantAttendancePolicy(
        targetTenantId,
        selectedShiftPolicyCompany,
        shiftConfigForm,
        userName || 'Admin',
        selectedShiftPolicyBranch
      );
      if (res?.success) {
        setShiftConfigToast({ type: 'success', message: '🎉 Shift Policy & Timings saved successfully!' });
        await fetchTenantShiftPolicy(selectedShiftPolicyCompany, selectedShiftPolicyBranch);
        setTimeout(() => setShowShiftConfigModal(false), 900);
      } else {
        setShiftConfigToast({ type: 'error', message: res?.error || 'Failed to save shift policy' });
      }
    } catch (err) {
      setShiftConfigToast({ type: 'error', message: err.message });
    } finally {
      setSavingShiftConfig(false);
    }
  };

  useEffect(() => {
    if (initialSubTab && initialSubTab !== activeTab) {
      setActiveTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleTabSelect = (tab) => {
    setActiveTab(tab);
    if (onSubTabChange) onSubTabChange(tab);
  };

  // Team Attendance Table Column Resizing
  const {
    colWidths: teamColWidths,
    resizingCol: teamResizingCol,
    handleResizeStart: handleTeamResizeStart,
    resetColWidth: resetTeamColWidth,
    getTotalTableWidth: getTeamTotalWidth
  } = useTableColumnResize(
    'attendance_team_master_col_widths',
    ATTENDANCE_TEAM_DEFAULT_COL_WIDTHS,
    ATTENDANCE_TEAM_MIN_COL_WIDTHS
  );

  // Office Geofence Locations Table Column Resizing
  const {
    colWidths: geofenceColWidths,
    resizingCol: geofenceResizingCol,
    handleResizeStart: handleGeofenceResizeStart,
    resetColWidth: resetGeofenceColWidth,
    getTotalTableWidth: getGeofenceTotalWidth
  } = useTableColumnResize(
    'attendance_geofence_col_widths',
    ATTENDANCE_GEOFENCE_DEFAULT_COL_WIDTHS,
    ATTENDANCE_GEOFENCE_MIN_COL_WIDTHS
  );

  // Configured Shifts Master Table Column Resizing
  const {
    colWidths: shiftColWidths,
    resizingCol: shiftResizingCol,
    handleResizeStart: handleShiftResizeStart,
    resetColWidth: resetShiftColWidth,
    getTotalTableWidth: getShiftTotalWidth
  } = useTableColumnResize(
    'attendance_configured_shifts_col_widths',
    ATTENDANCE_SHIFTS_DEFAULT_COL_WIDTHS,
    ATTENDANCE_SHIFTS_MIN_COL_WIDTHS
  );

  // Configured Company Leave Policies Master Table Column Resizing
  const {
    colWidths: leaveColWidths,
    resizingCol: leaveResizingCol,
    handleResizeStart: handleLeaveResizeStart,
    resetColWidth: resetLeaveColWidth,
    getTotalTableWidth: getLeaveTotalWidth
  } = useTableColumnResize(
    'attendance_leave_policies_master_col_widths',
    ATTENDANCE_LEAVE_POLICIES_DEFAULT_COL_WIDTHS,
    ATTENDANCE_LEAVE_POLICIES_MIN_COL_WIDTHS
  );

  // Today's punch state (with 0ms instant localStorage cache synced on mount)
  const [todayRecord, setTodayRecord] = useState(null);
  const [loadingToday, setLoadingToday] = useState(true);
  const [punchingIn, setPunchingIn] = useState(false);
  const [punchingOut, setPunchingOut] = useState(false);
  const [punchMessage, setPunchMessage] = useState(null);
  const [punchError, setPunchError] = useState(null);

  // Punch Confirm Modal state (prevents accidental punch)
  const [punchConfirm, setPunchConfirm] = useState(null); // null | 'IN' | 'OUT'

  // Helper to update todayRecord state + persist to localStorage
  const updateTodayRecord = (record) => {
    setTodayRecord(record);
    if (typeof window !== 'undefined' && userEmail) {
      try {
        if (record) {
          localStorage.setItem(`att_today_record_${userEmail}`, JSON.stringify(record));
        } else {
          localStorage.removeItem(`att_today_record_${userEmail}`);
        }
      } catch {}
    }
  };

  // Active Selected Shift for Daily Punch Station (Tab 1)
  const [selectedPunchShiftIndex, setSelectedPunchShiftIndex] = useState(0);

  const activePunchShift = useMemo(() => {
    if (todayRecord?.shift_name) {
      const match = activeShiftsList.find(s => s.shift_name === todayRecord.shift_name);
      if (match) return match;
    }
    if (activeShiftsList[selectedPunchShiftIndex]) {
      return activeShiftsList[selectedPunchShiftIndex];
    }
    const def = activeShiftsList.find(s => s.is_default);
    return def || activeShiftsList[0] || {};
  }, [todayRecord?.shift_name, activeShiftsList, selectedPunchShiftIndex]);

  const punchShiftGraceInfo = useMemo(() => {
    const s = activePunchShift || {};
    const startStr = s.start_time || '09:00';
    const endStr = s.end_time || '18:30';
    const graceMins = Number(s.grace_minutes ?? 5);

    const parts = startStr.split(':').map(Number);
    const startTotalMins = (parts[0] || 9) * 60 + (parts[1] || 0);
    const graceEndTotalMins = startTotalMins + graceMins;
    const gH = Math.floor(graceEndTotalMins / 60) % 24;
    const gM = graceEndTotalMins % 60;
    const graceEndFormatted = `${String(gH).padStart(2, '0')}:${String(gM).padStart(2, '0')}:59`;

    return {
      startTime12: formatTime12h(startStr),
      endTime12: formatTime12h(endStr),
      graceMins,
      graceRange: `${graceMins}m Grace (${startStr} - ${graceEndFormatted})`,
      sl1Name: s.short_leave_1_name || '20-Minute Short Leave',
      sl1Mins: Number(s.short_leave_1_minutes ?? 20),
      sl1Quota: Number(s.short_leave_1_quota ?? 2),
      sl2Name: s.short_leave_2_name || '2-Hour Short Leave',
      sl2Mins: Number(s.short_leave_2_minutes ?? 120),
      sl2Quota: Number(s.short_leave_2_quota ?? 2),
      minAbsentHours: formatMinutesToHours(s.min_half_day_minutes ?? 270),
      totalSlQuota: Number(tenantShiftPolicy?.short_leave_total_monthly ?? 4)
    };
  }, [activePunchShift, tenantShiftPolicy]);


  // Sync cache if userEmail changes or on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const todayStr = getTodayDateString();
      const cached = localStorage.getItem(`att_today_record_${userEmail || 'active'}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.attendance_date === todayStr) {
          setTodayRecord(parsed);
        }
      }
    } catch {}
  }, [userEmail]);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [liveDuration, setLiveDuration] = useState('0m');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [playingVoice, setPlayingVoice] = useState(false);
  const audioPlayerRef = useRef(null);

  // Preload speech synthesis voices on mount for instant 0ms trigger
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // Instant Web Audio Chime (0.005s synthesized pleasant tone)
  const playInstantChime = (type = 'in') => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'in') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      } else {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(587.33, ctx.currentTime + 0.12);
      }

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch {}
  };

  // Human Female Voice Announcement (Neural Human Voice 'Nova' with Fast Female Browser Fallback)
  const speakHumanFemaleAnnouncement = async (text, hindiUtteranceText) => {
    if (!voiceEnabled || typeof window === 'undefined') return;

    const speechMessage = hindiUtteranceText || text;
    setPlayingVoice(true);

    // 1. First Priority: Lifelike Studio Human Female Voice (OpenAI 'nova')
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: speechMessage, voice: 'nova' })
      });

      if (res.ok) {
        const blob = await res.blob();
        const audioUrl = URL.createObjectURL(blob);
        let audio = audioPlayerRef.current;
        if (!audio) {
          audio = new Audio();
          audioPlayerRef.current = audio;
        }
        audio.src = audioUrl;
        audio.onended = () => {
          setPlayingVoice(false);
          URL.revokeObjectURL(audioUrl);
        };
        audio.onerror = () => {
          setPlayingVoice(false);
          URL.revokeObjectURL(audioUrl);
        };
        const p = audio.play();
        if (p !== undefined) {
          await p;
        }
        return;
      }
    } catch (e) {
      console.warn('API Female TTS fallback to local speech:', e);
    }

    // 2. Fast Female Voice Fallback
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(speechMessage);
        utterance.rate = 0.95;
        utterance.pitch = 1.1; // Sweet pleasant female pitch
        utterance.lang = 'hi-IN';

        utterance.onend = () => setPlayingVoice(false);
        utterance.onerror = () => setPlayingVoice(false);

        const voices = window.speechSynthesis.getVoices() || [];
        const femaleVoice = voices.find(v => 
          (v.lang === 'hi-IN' || v.lang === 'hi_IN') && 
          (v.name.toLowerCase().includes('swara') || v.name.toLowerCase().includes('kalpana') || v.name.toLowerCase().includes('heera') || v.name.toLowerCase().includes('female'))
        ) || voices.find(v => 
          v.lang === 'hi-IN' || v.lang === 'hi_IN' || v.name.toLowerCase().includes('hindi')
        ) || voices.find(v => 
          v.lang.includes('en-IN') && (v.name.toLowerCase().includes('neerja') || v.name.toLowerCase().includes('female'))
        ) || voices.find(v => 
          v.name.toLowerCase().includes('zira') || v.name.toLowerCase().includes('female')
        ) || voices[0];

        if (femaleVoice) {
          utterance.voice = femaleVoice;
        }

        window.speechSynthesis.speak(utterance);
      } else {
        setPlayingVoice(false);
      }
    } catch (err) {
      setPlayingVoice(false);
      console.warn('Female voice error:', err);
    }
  };

  // Monthly Attendance History & Short Leave Usage
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear());
  const [historyMonth, setHistoryMonth] = useState(new Date().getMonth() + 1);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historySummary, setHistorySummary] = useState({});
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [shortLeaveUsage, setShortLeaveUsage] = useState({
    used_20_min: 0,
    remaining_20_min: 2,
    used_2_hr: 0,
    remaining_2_hr: 2,
    total_used: 0,
    total_remaining: 4
  });

  // Regularization Applications (User's own requests)
  const [myRequests, setMyRequests] = useState([]);
  const [loadingMyRequests, setLoadingMyRequests] = useState(false);

  // Apply Regularization Modal / Form State
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyForm, setApplyForm] = useState({
    attendanceDate: getTodayDateString(),
    requestType: 'BOTH', // 'MISSED_IN' | 'MISSED_OUT' | 'BOTH'
    requestedInTime: '09:30',
    requestedOutTime: '18:30',
    reasonType: 'Forgot to Punch In / Out',
    reasonDetails: '',
    assignedHodEmail: '',
    assignedHodName: ''
  });
  const [applyError, setApplyError] = useState(null);
  const [applySuccess, setApplySuccess] = useState(null);

  // Leave Management State
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [loadingLeaveBalance, setLoadingLeaveBalance] = useState(false);
  const [showApplyLeaveModal, setShowApplyLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: 'CL',
    from_date: getTodayDateString(),
    to_date: getTodayDateString(),
    reason: '',
    half_day_session: 'FIRST_HALF'
  });
  const [applyingLeave, setApplyingLeave] = useState(false);
  const [leaveToast, setLeaveToast] = useState(null);
  const [myLeaves, setMyLeaves] = useState([]);
  const [hodLeaveRequests, setHodLeaveRequests] = useState([]);
  const [loadingHodLeaves, setLoadingHodLeaves] = useState(false);
  const [hodApprovalSubTab, setHodApprovalSubTab] = useState('regularization'); // 'regularization' | 'leaves'
  const [hodLeaveFilter, setHodLeaveFilter] = useState('PENDING'); // 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'
  const [hodLeaveSearch, setHodLeaveSearch] = useState('');
  const [leaveActionModal, setLeaveActionModal] = useState(null); // { type: 'APPROVE' | 'REJECT', request: null, remarks: '' }
  const [processingLeaveAction, setProcessingLeaveAction] = useState(false);

  // Leave Adjustment in Monthly Payroll Report (User Requested!)
  const [adjustLeavesInReport, setAdjustLeavesInReport] = useState(true);
  const [showLeaveAdjustPromptModal, setShowLeaveAdjustPromptModal] = useState(false);

  // CPL (Compensatory Off) Grant Modal State
  const [cplGrantModal, setCplGrantModal] = useState({
    show: false,
    email: '',
    empName: '',
    days: 1.0,
    reason: '',
    workDate: getTodayDateString(),
    validityDays: 60
  });
  const [processingCplGrant, setProcessingCplGrant] = useState(false);

  // Leave Report & Ledger State
  const [teamLeaveReportData, setTeamLeaveReportData] = useState(null);
  const [loadingLeaveReport, setLoadingLeaveReport] = useState(false);
  const [leaveReportDept, setLeaveReportDept] = useState('All');
  const [leaveReportSearch, setLeaveReportSearch] = useState('');

  // Shift & Leave Policy Tabs State (Tab 6)
  const [policySubTab, setPolicySubTab] = useState('shift_policy'); // 'shift_policy' | 'leave_policy'
  const [leavePolicyForm, setLeavePolicyForm] = useState({
    cl_quota_annual: 8,
    sl_quota_annual: 6,
    el_quota_annual: 15,
    el_lockin_months: 12,
    el_validity_years: 3,
    el_encashable: true,
    enable_min_weekly_days_for_sunday: false,
    min_weekly_working_days: 3,
    enable_sandwich_rule: true,
    sandwich_mode: 'UNAPPROVED_ONLY',
    cpl_enabled: true,
    cpl_validity_days: 60,
    cpl_auto_sunday: true,
    cpl_min_hours_full: 8.0,
    cpl_min_hours_half: 4.5
  });
  const [savingLeavePolicy, setSavingLeavePolicy] = useState(false);
  const [selectedLeaveCompany, setSelectedLeaveCompany] = useState(initialCompany);
  const [loadingCompanyLeavePolicy, setLoadingCompanyLeavePolicy] = useState(false);
  const [allTenantLeavePolicies, setAllTenantLeavePolicies] = useState([]);
  const [loadingAllLeavePolicies, setLoadingAllLeavePolicies] = useState(false);

  // Fetch Leave Balance for Current Employee
  const fetchLeaveBalance = async () => {
    if (!userEmail) return;
    setLoadingLeaveBalance(true);
    try {
      const res = await getEmployeeLeaveBalance({ email: userEmail, tenantId: effectiveTenantId, userCompany });
      if (res?.success && res.data) {
        setLeaveBalance(res.data);
      }
    } catch (e) {
      console.warn('Failed to fetch leave balance:', e);
    } finally {
      setLoadingLeaveBalance(false);
    }
  };

  // Fetch Employee's own leaves
  const fetchMyLeaves = async () => {
    if (!userEmail) return;
    try {
      const res = await getMyLeaveRequests({ email: userEmail, tenantId: effectiveTenantId });
      if (res?.success && res.data) {
        setMyLeaves(res.data);
      }
    } catch (e) {}
  };

  // Fetch Pending Leaves for HOD
  const fetchHodLeaves = async () => {
    if (!isHodOrManager) return;
    setLoadingHodLeaves(true);
    try {
      const res = await getHodPendingLeaveRequests({ tenantId: effectiveTenantId, userCompany });
      if (res?.success && res.data) {
        setHodLeaveRequests(res.data);
      }
    } catch (e) {
      console.warn('Failed to fetch HOD leaves:', e);
    } finally {
      setLoadingHodLeaves(false);
    }
  };

  // Fetch Comprehensive Team Leave Report
  const fetchTeamLeaveReport = async () => {
    if (!isHodOrManager) return;
    setLoadingLeaveReport(true);
    try {
      const res = await getTeamLeaveReport({
        tenantId: effectiveTenantId,
        userCompany,
        department: leaveReportDept,
        year: matrixYear
      });
      if (res?.success && res.data) {
        setTeamLeaveReportData(res.data);
      }
    } catch (e) {
      console.warn('Failed to fetch team leave report:', e);
    } finally {
      setLoadingLeaveReport(false);
    }
  };

  // Fetch All Tenant Leave Policies (for Directory Table below Form)
  const fetchAllTenantLeavePolicies = async () => {
    setLoadingAllLeavePolicies(true);
    try {
      const res = await getAllTenantLeavePolicies();
      if (res?.success && Array.isArray(res.data)) {
        setAllTenantLeavePolicies(res.data);
      }
    } catch (e) {
      console.warn('Failed to fetch all tenant leave policies:', e);
    } finally {
      setLoadingAllLeavePolicies(false);
    }
  };

  // leavePolicyForm is now exclusively driven by selected company policy (fetchLeavePolicyForCompany)

  // Fetch leave policy for selected company (Multi-Tenant Master Admin)
  const fetchLeavePolicyForCompany = async (comp = selectedLeaveCompany) => {
    setLoadingCompanyLeavePolicy(true);
    try {
      const targetTenantId = getCompanyTenantId(comp);
      const res = await getTenantAttendancePolicy(targetTenantId, comp);
      if (res?.success && res.data?.leave_policy) {
        const lp = res.data.leave_policy;
        const cp = lp.cpl_policy || {};
        setLeavePolicyForm({
          cl_quota_annual: lp.cl_quota_annual ?? 8,
          sl_quota_annual: lp.sl_quota_annual ?? 6,
          el_quota_annual: lp.el_quota_annual ?? 15,
          el_lockin_months: lp.el_lockin_months ?? 12,
          el_validity_years: lp.el_validity_years ?? 3,
          el_encashable: lp.el_encashable !== false,
          enable_min_weekly_days_for_sunday: Boolean(lp.enable_min_weekly_days_for_sunday),
          min_weekly_working_days: lp.min_weekly_working_days ?? 3,
          enable_sandwich_rule: lp.enable_sandwich_rule !== false,
          sandwich_mode: lp.sandwich_mode || 'UNAPPROVED_ONLY',
          cpl_enabled: cp.enabled !== false,
          cpl_validity_days: cp.validity_days ?? 60,
          cpl_auto_sunday: cp.auto_credit_on_sunday_work !== false,
          cpl_min_hours_full: cp.min_work_hours_full_cpl ?? 8.0,
          cpl_min_hours_half: cp.min_work_hours_half_cpl ?? 4.5
        });
      }
    } catch (e) {
      console.warn('Failed to fetch company leave policy:', e);
    } finally {
      setLoadingCompanyLeavePolicy(false);
    }
  };

  // Fetch tenant leave policy when activeTab is 'leave_policy' or selectedLeaveCompany changes
  useEffect(() => {
    if (activeTab === 'leave_policy') {
      fetchLeavePolicyForCompany(selectedLeaveCompany);
    }
  }, [activeTab, selectedLeaveCompany]);

  // Handle Save Leave Policy (Admin/HOD)
  const handleSaveLeavePolicy = async (e) => {
    e.preventDefault();
    setSavingLeavePolicy(true);
    try {
      const payload = {
        cl_quota_annual: Number(leavePolicyForm.cl_quota_annual),
        sl_quota_annual: Number(leavePolicyForm.sl_quota_annual),
        el_quota_annual: Number(leavePolicyForm.el_quota_annual),
        el_lockin_months: Number(leavePolicyForm.el_lockin_months),
        el_validity_years: Number(leavePolicyForm.el_validity_years),
        el_encashable: Boolean(leavePolicyForm.el_encashable),
        enable_min_weekly_days_for_sunday: Boolean(leavePolicyForm.enable_min_weekly_days_for_sunday),
        min_weekly_working_days: Number(leavePolicyForm.min_weekly_working_days),
        enable_sandwich_rule: Boolean(leavePolicyForm.enable_sandwich_rule),
        sandwich_mode: leavePolicyForm.sandwich_mode,
        cpl_policy: {
          enabled: Boolean(leavePolicyForm.cpl_enabled),
          validity_days: Number(leavePolicyForm.cpl_validity_days),
          min_work_hours_full_cpl: Number(leavePolicyForm.cpl_min_hours_full),
          min_work_hours_half_cpl: Number(leavePolicyForm.cpl_min_hours_half),
          auto_credit_on_sunday_work: Boolean(leavePolicyForm.cpl_auto_sunday),
          max_cpl_accumulation: 10
        }
      };

      const targetTenantId = getCompanyTenantId(selectedLeaveCompany);
      const res = await updateTenantLeavePolicy({
        tenantId: targetTenantId,
        userCompany: selectedLeaveCompany,
        leavePolicy: payload,
        updatedBy: userEmail || userName || 'Admin'
      });

      if (res?.success) {
        setLeaveToast({ type: 'success', message: `✅ ${selectedLeaveCompany} Leave & CPL Policy updated successfully!` });
        await fetchLeavePolicyForCompany(selectedLeaveCompany);
        await fetchAllTenantLeavePolicies();
        fetchTeamLeaveReport();
        if (getCompanyTenantId(selectedLeaveCompany) === effectiveTenantId) {
          fetchLeaveBalance();
        }
      } else {
        setLeaveToast({ type: 'error', message: res?.error || 'Failed to update leave policy' });
      }
    } catch (err) {
      setLeaveToast({ type: 'error', message: err.message });
    } finally {
      setSavingLeavePolicy(false);
    }
  };

  // Handle Grant CPL Credit Submit
  const handleGrantCplSubmit = async (e) => {
    e.preventDefault();
    if (!cplGrantModal.email) {
      alert('Please select or enter employee email.');
      return;
    }
    setProcessingCplGrant(true);
    try {
      const res = await grantEmployeeCPLCredit({
        tenantId: effectiveTenantId,
        userCompany,
        email: cplGrantModal.email,
        empName: cplGrantModal.empName,
        days: cplGrantModal.days,
        reason: cplGrantModal.reason,
        workDate: cplGrantModal.workDate,
        validityDays: cplGrantModal.validityDays,
        grantedBy: userEmail,
        grantedByName: userName || userEmail
      });

      if (res?.success) {
        setLeaveToast({ type: 'success', message: res.message || 'CPL credited successfully!' });
        setCplGrantModal({ show: false, email: '', empName: '', days: 1.0, reason: '', workDate: getTodayDateString(), validityDays: 60 });
        fetchTeamLeaveReport();
        fetchLeaveBalance();
      } else {
        setLeaveToast({ type: 'error', message: res?.error || 'Failed to grant CPL' });
      }
    } catch (err) {
      setLeaveToast({ type: 'error', message: err.message });
    } finally {
      setProcessingCplGrant(false);
    }
  };

  // Export Leave Balances Roster CSV
  const handleExportLeaveRosterCSV = () => {
    if (!teamLeaveReportData || !teamLeaveReportData.roster || teamLeaveReportData.roster.length === 0) {
      alert('No leave report data available to export.');
      return;
    }

    const headers = [
      'Emp Code',
      'Employee Name',
      'Email',
      'Department',
      'Role',
      'Joining Date',
      'Tenure (Months)',
      'CL Quota',
      'CL Availed',
      'CL Balance',
      'SL Quota',
      'SL Availed',
      'SL Balance',
      'EL Quota',
      'EL Availed',
      'EL Balance',
      'EL Lock Status',
      'CPL Earned',
      'CPL Availed',
      'CPL Balance',
      'LWP Availed (Days)',
      'Total Leaves Taken'
    ];

    const rows = (teamLeaveReportData.roster || []).map(r => [
      `"${r.empCode || ''}"`,
      `"${r.empName || ''}"`,
      `"${r.email || ''}"`,
      `"${r.department || ''}"`,
      `"${r.role || ''}"`,
      `"${r.doj || '—'}"`,
      `"${r.tenureMonths || 0}"`,
      `"${r.cl?.quota ?? 8}"`,
      `"${r.cl?.availed ?? 0}"`,
      `"${r.cl?.balance ?? 8}"`,
      `"${r.sl?.quota ?? 6}"`,
      `"${r.sl?.availed ?? 0}"`,
      `"${r.sl?.balance ?? 6}"`,
      `"${r.el?.quota ?? 15}"`,
      `"${r.el?.availed ?? 0}"`,
      `"${r.el?.balance ?? 15}"`,
      `"${r.el?.status === 'LOCKED' ? 'LOCKED (1-Yr Probation)' : 'UNLOCKED'}"`,
      `"${r.cpl?.earned ?? 0}"`,
      `"${r.cpl?.availed ?? 0}"`,
      `"${r.cpl?.balance ?? 0}"`,
      `"${r.lwp?.availed ?? 0}"`,
      `"${r.totalLeavesAvailed ?? 0}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Leave_Balances_Ledger_Report_${teamLeaveReportData.year || new Date().getFullYear()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Leave History Audit CSV
  const handleExportLeaveHistoryCSV = () => {
    if (!teamLeaveReportData || !teamLeaveReportData.history || teamLeaveReportData.history.length === 0) {
      alert('No leave application history found.');
      return;
    }

    const headers = [
      'Request ID',
      'Employee Name',
      'Email',
      'Department',
      'Leave Type',
      'From Date',
      'To Date',
      'Total Days',
      'Reason',
      'Status',
      'Applied At (IST)',
      'Approver Name',
      'Approver Remarks',
      'Action At (IST)'
    ];

    const rows = (teamLeaveReportData.history || []).map(r => [
      `"${r.id || ''}"`,
      `"${r.emp_name || ''}"`,
      `"${r.email || ''}"`,
      `"${r.department || ''}"`,
      `"${r.leave_type || ''}"`,
      `"${r.from_date || ''}"`,
      `"${r.to_date || ''}"`,
      `"${r.total_days || 1}"`,
      `"${(r.reason || '').replace(/"/g, '""')}"`,
      `"${r.status || 'PENDING'}"`,
      `"${formatDateIST(r.applied_at, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}"`,
      `"${r.approver_name || '—'}"`,
      `"${(r.approver_remarks || '').replace(/"/g, '""')}"`,
      `"${r.action_at ? formatDateIST(r.action_at, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Leave_Applications_Audit_Report_${teamLeaveReportData.year || new Date().getFullYear()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle Apply Leave submit
  const handleApplyLeaveSubmit = async (e) => {
    e.preventDefault();
    setApplyingLeave(true);
    try {
      const res = await applyEmployeeLeave({
        userId,
        email: userEmail,
        empName: userName,
        empCode: '',
        department: '',
        tenantId: effectiveTenantId,
        userCompany,
        leaveType: leaveForm.leave_type,
        fromDate: leaveForm.from_date,
        toDate: leaveForm.to_date,
        reason: leaveForm.reason,
        halfDaySession: leaveForm.half_day_session
      });

      if (res?.success) {
        setLeaveToast({ type: 'success', message: res.message || 'Leave applied successfully!' });
        setShowApplyLeaveModal(false);
        fetchLeaveBalance();
        fetchMyLeaves();
        if (isHodOrManager) fetchHodLeaves();
      } else {
        setLeaveToast({ type: 'error', message: res?.error || 'Failed to apply leave' });
      }
    } catch (err) {
      setLeaveToast({ type: 'error', message: err?.message || 'Error submitting leave request' });
    } finally {
      setApplyingLeave(false);
    }
  };

  // Handle HOD Leave Approve / Reject
  const handleProcessLeaveAction = async () => {
    if (!leaveActionModal?.request) return;
    setProcessingLeaveAction(true);
    try {
      const { type, request, remarks } = leaveActionModal;
      let res;
      if (type === 'APPROVE') {
        res = await approveLeaveRequest({
          requestId: request.id,
          approverId: userId,
          approverName: userName || 'HOD',
          remarks
        });
      } else {
        res = await rejectLeaveRequest({
          requestId: request.id,
          approverId: userId,
          approverName: userName || 'HOD',
          remarks
        });
      }

      if (res?.success) {
        setLeaveToast({ type: 'success', message: res.message || `Leave request ${type.toLowerCase()}d successfully!` });
        setLeaveActionModal(null);
        fetchHodLeaves();
        fetchMyLeaves();
        fetchLeaveBalance();
        if (teamReportView === 'MONTHLY_MATRIX') {
          fetchTeamMonthlyMatrix();
        } else {
          fetchTeamMaster();
        }
      } else {
        setLeaveToast({ type: 'error', message: res?.error || `Failed to ${type.toLowerCase()} leave` });
      }
    } catch (err) {
      setLeaveToast({ type: 'error', message: err?.message || 'Action failed' });
    } finally {
      setProcessingLeaveAction(false);
    }
  };

  // HOD Approvals State
  const [hodRequests, setHodRequests] = useState([]);
  const [hodPendingCount, setHodPendingCount] = useState(0);
  const [loadingHodRequests, setLoadingHodRequests] = useState(false);
  const [hodStatusFilter, setHodStatusFilter] = useState('PENDING'); // 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'
  const [hodSearchQuery, setHodSearchQuery] = useState('');

  // Dynamic 0ms in-memory counts for HOD tabs
  const hodCounts = useMemo(() => {
    const all = (hodRequests || []).length;
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const r of (hodRequests || [])) {
      if (r.status === 'PENDING') pending++;
      else if (r.status === 'APPROVED') approved++;
      else if (r.status === 'REJECTED') rejected++;
    }
    return { all, pending, approved, rejected };
  }, [hodRequests]);

  // Dynamic in-memory counts for HOD leave applications
  const hodLeaveCounts = useMemo(() => {
    const all = (hodLeaveRequests || []).length;
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const r of (hodLeaveRequests || [])) {
      if (r.status === 'PENDING') pending++;
      else if (r.status === 'APPROVED') approved++;
      else if (r.status === 'REJECTED') rejected++;
    }
    return { all, pending, approved, rejected };
  }, [hodLeaveRequests]);

  // Filtered HOD leave requests
  const filteredHodLeaveRequests = useMemo(() => {
    let list = hodLeaveRequests || [];
    if (hodLeaveFilter !== 'ALL') {
      list = list.filter(r => r.status === hodLeaveFilter);
    }
    if (hodLeaveSearch.trim()) {
      const q = hodLeaveSearch.toLowerCase().trim();
      list = list.filter(r => 
        (r.emp_name && r.emp_name.toLowerCase().includes(q)) ||
        (r.emp_email && r.emp_email.toLowerCase().includes(q)) ||
        (r.leave_type && r.leave_type.toLowerCase().includes(q)) ||
        (r.reason && r.reason.toLowerCase().includes(q))
      );
    }
    return list;
  }, [hodLeaveRequests, hodLeaveFilter, hodLeaveSearch]);
  const [actionModal, setActionModal] = useState(null); // { type: 'APPROVE' | 'REJECT', request: obj }
  const [actionRemarks, setActionRemarks] = useState('');
  const [processingAction, setProcessingAction] = useState(false);
  const [selectedHodRequests, setSelectedHodRequests] = useState(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkActionModal, setBulkActionModal] = useState(null); // { type: 'APPROVE' | 'REJECT', count: number }
  const [bulkRemarks, setBulkRemarks] = useState('');

  // Team Master Attendance State (with Quick Date Presets)
  const [teamReportView, setTeamReportView] = useState('DAILY'); // 'DAILY' | 'MONTHLY_MATRIX'
  const [teamDatePreset, setTeamDatePreset] = useState('today');
  const [teamStartDate, setTeamStartDate] = useState(getTodayDateString());
  const [teamEndDate, setTeamEndDate] = useState(getTodayDateString());
  const [teamMasterDepartment, setTeamMasterDepartment] = useState('All');
  const [teamMasterData, setTeamMasterData] = useState({ records: [], summary: {} });
  const [loadingTeamMaster, setLoadingTeamMaster] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');

  // Monthly Matrix State
  const [matrixMonth, setMatrixMonth] = useState(new Date().getMonth() + 1);
  const [matrixYear, setMatrixYear] = useState(new Date().getFullYear());
  const [monthlyMatrixData, setMonthlyMatrixData] = useState({ rows: [], monthDates: [], summary: {} });
  const [loadingMonthlyMatrix, setLoadingMonthlyMatrix] = useState(false);

  // Dynamic Departments extracted from active records/matrix
  const availableDepartments = useMemo(() => {
    const deptSet = new Set();
    (teamMasterData.records || []).forEach(r => {
      if (r.department && r.department !== 'General') deptSet.add(r.department);
    });
    (monthlyMatrixData?.rows || []).forEach(r => {
      if (r.department && r.department !== 'General') deptSet.add(r.department);
    });
    const depts = Array.from(deptSet).sort();
    return ['All', ...depts, 'General'];
  }, [teamMasterData.records, monthlyMatrixData?.rows]);

  // 1. Live Clock Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Dynamic Real-Time Working Stopwatch Timer (Seconds Ticking)
  useEffect(() => {
    if (todayRecord?.in_time && !todayRecord?.out_time) {
      const inTimeMs = new Date(todayRecord.in_time).getTime();
      const diffMs = currentTime.getTime() - inTimeMs;
      if (diffMs >= 0) {
        const totalSeconds = Math.floor(diffMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        const hStr = String(hours).padStart(2, '0');
        const mStr = String(mins).padStart(2, '0');
        const sStr = String(secs).padStart(2, '0');
        setLiveDuration(`${hStr}h ${mStr}m ${sStr}s`);
      } else {
        setLiveDuration('00h 00m 00s');
      }
    } else if (todayRecord?.in_time && todayRecord?.out_time) {
      const mins = todayRecord.total_working_minutes || 0;
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      const hStr = String(hours).padStart(2, '0');
      const mStr = String(remMins).padStart(2, '0');
      setLiveDuration(`${hStr}h ${mStr}m`);
    } else {
      setLiveDuration('00h 00m 00s');
    }
  }, [currentTime, todayRecord]);

  // 3. Load Today's Attendance
  const fetchTodayAttendance = async () => {
    if (!userEmail) return;
    setLoadingToday(true);
    try {
      const res = await getTodayAttendance(userEmail, userId, effectiveTenantId, userCompany);
      if (res.success) {
        updateTodayRecord(res.data);
        if (res.monthlyUsage) setShortLeaveUsage(res.monthlyUsage);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingToday(false);
    }
  };

  // 4. Load Monthly History
  const fetchHistory = async () => {
    if (!userEmail) return;
    setLoadingHistory(true);
    try {
      const res = await getMyAttendanceHistory(userEmail, historyYear, historyMonth, effectiveTenantId, userCompany);
      if (res.success) {
        setHistoryRecords(res.records || []);
        setHistorySummary(res.summary || {});
        if (res.summary?.shortLeaveUsage) {
          setShortLeaveUsage(res.summary.shortLeaveUsage);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 5. Load User's Regularization Requests
  const fetchMyRequests = async () => {
    if (!userEmail) return;
    setLoadingMyRequests(true);
    try {
      const res = await getMyRegularizationRequests(userEmail, effectiveTenantId);
      if (res.success) {
        setMyRequests(res.requests || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMyRequests(false);
    }
  };

  // 6. Load HOD Requests (if manager/admin) - Instant 0ms Memory Caching
  const fetchHodRequests = async (showLoading = false) => {
    if (!isHodOrManager) return;
    if (showLoading || hodRequests.length === 0) {
      setLoadingHodRequests(true);
    }
    try {
      const res = await getHodPendingRequests({
        hodEmail: userEmail,
        userRole,
        statusFilter: 'ALL',
        tenantId: effectiveTenantId,
        company: userCompany
      });
      if (res.success) {
        setHodRequests(res.allRequests || res.requests || []);
        setHodPendingCount(res.pendingCount || 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHodRequests(false);
    }
  };

  // 7. Load Team Master Attendance (Single Date or Range via Quick Date Presets)
  const fetchTeamMaster = async () => {
    if (!isHodOrManager) return;
    setLoadingTeamMaster(true);
    try {
      const res = await getTeamAttendanceMaster({
        date: teamStartDate,
        startDate: teamStartDate,
        endDate: teamEndDate,
        department: teamMasterDepartment,
        tenantId: effectiveTenantId,
        company: userCompany
      });
      if (res.success) {
        setTeamMasterData({
          records: res.records || [],
          summary: res.summary || {},
          isRange: res.isRange
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTeamMaster(false);
    }
  };

  // Fetch Team Monthly Matrix
  const fetchTeamMonthlyMatrix = async () => {
    setLoadingMonthlyMatrix(true);
    try {
      const res = await getTeamMonthlyMatrix({
        year: matrixYear,
        month: matrixMonth,
        department: teamMasterDepartment,
        tenantId: effectiveTenantId,
        company: userCompany,
        adjustLeaves: adjustLeavesInReport
      });
      if (res.success) {
        setMonthlyMatrixData(res);
      }
    } catch (err) {
      console.error("Fetch Monthly Matrix Error:", err);
    } finally {
      setLoadingMonthlyMatrix(false);
    }
  };

  // Initial Load & on workspace/user change
  useEffect(() => {
    // Reset state to avoid stale flash when switching workspaces
    setHodRequests([]);
    setHodPendingCount(0);
    setTeamMasterData({ records: [], summary: {}, isRange: false });
    setMonthlyMatrixData({ rows: [], monthDates: [], summary: {} });

    fetchTodayAttendance();
    fetchHistory();
    fetchTenantShiftPolicy(initialCompany, 'All Branches');
    fetchMyRequests();
    fetchLeaveBalance();
    fetchMyLeaves();
    if (isHodOrManager) {
      fetchHodRequests();
      fetchHodLeaves();
      fetchTeamLeaveReport();
    }
  }, [userEmail, historyYear, historyMonth, effectiveTenantId, userCompany]);

  useEffect(() => {
    if (activeTab === 'monthly_logs') {
      fetchHistory();
    } else if (activeTab === 'hod_approvals') {
      fetchHodRequests();
    } else if (activeTab === 'team_report') {
      if (teamReportView === 'DAILY') {
        fetchTeamMaster();
      } else {
        fetchTeamMonthlyMatrix();
      }
    }
  }, [activeTab, teamReportView, teamDatePreset, teamStartDate, teamEndDate, teamMasterDepartment, matrixYear, matrixMonth, effectiveTenantId, userCompany, adjustLeavesInReport]);

  // Handle Punch In click — show confirm popup first
  const handlePunchIn = () => {
    if (todayRecord?.in_time) return; // already punched in
    setPunchConfirm('IN');
  };

  // Handle Punch Out click — show confirm popup first
  const handlePunchOut = () => {
    if (!todayRecord?.in_time || todayRecord?.out_time) return; // not punched in or already out
    setPunchConfirm('OUT');
  };

  // Confirmed Punch In (Instant Audio Feedback + Lifelike Human Female Voice + Shift Rules)
  const handleConfirmedPunchIn = async () => {
    setPunchConfirm(null);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const check = canPerformOfflineAction('attendancePunch');
      if (!check.allowed) {
        alert(check.reason);
        setPunchError(check.reason);
        return;
      }
    }

    // 1. INSTANT (0ms) Audio Chime + Human Female Voice Trigger
    playInstantChime('in');

    const inDate = new Date();
    const inTimeFormatted = formatTimeIST(inDate);
    
    // Evaluate shift rules immediately on client for instant voice feedback
    const evaluation = evaluateMorningInPunch(inDate, shortLeaveUsage, userName, activePunchShift || tenantShiftPolicy);

    // Optimistic record update so the Live Stopwatch Timer starts ticking IMMEDIATELY (0ms)
    const optimisticRecord = {
      id: todayRecord?.id || `temp-${Date.now()}`,
      emp_name: userName,
      email: userEmail,
      attendance_date: getTodayDateString(),
      in_time: inDate.toISOString(),
      out_time: null,
      total_working_minutes: 0,
      status: evaluation.status,
      short_leave_type: evaluation.short_leave_type,
      is_grace_applied: evaluation.is_grace_applied,
      remarks: evaluation.remarks
    };
    updateTodayRecord(optimisticRecord);
    setLiveDuration('00h 00m 01s');

    speakHumanFemaleAnnouncement(
      `Welcome ${userName}. Your punch in time is ${inTimeFormatted}. Shift: ${activePunchShift.shift_name || "Regular Shift"}. ${evaluation.ruleTitle}`,
      evaluation.voiceMessageHindi
    );

    setPunchError(null);
    setPunchMessage(null);
    setPunchingIn(true);

    // 2. Parallel Background Database Persistence
    let punchLocation = 'Office Web Terminal';
    try {
      try {
        const gps = await getCurrentGPSLocation();
        if (gps.success) {
          punchLocation = `GPS (${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)})`;
        }
      } catch (e) {}

      const res = await punchIn({
        email: userEmail,
        userId,
        empName: userName,
        userCompany,
        shiftName: activePunchShift.shift_name || null,
        location: punchLocation,
        method: punchLocation.startsWith('GPS') ? 'GPS_PUNCH' : 'WEB_PUNCH',
        tenantId: effectiveTenantId
      });
      if (res.success) {
        setPunchMessage(res.message);
        if (res.data) updateTodayRecord(res.data);
        if (res.monthlyUsage) setShortLeaveUsage(res.monthlyUsage);
        fetchHistory(); // Refresh monthly history
      } else {
        if (res.alreadyPunched && res.data) {
          updateTodayRecord(res.data);
          setPunchMessage(res.error);
        } else {
          setPunchError(res.error);
          fetchTodayAttendance();
        }
      }
    } catch (err) {
      console.warn('Network punch-in failed, queueing offline:', err);
      const check = canPerformOfflineAction('attendancePunch');
      if (!check.allowed) {
        alert(check.reason);
        setPunchError(check.reason);
        return;
      }
      await enqueueOfflineAction('create', 'attendance', {
        email: userEmail,
        userId,
        empName: userName,
        attendance_date: getTodayDateString(),
        in_time: inDate.toISOString(),
        in_location: punchLocation,
        in_method: punchLocation.startsWith('GPS') ? 'GPS_PUNCH' : 'WEB_PUNCH',
        status: evaluation.status,
        remarks: evaluation.remarks
      });
      setPunchMessage('⚡ Offline Punch Saved to Device! Will sync to server when online.');
    } finally {
      setPunchingIn(false);
    }
  };

  // Confirmed Punch Out (Instant Audio Feedback + Lifelike Human Female Voice + Shift Rules)
  const handleConfirmedPunchOut = async () => {
    setPunchConfirm(null);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const check = canPerformOfflineAction('attendancePunch');
      if (!check.allowed) {
        alert(check.reason);
        setPunchError(check.reason);
        return;
      }
    }

    // 1. INSTANT (0ms) Audio Chime + Human Female Voice Trigger
    playInstantChime('out');

    const outDate = new Date();
    const evaluation = evaluateEveningOutPunch(outDate, todayRecord?.in_time, todayRecord, shortLeaveUsage, userName, activePunchShift || tenantShiftPolicy);

    // Optimistic punch out update
    const optimisticRecord = {
      ...(todayRecord || {}),
      out_time: outDate.toISOString(),
      total_working_minutes: evaluation.total_working_minutes,
      status: evaluation.status,
      short_leave_type: evaluation.short_leave_type,
      remarks: evaluation.remarks
    };
    updateTodayRecord(optimisticRecord);

    speakHumanFemaleAnnouncement(
      `Thank you ${userName}. ${evaluation.ruleTitle}`,
      evaluation.voiceMessageHindi
    );

    setPunchError(null);
    setPunchMessage(null);
    setPunchingOut(true);

    let punchLocation = 'Office Web Terminal';
    try {
      const gps = await getCurrentGPSLocation();
      if (gps.success) {
        punchLocation = `GPS (${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)})`;
      }
    } catch (e) {}

    // 2. Parallel Background Database Persistence
    try {
      const res = await punchOut({
        email: userEmail,
        userId,
        empName: userName,
        userCompany,
        location: punchLocation,
        method: punchLocation.startsWith('GPS') ? 'GPS_PUNCH' : 'WEB_PUNCH',
        tenantId: effectiveTenantId
      });
      if (res.success) {
        setPunchMessage(res.message);
        if (res.data) updateTodayRecord(res.data);
        if (res.monthlyUsage) setShortLeaveUsage(res.monthlyUsage);
        fetchHistory(); // Refresh monthly history
      } else {
        if (res.alreadyPunchedOut && res.data) {
          updateTodayRecord(res.data);
          setPunchMessage(res.error);
        } else {
          setPunchError(res.error);
          fetchTodayAttendance();
        }
      }
    } catch (err) {
      console.warn('Network punch-out failed, queueing offline:', err);
      const check = canPerformOfflineAction('attendancePunch');
      if (!check.allowed) {
        alert(check.reason);
        setPunchError(check.reason);
        return;
      }
      await enqueueOfflineAction('create', 'attendance', {
        email: userEmail,
        userId,
        empName: userName,
        attendance_date: getTodayDateString(),
        out_time: outDate.toISOString(),
        out_location: punchLocation,
        out_method: punchLocation.startsWith('GPS') ? 'GPS_PUNCH' : 'WEB_PUNCH',
        total_working_minutes: evaluation.total_working_minutes,
        status: evaluation.status,
        remarks: evaluation.remarks
      });
      setPunchMessage('⚡ Offline Punch-Out Saved to Device! Will sync to server when online.');
    } finally {
      setPunchingOut(false);
    }
  };

  // Open Regularization modal pre-filled for a specific date
  const handleOpenRegularizeForDate = (dateStr, existingRow = null) => {
    setApplyForm({
      attendanceDate: dateStr || getTodayDateString(),
      requestType: existingRow?.in_time && !existingRow?.out_time ? 'MISSED_OUT' : (!existingRow?.in_time && existingRow?.out_time ? 'MISSED_IN' : 'BOTH'),
      requestedInTime: existingRow?.in_time ? formatTimeIST(existingRow.in_time, { hour12: false, hour: '2-digit', minute: '2-digit' }) : '09:00',
      requestedOutTime: existingRow?.out_time ? formatTimeIST(existingRow.out_time, { hour12: false, hour: '2-digit', minute: '2-digit' }) : '18:30',
      reasonType: 'Forgot to Punch In / Out',
      reasonDetails: '',
      assignedHodEmail: '',
      assignedHodName: ''
    });
    setApplyError(null);
    setApplySuccess(null);
    setShowApplyModal(true);
  };

  // Submit Regularization Form
  const handleSubmitRegularization = async (e) => {
    e.preventDefault();
    if (!applyForm.reasonDetails || applyForm.reasonDetails.trim() === '') {
      setApplyError('Please provide explanation / remarks for the missing punch.');
      return;
    }
    setApplying(true);
    setApplyError(null);
    setApplySuccess(null);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const check = canPerformOfflineAction('attendanceRegularization');
      if (!check.allowed) {
        setApplyError(check.reason);
        setApplying(false);
        return;
      }
      const regPayload = {
        id: `local_reg_${Date.now()}`,
        email: userEmail,
        userId,
        empName: userName,
        attendanceDate: applyForm.attendanceDate,
        requestType: applyForm.requestType,
        requestedInTime: applyForm.requestedInTime,
        requestedOutTime: applyForm.requestedOutTime,
        reasonType: applyForm.reasonType,
        reasonDetails: applyForm.reasonDetails,
        assignedHodEmail: applyForm.assignedHodEmail,
        assignedHodName: applyForm.assignedHodName,
        status: 'PENDING',
        created_at: new Date().toISOString()
      };
      await enqueueOfflineAction('create', 'attendance_regularize', regPayload);
      setMyRequests(prev => [regPayload, ...prev]);
      setApplySuccess('⚡ Offline Mode: Missing punch request saved to device! Will sync when internet is connected.');
      setTimeout(() => {
        setShowApplyModal(false);
        setApplySuccess(null);
      }, 2000);
      setApplying(false);
      return;
    }

    try {
      const res = await applyMissingAttendance({
        email: userEmail,
        userId,
        empName: userName,
        attendanceDate: applyForm.attendanceDate,
        requestType: applyForm.requestType,
        requestedInTime: applyForm.requestedInTime,
        requestedOutTime: applyForm.requestedOutTime,
        reasonType: applyForm.reasonType,
        reasonDetails: applyForm.reasonDetails,
        assignedHodEmail: applyForm.assignedHodEmail,
        assignedHodName: applyForm.assignedHodName,
        tenantId: effectiveTenantId
      });

      if (res.success) {
        setApplySuccess(res.message);
        fetchMyRequests();
        if (isHodOrManager) fetchHodRequests();
        setTimeout(() => {
          setShowApplyModal(false);
          setApplySuccess(null);
        }, 1800);
      } else {
        setApplyError(res.error);
      }
    } catch (err) {
      console.warn('Network applyMissingAttendance failed, checking offline fallback:', err);
      const check = canPerformOfflineAction('attendanceRegularization');
      if (check.allowed) {
        const regPayload = {
          id: `local_reg_${Date.now()}`,
          email: userEmail,
          userId,
          empName: userName,
          attendanceDate: applyForm.attendanceDate,
          requestType: applyForm.requestType,
          requestedInTime: applyForm.requestedInTime,
          requestedOutTime: applyForm.requestedOutTime,
          reasonType: applyForm.reasonType,
          reasonDetails: applyForm.reasonDetails,
          assignedHodEmail: applyForm.assignedHodEmail,
          assignedHodName: applyForm.assignedHodName,
          status: 'PENDING',
          created_at: new Date().toISOString()
        };
        await enqueueOfflineAction('create', 'attendance_regularize', regPayload);
        setMyRequests(prev => [regPayload, ...prev]);
        setApplySuccess('⚡ Network Issue: Missing punch request saved to device! Will sync automatically.');
        setTimeout(() => {
          setShowApplyModal(false);
          setApplySuccess(null);
        }, 2000);
      } else {
        setApplyError(err.message);
      }
    } finally {
      setApplying(false);
    }
  };

  // Handle HOD Approve or Reject
  const handleExecuteHodAction = async () => {
    if (!actionModal) return;
    setProcessingAction(true);

    try {
      if (actionModal.type === 'APPROVE') {
        const res = await approveRegularizationRequest({
          requestId: actionModal.request.id,
          actionByName: userName,
          actionByEmail: userEmail,
          actionRemarks: actionRemarks || 'Approved',
          tenantId: effectiveTenantId
        });
        if (res.success) {
          setActionModal(null);
          setActionRemarks('');
          fetchHodRequests();
          fetchHistory();
          fetchTodayAttendance();
        } else {
          alert('Approval error: ' + res.error);
        }
      } else if (actionModal.type === 'REJECT') {
        if (!actionRemarks || actionRemarks.trim() === '') {
          alert('Please enter reason for rejection.');
          setProcessingAction(false);
          return;
        }
        const res = await rejectRegularizationRequest({
          requestId: actionModal.request.id,
          actionByName: userName,
          actionByEmail: userEmail,
          actionRemarks,
          tenantId: effectiveTenantId
        });
        if (res.success) {
          setActionModal(null);
          setActionRemarks('');
          fetchHodRequests();
        } else {
          alert('Rejection error: ' + res.error);
        }
      }
    } catch (err) {
      alert('Action error: ' + err.message);
    } finally {
      setProcessingAction(false);
    }
  };

  // Toggle selection for a single request
  const toggleSelectHodRequest = (reqId) => {
    setSelectedHodRequests(prev => {
      const next = new Set(prev);
      if (next.has(reqId)) next.delete(reqId);
      else next.add(reqId);
      return next;
    });
  };

  // Select all or deselect all pending requests
  const toggleSelectAllPendingRequests = () => {
    const pendingIds = filteredHodRequests.filter(r => r.status === 'PENDING').map(r => r.id);
    if (pendingIds.length > 0 && pendingIds.every(id => selectedHodRequests.has(id))) {
      setSelectedHodRequests(new Set());
    } else {
      setSelectedHodRequests(new Set(pendingIds));
    }
  };

  // Instant Single Approve
  const handleSingleApprove = async (request) => {
    try {
      setProcessingAction(true);
      const res = await approveRegularizationRequest({
        requestId: request.id,
        actionByName: userName,
        actionByEmail: userEmail,
        actionRemarks: 'Approved by HOD',
        tenantId: effectiveTenantId
      });
      if (res.success) {
        speakHumanFemaleAnnouncement(`Approved regularization for ${request.emp_name}`, `${request.emp_name} जी का अटेंडेंस अप्रूव कर दिया गया है।`);
        fetchHodRequests();
        fetchHistory();
        fetchTodayAttendance();
        if (selectedHodRequests.has(request.id)) {
          setSelectedHodRequests(prev => {
            const next = new Set(prev);
            next.delete(request.id);
            return next;
          });
        }
      } else {
        alert('Approval error: ' + res.error);
      }
    } catch (err) {
      alert('Action error: ' + err.message);
    } finally {
      setProcessingAction(false);
    }
  };

  // Bulk Process Action (Approve / Reject)
  const handleProcessBulkHodAction = async () => {
    const ids = Array.from(selectedHodRequests);
    if (ids.length === 0) return;

    setBulkActionLoading(true);
    try {
      if (bulkActionModal.type === 'APPROVE') {
        const res = await bulkApproveRegularizationRequests({
          requestIds: ids,
          actionByName: userName,
          actionByEmail: userEmail,
          actionRemarks: bulkRemarks || 'Bulk Approved by HOD',
          tenantId: effectiveTenantId
        });
        if (res.success) {
          speakHumanFemaleAnnouncement(`Batch approved ${res.approvedCount} requests`, `कुल ${res.approvedCount} रेगुलराइजेशन रिक्वेस्ट्स एक साथ अप्रूव कर दी गई हैं।`);
          setBulkActionModal(null);
          setBulkRemarks('');
          setSelectedHodRequests(new Set());
          fetchHodRequests();
          fetchHistory();
          fetchTodayAttendance();
        } else {
          alert('Bulk approval error: ' + (res.error || res.errors?.join('\n')));
        }
      } else if (bulkActionModal.type === 'REJECT') {
        if (!bulkRemarks || bulkRemarks.trim() === '') {
          alert('Please enter reason for batch rejection.');
          setBulkActionLoading(false);
          return;
        }
        const res = await bulkRejectRegularizationRequests({
          requestIds: ids,
          actionByName: userName,
          actionByEmail: userEmail,
          actionRemarks: bulkRemarks,
          tenantId: effectiveTenantId
        });
        if (res.success) {
          setBulkActionModal(null);
          setBulkRemarks('');
          setSelectedHodRequests(new Set());
          fetchHodRequests();
        } else {
          alert('Bulk rejection error: ' + (res.error || res.errors?.join('\n')));
        }
      }
    } catch (err) {
      alert('Bulk action error: ' + err.message);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Filter HOD Requests (Instant 0ms in-memory filtering by Status Tab and Search Query)
  const filteredHodRequests = useMemo(() => {
    return (hodRequests || []).filter(r => {
      // 1. Status Tab Filter
      if (hodStatusFilter && hodStatusFilter !== 'ALL' && r.status !== hodStatusFilter) {
        return false;
      }
      // 2. Search Query Filter
      if (!hodSearchQuery) return true;
      const q = hodSearchQuery.toLowerCase();
      return (
        r.emp_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q) ||
        r.reason_type?.toLowerCase().includes(q) ||
        r.attendance_date?.includes(q) ||
        r.action_by_name?.toLowerCase().includes(q) ||
        r.action_remarks?.toLowerCase().includes(q)
      );
    });
  }, [hodRequests, hodStatusFilter, hodSearchQuery]);

  // Filter Team Master Records (Daily)
  const filteredTeamRecords = useMemo(() => {
    return (teamMasterData.records || []).filter(r => {
      if (!teamSearchQuery) return true;
      const q = teamSearchQuery.toLowerCase();
      return (
        r.emp_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.emp_code?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q) ||
        r.status?.toLowerCase().includes(q)
      );
    });
  }, [teamMasterData.records, teamSearchQuery]);

  // Dynamic KPI Summary for Team Attendance based on search and filters
  const teamFilteredSummary = useMemo(() => {
    const list = filteredTeamRecords || [];
    let present = 0;
    let late = 0;
    let halfDay = 0;
    let absent = 0;
    let regularized = 0;
    let weekOff = 0;

    list.forEach(r => {
      const rem = (r.remarks || '').toLowerCase();
      if (r.is_regularized || r.status === 'REGULARIZED') {
        regularized += 1;
      } else if (r.status === 'WEEK_OFF' || r.status === 'WO' || rem.includes('paid week off') || rem.includes('week off')) {
        weekOff += 1;
      } else if (r.status === 'PRESENT') {
        present += 1;
      } else if (r.status === 'LATE') {
        late += 1;
      } else if (r.status === 'HALF_DAY') {
        halfDay += 1;
      } else if (r.status === 'ABSENT' || r.status === 'MISSED_PUNCH') {
        absent += 1;
      }
    });

    return {
      totalRecords: list.length,
      totalEmployees: new Set(list.map(r => r.email)).size,
      totalPresent: present,
      totalLate: late,
      totalHalfDay: halfDay,
      totalAbsent: absent,
      totalRegularized: regularized,
      totalWeekOff: weekOff
    };
  }, [filteredTeamRecords]);

  // Filter Monthly Matrix Records
  const filteredMatrixRows = useMemo(() => {
    return (monthlyMatrixData?.rows || []).filter(r => {
      if (!teamSearchQuery) return true;
      const q = teamSearchQuery.toLowerCase();
      return (
        r.emp_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.emp_id?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q)
      );
    });
  }, [monthlyMatrixData?.rows, teamSearchQuery]);

  // Export Daily / Range Team Attendance to CSV (Filter & Search aware)
  const handleExportCSV = () => {
    const recordsToExport = filteredTeamRecords || [];
    if (recordsToExport.length === 0) return;
    const isRange = teamStartDate !== teamEndDate;
    const headers = isRange 
      ? ['Emp ID', 'Employee Name', 'Email', 'Department', 'Date', 'In Time', 'Out Time', 'Duration', 'Status', 'Regularized', 'Remarks']
      : ['Emp ID', 'Employee Name', 'Email', 'Department', 'In Time', 'Out Time', 'Duration', 'Status', 'Regularized', 'Remarks'];

    const rows = recordsToExport.map(r => {
      const base = [
        `"${r.emp_code || ''}"`,
        `"${r.emp_name || ''}"`,
        `"${r.email || ''}"`,
        `"${r.department || ''}"`
      ];
      if (isRange) {
        base.push(`"${r.attendance_date || ''}"`);
      }
      base.push(
        `"${r.in_time ? formatTimeIST(r.in_time) : ''}"`,
        `"${r.out_time ? formatTimeIST(r.out_time) : ''}"`,
        `"${formatMinutesToHours(r.total_working_minutes)}"`,
        `"${r.status || 'ABSENT'}"`,
        `"${r.is_regularized ? 'Yes' : 'No'}"`,
        `"${(r.remarks || '').replace(/"/g, '""')}"`
      );
      return base;
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const searchSuffix = teamSearchQuery ? `_${teamSearchQuery.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
    const fileName = isRange 
      ? `Team_Attendance_Report_${teamStartDate}_to_${teamEndDate}${searchSuffix}.csv`
      : `Team_Attendance_Report_${teamStartDate}${searchSuffix}.csv`;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 1-Click Export Monthly Matrix: Opens User Prompt Modal to ask if Leaves should be adjusted
  const handleExportMonthlyMatrixCSV = () => {
    const rowsToExport = filteredMatrixRows || [];
    if (rowsToExport.length === 0) return;
    setShowLeaveAdjustPromptModal(true);
  };

  // Actual CSV Generator executing user's choice: withLeavesAdjusted (true/false)
  const executeExportMonthlyMatrixCSV = (withLeavesAdjusted) => {
    const rowsToExport = filteredMatrixRows || [];
    if (rowsToExport.length === 0) return;
    
    const datesHeaders = (monthlyMatrixData?.monthDates || []).map(d => `"${d.dayNumber} (${d.dayNameShort})"`);
    const headers = [
      'Emp ID',
      'Employee Name',
      'Email',
      'Department',
      'Leave Adjusted in Salary',
      ...datesHeaders,
      'Total Present',
      'Total Absent',
      'Total Half Days',
      'Total Short Leaves',
      'Approved Leaves (Days)',
      'Total Payable Days',
      'Total Hours Logged'
    ];

    const rows = rowsToExport.map(r => {
      const dayCodes = (r.days || []).map(d => `"${d.code}"`);
      const approvedLeavesCount = r.summary?.totalApprovedLeaves || 0;
      
      let payableDays = r.summary?.totalPayableDays || 0;
      if (!withLeavesAdjusted && r.summary?.leavesAdjusted) {
        payableDays = Math.max(0, payableDays - (r.summary?.totalLeavePayableDays || 0));
      } else if (withLeavesAdjusted && !r.summary?.leavesAdjusted) {
        payableDays += (r.summary?.totalLeavePayableDays || approvedLeavesCount);
      }

      return [
        `"${r.emp_id || ''}"`,
        `"${r.emp_name || ''}"`,
        `"${r.email || ''}"`,
        `"${r.department || ''}"`,
        `"${withLeavesAdjusted ? 'YES (Paid Leaves Included)' : 'NO (Raw Attendance Only)'}"`,
        ...dayCodes,
        `"${r.summary?.totalPresent || 0}"`,
        `"${r.summary?.totalAbsent || 0}"`,
        `"${r.summary?.totalHalfDays || 0}"`,
        `"${r.summary?.totalShortLeaves || 0}"`,
        `"${approvedLeavesCount}"`,
        `"${payableDays}"`,
        `"${r.summary?.totalHoursFormatted || '0h'}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const searchSuffix = teamSearchQuery ? `_${teamSearchQuery.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
    const monthName = new Date(matrixYear, matrixMonth - 1, 1).toLocaleString('en-US', { month: 'long' });
    const adjustTag = withLeavesAdjusted ? '_LeaveAdjusted' : '_RawAttendance';
    link.setAttribute('download', `Monthly_Attendance_Matrix_${monthName}_${matrixYear}${adjustTag}${searchSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper formatting for status badges
  const renderStatusBadge = (status, isRegularized = false, remarks = '') => {
    if (isRegularized || status === 'REGULARIZED') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: '#e0e7ff', color: '#3730a3' }}>
          <ShieldCheck size={12} /> Regularized
        </span>
      );
    }
    const rem = (remarks || '').toLowerCase();
    if (status === 'WEEK_OFF' || status === 'WO' || rem.includes('paid week off') || rem.includes('week off')) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: '#f3e8ff', color: '#6b21a8' }}>
          <Calendar size={12} /> Week Off
        </span>
      );
    }
    if (status === 'MISSED_PUNCH' || rem.includes('missed punch')) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: '#fee2e2', color: '#991b1b' }}>
          <AlertCircle size={12} /> Missed Punch
        </span>
      );
    }
    if (status === 'PRESENT') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: '#dcfce7', color: '#166534' }}>
          <CheckCircle2 size={12} /> Present
        </span>
      );
    }
    if (status === 'LATE') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>
          <Clock size={12} /> Late In
        </span>
      );
    }
    if (status === 'HALF_DAY') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: '#ffedd5', color: '#9a3412' }}>
          <AlertTriangle size={12} /> Half Day
        </span>
      );
    }
    if (status === 'ABSENT') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: '#fee2e2', color: '#991b1b' }}>
          <XCircle size={12} /> Absent
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>
        {status || 'Unknown'}
      </span>
    );
  };

  // Helper to render Short Leave badges with automatic fallback detection
  const renderShortLeaveBadge = (rOrType, isGraceParam = false) => {
    let type = typeof rOrType === 'string' ? rOrType : rOrType?.short_leave_type;
    let isGrace = typeof rOrType === 'object' ? rOrType?.is_grace_applied : isGraceParam;
    const r = typeof rOrType === 'object' ? rOrType : null;
    const remarks = (r?.remarks || '').toLowerCase();

    // 1. Fallback from remarks if type is missing
    if (!type || type === 'NONE') {
      if (remarks.includes('20-min') || remarks.includes('20m sl') || remarks.includes('20 min')) {
        type = remarks.includes('evening') ? '20_MIN_OUT' : '20_MIN_IN';
      } else if (remarks.includes('2-hour') || remarks.includes('2h sl') || remarks.includes('2 hour')) {
        type = remarks.includes('evening') ? '2_HR_OUT' : '2_HR_IN';
      } else if (remarks.includes('grace')) {
        isGrace = true;
      }
    }

    // 2. Dynamic evaluation from in_time if still missing
    if ((!type || type === 'NONE') && !isGrace && r?.in_time && (r?.status === 'PRESENT' || r?.status === 'LATE')) {
      const inDate = new Date(r.in_time);
      const hours = inDate.getHours();
      const mins = inDate.getMinutes();
      const secs = inDate.getSeconds();
      const totalSecs = hours * 3600 + mins * 60 + secs;

      if (totalSecs > 9 * 3600 && totalSecs <= (9 * 3600 + 5 * 60 + 59)) {
        isGrace = true;
      } else if (totalSecs > (9 * 3600 + 5 * 60 + 59) && totalSecs <= (9 * 3600 + 20 * 60 + 59)) {
        type = '20_MIN_IN';
      } else if (totalSecs > (9 * 3600 + 20 * 60 + 59) && totalSecs <= (11 * 3600 + 59)) {
        type = '2_HR_IN';
      }
    }

    if (isGrace) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.18rem 0.5rem', borderRadius: '12px', background: '#dcfce7', color: '#166534', fontSize: '0.72rem', fontWeight: 600 }}>
          <Sparkles size={11} /> On Time (5m Grace)
        </span>
      );
    }
    if (!type || type === 'NONE') return null;
    if (type === '20_MIN_IN') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.18rem 0.5rem', borderRadius: '12px', background: '#e0f2fe', color: '#0369a1', fontSize: '0.72rem', fontWeight: 600 }}>
          <Sparkles size={11} /> 20m SL (Morning)
        </span>
      );
    }
    if (type === '20_MIN_OUT') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.18rem 0.5rem', borderRadius: '12px', background: '#e0f2fe', color: '#0369a1', fontSize: '0.72rem', fontWeight: 600 }}>
          <Sparkles size={11} /> 20m SL (Evening)
        </span>
      );
    }
    if (type === '2_HR_IN') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.18rem 0.5rem', borderRadius: '12px', background: '#ede9fe', color: '#6d28d9', fontSize: '0.72rem', fontWeight: 600 }}>
          <Calendar size={11} /> 2h SL (Morning)
        </span>
      );
    }
    if (type === '2_HR_OUT') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.18rem 0.5rem', borderRadius: '12px', background: '#ede9fe', color: '#6d28d9', fontSize: '0.72rem', fontWeight: 600 }}>
          <Calendar size={11} /> 2h SL (Evening)
        </span>
      );
    }
    return null;
  };

  return (
    <div style={{ padding: 0, width: '100%', color: 'var(--text-primary)' }}>

      {/* ===================== Punch Confirm Modal ===================== */}
      {punchConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(4px)',
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--bg-primary, #ffffff)',
            borderRadius: '20px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
            padding: '2rem 2.25rem 1.75rem',
            width: '100%',
            maxWidth: '380px',
            textAlign: 'center',
            animation: 'fadeInScale 0.18s ease'
          }}>
            {/* Icon */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              margin: '0 auto 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: punchConfirm === 'IN'
                ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
                : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              boxShadow: punchConfirm === 'IN'
                ? '0 8px 24px rgba(22,163,74,0.35)'
                : '0 8px 24px rgba(220,38,38,0.35)'
            }}>
              {punchConfirm === 'IN'
                ? <CheckCircle2 size={30} color="#fff" />
                : <XCircle size={30} color="#fff" />
              }
            </div>

            {/* Title */}
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.4rem', color: 'var(--text-primary)' }}>
              {punchConfirm === 'IN' ? 'Confirm Punch In' : 'Confirm Punch Out'}
            </h2>

            {/* Time display */}
            <p style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0.2rem 0', color: punchConfirm === 'IN' ? '#16a34a' : '#dc2626' }}>
              {formatTimeIST(new Date(), { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 1.5rem' }}>
              {formatDateIST(new Date(), { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </p>

            {/* Confirmation message */}
            <div style={{
              background: punchConfirm === 'IN' ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${punchConfirm === 'IN' ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: '10px',
              padding: '0.65rem 0.9rem',
              marginBottom: '1.5rem',
              fontSize: '0.84rem',
              color: punchConfirm === 'IN' ? '#166534' : '#991b1b',
              textAlign: 'left'
            }}>
              {punchConfirm === 'IN'
                ? '⚠️ Ek din mein sirf 1 baar Punch In allowed hai. Kya aap confirm karte hain?'
                : '⚠️ Ek din mein sirf 1 baar Punch Out allowed hai. Kya aap confirm karte hain?'
              }
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setPunchConfirm(null)}
                style={{
                  flex: 1,
                  padding: '0.7rem',
                  borderRadius: '10px',
                  border: '1.5px solid var(--border-light)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                ✕ Cancel
              </button>
              <button
                type="button"
                onClick={punchConfirm === 'IN' ? handleConfirmedPunchIn : handleConfirmedPunchOut}
                style={{
                  flex: 1,
                  padding: '0.7rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: punchConfirm === 'IN'
                    ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
                    : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  boxShadow: punchConfirm === 'IN'
                    ? '0 4px 12px rgba(22,163,74,0.35)'
                    : '0 4px 12px rgba(220,38,38,0.35)'
                }}
              >
                {punchConfirm === 'IN' ? '✓ Punch In Confirm' : '✓ Punch Out Confirm'}
              </button>
            </div>
          </div>

          {/* CSS animation */}
          <style>{`
            @keyframes fadeInScale {
              from { opacity: 0; transform: scale(0.92); }
              to { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      )}

      {/* Top Header & Sub-Navigation */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1.25rem',
        borderBottom: '1px solid var(--border-light)',
        paddingBottom: '0.85rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 10px rgba(59, 130, 246, 0.3)'
          }}>
            <Clock size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>Smart Attendance & Regularization</h1>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.1)',
                color: 'var(--primary, #2563eb)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                🏢 Workspace: {userCompany || 'Default'}
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
              Daily 1-Time Punch In & Out • Missing Punch Applications • HOD Approvals & Auto Update
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-surface)', padding: '0.3rem', borderRadius: '10px', border: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
          {/* Tab 1: Daily Punch Station */}
          <button
            type="button"
            onClick={() => handleTabSelect('my_attendance')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'my_attendance' ? 600 : 500,
              backgroundColor: activeTab === 'my_attendance' ? 'var(--accent-color)' : 'transparent',
              color: activeTab === 'my_attendance' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.2s'
            }}
          >
            <Clock size={15} /> Daily Punch Station
          </button>

          {/* Tab 2: Monthly Attendance Log */}
          <button
            type="button"
            onClick={() => {
              handleTabSelect('monthly_logs');
              fetchHistory();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'monthly_logs' ? 600 : 500,
              backgroundColor: activeTab === 'monthly_logs' ? 'var(--accent-color)' : 'transparent',
              color: activeTab === 'monthly_logs' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.2s'
            }}
          >
            <Calendar size={15} /> Monthly Attendance Log
          </button>

          {/* Tab 3: Regularization / Missing Punch */}
          <button
            type="button"
            onClick={() => handleTabSelect('regularization')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'regularization' ? 600 : 500,
              backgroundColor: activeTab === 'regularization' ? 'var(--accent-color)' : 'transparent',
              color: activeTab === 'regularization' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.2s'
            }}
          >
            <FileText size={15} /> Missing Punch / Regularize
            {myRequests.length > 0 && (
              <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '10px', background: activeTab === 'regularization' ? 'rgba(255,255,255,0.25)' : 'var(--border-light)', color: activeTab === 'regularization' ? '#fff' : 'var(--text-secondary)' }}>
                {myRequests.length}
              </span>
            )}
          </button>

          {isHodOrManager && (
            <button
              type="button"
              onClick={() => handleTabSelect('hod_approvals')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.84rem',
                fontWeight: activeTab === 'hod_approvals' ? 600 : 500,
                backgroundColor: activeTab === 'hod_approvals' ? 'var(--accent-color)' : 'transparent',
                color: activeTab === 'hod_approvals' ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all 0.2s'
              }}
            >
              <ShieldCheck size={15} /> HOD Approvals
              {hodPendingCount > 0 && (
                <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.45rem', borderRadius: '10px', background: '#ef4444', color: '#ffffff', fontWeight: 700 }}>
                  {hodPendingCount}
                </span>
              )}
            </button>
          )}

          {isHodOrManager && (
            <button
              type="button"
              onClick={() => handleTabSelect('team_report')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.84rem',
                fontWeight: activeTab === 'team_report' ? 600 : 500,
                backgroundColor: activeTab === 'team_report' ? 'var(--accent-color)' : 'transparent',
                color: activeTab === 'team_report' ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all 0.2s'
              }}
            >
              <Users size={15} /> Team Attendance Report
            </button>
          )}

          {/* Tab 6: Shift Rules */}
          <button
            type="button"
            onClick={() => handleTabSelect('shift_rules')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'shift_rules' ? 600 : 500,
              backgroundColor: activeTab === 'shift_rules' ? 'var(--accent-color)' : 'transparent',
              color: activeTab === 'shift_rules' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.2s'
            }}
          >
            <BookOpen size={15} /> Shift Rules
          </button>

          {/* Tab 7: Company Leave Policy */}
          <button
            type="button"
            onClick={() => handleTabSelect('leave_policy')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'leave_policy' ? 600 : 500,
              backgroundColor: activeTab === 'leave_policy' ? 'var(--accent-color)' : 'transparent',
              color: activeTab === 'leave_policy' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.2s'
            }}
          >
            <Award size={15} /> Company Leave Policy
          </button>

          {/* Tab 8: Office Geofencing Policy */}
          <button
            type="button"
            onClick={() => handleTabSelect('geofencing')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'geofencing' ? 600 : 500,
              backgroundColor: activeTab === 'geofencing' ? 'var(--accent-color)' : 'transparent',
              color: activeTab === 'geofencing' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.2s'
            }}
          >
            <MapPin size={15} /> Office Geofencing Policy
          </button>
        </div>
      </div>

      {/* ========================================================================================= */}
      {/* TAB 1: MY ATTENDANCE & PUNCH STATION */}
      {/* ========================================================================================= */}
      {activeTab === 'my_attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Top Live Punch Terminal Card */}
          <div className="card" style={{
            padding: '1.5rem',
            background: 'var(--bg-surface)',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.5rem',
            alignItems: 'center'
          }}>
            
            {/* Clock & Date Display */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', fontWeight: 600, fontSize: '0.85rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 8px #22c55e' }}></span>
                LIVE ATTENDANCE TERMINAL
              </div>
              
              <div suppressHydrationWarning style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {formatTimeIST(currentTime, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </div>

              <div suppressHydrationWarning style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Calendar size={15} />
                {formatDateIST(currentTime, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <Laptop size={14} /> Web Terminal
                </div>
                
                {/* Voice On/Off Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !voiceEnabled;
                    setVoiceEnabled(next);
                    if (next) {
                      playInstantChime('in');
                      speakHumanFemaleAnnouncement('Voice announcements enabled', `नमस्ते ${userName} जी! वॉइस अनाउंसमेंट चालू है।`);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    background: voiceEnabled ? 'var(--nav-active-bg)' : 'transparent',
                    color: voiceEnabled ? 'var(--accent-color)' : 'var(--text-secondary)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  title="Toggle Voice Speech Announcement"
                >
                  {voiceEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                  <span>Voice: {voiceEnabled ? 'ON' : 'OFF'}</span>
                </button>

                {/* Instant Test Female Voice Button */}
                {voiceEnabled && (
                  <button
                    type="button"
                    disabled={playingVoice}
                    onClick={() => {
                      playInstantChime('in');
                      speakHumanFemaleAnnouncement(
                        `Welcome ${userName}. Your punch in time is 09:30 AM. Have a great day!`,
                        `नमस्ते ${userName} जी! आपका पंच इन समय 9:30 दर्ज हो गया है। आपका दिन शुभ और मंगलमय हो!`
                      );
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '6px',
                      border: '1px solid #93c5fd',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: playingVoice ? 'not-allowed' : 'pointer'
                    }}
                    title="Test Instant Natural Voice"
                  >
                    <Play size={11} /> {playingVoice ? 'Speaking...' : 'Test Voice'}
                  </button>
                )}
              </div>
            </div>

            {/* Daily Punch In & Out Action Buttons */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
              background: 'var(--bg-primary)',
              padding: '1.25rem',
              borderRadius: '14px',
              border: '1px solid var(--border-light)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Today's Punch Status</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  {renderShortLeaveBadge(todayRecord)}
                  {renderStatusBadge(todayRecord?.status || (todayRecord?.in_time ? 'WORKING' : 'NOT PUNCHED'), todayRecord?.is_regularized)}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                
                {/* 1. Punch In Button (Strict 1-Time Rule) */}
                <button
                  type="button"
                  disabled={loadingToday || punchingIn || !!todayRecord?.in_time}
                  onClick={handlePunchIn}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.9rem 0.75rem',
                    borderRadius: '12px',
                    border: 'none',
                    background: todayRecord?.in_time 
                      ? '#16a34a' 
                      : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                    color: '#ffffff',
                    cursor: todayRecord?.in_time ? 'not-allowed' : 'pointer',
                    boxShadow: todayRecord?.in_time ? 'none' : '0 4px 12px rgba(220, 38, 38, 0.3)',
                    transition: 'all 0.2s',
                    opacity: todayRecord?.in_time ? 0.85 : (punchingIn ? 0.7 : 1)
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.95rem' }}>
                    <CheckCircle2 size={18} />
                    {punchingIn ? 'Punching...' : (todayRecord?.in_time ? '✓ Punched In' : 'Punch In')}
                  </div>
                  <span style={{ fontSize: '0.75rem', marginTop: '0.2rem', opacity: 0.9 }}>
                    {todayRecord?.in_time
                      ? `In: ${formatTimeIST(todayRecord.in_time)}`
                      : 'Click to Punch In'}
                  </span>
                </button>

                {/* 2. Punch Out Button (Strict 1-Time Rule) */}
                <button
                  type="button"
                  disabled={loadingToday || punchingOut || !todayRecord?.in_time || !!todayRecord?.out_time}
                  onClick={handlePunchOut}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.9rem 0.75rem',
                    borderRadius: '12px',
                    border: 'none',
                    background: todayRecord?.out_time
                      ? '#64748b'
                      : (todayRecord?.in_time ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : '#94a3b8'),
                    color: '#ffffff',
                    cursor: (!todayRecord?.in_time || todayRecord?.out_time) ? 'not-allowed' : 'pointer',
                    boxShadow: (!todayRecord?.in_time || todayRecord?.out_time) ? 'none' : '0 4px 12px rgba(220, 38, 38, 0.3)',
                    transition: 'all 0.2s',
                    opacity: (!todayRecord?.in_time || todayRecord?.out_time) ? 0.75 : (punchingOut ? 0.7 : 1)
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.95rem' }}>
                    <XCircle size={18} />
                    {punchingOut ? 'Punching...' : (todayRecord?.out_time ? '✓ Shift Completed' : 'Punch Out')}
                  </div>
                  <span style={{ fontSize: '0.75rem', marginTop: '0.2rem', opacity: 0.9 }}>
                    {todayRecord?.out_time
                      ? `Out: ${formatTimeIST(todayRecord.out_time)}`
                      : (todayRecord?.in_time ? 'Click to Punch Out' : 'Punch In First')}
                  </span>
                </button>
              </div>

              {/* Feedback messages */}
              {punchMessage && (
                <div style={{ padding: '0.5rem', borderRadius: '8px', background: '#dcfce7', color: '#166534', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <CheckCircle2 size={14} /> {punchMessage}
                </div>
              )}
              {punchError && (
                <div style={{ padding: '0.5rem', borderRadius: '8px', background: '#fee2e2', color: '#991b1b', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <AlertCircle size={14} /> {punchError}
                </div>
              )}
            </div>

            {/* Today's Working Hours & Quick Regularize */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
              background: 'var(--bg-primary)',
              padding: '1.25rem',
              borderRadius: '14px',
              border: '1px solid var(--border-light)'
            }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Today's Time Logged</span>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                {todayRecord?.in_time && !todayRecord?.out_time && (
                  <span style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#22c55e',
                    boxShadow: '0 0 10px #22c55e',
                    display: 'inline-block'
                  }}></span>
                )}
                <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--accent-color)', fontFamily: 'monospace', letterSpacing: '0.02em' }}>
                  {liveDuration}
                </span>
                <span style={{ fontSize: '0.78rem', color: todayRecord?.in_time && !todayRecord?.out_time ? '#16a34a' : 'var(--text-secondary)', fontWeight: 600 }}>
                  {todayRecord?.out_time ? '(Final Logged)' : (todayRecord?.in_time ? '● LIVE RUNNING' : '(Not Started)')}
                </span>
              </div>

              <div style={{ borderTop: '1px dashed var(--border-light)', paddingTop: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Missed a punch or taking leave?</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <button
                    type="button"
                    onClick={() => handleOpenRegularizeForDate(getTodayDateString(), todayRecord)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-surface)',
                      color: 'var(--accent-color)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <FileText size={13} /> Apply Missing Punch
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowApplyLeaveModal(true)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'var(--accent-color, #2563eb)',
                      color: '#ffffff',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
                    }}
                  >
                    <Calendar size={13} /> 🌴 Apply Leave
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* Multi-Shift Selector for Tenant (if multiple shifts configured) */}
          {activeShiftsList.length > 1 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              flexWrap: 'wrap',
              padding: '0.65rem 1rem',
              background: 'var(--bg-surface)',
              borderRadius: '12px',
              border: '1px solid var(--border-light)'
            }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                🏢 Active Shift Policy:
              </span>
              {activeShiftsList.map((shift, idx) => {
                const isSelected = activePunchShift.id === shift.id || activePunchShift.shift_code === shift.shift_code;
                return (
                  <button
                    key={shift.id || idx}
                    type="button"
                    onClick={() => setSelectedPunchShiftIndex(idx)}
                    style={{
                      padding: '0.3rem 0.75rem',
                      borderRadius: '20px',
                      border: isSelected ? '1px solid var(--accent-color, #2563eb)' : '1px solid var(--border-light)',
                      background: isSelected ? 'rgba(37, 99, 235, 0.12)' : 'var(--bg-primary)',
                      color: isSelected ? 'var(--accent-color, #2563eb)' : 'var(--text-secondary)',
                      fontSize: '0.78rem',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      transition: 'all 0.15s'
                    }}
                  >
                    <span>{shift.shift_name}</span>
                    <span style={{ opacity: 0.85, fontSize: '0.72rem' }}>
                      ({formatTime12h(shift.start_time)} – {formatTime12h(shift.end_time)})
                    </span>
                    {shift.is_default && (
                      <span style={{ fontSize: '0.65rem', background: '#10b981', color: '#ffffff', padding: '0.05rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
                        Default
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Shift & Short Leave Policy Quota Card */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '0.85rem',
            background: 'var(--bg-surface)',
            padding: '1rem 1.25rem',
            borderRadius: '14px',
            border: '1px solid var(--border-light)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}>
            {/* Shift Timing */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Clock size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  {activePunchShift.shift_name || 'Regular Shift'}
                </div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {punchShiftGraceInfo.startTime12} – {punchShiftGraceInfo.endTime12}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600 }}>
                  {punchShiftGraceInfo.graceRange}
                </div>
              </div>
            </div>

            {/* Short Leave 1 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Sparkles size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  {punchShiftGraceInfo.sl1Name}
                </div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#16a34a' }}>
                  {shortLeaveUsage.remaining_20_min} / {punchShiftGraceInfo.sl1Quota} Remaining
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Allowance: {punchShiftGraceInfo.sl1Mins} Mins Duration
                </div>
              </div>
            </div>

            {/* Short Leave 2 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Calendar size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  {punchShiftGraceInfo.sl2Name}
                </div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#7c3aed' }}>
                  {shortLeaveUsage.remaining_2_hr} / {punchShiftGraceInfo.sl2Quota} Remaining
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Allowance: {punchShiftGraceInfo.sl2Mins} Mins Duration
                </div>
              </div>
            </div>

            {/* Monthly Policy & Rules */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Info size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Monthly Policy
                </div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#d97706' }}>
                  {shortLeaveUsage.total_used} / {punchShiftGraceInfo.totalSlQuota} Used
                </div>
                <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600 }}>
                  Mon-Sat: &lt; {punchShiftGraceInfo.minAbsentHours} = Absent
                </div>
              </div>
            </div>
          </div>

          {/* Employee Leave Balance Ledger (CL / SL / EL / Encashment Policy) */}
          <div className="card" style={{
            padding: '1.25rem',
            background: 'var(--bg-surface)',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={18} color="var(--accent-color, #2563eb)" />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Leave Quota & Balance Ledger</h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>Annual Quota</span>
              </div>
              <button
                type="button"
                onClick={() => setShowApplyLeaveModal(true)}
                style={{
                  background: 'rgba(37, 99, 235, 0.1)',
                  color: 'var(--accent-color, #2563eb)',
                  border: '1px solid rgba(37, 99, 235, 0.25)',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '7px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}
              >
                + New Application
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '1rem'
            }}>
              {/* Casual Leave Card */}
              <div style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '12px',
                padding: '1rem',
                borderTop: '3px solid #2563eb'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Casual Leave (CL)</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Day-1 Unlocked</span>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {leaveBalance?.cl?.remaining ?? 8} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ {leaveBalance?.cl?.quota ?? 8} days left</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                  Availed: {leaveBalance?.cl?.availed ?? 0} days
                </div>
              </div>

              {/* Sick Leave Card */}
              <div style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '12px',
                padding: '1rem',
                borderTop: '3px solid #16a34a'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Sick Leave (SL)</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#16a34a', background: '#f0fdf4', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Medical</span>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {leaveBalance?.sl?.remaining ?? 6} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ {leaveBalance?.sl?.quota ?? 6} days left</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                  Availed: {leaveBalance?.sl?.availed ?? 0} days
                </div>
              </div>

              {/* Earned Leave Card (with 1-Yr Lock-in) */}
              <div style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '12px',
                padding: '1rem',
                borderTop: '3px solid #9333ea'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Earned Leave (EL)</span>
                  {leaveBalance?.el?.isLocked ? (
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>🔒 1-Yr Lockin</span>
                  ) : (
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9333ea', background: '#faf5ff', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Unlocked</span>
                  )}
                </div>
                {leaveBalance?.el?.isLocked ? (
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#d97706', marginTop: '0.2rem' }}>
                      Locked during probation
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                      Unlocks after 12 months (Accrues {leaveBalance?.el?.quota || 15} days/yr; valid 3 yrs or encashable).
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {leaveBalance?.el?.remaining ?? 15} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ {leaveBalance?.el?.quota ?? 15} days left</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                      Availed: {leaveBalance?.el?.availed ?? 0} days • Valid 3 yrs
                    </div>
                  </div>
                )}
              </div>

              {/* Compensatory Off (CPL) Card */}
              <div style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '12px',
                padding: '1rem',
                borderTop: '3px solid #4f46e5'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Compensatory Off (CPL)</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#4f46e5', background: '#eef2ff', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Comp-Off</span>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {leaveBalance?.cpl?.balance ?? 0} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ {leaveBalance?.cpl?.earned ?? 0} days earned</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                  Availed: {leaveBalance?.cpl?.availed ?? 0} days • Valid {leaveBalance?.cpl?.validityDays ?? 60} days
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================================= */}
      {/* TAB 2: MONTHLY ATTENDANCE LOG */}
      {/* ========================================================================================= */}
      {activeTab === 'monthly_logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Monthly Attendance KPIs & History Matrix */}
          <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
            
            {/* Header with Month/Year picker */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Monthly Attendance Log</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                  Detailed punch records, shift status, working hours, and regularized days
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Month selector */}
                <select
                  value={historyMonth}
                  onChange={(e) => setHistoryMonth(parseInt(e.target.value, 10))}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    outline: 'none'
                  }}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'long' })}
                    </option>
                  ))}
                </select>

                {/* Year selector */}
                <select
                  value={historyYear}
                  onChange={(e) => setHistoryYear(parseInt(e.target.value, 10))}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    outline: 'none'
                  }}
                >
                  {[historyYear - 1, historyYear, historyYear + 1].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={fetchHistory}
                  title="Refresh Data"
                  style={{
                    padding: '0.45rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                >
                  <RefreshCw size={15} className={loadingHistory ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1.25rem'
            }}>
              <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>DAYS PRESENT</span>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#16a34a' }}>{historySummary.totalPresent || 0}</span>
              </div>
              <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>ABSENT</span>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#dc2626' }}>{historySummary.totalAbsent || 0}</span>
              </div>
              <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>HALF DAYS</span>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ea580c' }}>{historySummary.totalHalfDay || 0}</span>
              </div>
              <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>LATE IN</span>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#d97706' }}>{historySummary.totalLate || 0}</span>
              </div>
              <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>MISSED PUNCH</span>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{historySummary.totalMissedPunches || 0}</span>
              </div>
              <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>REGULARIZED</span>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#4f46e5' }}>{historySummary.totalRegularized || 0}</span>
              </div>
              <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>TOTAL HOURS</span>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent-color)' }}>{historySummary.totalHoursFormatted || '0h'}</span>
              </div>
            </div>

            {/* Attendance History Table */}
            <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
              <MobileTableView id="Attendance/AttendanceModule-1"><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Date</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Day</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>In Time</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Out Time</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Total Hours</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status & Short Leave</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Method / Shift Remarks</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No attendance records logged for this month.
                      </td>
                    </tr>
                  ) : (
                    historyRecords.map((r, idx) => {
                      const d = new Date(r.attendance_date + 'T00:00:00');
                      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                      const hasMissingPunch = (!r.in_time || !r.out_time) && r.attendance_date !== getTodayDateString();

                      return (
                        <tr
                          key={r.id || idx}
                          style={{
                            borderBottom: '1px solid var(--border-light)',
                            backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--table-alt-row, rgba(0,0,0,0.01))'
                          }}
                        >
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{r.attendance_date}</td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{dayName}</td>
                          <td style={{ padding: '0.75rem 1rem', color: r.in_time ? 'var(--text-primary)' : '#ef4444', fontWeight: r.in_time ? 500 : 600 }}>
                            {r.in_time ? formatTimeIST(r.in_time) : 'Missed In'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: r.out_time ? 'var(--text-primary)' : (r.attendance_date === getTodayDateString() ? 'var(--text-secondary)' : '#ef4444'), fontWeight: r.out_time ? 500 : 600 }}>
                            {r.out_time ? formatTimeIST(r.out_time) : (r.attendance_date === getTodayDateString() ? 'Working...' : 'Missed Out')}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--accent-color)' }}>
                            {formatMinutesToHours(r.total_working_minutes)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                              {renderStatusBadge(r.status, r.is_regularized, r.remarks)}
                              {renderShortLeaveBadge(r)}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '240px' }}>
                            {r.is_regularized ? (
                              <span title={r.remarks} style={{ color: '#4f46e5', fontWeight: 500 }}>Regularized by HOD</span>
                            ) : (
                              <span title={r.remarks || ''}>
                                {r.remarks || r.in_method || 'WEB_PUNCH'}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                            {hasMissingPunch || r.status === 'MISSED_PUNCH' || !r.out_time ? (
                              <button
                                type="button"
                                onClick={() => handleOpenRegularizeForDate(r.attendance_date, r)}
                                style={{
                                  padding: '0.25rem 0.55rem',
                                  borderRadius: '6px',
                                  border: '1px solid #c7d2fe',
                                  background: '#eef2ff',
                                  color: '#4338ca',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                Regularize
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table></MobileTableView>
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================================= */}
      {/* TAB 2: MISSING PUNCH REGULARIZATION (APPLY & MY REQUESTS) */}
      {/* ========================================================================================= */}
      {activeTab === 'regularization' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Header Action Card */}
          <div className="card" style={{
            padding: '1.25rem',
            background: 'var(--bg-surface)',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>My Regularization Applications</h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                Track the status of your missing attendance applications submitted for HOD approval
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleOpenRegularizeForDate(getTodayDateString())}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.6rem 1.1rem',
                borderRadius: '10px',
                border: 'none',
                background: 'var(--accent-color)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
              }}
            >
              <Send size={16} /> Apply New Missing Attendance
            </button>
          </div>

          {/* User's Requests Table */}
          <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
            <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
              <MobileTableView id="Attendance/AttendanceModule-2"><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Applied On</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Missing Date</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Missing Type</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Requested Punch Times</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Reason & Remarks</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Assigned HOD</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>HOD Action / Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {myRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        You have not submitted any regularization requests yet.
                      </td>
                    </tr>
                  ) : (
                    myRequests.map((r, idx) => {
                      const reqInFormatted = r.requested_in_time ? formatTimeIST(r.requested_in_time) : '—';
                      const reqOutFormatted = r.requested_out_time ? formatTimeIST(r.requested_out_time) : '—';

                      return (
                        <tr key={r.id || idx} style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--table-alt-row, rgba(0,0,0,0.01))' }}>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                            {formatDateIST(r.created_at)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{r.attendance_date}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', fontWeight: 600 }}>
                              {r.request_type === 'MISSED_IN' ? 'In Time Only' : (r.request_type === 'MISSED_OUT' ? 'Out Time Only' : 'Both In & Out')}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                              {r.request_type !== 'MISSED_OUT' && <span style={{ color: '#16a34a' }}>In: {reqInFormatted} </span>}
                              {r.request_type !== 'MISSED_IN' && <span style={{ color: '#dc2626' }}>Out: {reqOutFormatted}</span>}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', maxWidth: '200px' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{r.reason_type}</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.reason_details}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                            {r.assigned_hod_name || r.assigned_hod_email || 'HOD / Manager'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {r.status === 'PENDING' && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.55rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>
                                <Clock size={12} /> Pending HOD
                              </span>
                            )}
                            {r.status === 'APPROVED' && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.55rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, background: '#dcfce7', color: '#166534' }}>
                                <CheckCircle2 size={12} /> Approved
                              </span>
                            )}
                            {r.status === 'REJECTED' && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.55rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, background: '#fee2e2', color: '#991b1b' }}>
                                <XCircle size={12} /> Rejected
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            {r.action_at ? (
                              <div>
                                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.action_by_name || 'HOD'}: </span>
                                <span>{r.action_remarks || (r.status === 'APPROVED' ? 'Approved' : 'Rejected')}</span>
                              </div>
                            ) : (
                              'Waiting for review'
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table></MobileTableView>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================================= */}
      {/* TAB 3: HOD APPROVALS CONSOLE (FOR MANAGERS / HOD / ADMIN) */}
      {/* ========================================================================================= */}
      {activeTab === 'hod_approvals' && isHodOrManager && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Top Filter Bar */}
          <div className="card" style={{
            padding: '1.25rem',
            background: 'var(--bg-surface)',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>HOD Approval Console</h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                Review employee regularization requests and leave applications. Approved actions update attendance records automatically.
              </p>
            </div>

            {/* Top Sub-Tab Switcher: Regularization Requests vs Leave Applications */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--bg-primary)',
              padding: '0.3rem',
              borderRadius: '10px',
              border: '1px solid var(--border-light)',
              width: '100%',
              marginTop: '0.25rem'
            }}>
              <button
                type="button"
                onClick={() => setHodApprovalSubTab('regularization')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem',
                  padding: '0.55rem 0.9rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: hodApprovalSubTab === 'regularization' ? 'var(--accent-color, #2563eb)' : 'transparent',
                  color: hodApprovalSubTab === 'regularization' ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Clock size={15} />
                <span>Punch Regularization Requests</span>
                <span style={{
                  background: hodApprovalSubTab === 'regularization' ? 'rgba(255,255,255,0.25)' : 'var(--border-light)',
                  color: hodApprovalSubTab === 'regularization' ? '#ffffff' : 'var(--text-secondary)',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '8px',
                  fontSize: '0.72rem',
                  fontWeight: 800
                }}>
                  {hodCounts.pending}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setHodApprovalSubTab('leaves')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem',
                  padding: '0.55rem 0.9rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: hodApprovalSubTab === 'leaves' ? 'var(--accent-color, #2563eb)' : 'transparent',
                  color: hodApprovalSubTab === 'leaves' ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Calendar size={15} />
                <span>🌴 Leave Applications</span>
                <span style={{
                  background: hodApprovalSubTab === 'leaves' ? 'rgba(255,255,255,0.25)' : 'var(--border-light)',
                  color: hodApprovalSubTab === 'leaves' ? '#ffffff' : 'var(--text-secondary)',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '8px',
                  fontSize: '0.72rem',
                  fontWeight: 800
                }}>
                  {hodLeaveCounts.pending}
                </span>
              </button>
            </div>

            {/* 1. Regularization Filters */}
            {hodApprovalSubTab === 'regularization' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem', width: '100%', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-primary)', padding: '0.25rem', borderRadius: '10px', border: '1px solid var(--border-light)', gap: '0.25rem', flexWrap: 'wrap' }}>
                {/* 1. Pending Pill */}
                <button
                  type="button"
                  onClick={() => {
                    setHodStatusFilter('PENDING');
                    setSelectedHodRequests(new Set());
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.4rem 0.85rem',
                    borderRadius: '7px',
                    border: 'none',
                    background: hodStatusFilter === 'PENDING' ? '#fef3c7' : 'transparent',
                    color: hodStatusFilter === 'PENDING' ? '#92400e' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <Clock size={14} />
                  <span>Pending Approval</span>
                  <span style={{
                    background: hodStatusFilter === 'PENDING' ? '#f59e0b' : 'var(--border-light)',
                    color: hodStatusFilter === 'PENDING' ? '#ffffff' : 'var(--text-secondary)',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: 800
                  }}>
                    {hodCounts.pending}
                  </span>
                </button>

                {/* 2. Approved Pill */}
                <button
                  type="button"
                  onClick={() => {
                    setHodStatusFilter('APPROVED');
                    setSelectedHodRequests(new Set());
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.4rem 0.85rem',
                    borderRadius: '7px',
                    border: 'none',
                    background: hodStatusFilter === 'APPROVED' ? '#dcfce7' : 'transparent',
                    color: hodStatusFilter === 'APPROVED' ? '#166534' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>Approved History</span>
                  <span style={{
                    background: hodStatusFilter === 'APPROVED' ? '#16a34a' : 'var(--border-light)',
                    color: hodStatusFilter === 'APPROVED' ? '#ffffff' : 'var(--text-secondary)',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: 800
                  }}>
                    {hodCounts.approved}
                  </span>
                </button>

                {/* 3. Rejected Pill */}
                <button
                  type="button"
                  onClick={() => {
                    setHodStatusFilter('REJECTED');
                    setSelectedHodRequests(new Set());
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.4rem 0.85rem',
                    borderRadius: '7px',
                    border: 'none',
                    background: hodStatusFilter === 'REJECTED' ? '#fee2e2' : 'transparent',
                    color: hodStatusFilter === 'REJECTED' ? '#991b1b' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <XCircle size={14} />
                  <span>Rejected</span>
                  <span style={{
                    background: hodStatusFilter === 'REJECTED' ? '#dc2626' : 'var(--border-light)',
                    color: hodStatusFilter === 'REJECTED' ? '#ffffff' : 'var(--text-secondary)',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: 800
                  }}>
                    {hodCounts.rejected}
                  </span>
                </button>

                {/* 4. All Requests Pill */}
                <button
                  type="button"
                  onClick={() => {
                    setHodStatusFilter('ALL');
                    setSelectedHodRequests(new Set());
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.4rem 0.85rem',
                    borderRadius: '7px',
                    border: 'none',
                    background: hodStatusFilter === 'ALL' ? 'var(--accent-color, #2563eb)' : 'transparent',
                    color: hodStatusFilter === 'ALL' ? '#ffffff' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <FileSpreadsheet size={14} />
                  <span>All Requests</span>
                  <span style={{
                    background: hodStatusFilter === 'ALL' ? 'rgba(255,255,255,0.3)' : 'var(--border-light)',
                    color: hodStatusFilter === 'ALL' ? '#ffffff' : 'var(--text-secondary)',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: 800
                  }}>
                    {hodCounts.all}
                  </span>
                </button>
              </div>

              {/* Search Box */}
              <div style={{ position: 'relative', marginLeft: 'auto' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Search employee, date, reason..."
                  value={hodSearchQuery}
                  onChange={(e) => setHodSearchQuery(e.target.value)}
                  style={{
                    padding: '0.45rem 0.75rem 0.45rem 2rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    outline: 'none',
                    width: '240px'
                  }}
                />
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => fetchHodRequests(true)}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.82rem',
                  fontWeight: 600
                }}
              >
                <RefreshCw size={14} className={loadingHodRequests ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          )}

            {/* 2. Leave Applications Filters */}
            {hodApprovalSubTab === 'leaves' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem', width: '100%', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-primary)', padding: '0.25rem', borderRadius: '10px', border: '1px solid var(--border-light)', gap: '0.25rem', flexWrap: 'wrap' }}>
                  {/* 1. Pending Pill */}
                  <button
                    type="button"
                    onClick={() => setHodLeaveFilter('PENDING')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.4rem 0.85rem',
                      borderRadius: '7px',
                      border: 'none',
                      background: hodLeaveFilter === 'PENDING' ? '#fef3c7' : 'transparent',
                      color: hodLeaveFilter === 'PENDING' ? '#92400e' : 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <Clock size={14} />
                    <span>Pending Leave Approval</span>
                    <span style={{
                      background: hodLeaveFilter === 'PENDING' ? '#f59e0b' : 'var(--border-light)',
                      color: hodLeaveFilter === 'PENDING' ? '#ffffff' : 'var(--text-secondary)',
                      padding: '0.1rem 0.45rem',
                      borderRadius: '10px',
                      fontSize: '0.72rem',
                      fontWeight: 800
                    }}>
                      {hodLeaveCounts.pending}
                    </span>
                  </button>

                  {/* 2. Approved Pill */}
                  <button
                    type="button"
                    onClick={() => setHodLeaveFilter('APPROVED')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.4rem 0.85rem',
                      borderRadius: '7px',
                      border: 'none',
                      background: hodLeaveFilter === 'APPROVED' ? '#dcfce7' : 'transparent',
                      color: hodLeaveFilter === 'APPROVED' ? '#166534' : 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <CheckCircle2 size={14} />
                    <span>Approved Leaves</span>
                    <span style={{
                      background: hodLeaveFilter === 'APPROVED' ? '#16a34a' : 'var(--border-light)',
                      color: hodLeaveFilter === 'APPROVED' ? '#ffffff' : 'var(--text-secondary)',
                      padding: '0.1rem 0.45rem',
                      borderRadius: '10px',
                      fontSize: '0.72rem',
                      fontWeight: 800
                    }}>
                      {hodLeaveCounts.approved}
                    </span>
                  </button>

                  {/* 3. Rejected Pill */}
                  <button
                    type="button"
                    onClick={() => setHodLeaveFilter('REJECTED')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.4rem 0.85rem',
                      borderRadius: '7px',
                      border: 'none',
                      background: hodLeaveFilter === 'REJECTED' ? '#fee2e2' : 'transparent',
                      color: hodLeaveFilter === 'REJECTED' ? '#991b1b' : 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <XCircle size={14} />
                    <span>Rejected</span>
                    <span style={{
                      background: hodLeaveFilter === 'REJECTED' ? '#dc2626' : 'var(--border-light)',
                      color: hodLeaveFilter === 'REJECTED' ? '#ffffff' : 'var(--text-secondary)',
                      padding: '0.1rem 0.45rem',
                      borderRadius: '10px',
                      fontSize: '0.72rem',
                      fontWeight: 800
                    }}>
                      {hodLeaveCounts.rejected}
                    </span>
                  </button>

                  {/* 4. All Leaves Pill */}
                  <button
                    type="button"
                    onClick={() => setHodLeaveFilter('ALL')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.4rem 0.85rem',
                      borderRadius: '7px',
                      border: 'none',
                      background: hodLeaveFilter === 'ALL' ? 'var(--accent-color, #2563eb)' : 'transparent',
                      color: hodLeaveFilter === 'ALL' ? '#ffffff' : 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <FileSpreadsheet size={14} />
                    <span>All Applications</span>
                    <span style={{
                      background: hodLeaveFilter === 'ALL' ? 'rgba(255,255,255,0.3)' : 'var(--border-light)',
                      color: hodLeaveFilter === 'ALL' ? '#ffffff' : 'var(--text-secondary)',
                      padding: '0.1rem 0.45rem',
                      borderRadius: '10px',
                      fontSize: '0.72rem',
                      fontWeight: 800
                    }}>
                      {hodLeaveCounts.all}
                    </span>
                  </button>
                </div>

                {/* Search Box */}
                <div style={{ position: 'relative', marginLeft: 'auto' }}>
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    placeholder="Search employee, leave type, reason..."
                    value={hodLeaveSearch}
                    onChange={(e) => setHodLeaveSearch(e.target.value)}
                    style={{
                      padding: '0.45rem 0.75rem 0.45rem 2rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      outline: 'none',
                      width: '240px'
                    }}
                  />
                </div>

                {/* Refresh Button */}
                <button
                  type="button"
                  onClick={() => fetchHodLeaves()}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.82rem',
                    fontWeight: 600
                  }}
                >
                  <RefreshCw size={14} className={loadingHodLeaves ? 'animate-spin' : ''} /> Refresh
                </button>

                {/* Grant CPL Credit Button */}
                <button
                  type="button"
                  onClick={() => setCplGrantModal({ show: true, email: '', empName: '', days: 1.0, reason: '', workDate: getTodayDateString(), validityDays: 60 })}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#4f46e5',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)'
                  }}
                >
                  <Award size={14} /> ➕ Grant CPL Credit
                </button>
              </div>
            )}
          </div>

          {/* Conditional Sub-Tab Views */}
          {hodApprovalSubTab === 'regularization' && (
            <>
              {/* Bulk Action Toolbar */}
          {selectedHodRequests.size > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1.25rem',
              marginBottom: '1rem',
              borderRadius: '12px',
              background: 'rgba(37, 99, 235, 0.08)',
              border: '1px solid #3b82f6',
              color: 'var(--text-primary)',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.88rem' }}>
                <CheckCircle2 size={18} color="#2563eb" />
                <span><strong>{selectedHodRequests.size}</strong> pending requests selected</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setBulkActionModal({ type: 'APPROVE', count: selectedHodRequests.size })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.45rem 0.9rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#16a34a',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.3)'
                  }}
                >
                  <Check size={15} /> Batch Approve ({selectedHodRequests.size})
                </button>
                <button
                  type="button"
                  onClick={() => setBulkActionModal({ type: 'REJECT', count: selectedHodRequests.size })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.45rem 0.9rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#dc2626',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(220, 38, 38, 0.3)'
                  }}
                >
                  <X size={15} /> Batch Reject ({selectedHodRequests.size})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedHodRequests(new Set())}
                  style={{
                    padding: '0.45rem 0.8rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Deselect All
                </button>
              </div>
            </div>
          )}

          {/* Pending Requests Cards / Table */}
          <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
            <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
              <MobileTableView id="Attendance/AttendanceModule-3"><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 0.6rem', width: '38px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={
                          filteredHodRequests.filter(r => r.status === 'PENDING').length > 0 &&
                          filteredHodRequests.filter(r => r.status === 'PENDING').every(r => selectedHodRequests.has(r.id))
                        }
                        onChange={toggleSelectAllPendingRequests}
                        title="Select / Deselect all pending requests"
                        style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#2563eb' }}
                      />
                    </th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Employee</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Date of Missing Punch</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Missing Type</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Proposed In / Out Times</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Reason & Explanation</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>HOD Action / Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHodRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No regularization requests found in <strong>{hodStatusFilter === 'ALL' ? 'All Requests' : hodStatusFilter}</strong>.
                      </td>
                    </tr>
                  ) : (
                    filteredHodRequests.map((r, idx) => {
                      const reqInFormatted = r.requested_in_time ? formatTimeIST(r.requested_in_time) : '—';
                      const reqOutFormatted = r.requested_out_time ? formatTimeIST(r.requested_out_time) : '—';

                      return (
                        <tr key={r.id || idx} style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: selectedHodRequests.has(r.id) ? 'rgba(37, 99, 235, 0.05)' : (idx % 2 === 0 ? 'transparent' : 'var(--table-alt-row, rgba(0,0,0,0.01))') }}>
                          <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center' }}>
                            {r.status === 'PENDING' ? (
                              <input
                                type="checkbox"
                                checked={selectedHodRequests.has(r.id)}
                                onChange={() => toggleSelectHodRequest(r.id)}
                                style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#2563eb' }}
                              />
                            ) : (
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.emp_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{r.email} • {r.department || 'General'}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                            {r.attendance_date}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', fontWeight: 600 }}>
                              {r.request_type === 'MISSED_IN' ? 'Missed In Time' : (r.request_type === 'MISSED_OUT' ? 'Missed Out Time' : 'Missed Both')}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.8rem' }}>
                              {r.request_type !== 'MISSED_OUT' && (
                                <div><strong style={{ color: '#16a34a' }}>In:</strong> {reqInFormatted}</div>
                              )}
                              {r.request_type !== 'MISSED_IN' && (
                                <div><strong style={{ color: '#dc2626' }}>Out:</strong> {reqOutFormatted}</div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', maxWidth: '240px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8rem' }}>{r.reason_type}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem', lineHeight: 1.3 }}>
                              "{r.reason_details}"
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {r.status === 'PENDING' && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.65rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, background: '#fef3c7', color: '#92400e' }}>
                                <Clock size={12} /> Pending Review
                              </span>
                            )}
                            {r.status === 'APPROVED' && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.65rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, background: '#dcfce7', color: '#166534' }}>
                                <CheckCircle2 size={12} /> Approved
                              </span>
                            )}
                            {r.status === 'REJECTED' && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.65rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, background: '#fee2e2', color: '#991b1b' }}>
                                <XCircle size={12} /> Rejected
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                            {r.status === 'PENDING' ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                                <button
                                  type="button"
                                  disabled={processingAction}
                                  onClick={() => handleSingleApprove(r)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: '#16a34a',
                                    color: '#ffffff',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    cursor: processingAction ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)'
                                  }}
                                  title="Instant 1-Click Approve & Update Attendance"
                                >
                                  <Check size={14} /> Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={processingAction}
                                  onClick={() => setActionModal({ type: 'REJECT', request: r })}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '6px',
                                    border: '1px solid #fecaca',
                                    background: '#fef2f2',
                                    color: '#dc2626',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    cursor: processingAction ? 'not-allowed' : 'pointer'
                                  }}
                                  title="Reject request with reason"
                                >
                                  <X size={14} /> Reject
                                </button>
                              </div>
                            ) : r.status === 'APPROVED' ? (
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534' }}>
                                  ✓ Approved by {r.action_by_name || 'HOD'}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  {formatDateIST(r.action_at || r.updated_at, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                                </div>
                                {r.action_remarks && (
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                    "{r.action_remarks}"
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#991b1b' }}>
                                  ✕ Rejected by {r.action_by_name || 'HOD'}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  {formatDateIST(r.action_at || r.updated_at, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                                </div>
                                {r.action_remarks && (
                                  <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600 }}>
                                    Reason: "{r.action_remarks}"
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table></MobileTableView>
            </div>
          </div>
        </>
      )}

      {/* 2. Leave Applications Sub-Tab Content */}
      {hodApprovalSubTab === 'leaves' && (
        <div className="card" style={{
          padding: '1.25rem',
          background: 'var(--bg-surface)',
          borderRadius: '16px',
          border: '1px solid var(--border-light)'
        }}>
          <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
            <MobileTableView tableId="hod_leave_applications_table">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Employee</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Leave Type</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Duration</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Reason</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Applied On</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHodLeaveRequests.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <Calendar size={36} style={{ margin: '0 auto 0.75rem auto', opacity: 0.35, display: 'block' }} />
                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>No leave applications found</div>
                        <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                          {hodLeaveFilter === 'PENDING' ? 'All leave applications have been reviewed.' : 'No records match the current filter.'}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredHodLeaveRequests.map((r) => {
                      const typeColor = r.leave_type === 'CL' ? '#2563eb' : r.leave_type === 'SL' ? '#16a34a' : r.leave_type === 'EL' ? '#9333ea' : r.leave_type === 'HD-L' ? '#d97706' : '#6b7280';
                      const typeBg = r.leave_type === 'CL' ? '#eff6ff' : r.leave_type === 'SL' ? '#f0fdf4' : r.leave_type === 'EL' ? '#faf5ff' : r.leave_type === 'HD-L' ? '#fef3c7' : '#f3f4f6';
                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.emp_name || 'Employee'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{r.emp_email}</div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '6px',
                              background: typeBg,
                              color: typeColor,
                              fontSize: '0.78rem',
                              fontWeight: 800
                            }}>
                              {r.leave_type} {r.half_day_session ? `(${r.half_day_session === 'FIRST_HALF' ? '1st Half' : '2nd Half'})` : ''}
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {r.from_date === r.to_date ? r.from_date : `${r.from_date} to ${r.to_date}`}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              {r.days_count} day(s)
                            </div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', maxWidth: '240px' }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                              {r.reason || '—'}
                            </div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            {formatDateIST(r.applied_at, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: r.status === 'APPROVED' ? '#dcfce7' : r.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                              color: r.status === 'APPROVED' ? '#166534' : r.status === 'REJECTED' ? '#991b1b' : '#92400e'
                            }}>
                              {r.status}
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                            {r.status === 'PENDING' ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                                <button
                                  type="button"
                                  disabled={processingLeaveAction}
                                  onClick={() => setLeaveActionModal({ type: 'APPROVE', request: r, remarks: '' })}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: '#16a34a',
                                    color: '#ffffff',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    cursor: processingLeaveAction ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)'
                                  }}
                                >
                                  <Check size={14} /> Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={processingLeaveAction}
                                  onClick={() => setLeaveActionModal({ type: 'REJECT', request: r, remarks: '' })}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '6px',
                                    border: '1px solid #fecaca',
                                    background: '#fef2f2',
                                    color: '#dc2626',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    cursor: processingLeaveAction ? 'not-allowed' : 'pointer'
                                  }}
                                >
                                  <X size={14} /> Reject
                                </button>
                              </div>
                            ) : r.status === 'APPROVED' ? (
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534' }}>
                                  ✓ Approved by {r.approver_name || 'HOD'}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  {formatDateIST(r.action_at, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                                </div>
                                {r.remarks && (
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                    "{r.remarks}"
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#991b1b' }}>
                                  ✕ Rejected by {r.approver_name || 'HOD'}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  {formatDateIST(r.action_at, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                                </div>
                                {r.remarks && (
                                  <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600 }}>
                                    Reason: "{r.remarks}"
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </MobileTableView>
          </div>
        </div>
      )}

        </div>
      )}

      {/* ========================================================================================= */}
      {/* TAB 4: TEAM MASTER ATTENDANCE REPORT (FOR HOD / ADMIN) */}
      {/* ========================================================================================= */}
      {activeTab === 'team_report' && isHodOrManager && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Master Filter & View Selector Bar */}
          <div className="card" style={{
            padding: '1.25rem',
            background: 'var(--bg-surface)',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                  {teamReportView === 'DAILY' ? 'Team Daily Attendance Report' : (teamReportView === 'LEAVE_LEDGER' ? 'All-Employee Leave Balances & Ledger Report' : 'All-Employee Monthly Attendance Matrix')}
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                  {teamReportView === 'DAILY' 
                    ? 'Live daily punch log and present/absent summary for all team members' 
                    : (teamReportView === 'LEAVE_LEDGER' ? 'Annual leave quotas, availed days, locked/unlocked EL, CPL credits, and complete transaction history' : 'Complete 1st to 31st master monthly attendance sheet with payable days & payroll calculations')}
                </p>
              </div>

              {/* View Toggle Buttons */}
              <div style={{
                display: 'inline-flex',
                background: 'var(--bg-primary)',
                padding: '0.25rem',
                borderRadius: '10px',
                border: '1px solid var(--border-light)'
              }}>
                <button
                  type="button"
                  onClick={() => setTeamReportView('DAILY')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.45rem 0.9rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: teamReportView === 'DAILY' ? 'var(--accent-color)' : 'transparent',
                    color: teamReportView === 'DAILY' ? '#ffffff' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Clock size={14} /> Daily Punch Log
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTeamReportView('MONTHLY_MATRIX');
                    if (teamStartDate) {
                      const [y, m] = teamStartDate.split('-').map(Number);
                      if (y && m) {
                        setMatrixYear(y);
                        setMatrixMonth(m);
                      }
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.45rem 0.9rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: teamReportView === 'MONTHLY_MATRIX' ? 'var(--accent-color)' : 'transparent',
                    color: teamReportView === 'MONTHLY_MATRIX' ? '#ffffff' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Calendar size={14} /> Monthly Master Matrix (1-31st)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTeamReportView('LEAVE_LEDGER');
                    fetchTeamLeaveReport();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.45rem 0.9rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: teamReportView === 'LEAVE_LEDGER' ? 'var(--accent-color)' : 'transparent',
                    color: teamReportView === 'LEAVE_LEDGER' ? '#ffffff' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Award size={14} /> 🌴 Leave Ledger & Reports
                </button>
              </div>
            </div>

            {/* Filter Controls */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    placeholder="Search Emp ID, name..."
                    value={teamSearchQuery}
                    onChange={(e) => setTeamSearchQuery(e.target.value)}
                    style={{
                      padding: '0.45rem 0.75rem 0.45rem 2rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      outline: 'none',
                      width: '190px'
                    }}
                  />
                </div>

                {teamReportView === 'DAILY' ? (
                  /* Quick Date Presets DateRangePicker */
                  <DateRangePicker
                    preset={teamDatePreset}
                    startDate={teamStartDate}
                    endDate={teamEndDate}
                    allowAllTime={true}
                    title="Select Attendance Date Range"
                    onChange={({ preset, startDate, endDate }) => {
                      setTeamDatePreset(preset);
                      setTeamStartDate(startDate);
                      setTeamEndDate(endDate);
                    }}
                  />
                ) : (
                  /* Month & Year pickers for Monthly Matrix View */
                  <>
                    <select
                      value={matrixMonth}
                      onChange={(e) => setMatrixMonth(parseInt(e.target.value, 10))}
                      style={{
                        padding: '0.45rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        outline: 'none'
                      }}
                    >
                      {[
                        { num: 1, name: 'January' },
                        { num: 2, name: 'February' },
                        { num: 3, name: 'March' },
                        { num: 4, name: 'April' },
                        { num: 5, name: 'May' },
                        { num: 6, name: 'June' },
                        { num: 7, name: 'July' },
                        { num: 8, name: 'August' },
                        { num: 9, name: 'September' },
                        { num: 10, name: 'October' },
                        { num: 11, name: 'November' },
                        { num: 12, name: 'December' }
                      ].map(m => (
                        <option key={m.num} value={m.num}>{m.name}</option>
                      ))}
                    </select>

                    <select
                      value={matrixYear}
                      onChange={(e) => setMatrixYear(parseInt(e.target.value, 10))}
                      style={{
                        padding: '0.45rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        outline: 'none'
                      }}
                    >
                      {[2024, 2025, 2026, 2027].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>

                    {/* Leave Adjustment in Salary Toggle Button */}
                    <button
                      type="button"
                      onClick={() => setAdjustLeavesInReport(!adjustLeavesInReport)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.4rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid ' + (adjustLeavesInReport ? '#86efac' : 'var(--border-light)'),
                        background: adjustLeavesInReport ? '#f0fdf4' : 'var(--bg-primary)',
                        color: adjustLeavesInReport ? '#166534' : 'var(--text-secondary)',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                      title="Toggle whether approved employee leaves count as Paid working days in Salary"
                    >
                      <Calendar size={13} />
                      <span>Leaves in Salary: <strong>{adjustLeavesInReport ? '🟢 Adjusted (Paid)' : '⚪ Raw Attendance'}</strong></span>
                    </button>
                  </>
                )}

                {/* Department Filter */}
                <select
                  value={teamMasterDepartment}
                  onChange={(e) => setTeamMasterDepartment(e.target.value)}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    outline: 'none'
                  }}
                >
                  {availableDepartments.map(dept => (
                    <option key={dept} value={dept}>
                      {dept === 'All' ? 'All Departments' : dept}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons: Refresh & CSV Export */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={teamReportView === 'DAILY' ? fetchTeamMaster : fetchTeamMonthlyMatrix}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontSize: '0.82rem'
                  }}
                >
                  <RefreshCw size={14} className={(loadingTeamMaster || loadingMonthlyMatrix) ? 'animate-spin' : ''} /> Refresh
                </button>

                <button
                  type="button"
                  onClick={teamReportView === 'DAILY' ? handleExportCSV : handleExportMonthlyMatrixCSV}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#16a34a',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Download size={14} /> {teamReportView === 'DAILY' ? (teamStartDate !== teamEndDate ? 'Export Range CSV' : 'Export Daily CSV') : 'Export Monthly Excel / CSV'}
                </button>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* VIEW 1: DAILY / RANGE VIEW */}
          {/* ========================================================================= */}
          {teamReportView === 'DAILY' && (
            <>
              {/* Summary KPIs */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '0.75rem'
              }}>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>
                    {teamStartDate !== teamEndDate ? 'TOTAL RECORDS' : 'TOTAL EMPLOYEES'}
                  </span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {teamStartDate !== teamEndDate ? teamFilteredSummary.totalRecords : teamFilteredSummary.totalEmployees}
                  </span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>PRESENT</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#16a34a' }}>{teamFilteredSummary.totalPresent}</span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>LATE IN</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#d97706' }}>{teamFilteredSummary.totalLate}</span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>HALF DAY</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ea580c' }}>{teamFilteredSummary.totalHalfDay}</span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>ABSENT</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{teamFilteredSummary.totalAbsent}</span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>WEEK OFF</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#9333ea' }}>{teamFilteredSummary.totalWeekOff}</span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>REGULARIZED</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#4f46e5' }}>{teamFilteredSummary.totalRegularized}</span>
                </div>
              </div>

              {/* Master Team Attendance Table */}
              <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <MobileTableView id="Attendance/AttendanceModule-4"><table style={{ width: `${getTeamTotalWidth()}px`, tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                        <th style={{ width: `${teamColWidths.emp_code}px`, padding: '0.65rem 0.75rem', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                            <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Emp ID</span>
                          </div>
                          <ColumnResizer colKey="emp_code" isResizing={teamResizingCol === 'emp_code'} onResizeStart={handleTeamResizeStart} onReset={resetTeamColWidth} />
                        </th>
                        <th style={{ width: `${teamColWidths.emp_name}px`, padding: '0.65rem 0.75rem', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                            <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Employee Name</span>
                          </div>
                          <ColumnResizer colKey="emp_name" isResizing={teamResizingCol === 'emp_name'} onResizeStart={handleTeamResizeStart} onReset={resetTeamColWidth} />
                        </th>
                        {teamStartDate !== teamEndDate && (
                          <th style={{ width: `${teamColWidths.date}px`, padding: '0.65rem 0.75rem', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                              <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Date</span>
                            </div>
                            <ColumnResizer colKey="date" isResizing={teamResizingCol === 'date'} onResizeStart={handleTeamResizeStart} onReset={resetTeamColWidth} />
                          </th>
                        )}
                        <th style={{ width: `${teamColWidths.email}px`, padding: '0.65rem 0.75rem', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                            <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Email</span>
                          </div>
                          <ColumnResizer colKey="email" isResizing={teamResizingCol === 'email'} onResizeStart={handleTeamResizeStart} onReset={resetTeamColWidth} />
                        </th>
                        <th style={{ width: `${teamColWidths.department}px`, padding: '0.65rem 0.75rem', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                            <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Department</span>
                          </div>
                          <ColumnResizer colKey="department" isResizing={teamResizingCol === 'department'} onResizeStart={handleTeamResizeStart} onReset={resetTeamColWidth} />
                        </th>
                        <th style={{ width: `${teamColWidths.in_time}px`, padding: '0.65rem 0.75rem', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                            <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Punch In</span>
                          </div>
                          <ColumnResizer colKey="in_time" isResizing={teamResizingCol === 'in_time'} onResizeStart={handleTeamResizeStart} onReset={resetTeamColWidth} />
                        </th>
                        <th style={{ width: `${teamColWidths.out_time}px`, padding: '0.65rem 0.75rem', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                            <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Punch Out</span>
                          </div>
                          <ColumnResizer colKey="out_time" isResizing={teamResizingCol === 'out_time'} onResizeStart={handleTeamResizeStart} onReset={resetTeamColWidth} />
                        </th>
                        <th style={{ width: `${teamColWidths.duration}px`, padding: '0.65rem 0.75rem', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                            <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Duration</span>
                          </div>
                          <ColumnResizer colKey="duration" isResizing={teamResizingCol === 'duration'} onResizeStart={handleTeamResizeStart} onReset={resetTeamColWidth} />
                        </th>
                        <th style={{ width: `${teamColWidths.status}px`, padding: '0.65rem 0.75rem', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                            <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Status</span>
                          </div>
                          <ColumnResizer colKey="status" isResizing={teamResizingCol === 'status'} onResizeStart={handleTeamResizeStart} onReset={resetTeamColWidth} />
                        </th>
                        <th style={{ width: `${teamColWidths.regularization}px`, padding: '0.65rem 0.75rem', fontWeight: 600, position: 'relative', boxSizing: 'border-box', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                            <span style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, fontSize: '0.78rem' }}>Regularization</span>
                          </div>
                          <ColumnResizer colKey="regularization" isResizing={teamResizingCol === 'regularization'} onResizeStart={handleTeamResizeStart} onReset={resetTeamColWidth} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeamRecords.length === 0 ? (
                        <tr>
                          <td colSpan={teamStartDate !== teamEndDate ? 10 : 9} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No records found for {teamStartDate === teamEndDate ? teamStartDate : `${teamStartDate} to ${teamEndDate}`}.
                          </td>
                        </tr>
                      ) : (
                        filteredTeamRecords.map((r, idx) => (
                          <tr key={r.id || `${r.email}_${r.attendance_date}_${idx}`} style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--table-alt-row, rgba(0,0,0,0.01))' }}>
                            <td style={{ width: `${teamColWidths.emp_code}px`, padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--accent-color)', fontFamily: 'monospace', fontSize: '0.82rem', boxSizing: 'border-box', wordBreak: 'break-all', whiteSpace: 'normal', verticalAlign: 'top' }} title={r.emp_code || '—'}>
                              {r.emp_code || '—'}
                            </td>
                            <td style={{ width: `${teamColWidths.emp_name}px`, padding: '0.75rem 1rem', fontWeight: 600, boxSizing: 'border-box', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.3, verticalAlign: 'top' }} title={r.emp_name}>
                              {r.emp_name}
                            </td>
                            {teamStartDate !== teamEndDate && (
                              <td style={{ width: `${teamColWidths.date}px`, padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--accent-color)', whiteSpace: 'nowrap', boxSizing: 'border-box', verticalAlign: 'top' }} title={r.attendance_date}>
                                {r.attendance_date}
                              </td>
                            )}
                            <td style={{ width: `${teamColWidths.email}px`, padding: '0.75rem 1rem', color: 'var(--text-secondary)', boxSizing: 'border-box', wordBreak: 'break-all', whiteSpace: 'normal', lineHeight: 1.3, verticalAlign: 'top' }} title={r.email}>
                              {r.email}
                            </td>
                            <td style={{ width: `${teamColWidths.department}px`, padding: '0.75rem 1rem', color: 'var(--text-secondary)', boxSizing: 'border-box', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.3, verticalAlign: 'top' }} title={r.department || 'General'}>
                              {r.department || 'General'}
                            </td>
                            <td style={{ width: `${teamColWidths.in_time}px`, padding: '0.75rem 1rem', color: r.in_time ? '#16a34a' : 'var(--text-secondary)', fontWeight: r.in_time ? 600 : 400, whiteSpace: 'nowrap', boxSizing: 'border-box', verticalAlign: 'top' }} title={r.in_time ? formatTimeIST(r.in_time) : '—'}>
                              {r.in_time ? formatTimeIST(r.in_time) : '—'}
                            </td>
                            <td style={{ width: `${teamColWidths.out_time}px`, padding: '0.75rem 1rem', color: r.out_time ? '#dc2626' : 'var(--text-secondary)', fontWeight: r.out_time ? 600 : 400, whiteSpace: 'nowrap', boxSizing: 'border-box', verticalAlign: 'top' }} title={r.out_time ? formatTimeIST(r.out_time) : '—'}>
                              {r.out_time 
                                ? formatTimeIST(r.out_time) 
                                : (r.attendance_date === getTodayDateString() ? (r.in_time ? 'Working...' : '—') : (r.in_time ? 'Missed Out' : '—'))
                              }
                            </td>
                            <td style={{ width: `${teamColWidths.duration}px`, padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--accent-color)', whiteSpace: 'nowrap', boxSizing: 'border-box', verticalAlign: 'top' }} title={formatMinutesToHours(r.total_working_minutes)}>
                              {formatMinutesToHours(r.total_working_minutes)}
                            </td>
                            <td style={{ width: `${teamColWidths.status}px`, padding: '0.75rem 1rem', boxSizing: 'border-box', verticalAlign: 'top' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }}>
                                {renderStatusBadge(r.status, r.is_regularized, r.remarks)}
                                {renderShortLeaveBadge(r)}
                              </div>
                            </td>
                            <td style={{ width: `${teamColWidths.regularization}px`, padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', boxSizing: 'border-box', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.3, verticalAlign: 'top' }} title={r.is_regularized ? 'Yes (HOD Approved)' : 'No'}>
                              {r.is_regularized ? 'Yes (HOD Approved)' : 'No'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table></MobileTableView>
                </div>
              </div>
            </>
          )}

          {/* VIEW 3: TEAM LEAVE BALANCES & AUDIT LEDGER REPORT */}
          {teamReportView === 'LEAVE_LEDGER' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* KPI Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem'
              }}>
                <div className="card" style={{ padding: '1rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Total Employees</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                    {teamLeaveReportData?.kpis?.totalEmployees ?? 0}
                  </div>
                </div>
                <div className="card" style={{ padding: '1rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', borderLeft: '4px solid #16a34a' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Total Leaves Availed</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a', marginTop: '0.2rem' }}>
                    {teamLeaveReportData?.kpis?.totalLeavesTaken ?? 0} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>days</span>
                  </div>
                </div>
                <div className="card" style={{ padding: '1rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', borderLeft: '4px solid #f59e0b' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Pending Approvals</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#d97706', marginTop: '0.2rem' }}>
                    {teamLeaveReportData?.kpis?.pendingApprovals ?? 0}
                  </div>
                </div>
                <div className="card" style={{ padding: '1rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-light)', borderLeft: '4px solid #4f46e5' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Active CPL Pool</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4f46e5', marginTop: '0.2rem' }}>
                    {teamLeaveReportData?.kpis?.activeCplPool ?? 0} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>days</span>
                  </div>
                </div>
              </div>

              {/* Action & Export Bar */}
              <div className="card" style={{
                padding: '1rem 1.25rem',
                background: 'var(--bg-surface)',
                borderRadius: '12px',
                border: '1px solid var(--border-light)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {/* Department Filter */}
                  <select
                    value={leaveReportDept}
                    onChange={(e) => {
                      setLeaveReportDept(e.target.value);
                    }}
                    style={{
                      padding: '0.45rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      outline: 'none'
                    }}
                  >
                    <option value="All">All Departments</option>
                    {availableDepartments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>

                  {/* Search Input */}
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input
                      type="text"
                      placeholder="Search employee or code..."
                      value={leaveReportSearch}
                      onChange={(e) => setLeaveReportSearch(e.target.value)}
                      style={{
                        padding: '0.45rem 0.75rem 0.45rem 2rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.82rem',
                        outline: 'none',
                        width: '200px'
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => fetchTeamLeaveReport()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.45rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      cursor: 'pointer'
                    }}
                  >
                    <RefreshCw size={13} className={loadingLeaveReport ? 'animate-spin' : ''} /> Refresh
                  </button>
                </div>

                {/* CSV Export Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleExportLeaveRosterCSV}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid #bbf7d0',
                      background: '#f0fdf4',
                      color: '#166534',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    <Download size={14} /> 📥 Export Balances CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleExportLeaveHistoryCSV}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid #e9d5ff',
                      background: '#faf5ff',
                      color: '#6b21a8',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    <Download size={14} /> 📥 Export Audit Log CSV
                  </button>
                </div>
              </div>

              {/* Table 1: All-Employee Leave Balance Ledger */}
              <div className="card" style={{
                padding: '1.25rem',
                background: 'var(--bg-surface)',
                borderRadius: '16px',
                border: '1px solid var(--border-light)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={18} color="var(--accent-color, #2563eb)" />
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>All-Employee Leave Balances Ledger</h3>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>Annual Quota vs Balance</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Total: {teamLeaveReportData?.roster?.length || 0} employees
                  </span>
                </div>

                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <MobileTableView tableId="team_leave_balances_roster">
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600 }}>Employee</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600 }}>Department</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600 }}>Joining & Tenure</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600, color: '#2563eb' }}>CL (Left / Quota)</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600, color: '#16a34a' }}>SL (Left / Quota)</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600, color: '#9333ea' }}>EL (Left / Quota)</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600, color: '#4f46e5' }}>CPL (Avail / Earned)</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600, color: '#4b5563' }}>LWP</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700 }}>Total Availed</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!teamLeaveReportData?.roster || teamLeaveReportData.roster.length === 0) ? (
                          <tr>
                            <td colSpan={10} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                              <Users size={32} style={{ margin: '0 auto 0.5rem auto', opacity: 0.35, display: 'block' }} />
                              <div>No employee records found.</div>
                            </td>
                          </tr>
                        ) : (
                          teamLeaveReportData.roster
                            .filter(r => {
                              if (!leaveReportSearch.trim()) return true;
                              const q = leaveReportSearch.toLowerCase().trim();
                              return (
                                (r.empName && r.empName.toLowerCase().includes(q)) ||
                                (r.empCode && r.empCode.toLowerCase().includes(q)) ||
                                (r.email && r.email.toLowerCase().includes(q)) ||
                                (r.department && r.department.toLowerCase().includes(q))
                              );
                            })
                            .map((r, idx) => (
                              <tr key={r.userId || idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                <td style={{ padding: '0.75rem 0.85rem' }}>
                                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.empName}</div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{r.email} {r.empCode ? `• ${r.empCode}` : ''}</div>
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem' }}>
                                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '6px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                                    {r.department}
                                  </span>
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  <div>{r.doj ? formatDateIST(r.doj, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
                                  <div>{r.tenureMonths} month(s)</div>
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: '#2563eb' }}>
                                  {r.cl?.balance ?? 8} <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ {r.cl?.quota ?? 8}</span>
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: '#16a34a' }}>
                                  {r.sl?.balance ?? 6} <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ {r.sl?.quota ?? 6}</span>
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem' }}>
                                  {r.el?.status === 'LOCKED' ? (
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                                      🔒 1-Yr Lock
                                    </span>
                                  ) : (
                                    <span style={{ fontWeight: 700, color: '#9333ea' }}>
                                      {r.el?.balance ?? 15} <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ {r.el?.quota ?? 15}</span>
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: '#4f46e5' }}>
                                  {r.cpl?.balance ?? 0} <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ {r.cpl?.earned ?? 0}</span>
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', color: '#4b5563' }}>
                                  {r.lwp?.availed ?? 0} d
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                  {r.totalLeavesAvailed ?? 0} d
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>
                                  <button
                                    type="button"
                                    onClick={() => setCplGrantModal({
                                      show: true,
                                      email: r.email,
                                      empName: r.empName,
                                      days: 1.0,
                                      reason: 'Sunday / Holiday extra work credit',
                                      workDate: getTodayDateString(),
                                      validityDays: 60
                                    })}
                                    style={{
                                      padding: '0.25rem 0.55rem',
                                      borderRadius: '6px',
                                      border: '1px solid #c7d2fe',
                                      background: '#eef2ff',
                                      color: '#4338ca',
                                      fontSize: '0.75rem',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    + Grant CPL
                                  </button>
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </MobileTableView>
                </div>
              </div>

              {/* Table 2: Leave Applications Transaction Audit Log */}
              <div className="card" style={{
                padding: '1.25rem',
                background: 'var(--bg-surface)',
                borderRadius: '16px',
                border: '1px solid var(--border-light)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Calendar size={18} color="#9333ea" />
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Leave Applications Audit History Log</h3>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Total requests: {teamLeaveReportData?.history?.length || 0}
                  </span>
                </div>

                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <MobileTableView tableId="team_leave_history_audit">
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600 }}>Employee</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600 }}>Type</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600 }}>Duration</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600 }}>Days</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600 }}>Reason</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600 }}>Status</th>
                          <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600 }}>Action Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!teamLeaveReportData?.history || teamLeaveReportData.history.length === 0) ? (
                          <tr>
                            <td colSpan={7} style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                              <div>No leave history records logged yet.</div>
                            </td>
                          </tr>
                        ) : (
                          teamLeaveReportData.history.map((h) => (
                            <tr key={h.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                              <td style={{ padding: '0.75rem 0.85rem' }}>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{h.emp_name}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{h.email}</div>
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '5px',
                                  fontSize: '0.75rem',
                                  fontWeight: 800,
                                  background: h.leave_type === 'CL' ? '#eff6ff' : h.leave_type === 'SL' ? '#f0fdf4' : h.leave_type === 'EL' ? '#faf5ff' : h.leave_type === 'CPL' ? '#eef2ff' : '#f3f4f6',
                                  color: h.leave_type === 'CL' ? '#2563eb' : h.leave_type === 'SL' ? '#16a34a' : h.leave_type === 'EL' ? '#9333ea' : h.leave_type === 'CPL' ? '#4f46e5' : '#4b5563'
                                }}>
                                  {h.leave_type}
                                </span>
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', fontSize: '0.78rem' }}>
                                {h.from_date === h.to_date ? h.from_date : `${h.from_date} to ${h.to_date}`}
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700 }}>
                                {h.total_days} d
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '220px' }}>
                                {h.reason || '—'}
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '5px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: h.status === 'APPROVED' ? '#dcfce7' : h.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                                  color: h.status === 'APPROVED' ? '#166534' : h.status === 'REJECTED' ? '#991b1b' : '#92400e'
                                }}>
                                  {h.status}
                                </span>
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {h.approver_name ? (
                                  <div>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{h.approver_name}</div>
                                    <div>{h.approver_remarks || ''}</div>
                                  </div>
                                ) : '—'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </MobileTableView>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 2: MONTHLY MASTER MATRIX VIEW (1-31ST GRID) */}
          {/* ========================================================================= */}
          {teamReportView === 'MONTHLY_MATRIX' && (
            <>
              {/* Monthly Matrix Summary KPIs */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '0.75rem'
              }}>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>TOTAL EMPLOYEES</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{monthlyMatrixData?.summary?.totalEmployees || 0}</span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>DAYS IN MONTH</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent-color)' }}>{monthlyMatrixData?.daysInMonth || 31}</span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>WORKING DAYS</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#16a34a' }}>
                    {(monthlyMatrixData?.monthDates || []).filter(d => !d.isSunday).length}
                  </span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>SUNDAYS / OFF DAYS</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#64748b' }}>
                    {(monthlyMatrixData?.monthDates || []).filter(d => d.isSunday).length}
                  </span>
                </div>
              </div>

              {/* Legend Bar & Sunday Policy Explanation */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                padding: '0.85rem 1.15rem',
                background: 'var(--bg-surface)',
                borderRadius: '12px',
                border: '1px solid var(--border-light)',
                fontSize: '0.75rem'
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Status Key:</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#dcfce7', color: '#166534', fontWeight: 700 }}>P</span> Present
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#fee2e2', color: '#991b1b', fontWeight: 700 }}>A</span> Absent (&lt; 4:30h / Sunday Disallowed)
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#ffedd5', color: '#9a3412', fontWeight: 700 }}>HD</span> Half Day
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#f3e8ff', color: '#7e22ce', fontWeight: 700 }}>SL</span> Short Leave
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#e0e7ff', color: '#3730a3', fontWeight: 700 }}>R</span> Regularized
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#f1f5f9', color: '#64748b', fontWeight: 700 }}>WO</span> Paid Week Off
                  </span>
                </div>
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  alignItems: 'center', 
                  gap: '1rem', 
                  paddingTop: '0.4rem', 
                  borderTop: '1px dashed var(--border-light)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.72rem'
                }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-color)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>policy</span> Sunday Rules Active:
                  </span>
                  <span>• <strong>Rule 1</strong>: Week me min. 3 days present hona mandatory hai, varna Sunday Absent count hoga.</span>
                  <span>• <strong>Rule 2 (Sandwich)</strong>: Saturday &amp; Monday dono din absent/leave hone par Sunday Absent count hoga.</span>
                </div>
              </div>

              {/* Monthly Master Matrix Grid Table */}
              <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-light)', maxHeight: '680px', overflowY: 'auto' }}>
                  <MobileTableView id="Attendance/AttendanceModule-5"><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.78rem' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg-primary)' }}>
                      <tr style={{ borderBottom: '2px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, textAlign: 'left', minWidth: '90px', position: 'sticky', left: 0, background: 'var(--bg-primary)', zIndex: 4 }}>Emp ID</th>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, textAlign: 'left', minWidth: '140px', position: 'sticky', left: '90px', background: 'var(--bg-primary)', zIndex: 4 }}>Employee Name</th>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, textAlign: 'left', minWidth: '100px' }}>Dept</th>

                        {/* Date Columns 1 to Last Day */}
                        {(monthlyMatrixData?.monthDates || []).map(d => (
                          <th 
                            key={d.dateStr} 
                            style={{
                              padding: '0.4rem 0.25rem',
                              fontWeight: 700,
                              minWidth: '34px',
                              background: d.isSunday ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-primary)',
                              color: d.isSunday ? '#dc2626' : 'var(--text-primary)',
                              borderLeft: '1px solid var(--border-light)'
                            }}
                          >
                            <div style={{ fontSize: '0.8rem' }}>{d.dayNumber}</div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 500, color: d.isSunday ? '#dc2626' : 'var(--text-secondary)' }}>{d.dayNameShort}</div>
                          </th>
                        ))}

                        {/* Summary Column Headers */}
                        <th style={{ padding: '0.65rem 0.5rem', fontWeight: 700, color: '#16a34a', borderLeft: '2px solid var(--border-light)', minWidth: '45px' }}>P</th>
                        <th style={{ padding: '0.65rem 0.5rem', fontWeight: 700, color: '#ef4444', minWidth: '45px' }}>A</th>
                        <th style={{ padding: '0.65rem 0.5rem', fontWeight: 700, color: '#ea580c', minWidth: '45px' }}>HD</th>
                        <th style={{ padding: '0.65rem 0.5rem', fontWeight: 700, color: '#7e22ce', minWidth: '45px' }}>SL</th>
                        <th style={{ padding: '0.65rem 0.5rem', fontWeight: 700, color: '#059669', minWidth: '45px' }} title="Approved Paid Leaves (CL/SL/EL)">L</th>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 800, color: '#16a34a', background: 'rgba(22, 163, 74, 0.08)', minWidth: '70px' }}>Payable</th>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: 'var(--accent-color)', minWidth: '75px' }}>Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMatrixRows.length === 0 ? (
                        <tr>
                          <td colSpan={(monthlyMatrixData?.monthDates?.length || 31) + 9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No employee records found for {matrixMonth}/{matrixYear}.
                          </td>
                        </tr>
                      ) : (
                        filteredMatrixRows.map((row, idx) => (
                          <tr 
                            key={row.email || idx} 
                            style={{ 
                              borderBottom: '1px solid var(--border-light)', 
                              backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--table-alt-row, rgba(0,0,0,0.01))' 
                            }}
                          >
                            <td style={{ padding: '0.55rem 0.75rem', fontWeight: 700, color: 'var(--accent-color)', fontFamily: 'monospace', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 2 }}>
                              {row.emp_id || '—'}
                            </td>
                            <td style={{ padding: '0.55rem 0.75rem', fontWeight: 600, textAlign: 'left', position: 'sticky', left: '90px', background: 'var(--bg-surface)', zIndex: 2 }}>
                              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px' }} title={row.emp_name}>
                                {row.emp_name}
                              </div>
                            </td>
                            <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-secondary)', textAlign: 'left' }}>
                              {row.department}
                            </td>

                            {/* 1st to Last Day Cells */}
                            {(row.days || []).map((day, dIdx) => {
                              let cellBg = 'transparent';
                              let cellColor = 'inherit';
                              let cellFontWeight = 400;

                              if (day.code === 'P') {
                                cellBg = '#dcfce7';
                                cellColor = '#166534';
                                cellFontWeight = 700;
                              } else if (day.code === 'A') {
                                cellBg = '#fee2e2';
                                cellColor = '#991b1b';
                                cellFontWeight = 700;
                              } else if (day.code === 'HD') {
                                cellBg = '#ffedd5';
                                cellColor = '#9a3412';
                                cellFontWeight = 700;
                              } else if (day.code === 'SL20' || day.code === 'SL2H') {
                                cellBg = '#f3e8ff';
                                cellColor = '#7e22ce';
                                cellFontWeight = 700;
                              } else if (day.code === 'R') {
                                cellBg = '#e0e7ff';
                                cellColor = '#3730a3';
                                cellFontWeight = 700;
                              } else if (day.code === 'WO') {
                                cellBg = '#f1f5f9';
                                cellColor = '#64748b';
                                cellFontWeight = 600;
                              } else if (day.code === 'WO-P') {
                                cellBg = '#dcfce7';
                                cellColor = '#166534';
                                cellFontWeight = 700;
                              } else if (day.code === 'CL') {
                                cellBg = '#eff6ff';
                                cellColor = '#2563eb';
                                cellFontWeight = 700;
                              } else if (day.code === 'SL') {
                                cellBg = '#f0fdf4';
                                cellColor = '#16a34a';
                                cellFontWeight = 700;
                              } else if (day.code === 'EL') {
                                cellBg = '#faf5ff';
                                cellColor = '#9333ea';
                                cellFontWeight = 700;
                              } else if (day.code === 'LWP') {
                                cellBg = '#f3f4f6';
                                cellColor = '#4b5563';
                                cellFontWeight = 700;
                              } else if (day.code === 'HD-L') {
                                cellBg = '#ffedd5';
                                cellColor = '#d97706';
                                cellFontWeight = 700;
                              }

                              return (
                                <td 
                                  key={dIdx}
                                  title={`${row.emp_name} - Day ${dIdx + 1}: ${day.label}`}
                                  style={{
                                    padding: '0.35rem 0.2rem',
                                    borderLeft: '1px solid var(--border-light)',
                                    background: day.code === 'WO' ? 'rgba(0,0,0,0.02)' : 'transparent'
                                  }}
                                >
                                  {day.code === '—' ? (
                                    <span style={{ color: 'var(--text-secondary)', opacity: 0.4 }}>—</span>
                                  ) : (
                                    <span style={{
                                      display: 'inline-block',
                                      minWidth: '24px',
                                      padding: '0.15rem 0.2rem',
                                      borderRadius: '4px',
                                      background: cellBg,
                                      color: cellColor,
                                      fontWeight: cellFontWeight,
                                      fontSize: '0.72rem'
                                    }}>
                                      {day.code}
                                    </span>
                                  )}
                                </td>
                              );
                            })}

                            {/* Summary Columns */}
                            <td style={{ padding: '0.55rem 0.5rem', fontWeight: 700, color: '#16a34a', borderLeft: '2px solid var(--border-light)' }}>
                              {row.summary?.totalPresent || 0}
                            </td>
                            <td style={{ padding: '0.55rem 0.5rem', fontWeight: 700, color: '#ef4444' }}>
                              {row.summary?.totalAbsent || 0}
                            </td>
                            <td style={{ padding: '0.55rem 0.5rem', fontWeight: 700, color: '#ea580c' }}>
                              {row.summary?.totalHalfDays || 0}
                            </td>
                            <td style={{ padding: '0.55rem 0.5rem', fontWeight: 700, color: '#7e22ce' }}>
                              {row.summary?.totalShortLeaves || 0}
                            </td>
                            <td style={{ padding: '0.55rem 0.5rem', fontWeight: 700, color: '#059669', fontSize: '0.82rem' }}>
                              {row.summary?.totalApprovedLeaves || 0}
                            </td>
                            <td style={{ padding: '0.55rem 0.75rem', fontWeight: 800, color: '#16a34a', background: 'rgba(22, 163, 74, 0.08)', fontSize: '0.85rem' }}>
                              {row.summary?.totalPayableDays || 0}
                            </td>
                            <td style={{ padding: '0.55rem 0.75rem', fontWeight: 700, color: 'var(--accent-color)', fontSize: '0.78rem' }}>
                              {row.summary?.totalHoursFormatted || '0h'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table></MobileTableView>
                </div>
              </div>
            </>
          )}

        </div>
      )}

      {/* ========================================================================================= */}
      {/* ========================================================================================= */}
      {/* TAB 6: SHIFT RULES */}
      {/* ========================================================================================= */}
      {activeTab === 'shift_rules' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Header Banner with Multi-Tenant & Branch Selectors */}
          <div className="card" style={{
            padding: '1.5rem',
            background: 'linear-gradient(135deg, var(--bg-surface) 0%, rgba(37, 99, 235, 0.08) 100%)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'var(--accent-color)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}>
                <BookOpen size={26} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Official Shift Policy & Attendance Rules
                </h2>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                  {tenantShiftPolicy?.company_name || selectedShiftPolicyCompany} Enterprise Guidelines • {selectedShiftPolicyBranch}
                </p>
              </div>
            </div>

            {/* Tenant, Branch & Admin Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              {/* Company Selector for Master Admin / Admin */}
              {(isAdmin || isMasterAdmin) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Building size={15} style={{ color: 'var(--text-secondary)' }} />
                  <select
                    value={selectedShiftPolicyCompany}
                    onChange={(e) => {
                      setSelectedShiftPolicyCompany(e.target.value);
                      setSelectedShiftPolicyBranch('All Branches');
                      setActiveShiftIndex(0);
                    }}
                    style={{
                      padding: '0.45rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      outline: 'none'
                    }}
                    title="Select Company / Tenant"
                  >
                    <option value="New Swan Group">New Swan Group</option>
                    <option value="SuPuja Creations">SuPuja Creations</option>
                    <option value="Testing New Swan Group">Testing New Swan Group</option>
                  </select>
                </div>
              )}

              {/* Branch / Plant Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <MapPin size={15} style={{ color: 'var(--text-secondary)' }} />
                <select
                  value={selectedShiftPolicyBranch}
                  onChange={(e) => {
                    setSelectedShiftPolicyBranch(e.target.value);
                    setActiveShiftIndex(0);
                  }}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                  title="Select Branch / Plant"
                >
                  <option value="All Branches">All Branches (Default)</option>
                  {availablePolicyBranches.map((b) => {
                    const bName = typeof b === 'string' ? b : (b.name || b.branch_name || b.code);
                    return <option key={b.id || bName} value={bName}>{bName}</option>;
                  })}
                </select>
              </div>

              {/* Configure Shifts Button (Admin / Master Admin) */}
              {(isAdmin || isMasterAdmin) && (
                <button
                  type="button"
                  onClick={handleOpenShiftConfig}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--accent-color)',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(37,99,235,0.25)'
                  }}
                  title="Configure Shift Timings & Quotas"
                >
                  <Settings size={15} /> Configure Shifts
                </button>
              )}

              <span style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem', borderRadius: '20px', background: 'rgba(22, 163, 74, 0.15)', color: '#16a34a', fontWeight: 700, border: '1px solid rgba(22, 163, 74, 0.3)' }}>
                ✅ Active Policy {tenantShiftPolicy?.policy_version || 'v2.4'}
              </span>
            </div>
          </div>

          {/* Multi-Shift Selector Navigation Bar */}
          {activeShiftsList.length > 1 && (
            <div className="card" style={{
              padding: '0.75rem 1rem',
              background: 'var(--bg-surface)',
              borderRadius: '12px',
              border: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              flexWrap: 'wrap'
            }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Configured Shifts ({activeShiftsList.length}):
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {activeShiftsList.map((shift, idx) => (
                  <button
                    key={shift.id || idx}
                    type="button"
                    onClick={() => setActiveShiftIndex(idx)}
                    style={{
                      padding: '0.4rem 0.85rem',
                      borderRadius: '8px',
                      border: activeShiftIndex === idx ? '1px solid var(--accent-color)' : '1px solid var(--border-light)',
                      background: activeShiftIndex === idx ? 'var(--accent-color)' : 'var(--bg-primary)',
                      color: activeShiftIndex === idx ? '#ffffff' : 'var(--text-primary)',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <span>{shift.shift_name}</span>
                    <span style={{ opacity: 0.85, fontSize: '0.74rem', fontWeight: 500 }}>
                      ({formatTime12h(shift.start_time)} – {formatTime12h(shift.end_time)})
                    </span>
                    {shift.is_default && (
                      <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: activeShiftIndex === idx ? 'rgba(255,255,255,0.25)' : 'rgba(22,163,74,0.15)', color: activeShiftIndex === idx ? '#fff' : '#16a34a', fontWeight: 800 }}>
                        Default
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grid Layout: Active Shift Timings & Short Leaves */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            
            {/* Card 1: Shift Hours */}
            <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Clock style={{ color: 'var(--accent-color)' }} size={20} />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
                    {currentShift.shift_name || 'Regular Shift'} Timings
                  </h3>
                </div>
                {currentShift.is_default && (
                  <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem', borderRadius: '12px', background: 'rgba(37,99,235,0.1)', color: 'var(--accent-color)', fontWeight: 700 }}>
                    Primary Shift
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Shift Start Time</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#16a34a' }}>
                      {formatTime12h(currentShift.start_time)}
                    </div>
                  </div>
                  <ArrowRight size={18} style={{ color: 'var(--text-secondary)' }} />
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Shift End Time</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#2563eb' }}>
                      {formatTime12h(currentShift.end_time)}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '0.75rem 1rem', background: 'rgba(22, 163, 74, 0.08)', borderRadius: '10px', border: '1px solid rgba(22, 163, 74, 0.25)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#16a34a', fontWeight: 700, fontSize: '0.85rem' }}>
                    <Sparkles size={15} /> {currentShift.grace_minutes ?? 5}-Minute Morning Grace Period
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', lineHeight: 1.4 }}>
                    Punching in within <strong>{currentShift.grace_minutes ?? 5} minutes</strong> of shift start time ({formatTime12h(currentShift.start_time)}) is marked as <strong>Present (0 deduction)</strong>. No short leave is consumed.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2: Monthly Short Leave Quota */}
            <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Calendar style={{ color: '#d97706' }} size={20} />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Monthly Short Leaves</h3>
                </div>
                <span style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: '#fef3c7', color: '#b45309', fontWeight: 800 }}>
                  Total: {Number(currentShift.short_leave_1_quota ?? 2) + Number(currentShift.short_leave_2_quota ?? 2)} / Month
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Short Leave 1 */}
                <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {currentShift.short_leave_1_name || '20-Minute Short Leave'}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb', background: 'rgba(37,99,235,0.1)', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                      Quota: {currentShift.short_leave_1_quota ?? 2} Allowed
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: 1.4 }}>
                    • Duration Allowance: <strong>{currentShift.short_leave_1_minutes ?? 20} Minutes</strong><br />
                    • Permitted for morning late arrivals or evening early departures.
                  </div>
                </div>

                {/* Short Leave 2 */}
                <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {currentShift.short_leave_2_name || '2-Hour Short Leave'}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7e22ce', background: 'rgba(126,34,206,0.1)', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                      Quota: {currentShift.short_leave_2_quota ?? 2} Allowed
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: 1.4 }}>
                    • Duration Allowance: <strong>{currentShift.short_leave_2_minutes ?? 120} Minutes</strong><br />
                    • Permitted for emergency doctor visits or official external duties.
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Configured Shifts Master Table (Interactive Column Resizing & Multi-Shift Overview) */}
          <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <FileSpreadsheet style={{ color: 'var(--accent-color)' }} size={20} />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    Configured Shifts Master Table
                  </h3>
                  <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: 'rgba(37,99,235,0.1)', color: 'var(--accent-color)', fontWeight: 700 }}>
                    {activeShiftsList.length} {activeShiftsList.length === 1 ? 'Shift' : 'Shifts'} Registered
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
                  {tenantShiftPolicy?.company_name || selectedShiftPolicyCompany} • Plant: {selectedShiftPolicyBranch}. Click any row to view its penalty matrix or click Edit to modify.
                </p>
              </div>

              {(isAdmin || isMasterAdmin) && (
                <button
                  type="button"
                  onClick={() => handleOpenShiftConfig()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--accent-color)',
                    background: 'rgba(37, 99, 235, 0.08)',
                    color: 'var(--accent-color)',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Add or Edit Shifts"
                >
                  <Plus size={15} /> Add / Manage Shifts
                </button>
              )}
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '10px' }}>
              <MobileTableView id="Attendance/AttendanceModule-ShiftsMaster">
                <table style={{ width: '100%', minWidth: `${getShiftTotalWidth()}px`, borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-primary)', borderBottom: '2px solid var(--border-light)', textAlign: 'left' }}>
                      <th style={{ width: `${shiftColWidths.code}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                        <span>Shift Code</span>
                        <ColumnResizer colKey="code" isResizing={shiftResizingCol === 'code'} onResizeStart={handleShiftResizeStart} onReset={resetShiftColWidth} />
                      </th>
                      <th style={{ width: `${shiftColWidths.shift_name}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                        <span>Shift Name</span>
                        <ColumnResizer colKey="shift_name" isResizing={shiftResizingCol === 'shift_name'} onResizeStart={handleShiftResizeStart} onReset={resetShiftColWidth} />
                      </th>
                      <th style={{ width: `${shiftColWidths.timings}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                        <span>Timings (Start – End)</span>
                        <ColumnResizer colKey="timings" isResizing={shiftResizingCol === 'timings'} onResizeStart={handleShiftResizeStart} onReset={resetShiftColWidth} />
                      </th>
                      <th style={{ width: `${shiftColWidths.grace}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                        <span>Grace Period</span>
                        <ColumnResizer colKey="grace" isResizing={shiftResizingCol === 'grace'} onResizeStart={handleShiftResizeStart} onReset={resetShiftColWidth} />
                      </th>
                      <th style={{ width: `${shiftColWidths.short_leave_1}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                        <span>Short Leave 1</span>
                        <ColumnResizer colKey="short_leave_1" isResizing={shiftResizingCol === 'short_leave_1'} onResizeStart={handleShiftResizeStart} onReset={resetShiftColWidth} />
                      </th>
                      <th style={{ width: `${shiftColWidths.short_leave_2}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                        <span>Short Leave 2</span>
                        <ColumnResizer colKey="short_leave_2" isResizing={shiftResizingCol === 'short_leave_2'} onResizeStart={handleShiftResizeStart} onReset={resetShiftColWidth} />
                      </th>
                      <th style={{ width: `${shiftColWidths.min_hours}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                        <span>Min Work Mins</span>
                        <ColumnResizer colKey="min_hours" isResizing={shiftResizingCol === 'min_hours'} onResizeStart={handleShiftResizeStart} onReset={resetShiftColWidth} />
                      </th>
                      <th style={{ width: `${shiftColWidths.status}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                        <span>Default Status</span>
                        <ColumnResizer colKey="status" isResizing={shiftResizingCol === 'status'} onResizeStart={handleShiftResizeStart} onReset={resetShiftColWidth} />
                      </th>
                      <th style={{ width: `${shiftColWidths.actions}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                        <span>Action</span>
                        <ColumnResizer colKey="actions" isResizing={shiftResizingCol === 'actions'} onResizeStart={handleShiftResizeStart} onReset={resetShiftColWidth} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeShiftsList.map((shift, idx) => {
                      const isSelected = activeShiftIndex === idx;
                      return (
                        <tr
                          key={shift.id || idx}
                          onClick={() => setActiveShiftIndex(idx)}
                          style={{
                            borderBottom: '1px solid var(--border-light)',
                            background: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.15s'
                          }}
                        >
                          <td style={{ padding: '0.75rem 0.85rem' }}>
                            <span style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                              padding: '0.2rem 0.45rem',
                              borderRadius: '4px',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-light)',
                              color: 'var(--text-primary)'
                            }}>
                              {shift.shift_code || `SHIFT_${idx + 1}`}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span>{shift.shift_name}</span>
                              {shift.is_default && (
                                <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '10px', background: 'rgba(22,163,74,0.15)', color: '#16a34a', fontWeight: 800 }}>
                                  Default
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>
                            <span style={{ fontWeight: 700, color: '#2563eb' }}>
                              {formatTime12h(shift.start_time)}
                            </span>
                            <span style={{ margin: '0 0.35rem', color: 'var(--text-secondary)' }}>–</span>
                            <span style={{ fontWeight: 700, color: '#16a34a' }}>
                              {formatTime12h(shift.end_time)}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', fontWeight: 600 }}>
                            {shift.grace_minutes ?? 5} Mins
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{shift.short_leave_1_minutes ?? 20}m</strong> ({shift.short_leave_1_quota ?? 2}/mo)
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{shift.short_leave_2_minutes ?? 120}m</strong> ({shift.short_leave_2_quota ?? 2}/mo)
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            Half: {shift.min_half_day_minutes ?? 270}m • Full: {shift.min_full_day_minutes ?? 450}m
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>
                            {shift.is_default ? (
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>✅ Primary Default</span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Alternative</span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveShiftIndex(idx);
                                }}
                                style={{
                                  padding: '0.3rem 0.6rem',
                                  borderRadius: '6px',
                                  border: isSelected ? '1px solid var(--accent-color)' : '1px solid var(--border-light)',
                                  background: isSelected ? 'var(--accent-color)' : 'var(--bg-primary)',
                                  color: isSelected ? '#ffffff' : 'var(--text-primary)',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                {isSelected ? 'Viewing' : 'Select'}
                              </button>
                              {(isAdmin || isMasterAdmin) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenShiftConfig(idx);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.3rem 0.6rem',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-light)',
                                    background: 'var(--bg-surface)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                  title="Edit Shift"
                                >
                                  <Edit2 size={12} /> Edit
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </MobileTableView>
            </div>
          </div>

          {/* Rules Matrix & Penalties Table */}

          <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <AlertTriangle style={{ color: '#ea580c' }} size={20} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
                  Attendance Status & Penalty Evaluation Matrix ({currentShift.shift_name})
                </h3>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                Evaluated against {formatTime12h(currentShift.start_time)} to {formatTime12h(currentShift.end_time)}
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <MobileTableView id="Attendance/AttendanceModule-6"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-primary)', borderBottom: '2px solid var(--border-light)', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Condition / Scenario</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Time Window / Threshold</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Resulting Status</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Payable Credit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>On-Time Arrival / Grace Period</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Within {currentShift.grace_minutes ?? 5} mins of {formatTime12h(currentShift.start_time)}</td>
                    <td style={{ padding: '0.75rem 1rem' }}><span style={{ color: '#16a34a', fontWeight: 700 }}>✅ Present</span></td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>1.0 Day</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{currentShift.short_leave_1_name || 'Short Leave 1'}</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Within {currentShift.short_leave_1_minutes ?? 20} mins after grace period</td>
                    <td style={{ padding: '0.75rem 1rem' }}><span style={{ color: '#2563eb', fontWeight: 700 }}>🔵 Short Leave ({currentShift.short_leave_1_minutes ?? 20}M)</span></td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>1.0 Day</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{currentShift.short_leave_2_name || 'Short Leave 2'}</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Within {currentShift.short_leave_2_minutes ?? 120} mins of shift start</td>
                    <td style={{ padding: '0.75rem 1rem' }}><span style={{ color: '#7e22ce', fontWeight: 700 }}>🟣 Short Leave ({Math.round((currentShift.short_leave_2_minutes ?? 120) / 60)}H)</span></td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>1.0 Day</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', background: 'rgba(234, 88, 12, 0.04)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Late Arrival after Short Leave Cutoff</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Beyond {currentShift.short_leave_2_minutes ?? 120} minutes</td>
                    <td style={{ padding: '0.75rem 1rem' }}><span style={{ color: '#ea580c', fontWeight: 700 }}>⚠️ Half Day</span></td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#ea580c' }}>0.5 Day</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', background: 'rgba(234, 88, 12, 0.04)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Early Departure before Shift End</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Before {formatTime12h(currentShift.end_time)} without approved leave</td>
                    <td style={{ padding: '0.75rem 1rem' }}><span style={{ color: '#ea580c', fontWeight: 700 }}>⚠️ Half Day</span></td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#ea580c' }}>0.5 Day</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', background: 'rgba(239, 68, 68, 0.04)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Total Working Hours &lt; {Math.round(((currentShift.min_half_day_minutes ?? 270) / 60) * 10) / 10}h</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Under {currentShift.min_half_day_minutes ?? 270} Total Minutes</td>
                    <td style={{ padding: '0.75rem 1rem' }}><span style={{ color: '#dc2626', fontWeight: 700 }}>❌ Absent</span></td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#dc2626' }}>0.0 Day</td>
                  </tr>
                </tbody>
              </table></MobileTableView>
            </div>
          </div>

          {/* Policy Notes / Guidelines */}
          <div className="card" style={{ padding: '1.25rem 1.5rem', background: 'rgba(37, 99, 235, 0.05)', border: '1px solid rgba(37, 99, 235, 0.2)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--accent-color)', fontWeight: 700, fontSize: '0.92rem' }}>
              <Info size={18} /> Important Policy Notes
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <li><strong>Multi-Shift Assignment</strong>: Employees are evaluated against their assigned shift in User Management. Auto-detect assigns the primary default shift.</li>
              <li><strong>Max 1 Short Leave Per Day</strong>: An employee can avail only 1 short leave per calendar day (either arrival or departure).</li>
              <li><strong>Quota Exhaustion</strong>: Once monthly short leaves are consumed, late arrivals automatically trigger a <strong>Half Day</strong> deduction.</li>
              <li><strong>Missing Punch Regularization</strong>: Submit requests under <strong>Missing Punch / Regularize</strong> tab for HOD approval.</li>
              <li><strong>Offline Punching</strong>: GPS pin and timestamp will be saved locally and auto-synced when online.</li>
            </ul>
          </div>

          {/* Configure Shift Policy Modal (Admin/Master Admin) */}
          {showShiftConfigModal && shiftConfigForm && (
            <div style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '1rem'
            }}>
              <div className="card" style={{
                width: '100%',
                maxWidth: '750px',
                background: 'var(--bg-surface)',
                borderRadius: '16px',
                border: '1px solid var(--border-light)',
                padding: '1.5rem',
                boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
                maxHeight: '90vh',
                overflowY: 'auto'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Settings size={22} color="var(--accent-color)" />
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                        Configure Shift Policy ({shiftConfigForm.company_name})
                      </h3>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                        Plant/Branch: {shiftConfigForm.branch_name} • Add, update or reconfigure shift timings
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowShiftConfigModal(false)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    <X size={20} />
                  </button>
                </div>

                {shiftConfigToast && (
                  <div style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    background: shiftConfigToast.type === 'success' ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)',
                    color: shiftConfigToast.type === 'success' ? '#16a34a' : '#ef4444',
                    border: shiftConfigToast.type === 'success' ? '1px solid rgba(22,163,74,0.3)' : '1px solid rgba(239,68,68,0.3)'
                  }}>
                    {shiftConfigToast.message}
                  </div>
                )}

                <form onSubmit={handleSaveShiftConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  
                  {/* Shifts List Editor */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {shiftConfigForm.shifts.map((shift, idx) => (
                      <div key={shift.id || idx} style={{
                        padding: '1rem',
                        borderRadius: '12px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.4rem' }}>
                          <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--accent-color)' }}>
                            Shift #{idx + 1}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={!!shift.is_default}
                                onChange={(e) => {
                                  const updated = shiftConfigForm.shifts.map((s, i) => ({
                                    ...s,
                                    is_default: i === idx ? e.target.checked : false
                                  }));
                                  setShiftConfigForm({ ...shiftConfigForm, shifts: updated });
                                }}
                              />
                              Default Shift
                            </label>

                            {shiftConfigForm.shifts.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const filtered = shiftConfigForm.shifts.filter((_, i) => i !== idx);
                                  if (filtered.length > 0 && !filtered.some(s => s.is_default)) {
                                    filtered[0].is_default = true;
                                  }
                                  setShiftConfigForm({ ...shiftConfigForm, shifts: filtered });
                                }}
                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Name & Code */}
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                              Shift Name *
                            </label>
                            <input
                              type="text"
                              required
                              value={shift.shift_name}
                              onChange={(e) => {
                                const updated = [...shiftConfigForm.shifts];
                                updated[idx].shift_name = e.target.value;
                                setShiftConfigForm({ ...shiftConfigForm, shifts: updated });
                              }}
                              style={{
                                width: '100%',
                                padding: '0.45rem 0.65rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border-light)',
                                background: 'var(--bg-surface)',
                                color: 'var(--text-primary)',
                                fontSize: '0.82rem'
                              }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                              Shift Code *
                            </label>
                            <input
                              type="text"
                              required
                              value={shift.shift_code}
                              onChange={(e) => {
                                const updated = [...shiftConfigForm.shifts];
                                updated[idx].shift_code = e.target.value.toUpperCase();
                                setShiftConfigForm({ ...shiftConfigForm, shifts: updated });
                              }}
                              style={{
                                width: '100%',
                                padding: '0.45rem 0.65rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border-light)',
                                background: 'var(--bg-surface)',
                                color: 'var(--text-primary)',
                                fontSize: '0.82rem'
                              }}
                            />
                          </div>
                        </div>

                        {/* Start Time, End Time & Grace */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                              Start Time (24h) *
                            </label>
                            <input
                              type="time"
                              required
                              value={shift.start_time}
                              onChange={(e) => {
                                const updated = [...shiftConfigForm.shifts];
                                updated[idx].start_time = e.target.value;
                                setShiftConfigForm({ ...shiftConfigForm, shifts: updated });
                              }}
                              style={{
                                width: '100%',
                                padding: '0.45rem 0.65rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border-light)',
                                background: 'var(--bg-surface)',
                                color: 'var(--text-primary)',
                                fontSize: '0.82rem'
                              }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                              End Time (24h) *
                            </label>
                            <input
                              type="time"
                              required
                              value={shift.end_time}
                              onChange={(e) => {
                                const updated = [...shiftConfigForm.shifts];
                                updated[idx].end_time = e.target.value;
                                setShiftConfigForm({ ...shiftConfigForm, shifts: updated });
                              }}
                              style={{
                                width: '100%',
                                padding: '0.45rem 0.65rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border-light)',
                                background: 'var(--bg-surface)',
                                color: 'var(--text-primary)',
                                fontSize: '0.82rem'
                              }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                              Grace Period (Mins) *
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="60"
                              required
                              value={shift.grace_minutes}
                              onChange={(e) => {
                                const updated = [...shiftConfigForm.shifts];
                                updated[idx].grace_minutes = Number(e.target.value);
                                setShiftConfigForm({ ...shiftConfigForm, shifts: updated });
                              }}
                              style={{
                                width: '100%',
                                padding: '0.45rem 0.65rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border-light)',
                                background: 'var(--bg-surface)',
                                color: 'var(--text-primary)',
                                fontSize: '0.82rem'
                              }}
                            />
                          </div>
                        </div>

                        {/* Short Leaves 1 & 2 */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                              Short Leave 1 Mins & Quota
                            </label>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <input
                                type="number"
                                min="5"
                                max="60"
                                placeholder="Minutes"
                                value={shift.short_leave_1_minutes}
                                onChange={(e) => {
                                  const updated = [...shiftConfigForm.shifts];
                                  updated[idx].short_leave_1_minutes = Number(e.target.value);
                                  setShiftConfigForm({ ...shiftConfigForm, shifts: updated });
                                }}
                                style={{ flex: 1, padding: '0.45rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                              />
                              <input
                                type="number"
                                min="0"
                                max="10"
                                placeholder="Quota/mo"
                                value={shift.short_leave_1_quota}
                                onChange={(e) => {
                                  const updated = [...shiftConfigForm.shifts];
                                  updated[idx].short_leave_1_quota = Number(e.target.value);
                                  setShiftConfigForm({ ...shiftConfigForm, shifts: updated });
                                }}
                                style={{ width: '80px', padding: '0.45rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                              />
                            </div>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                              Short Leave 2 Mins & Quota
                            </label>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <input
                                type="number"
                                min="30"
                                max="240"
                                placeholder="Minutes"
                                value={shift.short_leave_2_minutes}
                                onChange={(e) => {
                                  const updated = [...shiftConfigForm.shifts];
                                  updated[idx].short_leave_2_minutes = Number(e.target.value);
                                  setShiftConfigForm({ ...shiftConfigForm, shifts: updated });
                                }}
                                style={{ flex: 1, padding: '0.45rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                              />
                              <input
                                type="number"
                                min="0"
                                max="10"
                                placeholder="Quota/mo"
                                value={shift.short_leave_2_quota}
                                onChange={(e) => {
                                  const updated = [...shiftConfigForm.shifts];
                                  updated[idx].short_leave_2_quota = Number(e.target.value);
                                  setShiftConfigForm({ ...shiftConfigForm, shifts: updated });
                                }}
                                style={{ width: '80px', padding: '0.45rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                              />
                            </div>
                          </div>
                        </div>

                      </div>
                    ))}

                    {/* Add Shift Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const newShift = {
                          id: `shift_${Date.now()}`,
                          shift_code: `SHIFT_${shiftConfigForm.shifts.length + 1}`,
                          shift_name: `Shift ${shiftConfigForm.shifts.length + 1}`,
                          is_default: false,
                          start_time: '09:00',
                          end_time: '18:30',
                          grace_minutes: 5,
                          short_leave_1_name: '20-Minute Short Leave',
                          short_leave_1_minutes: 20,
                          short_leave_1_quota: 2,
                          short_leave_2_name: '2-Hour Short Leave',
                          short_leave_2_minutes: 120,
                          short_leave_2_quota: 2,
                          min_half_day_minutes: 270,
                          min_full_day_minutes: 450
                        };
                        setShiftConfigForm({
                          ...shiftConfigForm,
                          shifts: [...shiftConfigForm.shifts, newShift]
                        });
                      }}
                      style={{
                        padding: '0.6rem 1rem',
                        borderRadius: '8px',
                        border: '1px dashed var(--accent-color)',
                        background: 'rgba(37,99,235,0.05)',
                        color: 'var(--accent-color)',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem'
                      }}
                    >
                      <Plus size={16} /> Add Another Shift
                    </button>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowShiftConfigModal(false)}
                      style={{
                        padding: '0.55rem 1rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingShiftConfig}
                      style={{
                        padding: '0.55rem 1.25rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'var(--accent-color)',
                        color: '#ffffff',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: savingShiftConfig ? 'not-allowed' : 'pointer',
                        boxShadow: '0 2px 8px rgba(37,99,235,0.3)'
                      }}
                    >
                      {savingShiftConfig ? 'Saving Changes...' : 'Save Shift Policy'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ========================================================================================= */}
      {/* TAB 7: COMPANY LEAVE POLICY & CPL RULES */}
      {/* ========================================================================================= */}
      {activeTab === 'leave_policy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Header Banner */}
          <div className="card" style={{
            padding: '1.5rem',
            background: 'linear-gradient(135deg, var(--bg-surface) 0%, rgba(16, 185, 129, 0.08) 100%)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#10b981',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}>
                <Award size={26} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Official Company Leave & CPL Policy
                </h2>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                  {selectedLeaveCompany} Enterprise Leave Rules: CL, SL, 1-Year EL Probation Lock, CPL Accrual, Sandwich & Weekly Off Policies
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              {(isAdmin || isMasterAdmin) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Building size={15} style={{ color: 'var(--text-secondary)' }} />
                  <select
                    value={selectedLeaveCompany}
                    onChange={(e) => setSelectedLeaveCompany(e.target.value)}
                    style={{
                      padding: '0.45rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      outline: 'none'
                    }}
                    title="Select Company / Tenant"
                  >
                    <option value="New Swan Group">New Swan Group</option>
                    <option value="SuPuja Creations">SuPuja Creations</option>
                    <option value="Testing New Swan Group">Testing New Swan Group</option>
                  </select>
                </div>
              )}

              {(isAdmin || isMasterAdmin) && (
                <button
                  type="button"
                  disabled={savingLeavePolicy}
                  onClick={handleSaveLeavePolicy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 0.95rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#10b981',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: savingLeavePolicy ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                  }}
                  title="Save Company Leave Policy"
                >
                  <ShieldCheck size={15} /> {savingLeavePolicy ? 'Saving...' : 'Save Policy'}
                </button>
              )}

              <span style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem', borderRadius: '20px', background: 'rgba(16, 185, 129, 0.15)', color: '#059669', fontWeight: 700, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                🌴 Active for {selectedLeaveCompany}
              </span>
            </div>
          </div>

          {/* Admin/HOD Policy Configurator Card */}
              {isHodOrManager ? (
                <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Settings size={22} color="var(--accent-color, #2563eb)" />
                      <div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Company Leave Policy & Quota Settings ({selectedLeaveCompany})</h3>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                          Configure annual leave quotas, EL 1-year probation lock-in, CPL earning & validity rules, and weekly attendance rules.
                        </p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleSaveLeavePolicy} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Section 1: Core Annual Quotas */}
                    <div>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.75rem 0', color: 'var(--text-primary)' }}>1. Annual Leave Quotas & Entitlements</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                            Casual Leave (CL) Quota (Days/Year)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="30"
                            value={leavePolicyForm.cl_quota_annual}
                            onChange={(e) => setLeavePolicyForm({ ...leavePolicyForm, cl_quota_annual: e.target.value })}
                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                          />
                          <span style={{ fontSize: '0.7rem', color: '#16a34a' }}>Unlocked from Day-1 of joining</span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                            Sick Leave (SL) Quota (Days/Year)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="30"
                            value={leavePolicyForm.sl_quota_annual}
                            onChange={(e) => setLeavePolicyForm({ ...leavePolicyForm, sl_quota_annual: e.target.value })}
                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                          />
                          <span style={{ fontSize: '0.7rem', color: '#16a34a' }}>Medical and health emergencies</span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                            Earned Leave (EL) Quota (Days/Year)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="45"
                            value={leavePolicyForm.el_quota_annual}
                            onChange={(e) => setLeavePolicyForm({ ...leavePolicyForm, el_quota_annual: e.target.value })}
                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                          />
                          <span style={{ fontSize: '0.7rem', color: '#9333ea' }}>Annual privilege leave accumulation</span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                            EL Probation Lock-in (Months)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="24"
                            value={leavePolicyForm.el_lockin_months}
                            onChange={(e) => setLeavePolicyForm({ ...leavePolicyForm, el_lockin_months: e.target.value })}
                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                          />
                          <span style={{ fontSize: '0.7rem', color: '#d97706' }}>Blocked for first 12 months (probation)</span>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Compensatory Off (CPL) Policy */}
                    <div style={{ borderTop: '1px dashed var(--border-light)', paddingTop: '1rem' }}>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.75rem 0', color: 'var(--text-primary)' }}>2. Compensatory Off (CPL) Earning & Expiry Rules</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', marginBottom: '0.4rem' }}>
                            <input
                              type="checkbox"
                              checked={leavePolicyForm.cpl_enabled}
                              onChange={(e) => setLeavePolicyForm({ ...leavePolicyForm, cpl_enabled: e.target.checked })}
                            />
                            Enable Compensatory Off (CPL)
                          </label>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Allows employees to earn and avail comp-off days</span>
                        </div>

                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', marginBottom: '0.4rem' }}>
                            <input
                              type="checkbox"
                              checked={leavePolicyForm.cpl_auto_sunday}
                              onChange={(e) => setLeavePolicyForm({ ...leavePolicyForm, cpl_auto_sunday: e.target.checked })}
                            />
                            Auto-credit CPL on Sunday / Holiday Work
                          </label>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Automatically awards CPL credit when working on weekly offs</span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                            CPL Validity Window (Days)
                          </label>
                          <input
                            type="number"
                            min="15"
                            max="365"
                            value={leavePolicyForm.cpl_validity_days}
                            onChange={(e) => setLeavePolicyForm({ ...leavePolicyForm, cpl_validity_days: e.target.value })}
                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                          />
                          <span style={{ fontSize: '0.7rem', color: '#4f46e5' }}>CPL expires after 60 days if unavailed</span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                            Min Hours for 1 CPL / 0.5 CPL
                          </label>
                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <input
                              type="number"
                              step="0.5"
                              value={leavePolicyForm.cpl_min_hours_full}
                              onChange={(e) => setLeavePolicyForm({ ...leavePolicyForm, cpl_min_hours_full: e.target.value })}
                              style={{ width: '50%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                              placeholder="Full (8h)"
                            />
                            <input
                              type="number"
                              step="0.5"
                              value={leavePolicyForm.cpl_min_hours_half}
                              onChange={(e) => setLeavePolicyForm({ ...leavePolicyForm, cpl_min_hours_half: e.target.value })}
                              style={{ width: '50%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                              placeholder="Half (4.5h)"
                            />
                          </div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Full day hours (8h) / Half day hours (4.5h)</span>
                        </div>
                      </div>
                    </div>

                    {/* Section 3: Sunday & Sandwich Rules */}
                    <div style={{ borderTop: '1px dashed var(--border-light)', paddingTop: '1rem' }}>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.75rem 0', color: 'var(--text-primary)' }}>3. Weekly Attendance & Sandwich Rule Enforcement</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                        <div style={{ padding: '0.85rem', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', marginBottom: '0.4rem' }}>
                            <input
                              type="checkbox"
                              checked={leavePolicyForm.enable_min_weekly_days_for_sunday}
                              onChange={(e) => setLeavePolicyForm({ ...leavePolicyForm, enable_min_weekly_days_for_sunday: e.target.checked })}
                            />
                            Require Min 3 Working Days for Paid Sunday
                          </label>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.4rem 0', lineHeight: 1.4 }}>
                            If employee takes &gt; 3 days leave in a week, Sunday weekly off is deducted as unpaid. (Optional policy toggle).
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Min Days:</span>
                            <input
                              type="number"
                              min="1"
                              max="6"
                              value={leavePolicyForm.min_weekly_working_days}
                              onChange={(e) => setLeavePolicyForm({ ...leavePolicyForm, min_weekly_working_days: e.target.value })}
                              style={{ width: '70px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                            />
                          </div>
                        </div>

                        <div style={{ padding: '0.85rem', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', marginBottom: '0.4rem' }}>
                            <input
                              type="checkbox"
                              checked={leavePolicyForm.enable_sandwich_rule}
                              onChange={(e) => setLeavePolicyForm({ ...leavePolicyForm, enable_sandwich_rule: e.target.checked })}
                            />
                            Sandwich Rule on Unapproved Leaves
                          </label>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.4rem 0', lineHeight: 1.4 }}>
                            Deducts weekend as unpaid if employee is absent without prior approved leave on both Saturday and Monday.
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Mode:</span>
                            <select
                              value={leavePolicyForm.sandwich_mode}
                              onChange={(e) => setLeavePolicyForm({ ...leavePolicyForm, sandwich_mode: e.target.value })}
                              style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                            >
                              <option value="UNAPPROVED_ONLY">Unapproved Leaves Only (Approved CL/SL protected)</option>
                              <option value="STRICT">Strict (All Leaves sandwich weekend)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                      <button
                        type="submit"
                        disabled={savingLeavePolicy}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.65rem 1.4rem',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'var(--accent-color, #2563eb)',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '0.88rem',
                          cursor: savingLeavePolicy ? 'not-allowed' : 'pointer',
                          boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)'
                        }}
                      >
                        <Check size={16} /> {savingLeavePolicy ? 'Saving Changes...' : 'Save Leave Policy'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}

              {/* Employee Handbook & Guidelines Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '14px', border: '1px solid var(--border-light)', borderTop: '3px solid #2563eb' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 700, color: '#2563eb' }}>Casual Leave (CL) Guidelines</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    8 days annual entitlement. Unlocked on Day-1 of joining. Used for urgent personal matters, festivals, or family events with prior intimation to HOD.
                  </p>
                </div>

                <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '14px', border: '1px solid var(--border-light)', borderTop: '3px solid #16a34a' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 700, color: '#16a34a' }}>Sick Leave (SL) Guidelines</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    6 days annual entitlement. Unlocked on Day-1 of joining for medical illnesses and unexpected health recovery. HOD may request medical certificate for absences &gt; 2 days.
                  </p>
                </div>

                <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '14px', border: '1px solid var(--border-light)', borderTop: '3px solid #9333ea' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 700, color: '#9333ea' }}>Earned Leave (EL) & Probation Rules</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    15 days/year accrual. Locked during the 1st year (12 months probation). Unlocks on the 1st work anniversary and remains valid for 3 years, eligible for encashment as per policy.
                  </p>
                </div>

                <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '14px', border: '1px solid var(--border-light)', borderTop: '3px solid #4f46e5' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 700, color: '#4f46e5' }}>Compensatory Off (CPL) Policy</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Earned when working on Sundays or Gazetted Holidays (8h = 1 day, 4.5h = 0.5 day) or granted by HOD. Valid for 60 days from work date. 100% paid when availed.
                  </p>
                </div>
              </div>

              {/* ========================================================================================= */}
              {/* CONFIGURED COMPANY LEAVE POLICIES MASTER DIRECTORY TABLE */}
              {/* ========================================================================================= */}
              <div className="card" style={{
                padding: '1.25rem',
                background: 'var(--bg-surface)',
                borderRadius: '14px',
                border: '1px solid var(--border-light)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Building size={20} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Configured Company Leave Policies Directory
                      </h3>
                      <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Live multi-tenant summary of configured annual leave quotas, CPL accrual rules, and sandwich policies across all entities.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => {
                        fetchAllTenantLeavePolicies();
                        fetchLeavePolicyForCompany(selectedLeaveCompany);
                      }}
                      disabled={loadingAllLeavePolicies}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.4rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: loadingAllLeavePolicies ? 'not-allowed' : 'pointer'
                      }}
                      title="Refresh Policies"
                    >
                      <RefreshCw size={13} className={loadingAllLeavePolicies ? 'spin' : ''} />
                      Refresh
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '10px' }}>
                  <MobileTableView id="Attendance/AttendanceModule-LeavePoliciesMaster">
                    <table style={{ width: '100%', minWidth: `${getLeaveTotalWidth()}px`, borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-primary)', borderBottom: '2px solid var(--border-light)', textAlign: 'left' }}>
                          <th style={{ width: `${leaveColWidths.company}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                            <span>Company / Tenant</span>
                            <ColumnResizer colKey="company" isResizing={leaveResizingCol === 'company'} onResizeStart={handleLeaveResizeStart} onReset={resetLeaveColWidth} />
                          </th>
                          <th style={{ width: `${leaveColWidths.cl_sl}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                            <span>CL & SL Quotas</span>
                            <ColumnResizer colKey="cl_sl" isResizing={leaveResizingCol === 'cl_sl'} onResizeStart={handleLeaveResizeStart} onReset={resetLeaveColWidth} />
                          </th>
                          <th style={{ width: `${leaveColWidths.el}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                            <span>Earned Leave (EL)</span>
                            <ColumnResizer colKey="el" isResizing={leaveResizingCol === 'el'} onResizeStart={handleLeaveResizeStart} onReset={resetLeaveColWidth} />
                          </th>
                          <th style={{ width: `${leaveColWidths.cpl}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                            <span>Comp-Off (CPL)</span>
                            <ColumnResizer colKey="cpl" isResizing={leaveResizingCol === 'cpl'} onResizeStart={handleLeaveResizeStart} onReset={resetLeaveColWidth} />
                          </th>
                          <th style={{ width: `${leaveColWidths.rules}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                            <span>Attendance Rules</span>
                            <ColumnResizer colKey="rules" isResizing={leaveResizingCol === 'rules'} onResizeStart={handleLeaveResizeStart} onReset={resetLeaveColWidth} />
                          </th>
                          <th style={{ width: `${leaveColWidths.updated}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                            <span>Last Updated</span>
                            <ColumnResizer colKey="updated" isResizing={leaveResizingCol === 'updated'} onResizeStart={handleLeaveResizeStart} onReset={resetLeaveColWidth} />
                          </th>
                          <th style={{ width: `${leaveColWidths.actions}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                            <span>Action</span>
                            <ColumnResizer colKey="actions" isResizing={leaveResizingCol === 'actions'} onResizeStart={handleLeaveResizeStart} onReset={resetLeaveColWidth} />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {allTenantLeavePolicies.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                              {loadingAllLeavePolicies ? 'Loading configured leave policies...' : 'No leave policies configured yet.'}
                            </td>
                          </tr>
                        ) : (
                          allTenantLeavePolicies.map((pol) => {
                            const isSelected = pol.company_name === selectedLeaveCompany;
                            const lp = pol.leave_policy || {};
                            const cp = lp.cpl_policy || {};

                            return (
                              <tr
                                key={pol.tenant_id}
                                style={{
                                  borderBottom: '1px solid var(--border-light)',
                                  background: isSelected ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                                  transition: 'background 0.15s'
                                }}
                              >
                                <td style={{ padding: '0.75rem 0.85rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {pol.company_name}
                                      </span>
                                      {isSelected && (
                                        <span style={{
                                          fontSize: '0.68rem',
                                          fontWeight: 700,
                                          padding: '0.15rem 0.45rem',
                                          borderRadius: '6px',
                                          background: '#10b981',
                                          color: '#ffffff'
                                        }}>
                                          Active
                                        </span>
                                      )}
                                    </div>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                      {pol.tenant_id}
                                    </span>
                                  </div>
                                </td>

                                <td style={{ padding: '0.75rem 0.85rem' }}>
                                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    <span style={{
                                      fontSize: '0.75rem',
                                      fontWeight: 700,
                                      padding: '0.15rem 0.45rem',
                                      borderRadius: '6px',
                                      background: 'rgba(37, 99, 235, 0.12)',
                                      color: '#2563eb'
                                    }}>
                                      {lp.cl_quota_annual ?? 8} CL/yr
                                    </span>
                                    <span style={{
                                      fontSize: '0.75rem',
                                      fontWeight: 700,
                                      padding: '0.15rem 0.45rem',
                                      borderRadius: '6px',
                                      background: 'rgba(22, 163, 74, 0.12)',
                                      color: '#16a34a'
                                    }}>
                                      {lp.sl_quota_annual ?? 6} SL/yr
                                    </span>
                                  </div>
                                </td>

                                <td style={{ padding: '0.75rem 0.85rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                      {lp.el_quota_annual ?? 15} Days/yr
                                    </span>
                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                                      Lock-in: {lp.el_lockin_months ?? 12}m • Valid: {lp.el_validity_years ?? 3}y
                                    </span>
                                  </div>
                                </td>

                                <td style={{ padding: '0.75rem 0.85rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                      <span style={{
                                        display: 'inline-block',
                                        width: '7px',
                                        height: '7px',
                                        borderRadius: '50%',
                                        background: cp.enabled !== false ? '#10b981' : '#ef4444'
                                      }} />
                                      <span style={{ fontWeight: 600, color: cp.enabled !== false ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                        {cp.enabled !== false ? `Active (${cp.validity_days ?? 60}d)` : 'Disabled'}
                                      </span>
                                    </div>
                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                                      Full: {cp.min_work_hours_full_cpl ?? 8.0}h • Half: {cp.min_work_hours_half_cpl ?? 4.5}h
                                      {cp.auto_credit_on_sunday_work !== false ? ' • Sunday Auto' : ''}
                                    </span>
                                  </div>
                                </td>

                                <td style={{ padding: '0.75rem 0.85rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <span style={{ fontSize: '0.76rem', color: 'var(--text-primary)' }}>
                                      🥪 Sandwich: <strong>{lp.sandwich_mode === 'STRICT' ? 'Strict' : (lp.enable_sandwich_rule !== false ? 'Unapproved' : 'Off')}</strong>
                                    </span>
                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                                      📅 Sunday: {lp.enable_min_weekly_days_for_sunday ? `Min ${lp.min_weekly_working_days ?? 3}d req` : 'Standard'}
                                    </span>
                                  </div>
                                </td>

                                <td style={{ padding: '0.75rem 0.85rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                      {pol.updated_at ? new Date(pol.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'System Default'}
                                    </span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                      By: {pol.updated_by || 'Admin'}
                                    </span>
                                  </div>
                                </td>

                                <td style={{ padding: '0.75rem 0.85rem' }}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedLeaveCompany(pol.company_name);
                                      fetchLeavePolicyForCompany(pol.company_name);
                                      if (typeof window !== 'undefined') {
                                        window.scrollTo({ top: 300, behavior: 'smooth' });
                                      }
                                    }}
                                    style={{
                                      padding: '0.35rem 0.65rem',
                                      borderRadius: '6px',
                                      border: '1px solid var(--border-light)',
                                      background: isSelected ? 'var(--accent-color, #2563eb)' : 'var(--bg-primary)',
                                      color: isSelected ? '#ffffff' : 'var(--text-primary)',
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      transition: 'all 0.15s'
                                    }}
                                  >
                                    {isSelected ? 'Editing Now' : 'Select to Edit'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </MobileTableView>
                </div>
              </div>

        </div>
      )}

      {/* ========================================================================================= */}
      {/* TAB 8: OFFICE GEOFENCING & GPS BOUNDARY POLICY */}
      {/* ========================================================================================= */}
      {activeTab === 'geofencing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Header Banner with Multi-Tenant & Branch Selectors */}
          <div className="card" style={{
            padding: '1.5rem',
            background: 'linear-gradient(135deg, var(--bg-surface) 0%, rgba(14, 165, 233, 0.08) 100%)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#0ea5e9',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(14, 165, 233, 0.3)'
              }}>
                <MapPin size={26} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Office GPS Geofencing & Boundary Rules
                </h2>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                  {tenantShiftPolicy?.company_name || selectedShiftPolicyCompany} Enterprise Guidelines • {selectedShiftPolicyBranch}
                </p>
              </div>
            </div>

            {/* Tenant, Branch & Save Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              {(isAdmin || isMasterAdmin) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Building size={15} style={{ color: 'var(--text-secondary)' }} />
                  <select
                    value={selectedShiftPolicyCompany}
                    onChange={(e) => {
                      setSelectedShiftPolicyCompany(e.target.value);
                      setSelectedShiftPolicyBranch('All Branches');
                    }}
                    style={{
                      padding: '0.45rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      outline: 'none'
                    }}
                    title="Select Company / Tenant"
                  >
                    <option value="New Swan Group">New Swan Group</option>
                    <option value="SuPuja Creations">SuPuja Creations</option>
                    <option value="Testing New Swan Group">Testing New Swan Group</option>
                  </select>
                </div>
              )}

              {/* Branch / Plant Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <MapPin size={15} style={{ color: 'var(--text-secondary)' }} />
                <select
                  value={selectedShiftPolicyBranch}
                  onChange={(e) => setSelectedShiftPolicyBranch(e.target.value)}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                  title="Select Branch / Plant"
                >
                  <option value="All Branches">All Branches (Default)</option>
                  {availablePolicyBranches.map((b) => {
                    const bName = typeof b === 'string' ? b : (b.name || b.branch_name || b.code);
                    return <option key={b.id || bName} value={bName}>{bName}</option>;
                  })}
                </select>
              </div>

              {(isAdmin || isMasterAdmin) && (
                <button
                  type="button"
                  disabled={savingGeofence}
                  onClick={handleSaveGeofencePolicy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 0.95rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0ea5e9',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: savingGeofence ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 6px rgba(14, 165, 233, 0.3)'
                  }}
                  title="Save Geofence Policy"
                >
                  <ShieldCheck size={15} /> {savingGeofence ? 'Saving...' : 'Save Geofence Policy'}
                </button>
              )}

              <span style={{
                fontSize: '0.8rem',
                padding: '0.35rem 0.85rem',
                borderRadius: '20px',
                background: geofenceSettings.enable_geofence ? 'rgba(22, 163, 74, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                color: geofenceSettings.enable_geofence ? '#16a34a' : '#64748b',
                fontWeight: 700,
                border: geofenceSettings.enable_geofence ? '1px solid rgba(22, 163, 74, 0.3)' : '1px solid rgba(100, 116, 139, 0.3)'
              }}>
                {geofenceSettings.enable_geofence ? '🟢 Geofencing Active' : '⚪ Geofencing Disabled'}
              </span>
            </div>
          </div>

          {/* Toast Notification */}
          {geofenceToast && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: geofenceToast.type === 'success' ? 'rgba(22, 163, 74, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: geofenceToast.type === 'success' ? '#16a34a' : '#ef4444',
              border: geofenceToast.type === 'success' ? '1px solid rgba(22, 163, 74, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
            }}>
              {geofenceToast.message}
            </div>
          )}

          {/* Master Controls & Policy Configuration Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1.25rem' }}>
            
            {/* Card 1: Master Geofencing Enforcement */}
            <div className="card" style={{ padding: '1.25rem 1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  1. GPS Geofence Enforcement
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={geofenceSettings.enable_geofence}
                    onChange={(e) => setGeofenceSettings({ ...geofenceSettings, enable_geofence: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: geofenceSettings.enable_geofence ? '#16a34a' : 'var(--text-secondary)' }}>
                    {geofenceSettings.enable_geofence ? 'ENABLED' : 'DISABLED'}
                  </span>
                </label>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                When enabled, mobile & browser check-ins are verified against the physical GPS perimeter of configured office campuses.
              </p>
            </div>

            {/* Card 2: GPS Hardware Requirement Mode */}
            <div className="card" style={{ padding: '1.25rem 1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '16px' }}>
              <span style={{ display: 'block', fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                2. Device GPS Capture Mode
              </span>
              <select
                value={geofenceSettings.require_gps}
                onChange={(e) => setGeofenceSettings({ ...geofenceSettings, require_gps: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  outline: 'none',
                  marginBottom: '0.4rem'
                }}
              >
                <option value="OFF">OFF — GPS Capture Disabled</option>
                <option value="AUTO">AUTO — Auto-capture GPS (Recommended with fallback)</option>
                <option value="ON">ON — Strict Mandatory GPS (Blocks punch without location)</option>
              </select>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                {geofenceSettings.require_gps === 'ON' ? '⚠️ Strict Mode: Punch will fail if employee denies GPS permission.' : 'Graceful Mode: Device GPS captured in background without blocking offline work.'}
              </p>
            </div>

            {/* Card 3: Boundary Violation Action */}
            <div className="card" style={{ padding: '1.25rem 1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '16px' }}>
              <span style={{ display: 'block', fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                3. Outside Boundary Violation Rule
              </span>
              <select
                value={geofenceSettings.geofence_mode}
                onChange={(e) => setGeofenceSettings({ ...geofenceSettings, geofence_mode: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  outline: 'none',
                  marginBottom: '0.4rem'
                }}
              >
                <option value="STRICT_BLOCK">STRICT BLOCK — Block punch if outside office radius</option>
                <option value="FLAG_OUTSIDE">FLAG OUTSIDE — Allow punch with [Outside Geofence] flag</option>
              </select>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                {geofenceSettings.geofence_mode === 'STRICT_BLOCK' ? '🚫 Punch is strictly rejected until employee arrives on campus.' : '⚠️ Allows punch for field staff or remote work, but flags distance in attendance logs.'}
              </p>
            </div>

          </div>

          {/* Live Device GPS Tester Card */}
          <div className="card" style={{
            padding: '1.25rem 1.5rem',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Navigation size={18} color="#0ea5e9" />
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    Live GPS Terminal & Boundary Tester
                  </h3>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                  Test your device GPS receiver right now to verify live coordinates and distance calculation against office campuses.
                </p>
              </div>

              <button
                type="button"
                disabled={testingGps}
                onClick={handleTestLiveGPS}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.45rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid #0ea5e9',
                  background: 'rgba(14, 165, 233, 0.1)',
                  color: '#0ea5e9',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: testingGps ? 'not-allowed' : 'pointer'
                }}
              >
                <MapPin size={15} /> {testingGps ? 'Capturing GPS...' : '📍 Test My Current GPS Location'}
              </button>
            </div>

            {liveGpsResult && (
              <div style={{
                marginTop: '1rem',
                padding: '1rem',
                borderRadius: '12px',
                border: '1px solid var(--border-light)',
                background: liveGpsResult.success ? 'var(--bg-primary)' : 'rgba(239, 68, 68, 0.08)'
              }}>
                {liveGpsResult.success ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.82rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.74rem' }}>DEVICE GPS COORDINATES</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{Number(liveGpsResult.latitude).toFixed(5)}, {Number(liveGpsResult.longitude).toFixed(5)}</strong>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: '0.4rem', fontSize: '0.74rem' }}>(±{liveGpsResult.accuracy}m)</span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.74rem' }}>NEAREST OFFICE CAMPUS</span>
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {liveGpsResult.nearestOffice ? liveGpsResult.nearestOffice.name : 'No office locations configured yet'}
                      </strong>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.74rem' }}>CALCULATED DISTANCE</span>
                      {liveGpsResult.minDistance !== null ? (
                        <strong style={{ color: liveGpsResult.isWithin ? '#16a34a' : '#ea580c' }}>
                          {liveGpsResult.minDistance} Meters Away
                        </strong>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>N/A</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {liveGpsResult.isWithin !== null && (
                        <span style={{
                          padding: '0.3rem 0.65rem',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          background: liveGpsResult.isWithin ? 'rgba(22, 163, 74, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: liveGpsResult.isWithin ? '#16a34a' : '#ef4444'
                        }}>
                          {liveGpsResult.isWithin ? '✅ Inside Allowed Boundary' : '🚫 Outside Boundary Radius'}
                        </span>
                      )}
                      {liveGpsResult.mapsUrl && (
                        <a
                          href={liveGpsResult.mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#0ea5e9', fontWeight: 600, fontSize: '0.78rem', textDecoration: 'none' }}
                        >
                          Google Maps ↗
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#ef4444', fontSize: '0.84rem', fontWeight: 600 }}>
                    ⚠️ {liveGpsResult.error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Configured Office Geofence Locations Master Table */}
          <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Building style={{ color: '#0ea5e9' }} size={20} />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    Configured Office Geofence Locations
                  </h3>
                  <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9', fontWeight: 700 }}>
                    {geofenceSettings.geofence_locations.length} {geofenceSettings.geofence_locations.length === 1 ? 'Location' : 'Locations'} Registered
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
                  Campuses and manufacturing units where employee GPS punches are verified.
                </p>
              </div>

              {(isAdmin || isMasterAdmin) && (
                <button
                  type="button"
                  onClick={handleOpenAddLocation}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #0ea5e9',
                    background: 'rgba(14, 165, 233, 0.08)',
                    color: '#0ea5e9',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={15} /> Add Office Campus
                </button>
              )}
            </div>

            {geofenceSettings.geofence_locations.length === 0 ? (
              <div style={{
                padding: '2.5rem 1rem',
                textAlign: 'center',
                background: 'var(--bg-primary)',
                borderRadius: '12px',
                border: '1px dashed var(--border-light)'
              }}>
                <MapPin size={36} color="var(--text-secondary)" style={{ margin: '0 auto 0.75rem auto', display: 'block', opacity: 0.6 }} />
                <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  No Office Locations Configured
                </h4>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
                  Add your office or factory coordinates with an allowed boundary radius (e.g. 200m) to enforce attendance geofencing.
                </p>
                {(isAdmin || isMasterAdmin) && (
                  <button
                    type="button"
                    onClick={handleOpenAddLocation}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#0ea5e9',
                      color: '#ffffff',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    + Add First Office Campus
                  </button>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '10px' }}>
                <MobileTableView id="Attendance/AttendanceModule-GeofenceMaster">
                  <table style={{ width: '100%', minWidth: `${getGeofenceTotalWidth()}px`, borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-primary)', borderBottom: '2px solid var(--border-light)', textAlign: 'left' }}>
                        <th style={{ width: `${geofenceColWidths.name}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                          <span>Campus Name</span>
                          <ColumnResizer colKey="name" isResizing={geofenceResizingCol === 'name'} onResizeStart={handleGeofenceResizeStart} onReset={resetGeofenceColWidth} />
                        </th>
                        <th style={{ width: `${geofenceColWidths.coordinates}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                          <span>GPS Coordinates</span>
                          <ColumnResizer colKey="coordinates" isResizing={geofenceResizingCol === 'coordinates'} onResizeStart={handleGeofenceResizeStart} onReset={resetGeofenceColWidth} />
                        </th>
                        <th style={{ width: `${geofenceColWidths.radius}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                          <span>Allowed Radius</span>
                          <ColumnResizer colKey="radius" isResizing={geofenceResizingCol === 'radius'} onResizeStart={handleGeofenceResizeStart} onReset={resetGeofenceColWidth} />
                        </th>
                        <th style={{ width: `${geofenceColWidths.address}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                          <span>Address / Landmark</span>
                          <ColumnResizer colKey="address" isResizing={geofenceResizingCol === 'address'} onResizeStart={handleGeofenceResizeStart} onReset={resetGeofenceColWidth} />
                        </th>
                        <th style={{ width: `${geofenceColWidths.status}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                          <span>Status</span>
                          <ColumnResizer colKey="status" isResizing={geofenceResizingCol === 'status'} onResizeStart={handleGeofenceResizeStart} onReset={resetGeofenceColWidth} />
                        </th>
                        <th style={{ width: `${geofenceColWidths.actions}px`, padding: '0.75rem 0.85rem', fontWeight: 700, position: 'relative', boxSizing: 'border-box' }}>
                          <span>Actions</span>
                          <ColumnResizer colKey="actions" isResizing={geofenceResizingCol === 'actions'} onResizeStart={handleGeofenceResizeStart} onReset={resetGeofenceColWidth} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {geofenceSettings.geofence_locations.map((loc, idx) => (
                        <tr key={loc.id || idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <MapPin size={16} color="#0ea5e9" />
                              <span>{loc.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>
                            <a
                              href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0ea5e9', textDecoration: 'none' }}
                            >
                              {Number(loc.latitude).toFixed(4)}, {Number(loc.longitude).toFixed(4)} ↗
                            </a>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: '#16a34a' }}>
                            {loc.radius_meters || 200} Meters
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-secondary)' }}>
                            {loc.address || '—'}
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>
                            {loc.is_active !== false ? (
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>🟢 Active</span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>⚪ Inactive</span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              {(isAdmin || isMasterAdmin) && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleEditLocation(idx)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.2rem',
                                      padding: '0.3rem 0.55rem',
                                      borderRadius: '6px',
                                      border: '1px solid var(--border-light)',
                                      background: 'var(--bg-surface)',
                                      color: 'var(--text-primary)',
                                      fontSize: '0.75rem',
                                      cursor: 'pointer'
                                    }}
                                    title="Edit Location"
                                  >
                                    <Edit2 size={12} /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveLocation(idx)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      padding: '0.3rem 0.55rem',
                                      borderRadius: '6px',
                                      border: '1px solid rgba(239, 68, 68, 0.3)',
                                      background: 'rgba(239, 68, 68, 0.08)',
                                      color: '#ef4444',
                                      fontSize: '0.75rem',
                                      cursor: 'pointer'
                                    }}
                                    title="Remove Location"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </MobileTableView>
              </div>
            )}
          </div>

          {/* Add / Edit Office Campus Modal */}
          {showLocationModal && (
            <div style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '1rem'
            }}>
              <div className="card" style={{
                width: '100%',
                maxWidth: '560px',
                background: 'var(--bg-surface)',
                borderRadius: '16px',
                border: '1px solid var(--border-light)',
                padding: '1.5rem',
                boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
                maxHeight: '90vh',
                overflowY: 'auto'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <MapPin size={22} color="#0ea5e9" />
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                        {editingLocationIndex !== null ? 'Edit Office Geofence' : 'Add Office Geofence Campus'}
                      </h3>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                        Set campus coordinates and allowed check-in radius
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLocationModal(false)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleSaveLocationForm} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                      Campus / Unit Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ludhiana Main Plant (NSMLR)"
                      value={locationForm.name}
                      onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>

                  {/* Coordinates with Auto-Detect */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        GPS Coordinates (Latitude & Longitude) *
                      </label>
                      <button
                        type="button"
                        onClick={handleFetchCurrentCoordsForForm}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          background: 'transparent',
                          border: 'none',
                          color: '#0ea5e9',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          fontWeight: 700
                        }}
                      >
                        <Navigation size={13} /> Auto-Fill Current Device GPS
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="Latitude (e.g. 30.9010)"
                        value={locationForm.latitude}
                        onChange={(e) => setLocationForm({ ...locationForm, latitude: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="Longitude (e.g. 75.8573)"
                        value={locationForm.longitude}
                        onChange={(e) => setLocationForm({ ...locationForm, longitude: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </div>

                  {/* Allowed Radius */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                      Allowed Check-in Radius (Meters) *
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <input
                        type="number"
                        min="20"
                        max="10000"
                        required
                        value={locationForm.radius_meters}
                        onChange={(e) => setLocationForm({ ...locationForm, radius_meters: Number(e.target.value) })}
                        style={{
                          width: '120px',
                          padding: '0.55rem 0.75rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-light)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem',
                          fontWeight: 700
                        }}
                      />
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Meters</span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {[100, 200, 300, 500, 1000].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setLocationForm({ ...locationForm, radius_meters: r })}
                          style={{
                            padding: '0.25rem 0.6rem',
                            borderRadius: '6px',
                            border: locationForm.radius_meters === r ? '1px solid #0ea5e9' : '1px solid var(--border-light)',
                            background: locationForm.radius_meters === r ? 'rgba(14, 165, 233, 0.15)' : 'var(--bg-primary)',
                            color: locationForm.radius_meters === r ? '#0ea5e9' : 'var(--text-secondary)',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {r}m {r === 200 ? '(Recommended)' : ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Address */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                      Plant Address / Landmark
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Focal Point Phase V, Ludhiana"
                      value={locationForm.address}
                      onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>

                  {/* Active Status */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={locationForm.is_active}
                      onChange={(e) => setLocationForm({ ...locationForm, is_active: e.target.checked })}
                      style={{ width: '16px', height: '16px' }}
                    />
                    Location is Active
                  </label>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowLocationModal(false)}
                      style={{
                        padding: '0.55rem 1rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: '0.55rem 1.25rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#0ea5e9',
                        color: '#ffffff',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {editingLocationIndex !== null ? 'Save Changes' : 'Add Campus'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ========================================================================================= */}
      {/* MODAL 1: APPLY MISSING ATTENDANCE / REGULARIZATION */}
      {/* ========================================================================================= */}
      {showApplyModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '520px',
            background: 'var(--bg-surface)',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            padding: '1.5rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Apply Missing Attendance</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                  Request HOD approval for missed in/out punches
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowApplyModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitRegularization} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Date */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Date of Missing Attendance *
                </label>
                <input
                  type="date"
                  required
                  max={getTodayDateString()}
                  value={applyForm.attendanceDate}
                  onChange={(e) => setApplyForm({ ...applyForm, attendanceDate: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Request Type */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  What punch was missed? *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  {[
                    { id: 'MISSED_IN', label: 'Missed In' },
                    { id: 'MISSED_OUT', label: 'Missed Out' },
                    { id: 'BOTH', label: 'Both In & Out' }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setApplyForm({ ...applyForm, requestType: t.id })}
                      style={{
                        padding: '0.5rem',
                        borderRadius: '8px',
                        border: applyForm.requestType === t.id ? '2px solid var(--accent-color)' : '1px solid var(--border-light)',
                        background: applyForm.requestType === t.id ? 'var(--nav-active-bg)' : 'var(--bg-primary)',
                        color: applyForm.requestType === t.id ? 'var(--accent-color)' : 'var(--text-primary)',
                        fontWeight: 600,
                        fontSize: '0.78rem',
                        cursor: 'pointer'
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Requested In Time & Out Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {(applyForm.requestType === 'MISSED_IN' || applyForm.requestType === 'BOTH') && (
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#16a34a', display: 'block', marginBottom: '0.35rem' }}>
                      Correct In Time *
                    </label>
                    <input
                      type="time"
                      required
                      value={applyForm.requestedInTime}
                      onChange={(e) => setApplyForm({ ...applyForm, requestedInTime: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.88rem',
                        outline: 'none'
                      }}
                    />
                  </div>
                )}

                {(applyForm.requestType === 'MISSED_OUT' || applyForm.requestType === 'BOTH') && (
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626', display: 'block', marginBottom: '0.35rem' }}>
                      Correct Out Time *
                    </label>
                    <input
                      type="time"
                      required
                      value={applyForm.requestedOutTime}
                      onChange={(e) => setApplyForm({ ...applyForm, requestedOutTime: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.88rem',
                        outline: 'none'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Reason Category */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Reason Category *
                </label>
                <select
                  value={applyForm.reasonType}
                  onChange={(e) => setApplyForm({ ...applyForm, reasonType: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                >
                  {REASON_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Explanation Textarea */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Explanation & Details for HOD *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why you missed punching in/out and provide necessary context..."
                  value={applyForm.reasonDetails}
                  onChange={(e) => setApplyForm({ ...applyForm, reasonDetails: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Error or Success feedback */}
              {applyError && (
                <div style={{ padding: '0.6rem', borderRadius: '8px', background: '#fee2e2', color: '#991b1b', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <AlertCircle size={15} /> {applyError}
                </div>
              )}
              {applySuccess && (
                <div style={{ padding: '0.6rem', borderRadius: '8px', background: '#dcfce7', color: '#166534', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <CheckCircle2 size={15} /> {applySuccess}
                </div>
              )}

              {/* Submit Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  style={{
                    padding: '0.55rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={applying}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.55rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--accent-color)',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: applying ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Send size={15} /> {applying ? 'Submitting...' : 'Submit to HOD'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* MODAL 2: HOD ACTION (APPROVE / REJECT) */}
      {/* ========================================================================================= */}
      {actionModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '460px',
            background: 'var(--bg-surface)',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            padding: '1.5rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: actionModal.type === 'APPROVE' ? '#dcfce7' : '#fee2e2',
                color: actionModal.type === 'APPROVE' ? '#166534' : '#991b1b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {actionModal.type === 'APPROVE' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                  {actionModal.type === 'APPROVE' ? 'Approve Regularization' : 'Reject Regularization'}
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Employee: <strong>{actionModal.request?.emp_name}</strong> • Date: <strong>{actionModal.request?.attendance_date}</strong>
                </span>
              </div>
            </div>

            {actionModal.type === 'APPROVE' ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                Approving this request will <strong>immediately update this employee's attendance record</strong> on <strong>{actionModal.request?.attendance_date}</strong> with the requested punch times.
              </p>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                Please specify the reason for rejecting this regularization request.
              </p>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                HOD Remarks {actionModal.type === 'REJECT' ? '*' : '(Optional)'}
              </label>
              <textarea
                rows={2}
                placeholder={actionModal.type === 'APPROVE' ? 'e.g., Approved, verified with client schedule.' : 'e.g., Rejected due to unverified attendance.'}
                value={actionRemarks}
                onChange={(e) => setActionRemarks(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                disabled={processingAction}
                onClick={() => { setActionModal(null); setActionRemarks(''); }}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processingAction}
                onClick={handleExecuteHodAction}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: actionModal.type === 'APPROVE' ? '#16a34a' : '#dc2626',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: processingAction ? 'not-allowed' : 'pointer'
                }}
              >
                {processingAction ? 'Processing...' : (actionModal.type === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection')}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* MODAL 3: BULK HOD ACTION (BATCH APPROVE / BATCH REJECT) */}
      {/* ========================================================================================= */}
      {bulkActionModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '480px',
            background: 'var(--bg-surface)',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            padding: '1.5rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: bulkActionModal.type === 'APPROVE' ? '#dcfce7' : '#fee2e2',
                color: bulkActionModal.type === 'APPROVE' ? '#166534' : '#991b1b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {bulkActionModal.type === 'APPROVE' ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                  {bulkActionModal.type === 'APPROVE' ? 'Batch Approve Requests' : 'Batch Reject Requests'}
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Total Selected: <strong>{selectedHodRequests.size} requests</strong>
                </span>
              </div>
            </div>

            {bulkActionModal.type === 'APPROVE' ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                Are you sure you want to approve all <strong>{selectedHodRequests.size}</strong> selected regularization requests? This will <strong>instantly update all attendance records</strong> for their respective dates.
              </p>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                Please specify a reason for batch rejecting <strong>{selectedHodRequests.size}</strong> selected requests.
              </p>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                Batch Remarks {bulkActionModal.type === 'REJECT' ? '*' : '(Optional)'}
              </label>
              <textarea
                rows={2}
                placeholder={bulkActionModal.type === 'APPROVE' ? 'e.g., Bulk approved after team verification.' : 'e.g., Rejected due to invalid punch requests.'}
                value={bulkRemarks}
                onChange={(e) => setBulkRemarks(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                disabled={bulkActionLoading}
                onClick={() => { setBulkActionModal(null); setBulkRemarks(''); }}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkActionLoading}
                onClick={handleProcessBulkHodAction}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: bulkActionModal.type === 'APPROVE' ? '#16a34a' : '#dc2626',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: bulkActionLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {bulkActionLoading ? 'Processing Batch...' : (bulkActionModal.type === 'APPROVE' ? `Confirm Approve (${selectedHodRequests.size})` : `Confirm Reject (${selectedHodRequests.size})`)}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal 1: Apply Leave Modal */}
      {showApplyLeaveModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backdropFilter: 'blur(3px)'
        }}>
          <div className="card" style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            padding: '1.5rem',
            maxWidth: '560px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(37, 99, 235, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-color, #2563eb)'
                }}>
                  <Calendar size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>Apply for Leave</h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Submit official leave request to your HOD</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowApplyLeaveModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Mini Balance Ledger Overview */}
            {leaveBalance && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.6rem',
                padding: '0.75rem',
                background: 'var(--bg-primary)',
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                marginBottom: '1.25rem'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Casual (CL)</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#2563eb' }}>{leaveBalance.cl?.remaining ?? 0} <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ {leaveBalance.cl?.quota ?? 8}</span></div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Sick (SL)</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#16a34a' }}>{leaveBalance.sl?.remaining ?? 0} <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ {leaveBalance.sl?.quota ?? 6}</span></div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Earned (EL)</div>
                  {leaveBalance.el?.isLocked ? (
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>🔒 Locked</span>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{leaveBalance.el?.lockReason || '1-Yr Lockin'}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#9333ea' }}>{leaveBalance.el?.remaining ?? 0} <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ {leaveBalance.el?.quota ?? 15}</span></div>
                  )}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Comp-Off (CPL)</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#4f46e5' }}>{leaveBalance.cpl?.balance ?? 0} <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ {leaveBalance.cpl?.earned ?? 0}</span></div>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleApplyLeaveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Leave Type *
                </label>
                <select
                  value={leaveForm.leave_type}
                  onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="CL">Casual Leave (CL) - Short notice / Personal</option>
                  <option value="SL">Sick Leave (SL) - Health & Medical</option>
                  <option value="EL" disabled={leaveBalance?.el?.isLocked}>Earned / Privilege Leave (EL) {leaveBalance?.el?.isLocked ? '(🔒 Locked - 1 Yr Probation)' : ''}</option>
                  <option value="CPL" disabled={!leaveBalance?.cpl?.balance || leaveBalance.cpl.balance <= 0}>
                    Compensatory Off (CPL) {!leaveBalance?.cpl?.balance || leaveBalance.cpl.balance <= 0 ? '(0 Available - Earned on Sundays/Holidays)' : `(${leaveBalance.cpl.balance} Day(s) Available)`}
                  </option>
                  <option value="HD-L">Half Day Leave (0.5 Day)</option>
                  <option value="LWP">Leave Without Pay (LWP / Loss of Pay)</option>
                </select>
                {leaveForm.leave_type === 'EL' && leaveBalance?.el?.isLocked && (
                  <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.75rem', color: '#dc2626' }}>
                    ⚠️ EL is locked during your 1-year probation period. It will unlock on {leaveBalance.el.unlocksOn || 'completion of 12 months'}.
                  </p>
                )}
              </div>

              {leaveForm.leave_type === 'HD-L' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                    Session
                  </label>
                  <select
                    value={leaveForm.half_day_session}
                    onChange={(e) => setLeaveForm({ ...leaveForm, half_day_session: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="FIRST_HALF">First Half (Morning to Midday)</option>
                    <option value="SECOND_HALF">Second Half (Post Lunch to Evening)</option>
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: leaveForm.leave_type === 'HD-L' ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                    {leaveForm.leave_type === 'HD-L' ? 'Leave Date *' : 'From Date *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={leaveForm.from_date}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLeaveForm(prev => ({
                        ...prev,
                        from_date: val,
                        to_date: prev.leave_type === 'HD-L' ? val : (prev.to_date < val ? val : prev.to_date)
                      }));
                    }}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
                {leaveForm.leave_type !== 'HD-L' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                      To Date *
                    </label>
                    <input
                      type="date"
                      required
                      min={leaveForm.from_date}
                      value={leaveForm.to_date}
                      onChange={(e) => setLeaveForm({ ...leaveForm, to_date: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Reason for Leave *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Please describe reason for leave application..."
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowApplyLeaveModal(false)}
                  style={{
                    padding: '0.55rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={applyingLeave || (leaveForm.leave_type === 'EL' && leaveBalance?.el?.isLocked)}
                  style={{
                    padding: '0.55rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--accent-color, #2563eb)',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: (applyingLeave || (leaveForm.leave_type === 'EL' && leaveBalance?.el?.isLocked)) ? 'not-allowed' : 'pointer',
                    opacity: (applyingLeave || (leaveForm.leave_type === 'EL' && leaveBalance?.el?.isLocked)) ? 0.6 : 1
                  }}
                >
                  {applyingLeave ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: HOD Leave Approve / Reject Action Modal */}
      {leaveActionModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backdropFilter: 'blur(3px)'
        }}>
          <div className="card" style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            padding: '1.5rem',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: leaveActionModal.type === 'APPROVE' ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: leaveActionModal.type === 'APPROVE' ? '#16a34a' : '#dc2626'
              }}>
                {leaveActionModal.type === 'APPROVE' ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {leaveActionModal.type === 'APPROVE' ? 'Approve Leave Request' : 'Reject Leave Request'}
                </h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Employee: <strong>{leaveActionModal.request?.emp_name}</strong> ({leaveActionModal.request?.emp_email})
                </p>
              </div>
            </div>

            <div style={{
              background: 'var(--bg-primary)',
              padding: '0.85rem',
              borderRadius: '10px',
              border: '1px solid var(--border-light)',
              marginBottom: '1rem',
              fontSize: '0.82rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Leave Type:</span>
                <strong>{leaveActionModal.request?.leave_type}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Duration:</span>
                <strong>{leaveActionModal.request?.from_date} to {leaveActionModal.request?.to_date} ({leaveActionModal.request?.days_count} day(s))</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Reason: </span>
                <span style={{ fontStyle: 'italic' }}>"{leaveActionModal.request?.reason}"</span>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                HOD Remarks {leaveActionModal.type === 'REJECT' ? '*' : '(Optional)'}
              </label>
              <textarea
                rows={2}
                placeholder={leaveActionModal.type === 'APPROVE' ? 'e.g., Approved as per discussion.' : 'e.g., Project delivery pending on selected dates.'}
                value={leaveActionModal.remarks || ''}
                onChange={(e) => setLeaveActionModal({ ...leaveActionModal, remarks: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                disabled={processingLeaveAction}
                onClick={() => setLeaveActionModal(null)}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processingLeaveAction || (leaveActionModal.type === 'REJECT' && !leaveActionModal.remarks?.trim())}
                onClick={handleProcessLeaveAction}
                style={{
                  padding: '0.55rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: leaveActionModal.type === 'APPROVE' ? '#16a34a' : '#dc2626',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: processingLeaveAction ? 'not-allowed' : 'pointer'
                }}
              >
                {processingLeaveAction ? 'Processing...' : (leaveActionModal.type === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Leave Adjustment in Export Prompt Modal (User Requested!) */}
      {showLeaveAdjustPromptModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backdropFilter: 'blur(3px)'
        }}>
          <div className="card" style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            padding: '1.75rem',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(37, 99, 235, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-color, #2563eb)'
              }}>
                <Download size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Export Monthly Attendance Report
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Choose how approved employee leaves should be processed in this export
                </p>
              </div>
            </div>

            <div style={{
              background: 'rgba(37, 99, 235, 0.05)',
              border: '1px solid rgba(37, 99, 235, 0.2)',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '1.25rem'
            }}>
              <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                <strong>Aapki report me Approved Leaves ko salary me adjust karna chahte hain ya Raw Attendance nikalni hai?</strong>
              </p>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                • <strong>Adjust Leaves (Paid)</strong>: CL, SL aur EL ko paid days me count karke Net Salary and Payable Days calculate honge.<br />
                • <strong>Raw Attendance Only</strong>: Sirf physical/biometric punch aur present/absent data aayega, bina leaves credit ke.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowLeaveAdjustPromptModal(false);
                  executeExportMonthlyMatrixCSV(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1.2rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#16a34a',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={18} />
                  <span>🟢 Adjust Approved Leaves (Paid in Salary)</span>
                </div>
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowLeaveAdjustPromptModal(false);
                  executeExportMonthlyMatrixCSV(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1.2rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileSpreadsheet size={18} color="var(--text-secondary)" />
                  <span>⚪ Raw Attendance Only (Without Leaves)</span>
                </div>
                <ArrowRight size={16} color="var(--text-secondary)" />
              </button>

              <button
                type="button"
                onClick={() => setShowLeaveAdjustPromptModal(false)}
                style={{
                  padding: '0.55rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                  marginTop: '0.25rem'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Alert */}
      {leaveToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 10000,
          background: leaveToast.type === 'success' ? '#16a34a' : '#dc2626',
          color: '#ffffff',
          padding: '0.75rem 1.25rem',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          fontSize: '0.85rem',
          fontWeight: 600
        }}>
          {leaveToast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{leaveToast.message}</span>
          <button
            type="button"
            onClick={() => setLeaveToast(null)}
            style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', padding: 0, marginLeft: '0.5rem' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Modal 4: Grant CPL Credit Modal (Admin / HOD) */}
      {cplGrantModal.show && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backdropFilter: 'blur(3px)'
        }}>
          <div className="card" style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            padding: '1.5rem',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(79, 70, 229, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4f46e5'
                }}>
                  <Award size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>Grant Compensatory Off (CPL)</h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Credit CPL to employee for Sunday or Holiday extra work</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCplGrantModal({ show: false, email: '', empName: '', days: 1.0, reason: '', workDate: getTodayDateString(), validityDays: 60 })}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleGrantCplSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Employee Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="employee@domain.com"
                  value={cplGrantModal.email}
                  onChange={(e) => setCplGrantModal({ ...cplGrantModal, email: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                    Credit Days *
                  </label>
                  <select
                    value={cplGrantModal.days}
                    onChange={(e) => setCplGrantModal({ ...cplGrantModal, days: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value={1.0}>1.0 Day (Full CPL)</option>
                    <option value={0.5}>0.5 Day (Half CPL)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                    Work Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={cplGrantModal.workDate}
                    onChange={(e) => setCplGrantModal({ ...cplGrantModal, workDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Reason / Assignment Note *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Worked on Sunday for emergency maintenance / inventory audit"
                  value={cplGrantModal.reason}
                  onChange={(e) => setCplGrantModal({ ...cplGrantModal, reason: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    resize: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setCplGrantModal({ show: false, email: '', empName: '', days: 1.0, reason: '', workDate: getTodayDateString(), validityDays: 60 })}
                  style={{
                    padding: '0.55rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingCplGrant}
                  style={{
                    padding: '0.55rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#4f46e5',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: processingCplGrant ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)'
                  }}
                >
                  {processingCplGrant ? 'Crediting...' : 'Confirm Credit CPL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hidden Audio Player for Human Voice Announcements */}
      <audio ref={audioPlayerRef} preload="auto" style={{ display: 'none' }} />

    </div>
  );
}
