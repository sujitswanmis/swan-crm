'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock, Calendar, AlertTriangle, CheckCircle2, AlertCircle, Plus,
  Search, Filter, RefreshCw, User, Users, ArrowRight, MessageSquare,
  Star, Check, X, ShieldCheck, ChevronRight, Send, CheckSquare,
  FileText, ExternalLink, Flame, Sparkles, Award, CornerDownRight, RotateCcw,
  BarChart3, TrendingUp, Layers, Eye, Activity, CheckCircle
} from 'lucide-react';
import {
  createDelegationTask,
  getDelegatedTasks,
  updateTaskStatus,
  verifyAndCompleteTask,
  reopenTask,
  addTaskComment,
  getTaskActivities,
  getDelegationAnalytics
} from '@/app/actions/delegationTask';
import { getEmployeesMaster } from '@/app/actions/employee';
import SearchableEmployeeSelect from '@/components/common/SearchableEmployeeSelect';

const PRIORITY_CONFIG = {
  URGENT: { label: 'Urgent', color: '#ef4444', bg: '#fee2e2', icon: '🔥' },
  HIGH: { label: 'High', color: '#f97316', bg: '#ffedd5', icon: '⚡' },
  MEDIUM: { label: 'Medium', color: '#3b82f6', bg: '#dbeafe', icon: '📌' },
  LOW: { label: 'Low', color: '#64748b', bg: '#f1f5f9', icon: '☕' }
};

const CATEGORIES = [
  'OPERATIONS',
  'SALES & CRM',
  'ACCOUNTS & FINANCE',
  'HUMAN RESOURCE',
  'TECHNICAL & IT',
  'ADMINISTRATION',
  'CUSTOMER SUPPORT',
  'OTHER'
];

export default function DelegationTaskModule({
  userRole = 'agent',
  userId = '',
  userName = 'Employee',
  userEmail = '',
  moduleAccess = {},
  initialSubTab = 'dashboard',
  onSubTabChange = null
}) {
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
  const isManager = isAdmin || userRole === 'manager' || userRole === 'hod' || moduleAccess?.delegation?.is_manager === true;
  const canAccessToMe = moduleAccess?.delegation?.sub_items?.to_me?.view !== false;
  const canAccessByMe = moduleAccess?.delegation?.sub_items?.by_me?.view !== false;

  // Tabs: 'dashboard' (Delegation Dashboard) | 'to_me' (Delegated To Me) | 'by_me' (Delegated By Me) | 'all' (Team Board)
  const [activeTab, setActiveTab] = useState(initialSubTab || 'dashboard');
  const [tasks, setTasks] = useState([]);
  const [allDashboardTasks, setAllDashboardTasks] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [employeesList, setEmployeesList] = useState([]);
  const [teamBoardFilter, setTeamBoardFilter] = useState('MY_TEAM'); // 'MY_TEAM' | 'ALL'

  // Dashboard specific filters
  const [dashboardScope, setDashboardScope] = useState(isAdmin ? 'COMPANY_WIDE' : 'MY_DELEGATIONS');
  const [dashboardTimeRange, setDashboardTimeRange] = useState('this_month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [dashboardDept, setDashboardDept] = useState('ALL');
  const [dashboardCategory, setDashboardCategory] = useState('ALL');
  const [leaderboardSearch, setLeaderboardSearch] = useState('');
  const [leaderboardTier, setLeaderboardTier] = useState('ALL'); // 'ALL' | 'STAR' | 'RELIABLE' | 'AT_RISK'

  useEffect(() => {
    if (initialSubTab && initialSubTab !== activeTab) {
      setActiveTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleTabChange = (t) => {
    setActiveTab(t);
    if (onSubTabChange) {
      onSubTabChange(t);
    }
  };

  // Detect Subordinates who report to logged-in user as Primary, Secondary, or HOD
  const myReportingTeam = useMemo(() => {
    const emailLow = (userEmail || '').toLowerCase().trim();
    const nameLow = (userName || '').toLowerCase().trim();
    if (!emailLow && !nameLow) return [];
    return (employeesList || []).filter(e => {
      const p = (e.primary_reporting_person || '').toLowerCase().trim();
      const s = (e.secondary_reporting_person || '').toLowerCase().trim();
      const h = (e.hod_person || '').toLowerCase().trim();
      return (p && (p === emailLow || p === nameLow || (emailLow && emailLow.includes(p)))) ||
             (s && (s === emailLow || s === nameLow || (emailLow && emailLow.includes(s)))) ||
             (h && (h === emailLow || h === nameLow || (emailLow && emailLow.includes(h))));
    });
  }, [employeesList, userEmail, userName]);

  const isReportingManager = myReportingTeam.length > 0;
  const canAccessTeamBoard = isManager || isReportingManager || moduleAccess?.delegation?.sub_items?.all?.view === true;

  // Notifications
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Modals & Drawers
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    category: 'OPERATIONS',
    assigned_to_email: '',
    assigned_to_name: '',
    assigned_to_department: 'General',
    deadlineDate: '',
    deadlineTime: '18:00',
    subtasks: [{ id: 'st_1', title: '', completed: false }]
  });

  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submittingTask, setSubmittingTask] = useState(null);
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [submissionProof, setSubmissionProof] = useState('');

  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyingTask, setVerifyingTask] = useState(null);
  const [rating, setRating] = useState(5);
  const [feedbackRemarks, setFeedbackRemarks] = useState('');
  const [reopenDeadlineDate, setReopenDeadlineDate] = useState('');
  const [reopenDeadlineTime, setReopenDeadlineTime] = useState('18:00');

  const [drawerTask, setDrawerTask] = useState(null);
  const [activities, setActivities] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  useEffect(() => {
    loadEmployees();
    // Default deadline to tomorrow 6 PM
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    setCreateForm(prev => ({ ...prev, deadlineDate: `${yyyy}-${mm}-${dd}` }));
  }, []);

  useEffect(() => {
    loadTasks();
    loadAnalytics();
  }, [activeTab, teamBoardFilter, statusFilter, priorityFilter, searchQuery, userEmail, myReportingTeam.length]);

  const showNotification = (msg, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 4000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  };

  const loadEmployees = async () => {
    try {
      const emps = await getEmployeesMaster();
      setEmployeesList(Array.isArray(emps) ? emps : []);
    } catch (e) {
      console.warn('Could not load employees master:', e.message);
    }
  };

  const loadTasks = async () => {
    setLoading(true);
    try {
      const teamEmails = myReportingTeam.map(e => e.email).filter(Boolean);
      const isTeamView = activeTab === 'all' && (teamBoardFilter === 'MY_TEAM' || !isAdmin);

      if (activeTab === 'dashboard' || allDashboardTasks.length === 0) {
        const resDash = await getDelegatedTasks({
          userEmail,
          viewType: 'all',
          teamMemberEmails: teamEmails,
          status: 'ALL',
          priority: 'ALL',
          search: ''
        });
        if (resDash.success) {
          setAllDashboardTasks(resDash.data || []);
        }
      }

      const res = await getDelegatedTasks({
        userEmail,
        viewType: isTeamView && teamEmails.length > 0 ? 'team' : (activeTab === 'dashboard' ? 'all' : activeTab),
        teamMemberEmails: teamEmails,
        status: statusFilter,
        priority: priorityFilter,
        search: searchQuery
      });
      if (res.success) {
        setTasks(res.data || []);
      }
    } catch (e) {
      console.error(e);
      showNotification('Failed to load tasks', true);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const res = await getDelegationAnalytics(userEmail);
      if (res.success) {
        setAnalytics(res.stats);
      }
    } catch (e) {
      console.warn(e);
    }
  };

  // Distinct departments extracted from employees & tasks
  const availableDepartments = useMemo(() => {
    const set = new Set([
      'General', 'Operations', 'Sales & CRM', 'Accounts & Finance',
      'Human Resource', 'Technical & IT', 'Administration', 'Customer Support'
    ]);
    (employeesList || []).forEach(e => { if (e.department) set.add(e.department); });
    (allDashboardTasks || []).forEach(t => { if (t.assigned_to_department) set.add(t.assigned_to_department); });
    return Array.from(set).sort();
  }, [employeesList, allDashboardTasks]);

  // Executive Dashboard Analytics Calculation
  const dashboardAnalytics = useMemo(() => {
    const rawTasks = allDashboardTasks.length > 0 ? allDashboardTasks : tasks;
    let baseTasks = [...rawTasks];
    const emailLow = (userEmail || '').toLowerCase().trim();
    const teamEmails = myReportingTeam.map(e => (e.email || '').toLowerCase().trim()).filter(Boolean);

    // 1. Scope Filter
    if (dashboardScope === 'MY_DELEGATIONS') {
      baseTasks = baseTasks.filter(t => 
        (t.assigned_to_email || '').toLowerCase() === emailLow || 
        (t.delegated_by_email || '').toLowerCase() === emailLow
      );
    } else if (dashboardScope === 'MY_TEAM') {
      baseTasks = baseTasks.filter(t => 
        teamEmails.includes((t.assigned_to_email || '').toLowerCase()) ||
        teamEmails.includes((t.delegated_by_email || '').toLowerCase()) ||
        (t.assigned_to_email || '').toLowerCase() === emailLow ||
        (t.delegated_by_email || '').toLowerCase() === emailLow
      );
    }

    // 2. Date Range Filter
    const now = new Date();
    if (dashboardTimeRange === 'today') {
      const todayStr = now.toISOString().slice(0, 10);
      baseTasks = baseTasks.filter(t => (t.created_at || '').slice(0, 10) === todayStr || (t.deadline || '').slice(0, 10) === todayStr);
    } else if (dashboardTimeRange === 'yesterday') {
      const yest = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const yestStr = yest.toISOString().slice(0, 10);
      baseTasks = baseTasks.filter(t => (t.created_at || '').slice(0, 10) === yestStr || (t.deadline || '').slice(0, 10) === yestStr);
    } else if (dashboardTimeRange === 'this_week') {
      const startOfWeek = new Date(now);
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);
      baseTasks = baseTasks.filter(t => new Date(t.created_at || t.deadline) >= startOfWeek);
    } else if (dashboardTimeRange === 'this_month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      baseTasks = baseTasks.filter(t => new Date(t.created_at || t.deadline) >= startOfMonth);
    } else if (dashboardTimeRange === 'last_30_days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      baseTasks = baseTasks.filter(t => new Date(t.created_at || t.deadline) >= thirtyDaysAgo);
    } else if (dashboardTimeRange === 'custom' && customStartDate && customEndDate) {
      const s = new Date(`${customStartDate}T00:00:00`);
      const e = new Date(`${customEndDate}T23:59:59`);
      baseTasks = baseTasks.filter(t => {
        const d = new Date(t.created_at || t.deadline);
        return d >= s && d <= e;
      });
    }

    // 3. Department & Category Filter
    if (dashboardDept !== 'ALL') {
      baseTasks = baseTasks.filter(t => (t.assigned_to_department || 'General') === dashboardDept);
    }
    if (dashboardCategory !== 'ALL') {
      baseTasks = baseTasks.filter(t => (t.category || 'OPERATIONS') === dashboardCategory);
    }

    // 4. Core KPI Totals
    const totalTasks = baseTasks.length;
    const pending = baseTasks.filter(t => t.status === 'PENDING').length;
    const inProgress = baseTasks.filter(t => t.status === 'IN_PROGRESS').length;
    const submitted = baseTasks.filter(t => t.status === 'SUBMITTED').length;
    const completed = baseTasks.filter(t => t.status === 'COMPLETED').length;
    const reopened = baseTasks.filter(t => t.status === 'REOPENED').length;
    const cancelled = baseTasks.filter(t => t.status === 'CANCELLED').length;

    // Overdue Active Tasks
    const overdueActive = baseTasks.filter(t => 
      !['COMPLETED', 'CANCELLED'].includes(t.status) && new Date(t.deadline) < now
    ).length;

    // On-Time vs Late Completion
    const completedOnTime = baseTasks.filter(t => 
      t.status === 'COMPLETED' && (!t.completed_at || new Date(t.completed_at) <= new Date(t.deadline))
    ).length;
    const completedLate = baseTasks.filter(t => 
      t.status === 'COMPLETED' && (t.completed_at && new Date(t.completed_at) > new Date(t.deadline))
    ).length;

    // Overall Completion Score %
    const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 100;
    const onTimeRate = completed > 0 ? Math.round((completedOnTime / completed) * 100) : 100;

    // Quality Ratings
    const ratedTasks = baseTasks.filter(t => t.status === 'COMPLETED' && t.rating > 0);
    const avgRating = ratedTasks.length > 0 
      ? (ratedTasks.reduce((acc, t) => acc + (t.rating || 5), 0) / ratedTasks.length).toFixed(1) 
      : '5.0';

    // Priority Distribution
    const priorityStats = {
      URGENT: { total: 0, completed: 0, overdue: 0, inProgress: 0 },
      HIGH: { total: 0, completed: 0, overdue: 0, inProgress: 0 },
      MEDIUM: { total: 0, completed: 0, overdue: 0, inProgress: 0 },
      LOW: { total: 0, completed: 0, overdue: 0, inProgress: 0 }
    };
    baseTasks.forEach(t => {
      const p = t.priority || 'MEDIUM';
      if (priorityStats[p]) {
        priorityStats[p].total++;
        if (t.status === 'COMPLETED') priorityStats[p].completed++;
        if (t.status === 'IN_PROGRESS') priorityStats[p].inProgress++;
        if (!['COMPLETED', 'CANCELLED'].includes(t.status) && new Date(t.deadline) < now) {
          priorityStats[p].overdue++;
        }
      }
    });

    // Category Distribution
    const categoryMap = {};
    baseTasks.forEach(t => {
      const c = t.category || 'OPERATIONS';
      if (!categoryMap[c]) categoryMap[c] = { total: 0, completed: 0, overdue: 0 };
      categoryMap[c].total++;
      if (t.status === 'COMPLETED') categoryMap[c].completed++;
      if (!['COMPLETED', 'CANCELLED'].includes(t.status) && new Date(t.deadline) < now) {
        categoryMap[c].overdue++;
      }
    });

    // Employee Leaderboard & Accountability Table
    const empMap = {};
    baseTasks.forEach(t => {
      const email = (t.assigned_to_email || '').toLowerCase().trim();
      const name = t.assigned_to_name || 'Staff';
      const dept = t.assigned_to_department || 'General';
      if (!email) return;

      if (!empMap[email]) {
        empMap[email] = {
          email,
          name,
          department: dept,
          assignedTotal: 0,
          completed: 0,
          completedOnTime: 0,
          completedLate: 0,
          inProgress: 0,
          submitted: 0,
          overdue: 0,
          ratings: []
        };
      }
      empMap[email].assignedTotal++;
      if (t.status === 'COMPLETED') {
        empMap[email].completed++;
        if (!t.completed_at || new Date(t.completed_at) <= new Date(t.deadline)) {
          empMap[email].completedOnTime++;
        } else {
          empMap[email].completedLate++;
        }
        if (t.rating > 0) empMap[email].ratings.push(t.rating);
      } else if (t.status === 'IN_PROGRESS') {
        empMap[email].inProgress++;
      } else if (t.status === 'SUBMITTED') {
        empMap[email].submitted++;
      }
      if (!['COMPLETED', 'CANCELLED'].includes(t.status) && new Date(t.deadline) < now) {
        empMap[email].overdue++;
      }
    });

    // Populate active employees from master
    (employeesList || []).forEach(emp => {
      const email = (emp.email || '').toLowerCase().trim();
      if (email && !empMap[email]) {
        if (dashboardScope === 'COMPANY_WIDE' || (dashboardScope === 'MY_TEAM' && teamEmails.includes(email))) {
          empMap[email] = {
            email,
            name: emp.name || emp.full_name || 'Staff',
            department: emp.department || 'General',
            assignedTotal: 0,
            completed: 0,
            completedOnTime: 0,
            completedLate: 0,
            inProgress: 0,
            submitted: 0,
            overdue: 0,
            ratings: []
          };
        }
      }
    });

    const leaderboard = Object.values(empMap).map(e => {
      const rate = e.assignedTotal > 0 ? Math.round((e.completed / e.assignedTotal) * 100) : 100;
      const onTimePct = e.completed > 0 ? Math.round((e.completedOnTime / e.completed) * 100) : 100;
      const avg = e.ratings.length > 0 
        ? (e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length).toFixed(1) 
        : (e.assignedTotal === 0 ? '-' : '5.0');

      let badge = 'STAR';
      if (e.assignedTotal > 0) {
        if (rate >= 90) badge = 'STAR';
        else if (rate >= 75) badge = 'RELIABLE';
        else badge = 'AT_RISK';
      }
      return {
        ...e,
        completionRate: rate,
        onTimeRate: onTimePct,
        avgRating: avg,
        badge
      };
    }).sort((a, b) => {
      if (b.completionRate !== a.completionRate) return b.completionRate - a.completionRate;
      return b.assignedTotal - a.assignedTotal;
    });

    // Critical Overdue & Urgent Action Items
    const criticalTasks = baseTasks.filter(t => 
      !['COMPLETED', 'CANCELLED'].includes(t.status) && 
      (new Date(t.deadline) < now || t.priority === 'URGENT' || t.priority === 'HIGH')
    ).sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).slice(0, 8);

    // Recent Submissions Waiting Review
    const pendingVerifications = baseTasks.filter(t => t.status === 'SUBMITTED').slice(0, 6);

    return {
      filteredTasks: baseTasks,
      totalTasks,
      pending,
      inProgress,
      submitted,
      completed,
      completedOnTime,
      completedLate,
      overdueActive,
      reopened,
      cancelled,
      completionRate,
      onTimeRate,
      avgRating,
      ratedTasksCount: ratedTasks.length,
      priorityStats,
      categoryMap,
      leaderboard,
      criticalTasks,
      pendingVerifications
    };
  }, [allDashboardTasks, tasks, dashboardScope, dashboardTimeRange, customStartDate, customEndDate, dashboardDept, dashboardCategory, userEmail, myReportingTeam, employeesList]);

  // ==========================================
  // CREATE TASK HANDLERS
  // ==========================================

  const handleOpenCreateModal = () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');

    setCreateForm({
      title: '',
      description: '',
      priority: 'MEDIUM',
      category: 'OPERATIONS',
      assigned_to_email: '',
      assigned_to_name: '',
      assigned_to_department: 'General',
      deadlineDate: `${yyyy}-${mm}-${dd}`,
      deadlineTime: '18:00',
      subtasks: [{ id: `st_${Date.now()}_1`, title: '', completed: false }]
    });
    setCreateModalOpen(true);
  };

  const handleAddSubtaskInput = () => {
    setCreateForm(prev => ({
      ...prev,
      subtasks: [...prev.subtasks, { id: `st_${Date.now()}_${prev.subtasks.length + 1}`, title: '', completed: false }]
    }));
  };

  const handleSubtaskChange = (idx, val) => {
    setCreateForm(prev => {
      const updated = [...prev.subtasks];
      updated[idx] = { ...updated[idx], title: val };
      return { ...prev, subtasks: updated };
    });
  };

  const handleRemoveSubtask = (idx) => {
    setCreateForm(prev => ({
      ...prev,
      subtasks: prev.subtasks.filter((_, i) => i !== idx)
    }));
  };

  const handleSaveNewTask = async () => {
    if (!createForm.title.trim()) {
      showNotification('Please enter task title', true);
      return;
    }
    if (!createForm.assigned_to_email) {
      showNotification('Please select an employee to delegate this task to', true);
      return;
    }
    if (!createForm.deadlineDate) {
      showNotification('Please set a deadline date', true);
      return;
    }

    const deadlineIso = new Date(`${createForm.deadlineDate}T${createForm.deadlineTime || '18:00'}:00`).toISOString();
    const cleanSubtasks = createForm.subtasks.filter(s => s.title && s.title.trim() !== '');

    try {
      const res = await createDelegationTask({
        title: createForm.title,
        description: createForm.description,
        priority: createForm.priority,
        category: createForm.category,
        delegated_by_name: userName || 'Delegator',
        delegated_by_email: userEmail,
        assigned_to_name: createForm.assigned_to_name || 'Assignee',
        assigned_to_email: createForm.assigned_to_email,
        assigned_to_department: createForm.assigned_to_department,
        deadline: deadlineIso,
        subtasks: cleanSubtasks
      });

      if (res.success) {
        showNotification(`✅ Task successfully delegated to ${createForm.assigned_to_name}!`);
        setCreateModalOpen(false);
        loadTasks();
        loadAnalytics();
      } else {
        showNotification(res.error || 'Failed to create task', true);
      }
    } catch (e) {
      showNotification(e.message, true);
    }
  };

  // ==========================================
  // STATUS & WORKFLOW HANDLERS
  // ==========================================

  const handleStartTask = async (task) => {
    try {
      const res = await updateTaskStatus({
        taskId: task.id,
        status: 'IN_PROGRESS',
        user: { name: userName, email: userEmail }
      });
      if (res.success) {
        showNotification('Task marked as In Progress');
        loadTasks();
        loadAnalytics();
      }
    } catch (e) {
      showNotification(e.message, true);
    }
  };

  const handleOpenSubmitModal = (task) => {
    setSubmittingTask(task);
    setSubmissionNotes(task.completion_notes || '');
    setSubmissionProof(task.completion_proof || '');
    setSubmitModalOpen(true);
  };

  const handleSubmitTaskForReview = async () => {
    if (!submittingTask) return;
    try {
      const res = await updateTaskStatus({
        taskId: submittingTask.id,
        status: 'SUBMITTED',
        completionNotes: submissionNotes,
        completionProof: submissionProof,
        user: { name: userName, email: userEmail }
      });

      if (res.success) {
        showNotification('✅ Task submitted for Delegator review!');
        setSubmitModalOpen(false);
        loadTasks();
        loadAnalytics();
      } else {
        showNotification(res.error || 'Failed to submit task', true);
      }
    } catch (e) {
      showNotification(e.message, true);
    }
  };

  const handleToggleSubtaskInList = async (task, subtaskId) => {
    const updatedSubtasks = (task.subtasks || []).map(st => {
      if (st.id === subtaskId) return { ...st, completed: !st.completed };
      return st;
    });

    try {
      await updateTaskStatus({
        taskId: task.id,
        status: task.status === 'PENDING' ? 'IN_PROGRESS' : task.status,
        subtasks: updatedSubtasks,
        user: { name: userName, email: userEmail }
      });
      loadTasks();
    } catch (e) {
      console.warn(e);
    }
  };

  // ==========================================
  // DELEGATOR VERIFICATION & REOPEN HANDLERS
  // ==========================================

  const handleOpenVerifyModal = (task) => {
    setVerifyingTask(task);
    setRating(5);
    setFeedbackRemarks('');
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    setReopenDeadlineDate(`${yyyy}-${mm}-${dd}`);
    setVerifyModalOpen(true);
  };

  const handleApproveTask = async () => {
    if (!verifyingTask) return;
    try {
      const res = await verifyAndCompleteTask({
        taskId: verifyingTask.id,
        rating,
        feedbackRemarks,
        user: { name: userName, email: userEmail }
      });

      if (res.success) {
        showNotification(`🎉 Task approved and closed with ${rating}★!`);
        setVerifyModalOpen(false);
        loadTasks();
        loadAnalytics();
      } else {
        showNotification(res.error || 'Failed to verify task', true);
      }
    } catch (e) {
      showNotification(e.message, true);
    }
  };

  const handleReopenTask = async () => {
    if (!verifyingTask) return;
    if (!feedbackRemarks.trim()) {
      showNotification('Please specify rework notes / reason for reopening', true);
      return;
    }

    let newDeadline = null;
    if (reopenDeadlineDate) {
      newDeadline = new Date(`${reopenDeadlineDate}T${reopenDeadlineTime || '18:00'}:00`).toISOString();
    }

    try {
      const res = await reopenTask({
        taskId: verifyingTask.id,
        remarks: feedbackRemarks,
        newDeadline,
        user: { name: userName, email: userEmail }
      });

      if (res.success) {
        showNotification('Task reopened with revision instructions');
        setVerifyModalOpen(false);
        loadTasks();
        loadAnalytics();
      } else {
        showNotification(res.error || 'Failed to reopen task', true);
      }
    } catch (e) {
      showNotification(e.message, true);
    }
  };

  // ==========================================
  // TASK ACTIVITY & DISCUSSION DRAWER
  // ==========================================

  const handleOpenDrawer = async (task) => {
    setDrawerTask(task);
    setActivities([]);
    try {
      const res = await getTaskActivities(task.id);
      if (res.success) {
        setActivities(res.data || []);
      }
    } catch (e) {
      console.warn(e);
    }
  };

  const handleSendComment = async () => {
    if (!drawerTask || !newComment.trim()) return;
    setSendingComment(true);
    try {
      const res = await addTaskComment({
        taskId: drawerTask.id,
        comment: newComment,
        user: { name: userName, email: userEmail }
      });

      if (res.success) {
        setNewComment('');
        const refreshed = await getTaskActivities(drawerTask.id);
        if (refreshed.success) setActivities(refreshed.data || []);
      }
    } catch (e) {
      showNotification(e.message, true);
    } finally {
      setSendingComment(false);
    }
  };

  // Helper for deadline countdown string
  const formatDeadlineBadge = (deadlineStr, status) => {
    if (['COMPLETED', 'CANCELLED'].includes(status)) {
      return { text: 'Closed', color: '#166534', bg: '#dcfce7', isLate: false };
    }

    const now = new Date();
    const deadline = new Date(deadlineStr);
    const diffMs = deadline - now;
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffMs < 0) {
      const absHours = Math.abs(diffHours);
      const absDays = Math.abs(diffDays);
      const lateText = absDays > 1 ? `${absDays} days late` : `${absHours} hrs late`;
      return { text: `⚠️ Overdue (${lateText})`, color: '#991b1b', bg: '#fee2e2', isLate: true };
    }

    if (diffHours <= 4) {
      return { text: `⏰ Due in ${diffHours} hrs`, color: '#92400e', bg: '#fef3c7', isLate: false };
    }

    if (diffDays <= 1) {
      return { text: '⚡ Due Tomorrow', color: '#1e40af', bg: '#dbeafe', isLate: false };
    }

    return {
      text: `📅 Due in ${diffDays} days (${deadline.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`,
      color: '#475569',
      bg: '#f1f5f9',
      isLate: false
    };
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%', overflowY: 'auto' }}>
      
      {/* Toast Alert */}
      {successMsg && (
        <div style={{ padding: '0.75rem 1.25rem', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div style={{ padding: '0.75rem 1.25rem', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
        color: '#ffffff',
        padding: '1.5rem 2rem',
        borderRadius: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.75rem' }}>🤝</span>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Employee-to-Employee Task Delegation</h1>
          </div>
          <p style={{ margin: 0, opacity: 0.85, fontSize: '0.9rem' }}>
            Assign, track, and complete high-priority tasks with strict deadline governance & quality sign-off
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleOpenCreateModal}
            style={{
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              padding: '0.65rem 1.3rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(59,130,246,0.4)'
            }}
          >
            <Plus size={18} /> Assign New Task
          </button>
          <button
            onClick={() => { loadTasks(); loadAnalytics(); }}
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: 'none',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => handleTabChange('dashboard')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.6rem 1.2rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            cursor: 'pointer',
            borderBottom: activeTab === 'dashboard' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'dashboard' ? '#3b82f6' : 'var(--text-secondary, #64748b)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <BarChart3 size={18} />
          <span>📊 Delegation Dashboard</span>
        </button>

        <button
          onClick={() => handleTabChange('to_me')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.6rem 1.2rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            cursor: 'pointer',
            borderBottom: activeTab === 'to_me' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'to_me' ? '#3b82f6' : 'var(--text-secondary, #64748b)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span>📥 Tasks Delegated To Me</span>
        </button>

        <button
          onClick={() => handleTabChange('by_me')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.6rem 1.2rem',
            fontWeight: 600,
            fontSize: '0.95rem',
            cursor: 'pointer',
            borderBottom: activeTab === 'by_me' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'by_me' ? '#3b82f6' : 'var(--text-secondary, #64748b)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span>📤 Tasks Delegated By Me</span>
        </button>

        {canAccessTeamBoard && (
          <button
            onClick={() => handleTabChange('all')}
            style={{
              background: 'none',
              border: 'none',
              padding: '0.6rem 1.2rem',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              borderBottom: activeTab === 'all' ? '3px solid #3b82f6' : '3px solid transparent',
              color: activeTab === 'all' ? '#3b82f6' : 'var(--text-secondary, #64748b)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Users size={18} /> Company Task Board
          </button>
        )}
      </div>

      {/* ==================================================== */}
      {/* 📊 DELEGATION DASHBOARD VIEW                        */}
      {/* ==================================================== */}
      {activeTab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Dashboard Control Bar (Scope & Date Filters) */}
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: '12px',
            padding: '1rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
          }}>
            {/* Scope Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>
                View Scope:
              </span>
              <div style={{ display: 'flex', background: '#f1f5f9', padding: '0.2rem', borderRadius: '8px' }}>
                <button
                  onClick={() => setDashboardScope('MY_DELEGATIONS')}
                  style={{
                    border: 'none',
                    padding: '0.4rem 0.85rem',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: dashboardScope === 'MY_DELEGATIONS' ? '#ffffff' : 'transparent',
                    color: dashboardScope === 'MY_DELEGATIONS' ? '#1e293b' : '#64748b',
                    boxShadow: dashboardScope === 'MY_DELEGATIONS' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  👤 My Delegations
                </button>
                {(isReportingManager || isManager) && (
                  <button
                    onClick={() => setDashboardScope('MY_TEAM')}
                    style={{
                      border: 'none',
                      padding: '0.4rem 0.85rem',
                      borderRadius: '6px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: dashboardScope === 'MY_TEAM' ? '#ffffff' : 'transparent',
                      color: dashboardScope === 'MY_TEAM' ? '#1e293b' : '#64748b',
                      boxShadow: dashboardScope === 'MY_TEAM' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    👥 My Team ({myReportingTeam.length})
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => setDashboardScope('COMPANY_WIDE')}
                    style={{
                      border: 'none',
                      padding: '0.4rem 0.85rem',
                      borderRadius: '6px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: dashboardScope === 'COMPANY_WIDE' ? '#ffffff' : 'transparent',
                      color: dashboardScope === 'COMPANY_WIDE' ? '#1e293b' : '#64748b',
                      boxShadow: dashboardScope === 'COMPANY_WIDE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    🏢 Entire Company
                  </button>
                )}
              </div>
            </div>

            {/* Time Presets */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'this_week', label: 'This Week' },
                { id: 'this_month', label: 'This Month' },
                { id: 'last_30_days', label: 'Last 30 Days' },
                { id: 'all', label: 'All Time' },
                { id: 'custom', label: 'Custom' }
              ].map(preset => (
                <button
                  key={preset.id}
                  onClick={() => setDashboardTimeRange(preset.id)}
                  style={{
                    border: '1px solid',
                    borderColor: dashboardTimeRange === preset.id ? '#3b82f6' : 'var(--border-color, #e2e8f0)',
                    background: dashboardTimeRange === preset.id ? '#eff6ff' : 'var(--card-bg, #ffffff)',
                    color: dashboardTimeRange === preset.id ? '#1d4ed8' : '#64748b',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Date Pickers */}
            {dashboardTimeRange === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                />
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                />
              </div>
            )}

            {/* Department & Category Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select
                value={dashboardDept}
                onChange={(e) => setDashboardDept(e.target.value)}
                style={{ padding: '0.38rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: 500 }}
              >
                <option value="ALL">🏢 All Departments</option>
                {availableDepartments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <select
                value={dashboardCategory}
                onChange={(e) => setDashboardCategory(e.target.value)}
                style={{ padding: '0.38rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', fontWeight: 500 }}
              >
                <option value="ALL">📂 All Categories</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 6 Executive KPI Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            
            {/* Card 1: Completion Score */}
            <div style={{
              background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
              color: '#ffffff',
              padding: '1.25rem',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 4px 12px rgba(49, 46, 129, 0.15)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, opacity: 0.9 }}>COMPLETION SCORE</span>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.5rem',
                  borderRadius: '12px',
                  background: dashboardAnalytics.completionRate >= 90 ? 'rgba(16,185,129,0.25)' : dashboardAnalytics.completionRate >= 75 ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)',
                  color: dashboardAnalytics.completionRate >= 90 ? '#6ee7b7' : dashboardAnalytics.completionRate >= 75 ? '#fde68a' : '#fca5a5'
                }}>
                  {dashboardAnalytics.completionRate >= 90 ? '🌟 Star' : dashboardAnalytics.completionRate >= 75 ? '👍 Reliable' : '🚨 At Risk'}
                </span>
              </div>
              <div style={{ margin: '0.75rem 0 0.5rem' }}>
                <span style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1 }}>
                  {dashboardAnalytics.completionRate}%
                </span>
              </div>
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.2)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  width: `${dashboardAnalytics.completionRate}%`,
                  background: dashboardAnalytics.completionRate >= 90 ? '#10b981' : dashboardAnalytics.completionRate >= 75 ? '#f59e0b' : '#ef4444',
                  height: '100%',
                  borderRadius: '3px'
                }} />
              </div>
              <span style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.4rem' }}>
                {dashboardAnalytics.completed} of {dashboardAnalytics.totalTasks} tasks closed
              </span>
            </div>

            {/* Card 2: Total Delegated Tasks */}
            <div style={{ background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.35rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>TOTAL DELEGATED</span>
                <span style={{ background: '#f1f5f9', padding: '0.3rem', borderRadius: '6px' }}><CheckSquare size={16} color="#64748b" /></span>
              </div>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>{dashboardAnalytics.totalTasks}</span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Across all selected filters</span>
            </div>

            {/* Card 3: Active & In Progress */}
            <div style={{ background: 'var(--card-bg, #ffffff)', border: '1px solid #bfdbfe', padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.35rem', boxShadow: '0 2px 6px rgba(59,130,246,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e40af' }}>⚡ ACTIVE / IN PROGRESS</span>
                <span style={{ background: '#dbeafe', padding: '0.3rem', borderRadius: '6px' }}><Activity size={16} color="#2563eb" /></span>
              </div>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#2563eb' }}>
                {dashboardAnalytics.inProgress + dashboardAnalytics.pending}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>
                {dashboardAnalytics.inProgress} in progress • {dashboardAnalytics.pending} pending start
              </span>
            </div>

            {/* Card 4: Pending Review */}
            <div style={{ background: 'var(--card-bg, #ffffff)', border: '1px solid #fde68a', padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.35rem', boxShadow: '0 2px 6px rgba(245,158,11,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#92400e' }}>⏳ PENDING REVIEW</span>
                <span style={{ background: '#fef3c7', padding: '0.3rem', borderRadius: '6px' }}><Eye size={16} color="#d97706" /></span>
              </div>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#d97706' }}>{dashboardAnalytics.submitted}</span>
              <span style={{ fontSize: '0.75rem', color: '#b45309' }}>Submitted by assignee for rating</span>
            </div>

            {/* Card 5: Overdue / SLA Breach */}
            <div style={{ background: '#fff5f5', border: '1px solid #fecaca', padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.35rem', boxShadow: '0 2px 6px rgba(239,68,68,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#991b1b' }}>⚠️ OVERDUE / DELAYED</span>
                <span style={{ background: '#fee2e2', padding: '0.3rem', borderRadius: '6px' }}><AlertTriangle size={16} color="#dc2626" /></span>
              </div>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#dc2626' }}>{dashboardAnalytics.overdueActive}</span>
              <span style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600 }}>Past deadline without completion</span>
            </div>

            {/* Card 6: Quality Rating */}
            <div style={{ background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.35rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>⭐ AVG QUALITY RATING</span>
                <span style={{ background: '#fef3c7', padding: '0.3rem', borderRadius: '6px' }}><Star size={16} color="#f59e0b" /></span>
              </div>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#f59e0b' }}>
                {dashboardAnalytics.avgRating} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 500 }}>/ 5.0</span>
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                From {dashboardAnalytics.ratedTasksCount} verified task sign-offs
              </span>
            </div>

          </div>

          {/* Analytics Breakdown Row (Status & Priority Matrices) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
            
            {/* Status Distribution */}
            <div style={{ background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BarChart3 size={18} color="#3b82f6" /> Task Status Distribution
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{dashboardAnalytics.totalTasks} total</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  { label: 'Completed (Approved)', count: dashboardAnalytics.completed, color: '#10b981', bg: '#ecfdf5' },
                  { label: 'In Progress', count: dashboardAnalytics.inProgress, color: '#3b82f6', bg: '#eff6ff' },
                  { label: 'Submitted (Waiting Review)', count: dashboardAnalytics.submitted, color: '#f59e0b', bg: '#fffbeb' },
                  { label: 'Pending (Not Started)', count: dashboardAnalytics.pending, color: '#64748b', bg: '#f8fafc' },
                  { label: 'Reopened', count: dashboardAnalytics.reopened, color: '#ef4444', bg: '#fef2f2' }
                ].map(st => {
                  const pct = dashboardAnalytics.totalTasks > 0 ? Math.round((st.count / dashboardAnalytics.totalTasks) * 100) : 0;
                  return (
                    <div key={st.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600 }}>
                        <span style={{ color: '#334155' }}>{st.label}</span>
                        <span style={{ color: st.color }}>{st.count} ({pct}%)</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: st.color, borderRadius: '4px' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Priority & SLA Risk Breakdown */}
            <div style={{ background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Flame size={18} color="#ef4444" /> Priority & SLA Risk Breakdown
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                {Object.entries(dashboardAnalytics.priorityStats).map(([prioKey, stats]) => {
                  const cfg = PRIORITY_CONFIG[prioKey] || PRIORITY_CONFIG.MEDIUM;
                  const complPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                  return (
                    <div
                      key={prioKey}
                      style={{
                        background: cfg.bg,
                        border: `1px solid ${cfg.color}30`,
                        borderRadius: '10px',
                        padding: '0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: cfg.color }}>
                          {cfg.icon} {cfg.label}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: cfg.color }}>
                          {stats.total} tasks
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.2rem' }}>
                        <div>✅ {stats.completed} Done ({complPct}%)</div>
                        <div>⚡ {stats.inProgress} In Progress</div>
                        {stats.overdue > 0 && <div style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ {stats.overdue} Overdue</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Critical Escalations & Urgent Watchlist */}
          {dashboardAnalytics.criticalTasks.length > 0 && (
            <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#9a3412', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertTriangle size={18} color="#ea580c" /> 🚨 Critical Attention & Overdue Escalations ({dashboardAnalytics.criticalTasks.length})
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#c2410c', fontWeight: 600 }}>Action Required by Delegator / Assignee</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
                {dashboardAnalytics.criticalTasks.map(task => {
                  const prio = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.MEDIUM;
                  const deadlineBadge = formatDeadlineBadge(task.deadline, task.status);
                  return (
                    <div
                      key={task.id}
                      style={{
                        background: '#ffffff',
                        border: deadlineBadge.isLate ? '1.5px solid #fca5a5' : '1px solid #fed7aa',
                        borderRadius: '8px',
                        padding: '0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.72rem', background: prio.bg, color: prio.color, padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                          {prio.icon} {prio.label}
                        </span>
                        <span style={{ fontSize: '0.72rem', background: deadlineBadge.bg, color: deadlineBadge.color, padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                          {deadlineBadge.text}
                        </span>
                      </div>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>
                        {task.title}
                      </h4>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#64748b' }}>
                        <span>👤 {task.assigned_to_name}</span>
                        <button
                          onClick={() => handleOpenDrawer(task)}
                          style={{
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#1d4ed8',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '0.75rem'
                          }}
                        >
                          View & Action →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Employee Delegation Accountability & Leaderboard Table */}
          <div style={{ background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0f172a' }}>
                  <Award size={20} color="#f59e0b" /> Employee Delegation Accountability & Leaderboard
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                  Live employee task completion score, on-time velocity, and quality rating
                </p>
              </div>

              {/* Leaderboard Filters */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.35rem 0.6rem' }}>
                  <Search size={14} color="#94a3b8" style={{ marginRight: '0.4rem' }} />
                  <input
                    type="text"
                    placeholder="Search staff, email, dept..."
                    value={leaderboardSearch}
                    onChange={(e) => setLeaderboardSearch(e.target.value)}
                    style={{ border: 'none', background: 'none', outline: 'none', fontSize: '0.8rem', width: '160px' }}
                  />
                </div>

                <div style={{ display: 'flex', background: '#f1f5f9', padding: '0.2rem', borderRadius: '6px' }}>
                  {[
                    { id: 'ALL', label: 'All Staff' },
                    { id: 'STAR', label: '🌟 Star (≥90%)' },
                    { id: 'RELIABLE', label: '👍 Reliable (75-89%)' },
                    { id: 'AT_RISK', label: '🚨 At Risk (<75%)' }
                  ].map(tier => (
                    <button
                      key={tier.id}
                      onClick={() => setLeaderboardTier(tier.id)}
                      style={{
                        border: 'none',
                        padding: '0.3rem 0.65rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: leaderboardTier === tier.id ? '#ffffff' : 'transparent',
                        color: leaderboardTier === tier.id ? '#1e293b' : '#64748b',
                        boxShadow: leaderboardTier === tier.id ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                      }}
                    >
                      {tier.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Leaderboard Table */}
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Rank</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Employee</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Department</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Tasks Assigned</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Completed</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>🟢 On-Time</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>⚠️ Overdue</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Avg Rating</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Completion Rate</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status Badge</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardAnalytics.leaderboard
                    .filter(emp => {
                      if (leaderboardTier !== 'ALL' && emp.badge !== leaderboardTier) return false;
                      if (leaderboardSearch) {
                        const q = leaderboardSearch.toLowerCase();
                        return (
                          emp.name.toLowerCase().includes(q) ||
                          emp.email.toLowerCase().includes(q) ||
                          emp.department.toLowerCase().includes(q)
                        );
                      }
                      return true;
                    })
                    .map((emp, idx) => {
                      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                      return (
                        <tr key={emp.email} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 700, fontSize: '0.9rem' }}>
                            {medal}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontWeight: 600, color: '#1e293b' }}>{emp.name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{emp.email}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                            <span style={{ background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                              {emp.department}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>
                            {emp.assignedTotal}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: '#10b981' }}>
                            {emp.completed}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600, color: '#059669' }}>
                            {emp.completedOnTime}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: emp.overdue > 0 ? '#dc2626' : '#94a3b8' }}>
                            {emp.overdue > 0 ? `⚠️ ${emp.overdue}` : '0'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: '#f59e0b' }}>
                            {emp.avgRating !== '-' ? `${emp.avgRating} ★` : '-'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', minWidth: '150px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ flex: 1, height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{
                                  width: `${emp.completionRate}%`,
                                  height: '100%',
                                  background: emp.completionRate >= 90 ? '#10b981' : emp.completionRate >= 75 ? '#f59e0b' : '#ef4444',
                                  borderRadius: '3px'
                                }} />
                              </div>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', width: '36px' }}>
                                {emp.completionRate}%
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            <span style={{
                              padding: '0.2rem 0.6rem',
                              borderRadius: '12px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: emp.badge === 'STAR' ? '#ecfdf5' : emp.badge === 'RELIABLE' ? '#fffbeb' : '#fef2f2',
                              color: emp.badge === 'STAR' ? '#059669' : emp.badge === 'RELIABLE' ? '#d97706' : '#dc2626',
                              border: `1px solid ${emp.badge === 'STAR' ? '#a7f3d0' : emp.badge === 'RELIABLE' ? '#fde68a' : '#fecaca'}`
                            }}>
                              {emp.badge === 'STAR' ? '🌟 Star' : emp.badge === 'RELIABLE' ? '👍 Reliable' : '🚨 At Risk'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  {dashboardAnalytics.leaderboard.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                        No employee data found matching filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      )}

      {/* Analytics KPI Metric Cards (Only for Tasks list views) */}
      {activeTab !== 'dashboard' && analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <div style={{ background: 'var(--card-bg, #ffffff)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>📥 My Pending Tasks</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>{analytics.assignedPending + analytics.assignedInProgress}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>{analytics.assignedInProgress} in progress</span>
          </div>

          <div style={{ background: 'var(--card-bg, #ffffff)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>⚠️ Overdue (Past Deadline)</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>{analytics.assignedOverdue}</span>
            <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>Requires immediate action</span>
          </div>

          <div style={{ background: 'var(--card-bg, #ffffff)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>📤 Delegated Waiting Review</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>{analytics.delegatedPendingReview}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>Submitted by assignee</span>
          </div>

          <div style={{ background: 'var(--card-bg, #ffffff)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>✅ Tasks Completed</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>{analytics.assignedCompleted}</span>
            <span style={{ fontSize: '0.75rem', color: '#10b981' }}>Approved & closed</span>
          </div>
        </div>
      )}

      {/* Filter Bar (Only for tasks list views) */}
      {activeTab !== 'dashboard' && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #cbd5e1)', borderRadius: '8px', padding: '0.45rem 0.75rem', flex: 1, minWidth: '220px' }}>
            <Search size={16} style={{ color: '#94a3b8', marginRight: '0.5rem' }} />
            <input
              type="text"
              placeholder="Search task title, code, employee, category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }}
            />
          </div>

          {activeTab === 'all' && myReportingTeam.length > 0 && (
            <select
              value={teamBoardFilter}
              onChange={(e) => setTeamBoardFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                border: '1.5px solid #3b82f6',
                background: '#eff6ff',
                color: '#1d4ed8',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              <option value="MY_TEAM">👥 My Reporting Team ({myReportingTeam.length} Members)</option>
              {isAdmin && <option value="ALL">🏢 All Company Tasks</option>}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '0.85rem' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending (Not Started)</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="SUBMITTED">Submitted for Review</option>
            <option value="COMPLETED">Completed</option>
            <option value="REOPENED">Reopened</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '0.85rem' }}
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">🔥 Urgent</option>
            <option value="HIGH">⚡ High</option>
            <option value="MEDIUM">📌 Medium</option>
            <option value="LOW">☕ Low</option>
          </select>
        </div>
      )}

      {/* Task Cards Grid (Only when not on dashboard) */}
      {activeTab !== 'dashboard' && loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary, #64748b)' }}>
          <RefreshCw className="spin" size={32} style={{ margin: '0 auto 1rem' }} />
          <p>Loading delegation tasks...</p>
        </div>
      )}

      {activeTab !== 'dashboard' && !loading && tasks.length === 0 && (
        <div style={{
          background: 'var(--bg-secondary, #f8fafc)',
          border: '1px dashed var(--border-color, #cbd5e1)',
          borderRadius: '12px',
          padding: '3.5rem 2rem',
          textAlign: 'center',
          color: 'var(--text-secondary, #64748b)'
        }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>🤝</span>
          <h3 style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>No Tasks Found</h3>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            {activeTab === 'to_me' ? 'You have no delegated tasks pending.' : 'You have not delegated any tasks matching this filter.'}
          </p>
          <button
            onClick={handleOpenCreateModal}
            style={{
              marginTop: '1.25rem',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1.25rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Assign New Task to Colleague
          </button>
        </div>
      )}

      {activeTab !== 'dashboard' && !loading && tasks.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
          {tasks.map(task => {
            const prio = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.MEDIUM;
            const deadlineBadge = formatDeadlineBadge(task.deadline, task.status);
            const isAssignedToMe = (task.assigned_to_email || '').toLowerCase() === (userEmail || '').toLowerCase();
            const isDelegatedByMe = (task.delegated_by_email || '').toLowerCase() === (userEmail || '').toLowerCase();

            return (
              <div
                key={task.id}
                style={{
                  background: 'var(--card-bg, #ffffff)',
                  border: deadlineBadge.isLate ? '1.5px solid #fca5a5' : '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                  boxShadow: deadlineBadge.isLate ? '0 4px 12px rgba(239, 68, 68, 0.08)' : '0 2px 8px rgba(0,0,0,0.04)',
                  position: 'relative'
                }}
              >
                {/* Header: Priority & Category & Code */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span style={{
                      background: prio.bg,
                      color: prio.color,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      {prio.icon} {prio.label}
                    </span>
                    <span style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px', color: '#475569', fontWeight: 600 }}>
                      {task.category}
                    </span>
                  </div>

                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace', fontWeight: 600 }}>
                    {task.task_code}
                  </span>
                </div>

                {/* Title & Description */}
                <div>
                  <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary, #1e293b)' }}>
                    {task.title}
                  </h3>
                  {task.description && (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {task.description}
                    </p>
                  )}
                </div>

                {/* Subtasks summary (if any) */}
                {task.subtasks && task.subtasks.length > 0 && (
                  <div style={{ background: 'var(--bg-secondary, #f8fafc)', padding: '0.6rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                      Checkpoints ({task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}):
                    </div>
                    {task.subtasks.slice(0, 3).map((st) => (
                      <label
                        key={st.id}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: isAssignedToMe ? 'pointer' : 'default' }}
                      >
                        <input
                          type="checkbox"
                          checked={st.completed}
                          disabled={!isAssignedToMe || task.status === 'COMPLETED'}
                          onChange={() => isAssignedToMe && handleToggleSubtaskInList(task, st.id)}
                          style={{ width: '14px', height: '14px' }}
                        />
                        <span style={{ textDecoration: st.completed ? 'line-through' : 'none', color: st.completed ? '#94a3b8' : 'inherit' }}>
                          {st.title}
                        </span>
                      </label>
                    ))}
                    {task.subtasks.length > 3 && (
                      <span style={{ fontSize: '0.75rem', color: '#3b82f6', cursor: 'pointer' }} onClick={() => handleOpenDrawer(task)}>
                        +{task.subtasks.length - 3} more checkpoints...
                      </span>
                    )}
                  </div>
                )}

                {/* People involved */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', borderTop: '1px solid var(--border-color, #f1f5f9)', paddingTop: '0.6rem' }}>
                  <div>
                    <span style={{ opacity: 0.7, fontSize: '0.7rem', display: 'block' }}>Delegated By:</span>
                    <span style={{ fontWeight: 600 }}>{task.delegated_by_name}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ opacity: 0.7, fontSize: '0.7rem', display: 'block' }}>Assigned To:</span>
                    <span style={{ fontWeight: 600 }}>{task.assigned_to_name}</span>
                  </div>
                </div>

                {/* Deadline & Status Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: deadlineBadge.bg, padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: deadlineBadge.color }}>
                    {deadlineBadge.text}
                  </span>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '12px',
                    background: task.status === 'COMPLETED' ? '#22c55e' : task.status === 'SUBMITTED' ? '#f59e0b' : task.status === 'IN_PROGRESS' ? '#3b82f6' : '#94a3b8',
                    color: '#ffffff'
                  }}>
                    {task.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Rating badge if completed */}
                {task.status === 'COMPLETED' && task.rating && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#f59e0b', fontSize: '0.85rem', fontWeight: 600 }}>
                    <span>Rating:</span>
                    {'⭐'.repeat(task.rating)}
                    {task.feedback_remarks && <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: '0.25rem' }}>({task.feedback_remarks})</span>}
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
                  {/* Assignee Actions */}
                  {isAssignedToMe && task.status === 'PENDING' && (
                    <button
                      onClick={() => handleStartTask(task)}
                      style={{
                        flex: 1,
                        background: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        padding: '0.55rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.85rem'
                      }}
                    >
                      ▶ Start Working
                    </button>
                  )}

                  {isAssignedToMe && (task.status === 'IN_PROGRESS' || task.status === 'REOPENED') && (
                    <button
                      onClick={() => handleOpenSubmitModal(task)}
                      style={{
                        flex: 1,
                        background: '#10b981',
                        color: '#fff',
                        border: 'none',
                        padding: '0.55rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <Check size={16} /> Submit for Review
                    </button>
                  )}

                  {/* Delegator Actions */}
                  {isDelegatedByMe && task.status === 'SUBMITTED' && (
                    <button
                      onClick={() => handleOpenVerifyModal(task)}
                      style={{
                        flex: 1,
                        background: '#f59e0b',
                        color: '#fff',
                        border: 'none',
                        padding: '0.55rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <Star size={16} /> Review & Approve
                    </button>
                  )}

                  {/* Timeline / Activity button */}
                  <button
                    onClick={() => handleOpenDrawer(task)}
                    style={{
                      background: 'var(--bg-secondary, #f8fafc)',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      color: 'var(--text-primary, #1e293b)',
                      padding: '0.55rem 0.85rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                    title="Discussion & History"
                  >
                    <MessageSquare size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ASSIGN NEW TASK                                                  */}
      {/* ========================================================================= */}
      {createModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '650px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <div style={{ padding: '1.25rem 1.5rem', background: '#0f172a', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Assign New Delegation Task</h3>
              <button onClick={() => setCreateModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              {/* Assignee selection */}
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                  Assign To Employee *
                </label>
                <SearchableEmployeeSelect
                  employees={employeesList}
                  selectedEmail={createForm.assigned_to_email}
                  placeholder="Type colleague name, email, department..."
                  onSelect={(emp) => {
                    if (!emp) {
                      setCreateForm(prev => ({
                        ...prev,
                        assigned_to_email: '',
                        assigned_to_name: '',
                        assigned_to_department: 'General'
                      }));
                    } else {
                      setCreateForm(prev => ({
                        ...prev,
                        assigned_to_email: emp.email,
                        assigned_to_name: emp.name || emp.emp_name,
                        assigned_to_department: emp.department || 'General'
                      }));
                    }
                  }}
                />
              </div>

              {/* Title */}
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                  Task Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Prepare Q3 GST Reconciliations & Filing"
                  value={createForm.title}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, title: e.target.value }))}
                  style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', width: '100%' }}
                />
              </div>

              {/* Description / SOP */}
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                  Instructions & Details
                </label>
                <textarea
                  placeholder="Provide step-by-step instructions, expectations, and deliverables..."
                  rows={3}
                  value={createForm.description}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                  style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', width: '100%' }}
                />
              </div>

              {/* Priority, Category, Strict Deadline */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    Priority Level *
                  </label>
                  <select
                    value={createForm.priority}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, priority: e.target.value }))}
                    style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', width: '100%' }}
                  >
                    <option value="URGENT">🔥 Urgent (Top Priority)</option>
                    <option value="HIGH">⚡ High Priority</option>
                    <option value="MEDIUM">📌 Medium Priority</option>
                    <option value="LOW">☕ Low Priority</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    Category
                  </label>
                  <select
                    value={createForm.category}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, category: e.target.value }))}
                    style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', width: '100%' }}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Deadline Date & Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    Due Deadline Date *
                  </label>
                  <input
                    type="date"
                    value={createForm.deadlineDate}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, deadlineDate: e.target.value }))}
                    style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    Due Time (Cutoff)
                  </label>
                  <input
                    type="time"
                    value={createForm.deadlineTime}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, deadlineTime: e.target.value }))}
                    style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', width: '100%' }}
                  />
                </div>
              </div>

              {/* Subtasks Builder */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    Milestones / Checkpoints ({createForm.subtasks.length})
                  </label>
                  <button
                    onClick={handleAddSubtaskInput}
                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '0.25rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                  >
                    + Add Step
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {createForm.subtasks.map((st, idx) => (
                    <div key={st.id || idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder={`Milestone #${idx + 1}...`}
                        value={st.title}
                        onChange={(e) => handleSubtaskChange(idx, e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', flex: 1 }}
                      />
                      <button
                        onClick={() => handleRemoveSubtask(idx)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-secondary, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setCreateModalOpen(false)}
                style={{ background: 'none', border: '1px solid var(--border-color, #cbd5e1)', padding: '0.55rem 1.25rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewTask}
                style={{ background: '#3b82f6', color: '#ffffff', border: 'none', padding: '0.55rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >
                Assign Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: SUBMIT TASK PROOF FOR REVIEW (ASSIGNEE)                          */}
      {/* ========================================================================= */}
      {submitModalOpen && submittingTask && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '550px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <div style={{ padding: '1.25rem 1.5rem', background: '#10b981', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Submit Completed Task</h3>
              <button onClick={() => setSubmitModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Task Title:</span>
                <div style={{ fontWeight: 600 }}>{submittingTask.title}</div>
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                  Completion Proof / Deliverable Link:
                </label>
                <input
                  type="text"
                  placeholder="Paste Google Drive / Spreadsheet / File / Portal Link..."
                  value={submissionProof}
                  onChange={(e) => setSubmissionProof(e.target.value)}
                  style={{ padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                  Completion Summary & Notes:
                </label>
                <textarea
                  placeholder="Briefly explain work done, files prepared, or comments..."
                  rows={3}
                  value={submissionNotes}
                  onChange={(e) => setSubmissionNotes(e.target.value)}
                  style={{ padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%' }}
                />
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-secondary, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setSubmitModalOpen(false)}
                style={{ background: 'none', border: '1px solid var(--border-color, #cbd5e1)', padding: '0.55rem 1.25rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitTaskForReview}
                style={{ background: '#10b981', color: '#ffffff', border: 'none', padding: '0.55rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >
                Submit for Delegator Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: DELEGATOR VERIFY / APPROVE / REOPEN                              */}
      {/* ========================================================================= */}
      {verifyModalOpen && verifyingTask && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '550px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <div style={{ padding: '1.25rem 1.5rem', background: '#1e293b', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Review & Approve Task</h3>
              <button onClick={() => setVerifyModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Task:</span>
                <div style={{ fontWeight: 600 }}>{verifyingTask.title}</div>
                <div style={{ fontSize: '0.85rem', color: '#3b82f6' }}>Assigned To: {verifyingTask.assigned_to_name}</div>
              </div>

              {verifyingTask.completion_proof && (
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Submitted Deliverable Proof:</span>
                  <div style={{ background: '#f8fafc', padding: '0.6rem', borderRadius: '6px', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                    <a href={verifyingTask.completion_proof} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <ExternalLink size={14} /> {verifyingTask.completion_proof}
                    </a>
                  </div>
                </div>
              )}

              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Assignee Remarks:</span>
                <div style={{ background: '#f8fafc', padding: '0.6rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                  {verifyingTask.completion_notes || 'No remarks provided.'}
                </div>
              </div>

              {/* Star Rating selector */}
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                  Rating (Work Quality & Speed):
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      style={{
                        background: star <= rating ? '#fef3c7' : '#f1f5f9',
                        border: star <= rating ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '0.4rem 0.75rem',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        color: star <= rating ? '#d97706' : '#94a3b8'
                      }}
                    >
                      ★ {star}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                  Feedback / Rework Instructions:
                </label>
                <textarea
                  placeholder="Excellent work / or specify why revision is needed..."
                  rows={2}
                  value={feedbackRemarks}
                  onChange={(e) => setFeedbackRemarks(e.target.value)}
                  style={{ padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%' }}
                />
              </div>

              {/* Revision Deadline date if reopening */}
              <div style={{ background: '#fee2e2', padding: '0.75rem', borderRadius: '8px', border: '1px solid #fca5a5' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#991b1b', display: 'block', marginBottom: '0.35rem' }}>
                  If requesting revision (Reopening), select new revised deadline:
                </span>
                <input
                  type="date"
                  value={reopenDeadlineDate}
                  onChange={(e) => setReopenDeadlineDate(e.target.value)}
                  style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid #f87171', width: '100%' }}
                />
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-secondary, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={handleReopenTask}
                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.55rem 1.25rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <RotateCcw size={15} /> Request Revision
              </button>
              <button
                onClick={handleApproveTask}
                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '0.55rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Check size={16} /> Approve & Close Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWER: TASK DISCUSSION & ACTIVITY LOG                                    */}
      {/* ========================================================================= */}
      {drawerTask && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: '480px',
          background: 'var(--card-bg, #ffffff)',
          boxShadow: '-4px 0 25px rgba(0,0,0,0.15)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Drawer Header */}
          <div style={{ padding: '1.25rem 1.5rem', background: '#0f172a', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '0.75rem', opacity: 0.7, fontFamily: 'monospace' }}>{drawerTask.task_code}</span>
              <h3 style={{ margin: '0.1rem 0 0', fontSize: '1.1rem', fontWeight: 700 }}>Task Activity & Comments</h3>
            </div>
            <button onClick={() => setDrawerTask(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>

          {/* Task Mini Summary */}
          <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-secondary, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
            <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 600 }}>{drawerTask.title}</h4>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>
              From: {drawerTask.delegated_by_name} • To: {drawerTask.assigned_to_name}
            </div>
          </div>

          {/* Timeline Stream */}
          <div style={{ flex: 1, padding: '1.25rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {activities.length === 0 && (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0', fontSize: '0.85rem' }}>
                No discussion recorded yet. Post a message below.
              </div>
            )}
            {activities.map(act => (
              <div
                key={act.id}
                style={{
                  background: act.activity_type === 'COMMENT' ? 'var(--card-bg, #ffffff)' : 'var(--bg-secondary, #f8fafc)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary, #1e293b)' }}>{act.actor_name}</span>
                  <span>{new Date(act.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary, #1e293b)' }}>
                  {act.message}
                </div>
              </div>
            ))}
          </div>

          {/* Comment Input Footer */}
          <div style={{ padding: '1rem 1.5rem', background: 'var(--card-bg, #ffffff)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Type message or task update..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
              style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
            />
            <button
              onClick={handleSendComment}
              disabled={sendingComment}
              style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.6rem 1rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
