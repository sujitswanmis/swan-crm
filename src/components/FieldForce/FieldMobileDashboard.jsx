'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Layers, FileText, Navigation, Phone, MessageSquare, Mail } from 'lucide-react';
import {
  performCheckIn,
  performCheckOutWithOutput,
  getFieldTasksForUser,
  getModuleEntitiesForCheckIn,
  getActiveFieldVisit,
  getUserCompletedVisitsToday,
  getTodayUserAttendanceStatus,
} from '@/app/actions/fieldTasks';
import { getPublishedForms } from '@/app/actions/fieldFormStudio';
import { burnWatermarkOnPhoto } from '@/utils/cameraWatermark';
import { queueOfflineAction, getPendingQueue, syncOfflineQueue, isOnline } from '@/utils/offlineLocationVault';
import {
  AttendancePolicyBanner,
  ConsoleActiveVisitView,
  ConsoleAssignedTasksView,
  ConsoleCheckInWorkspace,
  ConsoleCompletedVisitsView,
  ConsoleHeader,
  getTaskInstructions,
  getTaskStageInfo,
} from './FieldExecutiveConsoleUI';
import styles from './FieldExecutiveConsole.module.css';

const CONNECTIVITY_MODES = [
  { id: 'PHYSICAL_VISIT', label: 'Physical Visit', icon: Navigation, desc: 'On-site GPS & Watermark verified. Qualifies for TA/DA petrol.', color: '#16a34a' },
  { id: 'TELEPHONIC_CALL', label: 'Telephonic', icon: Phone, desc: 'Voice discussion & stage update. Zero petrol claim.', color: '#2563eb' },
  { id: 'WHATSAPP_CHAT', label: 'WhatsApp', icon: MessageSquare, desc: 'WhatsApp follow-up & documents shared.', color: '#059669' },
  { id: 'EMAIL_QUOTE', label: 'Email / Quote', icon: Mail, desc: 'Formal proposal sent via email.', color: '#7c3aed' },
];

const PIPELINES = [
  { id: 'LEAD_DATA', label: 'Lead Data Pipeline (S01 - S08)', icon: Layers },
  { id: 'ORDER_DELIVERY', label: 'Order to Delivery (S01 - S13)', icon: Layers },
  { id: 'COMPLAINT_SERVICE', label: 'Complaint & Service (C01 - C06)', icon: Layers },
  { id: 'CUSTOM_FORM', label: 'Assigned Custom Form', icon: FileText },
];

const CRM_LEAD_STAGES = [
  { name: '01 - New Stage', substages: ['New Lead', 'Assigned', 'Contact Pending'] },
  { name: '02 - Contact Stage', substages: ['Contacted', 'Wrong Number', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '03 - Qualification Stage', substages: ['Interested', 'Qualified', 'Unqualified', 'Need Identified', 'Budget Confirmed', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '04 - Follow Up Stage', substages: ['Catalog Shared', 'Follow Up Required', 'Next Follow Up Set', 'Follow Up Done', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '05 - Sales Process Stage', substages: ['Visit Require Sales Person', 'Before Visit Conference Call Pending', 'Before Visit Conference Call Done', 'Visit Confirmation Date', 'Task Assigned in TrackWick', 'Meeting Pending', 'Meeting Done', 'Negotiation Pending', 'Negotiation Done', 'Client Documentation Pending', 'Client Documentation Done', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '06 - Conversion Stage', substages: ['Token Amount Pending', 'Token Amount Deposited', 'Client Details Pending', 'Client Details Received', 'Billing 1st Quotation Pending', 'Billing 1st Quotation Sent', 'Quotation Revision Required', 'Quotation Approved by Client', 'Billing 1st Advance Payment Pending', 'Billing 1st Advance Paid', 'Payment Verification Pending', 'Payment Verified', 'Order Confirmed', 'Stock Availability Check', 'Stock Not Available', 'Production Planning Required', 'Delivery Date Confirmed', 'Final Billing 1st Pending', 'Final Billing 1st Done', 'Ready for Dispatch', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '07 - Final Stage', substages: ['Converted - Out for Delivery', 'Converted - Order Received', 'Converted - Final Feedback From Client', 'Won', 'Lost After Quotation', 'Lost Due to Price Issue', 'Lost Due to Payment Issue', 'Lost Due to Stock Issue', 'Hold - Client Side', 'Hold - Company Side', 'Duplicate Lead', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '08 - Transfer to Party', substages: ['Pending Confirmation', 'Transferred to Party Master', 'Won - Transferred'] },
];

const ORDER_DELIVERY_STAGES = [
  'S01 - Order Confirmation',
  'S02 - PI Generation',
  'S03 - PI Shared',
  'S04 - Request Advance Payment',
  'S05 - Receive Advance Payment',
  'S06 - Check Stock & Production',
  'S07 - Product Partial & Full Status',
  'S08 - Quality Check (PDI)',
  'S09 - Request 70% Balance',
  'S10 - Receive 70% Balance',
  'S11 - Ready for Dispatch',
  'S12 - Dispatch Material',
  'S13 - Material Delivered (POD)',
];

function calculateHaversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export default function FieldMobileDashboard({
  currentUserId,
  company = 'TNT00001',
  tenantId = null,
  branchCode = null,
  branchAccess = null,
  userName = 'Field Person',
  userEmail = '',
  onNavigateToAttendance = null,
}) {
  const [activeTab, setActiveTab] = useState('SCHEDULED_TASKS'); // 'SCHEDULED_TASKS' | 'ACTIVE_VISIT'

  const [attendanceStatus, setAttendanceStatus] = useState({
    checked: false,
    loading: true,
    isPunchedIn: false,
    isPunchedOut: false,
    inTime: null,
    outTime: null,
  });

  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [customForms, setCustomForms] = useState([]);

  const [selectedTask, setSelectedTask] = useState(null);
  const [connectivityMode, setConnectivityMode] = useState('PHYSICAL_VISIT');
  const [activePipeline, setActivePipeline] = useState('LEAD_DATA');
  const [selectedFormId, setSelectedFormId] = useState('');

  const [mainView, setMainView] = useState('ASSIGNED_TASKS'); // 'ASSIGNED_TASKS' | 'CHECK_IN' | 'COMPLETED_VISITS'
  const [todayCompletedVisits, setTodayCompletedVisits] = useState([]);
  const [loadingCompleted, setLoadingCompleted] = useState(false);

  const [selectedModule, setSelectedModule] = useState('LEAD_DATA'); // 'LEAD_DATA' | 'PARTY_MASTER' | 'FIELD_TASK'
  const [moduleEntities, setModuleEntities] = useState([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isManualEntry, setIsManualEntry] = useState(false);

  const [partyName, setPartyName] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [partyAddress, setPartyAddress] = useState('');
  const [leadId, setLeadId] = useState(null);
  const [partyLat, setPartyLat] = useState(null);
  const [partyLng, setPartyLng] = useState(null);

  // Live GPS state
  const [userLat, setUserLat] = useState(null);
  const [userLng, setUserLng] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Active visit state
  const [activeCheckInTime, setActiveCheckInTime] = useState(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  // Output form inputs
  const [leadStage, setLeadStage] = useState('2;01>Contact Stage>Contacted');
  const [orderDeliveryStage, setOrderDeliveryStage] = useState('S01 - Order Confirmation');
  const [workOutcome, setWorkOutcome] = useState('WORK_DONE');
  const [discussionNotes, setDiscussionNotes] = useState('');
  const [nextFollowup, setNextFollowup] = useState('');

  // Media & voice
  const [photos, setPhotos] = useState([]);
  const [isWatermarking, setIsWatermarking] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [isListening, setIsListening] = useState(false);

  // Network & offline queue
  const [networkOnline, setNetworkOnline] = useState(() => (typeof window !== 'undefined' ? isOnline() : true));
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const signatureCanvasRef = useRef(null);
  const isDrawingRef = useRef(false);

  const refreshPendingQueue = useCallback(async () => {
    try {
      const q = await getPendingQueue();
      setPendingQueueCount(q.length);
    } catch (_) {}
  }, []);

  // 1. Initialize Network & Offline queue listeners
  useEffect(() => {
    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => setNetworkOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const timer = setTimeout(() => {
      void refreshPendingQueue();
    }, 0);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshPendingQueue]);

  // 1.1 Recover Active Visit Session cleanly across page navigation & refresh
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      try {
        const stored = localStorage.getItem('field_active_visit');
        if (stored) {
          const session = JSON.parse(stored);
          if (session?.activeCheckInTime && active) {
            setActiveCheckInTime(session.activeCheckInTime);
            setPartyName(session.partyName || '');
            setPartyPhone(session.partyPhone || '');
            setPartyAddress(session.partyAddress || '');
            setLeadId(session.leadId || null);
            setPartyLat(session.partyLat || null);
            setPartyLng(session.partyLng || null);
            setUserLat(session.userLat || null);
            setUserLng(session.userLng || null);
            setConnectivityMode(session.connectivityMode || 'PHYSICAL_VISIT');
            setActivePipeline(session.activePipeline === 'PARTY_MASTER' ? 'ORDER_DELIVERY' : (session.activePipeline || 'LEAD_DATA'));
            setSelectedTask(session.taskId ? {
              id: session.taskId,
              task_code: session.taskCode || null,
              taskDescription: session.taskDescription || '',
              taskStage: session.taskStage || '',
              taskStageLabel: session.taskStageLabel || ''
            } : null);
            if (session.leadStage) setLeadStage(session.leadStage);
            if (session.orderDeliveryStage) setOrderDeliveryStage(session.orderDeliveryStage);
            if (session.workOutcome) setWorkOutcome(session.workOutcome);
            const diffMs = Date.now() - new Date(session.activeCheckInTime).getTime();
            setElapsedMinutes(Math.max(1, Math.floor(diffMs / 60000)));
            setActiveTab('ACTIVE_VISIT');
            return;
          }
        }
      } catch (e) {
        console.warn('Error reading stored field visit:', e);
      }

      if (currentUserId) {
        getActiveFieldVisit(currentUserId, company)
          .then((task) => {
            if (!active || !task || task.status !== 'IN_PROGRESS') return;
            const startTime = task.actual_start_time || task.scheduled_start_time || new Date().toISOString();
            const isComplaintTask = Boolean(task.task_type && task.task_type.includes('Complaint'));
            const resolvedPipeline = task.lead_id ? 'LEAD_DATA' : (isComplaintTask ? 'COMPLAINT_SERVICE' : 'ORDER_DELIVERY');
            setActiveCheckInTime(startTime);
            setPartyName(task.party_name || '');
            setPartyPhone(task.party_phone || '');
            setPartyAddress(task.party_address || '');
            setLeadId(task.lead_id || null);
            setPartyLat(task.party_lat || null);
            setPartyLng(task.party_lng || null);
            setSelectedTask(task);
            setActivePipeline(resolvedPipeline);
            setElapsedMinutes(Math.max(1, Math.floor((Date.now() - new Date(startTime).getTime()) / 60000)));
            setActiveTab('ACTIVE_VISIT');

            const activeStageInfo = getTaskStageInfo(task);
            try {
              localStorage.setItem('field_active_visit', JSON.stringify({
                taskId: task.id,
                taskCode: task.task_code || null,
                taskDescription: getTaskInstructions(task),
                taskStage: activeStageInfo?.rawValue || '',
                taskStageLabel: activeStageInfo?.label || '',
                activeCheckInTime: startTime,
                partyName: task.party_name,
                partyPhone: task.party_phone,
                partyAddress: task.party_address,
                leadId: task.lead_id,
                partyLat: task.party_lat,
                partyLng: task.party_lng,
                connectivityMode: 'PHYSICAL_VISIT',
                activePipeline: resolvedPipeline,
                workOutcome: 'WORK_DONE',
                company,
              }));
              window.dispatchEvent(new Event('field_visit_state_changed'));
            } catch (_) {}
          })
          .catch(() => {});
      }
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [currentUserId, company]);

  // 2. Fetch Attendance, Completed Visits, Assigned Tasks & Custom Forms
  const loadAttendanceStatus = useCallback(async () => {
    if (!currentUserId && !userEmail) {
      setAttendanceStatus(prev => ({ ...prev, checked: true, loading: false }));
      return;
    }
    try {
      const res = await getTodayUserAttendanceStatus(currentUserId, userEmail);
      setAttendanceStatus({
        checked: true,
        loading: false,
        isPunchedIn: Boolean(res?.isPunchedIn),
        isPunchedOut: Boolean(res?.isPunchedOut),
        inTime: res?.inTime || null,
        outTime: res?.outTime || null,
      });
    } catch (e) {
      console.warn('Failed to verify attendance status:', e);
      setAttendanceStatus(prev => ({ ...prev, checked: true, loading: false }));
    }
  }, [currentUserId, userEmail]);

  const loadCompletedVisits = useCallback(async () => {
    if (!currentUserId) return;
    setLoadingCompleted(true);
    try {
      const data = await getUserCompletedVisitsToday(currentUserId, company);
      setTodayCompletedVisits(data || []);
    } catch (err) {
      console.error('Failed to load completed visits:', err);
    } finally {
      setLoadingCompleted(false);
    }
  }, [currentUserId, company]);

  const visitedMap = useMemo(() => {
    const map = new Map();
    todayCompletedVisits.forEach((v) => {
      if (v.lead_id) map.set(v.lead_id, v);
      if (v.party_name) map.set(v.party_name.toLowerCase().trim(), v);
    });
    return map;
  }, [todayCompletedVisits]);

  const loadTodayTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const data = await getFieldTasksForUser(currentUserId);
      setTasks(data || []);
      if (data && data.length > 0) {
        setMainView(prev => (prev === 'CHECK_IN' ? 'ASSIGNED_TASKS' : prev));
      } else {
        setMainView(prev => (prev === 'ASSIGNED_TASKS' ? 'CHECK_IN' : prev));
      }
    } catch (err) {
      console.error('Failed to load field tasks:', err);
    } finally {
      setLoadingTasks(false);
    }
  }, [currentUserId]);

  const loadPublishedForms = useCallback(async () => {
    try {
      const forms = await getPublishedForms(company);
      setCustomForms(forms || []);
      if (forms && forms.length > 0) {
        setSelectedFormId(prev => prev || forms[0].id);
      }
    } catch (err) {
      console.error('Failed to load forms:', err);
    }
  }, [company]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadTodayTasks();
      void loadPublishedForms();
      void loadCompletedVisits();
      void loadAttendanceStatus();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadTodayTasks, loadPublishedForms, loadCompletedVisits, loadAttendanceStatus]);

  // Tenant-isolated entity search across Leads, Party Master & Assigned Itinerary
  const loadModuleEntities = useCallback(async (modType = selectedModule, searchStr = searchQuery) => {
    if (modType === 'FIELD_TASK') {
      const q = String(searchStr || '').trim().toLowerCase();
      setModuleEntities(
        q
          ? (tasks || []).filter(t => [t.party_name, t.party_phone, t.party_address, t.task_code].some(v => String(v || '').toLowerCase().includes(q)))
          : (tasks || [])
      );
      return;
    }
    setLoadingEntities(true);
    try {
      const allowedCompanies = branchAccess && !branchAccess.isAllBranches && Array.isArray(branchAccess.allowedCompanies)
        ? branchAccess.allowedCompanies
        : null;
      const data = await getModuleEntitiesForCheckIn({
        company,
        tenantId,
        allowedCompanies,
        moduleType: modType,
        search: searchStr,
        limit: 50,
      });
      setModuleEntities(data || []);
    } catch (err) {
      console.error('Error fetching module entities:', err);
    } finally {
      setLoadingEntities(false);
    }
  }, [selectedModule, searchQuery, company, tenantId, branchAccess, tasks]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadModuleEntities(selectedModule, searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [selectedModule, searchQuery, loadModuleEntities]);

  const geofenceInfo = useMemo(() => {
    if (userLat == null || userLng == null || partyLat == null || partyLng == null) {
      return { distance: null, status: 'UNKNOWN' };
    }
    const dist = calculateHaversineMeters(Number(userLat), Number(userLng), Number(partyLat), Number(partyLng));
    return { distance: dist, status: dist <= 200 ? 'VERIFIED' : 'MISMATCH' };
  }, [userLat, userLng, partyLat, partyLng]);

  const geofenceDistance = geofenceInfo.distance;
  const geofenceStatus = geofenceInfo.status;

  // 3. Live GPS Fetcher
  const fetchLiveGPS = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Geolocation is not supported on this device or browser.');
      setGpsLoading(false);
      return;
    }
    setGpsError(null);
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
        setGpsAccuracy(pos.coords.accuracy);
        setGpsError(null);
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err?.message ? `Location unavailable: ${err.message}` : 'Location access blocked. Enable GPS permissions and retry.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
  }, []);

  // Auto GPS poll whenever user enters Check-In or Active Visit
  useEffect(() => {
    if (mainView !== 'CHECK_IN' && activeTab !== 'ACTIVE_VISIT') return undefined;
    const timer = setTimeout(() => {
      fetchLiveGPS();
    }, 0);
    return () => clearTimeout(timer);
  }, [mainView, activeTab, fetchLiveGPS]);

  // 4. Elapsed Timer during active check-in
  useEffect(() => {
    let interval = null;
    if (activeCheckInTime && activeTab === 'ACTIVE_VISIT') {
      interval = setInterval(() => {
        setElapsedMinutes(Math.max(1, Math.floor((Date.now() - new Date(activeCheckInTime).getTime()) / 60000)));
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [activeCheckInTime, activeTab]);

  // Sync live GPS coordinates emitted by GlobalMobileTelemetryTracker
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleGlobalGpsFix = (e) => {
      const detail = e?.detail;
      if (!detail || detail.lat == null || detail.lng == null) return;
      setUserLat(detail.lat);
      setUserLng(detail.lng);
      if (detail.accuracy != null) setGpsAccuracy(detail.accuracy);
      setGpsError(null);
      setGpsLoading(false);
    };
    window.addEventListener('spc_mobile_gps_fix', handleGlobalGpsFix);
    return () => window.removeEventListener('spc_mobile_gps_fix', handleGlobalGpsFix);
  }, []);

  const applyTaskPipelineDefaults = useCallback((task) => {
    if (!task) return;
    const typeText = String(task.task_type || '');
    const stageInfo = getTaskStageInfo(task);
    if (typeText.includes('Order')) {
      setActivePipeline('ORDER_DELIVERY');
      if (stageInfo?.rawValue && ORDER_DELIVERY_STAGES.includes(stageInfo.rawValue)) {
        setOrderDeliveryStage(stageInfo.rawValue);
      }
    } else if (typeText.includes('Complaint')) {
      setActivePipeline('COMPLAINT_SERVICE');
      setWorkOutcome('WORK_DONE');
    } else {
      setActivePipeline('LEAD_DATA');
      if (task.form_details?.lead_status) {
        setLeadStage(task.form_details.lead_status);
      } else if (stageInfo?.rawValue && /^\d+;\d+>/.test(stageInfo.rawValue)) {
        setLeadStage(stageInfo.rawValue);
      }
    }
  }, []);

  const handleSelectEntity = useCallback((entity) => {
    const resolvedTask = entity.task_id ? entity : (entity.task_code || entity.assigned_to_user_id ? entity : null);
    setSelectedTask(resolvedTask);
    setPartyName(entity.party_name);
    setPartyPhone(entity.party_phone || '');
    setPartyAddress(entity.party_address || '');
    setLeadId(entity.lead_id || null);
    setPartyLat(entity.party_lat ? Number(entity.party_lat) : null);
    setPartyLng(entity.party_lng ? Number(entity.party_lng) : null);
    setIsManualEntry(false);
    fetchLiveGPS();

    if (entity.current_stage && selectedModule !== 'FIELD_TASK') {
      setLeadStage(entity.current_stage);
    }
    if (selectedModule === 'PARTY_MASTER') {
      setActivePipeline('ORDER_DELIVERY');
    } else if (selectedModule === 'FIELD_TASK') {
      applyTaskPipelineDefaults(entity);
    } else {
      setActivePipeline('LEAD_DATA');
    }
  }, [selectedModule, fetchLiveGPS, applyTaskPipelineDefaults]);

  const handleSelectTask = useCallback((task) => {
    setSelectedTask(task);
    setPartyName(task.party_name);
    setPartyPhone(task.party_phone || '');
    setPartyAddress(task.party_address || '');
    setLeadId(task.lead_id || null);
    setPartyLat(task.party_lat ? Number(task.party_lat) : null);
    setPartyLng(task.party_lng ? Number(task.party_lng) : null);
    setIsManualEntry(false);
    fetchLiveGPS();
    applyTaskPipelineDefaults(task);
    setMainView('CHECK_IN');
  }, [fetchLiveGPS, applyTaskPipelineDefaults]);

  const handleAttendanceGateClick = useCallback(() => {
    alert('Attendance Punch-In Required: Please mark today\'s Smart Attendance before starting a field visit.');
    if (onNavigateToAttendance) {
      onNavigateToAttendance();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/attendance';
    }
  }, [onNavigateToAttendance]);

  const handleStartCheckIn = useCallback(async () => {
    if (attendanceStatus.checked && !attendanceStatus.isPunchedIn) {
      handleAttendanceGateClick();
      return;
    }
    if (attendanceStatus.checked && attendanceStatus.isPunchedOut) {
      alert('Shift Ended: Check-in is not allowed after punching out for the day.');
      return;
    }
    if (!partyName.trim()) {
      alert('Please select a party or enter a walk-in client name.');
      return;
    }
    if (connectivityMode === 'PHYSICAL_VISIT' && !userLat) {
      fetchLiveGPS();
      alert('Acquiring GPS coordinates. Please allow location access and retry check-in.');
      return;
    }

    const payload = {
      taskId: selectedTask?.id || null,
      company,
      branch_code: branchCode,
      field_user_id: currentUserId,
      user_email: userEmail,
      customer_id: selectedTask?.customer_id || null,
      lead_id: leadId,
      party_name: partyName,
      party_lat: partyLat,
      party_lng: partyLng,
      check_in_lat: userLat,
      check_in_lng: userLng,
      connectivity_mode: connectivityMode,
      pipeline_type: activePipeline,
    };

    if (networkOnline) {
      const res = await performCheckIn(payload);
      if (res.success) {
        const resolvedTaskCode = res.task_code || selectedTask?.task_code || null;
        setActiveCheckInTime(res.check_in_time);
        if (res.task_id || resolvedTaskCode) {
          setSelectedTask(prev => ({
            ...(prev || {}),
            ...(res.task_id ? { id: res.task_id } : {}),
            ...(resolvedTaskCode ? { task_code: resolvedTaskCode } : {}),
          }));
        }
        setActiveTab('ACTIVE_VISIT');
        const selectedStageInfo = getTaskStageInfo(selectedTask);
        try {
          localStorage.setItem('field_active_visit', JSON.stringify({
            taskId: res.task_id || selectedTask?.id || null,
            taskCode: resolvedTaskCode,
            taskDescription: getTaskInstructions(selectedTask),
            taskStage: selectedStageInfo?.rawValue || '',
            taskStageLabel: selectedStageInfo?.label || '',
            activeCheckInTime: res.check_in_time,
            partyName,
            partyPhone,
            partyAddress,
            leadId,
            partyLat,
            partyLng,
            userLat,
            userLng,
            connectivityMode,
            activePipeline,
            leadStage,
            orderDeliveryStage,
            workOutcome,
            company,
          }));
          window.dispatchEvent(new Event('field_visit_state_changed'));
        } catch (_) {}
      } else {
        alert(res.error || 'Check-in failed');
        if (res.requires_attendance && onNavigateToAttendance) onNavigateToAttendance();
      }
    } else {
      const offlineTime = new Date().toISOString();
      await queueOfflineAction('CHECK_IN', { ...payload, check_in_time: offlineTime });
      setActiveCheckInTime(offlineTime);
      setActiveTab('ACTIVE_VISIT');
      refreshPendingQueue();
      const offlineStageInfo = getTaskStageInfo(selectedTask);
      try {
        localStorage.setItem('field_active_visit', JSON.stringify({
          taskId: selectedTask?.id || null,
          taskCode: selectedTask?.task_code || null,
          taskDescription: getTaskInstructions(selectedTask),
          taskStage: offlineStageInfo?.rawValue || '',
          taskStageLabel: offlineStageInfo?.label || '',
          activeCheckInTime: offlineTime,
          partyName,
          partyPhone,
          partyAddress,
          leadId,
          partyLat,
          partyLng,
          userLat,
          userLng,
          connectivityMode,
          activePipeline,
          leadStage,
          orderDeliveryStage,
          workOutcome,
          company,
        }));
        window.dispatchEvent(new Event('field_visit_state_changed'));
      } catch (_) {}
    }
  }, [
    attendanceStatus, handleAttendanceGateClick, partyName, connectivityMode, userLat, userLng,
    fetchLiveGPS, selectedTask, company, branchCode, currentUserId, userEmail, leadId, partyLat,
    partyLng, activePipeline, networkOnline, partyPhone, partyAddress, leadStage,
    orderDeliveryStage, workOutcome, onNavigateToAttendance, refreshPendingQueue,
  ]);

  const handleCapturePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsWatermarking(true);
    try {
      const watermarkedBlob = await burnWatermarkOnPhoto(file, {
        employeeName: userName,
        partyName: partyName || 'Client Visit',
        latitude: userLat,
        longitude: userLng,
        accuracy: gpsAccuracy,
        timestamp: new Date().toISOString(),
      });
      const previewUrl = URL.createObjectURL(watermarkedBlob);
      setPhotos(prev => [...prev, { blob: watermarkedBlob, url: previewUrl }]);
    } catch (err) {
      console.error('Watermark capture error:', err);
      alert('Failed to stamp watermark on photo.');
    } finally {
      setIsWatermarking(false);
      e.target.value = '';
    }
  };

  const toggleVoiceToText = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice recognition is not supported on this browser. Please type your notes.');
      return;
    }
    if (isListening) {
      setIsListening(false);
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'hi-IN';
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setDiscussionNotes(prev => (prev ? `${prev} ${transcript}` : transcript));
        setIsListening(false);
      };
      recognition.start();
    } catch (err) {
      console.warn('Speech recognition error:', err);
      setIsListening(false);
    }
  };

  const getCanvasPoint = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    return {
      x: (clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
      y: (clientY - rect.top) * (canvas.height / Math.max(1, rect.height)),
    };
  };

  const startDrawing = (e) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const pt = getCanvasPoint(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    isDrawingRef.current = true;
  };

  const draw = (e) => {
    if (!isDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const pt = getCanvasPoint(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawingRef.current && signatureCanvasRef.current) {
      isDrawingRef.current = false;
      setSignatureData(signatureCanvasRef.current.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (canvas) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      setSignatureData(null);
    }
  };

  const resetForm = useCallback(() => {
    setActiveTab('SCHEDULED_TASKS');
    setActiveCheckInTime(null);
    setSelectedTask(null);
    setPartyName('');
    setPartyPhone('');
    setPhotos([]);
    setSignatureData(null);
    setDiscussionNotes('');
    setNextFollowup('');
    setWorkOutcome('WORK_DONE');
    try {
      localStorage.removeItem('field_active_visit');
      window.dispatchEvent(new Event('field_visit_state_changed'));
    } catch (_) {}
    void loadTodayTasks();
  }, [loadTodayTasks]);

  const handleCompleteCheckOut = async () => {
    if (activePipeline === 'COMPLAINT_SERVICE' && workOutcome === 'WORK_INCOMPLETE' && !nextFollowup) {
      alert('Next Follow-up Date & Time is mandatory when complaint work is marked incomplete.');
      return;
    }

    const derivedOutcome = activePipeline === 'LEAD_DATA'
      ? (leadStage ? leadStage.split('>').pop().trim() : 'COMPLETED')
      : activePipeline === 'ORDER_DELIVERY'
        ? (orderDeliveryStage ? orderDeliveryStage.split('-').pop().trim() : 'COMPLETED')
        : activePipeline === 'COMPLAINT_SERVICE'
          ? (workOutcome === 'WORK_INCOMPLETE' ? 'WORK_INCOMPLETE' : 'WORK_DONE')
          : 'COMPLETED';

    const payload = {
      taskId: selectedTask?.id || null,
      company,
      branch_code: branchCode,
      field_user_id: currentUserId,
      customer_id: selectedTask?.customer_id || null,
      lead_id: leadId,
      party_name: partyName,
      connectivity_mode: connectivityMode,
      is_geofence_verified: geofenceStatus === 'VERIFIED',
      distance_from_party_meters: geofenceDistance,
      is_geofence_flagged: geofenceStatus === 'MISMATCH',
      geofence_flag_reason: geofenceStatus === 'MISMATCH' ? `Mismatch: Checked in ${geofenceDistance}m away` : null,
      check_in_time: activeCheckInTime,
      check_in_lat: userLat,
      check_in_lng: userLng,
      check_out_lat: userLat,
      check_out_lng: userLng,
      pipeline_type: activePipeline,
      lead_stage_updated: activePipeline === 'LEAD_DATA' ? leadStage : null,
      order_pipeline_stage: activePipeline === 'ORDER_DELIVERY' ? orderDeliveryStage : null,
      complaint_ticket_stage: activePipeline === 'COMPLAINT_SERVICE'
        ? (workOutcome === 'WORK_INCOMPLETE' ? 'C04 - On-Site Execution & Digital Job Card' : 'C05 - Customer OTP Verification & Sign-off')
        : null,
      work_outcome: activePipeline === 'COMPLAINT_SERVICE' ? workOutcome : 'WORK_DONE',
      form_id: activePipeline === 'CUSTOM_FORM' ? selectedFormId : null,
      outcome_status: derivedOutcome,
      order_value: 0,
      payment_collected: 0,
      payment_mode: 'UPI',
      cheque_utr_no: '',
      form_data: {},
      photo_watermark_urls: photos.map(p => p.url),
      customer_signature_url: signatureData,
      discussion_notes: discussionNotes,
      next_followup_at: nextFollowup ? new Date(nextFollowup).toISOString() : null,
    };

    if (networkOnline) {
      const res = await performCheckOutWithOutput(payload);
      if (res.success) {
        alert('Field Visit & Report Saved Successfully!');
        resetForm();
        await loadCompletedVisits();
        setMainView('COMPLETED_VISITS');
      } else {
        alert(`Check-out submission error: ${res.error}`);
      }
    } else {
      await queueOfflineAction('CHECK_OUT', payload);
      alert('Saved to offline vault. Will sync automatically once connectivity returns.');
      refreshPendingQueue();
      resetForm();
      setMainView('COMPLETED_VISITS');
    }
  };

  const handleTriggerSync = async () => {
    if (!networkOnline) {
      alert('Device is currently offline. Connect to internet first.');
      return;
    }
    setIsSyncing(true);
    try {
      await syncOfflineQueue(async (item) => {
        if (item.actionType === 'CHECK_IN') return await performCheckIn(item.payload);
        if (item.actionType === 'CHECK_OUT') return await performCheckOutWithOutput(item.payload);
        return { success: true };
      });
      await refreshPendingQueue();
      alert('Offline queue synced successfully!');
    } catch (err) {
      console.error('Queue sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefreshAll = useCallback(() => {
    void loadCompletedVisits();
    void loadTodayTasks();
    void loadModuleEntities(selectedModule, searchQuery);
    void loadAttendanceStatus();
  }, [loadCompletedVisits, loadTodayTasks, loadModuleEntities, selectedModule, searchQuery, loadAttendanceStatus]);

  return (
    <div className={styles.console}>
      <ConsoleHeader
        userName={userName}
        company={company}
        userEmail={userEmail}
        networkOnline={networkOnline}
        pendingQueueCount={pendingQueueCount}
        isSyncing={isSyncing}
        onSyncQueue={handleTriggerSync}
        mainView={mainView}
        onViewChange={(view) => {
          setMainView(view);
          if (view === 'COMPLETED_VISITS') void loadCompletedVisits();
        }}
        tasksCount={tasks.length}
        completedCount={todayCompletedVisits.length}
        isBusy={loadingCompleted || loadingTasks || attendanceStatus.loading}
        onRefreshAll={handleRefreshAll}
        isActiveVisit={activeTab === 'ACTIVE_VISIT'}
      />

      {activeTab !== 'ACTIVE_VISIT' ? (
        <div className={styles.container}>
          <AttendancePolicyBanner attendanceStatus={attendanceStatus} onPunchInClick={handleAttendanceGateClick} />

          {mainView === 'ASSIGNED_TASKS' && (
            <ConsoleAssignedTasksView
              tasks={tasks}
              loadingTasks={loadingTasks}
              visitedMap={visitedMap}
              attendanceStatus={attendanceStatus}
              onRefresh={() => void loadTodayTasks()}
              onStartCheckInView={() => setMainView('CHECK_IN')}
              onSelectTask={handleSelectTask}
              onAttendanceGateClick={handleAttendanceGateClick}
            />
          )}

          {mainView === 'CHECK_IN' && (
            <ConsoleCheckInWorkspace
              selectedModule={selectedModule}
              onSelectModule={(mod) => { setSelectedModule(mod); setSearchQuery(''); }}
              tasksCount={tasks.length}
              onShowTasksView={() => setMainView('ASSIGNED_TASKS')}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              loadingEntities={loadingEntities}
              moduleEntities={moduleEntities}
              visitedMap={visitedMap}
              partyName={partyName}
              leadId={leadId}
              partyPhone={partyPhone}
              partyAddress={partyAddress}
              activePipeline={activePipeline}
              selectedTask={selectedTask}
              isManualEntry={isManualEntry}
              onSetManualEntry={setIsManualEntry}
              onPartyNameChange={setPartyName}
              onPartyPhoneChange={setPartyPhone}
              onClearParty={() => { setPartyName(''); setLeadId(null); setSelectedTask(null); setPartyLat(null); setPartyLng(null); }}
              onSelectEntity={handleSelectEntity}
              connectivityModes={CONNECTIVITY_MODES}
              connectivityMode={connectivityMode}
              onSelectConnectivity={setConnectivityMode}
              userLat={userLat}
              userLng={userLng}
              gpsAccuracy={gpsAccuracy}
              gpsLoading={gpsLoading}
              gpsError={gpsError}
              geofenceDistance={geofenceDistance}
              geofenceStatus={geofenceStatus}
              onRefreshGPS={fetchLiveGPS}
              attendanceStatus={attendanceStatus}
              onAttendanceGateClick={handleAttendanceGateClick}
              onStartCheckIn={() => void handleStartCheckIn()}
            />
          )}

          {mainView === 'COMPLETED_VISITS' && (
            <ConsoleCompletedVisitsView
              visits={todayCompletedVisits}
              loading={loadingCompleted}
              onStartCheckInView={() => setMainView('CHECK_IN')}
            />
          )}
        </div>
      ) : (
        <ConsoleActiveVisitView
          partyName={partyName}
          elapsedMinutes={elapsedMinutes}
          connectivityMode={connectivityMode}
          taskCode={selectedTask?.task_code || ''}
          taskDescription={getTaskInstructions(selectedTask)}
          taskStage={getTaskStageInfo(selectedTask)?.rawValue || ''}
          taskStageLabel={getTaskStageInfo(selectedTask)?.label || ''}
          pipelines={PIPELINES}
          activePipeline={activePipeline}
          onPipelineChange={setActivePipeline}
          crmLeadStages={CRM_LEAD_STAGES}
          leadStage={leadStage}
          onLeadStageChange={setLeadStage}
          orderDeliveryStages={ORDER_DELIVERY_STAGES}
          orderDeliveryStage={orderDeliveryStage}
          onOrderDeliveryStageChange={setOrderDeliveryStage}
          workOutcome={workOutcome}
          onWorkOutcomeChange={setWorkOutcome}
          customForms={customForms}
          selectedFormId={selectedFormId}
          onSelectedFormChange={setSelectedFormId}
          nextFollowup={nextFollowup}
          onNextFollowupChange={setNextFollowup}
          discussionNotes={discussionNotes}
          onDiscussionNotesChange={setDiscussionNotes}
          isListening={isListening}
          onToggleVoice={toggleVoiceToText}
          photos={photos}
          isWatermarking={isWatermarking}
          onCapturePhoto={handleCapturePhoto}
          onRemovePhoto={(idx) => setPhotos(prev => prev.filter((_, i) => i !== idx))}
          signatureCanvasRef={signatureCanvasRef}
          onStartDrawing={startDrawing}
          onDraw={draw}
          onStopDrawing={stopDrawing}
          onClearSignature={clearSignature}
          onCompleteCheckOut={() => void handleCompleteCheckOut()}
        />
      )}
    </div>
  );
}
