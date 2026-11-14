'use client';

import React, { memo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Building, Building2, Calendar, Camera, Check, CheckCircle2,
  CheckSquare, ChevronRight, Clock, Compass, FileText, Home, Layers, Lock, LogIn,
  LogOut, Mail, MapPin, MessageSquare, Mic, MicOff, Navigation, PenTool, Phone, Play,
  Plus, RefreshCw, Search, ShieldCheck, Trash2, User, UserPlus, Wifi, WifiOff, X, Zap,
} from 'lucide-react';
import styles from './FieldExecutiveConsole.module.css';
import SearchableProductSelect from '@/components/common/SearchableProductSelect';

const IST_TIME_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const IST_SHORT_DATE_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const IST_DATE_TIME_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const MODE_ICON_MAP = {
  PHYSICAL_VISIT: Navigation,
  TELEPHONIC_CALL: Phone,
  WHATSAPP_CHAT: MessageSquare,
  EMAIL_QUOTE: Mail,
};

/**
 * Formats executive + company identity without duplicating identical labels (e.g. "SuPuja Creations · SuPuja Creations").
 */
export function formatConsoleIdentity(userName = '', company = '', userEmail = '') {
  const cleanUser = String(userName || '').trim();
  const cleanCompany = String(company || '').trim();
  const cleanEmail = String(userEmail || '').trim();

  const parts = [];
  if (cleanUser) parts.push(cleanUser);
  if (cleanCompany && cleanCompany.toLowerCase() !== cleanUser.toLowerCase()) {
    parts.push(cleanCompany);
  }
  if (parts.length <= 1 && cleanEmail && cleanEmail.toLowerCase() !== cleanUser.toLowerCase()) {
    parts.push(cleanEmail);
  }
  return parts.join(' · ') || 'Field Executive Workspace';
}

export function getTaskInstructions(task) {
  if (!task || typeof task !== 'object') return '';
  const raw =
    task.taskDescription ||
    task.form_details?.description ||
    task.form_details?.issue_description ||
    task.description ||
    '';
  return String(raw || '').trim();
}

export function getTaskStageInfo(task) {
  if (!task || typeof task !== 'object') return null;
  const rawValue =
    task.taskStage ||
    task.form_details?.task_stage ||
    task.form_details?.lead_status ||
    task.form_details?.lead_status_at_assign ||
    '';
  const cleanValue = String(rawValue || '').trim();
  if (!cleanValue) return null;
  const label = String(
    task.taskStageLabel ||
    task.form_details?.task_stage_label ||
    (task.form_details?.lead_status || task.form_details?.lead_status_at_assign ? 'Lead Status' : 'Stage')
  ).trim();
  return {
    label,
    rawValue: cleanValue,
    displayValue: formatReadableStage(cleanValue) || cleanValue,
  };
}

function TaskStageBadge({ info }) {
  if (!info || !info.displayValue) return null;
  return (
    <div style={{
      marginTop: 6,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 8px',
      borderRadius: 6,
      background: '#f0f9ff',
      border: '1px solid #bae6fd',
      color: '#0369a1',
      fontSize: 11.5,
      fontWeight: 600,
      maxWidth: '100%',
      flexWrap: 'wrap',
    }}>
      <span>{info.label}:</span>
      <strong style={{ color: '#0c4a6e' }}>{info.displayValue}</strong>
    </div>
  );
}

function TaskInstructionsBox({ text, compact = false }) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  return (
    <div style={{
      marginTop: compact ? 6 : 8,
      padding: compact ? '6px 8px' : '8px 10px',
      borderRadius: 7,
      background: '#fffbeb',
      border: '1px solid #fde68a',
      color: '#78350f',
      fontSize: compact ? 11.5 : 12,
      lineHeight: 1.45,
      whiteSpace: 'pre-wrap',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 6,
    }}>
      <FileText size={compact ? 12 : 13} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <strong style={{ color: '#92400e', fontWeight: 700 }}>Instructions: </strong>
        <span>{clean}</span>
      </div>
    </div>
  );
}

export function formatVisitTimeIST(value) {
  if (!value) return '--:--';
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? IST_TIME_FMT.format(d).toUpperCase() : '--:--';
}

export function formatVisitDateIST(value = new Date()) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? IST_SHORT_DATE_FMT.format(d) : '';
}

export function formatVisitDateTimeIST(value) {
  if (!value) return 'Schedule pending';
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? `${IST_DATE_TIME_FMT.format(d).toUpperCase()} IST` : 'Schedule pending';
}

/**
 * Computes an IST datetime-local string offset by N days at 11:00 AM IST cleanly regardless of host server timezone.
 */
export function buildISTFollowupPreset(daysAhead) {
  const targetMs = Date.now() + Number(daysAhead || 0) * 86400000;
  const datePart = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(targetMs));
  return `${datePart}T11:00`;
}

/**
 * Formats serialized CRM stage codes (e.g. "1;01>New Stage>New Lead") into readable pills without mutating raw DB stage values.
 */
export function formatReadableStage(stage) {
  const raw = String(stage || '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/^\d+;\d+>/, '');
  return cleaned.includes('>') ? cleaned.split('>').map(s => s.trim()).filter(Boolean).join(' · ') : cleaned;
}

export const ConsoleHeader = memo(function ConsoleHeader({
  userName,
  company,
  userEmail,
  networkOnline,
  pendingQueueCount,
  isSyncing,
  onSyncQueue,
  mainView,
  onViewChange,
  tasksCount,
  completedCount,
  isBusy,
  onRefreshAll,
  isActiveVisit,
}) {
  const identityLine = formatConsoleIdentity(userName, company, userEmail);
  const navItems = [
    ['HOME', Home, 'Home', null],
    ['ASSIGNED_TASKS', Calendar, 'Assigned Tasks', tasksCount],
    ['CHECK_IN', Navigation, 'Walk-In / Check-In', null],
    ['COMPLETED_VISITS', CheckCircle2, 'Completed Visits', completedCount],
  ];

  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <div className={styles.identityGroup}>
          <span className={styles.identityIcon}>
            <Navigation size={19} aria-hidden="true" />
          </span>
          <div className={styles.identityMeta}>
            <h1>Field Executive Console</h1>
            <p title={identityLine}>{identityLine}</p>
          </div>
        </div>

        <div className={styles.statusControls}>
          {pendingQueueCount > 0 && (
            <button type="button" className={styles.queueButton} disabled={isSyncing} onClick={onSyncQueue}>
              <RefreshCw size={12} className={isSyncing ? styles.spinning : undefined} aria-hidden="true" />
              {pendingQueueCount} Pending Sync
            </button>
          )}
          <span className={styles.networkBadge} data-online={networkOnline ? 'true' : 'false'}>
            {networkOnline ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
            {networkOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {!isActiveVisit && (
        <div className={styles.headerNav}>
          <nav aria-label="Field Executive Views" className={styles.viewTabs}>
            {navItems.map(([id, Icon, label, count]) => (
              <button
                key={id}
                type="button"
                aria-current={mainView === id ? 'page' : undefined}
                onClick={() => onViewChange(id)}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{label}</span>
                {count != null && <span className={styles.tabCount}>{count}</span>}
              </button>
            ))}
          </nav>

          <div className={styles.dateTools}>
            <span className={styles.dateChip}>
              <Calendar size={13} aria-hidden="true" />
              <span>{formatVisitDateIST()}</span>
              <span className={styles.istTag}>IST</span>
            </span>
            <button
              type="button"
              className={styles.iconButton}
              onClick={onRefreshAll}
              disabled={isBusy}
              aria-label="Refresh tasks, visits and attendance"
              title="Refresh tasks, visits and attendance"
            >
              <RefreshCw size={14} className={isBusy ? styles.spinning : undefined} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
});

export const AttendancePolicyBanner = memo(function AttendancePolicyBanner({ attendanceStatus, onPunchInClick }) {
  if (!attendanceStatus?.checked) return null;

  if (!attendanceStatus.isPunchedIn) {
    return (
      <section aria-label="Attendance policy notice" className={styles.noticeBanner} data-tone="warning">
        <div className={styles.noticeContent}>
          <span className={styles.noticeIcon}>
            <AlertTriangle size={18} aria-hidden="true" />
          </span>
          <div className={styles.noticeText}>
            <strong>Attendance punch-in required before check-in</strong>
            <p>Mark today&apos;s Smart Attendance punch-in to unlock client visit check-ins and GPS reporting.</p>
          </div>
        </div>
        <button type="button" className={styles.noticeCta} onClick={onPunchInClick}>
          <Clock size={14} aria-hidden="true" />
          Punch In Attendance
        </button>
      </section>
    );
  }

  if (attendanceStatus.isPunchedOut) {
    return (
      <section aria-label="Shift completed notice" className={styles.noticeBanner} data-tone="danger">
        <div className={styles.noticeContent}>
          <span className={styles.noticeIcon}>
            <Lock size={18} aria-hidden="true" />
          </span>
          <div className={styles.noticeText}>
            <strong>Shift ended for today ({formatVisitTimeIST(attendanceStatus.outTime)})</strong>
            <p>You have punched out for today. New client visit check-ins are locked until your next shift.</p>
          </div>
        </div>
      </section>
    );
  }

  return null;
});

const PRIORITY_BADGE_MAP = {
  CRITICAL: { tone: 'danger', label: '🔴 CRITICAL' },
  URGENT: { tone: 'urgent', label: '🟠 URGENT' },
  HIGH: { tone: 'warning', label: '🟡 HIGH' },
  MEDIUM: { tone: 'accent', label: '🔵 MEDIUM' },
  LOW: { tone: 'healthy', label: '🟢 LOW' },
};

/**
 * Mobile-First Executive Home Cockpit View (TrackWick / New Swan WorkApp inspired)
 */
export const ConsoleHomeCockpitView = memo(function ConsoleHomeCockpitView({
  userName = 'Field Executive',
  company = 'New Swan Multitech Limited',
  attendanceStatus,
  liveDutyDuration = '00 s',
  onPunchInClick,
  onPunchOutClick,
  onOpenCheckInModal,
  activeFieldVisit,
  onResumeActiveVisit,
  tasks = [],
  todayCompletedCount = 0,
  onNavigateToView,
}) {
  const [expensePeriod, setExpensePeriod] = useState('Today');

  const todayISTStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  const pendingTodayCount = tasks.filter((t) => {
    if (t.status === 'COMPLETED') return false;
    if (!t.scheduled_start_time) return false;
    const taskDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(t.scheduled_start_time));
    return taskDate === todayISTStr;
  }).length;

  const inProgressCount = tasks.filter((t) => t.status === 'IN_PROGRESS').length;

  const overdueCount = tasks.filter((t) => {
    if (t.status === 'COMPLETED') return false;
    if (!t.scheduled_start_time) return false;
    const taskDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(t.scheduled_start_time));
    return taskDate < todayISTStr;
  }).length;

  const totalTasks = tasks.length + todayCompletedCount;
  const completionPct = totalTasks > 0 ? Math.round((todayCompletedCount / totalTasks) * 100) : 0;

  const isPunchedIn = Boolean(attendanceStatus?.isPunchedIn);
  const inTimeStr = attendanceStatus?.inTime ? formatVisitTimeIST(attendanceStatus.inTime) : '--:--';

  const cleanCompanyName = String(company || '').trim() || 'New Swan Multitech Limited';
  const logoInitial = cleanCompanyName.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'NS';

  return (
    <div className={styles.homeCockpit}>
      {/* 1. Punch In / Duty Hero Card */}
      <section className={styles.punchHeroCard} aria-label="Executive Punch Status">
        <div className={styles.punchHeroTop}>
          <div>
            <div className={styles.punchHeroTitle}>Hi! {cleanCompanyName}</div>
            <div className={styles.punchHeroSub}>
              {isPunchedIn ? 'You are punched In!' : 'You are punched Out!'}
            </div>
          </div>
          <div className={styles.companyLogoBadge} title={cleanCompanyName}>
            {logoInitial}
          </div>
        </div>

        <div className={styles.punchPillBar}>
          <div className={styles.punchTimeSegment}>
            {isPunchedIn ? (
              <>
                <LogIn size={15} color="#16a34a" aria-hidden="true" />
                <span>Punch In Time: <strong>{inTimeStr}</strong></span>
              </>
            ) : (
              <>
                <LogOut size={15} color="#dc2626" aria-hidden="true" />
                <span>Off Duty</span>
              </>
            )}
          </div>

          {isPunchedIn && (
            <div className={styles.durationPillSegment}>
              <span className={styles.durationPillLabel}>Duration</span>
              <strong className={styles.durationPillValue}>{liveDutyDuration}</strong>
            </div>
          )}

          {isPunchedIn ? (
            <button
              type="button"
              className={styles.punchActionBtn}
              data-type="out"
              onClick={onPunchOutClick}
              title="Punch Out"
            >
              Punch Out
            </button>
          ) : (
            <button
              type="button"
              className={styles.punchActionBtn}
              data-type="in"
              onClick={onPunchInClick}
              title="Punch In"
            >
              Punch In
            </button>
          )}
        </div>
      </section>

      {/* 2. Customer Check In Action Card */}
      <section className={styles.customerCheckInCard} aria-label="Customer Check In Actions">
        {activeFieldVisit ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#0284c7', fontWeight: 700 }}>
                Active Visit in Progress
              </span>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{activeFieldVisit.partyName}</div>
            </div>
            <button type="button" className={styles.checkInGreenBtn} onClick={onResumeActiveVisit}>
              <Compass size={14} aria-hidden="true" />
              Resume Visit
            </button>
          </div>
        ) : (
          <>
            <span className={styles.customerCheckInCardTitle}>Customer Check In</span>
            <button type="button" className={styles.checkInGreenBtn} onClick={onOpenCheckInModal}>
              <Navigation size={14} aria-hidden="true" />
              Check In
            </button>
          </>
        )}
      </section>

      {/* 3. Overall Performance (Month To Date) */}
      <section className={styles.sectionCard} aria-label="Monthly Performance">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Overall Performance (Month To Date)</span>
        </div>
        <div className={styles.performanceProgressBox}>
          <div>
            <div style={{ fontSize: 11.5, color: '#64748b' }}>Task Completed</div>
            <div className={styles.performanceLabel}>
              <strong>{todayCompletedCount}</strong> of <strong>{totalTasks}</strong>
            </div>
          </div>
          <div className={styles.performanceBadge} style={{ borderColor: completionPct > 0 ? '#16a34a' : '#cbd5e1' }}>
            {completionPct}%
          </div>
        </div>
      </section>

      {/* 4. Task Overview */}
      <section className={styles.sectionCard} aria-label="Task Overview">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Task Overview</span>
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
            onClick={() => onNavigateToView('ASSIGNED_TASKS')}
          >
            View All →
          </button>
        </div>
        <div className={styles.kpiGrid3}>
          <div className={styles.kpiTile} onClick={() => onNavigateToView('ASSIGNED_TASKS')}>
            <div className={styles.kpiLabel}>Pending (Today)</div>
            <div className={`${styles.kpiValue} ${styles.kpiValueBlue}`}>{pendingTodayCount}</div>
          </div>
          <div className={styles.kpiTile} onClick={() => onNavigateToView('ASSIGNED_TASKS')}>
            <div className={styles.kpiLabel}>In Progress (All)</div>
            <div className={`${styles.kpiValue} ${styles.kpiValueBlue}`}>{inProgressCount}</div>
          </div>
          <div className={styles.kpiTile} onClick={() => onNavigateToView('ASSIGNED_TASKS')}>
            <div className={styles.kpiLabel}>Overdue (All)</div>
            <div className={`${styles.kpiValue} ${styles.kpiValueRed}`}>{overdueCount}</div>
          </div>
        </div>
      </section>

      {/* 5. Manage Leave */}
      <section className={styles.sectionCard} aria-label="Manage Leave">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Manage Leave</span>
        </div>
        <div className={styles.kpiGrid3}>
          <div className={styles.kpiTile}>
            <div className={styles.kpiLabel}>Balance</div>
            <div className={styles.kpiValue}>0.00</div>
          </div>
          <div className={styles.kpiTile}>
            <div className={styles.kpiLabel}>Taken</div>
            <div className={styles.kpiValue}>0.00</div>
          </div>
          <div className={styles.kpiTile}>
            <div className={styles.kpiLabel}>Pending</div>
            <div className={styles.kpiValue}>0.00</div>
          </div>
        </div>
      </section>

      {/* 6. Expense */}
      <section className={styles.sectionCard} aria-label="Expenses">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Expense</span>
          <select
            value={expensePeriod}
            onChange={(e) => setExpensePeriod(e.target.value)}
            style={{ fontSize: 11.5, border: '1px solid #cbd5e1', borderRadius: 6, padding: '2px 6px', background: '#ffffff', color: '#475569' }}
          >
            <option value="Today">Today ▾</option>
            <option value="Month">This Month ▾</option>
          </select>
        </div>
        <div className={styles.kpiGrid3}>
          <div className={styles.kpiTile}>
            <div className={styles.kpiLabel}>Create</div>
            <div className={styles.kpiValue}>0.0 <small style={{ fontSize: 10, color: '#64748b' }}>INR</small></div>
          </div>
          <div className={styles.kpiTile}>
            <div className={styles.kpiLabel}>Approved</div>
            <div className={`${styles.kpiValue} ${styles.kpiValueGreen}`}>0.0 <small style={{ fontSize: 10, color: '#16a34a' }}>INR</small></div>
          </div>
          <div className={styles.kpiTile}>
            <div className={styles.kpiLabel}>Rejected</div>
            <div className={`${styles.kpiValue} ${styles.kpiValueRed}`}>0.0 <small style={{ fontSize: 10, color: '#dc2626' }}>INR</small></div>
          </div>
        </div>
      </section>
    </div>
  );
});

/**
 * Instant Check-In Modal Popup (Matching Screen 5)
 */
export const InstantCheckInModal = memo(function InstantCheckInModal({
  isOpen,
  onClose,
  searchQuery,
  onSearchChange,
  loadingEntities,
  moduleEntities = [],
  onSelectEntity,
  isManualEntry,
  onSetManualEntry,
  partyName,
  onPartyNameChange,
  partyPhone,
  onPartyPhoneChange,
  partyAddress,
  onPartyAddressChange,
  onStartCheckIn,
  gpsLoading,
  userLat,
  userLng,
  onOpenLeadRegistration,
  onOpenPartyRegistration,
  onOpenEndCustomerRegistration,
}) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="checkin-modal-title">
      <div className={styles.modalBox}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <button type="button" className={styles.modalBackBtn} onClick={onClose} aria-label="Close modal">
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <h2 id="checkin-modal-title" className={styles.modalTitle}>Check In</h2>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {!isManualEntry ? (
            <>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                  Select Existing Customer
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className={styles.textInput}
                    placeholder="Select & Search Customer"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    autoFocus
                  />
                  {loadingEntities && (
                    <RefreshCw size={14} className={styles.spinning} style={{ position: 'absolute', right: 10, top: 11, color: '#94a3b8' }} />
                  )}
                </div>

                {/* Dropdown list of results */}
                {searchQuery && moduleEntities.length > 0 && (
                  <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: 8, marginTop: 4, background: '#ffffff' }}>
                    {moduleEntities.map((ent) => (
                      <div
                        key={ent.id}
                        onClick={() => {
                          onSelectEntity(ent);
                        }}
                        style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 12.5 }}
                      >
                        <strong style={{ color: '#0f172a' }}>{ent.displayName || ent.party_name}</strong>
                        {ent.phone && <span style={{ color: '#64748b', marginLeft: 6 }}>({ent.phone})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {partyName && (
                <div style={{ padding: 10, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 12.5 }}>
                  <strong style={{ color: '#166534' }}>Selected: </strong>
                  <span>{partyName}</span> {partyPhone && <span>· {partyPhone}</span>}
                </div>
              )}

              <div className={styles.orDivider}>OR</div>

              {/* 3 Registration Types Selector */}
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <UserPlus size={14} color="#0284c7" aria-hidden="true" />
                  <span>Register New Customer (Choose Type):</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* 1. Instant Lead Registration */}
                  <button
                    type="button"
                    className={styles.registrationOptionCard}
                    onClick={onOpenLeadRegistration}
                  >
                    <div className={styles.registrationOptionIcon} style={{ background: '#eff6ff', color: '#2563eb' }}>
                      <Zap size={16} aria-hidden="true" />
                    </div>
                    <div style={{ textAlign: 'left', flex: 1 }}>
                      <strong style={{ fontSize: 13, color: '#1e293b', display: 'block' }}>⚡ Instant Lead Registration</strong>
                      <small style={{ fontSize: 11, color: '#64748b' }}>Register prospect in CRM Leads pipeline</small>
                    </div>
                    <ChevronRight size={15} color="#94a3b8" />
                  </button>

                  {/* 2. Party Registration */}
                  <button
                    type="button"
                    className={styles.registrationOptionCard}
                    onClick={onOpenPartyRegistration}
                  >
                    <div className={styles.registrationOptionIcon} style={{ background: '#f0fdf4', color: '#16a34a' }}>
                      <Building2 size={16} aria-hidden="true" />
                    </div>
                    <div style={{ textAlign: 'left', flex: 1 }}>
                      <strong style={{ fontSize: 13, color: '#1e293b', display: 'block' }}>🏢 Party Registration</strong>
                      <small style={{ fontSize: 11, color: '#64748b' }}>Onboard new Dealer / Distributor into Master</small>
                    </div>
                    <ChevronRight size={15} color="#94a3b8" />
                  </button>

                  {/* 3. Register End Customer */}
                  <button
                    type="button"
                    className={styles.registrationOptionCard}
                    onClick={onOpenEndCustomerRegistration}
                  >
                    <div className={styles.registrationOptionIcon} style={{ background: '#fef3c7', color: '#d97706' }}>
                      <User size={16} aria-hidden="true" />
                    </div>
                    <div style={{ textAlign: 'left', flex: 1 }}>
                      <strong style={{ fontSize: 13, color: '#1e293b', display: 'block' }}>🚜 Register End Customer</strong>
                      <small style={{ fontSize: 11, color: '#64748b' }}>Register farmer / machine owner & warranty</small>
                    </div>
                    <ChevronRight size={15} color="#94a3b8" />
                  </button>
                </div>

                <div style={{ textAlign: 'center', marginTop: 10 }}>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => onSetManualEntry(true)}
                  >
                    Or enter quick walk-in details manually
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
                    Quick Spot Walk-In Details
                  </label>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => onSetManualEntry(false)}
                  >
                    ← Select Existing / Choose Type
                  </button>
                </div>
                <input
                  type="text"
                  className={styles.textInput}
                  placeholder="Customer / Business Name *"
                  value={partyName}
                  onChange={(e) => onPartyNameChange(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <input
                  type="tel"
                  className={styles.textInput}
                  placeholder="Contact Number (10 digits)"
                  value={partyPhone}
                  onChange={(e) => onPartyPhoneChange(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <input
                  type="text"
                  className={styles.textInput}
                  placeholder="Address / Location details"
                  value={partyAddress}
                  onChange={(e) => onPartyAddressChange(e.target.value)}
                />
              </div>
            </>
          )}

          {/* GPS Info Stamp */}
          <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
            <MapPin size={12} color="#0284c7" aria-hidden="true" />
            <span>
              {gpsLoading ? 'Fetching GPS coordinates...' : userLat ? `GPS Stamped (${userLat.toFixed(4)}, ${userLng.toFixed(4)})` : 'GPS will be fetched on check-in'}
            </span>
          </div>

          {/* Action Button */}
          <button
            type="button"
            className={styles.checkInGreenBtn}
            style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: 14 }}
            disabled={!partyName || gpsLoading}
            onClick={onStartCheckIn}
          >
            <Navigation size={15} aria-hidden="true" />
            Check In Now
          </button>
        </div>
      </div>
    </div>
  );
});

/**
 * Quick Party Registration Modal (Dealer / Distributor)
 */
export const QuickPartyRegistrationModal = memo(function QuickPartyRegistrationModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
}) {
  const [firmName, setFirmName] = useState('');
  const [partyType, setPartyType] = useState('Dealer');
  const [contactMobile, setContactMobile] = useState('');
  const [address, setAddress] = useState('');
  const [stateName, setStateName] = useState('Punjab');
  const [districtName, setDistrictName] = useState('');
  const [gstin, setGstin] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!firmName.trim() || !contactMobile.trim()) {
      alert('Firm Name and Contact Mobile are mandatory.');
      return;
    }
    onSubmit({
      firm_name: firmName.trim(),
      party_type: partyType,
      primary_mobile: contactMobile.trim(),
      address: address.trim(),
      state_name: stateName,
      district_name: districtName.trim(),
      gstin: gstin.trim() || null,
    });
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="party-reg-title">
      <div className={styles.modalBox} style={{ maxWidth: 460 }}>
        <div className={styles.modalHeader} style={{ background: '#16a34a' }}>
          <button type="button" className={styles.modalBackBtn} onClick={onClose} aria-label="Close modal">
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <h2 id="party-reg-title" className={styles.modalTitle}>🏢 Party Registration (Dealer / Distributor)</h2>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalBody}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
              Firm / Dealership Name *
            </label>
            <input
              type="text"
              className={styles.textInput}
              placeholder="e.g. Kisan Agro Agency"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                Party Type
              </label>
              <select
                className={styles.formSelect}
                value={partyType}
                onChange={(e) => setPartyType(e.target.value)}
              >
                <option value="Dealer">Dealer</option>
                <option value="Distributor">Distributor</option>
                <option value="OEM">OEM</option>
                <option value="Retailer">Retailer</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                Primary Mobile *
              </label>
              <input
                type="tel"
                maxLength={10}
                className={styles.textInput}
                placeholder="10-digit mobile"
                value={contactMobile}
                onChange={(e) => setContactMobile(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                State / UT
              </label>
              <input
                type="text"
                className={styles.textInput}
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                District
              </label>
              <input
                type="text"
                className={styles.textInput}
                placeholder="District"
                value={districtName}
                onChange={(e) => setDistrictName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
              Business Address
            </label>
            <input
              type="text"
              className={styles.textInput}
              placeholder="Shop No, Market, Town"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
              GSTIN (Optional)
            </label>
            <input
              type="text"
              className={styles.textInput}
              placeholder="15-character GSTIN"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
            />
          </div>

          <button
            type="submit"
            className={styles.checkInGreenBtn}
            style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: 14 }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Registering Party...' : 'Save Party & Proceed to Check-In'}
          </button>
        </form>
      </div>
    </div>
  );
});

export const ConsoleAssignedTasksView = memo(function ConsoleAssignedTasksView({
  tasks,
  loadingTasks,
  visitedMap,
  attendanceStatus,
  onRefresh,
  onStartCheckInView,
  onSelectTask,
  onAttendanceGateClick,
}) {
  const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  return (
    <div>
      <div className={styles.cardHeader}>
        <div>
          <h2>
            <Calendar size={17} color="#2563eb" aria-hidden="true" />
            Assigned Field Visits ({tasks.length})
          </h2>
          <p>Scheduled client visits assigned to you. Start a visit to capture GPS check-in and output.</p>
        </div>
        <button type="button" className={styles.walkinBtn} onClick={onRefresh} disabled={loadingTasks}>
          <RefreshCw size={13} className={loadingTasks ? styles.spinning : undefined} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {loadingTasks ? (
        <div className={styles.emptyPanel}>
          <RefreshCw size={24} className={styles.spinning} aria-hidden="true" />
          <strong>Loading assigned tasks</strong>
          <p>Fetching today&apos;s scheduled field visits...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className={styles.emptyPanel}>
          <Calendar size={28} color="#94a3b8" aria-hidden="true" />
          <strong>No pending assigned visits</strong>
          <p>You have no open scheduled visits assigned right now. Start a walk-in or lead check-in anytime.</p>
          <button type="button" className={styles.primaryAction} style={{ width: 'auto' }} onClick={onStartCheckInView}>
            <Navigation size={15} aria-hidden="true" />
            Open Walk-In / Check-In
          </button>
        </div>
      ) : (
        <div className={styles.tasksGrid}>
          {tasks.map((task) => {
            const visitedToday = visitedMap.get(task.lead_id) || visitedMap.get(task.party_name?.toLowerCase().trim());
            const schedIST = task.scheduled_start_time
              ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(task.scheduled_start_time))
              : '';
            const isToday = Boolean(schedIST && schedIST === todayIST);
            const priorityMeta = PRIORITY_BADGE_MAP[String(task.priority || 'MEDIUM').toUpperCase()] || PRIORITY_BADGE_MAP.MEDIUM;

            return (
              <article key={task.id} className={styles.taskCard}>
                <div>
                  <div className={styles.taskMetaRow}>
                    <div className={styles.badgeGroup}>
                      <span className={styles.pill} data-tone="accent">{task.task_code || 'TASK'}</span>
                      <span className={styles.pill} data-tone={priorityMeta.tone}>{priorityMeta.label}</span>
                    </div>
                    <span className={styles.pill} data-tone={task.status === 'IN_PROGRESS' ? 'warning' : 'healthy'}>
                      {task.status || 'SCHEDULED'}
                    </span>
                  </div>

                  <strong style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>{task.party_name}</strong>
                  <div className={styles.entityMeta}>
                    <span>
                      <Layers size={13} aria-hidden="true" />
                      {task.task_type || 'Client Field Visit'}
                    </span>
                  </div>

                  <div className={styles.scheduleRow} data-today={isToday ? 'true' : 'false'}>
                    <Clock size={14} aria-hidden="true" />
                    <span>
                      {isToday ? 'Today · ' : 'Scheduled · '}
                      {formatVisitDateTimeIST(task.scheduled_start_time)}
                    </span>
                  </div>

                  <div className={styles.entityMeta}>
                    {task.party_phone && (
                      <span>
                        <Phone size={12} color="#2563eb" aria-hidden="true" />
                        <a href={`tel:${task.party_phone}`} style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                          {task.party_phone}
                        </a>
                      </span>
                    )}
                    {task.party_address && (
                      <span>
                        <MapPin size={12} aria-hidden="true" />
                        {task.party_address}
                      </span>
                    )}
                  </div>

                  <TaskStageBadge info={getTaskStageInfo(task)} />

                  <TaskInstructionsBox text={getTaskInstructions(task)} />

                  {visitedToday && (
                    <div className={styles.entityBadges}>
                      <span className={styles.visitedBadge}>
                        <CheckCircle2 size={11} aria-hidden="true" />
                        Visited Today
                      </span>
                    </div>
                  )}
                </div>

                {attendanceStatus.checked && !attendanceStatus.isPunchedIn ? (
                  <button type="button" className={styles.primaryAction} data-tone="warning" onClick={onAttendanceGateClick}>
                    <Lock size={14} aria-hidden="true" />
                    Punch Attendance First
                  </button>
                ) : attendanceStatus.checked && attendanceStatus.isPunchedOut ? (
                  <button type="button" className={styles.primaryAction} disabled>
                    <Lock size={14} aria-hidden="true" />
                    Shift Ended
                  </button>
                ) : (
                  <button type="button" className={styles.primaryAction} data-tone="success" onClick={() => onSelectTask(task)}>
                    <Play size={14} fill="#ffffff" aria-hidden="true" />
                    Start Visit Check-In
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
});

export const ConsoleCheckInWorkspace = memo(function ConsoleCheckInWorkspace({
  selectedModule,
  onSelectModule,
  tasksCount,
  onShowTasksView,
  searchQuery,
  onSearchChange,
  loadingEntities,
  moduleEntities,
  visitedMap,
  partyName,
  leadId,
  partyPhone,
  partyAddress,
  activePipeline,
  selectedTask,
  isManualEntry,
  onSetManualEntry,
  onPartyNameChange,
  onPartyPhoneChange,
  onClearParty,
  onSelectEntity,
  connectivityModes,
  connectivityMode,
  onSelectConnectivity,
  userLat,
  userLng,
  gpsAccuracy,
  gpsLoading,
  gpsError,
  geofenceDistance,
  geofenceStatus,
  onRefreshGPS,
  attendanceStatus,
  onAttendanceGateClick,
  onStartCheckIn,
}) {
  const moduleTabs = [
    ['LEAD_DATA', Building2, 'Lead Data'],
    ['PARTY_MASTER', Building, 'Party Master'],
    ['FIELD_TASK', Calendar, `Assigned Itinerary (${tasksCount})`],
  ];

  const searchLabel = selectedModule === 'LEAD_DATA'
    ? 'Lead Data'
    : selectedModule === 'PARTY_MASTER'
      ? 'Party Master'
      : 'Assigned Itinerary';

  const gpsTone = geofenceStatus === 'MISMATCH' ? 'danger' : gpsError ? 'warning' : undefined;

  return (
    <div className={styles.splitGrid}>
      {/* Left Column: Search & Client Directory */}
      <section className={styles.card} aria-label="Select target client">
        <div className={styles.cardHeader}>
          <div>
            <h2>
              <Layers size={16} color="#2563eb" aria-hidden="true" />
              Select Target Client
            </h2>
            <p>Choose a CRM source, search by party name, phone, or city, and select a record for check-in.</p>
          </div>
        </div>

        <div className={styles.moduleTabs} role="group" aria-label="CRM client source">
          {moduleTabs.map(([id, Icon, label]) => (
            <button key={id} type="button" aria-pressed={selectedModule === id} onClick={() => onSelectModule(id)}>
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {tasksCount > 0 && selectedModule !== 'FIELD_TASK' && (
          <div className={styles.taskAlertStrip}>
            <span>
              You have <strong>{tasksCount}</strong> assigned scheduled visit(s).
            </span>
            <button type="button" onClick={onShowTasksView}>View Assigned</button>
          </div>
        )}

        <div className={styles.searchField}>
          <Search size={15} className={styles.searchIcon} aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label={`Search ${searchLabel}`}
            placeholder={`Search party name, phone or city in ${searchLabel}...`}
          />
        </div>

        <div className={styles.entityList}>
          {loadingEntities ? (
            <div className={styles.emptyPanel} style={{ padding: '28px 16px' }}>
              <RefreshCw size={20} className={styles.spinning} aria-hidden="true" />
              <p style={{ marginBottom: 0 }}>Loading CRM records...</p>
            </div>
          ) : moduleEntities.length === 0 ? (
            <div className={styles.emptyPanel} style={{ padding: '28px 16px' }}>
              <strong>No matching records found</strong>
              <p style={{ marginBottom: 0 }}>Try another keyword or switch source tab above.</p>
            </div>
          ) : (
            moduleEntities.map((item) => {
              const isSelected = partyName === item.party_name && (leadId === item.lead_id || !item.lead_id);
              const visitedItem = visitedMap.get(item.lead_id) || visitedMap.get(item.party_name?.toLowerCase().trim());

              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className={styles.entityCard}
                  data-selected={isSelected ? 'true' : 'false'}
                  data-visited={visitedItem ? 'true' : 'false'}
                  onClick={() => onSelectEntity(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectEntity(item);
                    }
                  }}
                >
                  <div className={styles.entityInfo}>
                    <div className={styles.entityTitle}>{item.party_name}</div>
                    <div className={styles.entityMeta}>
                      {item.party_phone && (
                        <span>
                          <Phone size={11} aria-hidden="true" />
                          {item.party_phone}
                        </span>
                      )}
                      {item.party_address && (
                        <span>
                          <MapPin size={11} aria-hidden="true" />
                          {item.party_address}
                        </span>
                      )}
                    </div>
                    {(item.current_stage || visitedItem) && (
                      <div className={styles.entityBadges}>
                        {item.current_stage && <span className={styles.stageBadge}>{formatReadableStage(item.current_stage)}</span>}
                        {visitedItem && (
                          <span className={styles.visitedBadge}>
                            <CheckCircle2 size={10} aria-hidden="true" />
                            Visited ({formatVisitTimeIST(visitedItem.check_out_time)})
                          </span>
                        )}
                      </div>
                    )}
                    <TaskStageBadge info={getTaskStageInfo(item)} />
                    <TaskInstructionsBox text={getTaskInstructions(item)} compact />
                  </div>

                  <button type="button" className={styles.selectBtn} tabIndex={-1}>
                    {isSelected ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Check size={12} aria-hidden="true" /> Selected
                      </span>
                    ) : 'Select'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Right Column: Target Summary, Interaction Mode & Live GPS */}
      <section className={styles.card} aria-label="Visit setup and check-in">
        <span className={styles.sectionLabel}>Target Party Summary</span>

        {partyName && !isManualEntry ? (
          <div className={styles.selectedPartyBox}>
            <div className={styles.selectedPartyTop}>
              <strong>{partyName}</strong>
              <button type="button" className={styles.clearBtn} onClick={onClearParty}>
                Clear
              </button>
            </div>
            <div className={styles.entityMeta} style={{ marginTop: 6 }}>
              {partyPhone && <span><Phone size={11} aria-hidden="true" /> {partyPhone}</span>}
              {partyAddress && <span><MapPin size={11} aria-hidden="true" /> {partyAddress}</span>}
            </div>
            <div className={styles.entityBadges}>
              <span className={styles.pill} data-tone="accent">
                Pipeline: {activePipeline.replace('_', ' ')}
              </span>
              {selectedTask?.task_code && (
                <span
                  className={styles.pill}
                  data-tone={String(selectedTask.task_code).toUpperCase().startsWith('CHK-') ? 'healthy' : 'accent'}
                >
                  {String(selectedTask.task_code).toUpperCase().startsWith('CHK-')
                    ? `Self Check-In: ${selectedTask.task_code}`
                    : `Task: ${selectedTask.task_code}`}
                </span>
              )}
            </div>
            <TaskStageBadge info={getTaskStageInfo(selectedTask)} />
            <TaskInstructionsBox text={getTaskInstructions(selectedTask)} />
          </div>
        ) : isManualEntry ? (
          <div className={styles.manualEntryStack}>
            <input
              type="text"
              className={styles.textInput}
              value={partyName}
              onChange={(e) => onPartyNameChange(e.target.value)}
              placeholder="Walk-in firm or customer name *"
            />
            <input
              type="tel"
              className={styles.textInput}
              value={partyPhone}
              onChange={(e) => onPartyPhoneChange(e.target.value)}
              placeholder="Contact phone number"
            />
            <button
              type="button"
              className={styles.clearBtn}
              style={{ alignSelf: 'flex-start', color: '#2563eb' }}
              onClick={() => onSetManualEntry(false)}
            >
              Back to CRM client list
            </button>
          </div>
        ) : (
          <div className={styles.emptyPartyBox}>
            <strong>No client selected</strong>
            <p>Select a lead, party customer, or assigned task on the left to prepare check-in.</p>
            <button type="button" className={styles.walkinBtn} onClick={() => onSetManualEntry(true)}>
              <UserPlus size={13} aria-hidden="true" />
              Enter walk-in client manually
            </button>
          </div>
        )}

        <span className={styles.sectionLabel}>Interaction Mode</span>
        <div className={styles.modeGrid} role="group" aria-label="Interaction mode">
          {connectivityModes.map((mode) => {
            const Icon = MODE_ICON_MAP[mode.id] || Navigation;
            const active = connectivityMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                data-mode={mode.id}
                className={styles.modeTile}
                aria-pressed={active}
                onClick={() => onSelectConnectivity(mode.id)}
              >
                <Icon size={17} aria-hidden="true" />
                <strong>{mode.label}</strong>
                <small>{mode.id === 'PHYSICAL_VISIT' ? 'Petrol TA/DA eligible' : 'Zero petrol claim'}</small>
              </button>
            );
          })}
        </div>

        <div className={styles.gpsCard} data-tone={gpsTone}>
          <div className={styles.gpsTop}>
            <span>
              <MapPin size={14} color="#2563eb" aria-hidden="true" />
              Live GPS Location
            </span>
            <button type="button" className={styles.gpsRefresh} onClick={onRefreshGPS} disabled={gpsLoading}>
              <RefreshCw size={11} className={gpsLoading ? styles.spinning : undefined} aria-hidden="true" />
              {gpsLoading ? 'Locating...' : 'Refresh GPS'}
            </button>
          </div>

          {userLat != null && userLng != null ? (
            <div className={styles.gpsCoords}>
              {Number(userLat).toFixed(5)}° N, {Number(userLng).toFixed(5)}° E
              {gpsAccuracy != null && ` · ±${Math.round(gpsAccuracy)}m`}
            </div>
          ) : gpsError ? (
            <div className={styles.gpsError}>{gpsError}</div>
          ) : (
            <div className={styles.gpsCoords} style={{ color: '#64748b' }}>
              Acquiring live GPS coordinates...
            </div>
          )}

          {connectivityMode === 'PHYSICAL_VISIT' && geofenceDistance !== null && (
            <div className={styles.geofenceReadout} style={{ color: geofenceStatus === 'MISMATCH' ? '#b91c1c' : '#15803d' }}>
              {geofenceStatus === 'MISMATCH'
                ? `Flagged: ${geofenceDistance}m outside client geofence`
                : `Verified on-site (${geofenceDistance}m)`}
            </div>
          )}
        </div>

        {attendanceStatus.checked && !attendanceStatus.isPunchedIn ? (
          <button type="button" className={styles.primaryAction} data-tone="warning" onClick={onAttendanceGateClick}>
            <Lock size={15} aria-hidden="true" />
            Punch Attendance First to Check-In
          </button>
        ) : attendanceStatus.checked && attendanceStatus.isPunchedOut ? (
          <button type="button" className={styles.primaryAction} disabled>
            <Lock size={15} aria-hidden="true" />
            Shift Ended (Punched Out)
          </button>
        ) : (
          <button type="button" className={styles.primaryAction} disabled={!partyName.trim()} onClick={onStartCheckIn}>
            <Clock size={15} aria-hidden="true" />
            {selectedTask?.task_code ? `Start Check-In (${selectedTask.task_code})` : 'Start Check-In Now'}
          </button>
        )}
      </section>
    </div>
  );
});

export const ConsoleCompletedVisitsView = memo(function ConsoleCompletedVisitsView({
  visits,
  loading,
  onStartCheckInView,
}) {
  return (
    <section className={styles.card} aria-label="Today's completed visits">
      <div className={styles.cardHeader} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
        <div>
          <h2>
            <CheckCircle2 size={18} color="#16a34a" aria-hidden="true" />
            Today&apos;s Completed Visits
          </h2>
          <p>Client interactions submitted by you on {formatVisitDateIST()} (IST).</p>
        </div>
        <span className={styles.pill} data-tone="accent">Total: {visits.length}</span>
      </div>

      {loading ? (
        <div className={styles.emptyPanel}>
          <RefreshCw size={22} className={styles.spinning} aria-hidden="true" />
          <strong>Loading visit logs</strong>
          <p>Retrieving today&apos;s submitted check-out records...</p>
        </div>
      ) : visits.length === 0 ? (
        <div className={styles.emptyPanel}>
          <Calendar size={28} color="#94a3b8" aria-hidden="true" />
          <strong>No visits completed today</strong>
          <p>Switch to Walk-In / Check-In or Assigned Tasks to log your first client visit.</p>
          <button type="button" className={styles.primaryAction} style={{ width: 'auto' }} onClick={onStartCheckInView}>
            Go to Walk-In / Check-In
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visits.map((visit, idx) => (
            <article key={visit.id || idx} className={styles.visitCard}>
              <div className={styles.taskMetaRow} style={{ marginBottom: 4 }}>
                <div className={styles.badgeGroup}>
                  <strong style={{ fontSize: 14.5 }}>{visit.party_name || 'Walk-in Client'}</strong>
                  <span className={styles.pill} data-tone={visit.connectivity_mode === 'PHYSICAL_VISIT' ? 'healthy' : 'accent'}>
                    {visit.connectivity_mode === 'PHYSICAL_VISIT'
                      ? 'Physical Visit'
                      : (visit.connectivity_mode || 'Visit').replace('_', ' ')}
                  </span>
                </div>
                {visit.is_geofence_verified ? (
                  <span className={styles.pill} data-tone="healthy">On-Site Verified</span>
                ) : visit.is_geofence_flagged ? (
                  <span className={styles.pill} data-tone="danger">GPS Mismatch</span>
                ) : null}
              </div>

              <div className={styles.visitTimingStrip}>
                <div className={styles.visitTimingCell}>
                  <span>Check-In</span>
                  <strong>{formatVisitTimeIST(visit.check_in_time)}</strong>
                </div>
                <div className={styles.visitTimingCell}>
                  <span>Check-Out</span>
                  <strong>{formatVisitTimeIST(visit.check_out_time)}</strong>
                </div>
                <div className={styles.visitTimingCell}>
                  <span>Duration</span>
                  <strong>{visit.duration_minutes || 0} mins</strong>
                </div>
                <div className={styles.visitTimingCell}>
                  <span>Next Follow-Up</span>
                  <strong>{visit.next_followup_at ? formatVisitDateTimeIST(visit.next_followup_at) : 'Not scheduled'}</strong>
                </div>
              </div>

              {(visit.lead_stage_updated || visit.discussion_notes || visit.photo_watermark_urls?.length > 0 || visit.customer_signature_url) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  {visit.lead_stage_updated && (
                    <div>
                      <strong>Stage updated: </strong>
                      <span className={styles.pill}>{formatReadableStage(visit.lead_stage_updated)}</span>
                    </div>
                  )}
                  {visit.discussion_notes && (
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', color: '#475569' }}>
                      <strong style={{ color: '#0f172a' }}>Notes: </strong>{visit.discussion_notes}
                    </div>
                  )}
                  <div className={styles.entityMeta}>
                    {visit.photo_watermark_urls?.length > 0 && (
                      <span style={{ color: '#0284c7', fontWeight: 600 }}>
                        <Camera size={12} aria-hidden="true" />
                        {visit.photo_watermark_urls.length} Watermarked Photo(s)
                      </span>
                    )}
                    {visit.customer_signature_url && (
                      <span style={{ color: '#15803d', fontWeight: 600 }}>
                        <PenTool size={12} aria-hidden="true" />
                        Customer E-Signature Verified
                      </span>
                    )}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
});

export const ConsoleActiveVisitView = memo(function ConsoleActiveVisitView({
  partyName,
  elapsedMinutes,
  connectivityMode,
  taskCode = '',
  taskDescription = '',
  taskStage = '',
  taskStageLabel = '',
  pipelines = [],
  activePipeline,
  onPipelineChange,
  crmLeadStages = [],
  leadStage,
  initialLeadStage = '',
  onLeadStageChange,
  orderDeliveryStages = [],
  orderDeliveryStage,
  onOrderDeliveryStageChange,
  workOutcome,
  onWorkOutcomeChange,
  customForms = [],
  selectedFormId,
  onSelectedFormChange,
  nextFollowup,
  onNextFollowupChange,
  discussionNotes,
  onDiscussionNotesChange,
  isListening,
  onToggleVoice,
  photos = [],
  isWatermarking,
  onCapturePhoto,
  onRemovePhoto,
  signatureCanvasRef,
  onStartDrawing,
  onDraw,
  onStopDrawing,
  onClearSignature,
  onCompleteCheckOut,
  // Dynamic Visit Type Props
  visitType = 'Lead Pipeline',
  onVisitTypeChange,
  availableProducts = [],
  orderFollowupOutcome = 'ORDER_PLACED',
  onOrderFollowupOutcomeChange,
  orderStatus = 'Order Confirmed & Placed',
  onOrderStatusChange,
  noOrderReason = '',
  onNoOrderReasonChange,
  nextRequirementDate = '',
  onNextRequirementDateChange,
  orderItems = [],
  onOrderItemsChange,
  advancePayment = 0,
  onAdvancePaymentChange,
  paymentMode = 'UPI',
  onPaymentModeChange,
  serviceStatus = '',
  onServiceStatusChange,
  serviceRemark = '',
  onServiceRemarkChange,
  hasFollowUp = false,
  onHasFollowUpChange,
  materialStatus = 'Material Received OK',
  onMaterialStatusChange,
  materialChallanNo = '',
  onMaterialChallanNoChange,
  // Complaint Scope & Pipeline Props
  complaintTargetType = 'PARTY_MASTER',
  onComplaintTargetTypeChange,
  complaintChassisSerial = '',
  onComplaintChassisSerialChange,
  complaintProductName = '',
  onComplaintProductNameChange,
  complaintStage = 'C04 - On-Site Execution & Digital Job Card',
  onComplaintStageChange,
  onBackToCockpit,
}) {
  const [showAdvancedPipeline, setShowAdvancedPipeline] = useState(false);
  const isComplaintIncomplete = (visitType === 'Service for NSMLR Product' || activePipeline === 'COMPLAINT_SERVICE') && workOutcome === 'WORK_INCOMPLETE';

  // Calculate order total
  const orderTotalAmount = (orderItems || []).reduce(
    (sum, item) => sum + (Number(item.quantity || 0) * Number(item.price || 0)),
    0
  );

  const handleAddOrderItem = () => {
    if (!onOrderItemsChange) return;
    onOrderItemsChange([
      ...(orderItems || []),
      { productName: '', quantity: 1, price: 0, remarks: '' }
    ]);
  };

  const handleUpdateOrderItem = (idx, field, value) => {
    if (!onOrderItemsChange) return;
    const updated = [...(orderItems || [])];
    updated[idx] = { ...updated[idx], [field]: value };
    onOrderItemsChange(updated);
  };

  const handleUpdateOrderItemFields = (idx, fieldsObj) => {
    if (!onOrderItemsChange) return;
    const updated = [...(orderItems || [])];
    updated[idx] = { ...updated[idx], ...fieldsObj };
    onOrderItemsChange(updated);
  };

  const handleRemoveOrderItem = (idx) => {
    if (!onOrderItemsChange) return;
    onOrderItemsChange((orderItems || []).filter((_, i) => i !== idx));
  };

  return (
    <div style={{ maxWidth: 540, margin: '0 auto' }}>
      {/* 1. Header (Check Out) */}
      <div className={styles.checkoutHeroHeader}>
        {onBackToCockpit && (
          <button
            type="button"
            className={styles.modalBackBtn}
            onClick={onBackToCockpit}
            aria-label="Back to home"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
        )}
        <h2 className={styles.modalTitle}>Check Out</h2>
      </div>

      {/* 2. Customer Sub-bar */}
      <div className={styles.checkoutCustomerBar}>
        <span>Customer : <strong>{partyName || 'Customer Visit'}</strong></span>
        {taskCode && <span style={{ marginLeft: 8, fontSize: 11.5, color: '#64748b' }}>({taskCode})</span>}
      </div>

      <div className={styles.checkoutStack} id="checkout-output-section" style={{ background: '#ffffff', padding: '16px 14px' }}>
        {/* 3. Visit Type Selector - Lead Pipeline 1st in list as requested */}
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
            Select Visit Type & Operational Pipeline *
          </label>
          <select
            className={styles.formSelect}
            value={visitType}
            onChange={(e) => onVisitTypeChange && onVisitTypeChange(e.target.value)}
            style={{ fontSize: 14, fontWeight: 700, padding: '10px 12px', border: '1.5px solid #0284c7', background: '#f0f9ff', color: '#0369a1' }}
          >
            <option value="Lead Pipeline">🎯 Lead Pipeline & Meeting (01 - 08)</option>
            <option value="Order Taking">📦 Order Taking & Daily Order Follow-up (S01 - S13)</option>
            <option value="Service for NSMLR Product">🛠️ Service & Complaint Issues (Party / End Customer)</option>
            <option value="Material Checking and Receiving">🤝 Material Checking & Inspection</option>
          </select>
        </div>

        {/* 4. Form Content based on Visit Type */}

        {/* 4A. LEAD PIPELINE WORKFLOW */}
        {visitType === 'Lead Pipeline' && (() => {
          const baselineStageStr = initialLeadStage || leadStage || '2;01>Contact Stage>Contacted';
          const matchBaseline = baselineStageStr.match(/^(\d+);(\d+)>([^>]+)>([^>]+)$/);
          const currentStageNum = matchBaseline ? parseInt(matchBaseline[1], 10) : 2;
          const currentStageName = matchBaseline ? matchBaseline[3] : 'Contact Stage';
          const currentSubstage = matchBaseline ? matchBaseline[4] : 'Contacted';

          const nextStageNum = Math.min(8, currentStageNum < 8 ? currentStageNum + 1 : currentStageNum);
          const nextStageObj = crmLeadStages[nextStageNum - 1] || null;
          const nextStageCleanName = nextStageObj?.name?.replace(/^\d+\s*-\s*/, '') || '';

          const matchSelected = (leadStage || '').match(/^(\d+);(\d+)>([^>]+)>([^>]+)$/);
          const isChanged = leadStage && leadStage !== baselineStageStr;

          return (
            <div style={{ marginTop: 14 }}>
              <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', marginBottom: 12, fontSize: 12, color: '#166534' }}>
                <strong>🎯 CRM Lead Pipeline: </strong> Advance prospect through 8 stages from initial contact to party transfer.
              </div>

              {/* Stage Guidance & Status Card */}
              <div className={styles.stageGuidanceCard}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      📍 Preselected / Current Stage
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0369a1', marginTop: 2 }}>
                      0{currentStageNum} - {currentStageName} ➔ <span style={{ color: '#0284c7' }}>{currentSubstage}</span>
                    </div>
                  </div>
                  {isChanged ? (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
                      ⚡ Changed: {matchSelected ? `0${matchSelected[1]} - ${matchSelected[4]}` : 'Updated'}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                      ✓ Preselected Baseline
                    </span>
                  )}
                </div>

                {/* Next Recommended Stage Quick Select Pills */}
                {nextStageObj && nextStageNum !== currentStageNum && (
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>👉 Recommended Next:</span>
                      <strong>{nextStageObj.name}</strong>
                    </div>
                    <div className={styles.stagePillsRow}>
                      {nextStageObj.substages.slice(0, 5).map((sub, j) => {
                        const subNum = String(j + 1).padStart(2, '0');
                        const pillVal = `${nextStageNum};${subNum}>${nextStageCleanName}>${sub}`;
                        const isSelectedPill = leadStage === pillVal;
                        return (
                          <button
                            key={pillVal}
                            type="button"
                            className={styles.stageQuickPill}
                            data-active={isSelectedPill ? 'true' : undefined}
                            onClick={() => onLeadStageChange(pillVal)}
                          >
                            <span>⭐ {sub}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                  Update Lead Stage (01 - 08) *
                </label>
                <select className={styles.formSelect} value={leadStage} onChange={(e) => onLeadStageChange(e.target.value)}>
                  {leadStage && !crmLeadStages.some((st) => st.substages.some((sub) => leadStage.includes(sub))) && (
                    <option value={leadStage}>📍 [CURRENT] {leadStage}</option>
                  )}
                  {crmLeadStages.map((stageObj, i) => {
                    const stageNum = i + 1;
                    const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
                    return (
                      <optgroup key={`stage-${i}`} label={stageObj.name}>
                        {stageObj.substages.map((sub, j) => {
                          const subNum = String(j + 1).padStart(2, '0');
                          const formattedVal = `${stageNum};${subNum}>${cleanStageName}>${sub}`;
                          const isPreselected = formattedVal === baselineStageStr;
                          const isNextStage = stageNum === nextStageNum && nextStageNum !== currentStageNum;
                          const isFuture = stageNum > nextStageNum;
                          const isPast = stageNum < currentStageNum;

                          let labelPrefix = '';
                          if (isPreselected) {
                            labelPrefix = '📍 [CURRENT / PRESELECTED] ';
                          } else if (isNextStage) {
                            labelPrefix = '⭐ [RECOMMENDED NEXT] ';
                          } else if (isFuture) {
                            labelPrefix = '⏩ ';
                          } else if (isPast) {
                            labelPrefix = '⏮️ [Past Stage] ';
                          }

                          return (
                            <option key={formattedVal} value={formattedVal}>
                              {labelPrefix}{formattedVal}
                            </option>
                          );
                        })}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>Discussion & Meeting Notes</label>
                  <button
                    type="button"
                    className={styles.walkinBtn}
                    style={isListening ? { background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626' } : undefined}
                    onClick={onToggleVoice}
                  >
                    {isListening ? <MicOff size={13} aria-hidden="true" /> : <Mic size={13} aria-hidden="true" />}
                    {isListening ? 'Listening...' : 'Voice-to-Text'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  className={styles.textareaInput}
                  value={discussionNotes}
                  onChange={(e) => onDiscussionNotesChange(e.target.value)}
                  placeholder="Client requirements, budget discussions, competitor details..."
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                  Next Follow-Up (IST) *
                </label>
                <input
                  type="datetime-local"
                  className={styles.textInput}
                  value={nextFollowup}
                  onChange={(e) => onNextFollowupChange(e.target.value)}
                />
                <div className={styles.quickPresetRow} style={{ marginTop: 6 }}>
                  <button type="button" onClick={() => onNextFollowupChange(buildISTFollowupPreset(1))}>+1 Day (11 AM)</button>
                  <button type="button" onClick={() => onNextFollowupChange(buildISTFollowupPreset(3))}>+3 Days (11 AM)</button>
                  <button type="button" onClick={() => onNextFollowupChange(buildISTFollowupPreset(7))}>Next Week</button>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                  Meeting Photo Proof
                </label>
                <label className={styles.photoProofBox}>
                  <Camera size={26} color="#0284c7" aria-hidden="true" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0284c7' }}>
                    {isWatermarking ? 'Stamping Watermark...' : 'Add Photo!'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={onCapturePhoto}
                    style={{ display: 'none' }}
                    disabled={isWatermarking}
                  />
                </label>

                {photos.length > 0 && (
                  <div className={styles.photoStrip} style={{ marginTop: 10 }}>
                    {photos.map((p, idx) => (
                      <div key={idx} className={styles.photoThumb}>
                        <img src={p.url} alt={`Lead meeting proof ${idx + 1}`} />
                        <button type="button" className={styles.photoRemove} aria-label={`Remove photo ${idx + 1}`} onClick={() => onRemovePhoto(idx)}>
                          <X size={11} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* 4B. ORDER TAKING & DAILY ORDER FOLLOW-UP WORKFLOW */}
        {visitType === 'Order Taking' && (
          <div style={{ marginTop: 14 }}>
            <div style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe', marginBottom: 12, fontSize: 12, color: '#1e40af' }}>
              <strong>⚡ Daily Order Follow-up & Booking: </strong> Record dealer meeting outcome, check stock, schedule next requirement, or punch sales orders.
            </div>

            {/* Follow-up Disposition Cards */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                Order Follow-up Outcome (Meeting Disposition) *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onOrderFollowupOutcomeChange && onOrderFollowupOutcomeChange('ORDER_PLACED')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 8,
                    border: orderFollowupOutcome === 'ORDER_PLACED' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                    background: orderFollowupOutcome === 'ORDER_PLACED' ? '#f0fdf4' : '#ffffff',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: orderFollowupOutcome === 'ORDER_PLACED' ? '#166534' : '#334155' }}>
                    🛒 Order Confirmed
                  </div>
                  <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>Booking sales order today</div>
                </button>
                <button
                  type="button"
                  onClick={() => onOrderFollowupOutcomeChange && onOrderFollowupOutcomeChange('NO_ORDER')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 8,
                    border: orderFollowupOutcome === 'NO_ORDER' ? '2px solid #ea580c' : '1px solid #cbd5e1',
                    background: orderFollowupOutcome === 'NO_ORDER' ? '#fff7ed' : '#ffffff',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: orderFollowupOutcome === 'NO_ORDER' ? '#9a3412' : '#334155' }}>
                    📦 Stock Full / No Order
                  </div>
                  <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>Sufficient stock in godown</div>
                </button>
                <button
                  type="button"
                  onClick={() => onOrderFollowupOutcomeChange && onOrderFollowupOutcomeChange('RESCHEDULED')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 8,
                    border: orderFollowupOutcome === 'RESCHEDULED' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                    background: orderFollowupOutcome === 'RESCHEDULED' ? '#f0f9ff' : '#ffffff',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: orderFollowupOutcome === 'RESCHEDULED' ? '#0369a1' : '#334155' }}>
                    📅 Re-visit Scheduled
                  </div>
                  <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>Discussion done / follow-up due</div>
                </button>
                <button
                  type="button"
                  onClick={() => onOrderFollowupOutcomeChange && onOrderFollowupOutcomeChange('CLOSED')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 8,
                    border: orderFollowupOutcome === 'CLOSED' ? '2px solid #64748b' : '1px solid #cbd5e1',
                    background: orderFollowupOutcome === 'CLOSED' ? '#f8fafc' : '#ffffff',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: orderFollowupOutcome === 'CLOSED' ? '#334155' : '#64748b' }}>
                    ⏳ Closed / Busy
                  </div>
                  <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>Counter closed or owner busy</div>
                </button>
              </div>
            </div>

            {/* When Order is Placed / Confirmed */}
            {orderFollowupOutcome === 'ORDER_PLACED' && (
              <>
                {/* Order Pipeline Stage */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Order to Delivery Stage (S01 - S13) *
                  </label>
                  <select
                    className={styles.formSelect}
                    value={orderDeliveryStage}
                    onChange={(e) => onOrderDeliveryStageChange && onOrderDeliveryStageChange(e.target.value)}
                  >
                    {orderDeliveryStages.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Order Status *
                  </label>
                  <select
                    className={styles.formSelect}
                    value={orderStatus}
                    onChange={(e) => onOrderStatusChange && onOrderStatusChange(e.target.value)}
                  >
                    <option value="Order Confirmed & Placed">Order Confirmed & Placed</option>
                    <option value="Advance Payment Received">Advance Payment Received</option>
                    <option value="Quotation Pending">Quotation Pending</option>
                    <option value="Sample Order Placed">Sample Order Placed</option>
                    <option value="Under Negotiation / Review">Under Negotiation / Review</option>
                  </select>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
                      Order Products & Pricing (Search & Select from Catalog) *
                    </label>
                    <button
                      type="button"
                      className={styles.addItemBtn}
                      onClick={handleAddOrderItem}
                      title="Add product row"
                    >
                      <Plus size={14} aria-hidden="true" />
                      Add Product
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(orderItems || []).map((item, idx) => (
                      <div key={idx} className={styles.orderItemCard}>
                        <div className={styles.orderItemCardTop}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <SearchableProductSelect
                              products={availableProducts}
                              value={item.productName}
                              onChange={(val) => {
                                const prodObj = (typeof val === 'object' && val !== null) ? val : null;
                                const prodName = prodObj?.name || (typeof val === 'string' ? val : '');
                                const prodPrice = prodObj?.price != null && prodObj?.price !== '' ? Number(prodObj.price) : null;

                                handleUpdateOrderItemFields(idx, {
                                  productName: prodName,
                                  ...(prodPrice != null ? { price: prodPrice } : {})
                                });
                              }}
                              placeholder="Search & select product from catalog..."
                              showPrice={true}
                            />
                          </div>
                          {(orderItems || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveOrderItem(idx)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#dc2626',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: 4,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}
                              aria-label="Remove item"
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          )}
                        </div>

                        <div className={styles.orderItemCardBottom}>
                          <div>
                            <label className={styles.orderItemFieldLabel}>Qty (Units)</label>
                            <input
                              type="number"
                              min="1"
                              className={styles.orderItemMiniInput}
                              value={item.quantity}
                              onChange={(e) => handleUpdateOrderItem(idx, 'quantity', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className={styles.orderItemFieldLabel}>Rate / Price (₹)</label>
                            <input
                              type="number"
                              min="0"
                              className={styles.orderItemMiniInput}
                              value={item.price}
                              onChange={(e) => handleUpdateOrderItem(idx, 'price', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className={styles.orderItemFieldLabel}>Item Total</label>
                            <div className={styles.orderItemLineTotal}>
                              ₹{((Number(item.quantity) || 0) * (Number(item.price) || 0)).toLocaleString('en-IN')}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {orderTotalAmount > 0 && (
                    <div style={{ textAlign: 'right', marginTop: 10, fontSize: 13, fontWeight: 700, color: '#0f172a', padding: '6px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      Estimated Order Total: <span style={{ color: '#16a34a', fontSize: 15 }}>₹{orderTotalAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>

                {/* Advance Payment Details */}
                <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Advance Collected (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      className={styles.textInput}
                      placeholder="₹ 0.00"
                      value={advancePayment}
                      onChange={(e) => onAdvancePaymentChange && onAdvancePaymentChange(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Payment Mode
                    </label>
                    <select
                      className={styles.formSelect}
                      value={paymentMode}
                      onChange={(e) => onPaymentModeChange && onPaymentModeChange(e.target.value)}
                    >
                      <option value="UPI">UPI / QR Code</option>
                      <option value="NEFT">Bank Transfer (NEFT/RTGS)</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* When Stock is Full / No Order */}
            {orderFollowupOutcome === 'NO_ORDER' && (
              <div style={{ marginTop: 12, padding: 12, background: '#fff7ed', borderRadius: 8, border: '1px solid #fed7aa' }}>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#9a3412', display: 'block', marginBottom: 4 }}>
                    Reason for No Order *
                  </label>
                  <select
                    className={styles.formSelect}
                    value={noOrderReason}
                    onChange={(e) => onNoOrderReasonChange && onNoOrderReasonChange(e.target.value)}
                  >
                    <option value="SUFFICIENT_STOCK">Sufficient Stock in Godown</option>
                    <option value="PRICE_COMPETITOR">Price Discrepancy / Competitor Scheme</option>
                    <option value="SEASON_SLUMP">Off-season / Slow Retail Demand</option>
                    <option value="PAYMENT_HOLD">Previous Payment Clearance Pending</option>
                    <option value="OTHER">Other Commercial Reason</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#9a3412', display: 'block', marginBottom: 4 }}>
                    Next Expected Requirement Date
                  </label>
                  <input
                    type="date"
                    className={styles.textInput}
                    value={nextRequirementDate}
                    onChange={(e) => onNextRequirementDateChange && onNextRequirementDateChange(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* When Re-visit is Scheduled */}
            {orderFollowupOutcome === 'RESCHEDULED' && (
              <div style={{ marginTop: 12, padding: 12, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', display: 'block', marginBottom: 4 }}>
                    Re-visit Scheduled Reason *
                  </label>
                  <select
                    className={styles.formSelect}
                    value={noOrderReason}
                    onChange={(e) => onNoOrderReasonChange && onNoOrderReasonChange(e.target.value)}
                  >
                    <option value="KEY_PERSON_ABSENT">Key Decision Maker Absent / In Travel</option>
                    <option value="DISCUSSION_PENDING">Product Demonstration / Quotation Requested</option>
                    <option value="PAYMENT_ARRANGEMENT">Arranging Advance / Credit Approval</option>
                    <option value="OTHER">Follow-up Discussion Pending</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', display: 'block', marginBottom: 4 }}>
                    Re-visit Date & Time (IST) *
                  </label>
                  <input
                    type="datetime-local"
                    className={styles.textInput}
                    value={nextFollowup}
                    onChange={(e) => onNextFollowupChange(e.target.value)}
                  />
                  <div className={styles.quickPresetRow} style={{ marginTop: 6 }}>
                    <button type="button" onClick={() => onNextFollowupChange(buildISTFollowupPreset(1))}>+1 Day (11 AM)</button>
                    <button type="button" onClick={() => onNextFollowupChange(buildISTFollowupPreset(3))}>+3 Days (11 AM)</button>
                    <button type="button" onClick={() => onNextFollowupChange(buildISTFollowupPreset(7))}>Next Week</button>
                  </div>
                </div>
              </div>
            )}

            {/* When Counter is Closed */}
            {orderFollowupOutcome === 'CLOSED' && (
              <div style={{ marginTop: 12, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                  Counter / Shop Status *
                </label>
                <select
                  className={styles.formSelect}
                  value={noOrderReason}
                  onChange={(e) => onNoOrderReasonChange && onNoOrderReasonChange(e.target.value)}
                >
                  <option value="SHOP_CLOSED">Premises / Shop Shutter Closed</option>
                  <option value="OWNER_BUSY">Owner Busy / Refused Discussion</option>
                  <option value="RELOCATED">Address Relocated / Contact Changed</option>
                  <option value="UNREACHABLE">Phone Unreachable / Not Attending</option>
                </select>
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>Order Discussion & Notes</label>
                <button
                  type="button"
                  className={styles.walkinBtn}
                  style={isListening ? { background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626' } : undefined}
                  onClick={onToggleVoice}
                >
                  {isListening ? <MicOff size={13} aria-hidden="true" /> : <Mic size={13} aria-hidden="true" />}
                  {isListening ? 'Listening...' : 'Voice-to-Text'}
                </button>
              </div>
              <textarea
                rows={2}
                className={styles.textareaInput}
                value={discussionNotes}
                onChange={(e) => onDiscussionNotesChange(e.target.value)}
                placeholder="Commitments, expected delivery date, transporter preference, market feedback..."
              />
            </div>
          </div>
        )}

        {/* 4C. SERVICE & COMPLAINT ISSUES (PARTY MASTER VS END CUSTOMER) */}
        {visitType === 'Service for NSMLR Product' && (
          <div style={{ marginTop: 14 }}>
            <div className={styles.locationFetchNotice}>
              <span>GPS Location will be fetched automatically before submit</span>
              <div style={{ display: 'flex', gap: 6, color: '#0284c7' }}>
                <Navigation size={15} aria-hidden="true" />
                <MapPin size={15} aria-hidden="true" />
              </div>
            </div>

            {/* Target Scope Switcher (Party vs End Customer) */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                Whose Complaint / Service Issue is this? *
              </label>
              <div className={styles.complaintScopeSelector}>
                <button
                  type="button"
                  className={styles.complaintScopePill}
                  data-active={complaintTargetType === 'PARTY_MASTER'}
                  onClick={() => onComplaintTargetTypeChange && onComplaintTargetTypeChange('PARTY_MASTER')}
                >
                  <Building2 size={16} aria-hidden="true" />
                  <span>🏢 Party Master (Dealer)</span>
                </button>
                <button
                  type="button"
                  className={styles.complaintScopePill}
                  data-active={complaintTargetType === 'END_CUSTOMER'}
                  onClick={() => onComplaintTargetTypeChange && onComplaintTargetTypeChange('END_CUSTOMER')}
                >
                  <User size={16} aria-hidden="true" />
                  <span>🚜 End Customer (Farmer)</span>
                </button>
              </div>
            </div>

            {/* Machine & Chassis Details */}
            <div style={{ padding: 12, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', marginBottom: 8 }}>
                {complaintTargetType === 'END_CUSTOMER' ? '🚜 Machine & Owner Identification' : '🏢 Dealership Identification'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                    Product / Machine Model *
                  </label>
                  <input
                    type="text"
                    className={styles.textInput}
                    placeholder="e.g. Rotary Tiller 7ft / Laser Leveler"
                    value={complaintProductName}
                    onChange={(e) => onComplaintProductNameChange && onComplaintProductNameChange(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                    Chassis / Serial Number
                  </label>
                  <input
                    type="text"
                    className={styles.textInput}
                    placeholder="e.g. NS-RT-2026-089"
                    value={complaintChassisSerial}
                    onChange={(e) => onComplaintChassisSerialChange && onComplaintChassisSerialChange(e.target.value.toUpperCase())}
                  />
                </div>
              </div>
            </div>

            {/* Complaint Ticket Stage */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                Complaint Ticket Stage (C01 - C06) *
              </label>
              <select
                className={styles.formSelect}
                value={complaintStage}
                onChange={(e) => onComplaintStageChange && onComplaintStageChange(e.target.value)}
              >
                <option value="C04 - On-Site Execution & Digital Job Card">C04 - On-Site Execution & Digital Job Card</option>
                <option value="C05 - Customer Verification & Sign-off">C05 - Customer Verification & Sign-off</option>
                <option value="C01 - Ticket Generation & Logging">C01 - Ticket Generation & Logging</option>
                <option value="C02 - RCA & Resolution Path">C02 - RCA & Resolution Path</option>
                <option value="C03 - Service Engineer Deputation">C03 - Service Engineer Deputation</option>
                <option value="C06 - Audit & Closure">C06 - Audit & Closure</option>
              </select>
            </div>

            {/* Work Resolution Outcome */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                Resolution Outcome *
              </label>
              <div className={styles.modeGrid}>
                <button
                  type="button"
                  className={styles.modeTile}
                  aria-pressed={workOutcome === 'WORK_DONE'}
                  onClick={() => onWorkOutcomeChange('WORK_DONE')}
                >
                  <ShieldCheck size={16} aria-hidden="true" />
                  <strong>Work Completed</strong>
                  <small>Issue fixed on site</small>
                </button>
                <button
                  type="button"
                  className={styles.modeTile}
                  aria-pressed={workOutcome === 'WORK_INCOMPLETE'}
                  onClick={() => onWorkOutcomeChange('WORK_INCOMPLETE')}
                >
                  <Clock size={16} aria-hidden="true" />
                  <strong>Parts Pending / Incomplete</strong>
                  <small>Requires revisit</small>
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                Status Description *
              </label>
              <select
                className={styles.formSelect}
                value={serviceStatus}
                onChange={(e) => onServiceStatusChange && onServiceStatusChange(e.target.value)}
              >
                <option value="">Please select</option>
                <option value="Issue Solved / Machine Ready">Issue Solved / Machine Ready</option>
                <option value="Under Observation">Under Observation</option>
                <option value="Spare Part Replacement Required">Spare Part Replacement Required</option>
                <option value="Customer Confirmation Pending">Customer Confirmation Pending</option>
                <option value="Unresolved / Escalated to Plant">Unresolved / Escalated to Plant</option>
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                Service Engineer Remarks *
              </label>
              <textarea
                rows={2}
                className={styles.textareaInput}
                placeholder="RCA findings, parts replaced, work carried out..."
                value={serviceRemark}
                onChange={(e) => onServiceRemarkChange && onServiceRemarkChange(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                Solved Proof / Job Card Photo *
              </label>
              <label className={styles.photoProofBox}>
                <Camera size={26} color="#0284c7" aria-hidden="true" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0284c7' }}>
                  {isWatermarking ? 'Stamping Watermark...' : 'Add Photo!'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onCapturePhoto}
                  style={{ display: 'none' }}
                  disabled={isWatermarking}
                />
              </label>

              {photos.length > 0 && (
                <div className={styles.photoStrip} style={{ marginTop: 10 }}>
                  {photos.map((p, idx) => (
                    <div key={idx} className={styles.photoThumb}>
                      <img src={p.url} alt={`Service proof ${idx + 1}`} />
                      <button type="button" className={styles.photoRemove} aria-label={`Remove photo ${idx + 1}`} onClick={() => onRemovePhoto(idx)}>
                        <X size={11} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.toggleContainer}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                Follow Up Required {isComplaintIncomplete ? '(Mandatory)' : ''}
              </span>
              <label className={styles.switchToggle}>
                <input
                  type="checkbox"
                  checked={hasFollowUp || isComplaintIncomplete}
                  onChange={(e) => onHasFollowUpChange && onHasFollowUpChange(e.target.checked)}
                />
                <span className={styles.switchSlider}></span>
              </label>
            </div>

            {(hasFollowUp || isComplaintIncomplete) && (
              <div style={{ marginTop: 10, padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                  Follow-up Date & Time (IST) *
                </label>
                <input
                  type="datetime-local"
                  className={styles.textInput}
                  value={nextFollowup}
                  onChange={(e) => onNextFollowupChange(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {/* 4D. MATERIAL CHECKING WORKFLOW */}
        {visitType === 'Material Checking and Receiving' && (
          <div style={{ marginTop: 14 }}>
            <div className={styles.locationFetchNotice}>
              <span>Delivery location validation active</span>
              <MapPin size={15} color="#0284c7" aria-hidden="true" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                Inspection Status *
              </label>
              <select
                className={styles.formSelect}
                value={materialStatus}
                onChange={(e) => onMaterialStatusChange && onMaterialStatusChange(e.target.value)}
              >
                <option value="Material Received OK">Material Received OK & Verified</option>
                <option value="Shortage Reported">Shortage / Partial Material Received</option>
                <option value="Damage Reported">Damaged Goods Reported</option>
                <option value="Return / Rejected">Rejected / Discrepancy Found</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                Challan / Invoice Number
              </label>
              <input
                type="text"
                className={styles.textInput}
                placeholder="e.g. INV-2026-9021 or Challan No."
                value={materialChallanNo}
                onChange={(e) => onMaterialChallanNoChange && onMaterialChallanNoChange(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                Challan / POD Photo Proof
              </label>
              <label className={styles.photoProofBox}>
                <Camera size={26} color="#0284c7" aria-hidden="true" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0284c7' }}>
                  {isWatermarking ? 'Stamping Watermark...' : 'Upload POD / Challan Photo'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onCapturePhoto}
                  style={{ display: 'none' }}
                  disabled={isWatermarking}
                />
              </label>

              {photos.length > 0 && (
                <div className={styles.photoStrip} style={{ marginTop: 10 }}>
                  {photos.map((p, idx) => (
                    <div key={idx} className={styles.photoThumb}>
                      <img src={p.url} alt={`POD proof ${idx + 1}`} />
                      <button type="button" className={styles.photoRemove} aria-label={`Remove photo ${idx + 1}`} onClick={() => onRemovePhoto(idx)}>
                        <X size={11} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                Inspection Notes / Observations
              </label>
              <textarea
                rows={2}
                className={styles.textareaInput}
                value={discussionNotes}
                onChange={(e) => onDiscussionNotesChange(e.target.value)}
                placeholder="Material condition, seal integrity, unloading remarks..."
              />
            </div>
          </div>
        )}

        {/* 5. Collapsible Advanced Settings (Custom Forms) */}
        {customForms?.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px dashed #cbd5e1', paddingTop: 10 }}>
            <button
              type="button"
              onClick={() => setShowAdvancedPipeline(prev => !prev)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                color: '#0284c7',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: 0
              }}
            >
              <span>{showAdvancedPipeline ? '▼ Hide Assigned Custom Form' : '▶ Attach Assigned Custom Form'}</span>
            </button>

            {showAdvancedPipeline && (
              <div style={{ marginTop: 10, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <span className={styles.sectionLabel}>Select Custom Form</span>
                <select className={styles.formSelect} value={selectedFormId} onChange={(e) => onSelectedFormChange(e.target.value)}>
                  {customForms.map((f) => (
                    <option key={f.id} value={f.id}>{f.title} ({f.data_type})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* 6. Big Orange / Red Action Button (CHECK OUT) */}
        <div style={{ marginTop: 20 }}>
          <button
            type="button"
            className={styles.orangeCheckOutBtn}
            onClick={onCompleteCheckOut}
          >
            <CheckCircle2 size={18} aria-hidden="true" />
            CHECK OUT
          </button>
        </div>
      </div>
    </div>
  );
});
