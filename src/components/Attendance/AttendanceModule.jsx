'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock, Calendar, CheckCircle2, XCircle, AlertCircle, RefreshCw, Send,
  UserCheck, ShieldCheck, FileSpreadsheet, Filter, Search, ChevronLeft,
  ChevronRight, ArrowRight, Check, X, Building, MapPin, Laptop, Smartphone,
  Info, AlertTriangle, FileText, User, Users, Download
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
  getTeamAttendanceMaster
} from '@/app/actions/attendance';
import { formatMinutesToHours, getTodayDateString } from '@/utils/attendanceUtils';

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
  moduleAccess = {}
}) {
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
  const isHodOrManager = isAdmin || userRole === 'manager' || userRole === 'hod' || moduleAccess?.attendance?.is_manager === true;

  // Active Sub-Tab: 'my_attendance' | 'regularization' | 'hod_approvals' | 'team_report'
  const [activeTab, setActiveTab] = useState('my_attendance');

  // Today's punch state
  const [todayRecord, setTodayRecord] = useState(null);
  const [loadingToday, setLoadingToday] = useState(true);
  const [punchingIn, setPunchingIn] = useState(false);
  const [punchingOut, setPunchingOut] = useState(false);
  const [punchMessage, setPunchMessage] = useState(null);
  const [punchError, setPunchError] = useState(null);

  // Live Digital Clock & Live Duration
  const [currentTime, setCurrentTime] = useState(new Date());
  const [liveDuration, setLiveDuration] = useState('0m');

  // Monthly Attendance History
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear());
  const [historyMonth, setHistoryMonth] = useState(new Date().getMonth() + 1);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historySummary, setHistorySummary] = useState({});
  const [loadingHistory, setLoadingHistory] = useState(false);

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
  const [loadingHodRequests, setLoadingHodRequests] = useState(false);
  const [hodStatusFilter, setHodStatusFilter] = useState('PENDING'); // 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'
  const [hodSearchQuery, setHodSearchQuery] = useState('');
  const [actionModal, setActionModal] = useState(null); // { type: 'APPROVE' | 'REJECT', request: obj }
  const [actionRemarks, setActionRemarks] = useState('');
  const [processingAction, setProcessingAction] = useState(false);

  // Team Master Attendance State
  const [teamMasterDate, setTeamMasterDate] = useState(getTodayDateString());
  const [teamMasterDepartment, setTeamMasterDepartment] = useState('All');
  const [teamMasterData, setTeamMasterData] = useState({ records: [], summary: {} });
  const [loadingTeamMaster, setLoadingTeamMaster] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');

  // 1. Live Clock Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Dynamic Working Duration Calculation
  useEffect(() => {
    if (todayRecord?.in_time && !todayRecord?.out_time) {
      const inTimeMs = new Date(todayRecord.in_time).getTime();
      const diffMs = currentTime.getTime() - inTimeMs;
      if (diffMs > 0) {
        const totalMinutes = Math.floor(diffMs / (1000 * 60));
        setLiveDuration(formatMinutesToHours(totalMinutes));
      }
    } else if (todayRecord?.in_time && todayRecord?.out_time) {
      setLiveDuration(formatMinutesToHours(todayRecord.total_working_minutes || 0));
    } else {
      setLiveDuration('0m');
    }
  }, [currentTime, todayRecord]);

  // 3. Load Today's Attendance
  const fetchTodayAttendance = async () => {
    if (!userEmail) return;
    setLoadingToday(true);
    try {
      const res = await getTodayAttendance(userEmail, userId);
      if (res.success) {
        setTodayRecord(res.data);
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
    if (activeTab === 'hod_approvals') {
      fetchHodRequests();
    } else if (activeTab === 'team_report') {
      fetchTeamMaster();
    }
  }, [activeTab, hodStatusFilter, teamMasterDate, teamMasterDepartment]);

  // Handle Punch In
  const handlePunchIn = async () => {
    setPunchError(null);
    setPunchMessage(null);
    setPunchingIn(true);
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
        setTodayRecord(res.data);
        fetchHistory(); // Refresh monthly history
      } else {
        setPunchError(res.error);
      }
    } catch (err) {
      setPunchError(err.message);
    } finally {
      setPunchingIn(false);
    }
  };

  // Handle Punch Out
  const handlePunchOut = async () => {
    setPunchError(null);
    setPunchMessage(null);
    setPunchingOut(true);
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
        setTodayRecord(res.data);
        fetchHistory(); // Refresh monthly history
      } else {
        setPunchError(res.error);
      }
    } catch (err) {
      setPunchError(err.message);
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

  // Filter Team Master Records
  const filteredTeamRecords = useMemo(() => {
    return (teamMasterData.records || []).filter(r => {
      if (!teamSearchQuery) return true;
      const q = teamSearchQuery.toLowerCase();
      return (
        r.emp_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q) ||
        r.status?.toLowerCase().includes(q)
      );
    });
  }, [teamMasterData.records, teamSearchQuery]);

  // Export Team Attendance to CSV
  const handleExportCSV = () => {
    if (!teamMasterData.records || teamMasterData.records.length === 0) return;
    const headers = ['Employee Name', 'Email', 'Department', 'Date', 'In Time', 'Out Time', 'Duration', 'Status', 'Regularized', 'Remarks'];
    const rows = teamMasterData.records.map(r => [
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
    link.setAttribute('download', `Attendance_Report_${teamMasterDate}.csv`);
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

  return (
    <div style={{ padding: '1.25rem', maxWidth: '1440px', margin: '0 auto', width: '100%', color: 'var(--text-primary)' }}>
      
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-surface)', padding: '0.3rem', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
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
            <Clock size={15} /> My Attendance & Punch
          </button>

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

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <Laptop size={14} /> Web Terminal Verified • 1 Punch In / 1 Punch Out Policy
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Today's Punch Status</span>
                {renderStatusBadge(todayRecord?.status || (todayRecord?.in_time ? 'WORKING' : 'NOT PUNCHED'), todayRecord?.is_regularized)}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                
                {/* 1. Punch In Button */}
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
                      ? '#f0fdf4'
                      : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                    color: todayRecord?.in_time ? '#166534' : '#ffffff',
                    cursor: todayRecord?.in_time ? 'not-allowed' : 'pointer',
                    boxShadow: todayRecord?.in_time ? 'none' : '0 4px 12px rgba(22, 163, 74, 0.3)',
                    transition: 'all 0.2s',
                    opacity: punchingIn ? 0.7 : 1,
                    border: todayRecord?.in_time ? '1px solid #bbf7d0' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.95rem' }}>
                    <CheckCircle2 size={18} />
                    {todayRecord?.in_time ? 'Punched In' : (punchingIn ? 'Punching...' : 'Punch In')}
                  </div>
                  <span style={{ fontSize: '0.75rem', marginTop: '0.2rem', opacity: 0.9 }}>
                    {todayRecord?.in_time
                      ? new Date(todayRecord.in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                      : 'Strict 1-Time / Day'}
                  </span>
                </button>

                {/* 2. Punch Out Button */}
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
                      ? '#fef2f2'
                      : (!todayRecord?.in_time
                        ? 'var(--border-light)'
                        : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'),
                    color: todayRecord?.out_time ? '#991b1b' : (!todayRecord?.in_time ? 'var(--text-secondary)' : '#ffffff'),
                    cursor: (!todayRecord?.in_time || todayRecord?.out_time) ? 'not-allowed' : 'pointer',
                    boxShadow: (todayRecord?.in_time && !todayRecord?.out_time) ? '0 4px 12px rgba(220, 38, 38, 0.3)' : 'none',
                    transition: 'all 0.2s',
                    opacity: punchingOut ? 0.7 : 1,
                    border: todayRecord?.out_time ? '1px solid #fecaca' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.95rem' }}>
                    <XCircle size={18} />
                    {todayRecord?.out_time ? 'Punched Out' : (punchingOut ? 'Punching...' : 'Punch Out')}
                  </div>
                  <span style={{ fontSize: '0.75rem', marginTop: '0.2rem', opacity: 0.9 }}>
                    {todayRecord?.out_time
                      ? new Date(todayRecord.out_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                      : (!todayRecord?.in_time ? 'Punch In Required' : 'End Day')}
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
              
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--accent-color)' }}>
                  {liveDuration}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {todayRecord?.out_time ? '(Final Logged)' : (todayRecord?.in_time ? '(Active Session)' : '(Not Started)')}
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
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1.25rem'
            }}>
              <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>DAYS PRESENT</span>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#16a34a' }}>{historySummary.totalPresent || 0}</span>
              </div>
              <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>LATE IN</span>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#d97706' }}>{historySummary.totalLate || 0}</span>
              </div>
              <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>HALF DAYS</span>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ea580c' }}>{historySummary.totalHalfDay || 0}</span>
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
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Method / Notes</th>
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
                            {renderStatusBadge(r.status, r.is_regularized)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.is_regularized ? (
                              <span title={r.remarks} style={{ color: '#4f46e5' }}>Regularized by HOD</span>
                            ) : (
                              r.in_method || 'WEB_PUNCH'
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

            {/* Status Tabs / Filters */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Search employee or date..."
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
                    width: '220px'
                  }}
                />
              </div>

              <select
                value={hodStatusFilter}
                onChange={(e) => setHodStatusFilter(e.target.value)}
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
              >
                <option value="PENDING">Pending Approval ({hodPendingCount})</option>
                <option value="APPROVED">Approved History</option>
                <option value="REJECTED">Rejected</option>
                <option value="ALL">All Requests</option>
              </select>

              <button
                type="button"
                onClick={fetchHodRequests}
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
                <RefreshCw size={14} className={loadingHodRequests ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          {/* Pending Requests Cards / Table */}
          <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
            <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Employee</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Date of Missing Punch</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Missing Type</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Proposed In / Out Times</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Reason & Explanation</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>HOD Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHodRequests.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No regularization requests matching current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredHodRequests.map((r, idx) => {
                      const reqInFormatted = r.requested_in_time ? new Date(r.requested_in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
                      const reqOutFormatted = r.requested_out_time ? new Date(r.requested_out_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

                      return (
                        <tr key={r.id || idx} style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--table-alt-row, rgba(0,0,0,0.01))' }}>
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
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.55rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>
                                <Clock size={12} /> Pending Review
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
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                            {r.status === 'PENDING' ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                                <button
                                  type="button"
                                  onClick={() => setActionModal({ type: 'APPROVE', request: r })}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.35rem 0.65rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: '#16a34a',
                                    color: '#ffffff',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                  }}
                                  title="Approve & Update that day's attendance"
                                >
                                  <Check size={14} /> Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActionModal({ type: 'REJECT', request: r })}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.35rem 0.65rem',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-light)',
                                    background: 'var(--bg-primary)',
                                    color: '#dc2626',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                  }}
                                >
                                  <X size={14} /> Reject
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {r.action_by_name || 'HOD'} on {new Date(r.action_at || r.updated_at).toLocaleDateString()}
                              </span>
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
          
          {/* Master Filter Bar */}
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
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Team Daily Attendance Report</h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                Live daily punch log and present/absent summary for all team members
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Search team member..."
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
                    width: '180px'
                  }}
                />
              </div>

              {/* Date picker */}
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

              <button
                type="button"
                onClick={fetchTeamMaster}
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
                <RefreshCw size={14} className={loadingTeamMaster ? 'animate-spin' : ''} /> Refresh
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
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
                <Download size={14} /> Export CSV
              </button>
            </div>
          </div>

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
                      <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No records found for date {teamMasterDate}.
                      </td>
                    </tr>
                  ) : (
                    filteredTeamRecords.map((r, idx) => (
                      <tr key={r.id || idx} style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--table-alt-row, rgba(0,0,0,0.01))' }}>
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
                          {renderStatusBadge(r.status, r.is_regularized)}
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

    </div>
  );
}
