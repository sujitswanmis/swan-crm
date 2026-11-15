'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, Send, Eye, RefreshCw, Pause, Play, Square, AlertTriangle, X, BarChart3,
  ChevronRight, MessageSquare, Clock, Check, Star, ListChecks, Sparkles,
  Users, Building, FileText, Sliders, CheckCircle2, ArrowRight, ArrowLeft,
  Calendar, Download, Smartphone, Monitor, ShieldAlert, CornerDownRight, Search,
  Filter, AlertCircle, Info, Copy, Trash2
} from 'lucide-react';
import {
  sendBroadcastNotification,
  updateBroadcastStatus,
  saveBroadcastDraft,
  sendTestBroadcast,
  replyToEmployeeFeedback,
  resolveEmployeeQuery,
  deleteBroadcastDraft
} from '@/app/actions/broadcastNotifications';
import { NOTIFICATION_TYPES } from '@/components/common/BroadcastNotificationReceiver';
import LivePlacementPreview from './LivePlacementPreview';
import { ColumnResizer, useTableColumnResize } from '@/utils/tableColumnResize';
import { NOTIFICATION_PLACEMENTS, NOTIFICATION_SIZES, NOTIFICATION_ANIMATIONS, NOTIFICATION_ANIMATION_SPEEDS, RECOMMENDED_NOTIFICATION_PLACEMENTS, normalizeNotificationPresentation } from '@/utils/notificationPresentation';

const ist = value => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—';

const PLACEMENT_LABELS = Object.fromEntries(NOTIFICATION_PLACEMENTS.map(p => [p.id, p.label]));

function PlacementIllustration({ placement }) {
  const blocks = {
    top_right: [58, 12, 31, 22], bottom_right: [58, 29, 31, 21],
    center_modal: [28, 17, 44, 29], top_banner: [6, 11, 84, 10],
    bottom_banner: [6, 42, 84, 10], right_drawer: [61, 10, 29, 43],
    full_screen: [6, 10, 84, 43]
  };
  const [x, y, width, height] = blocks[placement] || blocks.top_right;
  return <svg width="76" height="48" viewBox="0 0 96 58" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
    <rect x="1" y="1" width="94" height="56" rx="5" fill="var(--bg-primary, #f6f7fb)" stroke="var(--border-light, #dce3ed)" />
    <path d="M2 10h92M19 10v46" stroke="var(--border-light, #dce3ed)" />
    <path d="M26 20h25M26 28h25M26 36h18M26 44h28" stroke="var(--border-light, #dce3ed)" strokeWidth="3" />
    {['center_modal', 'full_screen'].includes(placement) && <rect x="2" y="10" width="92" height="46" fill="#17243c" opacity=".16" />}
    <rect x={x} y={y} width={width} height={height} rx={placement.includes('banner') ? 0 : 3} fill="var(--accent-color, #4f46e5)" opacity=".85" />
    <path d={`M${x + 5} ${y + 5}h${Math.max(8, width - 10)}`} stroke="#fff" strokeWidth="2" opacity=".85" />
  </svg>;
}

const THEME_LABELS = {
  indigo: 'Indigo Modern',
  emerald: 'Emerald Success',
  amber: 'Amber Warning',
  rose: 'Rose Alert'
};

const CLOSE_BEHAVIOUR_LABELS = {
  auto_unread: 'Auto-Close, Keep Unread',
  auto_viewed: 'Auto-Close, Mark Viewed',
  manual: 'Manual Close (User Dismissal)',
  required: 'Acknowledgement Required (Response Mandatory)'
};

const PRESET_LABELS = {
  announcement: 'Announcement (Informational)',
  acknowledgement: 'Acknowledgement (Understand / Not Understand)',
  approval: 'Approval (Approve / Reject)',
  spc_feedback_rating: 'Feedback Rating (1–5 Stars)',
  process: 'Process Health Audit'
};

function audienceLabel(aud) {
  if (!aud || !aud.scope) return 'Audience not selected';
  if (aud.scope === 'all') return 'All workspaces · all users';
  if (aud.scope === 'workspace') return 'Selected workspace';
  if (aud.scope === 'headquarters') return 'Headquarters only';
  if (aud.scope === 'branches') return `${aud.locations?.length || 0} branches`;
  return 'Custom audience';
}

function safeAudience(aud) {
  if (!aud) return {};
  if (typeof aud === 'object') return aud;
  try { return JSON.parse(aud); } catch { return {}; }
}

function statusBadge(row, expired) {
  if (row.read_at) {
    return <span className="badge-status status-read">✓ Read</span>;
  }
  if (row.delivered_at) {
    return <span className="badge-status status-delivered">Delivered (Unread)</span>;
  }
  if (expired || row.dismissed_at) {
    return <span className="badge-status status-expired">Expired</span>;
  }
  return <span className="badge-status status-pending">Pending Delivery</span>;
}

function queryStatusBadge(status) {
  const s = status || 'open';
  if (s === 'resolved') return <span className="badge-query query-resolved">✓ Resolved</span>;
  if (s === 'in_progress') return <span className="badge-query query-progress">⏳ In Progress</span>;
  if (s === 'closed') return <span className="badge-query query-closed">Closed</span>;
  return <span className="badge-query query-open">Open Query</span>;
}

function exportToCsv(filename, rows) {
  if (!rows || !rows.length) return;
  const headers = [
    'Employee ID', 'Employee Name', 'Email', 'Company', 'Branch',
    'Department', 'Role', 'Status', 'Action Response', 'Employee Feedback',
    'Query Status', 'Admin Reply', 'Sent At (IST)', 'Delivered At (IST)', 'Read At (IST)'
  ];
  const csvRows = [headers.join(',')];
  for (const r of rows) {
    const values = [
      `"${(r.emp_id || '').replace(/"/g, '""')}"`,
      `"${(r.user_name || '').replace(/"/g, '""')}"`,
      `"${(r.email || '').replace(/"/g, '""')}"`,
      `"${(r.workspace_name || '').replace(/"/g, '""')}"`,
      `"${(r.location_name || '').replace(/"/g, '""')}"`,
      `"${(r.department || '').replace(/"/g, '""')}"`,
      `"${(r.role || '').replace(/"/g, '""')}"`,
      `"${r.read_at ? 'Read' : r.delivered_at ? 'Delivered' : 'Pending'}"`,
      `"${(r.action_label || '').replace(/"/g, '""')}"`,
      `"${(r.feedback_text || '').replace(/"/g, '""')}"`,
      `"${r.query_status || 'open'}"`,
      `"${(r.admin_reply || '').replace(/"/g, '""')}"`,
      `"${ist(r.sent_at)}"`,
      `"${ist(r.delivered_at)}"`,
      `"${ist(r.read_at || r.responded_at)}"`
    ];
    csvRows.push(values.join(','));
  }
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function readNotifications(params, signal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 20000);
  try {
    const response = await fetch(`/api/broadcast-notifications?${new URLSearchParams(params)}`, {
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal
    });
    const result = await response.json().catch(() => ({ success: false, error: 'The app could not load notifications. Please retry after it is available.' }));
    if (!response.ok || !result.success) throw new Error(result.error || 'Could not load notifications. Please retry.');
    return result;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('Loading timed out. Please retry.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

function ReportTable({ columns, rows, storageKey, maxHeight = '420px', activeMetric = null }) {
  const defaults = useMemo(() => Object.fromEntries(columns.map(c => [c.key, c.width || 170])), [columns]);
  const minimums = useMemo(() => Object.fromEntries(columns.map(c => [c.key, 90])), [columns]);
  const resize = useTableColumnResize(storageKey, defaults, minimums);
  return (
    <div style={{
      overflowX: 'auto',
      overflowY: 'auto',
      maxHeight,
      border: '1px solid var(--border-light,#e2e8f0)',
      borderRadius: 10,
      position: 'relative'
    }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: resize.getTotalTableWidth() || '100%', minWidth: '100%', fontSize: 12 }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-muted,#f1f5f9)' }}>
          <tr>
            {columns.map(c => {
              const isColActive = activeMetric && c.key === activeMetric;
              return (
                <th
                  key={c.key}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    width: resize.colWidths?.[c.key] || c.width || 170,
                    padding: '12px 16px',
                    textAlign: ['workspace', 'location', 'user_name', 'email', 'location_name', 'workspace_name', 'emp_id'].includes(c.key) ? 'left' : 'center',
                    background: isColActive ? '#e0e7ff' : 'var(--bg-muted,#f1f5f9)',
                    color: isColActive ? '#3730a3' : 'inherit',
                    borderBottom: '1px solid #cbd5e1',
                    boxShadow: 'inset 0 -1px 0 #cbd5e1'
                  }}
                >
                  {c.label}
                  <ColumnResizer colKey={c.key} isResizing={resize.resizingCol === c.key} onResizeStart={resize.handleResizeStart} onReset={resize.resetColWidth} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row?.key || row?.user_id || i} style={{ background: i % 2 === 0 ? 'var(--bg-card,#fff)' : 'var(--bg-muted,#f8fafc)' }}>
              {columns.map(c => {
                const isColActive = activeMetric && c.key === activeMetric;
                return (
                  <td
                    key={c.key}
                    style={{
                      padding: '11px 16px',
                      borderBottom: '1px solid var(--border-light,#e2e8f0)',
                      overflowWrap: 'anywhere',
                      verticalAlign: 'top',
                      textAlign: ['workspace', 'location', 'user_name', 'email', 'location_name', 'workspace_name', 'emp_id'].includes(c.key) ? 'left' : 'center',
                      background: isColActive ? 'rgba(238, 242, 255, 0.45)' : 'inherit',
                      fontWeight: isColActive ? 700 : 'normal'
                    }}
                  >
                    {c.render ? c.render(row) : (row?.[c.key] ?? '—')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {(!rows || !rows.length) && (
        <p style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-secondary,#64748b)', margin: 0 }}>
          No records match this selection.
        </p>
      )}
    </div>
  );
}

export default function BroadcastNotificationPanel() {
  const [studioMode, setStudioMode] = useState('compose'); // 'compose' | 'history'
  const [step, setStep] = useState(1); // 1: Audience, 2: Compose, 3: Delivery, 4: Review

  // Audience State - Safe Default: Empty (forces explicit selection)
  const [directory, setDirectory] = useState([]);
  const [availableDepartments, setAvailableDepartments] = useState([]);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [audienceLoading, setAudienceLoading] = useState(true);
  const [audience, setAudience] = useState({
    scope: '', // Safe Default: "Select Target Audience…"
    workspace: '',
    locations: [],
    departments: [],
    roles: [],
    employees: [],
    onlyOnline: false
  });
  const [approvedAudience, setApprovedAudience] = useState(null);
  const [showEmployeeList, setShowEmployeeList] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeePage, setEmployeePage] = useState(1);
  const employeePageSize = 10;

  // Searchable Multi-Select States for Departments and Roles
  const [deptSearch, setDeptSearch] = useState('');
  const [roleSearch, setRoleSearch] = useState('');

  // Notification Compose State
  const [notificationType, setNotificationType] = useState('information');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);

  // Delivery & Behaviour State
  const [placementStyle, setPlacementStyle] = useState('top_right');
  const [notificationSize, setNotificationSize] = useState('auto');
  const [entryAnimation, setEntryAnimation] = useState(null);
  const [animationDuration, setAnimationDuration] = useState(250);
  const presentationSettings = normalizeNotificationPresentation({ placement_style: placementStyle, notification_size: notificationSize, entry_animation: entryAnimation, animation_duration: animationDuration });
  const invalidCriticalPlacement = placementStyle === 'full_screen' && notificationType !== 'critical';
  const [colorTheme, setColorTheme] = useState('indigo'); // 'indigo' | 'emerald' | 'amber' | 'rose'
  const [closeBehaviour, setCloseBehaviour] = useState('auto_unread'); // 'auto_unread' | 'auto_viewed' | 'manual' | 'required'
  const [duration, setDuration] = useState(15);
  const [validity, setValidity] = useState(24);
  const [allowReminder, setAllowReminder] = useState(true);

  // Interaction / Response Modes: 'announcement' | 'acknowledgement' | 'approval' | 'spc_feedback_rating' | 'process'
  const [advancePreset, setAdvancePreset] = useState('acknowledgement');

  // Action Buttons
  const [buttonPreset, setButtonPreset] = useState('dual');
  const [actionButtons, setActionButtons] = useState([
    { id: 'understand', label: 'Understand', variant: 'primary' },
    { id: 'not_understand', label: 'Not Understand', variant: 'danger' }
  ]);
  const [allowFeedback, setAllowFeedback] = useState(true);
  const [requireCommentOnNegative, setRequireCommentOnNegative] = useState(false);

  // Process Health Audit State
  const CORE_CRM_PROCESSES = useMemo(() => [
    { id: 'proc_login', name: 'Login & Session Security' },
    { id: 'proc_attendance', name: 'Attendance Punch Station' },
    { id: 'proc_softphone', name: 'Call Center Softphone Calling' },
    { id: 'proc_leads', name: 'Lead Form & Stage Movements' },
    { id: 'proc_orders', name: 'Daily Order Follow-up Pipeline' },
    { id: 'proc_wa', name: 'WhatsApp & SMS Notifications' },
    { id: 'proc_checklist', name: 'Smart Checklist Schedules' },
    { id: 'proc_delegation', name: 'Delegation Tasks & Deadlines' },
    { id: 'proc_field', name: 'Field Force & Live Radar' },
    { id: 'proc_reports', name: 'Reports, Exports & Analytics' }
  ], []);
  const [processList, setProcessList] = useState(CORE_CRM_PROCESSES.slice(0, 5));

  // SPC Feedback Rating State
  const [ratingPrompt, setRatingPrompt] = useState('Rate your overall experience with SPC Workspace');

  // Step 4 Review & Scheduling State
  const [previewDevice, setPreviewDevice] = useState('desktop'); // 'desktop' | 'mobile'
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledIST, setScheduledIST] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Status & Alerts
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // History & Reporting State
  const [history, setHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all'); // 'all' | 'active' | 'scheduled' | 'drafts' | 'expired'
  const [historySearch, setHistorySearch] = useState('');
  const [reportId, setReportId] = useState('');
  const [report, setReport] = useState(null);
  const [reportMetric, setReportMetric] = useState('total');
  const [employeeReportSearch, setEmployeeReportSearch] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  // Feedback Reply Drawer State
  const [feedbackDrawer, setFeedbackDrawer] = useState({
    open: false,
    row: null,
    replyText: '',
    status: 'open',
    busy: false
  });

  const reportRequest = useRef(0);
  const sendLock = useRef(false);
  const request = useRef(null);
  const reportSectionRef = useRef(null);

  // Initial Data Load
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    async function load() {
      try {
        const result = await readNotifications({ mode: 'audience' }, controller.signal);
        if (live) {
          setDirectory(result.directory || []);
          if (Array.isArray(result.departments)) setAvailableDepartments(result.departments);
          if (Array.isArray(result.roles)) setAvailableRoles(result.roles);
        }
      } catch (e) { if (live) setError(e.message); }
      finally { if (live) setAudienceLoading(false); }

      if (!live) return;
      const version = ++reportRequest.current;
      try {
        const result = await readNotifications({ mode: 'report' }, controller.signal);
        if (live && version === reportRequest.current) setHistory(result.history || []);
      } catch (e) { if (live && version === reportRequest.current) setError(previous => previous || e.message); }
      finally { if (live && version === reportRequest.current) setReportBusy(false); }
    }
    load();
    return () => { live = false; controller.abort(); };
  }, []);

  // Filter and Audience Calculations
  const workspaces = useMemo(() => [
    ...new Map(directory.map(u => [u.workspace_key, { key: u.workspace_key, name: u.workspace_name }])).values()
  ], [directory]);

  const branches = useMemo(() => [
    ...new Map(directory.filter(u => u.workspace_key === audience.workspace && u.location_type === 'Branch').map(u => [u.location_key, { key: u.location_key, name: u.location_name }])).values()
  ], [directory, audience.workspace]);

  const distinctDepartments = useMemo(() => {
    if (availableDepartments.length) return availableDepartments;
    const depts = new Set();
    for (const u of directory) {
      if (u.department) depts.add(u.department);
    }
    return Array.from(depts);
  }, [availableDepartments, directory]);

  const distinctRoles = useMemo(() => {
    if (availableRoles.length) return availableRoles;
    const roles = new Set();
    for (const u of directory) {
      if (u.role) roles.add(u.role);
    }
    return Array.from(roles);
  }, [availableRoles, directory]);

  // Filtered department & role lists for searchable multi-select
  const filteredDepartments = useMemo(() => {
    if (!deptSearch.trim()) return distinctDepartments;
    const q = deptSearch.toLowerCase();
    return distinctDepartments.filter(d => d.toLowerCase().includes(q));
  }, [distinctDepartments, deptSearch]);

  const filteredRoles = useMemo(() => {
    if (!roleSearch.trim()) return distinctRoles;
    const q = roleSearch.toLowerCase();
    return distinctRoles.filter(r => r.toLowerCase().includes(q));
  }, [distinctRoles, roleSearch]);

  // Recipient Filtering Logic with AND/OR logic
  const recipients = useMemo(() => {
    if (!audience.scope) return [];
    return directory.filter(u => {
      if (audience.scope === 'workspace' && u.workspace_key !== audience.workspace) return false;
      if (audience.scope === 'headquarters') {
        if (audience.workspace && u.workspace_key !== audience.workspace) return false;
        if (u.location_type !== 'Headquarters') return false;
      }
      if (audience.scope === 'branches') {
        if (audience.workspace && u.workspace_key !== audience.workspace) return false;
        if (!audience.locations.includes(u.location_key)) return false;
      }
      if (audience.departments?.length && !audience.departments.includes(u.department)) return false;
      if (audience.roles?.length && !audience.roles.includes(u.role)) return false;
      if (audience.employees?.length && !audience.employees.includes(u.user_id) && !audience.employees.includes(u.emp_id)) return false;
      if (audience.onlyOnline && !u.online) return false;
      return true;
    });
  }, [directory, audience]);

  const onlineKnown = recipients.every(u => u.online !== null);
  const onlineCount = recipients.filter(u => u.online).length;
  const unassigned = recipients.filter(u => u.location_type === 'Unassigned').length;

  const filteredPreviewEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return recipients;
    const q = employeeSearch.toLowerCase();
    return recipients.filter(u =>
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.emp_id && u.emp_id.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.department && u.department.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q))
    );
  }, [recipients, employeeSearch]);

  const paginatedPreviewEmployees = useMemo(() => {
    const start = (employeePage - 1) * employeePageSize;
    return filteredPreviewEmployees.slice(start, start + employeePageSize);
  }, [filteredPreviewEmployees, employeePage]);

  const totalEmployeePages = Math.max(1, Math.ceil(filteredPreviewEmployees.length / employeePageSize));

  function changeAudience(next) {
    setAudience(next);
    setApprovedAudience(null);
    setNotice('');
    setEmployeePage(1);
    request.current = null;
  }

  async function refreshAudience() {
    if (!audience.scope) return;
    setBusy('audience'); setError(''); setApprovedAudience(null);
    try {
      const result = await readNotifications({
        mode: 'audience',
        scope: audience.scope,
        workspace: audience.workspace,
        locations: JSON.stringify(audience.locations),
        departments: JSON.stringify(audience.departments || []),
        roles: JSON.stringify(audience.roles || []),
        employees: JSON.stringify(audience.employees || []),
        onlyOnline: String(audience.onlyOnline)
      });
      setDirectory(result.directory || []);
      setApprovedAudience({ key: JSON.stringify(audience), fingerprint: result.fingerprint });
      request.current = null;
      setNotice(`Audience verified: ${result.recipientCount} eligible user(s) ready.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }

  // Priority change applying sensible defaults without deleting typed title/message/buttons
  function handleSelectNotificationType(typeId) {
    setNotificationType(typeId);
    if (typeId === 'information') {
      setCloseBehaviour('auto_unread');
      setDuration(15);
    } else if (typeId === 'important') {
      setCloseBehaviour('auto_viewed');
      setDuration(30);
    } else if (typeId === 'urgent') {
      setCloseBehaviour('manual');
      setDuration(0);
    } else if (typeId === 'critical') {
      setCloseBehaviour('required');
      setAllowReminder(false);
      setDuration(0);
    } else if (typeId === 'policy_update') {
      setCloseBehaviour('required');
      setAllowReminder(true);
      setDuration(0);
    }
  }

  // Formatting Toolbar Helper
  function insertFormatting(prefix, suffix = '', placeholder = 'text') {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const sel = message.substring(start, end) || placeholder;
    const replacement = prefix + sel + suffix;
    const updated = message.substring(0, start) + replacement + message.substring(end);
    if (updated.length <= 4000) {
      setMessage(updated);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + prefix.length, start + prefix.length + sel.length);
      }, 0);
    }
  }

  // Button Presets
  function applyButtonPreset(preset) {
    setButtonPreset(preset);
    if (preset === 'dual') {
      setActionButtons([
        { id: 'understand', label: 'Understand', variant: 'primary' },
        { id: 'not_understand', label: 'Not Understand', variant: 'danger' }
      ]);
    } else if (preset === 'single') {
      setActionButtons([
        { id: 'understand', label: 'Samajh gaya', variant: 'primary' }
      ]);
    } else if (preset === 'approval') {
      setActionButtons([
        { id: 'approved', label: 'Approve', variant: 'primary' },
        { id: 'declined', label: 'Decline', variant: 'danger' }
      ]);
    }
  }

  function updateButton(index, field, val) {
    setButtonPreset('custom');
    setActionButtons(prev => prev.map((btn, i) => i === index ? { ...btn, [field]: val } : btn));
  }

  function removeButton(index) {
    if (actionButtons.length <= 1) return;
    setButtonPreset('custom');
    setActionButtons(prev => prev.filter((_, i) => i !== index));
  }

  function addButton() {
    if (actionButtons.length >= 4) return;
    setButtonPreset('custom');
    setActionButtons(prev => [
      ...prev,
      { id: `btn_${Date.now()}`, label: `Action ${prev.length + 1}`, variant: 'secondary' }
    ]);
  }

  function addProcessItem() {
    if (processList.length >= 15) return;
    setProcessList(prev => [
      ...prev,
      { id: `proc_${Date.now()}`, name: `Process ${prev.length + 1}` }
    ]);
  }

  function updateProcessItem(index, name) {
    setProcessList(prev => prev.map((p, i) => i === index ? { ...p, name } : p));
  }

  function removeProcessItem(index) {
    if (processList.length <= 1) return;
    setProcessList(prev => prev.filter((_, i) => i !== index));
  }

  // Schedule validation check
  const isScheduleValid = useMemo(() => {
    if (!isScheduled) return true;
    if (!scheduledIST) return false;
    const schedTime = new Date(scheduledIST).getTime();
    return schedTime > Date.now() + 60000;
  }, [isScheduled, scheduledIST]);

  // Realistic Screen Canvas Simulator for Step 3 & Step 4 Live Preview
  function renderScreenSimulator(isStep3 = false) {
    const cardData = {
      title: title || 'Announcement Title',
      message: message || 'Notification instructions will appear here...',
      notification_type: notificationType,
      duration_seconds: closeBehaviour === 'manual' || closeBehaviour === 'required' ? 0 : Number(duration),
      audience: {
        preset_mode: advancePreset,
        ...presentationSettings,
        color_theme: colorTheme,
        action_buttons: actionButtons,
        process_list: processList,
        rating_prompt: ratingPrompt,
        allow_feedback: allowFeedback,
        allow_reminder: allowReminder,
        close_behaviour: closeBehaviour
      }
    };

    return <LivePlacementPreview notification={cardData} device={previewDevice} onDeviceChange={setPreviewDevice} showDeviceToggle={isStep3} compact={!isStep3} />;
  }

  // Build Payload
  function buildPayload(extra = {}) {
    return {
      title: title.trim(),
      message: message.trim(),
      notification_type: notificationType,
      duration_seconds: closeBehaviour === 'manual' || closeBehaviour === 'required' ? 0 : Number(duration),
      close_behaviour: closeBehaviour,
      validity_hours: Number(validity),
      audience,
      preset_mode: ['process', 'spc_feedback_rating', 'announcement', 'acknowledgement', 'approval', 'single'].includes(advancePreset) ? advancePreset : 'single',
      ...presentationSettings,
      color_theme: colorTheme,
      action_buttons: actionButtons,
      process_list: processList,
      rating_prompt: ratingPrompt,
      allow_feedback: allowFeedback,
      allow_reminder: allowReminder,
      require_comment_on_negative: requireCommentOnNegative,
      fingerprint: approvedAudience?.fingerprint,
      ...extra
    };
  }

  // Action Dispatchers
  async function handlePublish() {
    if (sendLock.current) return;
    if (invalidCriticalPlacement) { setError('Full-screen alerts require Critical priority. Choose another placement or change the priority.'); return; }
    if (audience.scope === 'all' && !confirmOpen) {
      setConfirmOpen(true);
      return;
    }
    if (isScheduled && !isScheduleValid) {
      setError('Please choose a valid future date & time (IST) to schedule.');
      return;
    }
    sendLock.current = true;
    setBusy('send'); setError(''); setNotice('');
    try {
      if (!approvedAudience || approvedAudience.key !== JSON.stringify(audience)) {
        throw new Error('Please verify audience before publishing.');
      }
      const payload = buildPayload({
        is_draft: false,
        is_test: false,
        scheduled_at: isScheduled && scheduledIST ? new Date(scheduledIST).toISOString() : null
      });
      const key = JSON.stringify(payload);
      if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
      const result = await sendBroadcastNotification({ ...payload, id: request.current.id });
      if (!result.success) throw new Error(result.error);
      setNotice(isScheduled ? '📅 Announcement scheduled successfully!' : `🚀 Dispatched to ${result.count} users successfully!`);
      setApprovedAudience(null);
      setConfirmOpen(false);
      selectNotification(result.id);
    } catch (e) { setError(e.message); }
    finally { sendLock.current = false; setBusy(''); }
  }

  async function handleSaveDraft() {
    setBusy('draft'); setError(''); setNotice('');
    try {
      const payload = buildPayload({ id: crypto.randomUUID(), is_draft: true });
      const result = await saveBroadcastDraft(payload);
      if (!result.success) throw new Error(result.error || 'Could not save draft');
      setNotice('💾 Draft saved successfully! You can view and edit it in Past Broadcasts → Drafts.');
      await loadReport();
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }

  async function handleSendTest() {
    setBusy('test'); setError(''); setNotice('');
    try {
      const payload = buildPayload({ id: crypto.randomUUID(), is_test: true, is_draft: false });
      const result = await sendTestBroadcast(payload);
      if (!result.success) throw new Error(result.error || 'Could not send test notification');
      setNotice('🧪 Test notification dispatched to your profile! It should appear on your screen now.');
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }

  const loadReport = useCallback(async id => {
    const version = ++reportRequest.current;
    setReportBusy(true);
    try {
      const result = await readNotifications({ mode: 'report', ...(id ? { id } : {}) });
      if (version !== reportRequest.current) return;
      if (!result.success) throw new Error(result.error);
      setHistory(result.history || []);
      setReport(id ? result : null);
    } catch (e) { if (version === reportRequest.current) setError(e.message); }
    finally { if (version === reportRequest.current) setReportBusy(false); }
  }, []);

  const selectNotification = useCallback((id) => {
    if (!id) return;
    setStudioMode('history');
    setReportId(id);
    setReportMetric('total');
    setReport(prev => (prev?.broadcast?.id === id ? prev : null));
    loadReport(id);
  }, [loadReport]);

  useEffect(() => {
    if (reportId && report?.broadcast?.id === reportId && reportSectionRef.current) {
      try { reportSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
    }
  }, [reportId, report?.broadcast?.id]);

  async function handleStatusChange(action) {
    if (!reportId || statusBusy) return;
    if (action === 'cancel') {
      const ok = window.confirm('Kya aap is announcement ko permanently cancel karna chahte hain?\n\nCancel karne par sabhi unread users ke screen aur inbox se yeh turant revoke ho jayega.');
      if (!ok) return;
    }
    setStatusBusy(true); setError('');
    try {
      const res = await updateBroadcastStatus(reportId, action);
      if (!res.success) throw new Error(res.error || 'Could not update status');
      setNotice(
        action === 'pause' ? 'Broadcast paused. Unread popups are now held.' :
        action === 'resume' ? 'Broadcast resumed. Active again for unread recipients.' :
        'Broadcast cancelled. Announcement revoked for all remaining unread recipients.'
      );
      await loadReport(reportId);
    } catch (e) { setError(e.message); }
    finally { setStatusBusy(false); }
  }

  function handleDuplicate(b) {
    if (!b) return;
    setTitle(b.title ? `Copy of ${b.title}` : '');
    setMessage(b.message || '');
    setNotificationType(b.notification_type || 'information');
    const aud = safeAudience(b.audience);
    setAudience({
      scope: aud.scope || '',
      workspace: aud.workspace || '',
      locations: aud.locations || [],
      departments: aud.departments || [],
      roles: aud.roles || [],
      employees: aud.employees || [],
      onlyOnline: !!aud.onlyOnline
    });
    setAdvancePreset(aud.preset_mode || 'single');
    const presentation = normalizeNotificationPresentation(aud);
    setPlacementStyle(presentation.placement_style);
    setNotificationSize(presentation.notification_size);
    setEntryAnimation(presentation.entry_animation);
    setAnimationDuration(presentation.animation_duration);
    setColorTheme(aud.color_theme || 'indigo');
    const closeAliases = { auto_keep_unread: 'auto_unread', auto_mark_viewed: 'auto_viewed', manual_close: 'manual', acknowledgement_required: 'required' };
    setCloseBehaviour(closeAliases[b.close_behaviour] || b.close_behaviour || 'auto_unread');
    if (Array.isArray(aud.action_buttons) && aud.action_buttons.length) setActionButtons(aud.action_buttons);
    if (Array.isArray(aud.process_list) && aud.process_list.length) setProcessList(aud.process_list);
    if (aud.rating_prompt) setRatingPrompt(aud.rating_prompt);
    setStudioMode('compose');
    setStep(1);
    setApprovedAudience(null);
    setNotice('Announcement cloned into Composer! Review audience, verify, and publish.');
  }

  async function handleDeleteDraft(id) {
    if (!window.confirm('Aap is draft ko permanently delete karna chahte hain?')) return;
    try {
      const res = await deleteBroadcastDraft(id);
      if (!res.success) throw new Error(res.error || 'Could not delete draft');
      setNotice('Draft deleted successfully.');
      await loadReport();
    } catch (e) { setError(e.message); }
  }

  async function handleSendAdminReply() {
    if (!feedbackDrawer.row || !feedbackDrawer.replyText.trim()) return;
    setFeedbackDrawer(prev => ({ ...prev, busy: true }));
    try {
      const res = await replyToEmployeeFeedback({
        broadcast_id: reportId,
        user_id: feedbackDrawer.row.user_id,
        reply_text: feedbackDrawer.replyText
      });
      if (!res.success) throw new Error(res.error || 'Could not save reply');
      if (feedbackDrawer.status !== 'open') {
        await resolveEmployeeQuery({
          broadcast_id: reportId,
          user_id: feedbackDrawer.row.user_id,
          status: feedbackDrawer.status
        });
      }
      setNotice('Admin reply sent to employee successfully!');
      setFeedbackDrawer({ open: false, row: null, replyText: '', status: 'open', busy: false });
      await loadReport(reportId);
    } catch (e) { setError(e.message); }
    finally { setFeedbackDrawer(prev => ({ ...prev, busy: false })); }
  }

  // Report calculations
  const currentBroadcast = report?.broadcast || null;
  const currentAudience = safeAudience(currentBroadcast?.audience);
  const expired = (currentBroadcast?.expires_at && report?.checked_at)
    ? (Date.parse(currentBroadcast.expires_at) <= Date.parse(report.checked_at))
    : false;
  const reportRows = report?.recipients || [];

  const reportMetrics = useMemo(() => {
    return {
      total: reportRows.length,
      sent: reportRows.filter(r => r.sent_at).length,
      delivered: reportRows.filter(r => r.delivered_at).length,
      viewed: reportRows.filter(r => r.viewed_at).length,
      read: reportRows.filter(r => r.read_at).length,
      pending: expired ? 0 : reportRows.filter(r => !r.read_at).length,
      snoozed: reportRows.filter(r => r.action_id === 'snooze').length,
      expired: expired ? reportRows.filter(r => !r.read_at).length : 0,
      feedback: reportRows.filter(r => r.feedback_text).length,
      unresolved: reportRows.filter(r => r.feedback_text && (r.query_status === 'open' || r.query_status === 'in_progress')).length
    };
  }, [reportRows, expired]);

  const filteredHistory = useMemo(() => {
    return history.filter(h => {
      if (historyFilter === 'active') {
        return !h.is_draft && !h.is_test && h.status !== 'cancelled' && (h.audience?.broadcast_status === 'active' || !h.audience?.broadcast_status) && Date.parse(h.expires_at) > Date.now();
      }
      if (historyFilter === 'scheduled') return h.status === 'scheduled';
      if (historyFilter === 'drafts') return !!h.is_draft;
      if (historyFilter === 'expired') return Date.parse(h.expires_at) <= Date.now() || h.status === 'cancelled';
      return true;
    }).filter(h => {
      if (!historySearch.trim()) return true;
      const q = historySearch.toLowerCase();
      return (h.title && h.title.toLowerCase().includes(q)) || (h.message && h.message.toLowerCase().includes(q));
    });
  }, [history, historyFilter, historySearch]);

  const filteredReportRows = useMemo(() => {
    return reportRows.filter(row => {
      if (reportMetric === 'sent' && !row.sent_at) return false;
      if (reportMetric === 'delivered' && !row.delivered_at) return false;
      if (reportMetric === 'viewed' && !row.viewed_at) return false;
      if (reportMetric === 'read' && !row.read_at) return false;
      if (reportMetric === 'pending' && row.read_at) return false;
      if (reportMetric === 'feedback' && !row.feedback_text) return false;
      if (reportMetric === 'unresolved' && (!row.feedback_text || row.query_status === 'resolved' || row.query_status === 'closed')) return false;
      if (employeeReportSearch.trim()) {
        const q = employeeReportSearch.toLowerCase();
        const matches = (
          (row.user_name && row.user_name.toLowerCase().includes(q)) ||
          (row.emp_id && row.emp_id.toLowerCase().includes(q)) ||
          (row.email && row.email.toLowerCase().includes(q)) ||
          (row.department && row.department.toLowerCase().includes(q)) ||
          (row.role && row.role.toLowerCase().includes(q)) ||
          (row.feedback_text && row.feedback_text.toLowerCase().includes(q))
        );
        if (!matches) return false;
      }
      return true;
    });
  }, [reportRows, reportMetric, employeeReportSearch]);

  const employeeReportColumns = useMemo(() => [
    { key: 'emp_id', label: 'Emp ID', width: 110 },
    { key: 'user_name', label: 'Employee Name', width: 190 },
    { key: 'workspace_name', label: 'Company', width: 180 },
    { key: 'location_name', label: 'Location / Branch', width: 180 },
    { key: 'department', label: 'Department', width: 150 },
    { key: 'role', label: 'Role / Designation', width: 160 },
    { key: 'status', label: 'Status', width: 150, render: row => statusBadge(row, expired) },
    {
      key: 'action_label',
      label: 'Action Response',
      width: 160,
      render: row => {
        if (!row.action_label && !row.read_at) return <span style={{ color: '#94a3b8' }}>—</span>;
        const isDanger = row.action_id === 'not_understand' || row.action_id === 'declined';
        const isSnooze = row.action_id === 'snooze';
        return (
          <span className={`badge-action ${isDanger ? 'action-danger' : isSnooze ? 'action-warning' : 'action-success'}`}>
            {row.action_label || 'Read'}
          </span>
        );
      }
    },
    {
      key: 'feedback_text',
      label: 'Employee Feedback',
      width: 240,
      render: row => row.feedback_text ? (
        <span style={{ fontSize: 12, color: '#0f172a' }} title={row.feedback_text}>
          💬 {row.feedback_text}
        </span>
      ) : <span style={{ color: '#94a3b8' }}>—</span>
    },
    {
      key: 'query_status',
      label: 'Query Status',
      width: 130,
      render: row => row.feedback_text ? queryStatusBadge(row.query_status) : <span style={{ color: '#94a3b8' }}>—</span>
    },
    {
      key: 'admin_action',
      label: 'Query Resolution',
      width: 160,
      render: row => row.feedback_text ? (
        <button
          type="button"
          className="reply-query-btn"
          onClick={() => setFeedbackDrawer({
            open: true,
            row,
            replyText: row.admin_reply || '',
            status: row.query_status || 'open',
            busy: false
          })}
        >
          <MessageSquare size={12} /> {row.admin_reply ? 'View / Update' : 'Reply & Resolve'}
        </button>
      ) : <span style={{ color: '#94a3b8' }}>—</span>
    },
    { key: 'sent_at', label: 'Sent (IST)', width: 160, render: row => ist(row.sent_at) },
    { key: 'delivered_at', label: 'Delivered (IST)', width: 160, render: row => ist(row.delivered_at) },
    { key: 'read_at', label: 'Read (IST)', width: 160, render: row => ist(row.responded_at || row.read_at) }
  ], [expired]);

  return (
    <div className="broadcast-panel">
      {/* Intro Header */}
      <div className="intro">
        <div>
          <h2><Bell size={22} /> User Notifications & Announcements</h2>
          <p>Multi-tenant notification studio with audience targeting, employee feedback, acknowledgement tracking, and query resolution.</p>
        </div>
        <span className="live-clock-tag">IST (Asia/Kolkata, UTC+5:30)</span>
      </div>

      {error && <div className="feedback error" role="alert"><AlertCircle size={16} /> {error}</div>}
      {notice && <div className="feedback success" role="status"><CheckCircle2 size={16} /> {notice}</div>}

      {/* Main Mode Tabs */}
      <div className="studio-mode-switcher">
        <button
          type="button"
          className={`mode-tab-btn ${studioMode === 'compose' ? 'active' : ''}`}
          onClick={() => setStudioMode('compose')}
        >
          <Send size={15} /> 4-Step Notification Composer
        </button>
        <button
          type="button"
          className={`mode-tab-btn ${studioMode === 'history' ? 'active' : ''}`}
          onClick={() => { setStudioMode('history'); loadReport(reportId); }}
        >
          <BarChart3 size={15} /> Past Broadcasts & Reports ({history.length})
        </button>
      </div>

      {/* COMPOSER MODE */}
      {studioMode === 'compose' && (
        <fieldset disabled={!!busy} style={{ border: 0, padding: 0, margin: 0 }}>
          {/* 4-Step Sticky Stepper Header */}
          <div className="composer-stepper-sticky-wrap">
            <div className="composer-stepper">
              {[
                { num: 1, title: 'Choose Audience', desc: 'Scope, branches & filters', icon: Users },
                { num: 2, title: 'Compose Notification', desc: 'Type, title & buttons', icon: FileText },
                { num: 3, title: 'Delivery & Behaviour', desc: 'Placement, snooze & validity', icon: Sliders },
                { num: 4, title: 'Review & Publish', desc: 'Preview, test & schedule', icon: Sparkles }
              ].map(s => {
                const IconComp = s.icon;
                const isActive = step === s.num;
                const isDone = step > s.num;
                return (
                  <button
                    key={s.num}
                    type="button"
                    className={`step-pill-btn ${isActive ? 'active' : ''} ${isDone ? 'completed' : ''}`}
                    onClick={() => {
                      if (isDone || (s.num === 2 && recipients.length > 0) || (s.num === 3 && title.trim() && message.trim()) || s.num === 4) {
                        setStep(s.num);
                      }
                    }}
                  >
                    <span className="step-circle">{isDone ? '✓' : s.num}</span>
                    <div className="step-label-group">
                      <span className="step-main-title"><IconComp size={14} /> {s.title}</span>
                      <small className="step-sub-desc">{s.desc}</small>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 1: CHOOSE AUDIENCE */}
          {step === 1 && (
            <section className="surface step-surface">
              <div className="step-header-row">
                <div>
                  <h3>Step 1 — Choose Audience & Recipients</h3>
                  <p className="hint">Select target scope, company, branches, and optional department or role filters.</p>
                </div>
                {audience.scope && (
                  <button
                    className="refresh-audience-mini-btn"
                    type="button"
                    disabled={audienceLoading}
                    onClick={refreshAudience}
                  >
                    <RefreshCw size={13} className={busy === 'audience' ? 'spin' : ''} />
                    {busy === 'audience' ? 'Verifying…' : 'Verify Audience'}
                  </button>
                )}
              </div>

              {/* Target Scope Selection */}
              <div className="form-grid">
                <label>
                  Audience Scope (Required)
                  <select
                    disabled={audienceLoading}
                    value={audience.scope}
                    onChange={e => changeAudience({ ...audience, scope: e.target.value, locations: [] })}
                    className={!audience.scope ? 'select-unchosen' : ''}
                  >
                    <option value="">Select Target Audience…</option>
                    <option value="all">All Workspaces · All Users (Master Admin)</option>
                    <option value="workspace">Specific Company / Workspace</option>
                    <option value="headquarters">Headquarters Only</option>
                    <option value="branches">Specific Branches</option>
                  </select>
                </label>

                {audience.scope && audience.scope !== 'all' && (
                  <label>
                    Company / Client Workspace
                    <select
                      value={audience.workspace}
                      onChange={e => changeAudience({ ...audience, workspace: e.target.value, locations: [] })}
                    >
                      <option value="">Choose workspace</option>
                      {workspaces.map(w => <option key={w.key} value={w.key}>{w.name}</option>)}
                    </select>
                  </label>
                )}
              </div>

              {!audience.scope && (
                <div className="audience-prompt-banner">
                  <Info size={16} />
                  <span>Please choose an <b>Audience Scope</b> above to calculate eligible employees and continue.</span>
                </div>
              )}

              {/* Specific Branches */}
              {audience.scope === 'branches' && (
                <div className="branch-list-card">
                  <strong>Select Target Branches:</strong>
                  {!branches.length && <p className="hint">No mapped branches found for this workspace.</p>}
                  <div className="branch-grid">
                    {branches.map(b => (
                      <label key={b.key} className="checkbox-chip">
                        <input
                          type="checkbox"
                          checked={audience.locations.includes(b.key)}
                          onChange={e => changeAudience({
                            ...audience,
                            locations: e.target.checked
                              ? [...audience.locations, b.key]
                              : audience.locations.filter(k => k !== b.key)
                          })}
                        />
                        <span>{b.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Advanced Multi-Filters: Searchable Departments & Roles */}
              {audience.scope && (
                <div className="advanced-filters-section">
                  <div className="filter-block">
                    <div className="filter-header">
                      <div>
                        <strong>Filter by Department (Optional):</strong>
                        <span className="selected-counter">
                          {audience.departments?.length > 0 ? `Selected: ${audience.departments.length} of ${distinctDepartments.length}` : 'All Departments'}
                        </span>
                      </div>
                      <div className="filter-quick-actions">
                        <button
                          type="button"
                          className="quick-action-link"
                          onClick={() => changeAudience({ ...audience, departments: [...distinctDepartments] })}
                        >
                          Select All
                        </button>
                        {audience.departments?.length > 0 && (
                          <button
                            type="button"
                            className="quick-action-link clear"
                            onClick={() => changeAudience({ ...audience, departments: [] })}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="searchable-filter-search-box">
                      <Search size={13} style={{ color: '#94a3b8' }} />
                      <input
                        type="text"
                        placeholder="Search departments…"
                        value={deptSearch}
                        onChange={e => setDeptSearch(e.target.value)}
                      />
                      {deptSearch && (
                        <button type="button" onClick={() => setDeptSearch('')} className="clear-chip-search">
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div className="searchable-chips-scroll">
                      {filteredDepartments.map(dept => {
                        const isSel = audience.departments?.includes(dept);
                        return (
                          <button
                            key={dept}
                            type="button"
                            className={`filter-chip ${isSel ? 'chip-active' : ''}`}
                            onClick={() => {
                              const next = isSel
                                ? audience.departments.filter(d => d !== dept)
                                : [...(audience.departments || []), dept];
                              changeAudience({ ...audience, departments: next });
                            }}
                          >
                            {isSel ? '✓ ' : '+ '} {dept}
                          </button>
                        );
                      })}
                      {!filteredDepartments.length && (
                        <span style={{ fontSize: 11.5, color: '#94a3b8', padding: '4px 0' }}>No departments match "{deptSearch}"</span>
                      )}
                    </div>
                  </div>

                  <div className="filter-block" style={{ marginTop: 14 }}>
                    <div className="filter-header">
                      <div>
                        <strong>Filter by Role / Designation (Optional):</strong>
                        <span className="selected-counter">
                          {audience.roles?.length > 0 ? `Selected: ${audience.roles.length} of ${distinctRoles.length}` : 'All Roles'}
                        </span>
                      </div>
                      <div className="filter-quick-actions">
                        <button
                          type="button"
                          className="quick-action-link"
                          onClick={() => changeAudience({ ...audience, roles: [...distinctRoles] })}
                        >
                          Select All
                        </button>
                        {audience.roles?.length > 0 && (
                          <button
                            type="button"
                            className="quick-action-link clear"
                            onClick={() => changeAudience({ ...audience, roles: [] })}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="searchable-filter-search-box">
                      <Search size={13} style={{ color: '#94a3b8' }} />
                      <input
                        type="text"
                        placeholder="Search roles / designations…"
                        value={roleSearch}
                        onChange={e => setRoleSearch(e.target.value)}
                      />
                      {roleSearch && (
                        <button type="button" onClick={() => setRoleSearch('')} className="clear-chip-search">
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div className="searchable-chips-scroll">
                      {filteredRoles.map(role => {
                        const isSel = audience.roles?.includes(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            className={`filter-chip ${isSel ? 'chip-active' : ''}`}
                            onClick={() => {
                              const next = isSel
                                ? audience.roles.filter(r => r !== role)
                                : [...(audience.roles || []), role];
                              changeAudience({ ...audience, roles: next });
                            }}
                          >
                            {isSel ? '✓ ' : '+ '} {role}
                          </button>
                        );
                      })}
                      {!filteredRoles.length && (
                        <span style={{ fontSize: 11.5, color: '#94a3b8', padding: '4px 0' }}>No roles match "{roleSearch}"</span>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label className="checkbox-toggle-label">
                      <input
                        type="checkbox"
                        checked={audience.onlyOnline}
                        onChange={e => changeAudience({ ...audience, onlyOnline: e.target.checked })}
                      />
                      <div>
                        <strong>⚡ Target Currently Online Users Only</strong>
                        <p>Restrict broadcast popup exclusively to employees who have an active session in the last 5 minutes.</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Recipient Count Summary Cards */}
              {audience.scope && (
                <div className="stats stats-compact">
                  <div><b>{recipients.length}</b><span>Targeted Users</span></div>
                  <div><b>{onlineKnown ? onlineCount : '—'}</b><span>Online Now</span></div>
                  <div><b>{onlineKnown ? recipients.length - onlineCount : '—'}</b><span>Offline / Away</span></div>
                  <div><b>{unassigned}</b><span>Unassigned Location</span></div>
                </div>
              )}

              {audience.scope && (
                <p className="hint" style={{ fontSize: 11.5 }}>
                  * Note: Unassigned user accounts are included in the tenant recipient count. Resigned and held accounts are automatically excluded.
                </p>
              )}

              {/* Searchable Eligible Employee List (Collapsible) */}
              {audience.scope && (
                <div className="audience-table-toggle-wrap">
                  <button
                    type="button"
                    className="toggle-audience-details-btn"
                    onClick={() => setShowEmployeeList(prev => !prev)}
                  >
                    {showEmployeeList ? '▲ Hide Eligible Employees Preview' : `▼ Search & Preview Eligible Employees (${recipients.length} users)`}
                  </button>

                  {showEmployeeList && (
                    <div className="employee-preview-container">
                      <div className="employee-search-bar">
                        <Search size={14} style={{ color: '#64748b' }} />
                        <input
                          type="text"
                          placeholder="Search employee by name, ID, department or role…"
                          value={employeeSearch}
                          onChange={e => { setEmployeeSearch(e.target.value); setEmployeePage(1); }}
                        />
                        {employeeSearch && (
                          <button type="button" onClick={() => setEmployeeSearch('')} className="clear-search-btn">
                            <X size={13} />
                          </button>
                        )}
                      </div>

                      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Emp ID</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Employee Name</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Company</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Location</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Department</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left' }}>Role</th>
                              <th style={{ padding: '8px 12px', textAlign: 'center' }}>Online</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedPreviewEmployees.map(u => (
                              <tr key={u.user_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '8px 12px', fontWeight: 600, color: '#4f46e5' }}>{u.emp_id || '—'}</td>
                                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{u.name}</td>
                                <td style={{ padding: '8px 12px', color: '#64748b' }}>{u.workspace_name}</td>
                                <td style={{ padding: '8px 12px', color: '#64748b' }}>{u.location_name}</td>
                                <td style={{ padding: '8px 12px' }}>{u.department || '—'}</td>
                                <td style={{ padding: '8px 12px' }}>{u.role || '—'}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                  {u.online ? <span className="online-dot" title="Online now" /> : <span className="offline-dot" title="Offline" />}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {totalEmployeePages > 1 && (
                        <div className="mini-pagination">
                          <span>Showing page {employeePage} of {totalEmployeePages} ({filteredPreviewEmployees.length} matching)</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              type="button"
                              disabled={employeePage <= 1}
                              onClick={() => setEmployeePage(p => p - 1)}
                              className="page-pill-btn"
                            >
                              Prev
                            </button>
                            <button
                              type="button"
                              disabled={employeePage >= totalEmployeePages}
                              onClick={() => setEmployeePage(p => p + 1)}
                              className="page-pill-btn"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 1 Footer */}
              <div className="step-nav-footer">
                <span className="step-hint-text">
                  {recipients.length > 0
                    ? `✓ ${recipients.length} eligible employee(s) targeted.`
                    : audience.scope
                    ? '⚠️ No employees match this audience selection.'
                    : 'Select audience to proceed.'}
                </span>
                <button
                  type="button"
                  className="primary btn-next-step"
                  disabled={!audience.scope || recipients.length === 0}
                  onClick={() => setStep(2)}
                >
                  Proceed to Step 2: Compose Notification <ArrowRight size={16} />
                </button>
              </div>
            </section>
          )}

          {/* STEP 2: COMPOSE NOTIFICATION */}
          {step === 2 && (
            <section className="surface step-surface">
              <div className="step-header-row">
                <div>
                  <h3>Step 2 — Compose Notification & Action Buttons</h3>
                  <p className="hint">Choose notification priority category, format message, and set up interactive response buttons.</p>
                </div>
              </div>

              {/* Notification Category Pills */}
              <div className="notification-types-container">
                <label className="field-group-label">Notification Type & Priority:</label>
                <div className="type-pills-grid">
                  {Object.values(NOTIFICATION_TYPES).map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className={`type-select-card ${notificationType === t.id ? 'active' : ''}`}
                      style={{
                        borderColor: notificationType === t.id ? t.color : '#e2e8f0',
                        background: notificationType === t.id ? t.bg : '#ffffff'
                      }}
                      onClick={() => handleSelectNotificationType(t.id)}
                    >
                      <span className="type-card-icon">{t.icon}</span>
                      <div>
                        <strong style={{ color: t.color }}>{t.label}</strong>
                        <p>{t.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Title & Live Counter */}
              <div style={{ marginTop: 16 }}>
                <div className="field-label-row">
                  <label>Notification Title (Required)</label>
                  <span className="char-counter">{title.length} / 150</span>
                </div>
                <input
                  type="text"
                  maxLength={150}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Critical Safety Policy Update / System Maintenance at 6 PM"
                  className="composer-title-input"
                />
              </div>

              {/* Message with Rich Formatting Toolbar */}
              <div style={{ marginTop: 16 }}>
                <div className="field-label-row">
                  <label>Notification Message (Required)</label>
                  <span className="char-counter">{message.length} / 4,000</span>
                </div>

                <div className="formatting-toolbar">
                  <button type="button" title="Bold" onClick={() => insertFormatting('**', '**', 'bold text')}>
                    <strong>B</strong>
                  </button>
                  <button type="button" title="Italic" onClick={() => insertFormatting('*', '*', 'italic text')}>
                    <em>I</em>
                  </button>
                  <button type="button" title="Bullet List" onClick={() => insertFormatting('\n- ', '', 'Bullet item')}>
                    • List
                  </button>
                  <button type="button" title="Numbered List" onClick={() => insertFormatting('\n1. ', '', 'Numbered item')}>
                    1. List
                  </button>
                  <button type="button" title="Add Link" onClick={() => insertFormatting('[', '](https://example.com)', 'Link Title')}>
                    🔗 Link
                  </button>
                </div>

                <textarea
                  ref={textareaRef}
                  rows={6}
                  maxLength={4000}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Write clear instructions, background details, or announcements for employees. You can use **bold**, *italic*, bullets, and links..."
                  className="composer-textarea"
                />
              </div>

              {/* Action Buttons Mode Selector */}
              <div className="advance-preset-tabs" style={{ marginTop: 20 }}>
                <div className="preset-tabs-header">
                  <strong>Response & Action Button Mode:</strong>
                  <span className="preset-subtitle">Configure employee response interaction</span>
                </div>
                <div className="preset-tabs-bar">
                  <button
                    type="button"
                    className={`preset-tab-btn ${advancePreset === 'acknowledgement' ? 'active' : ''}`}
                    onClick={() => { setAdvancePreset('acknowledgement'); applyButtonPreset('dual'); }}
                  >
                    <Check size={16} />
                    <div className="tab-btn-text">
                      <strong>Acknowledgement</strong>
                      <small>Understand / Not Understand</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`preset-tab-btn ${advancePreset === 'announcement' ? 'active' : ''}`}
                    onClick={() => { setAdvancePreset('announcement'); applyButtonPreset('single'); }}
                  >
                    <Info size={16} />
                    <div className="tab-btn-text">
                      <strong>Announcement</strong>
                      <small>Single confirmation button</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`preset-tab-btn ${advancePreset === 'approval' ? 'active' : ''}`}
                    onClick={() => { setAdvancePreset('approval'); applyButtonPreset('approval'); }}
                  >
                    <CheckCircle2 size={16} />
                    <div className="tab-btn-text">
                      <strong>Approval</strong>
                      <small>Approve / Reject</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`preset-tab-btn ${advancePreset === 'spc_feedback_rating' ? 'active' : ''}`}
                    onClick={() => setAdvancePreset('spc_feedback_rating')}
                  >
                    <Star size={16} />
                    <div className="tab-btn-text">
                      <strong>Feedback Rating</strong>
                      <small>1-5 Stars + Comments</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`preset-tab-btn ${advancePreset === 'process' ? 'active' : ''}`}
                    onClick={() => setAdvancePreset('process')}
                  >
                    <ListChecks size={16} />
                    <div className="tab-btn-text">
                      <strong>Process Audit</strong>
                      <small>10-point health matrix</small>
                    </div>
                  </button>
                </div>
              </div>

              {/* Action Buttons Studio */}
              {(advancePreset === 'acknowledgement' || advancePreset === 'announcement' || advancePreset === 'approval') && (
                <div className="button-studio">
                  <div className="button-studio-header">
                    <h4>Action Buttons Configuration</h4>
                    <p className="hint">Customise buttons shown to employees. Clicking negative can collect remarks for admin clarification.</p>
                  </div>

                  <div className="button-list">
                    {actionButtons.map((btn, idx) => (
                      <div key={btn.id || idx} className="button-row-item">
                        <span className="btn-index-badge">Button {idx + 1}</span>
                        <input
                          type="text"
                          value={btn.label}
                          maxLength={30}
                          placeholder="Button label"
                          onChange={e => updateButton(idx, 'label', e.target.value)}
                          className="btn-label-input"
                        />
                        <select
                          value={btn.variant || 'secondary'}
                          onChange={e => updateButton(idx, 'variant', e.target.value)}
                          className="btn-variant-select"
                        >
                          <option value="primary">Emerald Green (Positive)</option>
                          <option value="danger">Soft Rose (Negative / Issue)</option>
                          <option value="warning">Amber (Notice)</option>
                          <option value="secondary">Neutral Slate</option>
                        </select>
                        <button
                          type="button"
                          disabled={actionButtons.length <= 1}
                          onClick={() => removeButton(idx)}
                          className="btn-delete-action"
                          title="Remove button"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}

                    {actionButtons.length < 4 && (
                      <button type="button" className="add-button-btn" onClick={addButton}>
                        + Add Another Button
                      </button>
                    )}
                  </div>

                  <div className="toggles-grid" style={{ marginTop: 14 }}>
                    <label className="checkbox-toggle-label">
                      <input
                        type="checkbox"
                        checked={allowFeedback}
                        onChange={e => setAllowFeedback(e.target.checked)}
                      />
                      <div>
                        <strong>💬 Collect Employee Feedback & Queries</strong>
                        <p>
                          {advancePreset === 'announcement'
                            ? 'Allows employees to submit clarification remarks or questions directly to admin.'
                            : 'When clicked on negative actions (e.g. Not Understand / Reject), opens remarks box for employee concerns.'}
                        </p>
                      </div>
                    </label>

                    {(advancePreset === 'acknowledgement' || advancePreset === 'approval') && (
                      <label className="checkbox-toggle-label">
                        <input
                          type="checkbox"
                          checked={requireCommentOnNegative}
                          onChange={e => setRequireCommentOnNegative(e.target.checked)}
                        />
                        <div>
                          <strong>❗ Require comment on negative response</strong>
                          <p>Employee must submit remarks explaining the issue before their response is acknowledged.</p>
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Feedback Rating Studio */}
              {advancePreset === 'spc_feedback_rating' && (
                <div className="rating-studio">
                  <label>
                    Rating Question / Prompt:
                    <input
                      type="text"
                      maxLength={150}
                      value={ratingPrompt}
                      onChange={e => setRatingPrompt(e.target.value)}
                      placeholder="e.g. Rate your overall experience with SPC Workspace"
                    />
                  </label>
                  <p className="hint">Recipients can tap 1 to 5 stars and submit optional feedback suggestions.</p>
                </div>
              )}

              {/* Process Audit Studio */}
              {advancePreset === 'process' && (
                <div className="process-studio">
                  <div className="studio-top-bar">
                    <div>
                      <h4>Process Health Audit Matrix</h4>
                      <p className="hint">Employees evaluate each process: 🟢 Working | 🟡 Minor Issue | 🔴 Not Working.</p>
                    </div>
                    <button
                      type="button"
                      className="secondary btn-load-core"
                      onClick={() => setProcessList(CORE_CRM_PROCESSES)}
                    >
                      <Sparkles size={14} /> Load 10 Core CRM Processes
                    </button>
                  </div>

                  <div className="process-builder-list">
                    {processList.map((proc, idx) => (
                      <div key={proc.id || idx} className="process-item-row">
                        <span className="proc-index-tag">#{idx + 1}</span>
                        <input
                          type="text"
                          value={proc.name}
                          maxLength={100}
                          onChange={e => updateProcessItem(idx, e.target.value)}
                          className="proc-name-input"
                        />
                        <button
                          type="button"
                          disabled={processList.length <= 1}
                          onClick={() => removeProcessItem(idx)}
                          className="btn-delete-proc"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {processList.length < 15 && (
                      <button type="button" className="add-proc-btn" onClick={addProcessItem}>
                        + Add Process ({processList.length}/15)
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2 Footer */}
              <div className="step-nav-footer">
                <button type="button" className="secondary btn-back-step" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} /> Back to Step 1
                </button>
                <button
                  type="button"
                  className="primary btn-next-step"
                  disabled={!title.trim() || !message.trim()}
                  onClick={() => setStep(3)}
                >
                  Proceed to Step 3: Delivery & Behaviour <ArrowRight size={16} />
                </button>
              </div>
            </section>
          )}

          {/* STEP 3: DELIVERY & BEHAVIOUR */}
          {step === 3 && (
            <section className="surface step-surface">
              <div className="step-header-row">
                <div>
                  <h3>Step 3 — Delivery, Placement & Snooze Behaviour</h3>
                  <p className="hint">Configure where notifications appear on employee screens, auto-close timing, message validity, and snooze policies.</p>
                </div>
              </div>

              {/* Screen Placement */}
              <div className="style-section-block">
                <label className="field-group-label">Notification Placement on Screen:</label>
                <div className="placement-options-grid">
                  {NOTIFICATION_PLACEMENTS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={`placement-card ${placementStyle === p.id ? 'active' : ''}`}
                      aria-pressed={placementStyle === p.id}
                      disabled={p.id === 'full_screen' && notificationType !== 'critical'}
                      onClick={() => setPlacementStyle(p.id)}
                    >
                      <PlacementIllustration placement={p.id} />
                      <span className="placement-copy"><strong>{p.label}</strong><span>{p.description}</span></span>
                      <span className="placement-selection">{placementStyle === p.id ? <CheckCircle2 size={16} /> : <span className="placement-radio" />}</span>
                    </button>
                  ))}
                </div>

                <div className="placement-recommendation">
                  <span><Info size={14} /> Recommended for this priority: <strong>{PLACEMENT_LABELS[RECOMMENDED_NOTIFICATION_PLACEMENTS[notificationType]]}</strong></span>
                  <button type="button" onClick={() => setPlacementStyle(RECOMMENDED_NOTIFICATION_PLACEMENTS[notificationType])}>Use recommendation</button>
                </div>
                {invalidCriticalPlacement && <p className="presentation-warning" role="alert">Full-screen alerts require Critical priority. Your selected placement is preserved; choose another style or change priority before sending.</p>}
                <div className="presentation-settings-grid">
                  <label>Notification Size
                    <select value={notificationSize} onChange={event => setNotificationSize(event.target.value)}>{NOTIFICATION_SIZES.map(size => <option key={size} value={size}>{size === 'auto' ? 'Auto (Recommended)' : size[0].toUpperCase() + size.slice(1)}</option>)}</select>
                    <small>Auto adapts to content, actions and screen size.</small>
                  </label>
                  <label>Notification Entry Animation
                    <select value={presentationSettings.entry_animation} onChange={event => setEntryAnimation(event.target.value)}>{NOTIFICATION_ANIMATIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                    <button type="button" className="animation-default" onClick={() => setEntryAnimation(null)}>{entryAnimation === null ? 'Using placement default' : 'Use placement default'}</button>
                  </label>
                  <label>Animation Duration
                    <select value={animationDuration} onChange={event => setAnimationDuration(Number(event.target.value))}>{NOTIFICATION_ANIMATION_SPEEDS.map(([ms, label]) => <option key={ms} value={ms}>{label} — {ms}ms</option>)}</select>
                    <small>Reduced-motion preferences are respected.</small>
                  </label>
                </div>
                {/* Compact Live Placement Preview in Step 3 */}
                {renderScreenSimulator(true)}
              </div>

              {/* Color Theme */}
              <div className="style-section-block" style={{ marginTop: 18 }}>
                <label className="field-group-label">Color Theme Accent:</label>
                <div className="theme-options-grid">
                  {[
                    { id: 'indigo', label: 'Indigo Modern', color: '#4f46e5' },
                    { id: 'emerald', label: 'Emerald Success', color: '#059669' },
                    { id: 'amber', label: 'Amber Warning', color: '#d97706' },
                    { id: 'rose', label: 'Rose Alert', color: '#e11d48' }
                  ].map(th => (
                    <button
                      key={th.id}
                      type="button"
                      className={`theme-chip-btn ${colorTheme === th.id ? 'active' : ''}`}
                      onClick={() => setColorTheme(th.id)}
                    >
                      <span className="theme-color-dot" style={{ background: th.color }} />
                      <span>{th.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Close Behaviour & Display Duration */}
              <div className="form-grid" style={{ marginTop: 18 }}>
                <label>
                  Close Behaviour
                  <select
                    value={closeBehaviour}
                    onChange={e => setCloseBehaviour(e.target.value)}
                  >
                    <option value="auto_unread">Auto-Close, Keep Unread in Inbox</option>
                    <option value="auto_viewed">Auto-Close, Mark Viewed</option>
                    <option value="manual">Manual Close (Stays visible until closed)</option>
                    <option value="required">Acknowledgement Required (Must respond)</option>
                  </select>
                </label>

                {(closeBehaviour === 'auto_unread' || closeBehaviour === 'auto_viewed') && (
                  <label>
                    Auto-Close Display Duration (Seconds: 5–300)
                    <input
                      type="number"
                      min={5}
                      max={300}
                      value={duration}
                      onChange={e => setDuration(Math.max(5, Math.min(300, Number(e.target.value) || 15)))}
                    />
                  </label>
                )}

                <label>
                  Message Validity
                  <select
                    value={validity}
                    onChange={e => setValidity(Number(e.target.value))}
                  >
                    <option value={1}>1 Hour</option>
                    <option value={6}>6 Hours</option>
                    <option value={12}>12 Hours</option>
                    <option value={24}>24 Hours (1 Day)</option>
                    <option value={72}>72 Hours (3 Days)</option>
                    <option value={168}>168 Hours (7 Days)</option>
                    <option value={720}>720 Hours (30 Days)</option>
                  </select>
                </label>
              </div>

              {/* Remind Me Later / Snooze Policy */}
              <div style={{ marginTop: 18 }}>
                <label className="checkbox-toggle-label">
                  <input
                    type="checkbox"
                    checked={allowReminder}
                    onChange={e => setAllowReminder(e.target.checked)}
                  />
                  <div>
                    <strong>⏰ Enable "Remind Me Later" (5 / 15 / 30 / 45 / 60 min Snooze)</strong>
                    <p>Allows busy employees to snooze the notification. Notification redisplays automatically when due, and stops once acknowledged or expired.</p>
                  </div>
                </label>
              </div>

              {/* Step 3 Footer */}
              <div className="step-nav-footer">
                <button type="button" className="secondary btn-back-step" onClick={() => setStep(2)}>
                  <ArrowLeft size={16} /> Back to Step 2
                </button>
                <button type="button" className="primary btn-next-step" onClick={() => setStep(4)}>
                  Proceed to Step 4: Review & Publish <ArrowRight size={16} />
                </button>
              </div>
            </section>
          )}

          {/* STEP 4: REVIEW & PUBLISH */}
          {step === 4 && (
            <section className="surface step-surface">
              <div className="step-header-row">
                <div>
                  <h3>Step 4 — Review, Test & Dispatch Announcement</h3>
                  <p className="hint">Review full summary, test on your own screen, or schedule for future publishing.</p>
                </div>
                <div className="device-switcher-pills">
                  <button
                    type="button"
                    className={`device-btn ${previewDevice === 'desktop' ? 'active' : ''}`}
                    onClick={() => setPreviewDevice('desktop')}
                  >
                    <Monitor size={14} /> Desktop View
                  </button>
                  <button
                    type="button"
                    className={`device-btn ${previewDevice === 'mobile' ? 'active' : ''}`}
                    onClick={() => setPreviewDevice('mobile')}
                  >
                    <Smartphone size={14} /> Mobile Screen
                  </button>
                </div>
              </div>

              {/* Live Preview Viewport */}
              <div className="step4-preview-box">
                {/* Direct Placement Switcher in Step 4 */}
                <div className="step4-placement-switcher-bar">
                  <span className="placement-switcher-label">Switch Placement:</span>
                  <div className="placement-pills-bar">
                    {NOTIFICATION_PLACEMENTS.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className={`placement-pill-btn ${placementStyle === p.id ? 'active' : ''}`}
                        aria-pressed={placementStyle === p.id}
                        disabled={p.id === 'full_screen' && notificationType !== 'critical'}
                        onClick={() => setPlacementStyle(p.id)}
                      >
                        {placementStyle === p.id && <Check size={12} />}
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="preview-top-badge-row">
                  <span className="preview-tag type-tag">{NOTIFICATION_TYPES[notificationType]?.label || 'Notice'}</span>
                  <span className="preview-tag theme-tag">Theme: {THEME_LABELS[colorTheme] || colorTheme}</span>
                  <span className="preview-tag placement-tag">Placement: {PLACEMENT_LABELS[placementStyle] || placementStyle}</span>
                </div>

                <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                  {renderScreenSimulator(false)}
                </div>
              </div>

              {/* Summary Cards */}
              <div className="summary-cards-grid">
                <div className="summary-card">
                  <strong>🎯 Audience Target Summary</strong>
                  <p>Scope: <b>{audienceLabel(audience)}</b></p>
                  <p>Eligible Users: <b>{recipients.length} recipients</b></p>
                  {audience.departments?.length > 0 && <p>Depts: <b>{audience.departments.join(', ')}</b></p>}
                  {audience.roles?.length > 0 && <p>Roles: <b>{audience.roles.join(', ')}</b></p>}
                  {audience.onlyOnline && <p>⚡ Online users only</p>}
                </div>

                <div className="summary-card">
                  <strong>📋 Notification Summary</strong>
                  <p>Type: <b>{NOTIFICATION_TYPES[notificationType]?.label}</b></p>
                  <p>Title: <b>{title}</b></p>
                  <p>Action Mode: <b>{PRESET_LABELS[advancePreset] || advancePreset}</b></p>
                  <p>Feedback: <b>{allowFeedback ? 'Enabled' : 'Disabled'}</b></p>
                </div>

                <div className="summary-card">
                  <strong>⚙️ Delivery & Retention</strong>
                  <p>Placement: <b>{PLACEMENT_LABELS[placementStyle] || placementStyle}</b></p>
                  <p>Size: <b>{notificationSize}</b> · Animation: <b>{NOTIFICATION_ANIMATIONS.find(([id]) => id === presentationSettings.entry_animation)?.[1]}</b> ({animationDuration}ms)</p>
                  <p>Close Rule: <b>{CLOSE_BEHAVIOUR_LABELS[closeBehaviour] || closeBehaviour}</b></p>
                  <p>Display Time: <b>{closeBehaviour === 'manual' || closeBehaviour === 'required' ? 'Manual Close' : `${duration}s`}</b></p>
                  <p>Validity: <b>{validity} hours</b></p>
                </div>
              </div>

              {/* Publishing Schedule Option */}
              <div className="schedule-box">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="schedule_choice"
                    checked={!isScheduled}
                    onChange={() => setIsScheduled(false)}
                  />
                  <span><strong>Publish Immediately</strong> (Dispatches to eligible recipients now)</span>
                </label>

                <label className="radio-label" style={{ marginTop: 8 }}>
                  <input
                    type="radio"
                    name="schedule_choice"
                    checked={isScheduled}
                    onChange={() => setIsScheduled(true)}
                  />
                  <span><strong>Schedule for Later Date & Time</strong></span>
                </label>

                {isScheduled && (
                  <div style={{ marginTop: 10, paddingLeft: 24 }}>
                    <label>
                      Select Publish Time (IST / Asia/Kolkata):
                      <input
                        type="datetime-local"
                        value={scheduledIST}
                        onChange={e => setScheduledIST(e.target.value)}
                        className="schedule-input"
                      />
                    </label>
                    {!isScheduleValid && (
                      <p style={{ color: '#ea580c', fontSize: 11.5, margin: '6px 0 0', fontWeight: 600 }}>
                        ⚠️ Please choose a valid future date & time (at least 1 minute ahead in IST).
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Step 4 Actions Bar */}
              <div className="step4-actions-bar">
                <button type="button" className="secondary btn-back-step" onClick={() => setStep(3)}>
                  <ArrowLeft size={16} /> Back to Step 3
                </button>

                <div className="step4-right-buttons">
                  <button
                    type="button"
                    className="secondary btn-draft"
                    disabled={!!busy}
                    onClick={handleSaveDraft}
                  >
                    💾 Save Draft
                  </button>

                  <button
                    type="button"
                    className="secondary btn-test"
                    disabled={!!busy}
                    onClick={handleSendTest}
                  >
                    🧪 Send Test to Me
                  </button>

                  <button
                    type="button"
                    className="primary btn-dispatch-large"
                    disabled={invalidCriticalPlacement || !approvedAudience || recipients.length === 0 || !title.trim() || !message.trim() || !isScheduleValid || !!busy}
                    onClick={handlePublish}
                  >
                    <Send size={16} />
                    {isScheduled ? 'Schedule Broadcast (IST)' : `Publish Broadcast to ${recipients.length} Users`}
                  </button>
                </div>
              </div>

              {!approvedAudience && (
                <p className="unverified-hint" style={{ marginTop: 10, textAlign: 'right' }}>
                  <AlertTriangle size={14} /> Go to Step 1 and click "Verify Audience" before publishing.
                </p>
              )}
            </section>
          )}
        </fieldset>
      )}

      {/* Cross-Workspace All Users Confirmation Dialog */}
      {confirmOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3><ShieldAlert size={18} color="#ea580c" /> Confirm Cross-Workspace Dispatch</h3>
              <button type="button" className="close-btn" onClick={() => setConfirmOpen(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="warning-callout">
                <strong>⚠️ Warning: All Workspaces Target Selected</strong>
                <p>
                  You are about to publish this broadcast announcement to <b>{recipients.length} eligible users across ALL client companies and workspaces</b>.
                </p>
              </div>

              <div className="confirm-summary-grid">
                <div><span>Announcement Title:</span><b>{title}</b></div>
                <div><span>Priority:</span><b>{NOTIFICATION_TYPES[notificationType]?.label}</b></div>
                <div><span>Total Recipients:</span><b>{recipients.length} users</b></div>
                <div><span>Validity:</span><b>{validity} hours</b></div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary btn-confirm-send"
                disabled={!!busy}
                onClick={handlePublish}
              >
                <Send size={15} /> Yes, Publish Across All Workspaces
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAST BROADCASTS & REPORTS MODE */}
      {studioMode === 'history' && (
        <section className="surface history-surface">
          <div className="section-header-row">
            <div>
              <h3>Created Notifications Directory & Delivery Reports</h3>
              <p className="hint">View real-time delivery status, employee responses, feedback comments, and unresolved query resolutions.</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="primary"
                onClick={() => { setStudioMode('compose'); setStep(1); }}
              >
                + Compose New
              </button>
              <button
                type="button"
                className="secondary"
                disabled={reportBusy}
                onClick={() => loadReport(reportId)}
              >
                <RefreshCw size={14} className={reportBusy ? 'spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          {/* History Status Filter Tabs & Search */}
          <div className="history-filter-bar">
            <div className="history-tabs">
              {[
                { id: 'all', label: `All (${history.length})` },
                { id: 'active', label: 'Live & Active' },
                { id: 'scheduled', label: 'Scheduled' },
                { id: 'drafts', label: 'Drafts' },
                { id: 'expired', label: 'Expired' }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  className={`history-tab-btn ${historyFilter === f.id ? 'active' : ''}`}
                  onClick={() => setHistoryFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="history-search-input">
              <Search size={14} style={{ color: '#64748b' }} />
              <input
                type="text"
                placeholder="Search past broadcasts…"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
              />
            </div>
          </div>

          {/* History Broadcast Table */}
          <div className="history-table-container">
            {!filteredHistory.length ? (
              <p style={{ padding: '24px 16px', textAlign: 'center', color: '#64748b' }}>
                No notifications found in {historyFilter} status.
              </p>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Date (IST)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Title & Type</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Audience</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Recipients</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Status</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map(h => {
                      const isSel = reportId === h.id;
                      const hStatus = h.is_draft ? 'draft' : h.status === 'scheduled' ? 'scheduled' : h.audience?.broadcast_status || (Date.parse(h.expires_at) <= Date.now() ? 'expired' : 'active');
                      return (
                        <tr
                          key={h.id}
                          className={`history-row ${isSel ? 'row-selected' : ''}`}
                          onClick={() => selectNotification(h.id)}
                        >
                          <td style={{ padding: '11px 14px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                            {ist(h.created_at)}
                          </td>
                          <td style={{ padding: '11px 14px', borderBottom: '1px solid #e2e8f0', maxWidth: 280 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <strong style={{ color: isSel ? '#4f46e5' : '#0f172a' }}>{h.title}</strong>
                              <span style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {h.message}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '11px 14px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                            {audienceLabel(h.audience)}
                          </td>
                          <td style={{ padding: '11px 14px', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>
                            {h.recipient_count || 0} users
                          </td>
                          <td style={{ padding: '11px 14px', borderBottom: '1px solid #e2e8f0' }}>
                            <span className={`badge-status status-${hStatus}`}>
                              {hStatus === 'draft' ? '📝 Draft' :
                               hStatus === 'scheduled' ? '📅 Scheduled' :
                               hStatus === 'paused' ? '⏸ Paused' :
                               hStatus === 'cancelled' ? '🛑 Cancelled' :
                               hStatus === 'expired' ? '⚪ Expired' : '🟢 Active'}
                            </span>
                          </td>
                          <td style={{ padding: '11px 14px', borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                className="action-icon-btn"
                                title="View Delivery Report"
                                onClick={() => selectNotification(h.id)}
                              >
                                <BarChart3 size={14} />
                              </button>
                              <button
                                type="button"
                                className="action-icon-btn"
                                title="Duplicate to Composer"
                                onClick={() => handleDuplicate(h)}
                              >
                                <Copy size={14} />
                              </button>
                              {h.is_draft && (
                                <button
                                  type="button"
                                  className="action-icon-btn danger"
                                  title="Delete Draft"
                                  onClick={() => handleDeleteDraft(h.id)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* DETAILED BROADCAST REPORT & EMPLOYEE RESPONSES */}
          <div ref={reportSectionRef} style={{ marginTop: 24 }}>
            {report && (
              <div className="report-detail-wrapper">
                {/* Scorecard Metrics Header */}
                <div className="report-header-card">
                  <div>
                    <h4>{currentBroadcast?.title}</h4>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                      Created: {ist(currentBroadcast?.created_at)} · Expires: {ist(currentBroadcast?.expires_at)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {currentBroadcast?.audience?.broadcast_status === 'active' && !expired && (
                      <button
                        type="button"
                        className="secondary status-btn"
                        disabled={statusBusy}
                        onClick={() => handleStatusChange('pause')}
                      >
                        <Pause size={13} /> Pause
                      </button>
                    )}
                    {currentBroadcast?.audience?.broadcast_status === 'paused' && !expired && (
                      <button
                        type="button"
                        className="primary status-btn"
                        disabled={statusBusy}
                        onClick={() => handleStatusChange('resume')}
                      >
                        <Play size={13} /> Resume
                      </button>
                    )}
                    {!expired && currentBroadcast?.status !== 'cancelled' && (
                      <button
                        type="button"
                        className="danger status-btn"
                        disabled={statusBusy}
                        onClick={() => handleStatusChange('cancel')}
                      >
                        <Square size={13} /> Cancel Broadcast
                      </button>
                    )}
                    <button
                      type="button"
                      className="primary export-btn"
                      onClick={() => exportToCsv(`Broadcast_Report_${reportId}`, reportRows)}
                    >
                      <Download size={14} /> Export CSV
                    </button>
                  </div>
                </div>

                {/* Scorecards */}
                <div className="report-scorecards-grid">
                  <div className={`scorecard ${reportMetric === 'total' ? 'active' : ''}`} onClick={() => setReportMetric('total')}>
                    <span className="sc-count">{reportMetrics.total}</span>
                    <span className="sc-label">Targeted</span>
                  </div>
                  <div className={`scorecard ${reportMetric === 'delivered' ? 'active' : ''}`} onClick={() => setReportMetric('delivered')}>
                    <span className="sc-count">{reportMetrics.delivered}</span>
                    <span className="sc-label">Delivered</span>
                  </div>
                  <div className={`scorecard ${reportMetric === 'viewed' ? 'active' : ''}`} onClick={() => setReportMetric('viewed')}>
                    <span className="sc-count">{reportMetrics.viewed}</span>
                    <span className="sc-label">Viewed</span>
                  </div>
                  <div className={`scorecard ${reportMetric === 'read' ? 'active' : ''}`} onClick={() => setReportMetric('read')}>
                    <span className="sc-count" style={{ color: '#059669' }}>{reportMetrics.read}</span>
                    <span className="sc-label">Acknowledged</span>
                  </div>
                  <div className={`scorecard ${reportMetric === 'pending' ? 'active' : ''}`} onClick={() => setReportMetric('pending')}>
                    <span className="sc-count" style={{ color: '#ea580c' }}>{reportMetrics.pending}</span>
                    <span className="sc-label">Pending</span>
                  </div>
                  <div className={`scorecard ${reportMetric === 'feedback' ? 'active' : ''}`} onClick={() => setReportMetric('feedback')}>
                    <span className="sc-count" style={{ color: '#4f46e5' }}>{reportMetrics.feedback}</span>
                    <span className="sc-label">Feedback Received</span>
                  </div>
                  <div className={`scorecard ${reportMetric === 'unresolved' ? 'active' : ''}`} onClick={() => setReportMetric('unresolved')}>
                    <span className="sc-count" style={{ color: '#dc2626' }}>{reportMetrics.unresolved}</span>
                    <span className="sc-label">Unresolved Queries</span>
                  </div>
                </div>

                {/* Employee Response Table Filter & Search */}
                <div className="employee-report-search-row">
                  <div className="emp-search-input">
                    <Search size={14} style={{ color: '#64748b' }} />
                    <input
                      type="text"
                      placeholder="Search recipient by name, Emp ID, department or role…"
                      value={employeeReportSearch}
                      onChange={e => setEmployeeReportSearch(e.target.value)}
                    />
                  </div>
                  <span className="filter-count-label">
                    Showing <b>{filteredReportRows.length}</b> of <b>{reportRows.length}</b> recipients
                  </span>
                </div>

                {/* Paginated Resizable Employee Table */}
                <ReportTable
                  columns={employeeReportColumns}
                  rows={filteredReportRows}
                  storageKey="crm-broadcast-report-widths"
                  maxHeight="440px"
                  activeMetric={reportMetric}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Admin Feedback Reply & Query Resolution Drawer */}
      {feedbackDrawer.open && feedbackDrawer.row && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-dialog query-drawer">
            <div className="modal-header">
              <h3><MessageSquare size={17} color="#4f46e5" /> Employee Feedback & Query Resolution</h3>
              <button type="button" className="close-btn" onClick={() => setFeedbackDrawer(prev => ({ ...prev, open: false }))}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="employee-info-box">
                <div>
                  <strong>{feedbackDrawer.row.user_name}</strong>
                  <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>({feedbackDrawer.row.emp_id || 'No ID'})</span>
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                  {feedbackDrawer.row.workspace_name} · {feedbackDrawer.row.location_name} · {feedbackDrawer.row.department} · {feedbackDrawer.row.role}
                </div>
              </div>

              <div className="query-content-box">
                <span className="query-box-title">Employee's Concern / Feedback:</span>
                <p className="query-text">"{feedbackDrawer.row.feedback_text}"</p>
                <small style={{ color: '#94a3b8' }}>Submitted at: {ist(feedbackDrawer.row.responded_at || feedbackDrawer.row.read_at)}</small>
              </div>

              <div style={{ marginTop: 14 }}>
                <label>
                  Update Query Status:
                  <select
                    value={feedbackDrawer.status}
                    onChange={e => setFeedbackDrawer(prev => ({ ...prev, status: e.target.value }))}
                  >
                    <option value="open">Open (Awaiting action)</option>
                    <option value="in_progress">In Progress (Under review)</option>
                    <option value="resolved">Resolved (Concern resolved)</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
              </div>

              <div style={{ marginTop: 14 }}>
                <label>Admin Reply to Employee:</label>
                <textarea
                  rows={4}
                  value={feedbackDrawer.replyText}
                  onChange={e => setFeedbackDrawer(prev => ({ ...prev, replyText: e.target.value }))}
                  placeholder="Type clarification or guidance for this employee..."
                  className="reply-textarea"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setFeedbackDrawer(prev => ({ ...prev, open: false }))}
              >
                Close
              </button>
              <button
                type="button"
                className="primary"
                disabled={feedbackDrawer.busy || !feedbackDrawer.replyText.trim()}
                onClick={handleSendAdminReply}
              >
                {feedbackDrawer.busy ? 'Sending…' : 'Send Reply & Save Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STYLES */}
      <style jsx>{`
        .broadcast-panel {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: #f8fafc;
        }
        .broadcast-panel :global(button.primary),
        .broadcast-panel :global(button.secondary),
        .broadcast-panel :global(button.danger) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 36px;
          padding: 8px 13px;
          border: 1px solid var(--border-light, #dce3ed);
          border-radius: 8px;
          background: var(--bg-surface, #fff);
          color: var(--text-primary, #17243c);
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.4;
          cursor: pointer;
          box-shadow: none;
        }
        .broadcast-panel :global(button.primary) {
          background: color-mix(in srgb, var(--accent-color, #4f46e5) 10%, var(--bg-surface, #fff));
          border-color: color-mix(in srgb, var(--accent-color, #4f46e5) 30%, var(--border-light, #dce3ed));
          color: var(--text-primary, #17243c);
        }
        .broadcast-panel :global(button.danger) {
          background: #fff7f7;
          border-color: #fecaca;
          color: #b91c1c;
        }
        .broadcast-panel :global(button.primary:hover:not(:disabled)),
        .broadcast-panel :global(button.secondary:hover:not(:disabled)) {
          background: color-mix(in srgb, var(--accent-color, #4f46e5) 16%, var(--bg-surface, #fff));
          box-shadow: var(--shadow-xs, 0 1px 2px #17243c08);
        }
        .broadcast-panel :global(button.primary:focus-visible),
        .broadcast-panel :global(button.secondary:focus-visible),
        .broadcast-panel :global(button.danger:focus-visible) {
          outline: 2px solid var(--accent-color, #4f46e5);
          outline-offset: 2px;
        }
        .broadcast-panel :global(button.primary:disabled),
        .broadcast-panel :global(button.secondary:disabled),
        .broadcast-panel :global(button.danger:disabled) { opacity: .5; cursor: not-allowed; box-shadow: none; }
        .intro {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 18px;
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }
        .intro h2 {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 17px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .intro p {
          margin: 4px 0 0;
          font-size: 13px;
          color: #64748b;
        }
        .live-clock-tag {
          font-size: 11.5px;
          font-weight: 600;
          background: #eef2ff;
          color: #4338ca;
          padding: 4px 10px;
          border-radius: 20px;
        }
        .feedback {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
        }
        .feedback.error {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
        }
        .feedback.success {
          background: #ecfdf5;
          color: #047857;
          border: 1px solid #a7f3d0;
        }
        .studio-mode-switcher {
          display: flex;
          gap: 8px;
          background: #e2e8f0;
          padding: 4px;
          border-radius: 10px;
        }
        .mode-tab-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 9px 16px;
          border: 0;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          background: transparent;
          color: #475569;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .mode-tab-btn.active {
          background: #ffffff;
          color: #4f46e5;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }

        /* 4-Step Sticky Stepper */
        .composer-stepper-sticky-wrap {
          position: sticky;
          top: 0;
          z-index: 20;
          background: #f8fafc;
          padding: 6px 0 12px;
        }
        .composer-stepper {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        .step-pill-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          background: #ffffff;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s ease;
        }
        .step-pill-btn.active {
          border-color: #4f46e5;
          background: #eef2ff;
          box-shadow: 0 2px 6px rgba(79, 70, 229, 0.12);
        }
        .step-pill-btn.completed {
          border-color: #059669;
        }
        .step-circle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #e2e8f0;
          color: #475569;
          font-size: 11px;
          font-weight: 700;
          flex-shrink: 0;
        }
        .step-pill-btn.active .step-circle {
          background: #4f46e5;
          color: #ffffff;
        }
        .step-pill-btn.completed .step-circle {
          background: #059669;
          color: #ffffff;
        }
        .step-label-group {
          display: flex;
          flex-direction: column;
        }
        .step-main-title {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 12.5px;
          font-weight: 700;
          color: #0f172a;
        }
        .step-pill-btn.active .step-main-title {
          color: #4f46e5;
        }
        .step-sub-desc {
          font-size: 10.5px;
          color: #64748b;
          margin-top: 1px;
        }

        /* Surface & Forms */
        .surface {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
        }
        .step-header-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }
        .step-header-row h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
        }
        .hint {
          margin: 4px 0 0;
          font-size: 12px;
          color: #64748b;
        }
        .refresh-audience-mini-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          background: #eef2ff;
          color: #4338ca;
          border: 1px solid #c7d2fe;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .refresh-audience-mini-btn:hover:not(:disabled) {
          background: #4338ca;
          color: #ffffff;
        }
        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 14px;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12.5px;
          font-weight: 600;
          color: #334155;
        }
        select, input[type="text"], input[type="number"], textarea, .schedule-input {
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 7px;
          font-size: 13px;
          background: #ffffff;
          color: #0f172a;
          box-sizing: border-box;
          width: 100%;
        }
        select.select-unchosen {
          border-color: #6366f1;
          background: #f8fafc;
          font-weight: 600;
          color: #4338ca;
        }
        select:focus, input:focus, textarea:focus {
          outline: none;
          border-color: #4f46e5;
          box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.15);
        }
        .audience-prompt-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 14px;
          padding: 12px 16px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          color: #1e40af;
          font-size: 12.5px;
        }

        /* Branch Grid */
        .branch-list-card {
          margin-top: 14px;
          padding: 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .branch-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }
        .checkbox-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 20px;
          font-size: 12px;
          cursor: pointer;
        }

        /* Searchable Multi-Select Filter Chips */
        .advanced-filters-section {
          margin-top: 14px;
          padding: 14px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .filter-block {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .filter-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .filter-header strong {
          font-size: 12.5px;
          color: #1e293b;
        }
        .selected-counter {
          font-size: 11px;
          font-weight: 600;
          color: #4f46e5;
          margin-left: 8px;
        }
        .filter-quick-actions {
          display: flex;
          gap: 8px;
        }
        .quick-action-link {
          background: transparent;
          border: 0;
          color: #4f46e5;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
        }
        .quick-action-link.clear {
          color: #ef4444;
        }
        .searchable-filter-search-box {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          margin: 4px 0 6px;
        }
        .searchable-filter-search-box input {
          border: 0;
          padding: 0;
          outline: none;
          font-size: 11.5px;
          flex: 1;
        }
        .clear-chip-search {
          background: transparent;
          border: 0;
          cursor: pointer;
          color: #94a3b8;
          padding: 1px;
        }
        .searchable-chips-scroll {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          max-height: 120px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .filter-chip {
          padding: 4px 10px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          border-radius: 16px;
          font-size: 11.5px;
          font-weight: 500;
          color: #475569;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .filter-chip:hover {
          border-color: #6366f1;
          color: #4338ca;
        }
        .filter-chip.chip-active {
          background: #4f46e5;
          color: #ffffff;
          border-color: #4f46e5;
        }

        /* Stats */
        .stats-compact {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin: 16px 0;
        }
        .stats-compact > div {
          padding: 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
        }
        .stats-compact b {
          font-size: 22px;
          color: #4f46e5;
        }
        .stats-compact span {
          font-size: 11px;
          color: #64748b;
          margin-top: 2px;
        }

        /* Employee Preview */
        .audience-table-toggle-wrap {
          margin-top: 14px;
          padding-top: 10px;
          border-top: 1px dashed #e2e8f0;
        }
        .toggle-audience-details-btn {
          background: transparent;
          border: 0;
          color: #4f46e5;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          padding: 4px 0;
        }
        .employee-preview-container {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .employee-search-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 7px;
        }
        .employee-search-bar input {
          border: 0;
          padding: 0;
          outline: none;
          font-size: 12.5px;
          flex: 1;
        }
        .clear-search-btn {
          background: transparent;
          border: 0;
          cursor: pointer;
          color: #94a3b8;
          padding: 2px;
        }
        .online-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
        }
        .offline-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #cbd5e1;
        }
        .mini-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11.5px;
          color: #64748b;
        }
        .page-pill-btn {
          padding: 3px 8px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          border-radius: 4px;
          font-size: 11px;
          cursor: pointer;
        }

        /* Step Footer Navigation */
        .step-nav-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #e2e8f0;
        }
        .btn-next-step, .btn-dispatch-large {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 22px;
          background: color-mix(in srgb, var(--accent-color, #4f46e5) 10%, var(--bg-surface, #fff));
          color: var(--text-primary, #17243c);
          border: 0;
          border-radius: 8px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: none;
          transition: all 0.15s ease;
        }
        .btn-next-step:hover:not(:disabled), .btn-dispatch-large:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent-color, #4f46e5) 16%, var(--bg-surface, #fff));
          box-shadow: var(--shadow-xs, 0 1px 2px #17243c08);
          transform: none;
        }
        .btn-next-step:disabled, .btn-dispatch-large:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }
        .btn-back-step {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 16px;
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        /* Step 2: Types Grid */
        .type-pills-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
          margin-top: 8px;
        }
        .type-select-card {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 10px;
          border: 1.5px solid #e2e8f0;
          border-radius: 8px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .type-card-icon {
          font-size: 18px;
        }
        .type-select-card strong {
          display: block;
          font-size: 12px;
        }
        .type-select-card p {
          margin: 2px 0 0;
          font-size: 10.5px;
          color: #64748b;
        }
        .field-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 5px;
        }
        .char-counter {
          font-size: 11px;
          color: #94a3b8;
        }
        .formatting-toolbar {
          display: flex;
          gap: 4px;
          background: #f1f5f9;
          padding: 4px;
          border: 1px solid #cbd5e1;
          border-bottom: 0;
          border-radius: 7px 7px 0 0;
        }
        .formatting-toolbar button {
          padding: 4px 8px;
          border: 1px solid transparent;
          background: transparent;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          color: #334155;
        }
        .formatting-toolbar button:hover {
          background: #ffffff;
          border-color: #cbd5e1;
        }
        .composer-textarea {
          border-radius: 0 0 7px 7px !important;
        }

        /* Preset Tabs */
        .advance-preset-tabs {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px;
        }
        .preset-tabs-bar {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          margin-top: 8px;
        }
        .preset-tab-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 8px 12px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 7px;
          cursor: pointer;
          white-space: nowrap;
          text-align: left;
        }
        .preset-tab-btn.active {
          background: #eef2ff;
          border-color: #4f46e5;
          color: #4338ca;
        }
        .tab-btn-text strong {
          display: block;
          font-size: 12px;
        }
        .tab-btn-text small {
          font-size: 10px;
          color: #64748b;
        }

        /* Button Studio */
        .button-studio {
          margin-top: 14px;
          padding: 14px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .button-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 10px;
        }
        .button-row-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .btn-index-badge {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          width: 60px;
        }
        .btn-label-input {
          flex: 2;
        }
        .btn-variant-select {
          flex: 2;
        }
        .btn-delete-action, .btn-delete-proc {
          padding: 6px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          border-radius: 6px;
          color: #ef4444;
          cursor: pointer;
        }
        .add-button-btn, .add-proc-btn {
          padding: 7px 12px;
          border: 1.5px dashed #cbd5e1;
          background: transparent;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 600;
          color: #4f46e5;
          cursor: pointer;
        }
        .checkbox-toggle-label {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-weight: normal;
          cursor: pointer;
        }
        .checkbox-toggle-label input {
          margin-top: 3px;
        }
        .checkbox-toggle-label strong {
          font-size: 12.5px;
          color: #0f172a;
        }
        .checkbox-toggle-label p {
          margin: 2px 0 0;
          font-size: 11.5px;
          color: #64748b;
        }

        /* Process Studio */
        .process-studio {
          margin-top: 14px;
          padding: 14px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .studio-top-bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 10px;
        }
        .btn-load-core {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          font-size: 12px;
        }
        .process-builder-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .process-item-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .proc-index-tag {
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          width: 30px;
        }
        .proc-name-input {
          flex: 1;
        }

        /* Step 3 Placement */
        .placement-options-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-top: 8px;
        }
        .placement-card {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          min-height: 104px;
          padding: 12px;
          border: 1.5px solid var(--border-light, #e2e8f0);
          border-radius: 8px;
          background: var(--bg-surface, #fff);
          cursor: pointer;
          text-align: left;
        }
        .placement-card.active {
          border-color: var(--accent-color, #4f46e5);
          background: color-mix(in srgb, var(--accent-color, #4f46e5) 7%, var(--bg-surface, #fff));
        }
        .placement-card strong {
          font-size: 12px;
          line-height: 1.4;
          color: var(--text-primary, #17243c);
        }
        .placement-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding-right: 8px; }
        .placement-copy > span { font-size: 10.5px; line-height: 1.5; color: var(--text-secondary, #64748b); }
        .placement-selection { position: absolute; right: 7px; top: 7px; color: var(--accent-color, #4f46e5); }
        .placement-radio { display: block; width: 13px; height: 13px; border: 1px solid var(--border-light, #cbd5e1); border-radius: 50%; }
        .placement-card:disabled, .placement-pill-btn:disabled { opacity: .5; cursor: not-allowed; }
        .placement-recommendation { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin: 12px 0; color: var(--text-secondary, #64748b); font-size: 11px; }
        .placement-recommendation > span { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 5px; }
        .placement-recommendation button, .animation-default { border: 0; background: transparent; color: var(--accent-color, #4f46e5); cursor: pointer; font-size: 11px; padding: 3px 0; text-align: left; }
        .presentation-settings-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }
        .presentation-settings-grid label { display: flex; flex-direction: column; gap: 7px; min-width: 0; color: var(--text-primary, #17243c); font-size: 12px; font-weight: 600; }
        .presentation-settings-grid select { width: 100%; min-width: 0; padding: 9px 10px; border: 1px solid var(--border-light, #dce3ed); border-radius: 7px; background: var(--bg-surface, #fff); color: var(--text-primary, #17243c); }
        .presentation-settings-grid small { font-size: 10px; font-weight: 400; color: var(--text-secondary, #64748b); }
        .presentation-warning { color: #b45309; font-size: 12px; padding: 10px; border: 1px solid #fde68a; border-radius: 7px; background: #fffbeb; }
        @media(max-width: 1400px) { .placement-options-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media(max-width: 1100px) { .placement-options-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        .placement-card p {
          margin: 4px 0 0;
          font-size: 11.5px;
          color: #64748b;
        }

        /* Step 3 Live Placement Preview */
        .step3-preview-container {
          margin-top: 14px;
          border: 1px dashed #cbd5e1;
          border-radius: 10px;
          background: #f8fafc;
          padding: 12px 14px;
        }
        .step3-preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
          flex-wrap: wrap;
          gap: 8px;
        }
        .device-switcher-pills.mini .device-btn.mini {
          padding: 4px 8px;
          font-size: 11px;
        }
        .step3-preview-viewport {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          min-height: 140px;
          padding: 6px;
          background: #e2e8f0;
          border-radius: 8px;
          overflow-x: auto;
        }
        .theme-options-grid {
          display: flex;
          gap: 10px;
          margin-top: 8px;
        }
        .theme-chip-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 7px 14px;
          border: 1.5px solid #cbd5e1;
          border-radius: 20px;
          background: #ffffff;
          font-size: 12px;
          cursor: pointer;
        }
        .theme-chip-btn.active {
          border-color: #0f172a;
          background: #f1f5f9;
          font-weight: 700;
        }
        .theme-color-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        /* Step 4 Review */
        .device-switcher-pills {
          display: flex;
          gap: 6px;
        }
        .device-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .device-btn.active {
          background: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
        }
        .step4-placement-switcher-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
          background: #ffffff;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          flex-wrap: wrap;
        }
        .placement-switcher-label {
          font-size: 12px;
          font-weight: 700;
          color: #475569;
        }
        .placement-pills-bar {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .placement-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #334155;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .placement-pill-btn:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
        }
        .placement-pill-btn.active {
          background: #2563eb;
          color: #ffffff;
          border-color: #2563eb;
          box-shadow: 0 2px 4px rgba(37, 99, 235, 0.25);
        }
        .step4-preview-box {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .preview-top-badge-row {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }
        .preview-tag {
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 12px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #475569;
        }

        /* Realistic Screen Simulator (Desktop & Mobile) */
        .sim-desktop-window {
          width: 100%;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.12);
          overflow: hidden;
          transition: all 0.2s ease;
        }
        .sim-desktop-window-bar {
          background: #f1f5f9;
          border-bottom: 1px solid #e2e8f0;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sim-window-dots {
          display: flex;
          gap: 6px;
        }
        .window-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .window-dot.red { background: #ef4444; }
        .window-dot.yellow { background: #f59e0b; }
        .window-dot.green { background: #10b981; }
        .sim-desktop-url-pill {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 14px;
          padding: 2px 12px;
          font-size: 11px;
          color: #64748b;
          font-family: monospace;
          flex: 1;
          max-width: 320px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sim-desktop-status-tag {
          font-size: 11px;
          font-weight: 700;
          color: #2563eb;
          background: #eff6ff;
          padding: 3px 9px;
          border-radius: 12px;
          border: 1px solid #bfdbfe;
        }

        .sim-desktop-screen-surface {
          position: relative;
          min-height: 380px;
          background: #f8fafc;
          overflow: hidden;
        }

        /* Mock CRM Desktop Background */
        .sim-crm-mock-desk {
          position: absolute;
          inset: 0;
          display: flex;
          pointer-events: none;
          opacity: 0.85;
        }
        .sim-mock-sidebar {
          width: 70px;
          background: #ffffff;
          border-right: 1px solid #e2e8f0;
          padding: 10px 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sim-mock-logo {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: #2563eb;
          margin-bottom: 6px;
        }
        .sim-mock-nav-item {
          height: 12px;
          border-radius: 4px;
          background: #e2e8f0;
        }
        .sim-mock-nav-item.active {
          background: #bfdbfe;
        }
        .sim-mock-main {
          flex: 1;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sim-mock-topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #ffffff;
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
        }
        .sim-mock-searchbar {
          width: 140px;
          height: 14px;
          background: #f1f5f9;
          border-radius: 4px;
        }
        .sim-mock-userpill {
          width: 60px;
          height: 14px;
          background: #e2e8f0;
          border-radius: 4px;
        }
        .sim-mock-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .sim-mock-kpi-card {
          height: 48px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
        }
        .sim-mock-datatable {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
        }
        .sim-mock-row {
          height: 16px;
          border-radius: 4px;
          background: #f1f5f9;
        }
        .sim-mock-row.th {
          background: #e2e8f0;
          height: 20px;
        }

        /* Modal Frosted Overlay */
        .sim-modal-dark-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(4px);
          z-index: 20;
          animation: simFadeIn 0.2s ease-out;
        }

        /* Notification Dock Layer */
        .sim-card-dock-layer.desktop.dock-top_right {
          position: absolute;
          top: 14px;
          right: 18px;
          width: 390px;
          max-width: 85%;
          z-index: 25;
          filter: drop-shadow(0 14px 28px rgba(15, 23, 42, 0.26));
          animation: simSlideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sim-card-dock-layer.desktop.dock-center_modal {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 450px;
          max-width: 90%;
          z-index: 25;
          filter: drop-shadow(0 25px 50px rgba(0, 0, 0, 0.5));
          animation: simScaleUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sim-card-dock-layer.desktop.dock-top_banner {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          width: 100%;
          z-index: 25;
          animation: simSlideInDown 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sim-card-dock-layer.dock-top_banner :global(.broadcast-card) {
          border-top-left-radius: 0 !important;
          border-top-right-radius: 0 !important;
          border-top: 0 !important;
          box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.25) !important;
          width: 100% !important;
          margin: 0 !important;
        }

        /* Mobile Phone Simulator */
        .sim-mobile-frame {
          width: 360px;
          border: 10px solid #1e293b;
          border-radius: 32px;
          background: #ffffff;
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.25);
          overflow: hidden;
          position: relative;
        }
        .sim-mobile-notch {
          width: 90px;
          height: 14px;
          background: #1e293b;
          border-radius: 0 0 10px 10px;
          margin: 0 auto;
        }
        .sim-mobile-statusbar {
          display: flex;
          justify-content: space-between;
          padding: 4px 14px;
          font-size: 11px;
          font-weight: 700;
          color: #475569;
        }
        .sim-mobile-screen {
          position: relative;
          min-height: 480px;
          background: #f8fafc;
          overflow: hidden;
        }
        .sim-mobile-mock-appbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
        }
        .sim-mobile-app-title {
          font-size: 12px;
          font-weight: 700;
          color: #0f172a;
        }
        .sim-mobile-app-badge {
          font-size: 10px;
          color: #64748b;
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .sim-mobile-mock-content {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          opacity: 0.75;
          pointer-events: none;
        }
        .mock-mobile-kpi-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .mock-mobile-kpi {
          height: 46px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
        }
        .mock-mobile-card-item {
          height: 70px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }

        .sim-card-dock-layer.mobile.dock-top_right {
          position: absolute;
          top: 42px;
          left: 10px;
          right: 10px;
          width: calc(100% - 20px);
          z-index: 25;
          filter: drop-shadow(0 10px 20px rgba(15, 23, 42, 0.25));
        }
        .sim-card-dock-layer.mobile.dock-center_modal {
          position: absolute;
          top: 50%;
          left: 10px;
          right: 10px;
          transform: translateY(-50%);
          width: calc(100% - 20px);
          z-index: 25;
          filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.45));
        }
        .sim-card-dock-layer.mobile.dock-top_banner {
          position: absolute;
          top: 36px;
          left: 0;
          right: 0;
          width: 100%;
          z-index: 25;
        }

        @keyframes simFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes simScaleUp {
          from { opacity: 0; transform: translate(-50%, -46%) scale(0.95); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes simSlideInRight {
          from { opacity: 0; transform: translateX(16px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes simSlideInDown {
          from { opacity: 0; transform: translateY(-16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .summary-cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-top: 16px;
        }
        .summary-card {
          padding: 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 12px;
        }
        .summary-card strong {
          display: block;
          margin-bottom: 6px;
          color: #0f172a;
        }
        .summary-card p {
          margin: 3px 0;
          color: #475569;
        }
        .schedule-box {
          margin-top: 16px;
          padding: 14px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
        }
        .radio-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        .step4-actions-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid #e2e8f0;
        }
        .step4-right-buttons {
          display: flex;
          gap: 8px;
        }
        .btn-draft, .btn-test {
          padding: 10px 16px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        /* History & Reports */
        .history-filter-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 14px 0;
        }
        .history-tabs {
          display: flex;
          gap: 6px;
        }
        .history-tab-btn {
          padding: 6px 12px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
        }
        .history-tab-btn.active {
          background: #4f46e5;
          color: #ffffff;
          border-color: #4f46e5;
        }
        .history-search-input {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #ffffff;
          width: 240px;
        }
        .history-search-input input {
          border: 0;
          padding: 0;
          outline: none;
          font-size: 12px;
          width: 100%;
        }
        .history-row {
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .history-row:hover {
          background: #f1f5f9;
        }
        .history-row.row-selected {
          background: #eef2ff !important;
        }
        .action-icon-btn {
          padding: 5px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          border-radius: 4px;
          color: #475569;
          cursor: pointer;
        }
        .action-icon-btn:hover {
          color: #4f46e5;
          border-color: #4f46e5;
        }
        .action-icon-btn.danger:hover {
          color: #ef4444;
          border-color: #ef4444;
        }

        /* Report Scorecards */
        .report-header-card {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .report-header-card h4 {
          margin: 0;
          font-size: 16px;
          color: #0f172a;
        }
        .history-table-container th { white-space: nowrap; word-break: normal; overflow-wrap: normal; }
        .history-table-container table { min-width: 760px; }
        .report-scorecards-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 8px;
          margin: 14px 0;
        }
        .scorecard {
          padding: 10px;
          background: #ffffff;
          border: 1.5px solid #e2e8f0;
          border-radius: 8px;
          text-align: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .scorecard:hover, .scorecard.active {
          border-color: #4f46e5;
          box-shadow: 0 2px 6px rgba(79, 70, 229, 0.12);
        }
        .sc-count {
          display: block;
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
        }
        .sc-label {
          font-size: 10.5px;
          color: #64748b;
        }
        .employee-report-search-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .emp-search-input {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #ffffff;
          width: 300px;
        }
        .emp-search-input input {
          border: 0;
          padding: 0;
          outline: none;
          font-size: 12px;
          width: 100%;
        }
        .filter-count-label {
          font-size: 12px;
          color: #64748b;
        }

        /* Badges */
        .badge-status {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
        }
        .status-active, .status-read { background: #ecfdf5; color: #059669; }
        .status-delivered { background: #eff6ff; color: #2563eb; }
        .status-pending { background: #fffbeb; color: #d97706; }
        .status-expired, .status-cancelled { background: #f1f5f9; color: #64748b; }
        .status-draft { background: #f5f3ff; color: #7c3aed; }
        .status-scheduled { background: #e0f2fe; color: #0284c7; }

        .badge-action {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
        }
        .action-success { background: #ecfdf5; color: #059669; }
        .action-danger { background: #fef2f2; color: #dc2626; }
        .action-warning { background: #fffbeb; color: #d97706; }

        .badge-query {
          display: inline-block;
          padding: 2px 7px;
          border-radius: 10px;
          font-size: 10.5px;
          font-weight: 600;
        }
        .query-open { background: #fee2e2; color: #dc2626; }
        .query-progress { background: #fef3c7; color: #b45309; }
        .query-resolved { background: #d1fae5; color: #047857; }
        .query-closed { background: #f1f5f9; color: #64748b; }

        .reply-query-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border: 1px solid #c7d2fe;
          background: #eef2ff;
          color: #4338ca;
          border-radius: 5px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }
        .reply-query-btn:hover {
          background: #4338ca;
          color: #ffffff;
        }

        /* Modals */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(4px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .modal-dialog {
          background: #ffffff;
          border-radius: 14px;
          width: min(540px, calc(100vw - 32px));
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #e2e8f0;
        }
        .modal-header h3 {
          margin: 0;
          font-size: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .close-btn {
          background: transparent;
          border: 0;
          cursor: pointer;
          color: #94a3b8;
        }
        .modal-body {
          padding: 20px;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 14px 20px;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .warning-callout {
          background: #fff7ed;
          border: 1px solid #fed7aa;
          padding: 12px 14px;
          border-radius: 8px;
          color: #9a3412;
          font-size: 12.5px;
          margin-bottom: 14px;
        }
        .confirm-summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          font-size: 12.5px;
        }
        .confirm-summary-grid div {
          background: #f8fafc;
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
        }
        .confirm-summary-grid span {
          display: block;
          font-size: 11px;
          color: #64748b;
        }
        .btn-confirm-send {
          background: #ea580c !important;
        }
        .employee-info-box {
          background: #f8fafc;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          margin-bottom: 12px;
        }
        .query-content-box {
          background: #fef2f2;
          border: 1px solid #fecaca;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 12px;
        }
        .query-box-title {
          font-size: 11px;
          font-weight: 700;
          color: #991b1b;
          text-transform: uppercase;
        }
        .query-text {
          margin: 6px 0;
          font-size: 13px;
          color: #7f1d1d;
          font-style: italic;
        }
        .reply-textarea {
          width: 100%;
          margin-top: 6px;
        }

        @media(max-width: 768px) {
          .composer-stepper {
            grid-template-columns: 1fr;
          }
          .stats-compact {
            grid-template-columns: 1fr 1fr;
          }
          .summary-cards-grid {
            grid-template-columns: 1fr;
          }
          .placement-options-grid {
            grid-template-columns: 1fr;
          }
          .presentation-settings-grid { grid-template-columns: 1fr; }
          .placement-card { min-height: 90px; }
          .report-scorecards-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
