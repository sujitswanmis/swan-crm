'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight, BatteryFull, Bell, CalendarDays, CheckCheck, ChevronDown,
  CircleHelp, LayoutDashboard, ListTodo, Maximize2, Menu, Monitor,
  RotateCcw, Search, Settings2, Signal, Smartphone, Users, Wifi, X
} from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { BroadcastNotificationCard } from '@/components/common/BroadcastNotificationReceiver';
import styles from './LivePlacementPreview.module.css';
import NotificationPresentation from '@/components/common/NotificationPresentation';
import { NOTIFICATION_PLACEMENTS, getNotificationPresentation } from '@/utils/notificationPresentation';

const PLACEMENTS = Object.fromEntries(NOTIFICATION_PLACEMENTS.map(p => [p.id, p.label]));
const simulateResponse = async () => ({ success: true, preview: true });
const NAV_ITEMS = [
  [LayoutDashboard, 'Overview'], [Users, 'My leads'],
  [ListTodo, 'Tasks'], [CalendarDays, 'Attendance']
];

function WorkspaceBackground({ mobile }) {
  return (
    <>
      <div className={styles.appHeader} data-preview-header>
        <div className={styles.brand}>
          {mobile ? <Menu size={19} /> : <span className={styles.brandMark}>S</span>}
          <strong>SPC <span>Workspace</span></strong>
        </div>
        {!mobile && <div className={styles.search}><Search size={14} /> Search workspace <kbd>Ctrl K</kbd></div>}
        <div className={styles.headerTools}>
          <span className={styles.notificationBell}><Bell size={18} /><i /></span>
          <span className={styles.avatar}>AS</span>
          {!mobile && <ChevronDown size={13} />}
        </div>
      </div>
      <div className={styles.appBody} aria-hidden="true">
        {!mobile && <aside className={styles.sidebar}>
          <small>WORKSPACE</small>
          {NAV_ITEMS.map(([Icon, label], index) => <div key={label} className={index === 0 ? styles.activeNav : styles.navItem}>
            <Icon size={16} /><span>{label}</span>{index === 2 && <b>6</b>}
          </div>)}
          <div className={styles.sidebarBottom}><div className={styles.navItem}><CircleHelp size={16} />Help & support</div><div className={styles.navItem}><Settings2 size={16} />Settings</div></div>
          <div className={styles.teamCard}><span className={styles.teamIcon}>SP</span><span>My workspace<small>Team account</small></span></div>
        </aside>}
        <div className={styles.dashboard}>
          <div className={styles.pageHeading}><div><small>YOUR WORKSPACE AT A GLANCE</small><h4>Good morning, Ananya</h4><p>Here’s what’s happening with your work today.</p></div>{!mobile && <span className={styles.today}><CalendarDays size={13} /> Today<ChevronDown size={12} /></span>}</div>
          <div className={styles.metrics}>
            {[['Active leads', '128', '+12 this week'], ['Tasks due', '06', '2 completed today'], ['Follow-ups', '24', '8 scheduled today']].slice(0, mobile ? 2 : 3).map(([label, value, detail]) => <div className={styles.metric} key={label}><span>{label}</span><strong>{value}</strong><small><ArrowUpRight size={11} />{detail}</small></div>)}
          </div>
          <div className={styles.dashboardColumns}>
            <div className={styles.activityPanel}>
              <div className={styles.panelHeading}><strong>Today’s priorities</strong><span>View all <ArrowUpRight size={12} /></span></div>
              {['Follow up with new enquiries', 'Review pending approvals', 'Complete your daily checklist'].map((text, i) => <div className={styles.activity} key={text}><span className={styles.taskCheck}>{i === 2 && <CheckCheck size={12} />}</span><div><strong>{text}</strong><small>{['Sales · 4 follow-ups', 'Team workspace · 2 pending', 'Daily tasks · In progress'][i]}</small></div><span className={i === 0 ? styles.dueBadge : styles.taskBadge}>{['Due today', 'Pending', 'In progress'][i]}</span></div>)}
              <div className={styles.activityFoot}><span className={styles.skeleton} /><span className={styles.skeletonShort} /></div>
            </div>
            {!mobile && <div className={styles.progressPanel}><div className={styles.panelHeading}><strong>Weekly overview</strong></div><div className={styles.chart}>{[44, 68, 54, 82, 64, 94, 74].map((height, i) => <div key={i}><i style={{ height: `${height}%` }} /><small>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</small></div>)}</div><small className={styles.chartCaption}>A productive week so far</small></div>}
          </div>
          <div className={styles.bottomPanel}><span className={styles.skeletonShort} /><span className={styles.skeleton} /><span className={styles.skeleton} /></div>
        </div>
      </div>
      {mobile && <div className={styles.mobileNav} aria-hidden="true">{NAV_ITEMS.slice(0, 3).map(([Icon, label], i) => <span key={label} className={i === 0 ? styles.currentMobileNav : undefined}><Icon size={18} />{label}</span>)}</div>}
    </>
  );
}

function WorkspaceViewport({ notification, device, visible, onDismiss, revision }) {
  const mobile = device === 'mobile';
  const hostRef = useRef(null);
  const [scale, setScale] = useState(1);
  const configurationKey = JSON.stringify(notification);

  useEffect(() => {
    if (mobile || !hostRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setScale(entry.contentRect.width / 1000);
    });
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, [mobile]);

  const card = <BroadcastNotificationCard
      key={`${configurationKey}-${revision}`}
      notification={notification}
      preview
      workspacePreview
      presentation
      onRead={simulateResponse}
      onRemind={simulateResponse}
      onClose={onDismiss}
    />;

  return (
    <div className={styles.stage} data-preview-device={device}>
      <div className={mobile ? styles.phone : styles.desktop}>
        {mobile && <div className={styles.phoneStatus} aria-hidden="true"><strong>9:41</strong><span><Signal size={12} /><Wifi size={12} /><BatteryFull size={16} /></span></div>}
        <div ref={hostRef} className={mobile ? styles.mobileHost : styles.desktopHost}>
          <div className={styles.workspace} data-preview-workspace style={mobile ? undefined : { transform: `scale(${scale})` }}>
            <WorkspaceBackground mobile={mobile} />
            {visible && <NotificationPresentation key={`${configurationKey}-${revision}-${device}`} notification={notification} preview mobile={mobile} onClose={onDismiss}>{card}</NotificationPresentation>}
          </div>
        </div>
        {mobile && <div className={styles.phoneHome} aria-hidden="true"><i /></div>}
      </div>
    </div>
  );
}

export default function LivePlacementPreview({ notification, device = 'desktop', onDeviceChange, showDeviceToggle = true, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const [dismissedKey, setDismissedKey] = useState(null);
  const [revision, setRevision] = useState(0);
  const dialogRef = useRef(null);
  const configurationKey = JSON.stringify([device, notification]);
  const placementLabel = PLACEMENTS[getNotificationPresentation(notification).placement_style];

  useEffect(() => {
    if (expanded && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [expanded]);

  const toolbar = <div className={styles.toolbar}>
    <div className={styles.heading}><EyeIcon /><div><strong>{compact ? 'Final Notification Preview' : 'Live Placement Preview'}</strong><span>{placementLabel}</span></div></div>
    <div className={styles.controls}>
      {showDeviceToggle && <div className={styles.deviceSwitch} role="group" aria-label="Preview device">
        <button type="button" aria-pressed={device === 'desktop'} onClick={() => onDeviceChange?.('desktop')}><Monitor size={14} />Desktop</button>
        <button type="button" aria-pressed={device === 'mobile'} onClick={() => onDeviceChange?.('mobile')}><Smartphone size={14} />Mobile</button>
      </div>}
      <button type="button" className={styles.expandButton} aria-label={expanded ? 'Close expanded preview' : 'Expand preview'} onClick={() => setExpanded(!expanded)}>{expanded ? <X size={15} /> : <Maximize2 size={14} />}{expanded ? 'Close' : 'Expand'}</button>
    </div>
  </div>;

  const content = <>
    {toolbar}
    <ErrorBoundary key={configurationKey} fallback={<p className={styles.fallback}>Preview unavailable. You can continue editing your notification.</p>}>
      <WorkspaceViewport notification={notification} device={device} visible={dismissedKey !== configurationKey} onDismiss={() => setDismissedKey(configurationKey)} revision={revision} />
    </ErrorBoundary>
    <div className={styles.caption}><span>Preview only · Responses aren’t saved</span><button type="button" onClick={() => { setDismissedKey(null); setRevision(value => value + 1); }}><RotateCcw size={12} />Replay</button></div>
  </>;

  return <section className={`${styles.container} ${compact ? styles.compact : ''}`} aria-label="Live placement preview">
    {expanded ? <dialog ref={dialogRef} className={styles.expanded} aria-label="Expanded notification preview" onCancel={event => { event.preventDefault(); setExpanded(false); }}>{content}</dialog> : content}
  </section>;
}

function EyeIcon() {
  return <span className={styles.previewIcon}><LayoutDashboard size={17} /></span>;
}
