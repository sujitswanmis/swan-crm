'use client';

import React, { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowUpRight, Battery, BatteryCharging, Calendar,
  Check, CheckCircle2, ChevronDown, Clock3, Flag, Layers, List, LocateFixed,
  MapPin, Maximize2, Minimize2, Navigation, Pause, Play, RefreshCw, Route,
  Search, ShieldCheck, Signal, Wifi, WifiOff,
} from 'lucide-react';
import styles from './LiveTrackingDashboard.module.css';
import DateRangePicker from '@/components/common/DateRangePicker';
import { TRACKING_RANGE_PRESETS, resolveTrackingDateRange, isTrackingDate } from './trackingDateRanges';

const IST_TIME = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
});
const IST_DATE = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
});

export function formatTrackingTime(value) {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? IST_TIME.format(date).toUpperCase() : 'Unavailable';
}

export function formatTrackingDate(value) {
  if (!value) return 'Select date';
  const date = new Date(`${value}T00:00:00+05:30`);
  return Number.isFinite(date.getTime()) ? IST_DATE.format(date) : 'Select date';
}

export function formatTrackingDuration(minutes) {
  if (minutes == null || minutes === '' || !Number.isFinite(Number(minutes)) || Number(minutes) < 0) return 'Unavailable';
  const total = Math.round(Number(minutes));
  const hours = Math.floor(total / 60);
  return hours ? `${hours}h${total % 60 ? ` ${total % 60}m` : ''}` : `${total}m`;
}

// Presentation only: freshness, shift and connectivity decisions come from the existing status model.
export function getTrackingStatus(status) {
  if (!status) return { label: 'Tracking unavailable', tone: 'muted' };
  if (status.isShiftCompleted) return { label: 'Shift ended', tone: 'muted' };
  if (!status.isToday) return { label: 'Historical record', tone: 'muted' };
  if (!status.lastPingMs) return { label: status.headerBadge?.label || 'GPS unavailable', tone: 'warning' };
  if (status.gpsStatusState?.isOff) return { label: 'Last known location', tone: 'warning' };
  return { label: 'GPS active', tone: 'healthy' };
}

function StatusPill({ children, tone = 'muted' }) {
  return <span className={styles.statusPill} data-tone={tone}><span className={styles.statusDot} />{children}</span>;
}

export function getTrackingDatePreset(date) {
  if (date === resolveTrackingDateRange('today').startDate) return 'today';
  if (date === resolveTrackingDateRange('yesterday').startDate) return 'yesterday';
  return 'custom';
}

export function applyTrackingDateSelection(selection, onDateChange) {
  const startDate = selection?.startDate;
  const endDate = selection?.endDate;
  if (!isTrackingDate(startDate) || !isTrackingDate(endDate)) return 'Select valid start and end dates.';
  if (startDate > endDate) return 'Start date must be on or before end date.';
  onDateChange?.({ ...selection, startDate, endDate });
  return '';
}

export const TrackingDatePicker = memo(function TrackingDatePicker({ date, range, onDateChange }) {
  const [error, setError] = useState('');
  const hintId = useId();
  const selected = range || { preset: getTrackingDatePreset(date), startDate: date, endDate: date };
  return <div className={styles.trackingDateControl} role="group" aria-label="Tracking date range in IST" aria-describedby={hintId}>
    <DateRangePicker preset={selected.preset} startDate={selected.startDate} endDate={selected.endDate}
      presetOptions={TRACKING_RANGE_PRESETS} rangeResolver={resolveTrackingDateRange} title="Select GPS tracking date range (IST)"
      onChange={selection => setError(applyTrackingDateSelection(selection, onDateChange))}
      style={{ minHeight: 43, width: '100%', minWidth: 0, fontSize: 12, justifyContent: 'space-between' }} />
    <span id={hintId} className={styles.dateHint}>Date range totals and daily route playback · IST</span>
    {error && <span role="alert" className={styles.dateError}>{error}</span>}
  </div>;
});

export const TrackingRangeOverview = memo(function TrackingRangeOverview({ range, dates, entries, selectedDate, onDayChange, completed, loading, failed, showAll, onShowAll, onFit, onPlayRange, playingRange, playableDays }) {
  return <section className={styles.rangeOverview} aria-label="Date range tracking overview">
    <div className={styles.rangeOverviewTitle}><Calendar size={15} /><strong>{formatTrackingDate(range.startDate)} - {formatTrackingDate(range.endDate)}</strong><span>{dates.length} days</span><span role="status">{loading ? `Loading ${completed} / ${dates.length} days` : `${completed} / ${dates.length} days loaded`}{failed ? ` · ${failed} unavailable` : ''}</span></div>
    <div className={styles.rangeOverviewControls}>
      <label className={styles.rangeDayPicker}>Playback day<select value={selectedDate} onChange={event => onDayChange(event.target.value)}>{dates.map(day => <option key={day} value={day}>{formatTrackingDate(day)}{entries[day]?.status === 'error' ? ' · Unavailable' : entries[day]?.status === 'success' ? ` · ${Number(entries[day].data.totalKm || 0).toFixed(2)} km` : ' · Loading'}</option>)}</select></label>
      <button type="button" aria-pressed={showAll} onClick={onShowAll}><Layers size={14} />{showAll ? 'All dates on map' : 'Selected day on map'}</button>
      <button type="button" onClick={onFit}><LocateFixed size={14} />Fit range</button>
      <button type="button" onClick={onPlayRange} disabled={(!playableDays || loading) && !playingRange}>{playingRange ? <Pause size={14} /> : <Play size={14} />}{playingRange ? 'Pause range' : 'Play date range'}</button>
    </div>
    {loading && <progress aria-label="Loading date range" value={completed} max={dates.length} />}
    {failed > 0 && <p className={styles.rangeNotice}>Unavailable days are excluded from totals. Refresh to retry them.</p>}
  </section>;
});

export const TrackingEmployeePicker = memo(function TrackingEmployeePicker({ employees, selectedId, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const triggerRef = useRef(null);
  const listId = useId();
  const employee = employees.find(item => item.user_id === selectedId);
  const options = useMemo(() => {
    const search = query.trim().toLowerCase();
    return employees.filter(item => !search || [item.name, item.phone, item.role].some(value => String(value || '').toLowerCase().includes(search)));
  }, [employees, query]);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const onPointerDown = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, listId, open]);

  const select = item => {
    onChange(item.user_id);
    setOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  };

  return <div ref={rootRef} className={styles.employeePicker}>
    <button ref={triggerRef} type="button" className={styles.employeeTrigger} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={`Select field executive: ${employee?.name || 'Choose employee'}`} onClick={() => { setOpen(value => !value); setActiveIndex(0); }}>
      <span className={styles.avatar}>{employee?.name?.charAt(0)?.toUpperCase() || 'F'}</span>
      <span className={styles.employeeName}><span className={styles.eyebrow}>Field executive · {employees.length}</span><strong>{employee?.name || 'Choose employee'}</strong></span>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && <div className={styles.employeeMenu}>
      <div className={styles.employeeSearch}><Search size={16} aria-hidden="true" /><input ref={inputRef} role="combobox" aria-label="Search field executives" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={options.length ? `${listId}-${Math.min(activeIndex, options.length - 1)}` : undefined} placeholder="Search name, phone or role" value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))); }
        if (event.key === 'Enter' && options[activeIndex]) { event.preventDefault(); select(options[activeIndex]); }
        if (event.key === 'Tab') setOpen(false);
      }} /></div>
      <div id={listId} role="listbox" aria-label="Field executives" className={styles.employeeOptions}>
        {options.map((item, index) => <button id={`${listId}-${index}`} key={item.user_id} type="button" role="option" aria-selected={item.user_id === selectedId} data-active={index === activeIndex} onClick={() => select(item)}>
          <span><strong>{item.name || 'Field executive'}</strong><small>{[item.phone, item.role].filter(Boolean).join(' · ')}</small></span>{item.user_id === selectedId && <Check size={16} aria-hidden="true" />}
        </button>)}
        {!options.length && <p className={styles.emptySmall}>No matching executives.</p>}
      </div>
    </div>}
  </div>;
});

export const TrackingHeader = memo(function TrackingHeader({ employees, selectedId, onEmployeeChange, date, onDateChange, tab, onTabChange, onRefresh, busy, mode, range }) {
  return <header className={styles.header}>
    <div className={styles.headerMain}>
      <div className={styles.pageTitle}><span className={styles.pageIcon}><Navigation size={21} aria-hidden="true" /></span><div><h1>Field Force 360° Radar</h1><p>Routes, visits & field activity</p></div></div>
      <div className={styles.headerFilters}>
        {tab === '360_PLAYBACK' && <TrackingEmployeePicker employees={employees} selectedId={selectedId} onChange={onEmployeeChange} />}
        {tab === '360_PLAYBACK' ? <TrackingDatePicker date={date} range={range} onDateChange={onDateChange} /> : tab === 'CONVEYANCE_VOUCHERS' ? <label className={styles.voucherDate}><Calendar size={15} /><span className={styles.srOnly}>Voucher date in IST</span><input type="date" value={date} onChange={event => onDateChange({ preset: 'custom', startDate: event.target.value, endDate: event.target.value })} /></label> : <StatusPill tone="healthy">Live radar</StatusPill>}
        <button type="button" className={styles.iconButton} onClick={onRefresh} disabled={busy} aria-label="Refresh tracking data" title="Refresh tracking data"><RefreshCw size={17} className={busy ? styles.spinning : undefined} aria-hidden="true" /></button>
      </div>
    </div>
    <div className={styles.headerBottom}>
      <nav aria-label="Field tracking views" className={styles.tabs}>
        {[['360_PLAYBACK', Route, '360° Route & Playback'], ['ALL_INDIA_RADAR', Layers, 'All-India Cluster Radar'], ['CONVEYANCE_VOUCHERS', Flag, 'Daily TA/DA Vouchers']].map(([id, Icon, label]) => <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => onTabChange(id)}><Icon size={15} aria-hidden="true" />{label}</button>)}
      </nav>
      <span className={styles.headerContext}>{tab === '360_PLAYBACK' ? (mode === 'latest' ? 'Latest location' : 'Route playback') : formatTrackingDate(date)}<span>IST</span></span>
    </div>
  </header>;
});

export const TrackingSummary = memo(function TrackingSummary({ data, status, speedStats, rangeSummary }) {
  const tracking = rangeSummary ? { label: 'Range history', tone: 'muted' } : getTrackingStatus(status);
  const stops = rangeSummary?.loadedDays === 0 ? null : Array.isArray(data?.timeline) ? data.timeline.filter(item => item.type === 'stoppage') : null;
  const number = value => value != null && value !== '' && Number.isFinite(Number(value));
  const metrics = [
    { label: 'Total distance', Icon: Route, value: number(data?.totalKm) ? `${Number(data.totalKm).toFixed(2)} km` : '—', detail: data?.offlineGapKm > 0 ? `${data.trackedRoadKm ?? '—'} km tracked · ${data.offlineGapKm} km gaps` : speedStats?.maxSpeed > 0 ? `Avg ${speedStats.avgSpeed} · Top ${speedStats.maxSpeed} km/h` : 'Recorded route distance' },
    { label: 'Client visits', Icon: CheckCircle2, value: number(data?.visitsCount) ? String(data.visitsCount) : '—', detail: 'Completed visits' },
    { label: 'Stoppages', Icon: Pause, value: stops ? String(stops.length) : '—', detail: stops ? formatTrackingDuration(stops.reduce((sum, item) => sum + (Number(item.durationMins) || 0), 0)) + ' across recorded stops' : 'No route loaded' },
    { label: 'Tracking status', Icon: Signal, value: tracking.label, detail: rangeSummary ? `${rangeSummary.loadedDays} / ${rangeSummary.totalDays} days loaded${rangeSummary.failedDays ? ' (partial)' : ''}` : status?.gpsStatusState?.label || 'Unavailable', tone: tracking.tone, compact: true },
    { label: 'Battery', Icon: status?.isCharging ? BatteryCharging : Battery, value: number(status?.battPct) ? `${status.battPct}%` : '—', detail: status?.isCharging ? 'Charging at last report' : status?.battPct != null ? 'At last device report' : 'Unavailable', tone: status?.battPct != null ? status.battPct <= 15 ? 'critical' : status.battPct <= 30 ? 'warning' : undefined : undefined },
    { label: 'Last GPS ping', Icon: Clock3, value: status?.lastPingMs ? formatTrackingTime(status.lastPingMs) : '—', detail: data?.lastPing?.recorded_at && Number.isFinite(new Date(data.lastPing.recorded_at).getTime()) ? IST_DATE.format(new Date(data.lastPing.recorded_at)) + ' · IST' : 'Unavailable' },
  ];
  return <section aria-label="Tracking summary" className={styles.summary}>{metrics.map(({ label, Icon, value, detail, tone, compact }) => <div className={styles.metric} key={label}>
    <div className={styles.metricLabel}><Icon size={14} aria-hidden="true" />{label}</div><strong className={compact ? styles.metricStatus : styles.metricValue} data-tone={tone}>{value}</strong><span className={styles.metricDetail} title={detail}>{detail}</span>
  </div>)}</section>;
});

export const TrackingActivityPanel = memo(function TrackingActivityPanel({ employee, data, status, health, onOpenHealth, loading, error, expanded, onToggle, onSelectEvent, selectedEvent, rangeMode = false }) {
  const events = Array.isArray(data?.timeline) ? data.timeline : [];
  return <aside className={styles.activityPanel} data-expanded={expanded} aria-label="Employee activity">
    <button type="button" className={styles.activityToggle} aria-expanded={expanded} aria-controls="field-tracking-activity" onClick={onToggle}><List size={17} aria-hidden="true" /><strong>Activity timeline</strong><span>{events.length} events</span><ChevronDown size={16} aria-hidden="true" /></button>
    <div id="field-tracking-activity" className={styles.activityContents}>
      <div className={styles.employeeProfile}><span className={styles.avatar}>{employee?.name?.charAt(0)?.toUpperCase() || 'F'}</span><div><strong>{employee?.name || 'Select an executive'}</strong><span>{[employee?.phone, employee?.role].filter(Boolean).join(' · ') || 'Employee information unavailable'}</span></div></div>
      <div className={styles.healthDetails}><div>{status?.mobileDataState?.isOff ? <WifiOff size={15} /> : <Wifi size={15} />}<span>Mobile data</span><strong>{status?.mobileDataState?.label || 'Unavailable'}</strong></div><div><Activity size={15} /><span>GPS</span><strong>{status?.gpsStatusState?.label || 'Unavailable'}</strong></div></div>
      {error && data && <p role="status" className={styles.refreshNotice}>Could not refresh. Showing the last loaded route.</p>}
      {health && <button type="button" className={styles.healthAudit} data-tone={health.status === 'HEALTHY' ? 'healthy' : health.status === 'CRITICAL' ? 'critical' : 'warning'} disabled={!onOpenHealth} onClick={onOpenHealth} title={health.issueSummary || 'Device permission health'}><ShieldCheck size={17} /><span><strong>{health.shortLabel || 'App & permission health'}{health.versionCode != null ? ` · APK v${health.versionCode}` : ''}</strong><small>{health.issueSummary || [health.locationMode === 'all_the_time' ? 'GPS: All the time' : health.locationMode === 'while_using' ? 'GPS: While using' : 'Location: ' + (health.locationMode || 'Pending'), health.batteryUnrestricted === true ? 'Battery unrestricted' : health.batteryUnrestricted === false ? 'Battery restricted' : ''].filter(Boolean).join(' · ')}</small></span>{onOpenHealth && <ChevronDown size={14} className={styles.auditArrow} />}</button>}
      <div className={styles.timelineHeading}><h2>Activity timeline</h2><span>{events.length} events</span></div>
      {loading && (!data || (rangeMode && !events.length)) ? <div role="status" className={styles.emptyState}><RefreshCw size={24} className={styles.spinning} /><strong>Loading field activity</strong><span>Retrieving the selected route.</span></div> : error && !data ? <div role="alert" className={styles.emptyState}><Signal size={24} /><strong>Route could not be loaded</strong><span>Use refresh to try again.</span></div> : !events.length ? <div className={styles.emptyState}><MapPin size={26} /><strong>{employee ? 'No activity recorded' : 'Choose a field executive'}</strong><span>{employee ? 'GPS events and visits for this date will appear here.' : 'Select an employee to explore their route.'}</span></div> : <ol className={styles.timeline}>
        {events.map((event, index) => {
          const isStop = event.type === 'stoppage';
          const isVisit = event.type === 'visit';
          const isIn = event.type === 'punch_in';
          const Icon = isStop ? Pause : isVisit ? MapPin : Flag;
          const type = isStop ? 'Stoppage' : isVisit ? 'Client visit' : isIn ? 'Punch in' : event.type === 'punch_out' ? 'Punch out' : 'Tracking event';
          const start = event.startTime || event.checkInTime;
          const end = event.endTime || event.checkOutTime;
          const hasPosition = event.lat != null && event.lng != null && Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lng));
          return <li key={event.trackingEventKey || `${event.type}-${start || index}-${index}`} data-type={event.type}>
            <span className={styles.timelineIcon}><Icon size={14} aria-hidden="true" /></span>
            <button type="button" className={styles.timelineEvent} disabled={!hasPosition} aria-pressed={selectedEvent === index} aria-label={`${type}, ${formatTrackingTime(start)}${hasPosition ? ', locate on map' : ''}`} onClick={() => onSelectEvent(event, index)}>
              <span className={styles.eventTop}><strong>{type}</strong><time>{formatTrackingTime(start)}</time></span>
              {rangeMode && event.trackingDate && <span className={styles.eventDate}>{formatTrackingDate(event.trackingDate)}</span>}
              {(isStop || isVisit) && <span className={styles.eventDuration}>{formatTrackingDuration(event.durationMins)}{end && <span> · until {formatTrackingTime(end)}</span>}</span>}
              <span className={styles.eventLocation}>{isVisit ? event.partyName || event.locationName || 'Location unavailable' : event.locationName || (isIn ? event.label || 'Shift started' : event.type === 'punch_out' ? event.label || 'Shift completed' : 'Location unavailable')}</span>
              {event.shiftName && <span className={styles.eventExtra}>{event.shiftName}</span>}{event.connectivityMode && <span className={styles.eventExtra}>{event.connectivityMode}</span>}{event.isGeofenceFlagged && <span className={styles.geofenceFlag}>Geofence mismatch flagged</span>}
            </button>
          </li>;
        })}
      </ol>}
    </div>
  </aside>;
});

export const TrackingPositionInfo = memo(function TrackingPositionInfo({ mode, data, telemetry, point, status, date, onModeChange }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const latest = mode === 'latest';
  const tracking = getTrackingStatus(status);
  const isLive = latest && tracking.tone === 'healthy';
  const selected = latest ? data?.lastPing : telemetry || point;
  const timestamp = latest ? data?.lastPing?.recorded_at : selected?.time;
  const speed = latest ? data?.lastPing?.speed_kmh : selected?.speed;
  const latitude = data?.lastPing?.latitude ?? data?.lastPing?.lat;
  const longitude = data?.lastPing?.longitude ?? data?.lastPing?.lng;
  const location = latitude != null && longitude != null && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
    ? `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}` : null;
  const speedLabel = latest ? 'Speed at last GPS ping' : 'Speed at playback position';
  const speedText = speed != null && Number.isFinite(Number(speed)) ? `${Math.round(Number(speed))} km/h` : 'Unavailable';
  return <div className={styles.positionInfo}>
    <div className={styles.positionTopRow}>
      <div className={styles.modeSwitch} aria-label="Map position mode"><button type="button" aria-pressed={!latest} onClick={() => onModeChange('playback')}><Play size={12} />Playback</button><button type="button" aria-label="Latest location" aria-pressed={latest} disabled={!data?.polyline?.length} onClick={() => onModeChange('latest')}><LocateFixed size={12} />Latest</button></div>
      <strong className={styles.positionTime} title={`${formatTrackingDate(date)} · IST`}>{formatTrackingTime(timestamp)}</strong>
    </div>
    <div className={styles.positionReadout}>
      <StatusPill tone={isLive ? 'healthy' : latest ? tracking.tone : 'muted'}>{latest ? isLive ? 'Live online' : tracking.label : 'Historical playback'}</StatusPill>
      <strong className={styles.positionSpeed} title={speedLabel}><span className={styles.srOnly}>{speedLabel}: </span>{speedText}</strong>
      <button type="button" className={styles.positionInfoToggle} aria-label={detailsOpen ? 'Hide GPS position details' : 'Show GPS position details'} aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)}>Info<ChevronDown size={11} style={{ transform: detailsOpen ? 'rotate(180deg)' : undefined }} /></button>
    </div>
    {detailsOpen && <div className={styles.positionDetails}>
      <span>{formatTrackingDate(date)} · IST</span>
      {!latest && selected?.tripPhase && <span>{selected.tripPhase === 'RETURN' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}{selected.tripPhase === 'RETURN' ? 'Return' : 'Outward'}</span>}
      {!latest && selected?.isOffline && <span data-tone="warning">Offline recorded point</span>}
      {data?.isRoadSnapped && <span>OSRM road snapped</span>}
      {latest && location && <span><MapPin size={11} />Last GPS location · {location}</span>}
    </div>}
    {!latest && telemetry?.stoppageDwell && <div className={styles.dwellReadout}>Stoppage · {formatTrackingDuration(telemetry.stoppageDwell.elapsedMins)} / {formatTrackingDuration(telemetry.stoppageDwell.durationMins)}</div>}
  </div>;
});

export const TrackingMapToolbar = memo(function TrackingMapToolbar({ mapStyle, onStyleChange, onRecenter, fullscreen, onFullscreen, estimate, onEstimate, loadingEstimate }) {
  const [layersOpen, setLayersOpen] = useState(false);
  return <div className={styles.mapToolbar} aria-label="Map tools">
    <div className={styles.layerControl} onKeyDown={event => { if (event.key === 'Escape') setLayersOpen(false); }}><button type="button" className={styles.mapTool} aria-label="Map layers" title="Map layers" aria-expanded={layersOpen} onClick={() => setLayersOpen(value => !value)}><Layers size={18} /></button>{layersOpen && <div className={styles.layerMenu} onKeyDown={event => { if (event.key === 'Escape') setLayersOpen(false); }}><span className={styles.eyebrow}>Map layers</span>{[['street', 'Street map'], ['satellite', 'Satellite'], ['light', 'Clean light']].map(([id, label]) => <button type="button" key={id} aria-pressed={id === mapStyle} onClick={() => { onStyleChange(id); setLayersOpen(false); }}>{label}{id === mapStyle && <Check size={14} />}</button>)}</div>}</div>
    <button type="button" className={styles.mapTool} aria-label="Fit route to map" title="Fit route to map" onClick={onRecenter}><LocateFixed size={18} /></button><button type="button" className={styles.mapTool} aria-label={fullscreen ? 'Exit fullscreen map' : 'Fullscreen map'} title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen map'} onClick={onFullscreen}>{fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
    <button type="button" className={styles.mapTool} aria-label="Estimated road across signal gaps" title="Estimated road across signal gaps" aria-pressed={estimate} onClick={onEstimate}>{loadingEstimate ? <RefreshCw size={18} className={styles.spinning} /> : <Route size={18} />}</button>
  </div>;
});

export const TrackingRouteDock = memo(function TrackingRouteDock({ hasReturn, filter, onFilter, estimate, summary }) {
  const [legendOpen, setLegendOpen] = useState(false);
  return <div className={styles.routeDock}>
    {estimate && summary && !summary.noGaps && <div className={styles.estimateNotice}><Route size={13} />Estimated {summary.hasReturnGap ? 'return' : 'gap'} road: ~{summary.distanceKm} km · GPS off</div>}
    <div className={styles.routeDockRow}><div className={styles.routeFilters} aria-label="Route filter">{(hasReturn ? [['ALL', 'All routes'], ['GOING', 'Outward'], ['RETURN', 'Return']] : [['ALL', 'Outward route']]).map(([id, label]) => <button key={id} type="button" data-leg={id} aria-pressed={filter === id} onClick={() => onFilter(id)}>{label}</button>)}</div><button type="button" className={styles.legendToggle} aria-expanded={legendOpen} aria-controls="field-tracking-legend" onClick={() => setLegendOpen(value => !value)}><Layers size={14} />Legend<ChevronDown size={13} /></button></div>
    {legendOpen && <div id="field-tracking-legend" className={styles.legend}>{[['going', 'Going / outward'], ['return', 'Return / inward'], ['offline', 'Offline recorded'], ['gap', 'Signal lost gap'], ['estimated', 'Estimated road']].map(([type, label]) => <span key={type}><i data-route={type} />{label}</span>)}</div>}
  </div>;
});

export const TrackingPlaybackControls = memo(function TrackingPlaybackControls({ playing, speed, index, total, time, endTime, onToggle, onReset, onSeek, onSpeed }) {
  const available = total > 1 || playing;
  const percent = total > 1 ? Math.round(index / (total - 1) * 100) : 0;
  return <div className={styles.playbackBar} aria-label="GPS route playback">
    <div className={styles.playbackButtons}><button type="button" className={styles.playButton} disabled={!available} aria-label={playing ? 'Pause route playback' : 'Play route playback'} onClick={onToggle}>{playing ? <Pause size={18} /> : <Play size={18} />}</button><button type="button" className={styles.iconButton} disabled={!available} aria-label="Reset route playback" title="Reset route playback" onClick={onReset}><RefreshCw size={16} /></button></div>
    <div className={styles.playbackSeek}><div className={styles.playbackTimes}><strong>{formatTrackingTime(time)}</strong><span>{playing ? 'Playing' : 'Paused'} · {percent}%</span><time>{formatTrackingTime(endTime)}</time></div><input aria-label="Route playback position" aria-valuetext={`${formatTrackingTime(time)}, ${percent}% of route`} type="range" min={0} max={Math.max(0, total - 1)} value={index} disabled={!available} onPointerDown={event => event.stopPropagation()} onTouchStart={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onChange={event => onSeek(Number(event.target.value))} /></div>
    <div className={styles.playbackSpeeds} aria-label="Playback speed">{[1, 2, 5].map(value => <button key={value} type="button" aria-label={`Playback speed ${value}x`} aria-pressed={speed === value} onClick={() => onSpeed(value)}>{value}x</button>)}</div>
  </div>;
});
