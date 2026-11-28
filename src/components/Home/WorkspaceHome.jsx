'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Sparkles, Clock, CheckSquare, Users, PhoneCall, Truck, 
  AlertTriangle, UserPlus, Navigation, Sliders, ChevronRight,
  ArrowUpRight, ShieldCheck, Calendar, Activity, Zap, Loader2,
  Check, Plus, AlertCircle, ShoppingCart, FileText
} from 'lucide-react';
import CustomizeHomeModal from './CustomizeHomeModal';
import InstantOrderModal from './modals/InstantOrderModal';
import InstantComplaintModal from './modals/InstantComplaintModal';
import LeadFormModal from '@/components/LeadFormModal';
import InstantDelegationModal from './modals/InstantDelegationModal';
import InstantMissingPunchModal from './modals/InstantMissingPunchModal';
import InstantLeaveModal from './modals/InstantLeaveModal';
import QuickTaskModal from '@/components/TaskPlanner/QuickTaskModal';
import { createTaskPlannerItem } from '@/app/actions/taskPlanner';
import { AVAILABLE_WIDGETS, getPermittedWidgets } from './homeWidgetsConfig';
import { getTodayAttendance, punchIn, punchOut } from '@/app/actions/attendance';
import { canPerformOfflineAction, enqueueOfflineAction, showSyncToast } from '@/utils/offlineSync';

function isOfflineNetworkError(err) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg = String(err?.message || '');
  if (msg.includes('Failed to find Server Action') || msg.includes('older or newer deployment')) return false;
  return err?.name === 'TypeError' || /failed to fetch|network\s*error|load\s*failed|fetch failed|network request failed/i.test(msg);
}

// Helper to format ISO strings, UTC times, or raw time values to clean IST 12-hour format (e.g. 10:52 PM)
function formatISTDisplayTime(timeVal) {
  if (!timeVal) return '';
  const str = String(timeVal).trim();
  // If already formatted like "10:52 PM" or "10:52 AM", return clean
  if (/^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)$/i.test(str)) {
    return str.replace(/:\d{2}\s*(AM|PM)/i, ' $1');
  }
  // If ISO string or valid date string (e.g. 2026-11-22T17:22:00.513+00:00)
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    }
  } catch (_e) {}
  // If "17:22" or "17:22:00" (24h time without date)
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
    const parts = str.split(':');
    const h = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }
  return str;
}

const ALL_ORDER_PIPELINE_STAGES = [
  { id: 'S01', label: 'S01 - Order Confirmation' },
  { id: 'S02', label: 'S02 - PI Generation' },
  { id: 'S03', label: 'S03 - PI Shared' },
  { id: 'S04', label: 'S04 - Request Advance' },
  { id: 'S05', label: 'S05 - Receive Advance' },
  { id: 'S06', label: 'S06 - Stock & Production' },
  { id: 'S07', label: 'S07 - Product Status' },
  { id: 'S08', label: 'S08 - Quality Check' },
  { id: 'S09', label: 'S09 - Request Balance' },
  { id: 'S10', label: 'S10 - Receive Balance' },
  { id: 'S11', label: 'S11 - Ready for Dispatch' },
  { id: 'S12', label: 'S12 - Dispatch Material' },
  { id: 'S13', label: 'S13 - Delivered' }
];

const ALL_LEAD_DATA_STAGES = [
  { id: '01', fullStage: '01 - New Stage', label: '01 - New' },
  { id: '02', fullStage: '02 - Contact Stage', label: '02 - Contact' },
  { id: '03', fullStage: '03 - Qualification Stage', label: '03 - Qual' },
  { id: '04', fullStage: '04 - Follow Up Stage', label: '04 - Follow Up' },
  { id: '05', fullStage: '05 - Sales Process Stage', label: '05 - Process' },
  { id: '06', fullStage: '06 - Conversion Stage', label: '06 - Conversion' },
  { id: '07', fullStage: '07 - Final Stage', label: '07 - Final' },
  { id: '08', fullStage: '08 - Transfer to Party', label: '08 - Party' }
];

const ALL_COMPLAINT_STAGES = [
  { id: 'C01', label: 'C01 - Logged' },
  { id: 'C02', label: 'C02 - RCA' },
  { id: 'C03', label: 'C03 - Deputed' },
  { id: 'C04', label: 'C04 - Job Card' },
  { id: 'C05', label: 'C05 - OTP' },
  { id: 'C06', label: 'C06 - Closed' }
];

const ALL_RECRUITER_STAGES = [
  { id: 'S00', label: 'S00 - Requirements Received' },
  { id: 'S01', label: 'S01 - JDs Prepared & Posted' },
  { id: 'S02', label: 'S02 - Resume Filtered' },
  { id: 'S03', label: 'S03 - Interview Executed' },
  { id: 'S04', label: 'S04 - Test Results' },
  { id: 'S05', label: 'S05 - Final Confirmation' },
  { id: 'S06', label: 'S06 - Salary Negotiation' },
  { id: 'S07', label: 'S07 - Shortlisted' },
  { id: 'S08', label: 'S08 - LOI Released' },
  { id: 'S09', label: 'S09 - Joined' },
  { id: 'S10', label: 'S10 - Document Collection' },
  { id: 'S11', label: 'S11 - Emp ID & Mapping' },
  { id: 'S12', label: 'S12 - Working Rating' }
];

export default function WorkspaceHome({
  userName = 'Employee',
  userRole = 'User',
  userId = 'default',
  userEmail = '',
  moduleAccess = {},
  tenantId = '',
  tenantName = '',
  userCompany = '',
  teamMembers = [],
  onNavigate = () => {}
}) {
  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isComplaintModalOpen, setIsComplaintModalOpen] = useState(false);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isDelegationModalOpen, setIsDelegationModalOpen] = useState(false);
  const [isMissingPunchModalOpen, setIsMissingPunchModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isTaskPlannerModalOpen, setIsTaskPlannerModalOpen] = useState(false);

  // Attendance live status
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [punching, setPunching] = useState(false);
  const [punchNotice, setPunchNotice] = useState(null);

  const permittedWidgets = useMemo(() => {
    return getPermittedWidgets(moduleAccess, userRole);
  }, [moduleAccess, userRole]);

  // Load user-customized widgets, defaulting to ALL permitted widgets automatically
  const [enabledWidgetIds, setEnabledWidgetIds] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(`spc_user_home_widgets_${userId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const permittedIds = permittedWidgets.map(w => w.id);
            const valid = parsed.filter(id => permittedIds.includes(id));
            if (valid.length > 0) {
              return valid;
            }
          }
        }
      }
    } catch (_e) {}
    // Default: All permitted widgets for this user are automatically enabled
    return permittedWidgets.map(w => w.id);
  });

  // Automatically include newly permitted widgets whenever user permissions or role changes
  useEffect(() => {
    setEnabledWidgetIds(prev => {
      const permittedIds = permittedWidgets.map(w => w.id);
      const updated = Array.from(new Set([...prev.filter(id => permittedIds.includes(id)), ...permittedIds]));
      return updated.length > 0 ? updated : permittedIds;
    });
  }, [permittedWidgets]);

  // Load today's attendance record
  const loadTodayAttendance = useCallback(async () => {
    if (!userEmail) return;
    try {
      const normEmail = userEmail.trim().toLowerCase();
      const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      let localCached = null;

      // 1. Try local cache first for 0ms initial render
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(`att_today_record_${tenantId}_${normEmail}_${todayDate}`) ||
                       localStorage.getItem(`att_today_record_${normEmail}_${todayDate}`) ||
                       localStorage.getItem(`att_today_record_${tenantId}_${normEmail}`) ||
                       localStorage.getItem(`att_today_record_${normEmail}`);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (!parsed?.attendance_date || parsed.attendance_date === todayDate) {
              localCached = parsed;
              setTodayAttendance(parsed);
            }
          } catch (_e) {}
        }
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setLoadingAttendance(false);
        return;
      }

      setLoadingAttendance(true);
      const res = await getTodayAttendance(userEmail, userId, tenantId, userCompany);
      if (res?.data) {
        const awaitingSync = (localCached?._offlinePending === 'IN' && !res.data?.in_time) ||
          (localCached?._offlinePending === 'OUT' && !res.data?.out_time);
        const finalRec = awaitingSync ? localCached : res.data;
        setTodayAttendance(finalRec);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(`att_today_record_${tenantId}_${normEmail}_${todayDate}`, JSON.stringify(finalRec));
          } catch {}
        }
      } else if (res && !res.error && (res.in_time || res.punch_in_time || res.id)) {
        setTodayAttendance(res);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(`att_today_record_${tenantId}_${normEmail}_${todayDate}`, JSON.stringify(res));
          } catch {}
        }
      } else if (res?.success && !res.data && localCached?._offlinePending) {
        setTodayAttendance(localCached);
      }
    } catch (err) {
      console.warn('WorkspaceHome attendance fetch warning:', err);
    } finally {
      setLoadingAttendance(false);
    }
  }, [userEmail, userId, tenantId, userCompany]);

  useEffect(() => {
    loadTodayAttendance();
    const handleSync = () => { loadTodayAttendance(); };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleSync);
      window.addEventListener('storage', handleSync);
      window.addEventListener('attendance_updated', handleSync);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleSync);
        window.removeEventListener('storage', handleSync);
        window.removeEventListener('attendance_updated', handleSync);
      }
    };
  }, [loadTodayAttendance]);

  // Direct Punch In / Out Action (with full Offline Sync Center fallback)
  const handleDirectPunch = async (type = 'IN') => {
    if (!userEmail || punching) return;
    setPunching(true);
    setPunchNotice(null);

    const saveHomeOfflinePunch = async () => {
      const check = canPerformOfflineAction('attendancePunch');
      if (!check.allowed) {
        setPunchNotice({ type: 'error', message: check.reason });
        showSyncToast(check.reason, 'error', 6000);
        return false;
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
      const normEmail = userEmail.trim().toLowerCase();
      const isOut = type === 'OUT';

      if (isOut && !todayAttendance?.in_time) {
        setPunchNotice({ type: 'error', message: 'Punch In record missing for Punch Out.' });
        return false;
      }

      const totalMinutes = isOut && todayAttendance?.in_time
        ? Math.max(0, Math.round((now.getTime() - new Date(todayAttendance.in_time).getTime()) / 60000))
        : 0;

      const offlinePayload = {
        email: normEmail,
        userId,
        empName: userName,
        tenant_id: tenantId,
        attendance_date: todayDate,
        ...(isOut
          ? {
              out_time: nowIso,
              out_location: 'Home Workspace Quick Punch',
              out_method: 'WEB_PUNCH',
              total_working_minutes: totalMinutes
            }
          : {
              in_time: nowIso,
              in_location: 'Home Workspace Quick Punch',
              in_method: 'WEB_PUNCH'
            }),
        status: todayAttendance?.status || 'PRESENT',
        remarks: todayAttendance?.remarks || 'Home Workspace Quick Punch (Offline)'
      };

      const queued = await enqueueOfflineAction('create', 'attendance', offlinePayload);
      if (!queued) {
        setPunchNotice({ type: 'error', message: 'Offline storage could not confirm this punch. Please retry.' });
        return false;
      }

      const localRecord = {
        ...(todayAttendance || {}),
        id: todayAttendance?.id || `temp-${Date.now()}`,
        tenant_id: tenantId,
        emp_name: userName,
        email: normEmail,
        attendance_date: todayDate,
        in_time: isOut ? todayAttendance.in_time : nowIso,
        out_time: isOut ? nowIso : null,
        total_working_minutes: isOut ? totalMinutes : 0,
        status: offlinePayload.status,
        remarks: offlinePayload.remarks,
        _offlinePending: type
      };

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`att_today_record_${tenantId}_${normEmail}_${todayDate}`, JSON.stringify(localRecord));
          window.dispatchEvent(new CustomEvent('attendance_updated'));
          window.dispatchEvent(new CustomEvent('crm_attendance_changed', { detail: { type, record: localRecord } }));
        } catch {}
      }
      setTodayAttendance(localRecord);

      const timeNow = now.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      setPunchNotice({
        type: 'success',
        message: `⚡ Offline Punch ${type.toLowerCase()} saved at ${timeNow}! Sync pending in Offline Sync Center.`
      });
      showSyncToast(`⚡ Offline Punch-${isOut ? 'Out' : 'In'} saved in Offline Sync Center & auto-syncing!`, 'info', 4500);
      return true;
    };

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await saveHomeOfflinePunch();
        return;
      }

      const punchFn = type === 'IN' ? punchIn : punchOut;
      const res = await punchFn({
        email: userEmail,
        userId,
        empName: userName,
        userCompany,
        method: 'WEB_PUNCH',
        tenantId,
        location: 'Home Workspace Quick Punch'
      });

      if (res?.success) {
        const timeNow = new Date().toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        setPunchNotice({
          type: 'success',
          message: `✓ Punched ${type.toLowerCase()} successfully at ${timeNow}!`
        });
        if (typeof window !== 'undefined') {
          try {
            window.dispatchEvent(new CustomEvent('attendance_updated'));
            window.dispatchEvent(new CustomEvent('crm_attendance_changed', { detail: { type, record: res.data || null } }));
          } catch {}
        }
        await loadTodayAttendance();
      } else {
        setPunchNotice({
          type: 'error',
          message: res?.error || `Failed to punch ${type.toLowerCase()}`
        });
      }
    } catch (err) {
      if (isOfflineNetworkError(err)) {
        await saveHomeOfflinePunch();
      } else {
        setPunchNotice({
          type: 'error',
          message: err.message || 'Error executing punch'
        });
      }
    } finally {
      setPunching(false);
      setTimeout(() => {
        setPunchNotice(null);
      }, 5000);
    }
  };

  // Current IST Date/Time
  const [istTimeStr, setIstTimeStr] = useState('');
  useEffect(() => {
    const updateTime = () => {
      try {
        const now = new Date();
        const datePart = now.toLocaleDateString('en-IN', {
          timeZone: 'Asia/Kolkata',
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
        const timePart = now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        setIstTimeStr(`${datePart} • ${timePart} IST`);
      } catch (_e) {}
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const visibleWidgets = useMemo(() => {
    return permittedWidgets.filter(w => enabledWidgetIds.includes(w.id));
  }, [permittedWidgets, enabledWidgetIds]);

  const rLower = String(userRole || '').trim().toLowerCase();
  const isAdmin = rLower === 'admin' || rLower === 'superadmin' || rLower === 'masteradmin' || rLower === 'super_admin' || rLower === 'master_admin';
  const canAddLead = isAdmin || moduleAccess?.['registration']?.view === true;
  const canLeads = isAdmin || moduleAccess?.['leads']?.view === true || moduleAccess?.['registration']?.view === true;
  const canCall = isAdmin || moduleAccess?.['callcenter']?.view === true;
  const canAttendance = isAdmin || moduleAccess?.['attendance']?.view !== false;
  const canChecklist = isAdmin || moduleAccess?.['checklist']?.view !== false;
  const canDelegation = isAdmin || moduleAccess?.['delegation']?.view !== false;
  const canPipeline = isAdmin || moduleAccess?.['channel_ops']?.view === true || moduleAccess?.['party']?.view === true || moduleAccess?.['orders']?.view === true;
  const canFieldForce = isAdmin || moduleAccess?.['field_force']?.view === true;
  const canRecruiter = isAdmin || moduleAccess?.['recruiter']?.view === true;
  const canTaskPlanner = isAdmin || moduleAccess?.['task_planner']?.view !== false;

  // Permitted Stages as per access
  const permittedOrderStages = useMemo(() => {
    if (isAdmin) return ALL_ORDER_PIPELINE_STAGES;
    const subs = moduleAccess?.channel_ops?.sub_items || moduleAccess?.party?.sub_items;
    if (!subs || Object.keys(subs).length === 0) return ALL_ORDER_PIPELINE_STAGES;
    const filtered = ALL_ORDER_PIPELINE_STAGES.filter(stg => {
      const lower = stg.id.toLowerCase();
      return subs[lower]?.view !== false && subs[stg.id]?.view !== false;
    });
    return filtered.length > 0 ? filtered : ALL_ORDER_PIPELINE_STAGES;
  }, [isAdmin, moduleAccess]);

  const permittedLeadStages = useMemo(() => {
    if (isAdmin) return ALL_LEAD_DATA_STAGES;
    const leadsAccess = moduleAccess?.leads || {};
    const assignedSteps = leadsAccess.assigned_steps && leadsAccess.assigned_steps.length > 0 
      ? leadsAccess.assigned_steps 
      : Object.keys(leadsAccess.sub_items || {}).filter(k => k !== 'lead_dashboard' && k !== 'hourly_work' && leadsAccess.sub_items[k]?.view === true);
    
    if (assignedSteps.length > 0) {
      const filtered = ALL_LEAD_DATA_STAGES.filter(stg => {
        return assignedSteps.some(step => 
          step.includes(stg.id) || step.toLowerCase().includes(stg.label.toLowerCase()) || step === stg.fullStage
        );
      });
      return filtered.length > 0 ? filtered : ALL_LEAD_DATA_STAGES;
    }
    return ALL_LEAD_DATA_STAGES;
  }, [isAdmin, moduleAccess]);

  const permittedComplaintStages = useMemo(() => {
    if (isAdmin) return ALL_COMPLAINT_STAGES;
    const subs = moduleAccess?.channel_ops?.sub_items || moduleAccess?.party?.sub_items;
    if (!subs || Object.keys(subs).length === 0) return ALL_COMPLAINT_STAGES;
    const filtered = ALL_COMPLAINT_STAGES.filter(stg => {
      const lower = stg.id.toLowerCase();
      return subs[lower]?.view !== false && subs[stg.id]?.view !== false;
    });
    return filtered.length > 0 ? filtered : ALL_COMPLAINT_STAGES;
  }, [isAdmin, moduleAccess]);

  const permittedRecruiterStages = useMemo(() => {
    if (isAdmin) return ALL_RECRUITER_STAGES;
    const recAccess = moduleAccess?.recruiter || {};
    const allowed = recAccess.assigned_steps;
    if (Array.isArray(allowed) && allowed.length > 0) {
      const filtered = ALL_RECRUITER_STAGES.filter(stg => allowed.includes(stg.id));
      return filtered.length > 0 ? filtered : ALL_RECRUITER_STAGES;
    }
    return ALL_RECRUITER_STAGES;
  }, [isAdmin, moduleAccess]);

  const isWidgetVisible = (widgetId) => visibleWidgets.some(w => w.id === widgetId);

  const rawIn = todayAttendance?.in_time || todayAttendance?.punch_in_time || todayAttendance?.first_in;
  const rawOut = todayAttendance?.out_time || todayAttendance?.punch_out_time || todayAttendance?.last_out;
  const attInTime = formatISTDisplayTime(rawIn);
  const attOutTime = formatISTDisplayTime(rawOut);

  // Multi-punch privilege — same 3-path check as AttendanceModule (Punch Station)
  const allowMultiPunch = Boolean(
    moduleAccess?.allow_multi_punch ||
    moduleAccess?.attendance?.allow_multi_punch ||
    moduleAccess?.powers?.allow_multi_punch
  );
  // After punch-out: multi-punch user can re-punch in; single-punch user is done
  const isShiftDone = Boolean(attOutTime && !allowMultiPunch);
  const canRePunchIn = Boolean(attOutTime && allowMultiPunch);

  return (
    <div className="spc-workspace-home" style={{
      padding: '1rem 1.25rem',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem',
      color: 'var(--text-primary, #0f172a)'
    }}>
      {/* 1. Header Greeting & Status Bar */}
      <div className="spc-home-greeting" style={{
        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(99, 102, 241, 0.08) 50%, rgba(168, 85, 247, 0.05) 100%)',
        border: '1px solid rgba(99, 102, 241, 0.18)',
        borderRadius: '16px',
        padding: '1.5rem 1.75rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1.25rem',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.65rem' }}>👋</span>
            <h1 className="spc-home-title" style={{
              fontSize: '1.55rem',
              fontWeight: 800,
              margin: 0,
              letterSpacing: '-0.02em',
              color: 'var(--spc-home-text)'
            }}>
              Namaste, {userName || 'Colleague'}!
            </h1>
          </div>
          <div className="spc-home-meta" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginTop: '0.45rem', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 500 }}>
              <Clock className="spc-home-accent-icon" size={15} color="#3b82f6" />
              {istTimeStr || 'IST'}
            </span>
            <span>•</span>
            <span className="spc-home-role" style={{
              fontWeight: 650,
              color: 'var(--spc-home-violet, var(--accent-color, #4f46e5))',
              background: 'color-mix(in srgb, #4f46e5 14%, var(--bg-surface, #ffffff))',
              border: '1px solid color-mix(in srgb, #4f46e5 28%, transparent)',
              padding: '2px 8px',
              borderRadius: '999px',
              fontSize: '0.75rem'
            }}>
              {userRole?.toUpperCase() || 'EMPLOYEE'}
            </span>
            {userCompany && (
              <>
                <span>•</span>
                <span style={{ fontWeight: 600 }}>{userCompany}</span>
              </>
            )}
          </div>
        </div>

        {/* Customize Home Trigger */}
        <button
          type="button"
          onClick={() => setIsCustomizeModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.15rem',
            borderRadius: '10px',
            background: 'var(--bg-surface, #ffffff)',
            border: '1px solid var(--border-light, #cbd5e1)',
            color: 'var(--text-primary, #1e293b)',
            fontWeight: 700,
            fontSize: '0.86rem',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
            transition: 'all 0.15s ease'
          }}
        >
          <Sliders className="spc-home-accent-icon" size={16} color="#3b82f6" />
          <span>Customize Dashboard</span>
        </button>
      </div>

      {/* 2. Unified Quick Panels: Instant Action (Popups) + Instant Page (Direct Jump) */}
      <div className="spc-home-quick" style={{
        background: 'var(--bg-surface, #ffffff)',
        border: '1px solid var(--border-light, #e2e8f0)',
        borderRadius: '16px',
        padding: '1.1rem 1.35rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        boxShadow: '0 2px 6px -1px rgba(0, 0, 0, 0.03)'
      }}>
        {/* Tier 1: ⚡ Instant Action (Direct Modals / Popups) */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.55rem'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            marginRight: '0.4rem',
            fontSize: '0.82rem',
            fontWeight: 750,
            color: 'var(--spc-home-text)',
            whiteSpace: 'nowrap'
          }}>
            <Zap className="spc-home-accent-icon" size={16} color="#f59e0b" />
            <span>Instant Action Creation:</span>
          </div>

          {/* Instant Lead */}
          {canAddLead && (
            <button
              type="button"
              onClick={() => setIsLeadModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.42rem 0.8rem',
                borderRadius: '8px',
                backgroundColor: '#8b5cf615',
                border: '1px solid #8b5cf640',
                color: 'color-mix(in srgb, #7c3aed 40%, var(--spc-home-text))',
                fontWeight: 650,
                fontSize: '0.81rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <UserPlus size={13} />
              <span>+ Instant Lead</span>
            </button>
          )}

          {/* Instant Order */}
          {canPipeline && (
            <button
              type="button"
              onClick={() => setIsOrderModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.42rem 0.8rem',
                borderRadius: '8px',
                backgroundColor: '#2563eb15',
                border: '1px solid #2563eb40',
                color: 'color-mix(in srgb, #1d4ed8 40%, var(--spc-home-text))',
                fontWeight: 650,
                fontSize: '0.81rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Truck size={13} />
              <span>+ Instant Order</span>
            </button>
          )}

          {/* Instant Complaint */}
          {canPipeline && (
            <button
              type="button"
              onClick={() => setIsComplaintModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.42rem 0.8rem',
                borderRadius: '8px',
                backgroundColor: '#ef444415',
                border: '1px solid #ef444440',
                color: 'color-mix(in srgb, #dc2626 40%, var(--spc-home-text))',
                fontWeight: 650,
                fontSize: '0.81rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <AlertTriangle size={13} />
              <span>+ Instant Complaint</span>
            </button>
          )}

          {/* Instant Delegation Task */}
          {canDelegation && (
            <button
              type="button"
              onClick={() => setIsDelegationModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.42rem 0.8rem',
                borderRadius: '8px',
                backgroundColor: '#0284c715',
                border: '1px solid #0284c740',
                color: 'color-mix(in srgb, #0369a1 40%, var(--spc-home-text))',
                fontWeight: 650,
                fontSize: '0.81rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Users size={13} />
              <span>+ Assign Task</span>
            </button>
          )}

          {/* Instant Task Planner (Schedule New Daily Task) */}
          {canTaskPlanner && (
            <button
              type="button"
              onClick={() => setIsTaskPlannerModalOpen(true)}
              title="Schedule New Daily Task"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.42rem 0.8rem',
                borderRadius: '8px',
                backgroundColor: '#6366f115',
                border: '1px solid #6366f140',
                color: 'color-mix(in srgb, #4f46e5 40%, var(--spc-home-text))',
                fontWeight: 650,
                fontSize: '0.81rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Calendar size={13} />
              <span>+ Task Planner</span>
            </button>
          )}

          {/* Instant Apply Leave */}
          {canAttendance && (
            <button
              type="button"
              onClick={() => setIsLeaveModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.42rem 0.8rem',
                borderRadius: '8px',
                backgroundColor: '#10b98115',
                border: '1px solid #10b98140',
                color: 'color-mix(in srgb, #047857 40%, var(--spc-home-text))',
                fontWeight: 650,
                fontSize: '0.81rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Calendar size={13} />
              <span>+ Apply Leave</span>
            </button>
          )}

          {/* Instant Missing Punch */}
          {canAttendance && (
            <button
              type="button"
              onClick={() => setIsMissingPunchModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.42rem 0.8rem',
                borderRadius: '8px',
                backgroundColor: '#f9731615',
                border: '1px solid #f9731640',
                color: 'color-mix(in srgb, #c2410c 40%, var(--spc-home-text))',
                fontWeight: 650,
                fontSize: '0.81rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <FileText size={13} />
              <span>+ Missing Punch</span>
            </button>
          )}
        </div>

        {/* Subtle Divider */}
        <div className="spc-home-quick-divider" style={{ height: '1px', background: 'var(--border-light, #f1f5f9)' }} />

        {/* Tier 2: 🚀 Instant Page (1-Click Direct Page Links) */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.55rem'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            marginRight: '0.4rem',
            fontSize: '0.82rem',
            fontWeight: 750,
            color: 'var(--spc-home-text)',
            minWidth: '125px'
          }}>
            <Navigation className="spc-home-accent-icon" size={15} color="#2563eb" />
            <span>Instant Page:</span>
          </div>

          {/* Lead Data Page */}
          {canLeads && (
            <button
              type="button"
              onClick={() => onNavigate('leads')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.42rem 0.75rem',
                borderRadius: '8px',
                backgroundColor: 'var(--spc-home-control-surface)',
                border: '1px solid var(--border-light, #cbd5e1)',
                color: 'var(--spc-home-text)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Activity size={13} style={{ flexShrink: 0, color: 'var(--spc-home-violet, #4f46e5)' }} />
              <span>Lead Data</span>
              <ArrowUpRight size={12} color="var(--spc-home-muted)" />
            </button>
          )}

          {/* Order Pipeline Page */}
          {canPipeline && (
            <button
              type="button"
              onClick={() => onNavigate('channel_ops')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.42rem 0.75rem',
                borderRadius: '8px',
                backgroundColor: 'var(--spc-home-control-surface)',
                border: '1px solid var(--border-light, #cbd5e1)',
                color: 'var(--spc-home-text)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Truck size={13} style={{ flexShrink: 0, color: 'var(--spc-home-blue, #2563eb)' }} />
              <span>Order Pipeline</span>
              <ArrowUpRight size={12} color="var(--spc-home-muted)" />
            </button>
          )}

          {/* Punch Station Page */}
          {canAttendance && (
            <button
              type="button"
              onClick={() => onNavigate('attendance')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.42rem 0.75rem',
                borderRadius: '8px',
                backgroundColor: 'var(--spc-home-control-surface)',
                border: '1px solid var(--border-light, #cbd5e1)',
                color: 'var(--spc-home-text)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Clock size={13} style={{ flexShrink: 0, color: 'var(--spc-home-warning, #ea580c)' }} />
              <span>Punch Station</span>
              <ArrowUpRight size={12} color="var(--spc-home-muted)" />
            </button>
          )}

          {/* Daily Checklist Page */}
          {canChecklist && (
            <button
              type="button"
              onClick={() => onNavigate('checklist')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.42rem 0.75rem',
                borderRadius: '8px',
                backgroundColor: 'var(--spc-home-control-surface)',
                border: '1px solid var(--border-light, #cbd5e1)',
                color: 'var(--spc-home-text)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <CheckSquare size={13} style={{ flexShrink: 0, color: 'var(--spc-home-success, #16a34a)' }} />
              <span>Daily Checklist</span>
              <ArrowUpRight size={12} color="var(--spc-home-muted)" />
            </button>
          )}

          {/* Task Planner Page */}
          {canTaskPlanner && (
            <button
              type="button"
              onClick={() => onNavigate('task_planner')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.42rem 0.75rem',
                borderRadius: '8px',
                backgroundColor: 'var(--spc-home-control-surface)',
                border: '1px solid var(--border-light, #cbd5e1)',
                color: 'var(--spc-home-text)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Calendar size={13} style={{ flexShrink: 0, color: 'var(--spc-home-violet, #6366f1)' }} />
              <span>Task Planner</span>
              <ArrowUpRight size={12} color="var(--spc-home-muted)" />
            </button>
          )}

          {/* Delegation Desk Page */}
          {canDelegation && (
            <button
              type="button"
              onClick={() => onNavigate('delegation')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.42rem 0.75rem',
                borderRadius: '8px',
                backgroundColor: 'var(--spc-home-control-surface)',
                border: '1px solid var(--border-light, #cbd5e1)',
                color: 'var(--spc-home-text)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Users size={13} style={{ flexShrink: 0, color: 'var(--spc-home-blue, #0284c7)' }} />
              <span>Delegation Desk</span>
              <ArrowUpRight size={12} color="var(--spc-home-muted)" />
            </button>
          )}

          {/* Call Center Desk Page */}
          {canCall && (
            <button
              type="button"
              onClick={() => onNavigate('callcenter')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.42rem 0.75rem',
                borderRadius: '8px',
                backgroundColor: 'var(--spc-home-control-surface)',
                border: '1px solid var(--border-light, #cbd5e1)',
                color: 'var(--spc-home-text)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <PhoneCall size={13} style={{ flexShrink: 0, color: 'var(--spc-home-success, #059669)' }} />
              <span>Call Center Desk</span>
              <ArrowUpRight size={12} color="var(--spc-home-muted)" />
            </button>
          )}

          {/* Field Force Page */}
          {canFieldForce && (
            <button
              type="button"
              onClick={() => onNavigate('field_force')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.42rem 0.75rem',
                borderRadius: '8px',
                backgroundColor: 'var(--spc-home-control-surface)',
                border: '1px solid var(--border-light, #cbd5e1)',
                color: 'var(--spc-home-text)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Navigation size={13} style={{ flexShrink: 0, color: 'var(--spc-home-warning, #ea580c)' }} />
              <span>Field Force</span>
              <ArrowUpRight size={12} color="var(--spc-home-muted)" />
            </button>
          )}

          {/* Recruiter Hub Page */}
          {canRecruiter && (
            <button
              type="button"
              onClick={() => onNavigate('recruiter')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.42rem 0.75rem',
                borderRadius: '8px',
                backgroundColor: 'var(--spc-home-control-surface)',
                border: '1px solid var(--border-light, #cbd5e1)',
                color: 'var(--spc-home-text)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <UserPlus size={13} style={{ flexShrink: 0, color: 'var(--spc-home-pink, #db2777)' }} />
              <span>Recruiter Hub</span>
              <ArrowUpRight size={12} color="var(--spc-home-muted)" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Personalized Widget Cards Grid */}
      <div className="spc-home-widgets" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
        gap: '1.25rem'
      }}>
        {/* Attendance Widget with Direct Punch In / Out */}
        {isWidgetVisible('attendance_card') && (
          <div style={{
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: '14px',
            border: '1px solid #f9731635',
            padding: '1.25rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: 'linear-gradient(135deg, #f9731622, #f9731640)',
                    border: '1px solid #f9731650', color: '#f97316',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Clock size={18} />
                  </div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0 }}>Smart Attendance</h3>
                </div>
                <span style={{ 
                  fontSize: '0.72rem', 
                  fontWeight: 700, 
                  color: attOutTime ? (canRePunchIn ? 'var(--spc-home-violet, #7c3aed)' : 'var(--text-secondary, #475569)') : (attInTime ? 'var(--spc-home-success, #16a34a)' : 'var(--spc-home-warning, #ea580c)'), 
                  background: attOutTime
                    ? (canRePunchIn ? 'color-mix(in srgb, #7c3aed 15%, var(--bg-surface, #ffffff))' : 'var(--bg-primary, #f1f5f9)')
                    : (attInTime ? 'color-mix(in srgb, #16a34a 15%, var(--bg-surface, #ffffff))' : 'color-mix(in srgb, #f97316 15%, var(--bg-surface, #ffffff))'), 
                  padding: '2px 8px', 
                  borderRadius: '999px' 
                }}>
                  {attOutTime ? (canRePunchIn ? 'ON BREAK' : 'COMPLETED') : (attInTime ? 'PUNCHED IN' : 'NOT PUNCHED')}
                </span>
              </div>

              {/* Status Banner */}
              <div style={{
                marginTop: '0.75rem',
                padding: '0.6rem 0.75rem',
                borderRadius: '8px',
                backgroundColor: attOutTime 
                  ? (canRePunchIn ? 'rgba(124, 58, 237, 0.06)' : 'var(--spc-raised, #f8fafc)')
                  : (attInTime ? 'rgba(34, 197, 94, 0.08)' : 'rgba(249, 115, 22, 0.08)'),
                border: attOutTime
                  ? (canRePunchIn ? '1px solid rgba(124, 58, 237, 0.25)' : '1px solid var(--spc-line, #e2e8f0)')
                  : (attInTime ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(249, 115, 22, 0.3)'),
                fontSize: '0.82rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.2rem'
              }}>
                {attInTime ? (
                  <div>
                    <span style={{ fontWeight: 700, color: 'var(--spc-home-success, #15803d)' }}>
                      🟢 In: {attInTime}
                    </span>
                    {attOutTime ? (
                      <span style={{ marginLeft: '8px', fontWeight: 700, color: 'var(--spc-muted, #475569)' }}>
                        • Out: {attOutTime}
                      </span>
                    ) : (
                      <span style={{ marginLeft: '8px', color: 'var(--spc-home-success, #16a34a)', fontSize: '0.78rem' }}>
                        (Active Shift)
                      </span>
                    )}
                    {canRePunchIn && (
                      <div style={{ marginTop: '3px', fontSize: '0.75rem', color: 'var(--spc-home-violet, #7c3aed)', fontWeight: 600 }}>
                        Multi-punch enabled — you can punch in again
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'var(--spc-home-warning, #ea580c)', fontWeight: 650 }}>
                    🔴 You have not punched in today yet.
                  </div>
                )}
                {punchNotice && (
                  <div style={{
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: punchNotice.type === 'success' ? 'var(--spc-home-success, #16a34a)' : 'var(--spc-home-danger, #dc2626)',
                    marginTop: '2px'
                  }}>
                    {punchNotice.message}
                  </div>
                )}
              </div>
            </div>

            {/* Direct Action Buttons */}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              {!attInTime ? (
                /* No punch yet — show Punch In */
                <button
                  type="button"
                  disabled={punching}
                  onClick={() => handleDirectPunch('IN')}
                  style={{
                    flex: 1.2,
                    padding: '0.55rem',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    border: 'none',
                    cursor: punching ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)'
                  }}
                >
                  {punching ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  <span>Direct Punch In</span>
                </button>
              ) : !attOutTime ? (
                /* Punched in, not yet out — show Punch Out */
                <button
                  type="button"
                  disabled={punching}
                  onClick={() => handleDirectPunch('OUT')}
                  style={{
                    flex: 1.2,
                    padding: '0.55rem',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    border: 'none',
                    cursor: punching ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)'
                  }}
                >
                  {punching ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
                  <span>Direct Punch Out</span>
                </button>
              ) : canRePunchIn ? (
                /* Punched out + multi-punch allowed — show Re-Punch In (green) */
                <button
                  type="button"
                  disabled={punching}
                  onClick={() => handleDirectPunch('IN')}
                  style={{
                    flex: 1.2,
                    padding: '0.55rem',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    border: 'none',
                    cursor: punching ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    boxShadow: '0 2px 4px rgba(124, 58, 237, 0.25)'
                  }}
                >
                  {punching ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  <span>Resume Duty</span>
                </button>
              ) : (
                /* Punched out + single-punch — Shift done, grey */
                <div style={{
                  flex: 1.2,
                  padding: '0.55rem',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-primary, #f1f5f9)',
                  color: 'var(--text-secondary, #64748b)',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  fontWeight: 650,
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem'
                }}>
                  <Check size={14} color="#16a34a" />
                  <span>Shift Completed</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onNavigate('attendance')}
                style={{
                  padding: '0.55rem 0.75rem',
                  borderRadius: '8px',
                  background: 'none',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  color: 'var(--text-secondary, #64748b)',
                  fontWeight: 600,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                title="Open Full Punch Station"
              >
                <span>Station</span>
                <ArrowUpRight size={13} />
              </button>
            </div>

            {/* Quick Attendance Requests: Missing Punch & Apply Leave */}
            <div style={{ marginTop: '0.55rem', display: 'flex', gap: '0.45rem' }}>
              <button
                type="button"
                onClick={() => setIsMissingPunchModalOpen(true)}
                style={{
                  flex: 1,
                  padding: '0.42rem 0.65rem',
                  borderRadius: '8px',
                  background: 'color-mix(in srgb, #f97316 12%, var(--bg-surface, #ffffff))',
                  border: '1px solid color-mix(in srgb, #f97316 32%, transparent)',
                  color: 'var(--spc-home-warning, #ea580c)',
                  fontWeight: 650,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem'
                }}
                title="Apply Missing Punch Regularization"
              >
                <FileText size={13} />
                <span>Missing Punch</span>
              </button>
              <button
                type="button"
                onClick={() => setIsLeaveModalOpen(true)}
                style={{
                  flex: 1,
                  padding: '0.42rem 0.65rem',
                  borderRadius: '8px',
                  background: 'color-mix(in srgb, #10b981 12%, var(--bg-surface, #ffffff))',
                  border: '1px solid color-mix(in srgb, #10b981 32%, transparent)',
                  color: 'var(--spc-home-success, #059669)',
                  fontWeight: 650,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem'
                }}
                title="Apply Leave"
              >
                <Calendar size={13} />
                <span>Apply Leave</span>
              </button>
            </div>
          </div>
        )}

        {/* Delegation Tasks Widget */}
        {isWidgetVisible('delegation_tasks_card') && (
          <div style={{
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: '14px',
            border: '1px solid #0ea5e935',
            padding: '1.25rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: 'linear-gradient(135deg, #0ea5e922, #0ea5e940)',
                    border: '1px solid #0ea5e950', color: '#0ea5e9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Users size={18} />
                  </div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0 }}>Delegation Tasks</h3>
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--spc-home-blue, #0284c7)', background: 'color-mix(in srgb, #0284c7 14%, var(--bg-surface, #ffffff))', padding: '2px 8px', borderRadius: '999px' }}>
                  TASKS
                </span>
              </div>
              <p style={{ margin: '0.85rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)' }}>
                View employee-to-employee delegation tasks, pending approvals, and upcoming deadlines.
              </p>
            </div>
            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setIsDelegationModalOpen(true)}
                style={{
                  flex: 1.2,
                  padding: '0.55rem',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  boxShadow: '0 2px 4px rgba(2, 132, 199, 0.2)'
                }}
              >
                <Plus size={14} />
                <span>Assign Task</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('delegation')}
                style={{
                  padding: '0.55rem 0.85rem',
                  borderRadius: '8px',
                  background: 'none',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  color: 'var(--text-secondary, #64748b)',
                  fontWeight: 600,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                title="Open Delegation Tasks Desk"
              >
                <span>Tasks To Me</span>
                <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Order Delivery Pipeline Widget with Instant Punch Action */}
        {isWidgetVisible('order_pipeline_card') && (
          <div style={{
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: '14px',
            border: '1px solid #2563eb35',
            padding: '1.25rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: 'linear-gradient(135deg, #2563eb22, #2563eb40)',
                    border: '1px solid #2563eb50', color: '#2563eb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Truck size={18} />
                  </div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0 }}>Order Pipeline</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('channel_ops', 'order_pipeline', 'ALL')}
                  title="Click to view All Pipeline Stages"
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'var(--spc-home-blue, #2563eb)',
                    background: 'color-mix(in srgb, #2563eb 13%, var(--bg-surface, #ffffff))',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    border: '1px solid color-mix(in srgb, #2563eb 30%, transparent)',
                    cursor: 'pointer'
                  }}
                >
                  S01–S13 ↗
                </button>
              </div>
              <p style={{ margin: '0.85rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)' }}>
                Track order confirmation, PI, balance payments, production status, and POD delivery.
              </p>

              {/* Direct Jump Stage Numbering as per access */}
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Zap size={11} style={{ color: 'var(--accent-color, #4f46e5)' }} />
                  <span>Quick Jump Stage:</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28rem', alignItems: 'center' }}>
                  {permittedOrderStages.map(stg => (
                    <button
                      key={stg.id}
                      type="button"
                      onClick={() => onNavigate('channel_ops', 'order_pipeline', stg.id)}
                      style={{
                        padding: '0.18rem 0.42rem',
                        borderRadius: '6px',
                        backgroundColor: '#2563eb12',
                        border: '1px solid #2563eb30',
                        color: 'var(--spc-home-blue, #1d4ed8)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title={stg.label}
                    >
                      {stg.id}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setIsOrderModalOpen(true)}
                style={{
                  flex: 1.2, padding: '0.5rem', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff', fontWeight: 700, fontSize: '0.82rem', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
                }}
              >
                <Plus size={14} />
                <span>Punch Order</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('channel_ops', 'order_pipeline', 'ALL')}
                style={{
                  padding: '0.5rem 0.75rem', borderRadius: '8px',
                  background: 'none', border: '1px solid var(--border-light, #e2e8f0)',
                  color: 'var(--text-secondary, #64748b)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.25rem'
                }}
              >
                <span>Pipeline</span>
                <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Lead Data & Sales Pipeline Widget */}
        {isWidgetVisible('lead_data_card') && (
          <div style={{
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: '14px',
            border: '1px solid #6366f135',
            padding: '1.25rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: 'linear-gradient(135deg, #6366f122, #6366f140)',
                    border: '1px solid #6366f150', color: '#6366f1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Users size={18} />
                  </div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0 }}>Lead Data & Pipeline</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('leads', null, 'all_leads')}
                  title="Click to view All Leads"
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'var(--spc-home-violet, #4f46e5)',
                    background: 'color-mix(in srgb, #4f46e5 13%, var(--bg-surface, #ffffff))',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    border: '1px solid color-mix(in srgb, #4f46e5 30%, transparent)',
                    cursor: 'pointer'
                  }}
                >
                  ALL LEADS ↗
                </button>
              </div>
              <p style={{ margin: '0.85rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)' }}>
                Access live CRM leads, stage-wise sales conversions (01–08), customer interactions, and follow-ups.
              </p>

              {/* Direct Jump Stage Numbering as per access */}
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Zap size={11} style={{ color: 'var(--accent-color, #4f46e5)' }} />
                  <span>Quick Jump Stage:</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28rem', alignItems: 'center' }}>
                  {permittedLeadStages.map(stg => (
                    <button
                      key={stg.id}
                      type="button"
                      onClick={() => onNavigate('leads', null, stg.fullStage)}
                      style={{
                        padding: '0.18rem 0.42rem',
                        borderRadius: '6px',
                        backgroundColor: '#6366f112',
                        border: '1px solid #6366f130',
                        color: 'var(--spc-home-violet, #4f46e5)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title={stg.fullStage}
                    >
                      {stg.id}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => onNavigate('leads', null, 'all_leads')}
                style={{
                  flex: 1.2, padding: '0.5rem', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  color: '#ffffff', fontWeight: 700, fontSize: '0.82rem', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                  boxShadow: '0 2px 4px rgba(99, 102, 241, 0.2)'
                }}
              >
                <span>View Lead Table</span>
                <ArrowUpRight size={14} />
              </button>
              {canAddLead && (
                <button
                  type="button"
                  onClick={() => setIsLeadModalOpen(true)}
                  style={{
                    padding: '0.5rem 0.75rem', borderRadius: '8px',
                    background: 'none', border: '1px solid var(--border-light, #e2e8f0)',
                    color: 'var(--text-secondary, #64748b)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.25rem'
                  }}
                >
                  <Plus size={13} />
                  <span>Add</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Complaints Widget with Instant Ticket Action */}
        {isWidgetVisible('complaints_card') && (
          <div style={{
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: '14px',
            border: '1px solid #ef444435',
            padding: '1.25rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: 'linear-gradient(135deg, #ef444422, #ef444440)',
                    border: '1px solid #ef444450', color: '#ef4444',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <AlertTriangle size={18} />
                  </div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0 }}>Complaint Desk</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('channel_ops', 'complaints', 'ALL')}
                  title="Click to view All Complaints"
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'var(--spc-home-danger, #dc2626)',
                    background: 'color-mix(in srgb, #dc2626 13%, var(--bg-surface, #ffffff))',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    border: '1px solid color-mix(in srgb, #dc2626 30%, transparent)',
                    cursor: 'pointer'
                  }}
                >
                  C01–C06 ↗
                </button>
              </div>
              <p style={{ margin: '0.85rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)' }}>
                Ticket triage, root-cause RCA, service engineer deputation and OTP closure.
              </p>

              {/* Direct Jump Stage Numbering as per access */}
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Zap size={11} style={{ color: 'var(--accent-color, #4f46e5)' }} />
                  <span>Quick Jump Stage:</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28rem', alignItems: 'center' }}>
                  {permittedComplaintStages.map(stg => (
                    <button
                      key={stg.id}
                      type="button"
                      onClick={() => onNavigate('channel_ops', 'complaints', stg.id)}
                      style={{
                        padding: '0.18rem 0.42rem',
                        borderRadius: '6px',
                        backgroundColor: '#ef444412',
                        border: '1px solid #ef444430',
                        color: 'var(--spc-home-danger, #dc2626)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title={stg.label}
                    >
                      {stg.id}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setIsComplaintModalOpen(true)}
                style={{
                  flex: 1.2, padding: '0.5rem', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: '#ffffff', fontWeight: 700, fontSize: '0.82rem', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                  boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)'
                }}
              >
                <Plus size={14} />
                <span>Log Ticket</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('channel_ops', 'complaints', 'ALL')}
                style={{
                  padding: '0.5rem 0.75rem', borderRadius: '8px',
                  background: 'none', border: '1px solid var(--border-light, #e2e8f0)',
                  color: 'var(--text-secondary, #64748b)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.25rem'
                }}
              >
                <span>Desk</span>
                <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Recruitment Widget */}
        {isWidgetVisible('recruitment_card') && (
          <div style={{
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: '14px',
            border: '1px solid #ec489935',
            padding: '1.25rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: 'linear-gradient(135deg, #ec489922, #ec489940)',
                    border: '1px solid #ec489950', color: '#ec4899',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <UserPlus size={18} />
                  </div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0 }}>Recruitment Hub</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('recruiter', null, 'dashboard')}
                  title="Click to view Recruiter Dashboard"
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'var(--spc-home-pink, #db2777)',
                    background: 'color-mix(in srgb, #db2777 13%, var(--bg-surface, #ffffff))',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    border: '1px solid color-mix(in srgb, #db2777 30%, transparent)',
                    cursor: 'pointer'
                  }}
                >
                  S00–S12 ↗
                </button>
              </div>
              <p style={{ margin: '0.85rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)' }}>
                Candidate interview stages, shortlist evaluations, LOI letters and onboardings.
              </p>

              {/* Direct Jump Stage Numbering as per access */}
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Zap size={11} style={{ color: 'var(--accent-color, #4f46e5)' }} />
                  <span>Quick Jump Stage:</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28rem', alignItems: 'center' }}>
                  {permittedRecruiterStages.map(stg => (
                    <button
                      key={stg.id}
                      type="button"
                      onClick={() => onNavigate('recruiter', null, stg.id)}
                      style={{
                        padding: '0.18rem 0.42rem',
                        borderRadius: '6px',
                        backgroundColor: '#ec489912',
                        border: '1px solid #ec489930',
                        color: 'var(--spc-home-pink, #db2777)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title={stg.label}
                    >
                      {stg.id}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => onNavigate('recruiter', null, 'dashboard')}
                style={{
                  flex: 1, padding: '0.5rem', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                  color: '#ffffff', fontWeight: 700, fontSize: '0.82rem', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem'
                }}
              >
                <span>Recruiter Pipeline</span>
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Customize Home Modal */}
      <CustomizeHomeModal
        isOpen={isCustomizeModalOpen}
        onClose={() => setIsCustomizeModalOpen(false)}
        enabledWidgetIds={enabledWidgetIds}
        onSaveWidgets={setEnabledWidgetIds}
        moduleAccess={moduleAccess}
        userRole={userRole}
        userId={userId}
      />

      {/* Instant Order Entry Modal */}
      <InstantOrderModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        tenantId={tenantId}
        userId={userId}
        userName={userName}
        userCompany={userCompany}
      />

      {/* Instant Complaint Ticket Modal */}
      <InstantComplaintModal
        isOpen={isComplaintModalOpen}
        onClose={() => setIsComplaintModalOpen(false)}
        tenantId={tenantId}
        userId={userId}
        userName={userName}
      />

      {/* Instant Lead Registration Modal */}
      <LeadFormModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        userName={userName}
        userId={userId}
        userCompany={userCompany}
        teamMembers={teamMembers}
        onLeadAdded={() => setIsLeadModalOpen(false)}
      />

      {/* Instant Delegation Task Assignment Modal */}
      <InstantDelegationModal
        isOpen={isDelegationModalOpen}
        onClose={() => setIsDelegationModalOpen(false)}
        tenantId={tenantId}
        userId={userId}
        userName={userName}
        userEmail={userEmail}
        userCompany={userCompany}
        teamMembers={teamMembers}
      />

      {/* Instant Missing Punch Modal */}
      <InstantMissingPunchModal
        isOpen={isMissingPunchModalOpen}
        onClose={() => setIsMissingPunchModalOpen(false)}
        tenantId={tenantId}
        userId={userId}
        userName={userName}
        userEmail={userEmail}
      />

      {/* Instant Leave Application Modal */}
      <InstantLeaveModal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        tenantId={tenantId}
        userId={userId}
        userName={userName}
        userEmail={userEmail}
        userCompany={userCompany}
      />

      {/* Instant Task Planner Modal (Schedule New Daily Task) */}
      <QuickTaskModal
        isOpen={isTaskPlannerModalOpen}
        onClose={() => setIsTaskPlannerModalOpen(false)}
        onSave={async (formData) => {
          const res = await createTaskPlannerItem({ ...formData, tenant_id: tenantId }, tenantId);
          if (!res?.success) {
            throw new Error(res?.error || 'Failed to schedule task');
          }
          if (typeof window !== 'undefined') {
            try {
              window.dispatchEvent(new CustomEvent('task_planner_updated'));
            } catch {}
          }
        }}
        employeeName={userName}
        employeeEmail={userEmail}
        tenantId={tenantId}
        userCompany={userCompany}
      />
    </div>
  );
}
