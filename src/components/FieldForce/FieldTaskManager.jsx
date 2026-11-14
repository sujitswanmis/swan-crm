'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef, useSyncExternalStore } from 'react';
import {
  Plus,
  Search,
  Calendar,
  User,
  Clock,
  ArrowLeft,
  Send,
  RefreshCw,
  Edit3,
  Eye,
  X,
  Filter,
  Layers,
  Phone,
  MapPin,
  Settings,
  FileSpreadsheet,
  LayoutGrid,
  List,
} from 'lucide-react';
import { createFieldTask, updateFieldTask } from '@/app/actions/fieldTasks';
import { createClient as createBrowserSupabase } from '@/utils/supabase/client';
import {
  buildFieldTaskScopeKey,
  buildFieldTaskMetaScopeKey,
  getFastFieldTasksSnapshot,
  getFastFieldTaskMetaSnapshot,
  getLocalFieldTasksCache,
  saveLocalFieldTasksCache,
  getLocalFieldTaskMetaCache,
  saveLocalFieldTaskMetaCache,
  mergeFieldTasksDelta,
} from '@/utils/fieldTasksLocalCache';
import StandardTablePagination from '@/components/common/StandardTablePagination';
import DateRangePicker from '@/components/common/DateRangePicker';
import ColumnSelectorModal from '@/components/TableControls/ColumnSelectorModal';
import MultiColumnFilterModal from '@/components/TableControls/MultiColumnFilterModal';
import ErrorBoundary from '@/components/ErrorBoundary';

const PRIORITY_META = {
  CRITICAL: { emoji: '🔴', label: 'Critical', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  URGENT: { emoji: '🟠', label: 'Urgent', bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  HIGH: { emoji: '🟡', label: 'High', bg: '#fefce8', color: '#ca8a04', border: '#fef08a' },
  MEDIUM: { emoji: '🔵', label: 'Medium', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  LOW: { emoji: '🟢', label: 'Low', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
};

const STATUS_META = {
  SCHEDULED: { label: '⏳ Scheduled', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  PENDING: { label: '🕒 Pending', bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' },
  IN_PROGRESS: { label: '🚗 In Progress', bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  COMPLETED: { label: '✅ Completed', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  CANCELLED: { label: '❌ Cancelled', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
};

const PURPOSE_OPTIONS = [
  'Lead Data Pipeline',
  'Order Taking',
  'Material Checking',
  'Product Demonstration',
  'Payment Collection',
];

const ALL_COLUMNS_CONFIG = [
  { key: 'task_code', label: 'Task ID', defaultWidth: 125 },
  { key: 'party', label: 'Lead / Party', defaultWidth: 230 },
  { key: 'purpose', label: 'Purpose, Stage & Instructions', defaultWidth: 245 },
  { key: 'priority', label: 'Priority', defaultWidth: 120 },
  { key: 'assigned_to', label: 'Assigned To', defaultWidth: 165 },
  { key: 'assigned_by', label: 'Assigned By', defaultWidth: 160 },
  { key: 'scheduled', label: 'Scheduled (IST)', defaultWidth: 170 },
  { key: 'delay_status', label: 'Delay Status', defaultWidth: 145 },
  { key: 'delay_duration', label: 'Delay Duration', defaultWidth: 130 },
  { key: 'check_in', label: 'Check-In (IST)', defaultWidth: 165 },
  { key: 'check_out', label: 'Check-Out (IST)', defaultWidth: 165 },
  { key: 'check_duration', label: 'Check Duration', defaultWidth: 135 },
  { key: 'status', label: 'Status', defaultWidth: 130 },
  { key: 'actions', label: 'Actions', defaultWidth: 145, alwaysVisible: true },
];

const DEFAULT_COL_WIDTHS = {
  task_code: 125,
  party: 230,
  purpose: 245,
  priority: 120,
  assigned_to: 165,
  assigned_by: 160,
  scheduled: 170,
  delay_status: 145,
  delay_duration: 130,
  check_in: 165,
  check_out: 165,
  check_duration: 135,
  status: 130,
  actions: 145,
};

const COL_WIDTHS_STORAGE_KEY = 'crmFieldTaskManagerColWidths';
const COL_VISIBILITY_STORAGE_KEY = 'crm_ftm_column_visibility_v1';
const COL_ORDER_STORAGE_KEY = 'crm_ftm_column_order_v1';

const SELECTOR_COLUMNS = ALL_COLUMNS_CONFIG
  .filter((c) => !c.alwaysVisible)
  .map((c) => ({ key: c.key, label: c.label }));

const FILTERABLE_COLUMNS = [
  { key: 'task_code', label: 'Task ID' },
  { key: 'party_name', label: 'Lead / Party Name' },
  { key: 'party_phone', label: 'Contact Phone' },
  { key: 'party_address', label: 'Party Address' },
  { key: 'task_type', label: 'Purpose / Type' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'assigned_to_name', label: 'Assigned To' },
  { key: 'assigned_by_name', label: 'Assigned By' },
  { key: 'delay_status', label: 'Delay Status' },
  { key: 'check_in', label: 'Check-In (IST)' },
  { key: 'check_out', label: 'Check-Out (IST)' },
  { key: 'check_duration', label: 'Check Duration' },
  { key: 'instructions', label: 'Instructions / Description' },
];

function formatDelayDurationHuman(ms) {
  if (!ms || ms <= 0) return '—';
  const totalMins = Math.floor(ms / 60000);
  const days = Math.floor(totalMins / (24 * 60));
  const hours = Math.floor((totalMins % (24 * 60)) / 60);
  const mins = totalMins % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);
  return parts.join(' ');
}

function computeTaskCheckDuration(task, now = Date.now()) {
  const startStr = task.actual_start_time;
  const endStr = task.actual_end_time;
  if (!startStr) {
    return {
      text: '—',
      isActive: false,
      durationMs: 0,
    };
  }
  const startMs = new Date(startStr).getTime();
  if (Number.isNaN(startMs)) {
    return {
      text: '—',
      isActive: false,
      durationMs: 0,
    };
  }

  if (endStr) {
    const endMs = new Date(endStr).getTime();
    if (!Number.isNaN(endMs) && endMs >= startMs) {
      const durMs = endMs - startMs;
      return {
        text: formatDelayDurationHuman(durMs),
        isActive: false,
        durationMs: durMs,
      };
    }
  }

  const st = String(task.status || '').toUpperCase();
  if (st === 'IN_PROGRESS' || st === 'IN_TRANSIT') {
    const activeDur = Math.max(0, now - startMs);
    return {
      text: `🟢 ${formatDelayDurationHuman(activeDur)} (In Visit)`,
      isActive: true,
      durationMs: activeDur,
    };
  }

  return {
    text: '—',
    isActive: false,
    durationMs: 0,
  };
}

function computeFieldTaskDelay(task, now = Date.now()) {
  const statusUpper = String(task.status || 'SCHEDULED').toUpperCase();
  const scheduledTimeStr = task.scheduled_end_time || task.scheduled_start_time;

  if (statusUpper === 'CANCELLED') {
    return {
      status: 'CANCELLED',
      label: 'Cancelled',
      isDelayed: false,
      durationMs: 0,
      durationText: '—',
      color: '#64748b',
      bg: '#f1f5f9',
      border: '#cbd5e1',
    };
  }

  if (!scheduledTimeStr) {
    return {
      status: 'SCHEDULED',
      label: 'Scheduled',
      isDelayed: false,
      durationMs: 0,
      durationText: '—',
      color: '#475569',
      bg: '#f1f5f9',
      border: '#cbd5e1',
    };
  }

  const schedTime = new Date(scheduledTimeStr).getTime();
  if (Number.isNaN(schedTime)) {
    return {
      status: 'SCHEDULED',
      label: 'Scheduled',
      isDelayed: false,
      durationMs: 0,
      durationText: '—',
      color: '#475569',
      bg: '#f1f5f9',
      border: '#cbd5e1',
    };
  }

  if (statusUpper === 'COMPLETED') {
    const finishTimeStr = task.actual_end_time || task.actual_start_time || task.updated_at;
    const finishTime = finishTimeStr ? new Date(finishTimeStr).getTime() : schedTime;
    const diffMs = finishTime - schedTime;
    if (diffMs > 5 * 60 * 1000) {
      return {
        status: 'COMPLETED_LATE',
        label: '⚠️ Completed Late',
        isDelayed: true,
        durationMs: diffMs,
        durationText: formatDelayDurationHuman(diffMs),
        color: '#b45309',
        bg: '#fffbeb',
        border: '#fde68a',
      };
    }
    return {
      status: 'COMPLETED_ON_TIME',
      label: '✅ On Time',
      isDelayed: false,
      durationMs: 0,
      durationText: '—',
      color: '#15803d',
      bg: '#f0fdf4',
      border: '#bbf7d0',
    };
  }

  // Active task: SCHEDULED / PENDING / IN_PROGRESS / IN_TRANSIT
  const overdueMs = now - schedTime;
  if (overdueMs > 5 * 60 * 1000) {
    return {
      status: 'OVERDUE',
      label: '🔴 Delayed / Overdue',
      isDelayed: true,
      durationMs: overdueMs,
      durationText: formatDelayDurationHuman(overdueMs),
      color: '#dc2626',
      bg: '#fef2f2',
      border: '#fecaca',
    };
  }

  return {
    status: 'ON_SCHEDULE',
    label: '🟢 On Schedule',
    isDelayed: false,
    durationMs: 0,
    durationText: '—',
    color: '#0369a1',
    bg: '#f0f9ff',
    border: '#bae6fd',
  };
}

function getPriorityMeta(priority) {
  const key = String(priority || 'MEDIUM').toUpperCase();
  return PRIORITY_META[key] || PRIORITY_META.MEDIUM;
}

function getStatusMeta(status) {
  const key = String(status || 'SCHEDULED').toUpperCase();
  return STATUS_META[key] || { label: key, bg: '#f8fafc', color: '#475569', border: '#cbd5e1' };
}

function formatISTDateTime(value) {
  if (!value) return 'Immediate';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })} IST`;
}

function formatIsoToDatetimeLocalIST(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const hh = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hh}:${map.minute}`;
}

function parseDatetimeLocalISTToIso(localStr) {
  if (!localStr) return null;
  const trimmed = String(localStr).trim();
  if (!trimmed) return null;
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const normalized = trimmed.length === 16 ? `${trimmed}:00+05:30` : `${trimmed}+05:30`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function readDefaultPageSize() {
  if (typeof window === 'undefined') return 15;
  try {
    const saved = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}');
    if (saved.defaultPageSize === 'All') return 100000;
    const parsed = parseInt(saved.defaultPageSize, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
  } catch {
    return 15;
  }
}

const emptySubscribe = () => () => {};

export default function FieldTaskManager({
  company = 'TNT00001',
  branchCode = null,
  currentUser = null,
  currentUserId = null,
  tenantId = null,
  branchAccess = null,
  adminCompanyFilter = 'All',
}) {
  const effectiveUserId = currentUser?.id || currentUserId || null;
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const [isCreating, setIsCreating] = useState(false);

  // Task Management View & Filters
  const [viewScope, setViewScope] = useState('assigned_by_me');
  const [idbTasksState, setIdbTasksState] = useState({ scopeKey: '', tasks: null, syncedAt: null });
  const [idbMetaState, setIdbMetaState] = useState({ scopeKey: '', forms: null, teamMembers: null });
  const [syncState, setSyncState] = useState({ scopeKey: '', tasks: null, syncedAt: null, hasFetched: false, error: '', syncing: false });
  const [metaSyncState, setMetaSyncState] = useState({ scopeKey: '', forms: null, teamMembers: null });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [purposeFilter, setPurposeFilter] = useState('ALL');
  const [execFilter, setExecFilter] = useState('ALL');
  const [dateFieldMode, setDateFieldMode] = useState('scheduled'); // 'scheduled' | 'created'
  const [datePreset, setDatePreset] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [leadFilter, setLeadFilter] = useState(null); // { id, name }

  // Pagination synced with Config Master (auto-resets to page 1 when filters change)
  const [pageState, setPageState] = useState({ page: 1, key: '' });
  const [pageSize, setPageSize] = useState(() => readDefaultPageSize());

  // Column Resizing State (persisted)
  const [colWidths, setColWidths] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_COL_WIDTHS;
    try {
      const saved = JSON.parse(localStorage.getItem(COL_WIDTHS_STORAGE_KEY) || '{}');
      return { ...DEFAULT_COL_WIDTHS, ...(saved && typeof saved === 'object' ? saved : {}) };
    } catch {
      return DEFAULT_COL_WIDTHS;
    }
  });
  const [activeResizeCol, setActiveResizeCol] = useState(null);

  // Column Visibility & Order State (persisted)
  const [visibleColumns, setVisibleColumns] = useState(() => {
    if (typeof window === 'undefined') return ALL_COLUMNS_CONFIG.map((c) => c.key);
    try {
      const saved = JSON.parse(localStorage.getItem(COL_VISIBILITY_STORAGE_KEY) || '[]');
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {}
    return ALL_COLUMNS_CONFIG.map((c) => c.key);
  });

  const [columnOrder, setColumnOrder] = useState(() => {
    if (typeof window === 'undefined') return ALL_COLUMNS_CONFIG.map((c) => c.key);
    try {
      const saved = JSON.parse(localStorage.getItem(COL_ORDER_STORAGE_KEY) || '[]');
      if (Array.isArray(saved) && saved.length > 0) {
        const allKeys = ALL_COLUMNS_CONFIG.map((c) => c.key);
        const missing = allKeys.filter((k) => !saved.includes(k));
        return [...saved, ...missing];
      }
    } catch {}
    return ALL_COLUMNS_CONFIG.map((c) => c.key);
  });

  // Modals for Columns Selector & Advanced Multi-Column Filters
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterRules, setFilterRules] = useState({});
  const [filterConditionType, setFilterConditionType] = useState('AND');
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTimestamp(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // View Mode: 'table' | 'tiles'
  const [layoutMode, setLayoutMode] = useState(() => {
    if (typeof window === 'undefined') return 'table';
    try {
      const saved = localStorage.getItem('crm_ftm_layout_mode_v1');
      if (saved === 'tiles' || saved === 'table') return saved;
    } catch {}
    return 'table';
  });

  const handleToggleLayout = (mode) => {
    setLayoutMode(mode);
    try {
      localStorage.setItem('crm_ftm_layout_mode_v1', mode);
    } catch {}
  };

  const [exportingExcel, setExportingExcel] = useState(false);

  // View / Edit Modals
  const [viewingTask, setViewingTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editExecId, setEditExecId] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const [editStage, setEditStage] = useState('');
  const [editPriority, setEditPriority] = useState('MEDIUM');
  const [editStatus, setEditStatus] = useState('SCHEDULED');
  const [editDateLocal, setEditDateLocal] = useState('');
  const [editPartyPhone, setEditPartyPhone] = useState('');
  const [editPartyAddress, setEditPartyAddress] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Create Form Fields
  const [selectedTaskType, setSelectedTaskType] = useState('');
  const [selectedForm, setSelectedForm] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [assignedEmployeeId, setAssignedEmployeeId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [dynamicFormValues, setDynamicFormValues] = useState({});
  const [additionalFields, setAdditionalFields] = useState([]);
  const [submitLoading, setSubmitLoading] = useState(false);

  const branchScopeKey = useMemo(() => {
    if (!branchAccess || typeof branchAccess !== 'object') return 'all';
    return JSON.stringify({
      s: branchAccess.scope || '',
      a: Boolean(branchAccess.isAllBranches),
      c: Array.isArray(branchAccess.allowedCompanies) ? branchAccess.allowedCompanies : [],
      b: Array.isArray(branchAccess.allowedBranchCodes) ? branchAccess.allowedBranchCodes : [],
    });
  }, [branchAccess]);

  const scopeKey = useMemo(
    () => buildFieldTaskScopeKey({
      userId: effectiveUserId,
      tenantId,
      company,
      adminCompanyFilter,
      viewScope,
    }),
    [effectiveUserId, tenantId, company, adminCompanyFilter, viewScope]
  );

  const metaScopeKey = useMemo(
    () => buildFieldTaskMetaScopeKey({
      userId: effectiveUserId,
      tenantId,
      company,
      adminCompanyFilter,
      branchScopeKey,
    }),
    [effectiveUserId, tenantId, company, adminCompanyFilter, branchScopeKey]
  );

  // 1. Instant 0ms LocalDB / Fast Snapshot Hydration (SSR-safe via useSyncExternalStore)
  const fastTasksSnap = useMemo(
    () => (isClient ? getFastFieldTasksSnapshot(scopeKey) : null),
    [isClient, scopeKey]
  );
  const fastMetaSnap = useMemo(
    () => (isClient ? getFastFieldTaskMetaSnapshot(metaScopeKey) : null),
    [isClient, metaScopeKey]
  );

  const tasks = useMemo(() => {
    if (syncState.scopeKey === scopeKey && Array.isArray(syncState.tasks)) return syncState.tasks;
    if (idbTasksState.scopeKey === scopeKey && Array.isArray(idbTasksState.tasks)) return idbTasksState.tasks;
    if (fastTasksSnap && Array.isArray(fastTasksSnap.tasks)) return fastTasksSnap.tasks;
    return [];
  }, [syncState, idbTasksState, fastTasksSnap, scopeKey]);

  const forms = useMemo(() => {
    if (metaSyncState.scopeKey === metaScopeKey && Array.isArray(metaSyncState.forms)) return metaSyncState.forms;
    if (idbMetaState.scopeKey === metaScopeKey && Array.isArray(idbMetaState.forms)) return idbMetaState.forms;
    if (fastMetaSnap && Array.isArray(fastMetaSnap.forms)) return fastMetaSnap.forms;
    return [];
  }, [metaSyncState, idbMetaState, fastMetaSnap, metaScopeKey]);

  const teamMembers = useMemo(() => {
    if (metaSyncState.scopeKey === metaScopeKey && Array.isArray(metaSyncState.teamMembers)) return metaSyncState.teamMembers;
    if (idbMetaState.scopeKey === metaScopeKey && Array.isArray(idbMetaState.teamMembers)) return idbMetaState.teamMembers;
    if (fastMetaSnap && Array.isArray(fastMetaSnap.teamMembers)) return fastMetaSnap.teamMembers;
    return [];
  }, [metaSyncState, idbMetaState, fastMetaSnap, metaScopeKey]);

  const hasCachedTasks =
    (idbTasksState.scopeKey === scopeKey && Array.isArray(idbTasksState.tasks)) ||
    Boolean(fastTasksSnap && Array.isArray(fastTasksSnap.tasks));
  const loading = !(syncState.scopeKey === scopeKey && syncState.hasFetched) && !hasCachedTasks;
  const syncing = syncState.scopeKey === scopeKey && syncState.syncing;
  const loadError = syncState.scopeKey === scopeKey ? syncState.error : '';

  const tasksRef = useRef([]);
  const formsRef = useRef([]);
  const teamMembersRef = useRef([]);
  const syncedAtRef = useRef(null);
  const activeScopeKeyRef = useRef(scopeKey);
  const metaSyncedScopeRef = useRef('');
  const syncSeqRef = useRef(0);

  useEffect(() => {
    activeScopeKeyRef.current = scopeKey;
    tasksRef.current = tasks;
    formsRef.current = forms;
    teamMembersRef.current = teamMembers;
    if (syncState.scopeKey === scopeKey && syncState.syncedAt) {
      syncedAtRef.current = syncState.syncedAt;
    } else if (idbTasksState.scopeKey === scopeKey && idbTasksState.syncedAt) {
      syncedAtRef.current = idbTasksState.syncedAt;
    } else if (fastTasksSnap?.syncedAt) {
      syncedAtRef.current = fastTasksSnap.syncedAt;
    } else {
      syncedAtRef.current = null;
    }
  }, [scopeKey, tasks, forms, teamMembers, syncState, idbTasksState, fastTasksSnap]);

  // 2. Parallel API Sync + Delta Merge + Active-ID Reconciliation (bypasses Server Action FIFO queue)
  const fetchTasks = useCallback(async ({ forceFull = false, includeMeta = true, signal = undefined } = {}) => {
    const reqScopeKey = scopeKey;
    const reqMetaScopeKey = metaScopeKey;
    const seq = ++syncSeqRef.current;

    await Promise.resolve();
    if (signal?.aborted || activeScopeKeyRef.current !== reqScopeKey) return;

    setSyncState((prev) => ({
      scopeKey: reqScopeKey,
      tasks: prev.scopeKey === reqScopeKey ? prev.tasks : null,
      syncedAt: prev.scopeKey === reqScopeKey ? prev.syncedAt : null,
      hasFetched: prev.scopeKey === reqScopeKey ? prev.hasFetched : false,
      error: '',
      syncing: true,
    }));

    try {
      let baseTasks = tasksRef.current;
      let deltaSince = forceFull ? null : syncedAtRef.current;

      if (!forceFull && (!deltaSince || baseTasks.length === 0)) {
        const idbTasks = await getLocalFieldTasksCache(reqScopeKey);
        if (signal?.aborted || activeScopeKeyRef.current !== reqScopeKey) return;
        if (idbTasks && Array.isArray(idbTasks.tasks) && idbTasks.tasks.length > 0) {
          baseTasks = idbTasks.tasks;
          deltaSince = idbTasks.syncedAt || null;
          tasksRef.current = baseTasks;
          syncedAtRef.current = deltaSince;
          setIdbTasksState({ scopeKey: reqScopeKey, tasks: baseTasks, syncedAt: deltaSince });
        }
      }

      if (includeMeta && metaSyncedScopeRef.current !== reqMetaScopeKey) {
        const idbMeta = await getLocalFieldTaskMetaCache(reqMetaScopeKey);
        if (signal?.aborted || activeScopeKeyRef.current !== reqScopeKey) return;
        if (idbMeta) {
          setIdbMetaState({
            scopeKey: reqMetaScopeKey,
            forms: idbMeta.forms,
            teamMembers: idbMeta.teamMembers,
          });
        }
      }

      const shouldIncludeMeta = Boolean(includeMeta && (forceFull || metaSyncedScopeRef.current !== reqMetaScopeKey));
      const useDelta = Boolean(!forceFull && deltaSince && baseTasks.length > 0);

      const response = await fetch('/api/field-force/tasks', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          viewScope,
          currentUserId: effectiveUserId,
          company,
          tenantId,
          branchAccess,
          adminCompanyFilter,
          since: useDelta ? deltaSince : null,
          includeActiveIds: useDelta,
          includeMeta: shouldIncludeMeta,
        }),
      });

      const res = await response.json().catch(() => null);
      if (signal?.aborted || activeScopeKeyRef.current !== reqScopeKey || seq !== syncSeqRef.current) return;

      if (response.ok && res?.success) {
        const nextTasks = res.isDelta
          ? mergeFieldTasksDelta(tasksRef.current, res.tasks || [], res.activeIds ?? null)
          : (Array.isArray(res.tasks) ? res.tasks : []);

        const nextSyncedAt = res.syncedAt || new Date().toISOString();
        tasksRef.current = nextTasks;
        syncedAtRef.current = nextSyncedAt;
        setSyncState({
          scopeKey: reqScopeKey,
          tasks: nextTasks,
          syncedAt: nextSyncedAt,
          hasFetched: true,
          error: '',
          syncing: false,
        });
        void saveLocalFieldTasksCache(reqScopeKey, { tasks: nextTasks, syncedAt: nextSyncedAt });

        if (shouldIncludeMeta) {
          const nextForms = Array.isArray(res.forms) ? res.forms : formsRef.current;
          const nextMembers = Array.isArray(res.teamMembers) ? res.teamMembers : teamMembersRef.current;
          formsRef.current = nextForms;
          teamMembersRef.current = nextMembers;
          metaSyncedScopeRef.current = reqMetaScopeKey;
          setMetaSyncState({
            scopeKey: reqMetaScopeKey,
            forms: nextForms,
            teamMembers: nextMembers,
          });
          void saveLocalFieldTaskMetaCache(reqMetaScopeKey, {
            forms: nextForms,
            teamMembers: nextMembers,
            syncedAt: nextSyncedAt,
          });
        }
      } else {
        setSyncState((prev) => ({
          scopeKey: reqScopeKey,
          tasks: prev.scopeKey === reqScopeKey ? prev.tasks : (tasksRef.current.length > 0 ? tasksRef.current : []),
          syncedAt: prev.scopeKey === reqScopeKey ? prev.syncedAt : syncedAtRef.current,
          hasFetched: true,
          error: res?.error || 'Failed to fetch tasks',
          syncing: false,
        }));
      }
    } catch (err) {
      if (err?.name === 'AbortError' || signal?.aborted || activeScopeKeyRef.current !== reqScopeKey) return;
      console.error('Failed to sync managed field tasks:', err);
      setSyncState((prev) => ({
        scopeKey: reqScopeKey,
        tasks: prev.scopeKey === reqScopeKey ? prev.tasks : (tasksRef.current.length > 0 ? tasksRef.current : null),
        syncedAt: prev.scopeKey === reqScopeKey ? prev.syncedAt : syncedAtRef.current,
        hasFetched: true,
        error: tasksRef.current.length === 0 ? (err?.message || 'Failed to fetch tasks') : '',
        syncing: false,
      }));
    }
  }, [scopeKey, metaScopeKey, viewScope, effectiveUserId, company, tenantId, branchAccess, adminCompanyFilter]);

  // Initial + Scope-change Delta Sync
  useEffect(() => {
    const controller = new AbortController();
    void fetchTasks({ forceFull: false, includeMeta: true, signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [fetchTasks]);

  // Supabase Realtime + 3-minute Periodic Delta Catch-Up (mirrors Lead Data)
  useEffect(() => {
    let debounceTimer = null;
    let channel = null;
    const scheduleDelta = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void fetchTasks({ forceFull: false, includeMeta: false });
      }, 450);
    };

    try {
      const sb = createBrowserSupabase();
      channel = sb
        .channel(`ftm_realtime_${scopeKey}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'field_tasks' }, scheduleDelta)
        .subscribe();
    } catch {
      // Non-fatal if realtime fails
    }

    const periodicTimer = setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      void fetchTasks({ forceFull: false, includeMeta: false });
    }, 3 * 60 * 1000);

    return () => {
      clearTimeout(debounceTimer);
      clearInterval(periodicTimer);
      if (channel) {
        try {
          const sb = createBrowserSupabase();
          void sb.removeChannel(channel);
        } catch {}
      }
    };
  }, [scopeKey, fetchTasks]);

  const startColumnResize = (colKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[colKey] || DEFAULT_COL_WIDTHS[colKey] || 140;
    setActiveResizeCol(colKey);

    const handleMouseMove = (moveEvent) => {
      const nextWidth = Math.max(80, Math.min(520, startWidth + (moveEvent.clientX - startX)));
      setColWidths((prev) => {
        const updated = { ...prev, [colKey]: nextWidth };
        try {
          localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(updated));
        } catch {}
        return updated;
      });
    };

    const handleMouseUp = () => {
      setActiveResizeCol(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const resetColumnWidth = (colKey) => {
    setColWidths((prev) => {
      const updated = { ...prev, [colKey]: DEFAULT_COL_WIDTHS[colKey] };
      try {
        localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const partyTaskCounts = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      const key = t.lead_id || `name:${String(t.party_name || '').trim().toLowerCase()}`;
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [tasks]);

  const availablePurposes = useMemo(() => {
    const set = new Set([...PURPOSE_OPTIONS, ...forms.map((f) => f.title).filter(Boolean)]);
    for (const t of tasks) {
      if (t.task_type) set.add(t.task_type);
    }
    return Array.from(set);
  }, [forms, tasks]);

  const availableExecutives = useMemo(() => {
    const map = new Map();
    for (const m of teamMembers || []) {
      const id = m.user_id || m.id;
      if (id) map.set(id, m.emp_name || m.name || m.email || 'Team Member');
    }
    for (const t of tasks) {
      if (t.assigned_to_user_id && !map.has(t.assigned_to_user_id)) {
        map.set(t.assigned_to_user_id, t.assigned_to_name || 'Field Executive');
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [teamMembers, tasks]);

  const summaryStats = useMemo(() => {
    let scheduled = 0;
    let inProgress = 0;
    let completed = 0;
    let urgentCritical = 0;
    for (const t of tasks) {
      const st = String(t.status || 'SCHEDULED').toUpperCase();
      const pr = String(t.priority || 'MEDIUM').toUpperCase();
      if (st === 'SCHEDULED' || st === 'PENDING') scheduled += 1;
      else if (st === 'IN_PROGRESS') inProgress += 1;
      else if (st === 'COMPLETED') completed += 1;
      if ((pr === 'CRITICAL' || pr === 'URGENT') && st !== 'COMPLETED' && st !== 'CANCELLED') {
        urgentCritical += 1;
      }
    }
    return {
      total: tasks.length,
      scheduled,
      inProgress,
      completed,
      urgentCritical,
    };
  }, [tasks]);

  const activeRuleCount = useMemo(() => {
    return Object.keys(filterRules).filter((k) => filterRules[k]?.value && String(filterRules[k].value).trim() !== '').length;
  }, [filterRules]);

  const getFilterUniqueValues = useCallback((key) => {
    if (!tasks || tasks.length === 0) return [];
    if (key === 'status') {
      return ['SCHEDULED', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    }
    if (key === 'priority') {
      return ['CRITICAL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'];
    }
    if (key === 'task_type') {
      return Array.from(new Set(tasks.map((t) => t.task_type).filter(Boolean))).sort();
    }
    if (key === 'assigned_to_name') {
      return Array.from(new Set(tasks.map((t) => t.assigned_to_name).filter(Boolean))).sort();
    }
    if (key === 'assigned_by_name') {
      return Array.from(new Set(tasks.map((t) => t.assigned_by_name).filter(Boolean))).sort();
    }
    if (key === 'delay_status') {
      return ['On Schedule', 'Delayed / Overdue', 'On Time', 'Completed Late', 'Cancelled'];
    }
    return [];
  }, [tasks]);

  const orderedColumns = useMemo(() => {
    const map = new Map(ALL_COLUMNS_CONFIG.map((c) => [c.key, c]));
    const list = [];
    columnOrder.forEach((key) => {
      if (map.has(key)) {
        list.push(map.get(key));
        map.delete(key);
      }
    });
    map.forEach((c) => list.push(c));
    return list.filter((c) => c.alwaysVisible || visibleColumns.includes(c.key));
  }, [columnOrder, visibleColumns]);

  const filteredTasks = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const istFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
    const ruleKeys = activeRuleCount > 0
      ? Object.keys(filterRules).filter((k) => filterRules[k]?.value && String(filterRules[k].value).trim() !== '')
      : [];

    const matchesRule = (rule, itemVal) => {
      const val = String(itemVal ?? '').trim().toLowerCase();
      const target = String(rule.value ?? '').trim().toLowerCase();
      if (rule.condition === 'equal') return val === target;
      if (rule.condition === 'not_equal') return val !== target;
      if (rule.condition === 'start_with') return val.startsWith(target);
      return val.includes(target);
    };

    const getColValue = (task, key) => {
      if (key === 'task_code') return task.task_code;
      if (key === 'party_name') return task.party_name;
      if (key === 'party_phone') return task.party_phone;
      if (key === 'party_address') return task.party_address;
      if (key === 'task_type') return task.task_type;
      if (key === 'priority') return task.priority;
      if (key === 'status') return task.status;
      if (key === 'assigned_to_name') return task.assigned_to_name;
      if (key === 'assigned_by_name') return task.assigned_by_name;
      if (key === 'delay_status') return computeFieldTaskDelay(task, nowTimestamp).label;
      if (key === 'check_in') return task.actual_start_time ? formatISTDateTime(task.actual_start_time) : '';
      if (key === 'check_out') return task.actual_end_time ? formatISTDateTime(task.actual_end_time) : '';
      if (key === 'check_duration') return computeTaskCheckDuration(task, nowTimestamp).text;
      if (key === 'instructions') {
        return [
          task.form_details?.description,
          task.form_details?.issue_description,
          task.form_details?.task_stage,
          task.form_details?.lead_status,
        ].filter(Boolean).join(' ');
      }
      return task[key];
    };

    return tasks.filter((t) => {
      if (leadFilter) {
        if (leadFilter.id) {
          if (t.lead_id !== leadFilter.id) return false;
        } else if (leadFilter.name) {
          if (String(t.party_name || '').trim().toLowerCase() !== leadFilter.name.toLowerCase()) return false;
        }
      }
      if (statusFilter !== 'ALL' && String(t.status || '').toUpperCase() !== statusFilter) {
        return false;
      }
      if (priorityFilter !== 'ALL' && String(t.priority || 'MEDIUM').toUpperCase() !== priorityFilter) {
        return false;
      }
      if (purposeFilter !== 'ALL' && String(t.task_type || '').toLowerCase() !== purposeFilter.toLowerCase()) {
        return false;
      }
      if (execFilter !== 'ALL' && t.assigned_to_user_id !== execFilter) {
        return false;
      }
      if (dateFrom || dateTo) {
        const refDate = dateFieldMode === 'created'
          ? t.created_at
          : (t.scheduled_start_time || t.created_at);
        if (!refDate) return false;
        const dObj = new Date(refDate);
        if (Number.isNaN(dObj.getTime())) return false;
        const istDay = istFmt.format(dObj);
        if (dateFrom && istDay < dateFrom) return false;
        if (dateTo && istDay > dateTo) return false;
      }
      if (ruleKeys.length > 0) {
        if (filterConditionType === 'OR') {
          const anyMatch = ruleKeys.some((k) => matchesRule(filterRules[k], getColValue(t, k)));
          if (!anyMatch) return false;
        } else {
          const allMatch = ruleKeys.every((k) => matchesRule(filterRules[k], getColValue(t, k)));
          if (!allMatch) return false;
        }
      }
      if (q) {
        const hay = [
          t.task_code,
          t.party_name,
          t.party_phone,
          t.party_address,
          t.task_type,
          t.assigned_to_name,
          t.assigned_by_name,
          t.form_details?.description,
          t.form_details?.issue_description,
          t.form_details?.task_stage,
          t.form_details?.lead_status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, leadFilter, statusFilter, priorityFilter, purposeFilter, execFilter, dateFieldMode, dateFrom, dateTo, activeRuleCount, filterRules, filterConditionType, nowTimestamp, searchTerm]);

  const filterKey = `${viewScope}|${searchTerm}|${statusFilter}|${priorityFilter}|${purposeFilter}|${execFilter}|${dateFieldMode}|${dateFrom}|${dateTo}|${leadFilter?.id || ''}|${leadFilter?.name || ''}|${JSON.stringify(filterRules)}|${filterConditionType}|${pageSize}`;
  const effectivePage = pageState.key === filterKey ? pageState.page : 1;

  const paginatedTasks = useMemo(() => {
    if (pageSize >= 100000) return filteredTasks;
    const start = (effectivePage - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, effectivePage, pageSize]);

  const handleExportExcel = async () => {
    if (filteredTasks.length === 0) {
      alert('No field tasks available to export in this filtered view.');
      return;
    }

    setExportingExcel(true);
    try {
      const ExcelMod = await import('exceljs/dist/exceljs.min.js');
      const ExcelJS = ExcelMod.default || ExcelMod;
      const { saveAs } = await import('file-saver');

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Field Tasks');

      worksheet.columns = [
        { header: 'Task ID', key: 'task_code', width: 16 },
        { header: 'Task Type / Purpose', key: 'task_type', width: 22 },
        { header: 'Customer / Party', key: 'party_name', width: 26 },
        { header: 'Contact Mobile', key: 'party_phone', width: 16 },
        { header: 'Address', key: 'party_address', width: 32 },
        { header: 'Priority', key: 'priority', width: 14 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Assigned To', key: 'assigned_to_name', width: 22 },
        { header: 'Assigned By', key: 'assigned_by_name', width: 22 },
        { header: 'Scheduled Start (IST)', key: 'scheduled_start', width: 24 },
        { header: 'Scheduled End (IST)', key: 'scheduled_end', width: 24 },
        { header: 'Delay Status', key: 'delay_status', width: 20 },
        { header: 'Delay Duration', key: 'delay_duration', width: 18 },
        { header: 'Check-In (IST)', key: 'check_in', width: 24 },
        { header: 'Check-Out (IST)', key: 'check_out', width: 24 },
        { header: 'Check Duration', key: 'check_duration', width: 18 },
        { header: 'Created (IST)', key: 'created_at', width: 24 },
        { header: 'Stage', key: 'stage', width: 20 },
        { header: 'Instructions / Description', key: 'instructions', width: 36 },
      ];

      filteredTasks.forEach((t) => {
        const dInfo = computeFieldTaskDelay(t, nowTimestamp);
        const cDur = computeTaskCheckDuration(t, nowTimestamp);
        const stageVal = t.form_details?.task_stage || t.form_details?.lead_status || t.form_details?.lead_status_at_assign || '';
        const instructions = String(t.form_details?.description || t.form_details?.issue_description || '').trim();

        worksheet.addRow({
          task_code: t.task_code || '—',
          task_type: t.task_type || '—',
          party_name: t.party_name || '—',
          party_phone: t.party_phone || '—',
          party_address: t.party_address || '—',
          priority: String(t.priority || 'MEDIUM').toUpperCase(),
          status: String(t.status || 'SCHEDULED').toUpperCase(),
          assigned_to_name: t.assigned_to_name || '—',
          assigned_by_name: t.assigned_by_name || '—',
          scheduled_start: formatISTDateTime(t.scheduled_start_time),
          scheduled_end: t.scheduled_end_time ? formatISTDateTime(t.scheduled_end_time) : '—',
          delay_status: dInfo.label,
          delay_duration: dInfo.durationText,
          check_in: t.actual_start_time ? formatISTDateTime(t.actual_start_time) : '—',
          check_out: t.actual_end_time ? formatISTDateTime(t.actual_end_time) : '—',
          check_duration: cDur.text,
          created_at: formatISTDateTime(t.created_at),
          stage: stageVal || '—',
          instructions: instructions || '—',
        });
      });

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' },
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 24;

      const buffer = await workbook.xlsx.writeBuffer();
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      saveAs(new Blob([buffer]), `Field_Tasks_${viewScope}_${todayStr}.xlsx`);
    } catch (err) {
      console.error('Failed to export tasks to Excel:', err);
      alert('Failed to export Excel: ' + (err?.message || 'Unknown error'));
    } finally {
      setExportingExcel(false);
    }
  };

  const openEditModal = (task) => {
    setEditingTask(task);
    setEditExecId(task.assigned_to_user_id || '');
    setEditPurpose(task.task_type || 'Lead Data Pipeline');
    setEditStage(task.form_details?.task_stage || task.form_details?.lead_status || '');
    setEditPriority(String(task.priority || 'MEDIUM').toUpperCase());
    setEditStatus(String(task.status || 'SCHEDULED').toUpperCase());
    setEditDateLocal(formatIsoToDatetimeLocalIST(task.scheduled_start_time));
    setEditPartyPhone(task.party_phone || '');
    setEditPartyAddress(task.party_address || '');
    setEditDesc(task.form_details?.description || task.form_details?.issue_description || '');
    setEditError('');
  };

  const handleSaveTaskEdit = async (e) => {
    e.preventDefault();
    if (!editingTask) return;
    if (!editExecId) {
      setEditError('Please select a Field Executive.');
      return;
    }
    const cleanDesc = editDesc.trim();
    if (!cleanDesc) {
      setEditError('Please enter Task Description / Instructions.');
      return;
    }

    setEditSaving(true);
    setEditError('');
    try {
      const scheduledIso = parseDatetimeLocalISTToIso(editDateLocal);
      const res = await updateFieldTask({
        taskId: editingTask.id,
        actorUserId: effectiveUserId,
        updates: {
          assigned_to_user_id: editExecId,
          task_type: editPurpose.trim() || editingTask.task_type,
          priority: editPriority,
          status: editStatus,
          ...(scheduledIso ? { scheduled_start_time: scheduledIso } : {}),
          party_phone: editPartyPhone.trim(),
          party_address: editPartyAddress.trim(),
          form_details: {
            description: cleanDesc,
            ...(editStage.trim() ? { task_stage: editStage.trim() } : {}),
          },
        },
      });
      if (res?.success) {
        setEditingTask(null);
        if (res.task) {
          const updatedList = mergeFieldTasksDelta(tasksRef.current, [res.task], null);
          tasksRef.current = updatedList;
          setSyncState((prev) => ({
            scopeKey,
            tasks: updatedList,
            syncedAt: syncedAtRef.current || prev.syncedAt,
            hasFetched: true,
            error: '',
            syncing: prev.syncing,
          }));
          void saveLocalFieldTasksCache(scopeKey, { tasks: updatedList, syncedAt: syncedAtRef.current });
        }
        await fetchTasks({ forceFull: false, includeMeta: false });
      } else {
        setEditError(res?.error || 'Failed to update task.');
      }
    } catch (err) {
      setEditError(err?.message || 'Error updating task.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleTaskTypeChange = (formId) => {
    setSelectedTaskType(formId);
    const found = forms.find((f) => f.id === formId);
    setSelectedForm(found || null);
    setDynamicFormValues({});
  };

  const handleAddAdditionalField = () => {
    setAdditionalFields([...additionalFields, { name: '', value: '' }]);
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!customerName.trim() || !assignedEmployeeId) {
      alert('Please fill Party Name and Assign to Employee');
      return;
    }

    setSubmitLoading(true);
    try {
      const taskTypeLabel =
        selectedForm?.title ||
        (selectedTaskType === 'lead_pipeline'
          ? 'Lead Data Pipeline'
          : selectedTaskType === 'order_pipeline'
            ? 'Order to Delivery Pipeline'
            : selectedTaskType === 'complaint_pipeline'
              ? 'Complaint & Service Pipeline'
              : 'Lead Data Pipeline');

      const res = await createFieldTask({
        company,
        branch_code: branchCode,
        tenant_id: tenantId || null,
        form_id: selectedForm?.id || null,
        task_type: taskTypeLabel,
        party_name: customerName,
        party_phone: customerPhone,
        party_address: customerAddress,
        assigned_by_user_id: effectiveUserId,
        assigned_to_user_id: assignedEmployeeId,
        priority,
        scheduled_start_time: parseDatetimeLocalISTToIso(startTime) || new Date().toISOString(),
        scheduled_end_time: parseDatetimeLocalISTToIso(endTime),
        form_details: {
          description,
          ...dynamicFormValues,
        },
        additional_fields: additionalFields.filter((f) => f.name.trim()),
      });

      if (res.success) {
        const codeSuffix = res.task?.task_code ? ` (Task ID: ${res.task.task_code})` : '';
        alert(`Field Task Created and Assigned Successfully!${codeSuffix}`);
        setIsCreating(false);
        setCustomerName('');
        setCustomerAddress('');
        setCustomerPhone('');
        setDescription('');
        setPriority('MEDIUM');
        setStartTime('');
        setEndTime('');
        setSelectedTaskType('');
        setSelectedForm(null);
        setDynamicFormValues({});
        setAdditionalFields([]);
        await fetchTasks({ forceFull: false, includeMeta: false });
      } else {
        alert(res.error || 'Failed to create task');
      }
    } catch (err) {
      alert(err.message || 'Error creating task');
    } finally {
      setSubmitLoading(false);
    }
  };

  const renderResizableHeader = (colKey, label) => (
    <th
      key={colKey}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backgroundColor: '#f8fafc',
        color: '#334155',
        fontSize: '0.73rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        padding: '0.7rem 0.75rem',
        textAlign: 'left',
        width: colWidths[colKey] || DEFAULT_COL_WIDTHS[colKey],
        minWidth: colWidths[colKey] || DEFAULT_COL_WIDTHS[colKey],
        boxShadow: 'inset 0 -1px 0 #e2e8f0',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 6 }}>
        <span>{label}</span>
      </div>
      <div
        onMouseDown={(e) => startColumnResize(colKey, e)}
        onDoubleClick={() => resetColumnWidth(colKey)}
        title="Drag to resize • Double-click to reset"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: 'col-resize',
          userSelect: 'none',
          touchAction: 'none',
          backgroundColor: activeResizeCol === colKey ? '#2563eb' : 'transparent',
          borderRight: activeResizeCol === colKey ? '2px solid #2563eb' : '1px solid #e2e8f0',
        }}
      />
    </th>
  );

  return (
    <div style={{ padding: '1.25rem', background: 'var(--bg-canvas, #f8fafc)', color: 'var(--text-primary, #0f172a)', minHeight: 'calc(100vh - 120px)' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0f172a' }}>
            <Calendar size={22} style={{ color: 'var(--accent-color, #2563eb)' }} />
            Field Task Manager &amp; Visit Tracking
          </h2>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.83rem', color: '#64748b' }}>
            Track every assigned visit task, inspect multiple tasks per lead/party, and edit/reassign active tasks.
          </p>
        </div>
        {!isCreating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* View Mode Toggle: Table | Tiles */}
            <div
              style={{
                display: 'inline-flex',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                padding: 2,
                gap: 2,
              }}
              title="Switch layout between Table view and Tiles view"
            >
              {[
                { id: 'table', label: 'Table', Icon: List },
                { id: 'tiles', label: 'Tiles', Icon: LayoutGrid },
              ].map(({ id, label, Icon }) => {
                const active = layoutMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleToggleLayout(id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '0.38rem 0.65rem',
                      borderRadius: 4,
                      border: 'none',
                      background: active ? '#ffffff' : 'transparent',
                      color: active ? '#0f172a' : '#64748b',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      transition: 'all 0.12s ease',
                    }}
                  >
                    <Icon size={13} color={active ? '#2563eb' : '#64748b'} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Export Excel Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exportingExcel || filteredTasks.length === 0}
              style={{
                padding: '0.48rem 0.85rem',
                background: '#ffffff',
                color: '#15803d',
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
                cursor: exportingExcel || filteredTasks.length === 0 ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                opacity: filteredTasks.length === 0 ? 0.6 : 1,
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
              title={`Export ${filteredTasks.length} filtered field tasks to Excel (.xlsx)`}
            >
              <FileSpreadsheet size={14} color="#15803d" />
              <span>{exportingExcel ? 'Exporting...' : 'Export Excel'}</span>
            </button>

            <button
              type="button"
              onClick={() => fetchTasks({ forceFull: true, includeMeta: true })}
              disabled={loading || syncing}
              style={{
                padding: '0.48rem 0.85rem',
                background: '#ffffff',
                color: '#334155',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <RefreshCw size={14} style={(loading || syncing) ? { animation: 'spin 1s linear infinite' } : undefined} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--accent-color, #2563eb)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                boxShadow: '0 1px 3px rgba(37,99,235,0.2)',
              }}
            >
              <Plus size={16} /> Create Task
            </button>
          </div>
        )}
      </div>

      {/* CREATE TASK VIEW */}
      {isCreating ? (
        <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155', padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
            >
              <ArrowLeft size={16} />
            </button>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Tasks - Create Task</h3>
          </div>

          <form onSubmit={handleCreateTask}>
            {/* Row 1: Task Type & Customer */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Task Type*</label>
                <select
                  value={selectedTaskType}
                  onChange={(e) => handleTaskTypeChange(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                  required
                >
                  <option value="">-- Select Task Type --</option>
                  <option value="lead_pipeline">Lead Data Pipeline</option>
                  <option value="order_pipeline">Order to Delivery Pipeline</option>
                  <option value="complaint_pipeline">Complaint &amp; Service Pipeline</option>
                  {forms.map((f) => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Customer / Party Name*</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Sharma Traders, Noida"
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                  required
                />
              </div>
            </div>

            {/* Row 2: Customer Address & Phone */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Party Address</label>
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="Street, City, PIN Code"
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Contact Mobile</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                />
              </div>
            </div>

            {/* Row 3: Priority & Assign to Employee */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Priority*</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                >
                  <option value="CRITICAL">🔴 Critical</option>
                  <option value="URGENT">🟠 Urgent</option>
                  <option value="HIGH">🟡 High</option>
                  <option value="MEDIUM">🔵 Medium</option>
                  <option value="LOW">🟢 Low</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Assign to Employee*</label>
                <select
                  value={assignedEmployeeId}
                  onChange={(e) => setAssignedEmployeeId(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                  required
                >
                  <option value="">-- Select Field Person --</option>
                  {teamMembers.map((m) => {
                    const memberId = m.user_id || m.id;
                    return (
                      <option key={memberId} value={memberId}>
                        {m.emp_name || m.name || m.email} ({m.role || 'Field Staff'})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Row 4: Start Time & End Time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Start Time (IST)*</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>End Time (IST)</label>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                />
              </div>
            </div>

            {/* DYNAMIC CUSTOM FORM FIELDS */}
            {selectedForm && selectedForm.fields && selectedForm.fields.length > 0 && (
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.75rem', color: '#1d4ed8' }}>
                  | Custom Fields for {selectedForm.title}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {selectedForm.fields.filter((f) => f.stage === 'creator' || !f.stage).map((field) => (
                    <div key={field.id}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>
                        {field.label} {field.required && '*'}
                      </label>
                      {field.type === 'list' ? (
                        <select
                          value={dynamicFormValues[field.id] || ''}
                          onChange={(e) => setDynamicFormValues({ ...dynamicFormValues, [field.id]: e.target.value })}
                          style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                          required={field.required}
                        >
                          <option value="">-- Select --</option>
                          {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          placeholder={field.placeholder || `Please enter ${field.label}`}
                          value={dynamicFormValues[field.id] || ''}
                          onChange={(e) => setDynamicFormValues({ ...dynamicFormValues, [field.id]: e.target.value })}
                          style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem' }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.35rem' }}>Description / Special Instructions</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Please enter task description for field executive..."
                style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.875rem', outline: 'none' }}
              />
            </div>

            {/* Additional Fields */}
            <div style={{ marginBottom: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, color: '#475569' }}>| Additional Fields</h4>
                <button
                  type="button"
                  onClick={handleAddAdditionalField}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
                >
                  Add More Fields
                </button>
              </div>
              {additionalFields.map((field, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="Field Name"
                    value={field.name}
                    onChange={(e) => {
                      const updated = [...additionalFields];
                      updated[idx].name = e.target.value;
                      setAdditionalFields(updated);
                    }}
                    style={{ padding: '0.45rem 0.65rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.825rem' }}
                  />
                  <input
                    type="text"
                    placeholder="Field Value"
                    value={field.value}
                    onChange={(e) => {
                      const updated = [...additionalFields];
                      updated[idx].value = e.target.value;
                      setAdditionalFields(updated);
                    }}
                    style={{ padding: '0.45rem 0.65rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '6px', fontSize: '0.825rem' }}
                  />
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                style={{ padding: '0.5rem 1rem', background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitLoading}
                style={{ padding: '0.5rem 1.5rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, boxShadow: '0 1px 3px rgba(37,99,235,0.2)' }}
              >
                {submitLoading ? 'Creating Task...' : 'Create & Assign Task'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* TASK MANAGEMENT CONSOLE */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {/* Summary KPI Strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            {[
              { key: 'total', label: 'Total Tasks', value: summaryStats.total, color: '#0f172a', bg: '#ffffff', border: '#e2e8f0', onClick: () => { setStatusFilter('ALL'); setPriorityFilter('ALL'); } },
              { key: 'scheduled', label: 'Scheduled / Pending', value: summaryStats.scheduled, color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', onClick: () => { setStatusFilter('SCHEDULED'); setPriorityFilter('ALL'); } },
              { key: 'in_progress', label: 'In Progress', value: summaryStats.inProgress, color: '#b45309', bg: '#fffbeb', border: '#fde68a', onClick: () => { setStatusFilter('IN_PROGRESS'); setPriorityFilter('ALL'); } },
              { key: 'completed', label: 'Completed', value: summaryStats.completed, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', onClick: () => { setStatusFilter('COMPLETED'); setPriorityFilter('ALL'); } },
              { key: 'critical', label: '🔴 Critical / 🟠 Urgent', value: summaryStats.urgentCritical, color: '#dc2626', bg: '#fef2f2', border: '#fecaca', onClick: () => { setPriorityFilter('CRITICAL'); setStatusFilter('ALL'); } },
            ].map((kpi) => (
              <button
                key={kpi.key}
                type="button"
                onClick={kpi.onClick}
                style={{
                  background: kpi.bg,
                  border: `1px solid ${kpi.border}`,
                  borderRadius: '8px',
                  padding: '0.75rem 0.9rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem',
                }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{kpi.label}</span>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</span>
              </button>
            ))}
          </div>

          {/* Scope Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ display: 'inline-flex', background: '#ffffff', padding: 4, borderRadius: 8, border: '1px solid #e2e8f0', gap: 4 }}>
              {[
                { id: 'assigned_by_me', label: '👤 My Assigned Tasks (Created By Me)' },
                { id: 'all_team', label: '🏢 All Team Tasks' },
                { id: 'assigned_to_me', label: '🏃 Assigned To Me' },
              ].map((tab) => {
                const active = viewScope === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      if (tab.id !== viewScope) setLoading(true);
                      setViewScope(tab.id);
                      setLeadFilter(null);
                    }}
                    style={{
                      padding: '0.45rem 0.85rem',
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      background: active ? '#2563eb' : 'transparent',
                      color: active ? '#ffffff' : '#475569',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {leadFilter && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1d4ed8',
                padding: '0.35rem 0.75rem',
                borderRadius: 9999,
                fontSize: '0.78rem',
                fontWeight: 700,
              }}>
                <span>Showing all tasks for: {leadFilter.name || 'Selected Lead'}</span>
                <button
                  type="button"
                  onClick={() => setLeadFilter(null)}
                  style={{ background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }}
                  title="Show all leads"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Filter Bar */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '0.75rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.6rem',
            alignItems: 'center',
          }}>
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search Task ID, Party/Lead, Phone, Instructions, Executive..."
                style={{ width: '100%', padding: '0.45rem 0.65rem 0.45rem 1.95rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem', boxSizing: 'border-box' }}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '0.45rem 0.6rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem', background: '#ffffff' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              style={{ padding: '0.45rem 0.6rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem', background: '#ffffff' }}
            >
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">🔴 Critical</option>
              <option value="URGENT">🟠 Urgent</option>
              <option value="HIGH">🟡 High</option>
              <option value="MEDIUM">🔵 Medium</option>
              <option value="LOW">🟢 Low</option>
            </select>

            <select
              value={purposeFilter}
              onChange={(e) => setPurposeFilter(e.target.value)}
              style={{ padding: '0.45rem 0.6rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem', background: '#ffffff', maxWidth: 185 }}
            >
              <option value="ALL">All Task Types</option>
              {availablePurposes.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              value={execFilter}
              onChange={(e) => setExecFilter(e.target.value)}
              style={{ padding: '0.45rem 0.6rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem', background: '#ffffff', maxWidth: 185 }}
            >
              <option value="ALL">All Field Executives</option>
              {availableExecutives.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'inline-flex',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: 2,
                }}
                title="Choose whether the date filter checks Scheduled Date or Task Created Timestamp"
              >
                {[
                  { id: 'scheduled', label: 'Scheduled' },
                  { id: 'created', label: 'Created' },
                ].map((opt) => {
                  const active = dateFieldMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDateFieldMode(opt.id)}
                      style={{
                        padding: '0.32rem 0.55rem',
                        borderRadius: 4,
                        border: 'none',
                        background: active ? '#2563eb' : 'transparent',
                        color: active ? '#ffffff' : '#475569',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <DateRangePicker
                preset={datePreset}
                startDate={dateFrom}
                endDate={dateTo}
                allowAllTime={true}
                onChange={({ preset, startDate, endDate }) => {
                  setDatePreset(preset || 'all');
                  setDateFrom(startDate || '');
                  setDateTo(endDate || '');
                }}
                title={dateFieldMode === 'created' ? 'Filter by Task Created Timestamp (IST)' : 'Filter by Scheduled Date (IST)'}
                style={{
                  padding: '0.42rem 0.7rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              />
            </div>

            {/* Advanced Multi-Column Filter Button */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => {
                  setShowFilterModal((prev) => !prev);
                  setShowColumnModal(false);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '0.45rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: showFilterModal ? '#0284c7' : activeRuleCount > 0 ? '#eff6ff' : '#ffffff',
                  color: showFilterModal ? '#ffffff' : activeRuleCount > 0 ? '#1d4ed8' : '#334155',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
                title="Advanced Multi-Column Filters"
              >
                <Filter size={13} color={showFilterModal ? '#ffffff' : activeRuleCount > 0 ? '#1d4ed8' : '#64748b'} />
                <span>Filters</span>
                {activeRuleCount > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 16,
                      height: 16,
                      padding: '0 4px',
                      borderRadius: 9999,
                      background: showFilterModal ? '#ffffff' : '#2563eb',
                      color: showFilterModal ? '#0284c7' : '#ffffff',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                    }}
                  >
                    {activeRuleCount}
                  </span>
                )}
              </button>

              <ErrorBoundary fallback={null}>
                <MultiColumnFilterModal
                  isOpen={showFilterModal}
                  onClose={() => setShowFilterModal(false)}
                  columns={FILTERABLE_COLUMNS}
                  filterRules={filterRules}
                  conditionType={filterConditionType}
                  getUniqueValues={getFilterUniqueValues}
                  onApply={(newRules, newCond) => {
                    setFilterRules(newRules);
                    setFilterConditionType(newCond);
                  }}
                  onResetAll={() => {
                    setFilterRules({});
                    setFilterConditionType('AND');
                  }}
                />
              </ErrorBoundary>
            </div>

            {/* Columns Show/Hide & Reorder Selector */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => {
                  setShowColumnModal((prev) => !prev);
                  setShowFilterModal(false);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '0.45rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: showColumnModal ? '#0284c7' : '#ffffff',
                  color: showColumnModal ? '#ffffff' : '#334155',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
                title="Choose visible columns & reorder"
              >
                <Settings size={13} color={showColumnModal ? '#ffffff' : '#64748b'} />
                <span>Columns</span>
              </button>

              <ErrorBoundary fallback={null}>
                <ColumnSelectorModal
                  isOpen={showColumnModal}
                  onClose={() => setShowColumnModal(false)}
                  columns={SELECTOR_COLUMNS}
                  visibleColumns={visibleColumns.filter((k) => k !== 'actions')}
                  onApply={(newVisKeys, newOrderedCols) => {
                    const nextVis = [...newVisKeys, 'actions'];
                    const nextOrder = [
                      ...newOrderedCols.map((c) => c.key),
                      'actions',
                    ];
                    setVisibleColumns(nextVis);
                    setColumnOrder(nextOrder);
                    try {
                      localStorage.setItem(COL_VISIBILITY_STORAGE_KEY, JSON.stringify(nextVis));
                      localStorage.setItem(COL_ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
                    } catch {}
                  }}
                  onReset={() => {
                    const defaultKeys = ALL_COLUMNS_CONFIG.map((c) => c.key);
                    setVisibleColumns(defaultKeys);
                    setColumnOrder(defaultKeys);
                    try {
                      localStorage.removeItem(COL_VISIBILITY_STORAGE_KEY);
                      localStorage.removeItem(COL_ORDER_STORAGE_KEY);
                    } catch {}
                  }}
                />
              </ErrorBoundary>
            </div>

            {(searchTerm || statusFilter !== 'ALL' || priorityFilter !== 'ALL' || purposeFilter !== 'ALL' || execFilter !== 'ALL' || datePreset !== 'all' || dateFrom || dateTo || leadFilter || activeRuleCount > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('ALL');
                  setPriorityFilter('ALL');
                  setPurposeFilter('ALL');
                  setExecFilter('ALL');
                  setDateFieldMode('scheduled');
                  setDatePreset('all');
                  setDateFrom('');
                  setDateTo('');
                  setLeadFilter(null);
                  setFilterRules({});
                  setFilterConditionType('AND');
                }}
                style={{
                  padding: '0.42rem 0.7rem',
                  borderRadius: 6,
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                  color: '#dc2626',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reset
              </button>
            )}
          </div>

          {loadError && (
            <div style={{ padding: '0.75rem 1rem', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.84rem', fontWeight: 600 }}>
              ⚠️ {loadError}
            </div>
          )}

          {/* Tasks Display Card (Table or Tiles) */}
          <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
            {layoutMode === 'tiles' ? (
              <div style={{ padding: '1rem', overflow: 'auto', maxHeight: 'calc(100vh - 380px)', minHeight: '320px' }}>
                {loading ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                    Loading assigned field tasks...
                  </div>
                ) : paginatedTasks.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>No field tasks found in this view.</div>
                    <div style={{ fontSize: '0.78rem' }}>Try switching tabs/filters or click &quot;+ Create Task&quot; to assign a new field visit.</div>
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '1rem',
                  }}>
                    {paginatedTasks.map((t) => {
                      const pMeta = getPriorityMeta(t.priority);
                      const sMeta = getStatusMeta(t.status);
                      const delayInfo = computeFieldTaskDelay(t, nowTimestamp);
                      const checkDur = computeTaskCheckDuration(t, nowTimestamp);
                      const isSelfCheckIn = String(t.task_code || '').toUpperCase().startsWith('CHK-');
                      const stageVal = t.form_details?.task_stage || t.form_details?.lead_status || t.form_details?.lead_status_at_assign || '';
                      const stageLabel = t.form_details?.task_stage_label || (t.form_details?.lead_status ? 'Lead Status' : 'Stage');
                      const instructions = String(t.form_details?.description || t.form_details?.issue_description || '').trim();

                      return (
                        <div
                          key={t.id}
                          style={{
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            padding: '0.9rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.65rem',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {/* Tile Header: Code, Priority, Status */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                fontFamily: 'monospace',
                                fontWeight: 800,
                                fontSize: '0.75rem',
                                padding: '2px 7px',
                                borderRadius: 5,
                                background: isSelfCheckIn ? '#ecfdf5' : '#eff6ff',
                                color: isSelfCheckIn ? '#047857' : '#1d4ed8',
                                border: `1px solid ${isSelfCheckIn ? '#a7f3d0' : '#bfdbfe'}`,
                              }}>
                                {t.task_code || 'TASK'}
                              </span>
                              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: isSelfCheckIn ? '#047857' : '#64748b' }}>
                                {isSelfCheckIn ? '🏃 Self Check-In' : '📋 Assigned Task'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: 9999,
                                background: pMeta.bg,
                                color: pMeta.color,
                                border: `1px solid ${pMeta.border}`,
                              }}>
                                {pMeta.emoji} {pMeta.label}
                              </span>
                              <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: 9999,
                                background: sMeta.bg,
                                color: sMeta.color,
                                border: `1px solid ${sMeta.border}`,
                              }}>
                                {sMeta.label}
                              </span>
                            </div>
                          </div>

                          {/* Party / Customer */}
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>{t.party_name || 'Lead Party'}</div>
                            {t.party_phone && (
                              <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Phone size={11} color="#2563eb" />
                                <span>{t.party_phone}</span>
                              </div>
                            )}
                            {t.party_address && (
                              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                <MapPin size={11} color="#64748b" style={{ flexShrink: 0, marginTop: 2 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                                  {t.party_address}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Purpose & Stage */}
                          <div style={{ background: '#f8fafc', padding: '0.5rem 0.65rem', borderRadius: 6, border: '1px solid #f1f5f9', fontSize: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, color: '#1e293b' }}>
                              <Layers size={12} color="#2563eb" />
                              <span>{t.task_type || 'Field Visit'}</span>
                            </div>
                            {stageVal && (
                              <div style={{ marginTop: 3, color: '#0369a1', fontWeight: 600, fontSize: '0.7rem' }}>
                                {stageLabel}: {stageVal}
                              </div>
                            )}
                            {instructions && (
                              <div style={{ marginTop: 4, color: '#475569', fontSize: '0.72rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {instructions}
                              </div>
                            )}
                          </div>

                          {/* Execution & Assignment Grid */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.72rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.45rem' }}>
                            <div>
                              <span style={{ color: '#64748b', display: 'block', fontSize: '0.66rem' }}>ASSIGNED TO</span>
                              <strong style={{ color: '#0f172a' }}>{t.assigned_to_name}</strong>
                            </div>
                            <div>
                              <span style={{ color: '#64748b', display: 'block', fontSize: '0.66rem' }}>SCHEDULED (IST)</span>
                              <strong style={{ color: '#0f172a' }}>{formatISTDateTime(t.scheduled_start_time)}</strong>
                            </div>
                          </div>

                          {/* Delay & Check Duration Badges */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.72rem', background: '#fafaf9', padding: '0.45rem', borderRadius: 6 }}>
                            <div>
                              <span style={{ color: '#64748b', display: 'block', fontSize: '0.65rem' }}>DELAY STATUS</span>
                              <span style={{
                                display: 'inline-block',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: 4,
                                marginTop: 2,
                                background: delayInfo.bg,
                                color: delayInfo.color,
                                border: `1px solid ${delayInfo.border}`,
                              }}>
                                {delayInfo.label}
                              </span>
                              {delayInfo.durationText !== '—' && (
                                <span style={{ marginLeft: 3, fontWeight: 700, color: delayInfo.color }}>
                                  ({delayInfo.durationText})
                                </span>
                              )}
                            </div>
                            <div>
                              <span style={{ color: '#64748b', display: 'block', fontSize: '0.65rem' }}>CHECK DURATION</span>
                              <span style={{ fontWeight: 700, color: checkDur.isActive ? '#047857' : (checkDur.text !== '—' ? '#0f172a' : '#94a3b8') }}>
                                {checkDur.text}
                              </span>
                            </div>
                          </div>

                          {/* Check-In / Check-Out Timestamps */}
                          {(t.actual_start_time || t.actual_end_time) && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.7rem', color: '#64748b' }}>
                              <div>
                                <span>In: </span>
                                <strong style={{ color: '#059669' }}>{t.actual_start_time ? formatISTDateTime(t.actual_start_time) : '—'}</strong>
                              </div>
                              <div>
                                <span>Out: </span>
                                <strong style={{ color: '#7c3aed' }}>{t.actual_end_time ? formatISTDateTime(t.actual_end_time) : '—'}</strong>
                              </div>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem', marginTop: 'auto' }}>
                            <button
                              type="button"
                              onClick={() => setViewingTask(t)}
                              style={{
                                padding: '0.35rem 0.65rem',
                                borderRadius: 5,
                                border: '1px solid #cbd5e1',
                                background: '#ffffff',
                                color: '#334155',
                                fontSize: '0.74rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Eye size={12} /> View
                            </button>
                            {t.can_edit && (
                              <button
                                type="button"
                                onClick={() => openEditModal(t)}
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  borderRadius: 5,
                                  border: '1px solid #93c5fd',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <Edit3 size={12} /> Edit
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 380px)', minHeight: '320px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      {orderedColumns.map((col) => renderResizableHeader(col.key, col.label))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={orderedColumns.length} style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
                          Loading assigned field tasks...
                        </td>
                      </tr>
                    ) : paginatedTasks.length === 0 ? (
                      <tr>
                        <td colSpan={orderedColumns.length} style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>No field tasks found in this view.</div>
                          <div style={{ fontSize: '0.78rem' }}>Try switching tabs/filters or click &quot;+ Create Task&quot; to assign a new field visit.</div>
                        </td>
                      </tr>
                    ) : (
                      paginatedTasks.map((t) => {
                        const pMeta = getPriorityMeta(t.priority);
                        const sMeta = getStatusMeta(t.status);
                        const delayInfo = computeFieldTaskDelay(t, nowTimestamp);
                        const partyKey = t.lead_id || `name:${String(t.party_name || '').trim().toLowerCase()}`;
                        const samePartyCount = partyTaskCounts.get(partyKey) || 1;
                        const stageVal = t.form_details?.task_stage || t.form_details?.lead_status || t.form_details?.lead_status_at_assign || '';
                        const stageLabel = t.form_details?.task_stage_label || (t.form_details?.lead_status ? 'Lead Status' : 'Stage');
                        const instructions = String(t.form_details?.description || t.form_details?.issue_description || '').trim();

                        const renderCell = (colKey) => {
                          switch (colKey) {
                            case 'task_code': {
                              const isSelfCheckIn = String(t.task_code || '').toUpperCase().startsWith('CHK-');
                              return (
                                <td key={colKey} style={{ padding: '0.65rem 0.75rem', overflow: 'hidden' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    fontFamily: 'monospace',
                                    fontWeight: 800,
                                    fontSize: '0.75rem',
                                    padding: '2px 7px',
                                    borderRadius: 5,
                                    background: isSelfCheckIn ? '#ecfdf5' : '#eff6ff',
                                    color: isSelfCheckIn ? '#047857' : '#1d4ed8',
                                    border: `1px solid ${isSelfCheckIn ? '#a7f3d0' : '#bfdbfe'}`,
                                  }}>
                                    {t.task_code || 'TASK'}
                                  </span>
                                  <div style={{ fontSize: '0.66rem', fontWeight: 700, color: isSelfCheckIn ? '#047857' : '#64748b', marginTop: 3 }}>
                                    {isSelfCheckIn ? '🏃 Self Check-In' : '📋 Assigned Task'}
                                  </div>
                                  {samePartyCount > 1 && !leadFilter && (
                                    <div style={{ marginTop: 4 }}>
                                      <button
                                        type="button"
                                        onClick={() => setLeadFilter({ id: t.lead_id || null, name: t.party_name })}
                                        style={{
                                          fontSize: '0.68rem',
                                          fontWeight: 700,
                                          color: '#0369a1',
                                          background: '#f0f9ff',
                                          border: '1px solid #bae6fd',
                                          borderRadius: 9999,
                                          padding: '1px 6px',
                                          cursor: 'pointer',
                                        }}
                                        title="Click to see all tasks assigned to this Lead / Party"
                                      >
                                        <Filter size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                                        {samePartyCount} tasks
                                      </button>
                                    </div>
                                  )}
                                </td>
                              );
                            }
                            case 'party':
                              return (
                                <td key={colKey} style={{ padding: '0.65rem 0.75rem', overflow: 'hidden' }}>
                                  <div style={{ fontWeight: 700, color: '#0f172a', wordBreak: 'break-word' }}>{t.party_name || 'Lead Party'}</div>
                                  {t.party_phone && (
                                    <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <Phone size={11} color="#2563eb" />
                                      <span>{t.party_phone}</span>
                                    </div>
                                  )}
                                  {t.party_address && (
                                    <div style={{ fontSize: '0.71rem', color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.party_address}>
                                      <MapPin size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                                      {t.party_address}
                                    </div>
                                  )}
                                </td>
                              );
                            case 'purpose':
                              return (
                                <td key={colKey} style={{ padding: '0.65rem 0.75rem', overflow: 'hidden' }}>
                                  <div style={{ fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Layers size={12} color="#2563eb" />
                                    <span>{t.task_type || 'Field Visit'}</span>
                                  </div>
                                  {stageVal && (
                                    <div style={{
                                      marginTop: 4,
                                      fontSize: '0.7rem',
                                      fontWeight: 600,
                                      color: '#0369a1',
                                      background: '#f0f9ff',
                                      border: '1px solid #bae6fd',
                                      borderRadius: 5,
                                      padding: '2px 6px',
                                      display: 'inline-block',
                                      maxWidth: '100%',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }} title={`${stageLabel}: ${stageVal}`}>
                                      {stageLabel}: {stageVal}
                                    </div>
                                  )}
                                  {instructions && (
                                    <div style={{
                                      marginTop: 4,
                                      fontSize: '0.73rem',
                                      color: '#475569',
                                      display: '-webkit-box',
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                    }} title={instructions}>
                                      {instructions}
                                    </div>
                                  )}
                                </td>
                              );
                            case 'priority':
                              return (
                                <td key={colKey} style={{ padding: '0.65rem 0.75rem' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    fontSize: '0.71rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: 9999,
                                    background: pMeta.bg,
                                    color: pMeta.color,
                                    border: `1px solid ${pMeta.border}`,
                                    whiteSpace: 'nowrap',
                                  }}>
                                    {pMeta.emoji} {pMeta.label.toUpperCase()}
                                  </span>
                                </td>
                              );
                            case 'assigned_to':
                              return (
                                <td key={colKey} style={{ padding: '0.65rem 0.75rem' }}>
                                  <div style={{ fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <User size={12} color="#64748b" />
                                    <span>{t.assigned_to_name}</span>
                                  </div>
                                </td>
                              );
                            case 'assigned_by':
                              return (
                                <td key={colKey} style={{ padding: '0.65rem 0.75rem', color: '#475569' }}>
                                  <div>{t.assigned_by_name}</div>
                                  <div style={{ fontSize: '0.69rem', color: '#94a3b8', marginTop: 2 }}>
                                    {formatISTDateTime(t.created_at)}
                                  </div>
                                </td>
                              );
                            case 'scheduled':
                              return (
                                <td key={colKey} style={{ padding: '0.65rem 0.75rem', color: '#0f172a', fontWeight: 600 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Clock size={12} color="#2563eb" />
                                    <span>{formatISTDateTime(t.scheduled_start_time)}</span>
                                  </div>
                                </td>
                              );
                            case 'delay_status':
                              return (
                                <td key={colKey} style={{ padding: '0.65rem 0.75rem' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    fontSize: '0.71rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: 9999,
                                    background: delayInfo.bg,
                                    color: delayInfo.color,
                                    border: `1px solid ${delayInfo.border}`,
                                    whiteSpace: 'nowrap',
                                  }}>
                                    {delayInfo.label}
                                  </span>
                                </td>
                              );
                            case 'delay_duration':
                              return (
                                <td key={colKey} style={{ padding: '0.65rem 0.75rem', fontWeight: 600, color: delayInfo.isDelayed ? delayInfo.color : '#64748b', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                                  {delayInfo.durationText}
                                </td>
                              );
                            case 'check_in':
                              return (
                                <td key={colKey} style={{ padding: '0.65rem 0.75rem', color: t.actual_start_time ? '#059669' : '#94a3b8', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                                  {t.actual_start_time ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <Clock size={12} color="#059669" />
                                      <span>{formatISTDateTime(t.actual_start_time)}</span>
                                    </div>
                                  ) : '—'}
                                </td>
                              );
                            case 'check_out':
                              return (
                                <td key={colKey} style={{ padding: '0.65rem 0.75rem', color: t.actual_end_time ? '#7c3aed' : '#94a3b8', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                                  {t.actual_end_time ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <Clock size={12} color="#7c3aed" />
                                      <span>{formatISTDateTime(t.actual_end_time)}</span>
                                    </div>
                                  ) : '—'}
                                </td>
                              );
                            case 'check_duration': {
                              const cDur = computeTaskCheckDuration(t, nowTimestamp);
                              return (
                                <td key={colKey} style={{ padding: '0.65rem 0.75rem', fontWeight: 600, color: cDur.isActive ? '#047857' : (cDur.text !== '—' ? '#0f172a' : '#94a3b8'), fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                                  {cDur.text}
                                </td>
                              );
                            }
                            case 'status':
                              return (
                                <td key={colKey} style={{ padding: '0.65rem 0.75rem' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    fontSize: '0.71rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: 9999,
                                    background: sMeta.bg,
                                    color: sMeta.color,
                                    border: `1px solid ${sMeta.border}`,
                                    whiteSpace: 'nowrap',
                                  }}>
                                    {sMeta.label}
                                  </span>
                                </td>
                              );
                            case 'actions':
                              return (
                                <td key={colKey} style={{ padding: '0.65rem 0.75rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <button
                                      type="button"
                                      onClick={() => setViewingTask(t)}
                                      style={{
                                        padding: '4px 8px',
                                        borderRadius: 5,
                                        border: '1px solid #cbd5e1',
                                        background: '#ffffff',
                                        color: '#334155',
                                        fontSize: '0.73rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                      }}
                                      title="View full task details"
                                    >
                                      <Eye size={12} /> View
                                    </button>
                                    {t.can_edit && (
                                      <button
                                        type="button"
                                        onClick={() => openEditModal(t)}
                                        style={{
                                          padding: '4px 8px',
                                          borderRadius: 5,
                                          border: '1px solid #93c5fd',
                                          background: '#eff6ff',
                                          color: '#1d4ed8',
                                          fontSize: '0.73rem',
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4,
                                        }}
                                        title="Edit, Reassign, Reschedule or Cancel task"
                                      >
                                        <Edit3 size={12} /> Edit
                                      </button>
                                    )}
                                  </div>
                                </td>
                              );
                            default:
                              return null;
                          }
                        };

                        return (
                          <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                            {orderedColumns.map((col) => renderCell(col.key))}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ padding: '0.65rem 0.9rem', borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
              <StandardTablePagination
                currentPage={effectivePage}
                totalRecords={filteredTasks.length}
                pageSize={pageSize}
                onPageChange={(p) => setPageState({ page: p, key: filterKey })}
                onPageSizeChange={(sz) => {
                  setPageSize(sz);
                  setPageState({ page: 1, key: '' });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* VIEW TASK DETAILS MODAL */}
      {viewingTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 10020, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#ffffff', borderRadius: 12, width: 'min(520px, 94vw)', maxHeight: '88vh', overflowY: 'auto', padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontFamily: 'monospace',
                  fontWeight: 800,
                  background: String(viewingTask.task_code || '').toUpperCase().startsWith('CHK-') ? '#ecfdf5' : '#eff6ff',
                  color: String(viewingTask.task_code || '').toUpperCase().startsWith('CHK-') ? '#047857' : '#1d4ed8',
                  border: `1px solid ${String(viewingTask.task_code || '').toUpperCase().startsWith('CHK-') ? '#a7f3d0' : '#bfdbfe'}`,
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 13
                }}>
                  {viewingTask.task_code || 'TASK'}
                </span>
                <strong style={{ fontSize: 15, color: '#0f172a' }}>{viewingTask.party_name}</strong>
              </div>
              <button type="button" onClick={() => setViewingTask(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
              <div><span style={{ color: '#64748b' }}>Status:</span> <strong>{getStatusMeta(viewingTask.status).label}</strong></div>
              <div>
                <span style={{ color: '#64748b' }}>Priority:</span>{' '}
                <strong>{getPriorityMeta(viewingTask.priority).emoji} {getPriorityMeta(viewingTask.priority).label.toUpperCase()}</strong>
              </div>
              <div><span style={{ color: '#64748b' }}>Purpose / Type:</span> <strong>{viewingTask.task_type}</strong></div>
              <div><span style={{ color: '#64748b' }}>Assigned To:</span> <strong>{viewingTask.assigned_to_name}</strong></div>
              <div><span style={{ color: '#64748b' }}>Assigned By:</span> <strong>{viewingTask.assigned_by_name}</strong></div>
              <div><span style={{ color: '#64748b' }}>Scheduled (IST):</span> <strong>{formatISTDateTime(viewingTask.scheduled_start_time)}</strong></div>
              {(() => {
                const dInfo = computeFieldTaskDelay(viewingTask, nowTimestamp);
                return (
                  <>
                    <div>
                      <span style={{ color: '#64748b' }}>Delay Status:</span>{' '}
                      <span style={{
                        display: 'inline-block',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: 9999,
                        background: dInfo.bg,
                        color: dInfo.color,
                        border: `1px solid ${dInfo.border}`,
                      }}>
                        {dInfo.label}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Delay Duration:</span>{' '}
                      <strong style={{ color: dInfo.isDelayed ? dInfo.color : '#0f172a' }}>{dInfo.durationText}</strong>
                    </div>
                  </>
                );
              })()}
              <div>
                <span style={{ color: '#64748b' }}>Check-In (IST):</span>{' '}
                <strong style={{ color: viewingTask.actual_start_time ? '#059669' : '#0f172a' }}>
                  {viewingTask.actual_start_time ? formatISTDateTime(viewingTask.actual_start_time) : 'Not Checked In'}
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Check-Out (IST):</span>{' '}
                <strong style={{ color: viewingTask.actual_end_time ? '#7c3aed' : '#0f172a' }}>
                  {viewingTask.actual_end_time ? formatISTDateTime(viewingTask.actual_end_time) : 'Not Checked Out'}
                </strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Check Duration:</span>{' '}
                <strong>{computeTaskCheckDuration(viewingTask, nowTimestamp).text}</strong>
              </div>
              {viewingTask.party_phone && <div><span style={{ color: '#64748b' }}>Phone:</span> <strong>{viewingTask.party_phone}</strong></div>}
              <div><span style={{ color: '#64748b' }}>Created (IST):</span> <strong>{formatISTDateTime(viewingTask.created_at)}</strong></div>
            </div>

            {viewingTask.party_address && (
              <div style={{ fontSize: 12.5, color: '#334155', background: '#f8fafc', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <strong>Address:</strong> {viewingTask.party_address}
              </div>
            )}

            {(viewingTask.form_details?.task_stage || viewingTask.form_details?.lead_status) && (
              <div style={{ fontSize: 12.5, color: '#0369a1', background: '#f0f9ff', padding: 8, borderRadius: 6, border: '1px solid #bae6fd' }}>
                <strong>{viewingTask.form_details?.task_stage_label || 'Stage'}:</strong>{' '}
                {viewingTask.form_details?.task_stage || viewingTask.form_details?.lead_status}
              </div>
            )}

            <div style={{ fontSize: 12.5, color: '#0f172a', background: '#fffbeb', padding: 10, borderRadius: 6, border: '1px solid #fde68a', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              <strong style={{ display: 'block', marginBottom: 4, color: '#92400e' }}>Task Instructions / Description:</strong>
              {viewingTask.form_details?.description || viewingTask.form_details?.issue_description || 'No description provided.'}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              {viewingTask.can_edit && (
                <button
                  type="button"
                  onClick={() => {
                    const target = viewingTask;
                    setViewingTask(null);
                    openEditModal(target);
                  }}
                  style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  ✏️ Edit This Task
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewingTask(null)}
                style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TASK MODAL */}
      {editingTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 10030, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <form
            onSubmit={handleSaveTaskEdit}
            style={{ background: '#ffffff', borderRadius: 12, width: 'min(520px, 95vw)', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: '0 25px 50px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                  Edit Field Task ({editingTask.task_code || 'TASK'})
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                  Party: <strong>{editingTask.party_name}</strong>
                </p>
              </div>
              <button type="button" onClick={() => setEditingTask(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Reassign Field Executive *</label>
                <select
                  value={editExecId}
                  onChange={(e) => setEditExecId(e.target.value)}
                  style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                  required
                >
                  <option value="">-- Select Executive --</option>
                  {availableExecutives.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Task Priority *</label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                  style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                >
                  <option value="CRITICAL">🔴 Critical</option>
                  <option value="URGENT">🟠 Urgent</option>
                  <option value="HIGH">🟡 High</option>
                  <option value="MEDIUM">🔵 Medium</option>
                  <option value="LOW">🟢 Low</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Visit Purpose / Task Type *</label>
                <select
                  value={editPurpose}
                  onChange={(e) => setEditPurpose(e.target.value)}
                  style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                >
                  {!availablePurposes.includes(editPurpose) && editPurpose && (
                    <option value={editPurpose}>{editPurpose}</option>
                  )}
                  {availablePurposes.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Task Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                >
                  <option value="SCHEDULED">⏳ Scheduled</option>
                  <option value="PENDING">🕒 Pending</option>
                  <option value="IN_PROGRESS">🚗 In Progress</option>
                  <option value="CANCELLED">❌ Cancelled</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Scheduled Visit Date &amp; Time (IST)</label>
                <input
                  type="datetime-local"
                  value={editDateLocal}
                  onChange={(e) => setEditDateLocal(e.target.value)}
                  style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Stage / Status Note</label>
                <input
                  type="text"
                  value={editStage}
                  onChange={(e) => setEditStage(e.target.value)}
                  placeholder="Optional stage / status"
                  style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Party Phone</label>
                <input
                  type="text"
                  value={editPartyPhone}
                  onChange={(e) => setEditPartyPhone(e.target.value)}
                  style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Party Address</label>
                <input
                  type="text"
                  value={editPartyAddress}
                  onChange={(e) => setEditPartyAddress(e.target.value)}
                  style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Task Description / Instructions *</label>
              <textarea
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }}
                required
              />
            </div>

            {editError && (
              <div style={{ padding: '8px 10px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 12, fontWeight: 600 }}>
                ⚠️ {editError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12.5, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSaving}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Send size={13} />
                {editSaving ? 'Saving...' : 'Save Task Updates'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
