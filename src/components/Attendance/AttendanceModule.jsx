'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock, Calendar, CheckCircle2, XCircle, AlertCircle, RefreshCw, Send,
  UserCheck, ShieldCheck, FileSpreadsheet, Filter, Search, ChevronLeft,
  ChevronRight, ArrowRight, Check, X, Building, MapPin, Laptop, Smartphone,
  Info, AlertTriangle, FileText, User, Users, Download, Volume2, VolumeX, Play, Sparkles
} from 'lucide-react';
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
  getTeamMonthlyMatrix
} from '@/app/actions/attendance';
import { 
  formatMinutesToHours, 
  getTodayDateString,
  evaluateMorningInPunch,
  evaluateEveningOutPunch,
  calculateMonthlyShortLeaveUsage,
  SHIFT_RULES
} from '@/utils/attendanceUtils';

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

export default function AttendanceModule({
  userRole = 'agent',
  userId = '',
  userName = 'User',
  userEmail = '',
  moduleAccess = {},
  initialSubTab = 'my_attendance',
  onSubTabChange = null
}) {
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
  const isHodOrManager = isAdmin || userRole === 'manager' || userRole === 'hod' || moduleAccess?.attendance?.is_manager === true;

  // Active Sub-Tab: 'my_attendance' | 'monthly_logs' | 'regularization' | 'hod_approvals' | 'team_report'
  const [activeTab, setActiveTab] = useState(initialSubTab || 'my_attendance');

  useEffect(() => {
    if (initialSubTab && initialSubTab !== activeTab) {
      setActiveTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleTabSelect = (tab) => {
    setActiveTab(tab);
    if (onSubTabChange) onSubTabChange(tab);
  };

  // Today's punch state (with 0ms instant localStorage cache)
  const [todayRecord, setTodayRecord] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const todayStr = getTodayDateString();
        const cached = localStorage.getItem(`att_today_record_${userEmail || 'active'}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.attendance_date === todayStr) {
            return parsed;
          }
        }
      } catch {}
    }
    return null;
  });
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

  // Sync cache if userEmail changes
  useEffect(() => {
    if (!userEmail || typeof window === 'undefined') return;
    try {
      const todayStr = getTodayDateString();
      const cached = localStorage.getItem(`att_today_record_${userEmail}`);
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

  // HOD Approvals State
  const [hodRequests, setHodRequests] = useState([]);
  const [hodPendingCount, setHodPendingCount] = useState(0);
  const [hodCounts, setHodCounts] = useState({ all: 0, pending: 0, approved: 0, rejected: 0 });
  const [loadingHodRequests, setLoadingHodRequests] = useState(false);
  const [hodStatusFilter, setHodStatusFilter] = useState('PENDING'); // 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'
  const [hodSearchQuery, setHodSearchQuery] = useState('');
  const [actionModal, setActionModal] = useState(null); // { type: 'APPROVE' | 'REJECT', request: obj }
  const [actionRemarks, setActionRemarks] = useState('');
  const [processingAction, setProcessingAction] = useState(false);
  const [selectedHodRequests, setSelectedHodRequests] = useState(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkActionModal, setBulkActionModal] = useState(null); // { type: 'APPROVE' | 'REJECT', count: number }
  const [bulkRemarks, setBulkRemarks] = useState('');

  // Team Master Attendance State
  const [teamReportView, setTeamReportView] = useState('DAILY'); // 'DAILY' | 'MONTHLY_MATRIX'
  const [teamMasterDate, setTeamMasterDate] = useState(getTodayDateString());
  const [teamMasterDepartment, setTeamMasterDepartment] = useState('All');
  const [teamMasterData, setTeamMasterData] = useState({ records: [], summary: {} });
  const [loadingTeamMaster, setLoadingTeamMaster] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');

  // Monthly Matrix State
  const [matrixMonth, setMatrixMonth] = useState(new Date().getMonth() + 1);
  const [matrixYear, setMatrixYear] = useState(new Date().getFullYear());
  const [monthlyMatrixData, setMonthlyMatrixData] = useState({ rows: [], monthDates: [], summary: {} });
  const [loadingMonthlyMatrix, setLoadingMonthlyMatrix] = useState(false);

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
      const res = await getTodayAttendance(userEmail, userId);
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
      const res = await getMyAttendanceHistory(userEmail, historyYear, historyMonth);
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
      const res = await getMyRegularizationRequests(userEmail);
      if (res.success) {
        setMyRequests(res.requests || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMyRequests(false);
    }
  };

  // 6. Load HOD Requests (if manager/admin)
  const fetchHodRequests = async () => {
    if (!isHodOrManager) return;
    setLoadingHodRequests(true);
    try {
      const res = await getHodPendingRequests({
        hodEmail: userEmail,
        userRole,
        statusFilter: hodStatusFilter
      });
      if (res.success) {
        setHodRequests(res.requests || []);
        setHodPendingCount(res.pendingCount || 0);
        if (res.counts) setHodCounts(res.counts);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHodRequests(false);
    }
  };

  // 7. Load Team Master Attendance
  const fetchTeamMaster = async () => {
    if (!isHodOrManager) return;
    setLoadingTeamMaster(true);
    try {
      const res = await getTeamAttendanceMaster({
        date: teamMasterDate,
        department: teamMasterDepartment
      });
      if (res.success) {
        setTeamMasterData({
          records: res.records || [],
          summary: res.summary || {}
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
        department: teamMasterDepartment
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

  // Initial Load
  useEffect(() => {
    fetchTodayAttendance();
    fetchHistory();
    fetchMyRequests();
    if (isHodOrManager) {
      fetchHodRequests();
    }
  }, [userEmail, historyYear, historyMonth]);

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
  }, [activeTab, teamReportView, hodStatusFilter, teamMasterDate, teamMasterDepartment, matrixYear, matrixMonth]);

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
    // 1. INSTANT (0ms) Audio Chime + Human Female Voice Trigger
    playInstantChime('in');

    const inDate = new Date();
    const inTimeFormatted = inDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    
    // Evaluate shift rules immediately on client for instant voice feedback
    const evaluation = evaluateMorningInPunch(inDate, shortLeaveUsage, userName);

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
      `Welcome ${userName}. Your punch in time is ${inTimeFormatted}. ${evaluation.ruleTitle}`,
      evaluation.voiceMessageHindi
    );

    setPunchError(null);
    setPunchMessage(null);
    setPunchingIn(true);

    // 2. Parallel Background Database Persistence
    try {
      const res = await punchIn({
        email: userEmail,
        userId,
        empName: userName,
        location: 'Office Web Terminal',
        method: 'WEB_PUNCH'
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
      setPunchError(err.message);
      fetchTodayAttendance();
    } finally {
      setPunchingIn(false);
    }
  };

  // Confirmed Punch Out (Instant Audio Feedback + Lifelike Human Female Voice + Shift Rules)
  const handleConfirmedPunchOut = async () => {
    setPunchConfirm(null);
    // 1. INSTANT (0ms) Audio Chime + Human Female Voice Trigger
    playInstantChime('out');

    const outDate = new Date();
    const evaluation = evaluateEveningOutPunch(outDate, todayRecord?.in_time, todayRecord, shortLeaveUsage, userName);

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

    // 2. Parallel Background Database Persistence
    try {
      const res = await punchOut({
        email: userEmail,
        userId,
        empName: userName,
        location: 'Office Web Terminal',
        method: 'WEB_PUNCH'
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
      setPunchError(err.message);
      fetchTodayAttendance();
    } finally {
      setPunchingOut(false);
    }
  };

  // Open Regularization modal pre-filled for a specific date
  const handleOpenRegularizeForDate = (dateStr, existingRow = null) => {
    setApplyForm({
      attendanceDate: dateStr || getTodayDateString(),
      requestType: existingRow?.in_time && !existingRow?.out_time ? 'MISSED_OUT' : (!existingRow?.in_time && existingRow?.out_time ? 'MISSED_IN' : 'BOTH'),
      requestedInTime: existingRow?.in_time ? new Date(existingRow.in_time).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '09:30',
      requestedOutTime: existingRow?.out_time ? new Date(existingRow.out_time).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '18:30',
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
        assignedHodName: applyForm.assignedHodName
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
      setApplyError(err.message);
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
          actionRemarks: actionRemarks || 'Approved'
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
          actionRemarks
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
        actionRemarks: 'Approved by HOD'
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
          actionRemarks: bulkRemarks || 'Bulk Approved by HOD'
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
          actionRemarks: bulkRemarks
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

  // Filter HOD Requests
  const filteredHodRequests = useMemo(() => {
    return hodRequests.filter(r => {
      if (!hodSearchQuery) return true;
      const q = hodSearchQuery.toLowerCase();
      return (
        r.emp_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q) ||
        r.reason_type?.toLowerCase().includes(q) ||
        r.attendance_date?.includes(q)
      );
    });
  }, [hodRequests, hodSearchQuery]);

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

  // Filter Monthly Matrix Records
  const filteredMatrixRows = useMemo(() => {
    return (monthlyMatrixData.rows || []).filter(r => {
      if (!teamSearchQuery) return true;
      const q = teamSearchQuery.toLowerCase();
      return (
        r.emp_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.emp_id?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q)
      );
    });
  }, [monthlyMatrixData.rows, teamSearchQuery]);

  // Export Daily Team Attendance to CSV
  const handleExportCSV = () => {
    if (!teamMasterData.records || teamMasterData.records.length === 0) return;
    const headers = ['Emp ID', 'Employee Name', 'Email', 'Department', 'Date', 'In Time', 'Out Time', 'Duration', 'Status', 'Regularized', 'Remarks'];
    const rows = teamMasterData.records.map(r => [
      `"${r.emp_code || ''}"`,
      `"${r.emp_name || ''}"`,
      `"${r.email || ''}"`,
      `"${r.department || ''}"`,
      `"${r.attendance_date || ''}"`,
      `"${r.in_time ? new Date(r.in_time).toLocaleTimeString() : ''}"`,
      `"${r.out_time ? new Date(r.out_time).toLocaleTimeString() : ''}"`,
      `"${formatMinutesToHours(r.total_working_minutes)}"`,
      `"${r.status || 'ABSENT'}"`,
      `"${r.is_regularized ? 'Yes' : 'No'}"`,
      `"${r.remarks || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Daily_Attendance_Report_${teamMasterDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Monthly Master Attendance Matrix to CSV / Excel
  const handleExportMonthlyMatrixCSV = () => {
    if (!monthlyMatrixData.rows || monthlyMatrixData.rows.length === 0) return;
    
    const datesHeaders = (monthlyMatrixData.monthDates || []).map(d => `"${d.dayNumber} (${d.dayNameShort})"`);
    const headers = ['Emp ID', 'Employee Name', 'Email', 'Department', ...datesHeaders, 'Total Present', 'Total Absent', 'Total Half Days', 'Total Short Leaves', 'Total Payable Days', 'Total Hours Logged'];

    const rows = monthlyMatrixData.rows.map(r => {
      const dayCodes = (r.days || []).map(d => `"${d.code}"`);
      return [
        `"${r.emp_id || ''}"`,
        `"${r.emp_name || ''}"`,
        `"${r.email || ''}"`,
        `"${r.department || ''}"`,
        ...dayCodes,
        `"${r.summary?.totalPresent || 0}"`,
        `"${r.summary?.totalAbsent || 0}"`,
        `"${r.summary?.totalHalfDays || 0}"`,
        `"${r.summary?.totalShortLeaves || 0}"`,
        `"${r.summary?.totalPayableDays || 0}"`,
        `"${r.summary?.totalHoursFormatted || '0h'}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const monthName = new Date(matrixYear, matrixMonth - 1, 1).toLocaleString('en-US', { month: 'long' });
    link.setAttribute('download', `Monthly_Attendance_Matrix_${monthName}_${matrixYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper formatting for status badges
  const renderStatusBadge = (status, isRegularized = false) => {
    if (isRegularized || status === 'REGULARIZED') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: '#e0e7ff', color: '#3730a3' }}>
          <ShieldCheck size={12} /> Regularized
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

  // Helper to render Short Leave badges
  const renderShortLeaveBadge = (type, isGrace = false) => {
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
    <div style={{ padding: '1.25rem', maxWidth: '1440px', margin: '0 auto', width: '100%', color: 'var(--text-primary)' }}>

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
              {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 1.5rem' }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
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
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>Smart Attendance & Regularization</h1>
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
            onClick={() => setActiveTab('my_attendance')}
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
              setActiveTab('monthly_logs');
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
            onClick={() => setActiveTab('regularization')}
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
              onClick={() => setActiveTab('hod_approvals')}
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
              onClick={() => setActiveTab('team_report')}
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
              
              <div style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </div>

              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Calendar size={15} />
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
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
                      speakInstantAnnouncement(`नमस्ते ${userName} जी! वॉइस अनाउंसमेंट चालू है।`);
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
                  {renderShortLeaveBadge(todayRecord?.short_leave_type, todayRecord?.is_grace_applied)}
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
                      ? `In: ${new Date(todayRecord.in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`
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
                      ? `Out: ${new Date(todayRecord.out_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`
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

              <div style={{ borderTop: '1px dashed var(--border-light)', paddingTop: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Missed a punch today?</span>
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
              </div>
            </div>

          </div>

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
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Regular Shift</div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>09:00 - 18:30</div>
                <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600 }}>5m Grace (09:00 - 09:05:59)</div>
              </div>
            </div>

            {/* 20-Minute Short Leave */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Sparkles size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>20-Min Short Leave</div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#16a34a' }}>
                  {shortLeaveUsage.remaining_20_min} / 2 Remaining
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>09:06-09:20 • 18:10-18:30</div>
              </div>
            </div>

            {/* 2-Hour Short Leave */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Calendar size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>2-Hour Short Leave</div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#7c3aed' }}>
                  {shortLeaveUsage.remaining_2_hr} / 2 Remaining
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>09:21-11:00 • 16:30-18:30</div>
              </div>
            </div>

            {/* Monthly Policy & Rules */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Info size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Monthly Policy</div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#d97706' }}>
                  {shortLeaveUsage.total_used} / 4 Used
                </div>
                <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600 }}>Mon-Sat: &lt; 4h 30m = Absent</div>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
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
                            {r.in_time ? new Date(r.in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'Missed In'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: r.out_time ? 'var(--text-primary)' : (r.attendance_date === getTodayDateString() ? 'var(--text-secondary)' : '#ef4444'), fontWeight: r.out_time ? 500 : 600 }}>
                            {r.out_time ? new Date(r.out_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : (r.attendance_date === getTodayDateString() ? 'Working...' : 'Missed Out')}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--accent-color)' }}>
                            {formatMinutesToHours(r.total_working_minutes)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                              {renderStatusBadge(r.status, r.is_regularized)}
                              {renderShortLeaveBadge(r.short_leave_type, r.is_grace_applied)}
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
              </table>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
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
                      const reqInFormatted = r.requested_in_time ? new Date(r.requested_in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
                      const reqOutFormatted = r.requested_out_time ? new Date(r.requested_out_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

                      return (
                        <tr key={r.id || idx} style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--table-alt-row, rgba(0,0,0,0.01))' }}>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                            {new Date(r.created_at).toLocaleDateString()}
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
              </table>
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
                Review employee regularization requests. When you click Approve, the employee's attendance record for that date will be updated automatically.
              </p>
            </div>

            {/* Interactive Status Tabs / Filter Bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem', width: '100%', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-primary)', padding: '0.25rem', borderRadius: '10px', border: '1px solid var(--border-light)', gap: '0.25rem', flexWrap: 'wrap' }}>
                {/* 1. Pending Pill */}
                <button
                  type="button"
                  onClick={() => setHodStatusFilter('PENDING')}
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
                  onClick={() => setHodStatusFilter('APPROVED')}
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
                  onClick={() => setHodStatusFilter('REJECTED')}
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
                  onClick={() => setHodStatusFilter('ALL')}
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
                onClick={fetchHodRequests}
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
          </div>

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
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
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
                      const reqInFormatted = r.requested_in_time ? new Date(r.requested_in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
                      const reqOutFormatted = r.requested_out_time ? new Date(r.requested_out_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

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
                                  {new Date(r.action_at || r.updated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
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
                                  {new Date(r.action_at || r.updated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
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
              </table>
            </div>
          </div>

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
                  {teamReportView === 'DAILY' ? 'Team Daily Attendance Report' : 'All-Employee Monthly Attendance Matrix'}
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                  {teamReportView === 'DAILY' 
                    ? 'Live daily punch log and present/absent summary for all team members' 
                    : 'Complete 1st to 31st master monthly attendance sheet with payable days & payroll calculations'}
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
                  onClick={() => setTeamReportView('MONTHLY_MATRIX')}
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
                  /* Single Date picker for Daily View */
                  <input
                    type="date"
                    value={teamMasterDate}
                    onChange={(e) => setTeamMasterDate(e.target.value)}
                    style={{
                      padding: '0.45rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      outline: 'none'
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
                  <option value="All">All Departments</option>
                  <option value="Sales">Sales</option>
                  <option value="IT">IT</option>
                  <option value="Human Resource">Human Resource</option>
                  <option value="Accounts">Accounts</option>
                  <option value="General">General</option>
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
                  <Download size={14} /> {teamReportView === 'DAILY' ? 'Export Daily CSV' : 'Export Monthly Excel / CSV'}
                </button>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* VIEW 1: DAILY VIEW */}
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
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>TOTAL EMPLOYEES</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{teamMasterData.summary?.totalEmployees || 0}</span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>PRESENT</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#16a34a' }}>{teamMasterData.summary?.totalPresent || 0}</span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>LATE IN</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#d97706' }}>{teamMasterData.summary?.totalLate || 0}</span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>HALF DAY</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ea580c' }}>{teamMasterData.summary?.totalHalfDay || 0}</span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>ABSENT</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{teamMasterData.summary?.totalAbsent || 0}</span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>REGULARIZED</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#4f46e5' }}>{teamMasterData.summary?.totalRegularized || 0}</span>
                </div>
              </div>

              {/* Master Team Attendance Table */}
              <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Emp ID</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Employee Name</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Email</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Department</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Punch In</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Punch Out</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Duration</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status</th>
                        <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Regularization</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeamRecords.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No records found for date {teamMasterDate}.
                          </td>
                        </tr>
                      ) : (
                        filteredTeamRecords.map((r, idx) => (
                          <tr key={r.id || idx} style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--table-alt-row, rgba(0,0,0,0.01))' }}>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--accent-color)', fontFamily: 'monospace', fontSize: '0.82rem' }}>
                              {r.emp_code || '—'}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{r.emp_name}</td>
                            <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{r.email}</td>
                            <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{r.department || 'General'}</td>
                            <td style={{ padding: '0.75rem 1rem', color: r.in_time ? '#16a34a' : 'var(--text-secondary)', fontWeight: r.in_time ? 600 : 400 }}>
                              {r.in_time ? new Date(r.in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', color: r.out_time ? '#dc2626' : 'var(--text-secondary)', fontWeight: r.out_time ? 600 : 400 }}>
                              {r.out_time ? new Date(r.out_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : (r.in_time ? 'Working...' : '—')}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--accent-color)' }}>
                              {formatMinutesToHours(r.total_working_minutes)}
                            </td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }}>
                                {renderStatusBadge(r.status, r.is_regularized)}
                                {renderShortLeaveBadge(r.short_leave_type, r.is_grace_applied)}
                              </div>
                            </td>
                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              {r.is_regularized ? 'Yes (HOD Approved)' : 'No'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
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
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{monthlyMatrixData.summary?.totalEmployees || 0}</span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>DAYS IN MONTH</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent-color)' }}>{monthlyMatrixData.daysInMonth || 31}</span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>WORKING DAYS</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#16a34a' }}>
                    {(monthlyMatrixData.monthDates || []).filter(d => !d.isSunday).length}
                  </span>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>SUNDAYS / OFF DAYS</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#64748b' }}>
                    {(monthlyMatrixData.monthDates || []).filter(d => d.isSunday).length}
                  </span>
                </div>
              </div>

              {/* Legend Bar */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'var(--bg-surface)',
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                fontSize: '0.75rem'
              }}>
                <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Status Key:</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#dcfce7', color: '#166534', fontWeight: 700 }}>P</span> Present
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#fee2e2', color: '#991b1b', fontWeight: 700 }}>A</span> Absent (&lt; 4:30h)
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
                  <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#f1f5f9', color: '#64748b', fontWeight: 700 }}>WO</span> Week Off
                </span>
              </div>

              {/* Monthly Master Matrix Grid Table */}
              <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-light)', maxHeight: '680px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.78rem' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg-primary)' }}>
                      <tr style={{ borderBottom: '2px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, textAlign: 'left', minWidth: '90px', position: 'sticky', left: 0, background: 'var(--bg-primary)', zIndex: 4 }}>Emp ID</th>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, textAlign: 'left', minWidth: '140px', position: 'sticky', left: '90px', background: 'var(--bg-primary)', zIndex: 4 }}>Employee Name</th>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, textAlign: 'left', minWidth: '100px' }}>Dept</th>

                        {/* Date Columns 1 to Last Day */}
                        {(monthlyMatrixData.monthDates || []).map(d => (
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
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 800, color: '#16a34a', background: 'rgba(22, 163, 74, 0.08)', minWidth: '70px' }}>Payable</th>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: 'var(--accent-color)', minWidth: '75px' }}>Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMatrixRows.length === 0 ? (
                        <tr>
                          <td colSpan={(monthlyMatrixData.monthDates?.length || 31) + 9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
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
                  </table>
                </div>
              </div>
            </>
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

      {/* Hidden Audio Player for Human Voice Announcements */}
      <audio ref={audioPlayerRef} preload="auto" style={{ display: 'none' }} />

    </div>
  );
}
