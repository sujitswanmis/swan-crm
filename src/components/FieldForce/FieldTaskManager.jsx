'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
} from 'lucide-react';
import { getTenantCustomForms } from '@/app/actions/fieldFormStudio';
import { createFieldTask, getManagedFieldTasks, updateFieldTask } from '@/app/actions/fieldTasks';
import { getTeamMembers } from '@/app/actions/team';
import StandardTablePagination from '@/components/common/StandardTablePagination';

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

const DEFAULT_COL_WIDTHS = {
  task_code: 125,
  party: 230,
  purpose: 245,
  priority: 120,
  assigned_to: 165,
  assigned_by: 160,
  scheduled: 170,
  status: 130,
  actions: 145,
};

const COL_WIDTHS_STORAGE_KEY = 'crmFieldTaskManagerColWidths';

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

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [forms, setForms] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  // Task Management View & Filters
  const [viewScope, setViewScope] = useState('assigned_by_me');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [purposeFilter, setPurposeFilter] = useState('ALL');
  const [execFilter, setExecFilter] = useState('ALL');
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

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await getManagedFieldTasks({
        viewScope,
        currentUserId: effectiveUserId,
        company,
        tenantId,
        branchAccess,
        adminCompanyFilter,
      });
      if (res?.success) {
        setTasks(res.tasks || []);
      } else {
        setTasks([]);
        setLoadError(res?.error || 'Failed to fetch tasks');
      }
    } catch (err) {
      console.error('Failed to fetch managed field tasks:', err);
      setLoadError(err?.message || 'Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  }, [viewScope, effectiveUserId, company, tenantId, branchAccess, adminCompanyFilter]);

  useEffect(() => {
    const initMeta = async () => {
      try {
        const branchScope = branchAccess
          ? {
              scope: branchAccess.scope,
              isAllBranches: branchAccess.isAllBranches,
              allowedCompanies: branchAccess.allowedCompanies,
              allowedBranchNames: branchAccess.allowedBranchNames,
              allowedBranchCodes: branchAccess.allowedBranchCodes,
              selectedFilter: adminCompanyFilter || 'All',
            }
          : adminCompanyFilter && adminCompanyFilter !== 'All'
            ? { selectedFilter: adminCompanyFilter }
            : null;
        const [formsData, membersData] = await Promise.all([
          getTenantCustomForms(company),
          getTeamMembers(company, tenantId, branchScope),
        ]);
        setForms(formsData || []);
        setTeamMembers(membersData || []);
      } catch (err) {
        console.error(err);
      }
    };
    initMeta();
  }, [company, tenantId, branchAccess, adminCompanyFilter]);

  useEffect(() => {
    let active = true;
    getManagedFieldTasks({
      viewScope,
      currentUserId: effectiveUserId,
      company,
      tenantId,
      branchAccess,
      adminCompanyFilter,
    })
      .then((res) => {
        if (!active) return;
        if (res?.success) {
          setTasks(res.tasks || []);
          setLoadError('');
        } else {
          setTasks([]);
          setLoadError(res?.error || 'Failed to fetch tasks');
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to fetch managed field tasks:', err);
        setLoadError(err?.message || 'Failed to fetch tasks');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [viewScope, effectiveUserId, company, tenantId, branchAccess, adminCompanyFilter]);

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

  const filteredTasks = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const istFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });

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
        const refDate = t.scheduled_start_time || t.created_at;
        if (!refDate) return false;
        const dObj = new Date(refDate);
        if (Number.isNaN(dObj.getTime())) return false;
        const istDay = istFmt.format(dObj);
        if (dateFrom && istDay < dateFrom) return false;
        if (dateTo && istDay > dateTo) return false;
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
  }, [tasks, leadFilter, statusFilter, priorityFilter, purposeFilter, execFilter, dateFrom, dateTo, searchTerm]);

  const filterKey = `${viewScope}|${searchTerm}|${statusFilter}|${priorityFilter}|${purposeFilter}|${execFilter}|${dateFrom}|${dateTo}|${leadFilter?.id || ''}|${leadFilter?.name || ''}|${pageSize}`;
  const effectivePage = pageState.key === filterKey ? pageState.page : 1;

  const paginatedTasks = useMemo(() => {
    if (pageSize >= 100000) return filteredTasks;
    const start = (effectivePage - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, effectivePage, pageSize]);

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
        await fetchTasks();
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
        await fetchTasks();
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={fetchTasks}
              disabled={loading}
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
              <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="Scheduled From (IST)"
                style={{ padding: '0.4rem 0.5rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.78rem', background: '#ffffff' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="Scheduled To (IST)"
                style={{ padding: '0.4rem 0.5rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.78rem', background: '#ffffff' }}
              />
            </div>

            {(searchTerm || statusFilter !== 'ALL' || priorityFilter !== 'ALL' || purposeFilter !== 'ALL' || execFilter !== 'ALL' || dateFrom || dateTo || leadFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('ALL');
                  setPriorityFilter('ALL');
                  setPurposeFilter('ALL');
                  setExecFilter('ALL');
                  setDateFrom('');
                  setDateTo('');
                  setLeadFilter(null);
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

          {/* Tasks Table Card */}
          <div style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
            <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 380px)', minHeight: '320px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    {renderResizableHeader('task_code', 'Task ID')}
                    {renderResizableHeader('party', 'Lead / Party')}
                    {renderResizableHeader('purpose', 'Purpose, Stage & Instructions')}
                    {renderResizableHeader('priority', 'Priority')}
                    {renderResizableHeader('assigned_to', 'Assigned To')}
                    {renderResizableHeader('assigned_by', 'Assigned By')}
                    {renderResizableHeader('scheduled', 'Scheduled (IST)')}
                    {renderResizableHeader('status', 'Status')}
                    {renderResizableHeader('actions', 'Actions')}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
                        Loading assigned field tasks...
                      </td>
                    </tr>
                  ) : paginatedTasks.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>No field tasks found in this view.</div>
                        <div style={{ fontSize: '0.78rem' }}>Try switching tabs/filters or click &quot;+ Create Task&quot; to assign a new field visit.</div>
                      </td>
                    </tr>
                  ) : (
                    paginatedTasks.map((t) => {
                      const pMeta = getPriorityMeta(t.priority);
                      const sMeta = getStatusMeta(t.status);
                      const partyKey = t.lead_id || `name:${String(t.party_name || '').trim().toLowerCase()}`;
                      const samePartyCount = partyTaskCounts.get(partyKey) || 1;
                      const stageVal = t.form_details?.task_stage || t.form_details?.lead_status || t.form_details?.lead_status_at_assign || '';
                      const stageLabel = t.form_details?.task_stage_label || (t.form_details?.lead_status ? 'Lead Status' : 'Stage');
                      const instructions = String(t.form_details?.description || t.form_details?.issue_description || '').trim();

                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                          {/* Task ID / Check-In ID */}
                          <td style={{ padding: '0.65rem 0.75rem', overflow: 'hidden' }}>
                            {(() => {
                              const isSelfCheckIn = String(t.task_code || '').toUpperCase().startsWith('CHK-');
                              return (
                                <>
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
                                </>
                              );
                            })()}
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

                          {/* Lead / Party */}
                          <td style={{ padding: '0.65rem 0.75rem', overflow: 'hidden' }}>
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

                          {/* Purpose, Stage & Instructions */}
                          <td style={{ padding: '0.65rem 0.75rem', overflow: 'hidden' }}>
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

                          {/* Priority */}
                          <td style={{ padding: '0.65rem 0.75rem' }}>
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

                          {/* Assigned To */}
                          <td style={{ padding: '0.65rem 0.75rem' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <User size={12} color="#64748b" />
                              <span>{t.assigned_to_name}</span>
                            </div>
                          </td>

                          {/* Assigned By */}
                          <td style={{ padding: '0.65rem 0.75rem', color: '#475569' }}>
                            <div>{t.assigned_by_name}</div>
                            <div style={{ fontSize: '0.69rem', color: '#94a3b8', marginTop: 2 }}>
                              {formatISTDateTime(t.created_at)}
                            </div>
                          </td>

                          {/* Scheduled (IST) */}
                          <td style={{ padding: '0.65rem 0.75rem', color: '#0f172a', fontWeight: 600 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={12} color="#2563eb" />
                              <span>{formatISTDateTime(t.scheduled_start_time)}</span>
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ padding: '0.65rem 0.75rem' }}>
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

                          {/* Actions */}
                          <td style={{ padding: '0.65rem 0.75rem' }}>
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
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

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
