'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, Clock, CheckCircle2, AlertCircle, Plus, Search, Filter,
  RefreshCw, User, Users, ArrowRight, Star, Check, X, ShieldCheck,
  ChevronLeft, ChevronRight, Sparkles, Flame, BarChart3, TrendingUp,
  Layers, Eye, LayoutGrid, List, CalendarCheck, Inbox, ArrowUpRight,
  Trash2, WifiOff
} from 'lucide-react';

import {
  getTodayISTDate,
  createTaskPlannerItem,
  getTaskPlannerItems,
  updateTaskPlannerItem,
  updateTaskPlannerStatus,
  carryForwardTask,
  deleteTaskPlannerItem,
  restoreTaskPlannerItem,
  permanentDeleteTaskPlannerItem,
  getDeletedTaskPlannerItems,
  getAggregatedPendingSources,
  getTaskPlannerAnalytics,
  syncTaskPlannerDelta
} from '@/app/actions/taskPlanner';

import {
  openTaskPlannerDB,
  getTaskPlannerScopeKey,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
  getCachedTaskPlannerItems,
  getCachedDeletedTasks,
  saveTaskPlannerItemsToCache,
  optimisticSaveTaskLocally,
  optimisticUpdateStatusLocally,
  optimisticCarryForwardLocally,
  optimisticSoftDeleteLocally,
  optimisticRestoreLocally,
  optimisticPermanentDeleteLocally,
  replaceLocalTaskId,
  clearTaskPlannerCache
} from '@/utils/taskPlannerLocalDb';

import { enqueueOfflineAction, syncPendingQueue } from '@/utils/offlineSync';

import TaskPlannerDashboardView from './TaskPlannerDashboardView';
import DayTimeBlockView from './DayTimeBlockView';
import CalendarMatrixView from './CalendarMatrixView';
import KanbanPlannerView from './KanbanPlannerView';
import TaskPlannerTableView from './TaskPlannerTableView';
import DeletedTasksView from './DeletedTasksView';
import QuickTaskModal from './QuickTaskModal';
import DateRangePicker from '@/components/common/DateRangePicker';
import { CRMTabs } from '@/components/common/CRMDesignSystem';
import styles from './TaskPlanner.module.css';

export default function TaskPlannerModule({
  userId,
  userName = 'Employee',
  userEmail = '',
  userRole = 'Executive',
  userCompany = '',
  tenantId = '00000000-0000-0000-0000-000000000001',
  moduleAccess = {},
  isMasterAdmin = false,
  adminCompanyFilter = 'All',
  initialSubTab = 'day',
  onSubTabChange
}) {
  const [localTab, setLocalTab] = useState(initialSubTab || 'day');
  const activeTab = onSubTabChange ? (initialSubTab || localTab) : localTab;

  // Handle Tab Switch (Unified across header tabs, sidebar links, Week Matrix date clicks, and URL history)
  const handleTabChange = useCallback((tab) => {
    setLocalTab(tab);
    if (onSubTabChange) onSubTabChange(tab);
  }, [onSubTabChange]);

  const [currentDate, setCurrentDate] = useState('');
  const [datePreset, setDatePreset] = useState('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Aggregated Backlog Drawer State
  const [showBacklog, setShowBacklog] = useState(false);
  const [backlogSources, setBacklogSources] = useState({ delegations: [], checklists: [] });
  const [loadingBacklog, setLoadingBacklog] = useState(false);

  // Quick Task Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState(null);
  const [modalInitialSlot, setModalInitialSlot] = useState('');

  // Delete Confirmation Modal State
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Deleted Tasks State
  const [deletedTasks, setDeletedTasks] = useState([]);
  const [loadingDeleted, setLoadingDeleted] = useState(false);

  // Live Sync Status States (LocalDB & Delta Sync)
  const [syncStatus, setSyncStatus] = useState('synced'); // 'synced' | 'syncing' | 'offline'
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Effective Tenant ID (Resolved silently in background)
  const isValidUUID = (str) => {
    return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
  };

  const effectiveTenantId = useMemo(() => {
    if (tenantId && isValidUUID(tenantId)) return tenantId;
    const lowerCompany = (userCompany || '').toLowerCase().trim();
    if (lowerCompany.includes('supuja')) {
      return '0a37b8e8-1c28-4e19-8891-951fc3f8f8af';
    }
    if (lowerCompany.includes('testing')) {
      return '922d3e72-6588-457f-a562-4f1bdbf10d98';
    }
    return '00000000-0000-0000-0000-000000000001';
  }, [tenantId, userCompany]);

  // Delta Sync Scope Key
  const scopeKey = useMemo(() => {
    return getTaskPlannerScopeKey(effectiveTenantId, isMasterAdmin ? 'all' : userEmail);
  }, [effectiveTenantId, isMasterAdmin, userEmail]);

  // Requester Filter State ('ALL' | 'SELF' | 'OTHERS')
  const [requesterFilter, setRequesterFilter] = useState('ALL');

  // Show Toast Helper
  const showToast = useCallback((msg, type = 'success') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Listen for browser popstate navigation
  useEffect(() => {
    const handlePopState = () => {
      const search = new URLSearchParams(window.location.search);
      const tabParam = search.get('tab');
      if (tabParam && ['dashboard', 'day', 'week', 'kanban', 'table', 'trash'].includes(tabParam)) {
        handleTabChange(tabParam);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [handleTabChange]);

  // Realtime Search Filter across Title, Description, Requester, Category, Time Slot, Priority, Status
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const q = searchQuery.toLowerCase().trim();
    return tasks.filter(t => {
      const titleMatch = (t.title || '').toLowerCase().includes(q);
      const descMatch = (t.description || '').toLowerCase().includes(q);
      const reqMatch = (t.requested_by_name || '').toLowerCase().includes(q);
      const catMatch = (t.category || '').toLowerCase().includes(q);
      const slotMatch = (t.time_slot_label || t.time_slot_start || '').toLowerCase().includes(q);
      const priorityMatch = (t.priority || '').toLowerCase().includes(q);
      const statusMatch = (t.status || '').toLowerCase().includes(q);
      return titleMatch || descMatch || reqMatch || catMatch || slotMatch || priorityMatch || statusMatch;
    });
  }, [tasks, searchQuery]);

  // WhatsApp Official style Tab Items
  const plannerTabs = useMemo(() => [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'day', label: 'Day Time-Block', icon: Clock },
    { id: 'week', label: 'Week Matrix', icon: Calendar },
    { id: 'kanban', label: 'Kanban Board', icon: Layers },
    { id: 'table', label: 'All Tasks (Table)', icon: List, count: filteredTasks.length > 0 ? filteredTasks.length : undefined },
    { id: 'trash', label: 'Deleted Tasks', icon: Trash2, count: deletedTasks.length > 0 ? deletedTasks.length : undefined }
  ], [filteredTasks.length, deletedTasks.length]);

  // Initialize today's date in IST
  useEffect(() => {
    async function initDate() {
      const today = await getTodayISTDate();
      setCurrentDate(today);
      setStartDate(today);
      setEndDate(today);
      setDatePreset('today');
    }
    initDate();
  }, []);

  const isWeekView = activeTab === 'week';

  // Load Tasks for Current Date / Range with LocalDB 0ms Instant Rendering + Delta Sync
  const loadTasks = useCallback(async (forceFullRefresh = false) => {
    if (!currentDate && !startDate && datePreset !== 'all') return;

    const isRange = Boolean(startDate && endDate && startDate !== endDate);
    let queryDate = null;
    let queryStartDate = null;
    let queryEndDate = null;

    if (datePreset === 'all') {
      queryDate = null;
      queryStartDate = null;
      queryEndDate = null;
    } else if (isRange) {
      queryStartDate = startDate;
      queryEndDate = endDate;
    } else if (isWeekView) {
      queryStartDate = getWeekStartDate(currentDate || startDate);
      queryEndDate = getWeekEndDate(currentDate || startDate);
    } else {
      queryDate = startDate || currentDate;
    }

    // Step 1: Instant 0ms Read from LocalDB Cache
    let lastSyncedAt = null;
    try {
      lastSyncedAt = forceFullRefresh ? null : await getLastSyncTimestamp(scopeKey);
      const cached = await getCachedTaskPlannerItems({
        tenantId: effectiveTenantId,
        scopeKey,
        employeeEmail: isMasterAdmin ? null : userEmail,
        date: queryDate,
        startDate: queryStartDate,
        endDate: queryEndDate,
        requesterFilter
      });

      if (lastSyncedAt || (cached && cached.length > 0)) {
        setTasks(cached || []);
        setLoading(false);
      }

      const cachedDel = await getCachedDeletedTasks({
        tenantId: effectiveTenantId,
        scopeKey,
        employeeEmail: isMasterAdmin ? null : userEmail
      });
      if (lastSyncedAt || (cachedDel && cachedDel.length > 0)) {
        setDeletedTasks(cachedDel || []);
      }
    } catch (cacheErr) {
      console.warn('LocalDB read notice:', cacheErr);
    }

    // If device is offline, skip network fetch and remain on LocalDB
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncStatus('offline');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Step 2: Background Delta Sync with Server
    try {
      setSyncStatus('syncing');

      const deltaRes = await syncTaskPlannerDelta({
        tenantId: effectiveTenantId,
        employeeEmail: isMasterAdmin ? null : userEmail,
        lastSyncedAt
      });

      if (deltaRes.success) {
        const isInitialSnapshot = !lastSyncedAt;
        await saveTaskPlannerItemsToCache(
          deltaRes.changes || [],
          scopeKey,
          deltaRes.serverTimestamp,
          isInitialSnapshot
        );

        // Always re-query LocalDB so current date/filter view reflects merged state (even if 0 items)
        const refreshed = await getCachedTaskPlannerItems({
          tenantId: effectiveTenantId,
          scopeKey,
          employeeEmail: isMasterAdmin ? null : userEmail,
          date: queryDate,
          startDate: queryStartDate,
          endDate: queryEndDate,
          requesterFilter
        });
        setTasks(refreshed || []);

        const refreshedDeleted = await getCachedDeletedTasks({
          tenantId: effectiveTenantId,
          scopeKey,
          employeeEmail: isMasterAdmin ? null : userEmail
        });
        setDeletedTasks(refreshedDeleted || []);

        setSyncStatus('synced');
        const nowIST = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
        setLastSyncTime(nowIST);
      } else {
        // Fallback to full fetch if delta failed
        const res = await getTaskPlannerItems({
          tenantId: effectiveTenantId,
          employeeEmail: isMasterAdmin ? null : userEmail,
          date: queryDate,
          startDate: queryStartDate,
          endDate: queryEndDate,
          requesterFilter
        });
        if (res.success) {
          setTasks(res.data || []);
          await saveTaskPlannerItemsToCache(res.data || [], scopeKey, new Date().toISOString());
          setSyncStatus('synced');
        } else {
          showToast(res.error || 'Failed to sync planned tasks', 'error');
        }
      }
    } catch (err) {
      console.warn('Network sync interrupted, continuing on LocalDB:', err);
      setSyncStatus('offline');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentDate, startDate, endDate, datePreset, effectiveTenantId, userEmail, isWeekView, isMasterAdmin, requesterFilter, scopeKey, showToast]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadTasks();
    });
    return () => { cancelled = true; };
  }, [loadTasks]);

  // Load Aggregated Pending Backlog (Delegations & Checklists)
  const loadBacklog = useCallback(async () => {
    if (!userEmail) return;
    setLoadingBacklog(true);
    try {
      const res = await getAggregatedPendingSources({
        tenantId: effectiveTenantId,
        employeeEmail: userEmail,
        date: currentDate
      });
      if (res.success) {
        setBacklogSources({
          delegations: res.delegations || [],
          checklists: res.checklists || []
        });
      }
    } catch (err) {
      console.error('Error loading backlog:', err);
    } finally {
      setLoadingBacklog(false);
    }
  }, [effectiveTenantId, userEmail, currentDate]);

  useEffect(() => {
    if (!showBacklog) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadBacklog();
    });
    return () => { cancelled = true; };
  }, [showBacklog, loadBacklog]);

  // Load Deleted Tasks (Trash Bin) with LocalDB Instant Rendering
  const loadDeletedTasks = useCallback(async () => {
    // Step 1: Instant read from LocalDB
    try {
      const cached = await getCachedDeletedTasks({
        tenantId: effectiveTenantId,
        scopeKey,
        employeeEmail: isMasterAdmin ? null : userEmail
      });
      setDeletedTasks(cached || []);
      setLoadingDeleted(false);
    } catch (e) {
      console.warn('LocalDB deleted tasks read notice:', e);
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoadingDeleted(false);
      return;
    }

    try {
      const res = await getDeletedTaskPlannerItems({
        tenantId: effectiveTenantId,
        employeeEmail: isMasterAdmin ? null : userEmail
      });
      if (res.success) {
        setDeletedTasks(res.data || []);
        await saveTaskPlannerItemsToCache(res.data || [], scopeKey);
      }
    } catch (err) {
      console.error('Error loading deleted tasks:', err);
    } finally {
      setLoadingDeleted(false);
    }
  }, [effectiveTenantId, isMasterAdmin, userEmail, scopeKey]);

  useEffect(() => {
    if (activeTab !== 'trash') return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadDeletedTasks();
    });
    return () => { cancelled = true; };
  }, [activeTab, loadDeletedTasks]);

  // Network State & Auto-Sync Listener
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setSyncStatus('syncing');
      try {
        await syncPendingQueue();
        await loadTasks(true);
        await loadDeletedTasks();
        setSyncStatus('synced');
        showToast('Online! LocalDB synced with server.');
      } catch (err) {
        console.error('Online sync error:', err);
        setSyncStatus('synced');
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
      showToast('Network disconnected. Operating on LocalDB.', 'warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadTasks, loadDeletedTasks, showToast]);

  // Handle Quick Date Presets from DateRangePicker
  const handleDatePresetChange = ({ preset, startDate: sDate, endDate: eDate }) => {
    setDatePreset(preset);
    setStartDate(sDate);
    setEndDate(eDate);
    if (sDate) {
      setCurrentDate(sDate);
    }
  };

  // Date Navigation Controls (IST)
  const handlePrevDay = () => {
    const base = currentDate || startDate || new Date().toISOString().split('T')[0];
    const d = new Date(base + 'T00:00:00+05:30');
    d.setDate(d.getDate() - 1);
    const newDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    setCurrentDate(newDate);
    setStartDate(newDate);
    setEndDate(newDate);
    setDatePreset('custom');
  };

  const handleNextDay = () => {
    const base = currentDate || startDate || new Date().toISOString().split('T')[0];
    const d = new Date(base + 'T00:00:00+05:30');
    d.setDate(d.getDate() + 1);
    const newDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    setCurrentDate(newDate);
    setStartDate(newDate);
    setEndDate(newDate);
    setDatePreset('custom');
  };

  const handleToday = async () => {
    const today = await getTodayISTDate();
    setCurrentDate(today);
    setStartDate(today);
    setEndDate(today);
    setDatePreset('today');
  };

  // Task Action Handlers (Optimistic LocalDB + Offline Sync Queue)
  const handleSaveTask = async (formData, editId) => {
    const isOnlineNow = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (editId) {
      // 1. Optimistic LocalDB & State Update (0ms)
      const existing = tasks.find(t => t.id === editId) || {};
      const localUpdated = { ...existing, ...formData, id: editId, tenant_id: effectiveTenantId, updated_at: new Date().toISOString() };
      await optimisticSaveTaskLocally(localUpdated, scopeKey);
      setTasks(prev => prev.map(t => t.id === editId ? { ...t, ...formData } : t));

      if (isOnlineNow) {
        try {
          const res = await updateTaskPlannerItem(editId, formData, effectiveTenantId);
          if (res.success) {
            if (res.data) await optimisticSaveTaskLocally(res.data, scopeKey);
            showToast('Task updated successfully!');
            loadTasks();
          } else {
            throw new Error(res.error || 'Failed to update task');
          }
        } catch (err) {
          await enqueueOfflineAction('update', 'task_planner_update', { id: editId, updates: formData, tenantId: effectiveTenantId });
          showToast('Updated locally (queued for sync)', 'warning');
        }
      } else {
        await enqueueOfflineAction('update', 'task_planner_update', { id: editId, updates: formData, tenantId: effectiveTenantId });
        showToast('Updated locally (offline queued)');
      }
    } else {
      // 1. Generate local UUID and optimistic save
      const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `task_${Date.now()}`;
      const localNew = {
        ...formData,
        id: newId,
        tenant_id: effectiveTenantId,
        status: formData.status || 'PLANNED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        __offline_pending: true
      };

      await optimisticSaveTaskLocally(localNew, scopeKey);
      setTasks(prev => [...prev, localNew]);

      if (isOnlineNow) {
        try {
          const res = await createTaskPlannerItem({ ...formData, id: newId, tenant_id: effectiveTenantId }, effectiveTenantId);
          if (res.success) {
            if (res.data) await replaceLocalTaskId(newId, res.data, scopeKey);
            showToast('Task added to plan!');
            loadTasks();
          } else {
            throw new Error(res.error || 'Failed to add task');
          }
        } catch (err) {
          await enqueueOfflineAction('create', 'task_planner_create', { ...formData, id: newId, tenant_id: effectiveTenantId, __scopeKey: scopeKey });
          showToast('Saved locally (queued for sync)', 'warning');
        }
      } else {
        await enqueueOfflineAction('create', 'task_planner_create', { ...formData, id: newId, tenant_id: effectiveTenantId, __scopeKey: scopeKey });
        showToast('Saved locally (offline queued)');
      }
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    // 1. Optimistic LocalDB & State update (0ms)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    await optimisticUpdateStatusLocally(taskId, newStatus, '', null);
    showToast(`Task marked as ${newStatus.toLowerCase()}`);

    const isOnlineNow = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (isOnlineNow) {
      try {
        const res = await updateTaskPlannerStatus(taskId, newStatus, '', null, effectiveTenantId);
        if (!res?.success) {
          await enqueueOfflineAction('update', 'task_planner_status', { id: taskId, status: newStatus, tenantId: effectiveTenantId });
        }
      } catch (err) {
        await enqueueOfflineAction('update', 'task_planner_status', { id: taskId, status: newStatus, tenantId: effectiveTenantId });
      }
    } else {
      await enqueueOfflineAction('update', 'task_planner_status', { id: taskId, status: newStatus, tenantId: effectiveTenantId });
    }
  };

  const handleCarryForward = async (taskId) => {
    const d = new Date((currentDate || new Date().toISOString().split('T')[0]) + 'T00:00:00+05:30');
    d.setDate(d.getDate() + 1);
    const tomorrowIST = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    // 1. Optimistic LocalDB & State update (0ms)
    await optimisticCarryForwardLocally(taskId, tomorrowIST);
    setTasks(prev => prev.map(t => t.id === taskId ? {
      ...t,
      planned_date: tomorrowIST,
      status: 'CARRIED_FORWARD',
      carry_forward_count: (t.carry_forward_count || 0) + 1
    } : t));
    showToast(`Task carried forward to ${tomorrowIST}!`);

    const isOnlineNow = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (isOnlineNow) {
      try {
        const res = await carryForwardTask(taskId, tomorrowIST, effectiveTenantId);
        if (res?.success) loadTasks();
        else {
          await enqueueOfflineAction('update', 'task_planner_carry', { id: taskId, targetDate: tomorrowIST, tenantId: effectiveTenantId });
        }
      } catch (err) {
        await enqueueOfflineAction('update', 'task_planner_carry', { id: taskId, targetDate: tomorrowIST, tenantId: effectiveTenantId });
      }
    } else {
      await enqueueOfflineAction('update', 'task_planner_carry', { id: taskId, targetDate: tomorrowIST, tenantId: effectiveTenantId });
    }
  };

  const handleDeleteTask = (taskId) => {
    const task = tasks.find(t => t.id === taskId) || { id: taskId, title: 'Planned Task' };
    setTaskToDelete(task);
  };

  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    const targetId = taskToDelete.id;

    // 1. Optimistic LocalDB & State update (0ms)
    await optimisticSoftDeleteLocally(targetId);
    setTasks(prev => prev.filter(t => t.id !== targetId));
    setDeletedTasks(prev => [{ ...taskToDelete, status: 'CANCELLED', updated_at: new Date().toISOString() }, ...prev]);
    showToast('Task moved to Trash');
    setTaskToDelete(null);

    const isOnlineNow = typeof navigator !== 'undefined' ? navigator.onLine : true;
    try {
      if (isOnlineNow) {
        const res = await deleteTaskPlannerItem(targetId, effectiveTenantId);
        if (!res?.success) {
          await enqueueOfflineAction('delete', 'task_planner_delete', { id: targetId, tenantId: effectiveTenantId });
        }
      } else {
        await enqueueOfflineAction('delete', 'task_planner_delete', { id: targetId, tenantId: effectiveTenantId });
      }
    } catch (err) {
      console.warn('Soft delete queued offline:', err);
      await enqueueOfflineAction('delete', 'task_planner_delete', { id: targetId, tenantId: effectiveTenantId });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestoreTask = async (taskId) => {
    const task = deletedTasks.find(t => t.id === taskId);

    // 1. Optimistic LocalDB & State update (0ms)
    await optimisticRestoreLocally(taskId);
    setDeletedTasks(prev => prev.filter(t => t.id !== taskId));
    if (task) {
      setTasks(prev => [...prev, { ...task, status: 'PLANNED', updated_at: new Date().toISOString() }]);
    }
    showToast('Task restored to planned schedule!');

    const isOnlineNow = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (isOnlineNow) {
      try {
        const res = await restoreTaskPlannerItem(taskId, effectiveTenantId);
        if (!res?.success) {
          await enqueueOfflineAction('update', 'task_planner_restore', { id: taskId, tenantId: effectiveTenantId });
        }
      } catch (err) {
        await enqueueOfflineAction('update', 'task_planner_restore', { id: taskId, tenantId: effectiveTenantId });
      }
    } else {
      await enqueueOfflineAction('update', 'task_planner_restore', { id: taskId, tenantId: effectiveTenantId });
    }
  };

  const handlePermanentDeleteTask = async (taskId) => {
    // 1. Optimistic LocalDB & State update (0ms)
    await optimisticPermanentDeleteLocally(taskId);
    setDeletedTasks(prev => prev.filter(t => t.id !== taskId));
    showToast('Task permanently deleted from database');

    const isOnlineNow = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (isOnlineNow) {
      try {
        const res = await permanentDeleteTaskPlannerItem(taskId, effectiveTenantId);
        if (!res?.success) {
          await enqueueOfflineAction('delete', 'task_planner_permanent_delete', { id: taskId, tenantId: effectiveTenantId });
        }
      } catch (err) {
        await enqueueOfflineAction('delete', 'task_planner_permanent_delete', { id: taskId, tenantId: effectiveTenantId });
      }
    } else {
      await enqueueOfflineAction('delete', 'task_planner_permanent_delete', { id: taskId, tenantId: effectiveTenantId });
    }
  };

  const handleUpdateActualTime = async (taskId, minutes) => {
    const existing = tasks.find(t => t.id === taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, actual_minutes: minutes } : t));
    if (existing) {
      await optimisticSaveTaskLocally({ ...existing, actual_minutes: minutes, updated_at: new Date().toISOString() }, scopeKey);
    }
    try {
      await updateTaskPlannerItem(taskId, { actual_minutes: minutes }, effectiveTenantId);
    } catch (err) {
      console.error('Error updating actual time:', err);
      await enqueueOfflineAction('update', 'task_planner_update', { id: taskId, updates: { actual_minutes: minutes }, tenantId: effectiveTenantId });
    }
  };

  // Import from Backlog directly to Today's Plan
  const handleImportDelegation = async (del) => {
    const itemData = {
      title: del.title,
      description: del.description || `Delegated by ${del.delegated_by_name} (Deadline: ${new Date(del.deadline).toLocaleDateString('en-IN')})`,
      source_type: 'DELEGATION',
      source_ref_id: del.id,
      planned_date: currentDate,
      priority: del.priority === 'URGENT' || del.priority === 'HIGH' ? 'URGENT_IMPORTANT' : 'IMPORTANT_NOT_URGENT',
      estimated_minutes: 45,
      employee_name: userName,
      employee_email: userEmail,
      branch_code: 'All'
    };

    const res = await createTaskPlannerItem(itemData, effectiveTenantId);
    if (res.success) {
      if (res.data) await optimisticSaveTaskLocally(res.data, scopeKey);
      showToast(`Delegation "${del.title}" added to today's plan!`);
      loadTasks();
      loadBacklog();
    }
  };

  const handleImportChecklist = async (chk) => {
    const itemData = {
      title: `📋 ${chk.title} (${chk.frequency})`,
      description: `Daily checklist slot due at ${chk.due_time || '18:00'}`,
      source_type: 'CHECKLIST',
      source_ref_id: chk.id,
      planned_date: currentDate,
      time_slot_start: chk.due_time ? chk.due_time.slice(0, 5) : '10:00',
      priority: 'IMPORTANT_NOT_URGENT',
      estimated_minutes: 20,
      employee_name: userName,
      employee_email: userEmail,
      branch_code: 'All'
    };

    const res = await createTaskPlannerItem(itemData, effectiveTenantId);
    if (res.success) {
      if (res.data) await optimisticSaveTaskLocally(res.data, scopeKey);
      showToast(`Checklist "${chk.title}" scheduled in today's plan!`);
      loadTasks();
      loadBacklog();
    }
  };

  // KPI Metrics Calculation (Reflecting search filtered view)
  const kpis = useMemo(() => {
    const total = filteredTasks.length;
    const completed = filteredTasks.filter(t => t.status === 'COMPLETED').length;
    const inProgress = filteredTasks.filter(t => t.status === 'IN_PROGRESS').length;
    const carried = filteredTasks.filter(t => t.status === 'CARRIED_FORWARD').length;
    const planned = filteredTasks.filter(t => t.status === 'PLANNED').length;

    const totalEstHours = (filteredTasks.reduce((sum, t) => sum + (t.estimated_minutes || 0), 0) / 60).toFixed(1);
    const score = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, inProgress, carried, planned, totalEstHours, score };
  }, [filteredTasks]);

  const totalBacklogCount = (backlogSources.delegations?.length || 0) + (backlogSources.checklists?.length || 0);

  return (
    <div className={styles.planner} style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.45rem',
      padding: '0.65rem 0.85rem',
      minHeight: '100%',
      backgroundColor: 'var(--bg-page, #f8fafc)',
      color: 'var(--text-primary, #1e293b)'
    }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 10000,
          padding: '0.65rem 1.15rem',
          borderRadius: '10px',
          background: toastMessage.type === 'error' ? 'var(--task-action-danger)' : 'var(--task-action-success)',
          color: '#ffffff',
          fontWeight: 600,
          fontSize: '0.85rem',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          {toastMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toastMessage.msg}</span>
        </div>
      )}

      {/* Top Header & Navigation Bar */}
      <div style={{
        background: 'var(--bg-surface, #ffffff)',
        borderRadius: '12px',
        border: '1px solid var(--border-light, #e2e8f0)',
        padding: '0.65rem 1rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          {/* Title & Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'var(--task-action)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)'
            }}>
              <CalendarCheck size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                  Smart Task Planner & Daily Scheduler
                </h2>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: 'var(--task-accent-bg)',
                  color: 'var(--task-accent)'
                }}>
                  IST (UTC+5:30)
                </span>
              </div>
              <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
                Time-blocked planning, Eisenhower prioritization, and team workload balancing
              </p>
            </div>
          </div>

          {/* Action Buttons: Backlog Drawer + Add Task + Refresh */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Backlog / Aggregated Drawer Button */}
            <button
              type="button"
              onClick={() => {
                setShowBacklog(!showBacklog);
                if (!showBacklog) loadBacklog();
              }}
              style={{
                padding: '0.42rem 0.8rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                background: showBacklog ? 'var(--task-info-bg)' : 'var(--bg-surface, #ffffff)',
                color: showBacklog ? 'var(--task-info)' : 'var(--text-primary, #1e293b)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}
            >
              <Inbox size={14} />
              <span>Backlog Inbox</span>
              {totalBacklogCount > 0 && (
                <span style={{
                  padding: '1px 5px',
                  borderRadius: '10px',
                  background: 'var(--task-action-danger)',
                  color: '#ffffff',
                  fontSize: '0.68rem',
                  fontWeight: 700
                }}>
                  {totalBacklogCount}
                </span>
              )}
            </button>

            {/* Live Sync Status Indicator (LocalDB & Delta Sync) */}
            <div
              title={syncStatus === 'offline' ? 'Operating in offline mode (LocalDB active)' : `Delta synced at ${lastSyncTime || 'just now'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.74rem',
                fontWeight: 600,
                padding: '0.32rem 0.65rem',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: syncStatus === 'offline'
                  ? 'var(--task-warning-border, #fde68a)'
                  : syncStatus === 'syncing'
                    ? 'var(--task-accent-border, #c7d2fe)'
                    : 'var(--task-success-border, #a7f3d0)',
                background: syncStatus === 'offline'
                  ? 'var(--task-warning-bg, #fffbeb)'
                  : syncStatus === 'syncing'
                    ? 'var(--task-accent-bg, #eef2ff)'
                    : 'var(--task-success-bg, #ecfdf5)',
                color: syncStatus === 'offline'
                  ? 'var(--task-warning, #b45309)'
                  : syncStatus === 'syncing'
                    ? 'var(--task-accent, #6366f1)'
                    : 'var(--task-success, #047857)',
                transition: 'all 0.2s ease'
              }}
            >
              {syncStatus === 'syncing' ? (
                <>
                  <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Syncing...</span>
                </>
              ) : syncStatus === 'offline' ? (
                <>
                  <WifiOff size={12} />
                  <span>Offline (LocalDB)</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={13} />
                  <span>Synced {lastSyncTime ? `(${lastSyncTime})` : ''}</span>
                </>
              )}
            </div>

            {/* Refresh / Force Delta Sync Button */}
            <button
              type="button"
              onClick={() => { setRefreshing(true); loadTasks(true); }}
              disabled={refreshing}
              title="Force Delta Sync & Refresh"
              style={{
                padding: '0.45rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                background: 'transparent',
                color: 'var(--text-secondary, #64748b)',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>

            {/* + Add New Task Button */}
            <button
              type="button"
              onClick={() => {
                setTaskToEdit(null);
                setModalInitialSlot('');
                setIsModalOpen(true);
              }}
              style={{
                padding: '0.42rem 0.95rem',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--task-action)',
                color: '#ffffff',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 2px 6px rgba(99, 102, 241, 0.25)'
              }}
            >
              <Plus size={15} /> Schedule Task
            </button>
          </div>
        </div>
      </div>

      {/* Enterprise B2B SaaS Segmented Sub-Tab Navigation (WhatsApp Official Style via CRMTabs) */}
      <div style={{ marginBottom: 0 }} className="task-planner-tabs-wrap">
        <style>{`
          .task-planner-tabs-wrap [role="tablist"] {
            margin-bottom: 0 !important;
          }
        `}</style>
        <CRMTabs
          id="task-planner-tabs"
          label="Task Planner Views"
          items={plannerTabs}
          value={activeTab}
          onChange={handleTabChange}
        />
      </div>

      {/* Date Navigator & Filters Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.45rem',
        padding: '0.35rem 0.75rem',
        borderRadius: '10px',
        background: 'var(--bg-surface, #ffffff)',
        border: '1px solid var(--border-light, #e2e8f0)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        marginBottom: '0'
      }}>
        {/* Left: Day Stepper (< >) and Quick Date Presets Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handlePrevDay}
            title="Previous Day"
            style={{
              padding: '0.3rem',
              borderRadius: '6px',
              border: '1px solid var(--border-light, #cbd5e1)',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-secondary, #475569)',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <ChevronLeft size={15} />
          </button>

          <button
            type="button"
            onClick={handleNextDay}
            title="Next Day"
            style={{
              padding: '0.3rem',
              borderRadius: '6px',
              border: '1px solid var(--border-light, #cbd5e1)',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-secondary, #475569)',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <ChevronRight size={15} />
          </button>

          {/* Standard CRM Quick Date Presets Component */}
          <DateRangePicker
            preset={datePreset}
            startDate={startDate}
            endDate={endDate}
            allowAllTime={true}
            title="Filter Tasks by Date Preset (IST)"
            onChange={handleDatePresetChange}
            style={{
              padding: '0.3rem 0.65rem',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderRadius: '6px'
            }}
          />
        </div>

        {/* Right: Search Bar & Requester Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end' }}>
          {/* Realtime Search Bar */}
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            minWidth: '200px',
            maxWidth: '320px',
            flex: '1 1 auto'
          }}>
            <Search size={14} style={{
              position: 'absolute',
              left: '0.6rem',
              color: 'var(--text-secondary, #94a3b8)',
              pointerEvents: 'none'
            }} />
            <input
              type="text"
              placeholder="Search tasks, requester, slot..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.32rem 1.7rem 0.32rem 1.85rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light, #cbd5e1)',
                background: 'var(--bg-surface, #ffffff)',
                fontSize: '0.78rem',
                fontWeight: 500,
                color: 'var(--text-primary, #1e293b)',
                outline: 'none',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                title="Clear search"
                style={{
                  position: 'absolute',
                  right: '0.4rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text-secondary, #94a3b8)'
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Requester Filter */}
          <select
            value={requesterFilter}
            onChange={(e) => setRequesterFilter(e.target.value)}
            title="Filter by Task Initiator"
            style={{
              padding: '0.32rem 0.65rem',
              borderRadius: '6px',
              border: '1px solid var(--border-light, #cbd5e1)',
              background: requesterFilter !== 'ALL' ? 'var(--task-success-bg, #ecfdf5)' : 'var(--bg-surface, #ffffff)',
              color: requesterFilter !== 'ALL' ? 'var(--task-success, #047857)' : 'var(--text-primary, #1e293b)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="ALL">👤 All Tasks</option>
            <option value="SELF">🙋 My Own Tasks</option>
            <option value="OTHERS">👥 Given By Others (Inward)</option>
          </select>
        </div>
      </div>

      {/* KPI Productivity Summary Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '0.45rem'
      }}>
        {/* Total Planned */}
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: '0.55rem 0.85rem',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)', fontWeight: 500 }}>
            Planned Tasks
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.1rem' }}>
            {kpis.total} <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-secondary)' }}>({kpis.totalEstHours} hrs)</span>
          </div>
        </div>

        {/* Completed */}
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: '0.55rem 0.85rem',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--task-success)', fontWeight: 500 }}>
            Completed
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--task-success)', marginTop: '0.1rem' }}>
            {kpis.completed}
          </div>
        </div>

        {/* In Progress */}
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: '0.55rem 0.85rem',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--task-warning)', fontWeight: 500 }}>
            In Progress
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--task-warning)', marginTop: '0.1rem' }}>
            {kpis.inProgress}
          </div>
        </div>

        {/* Carried Forward */}
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: '0.55rem 0.85rem',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--task-violet)', fontWeight: 500 }}>
            Carried Forward
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--task-violet)', marginTop: '0.1rem' }}>
            {kpis.carried}
          </div>
        </div>

        {/* Productivity Score */}
        <div style={{
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '10px',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: '0.55rem 0.85rem',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--task-accent)', fontWeight: 600 }}>
            <span>Achieved Score</span>
            <span>{kpis.score}%</span>
          </div>
          <div style={{ height: '6px', background: 'var(--task-accent-bg)', borderRadius: '3px', overflow: 'hidden', marginTop: '0.4rem' }}>
            <div style={{
              height: '100%',
              width: `${kpis.score}%`,
              background: kpis.score >= 80 ? 'var(--task-success)' : (kpis.score >= 50 ? 'var(--task-info)' : 'var(--task-warning)'),
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      </div>

      {/* Main Content Layout (Views + Collapsible Backlog Drawer) */}
      <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
        {/* Views Canvas */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary, #64748b)' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.5rem' }} />
              <div>Loading planned schedule...</div>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <TaskPlannerDashboardView
                  tasks={filteredTasks}
                  dateLabel={datePreset === 'all' ? 'All Time' : (startDate && endDate && startDate !== endDate ? `${startDate} to ${endDate}` : currentDate)}
                  onTabChange={handleTabChange}
                  onRefresh={() => loadTasks(true)}
                />
              )}

              {activeTab === 'day' && (
                <DayTimeBlockView
                  tasks={filteredTasks}
                  currentDate={currentDate}
                  onStatusChange={handleStatusChange}
                  onCarryForward={handleCarryForward}
                  onEditTask={(t) => { setTaskToEdit(t); setIsModalOpen(true); }}
                  onDeleteTask={handleDeleteTask}
                  onAddSlotTask={(slot) => { setTaskToEdit(null); setModalInitialSlot(slot); setIsModalOpen(true); }}
                  onUpdateActualTime={handleUpdateActualTime}
                />
              )}

              {activeTab === 'week' && (
                <CalendarMatrixView
                  tasks={filteredTasks}
                  currentDate={currentDate}
                  onSelectDate={(d) => { setCurrentDate(d); setStartDate(d); setEndDate(d); setDatePreset('custom'); handleTabChange('day'); }}
                  onAddTaskOnDate={(d) => { setCurrentDate(d); setStartDate(d); setEndDate(d); setTaskToEdit(null); setIsModalOpen(true); }}
                  onStatusChange={handleStatusChange}
                />
              )}

              {activeTab === 'kanban' && (
                <KanbanPlannerView
                  tasks={filteredTasks}
                  onStatusChange={handleStatusChange}
                  onCarryForward={handleCarryForward}
                  onEditTask={(t) => { setTaskToEdit(t); setIsModalOpen(true); }}
                  onDeleteTask={handleDeleteTask}
                  onAddTask={() => { setTaskToEdit(null); setIsModalOpen(true); }}
                />
              )}

              {activeTab === 'table' && (
                <TaskPlannerTableView
                  tasks={filteredTasks}
                  onStatusChange={handleStatusChange}
                  onCarryForward={handleCarryForward}
                  onEditTask={(t) => { setTaskToEdit(t); setIsModalOpen(true); }}
                  onDeleteTask={handleDeleteTask}
                />
              )}

              {activeTab === 'trash' && (
                <DeletedTasksView
                  deletedTasks={deletedTasks}
                  loading={loadingDeleted}
                  onRestoreTask={handleRestoreTask}
                  onPermanentDeleteTask={handlePermanentDeleteTask}
                  onRefresh={loadDeletedTasks}
                />
              )}
            </>
          )}
        </div>

        {/* Collapsible Backlog Sidebar Drawer */}
        {showBacklog && (
          <div style={{
            width: '340px',
            flexShrink: 0,
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: '14px',
            border: '1px solid var(--border-light, #e2e8f0)',
            padding: '1.25rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            maxHeight: 'calc(100vh - 220px)',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Inbox size={18} style={{ color: 'var(--task-info)' }} />
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Backlog & External Tasks</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowBacklog(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            {loadingBacklog ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Scanning delegations & checklists...
              </div>
            ) : (
              <>
                {/* Pending Delegations */}
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary, #475569)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>🎯 Delegations To Me</span>
                    <span>({backlogSources.delegations.length})</span>
                  </div>

                  {backlogSources.delegations.length === 0 ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.35rem 0' }}>
                      No pending delegated tasks
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {backlogSources.delegations.map(del => (
                        <div
                          key={del.id}
                          style={{
                            padding: '0.65rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-page)',
                            fontSize: '0.78rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.3rem'
                          }}
                        >
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{del.title}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            By: {del.delegated_by_name} • Due: {new Date(del.deadline).toLocaleDateString('en-IN')}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleImportDelegation(del)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px solid var(--task-info-border)',
                              background: 'var(--task-info-bg)',
                              color: 'var(--task-info)',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.25rem',
                              marginTop: '0.2rem'
                            }}
                          >
                            <Plus size={11} /> Plan for Today
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Checklists */}
                <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary, #475569)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>📋 Daily Checklists</span>
                    <span>({backlogSources.checklists.length})</span>
                  </div>

                  {backlogSources.checklists.length === 0 ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.35rem 0' }}>
                      No checklists assigned
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {backlogSources.checklists.map(chk => (
                        <div
                          key={chk.id}
                          style={{
                            padding: '0.65rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-page)',
                            fontSize: '0.78rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.3rem'
                          }}
                        >
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{chk.title}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            Frequency: {chk.frequency} • Due: {chk.due_time || '18:00'}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleImportChecklist(chk)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px solid var(--task-success-border)',
                              background: 'var(--task-success-bg)',
                              color: 'var(--task-success)',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.25rem',
                              marginTop: '0.2rem'
                            }}
                          >
                            <Plus size={11} /> Schedule Checklist
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Quick Task Creation & Edit Modal */}
      <QuickTaskModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setTaskToEdit(null); }}
        onSave={handleSaveTask}
        taskToEdit={taskToEdit}
        initialDate={currentDate}
        initialSlot={modalInitialSlot}
        employeeName={userName}
        employeeEmail={userEmail}
        tenantId={effectiveTenantId}
        userCompany={userCompany}
      />

      {/* Centered Modern Task Delete Confirmation Modal */}
      {taskToDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            padding: '1rem'
          }}
          onClick={() => !isDeleting && setTaskToDelete(null)}
        >
          <div
            style={{
              background: 'var(--bg-surface, #ffffff)',
              color: 'var(--text-primary, #1e293b)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '430px',
              padding: '1.5rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--border-light, #e2e8f0)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Danger Warning Badge */}
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'var(--task-danger-bg, #fee2e2)',
              color: 'var(--task-danger, #dc2626)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <Trash2 size={24} />
            </div>

            <h3 style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              margin: '0 0 0.4rem 0',
              color: 'var(--text-primary, #1e293b)'
            }}>
              Remove Planned Task?
            </h3>

            <p style={{
              fontSize: '0.84rem',
              color: 'var(--text-secondary, #64748b)',
              margin: '0 0 1rem 0',
              lineHeight: 1.45
            }}>
              Are you sure you want to remove this task from your schedule? This action cannot be undone.
            </p>

            {/* Task Title Preview Card */}
            {taskToDelete.title && (
              <div style={{
                width: '100%',
                background: 'var(--bg-subtle, #f8fafc)',
                border: '1px solid var(--border-light, #e2e8f0)',
                borderRadius: '8px',
                padding: '0.65rem 0.85rem',
                marginBottom: '1.25rem',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-primary, #1e293b)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {taskToDelete.title}
                </span>
              </div>
            )}

            {/* Action Buttons: Cancel & Delete */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '0.65rem',
              width: '100%'
            }}>
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                disabled={isDeleting}
                style={{
                  flex: 1,
                  padding: '0.55rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  background: 'var(--bg-surface, #ffffff)',
                  color: 'var(--text-primary, #334155)',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: isDeleting ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                style={{
                  flex: 1,
                  padding: '0.55rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--task-action-danger, #dc2626)',
                  color: '#ffffff',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 2px 4px rgba(220, 38, 38, 0.25)'
                }}
              >
                {isDeleting ? (
                  <>
                    <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    Delete Task
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helpers for Week Matrix calculation
function getWeekStartDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00+05:30');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function getWeekEndDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00+05:30');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) + 6;
  const sunday = new Date(d.setDate(diff));
  return sunday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
