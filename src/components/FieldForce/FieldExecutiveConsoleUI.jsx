'use client';

import React, { memo } from 'react';
import {
  AlertTriangle, Building, Building2, Calendar, Camera, Check, CheckCircle2,
  Clock, FileText, Layers, Lock, Mail, MapPin, MessageSquare, Mic, MicOff,
  Navigation, PenTool, Phone, Play, RefreshCw, Search, ShieldCheck,
  UserPlus, Wifi, WifiOff, X,
} from 'lucide-react';
import styles from './FieldExecutiveConsole.module.css';

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
            const priorityTone = task.priority === 'URGENT' ? 'danger' : task.priority === 'HIGH' ? 'warning' : 'muted';

            return (
              <article key={task.id} className={styles.taskCard}>
                <div>
                  <div className={styles.taskMetaRow}>
                    <div className={styles.badgeGroup}>
                      <span className={styles.pill} data-tone="accent">{task.task_code || 'TASK'}</span>
                      <span className={styles.pill} data-tone={priorityTone}>{task.priority || 'MEDIUM'}</span>
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
                <span className={styles.pill} data-tone="healthy">
                  Task: {selectedTask.task_code}
                </span>
              )}
            </div>
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
  pipelines,
  activePipeline,
  onPipelineChange,
  crmLeadStages,
  leadStage,
  onLeadStageChange,
  orderDeliveryStages,
  orderDeliveryStage,
  onOrderDeliveryStageChange,
  workOutcome,
  onWorkOutcomeChange,
  customForms,
  selectedFormId,
  onSelectedFormChange,
  nextFollowup,
  onNextFollowupChange,
  discussionNotes,
  onDiscussionNotesChange,
  isListening,
  onToggleVoice,
  photos,
  isWatermarking,
  onCapturePhoto,
  onRemovePhoto,
  signatureCanvasRef,
  onStartDrawing,
  onDraw,
  onStopDrawing,
  onClearSignature,
  onCompleteCheckOut,
}) {
  const isComplaintIncomplete = activePipeline === 'COMPLAINT_SERVICE' && workOutcome === 'WORK_INCOMPLETE';

  return (
    <div>
      <div className={styles.activeVisitBanner}>
        <div>
          <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.7, opacity: 0.85 }}>Visit In Progress</span>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{partyName}</div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>
            Duration: <strong>{elapsedMinutes} mins</strong> · {String(connectivityMode || '').replace('_', ' ')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => document.getElementById('checkout-output-section')?.scrollIntoView({ behavior: 'smooth' })}
        >
          Jump to Check-Out
        </button>
      </div>

      <div className={styles.checkoutStack} id="checkout-output-section">
        <section className={styles.card}>
          <span className={styles.sectionLabel}>Target Pipeline & Stage</span>
          <select className={styles.formSelect} value={activePipeline} onChange={(e) => onPipelineChange(e.target.value)}>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>

          {activePipeline === 'LEAD_DATA' && (
            <div style={{ marginTop: 12 }}>
              <span className={styles.sectionLabel}>Update Lead Stage</span>
              <select className={styles.formSelect} value={leadStage} onChange={(e) => onLeadStageChange(e.target.value)}>
                {leadStage && !crmLeadStages.some((st) => st.substages.some((sub) => leadStage.includes(sub))) && (
                  <option value={leadStage}>Current: {leadStage}</option>
                )}
                {crmLeadStages.map((stageObj, i) => {
                  const stageNum = i + 1;
                  const cleanStageName = stageObj.name.replace(/^\d+\s*-\s*/, '');
                  return (
                    <optgroup key={`stage-${i}`} label={stageObj.name}>
                      {stageObj.substages.map((sub, j) => {
                        const subNum = String(j + 1).padStart(2, '0');
                        const formattedVal = `${stageNum};${subNum}>${cleanStageName}>${sub}`;
                        return <option key={formattedVal} value={formattedVal}>{formattedVal}</option>;
                      })}
                    </optgroup>
                  );
                })}
              </select>
            </div>
          )}

          {activePipeline === 'ORDER_DELIVERY' && (
            <div style={{ marginTop: 12 }}>
              <span className={styles.sectionLabel}>Order to Delivery Stage</span>
              <select className={styles.formSelect} value={orderDeliveryStage} onChange={(e) => onOrderDeliveryStageChange(e.target.value)}>
                {orderDeliveryStages.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {activePipeline === 'COMPLAINT_SERVICE' && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 9, border: '1px solid #cbd5e1', background: '#f8fafc' }}>
              <div className={styles.taskMetaRow}>
                <span className={styles.pill} data-tone="accent">Sequential Complaint Pipeline</span>
                <span className={styles.pill} data-tone="healthy">Stage C04 · On-Site</span>
              </div>
              <div className={styles.modeGrid} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  className={styles.modeTile}
                  data-mode="PHYSICAL_VISIT"
                  aria-pressed={workOutcome === 'WORK_DONE'}
                  onClick={() => onWorkOutcomeChange('WORK_DONE')}
                >
                  <ShieldCheck size={16} aria-hidden="true" />
                  <strong>Work Completed</strong>
                  <small>Capture C05 customer sign-off</small>
                </button>
                <button
                  type="button"
                  className={styles.modeTile}
                  aria-pressed={workOutcome === 'WORK_INCOMPLETE'}
                  onClick={() => onWorkOutcomeChange('WORK_INCOMPLETE')}
                >
                  <Clock size={16} aria-hidden="true" />
                  <strong>Work Incomplete</strong>
                  <small>Schedule follow-up visit</small>
                </button>
              </div>
            </div>
          )}

          {activePipeline === 'CUSTOM_FORM' && (
            <div style={{ marginTop: 12 }}>
              <span className={styles.sectionLabel}>Assigned Custom Form</span>
              <select className={styles.formSelect} value={selectedFormId} onChange={(e) => onSelectedFormChange(e.target.value)}>
                {customForms.length === 0 ? (
                  <option value="">No published custom forms</option>
                ) : (
                  customForms.map((f) => (
                    <option key={f.id} value={f.id}>{f.title} ({f.data_type})</option>
                  ))
                )}
              </select>
            </div>
          )}

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span className={styles.sectionLabel} style={{ marginBottom: 0, color: isComplaintIncomplete ? '#b91c1c' : undefined }}>
                Next Follow-Up (IST) {isComplaintIncomplete ? '* Mandatory' : '(Optional)'}
              </span>
              {nextFollowup && (
                <button type="button" className={styles.clearBtn} onClick={() => onNextFollowupChange('')}>Clear</button>
              )}
            </div>
            <input
              type="datetime-local"
              className={styles.textInput}
              value={nextFollowup}
              onChange={(e) => onNextFollowupChange(e.target.value)}
            />
            <div className={styles.quickPresetRow}>
              <button type="button" onClick={() => onNextFollowupChange(buildISTFollowupPreset(1))}>+1 Day (11 AM)</button>
              <button type="button" onClick={() => onNextFollowupChange(buildISTFollowupPreset(3))}>+3 Days (11 AM)</button>
              <button type="button" onClick={() => onNextFollowupChange(buildISTFollowupPreset(7))}>Next Week</button>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className={styles.sectionLabel} style={{ marginBottom: 0 }}>Discussion & Meeting Notes</span>
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
            placeholder="Record points discussed, client requirements, payment commitments..."
          />
        </section>

        <section className={styles.card}>
          <span className={styles.sectionLabel}>Watermarked On-Site Photos</span>
          <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#64748b' }}>
            Live GPS coordinates, IST timestamp, and client name are stamped on each captured photo.
          </p>
          <div className={styles.photoStrip}>
            <label className={styles.captureTile}>
              <Camera size={16} aria-hidden="true" />
              <span>{isWatermarking ? 'Stamping Watermark...' : 'Capture Photo'}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onCapturePhoto}
                style={{ display: 'none' }}
                disabled={isWatermarking}
              />
            </label>
            {photos.map((p, idx) => (
              <div key={idx} className={styles.photoThumb}>
                <img src={p.url} alt={`Visit proof ${idx + 1}`} />
                <button type="button" className={styles.photoRemove} aria-label={`Remove photo ${idx + 1}`} onClick={() => onRemovePhoto(idx)}>
                  <X size={11} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className={styles.sectionLabel} style={{ marginBottom: 0 }}>Customer E-Signature</span>
            <button type="button" className={styles.clearBtn} onClick={onClearSignature}>Clear Signature</button>
          </div>
          <canvas
            ref={signatureCanvasRef}
            width={320}
            height={130}
            className={styles.signaturePad}
            onMouseDown={onStartDrawing}
            onMouseMove={onDraw}
            onMouseUp={onStopDrawing}
            onTouchStart={onStartDrawing}
            onTouchMove={onDraw}
            onTouchEnd={onStopDrawing}
          />
        </section>

        <button type="button" className={styles.primaryAction} data-tone="success" onClick={onCompleteCheckOut}>
          <CheckCircle2 size={16} aria-hidden="true" />
          Complete Check-Out & Save Report
        </button>
      </div>
    </div>
  );
});
