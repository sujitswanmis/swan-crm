'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2, AlertCircle, Clock, Calendar, CheckSquare, Plus,
  Trash2, Edit3, ShieldCheck, Filter, Search, RefreshCw, Eye,
  Sparkles, Check, ChevronRight, ChevronLeft, X, AlertTriangle, FileSpreadsheet,
  Award, TrendingUp, HelpCircle, Layers, User, Building, ExternalLink, Lock, Copy,
  LayoutGrid, List
} from 'lucide-react';
import {
  FREQUENCIES_CONFIG,
  CHECKLIST_ITEM_TYPES,
  getCurrentPeriodKey,
  getHumanPeriodLabel,
  calculateChecklistCompletion,
  generateDefaultDailySlots,
  DEFAULT_HOLIDAYS_LIST,
  isDateHoliday,
  isDateSunday,
  formatDurationHuman,
  calculateDelayStatus
} from '@/utils/checklistUtils';
import {
  getChecklistTemplates,
  saveChecklistTemplate,
  deleteChecklistTemplate,
  setChecklistTemplateStatus,
  getEmployeeChecklistDashboard,
  submitChecklistResponse,
  verifyChecklistSubmission,
  getChecklistComplianceReport,
  getCompanyHolidays,
  saveCompanyHoliday,
  deleteCompanyHoliday,
  resetCompanyHolidaysToDefault,
  getCompanyDepartmentsList
} from '@/app/actions/checklist';
import { getEmployeesMaster } from '@/app/actions/employee';
import SearchableEmployeeSelect from '@/components/common/SearchableEmployeeSelect';
import DateRangePicker, { computeDateRange } from '@/components/common/DateRangePicker';
import { createClient } from '@/utils/supabase/client';

export default function ChecklistModule({
  userRole = 'agent',
  userId = '',
  userName = 'Employee',
  userEmail = '',
  moduleAccess = {},
  initialSubTab = 'dashboard',
  onSubTabChange = null
}) {
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
  const isManager = isAdmin || userRole === 'manager' || userRole === 'hod' || moduleAccess?.checklist?.is_manager === true;

  // Tabs: 'dashboard' | 'my_checklists' | 'templates' | 'compliance' | 'holidays'
  const [activeTab, setActiveTab] = useState(initialSubTab || 'dashboard');
  const [selectedFrequency, setSelectedFrequency] = useState('ALL'); // Default to 'ALL' (All Checklists)
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [complianceTeamFilter, setComplianceTeamFilter] = useState('MY_TEAM'); // 'MY_TEAM' | 'ALL'
  const [templateStatusFilter, setTemplateStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE'
  const [togglingStatusId, setTogglingStatusId] = useState(null);

  // Sync activeTab when initialSubTab changes from parent
  useEffect(() => {
    if (initialSubTab) {
      setActiveTab(initialSubTab);
      if (initialSubTab === 'my_checklists') {
        setSelectedFrequency('ALL');
      }
    }
  }, [initialSubTab]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'my_checklists') {
      setSelectedFrequency('ALL');
    }
    if (onSubTabChange) {
      onSubTabChange(tabId);
    }
  };

  // Performance Dashboard Filters & State
  const initialDashboardRange = useMemo(() => computeDateRange('this_month'), []);
  const [dashboardDatePreset, setDashboardDatePreset] = useState('this_month'); // 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'all' | 'custom'
  const [dashboardStartDate, setDashboardStartDate] = useState(initialDashboardRange.startDate);
  const [dashboardEndDate, setDashboardEndDate] = useState(initialDashboardRange.endDate);
  const [dashboardScope, setDashboardScope] = useState(isAdmin || isManager ? 'COMPANY_WIDE' : 'MY_PERFORMANCE'); // 'COMPANY_WIDE' | 'MY_TEAM' | 'MY_PERFORMANCE'
  const [dashboardDeptFilter, setDashboardDeptFilter] = useState('ALL');
  const [dashboardSearchEmployee, setDashboardSearchEmployee] = useState('');
  const [dashboardLeaderboardScoreFilter, setDashboardLeaderboardScoreFilter] = useState('ALL');

  // View Mode for My Checklists: 'tiles' | 'table'
  const [myChecklistsViewMode, setMyChecklistsViewMode] = useState('tiles');

  // Date selection for My Checklists Dashboard (Defaults to Today)
  const todayDateStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const [dashboardDate, setDashboardDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const isPastDate = dashboardDate < todayDateStr;
  const isFutureDate = dashboardDate > todayDateStr;
  const isToday = dashboardDate === todayDateStr;

  const handleShiftDate = (days) => {
    const cur = new Date(`${dashboardDate}T12:00:00`);
    cur.setDate(cur.getDate() + days);
    const nextStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    setDashboardDate(nextStr);
  };

  const handleSetToday = () => {
    setDashboardDate(todayDateStr);
  };

  // Data states
  const [dashboardChecklists, setDashboardChecklists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [complianceLogs, setComplianceLogs] = useState([]);
  const [employeesList, setEmployeesList] = useState([]);
  const [managedDepartments, setManagedDepartments] = useState([]);

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
  const canAccessTemplates = isManager || moduleAccess?.checklist?.sub_items?.templates?.view === true;
  const canAccessCompliance = isManager || isReportingManager || moduleAccess?.checklist?.sub_items?.compliance?.view === true;

  // Live ticking clock to recalculate lock/open/expire status in realtime every second
  const [liveNow, setLiveNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Live computed checklists with ticking delayInfo recalculated dynamically against liveNow
  const liveDashboardChecklists = useMemo(() => {
    return (dashboardChecklists || []).map(item => {
      const tmpl = item.template;
      if (!tmpl) return item;
      const isCompleted = item.status === 'COMPLETED' || (item.submission && item.submission.status === 'COMPLETED');
      const delayInfo = calculateDelayStatus({
        frequency: tmpl.frequency,
        periodKey: item.currentPeriodKey,
        dueTime: item.slotInfo?.due_time || tmpl.due_time || '18:00',
        bufferMinutes: item.slotInfo?.buffer_minutes || tmpl.buffer_minutes || 20,
        dayOfMonth: tmpl.day_of_month || 1,
        monthOfYear: tmpl.month_of_year || 12,
        quarterMonth: tmpl.quarter_month || 3,
        halfYearlyMonth: tmpl.half_yearly_month || 6,
        submittedAt: item.submission?.submitted_at || null,
        isCompleted: isCompleted,
        allowDelayedSubmission: tmpl.allow_delayed_submission,
        now: liveNow
      });
      return {
        ...item,
        delayInfo
      };
    });
  }, [dashboardChecklists, liveNow]);

  // Computed Checklist Dashboard KPI Metrics
  const dashboardMetrics = useMemo(() => {
    const total = liveDashboardChecklists.length;
    const completed = liveDashboardChecklists.filter(i => i.status === 'COMPLETED').length;
    const completedOnTime = liveDashboardChecklists.filter(i => i.status === 'COMPLETED' && !i.delayInfo?.isDelayed).length;
    const completedLate = liveDashboardChecklists.filter(i => i.status === 'COMPLETED' && i.delayInfo?.isDelayed).length;
    const openOnTime = liveDashboardChecklists.filter(i => i.status !== 'COMPLETED' && i.delayInfo?.isActive && i.delayInfo?.badgeStatus !== 'DELAYED_OPEN').length;
    const activeDelayed = liveDashboardChecklists.filter(i => i.status !== 'COMPLETED' && i.delayInfo?.badgeStatus === 'DELAYED_OPEN').length;
    const active = openOnTime + activeDelayed;
    const locked = liveDashboardChecklists.filter(i => i.status !== 'COMPLETED' && i.delayInfo?.isBeforeStart).length;
    const expired = liveDashboardChecklists.filter(i => i.status !== 'COMPLETED' && i.delayInfo?.isExpired).length;
    const complianceRate = total > 0 ? Math.round((completed / total) * 100) : (isFutureDate ? 0 : 100);

    return {
      total,
      completed,
      completedOnTime,
      completedLate,
      openOnTime,
      activeDelayed,
      active,
      locked,
      expired,
      complianceRate
    };
  }, [liveDashboardChecklists, isFutureDate]);

  // Available distinct departments (from Settings > Manage Departments + employee/template records)
  const availableDepartments = useMemo(() => {
    const set = new Set(managedDepartments || []);
    (employeesList || []).forEach(e => {
      if (e.department) set.add(e.department);
    });
    (templates || []).forEach(t => {
      if (t.department) set.add(t.department);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [managedDepartments, employeesList, templates]);

  // Analytics Dashboard Computation
  const analyticsData = useMemo(() => {
    const filteredLogs = (complianceLogs || []).filter(log => {
      if (dashboardDatePreset === 'all') return true;
      const logDate = log.submitted_at ? new Date(log.submitted_at) : null;
      if (!logDate || isNaN(logDate.getTime())) return true;

      const logDateStr = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`;
      if (dashboardStartDate && logDateStr < dashboardStartDate) return false;
      if (dashboardEndDate && logDateStr > dashboardEndDate) return false;
      return true;
    });

    const userEmailClean = (userEmail || '').toLowerCase().trim();

    // 1. Personal metrics for logged in user
    const myLogs = filteredLogs.filter(l => (l.employee_email || '').toLowerCase().trim() === userEmailClean);
    const myCompletedOnTime = myLogs.filter(l => l.status === 'COMPLETED' && !l.delayInfo?.isDelayed).length;
    const myCompletedLate = myLogs.filter(l => l.status === 'COMPLETED' && l.delayInfo?.isDelayed).length;
    const myCompleted = myCompletedOnTime + myCompletedLate;

    let myAssignedSlots = 0;
    (templates || []).filter(t => t.is_active !== false).forEach(t => {
      const rawEmails = (t.assigned_employee_email || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      const isAssigned = t.assigned_type === 'ALL' || rawEmails.includes(userEmailClean);
      if (isAssigned) {
        const slotsCount = (Array.isArray(t.daily_slots) && t.daily_slots.length > 0) ? t.daily_slots.length : (t.daily_repetition_count || 1);
        myAssignedSlots += slotsCount;
      }
    });

    const myAssigned = Math.max(myAssignedSlots, myCompleted);
    const myMissedToday = Math.max(0, myAssigned - myCompleted);
    const myScore = myAssigned > 0 ? Math.round((myCompleted / myAssigned) * 100) : (myCompleted > 0 ? 100 : 0);

    const myTemplatesGroup = new Map();
    myLogs.forEach(l => {
      const tId = l.template_id || l.template_title || 'Unknown';
      if (!myTemplatesGroup.has(tId)) {
        myTemplatesGroup.set(tId, {
          title: l.template_title || 'Checklist',
          frequency: l.frequency || 'DAILY',
          department: l.department || 'General',
          total: 0,
          onTime: 0,
          late: 0
        });
      }
      const entry = myTemplatesGroup.get(tId);
      entry.total += 1;
      if (l.delayInfo?.isDelayed) {
        entry.late += 1;
      } else {
        entry.onTime += 1;
      }
    });

    const myChecklistsBreakdown = Array.from(myTemplatesGroup.values()).map(item => ({
      ...item,
      complianceRate: 100
    }));

    // 2. Company / Team metrics (for Admin / Manager)
    let companyScopeLogs = filteredLogs;
    if (dashboardScope === 'MY_TEAM') {
      const teamEmails = new Set(myReportingTeam.map(m => (m.email || '').toLowerCase().trim()));
      teamEmails.add(userEmailClean);
      companyScopeLogs = companyScopeLogs.filter(l => teamEmails.has((l.employee_email || '').toLowerCase().trim()));
    }
    if (dashboardDeptFilter !== 'ALL') {
      companyScopeLogs = companyScopeLogs.filter(l => (l.department || '').toLowerCase() === dashboardDeptFilter.toLowerCase());
    }

    const companyCompleted = companyScopeLogs.filter(l => l.status === 'COMPLETED').length;

    // Build comprehensive map of all assigned employees from templates & master list
    const empMap = new Map();

    // First, populate all active employees from employeesList
    (employeesList || []).forEach(emp => {
      const eEmail = (emp.email || '').toLowerCase().trim();
      if (eEmail) {
        empMap.set(eEmail, {
          email: eEmail,
          name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || emp.name || eEmail,
          department: emp.department || 'General',
          assigned: 0,
          completedOnTime: 0,
          completedLate: 0,
          completed: 0
        });
      }
    });

    // Calculate assigned slots per employee from active templates
    (templates || []).filter(t => t.is_active !== false).forEach(t => {
      const rawEmails = (t.assigned_employee_email || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      const slotsCount = (Array.isArray(t.daily_slots) && t.daily_slots.length > 0) ? t.daily_slots.length : (t.daily_repetition_count || 1);

      if (t.assigned_type === 'ALL') {
        empMap.forEach((val) => {
          val.assigned += slotsCount;
        });
      } else {
        rawEmails.forEach(e => {
          if (!empMap.has(e)) {
            const matchedP = (employeesList || []).find(p => (p.email || '').toLowerCase().trim() === e);
            const name = matchedP ? `${matchedP.first_name || ''} ${matchedP.last_name || ''}`.trim() : e;
            empMap.set(e, {
              email: e,
              name: name || e,
              department: matchedP?.department || t.department || 'General',
              assigned: 0,
              completedOnTime: 0,
              completedLate: 0,
              completed: 0
            });
          }
          empMap.get(e).assigned += slotsCount;
        });
      }
    });

    // Populate completed counts from actual submissions
    companyScopeLogs.forEach(l => {
      const eEmail = (l.employee_email || '').toLowerCase().trim();
      if (!eEmail) return;
      if (!empMap.has(eEmail)) {
        empMap.set(eEmail, {
          email: eEmail,
          name: l.employee_name || eEmail,
          department: l.department || 'General',
          assigned: 0,
          completedOnTime: 0,
          completedLate: 0,
          completed: 0
        });
      }
      if (l.status === 'COMPLETED') {
        const isLate = Boolean(l.delayInfo?.isDelayed);
        if (isLate) {
          empMap.get(eEmail).completedLate += 1;
        } else {
          empMap.get(eEmail).completedOnTime += 1;
        }
        empMap.get(eEmail).completed += 1;
      }
    });

    // Compute company totals and individual compliance rates
    let totalCompanyAssigned = 0;
    let totalCompanyOnTime = 0;
    let totalCompanyLate = 0;
    let totalCompanyCompleted = 0;

    let leaderboard = Array.from(empMap.values())
      .filter(emp => emp.assigned > 0 || emp.completed > 0)
      .map(emp => {
        const assigned = Math.max(emp.assigned, emp.completed);
        const missed = Math.max(0, assigned - emp.completed);
        const complianceRate = assigned > 0 ? Math.round((emp.completed / assigned) * 100) : (emp.completed > 0 ? 100 : 0);

        totalCompanyAssigned += assigned;
        totalCompanyOnTime += emp.completedOnTime;
        totalCompanyLate += emp.completedLate;
        totalCompanyCompleted += emp.completed;

        let rating = 'STAR';
        if (complianceRate >= 90) rating = 'STAR';
        else if (complianceRate >= 75) rating = 'RELIABLE';
        else rating = 'AT_RISK';

        return {
          ...emp,
          assigned,
          missed,
          complianceRate,
          rating
        };
      })
      .sort((a, b) => {
        if (b.complianceRate !== a.complianceRate) return b.complianceRate - a.complianceRate;
        if (b.completedOnTime !== a.completedOnTime) return b.completedOnTime - a.completedOnTime;
        return b.completed - a.completed;
      });

    const companyScore = totalCompanyAssigned > 0 ? Math.round((totalCompanyCompleted / totalCompanyAssigned) * 100) : (totalCompanyCompleted > 0 ? 100 : 0);
    const companyMissed = Math.max(0, totalCompanyAssigned - totalCompanyCompleted);

    // Department breakdown
    const deptGroup = new Map();
    leaderboard.forEach(emp => {
      const dept = emp.department || 'General';
      if (!deptGroup.has(dept)) {
        deptGroup.set(dept, { name: dept, totalAssigned: 0, totalCompleted: 0 });
      }
      const entry = deptGroup.get(dept);
      entry.totalAssigned += emp.assigned;
      entry.totalCompleted += emp.completed;
    });

    const departmentStats = Array.from(deptGroup.values()).map(d => ({
      ...d,
      complianceRate: d.totalAssigned > 0 ? Math.round((d.totalCompleted / d.totalAssigned) * 100) : (d.totalCompleted > 0 ? 100 : 0)
    })).sort((a, b) => b.totalAssigned - a.totalAssigned);

    // Filter leaderboard
    if (dashboardSearchEmployee.trim()) {
      const q = dashboardSearchEmployee.toLowerCase().trim();
      leaderboard = leaderboard.filter(e => e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q) || e.department.toLowerCase().includes(q));
    }

    if (dashboardLeaderboardScoreFilter === 'HIGH') {
      leaderboard = leaderboard.filter(e => e.complianceRate >= 90);
    } else if (dashboardLeaderboardScoreFilter === 'MEDIUM') {
      leaderboard = leaderboard.filter(e => e.complianceRate >= 70 && e.complianceRate < 90);
    } else if (dashboardLeaderboardScoreFilter === 'LOW') {
      leaderboard = leaderboard.filter(e => e.complianceRate < 70);
    }

    const templateStatsMap = new Map();
    companyScopeLogs.forEach(l => {
      const tTitle = l.template_title || 'Unknown';
      if (!templateStatsMap.has(tTitle)) {
        templateStatsMap.set(tTitle, { title: tTitle, frequency: l.frequency || 'DAILY', total: 0 });
      }
      const t = templateStatsMap.get(tTitle);
      t.total += 1;
    });

    const topChecklists = Array.from(templateStatsMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return {
      myAssigned,
      myCompleted,
      myMissedToday,
      myScore,
      myChecklistsBreakdown,
      myRecentLogs: myLogs.slice(0, 10),
      totalCompanyAssigned,
      totalCompanyCompleted,
      companyCompleted,
      companyMissed,
      companyScore,
      activeEmployeesCount: leaderboard.length,
      departmentStats,
      leaderboard,
      topChecklists
    };
  }, [
    complianceLogs,
    templates,
    dashboardChecklists,
    employeesList,
    myReportingTeam,
    userEmail,
    dashboardDatePreset,
    dashboardStartDate,
    dashboardEndDate,
    dashboardScope,
    dashboardDeptFilter,
    dashboardSearchEmployee,
    dashboardLeaderboardScoreFilter
  ]);

  // Manual Holidays State
  const [holidaysList, setHolidaysList] = useState([]);
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [holidayForm, setHolidayForm] = useState({ id: null, date: '', name: '', type: 'COMPANY', description: '' });
  const [holidaySearchQuery, setHolidaySearchQuery] = useState('');
  const [savingHoliday, setSavingHoliday] = useState(false);

  // Modals & Drawers
  const [executingChecklist, setExecutingChecklist] = useState(null);
  const [execResponses, setExecResponses] = useState({});
  const [execNotes, setExecNotes] = useState('');
  const [savingSubmission, setSavingSubmission] = useState(false);

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    title: '',
    description: '',
    frequency: 'DAILY',
    department: 'General',
    category: 'OPERATIONS',
    assignment_mode: 'SINGLE',
    assigned_type: 'EMPLOYEE',
    assigned_employee_email: '',
    assigned_employee_name: '',
    due_time: '18:00',
    days_of_week: ['Monday'],
    day_of_month: 1,
    quarter_month: 3,
    half_yearly_month: 6,
    month_of_year: 12,
    items: [
      { id: 'item_1', title: 'Task 1 check', type: 'checkbox', is_required: true, standard_guideline: '' }
    ],
    is_active: true
  });

  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyingSubmission, setVerifyingSubmission] = useState(null);
  const [verifyRemarks, setVerifyRemarks] = useState('');

  // Initial load
  useEffect(() => {
    loadEmployees();
    loadDepartments();
  }, []);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadCompliance();
      loadTemplates();
      loadEmployeeDashboard(dashboardDate);
    } else if (activeTab === 'my_checklists') {
      loadEmployeeDashboard(dashboardDate);
    } else if (activeTab === 'templates') {
      loadTemplates();
    } else if (activeTab === 'compliance') {
      loadCompliance();
    } else if (activeTab === 'holidays') {
      loadHolidays();
    }
  }, [activeTab, selectedFrequency, userEmail, dashboardDate]);

  // Realtime Supabase Subscription for Checklist Submissions & Verification
  useEffect(() => {
    if (!userEmail) return;
    const supabase = createClient();
    const channel = supabase
      .channel('realtime-checklist-submissions-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'checklist_submissions'
        },
        () => {
          // Silently refresh without screen flicker
          if (activeTab === 'my_checklists' || activeTab === 'dashboard') {
            loadEmployeeDashboard(dashboardDate, true);
          }
          if (activeTab === 'compliance') {
            loadCompliance(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userEmail, activeTab, dashboardDate, selectedFrequency]);

  const showNotification = (msg, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 4000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  };

  const loadDepartments = async () => {
    try {
      const res = await getCompanyDepartmentsList();
      if (res.success && Array.isArray(res.data)) {
        setManagedDepartments(res.data);
      }
    } catch (e) {
      console.warn('Could not load company departments from settings master:', e.message);
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

  const loadEmployeeDashboard = async (targetDateStr = dashboardDate, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const targetObj = targetDateStr ? new Date(`${targetDateStr}T12:00:00`) : new Date();
      const res = await getEmployeeChecklistDashboard({
        employeeEmail: userEmail,
        frequency: selectedFrequency,
        targetDate: targetObj
      });
      if (res.success) {
        setDashboardChecklists(res.data || []);
      }
    } catch (e) {
      console.error(e);
      if (!silent) showNotification('Failed to load checklists', true);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await getChecklistTemplates({
        frequency: selectedFrequency === 'ALL' ? undefined : selectedFrequency
      });
      if (res.success) {
        setTemplates(res.data || []);
      }
    } catch (e) {
      console.error(e);
      showNotification('Failed to load checklist templates', true);
    } finally {
      setLoading(false);
    }
  };

  const loadCompliance = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await getChecklistComplianceReport({
        frequency: selectedFrequency === 'ALL' ? undefined : selectedFrequency
      });
      if (res.success) {
        setComplianceLogs(res.data || []);
      }
    } catch (e) {
      console.error(e);
      if (!silent) showNotification('Failed to load compliance report', true);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadHolidays = async () => {
    setLoading(true);
    try {
      const res = await getCompanyHolidays();
      if (res.success) {
        setHolidaysList(res.data || []);
      }
    } catch (e) {
      console.error(e);
      showNotification('Failed to load company holidays', true);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddHoliday = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    setEditingHoliday(null);
    setHolidayForm({ id: null, date: todayStr, name: '', type: 'COMPANY', description: '' });
    setHolidayModalOpen(true);
  };

  const handleOpenEditHoliday = (h) => {
    setEditingHoliday(h);
    setHolidayForm({
      id: h.id || h.date,
      date: h.date,
      name: h.name,
      type: h.type || 'COMPANY',
      description: h.description || ''
    });
    setHolidayModalOpen(true);
  };

  const handleSaveHoliday = async () => {
    if (!holidayForm.date || !holidayForm.name.trim()) {
      showNotification('Please enter both holiday date and holiday name', true);
      return;
    }
    setSavingHoliday(true);
    try {
      const res = await saveCompanyHoliday(holidayForm);
      if (res.success) {
        setHolidaysList(res.data || []);
        setHolidayModalOpen(false);
        showNotification(`🎉 Holiday "${holidayForm.name}" saved successfully!`);
      } else {
        showNotification(res.error || 'Failed to save holiday', true);
      }
    } catch (e) {
      showNotification(e.message, true);
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (h) => {
    if (!window.confirm(`Are you sure you want to delete holiday "${h.name}" (${h.date})?`)) {
      return;
    }
    try {
      const res = await deleteCompanyHoliday(h.id || h.date);
      if (res.success) {
        setHolidaysList(res.data || []);
        showNotification(`🗑️ Holiday "${h.name}" deleted!`);
      } else {
        showNotification(res.error || 'Failed to delete holiday', true);
      }
    } catch (e) {
      showNotification(e.message, true);
    }
  };

  const handleResetHolidays = async () => {
    if (!window.confirm('Reset company holidays to standard National/Gazetted holidays list? Custom added holidays will be overwritten.')) {
      return;
    }
    try {
      const res = await resetCompanyHolidaysToDefault();
      if (res.success) {
        setHolidaysList(res.data || []);
        showNotification('🔄 Restored default national holidays list!');
      } else {
        showNotification(res.error || 'Failed to reset holidays', true);
      }
    } catch (e) {
      showNotification(e.message, true);
    }
  };

  // ==========================================
  // EXECUTION HANDLERS
  // ==========================================

  const handleOpenExecution = (item) => {
    setExecutingChecklist(item);
    setExecResponses(item.submission?.responses || {});
    setExecNotes(item.submission?.submission_notes || '');
  };

  const handleResponseChange = (itemId, val) => {
    setExecResponses(prev => ({
      ...prev,
      [itemId]: val
    }));
  };

  const handleSubmitExecution = async () => {
    if (!executingChecklist) return;

    const tmpl = executingChecklist.template;
    const currentDelayInfo = calculateDelayStatus({
      frequency: tmpl.frequency,
      periodKey: executingChecklist.currentPeriodKey,
      dueTime: executingChecklist.slotInfo?.due_time || tmpl.due_time || '18:00',
      bufferMinutes: executingChecklist.slotInfo?.buffer_minutes || tmpl.buffer_minutes || 20,
      dayOfMonth: tmpl.day_of_month || 1,
      monthOfYear: tmpl.month_of_year || 12,
      quarterMonth: tmpl.quarter_month || 3,
      halfYearlyMonth: tmpl.half_yearly_month || 6,
      submittedAt: null,
      isCompleted: false,
      allowDelayedSubmission: tmpl.allow_delayed_submission,
      now: new Date()
    });

    if (currentDelayInfo.isExpired) {
      showNotification(`❌ Submission Window Closed: This checklist slot closed at ${currentDelayInfo.formattedExpire || 'deadline'}. Expired checklists cannot be submitted.`, true);
      return;
    }
    if (currentDelayInfo.isBeforeStart) {
      showNotification(`🔒 Checklist is Locked: This checklist slot opens at ${currentDelayInfo.formattedStart || 'start time'}.`, true);
      return;
    }

    setSavingSubmission(true);

    try {
      const tmpl = executingChecklist.template;
      const res = await submitChecklistResponse({
        id: executingChecklist.submission?.id,
        template_id: tmpl.id,
        template_title: tmpl.title,
        frequency: tmpl.frequency,
        period_key: executingChecklist.currentPeriodKey,
        employee_name: userName || 'Employee',
        employee_email: userEmail,
        department: tmpl.department || 'General',
        responses: execResponses,
        submission_notes: execNotes,
        items: executingChecklist.items
      });

      if (res.success) {
        // Instant Realtime Optimistic State Update
        const stats = calculateChecklistCompletion(executingChecklist.items, execResponses);
        const status = stats.isAllDone ? 'COMPLETED' : 'PARTIAL';
        const savedSub = res.data || {
          id: executingChecklist.submission?.id || 'temp_sub',
          status,
          responses: execResponses,
          submission_notes: execNotes,
          items_completed_count: stats.completedCount,
          items_total_count: stats.totalCount,
          submitted_at: new Date().toISOString()
        };

        setDashboardChecklists(prev => prev.map(item => {
          if (item.template.id === tmpl.id && item.currentPeriodKey === executingChecklist.currentPeriodKey) {
            return {
              ...item,
              submission: savedSub,
              status,
              stats
            };
          }
          return item;
        }));

        showNotification('✅ Checklist completed and submitted successfully!');
        setExecutingChecklist(null);

        // Silent background sync - no screen flicker or reload
        loadEmployeeDashboard(dashboardDate, true);
      } else {
        showNotification(res.error || 'Failed to submit checklist', true);
      }
    } catch (e) {
      showNotification(e.message, true);
    } finally {
      setSavingSubmission(false);
    }
  };

  // ==========================================
  // TEMPLATE BUILDER HANDLERS
  // ==========================================

  const handleOpenNewTemplate = () => {
    setEditingTemplate(null);
    const initialFreq = selectedFrequency === 'ALL' ? 'DAILY' : selectedFrequency;
    setTemplateForm({
      title: '',
      description: '',
      frequency: initialFreq,
      department: 'General',
      category: 'OPERATIONS',
      assignment_mode: 'SINGLE',
      assigned_type: 'EMPLOYEE',
      assigned_employee_email: userEmail || '',
      assigned_employee_name: userName || '',
      daily_repetition_count: 1,
      daily_slots: generateDefaultDailySlots(1),
      due_time: '18:00',
      buffer_minutes: 20,
      allow_delayed_submission: false,
      days_of_week: ['Monday'],
      day_of_month: 1,
      quarter_month: 3,
      half_yearly_month: 6,
      month_of_year: 12,
      include_sundays: true,
      include_holidays: false,
      items: [
        { id: `item_${Date.now()}_1`, title: 'Check equipment status', type: 'done_not_done', is_required: true, standard_guideline: '' },
        { id: `item_${Date.now()}_2`, title: 'Upload cleanliness photo', type: 'photo', is_required: false, standard_guideline: '' }
      ],
      status: 'ACTIVE',
      is_active: true
    });
    setTemplateModalOpen(true);
  };

  const handleEditTemplate = (tmpl) => {
    setEditingTemplate(tmpl);
    let assignmentMode = 'SINGLE';
    if (tmpl.assigned_type === 'ALL') {
      assignmentMode = 'ALL';
    } else if (tmpl.assigned_employee_email && tmpl.assigned_employee_email.includes(',')) {
      assignmentMode = 'MULTI';
    }

    const currentStatus = (tmpl.status || (tmpl.is_active ? 'ACTIVE' : 'INACTIVE')).toUpperCase();
    const scheduleConfig = tmpl.schedule_config || {};
    const repCount = tmpl.daily_repetition_count || scheduleConfig.daily_repetition_count || 1;
    const dailySlots = (Array.isArray(tmpl.daily_slots) && tmpl.daily_slots.length > 0)
      ? tmpl.daily_slots
      : (Array.isArray(scheduleConfig.daily_slots) && scheduleConfig.daily_slots.length > 0
        ? scheduleConfig.daily_slots
        : generateDefaultDailySlots(repCount));

    const daysOfWeek = tmpl.days_of_week || scheduleConfig.days_of_week || ['Monday'];
    const dayOfMonth = tmpl.day_of_month || scheduleConfig.day_of_month || 1;
    const quarterMonth = tmpl.quarter_month || scheduleConfig.quarter_month || 3;
    const halfYearlyMonth = tmpl.half_yearly_month || scheduleConfig.half_yearly_month || 6;
    const monthOfYear = tmpl.month_of_year || scheduleConfig.month_of_year || 12;
    const includeSundays = tmpl.include_sundays !== undefined ? (tmpl.include_sundays === true || tmpl.include_sundays === 'true') : (scheduleConfig.include_sundays !== undefined ? (scheduleConfig.include_sundays === true || scheduleConfig.include_sundays === 'true') : true);
    const includeHolidays = tmpl.include_holidays !== undefined ? (tmpl.include_holidays === true || tmpl.include_holidays === 'true') : (scheduleConfig.include_holidays !== undefined ? (scheduleConfig.include_holidays === true || scheduleConfig.include_holidays === 'true') : false);
    const bufferMinutes = parseInt(tmpl.buffer_minutes || scheduleConfig.buffer_minutes, 10) || 20;
    const allowDelayedSubmission = tmpl.allow_delayed_submission !== undefined ? Boolean(tmpl.allow_delayed_submission) : Boolean(scheduleConfig.allow_delayed_submission);

    setTemplateForm({
      id: tmpl.id,
      title: tmpl.title,
      description: tmpl.description || '',
      frequency: tmpl.frequency || 'DAILY',
      department: tmpl.department || 'General',
      category: tmpl.category || 'OPERATIONS',
      assignment_mode: assignmentMode,
      assigned_type: tmpl.assigned_type || 'EMPLOYEE',
      assigned_employee_email: tmpl.assigned_employee_email || '',
      assigned_employee_name: tmpl.assigned_employee_name || '',
      daily_repetition_count: repCount,
      daily_slots: dailySlots,
      due_time: tmpl.due_time || (dailySlots[0]?.due_time || '18:00'),
      buffer_minutes: bufferMinutes,
      allow_delayed_submission: allowDelayedSubmission,
      days_of_week: daysOfWeek,
      day_of_month: dayOfMonth,
      quarter_month: quarterMonth,
      half_yearly_month: halfYearlyMonth,
      month_of_year: monthOfYear,
      include_sundays: includeSundays,
      include_holidays: includeHolidays,
      items: tmpl.items && tmpl.items.length > 0 ? tmpl.items : [
        { id: `item_${Date.now()}_1`, title: 'Check item', type: 'done_not_done', is_required: true, standard_guideline: '' }
      ],
      status: currentStatus,
      is_active: currentStatus === 'ACTIVE'
    });
    setTemplateModalOpen(true);
  };

  const handleAddItemToTemplate = () => {
    setTemplateForm(prev => ({
      ...prev,
      items: [
        ...(prev.items || []),
        { id: `item_${Date.now()}_${(prev.items || []).length + 1}`, title: '', type: 'done_not_done', is_required: true, standard_guideline: '' }
      ]
    }));
  };

  const handleUpdateTemplateItem = (index, field, value) => {
    setTemplateForm(prev => {
      const updated = [...(prev.items || [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, items: updated };
    });
  };

  const handleRemoveTemplateItem = (index) => {
    setTemplateForm(prev => ({
      ...prev,
      items: (prev.items || []).filter((_, i) => i !== index)
    }));
  };

  const handleRemoveItemFromTemplate = (itemId) => {
    setTemplateForm(prev => ({
      ...prev,
      items: (prev.items || []).filter(it => it.id !== itemId)
    }));
  };

  const handleCopyTemplate = (tmpl) => {
    setEditingTemplate(null);
    let assignmentMode = 'SINGLE';
    if (tmpl.assigned_type === 'ALL') {
      assignmentMode = 'ALL';
    } else if (tmpl.assigned_employee_email && tmpl.assigned_employee_email.includes(',')) {
      assignmentMode = 'MULTI';
    }

    const scheduleConfig = tmpl.schedule_config || {};
    const repCount = tmpl.daily_repetition_count || scheduleConfig.daily_repetition_count || 1;
    const dailySlots = (Array.isArray(tmpl.daily_slots) && tmpl.daily_slots.length > 0)
      ? tmpl.daily_slots
      : (Array.isArray(scheduleConfig.daily_slots) && scheduleConfig.daily_slots.length > 0
        ? scheduleConfig.daily_slots
        : generateDefaultDailySlots(repCount));

    const daysOfWeek = tmpl.days_of_week || scheduleConfig.days_of_week || ['Monday'];
    const dayOfMonth = tmpl.day_of_month || scheduleConfig.day_of_month || 1;
    const quarterMonth = tmpl.quarter_month || scheduleConfig.quarter_month || 3;
    const halfYearlyMonth = tmpl.half_yearly_month || scheduleConfig.half_yearly_month || 6;
    const monthOfYear = tmpl.month_of_year || scheduleConfig.month_of_year || 12;
    const includeSundays = tmpl.include_sundays !== undefined ? (tmpl.include_sundays === true || tmpl.include_sundays === 'true') : (scheduleConfig.include_sundays !== undefined ? (scheduleConfig.include_sundays === true || scheduleConfig.include_sundays === 'true') : true);
    const includeHolidays = tmpl.include_holidays !== undefined ? (tmpl.include_holidays === true || tmpl.include_holidays === 'true') : (scheduleConfig.include_holidays !== undefined ? (scheduleConfig.include_holidays === true || scheduleConfig.include_holidays === 'true') : false);
    const bufferMinutes = parseInt(tmpl.buffer_minutes || scheduleConfig.buffer_minutes, 10) || 20;
    const allowDelayedSubmission = tmpl.allow_delayed_submission !== undefined ? Boolean(tmpl.allow_delayed_submission) : Boolean(scheduleConfig.allow_delayed_submission);

    setTemplateForm({
      title: `${tmpl.title} (Copy)`,
      description: tmpl.description || '',
      frequency: tmpl.frequency || 'DAILY',
      department: tmpl.department || 'General',
      category: tmpl.category || 'OPERATIONS',
      assignment_mode: assignmentMode,
      assigned_type: tmpl.assigned_type || 'EMPLOYEE',
      assigned_employee_email: tmpl.assigned_employee_email || '',
      assigned_employee_name: tmpl.assigned_employee_name || '',
      daily_repetition_count: repCount,
      daily_slots: dailySlots,
      due_time: tmpl.due_time || (dailySlots[0]?.due_time || '18:00'),
      buffer_minutes: bufferMinutes,
      allow_delayed_submission: allowDelayedSubmission,
      days_of_week: daysOfWeek,
      day_of_month: dayOfMonth,
      quarter_month: quarterMonth,
      half_yearly_month: halfYearlyMonth,
      month_of_year: monthOfYear,
      include_sundays: includeSundays,
      include_holidays: includeHolidays,
      items: (tmpl.items || []).map((it, idx) => ({
        ...it,
        id: `item_${Date.now()}_${idx + 1}`
      })),
      status: 'ACTIVE',
      is_active: true
    });
    showNotification(`📋 Template cloned! Modify Title, Schedule, Cutoff Time or Questions and save.`);
    setTemplateModalOpen(true);
  };

  const handleSetStatus = async (tmpl, newStatus) => {
    const statusClean = String(newStatus).toUpperCase();
    const isActive = statusClean === 'ACTIVE';

    // Optimistic update
    setTemplates(prev => prev.map(t => t.id === tmpl.id ? { ...t, status: statusClean, is_active: isActive } : t));
    setTogglingStatusId(tmpl.id);
    try {
      const res = await setChecklistTemplateStatus(tmpl.id, statusClean);
      if (res.success) {
        showNotification(`Template set to ${statusClean === 'ACTIVE' ? '🟢 Active' : statusClean === 'DRAFT' ? '📝 Draft' : '🔴 Inactive'}`);
        loadEmployeeDashboard();
      } else {
        // Revert
        setTemplates(prev => prev.map(t => t.id === tmpl.id ? { ...t, status: tmpl.status, is_active: tmpl.is_active } : t));
        showNotification(res.error || 'Failed to update status', true);
      }
    } catch (e) {
      setTemplates(prev => prev.map(t => t.id === tmpl.id ? { ...t, status: tmpl.status, is_active: tmpl.is_active } : t));
      showNotification(e.message, true);
    } finally {
      setTogglingStatusId(null);
    }
  };

  const handleSaveTemplate = async (explicitStatus = null) => {
    if (!templateForm.title.trim()) {
      showNotification('Please enter a template title', true);
      return;
    }
    if (templateForm.items.length === 0) {
      showNotification('Please add at least 1 checklist question/item', true);
      return;
    }

    const finalStatus = (explicitStatus || templateForm.status || 'ACTIVE').toUpperCase();
    const isActive = finalStatus === 'ACTIVE';

    try {
      const res = await saveChecklistTemplate({
        ...templateForm,
        id: editingTemplate?.id,
        status: finalStatus,
        is_active: isActive,
        created_by: userName
      });

      if (res.success) {
        const statusMsg = finalStatus === 'ACTIVE' ? '✅ Published as Active!' : finalStatus === 'DRAFT' ? '📝 Saved as Draft!' : '🔴 Saved as Inactive!';
        showNotification(statusMsg);
        setTemplateModalOpen(false);
        loadTemplates();
        loadEmployeeDashboard();
      } else {
        showNotification(res.error || 'Failed to save template', true);
      }
    } catch (e) {
      showNotification(e.message, true);
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Are you sure you want to delete this checklist template?')) return;
    try {
      const res = await deleteChecklistTemplate(id);
      if (res.success) {
        showNotification('Template deleted');
        loadTemplates();
        loadEmployeeDashboard();
      }
    } catch (e) {
      showNotification(e.message, true);
    }
  };

  // ==========================================
  // VERIFICATION HANDLERS
  // ==========================================

  const handleOpenVerify = (sub) => {
    setVerifyingSubmission(sub);
    setVerifyRemarks('');
    setVerifyModalOpen(true);
  };

  const handleSaveVerification = async (status) => {
    if (!verifyingSubmission) return;
    try {
      const res = await verifyChecklistSubmission({
        submissionId: verifyingSubmission.id,
        verificationStatus: status,
        verifiedBy: userName,
        verificationRemarks: verifyRemarks
      });

      if (res.success) {
        showNotification(`Checklist marked as ${status}`);
        setVerifyModalOpen(false);
        loadCompliance();
      }
    } catch (e) {
      showNotification(e.message, true);
    }
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
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
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
            <span style={{ fontSize: '1.75rem' }}>📋</span>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Smart Checklist Management</h1>
          </div>
          <p style={{ margin: 0, opacity: 0.85, fontSize: '0.9rem' }}>
            Daily, Weekly, 15-Day, Monthly, Quarterly, 6-Month, & 1-Year Recurring Operations Engine
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {isManager && (
            <button
              onClick={handleOpenNewTemplate}
              style={{
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                padding: '0.6rem 1.2rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Plus size={18} /> Create Template
            </button>
          )}
          <button
            onClick={() => {
              if (activeTab === 'dashboard') {
                loadCompliance();
                loadTemplates();
                loadEmployeeDashboard();
              } else if (activeTab === 'my_checklists') {
                loadEmployeeDashboard();
              } else if (activeTab === 'templates') {
                loadTemplates();
              } else if (activeTab === 'compliance') {
                loadCompliance();
              } else {
                loadHolidays();
              }
            }}
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

      {/* Main Tab Navigation */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => handleTabChange('dashboard')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.6rem 1.2rem',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            borderBottom: activeTab === 'dashboard' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'dashboard' ? '#3b82f6' : 'var(--text-secondary, #64748b)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <TrendingUp size={18} /> Checklist Dashboard
        </button>

        <button
          onClick={() => handleTabChange('my_checklists')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.6rem 1.2rem',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            borderBottom: activeTab === 'my_checklists' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'my_checklists' ? '#3b82f6' : 'var(--text-secondary, #64748b)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <CheckSquare size={18} /> My Checklists
        </button>

        {canAccessTemplates && (
          <button
            onClick={() => handleTabChange('templates')}
            style={{
              background: 'none',
              border: 'none',
              padding: '0.6rem 1.2rem',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer',
              borderBottom: activeTab === 'templates' ? '3px solid #3b82f6' : '3px solid transparent',
              color: activeTab === 'templates' ? '#3b82f6' : 'var(--text-secondary, #64748b)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Layers size={18} /> Templates Master
          </button>
        )}

        {canAccessCompliance && (
          <button
            onClick={() => handleTabChange('compliance')}
            style={{
              background: 'none',
              border: 'none',
              padding: '0.6rem 1.2rem',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer',
              borderBottom: activeTab === 'compliance' ? '3px solid #3b82f6' : '3px solid transparent',
              color: activeTab === 'compliance' ? '#3b82f6' : 'var(--text-secondary, #64748b)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <ShieldCheck size={18} /> Compliance & Verification
          </button>
        )}

        <button
          onClick={() => handleTabChange('holidays')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.6rem 1.2rem',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
            borderBottom: activeTab === 'holidays' ? '3px solid #f59e0b' : '3px solid transparent',
            color: activeTab === 'holidays' ? '#f59e0b' : 'var(--text-secondary, #64748b)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span>🎉</span> Holidays Calendar
        </button>
      </div>

      {/* Frequency Pill Bar (for My Checklists, Templates, Compliance) */}
      {activeTab !== 'dashboard' && activeTab !== 'holidays' && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginRight: '0.5rem' }}>
            Schedule Frequencies:
          </span>

          {/* ALL CHECKLISTS PILL TAB */}
          <button
            onClick={() => setSelectedFrequency('ALL')}
            style={{
              background: selectedFrequency === 'ALL' ? '#6366f1' : 'var(--bg-secondary, #f8fafc)',
              color: selectedFrequency === 'ALL' ? '#ffffff' : 'var(--text-primary, #1e293b)',
              border: selectedFrequency === 'ALL' ? '1px solid #6366f1' : '1px solid var(--border-color, #e2e8f0)',
              padding: '0.45rem 0.95rem',
              borderRadius: '20px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease',
              boxShadow: selectedFrequency === 'ALL' ? '0 2px 5px rgba(99,102,241,0.3)' : 'none'
            }}
          >
            <span>📋</span>
            <span>All Checklists</span>
          </button>

          {FREQUENCIES_CONFIG.map(freq => {
            const isSelected = selectedFrequency === freq.id;
            return (
              <button
                key={freq.id}
                onClick={() => setSelectedFrequency(freq.id)}
                style={{
                  background: isSelected ? freq.badgeColor : 'var(--bg-secondary, #f8fafc)',
                  color: isSelected ? '#ffffff' : 'var(--text-primary, #1e293b)',
                  border: isSelected ? `1px solid ${freq.badgeColor}` : '1px solid var(--border-color, #e2e8f0)',
                  padding: '0.45rem 0.9rem',
                  borderRadius: '20px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? `0 2px 5px ${freq.badgeColor}35` : 'none'
                }}
              >
                <span>{freq.icon}</span>
                <span>{freq.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 0: CHECKLIST DASHBOARD (PERFORMANCE & ANALYTICS)                      */}
      {/* ========================================================================= */}
      {activeTab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Top Filter & Scope Header */}
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: '12px',
            padding: '1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TrendingUp size={22} color="#3b82f6" /> Checklist Performance & Compliance Analytics
              </h2>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
                {dashboardScope === 'MY_PERFORMANCE'
                  ? `Personal compliance score, on-time punctuality & completion rate for ${userName}`
                  : `Company-wide accountability overview, team rankings & department compliance`}
              </p>
            </div>

            {/* Controls: Scope Switcher & Timeframe Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {/* Scope Switcher (for Admin/Manager) */}
              {isManager && (
                <div style={{ display: 'flex', background: 'var(--bg-secondary, #f1f5f9)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)' }}>
                  <button
                    type="button"
                    onClick={() => setDashboardScope('COMPANY_WIDE')}
                    style={{
                      background: dashboardScope === 'COMPANY_WIDE' ? '#3b82f6' : 'transparent',
                      color: dashboardScope === 'COMPANY_WIDE' ? '#ffffff' : 'var(--text-secondary, #64748b)',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <Building size={14} /> Company
                  </button>
                  {isReportingManager && (
                    <button
                      type="button"
                      onClick={() => setDashboardScope('MY_TEAM')}
                      style={{
                        background: dashboardScope === 'MY_TEAM' ? '#3b82f6' : 'transparent',
                        color: dashboardScope === 'MY_TEAM' ? '#ffffff' : 'var(--text-secondary, #64748b)',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem'
                      }}
                    >
                      <User size={14} /> My Team
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDashboardScope('MY_PERFORMANCE')}
                    style={{
                      background: dashboardScope === 'MY_PERFORMANCE' ? '#3b82f6' : 'transparent',
                      color: dashboardScope === 'MY_PERFORMANCE' ? '#ffffff' : 'var(--text-secondary, #64748b)',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <Award size={14} /> My Score
                  </button>
                </div>
              )}

              {/* Quick Date Presets DateRangePicker */}
              <DateRangePicker
                preset={dashboardDatePreset}
                startDate={dashboardStartDate}
                endDate={dashboardEndDate}
                allowAllTime={true}
                title="Select Performance Date Range"
                onChange={({ preset, startDate, endDate }) => {
                  setDashboardDatePreset(preset);
                  setDashboardStartDate(startDate);
                  setDashboardEndDate(endDate);
                }}
              />

              {/* Department filter (when Company mode) */}
              {dashboardScope === 'COMPANY_WIDE' && availableDepartments.length > 0 && (
                <select
                  value={dashboardDeptFilter}
                  onChange={(e) => setDashboardDeptFilter(e.target.value)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-secondary, #f8fafc)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: 'var(--text-primary, #1e293b)'
                  }}
                >
                  <option value="ALL">All Departments</option>
                  {availableDepartments.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* KPI METRIC CARDS ROW */}
          {dashboardScope === 'MY_PERFORMANCE' ? (
            /* 1. PERSONAL METRIC CARDS (EMPLOYEE VIEW) */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              {/* Card 1: My Compliance Score */}
              <div style={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                border: '1px solid #bfdbfe',
                borderRadius: '12px',
                padding: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                boxShadow: '0 2px 5px rgba(59,130,246,0.08)'
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>🏆 MY COMPLIANCE SCORE</span>
                  <span style={{ fontSize: '0.75rem', background: '#3b82f6', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: '12px' }}>
                    {analyticsData.myScore >= 90 ? '🌟 Star' : analyticsData.myScore >= 75 ? '👍 Good' : '🚨 Low'}
                  </span>
                </div>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#1d4ed8' }}>
                  {analyticsData.myScore}%
                </div>
                <div style={{ width: '100%', height: '7px', background: '#bfdbfe', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${analyticsData.myScore}%`,
                    height: '100%',
                    background: analyticsData.myScore >= 90 ? '#16a34a' : analyticsData.myScore >= 75 ? '#f59e0b' : '#dc2626',
                    transition: 'width 0.4s ease'
                  }} />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#1e40af', marginTop: '0.2rem' }}>
                  {analyticsData.myCompleted} completed out of {analyticsData.myAssigned} assigned
                </div>
              </div>

              {/* Card 2: Total Assigned */}
              <div style={{
                background: 'var(--card-bg, #ffffff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '12px',
                padding: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Layers size={16} color="#3b82f6" /> MY ASSIGNED SLOTS
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                  {analyticsData.myAssigned}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                  Scheduled slots for you
                </div>
              </div>

              {/* Card 3: Completed On-Time */}
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '12px',
                padding: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CheckCircle2 size={16} color="#16a34a" /> COMPLETED ON-TIME
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#15803d' }}>
                  {analyticsData.myCompletedOnTime}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#166534' }}>
                  Submitted within buffer window
                </div>
              </div>

              {/* Card 4: Completed Late */}
              <div style={{
                background: analyticsData.myCompletedLate > 0 ? '#fffbeb' : 'var(--bg-secondary, #f8fafc)',
                border: analyticsData.myCompletedLate > 0 ? '1.5px solid #fde68a' : '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '12px',
                padding: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: analyticsData.myCompletedLate > 0 ? '#92400e' : 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Clock size={16} color={analyticsData.myCompletedLate > 0 ? '#d97706' : '#94a3b8'} /> COMPLETED LATE
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: analyticsData.myCompletedLate > 0 ? '#d97706' : 'var(--text-primary, #0f172a)' }}>
                  {analyticsData.myCompletedLate}
                </div>
                <div style={{ fontSize: '0.75rem', color: analyticsData.myCompletedLate > 0 ? '#78350f' : 'var(--text-secondary, #64748b)' }}>
                  Submitted past buffer window
                </div>
              </div>

              {/* Card 5: Missed / Expired Slots */}
              <div style={{
                background: analyticsData.myMissedToday > 0 ? '#fef2f2' : 'var(--bg-secondary, #f8fafc)',
                border: analyticsData.myMissedToday > 0 ? '1.5px solid #fca5a5' : '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '12px',
                padding: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: analyticsData.myMissedToday > 0 ? '#991b1b' : 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <AlertTriangle size={16} color={analyticsData.myMissedToday > 0 ? '#dc2626' : '#94a3b8'} /> MISSED / EXPIRED
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: analyticsData.myMissedToday > 0 ? '#dc2626' : 'var(--text-primary, #0f172a)' }}>
                  {analyticsData.myMissedToday}
                </div>
                <div style={{ fontSize: '0.75rem', color: analyticsData.myMissedToday > 0 ? '#b91c1c' : 'var(--text-secondary, #64748b)' }}>
                  Slots expired without submission
                </div>
              </div>
            </div>
          ) : (
            /* 2. COMPANY / TEAM METRIC CARDS (ADMIN & MANAGER VIEW) */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              {/* Card 1: Company Compliance Score */}
              <div style={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                border: '1px solid #bfdbfe',
                borderRadius: '12px',
                padding: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                boxShadow: '0 2px 5px rgba(59,130,246,0.08)'
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>🏢 OVERALL COMPLIANCE</span>
                  <span style={{ fontSize: '0.75rem', background: '#3b82f6', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: '12px' }}>
                    {analyticsData.companyScore >= 90 ? '🌟 Healthy' : analyticsData.companyScore >= 75 ? '⚠️ Moderate' : '🚨 Critical'}
                  </span>
                </div>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#1d4ed8' }}>
                  {analyticsData.companyScore}%
                </div>
                <div style={{ width: '100%', height: '7px', background: '#bfdbfe', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${analyticsData.companyScore}%`,
                    height: '100%',
                    background: analyticsData.companyScore >= 90 ? '#16a34a' : analyticsData.companyScore >= 75 ? '#f59e0b' : '#dc2626',
                    transition: 'width 0.4s ease'
                  }} />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#1e40af', marginTop: '0.2rem' }}>
                  {analyticsData.companyCompleted} done / {analyticsData.totalCompanyAssigned} assigned
                </div>
              </div>

              {/* Card 2: Total Assigned */}
              <div style={{
                background: 'var(--card-bg, #ffffff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '12px',
                padding: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Layers size={16} color="#3b82f6" /> TOTAL ASSIGNED SLOTS
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                  {analyticsData.totalCompanyAssigned}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                  Across all active staff
                </div>
              </div>

              {/* Card 3: Total On-Time Completed */}
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '12px',
                padding: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CheckCircle2 size={16} color="#16a34a" /> ON-TIME SUBMISSIONS
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#15803d' }}>
                  {analyticsData.totalCompanyOnTime}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#166534' }}>
                  Completed inside buffer window
                </div>
              </div>

              {/* Card 4: Total Late Completed */}
              <div style={{
                background: analyticsData.totalCompanyLate > 0 ? '#fffbeb' : 'var(--bg-secondary, #f8fafc)',
                border: analyticsData.totalCompanyLate > 0 ? '1.5px solid #fde68a' : '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '12px',
                padding: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: analyticsData.totalCompanyLate > 0 ? '#92400e' : 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Clock size={16} color={analyticsData.totalCompanyLate > 0 ? '#d97706' : '#94a3b8'} /> LATE / DELAYED
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: analyticsData.totalCompanyLate > 0 ? '#d97706' : 'var(--text-primary, #0f172a)' }}>
                  {analyticsData.totalCompanyLate}
                </div>
                <div style={{ fontSize: '0.75rem', color: analyticsData.totalCompanyLate > 0 ? '#78350f' : 'var(--text-secondary, #64748b)' }}>
                  Submitted after buffer window
                </div>
              </div>

              {/* Card 5: Total Missed */}
              <div style={{
                background: analyticsData.companyMissed > 0 ? '#fef2f2' : 'var(--bg-secondary, #f8fafc)',
                border: analyticsData.companyMissed > 0 ? '1.5px solid #fca5a5' : '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '12px',
                padding: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: analyticsData.companyMissed > 0 ? '#991b1b' : 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <AlertTriangle size={16} color={analyticsData.companyMissed > 0 ? '#dc2626' : '#94a3b8'} /> TOTAL MISSED SLOTS
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: analyticsData.companyMissed > 0 ? '#dc2626' : 'var(--text-primary, #0f172a)' }}>
                  {analyticsData.companyMissed}
                </div>
                <div style={{ fontSize: '0.75rem', color: analyticsData.companyMissed > 0 ? '#b91c1c' : 'var(--text-secondary, #64748b)' }}>
                  Expired without filling
                </div>
              </div>

              {/* Card 6: Active Participating Employees */}
              <div style={{
                background: 'var(--bg-secondary, #f8fafc)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '12px',
                padding: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <User size={16} color="#6366f1" /> ASSIGNED STAFF
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                  {analyticsData.activeEmployeesCount}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                  Employees with checklists
                </div>
              </div>
            </div>
          )}

          {/* MIDDLE SECTION: BREAKDOWN CARDS */}
          {dashboardScope === 'MY_PERFORMANCE' ? (
            /* Personal Breakdown Table & Recent Activity */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
              {/* Left: My Checklists Breakdown */}
              <div style={{
                background: 'var(--card-bg, #ffffff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '12px',
                padding: '1.25rem',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>📋</span> My Checklists Performance Breakdown
                </h3>

                {analyticsData.myChecklistsBreakdown.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary, #64748b)', fontSize: '0.88rem' }}>
                    No submission history recorded in this timeframe.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {analyticsData.myChecklistsBreakdown.map((item, idx) => (
                      <div key={idx} style={{
                        background: 'var(--bg-secondary, #f8fafc)',
                        border: '1px solid var(--border-color, #e2e8f0)',
                        borderRadius: '8px',
                        padding: '0.75rem 1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary, #0f172a)' }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.15rem' }}>
                            {item.frequency} • {item.department} • Total: {item.total} runs
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                          <span style={{
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            color: '#16a34a'
                          }}>
                            {item.total} Completed
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: My Recent Activity Timeline */}
              <div style={{
                background: 'var(--card-bg, #ffffff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '12px',
                padding: '1.25rem',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>🕒</span> My Recent Execution History
                </h3>

                {analyticsData.myRecentLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary, #64748b)', fontSize: '0.88rem' }}>
                    No recent submissions found.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {analyticsData.myRecentLogs.map((log, idx) => (
                      <div key={idx} style={{
                        borderLeft: '3px solid #10b981',
                        background: 'var(--bg-secondary, #f8fafc)',
                        padding: '0.6rem 0.85rem',
                        borderRadius: '0 8px 8px 0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary, #0f172a)' }}>
                            {log.template_title || 'Checklist Execution'}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.1rem' }}>
                            {log.submitted_at ? new Date(log.submitted_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                          </div>
                        </div>

                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '12px',
                          background: '#dcfce7',
                          color: '#166534'
                        }}>
                          ✓ Completed
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Company / Team Visualizations */
            <>
              {/* Department Compliance Grid & Delay Bottlenecks */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
                {/* Department Compliance Distribution */}
                <div style={{
                  background: 'var(--card-bg, #ffffff)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                }}>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Building size={18} color="#3b82f6" /> Department-wise Executions
                  </h3>

                  {analyticsData.departmentStats.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary, #64748b)', fontSize: '0.88rem' }}>
                      No department data available in this timeframe.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {analyticsData.departmentStats.map((dept, idx) => (
                        <div key={idx} style={{
                          background: 'var(--bg-secondary, #f8fafc)',
                          border: '1px solid var(--border-color, #e2e8f0)',
                          borderRadius: '8px',
                          padding: '0.75rem 1rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.35rem'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary, #0f172a)' }}>
                              🏢 {dept.name}
                            </span>
                            <span style={{
                              fontWeight: 800,
                              fontSize: '0.85rem',
                              color: dept.complianceRate >= 90 ? '#16a34a' : dept.complianceRate >= 75 ? '#f59e0b' : '#dc2626'
                            }}>
                              {dept.totalCompleted} / {dept.totalAssigned} ({dept.complianceRate}%)
                            </span>
                          </div>

                          <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${dept.complianceRate}%`,
                              height: '100%',
                              background: dept.complianceRate >= 90 ? '#16a34a' : dept.complianceRate >= 75 ? '#f59e0b' : '#dc2626',
                              transition: 'width 0.3s ease'
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top Active Checklists */}
                <div style={{
                  background: 'var(--card-bg, #ffffff)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                }}>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Layers size={18} color="#3b82f6" /> Top Executed Checklist Templates
                  </h3>

                  {analyticsData.topChecklists.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary, #64748b)', fontSize: '0.88rem' }}>
                      No checklists recorded in this timeframe.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {analyticsData.topChecklists.map((item, idx) => (
                        <div key={idx} style={{
                          background: 'var(--bg-secondary, #f8fafc)',
                          border: '1px solid var(--border-color, #e2e8f0)',
                          borderRadius: '8px',
                          padding: '0.75rem 1rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary, #0f172a)' }}>
                              {item.title}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.1rem' }}>
                              Frequency: {item.frequency}
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <span style={{
                              fontSize: '0.78rem',
                              fontWeight: 800,
                              background: '#dcfce7',
                              color: '#166534',
                              padding: '0.25rem 0.6rem',
                              borderRadius: '12px'
                            }}>
                              {item.total} Done
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* BOTTOM SECTION: EMPLOYEE COMPLIANCE LEADERBOARD TABLE */}
              <div style={{
                background: 'var(--card-bg, #ffffff)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '12px',
                padding: '1.25rem',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Award size={20} color="#f59e0b" /> Employee Compliance Leaderboard & Accountability Ranking
                    </h3>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>
                      Rankings based on on-time checklist completion vs total assigned slots in the selected timeframe
                    </p>
                  </div>

                  {/* Search and score filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Search size={14} style={{ position: 'absolute', left: '0.6rem', color: '#94a3b8' }} />
                      <input
                        type="text"
                        placeholder="Search employee..."
                        value={dashboardSearchEmployee}
                        onChange={(e) => setDashboardSearchEmployee(e.target.value)}
                        style={{
                          padding: '0.4rem 0.65rem 0.4rem 1.8rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color, #cbd5e1)',
                          background: 'var(--bg-secondary, #f8fafc)',
                          fontSize: '0.82rem',
                          color: 'var(--text-primary, #1e293b)'
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', background: 'var(--bg-secondary, #f1f5f9)', padding: '0.15rem', borderRadius: '6px' }}>
                      {[
                        { id: 'ALL', label: 'All Staff' },
                        { id: 'HIGH', label: '⭐ >90%' },
                        { id: 'MEDIUM', label: '⚠️ 70-90%' },
                        { id: 'LOW', label: '🚨 <70%' }
                      ].map(f => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setDashboardLeaderboardScoreFilter(f.id)}
                          style={{
                            background: dashboardLeaderboardScoreFilter === f.id ? '#ffffff' : 'transparent',
                            color: dashboardLeaderboardScoreFilter === f.id ? '#0f172a' : 'var(--text-secondary, #64748b)',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {analyticsData.leaderboard.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary, #64748b)', fontSize: '0.88rem' }}>
                    No employee submission records found matching your filters.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-secondary, #f8fafc)', borderBottom: '2px solid var(--border-color, #e2e8f0)' }}>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary, #64748b)' }}>RANK</th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary, #64748b)' }}>EMPLOYEE</th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary, #64748b)' }}>DEPARTMENT</th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary, #64748b)', textAlign: 'center' }}>ASSIGNED</th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#166534', textAlign: 'center' }}>🟢 ON-TIME</th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#92400e', textAlign: 'center' }}>⚠️ DELAYED</th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#991b1b', textAlign: 'center' }}>❌ MISSED</th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary, #64748b)' }}>COMPLIANCE SCORE</th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary, #64748b)', textAlign: 'center' }}>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.leaderboard.map((emp, idx) => {
                          const rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                          return (
                            <tr key={emp.email} style={{
                              borderBottom: '1px solid var(--border-color, #f1f5f9)',
                              transition: 'background 0.15s ease'
                            }}>
                              <td style={{ padding: '0.75rem 1rem', fontWeight: 800, fontSize: '0.9rem' }}>
                                {rankIcon}
                              </td>
                              <td style={{ padding: '0.75rem 1rem' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary, #0f172a)' }}>
                                  {emp.name}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)' }}>
                                  {emp.email}
                                </div>
                              </td>
                              <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: 'var(--text-primary, #334155)' }}>
                                {emp.department}
                              </td>
                              <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary, #0f172a)' }}>
                                {emp.assigned}
                              </td>
                              <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, fontSize: '0.88rem', color: '#16a34a' }}>
                                {emp.completedOnTime}
                              </td>
                              <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, fontSize: '0.88rem', color: emp.completedLate > 0 ? '#d97706' : 'var(--text-secondary, #94a3b8)' }}>
                                {emp.completedLate}
                              </td>
                              <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, fontSize: '0.88rem', color: emp.missed > 0 ? '#dc2626' : 'var(--text-secondary, #94a3b8)' }}>
                                {emp.missed}
                              </td>
                              <td style={{ padding: '0.75rem 1rem', minWidth: '150px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{
                                      width: `${emp.complianceRate}%`,
                                      height: '100%',
                                      background: emp.complianceRate >= 90 ? '#16a34a' : emp.complianceRate >= 75 ? '#f59e0b' : '#dc2626'
                                    }} />
                                  </div>
                                  <span style={{
                                    fontWeight: 800,
                                    fontSize: '0.85rem',
                                    color: emp.complianceRate >= 90 ? '#16a34a' : emp.complianceRate >= 75 ? '#d97706' : '#dc2626',
                                    minWidth: '38px',
                                    textAlign: 'right'
                                  }}>
                                    {emp.complianceRate}%
                                  </span>
                                </div>
                              </td>
                              <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                <span style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '12px',
                                  background: emp.rating === 'STAR' ? '#dcfce7' : emp.rating === 'RELIABLE' ? '#fef3c7' : '#fee2e2',
                                  color: emp.rating === 'STAR' ? '#166534' : emp.rating === 'RELIABLE' ? '#92400e' : '#991b1b'
                                }}>
                                  {emp.rating === 'STAR' ? '🌟 Star' : emp.rating === 'RELIABLE' ? '👍 Reliable' : '🚨 At Risk'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: MY CHECKLISTS (EMPLOYEE EXECUTION STATION)                         */}
      {/* ========================================================================= */}
      {activeTab === 'my_checklists' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* ========================================================================= */}
          {/* 1. TOP SECTION: CHECKLIST DASHBOARD & DATE NAVIGATOR                      */}
          {/* ========================================================================= */}
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: '14px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
          }}>
            {/* Row 1: Title + Quick Date Navigation Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span>📊</span> Checklist Execution Dashboard
                </h2>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>
                  Live time-window schedule monitoring & daily compliance rate for {userName}
                </p>
              </div>

              {/* Date Navigator Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleShiftDate(-1)}
                  style={{
                    background: 'var(--bg-secondary, #f1f5f9)',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    color: 'var(--text-primary, #1e293b)',
                    borderRadius: '8px',
                    padding: '0.4rem 0.65rem',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                  title="Previous Day"
                >
                  <ChevronLeft size={14} /> Yesterday
                </button>

                <button
                  type="button"
                  onClick={handleSetToday}
                  style={{
                    background: isToday ? '#16a34a' : 'var(--bg-secondary, #f1f5f9)',
                    color: isToday ? '#ffffff' : 'var(--text-primary, #1e293b)',
                    border: isToday ? '1px solid #15803d' : '1px solid var(--border-color, #cbd5e1)',
                    borderRadius: '8px',
                    padding: '0.4rem 0.8rem',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}
                >
                  <Calendar size={13} /> Today
                </button>

                <button
                  type="button"
                  onClick={() => handleShiftDate(1)}
                  style={{
                    background: 'var(--bg-secondary, #f1f5f9)',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    color: 'var(--text-primary, #1e293b)',
                    borderRadius: '8px',
                    padding: '0.4rem 0.65rem',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                  title="Next Day"
                >
                  Tomorrow <ChevronRight size={14} />
                </button>

                {/* Calendar Date Picker Input */}
                <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                  <input
                    type="date"
                    value={dashboardDate}
                    onChange={(e) => setDashboardDate(e.target.value)}
                    style={{
                      padding: '0.35rem 0.6rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: 'var(--text-primary, #0f172a)',
                      background: 'var(--bg-secondary, #f8fafc)',
                      cursor: 'pointer'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Row 2: Status Notice Banner (if past date, future date, Sunday or Holiday) */}
            {isPastDate && (
              <div style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
                padding: '0.55rem 0.85rem',
                fontSize: '0.82rem',
                color: '#1e40af',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span>📜</span>
                <span>
                  <strong>Historical View ({new Date(`${dashboardDate}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}):</strong> Showing past checklist records in <strong>View-Only Mode</strong>. Past expired slots are closed for submissions.
                </span>
              </div>
            )}

            {isFutureDate && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '0.55rem 0.85rem',
                fontSize: '0.82rem',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <Lock size={15} />
                <span>
                  <strong>Upcoming Schedule ({new Date(`${dashboardDate}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}):</strong> Checklists will unlock and become fillable on this scheduled date.
                </span>
              </div>
            )}

            {/* Row 3: 7 High-Impact KPI Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
              {/* Card 1: Total */}
              <div style={{
                background: 'var(--bg-secondary, #f8fafc)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem'
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span>📋</span> TOTAL SLOTS
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                  {dashboardMetrics.total}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)' }}>
                  Scheduled slots
                </div>
              </div>

              {/* Card 2: Open Now (Active On-Time) */}
              <div style={{
                background: dashboardMetrics.openOnTime > 0 ? '#f0fdf4' : 'var(--bg-secondary, #f8fafc)',
                border: dashboardMetrics.openOnTime > 0 ? '1.5px solid #86efac' : '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem'
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span>🟢</span> OPEN NOW
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#16a34a' }}>
                  {dashboardMetrics.openOnTime}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>
                  In buffer window
                </div>
              </div>

              {/* Card 3: Late Allowed (Past Buffer, Delayed Submission Allowed) */}
              <div style={{
                background: dashboardMetrics.activeDelayed > 0 ? '#fffbeb' : 'var(--bg-secondary, #f8fafc)',
                border: dashboardMetrics.activeDelayed > 0 ? '1.5px solid #fde68a' : '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem'
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: dashboardMetrics.activeDelayed > 0 ? '#92400e' : 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Clock size={13} color={dashboardMetrics.activeDelayed > 0 ? '#d97706' : '#94a3b8'} /> LATE ALLOWED
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: dashboardMetrics.activeDelayed > 0 ? '#d97706' : 'var(--text-primary, #0f172a)' }}>
                  {dashboardMetrics.activeDelayed}
                </div>
                <div style={{ fontSize: '0.72rem', color: dashboardMetrics.activeDelayed > 0 ? '#78350f' : 'var(--text-secondary, #64748b)', fontWeight: 600 }}>
                  Fill with delay tag
                </div>
              </div>

              {/* Card 4: Completed */}
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem'
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span>✓</span> COMPLETED
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#16a34a' }}>
                  {dashboardMetrics.completed}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#166534' }}>
                  {dashboardMetrics.completedOnTime} on-time • {dashboardMetrics.completedLate} late
                </div>
              </div>

              {/* Card 5: Upcoming / Locked */}
              <div style={{
                background: 'var(--bg-secondary, #f8fafc)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem'
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Lock size={12} /> UPCOMING
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary, #334155)' }}>
                  {dashboardMetrics.locked}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748b)' }}>
                  Opens at slot time
                </div>
              </div>

              {/* Card 6: Missed / Expired */}
              <div style={{
                background: dashboardMetrics.expired > 0 ? '#fef2f2' : 'var(--bg-secondary, #f8fafc)',
                border: dashboardMetrics.expired > 0 ? '1.5px solid #fca5a5' : '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem'
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span>❌</span> MISSED / EXPIRED
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#dc2626' }}>
                  {dashboardMetrics.expired}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#b91c1c' }}>
                  Window closed
                </div>
              </div>

              {/* Card 7: Compliance Rate */}
              <div style={{
                background: '#faf5ff',
                border: '1px solid #e9d5ff',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem'
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7e22ce', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Award size={13} /> COMPLIANCE
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#9333ea' }}>
                  {dashboardMetrics.complianceRate}%
                </div>
                <div style={{ width: '100%', height: '5px', background: '#e9d5ff', borderRadius: '3px', overflow: 'hidden', marginTop: '0.15rem' }}>
                  <div style={{ width: `${dashboardMetrics.complianceRate}%`, height: '100%', background: '#9333ea', transition: 'width 0.3s ease' }} />
                </div>
              </div>
            </div>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary, #64748b)' }}>
              <RefreshCw className="spin" size={32} style={{ margin: '0 auto 1rem' }} />
              <p>Loading scheduled checklists...</p>
            </div>
          )}

          {!loading && liveDashboardChecklists.length === 0 && (
            <div style={{
              background: 'var(--bg-secondary, #f8fafc)',
              border: '1px dashed var(--border-color, #cbd5e1)',
              borderRadius: '12px',
              padding: '3.5rem 2rem',
              textAlign: 'center',
              color: 'var(--text-secondary, #64748b)'
            }}>
              <CheckSquare size={48} style={{ opacity: 0.4, margin: '0 auto 1rem' }} />
              <h3 style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>No Checklists Scheduled for this Date</h3>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                No active {selectedFrequency === 'ALL' ? 'scheduled' : selectedFrequency.toLowerCase()} checklists found for {new Date(`${dashboardDate}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}.
              </p>
              {isManager && (
                <button
                  onClick={handleOpenNewTemplate}
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
                  Create First Checklist Template
                </button>
              )}
            </div>
          )}

          {!loading && liveDashboardChecklists.length > 0 && (
            <>
              {/* View Mode Toggle Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', margin: '0.25rem 0' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>
                  Showing <strong>{liveDashboardChecklists.length}</strong> scheduled checklists for <strong>{selectedFrequency === 'ALL' ? 'All Frequencies' : selectedFrequency}</strong>
                </span>

                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary, #f1f5f9)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)' }}>
                  <button
                    type="button"
                    onClick={() => setMyChecklistsViewMode('tiles')}
                    style={{
                      background: myChecklistsViewMode === 'tiles' ? '#ffffff' : 'transparent',
                      color: myChecklistsViewMode === 'tiles' ? '#0f172a' : '#64748b',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      boxShadow: myChecklistsViewMode === 'tiles' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <LayoutGrid size={15} /> Tiles
                  </button>
                  <button
                    type="button"
                    onClick={() => setMyChecklistsViewMode('table')}
                    style={{
                      background: myChecklistsViewMode === 'table' ? '#ffffff' : 'transparent',
                      color: myChecklistsViewMode === 'table' ? '#0f172a' : '#64748b',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      boxShadow: myChecklistsViewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <List size={15} /> Table
                  </button>
                </div>
              </div>

              {/* 1. TILES VIEW */}
              {myChecklistsViewMode === 'tiles' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
                  {liveDashboardChecklists.map((item, idx) => {
                    const tmpl = item.template;
                    const isCompleted = item.status === 'COMPLETED';
                    const percent = item.stats.percent;
                    const humanPeriod = getHumanPeriodLabel(tmpl.frequency, item.currentPeriodKey);
                    const freqMeta = FREQUENCIES_CONFIG.find(f => f.id === tmpl.frequency) || FREQUENCIES_CONFIG[0];
                    const delayInfo = item.delayInfo || {};
                    const isLocked = delayInfo.isBeforeStart;
                    const isActive = delayInfo.isActive;
                    const isExpired = delayInfo.isExpired;
                    const isDelayedCompleted = isCompleted && delayInfo.isDelayed;

                    return (
                      <div
                        key={`${tmpl.id}_${item.currentPeriodKey || item.slotInfo?.slot_id || item.slotIndex || idx}`}
                        style={{
                          background: isLocked
                            ? '#f8fafc'
                            : isExpired
                            ? '#fff5f5'
                            : isActive
                            ? '#ffffff'
                            : isCompleted
                            ? '#f0fdf4'
                            : 'var(--card-bg, #ffffff)',
                          border: isLocked
                            ? '1px dashed #cbd5e1'
                            : isExpired
                            ? '1.5px solid #f87171'
                            : isActive
                            ? '2px solid #22c55e'
                            : isCompleted
                            ? '1px solid #86efac'
                            : '1px solid var(--border-color, #e2e8f0)',
                          borderRadius: '12px',
                          padding: '1.25rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1rem',
                          boxShadow: isActive
                            ? '0 4px 16px rgba(34,197,94,0.18)'
                            : isExpired
                            ? '0 4px 12px rgba(239,68,68,0.12)'
                            : '0 2px 8px rgba(0,0,0,0.04)',
                          opacity: isLocked ? 0.82 : 1,
                          position: 'relative'
                        }}
                      >
                        {/* Top status bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.4rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                              background: `${freqMeta.badgeColor}15`,
                              color: freqMeta.badgeColor,
                              padding: '0.25rem 0.6rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}>
                              {freqMeta.icon} {tmpl.frequency}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>
                              {tmpl.department}
                            </span>
                          </div>

                          {/* Status Badges */}
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {isCompleted ? (
                              <span style={{
                                background: isDelayedCompleted ? '#fef3c7' : '#dcfce7',
                                color: isDelayedCompleted ? '#92400e' : '#166534',
                                border: isDelayedCompleted ? '1px solid #fde68a' : '1px solid #bbf7d0',
                                padding: '0.25rem 0.6rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 700
                              }}>
                                {isDelayedCompleted ? `⚠️ Done (${delayInfo.delayText || 'Delayed'})` : '✓ Completed (On Time)'}
                              </span>
                            ) : isLocked ? (
                              <span style={{
                                background: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #cbd5e1',
                                padding: '0.25rem 0.6rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}>
                                <Lock size={12} /> Opens at {delayInfo.formattedStart}
                              </span>
                            ) : isActive ? (
                              <span style={{
                                background: delayInfo.badgeStatus === 'DELAYED_OPEN' ? '#fef3c7' : '#dcfce7',
                                color: delayInfo.badgeStatus === 'DELAYED_OPEN' ? '#92400e' : '#166534',
                                border: delayInfo.badgeStatus === 'DELAYED_OPEN' ? '1px solid #fde68a' : '1px solid #86efac',
                                padding: '0.25rem 0.6rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}>
                                {delayInfo.badgeStatus === 'DELAYED_OPEN' ? `⚠️ Late Allowed (${delayInfo.delayMinutes}m overdue)` : `🟢 Open Now`}
                              </span>
                            ) : isExpired ? (
                              <span style={{
                                background: '#fee2e2',
                                color: '#991b1b',
                                border: '1px solid #fca5a5',
                                padding: '0.25rem 0.6rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}>
                                ❌ Expired / Missed
                              </span>
                            ) : (
                              <span style={{
                                background: percent > 0 ? '#fef3c7' : '#f1f5f9',
                                color: percent > 0 ? '#92400e' : '#475569',
                                padding: '0.25rem 0.6rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 700
                              }}>
                                {percent > 0 ? 'In Progress' : 'Pending'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Title & Period */}
                        <div>
                          <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem', fontWeight: 600 }}>{tmpl.title}</h3>
                          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
                            {tmpl.description || 'Routine operational checklist items'}
                          </p>
                        </div>

                        {/* Meta info & Cutoff tracking */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.8rem',
                          color: isExpired ? '#991b1b' : isActive ? '#166534' : isLocked ? '#64748b' : 'var(--text-secondary, #64748b)',
                          background: isExpired ? '#fef2f2' : isActive ? '#f0fdf4' : isLocked ? '#f8fafc' : 'var(--bg-secondary, #f8fafc)',
                          border: isExpired ? '1px solid #fecaca' : isActive ? '1px solid #bbf7d0' : '1px solid var(--border-color, #e2e8f0)',
                          padding: '0.6rem 0.75rem',
                          borderRadius: '8px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Calendar size={14} />
                            <span>{humanPeriod}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                            <Clock size={14} />
                            {isLocked ? (
                              <span>Opens: {delayInfo.formattedStart}</span>
                            ) : isActive ? (
                              <span>Window Closes: {delayInfo.formattedExpire}</span>
                            ) : isExpired ? (
                              <span>Expired at: {delayInfo.formattedExpire}</span>
                            ) : (
                              <span>Cutoff: {tmpl.due_time || '18:00'}</span>
                            )}
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                            <span>Progress</span>
                            <span>{item.stats.completedCount} of {item.stats.totalCount} items ({percent}%)</span>
                          </div>
                          <div style={{ width: '100%', height: '8px', background: 'var(--border-color, #e2e8f0)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${percent}%`,
                              height: '100%',
                              background: isCompleted ? '#22c55e' : isExpired ? '#ef4444' : isActive ? '#16a34a' : '#94a3b8',
                              transition: 'width 0.3s ease'
                            }} />
                          </div>
                        </div>

                        {/* Action Button */}
                        <button
                          onClick={() => {
                            if (isLocked) return;
                            handleOpenExecution(item);
                          }}
                          disabled={isLocked}
                          style={{
                            background: isCompleted
                              ? '#f0fdf4'
                              : isLocked
                              ? '#e2e8f0'
                              : isExpired
                              ? '#fee2e2'
                              : delayInfo.badgeStatus === 'DELAYED_OPEN'
                              ? '#d97706'
                              : '#16a34a',
                            color: isCompleted
                              ? '#166534'
                              : isLocked
                              ? '#64748b'
                              : isExpired
                              ? '#991b1b'
                              : '#ffffff',
                            border: isCompleted
                              ? '1px solid #bbf7d0'
                              : isExpired
                              ? '1px solid #fca5a5'
                              : 'none',
                            padding: '0.65rem 1rem',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            cursor: isLocked ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            marginTop: 'auto',
                            boxShadow: isActive ? (delayInfo.badgeStatus === 'DELAYED_OPEN' ? '0 2px 8px rgba(217,119,6,0.3)' : '0 2px 8px rgba(22,163,74,0.3)') : 'none'
                          }}
                        >
                          {isCompleted ? (
                            <>
                              <Lock size={16} /> View Submitted Checklist (Locked)
                            </>
                          ) : isLocked ? (
                            <>
                              <Lock size={16} /> Locked (Opens at {delayInfo.formattedStart})
                            </>
                          ) : isExpired ? (
                            <>
                              <AlertTriangle size={16} /> Window Expired (Missed)
                            </>
                          ) : delayInfo.badgeStatus === 'DELAYED_OPEN' ? (
                            <>
                              <Clock size={16} /> ⚠️ Submit with Late Tag ({delayInfo.delayMinutes}m overdue)
                            </>
                          ) : (
                            <>
                              <CheckSquare size={16} /> Fill & Complete Checklist
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 2. TABLE VIEW */}
              {myChecklistsViewMode === 'table' && (
                <div style={{ overflowX: 'auto', background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)', color: 'var(--text-secondary, #64748b)' }}>
                        <th style={{ padding: '0.75rem 1rem' }}>Checklist Title</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Frequency & Department</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Period / Date</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Cutoff / Time Window</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Progress</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveDashboardChecklists.map((item, idx) => {
                        const tmpl = item.template;
                        const isCompleted = item.status === 'COMPLETED';
                        const percent = item.stats.percent;
                        const humanPeriod = getHumanPeriodLabel(tmpl.frequency, item.currentPeriodKey);
                        const freqMeta = FREQUENCIES_CONFIG.find(f => f.id === tmpl.frequency) || FREQUENCIES_CONFIG[0];
                        const delayInfo = item.delayInfo || {};
                        const isLocked = delayInfo.isBeforeStart;
                        const isActive = delayInfo.isActive;
                        const isExpired = delayInfo.isExpired;
                        const isDelayedCompleted = isCompleted && delayInfo.isDelayed;

                        return (
                          <tr
                            key={`${tmpl.id}_${item.currentPeriodKey || item.slotInfo?.slot_id || item.slotIndex || idx}`}
                            style={{
                              borderBottom: '1px solid var(--border-color, #e2e8f0)',
                              background: isLocked
                                ? '#f8fafc'
                                : isExpired
                                ? '#fff5f5'
                                : isActive
                                ? '#f0fdf4'
                                : isCompleted
                                ? '#f0fdf4'
                                : 'transparent',
                              opacity: isLocked ? 0.82 : 1
                            }}
                          >
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-primary, #1e293b)' }}>{tmpl.title}</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
                                {tmpl.description || tmpl.department}
                              </div>
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span style={{
                                  background: `${freqMeta.badgeColor}15`,
                                  color: freqMeta.badgeColor,
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '6px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}>
                                  {freqMeta.icon} {tmpl.frequency}
                                </span>
                                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{tmpl.department}</span>
                              </div>
                            </td>
                            <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem', fontWeight: 600 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Calendar size={13} color="#f59e0b" />
                                <span>{humanPeriod}</span>
                              </div>
                            </td>
                            <td style={{
                              padding: '0.85rem 1rem',
                              fontSize: '0.85rem',
                              fontWeight: isExpired ? 700 : 600,
                              color: isExpired ? '#991b1b' : isActive ? '#166534' : 'inherit'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Clock size={13} />
                                <span>{delayInfo.formattedStart || tmpl.due_time || '18:00'} - {delayInfo.formattedExpire || '18:20'}</span>
                              </div>
                              {isLocked ? (
                                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, marginTop: '0.15rem' }}>
                                  🔒 Opens in {formatDurationHuman(delayInfo.remainingLockMs)}
                                </div>
                              ) : isActive ? (
                                <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, marginTop: '0.15rem' }}>
                                  🟢 {formatDurationHuman(delayInfo.remainingWindowMs)} left to submit
                                </div>
                              ) : isExpired ? (
                                <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600, marginTop: '0.15rem' }}>
                                  ❌ Window Closed at {delayInfo.formattedExpire}
                                </div>
                              ) : null}
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '130px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700 }}>
                                  <span>{item.stats.completedCount}/{item.stats.totalCount}</span>
                                  <span>{percent}%</span>
                                </div>
                                <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${percent}%`,
                                    height: '100%',
                                    background: isCompleted ? '#22c55e' : isExpired ? '#ef4444' : isActive ? '#16a34a' : '#94a3b8'
                                  }} />
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              {isCompleted ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }}>
                                  <span style={{
                                    background: isDelayedCompleted ? '#fef3c7' : '#dcfce7',
                                    color: isDelayedCompleted ? '#92400e' : '#166534',
                                    border: isDelayedCompleted ? '1px solid #fde68a' : '1px solid #bbf7d0',
                                    padding: '0.2rem 0.55rem',
                                    borderRadius: '10px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700
                                  }}>
                                    {isDelayedCompleted ? `⚠️ Done (Delayed)` : '✓ Completed (On Time)'}
                                  </span>
                                </div>
                              ) : isLocked ? (
                                <span style={{
                                  background: '#f1f5f9',
                                  color: '#475569',
                                  border: '1px solid #cbd5e1',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '10px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}>
                                  <Lock size={11} /> Locked
                                </span>
                              ) : delayInfo.badgeStatus === 'DELAYED_OPEN' ? (
                                <span style={{
                                  background: '#fef3c7',
                                  color: '#92400e',
                                  border: '1px solid #fde68a',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '10px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}>
                                  <Clock size={11} color="#d97706" /> ⚠️ Late Allowed ({delayInfo.delayMinutes}m)
                                </span>
                              ) : isActive ? (
                                <span style={{
                                  background: '#dcfce7',
                                  color: '#166534',
                                  border: '1px solid #86efac',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '10px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}>
                                  🟢 Open Now
                                </span>
                              ) : isExpired ? (
                                <span style={{
                                  background: '#fee2e2',
                                  color: '#991b1b',
                                  border: '1px solid #fca5a5',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '10px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}>
                                  ❌ Expired / Missed
                                </span>
                              ) : (
                                <span style={{
                                  background: '#f1f5f9',
                                  color: '#475569',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '10px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700
                                }}>
                                  Pending
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                              <button
                                onClick={() => {
                                  if (isLocked) return;
                                  handleOpenExecution(item);
                                }}
                                disabled={isLocked}
                                style={{
                                  background: isCompleted
                                    ? '#f0fdf4'
                                    : isLocked
                                    ? '#e2e8f0'
                                    : isExpired
                                    ? '#fee2e2'
                                    : delayInfo.badgeStatus === 'DELAYED_OPEN'
                                    ? '#d97706'
                                    : '#16a34a',
                                  color: isCompleted
                                    ? '#166534'
                                    : isLocked
                                    ? '#64748b'
                                    : isExpired
                                    ? '#991b1b'
                                    : '#ffffff',
                                  border: isCompleted
                                    ? '1px solid #bbf7d0'
                                    : isExpired
                                    ? '1px solid #fca5a5'
                                    : 'none',
                                  padding: '0.4rem 0.9rem',
                                  borderRadius: '6px',
                                  fontWeight: 700,
                                  fontSize: '0.8rem',
                                  cursor: isLocked ? 'not-allowed' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem'
                                }}
                              >
                                {isCompleted ? (
                                  <>
                                    <Lock size={13} /> View (Locked)
                                  </>
                                ) : isLocked ? (
                                  <>
                                    <Lock size={13} /> Locked
                                  </>
                                ) : isExpired ? (
                                  <>
                                    <AlertTriangle size={13} /> Expired
                                  </>
                                ) : delayInfo.badgeStatus === 'DELAYED_OPEN' ? (
                                  <>
                                    <Clock size={13} /> ⚠️ Submit Late
                                  </>
                                ) : (
                                  <>
                                    <CheckSquare size={13} /> Fill Checklist
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TEMPLATES MASTER (FOR MANAGERS / ADMINS)                           */}
      {/* ========================================================================= */}
      {activeTab === 'templates' && (() => {
        const displayedTemplates = templates.filter(tmpl => {
          const s = (tmpl.status || (tmpl.is_active ? 'ACTIVE' : 'INACTIVE')).toUpperCase();
          if (templateStatusFilter === 'ACTIVE') return s === 'ACTIVE';
          if (templateStatusFilter === 'INACTIVE') return s === 'INACTIVE';
          if (templateStatusFilter === 'DRAFT') return s === 'DRAFT';
          return true;
        });

        const activeCount = templates.filter(t => (t.status || (t.is_active ? 'ACTIVE' : 'INACTIVE')).toUpperCase() === 'ACTIVE').length;
        const inactiveCount = templates.filter(t => (t.status || (t.is_active ? 'ACTIVE' : 'INACTIVE')).toUpperCase() === 'INACTIVE').length;
        const draftCount = templates.filter(t => (t.status || (t.is_active ? 'ACTIVE' : 'INACTIVE')).toUpperCase() === 'DRAFT').length;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>Checklist Templates Repository</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', margin: 0 }}>
                  Configure multi-frequency recurring checklists, duplicate templates, and manage Active, Inactive, or Draft status.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <select
                  value={templateStatusFilter}
                  onChange={(e) => setTemplateStatusFilter(e.target.value)}
                  style={{
                    padding: '0.5rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--card-bg, #ffffff)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <option value="ALL">All Statuses ({templates.length})</option>
                  <option value="ACTIVE">🟢 Active ({activeCount})</option>
                  <option value="INACTIVE">🔴 Inactive ({inactiveCount})</option>
                  <option value="DRAFT">📝 Draft ({draftCount})</option>
                </select>

                <button
                  onClick={handleOpenNewTemplate}
                  style={{
                    background: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <Plus size={16} /> Add New Template
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto', background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)', color: 'var(--text-secondary, #64748b)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Title & Description</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Recurrence Frequency</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Time / Days / Date</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Assigned To</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Questions / Items</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTemplates.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>
                        No templates found for this status. Click "Add New Template" to create one.
                      </td>
                    </tr>
                  )}
                  {displayedTemplates.map(tmpl => {
                    const freqMeta = FREQUENCIES_CONFIG.find(f => f.id === tmpl.frequency) || FREQUENCIES_CONFIG[0];
                    const s = (tmpl.status || (tmpl.is_active ? 'ACTIVE' : 'INACTIVE')).toUpperCase();
                    const isAct = s === 'ACTIVE';
                    const isDrf = s === 'DRAFT';

                    const bg = isAct ? '#dcfce7' : isDrf ? '#fef3c7' : '#fee2e2';
                    const color = isAct ? '#166534' : isDrf ? '#92400e' : '#991b1b';
                    const border = isAct ? '#86efac' : isDrf ? '#fcd34d' : '#fca5a5';

                    const repCount = tmpl.daily_repetition_count || tmpl.schedule_config?.daily_repetition_count || 1;
                    const slots = (Array.isArray(tmpl.daily_slots) && tmpl.daily_slots.length > 0)
                      ? tmpl.daily_slots
                      : (Array.isArray(tmpl.schedule_config?.daily_slots) && tmpl.schedule_config.daily_slots.length > 0
                        ? tmpl.schedule_config.daily_slots
                        : [{ slot_id: 'S1', label: 'Daily Cutoff', due_time: tmpl.due_time || '18:00' }]);

                    const includeSundays = tmpl.include_sundays !== undefined ? tmpl.include_sundays : (tmpl.schedule_config?.include_sundays !== undefined ? tmpl.schedule_config.include_sundays : true);
                    const includeHolidays = tmpl.include_holidays !== undefined ? tmpl.include_holidays : (tmpl.schedule_config?.include_holidays !== undefined ? tmpl.schedule_config.include_holidays : false);

                    return (
                      <tr key={tmpl.id} style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary, #1e293b)' }}>{tmpl.title}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>{tmpl.description || tmpl.department}</div>
                        </td>

                        {/* Recurrence Frequency */}
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-start' }}>
                            <span style={{
                              background: `${freqMeta.badgeColor}15`,
                              color: freqMeta.badgeColor,
                              padding: '0.2rem 0.55rem',
                              borderRadius: '6px',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}>
                              {freqMeta.icon} {tmpl.frequency}
                              {tmpl.frequency === 'DAILY' && repCount > 1 && (
                                <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800 }}>
                                  {repCount}x / Day
                                </span>
                              )}
                            </span>

                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                              {!includeSundays && (
                                <span style={{ fontSize: '0.68rem', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
                                  Skip Sun
                                </span>
                              )}
                              {!includeHolidays && (
                                <span style={{ fontSize: '0.68rem', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
                                  Skip Hol
                                </span>
                              )}
                              {Boolean(tmpl.allow_delayed_submission || tmpl.schedule_config?.allow_delayed_submission) && (
                                <span style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
                                  ⚠️ Delay OK
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Time / Days / Date */}
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {tmpl.frequency === 'DAILY' ? (
                            repCount === 1 ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
                                <Clock size={14} color="#0284c7" />
                                <span>{tmpl.due_time || slots[0]?.due_time || '18:00'}</span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', maxWidth: '240px' }}>
                                {slots.map((sl, slIdx) => (
                                  <span
                                    key={sl.slot_id || slIdx}
                                    title={`${sl.label || `Slot ${slIdx + 1}`}: ${sl.due_time}`}
                                    style={{
                                      background: '#f0fdf4',
                                      border: '1px solid #bbf7d0',
                                      color: '#15803d',
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      padding: '0.15rem 0.4rem',
                                      borderRadius: '4px'
                                    }}
                                  >
                                    {sl.due_time}
                                  </span>
                                ))}
                              </div>
                            )
                          ) : tmpl.frequency === 'WEEKLY' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>
                                <Calendar size={13} color="#10b981" />
                                <span>{(tmpl.days_of_week || ['Monday']).join(', ')}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#64748b' }}>
                                <Clock size={12} />
                                <span>{tmpl.due_time || '18:00'}</span>
                              </div>
                            </div>
                          ) : tmpl.frequency === 'FORTNIGHTLY' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#8b5cf6' }}>1st & 16th Cycle</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#64748b' }}>
                                <Clock size={12} />
                                <span>{tmpl.due_time || '18:00'}</span>
                              </div>
                            </div>
                          ) : tmpl.frequency === 'MONTHLY' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f59e0b' }}>
                                Day {tmpl.day_of_month || 1} of Month
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#64748b' }}>
                                <Clock size={12} />
                                <span>{tmpl.due_time || '18:00'}</span>
                              </div>
                            </div>
                          ) : tmpl.frequency === 'QUARTERLY' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#be185d' }}>
                                Month {tmpl.quarter_month || 3} • Day {tmpl.day_of_month || 1}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#64748b' }}>
                                <Clock size={12} />
                                <span>{tmpl.due_time || '18:00'}</span>
                              </div>
                            </div>
                          ) : tmpl.frequency === 'HALF_YEARLY' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0e7490' }}>
                                Month {tmpl.half_yearly_month || 6} • Day {tmpl.day_of_month || 1}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#64748b' }}>
                                <Clock size={12} />
                                <span>{tmpl.due_time || '18:00'}</span>
                              </div>
                            </div>
                          ) : tmpl.frequency === 'YEARLY' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4338ca' }}>
                                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(tmpl.month_of_year || 12) - 1]} • Day {tmpl.day_of_month || 1}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#64748b' }}>
                                <Clock size={12} />
                                <span>{tmpl.due_time || '18:00'}</span>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
                                Day {tmpl.day_of_month || 1}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#64748b' }}>
                                <Clock size={12} />
                                <span>{tmpl.due_time || '18:00'}</span>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Assigned To */}
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <User size={14} style={{ opacity: 0.7 }} />
                            <span>{tmpl.assigned_type === 'ALL' ? 'All Staff' : tmpl.assigned_employee_name || tmpl.assigned_employee_email}</span>
                          </div>
                        </td>

                        {/* Questions / Items */}
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600, fontSize: '0.8rem' }}>
                            {(tmpl.items || []).length} items
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <select
                            value={s}
                            disabled={togglingStatusId === tmpl.id}
                            onChange={(e) => handleSetStatus(tmpl, e.target.value)}
                            style={{
                              background: bg,
                              color: color,
                              border: `1.5px solid ${border}`,
                              padding: '0.3rem 0.65rem',
                              borderRadius: '12px',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              outline: 'none',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                            title="Click to switch status directly"
                          >
                            <option value="ACTIVE" style={{ background: '#ffffff', color: '#166534', fontWeight: 700 }}>🟢 Active</option>
                            <option value="INACTIVE" style={{ background: '#ffffff', color: '#991b1b', fontWeight: 700 }}>🔴 Inactive</option>
                            <option value="DRAFT" style={{ background: '#ffffff', color: '#92400e', fontWeight: 700 }}>📝 Draft</option>
                          </select>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.55rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button
                              onClick={() => handleCopyTemplate(tmpl)}
                              style={{
                                background: '#ecfdf5',
                                border: '1px solid #a7f3d0',
                                color: '#059669',
                                cursor: 'pointer',
                                padding: '0.3rem 0.5rem',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.78rem',
                                fontWeight: 600
                              }}
                              title="Copy / Duplicate this template with same assigned employees"
                            >
                              <Copy size={13} /> Copy
                            </button>
                            <button
                              onClick={() => handleEditTemplate(tmpl)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: '0.25rem' }}
                              title="Edit Template"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteTemplate(tmpl.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0.25rem' }}
                              title="Delete Template"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* TAB 3: COMPLIANCE & VERIFICATION AUDIT                                    */}
      {/* ========================================================================= */}
      {activeTab === 'compliance' && (() => {
        const teamEmailsSet = new Set(myReportingTeam.map(e => (e.email || '').toLowerCase().trim()));
        const displayedComplianceLogs = (complianceTeamFilter === 'MY_TEAM' && teamEmailsSet.size > 0)
          ? complianceLogs.filter(log => teamEmailsSet.has((log.employee_email || '').toLowerCase().trim()))
          : complianceLogs;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>Compliance & Sign-Off Dashboard</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', margin: 0 }}>
                  Audit employee checklist completions, check submitted photos/readings, and sign off.
                </p>
              </div>

              {myReportingTeam.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <select
                    value={complianceTeamFilter}
                    onChange={(e) => setComplianceTeamFilter(e.target.value)}
                    style={{
                      padding: '0.5rem 0.85rem',
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
                    {isAdmin && <option value="ALL">🏢 All Company Submissions</option>}
                  </select>
                </div>
              )}
            </div>

            <div style={{ overflowX: 'auto', background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)', color: 'var(--text-secondary, #64748b)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Employee</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Checklist</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Period</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Submitted At</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Timing & Delay</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Score</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Verification</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedComplianceLogs.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>
                        No submissions recorded for this filter yet.
                      </td>
                    </tr>
                  )}
                  {displayedComplianceLogs.map(log => {
                  const humanPeriod = getHumanPeriodLabel(log.frequency, log.period_key);
                  const isApproved = log.verification_status === 'APPROVED';
                  const isDelayed = log.delayInfo?.isDelayed;
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 600 }}>{log.employee_name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>{log.employee_email}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 500 }}>{log.template_title}</div>
                        <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>{log.frequency}</span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem' }}>
                        {humanPeriod}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
                        {log.submitted_at ? new Date(log.submitted_at).toLocaleString('en-IN') : 'N/A'}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {isDelayed ? (
                          <span style={{
                            background: '#fee2e2',
                            color: '#991b1b',
                            border: '1px solid #fca5a5',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}>
                            ⚠️ {log.delayInfo?.delayText || 'Delayed'}
                          </span>
                        ) : (
                          <span style={{
                            background: '#dcfce7',
                            color: '#166534',
                            border: '1px solid #bbf7d0',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}>
                            ✓ On Time
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          background: log.status === 'COMPLETED' ? '#dcfce7' : '#fef3c7',
                          color: log.status === 'COMPLETED' ? '#166534' : '#92400e',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.75rem'
                        }}>
                          {log.items_completed_count}/{log.items_total_count} Done
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          background: isApproved ? '#dcfce7' : '#fee2e2',
                          color: isApproved ? '#166534' : '#991b1b',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}>
                          {log.verification_status || 'PENDING'}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenVerify(log)}
                          style={{
                            background: '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            padding: '0.35rem 0.8rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600
                          }}
                        >
                          Review & Verify
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* TAB 4: COMPANY & NATIONAL HOLIDAYS CALENDAR (MANUAL MANAGEMENT)          */}
      {/* ========================================================================= */}
      {activeTab === 'holidays' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary, #1e293b)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🎉 Company & Public Holidays Master
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', margin: '0.2rem 0 0' }}>
                Manage custom company holidays, festivals, and mandatory days off. Checklists set to "Skip Holidays" will automatically exclude these dates.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: '220px' }}>
                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary, #94a3b8)' }} />
                <input
                  type="text"
                  placeholder="Search holiday name / date..."
                  value={holidaySearchQuery}
                  onChange={(e) => setHolidaySearchQuery(e.target.value)}
                  style={{
                    padding: '0.45rem 0.75rem 0.45rem 2.2rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    width: '100%',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              {isManager && (
                <>
                  <button
                    onClick={handleOpenAddHoliday}
                    style={{
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)'
                    }}
                  >
                    <Plus size={16} /> Add Holiday
                  </button>

                  <button
                    onClick={handleResetHolidays}
                    title="Restore default national & gazetted holidays list"
                    style={{
                      background: 'var(--bg-secondary, #f1f5f9)',
                      color: 'var(--text-secondary, #475569)',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      padding: '0.5rem 0.85rem',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <RefreshCw size={14} /> Reset List
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Holiday List Grid */}
          {(() => {
            const queryLow = (holidaySearchQuery || '').toLowerCase().trim();
            const filtered = (holidaysList || []).filter(h => {
              if (!queryLow) return true;
              return (h.name || '').toLowerCase().includes(queryLow) || (h.date || '').includes(queryLow);
            });

            if (filtered.length === 0) {
              return (
                <div style={{
                  background: 'var(--bg-secondary, #f8fafc)',
                  border: '1px dashed var(--border-color, #cbd5e1)',
                  borderRadius: '12px',
                  padding: '3rem 2rem',
                  textAlign: 'center',
                  color: 'var(--text-secondary, #64748b)'
                }}>
                  <Calendar size={42} style={{ opacity: 0.4, margin: '0 auto 0.75rem' }} />
                  <h3 style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>No Holidays Found</h3>
                  <p style={{ margin: 0, fontSize: '0.88rem' }}>
                    {queryLow ? `No holidays match "${holidaySearchQuery}".` : 'No company holidays are registered.'}
                  </p>
                  {isManager && (
                    <button
                      onClick={handleOpenAddHoliday}
                      style={{
                        marginTop: '1rem',
                        background: '#16a34a',
                        color: '#fff',
                        border: 'none',
                        padding: '0.5rem 1.25rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      <Plus size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                      Add First Company Holiday
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                {filtered.map((h, hIdx) => {
                  const d = new Date(h.date);
                  const isPast = d.getTime() < new Date().setHours(0, 0, 0, 0);

                  const typeColor = h.type === 'NATIONAL' ? '#2563eb' : h.type === 'FESTIVAL' ? '#d97706' : h.type === 'REGIONAL' ? '#7c3aed' : '#059669';
                  const typeBg = h.type === 'NATIONAL' ? '#eff6ff' : h.type === 'FESTIVAL' ? '#fffbeb' : h.type === 'REGIONAL' ? '#f5f3ff' : '#ecfdf5';

                  return (
                    <div
                      key={h.id ? `hol_${h.id}` : `hol_${h.date}_${hIdx}`}
                      style={{
                        background: isPast ? 'var(--bg-secondary, #f8fafc)' : 'var(--card-bg, #ffffff)',
                        border: isPast ? '1px solid var(--border-color, #e2e8f0)' : '1.5px solid #fed7aa',
                        borderRadius: '12px',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        opacity: isPast ? 0.78 : 1,
                        boxShadow: isPast ? 'none' : '0 2px 6px rgba(251, 146, 60, 0.1)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary, #1e293b)' }}>
                            {h.name}
                          </div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Calendar size={14} color="#f59e0b" />
                            <strong>{d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                          </div>
                          {h.description && (
                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.35rem', fontStyle: 'italic' }}>
                              "{h.description}"
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                          <span style={{
                            background: isPast ? '#e2e8f0' : '#ffedd5',
                            color: isPast ? '#64748b' : '#c2410c',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.55rem',
                            borderRadius: '10px'
                          }}>
                            {isPast ? 'Passed' : 'Upcoming'}
                          </span>
                          <span style={{
                            background: typeBg,
                            color: typeColor,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
                            borderRadius: '6px'
                          }}>
                            {h.type || 'COMPANY'}
                          </span>
                        </div>
                      </div>

                      {/* Card Footer with Edit / Delete */}
                      {isManager && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                          <button
                            onClick={() => handleOpenEditHoliday(h)}
                            style={{
                              background: '#eff6ff',
                              color: '#2563eb',
                              border: '1px solid #bfdbfe',
                              padding: '0.25rem 0.6rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            <Edit3 size={12} /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteHoliday(h)}
                            style={{
                              background: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              padding: '0.25rem 0.6rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CHECKLIST EXECUTION (FILL & SUBMIT)                               */}
      {/* ========================================================================= */}
      {executingChecklist && (
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
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', background: '#1e293b', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{executingChecklist.template.title}</h3>
                <div style={{ fontSize: '0.85rem', opacity: 0.85, marginTop: '0.2rem' }}>
                  {executingChecklist.template.frequency} • {getHumanPeriodLabel(executingChecklist.template.frequency, executingChecklist.currentPeriodKey)}
                </div>
              </div>
              <button
                onClick={() => setExecutingChecklist(null)}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Questions Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Completed Lock Banner, Expired Banner, Locked Banner, or Active Banner */}
              {(() => {
                const isAlreadyCompleted = executingChecklist.status === 'COMPLETED' || executingChecklist.submission?.status === 'COMPLETED';
                const delayInfo = executingChecklist.delayInfo || {};
                const isLocked = delayInfo.isBeforeStart;
                const isExpired = delayInfo.isExpired;

                if (isAlreadyCompleted) {
                  return (
                    <div style={{
                      padding: '0.75rem 1rem',
                      background: '#f0fdf4',
                      color: '#166534',
                      border: '1.5px solid #86efac',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem'
                    }}>
                      <Lock size={18} style={{ flexShrink: 0 }} />
                      <div>
                        <strong>🔒 Checklist Submitted & Locked:</strong> This checklist was submitted on{' '}
                        <strong>{executingChecklist.submission?.submitted_at ? new Date(executingChecklist.submission.submitted_at).toLocaleString('en-IN') : 'Completed'}</strong>.
                        It is locked in View-Only mode and cannot be edited.
                      </div>
                    </div>
                  );
                }

                if (isExpired) {
                  return (
                    <div style={{
                      padding: '0.85rem 1rem',
                      background: '#fef2f2',
                      color: '#991b1b',
                      border: '1.5px solid #f87171',
                      borderRadius: '8px',
                      fontSize: '0.88rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem'
                    }}>
                      <AlertTriangle size={20} style={{ flexShrink: 0, color: '#dc2626' }} />
                      <div>
                        <strong>❌ Submission Window Expired (Missed):</strong> This checklist slot closed at <strong>{delayInfo.formattedExpire || 'Window End'}</strong>.
                        The buffer window has expired. Submissions are strictly locked and no longer accepted.
                      </div>
                    </div>
                  );
                }

                if (isLocked) {
                  return (
                    <div style={{
                      padding: '0.85rem 1rem',
                      background: '#f8fafc',
                      color: '#475569',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '8px',
                      fontSize: '0.88rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem'
                    }}>
                      <Lock size={18} style={{ flexShrink: 0 }} />
                      <div>
                        <strong>🔒 Checklist Locked:</strong> This checklist slot opens at <strong>{delayInfo.formattedStart}</strong>.
                        You cannot submit before the scheduled slot time.
                      </div>
                    </div>
                  );
                }

                return (
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: delayInfo.badgeStatus === 'DELAYED_OPEN' ? '#fef3c7' : '#f0fdf4',
                    color: delayInfo.badgeStatus === 'DELAYED_OPEN' ? '#92400e' : '#166534',
                    border: delayInfo.badgeStatus === 'DELAYED_OPEN' ? '1.5px solid #fde68a' : '1.5px solid #86efac',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem'
                  }}>
                    <Clock size={16} style={{ flexShrink: 0, color: delayInfo.badgeStatus === 'DELAYED_OPEN' ? '#d97706' : '#16a34a' }} />
                    <div>
                      {delayInfo.badgeStatus === 'DELAYED_OPEN' ? (
                        <>
                          <strong>⚠️ Late Submission Allowed:</strong> Buffer window closed at <strong>{delayInfo.formattedExpire}</strong> ({delayInfo.delayMinutes}m overdue). You can still fill and submit, and it will be recorded with a Late tag.
                        </>
                      ) : (
                        <>
                          <strong>🟢 Active Submission Window:</strong> Closes at <strong>{delayInfo.formattedExpire}</strong> ({delayInfo.delayText || 'Time remaining'}). Please complete all required items.
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const isAlreadyCompleted = executingChecklist.status === 'COMPLETED' || executingChecklist.submission?.status === 'COMPLETED';
                const delayInfo = executingChecklist.delayInfo || {};
                const isBlocked = isAlreadyCompleted || delayInfo.isExpired || delayInfo.isBeforeStart;

                return executingChecklist.items.map((item, idx) => {
                  const val = execResponses[item.id];
                  return (
                    <div
                      key={item.id || idx}
                      style={{
                        background: 'var(--bg-secondary, #f8fafc)',
                        border: '1px solid var(--border-color, #e2e8f0)',
                        borderRadius: '8px',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <label style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary, #1e293b)' }}>
                          {idx + 1}. {item.title} {item.is_required && !isBlocked && <span style={{ color: '#ef4444' }}>*</span>}
                        </label>
                        <span style={{ fontSize: '0.75rem', background: '#e2e8f0', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 600, color: '#475569' }}>
                          {CHECKLIST_ITEM_TYPES.find(t => t.id === item.type)?.label || item.type || 'Done / Not Done'}
                        </span>
                      </div>

                      {item.standard_guideline && (
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontStyle: 'italic' }}>
                          SOP: {item.standard_guideline}
                        </p>
                      )}

                      {/* Input based on type */}
                      {(item.type === 'done_not_done' || item.type === 'working_not_working' || item.type === 'updated_not_updated' || item.type === 'completed_not_completed' || item.type === 'checkbox' || !item.type) && (() => {
                        let opt1Label = 'Done';
                        let opt2Label = 'Not Done';
                        let opt1Val = 'DONE';
                        let opt2Val = 'NOT_DONE';
                        let icon1 = '✅';
                        let icon2 = '❌';

                        if (item.type === 'working_not_working') {
                          opt1Label = 'Working';
                          opt2Label = 'Not Working';
                          opt1Val = 'WORKING';
                          opt2Val = 'NOT_WORKING';
                          icon1 = '🟢';
                          icon2 = '🔴';
                        } else if (item.type === 'updated_not_updated') {
                          opt1Label = 'Updated';
                          opt2Label = 'Not Updated';
                          opt1Val = 'UPDATED';
                          opt2Val = 'NOT_UPDATED';
                          icon1 = '✅';
                          icon2 = '❌';
                        } else if (item.type === 'completed_not_completed') {
                          opt1Label = 'Completed';
                          opt2Label = 'Not Completed';
                          opt1Val = 'COMPLETED';
                          opt2Val = 'NOT_COMPLETED';
                          icon1 = '✅';
                          icon2 = '❌';
                        }

                        const isOpt1Selected = val === opt1Val || val === true || val === 'true' || val === opt1Label || val === 'YES' || val === 'yes';
                        const isOpt2Selected = val === opt2Val || val === false || val === 'false' || val === opt2Label || val === 'NO' || val === 'no';

                        return (
                          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              disabled={isBlocked}
                              onClick={() => handleResponseChange(item.id, opt1Val)}
                              style={{
                                flex: 1,
                                minWidth: '130px',
                                padding: '0.6rem 0.85rem',
                                borderRadius: '8px',
                                fontWeight: 700,
                                fontSize: '0.88rem',
                                cursor: isBlocked ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.45rem',
                                transition: 'all 0.15s ease',
                                border: isOpt1Selected ? '2px solid #16a34a' : '1.5px solid #cbd5e1',
                                background: isOpt1Selected ? '#dcfce7' : '#ffffff',
                                color: isOpt1Selected ? '#15803d' : '#475569',
                                boxShadow: isOpt1Selected ? '0 2px 4px rgba(22, 163, 74, 0.15)' : 'none',
                                opacity: isBlocked && !isOpt1Selected ? 0.45 : 1
                              }}
                            >
                              <span>{icon1}</span> {opt1Label}
                            </button>

                            <button
                              type="button"
                              disabled={isBlocked}
                              onClick={() => handleResponseChange(item.id, opt2Val)}
                              style={{
                                flex: 1,
                                minWidth: '130px',
                                padding: '0.6rem 0.85rem',
                                borderRadius: '8px',
                                fontWeight: 700,
                                fontSize: '0.88rem',
                                cursor: isBlocked ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.45rem',
                                transition: 'all 0.15s ease',
                                border: isOpt2Selected ? '2px solid #dc2626' : '1.5px solid #cbd5e1',
                                background: isOpt2Selected ? '#fee2e2' : '#ffffff',
                                color: isOpt2Selected ? '#b91c1c' : '#475569',
                                boxShadow: isOpt2Selected ? '0 2px 4px rgba(220, 38, 38, 0.15)' : 'none',
                                opacity: isBlocked && !isOpt2Selected ? 0.45 : 1
                              }}
                            >
                              <span>{icon2}</span> {opt2Label}
                            </button>
                          </div>
                        );
                      })()}

                      {item.type === 'number' && (
                        <input
                          type="number"
                          disabled={isBlocked}
                          placeholder="Enter measured reading / count..."
                          value={val || ''}
                          onChange={(e) => handleResponseChange(item.id, e.target.value)}
                          style={{
                            padding: '0.55rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color, #cbd5e1)',
                            width: '100%',
                            fontSize: '0.9rem',
                            background: isBlocked ? '#f1f5f9' : '#fff',
                            cursor: isBlocked ? 'not-allowed' : 'text'
                          }}
                        />
                      )}

                      {(item.type === 'photo' || item.type === 'file') && (
                        <input
                          type="text"
                          disabled={isBlocked}
                          placeholder="Paste image / attachment link or notes..."
                          value={val || ''}
                          onChange={(e) => handleResponseChange(item.id, e.target.value)}
                          style={{
                            padding: '0.55rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color, #cbd5e1)',
                            width: '100%',
                            fontSize: '0.9rem',
                            background: isBlocked ? '#f1f5f9' : '#fff',
                            cursor: isBlocked ? 'not-allowed' : 'text'
                          }}
                        />
                      )}

                      {item.type === 'text' && (
                        <textarea
                          disabled={isBlocked}
                          placeholder="Enter remarks or details..."
                          rows={2}
                          value={val || ''}
                          onChange={(e) => handleResponseChange(item.id, e.target.value)}
                          style={{
                            padding: '0.55rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color, #cbd5e1)',
                            width: '100%',
                            fontSize: '0.9rem',
                            background: isBlocked ? '#f1f5f9' : '#fff',
                            cursor: isBlocked ? 'not-allowed' : 'text'
                          }}
                        />
                      )}
                    </div>
                  );
                });
              })()}

              {/* Overall Summary Notes */}
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.35rem' }}>
                  Overall Remarks / Notes:
                </label>
                <textarea
                  disabled={(() => {
                    const isAlreadyCompleted = executingChecklist.status === 'COMPLETED' || executingChecklist.submission?.status === 'COMPLETED';
                    const delayInfo = executingChecklist.delayInfo || {};
                    return isAlreadyCompleted || delayInfo.isExpired || delayInfo.isBeforeStart;
                  })()}
                  placeholder="Any general comments, observations or issues..."
                  rows={2}
                  value={execNotes}
                  onChange={(e) => setExecNotes(e.target.value)}
                  style={{
                    padding: '0.55rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    width: '100%',
                    fontSize: '0.9rem',
                    background: (executingChecklist.status === 'COMPLETED' || executingChecklist.submission?.status === 'COMPLETED' || executingChecklist.delayInfo?.isExpired || executingChecklist.delayInfo?.isBeforeStart) ? '#f1f5f9' : '#fff',
                    cursor: (executingChecklist.status === 'COMPLETED' || executingChecklist.submission?.status === 'COMPLETED' || executingChecklist.delayInfo?.isExpired || executingChecklist.delayInfo?.isBeforeStart) ? 'not-allowed' : 'text'
                  }}
                />
              </div>
            </div>

            {/* Modal Footer */}
            {(() => {
              const isAlreadyCompleted = executingChecklist.status === 'COMPLETED' || executingChecklist.submission?.status === 'COMPLETED';
              const delayInfo = executingChecklist.delayInfo || {};
              const isLocked = delayInfo.isBeforeStart;
              const isExpired = delayInfo.isExpired;

              if (isAlreadyCompleted) {
                return (
                  <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-secondary, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <CheckCircle2 size={16} /> Submission Recorded ({executingChecklist.submission?.items_completed_count || executingChecklist.items.length}/{executingChecklist.items.length} Items Done)
                    </span>
                    <button
                      onClick={() => setExecutingChecklist(null)}
                      style={{
                        background: '#3b82f6',
                        color: '#ffffff',
                        border: 'none',
                        padding: '0.55rem 1.5rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Close
                    </button>
                  </div>
                );
              }

              if (isExpired) {
                return (
                  <div style={{ padding: '1rem 1.5rem', background: '#fef2f2', borderTop: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#991b1b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <AlertTriangle size={16} /> Window Closed at {delayInfo.formattedExpire} (Missed)
                    </span>
                    <button
                      onClick={() => setExecutingChecklist(null)}
                      style={{
                        background: '#dc2626',
                        color: '#ffffff',
                        border: 'none',
                        padding: '0.55rem 1.5rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Close
                    </button>
                  </div>
                );
              }

              if (isLocked) {
                return (
                  <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-secondary, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Lock size={16} /> Locked until {delayInfo.formattedStart}
                    </span>
                    <button
                      onClick={() => setExecutingChecklist(null)}
                      style={{
                        background: '#64748b',
                        color: '#ffffff',
                        border: 'none',
                        padding: '0.55rem 1.5rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Close
                    </button>
                  </div>
                );
              }

              return (
                <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-secondary, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button
                    onClick={() => setExecutingChecklist(null)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      padding: '0.55rem 1.25rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitExecution}
                    disabled={savingSubmission}
                    style={{
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.55rem 1.5rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    {savingSubmission ? <RefreshCw className="spin" size={16} /> : <Check size={16} />}
                    Submit & Complete
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: TEMPLATE BUILDER                                                 */}
      {/* ========================================================================= */}
      {templateModalOpen && (
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
            maxWidth: '750px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', background: '#0f172a', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                {editingTemplate ? 'Edit Checklist Template' : 'Create Recurring Checklist Template'}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Status:</span>
                <select
                  value={(templateForm.status || (templateForm.is_active ? 'ACTIVE' : 'INACTIVE')).toUpperCase()}
                  onChange={(e) => setTemplateForm(prev => ({
                    ...prev,
                    status: e.target.value,
                    is_active: e.target.value === 'ACTIVE'
                  }))}
                  style={{
                    background: (templateForm.status || 'ACTIVE') === 'ACTIVE' ? '#166534' : (templateForm.status || 'ACTIVE') === 'DRAFT' ? '#92400e' : '#991b1b',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.25)',
                    padding: '0.3rem 0.75rem',
                    borderRadius: '12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value="ACTIVE" style={{ background: '#0f172a', color: '#fff' }}>🟢 Active (Published)</option>
                  <option value="INACTIVE" style={{ background: '#0f172a', color: '#fff' }}>🔴 Inactive (Paused)</option>
                  <option value="DRAFT" style={{ background: '#0f172a', color: '#fff' }}>📝 Draft (Work in Progress)</option>
                </select>
                <button
                  onClick={() => setTemplateModalOpen(false)}
                  style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: '0.25rem' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Template Form Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Row 1: Title & Department */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                    Checklist Title *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Daily Store Opening & Cleanliness Audit"
                    value={templateForm.title}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, title: e.target.value }))}
                    style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem', color: 'var(--text-primary, #1e293b)' }}>
                    🏢 Target Department *
                  </label>
                  <select
                    value={templateForm.department || ''}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, department: e.target.value }))}
                    style={{
                      padding: '0.6rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      width: '100%',
                      background: 'var(--card-bg, #ffffff)',
                      color: 'var(--text-primary, #1e293b)',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    required
                  >
                    <option value="">-- Select Department (From Settings Master) --</option>
                    {availableDepartments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Recurrence Frequency Selector */}
              <div>
                <label style={{ fontWeight: 700, fontSize: '0.88rem', display: 'block', marginBottom: '0.4rem', color: 'var(--text-primary, #1e293b)' }}>
                  🔄 Recurrence Frequency *
                </label>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {FREQUENCIES_CONFIG.map(freq => {
                    const isSelected = templateForm.frequency === freq.id;
                    return (
                      <button
                        key={freq.id}
                        type="button"
                        onClick={() => {
                          const repCount = freq.id === 'DAILY' ? (templateForm.daily_repetition_count || 1) : 1;
                          const slots = freq.id === 'DAILY'
                            ? (templateForm.daily_slots?.length ? templateForm.daily_slots : generateDefaultDailySlots(repCount))
                            : [{ slot_id: 'S1', label: 'Cutoff Time', due_time: templateForm.due_time || '18:00' }];
                          setTemplateForm(prev => ({
                            ...prev,
                            frequency: freq.id,
                            daily_slots: slots,
                            due_time: slots[0]?.due_time || prev.due_time || '18:00'
                          }));
                        }}
                        style={{
                          padding: '0.4rem 0.85rem',
                          borderRadius: '8px',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: isSelected ? `2px solid ${freq.badgeColor}` : '1px solid var(--border-color, #cbd5e1)',
                          background: isSelected ? `${freq.badgeColor}15` : 'var(--card-bg, #ffffff)',
                          color: isSelected ? freq.badgeColor : 'var(--text-secondary, #64748b)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{freq.icon}</span>
                        <span>{freq.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Frequency Settings Box */}
              {templateForm.frequency === 'DAILY' && (
                <div style={{ background: '#f0f9ff', padding: '1rem', borderRadius: '10px', border: '1px solid #bae6fd', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        ☀️ Daily Repetition (1 Din Me Kitni Bar?)
                      </span>
                      <p style={{ fontSize: '0.78rem', color: '#0284c7', margin: 0 }}>
                        Select how many times per day this checklist must be performed and submitted.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', maxWidth: '650px' }}>
                      {Array.from({ length: 18 }, (_, i) => i + 1).map(count => {
                        const isChosen = (templateForm.daily_repetition_count || 1) === count;
                        return (
                          <button
                            key={count}
                            type="button"
                            onClick={() => {
                              const newSlots = generateDefaultDailySlots(count);
                              setTemplateForm(prev => ({
                                ...prev,
                                daily_repetition_count: count,
                                daily_slots: newSlots,
                                due_time: newSlots[0]?.due_time || prev.due_time || '18:00'
                              }));
                            }}
                            style={{
                              padding: '0.3rem 0.55rem',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: isChosen ? '2px solid #0284c7' : '1px solid #cbd5e1',
                              background: isChosen ? '#0284c7' : '#ffffff',
                              color: isChosen ? '#ffffff' : '#334155',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {count}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* If repetition == 1, show standard single Cutoff Time picker */}
                  {(templateForm.daily_repetition_count || 1) === 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.2rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0369a1' }}>Daily Cutoff Time:</span>
                      <input
                        type="time"
                        value={templateForm.due_time || '18:00'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTemplateForm(prev => ({
                            ...prev,
                            due_time: val,
                            daily_slots: [{ slot_id: 'S1', label: 'Daily Cutoff', due_time: val }]
                          }));
                        }}
                        style={{ padding: '0.4rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}
                      />
                    </div>
                  )}

                  {/* If repetition > 1, show individual slot cards */}
                  {(templateForm.daily_repetition_count || 1) > 1 && (
                    <div style={{ background: '#ffffff', borderRadius: '8px', padding: '0.75rem', border: '1px solid #e0f2fe', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0369a1' }}>
                          ⏰ Execution Time Slots ({templateForm.daily_slots?.length || templateForm.daily_repetition_count} Separate Checklists / Day)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const resetSlots = generateDefaultDailySlots(templateForm.daily_repetition_count || 1);
                            setTemplateForm(prev => ({
                              ...prev,
                              daily_slots: resetSlots,
                              due_time: resetSlots[0]?.due_time || prev.due_time
                            }));
                          }}
                          style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                        >
                          ⚡ Auto-distribute evenly (09:00 AM - 09:00 PM)
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
                        {(templateForm.daily_slots || []).map((slot, sIdx) => (
                          <div key={slot.slot_id || sIdx} style={{ background: '#f8fafc', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                                Slot #{sIdx + 1} ({slot.slot_id})
                              </span>
                              <input
                                type="time"
                                value={slot.due_time || '18:00'}
                                onChange={(e) => {
                                  const updated = [...(templateForm.daily_slots || [])];
                                  updated[sIdx] = { ...updated[sIdx], due_time: e.target.value };
                                  setTemplateForm(prev => ({ ...prev, daily_slots: updated }));
                                }}
                                style={{ padding: '0.25rem 0.45rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 700 }}
                              />
                            </div>
                            <input
                              type="text"
                              placeholder={`Slot ${sIdx + 1} Label (e.g. Opening, Mid-Day, Closing)`}
                              value={slot.label || ''}
                              onChange={(e) => {
                                const updated = [...(templateForm.daily_slots || [])];
                                updated[sIdx] = { ...updated[sIdx], label: e.target.value };
                                setTemplateForm(prev => ({ ...prev, daily_slots: updated }));
                              }}
                              style={{ padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {templateForm.frequency === 'WEEKLY' && (
                <div style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '10px', border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#166534' }}>
                    🗓️ Weekly Scheduling (Select Active Days & Cutoff Time)
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(dayName => {
                      const isSelected = (templateForm.days_of_week || ['Monday']).includes(dayName);
                      return (
                        <button
                          key={dayName}
                          type="button"
                          onClick={() => {
                            setTemplateForm(prev => {
                              const cur = prev.days_of_week || ['Monday'];
                              const next = isSelected ? cur.filter(d => d !== dayName) : [...cur, dayName];
                              return { ...prev, days_of_week: next.length > 0 ? next : [dayName] };
                            });
                          }}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: isSelected ? '2px solid #16a34a' : '1px solid #cbd5e1',
                            background: isSelected ? '#16a34a' : '#ffffff',
                            color: isSelected ? '#ffffff' : '#334155'
                          }}
                        >
                          {dayName.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#166534' }}>Weekly Cutoff Time:</span>
                    <input
                      type="time"
                      value={templateForm.due_time || '18:00'}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, due_time: e.target.value }))}
                      style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}
                    />
                  </div>
                </div>
              )}

              {templateForm.frequency === 'FORTNIGHTLY' && (
                <div style={{ background: '#faf5ff', padding: '1rem', borderRadius: '10px', border: '1px solid #e9d5ff', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#6b21a8' }}>
                    🌓 15 Days (Fortnightly) Scheduling
                  </span>
                  <p style={{ fontSize: '0.8rem', color: '#7e22ce', margin: 0 }}>
                    This checklist triggers twice a month (Period 1: 1st - 15th, Period 2: 16th - Month End).
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b21a8' }}>Period Cutoff Time:</span>
                    <input
                      type="time"
                      value={templateForm.due_time || '18:00'}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, due_time: e.target.value }))}
                      style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}
                    />
                  </div>
                </div>
              )}

              {templateForm.frequency === 'MONTHLY' && (
                <div style={{ background: '#fffbeb', padding: '1rem', borderRadius: '10px', border: '1px solid #fde68a', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#b45309' }}>
                    📆 Monthly Scheduling (Select Target Date & Cutoff Time)
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#92400e' }}>Due on Day:</span>
                      <select
                        value={templateForm.day_of_month || 1}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, day_of_month: parseInt(e.target.value, 10) }))}
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.85rem' }}
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                          <option key={day} value={day}>
                            {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of every month
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#92400e' }}>Cutoff Time:</span>
                      <input
                        type="time"
                        value={templateForm.due_time || '18:00'}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, due_time: e.target.value }))}
                        style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {templateForm.frequency === 'QUARTERLY' && (
                <div style={{ background: '#fdf2f8', padding: '1rem', borderRadius: '10px', border: '1px solid #fbcfe8', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#be185d' }}>
                    📊 Quarterly Scheduling (Every 3 Months)
                  </span>
                  <p style={{ fontSize: '0.8rem', color: '#9d174d', margin: 0 }}>
                    Triggers once every quarter (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec). Select target month, due date & cutoff time:
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#9d174d' }}>Quarter Month:</span>
                      <select
                        value={templateForm.quarter_month || 3}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, quarter_month: parseInt(e.target.value, 10) }))}
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.85rem' }}
                      >
                        <option value={1}>1st Month (Jan / Apr / Jul / Oct)</option>
                        <option value={2}>2nd Month (Feb / May / Aug / Nov)</option>
                        <option value={3}>3rd Month / Quarter-End (Mar / Jun / Sep / Dec)</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#9d174d' }}>Due on Day:</span>
                      <select
                        value={templateForm.day_of_month || 1}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, day_of_month: parseInt(e.target.value, 10) }))}
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.85rem' }}
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                          <option key={day} value={day}>
                            {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of month
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#9d174d' }}>Cutoff Time:</span>
                      <input
                        type="time"
                        value={templateForm.due_time || '18:00'}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, due_time: e.target.value }))}
                        style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {templateForm.frequency === 'HALF_YEARLY' && (
                <div style={{ background: '#ecfeff', padding: '1rem', borderRadius: '10px', border: '1px solid #a5f3fc', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0e7490' }}>
                    🏢 6 Months (Half-Yearly) Scheduling
                  </span>
                  <p style={{ fontSize: '0.8rem', color: '#155e75', margin: 0 }}>
                    Triggers twice a year (1st Half: Jan-Jun, 2nd Half: Jul-Dec). Select target month, due date & cutoff time:
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#155e75' }}>Half-Year Month:</span>
                      <select
                        value={templateForm.half_yearly_month || 6}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, half_yearly_month: parseInt(e.target.value, 10) }))}
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.85rem' }}
                      >
                        <option value={1}>1st Month (January & July)</option>
                        <option value={2}>2nd Month (February & August)</option>
                        <option value={3}>3rd Month (March & September)</option>
                        <option value={4}>4th Month (April & October)</option>
                        <option value={5}>5th Month (May & November)</option>
                        <option value={6}>6th Month / Half-Year End (June & December)</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#155e75' }}>Due on Day:</span>
                      <select
                        value={templateForm.day_of_month || 1}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, day_of_month: parseInt(e.target.value, 10) }))}
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.85rem' }}
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                          <option key={day} value={day}>
                            {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of month
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#155e75' }}>Cutoff Time:</span>
                      <input
                        type="time"
                        value={templateForm.due_time || '18:00'}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, due_time: e.target.value }))}
                        style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {templateForm.frequency === 'YEARLY' && (
                <div style={{ background: '#eef2ff', padding: '1rem', borderRadius: '10px', border: '1px solid #c7d2fe', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#4338ca' }}>
                    🏆 1 Year (Annual) Scheduling
                  </span>
                  <p style={{ fontSize: '0.8rem', color: '#3730a3', margin: 0 }}>
                    Triggers once every year. Select the target month, due date and cutoff time:
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#3730a3' }}>Target Month:</span>
                      <select
                        value={templateForm.month_of_year || 12}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, month_of_year: parseInt(e.target.value, 10) }))}
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.85rem' }}
                      >
                        {[
                          { id: 1, name: 'January' },
                          { id: 2, name: 'February' },
                          { id: 3, name: 'March' },
                          { id: 4, name: 'April' },
                          { id: 5, name: 'May' },
                          { id: 6, name: 'June' },
                          { id: 7, name: 'July' },
                          { id: 8, name: 'August' },
                          { id: 9, name: 'September' },
                          { id: 10, name: 'October' },
                          { id: 11, name: 'November' },
                          { id: 12, name: 'December' }
                        ].map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#3730a3' }}>Due on Day:</span>
                      <select
                        value={templateForm.day_of_month || 1}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, day_of_month: parseInt(e.target.value, 10) }))}
                        style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.85rem' }}
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                          <option key={day} value={day}>
                            {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of month
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#3730a3' }}>Cutoff Time:</span>
                      <input
                        type="time"
                        value={templateForm.due_time || '18:00'}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, due_time: e.target.value }))}
                        style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Sunday & Holiday Scheduling Rules */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Sunday Rule */}
                <div style={{ background: 'var(--bg-secondary, #f8fafc)', padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary, #1e293b)' }}>
                    📅 Sunday Checklist Rule
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
                    Should this checklist be required on Sundays?
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                    <button
                      type="button"
                      onClick={() => setTemplateForm(prev => ({ ...prev, include_sundays: true }))}
                      style={{
                        flex: 1,
                        padding: '0.4rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: templateForm.include_sundays !== false ? '2px solid #16a34a' : '1px solid #cbd5e1',
                        background: templateForm.include_sundays !== false ? '#dcfce7' : '#ffffff',
                        color: templateForm.include_sundays !== false ? '#166534' : '#64748b'
                      }}
                    >
                      ✅ Yes (Include)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateForm(prev => ({ ...prev, include_sundays: false }))}
                      style={{
                        flex: 1,
                        padding: '0.4rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: templateForm.include_sundays === false ? '2px solid #dc2626' : '1px solid #cbd5e1',
                        background: templateForm.include_sundays === false ? '#fee2e2' : '#ffffff',
                        color: templateForm.include_sundays === false ? '#991b1b' : '#64748b'
                      }}
                    >
                      ❌ No (Skip Sundays)
                    </button>
                  </div>
                </div>

                {/* Holiday Rule */}
                <div style={{ background: 'var(--bg-secondary, #f8fafc)', padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary, #1e293b)' }}>
                    🎉 Public / Company Holidays Rule
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
                    Should this checklist run on national & company holidays?
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                    <button
                      type="button"
                      onClick={() => setTemplateForm(prev => ({ ...prev, include_holidays: true }))}
                      style={{
                        flex: 1,
                        padding: '0.4rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: templateForm.include_holidays === true ? '2px solid #16a34a' : '1px solid #cbd5e1',
                        background: templateForm.include_holidays === true ? '#dcfce7' : '#ffffff',
                        color: templateForm.include_holidays === true ? '#166534' : '#64748b'
                      }}
                    >
                      ✅ Yes (Include)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateForm(prev => ({ ...prev, include_holidays: false }))}
                      style={{
                        flex: 1,
                        padding: '0.4rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: templateForm.include_holidays !== true ? '2px solid #dc2626' : '1px solid #cbd5e1',
                        background: templateForm.include_holidays !== true ? '#fee2e2' : '#ffffff',
                        color: templateForm.include_holidays !== true ? '#991b1b' : '#64748b'
                      }}
                    >
                      ❌ No (Skip Holidays)
                    </button>
                  </div>
                </div>
              </div>

              {/* Time Window Buffer Setting */}
              <div style={{ background: 'var(--bg-secondary, #f8fafc)', padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary, #1e293b)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    ⏳ Submission Window Buffer Time (Checklist kitni der tak khuli rahegi?)
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)' }}>
                    Slot time par checklist unlock hogi. Buffer time ke baad agar submit nahi hui to automatically Expired / Missed mark ho jayegi.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                  {[
                    { mins: 15, label: '15 Mins' },
                    { mins: 20, label: '20 Mins (Standard)' },
                    { mins: 30, label: '30 Mins' },
                    { mins: 45, label: '45 Mins' },
                    { mins: 60, label: '60 Mins (1 Hour)' }
                  ].map(buf => {
                    const isSelected = (templateForm.buffer_minutes || 20) === buf.mins;
                    return (
                      <button
                        key={buf.mins}
                        type="button"
                        onClick={() => setTemplateForm(prev => ({ ...prev, buffer_minutes: buf.mins }))}
                        style={{
                          padding: '0.4rem 0.8rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
                          background: isSelected ? '#eff6ff' : '#ffffff',
                          color: isSelected ? '#1d4ed8' : '#475569'
                        }}
                      >
                        {buf.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Delayed / Late Submission Setting Toggle */}
              <div style={{
                background: templateForm.allow_delayed_submission ? '#fef3c7' : 'var(--bg-secondary, #f8fafc)',
                padding: '0.85rem',
                borderRadius: '10px',
                border: templateForm.allow_delayed_submission ? '1.5px solid #fde68a' : '1px solid var(--border-color, #e2e8f0)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                transition: 'all 0.2s ease'
              }}>
                <input
                  type="checkbox"
                  id="allow_delayed_submission_toggle"
                  checked={Boolean(templateForm.allow_delayed_submission)}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, allow_delayed_submission: e.target.checked }))}
                  style={{ width: '18px', height: '18px', marginTop: '0.15rem', cursor: 'pointer', accentColor: '#d97706' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', cursor: 'pointer' }}>
                  <label htmlFor="allow_delayed_submission_toggle" style={{ fontSize: '0.88rem', fontWeight: 700, color: templateForm.allow_delayed_submission ? '#92400e' : 'var(--text-primary, #1e293b)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>⚠️ Allow Late / Delayed Submissions (Delay Submission Option)</span>
                  </label>
                  <span style={{ fontSize: '0.78rem', color: templateForm.allow_delayed_submission ? '#78350f' : 'var(--text-secondary, #64748b)' }}>
                    {templateForm.allow_delayed_submission
                      ? '✓ Enabled: Buffer time khatam hone ke baad bhi checklist submit ki ja sakegi (Dashboard me "Completed Late / Delayed" tag ke sath record hogi).'
                      : '✗ Disabled (Strict Window): Buffer time cross hone par slot lock ho jayega aur "Expired / Missed" mark ho jayega.'}
                  </span>
                </div>
              </div>

              {/* Row 3: Assignment Target Selector (Single, Multi, All Staff) */}
              <div style={{ background: 'var(--bg-secondary, #f8fafc)', padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary, #1e293b)' }}>
                    Assign Checklist To:
                  </label>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setTemplateForm(prev => ({
                        ...prev,
                        assignment_mode: 'SINGLE',
                        assigned_type: 'EMPLOYEE',
                        assigned_employee_email: (prev.assigned_employee_email || '').split(',')[0] || userEmail || ''
                      }))}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: templateForm.assignment_mode === 'SINGLE' ? '1.5px solid #3b82f6' : '1px solid #cbd5e1',
                        background: templateForm.assignment_mode === 'SINGLE' ? '#eff6ff' : '#ffffff',
                        color: templateForm.assignment_mode === 'SINGLE' ? '#1d4ed8' : '#64748b'
                      }}
                    >
                      👤 Single Employee
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateForm(prev => ({
                        ...prev,
                        assignment_mode: 'MULTI',
                        assigned_type: 'EMPLOYEE'
                      }))}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: templateForm.assignment_mode === 'MULTI' ? '1.5px solid #3b82f6' : '1px solid #cbd5e1',
                        background: templateForm.assignment_mode === 'MULTI' ? '#eff6ff' : '#ffffff',
                        color: templateForm.assignment_mode === 'MULTI' ? '#1d4ed8' : '#64748b'
                      }}
                    >
                      👥 Multiple Employees (Select 5, 10, 15+ Staff)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateForm(prev => ({
                        ...prev,
                        assignment_mode: 'ALL',
                        assigned_type: 'ALL',
                        assigned_employee_email: '',
                        assigned_employee_name: 'All Staff'
                      }))}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: templateForm.assignment_mode === 'ALL' ? '1.5px solid #8b5cf6' : '1px solid #cbd5e1',
                        background: templateForm.assignment_mode === 'ALL' ? '#f5f3ff' : '#ffffff',
                        color: templateForm.assignment_mode === 'ALL' ? '#6d28d9' : '#64748b'
                      }}
                    >
                      🏢 All Staff (Company-Wide)
                    </button>
                  </div>
                </div>

                {templateForm.assignment_mode === 'SINGLE' && (
                  <div>
                    <SearchableEmployeeSelect
                      employees={employeesList}
                      selectedEmail={templateForm.assigned_employee_email}
                      placeholder="Search & select single employee..."
                      onSelect={(emp) => {
                        setTemplateForm(prev => ({
                          ...prev,
                          assigned_employee_email: emp?.email || '',
                          assigned_employee_name: emp ? emp.name || emp.emp_name : '',
                          department: emp?.department || prev.department,
                          assigned_type: 'EMPLOYEE'
                        }));
                      }}
                    />
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)', marginTop: '4px' }}>
                      ℹ️ This checklist will appear only in this selected employee's personal dashboard.
                    </div>
                  </div>
                )}

                {templateForm.assignment_mode === 'MULTI' && (
                  <div>
                    <SearchableEmployeeSelect
                      isMulti={true}
                      employees={employeesList}
                      selectedEmails={templateForm.assigned_employee_email ? templateForm.assigned_employee_email.split(',') : []}
                      placeholder="Search & check multiple employees (e.g. 10-15 staff)..."
                      onMultiSelect={(objs, emails) => {
                        const names = objs.map(o => o.name || o.emp_name).filter(Boolean);
                        const displayName = names.length > 0
                          ? `${names.length} Employees (${names.slice(0, 2).join(', ')}${names.length > 2 ? '...' : ''})`
                          : '';
                        setTemplateForm(prev => ({
                          ...prev,
                          assigned_employee_email: emails.join(','),
                          assigned_employee_name: displayName,
                          assigned_type: 'EMPLOYEE'
                        }));
                      }}
                    />
                    <div style={{ fontSize: '0.75rem', color: '#2563eb', marginTop: '4px' }}>
                      🔒 <strong>Private & Isolated:</strong> Each selected employee gets their own private checklist instance. They cannot see other employees' responses.
                    </div>
                  </div>
                )}

                {templateForm.assignment_mode === 'ALL' && (
                  <div style={{ padding: '0.6rem 0.85rem', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', fontSize: '0.85rem', color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>🏢</span>
                    <span><strong>Company-Wide Assignment:</strong> Every employee in the company will receive their own individual checklist card. Responses remain strictly private to each employee.</span>
                  </div>
                )}
              </div>

              {/* Items / Questions Builder */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    Checklist Questions / Sub-items ({templateForm.items.length})
                  </label>
                  <button
                    onClick={handleAddItemToTemplate}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <Plus size={14} /> Add Item
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {templateForm.items.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr auto auto',
                        gap: '0.75rem',
                        alignItems: 'center',
                        background: 'var(--bg-secondary, #f8fafc)',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #e2e8f0)'
                      }}
                    >
                      <input
                        type="text"
                        placeholder={`Question / Step #${idx + 1}...`}
                        value={item.title}
                        onChange={(e) => handleUpdateTemplateItem(idx, 'title', e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%' }}
                      />

                      <select
                        value={item.type || 'done_not_done'}
                        onChange={(e) => handleUpdateTemplateItem(idx, 'type', e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 500, fontSize: '0.85rem' }}
                      >
                        {CHECKLIST_ITEM_TYPES.map(t => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={item.is_required}
                          onChange={(e) => handleUpdateTemplateItem(idx, 'is_required', e.target.checked)}
                        />
                        Required
                      </label>

                      <button
                        onClick={() => handleRemoveTemplateItem(idx)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                        title="Remove question"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-secondary, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setTemplateModalOpen(false)}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  padding: '0.55rem 1.25rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Cancel
              </button>

              <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleSaveTemplate('DRAFT')}
                  style={{
                    background: '#fef3c7',
                    color: '#92400e',
                    border: '1px solid #fcd34d',
                    padding: '0.55rem 1.15rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                  title="Save as work-in-progress draft without assigning"
                >
                  📝 Save as Draft
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveTemplate('INACTIVE')}
                  style={{
                    background: '#fee2e2',
                    color: '#991b1b',
                    border: '1px solid #fca5a5',
                    padding: '0.55rem 1.15rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                  title="Save but keep paused/inactive"
                >
                  🔴 Save as Inactive
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveTemplate('ACTIVE')}
                  style={{
                    background: '#22c55e',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.55rem 1.4rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <Check size={16} /> 🟢 Publish & Activate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: MANAGER VERIFICATION SIGN-OFF                                    */}
      {/* ========================================================================= */}
      {verifyModalOpen && verifyingSubmission && (
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
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Review Checklist Submission</h3>
              <button onClick={() => setVerifyModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Employee:</span>
                <div style={{ fontWeight: 600 }}>{verifyingSubmission.employee_name} ({verifyingSubmission.employee_email})</div>
              </div>

              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Checklist:</span>
                <div style={{ fontWeight: 600 }}>{verifyingSubmission.template_title} ({verifyingSubmission.frequency})</div>
              </div>

              {verifyingSubmission.responses && Object.keys(verifyingSubmission.responses).length > 0 && (
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                    Item Responses ({Object.keys(verifyingSubmission.responses).length}):
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto', background: 'var(--bg-secondary, #f8fafc)', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    {Object.entries(verifyingSubmission.responses).map(([k, v], idx) => {
                      let displayVal = String(v);
                      let badgeBg = '#f1f5f9';
                      let badgeColor = '#334155';

                      if (v === 'DONE' || v === true || v === 'true' || v === 'WORKING' || v === 'UPDATED' || v === 'COMPLETED' || v === 'YES') {
                        badgeBg = '#dcfce7';
                        badgeColor = '#15803d';
                        displayVal = v === 'WORKING' ? '🟢 Working' : v === 'UPDATED' ? '✅ Updated' : v === 'COMPLETED' ? '✅ Completed' : '✅ Done';
                      } else if (v === 'NOT_DONE' || v === false || v === 'false' || v === 'NOT_WORKING' || v === 'NOT_UPDATED' || v === 'NOT_COMPLETED' || v === 'NO') {
                        badgeBg = '#fee2e2';
                        badgeColor = '#b91c1c';
                        displayVal = v === 'NOT_WORKING' ? '🔴 Not Working' : v === 'NOT_UPDATED' ? '❌ Not Updated' : v === 'NOT_COMPLETED' ? '❌ Not Completed' : '❌ Not Done';
                      }

                      return (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', padding: '0.25rem 0.4rem', borderBottom: '1px solid #e2e8f0' }}>
                          <span style={{ color: '#475569' }}>Item #{idx + 1}</span>
                          <span style={{ background: badgeBg, color: badgeColor, fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                            {displayVal}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)' }}>Employee Submission Notes:</span>
                <div style={{ background: 'var(--bg-secondary, #f8fafc)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                  {verifyingSubmission.submission_notes || 'No remarks submitted.'}
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                  Manager Remarks / Feedback:
                </label>
                <textarea
                  placeholder="Approved / Notes..."
                  rows={2}
                  value={verifyRemarks}
                  onChange={(e) => setVerifyRemarks(e.target.value)}
                  style={{ padding: '0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%' }}
                />
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-secondary, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => handleSaveVerification('REVISION_REQUESTED')}
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  padding: '0.55rem 1.2rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Request Revision
              </button>
              <button
                onClick={() => handleSaveVerification('APPROVED')}
                style={{
                  background: '#22c55e',
                  color: '#fff',
                  border: 'none',
                  padding: '0.55rem 1.5rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Approve & Sign Off
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: ADD / EDIT COMPANY HOLIDAY                                       */}
      {/* ========================================================================= */}
      {holidayModalOpen && (
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
            maxWidth: '500px',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '1.2rem 1.5rem', background: '#1e293b', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.2rem' }}>🎉</span>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                  {editingHoliday ? 'Edit Company Holiday' : 'Add New Company Holiday'}
                </h3>
              </div>
              <button
                onClick={() => setHolidayModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                  Holiday Date *
                </label>
                <input
                  type="date"
                  value={holidayForm.date}
                  onChange={(e) => setHolidayForm(prev => ({ ...prev, date: e.target.value }))}
                  style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%', fontWeight: 600 }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                  Holiday Name / Occasion *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Diwali Pujan / Company Founders Day"
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm(prev => ({ ...prev, name: e.target.value }))}
                  style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                  Holiday Category / Type
                </label>
                <select
                  value={holidayForm.type}
                  onChange={(e) => setHolidayForm(prev => ({ ...prev, type: e.target.value }))}
                  style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%' }}
                >
                  <option value="COMPANY">🏢 Company Holiday / Annual Off</option>
                  <option value="NATIONAL">🏛️ National Holiday</option>
                  <option value="FESTIVAL">🎉 Festival / Religious</option>
                  <option value="REGIONAL">📍 Regional / State Off</option>
                </select>
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                  Description / Remarks (Optional)
                </label>
                <textarea
                  placeholder="e.g. Mandatory day off across all departments..."
                  rows={2}
                  value={holidayForm.description}
                  onChange={(e) => setHolidayForm(prev => ({ ...prev, description: e.target.value }))}
                  style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%' }}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-secondary, #f8fafc)', borderTop: '1px solid var(--border-color, #e2e8f0)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setHolidayModalOpen(false)}
                style={{
                  background: 'none',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  padding: '0.55rem 1.2rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingHoliday}
                onClick={handleSaveHoliday}
                style={{
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.55rem 1.5rem',
                  borderRadius: '8px',
                  cursor: savingHoliday ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <Check size={16} />
                {savingHoliday ? 'Saving...' : editingHoliday ? 'Update Holiday' : 'Save Holiday'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
