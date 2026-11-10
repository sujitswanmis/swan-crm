'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, Camera, CheckCircle2, AlertTriangle, Phone, MessageSquare, Mail,
  Mic, MicOff, RefreshCw, Clock, PenTool, DollarSign, Layers, ChevronRight,
  Send, Calendar, User, Building, Navigation, WifiOff, Wifi, Image as ImageIcon,
  Check, X, FileText, ArrowRight, ShieldAlert, Sparkles, Search, Building2, Play
} from 'lucide-react';
import { performCheckIn, performCheckOutWithOutput, getFieldTasksForUser, getModuleEntitiesForCheckIn, getActiveFieldVisit, getUserCompletedVisitsToday, getTodayUserAttendanceStatus } from '@/app/actions/fieldTasks';
import { getPublishedForms } from '@/app/actions/fieldFormStudio';
import { burnWatermarkOnPhoto } from '@/utils/cameraWatermark';
import { queueOfflineAction, getPendingQueue, syncOfflineQueue, isOnline } from '@/utils/offlineLocationVault';

const CONNECTIVITY_MODES = [
  { id: 'PHYSICAL_VISIT', label: 'Physical Visit', icon: Navigation, desc: 'On-site GPS & Watermark verified. Qualifies for TA/DA petrol.', color: '#16a34a' },
  { id: 'TELEPHONIC_CALL', label: 'Telephonic', icon: Phone, desc: 'Voice discussion & stage update. Zero petrol claim.', color: '#2563eb' },
  { id: 'WHATSAPP_CHAT', label: 'WhatsApp', icon: MessageSquare, desc: 'WhatsApp follow-up & documents shared.', color: '#059669' },
  { id: 'EMAIL_QUOTE', label: 'Email / Quote', icon: Mail, desc: 'Formal proposal sent via email.', color: '#7c3aed' }
];

const PIPELINES = [
  { id: 'LEAD_DATA', label: 'Lead Data Pipeline (S01 - S08)', icon: Layers },
  { id: 'ORDER_DELIVERY', label: 'Order to Delivery (S01 - S13)', icon: Layers },
  { id: 'COMPLAINT_SERVICE', label: 'Complaint & Service (C01 - C06)', icon: Layers },
  { id: 'CUSTOM_FORM', label: 'Assigned Custom Form', icon: FileText }
];

const CRM_LEAD_STAGES = [
  { name: '01 - New Stage', substages: ['New Lead', 'Assigned', 'Contact Pending'] },
  { name: '02 - Contact Stage', substages: ['Contacted', 'Wrong Number', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '03 - Qualification Stage', substages: ['Interested', 'Qualified', 'Unqualified', 'Need Identified', 'Budget Confirmed', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '04 - Follow Up Stage', substages: ['Catalog Shared', 'Follow Up Required', 'Next Follow Up Set', 'Follow Up Done', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '05 - Sales Process Stage', substages: ['Visit Require Sales Person', 'Before Visit Conference Call Pending', 'Before Visit Conference Call Done', 'Visit Confirmation Date', 'Task Assigned in TrackWick', 'Meeting Pending', 'Meeting Done', 'Negotiation Pending', 'Negotiation Done', 'Client Documentation Pending', 'Client Documentation Done', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '06 - Conversion Stage', substages: ['Token Amount Pending', 'Token Amount Deposited', 'Client Details Pending', 'Client Details Received', 'Billing 1st Quotation Pending', 'Billing 1st Quotation Sent', 'Quotation Revision Required', 'Quotation Approved by Client', 'Billing 1st Advance Payment Pending', 'Billing 1st Advance Paid', 'Payment Verification Pending', 'Payment Verified', 'Order Confirmed', 'Stock Availability Check', 'Stock Not Available', 'Production Planning Required', 'Delivery Date Confirmed', 'Final Billing 1st Pending', 'Final Billing 1st Done', 'Ready for Dispatch', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '07 - Final Stage', substages: ['Converted - Out for Delivery', 'Converted - Order Received', 'Converted - Final Feedback From Client', 'Won', 'Lost After Quotation', 'Lost Due to Price Issue', 'Lost Due to Payment Issue', 'Lost Due to Stock Issue', 'Hold - Client Side', 'Hold - Company Side', 'Duplicate Lead', 'Call not connected', 'No Response', 'ReSchedule'] },
  { name: '08 - Transfer to Party', substages: ['Pending Confirmation', 'Transferred to Party Master', 'Won - Transferred'] }
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
  'S13 - Material Delivered (POD)'
];

const COMPLAINT_SERVICE_STAGES = [
  'C01 - Ticket Logged & Triaged',
  'C02 - Internal Dept RCA & Investigation',
  'C03 - Service Engineer Deputed & Scheduled',
  'C04 - On-Site Execution & Digital Job Card',
  'C05 - Customer OTP Verification & Sign-off',
  'C06 - Quality Audit & Verified Closure'
];

export default function FieldMobileDashboard({
  currentUserId,
  company = 'TNT00001',
  branchCode = null,
  userName = 'Field Person',
  userEmail = '',
  onNavigateToAttendance = null
}) {
  // State: Navigation / Current View
  const [activeTab, setActiveTab] = useState('SCHEDULED_TASKS'); // 'SCHEDULED_TASKS', 'CHECK_IN_FLOW', 'ACTIVE_VISIT'

  // Attendance Status Guard (Mandatory Punch-In Policy)
  const [attendanceStatus, setAttendanceStatus] = useState({
    checked: false,
    loading: true,
    isPunchedIn: false,
    isPunchedOut: false,
    inTime: null,
    outTime: null
  });
  
  // Tasks list
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [customForms, setCustomForms] = useState([]);

  // Active check-in state
  const [selectedTask, setSelectedTask] = useState(null);
  const [connectivityMode, setConnectivityMode] = useState('PHYSICAL_VISIT');
  const [activePipeline, setActivePipeline] = useState('LEAD_DATA');
  const [selectedFormId, setSelectedFormId] = useState('');

  // Navigation within Dashboard: Assigned Tasks vs New Check-In vs Today's Completed Visits
  const [mainView, setMainView] = useState('ASSIGNED_TASKS'); // 'ASSIGNED_TASKS', 'CHECK_IN', 'COMPLETED_VISITS'
  const [todayCompletedVisits, setTodayCompletedVisits] = useState([]);
  const [loadingCompleted, setLoadingCompleted] = useState(false);

  // Module Type Selection & Entity Search (User Core Plan: Module -> Lead List -> 1-Click Check-In)
  const [selectedModule, setSelectedModule] = useState('LEAD_DATA'); // 'LEAD_DATA', 'PARTY_MASTER', 'FIELD_TASK'
  const [moduleEntities, setModuleEntities] = useState([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isManualEntry, setIsManualEntry] = useState(false);
  
  // Customer details for ad-hoc or task
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
  const [geofenceDistance, setGeofenceDistance] = useState(null);
  const [geofenceStatus, setGeofenceStatus] = useState('UNKNOWN'); // 'VERIFIED', 'MISMATCH', 'UNKNOWN'
  const [gpsError, setGpsError] = useState(null);

  // Active visit ongoing state
  const [activeCheckInTime, setActiveCheckInTime] = useState(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  // Output form inputs
  const [leadStage, setLeadStage] = useState('2;01>Contact Stage>Contacted');
  const [orderDeliveryStage, setOrderDeliveryStage] = useState('S01 - Order Confirmation');
  const [complaintStage, setComplaintStage] = useState('C04 - On-Site Execution & Digital Job Card');
  const [workOutcome, setWorkOutcome] = useState('WORK_DONE'); // 'WORK_DONE' or 'WORK_INCOMPLETE'
  const [outcomeStatus, setOutcomeStatus] = useState('FOLLOWUP_REQUIRED');
  const [orderValue, setOrderValue] = useState('');
  const [paymentCollected, setPaymentCollected] = useState('');
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [chequeUtrNo, setChequeUtrNo] = useState('');
  const [discussionNotes, setDiscussionNotes] = useState('');
  const [nextFollowup, setNextFollowup] = useState('');
  const [customFormData, setCustomFormData] = useState({});

  // Media
  const [photos, setPhotos] = useState([]);
  const [isWatermarking, setIsWatermarking] = useState(false);
  const [signatureData, setSignatureData] = useState(null);

  // Voice recording
  const [isListening, setIsListening] = useState(false);

  // Offline vault
  const [networkOnline, setNetworkOnline] = useState(true);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Canvas ref for signature
  const signatureCanvasRef = useRef(null);
  const isDrawingRef = useRef(false);

  // 1. Initialize Network & Offline queue
  useEffect(() => {
    setNetworkOnline(isOnline());
    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => setNetworkOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Refresh pending queue
    refreshPendingQueue();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refreshPendingQueue = async () => {
    try {
      const q = await getPendingQueue();
      setPendingQueueCount(q.length);
    } catch (_) {}
  };

  // 1.1 Recover Active Visit Session (Persistence across page navigation & refresh)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('field_active_visit');
      if (stored) {
        const session = JSON.parse(stored);
        if (session && session.activeCheckInTime) {
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
          setActivePipeline(session.activePipeline || 'LEAD_DATA');
          setSelectedTask(session.taskId ? { id: session.taskId } : null);
          if (session.leadStage) setLeadStage(session.leadStage);
          if (session.orderDeliveryStage) setOrderDeliveryStage(session.orderDeliveryStage);
          if (session.complaintStage) setComplaintStage(session.complaintStage);
          if (session.workOutcome) setWorkOutcome(session.workOutcome);

          const diffMs = new Date() - new Date(session.activeCheckInTime);
          setElapsedMinutes(Math.max(1, Math.floor(diffMs / 60000)));
          setActiveTab('ACTIVE_VISIT');
          return;
        }
      }
    } catch (e) {
      console.warn('Error reading stored field visit:', e);
    }

    // Server fallback
    if (currentUserId) {
      getActiveFieldVisit(currentUserId, company).then(task => {
        if (task && task.status === 'IN_PROGRESS') {
          const startTime = task.actual_start_time || task.scheduled_start_time || new Date().toISOString();
          setActiveCheckInTime(startTime);
          setPartyName(task.party_name || '');
          setPartyPhone(task.party_phone || '');
          setPartyAddress(task.party_address || '');
          setLeadId(task.lead_id || null);
          setPartyLat(task.party_lat || null);
          setPartyLng(task.party_lng || null);
          setSelectedTask({ id: task.id });
          setActiveTab('ACTIVE_VISIT');

          const isComplaintTask = task.task_type && task.task_type.includes('Complaint');
          const resolvedPipeline = task.lead_id ? 'LEAD_DATA' : (isComplaintTask ? 'COMPLAINT_SERVICE' : 'ORDER_DELIVERY');
          setActivePipeline(resolvedPipeline);
          if (isComplaintTask) {
            setComplaintStage('C04 - On-Site Execution & Digital Job Card');
          }

          const diffMs = new Date() - new Date(startTime);
          setElapsedMinutes(Math.max(1, Math.floor(diffMs / 60000)));

          try {
            localStorage.setItem('field_active_visit', JSON.stringify({
              taskId: task.id,
              activeCheckInTime: startTime,
              partyName: task.party_name,
              partyPhone: task.party_phone,
              partyAddress: task.party_address,
              leadId: task.lead_id,
              partyLat: task.party_lat,
              partyLng: task.party_lng,
              connectivityMode: 'PHYSICAL_VISIT',
              activePipeline: resolvedPipeline,
              complaintStage: 'C04 - On-Site Execution & Digital Job Card',
              workOutcome: 'WORK_DONE',
              company
            }));
            window.dispatchEvent(new Event('field_visit_state_changed'));
          } catch (_) {}
        }
      }).catch(() => {});
    }
  }, [currentUserId, company]);

  // 2. Fetch Tasks & Forms & Completed Visits & Attendance Status
  const loadAttendanceStatus = async () => {
    if (!currentUserId && !userEmail) return;
    try {
      const res = await getTodayUserAttendanceStatus(currentUserId, userEmail);
      setAttendanceStatus({
        checked: true,
        loading: false,
        isPunchedIn: Boolean(res?.isPunchedIn),
        isPunchedOut: Boolean(res?.isPunchedOut),
        inTime: res?.inTime || null,
        outTime: res?.outTime || null
      });
    } catch (e) {
      console.warn('Failed to verify attendance status:', e);
      setAttendanceStatus(prev => ({ ...prev, checked: true, loading: false }));
    }
  };

  useEffect(() => {
    loadTodayTasks();
    loadPublishedForms();
    loadCompletedVisits();
    loadAttendanceStatus();
  }, [currentUserId, userEmail, company]);

  const loadCompletedVisits = async () => {
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
  };

  const visitedMap = React.useMemo(() => {
    const map = new Map();
    todayCompletedVisits.forEach(v => {
      if (v.lead_id) map.set(v.lead_id, v);
      if (v.party_name) map.set(v.party_name.toLowerCase().trim(), v);
    });
    return map;
  }, [todayCompletedVisits]);

  const loadTodayTasks = async () => {
    setLoadingTasks(true);
    try {
      const data = await getFieldTasksForUser(currentUserId);
      setTasks(data || []);
      // If user has assigned tasks, default to ASSIGNED_TASKS view; otherwise CHECK_IN
      if (data && data.length > 0) {
        setMainView(prev => (prev === 'CHECK_IN' && !partyName ? 'ASSIGNED_TASKS' : prev));
      } else {
        setMainView(prev => prev === 'ASSIGNED_TASKS' ? 'CHECK_IN' : prev);
      }
    } catch (err) {
      console.error('Failed to load field tasks:', err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const loadPublishedForms = async () => {
    try {
      const forms = await getPublishedForms(company);
      setCustomForms(forms || []);
      if (forms && forms.length > 0) {
        setSelectedFormId(forms[0].id);
      }
    } catch (err) {
      console.error('Failed to load forms:', err);
    }
  };

  // Fast Entity Search across Leads, Party Master, and Tasks
  const loadModuleEntities = async (modType = selectedModule, searchStr = searchQuery) => {
    if (modType === 'FIELD_TASK') {
      setModuleEntities(tasks || []);
      return;
    }
    setLoadingEntities(true);
    try {
      const data = await getModuleEntitiesForCheckIn({
        company,
        moduleType: modType,
        search: searchStr,
        limit: 50
      });
      setModuleEntities(data || []);
    } catch (err) {
      console.error('Error fetching module entities:', err);
    } finally {
      setLoadingEntities(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadModuleEntities(selectedModule, searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [selectedModule, searchQuery, company, tasks]);

  const handleSelectEntity = (entity) => {
    setSelectedTask(entity.task_id ? entity : (entity.task_code || entity.assigned_to_user_id ? entity : null));
    setPartyName(entity.party_name);
    setPartyPhone(entity.party_phone || '');
    setPartyAddress(entity.party_address || '');
    setLeadId(entity.lead_id || null);
    setPartyLat(entity.party_lat ? Number(entity.party_lat) : null);
    setPartyLng(entity.party_lng ? Number(entity.party_lng) : null);
    setIsManualEntry(false);
    fetchLiveGPS();

    if (entity.current_stage) {
      setLeadStage(entity.current_stage);
    }
    if (selectedModule === 'PARTY_MASTER') {
      setActivePipeline('PARTY_MASTER');
    } else if (selectedModule === 'FIELD_TASK') {
      if (entity.task_type && entity.task_type.includes('Order')) {
        setActivePipeline('ORDER_DELIVERY');
      } else if (entity.task_type && entity.task_type.includes('Complaint')) {
        setActivePipeline('COMPLAINT_SERVICE');
      } else {
        setActivePipeline('LEAD_DATA');
      }
    } else {
      setActivePipeline('LEAD_DATA');
    }
  };

  // 3. Live GPS Fetcher & Geofence Validator
  const fetchLiveGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLat(lat);
        setUserLng(lng);
        setGpsAccuracy(pos.coords.accuracy);

        // Calculate Geofence distance if party has lat/lng
        if (partyLat && partyLng) {
          const dist = calculateHaversineMeters(lat, lng, partyLat, partyLng);
          setGeofenceDistance(dist);
          if (dist <= 200) {
            setGeofenceStatus('VERIFIED');
          } else {
            setGeofenceStatus('MISMATCH');
          }
        } else {
          setGeofenceStatus('UNKNOWN');
          setGeofenceDistance(null);
        }
      },
      (err) => {
        setGpsError(`GPS Error: ${err.message}. Please enable GPS Location.`);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  };

  function calculateHaversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
  }

  // Auto GPS poll on Check-In view
  useEffect(() => {
    if (activeTab === 'CHECK_IN_FLOW') {
      fetchLiveGPS();
    }
  }, [activeTab, partyLat, partyLng]);

  // 4. Elapsed Timer during active check-in
  useEffect(() => {
    let interval = null;
    if (activeCheckInTime && activeTab === 'ACTIVE_VISIT') {
      interval = setInterval(() => {
        const diffMs = new Date() - new Date(activeCheckInTime);
        setElapsedMinutes(Math.max(1, Math.floor(diffMs / 60000)));
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [activeCheckInTime, activeTab]);

  // -------------------------------------------------------------
  // Synchronize on-screen coordinates from GlobalMobileTelemetryTracker
  // -------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleGlobalGpsFix = (e) => {
      const detail = e?.detail;
      if (!detail || detail.lat == null || detail.lng == null) return;
      setUserLat(detail.lat);
      setUserLng(detail.lng);
      if (detail.accuracy != null) setGpsAccuracy(detail.accuracy);
      setGpsError(null);
    };
    window.addEventListener('spc_mobile_gps_fix', handleGlobalGpsFix);
    return () => window.removeEventListener('spc_mobile_gps_fix', handleGlobalGpsFix);
  }, []);

  // 5. Select Task to Check-In
  const handleSelectTask = (task) => {
    setSelectedTask(task);
    setPartyName(task.party_name);
    setPartyPhone(task.party_phone || '');
    setPartyAddress(task.party_address || '');
    setLeadId(task.lead_id || null);
    setPartyLat(task.party_lat ? Number(task.party_lat) : null);
    setPartyLng(task.party_lng ? Number(task.party_lng) : null);
    setIsManualEntry(false);
    fetchLiveGPS();

    if (task.task_type && task.task_type.includes('Order')) {
      setActivePipeline('ORDER_DELIVERY');
    } else if (task.task_type && task.task_type.includes('Complaint')) {
      setActivePipeline('COMPLAINT_SERVICE');
      setComplaintStage('C04 - On-Site Execution & Digital Job Card');
      setWorkOutcome('WORK_DONE');
    } else {
      setActivePipeline('LEAD_DATA');
    }

    setMainView('CHECK_IN');
  };

  // 6. Start Check-In
  const handleStartCheckIn = async () => {
    // 0. Mandatory Attendance Verification
    if (attendanceStatus.checked && !attendanceStatus.isPunchedIn) {
      alert('⚠️ Attendance Not Punched!\n\nAapne aaj ki attendance punch-in nahi ki hai. Field visit check-in karne se pehle Smart Attendance me punch-in karein.');
      if (onNavigateToAttendance) onNavigateToAttendance();
      return;
    }

    if (attendanceStatus.checked && attendanceStatus.isPunchedOut) {
      alert('🛑 Shift Ended!\n\nAap aaj ka punch-out kar chuke hain. Shift khatam hone ke baad field visit check-in allowed nahi hai.');
      return;
    }

    if (!partyName.trim()) {
      alert('Please enter party name or select a task');
      return;
    }

    if (connectivityMode === 'PHYSICAL_VISIT' && !userLat) {
      fetchLiveGPS();
      alert('Getting GPS Location. Please wait 2 seconds and tap Start Check-In again.');
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
      pipeline_type: activePipeline
    };

    if (networkOnline) {
      const res = await performCheckIn(payload);
      if (res.success) {
        setActiveCheckInTime(res.check_in_time);
        if (res.task_id) setSelectedTask({ id: res.task_id });
        setActiveTab('ACTIVE_VISIT');

        // Persist session locally so page changes or refreshes do not lose the visit
        try {
          localStorage.setItem('field_active_visit', JSON.stringify({
            taskId: res.task_id || selectedTask?.id || null,
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
            complaintStage,
            workOutcome,
            company
          }));
          window.dispatchEvent(new Event('field_visit_state_changed'));
        } catch (_) {}
      } else {
        alert(res.error || 'Check-in failed');
        if (res.requires_attendance && onNavigateToAttendance) {
          onNavigateToAttendance();
        }
      }
    } else {
      // Offline fallback
      const offlineTime = new Date().toISOString();
      await queueOfflineAction('CHECK_IN', { ...payload, check_in_time: offlineTime });
      setActiveCheckInTime(offlineTime);
      setActiveTab('ACTIVE_VISIT');
      refreshPendingQueue();

      try {
        localStorage.setItem('field_active_visit', JSON.stringify({
          taskId: selectedTask?.id || null,
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
          complaintStage,
          workOutcome,
          company
        }));
        window.dispatchEvent(new Event('field_visit_state_changed'));
      } catch (_) {}
    }
  };

  // 7. Watermarked Camera Photo Capture
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
        timestamp: new Date().toISOString()
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

  // 8. Voice-to-Text Speech Recognition
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
      recognition.lang = 'hi-IN'; // Default Hindi (can transcribe mixed Hindi/English)

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setDiscussionNotes(prev => (prev ? prev + ' ' + transcript : transcript));
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.warn('Speech recognition error:', err);
      setIsListening(false);
    }
  };

  // 9. Signature Canvas Handlers
  const startDrawing = (e) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    isDrawingRef.current = true;
  };

  const draw = (e) => {
    if (!isDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineTo(x, y);
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
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignatureData(null);
    }
  };

  // 10. Complete Check-Out & Save Report
  const handleCompleteCheckOut = async () => {
    // Sequential Pipeline Guard for Complaint Management
    if (activePipeline === 'COMPLAINT_SERVICE' && workOutcome === 'WORK_INCOMPLETE') {
      if (!nextFollowup) {
        alert('⚠️ Mandatory Schedule Required:\n\nKaam adhoora hone par "Next Follow-up Date & Time" select karna anivarya hai taaki agla visit schedule ho sake.');
        return;
      }
    }

    // Auto-derive outcome status directly from selected pipeline stage
    const derivedOutcome = activePipeline === 'LEAD_DATA'
      ? (leadStage ? leadStage.split('>').pop().trim() : 'COMPLETED')
      : activePipeline === 'ORDER_DELIVERY'
        ? (orderDeliveryStage ? orderDeliveryStage.split('-').pop().trim() : 'COMPLETED')
        : activePipeline === 'COMPLAINT_SERVICE'
          ? (workOutcome === 'WORK_INCOMPLETE' ? 'WORK_INCOMPLETE' : 'WORK_DONE')
          : (outcomeStatus || 'COMPLETED');

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
      order_value: Number(orderValue || 0),
      payment_collected: Number(paymentCollected || 0),
      payment_mode: paymentMode,
      cheque_utr_no: chequeUtrNo,
      form_data: customFormData,
      photo_watermark_urls: photos.map(p => p.url),
      customer_signature_url: signatureData,
      discussion_notes: discussionNotes,
      next_followup_at: nextFollowup ? new Date(nextFollowup).toISOString() : null
    };

    if (networkOnline) {
      const res = await performCheckOutWithOutput(payload);
      if (res.success) {
        alert('✅ Field Visit & Report Saved Successfully!');
        resetForm();
        await loadCompletedVisits();
        setMainView('COMPLETED_VISITS');
      } else {
        alert(`Check-out submission error: ${res.error}`);
      }
    } else {
      // Offline store and forward
      await queueOfflineAction('CHECK_OUT', payload);
      alert('🟠 Saved in Offline Godown Vault. Will auto-sync when network returns.');
      refreshPendingQueue();
      resetForm();
      setMainView('COMPLETED_VISITS');
    }
  };

  const resetForm = () => {
    setActiveTab('SCHEDULED_TASKS');
    setActiveCheckInTime(null);
    setSelectedTask(null);
    setPartyName('');
    setPartyPhone('');
    setPhotos([]);
    setSignatureData(null);
    setDiscussionNotes('');
    setOrderValue('');
    setPaymentCollected('');
    setNextFollowup('');
    setWorkOutcome('WORK_DONE');
    try {
      localStorage.removeItem('field_active_visit');
      window.dispatchEvent(new Event('field_visit_state_changed'));
    } catch (_) {}
    loadTodayTasks();
  };

  // Sync Offline Queue button
  const handleTriggerSync = async () => {
    if (!networkOnline) {
      alert('Device is currently offline. Connect to internet first.');
      return;
    }
    setIsSyncing(true);
    try {
      await syncOfflineQueue(async (item) => {
        if (item.actionType === 'CHECK_IN') {
          return await performCheckIn(item.payload);
        } else if (item.actionType === 'CHECK_OUT') {
          return await performCheckOutWithOutput(item.payload);
        }
        return { success: true };
      });
      await refreshPendingQueue();
      alert('✅ Offline queue synced successfully!');
    } catch (err) {
      console.error('Queue sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div style={{ width: '100%', minHeight: 'calc(100vh - 120px)', background: 'var(--bg-canvas, #f8fafc)', paddingBottom: 80 }}>
      {/* Top Mobile & Desktop Status Header */}
      <header style={{
        background: '#0f172a',
        color: '#ffffff',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Navigation size={18} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>Field Force Executive Console</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{userName} • {company}</div>
          </div>
        </div>

        {/* Network & Sync indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {pendingQueueCount > 0 && (
            <button
              onClick={handleTriggerSync}
              disabled={isSyncing}
              style={{
                background: '#f59e0b',
                color: '#000',
                border: 'none',
                borderRadius: 16,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={12} className={isSyncing ? 'spin' : ''} />
              {pendingQueueCount} Queued
            </button>
          )}

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: networkOnline ? '#4ade80' : '#f87171',
            background: 'rgba(255,255,255,0.08)',
            padding: '5px 10px',
            borderRadius: 6
          }}>
            {networkOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
            <span>{networkOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>
      </header>

      {/* Floating Active Check-In Banner */}
      {activeCheckInTime && activeTab === 'ACTIVE_VISIT' && (
        <div style={{
          background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
          color: '#ffffff',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 12px rgba(37,99,235,0.3)'
        }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, opacity: 0.85 }}>⏱️ Visit In Progress</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{partyName}</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>
              Duration: <strong>{elapsedMinutes} mins</strong> • {connectivityMode.replace('_', ' ')}
            </div>
          </div>
          <button
            onClick={() => {
              const el = document.getElementById('checkout-output-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            style={{
              background: '#ffffff',
              color: '#1e3a8a',
              border: 'none',
              padding: '8px 14px',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            Submit Output
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab !== 'ACTIVE_VISIT' && (
        <div style={{ padding: '20px', maxWidth: 1400, margin: '0 auto' }}>
          {/* ATTENDANCE PUNCH-IN MANDATORY WARNING BANNER */}
          {attendanceStatus.checked && !attendanceStatus.isPunchedIn && (
            <div style={{
              background: '#fffbeb',
              border: '1.5px solid #fde047',
              borderRadius: 12,
              padding: '14px 18px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 2px 6px rgba(245,158,11,0.08)',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: '#fef3c7', borderRadius: '50%', padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={22} color="#b45309" />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#92400e' }}>
                    ⚠️ Attendance Punch-In Required Before Field Check-In
                  </div>
                  <div style={{ fontSize: 12, color: '#78350f', marginTop: 2 }}>
                    Aapne aaj ki attendance punch-in nahi ki hai. Company policy ke anusaar client visit check-in karne se pehle Smart Attendance mark karna mandatory hai.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToAttendance) {
                    onNavigateToAttendance();
                  } else {
                    window.location.href = '/attendance';
                  }
                }}
                style={{
                  background: '#d97706',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 4px rgba(217,119,6,0.3)',
                  whiteSpace: 'nowrap'
                }}
              >
                <Clock size={15} /> Punch In Attendance Now →
              </button>
            </div>
          )}

          {attendanceStatus.checked && attendanceStatus.isPunchedOut && (
            <div style={{
              background: '#fef2f2',
              border: '1.5px solid #fecaca',
              borderRadius: 12,
              padding: '14px 18px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: '0 2px 6px rgba(239,68,68,0.08)'
            }}>
              <div style={{ background: '#fee2e2', borderRadius: '50%', padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={22} color="#dc2626" />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#991b1b' }}>
                  🛑 Shift Ended for Today (Punched Out)
                </div>
                <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>
                  Aap aaj ka punch-out kar chuke hain {attendanceStatus.outTime ? `(${new Date(attendanceStatus.outTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })})` : ''}. Punch-out ke baad nayi client field visit check-in allowed nahi hai.
                </div>
              </div>
            </div>
          )}

          {/* TOP NAVIGATION / COMPLETED VISITS TOGGLE */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            background: '#ffffff',
            padding: '10px 16px',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            flexWrap: 'wrap',
            gap: 10
          }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setMainView('ASSIGNED_TASKS')}
                style={{
                  padding: '9px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  border: mainView === 'ASSIGNED_TASKS' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                  background: mainView === 'ASSIGNED_TASKS' ? '#eff6ff' : '#ffffff',
                  color: mainView === 'ASSIGNED_TASKS' ? '#1d4ed8' : '#475569',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease'
                }}
              >
                <Calendar size={15} color={mainView === 'ASSIGNED_TASKS' ? '#2563eb' : '#64748b'} />
                📅 My Assigned Tasks ({tasks.length})
              </button>

              <button
                type="button"
                onClick={() => setMainView('CHECK_IN')}
                style={{
                  padding: '9px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  border: mainView === 'CHECK_IN' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                  background: mainView === 'CHECK_IN' ? '#eff6ff' : '#ffffff',
                  color: mainView === 'CHECK_IN' ? '#1d4ed8' : '#475569',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease'
                }}
              >
                <Navigation size={15} /> 📍 Walk-in / New Check-In
              </button>

              <button
                type="button"
                onClick={() => { setMainView('COMPLETED_VISITS'); loadCompletedVisits(); }}
                style={{
                  padding: '9px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  border: mainView === 'COMPLETED_VISITS' ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
                  background: mainView === 'COMPLETED_VISITS' ? '#f0fdf4' : '#ffffff',
                  color: mainView === 'COMPLETED_VISITS' ? '#15803d' : '#475569',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease'
                }}
              >
                <CheckCircle2 size={15} color={mainView === 'COMPLETED_VISITS' ? '#16a34a' : '#64748b'} />
                Today's Completed Visits ({todayCompletedVisits.length})
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#64748b', fontWeight: 600 }}>
              <span>📅 {new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }).format(new Date())}</span>
              <button
                type="button"
                onClick={() => { loadCompletedVisits(); loadTodayTasks(); loadModuleEntities(); loadAttendanceStatus(); }}
                title="Refresh visits, tasks & attendance"
                style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
              >
                <RefreshCw size={14} style={{ animation: loadingCompleted || loadingTasks || attendanceStatus.loading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            </div>
          </div>

          {/* VIEW 0: MY ASSIGNED TASKS */}
          {mainView === 'ASSIGNED_TASKS' && (
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
                flexWrap: 'wrap',
                gap: 10
              }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Calendar size={20} color="#2563eb" />
                    My Assigned Field Tasks ({tasks.length})
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                    Visits & meetings scheduled for you. Click <strong>Start Visit (Check-In)</strong> to begin location check-in.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => loadTodayTasks()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <RefreshCw size={13} style={{ animation: loadingTasks ? 'spin 1s linear infinite' : 'none' }} />
                  Refresh Tasks
                </button>
              </div>

              {loadingTasks ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b', background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', color: '#2563eb' }} />
                  <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600 }}>Loading assigned tasks...</div>
                </div>
              ) : tasks.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '50px 20px',
                  background: '#ffffff',
                  borderRadius: 12,
                  border: '1.5px dashed #cbd5e1',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>No Pending Assigned Tasks</h3>
                  <p style={{ fontSize: 13, color: '#64748b', maxWidth: 450, margin: '0 auto 16px' }}>
                    You have no pending scheduled visits assigned right now. If you are meeting a client, you can initiate a walk-in check-in.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMainView('CHECK_IN')}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 8,
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <Navigation size={15} /> Start Walk-In Check-In
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
                  {tasks.map(task => {
                    const visitedToday = visitedMap.get(task.lead_id) || visitedMap.get(task.party_name?.toLowerCase().trim());
                    const scheduleDate = task.scheduled_start_time ? new Date(task.scheduled_start_time) : null;
                    const isToday = scheduleDate && scheduleDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

                    return (
                      <div
                        key={task.id}
                        style={{
                          background: '#ffffff',
                          borderRadius: 12,
                          border: '1.5px solid #e2e8f0',
                          padding: '18px 20px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: 14
                        }}
                      >
                        <div>
                          {/* Header row: Task code + Priority + Status */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                                {task.task_code || 'TASK'}
                              </span>
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: task.priority === 'HIGH' ? '#fef2f2' : task.priority === 'URGENT' ? '#fff1f2' : '#f8fafc',
                                color: task.priority === 'HIGH' ? '#dc2626' : task.priority === 'URGENT' ? '#be123c' : '#475569',
                                border: '1px solid #e2e8f0'
                              }}>
                                ⚡ {task.priority || 'MEDIUM'}
                              </span>
                            </div>

                            <span style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: task.status === 'IN_PROGRESS' ? '#fef3c7' : '#f0fdf4',
                              color: task.status === 'IN_PROGRESS' ? '#b45309' : '#15803d',
                              border: '1px solid #bbf7d0'
                            }}>
                              {task.status || 'SCHEDULED'}
                            </span>
                          </div>

                          {/* Party Name */}
                          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
                            {task.party_name}
                          </div>

                          {/* Purpose / Pipeline */}
                          <div style={{ fontSize: 13, color: '#475569', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                            <Layers size={14} color="#64748b" />
                            <span style={{ fontWeight: 600 }}>{task.task_type || 'Client Field Visit'}</span>
                          </div>

                          {/* Schedule Time in IST */}
                          <div style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: isToday ? '#fef9c3' : '#f8fafc',
                            border: isToday ? '1px solid #fde047' : '1px solid #e2e8f0',
                            marginBottom: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 12,
                            color: isToday ? '#854d0e' : '#334155'
                          }}>
                            <Clock size={15} color={isToday ? '#b45309' : '#64748b'} />
                            <div>
                              <span style={{ fontWeight: 700 }}>
                                {isToday ? '🔥 Scheduled for Today: ' : '📅 Scheduled: '}
                              </span>
                              {task.scheduled_start_time ? (
                                new Date(task.scheduled_start_time).toLocaleString('en-IN', {
                                  timeZone: 'Asia/Kolkata',
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: true
                                }) + ' IST'
                              ) : 'Pending time'}
                            </div>
                          </div>

                          {/* Contact & Address */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6, fontSize: 12, color: '#64748b' }}>
                            {task.party_phone && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Phone size={13} color="#2563eb" />
                                <a href={`tel:${task.party_phone}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                                  {task.party_phone}
                                </a>
                              </div>
                            )}
                            {task.party_address && (
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                <MapPin size={13} color="#64748b" style={{ flexShrink: 0, marginTop: 2 }} />
                                <span style={{ color: '#475569' }}>{task.party_address}</span>
                              </div>
                            )}
                            {visitedToday && (
                              <div style={{ marginTop: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <CheckCircle2 size={12} color="#16a34a" /> Already Visited Today
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Start Visit Button */}
                        {attendanceStatus.checked && !attendanceStatus.isPunchedIn ? (
                          <button
                            type="button"
                            onClick={() => {
                              alert('⚠️ Attendance Not Punched!\n\nAapne aaj ki attendance punch-in nahi ki hai. Field visit check-in se pehle Smart Attendance me punch-in karein.');
                              if (onNavigateToAttendance) onNavigateToAttendance();
                            }}
                            style={{
                              width: '100%',
                              padding: '12px 18px',
                              borderRadius: 10,
                              border: 'none',
                              background: '#d97706',
                              color: '#ffffff',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                              boxShadow: '0 2px 6px rgba(217,119,6,0.25)'
                            }}
                          >
                            <AlertTriangle size={15} />
                            🔒 Punch Attendance to Start Visit
                          </button>
                        ) : attendanceStatus.checked && attendanceStatus.isPunchedOut ? (
                          <button
                            type="button"
                            disabled
                            style={{
                              width: '100%',
                              padding: '12px 18px',
                              borderRadius: 10,
                              border: 'none',
                              background: '#94a3b8',
                              color: '#ffffff',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'not-allowed',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8
                            }}
                          >
                            <AlertTriangle size={15} />
                            🛑 Shift Ended (Punched Out)
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelectTask(task)}
                            style={{
                              width: '100%',
                              padding: '12px 18px',
                              borderRadius: 10,
                              border: 'none',
                              background: 'linear-gradient(135deg, #16a34a, #15803d)',
                              color: '#ffffff',
                              fontSize: 14,
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                              boxShadow: '0 2px 6px rgba(22,163,74,0.3)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Play size={16} fill="#ffffff" />
                            Start Visit (Check-In) →
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* VIEW A: CHECK-IN CLIENT SELECTION & ACTION */}
          {mainView === 'CHECK_IN' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 20,
            alignItems: 'start'
          }}>
            {/* LEFT COLUMN: MODULE SELECTOR & SEARCHABLE CLIENT LIST */}
            <div style={{ background: '#ffffff', borderRadius: 12, padding: 18, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ marginBottom: 14 }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={18} color="#2563eb" />
                  Select Target Client for Check-In
                </h2>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                  Pick module type, search by name/city, and tap to select party for instant check-in.
                </p>
              </div>

              {/* MODULE TYPE SELECTOR PILLS */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => { setSelectedModule('LEAD_DATA'); setSearchQuery(''); }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    border: selectedModule === 'LEAD_DATA' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                    background: selectedModule === 'LEAD_DATA' ? '#eff6ff' : '#ffffff',
                    color: selectedModule === 'LEAD_DATA' ? '#1d4ed8' : '#334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Building2 size={14} /> Lead Data (45k+ Leads)
                </button>

                <button
                  type="button"
                  onClick={() => { setSelectedModule('PARTY_MASTER'); setSearchQuery(''); }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    border: selectedModule === 'PARTY_MASTER' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                    background: selectedModule === 'PARTY_MASTER' ? '#eff6ff' : '#ffffff',
                    color: selectedModule === 'PARTY_MASTER' ? '#1d4ed8' : '#334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Building size={14} /> Party Master (Customers)
                </button>

                <button
                  type="button"
                  onClick={() => { setSelectedModule('FIELD_TASK'); setSearchQuery(''); }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    border: selectedModule === 'FIELD_TASK' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                    background: selectedModule === 'FIELD_TASK' ? '#eff6ff' : '#ffffff',
                    color: selectedModule === 'FIELD_TASK' ? '#1d4ed8' : '#334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Calendar size={14} /> Assigned Itinerary ({tasks.length})
                </button>
              </div>

              {/* Task Waiting Notice */}
              {tasks.length > 0 && selectedModule !== 'FIELD_TASK' && (
                <div style={{
                  background: '#eff6ff',
                  border: '1.5px solid #bfdbfe',
                  borderRadius: 8,
                  padding: '9px 12px',
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: '#1e40af'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    <Calendar size={14} color="#2563eb" />
                    <span>You have <strong>{tasks.length}</strong> assigned task(s) waiting!</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMainView('ASSIGNED_TASKS')}
                    style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '4px 9px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    View Assigned →
                  </button>
                </div>
              )}

              {/* LIVE INSTANT SEARCH INPUT */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 12, top: 11 }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`🔍 Search by party name, company, phone or city in ${selectedModule === 'LEAD_DATA' ? 'Lead Data' : selectedModule === 'PARTY_MASTER' ? 'Party Master' : 'Assigned Itinerary'}...`}
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 36px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    color: '#0f172a'
                  }}
                />
              </div>

              {/* ENTITIES LIST */}
              <div style={{ maxHeight: 440, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
                {loadingEntities ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b' }}>
                    <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    <div style={{ marginTop: 6, fontSize: 12 }}>Loading CRM records...</div>
                  </div>
                ) : moduleEntities.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 20px', border: '1px dashed #cbd5e1', borderRadius: 8, color: '#64748b', fontSize: 13 }}>
                    No records found matching your search.
                  </div>
                ) : (
                  moduleEntities.map(item => {
                    const isSelected = partyName === item.party_name && (leadId === item.lead_id || !item.lead_id);
                    const visitedItem = visitedMap.get(item.lead_id) || visitedMap.get(item.party_name?.toLowerCase().trim());
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectEntity(item)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: `1.5px solid ${isSelected ? '#2563eb' : visitedItem ? '#bbf7d0' : '#e2e8f0'}`,
                          background: isSelected ? '#eff6ff' : visitedItem ? '#f0fdf4' : '#ffffff',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div style={{ flex: 1, marginRight: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: isSelected ? '#1d4ed8' : '#0f172a' }}>
                            {item.party_name}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                            {item.party_phone && <span>📞 {item.party_phone}</span>}
                            {item.party_address && <span>📍 {item.party_address}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                            {item.current_stage && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: isSelected ? '#dbeafe' : '#f1f5f9', color: isSelected ? '#1e40af' : '#475569', border: '1px solid #e2e8f0' }}>
                                {item.current_stage}
                              </span>
                            )}
                            {visitedItem && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <CheckCircle2 size={11} color="#16a34a" /> Visited Today ({visitedItem.check_out_time ? new Date(visitedItem.check_out_time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : 'Done'})
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          style={{
                            padding: '6px 12px',
                            fontSize: 11,
                            fontWeight: 600,
                            borderRadius: 6,
                            border: 'none',
                            background: isSelected ? '#2563eb' : '#f1f5f9',
                            color: isSelected ? '#ffffff' : '#334155',
                            cursor: 'pointer',
                            flexShrink: 0
                          }}
                        >
                          {isSelected ? '✓ Selected' : 'Select'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: SELECTED CLIENT, CONNECTIVITY MODE & CHECK-IN ACTION */}
            <div style={{ background: '#ffffff', borderRadius: 12, padding: 18, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              {/* Selected Party Summary */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Target Party Summary
                </div>

                {partyName ? (
                  <div style={{ padding: 14, borderRadius: 8, background: '#f8fafc', border: '1.5px solid #cbd5e1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{partyName}</div>
                      <button
                        type="button"
                        onClick={() => { setPartyName(''); setLeadId(null); setSelectedTask(null); }}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Clear
                      </button>
                    </div>
                    {partyPhone && <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>📞 {partyPhone}</div>}
                    {partyAddress && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>📍 {partyAddress}</div>}
                    <div style={{ marginTop: 6, fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
                      Pipeline: {activePipeline.replace('_', ' ')}
                    </div>
                    {selectedTask && (
                      <div style={{
                        marginTop: 10,
                        padding: '8px 10px',
                        borderRadius: 6,
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        fontSize: 11,
                        color: '#1e40af'
                      }}>
                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Calendar size={13} color="#2563eb" />
                          <span>Linked to Task: <strong>{selectedTask.task_code || 'TSK'}</strong></span>
                        </div>
                        {selectedTask.scheduled_start_time && (
                          <div style={{ marginTop: 3, color: '#2563eb', fontSize: 11 }}>
                            📅 Scheduled: {new Date(selectedTask.scheduled_start_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : isManualEntry ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      type="text"
                      value={partyName}
                      onChange={(e) => setPartyName(e.target.value)}
                      placeholder="Party / Company Name *"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: '#ffffff', color: '#0f172a' }}
                    />
                    <input
                      type="tel"
                      value={partyPhone}
                      onChange={(e) => setPartyPhone(e.target.value)}
                      placeholder="Contact Phone"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: '#ffffff', color: '#0f172a' }}
                    />
                    <button
                      type="button"
                      onClick={() => setIsManualEntry(false)}
                      style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#2563eb', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                    >
                      ← Pick from CRM list instead
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '20px', borderRadius: 8, border: '1px dashed #cbd5e1', textAlign: 'center', color: '#64748b' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>No Party Selected Yet</div>
                    <p style={{ fontSize: 11, margin: '4px 0 12px' }}>
                      Click any lead or party from the left list to select it for visit check-in.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsManualEntry(true)}
                      style={{ padding: '6px 14px', fontSize: 11, borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#2563eb', fontWeight: 600 }}
                    >
                      + Or enter walk-in client manually
                    </button>
                  </div>
                )}
              </div>

              {/* Step 2: Connectivity Mode Selector */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                  Interaction Mode *
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
                  How are you communicating with this party right now?
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {CONNECTIVITY_MODES.map(mode => {
                    const isSelected = connectivityMode === mode.id;
                    const IconComponent = mode.icon;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setConnectivityMode(mode.id)}
                        style={{
                          background: isSelected ? `${mode.color}12` : '#f8fafc',
                          border: `2px solid ${isSelected ? mode.color : '#e2e8f0'}`,
                          borderRadius: 8,
                          padding: '10px 8px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          textAlign: 'center',
                          gap: 4,
                          cursor: 'pointer'
                        }}
                      >
                        <IconComponent size={18} color={isSelected ? mode.color : '#64748b'} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: isSelected ? mode.color : '#1e293b' }}>
                          {mode.label}
                        </span>
                        <span style={{ fontSize: 10, color: '#64748b' }}>
                          {mode.id === 'PHYSICAL_VISIT' ? 'Petrol TA/DA Eligible' : 'Zero Petrol Claim'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live GPS Audit Box */}
              <div style={{
                background: geofenceStatus === 'MISMATCH' ? '#fef2f2' : '#f8fafc',
                borderRadius: 8,
                padding: 12,
                border: `1px solid ${geofenceStatus === 'MISMATCH' ? '#fecaca' : '#e2e8f0'}`,
                marginBottom: 16
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={14} color="#2563eb" /> Current GPS Location
                  </span>
                  <button
                    type="button"
                    onClick={fetchLiveGPS}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}
                  >
                    <RefreshCw size={11} /> Refresh GPS
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#475569' }}>
                  {userLat ? (
                    <span>GPS: <strong>{userLat.toFixed(5)}° N, {userLng.toFixed(5)}° E</strong> (±{Math.round(gpsAccuracy || 0)}m)</span>
                  ) : (
                    <span>Acquiring live GPS coordinates...</span>
                  )}
                </div>
                {connectivityMode === 'PHYSICAL_VISIT' && geofenceDistance !== null && (
                  <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: geofenceStatus === 'MISMATCH' ? '#b91c1c' : '#166534' }}>
                    {geofenceStatus === 'MISMATCH' ? `🚨 Flagged: ${geofenceDistance}m away from client location` : `🟢 Verified on-site (${geofenceDistance}m)`}
                  </div>
                )}
              </div>

              {/* BIG START CHECK-IN BUTTON */}
              {attendanceStatus.checked && !attendanceStatus.isPunchedIn ? (
                <button
                  type="button"
                  onClick={() => {
                    alert('⚠️ Attendance Not Punched!\n\nAapne aaj ki attendance punch-in nahi ki hai. Field visit check-in se pehle Smart Attendance me punch-in karein.');
                    if (onNavigateToAttendance) onNavigateToAttendance();
                  }}
                  style={{
                    width: '100%',
                    background: '#d97706',
                    color: '#ffffff',
                    border: 'none',
                    padding: '14px',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 12px rgba(217,119,6,0.25)'
                  }}
                >
                  <AlertTriangle size={18} />
                  🔒 Punch Attendance First to Check-In
                </button>
              ) : attendanceStatus.checked && attendanceStatus.isPunchedOut ? (
                <button
                  type="button"
                  disabled
                  style={{
                    width: '100%',
                    background: '#94a3b8',
                    color: '#ffffff',
                    border: 'none',
                    padding: '14px',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  <AlertTriangle size={18} />
                  🛑 Shift Ended (Punched Out)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!partyName.trim()}
                  onClick={handleStartCheckIn}
                  style={{
                    width: '100%',
                    background: partyName.trim() ? '#2563eb' : '#94a3b8',
                    color: '#ffffff',
                    border: 'none',
                    padding: '14px',
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: partyName.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: partyName.trim() ? '0 4px 12px rgba(37,99,235,0.3)' : 'none'
                  }}
                >
                  <Clock size={18} />
                  {selectedTask ? `Start Check-In (${selectedTask.task_code || 'Assigned Task'})` : 'Start Check-In Now'}
                </button>
              )}
            </div>
          </div>
          )}

          {/* VIEW B: TODAY'S COMPLETED VISITS & FIELD DIARY */}
          {mainView === 'COMPLETED_VISITS' && (
            <div style={{ background: '#ffffff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={20} color="#16a34a" />
                    Today's Completed Visits & Field Diary
                  </h2>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                    All client interactions logged by you today ({new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'long' }).format(new Date())})
                  </p>
                </div>
                <div style={{ background: '#eff6ff', color: '#1d4ed8', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, border: '1px solid #bfdbfe' }}>
                  Total Visits: {todayCompletedVisits.length}
                </div>
              </div>

              {loadingCompleted ? (
                <div style={{ textAlign: 'center', padding: '50px 0', color: '#64748b' }}>
                  <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Loading today's visit logs...</div>
                </div>
              ) : todayCompletedVisits.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', border: '1.5px dashed #cbd5e1', borderRadius: 12, color: '#64748b' }}>
                  <Calendar size={36} color="#94a3b8" style={{ marginBottom: 10 }} />
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#334155' }}>No Visits Completed Yet Today</div>
                  <p style={{ fontSize: 12, color: '#64748b', maxWidth: 420, margin: '6px auto 16px' }}>
                    You have not checked out of any client visit today. Switch to New Check-In to start your first interaction.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMainView('CHECK_IN')}
                    style={{
                      padding: '10px 20px',
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    📍 Go to New Check-In
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {todayCompletedVisits.map((visit, idx) => {
                    const checkInTimeStr = visit.check_in_time
                      ? new Date(visit.check_in_time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
                      : '--:--';
                    const checkOutTimeStr = visit.check_out_time
                      ? new Date(visit.check_out_time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
                      : '--:--';
                    const followUpStr = visit.next_followup_at
                      ? new Date(visit.next_followup_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
                      : null;

                    return (
                      <div
                        key={visit.id || idx}
                        style={{
                          border: '1.5px solid #e2e8f0',
                          borderRadius: 10,
                          padding: 16,
                          background: '#f8fafc',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                                {visit.party_name || 'Direct Walk-in Party'}
                              </span>
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: visit.connectivity_mode === 'PHYSICAL_VISIT' ? '#dcfce7' : '#eff6ff',
                                color: visit.connectivity_mode === 'PHYSICAL_VISIT' ? '#15803d' : '#1d4ed8',
                                border: `1px solid ${visit.connectivity_mode === 'PHYSICAL_VISIT' ? '#bbf7d0' : '#bfdbfe'}`
                              }}>
                                {visit.connectivity_mode === 'PHYSICAL_VISIT' ? '🚶 Physical Visit' : visit.connectivity_mode?.replace('_', ' ') || 'Visit'}
                              </span>
                            </div>
                            {visit.customer_id && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Customer ID: {visit.customer_id}</div>}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {visit.is_geofence_verified ? (
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', background: '#dcfce7', padding: '3px 8px', borderRadius: 4 }}>
                                🟢 On-Site Verified
                              </span>
                            ) : visit.is_geofence_flagged ? (
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fee2e2', padding: '3px 8px', borderRadius: 4 }}>
                                🚨 GPS Mismatch
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Timing & Duration strip */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                          gap: 10,
                          background: '#ffffff',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          marginBottom: 10,
                          fontSize: 12
                        }}>
                          <div>
                            <span style={{ color: '#64748b', fontSize: 10, fontWeight: 700, display: 'block' }}>CHECK-IN</span>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>⏱️ {checkInTimeStr}</span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', fontSize: 10, fontWeight: 700, display: 'block' }}>CHECK-OUT</span>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>🏁 {checkOutTimeStr}</span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', fontSize: 10, fontWeight: 700, display: 'block' }}>DURATION</span>
                            <span style={{ fontWeight: 700, color: '#2563eb' }}>⌛ {visit.duration_minutes || 0} mins</span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', fontSize: 10, fontWeight: 700, display: 'block' }}>NEXT FOLLOW-UP</span>
                            <span style={{ fontWeight: 700, color: followUpStr ? '#059669' : '#64748b' }}>
                              {followUpStr ? `📅 ${followUpStr}` : 'None'}
                            </span>
                          </div>
                        </div>

                        {/* Stage & Details */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                          {visit.lead_stage_updated && (
                            <div style={{ color: '#334155' }}>
                              <strong style={{ color: '#0f172a' }}>Stage Updated:</strong>{' '}
                              <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                {visit.lead_stage_updated}
                              </span>
                            </div>
                          )}

                          {visit.discussion_notes && (
                            <div style={{ color: '#475569', background: '#ffffff', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                              <strong style={{ color: '#0f172a' }}>Meeting Notes:</strong> {visit.discussion_notes}
                            </div>
                          )}

                          {/* Proofs */}
                          <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: '#64748b' }}>
                            {visit.photo_watermark_urls?.length > 0 && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#0284c7', fontWeight: 600 }}>
                                <Camera size={13} /> {visit.photo_watermark_urls.length} On-Site Photo(s)
                              </span>
                            )}
                            {visit.customer_signature_url && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a', fontWeight: 600 }}>
                                <PenTool size={13} /> E-Signature Verified
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* View 3: Active Visit Execution & Check-Out Output Form */}
      {activeTab === 'ACTIVE_VISIT' && (
        <div style={{ padding: 16 }} id="checkout-output-section">
          {/* Pipeline Type Selector */}
          <div style={{ background: '#ffffff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: 6 }}>
              Target Pipeline / Purpose *
            </label>
            <select
              value={activePipeline}
              onChange={(e) => setActivePipeline(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: 13,
                fontWeight: 600,
                color: '#1e293b',
                background: '#f8fafc'
              }}
            >
              {PIPELINES.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>

            {/* Dynamic Pipeline Stage selector */}
            {activePipeline === 'LEAD_DATA' && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                  Update Lead Stage & Status to:
                </label>
                <select
                  value={leadStage}
                  onChange={(e) => setLeadStage(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    color: '#0f172a',
                    fontWeight: 600,
                    background: '#ffffff'
                  }}
                >
                  {leadStage && !CRM_LEAD_STAGES.some(st => st.substages.some(sub => leadStage.includes(sub))) && (
                    <option value={leadStage}>Current: {leadStage}</option>
                  )}
                  {CRM_LEAD_STAGES.map((stageObj, i) => {
                    const stageNum = i + 1;
                    const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
                    return (
                      <optgroup key={`stage-${i}`} label={stageObj.name}>
                        {stageObj.substages.map((sub, j) => {
                          const subNum = String(j + 1).padStart(2, '0');
                          const formattedVal = `${stageNum};${subNum}>${cleanStageName}>${sub}`;
                          return (
                            <option key={formattedVal} value={formattedVal}>
                              {formattedVal}
                            </option>
                          );
                        })}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
            )}

            {/* ORDER TO DELIVERY PIPELINE (S01 - S13) */}
            {activePipeline === 'ORDER_DELIVERY' && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                  Update Order to Delivery Stage to:
                </label>
                <select
                  value={orderDeliveryStage}
                  onChange={(e) => setOrderDeliveryStage(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    color: '#0f172a',
                    fontWeight: 600,
                    background: '#ffffff'
                  }}
                >
                  {ORDER_DELIVERY_STAGES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            {/* COMPLAINT & SERVICE PIPELINE: Strict Sequential On-Site Pipeline Card */}
            {activePipeline === 'COMPLAINT_SERVICE' && (
              <div style={{ marginTop: 14, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span>⚙️</span> Sequential Complaint Pipeline
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '3px 8px', borderRadius: 6, border: '1px solid #bae6fd' }}>
                    Active Stage: C04
                  </span>
                </div>

                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>
                  C04 - On-Site Execution &amp; Digital Job Card
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12, lineHeight: 1.4 }}>
                  Technician on-site execution in progress. Kaam poora hone par Customer Sign-off (C05) capture hoga aur Office QA review karke C06 me ticket close karega.
                </div>

                {/* Work Status Toggle (Kaam hua ya nahi) */}
                <label style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: 6 }}>
                  Work Outcome Status (काम की स्थिति) *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setWorkOutcome('WORK_DONE')}
                    style={{
                      padding: '10px 8px',
                      borderRadius: 8,
                      border: workOutcome === 'WORK_DONE' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                      background: workOutcome === 'WORK_DONE' ? '#f0fdf4' : '#ffffff',
                      color: workOutcome === 'WORK_DONE' ? '#15803d' : '#475569',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                      boxShadow: workOutcome === 'WORK_DONE' ? '0 2px 8px rgba(22,163,74,0.15)' : 'none'
                    }}
                  >
                    <span>✅ Work Completed</span>
                    <span style={{ fontSize: 10, fontWeight: 500, color: workOutcome === 'WORK_DONE' ? '#166534' : '#64748b' }}>काम पूरा हो गया</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWorkOutcome('WORK_INCOMPLETE')}
                    style={{
                      padding: '10px 8px',
                      borderRadius: 8,
                      border: workOutcome === 'WORK_INCOMPLETE' ? '2px solid #ea580c' : '1px solid #cbd5e1',
                      background: workOutcome === 'WORK_INCOMPLETE' ? '#fff7ed' : '#ffffff',
                      color: workOutcome === 'WORK_INCOMPLETE' ? '#c2410c' : '#475569',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                      boxShadow: workOutcome === 'WORK_INCOMPLETE' ? '0 2px 8px rgba(234,88,12,0.15)' : 'none'
                    }}
                  >
                    <span>⏳ Work Incomplete</span>
                    <span style={{ fontSize: 10, fontWeight: 500, color: workOutcome === 'WORK_INCOMPLETE' ? '#9a3412' : '#64748b' }}>काम अधूरा / फॉलो-अप</span>
                  </button>
                </div>

                {workOutcome === 'WORK_INCOMPLETE' && (
                  <div style={{ marginTop: 10, padding: 8, background: '#fffbeb', borderRadius: 6, border: '1px solid #fef3c7', fontSize: 11, color: '#92400e', lineHeight: 1.4 }}>
                    ⚠️ <strong>Follow-up Visit Rule:</strong> Kaam adhoora hone par ticket C04 (In Progress) me hi rahegi aur next visit date par aapke <strong>"📅 My Assigned Tasks"</strong> me bani rahegi.
                  </div>
                )}
              </div>
            )}

            {/* ASSIGNED CUSTOM FORM */}
            {activePipeline === 'CUSTOM_FORM' && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                  Select Custom Form:
                </label>
                <select
                  value={selectedFormId}
                  onChange={(e) => setSelectedFormId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    color: '#0f172a',
                    fontWeight: 600,
                    background: '#ffffff'
                  }}
                >
                  {customForms.length === 0 ? (
                    <option value="">No published custom forms</option>
                  ) : (
                    customForms.map(f => (
                      <option key={f.id} value={f.id}>{f.title} ({f.data_type})</option>
                    ))
                  )}
                </select>
              </div>
            )}

            {/* NEXT FOLLOW-UP SCHEDULE (DATE & TIME) */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #cbd5e1' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: (activePipeline === 'COMPLAINT_SERVICE' && workOutcome === 'WORK_INCOMPLETE') ? '#b91c1c' : '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📅</span> Next Follow-up Date &amp; Time {(activePipeline === 'COMPLAINT_SERVICE' && workOutcome === 'WORK_INCOMPLETE') ? <span style={{ color: '#ef4444', fontWeight: 800 }}>* (Mandatory for Incomplete Work)</span> : <span style={{ color: '#64748b', fontWeight: 500 }}>(Optional)</span>}
                </label>
                {nextFollowup && (
                  <button
                    type="button"
                    onClick={() => setNextFollowup('')}
                    style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                  >
                    ✕ Clear
                  </button>
                )}
              </div>
              <input
                type="datetime-local"
                value={nextFollowup}
                onChange={(e) => setNextFollowup(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#0f172a',
                  background: '#ffffff',
                  boxSizing: 'border-box'
                }}
              />
              {/* Quick Presets for Field Executive Convenience */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 1);
                    d.setHours(11, 0, 0, 0);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    setNextFollowup(`${year}-${month}-${day}T11:00`);
                  }}
                  style={{ fontSize: 11, padding: '5px 9px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer', fontWeight: 600 }}
                >
                  +1 Day (11 AM)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 3);
                    d.setHours(11, 0, 0, 0);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    setNextFollowup(`${year}-${month}-${day}T11:00`);
                  }}
                  style={{ fontSize: 11, padding: '5px 9px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer', fontWeight: 600 }}
                >
                  +3 Days (11 AM)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 7);
                    d.setHours(11, 0, 0, 0);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    setNextFollowup(`${year}-${month}-${day}T11:00`);
                  }}
                  style={{ fontSize: 11, padding: '5px 9px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer', fontWeight: 600 }}
                >
                  Next Week
                </button>
              </div>
            </div>
          </div>

          {/* Meeting Notes with Voice-to-Text */}
          <div style={{ background: '#ffffff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                Discussion & Meeting Notes
              </label>
              <button
                type="button"
                onClick={toggleVoiceToText}
                style={{
                  background: isListening ? '#ef4444' : '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 16,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer'
                }}
              >
                {isListening ? <MicOff size={12} /> : <Mic size={12} />}
                {isListening ? 'Listening (Tap to Stop)' : 'Voice-to-Text Mic'}
              </button>
            </div>

            <textarea
              rows={3}
              value={discussionNotes}
              onChange={(e) => setDiscussionNotes(e.target.value)}
              placeholder="Record points discussed, customer requirements, payment timeline, etc. (Or use Voice-to-Text mic above)"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: 13,
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Watermarked Photo Upload */}
          <div style={{ background: '#ffffff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: 4 }}>
              📷 Watermarked On-Site Photo
            </label>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
              Live GPS, IST time, and client name are permanently stamped on the photo.
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <label style={{
                background: '#eff6ff',
                color: '#2563eb',
                border: '1.5px dashed #3b82f6',
                borderRadius: 10,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600
              }}>
                <Camera size={18} />
                {isWatermarking ? 'Stamping Watermark...' : 'Capture Photo'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCapturePhoto}
                  style={{ display: 'none' }}
                  disabled={isWatermarking}
                />
              </label>

              {photos.map((p, idx) => (
                <div key={idx} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                  <img src={p.url} alt="Watermarked" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    type="button"
                    onClick={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      background: 'rgba(0,0,0,0.6)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '50%',
                      width: 18,
                      height: 18,
                      fontSize: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Customer E-Signature Canvas */}
          <div style={{ background: '#ffffff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                ✍️ Customer E-Signature
              </label>
              <button
                type="button"
                onClick={clearSignature}
                style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                Clear Signature
              </button>
            </div>
            {activePipeline === 'COMPLAINT_SERVICE' && workOutcome === 'WORK_INCOMPLETE' ? (
              <div style={{ fontSize: 11, color: '#9a3412', marginBottom: 8, background: '#fff7ed', padding: '6px 10px', borderRadius: 6, border: '1px solid #fed7aa', lineHeight: 1.4 }}>
                ℹ️ <strong>Sign-off Note:</strong> Kaam adhoora hone ke kaaran Customer Verification / Sign-off (C05) agle complete visit par capture hoga. (Aaj signature optional hai).
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                Ask customer to sign with finger directly on screen {activePipeline === 'COMPLAINT_SERVICE' ? '(C05 Sign-off)' : ''}:
              </div>
            )}

            <canvas
              ref={signatureCanvasRef}
              width={320}
              height={120}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              style={{
                width: '100%',
                height: 120,
                background: '#f8fafc',
                border: '1.5px dashed #94a3b8',
                borderRadius: 8,
                touchAction: 'none'
              }}
            />
          </div>

          {/* Check-Out Complete Button */}
          <button
            type="button"
            onClick={handleCompleteCheckOut}
            style={{
              width: '100%',
              background: '#16a34a',
              color: '#ffffff',
              border: 'none',
              padding: '14px',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(22,163,74,0.3)'
            }}
          >
            <CheckCircle2 size={18} />
            Complete Check-Out & Save Report
          </button>
        </div>
      )}
    </div>
  );
}
