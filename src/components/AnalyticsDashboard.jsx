'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList
} from 'recharts';
import { getDashboardMetrics, getUserAssignedWorkSummary, getDashboardSummaries } from '@/app/actions/analytics';
import {
  Activity, Loader2, Users, AlertTriangle, TrendingUp, ArrowRight,
  Target, RefreshCw, User, CheckSquare, CheckCircle2, CalendarClock,
  ClipboardList, UserCheck, Briefcase, Award, Search, Flame,
  ChevronRight, Star, ShieldAlert, PhoneCall, Check, Clock, AlertCircle,
  Filter, Layers, MessageSquare, Zap, ExternalLink, FileText, UserPlus,
  Phone, Mail, Database
} from 'lucide-react';
import DateRangePicker, { computeDateRange } from '@/components/common/DateRangePicker';
import SearchableEmployeeSelect from '@/components/common/SearchableEmployeeSelect';

const COLORS = [
  'var(--chart-1, #3b82f6)',
  'var(--chart-2, #10b981)',
  'var(--chart-3, #f59e0b)',
  'var(--chart-4, #8b5cf6)',
  'var(--chart-5, #ec4899)',
  'var(--chart-6, #06b6d4)',
  'var(--chart-7, #f97316)'
];

const getStageBadgeInfo = (stage, status) => {
  switch (stage) {
    case 'S00': return { label: 'S00 Unassigned', bg: '#fef3c7', color: '#b45309' };
    case 'S01': return { label: 'S01 Requisition', bg: '#dbeafe', color: '#1d4ed8' };
    case 'S02': return { label: 'S02 Screening', bg: '#f1f5f9', color: '#475569' };
    case 'S03': return { label: 'S03 Interview', bg: '#ede9fe', color: '#6d28d9' };
    case 'S04': return { label: 'S04 Skill Test', bg: '#f3e8ff', color: '#7e22ce' };
    case 'S05': return { label: 'S05 ED Approval', bg: '#cffafe', color: '#0e7490' };
    case 'S06': return { label: 'S06 Salary Neg.', bg: '#fef3c7', color: '#b45309' };
    case 'S07': return { label: 'S07 Shortlisted', bg: '#dcfce7', color: '#15803d' };
    case 'S08': return { label: 'S08 LOI Offered', bg: '#e0e7ff', color: '#3730a3' };
    case 'S09': return { label: 'S09 Joined/Onboard', bg: '#bbf7d0', color: '#166534' };
    default: return { label: stage || status || 'Applied', bg: '#f3f4f6', color: '#374151' };
  }
};

export default function AnalyticsDashboard({ 
  leads = [], 
  teamMembers = [],
  userEmail = '',
  userName = '',
  userId = '',
  userRole = '',
  onNavigateTab,
  initialSubTab = ''
}) {
  const [activeTab, setActiveTabState] = useState(() => {
    let initial = initialSubTab;
    if (initial === 'pipeline' || initial === 'leads-data') initial = 'lead-data';
    if (initial && ['overview', 'scorecard', 'delegation', 'checklist', 'attendance', 'recruiter', 'lead-data'].includes(initial)) {
      return initial;
    }
    if (typeof window !== 'undefined') {
      const rawPath = window.location.pathname || '';
      let cleanPath = (typeof rawPath === 'string' ? rawPath : '').replace(/^\/+|\/+$/g, '').toLowerCase();
      if (cleanPath === 'pipeline' || cleanPath === 'leads-data') cleanPath = 'lead-data';
      const params = new URLSearchParams(window.location.search);
      let urlTab = params.get('subtab') || params.get('tab');
      if (urlTab === 'pipeline' || urlTab === 'leads-data') urlTab = 'lead-data';
      if (urlTab && ['overview', 'scorecard', 'delegation', 'checklist', 'attendance', 'recruiter', 'lead-data'].includes(urlTab)) {
        return urlTab;
      }
      if (['scorecard', 'overview', 'lead-data'].includes(cleanPath)) return cleanPath;
      if (cleanPath && cleanPath.startsWith('dashboard/')) {
        let sub = cleanPath.split('/')[1];
        if (sub === 'pipeline' || sub === 'leads-data') sub = 'lead-data';
        if (['overview', 'scorecard', 'delegation', 'checklist', 'attendance', 'recruiter', 'lead-data'].includes(sub)) {
          return sub;
        }
      }
    }
    return 'overview';
  });

  const setActiveTab = (tabId) => {
    const canonical = (tabId === 'pipeline' || tabId === 'leads-data') ? 'lead-data' : tabId;
    setActiveTabState(canonical);
    if (typeof window !== 'undefined') {
      let routePath = `/dashboard?tab=${canonical}`;
      if (canonical === 'scorecard') routePath = '/scorecard';
      else if (canonical === 'overview') routePath = '/dashboard';
      else if (canonical === 'lead-data') routePath = '/lead-data';
      
      window.history.pushState({ tab: 'dashboard', subTab: canonical }, '', routePath);
    }
  };

  // Sync when initialSubTab changes from parent
  useEffect(() => {
    if (initialSubTab) {
      const canonical = (initialSubTab === 'pipeline' || initialSubTab === 'leads-data') ? 'lead-data' : initialSubTab;
      if (['overview', 'scorecard', 'delegation', 'checklist', 'attendance', 'recruiter', 'lead-data'].includes(canonical)) {
        setActiveTabState(canonical);
      }
    }
  }, [initialSubTab]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePop = () => {
      const rawPath = typeof window !== 'undefined' ? (window.location.pathname || '') : '';
      let cleanPath = (typeof rawPath === 'string' ? rawPath : '').replace(/^\/+|\/+$/g, '').toLowerCase();
      if (cleanPath === 'pipeline' || cleanPath === 'leads-data') cleanPath = 'lead-data';
      const params = new URLSearchParams(window.location.search);
      let urlTab = params.get('subtab') || params.get('tab');
      if (urlTab === 'pipeline' || urlTab === 'leads-data') urlTab = 'lead-data';
      if (urlTab && ['overview', 'scorecard', 'delegation', 'checklist', 'attendance', 'recruiter', 'lead-data'].includes(urlTab)) {
        setActiveTabState(urlTab);
      } else if (cleanPath === 'scorecard') {
        setActiveTabState('scorecard');
      } else if (cleanPath === 'lead-data') {
        setActiveTabState('lead-data');
      } else if (cleanPath && cleanPath.startsWith('dashboard/')) {
        let sub = cleanPath.split('/')[1];
        if (sub === 'pipeline' || sub === 'leads-data') sub = 'lead-data';
        if (['overview', 'scorecard', 'delegation', 'checklist', 'attendance', 'recruiter', 'lead-data'].includes(sub)) {
          setActiveTabState(sub);
        }
      } else if (cleanPath === 'dashboard' && !urlTab) {
        setActiveTabState('overview');
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const [datePreset, setDatePreset] = useState('today');
  const [startDate, setStartDate] = useState(() => computeDateRange('today').startDate);
  const [endDate, setEndDate] = useState(() => computeDateRange('today').endDate);

  // Search/filter state inside sub-tabs
  const [scorecardSearch, setScorecardSearch] = useState('');
  const [scorecardDeptFilter, setScorecardDeptFilter] = useState('ALL'); // 'ALL' | 'SALES' | 'RECRUITER' | 'OPERATIONS'
  const [taskSearch, setTaskSearch] = useState('');
  const [checklistSearch, setChecklistSearch] = useState('');
  const [checklistViewMode, setChecklistViewMode] = useState('BY_EMPLOYEE'); // 'BY_EMPLOYEE' | 'BY_SLOTS'
  const [attendanceFilter, setAttendanceFilter] = useState('ALL'); // 'ALL' | 'PRESENT' | 'CRM_ACTIVE' | 'ABSENT' | 'LATE'
  const [recruiterFilter, setRecruiterFilter] = useState('ALL'); // 'ALL' | 'INTERVIEW' | 'SHORTLISTED' | 'HIRED' | 'REJECTED'
  const [recruiterSearch, setRecruiterSearch] = useState('');

  const myTeamMember = useMemo(() => {
    if (!teamMembers || teamMembers.length === 0) return null;
    return teamMembers.find(t =>
      (userEmail && (t.email?.toLowerCase() === userEmail?.toLowerCase() || t.user_id === userEmail)) ||
      (userName && t.emp_name && t.emp_name.toLowerCase() === userName.toLowerCase()) ||
      (userId && t.user_id === userId)
    );
  }, [teamMembers, userEmail, userName, userId]);

  // Only include team members approved in Team Management (is_approved === true, non-customer, active status)
  const formattedEmployees = useMemo(() => {
    if (!Array.isArray(teamMembers)) return [];
    return teamMembers
      .filter(m => {
        // Exclude customers
        if (m.role === 'customer') return false;
        // Check approval in Team Management (Admins are always approved)
        const isApproved = m.is_approved === true || m.is_approved === 'true' || m.role === 'admin' || m.role === 'Admin';
        if (!isApproved) return false;
        // Check active employment status
        const status = m.emp_status || (m.module_access && m.module_access.emp_status) || 'Active';
        if (['InActive', 'Terminated', 'Resigned', 'Trash', 'Draft'].includes(status)) return false;
        return true;
      })
      .map(m => ({
        ...m,
        name: m.emp_name || m.name || m.user_id,
        emp_name: m.emp_name || m.name || m.user_id,
        email: (m.email || m.user_id || '').trim().toLowerCase(),
        user_id: m.user_id || m.email,
        department: m.department || m.emp_department || m.dept || 'Staff',
        designation: m.designation || m.emp_designation || m.role || 'Member'
      }));
  }, [teamMembers]);

  const [selectedEmployee, setSelectedEmployee] = useState('All');
  const [metrics, setMetrics] = useState({ employeeActivity: [], whatsappStats: { period: 0, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [loadingAssignedWork, setLoadingAssignedWork] = useState(true);
  const [assignedWork, setAssignedWork] = useState({
    delegation: { total: 0, pending: 0, inProgress: 0, submitted: 0, completed: 0, overdue: 0, priorityBreakdown: { high: 0, medium: 0, low: 0 }, recentTasks: [] },
    checklists: { totalSlots: 0, completed: 0, completedLate: 0, pending: 0, complianceRate: 0, isSunday: false, items: [] },
    effectiveEmail: ''
  });
  const [dashboardSummaries, setDashboardSummaries] = useState({
    attendanceSummary: { totalEmployees: 0, totalPresent: 0, totalAbsent: 0, totalLate: 0, totalHalfDay: 0, presentPercent: 0, records: [] },
    checklistSummary: { totalSlots: 0, completed: 0, pending: 0, onTime: 0, late: 0, complianceRate: 0, items: [] },
    recruitmentSummary: {
      openPositions: 0,
      totalPositions: 0,
      totalApplications: 0,
      totalCandidates: 0,
      newToday: 0,
      inInterview: 0,
      shortlisted: 0,
      hired: 0,
      rejected: 0,
      positions: [],
      candidates: []
    }
  });
  const [loadingSummaries, setLoadingSummaries] = useState(true);

  const dateFilterLabel = (() => {
    if (datePreset === 'today') return 'Today';
    if (datePreset === 'yesterday') return 'Yesterday';
    if (datePreset === 'this_week') return 'This Week';
    if (datePreset === 'last_week') return 'Last Week';
    if (datePreset === 'this_month') return 'This Month';
    if (datePreset === 'last_month') return 'Last Month';
    if (datePreset === 'all_time') return 'All Time';
    if (startDate && endDate) return startDate === endDate ? startDate : `${startDate} to ${endDate}`;
    return 'Selected Period';
  })();

  const selectedEmployeeObj = useMemo(() => {
    if (selectedEmployee === 'All') return null;
    return teamMembers.find(t =>
      t.user_id === selectedEmployee || t.email === selectedEmployee ||
      (t.email && t.email.split('@')[0] === selectedEmployee) || t.emp_name === selectedEmployee
    );
  }, [selectedEmployee, teamMembers]);

  const effectiveTargetEmail = useMemo(() => {
    if (selectedEmployee === 'All') return '';
    return selectedEmployeeObj?.email || selectedEmployee;
  }, [selectedEmployee, selectedEmployeeObj]);

  const isMyWorkSelected = useMemo(() => {
    if (selectedEmployee === 'All') return false;
    if (myTeamMember && (selectedEmployee === myTeamMember.user_id || selectedEmployee === myTeamMember.email)) return true;
    if (userEmail && selectedEmployeeObj?.email === userEmail) return true;
    return false;
  }, [selectedEmployee, myTeamMember, userEmail, selectedEmployeeObj]);

  const viewingLabel = useMemo(() => {
    if (selectedEmployee === 'All') return 'All Team Members';
    if (selectedEmployeeObj?.emp_name) return selectedEmployeeObj.emp_name;
    return selectedEmployee;
  }, [selectedEmployee, selectedEmployeeObj]);

  const getStageFromStatus = (status) => {
    if (!status) return '01 - New Stage';
    if (status.startsWith('1;')) return '01 - New Stage';
    if (status.startsWith('2;')) return '02 - Contact Stage';
    if (status.startsWith('3;')) return '03 - Qualification Stage';
    if (status.startsWith('4;')) return '04 - Follow Up Stage';
    if (status.startsWith('5;')) return '05 - Sales Process Stage';
    if (status.startsWith('6;')) return '06 - Conversion Stage';
    if (status.startsWith('7;')) return '07 - Final Stage';
    if (['New', 'Pending'].includes(status)) return '01 - New Stage';
    if (['Converted', 'Order Received', 'Closed', 'Won'].includes(status)) return '07 - Final Stage';
    return '01 - New Stage';
  };

  const filteredLeadsSync = useMemo(() => {
    if (selectedEmployee === 'All') return leads;
    return leads.filter(l => {
      if (l.assigned_to === selectedEmployee) return true;
      if (selectedEmployeeObj) {
        if (l.assigned_to === selectedEmployeeObj.email) return true;
        if (l.assigned_to === selectedEmployeeObj.emp_name) return true;
        if (l.assigned_to === selectedEmployeeObj.user_id) return true;
      }
      return false;
    });
  }, [leads, selectedEmployee, selectedEmployeeObj]);

  const kpis = useMemo(() => {
    const total = filteredLeadsSync.length;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    let overdueFollowups = 0;
    let todayFollowups = 0;
    filteredLeadsSync.forEach(l => {
      const fDateStr = l.follow_up_date || l.next_follow_up_date;
      if (fDateStr) {
        const d = new Date(fDateStr);
        if (!isNaN(d.getTime())) {
          const dateOnly = d.toISOString().split('T')[0];
          if (dateOnly < todayStr) overdueFollowups++;
          else if (dateOnly === todayStr) todayFollowups++;
        }
      }
    });
    const newLeads = filteredLeadsSync.filter(l => {
      const stage = getStageFromStatus(l.status);
      return stage === '01 - New Stage';
    }).length;
    const followUps = filteredLeadsSync.filter(l => {
      const stage = getStageFromStatus(l.status);
      return stage === '04 - Follow Up Stage' ||
        (l.status && (l.status.toLowerCase().includes('reschedule') || l.status.toLowerCase().includes('follow')));
    }).length;
    const inPipeline = filteredLeadsSync.filter(l => {
      const stage = getStageFromStatus(l.status);
      return ['02 - Contact Stage', '03 - Qualification Stage', '05 - Sales Process Stage', '06 - Conversion Stage'].includes(stage);
    }).length;
    const won = filteredLeadsSync.filter(l => {
      const stage = getStageFromStatus(l.status);
      return stage === '07 - Final Stage' && (l.status?.includes('Won') || l.status?.includes('Converted') || l.status?.includes('Closed') || l.status?.includes('Order Received'));
    }).length;
    const actionNeeded = newLeads + followUps;
    return { total, newLeads, followUps, inPipeline, won, actionNeeded, overdueFollowups, todayFollowups };
  }, [filteredLeadsSync]);

  const stageData = useMemo(() => {
    const stageCounts = filteredLeadsSync.reduce((acc, lead) => {
      const stage = getStageFromStatus(lead.status);
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    }, {});
    return Object.keys(stageCounts).sort().map(stage => ({
      name: stage.split('- ')[1] || stage,
      count: stageCounts[stage]
    }));
  }, [filteredLeadsSync]);

  const delegation = assignedWork.delegation || { total: 0, pending: 0, inProgress: 0, submitted: 0, completed: 0, overdue: 0, priorityBreakdown: { high: 0, medium: 0, low: 0 }, recentTasks: [] };
  const checklists = assignedWork.checklists || { totalSlots: 0, completed: 0, completedLate: 0, pending: 0, complianceRate: 0, isSunday: false, items: [] };

  const workHealthScore = useMemo(() => {
    const hasTasks = delegation.total > 0;
    const taskScore = hasTasks ? Math.round((delegation.completed / delegation.total) * 100) : null;
    const hasChecklists = checklists.totalSlots > 0;
    const checklistScore = hasChecklists ? checklists.complianceRate : null;
    const leadActionScore = kpis.total > 0
      ? Math.max(0, Math.min(100, Math.round(((kpis.total - kpis.actionNeeded) / kpis.total) * 100)))
      : 100;
    if (hasTasks && hasChecklists) return Math.round((taskScore * 0.4) + (checklistScore * 0.4) + (leadActionScore * 0.2));
    if (hasTasks) return Math.round((taskScore * 0.6) + (leadActionScore * 0.4));
    if (hasChecklists) return Math.round((checklistScore * 0.7) + (leadActionScore * 0.3));
    return leadActionScore;
  }, [delegation, checklists, kpis]);

  // Load metrics
  useEffect(() => {
    async function loadMetrics() {
      setLoading(true);
      const leadIds = filteredLeadsSync.map(l => l.id);
      if (leadIds.length > 0) {
        let startTimestamp = null;
        let endTimestamp = null;
        if (startDate) startTimestamp = new Date(`${startDate}T00:00:00.000Z`).getTime();
        if (endDate) endTimestamp = new Date(`${endDate}T23:59:59.999Z`).getTime();

        const employeeActivityMap = {};
        filteredLeadsSync.forEach(lead => {
          (lead.lead_notes || []).forEach(note => {
            const noteTime = new Date(note.created_at).getTime();
            if ((!startTimestamp || noteTime >= startTimestamp) && (!endTimestamp || noteTime <= endTimestamp)) {
              let empKey = note.created_by || lead.assigned_to || '';
              if (!empKey) return;
              const empKeyLower = empKey.toLowerCase();
              const tm = formattedEmployees.find(t =>
                t.user_id === empKey ||
                t.email === empKeyLower ||
                (t.email && t.email.split('@')[0] === empKeyLower) ||
                (t.emp_name && t.emp_name.toLowerCase() === empKeyLower)
              );
              // Only attribute activity to team members approved in Team Management
              if (tm) {
                const empName = tm.emp_name || tm.name;
                if (!employeeActivityMap[empName]) employeeActivityMap[empName] = { updates: 0, uniqueLeads: new Set() };
                employeeActivityMap[empName].updates += 1;
                employeeActivityMap[empName].uniqueLeads.add(lead.id);
              }
            }
          });
        });

        const localEmployeeActivity = Object.keys(employeeActivityMap).map(emp => ({
          employee: emp,
          actions: employeeActivityMap[emp].updates,
          uniqueLeads: employeeActivityMap[emp].uniqueLeads.size
        })).sort((a, b) => b.uniqueLeads - a.uniqueLeads);

        const periodLabel = datePreset === 'today' ? 'Today' : (datePreset?.includes('week') ? 'Last 7 Days' : 'This Month');
        const res = await getDashboardMetrics(leadIds, periodLabel);
        if (res.success) {
          setMetrics({ employeeActivity: localEmployeeActivity, whatsappStats: res.data.whatsappStats });
        }
      } else {
        setMetrics({ employeeActivity: [], whatsappStats: { period: 0, total: 0 } });
      }
      setLoading(false);
    }
    loadMetrics();
  }, [filteredLeadsSync, startDate, endDate, datePreset, formattedEmployees]);

  const fetchAssignedWork = async () => {
    setLoadingAssignedWork(true);
    try {
      const res = await getUserAssignedWorkSummary({
        userEmail,
        targetEmail: effectiveTargetEmail,
        isAllSelected: selectedEmployee === 'All',
        targetDate: startDate || new Date()
      });
      if (res?.success) setAssignedWork(res.data);
    } catch (err) {
      console.warn('Error loading assigned work:', err);
    } finally {
      setLoadingAssignedWork(false);
    }
  };

  useEffect(() => { fetchAssignedWork(); }, [userEmail, effectiveTargetEmail, selectedEmployee, startDate]);

  // Load attendance, checklist compliance, recruitment summaries
  const fetchDashboardSummaries = async () => {
    setLoadingSummaries(true);
    try {
      const res = await getDashboardSummaries({ targetDate: startDate });
      if (res?.success) setDashboardSummaries(res.data);
    } catch (e) {
      console.warn('Dashboard summaries error:', e);
    } finally {
      setLoadingSummaries(false);
    }
  };

  useEffect(() => {
    fetchDashboardSummaries();
  }, [startDate]);

  // Compute CRM Active employees map (employees who made updates today/period)
  const crmActiveEmployeesMap = useMemo(() => {
    const map = new Map();
    metrics.employeeActivity.forEach(act => {
      map.set(act.employee.toLowerCase(), act);
    });
    return map;
  }, [metrics.employeeActivity]);

  // Combined attendance records with CRM activity intelligence (defined before Scorecard so Scorecard can use attendance)
  const enrichedAttendanceRecords = useMemo(() => {
    const rawRecords = dashboardSummaries.attendanceSummary?.records || [];
    const recordMap = new Map();
    rawRecords.forEach(r => {
      if (r.email) recordMap.set(r.email.toLowerCase(), r);
    });

    return formattedEmployees.map(emp => {
      const email = (emp.email || '').toLowerCase();
      const rawRec = recordMap.get(email);
      const crmAct = crmActiveEmployeesMap.get(emp.emp_name?.toLowerCase()) || crmActiveEmployeesMap.get(email);
      const isCrmActive = Boolean(crmAct && crmAct.actions > 0);

      let presenceStatus = 'ABSENT';
      let statusLabel = 'Absent (No Punch)';
      let statusColor = '#dc2626';
      let inTime = null;

      if (rawRec && (rawRec.status === 'PRESENT' || rawRec.status === 'LATE' || rawRec.in_time)) {
        presenceStatus = rawRec.status || 'PRESENT';
        statusLabel = rawRec.status === 'LATE' ? 'Late Punch' : 'Punched Present';
        statusColor = rawRec.status === 'LATE' ? '#d97706' : '#16a34a';
        inTime = rawRec.in_time;
      } else if (isCrmActive) {
        presenceStatus = 'CRM_ACTIVE';
        statusLabel = `Active on CRM (${crmAct.actions} updates)`;
        statusColor = '#2563eb';
      }

      return {
        emp,
        empName: emp.emp_name || emp.name,
        empCode: emp.emp_code || emp.emp_id || '—',
        email,
        department: emp.department || 'General',
        designation: emp.designation || 'Staff',
        presenceStatus,
        statusLabel,
        statusColor,
        inTime,
        crmUpdates: crmAct?.actions || 0,
        crmLeadsTouched: crmAct?.uniqueLeads || 0
      };
    });
  }, [formattedEmployees, dashboardSummaries.attendanceSummary, crmActiveEmployeesMap]);

  const filteredAttendance = useMemo(() => {
    if (attendanceFilter === 'ALL') return enrichedAttendanceRecords;
    if (attendanceFilter === 'PRESENT') return enrichedAttendanceRecords.filter(r => r.presenceStatus === 'PRESENT' || r.presenceStatus === 'LATE');
    if (attendanceFilter === 'CRM_ACTIVE') return enrichedAttendanceRecords.filter(r => r.presenceStatus === 'CRM_ACTIVE');
    if (attendanceFilter === 'ABSENT') return enrichedAttendanceRecords.filter(r => r.presenceStatus === 'ABSENT');
    return enrichedAttendanceRecords;
  }, [enrichedAttendanceRecords, attendanceFilter]);

  const attendanceStats = useMemo(() => {
    const total = enrichedAttendanceRecords.length;
    const punched = enrichedAttendanceRecords.filter(r => r.presenceStatus === 'PRESENT' || r.presenceStatus === 'LATE').length;
    const crmActiveOnly = enrichedAttendanceRecords.filter(r => r.presenceStatus === 'CRM_ACTIVE').length;
    const effectivePresent = punched + crmActiveOnly;
    const absent = enrichedAttendanceRecords.filter(r => r.presenceStatus === 'ABSENT').length;
    const effectivePercent = total > 0 ? Math.round((effectivePresent / total) * 100) : 0;
    return { total, punched, crmActiveOnly, effectivePresent, absent, effectivePercent };
  }, [enrichedAttendanceRecords]);

  // Attendance lookup map for fast employee presence checking
  const attendanceRecordMap = useMemo(() => {
    const map = new Map();
    enrichedAttendanceRecords.forEach(att => {
      if (att.email) map.set(att.email.toLowerCase(), att);
      if (att.empName) map.set(att.empName.toLowerCase(), att);
    });
    return map;
  }, [enrichedAttendanceRecords]);

  // Helper: Categorize employee role for dynamic process weighting
  const getEmployeeRoleCategory = (emp, leadsAssignedCount) => {
    const dept = (emp.department || '').toLowerCase();
    const desig = (emp.designation || '').toLowerCase();
    if (dept.includes('human resource') || dept.includes('hr') || desig.includes('recruiter') || desig.includes('talent') || desig.includes('hra')) {
      return 'RECRUITER';
    }
    if (leadsAssignedCount > 0 || dept.includes('sales') || desig.includes('tele') || desig.includes('caller') || desig.includes('crm') || desig.includes('coordinator')) {
      return 'SALES';
    }
    return 'OPERATIONS';
  };

  // Helper: Match recruiter assigned/created_by string to employee
  const isRecruiterMatch = (recruiterField, emp) => {
    if (!recruiterField) return false;
    const f = recruiterField.toLowerCase();
    const name = (emp.emp_name || emp.name || '').toLowerCase();
    const email = (emp.email || '').toLowerCase();
    const code = (emp.emp_code || emp.emp_id || '').toLowerCase();
    if (name && f.includes(name)) return true;
    if (email && f.includes(email)) return true;
    if (code && f.includes(code)) return true;
    return false;
  };

  // Comprehensive Team Scorecard & Leaderboard calculations (Multi-Process Performance Engine)
  const teamScorecardData = useMemo(() => {
    const istNow = new Date(new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }));
    const todayIST = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, '0')}-${String(istNow.getDate()).padStart(2, '0')}`;

    return formattedEmployees.map(emp => {
      const empEmail = (emp.email || '').toLowerCase();
      const empName = emp.emp_name || emp.name || empEmail;

      // Leads assigned to this rep
      const empLeads = leads.filter(l => {
        if (!l.assigned_to) return false;
        const a = l.assigned_to.toLowerCase();
        return a === empEmail || a === emp.user_id?.toLowerCase() || a === empName.toLowerCase();
      });

      // Overdue follow-ups for this rep (evaluated strictly in IST)
      let overdueFollowups = 0;
      let todayFollowups = 0;
      empLeads.forEach(l => {
        const fDate = l.follow_up_date || l.next_follow_up_date;
        if (fDate) {
          const d = new Date(fDate);
          if (!isNaN(d.getTime())) {
            const dStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
            if (dStr < todayIST) overdueFollowups++;
            else if (dStr === todayIST) todayFollowups++;
          }
        }
      });

      // Activity stats from metrics
      const act = crmActiveEmployeesMap.get(empName.toLowerCase()) || 
                  crmActiveEmployeesMap.get(empEmail) || 
                  { actions: 0, uniqueLeads: 0 };

      // Checklists done vs pending for this employee
      const empChecklistSlots = (dashboardSummaries.checklistSummary?.items || []).filter(c => {
        if (c.assigned_type === 'ALL' || !c.assigned_employee_email) return true;
        const emails = c.assigned_employee_email.toLowerCase().split(',').map(e => e.trim());
        return emails.includes(empEmail);
      });
      const checkTotal = empChecklistSlots.length;
      const checkDone = dashboardSummaries.checklistSummary?.submissionsByEmail?.[empEmail] ?? 0;

      // Delegated tasks
      const empTasks = (assignedWork.delegation?.recentTasks || []).filter(t => {
        return (t.assigned_to_email && t.assigned_to_email.toLowerCase() === empEmail) ||
               (t.assigned_to_name && t.assigned_to_name.toLowerCase() === empName.toLowerCase());
      });
      const tasksDone = empTasks.filter(t => t.status === 'COMPLETED').length;
      const tasksOverdue = empTasks.filter(t => t.is_overdue).length;

      // Attendance record
      const attRecord = attendanceRecordMap.get(empEmail) || attendanceRecordMap.get(empName.toLowerCase());

      // Role categorization
      const roleCategory = getEmployeeRoleCategory(emp, empLeads.length);
      const roleLabel = roleCategory === 'SALES' ? 'Sales Rep' : roleCategory === 'RECRUITER' ? 'Recruiter / HR' : 'Operations';
      const roleBadgeBg = roleCategory === 'SALES' ? '#dbeafe' : roleCategory === 'RECRUITER' ? '#ede9fe' : '#f1f5f9';
      const roleBadgeColor = roleCategory === 'SALES' ? '#1d4ed8' : roleCategory === 'RECRUITER' ? '#6d28d9' : '#475569';

      // ------------------------------------------------------------------
      // PROCESS 1: PRIMARY OUTREACH / PIPELINE (Max 30 pts)
      // ------------------------------------------------------------------
      let primaryProcess = {
        name: roleCategory === 'SALES' ? 'Calling & Outreach' : roleCategory === 'RECRUITER' ? 'Candidate Pipeline' : 'SOP Execution',
        type: roleCategory,
        score: 0,
        max: 30,
        metricText: '',
        applicable: true
      };

      let recruiterWorkCount = 0;
      if (roleCategory === 'SALES') {
        const callingScore = Math.min(30, Math.round((act.uniqueLeads / 15) * 20 + (act.actions / 30) * 10));
        primaryProcess.score = callingScore;
        primaryProcess.metricText = `${act.uniqueLeads} touched · ${act.actions} updates`;
        primaryProcess.applicable = empLeads.length > 0 || act.uniqueLeads > 0 || act.actions > 0;
      } else if (roleCategory === 'RECRUITER') {
        const myPositions = (dashboardSummaries.recruitmentSummary?.positions || []).filter(p => 
          isRecruiterMatch(p.recruiter_assigned, emp) || 
          isRecruiterMatch(p.created_by, emp) ||
          (p.department && emp.department && p.department.toLowerCase() === emp.department.toLowerCase())
        );
        const myPositionIds = new Set(myPositions.map(p => p.id));
        const myCandidates = (dashboardSummaries.recruitmentSummary?.candidates || []).filter(c => 
          isRecruiterMatch(c.created_by, emp) || 
          myPositionIds.has(c.position_id)
        );
        const inInterview = myCandidates.filter(c => c.current_stage === 'S03' || (c.candidate_status || '').toLowerCase().includes('interview')).length;
        const shortlisted = myCandidates.filter(c => c.current_stage === 'S07' || (c.candidate_status || '').toLowerCase().includes('shortlist')).length;
        const hired = myCandidates.filter(c => c.current_stage === 'S09' || (c.candidate_status || '').toLowerCase().includes('joined') || c.current_stage === 'S08').length;
        recruiterWorkCount = myCandidates.length;

        // Benchmark: 5 candidates handled, or interviews/hires
        const recScore = Math.min(30, Math.round((recruiterWorkCount / 5) * 15 + (inInterview * 5) + (shortlisted * 5) + (hired * 10)));
        primaryProcess.score = recScore;
        primaryProcess.metricText = `${recruiterWorkCount} candidates · ${inInterview} in-interview · ${hired} hired`;
        primaryProcess.applicable = true;
      } else {
        const checkRate = checkTotal > 0 ? (checkDone / checkTotal) : 0;
        primaryProcess.score = Math.round(checkRate * 30);
        primaryProcess.metricText = checkTotal > 0 ? `${checkDone}/${checkTotal} checklists done` : 'Operations execution';
        primaryProcess.applicable = checkTotal > 0;
      }

      // ------------------------------------------------------------------
      // PROCESS 2: FOLLOW-UP DISCIPLINE / REQUISITIONS (Max 25 pts)
      // ------------------------------------------------------------------
      let followupProcess = {
        name: roleCategory === 'RECRUITER' ? 'Requisition Mgmt' : 'Follow-up Discipline',
        score: 0,
        max: 25,
        metricText: roleCategory === 'RECRUITER' ? 'Openings tracked' : 'No leads assigned',
        applicable: roleCategory === 'RECRUITER' ? true : empLeads.length > 0,
        adherenceRate: 100
      };

      if (roleCategory === 'RECRUITER') {
        const myPositions = (dashboardSummaries.recruitmentSummary?.positions || []).filter(p => 
          isRecruiterMatch(p.recruiter_assigned, emp) || 
          isRecruiterMatch(p.created_by, emp) ||
          (p.department && emp.department && p.department.toLowerCase() === emp.department.toLowerCase())
        );
        const activeCount = myPositions.filter(p => p.status !== 'CLOSED').length;
        followupProcess.score = myPositions.length > 0 ? 25 : 15;
        followupProcess.adherenceRate = 100;
        followupProcess.metricText = `${activeCount} active requisitions`;
      } else if (empLeads.length > 0) {
        if (overdueFollowups === 0) {
          followupProcess.score = 25;
          followupProcess.adherenceRate = 100;
          followupProcess.metricText = '0 overdue (100% on time)';
        } else {
          // Tiered adherence based on overdue count
          if (overdueFollowups <= 2) followupProcess.score = 22;
          else if (overdueFollowups <= 5) followupProcess.score = 18;
          else if (overdueFollowups <= 10) followupProcess.score = 14;
          else if (overdueFollowups <= 20) followupProcess.score = 10;
          else if (overdueFollowups <= 40) followupProcess.score = 5;
          else followupProcess.score = 0;

          followupProcess.adherenceRate = Math.round((followupProcess.score / 25) * 100);
          followupProcess.metricText = `${overdueFollowups} overdue (${followupProcess.adherenceRate}% adherence)`;
        }
      }

      // ------------------------------------------------------------------
      // PROCESS 3: DAILY CHECKLIST COMPLIANCE (Max 20 pts)
      // ------------------------------------------------------------------
      let checklistProcess = {
        name: 'Daily Checklists',
        score: 0,
        max: 20,
        metricText: checkTotal > 0 ? `${checkDone}/${checkTotal} slots (${Math.round((checkDone / checkTotal) * 100)}%)` : 'No slots scheduled',
        applicable: checkTotal > 0,
        complianceRate: checkTotal > 0 ? Math.min(100, Math.round((checkDone / checkTotal) * 100)) : 0
      };
      if (checkTotal > 0) {
        checklistProcess.score = Math.round((checklistProcess.complianceRate / 100) * 20);
      }

      // ------------------------------------------------------------------
      // PROCESS 4: DELEGATION & TASKS (Max 15 pts)
      // ------------------------------------------------------------------
      let taskProcess = {
        name: 'Delegation Tasks',
        score: 0,
        max: 15,
        metricText: empTasks.length > 0 ? `${tasksDone}/${empTasks.length} done` : 'No tasks assigned',
        applicable: empTasks.length > 0,
        taskRate: empTasks.length > 0 ? Math.max(0, Math.min(100, Math.round((tasksDone / empTasks.length) * 100) - (tasksOverdue * 15))) : 0
      };
      if (empTasks.length > 0) {
        taskProcess.score = Math.round((taskProcess.taskRate / 100) * 15);
      }

      // ------------------------------------------------------------------
      // PROCESS 5: ATTENDANCE & PRESENCE (Max 10 pts)
      // ------------------------------------------------------------------
      let attendanceProcess = {
        name: 'Attendance & Presence',
        score: 0,
        max: 10,
        metricText: attRecord?.statusLabel || 'Absent',
        applicable: true,
        presenceStatus: attRecord?.presenceStatus || 'ABSENT'
      };
      if (attRecord?.presenceStatus === 'PRESENT') attendanceProcess.score = 10;
      else if (attRecord?.presenceStatus === 'CRM_ACTIVE') attendanceProcess.score = 8.5;
      else if (attRecord?.presenceStatus === 'LATE') attendanceProcess.score = 7;
      else if (attRecord?.presenceStatus === 'HALF_DAY') attendanceProcess.score = 5;
      else attendanceProcess.score = 0;

      // Ensure backward/forward compatible properties on each process object
      [primaryProcess, followupProcess, checklistProcess, taskProcess, attendanceProcess].forEach(p => {
        p.earned = p.score;
        p.weight = p.max;
        p.metric = p.metricText;
      });

      // Dynamic normalization across applicable processes
      const applicableList = [primaryProcess, followupProcess, checklistProcess, taskProcess, attendanceProcess].filter(p => p.applicable);
      const earnedPoints = applicableList.reduce((acc, p) => acc + p.score, 0);
      const maxPoints = applicableList.reduce((acc, p) => acc + p.max, 0);

      const hasActiveWork = act.actions > 0 || act.uniqueLeads > 0 || checkDone > 0 || tasksDone > 0 || recruiterWorkCount > 0 || (attRecord?.presenceStatus && attRecord.presenceStatus !== 'ABSENT');

      let totalScore = 0;
      let tier = 'INACTIVE';
      let tierLabel = 'Shift Not Started';
      let tierColor = '#94a3b8';
      let tierBg = '#f1f5f9';

      if (hasActiveWork && maxPoints > 0) {
        totalScore = Math.min(100, Math.round((earnedPoints / maxPoints) * 100));
        if (totalScore >= 80) {
          tier = 'STAR';
          tierLabel = 'Star Performer';
          tierColor = '#15803d';
          tierBg = '#dcfce7';
        } else if (totalScore >= 60) {
          tier = 'ON_TRACK';
          tierLabel = 'On Track';
          tierColor = '#2563eb';
          tierBg = '#dbeafe';
        } else if (totalScore >= 40) {
          tier = 'NEEDS_ATTENTION';
          tierLabel = 'Needs Attention';
          tierColor = '#b45309';
          tierBg = '#fef3c7';
        } else {
          tier = 'CRITICAL';
          tierLabel = 'Critical / Lagging';
          tierColor = '#dc2626';
          tierBg = '#fee2e2';
        }
      }

      return {
        emp,
        empName,
        empEmail,
        department: emp.department || 'General',
        designation: emp.designation || 'Staff',
        roleCategory,
        roleLabel,
        roleBadgeBg,
        roleBadgeColor,
        leadsAssigned: empLeads.length,
        leadsTouched: act.uniqueLeads,
        updatesCount: act.actions,
        overdueFollowups,
        todayFollowups,
        checkDone,
        checkTotal,
        tasksDone,
        tasksTotal: empTasks.length,
        tasksOverdue,
        attRecord,
        hasActiveWork,
        primaryProcess,
        followupProcess,
        checklistProcess,
        taskProcess,
        attendanceProcess,
        totalScore,
        tier,
        tierLabel,
        tierColor,
        tierBg
      };
    }).sort((a, b) => {
      const aActive = a.hasActiveWork ? 1 : 0;
      const bActive = b.hasActiveWork ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      const aVol = a.updatesCount + a.checkDone + a.tasksDone;
      const bVol = b.updatesCount + b.checkDone + b.tasksDone;
      if (bVol !== aVol) return bVol - aVol;
      return b.leadsAssigned - a.leadsAssigned;
    });
  }, [formattedEmployees, leads, crmActiveEmployeesMap, dashboardSummaries.checklistSummary, dashboardSummaries.recruitmentSummary, assignedWork.delegation, attendanceRecordMap]);

  // Filtered leaderboard with Role/Department filter
  const filteredScorecard = useMemo(() => {
    let list = teamScorecardData;
    if (scorecardDeptFilter !== 'ALL') {
      list = list.filter(s => s.roleCategory === scorecardDeptFilter);
    }
    if (scorecardSearch.trim()) {
      const q = scorecardSearch.toLowerCase();
      list = list.filter(s =>
        s.empName.toLowerCase().includes(q) ||
        s.empEmail.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q) ||
        s.designation.toLowerCase().includes(q)
      );
    }
    return list;
  }, [teamScorecardData, scorecardDeptFilter, scorecardSearch]);

  // Active Top 3 Podium Winners (Only reps with real logged performance)
  const activePodiumWinners = useMemo(() => {
    return teamScorecardData
      .filter(r => r.totalScore > 0 && r.hasActiveWork)
      .slice(0, 3);
  }, [teamScorecardData]);

  // Filtered Delegation tasks
  const delegationTasksList = useMemo(() => {
    const list = assignedWork.delegation?.recentTasks || [];
    if (!taskSearch.trim()) return list;
    const q = taskSearch.toLowerCase();
    return list.filter(t =>
      t.title?.toLowerCase().includes(q) ||
      t.task_code?.toLowerCase().includes(q) ||
      t.assigned_to_name?.toLowerCase().includes(q) ||
      t.delegated_by_name?.toLowerCase().includes(q)
    );
  }, [assignedWork.delegation, taskSearch]);

  // Filtered Checklists list
  const checklistItemsList = useMemo(() => {
    const list = dashboardSummaries.checklistSummary?.items?.length > 0
      ? dashboardSummaries.checklistSummary.items
      : assignedWork.checklists?.items || [];
    if (!checklistSearch.trim()) return list;
    const q = checklistSearch.toLowerCase();
    return list.filter(c =>
      c.title?.toLowerCase().includes(q) ||
      c.department?.toLowerCase().includes(q) ||
      c.due_time?.toLowerCase().includes(q)
    );
  }, [dashboardSummaries.checklistSummary, assignedWork.checklists, checklistSearch]);

  // Employee-wise checklist compliance matrix for approved staff
  const employeeChecklistMatrix = useMemo(() => {
    const allItems = dashboardSummaries.checklistSummary?.items || [];
    const submissionsByEmail = dashboardSummaries.checklistSummary?.submissionsByEmail || {};

    return formattedEmployees.map(emp => {
      const email = (emp.email || '').toLowerCase().trim();
      // Slots assigned to this employee
      const assignedSlots = allItems.filter(c => {
        if (c.assigned_type === 'ALL' || !c.assigned_employee_email) return true;
        const emails = c.assigned_employee_email.toLowerCase().split(',').map(e => e.trim());
        return emails.includes(email);
      });

      const total = assignedSlots.length;
      const completed = submissionsByEmail[email] || 0;
      const pending = Math.max(0, total - completed);
      const rate = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

      let statusLabel = 'Pending';
      let statusColor = '#b45309';
      let statusBg = '#fef3c7';

      if (total === 0) {
        statusLabel = 'No Slots Scheduled';
        statusColor = 'var(--text-secondary)';
        statusBg = 'var(--th-bg)';
      } else if (completed >= total) {
        statusLabel = `All Done (${completed})`;
        statusColor = '#15803d';
        statusBg = '#dcfce7';
      } else if (completed > 0) {
        statusLabel = `${completed}/${total} Done (${rate}%)`;
        statusColor = '#2563eb';
        statusBg = '#dbeafe';
      }

      return {
        emp,
        empName: emp.emp_name || emp.name,
        empEmail: email,
        department: emp.department || 'General',
        designation: emp.designation || 'Staff',
        total,
        completed,
        pending,
        rate,
        statusLabel,
        statusColor,
        statusBg
      };
    }).sort((a, b) => b.rate - a.rate || b.completed - a.completed);
  }, [formattedEmployees, dashboardSummaries.checklistSummary]);

  const filteredEmployeeChecklist = useMemo(() => {
    if (!checklistSearch.trim()) return employeeChecklistMatrix;
    const q = checklistSearch.toLowerCase();
    return employeeChecklistMatrix.filter(m =>
      m.empName.toLowerCase().includes(q) ||
      m.empEmail.toLowerCase().includes(q) ||
      m.department.toLowerCase().includes(q)
    );
  }, [employeeChecklistMatrix, checklistSearch]);

  // Filtered Recruitment Candidates
  const filteredCandidatesList = useMemo(() => {
    let list = dashboardSummaries.recruitmentSummary?.candidates || [];
    if (recruiterFilter !== 'ALL') {
      if (recruiterFilter === 'REJECTED') {
        list = list.filter(c => (c.candidate_status || '').toLowerCase().includes('reject') || (c.candidate_status || '').toLowerCase().includes('dropped') || (c.candidate_status || '').toLowerCase().includes('no show'));
      } else if (recruiterFilter === 'INTERVIEW') {
        list = list.filter(c => c.current_stage === 'S03' || (c.candidate_status || '').toLowerCase().includes('interview'));
      } else if (recruiterFilter === 'SHORTLISTED') {
        list = list.filter(c => c.current_stage === 'S07' || (c.candidate_status || '').toLowerCase().includes('shortlist'));
      } else if (recruiterFilter === 'HIRED') {
        list = list.filter(c => c.current_stage === 'S09' || (c.candidate_status || '').toLowerCase().includes('joined') || c.current_stage === 'S08' || (c.candidate_status || '').toLowerCase().includes('loi'));
      } else {
        list = list.filter(c => c.current_stage === recruiterFilter);
      }
    }
    if (recruiterSearch.trim()) {
      const q = recruiterSearch.toLowerCase().trim();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.candidate_code || '').toLowerCase().includes(q) ||
        (c.recruitment_positions?.title || '').toLowerCase().includes(q) ||
        (c.recruitment_positions?.department || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [dashboardSummaries.recruitmentSummary?.candidates, recruiterFilter, recruiterSearch]);

  const handleRefreshAll = () => {
    fetchAssignedWork();
    fetchDashboardSummaries();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ========================================================================= */}
      {/* 🔝 FIXED / STICKY TOP CONTROL BAR + EXECUTIVE TABS                        */}
      {/* ========================================================================= */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '12px', border: '1px solid var(--border-light)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
        padding: '0.85rem 1.15rem',
        display: 'flex', flexDirection: 'column', gap: '0.85rem'
      }}>
        {/* Row 1: Header title, Scope switch, Employee select, Date preset, Refresh */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={20} style={{ color: 'var(--accent-color)' }} />
              Performance & Analytics Dashboard
            </h2>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              Viewing: <strong style={{ color: 'var(--accent-color)' }}>{viewingLabel}</strong>
              {' · '}{dateFilterLabel}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
            {/* My Work / All Team switch */}
            <div style={{ display: 'flex', backgroundColor: 'var(--th-bg)', padding: '0.18rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              {myTeamMember && (
                <button
                  onClick={() => setSelectedEmployee(myTeamMember.user_id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                    border: 'none',
                    backgroundColor: isMyWorkSelected ? 'var(--accent-color)' : 'transparent',
                    color: isMyWorkSelected ? '#fff' : 'var(--text-primary)', cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <User size={13} /> My Work
                </button>
              )}
              <button
                onClick={() => setSelectedEmployee('All')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                  border: 'none',
                  backgroundColor: selectedEmployee === 'All' ? 'var(--accent-color)' : 'transparent',
                  color: selectedEmployee === 'All' ? '#fff' : 'var(--text-primary)', cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                <Users size={13} /> All Team
              </button>
            </div>

            {/* Searchable Employee Selector */}
            <div style={{ minWidth: '210px', maxWidth: '270px' }}>
              <SearchableEmployeeSelect
                employees={formattedEmployees}
                selectedEmail={selectedEmployee === 'All' ? 'ALL' : (selectedEmployeeObj?.email || selectedEmployee)}
                onSelect={(emp) => {
                  if (!emp || emp.email === 'ALL') setSelectedEmployee('All');
                  else setSelectedEmployee(emp.user_id || emp.email);
                }}
                allowAllStaff={true}
                allStaffLabel="All Employees (Team Overview)"
                placeholder="🔍 Search employee..."
              />
            </div>

            <DateRangePicker
              preset={datePreset}
              startDate={startDate}
              endDate={endDate}
              allowAllTime={true}
              title="Select Performance Period"
              onChange={({ preset, startDate, endDate }) => {
                setDatePreset(preset); setStartDate(startDate); setEndDate(endDate);
              }}
            />

            <button
              onClick={handleRefreshAll}
              title="Refresh all metrics"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0.45rem 0.65rem', borderRadius: '8px',
                border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)', cursor: 'pointer'
              }}
            >
              <RefreshCw size={15} className={(loadingAssignedWork || loadingSummaries) ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Row 2: Secondary Navigation Tabs */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '0.45rem', borderTop: '1px solid var(--border-light)',
          paddingTop: '0.65rem'
        }}>
          {[
            { id: 'overview', label: 'Executive Overview', icon: Layers, badge: null },
            { id: 'scorecard', label: 'Team Scorecard', icon: Award, badge: `${teamScorecardData.length} Reps` },
            { id: 'lead-data', label: 'Lead Data', icon: Database, badge: `${kpis.total.toLocaleString('en-IN')} Leads` },
            { id: 'delegation', label: 'Delegation Tasks', icon: CheckSquare, badge: delegation.overdue > 0 ? `${delegation.overdue} Overdue` : `${delegation.total}` },
            { id: 'checklist', label: 'Daily Checklists', icon: ClipboardList, badge: `${dashboardSummaries.checklistSummary.complianceRate || checklists.complianceRate}%` },
            { id: 'attendance', label: 'Attendance Ops', icon: UserCheck, badge: `${attendanceStats.effectivePresent}/${attendanceStats.total}` },
            { id: 'recruiter', label: 'Recruiter Hub', icon: Briefcase, badge: `${dashboardSummaries.recruitmentSummary?.openPositions ?? 0} Open` },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id || (tab.id === 'lead-data' && activeTab === 'pipeline');
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.4rem 0.85rem', borderRadius: '8px',
                  fontSize: '0.8rem', fontWeight: isActive ? 700 : 500,
                  whiteSpace: 'nowrap', border: 'none', cursor: 'pointer',
                  backgroundColor: isActive ? 'var(--accent-color)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-primary)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span style={{
                    fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '10px',
                    backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'var(--th-bg)',
                    color: isActive ? '#fff' : 'var(--text-secondary)', fontWeight: 700
                  }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 TAB 1: EXECUTIVE OVERVIEW (360° SUMMARY)                              */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* 5 Top Core KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '1rem' }}>
            {/* KPI 1: Assigned Leads */}
            <div className="card" style={{ padding: '1.1rem', borderLeft: '4px solid #3b82f6', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>🎯 Assigned Leads</span>
                <Target size={15} style={{ color: '#3b82f6' }} />
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{kpis.total.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: '0.73rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#d97706', fontWeight: 700 }}>⚡ {kpis.actionNeeded} Need Action</span>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>🏆 {kpis.won} Won</span>
              </div>
              <button onClick={() => onNavigateTab?.('leads')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: '0.35rem 0 0', borderTop: '1px solid var(--border-light)', marginTop: 'auto' }}>
                Open Leads <ArrowRight size={11} />
              </button>
            </div>

            {/* KPI 2: Follow-ups */}
            <div className="card" style={{ padding: '1.1rem', borderLeft: `4px solid ${kpis.overdueFollowups > 0 ? '#ef4444' : '#f59e0b'}`, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>📞 Follow-ups</span>
                <CalendarClock size={15} style={{ color: kpis.overdueFollowups > 0 ? '#ef4444' : '#f59e0b' }} />
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{kpis.followUps.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: '0.73rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {kpis.overdueFollowups > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>🚨 {kpis.overdueFollowups} Overdue</span>}
                <span style={{ color: '#b45309', fontWeight: 600 }}>📅 {kpis.todayFollowups} Today</span>
              </div>
              <button onClick={() => onNavigateTab?.('leads')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: '#f59e0b', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: '0.35rem 0 0', borderTop: '1px solid var(--border-light)', marginTop: 'auto' }}>
                Open Leads <ArrowRight size={11} />
              </button>
            </div>

            {/* KPI 3: Deals Won */}
            <div className="card" style={{ padding: '1.1rem', borderLeft: '4px solid #10b981', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>🏆 Deals Won</span>
                <CheckCircle2 size={15} style={{ color: '#10b981' }} />
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{kpis.won}</div>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>{kpis.inPipeline} in active pipeline</div>
              <button onClick={() => setActiveTab('lead-data')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: '#10b981', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: '0.35rem 0 0', borderTop: '1px solid var(--border-light)', marginTop: 'auto' }}>
                Lead Data View <ArrowRight size={11} />
              </button>
            </div>

            {/* KPI 4: Delegated Tasks */}
            <div className="card" style={{ padding: '1.1rem', borderLeft: `4px solid ${delegation.overdue > 0 ? '#ef4444' : '#8b5cf6'}`, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>📋 Delegated Tasks</span>
                {loadingAssignedWork ? <Loader2 size={14} className="animate-spin" style={{ color: '#8b5cf6' }} /> : <CheckSquare size={15} style={{ color: '#8b5cf6' }} />}
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                {loadingAssignedWork ? '—' : delegation.total}
              </div>
              <div style={{ fontSize: '0.73rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ color: delegation.overdue > 0 ? '#dc2626' : 'var(--text-secondary)', fontWeight: delegation.overdue > 0 ? 700 : 500 }}>
                  {delegation.overdue > 0 ? `🚨 ${delegation.overdue} Overdue` : `⏳ ${delegation.pending + delegation.inProgress} Pending`}
                </span>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>✅ {delegation.completed} Done</span>
              </div>
              <button onClick={() => setActiveTab('delegation')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: '#8b5cf6', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: '0.35rem 0 0', borderTop: '1px solid var(--border-light)', marginTop: 'auto' }}>
                Task Manager <ArrowRight size={11} />
              </button>
            </div>

            {/* KPI 5: Work Health */}
            <div className="card" style={{
              padding: '1.1rem',
              borderLeft: `4px solid ${workHealthScore >= 75 ? '#10b981' : workHealthScore >= 45 ? '#f59e0b' : '#ef4444'}`,
              display: 'flex', flexDirection: 'column', gap: '0.45rem'
            }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>⚡ Work Health</span>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{workHealthScore}%</div>
              <div style={{ width: '100%', height: '5px', background: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${workHealthScore}%`, height: '100%', backgroundColor: workHealthScore >= 75 ? '#10b981' : workHealthScore >= 45 ? '#f59e0b' : '#ef4444', transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ fontSize: '0.73rem', fontWeight: 700, color: workHealthScore >= 75 ? '#15803d' : workHealthScore >= 45 ? '#b45309' : '#dc2626' }}>
                {workHealthScore >= 80 ? '🌟 Outstanding' : workHealthScore >= 50 ? '👍 On Track' : '⚠️ Needs Attention'}
              </div>
            </div>
          </div>

          {/* Action Required Banner */}
          {(kpis.overdueFollowups > 0 || kpis.todayFollowups > 0 || delegation.overdue > 0 || (checklists.pending > 0)) && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center',
              padding: '0.75rem 1.1rem',
              backgroundColor: 'var(--bg-surface)', borderRadius: '10px',
              border: '1px solid var(--border-light)'
            }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                ⚡ Action Required
              </span>
              {kpis.overdueFollowups > 0 && (
                <button onClick={() => onNavigateTab?.('leads')} style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.35rem 0.8rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700,
                  backgroundColor: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', cursor: 'pointer'
                }}>
                  <AlertTriangle size={12} /> {kpis.overdueFollowups} Overdue Follow-ups → Open Leads
                </button>
              )}
              {kpis.todayFollowups > 0 && (
                <button onClick={() => onNavigateTab?.('leads')} style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.35rem 0.8rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700,
                  backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', cursor: 'pointer'
                }}>
                  📅 {kpis.todayFollowups} Follow-ups Due Today → Open Leads
                </button>
              )}
              {delegation.overdue > 0 && (
                <button onClick={() => setActiveTab('delegation')} style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.35rem 0.8rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700,
                  backgroundColor: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', cursor: 'pointer'
                }}>
                  🚨 {delegation.overdue} Tasks Overdue → Task Manager
                </button>
              )}
              {checklists.pending > 0 && (
                <button onClick={() => setActiveTab('checklist')} style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.35rem 0.8rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700,
                  backgroundColor: '#dcfce7', color: '#15803d', border: '1px solid #86efac', cursor: 'pointer'
                }}>
                  ✅ {checklists.pending} Checklists Pending → Open Checklist
                </button>
              )}
            </div>
          )}

          {/* Unified Compact Operations Pulse Banner */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1rem',
            backgroundColor: 'var(--bg-surface)', padding: '1rem 1.25rem', borderRadius: '12px',
            border: '1px solid var(--border-light)'
          }}>
            {/* Pulse 1: Attendance */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', borderRight: '1px solid var(--border-light)', paddingRight: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <UserCheck size={14} style={{ color: '#2563eb' }} /> Today's Attendance
                </span>
                <span style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: 600, cursor: 'pointer' }} onClick={() => setActiveTab('attendance')}>
                  View Ops →
                </span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {attendanceStats.effectivePresent} / {attendanceStats.total} Staff Active
              </div>
              <div style={{ fontSize: '0.72rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>✅ {attendanceStats.punched} Punched</span>
                <span style={{ color: '#2563eb', fontWeight: 600 }}>⚡ {attendanceStats.crmActiveOnly} CRM Active</span>
                <span style={{ color: '#dc2626', fontWeight: 600 }}>🚫 {attendanceStats.absent} Absent</span>
              </div>
            </div>

            {/* Pulse 2: Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', borderRight: '1px solid var(--border-light)', paddingRight: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <ClipboardList size={14} style={{ color: '#10b981' }} /> Checklist Compliance
                </span>
                <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, cursor: 'pointer' }} onClick={() => setActiveTab('checklist')}>
                  View Ops →
                </span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {dashboardSummaries.checklistSummary?.complianceRate || checklists.complianceRate}% Completed
              </div>
              <div style={{ fontSize: '0.72rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>✅ {checklists.completed} Done</span>
                <span style={{ color: '#d97706', fontWeight: 600 }}>⏳ {checklists.pending} Pending</span>
                {checklists.completedLate > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠️ {checklists.completedLate} Late</span>}
              </div>
            </div>

            {/* Pulse 3: Team Scorecard Quick Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', borderRight: '1px solid var(--border-light)', paddingRight: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Award size={14} style={{ color: '#f59e0b' }} /> Top Reps Scoreboard
                </span>
                <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600, cursor: 'pointer' }} onClick={() => setActiveTab('scorecard')}>
                  Full Scorecard →
                </span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {teamScorecardData[0]?.empName || 'Team'} 🏆 #{1}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                Score: <strong style={{ color: '#16a34a' }}>{teamScorecardData[0]?.totalScore || 0}%</strong> · {teamScorecardData[0]?.updatesCount || 0} updates logged today
              </div>
            </div>

            {/* Pulse 4: Hiring & Recruiter Hub */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Briefcase size={14} style={{ color: '#8b5cf6' }} /> Recruiter Hub
                </span>
                <span style={{ fontSize: '0.72rem', color: '#8b5cf6', fontWeight: 600, cursor: 'pointer' }} onClick={() => setActiveTab('recruiter')}>
                  View Talent →
                </span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {dashboardSummaries.recruitmentSummary?.openPositions || 0} Open Positions
              </div>
              <div style={{ fontSize: '0.72rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#8b5cf6', fontWeight: 600 }}>👥 {dashboardSummaries.recruitmentSummary?.totalCandidates || 0} Pipeline</span>
                <span style={{ color: '#2563eb', fontWeight: 600 }}>🎯 {dashboardSummaries.recruitmentSummary?.inInterview || 0} Interview</span>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>🎉 {dashboardSummaries.recruitmentSummary?.hired || 0} Hired</span>
              </div>
            </div>
          </div>

          {/* Visuals: Stage Funnel & Activity Pulse */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
            {/* Leads by Stage Funnel Chart */}
            <div className="card" style={{ padding: '1.25rem', gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Leads by Stage</h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{kpis.total.toLocaleString('en-IN')} total in scope</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={stageData} margin={{ top: 8, right: 8, left: -20, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                  <RechartsTooltip cursor={{ fill: 'var(--bg-primary)' }} contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '8px' }} />
                  <Bar dataKey="count" fill="var(--accent-color)" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="count" position="top" style={{ fill: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Employee Activity Table (Fixed with horizontal scroll) */}
            <div className="card" style={{ padding: '0', overflow: 'hidden', minWidth: 0 }}>
              <div style={{ padding: '0.85rem 1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--th-bg)' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Activity size={15} style={{ color: 'var(--accent-color)' }} /> Employee Activity
                </h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{dateFilterLabel}</span>
              </div>
              {loading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Loader2 size={22} className="animate-spin" />
                </div>
              ) : metrics.employeeActivity.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.83rem' }}>
                  No activity recorded for {dateFilterLabel.toLowerCase()}.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', width: '100%' }}>
                  <table style={{ width: '100%', minWidth: '280px', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--th-bg)' }}>
                        <th style={{ textAlign: 'left', padding: '0.45rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>Employee</th>
                        <th style={{ textAlign: 'center', padding: '0.45rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>Leads</th>
                        <th style={{ textAlign: 'right', padding: '0.45rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>Updates</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.employeeActivity.slice(0, 10).map((act, i) => (
                        <tr key={act.employee} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-primary)', maxWidth: '180px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                              <div style={{
                                width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                                backgroundColor: COLORS[i % COLORS.length], color: 'white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 700
                              }}>
                                {act.employee.substring(0, 2).toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.employee}</span>
                            </div>
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{act.uniqueLeads}</td>
                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--accent-color)', whiteSpace: 'nowrap' }}>{act.actions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pipeline & Outreach Summary Card */}
            <div className="card" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Communication & Pipeline</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                {[
                  { label: 'Fresh / New Leads', value: kpis.newLeads, color: '#3b82f6' },
                  { label: 'In Active Pipeline', value: kpis.inPipeline, color: '#8b5cf6' },
                  { label: 'Follow-ups Pending', value: kpis.followUps, color: '#f59e0b' },
                  { label: `WhatsApp Sent (${dateFilterLabel})`, value: loading ? '…' : metrics.whatsappStats.period, color: '#10b981' },
                ].map(item => (
                  <div key={item.label} style={{ padding: '0.75rem', borderRadius: '8px', backgroundColor: 'var(--th-bg)', border: '1px solid var(--border-light)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.2rem' }}>{item.label}</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: item.color }}>
                      {typeof item.value === 'number' ? item.value.toLocaleString('en-IN') : item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🏆 TAB 2: TEAM SCORECARD & LEADERBOARD (SCORING DASHBOARD)                */}
      {/* ========================================================================= */}
      {activeTab === 'scorecard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Header Banner */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem',
            backgroundColor: 'var(--bg-surface)', padding: '1.1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Award size={22} style={{ color: '#f59e0b' }} /> Team Performance Scorecard & Leaderboard
              </h3>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Multi-process operational index (100 pts max) across Calling/Recruitment (30 pts), Follow-up Adherence (25 pts), Daily Checklists (20 pts), Delegation Tasks (15 pts), and Attendance (10 pts).
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {/* Role filter buttons */}
              <div style={{ display: 'flex', gap: '0.35rem', backgroundColor: 'var(--bg-primary)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                {[
                  { key: 'ALL', label: 'All Roles', count: teamScorecardData.length },
                  { key: 'SALES', label: '📞 Sales & Calls', count: teamScorecardData.filter(s => s.roleCategory === 'SALES').length },
                  { key: 'RECRUITER', label: '🧑‍💼 Recruiter & HR', count: teamScorecardData.filter(s => s.roleCategory === 'RECRUITER').length },
                  { key: 'OPERATIONS', label: '⚙️ Operations', count: teamScorecardData.filter(s => s.roleCategory === 'OPERATIONS').length }
                ].map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setScorecardDeptFilter(tab.key)}
                    style={{
                      padding: '0.35rem 0.65rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      backgroundColor: scorecardDeptFilter === tab.key ? 'var(--accent-color, #2563eb)' : 'transparent',
                      color: scorecardDeptFilter === tab.key ? '#ffffff' : 'var(--text-secondary)'
                    }}
                  >
                    {tab.label} <span style={{ opacity: 0.8, fontSize: '0.68rem' }}>({tab.count})</span>
                  </button>
                ))}
              </div>

              {/* Search Box */}
              <div style={{ position: 'relative', width: '220px' }}>
                <input
                  type="text"
                  placeholder="Search executive or dept..."
                  value={scorecardSearch}
                  onChange={(e) => setScorecardSearch(e.target.value)}
                  style={{
                    width: '100%', padding: '0.45rem 0.75rem 0.45rem 2rem', fontSize: '0.78rem',
                    borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)'
                  }}
                />
                <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              </div>
            </div>
          </div>

          {/* Top 3 Podium Highlights (Strictly Verified Active Performers) */}
          {activePodiumWinners.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
              {activePodiumWinners.map((rep, idx) => (
                <div
                  key={rep.empEmail}
                  className="card"
                  onClick={() => setSelectedEmployee(rep.emp.user_id || rep.empEmail)}
                  style={{
                    padding: '1.15rem', cursor: 'pointer', transition: 'all 0.2s',
                    borderTop: idx === 0 ? '4px solid #f59e0b' : idx === 1 ? '4px solid #94a3b8' : '4px solid #b45309',
                    position: 'relative', overflow: 'hidden'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        backgroundColor: idx === 0 ? '#fef3c7' : idx === 1 ? '#f1f5f9' : '#ffedd5',
                        color: idx === 0 ? '#b45309' : idx === 1 ? '#475569' : '#c2410c',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem'
                      }}>
                        #{idx + 1}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>{rep.empName}</h4>
                          <span style={{
                            fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: '4px',
                            backgroundColor: rep.roleCategory === 'RECRUITER' ? '#ede9fe' : rep.roleCategory === 'SALES' ? '#dbeafe' : '#f1f5f9',
                            color: rep.roleCategory === 'RECRUITER' ? '#6d28d9' : rep.roleCategory === 'SALES' ? '#1d4ed8' : '#475569'
                          }}>
                            {rep.roleCategory === 'RECRUITER' ? 'Recruiter' : rep.roleCategory === 'SALES' ? 'Sales' : 'Ops'}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{rep.department} · {rep.designation}</span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '12px',
                      backgroundColor: rep.tierBg, color: rep.tierColor
                    }}>
                      {rep.tierLabel}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', margin: '0.85rem 0 0.45rem' }}>
                    <span style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1, color: 'var(--text-primary)' }}>{rep.totalScore}%</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Performance Index</span>
                  </div>

                  <div style={{ width: '100%', height: '5px', background: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                    <div style={{ width: `${rep.totalScore}%`, height: '100%', backgroundColor: rep.tierColor }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.72rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border-light)' }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase' }}>{rep.primaryProcess.name}</span>
                      <strong>{rep.primaryProcess.metricText || rep.primaryProcess.metric || 'No Activity'}</strong>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>({rep.primaryProcess.score}/{rep.primaryProcess.max}p)</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase' }}>{rep.followupProcess.name}</span>
                      <strong>{rep.followupProcess.metricText || rep.followupProcess.metric}</strong>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>({rep.followupProcess.score}/{rep.followupProcess.max}p)</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase' }}>Checklists</span>
                      <strong>{rep.checklistProcess.applicable ? (rep.checklistProcess.metricText || rep.checklistProcess.metric) : 'Exempt'}</strong>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>({rep.checklistProcess.score}/{rep.checklistProcess.max}p)</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase' }}>Tasks</span>
                      <strong>{rep.taskProcess.applicable ? (rep.taskProcess.metricText || rep.taskProcess.metric) : 'Exempt'}</strong>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>({rep.taskProcess.score}/{rep.taskProcess.max}p)</span>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase' }}>Attendance</span>
                      <strong>{rep.attendanceProcess.metricText || rep.attendanceProcess.metric}</strong>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>({rep.attendanceProcess.score}/{rep.attendanceProcess.max}p)</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ padding: '1.25rem', textAlign: 'center', backgroundColor: 'var(--bg-surface)', border: '1px dashed var(--border-light)' }}>
              <div style={{ display: 'inline-flex', padding: '0.6rem', borderRadius: '50%', backgroundColor: '#fef3c7', color: '#b45309', marginBottom: '0.5rem' }}>
                <Clock size={24} />
              </div>
              <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem', fontWeight: 700 }}>Live Shift In Progress — Scoring Active</h4>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '540px', marginLeft: 'auto', marginRight: 'auto' }}>
                Executives are actively clocking in, updating CRM leads, candidate pipelines, and fulfilling checklist slots. As operational actions are recorded today, top performers will automatically take the podium!
              </p>
            </div>
          )}

          {/* Full Leaderboard Table with Process Performance Breakdown */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1.15rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--th-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>
                  Process-Wise Performance Leaderboard ({filteredScorecard.length})
                </h4>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  Transparent scoring breakdown: Calling/Hiring (30p) + Follow-up/Requisitions (25p) + Checklists (20p) + Delegation (15p) + Attendance (10p)
                </div>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Click any executive row to filter dashboard</span>
            </div>

            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', minWidth: '980px', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ textAlign: 'center', padding: '0.6rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', width: '45px' }}>Rank</th>
                    <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', minWidth: '180px' }}>Executive & Role</th>
                    <th style={{ textAlign: 'center', padding: '0.6rem 0.5rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', minWidth: '110px' }}>Overall Score</th>
                    <th style={{ textAlign: 'left', padding: '0.6rem 0.65rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', minWidth: '150px' }}>📞 Outreach / 🧑‍💼 Hiring (30p)</th>
                    <th style={{ textAlign: 'left', padding: '0.6rem 0.65rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', minWidth: '140px' }}>⏰ Follow-up Discipline (25p)</th>
                    <th style={{ textAlign: 'left', padding: '0.6rem 0.65rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', minWidth: '120px' }}>✅ Checklists (20p)</th>
                    <th style={{ textAlign: 'left', padding: '0.6rem 0.65rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', minWidth: '110px' }}>📋 Tasks (15p)</th>
                    <th style={{ textAlign: 'left', padding: '0.6rem 0.65rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', minWidth: '110px' }}>🏢 Attendance (10p)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScorecard.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No team members found matching the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredScorecard.map((row, idx) => (
                      <tr
                        key={row.empEmail}
                        onClick={() => setSelectedEmployee(row.emp.user_id || row.empEmail)}
                        style={{
                          borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
                          backgroundColor: selectedEmployee === (row.emp.user_id || row.empEmail) ? 'var(--th-bg)' : 'transparent',
                          transition: 'background 0.15s'
                        }}
                      >
                        {/* Rank */}
                        <td style={{ textAlign: 'center', padding: '0.65rem 0.5rem', fontWeight: 800, color: idx < 3 && row.totalScore > 0 ? '#f59e0b' : 'var(--text-secondary)' }}>
                          {row.totalScore > 0 ? `#${idx + 1}` : '—'}
                        </td>

                        {/* Executive & Role */}
                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                            <div style={{
                              width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                              backgroundColor: COLORS[idx % COLORS.length], color: 'white',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700
                            }}>
                              {row.empName.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.empName}</span>
                                <span style={{
                                  fontSize: '0.6rem', fontWeight: 700, padding: '0.05rem 0.35rem', borderRadius: '3px',
                                  backgroundColor: row.roleCategory === 'RECRUITER' ? '#ede9fe' : row.roleCategory === 'SALES' ? '#dbeafe' : '#f1f5f9',
                                  color: row.roleCategory === 'RECRUITER' ? '#6d28d9' : row.roleCategory === 'SALES' ? '#1d4ed8' : '#475569'
                                }}>
                                  {row.roleCategory === 'RECRUITER' ? 'Recruiter' : row.roleCategory === 'SALES' ? 'Sales' : 'Operations'}
                                </span>
                                {row.leadsAssigned > 0 && (
                                  <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '0.05rem 0.35rem', borderRadius: '3px', backgroundColor: 'var(--th-bg)', color: 'var(--text-secondary)' }}>
                                    {row.leadsAssigned.toLocaleString('en-IN')} Leads
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                {row.department} · {row.designation}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Overall Score */}
                        <td style={{ textAlign: 'center', padding: '0.65rem 0.5rem' }}>
                          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: row.tierColor, lineHeight: 1.1 }}>
                            {row.totalScore}%
                          </div>
                          <span style={{
                            fontSize: '0.62rem', fontWeight: 700, padding: '0.12rem 0.4rem', borderRadius: '10px',
                            backgroundColor: row.tierBg, color: row.tierColor, display: 'inline-block', marginTop: '0.2rem'
                          }}>
                            {row.tierLabel}
                          </span>
                        </td>

                        {/* Primary Process (Calling / Hiring) */}
                        <td style={{ padding: '0.65rem 0.65rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.78rem' }}>
                            {row.primaryProcess.metricText || row.primaryProcess.metric || 'No Activity'}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: row.primaryProcess.score > 0 ? 'var(--accent-color, #2563eb)' : 'var(--text-secondary)', fontWeight: 600 }}>
                            {row.primaryProcess.score} / {row.primaryProcess.max} pts
                          </div>
                        </td>

                        {/* Follow-up / Requisitions */}
                        <td style={{ padding: '0.65rem 0.65rem' }}>
                          <div style={{
                            fontWeight: 600, fontSize: '0.78rem',
                            color: row.overdueFollowups > 0 ? '#dc2626' : 'var(--text-primary)'
                          }}>
                            {row.followupProcess.metricText || row.followupProcess.metric}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {row.followupProcess.score} / {row.followupProcess.max} pts
                          </div>
                        </td>

                        {/* Checklists */}
                        <td style={{ padding: '0.65rem 0.65rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.78rem' }}>
                            {row.checklistProcess.applicable ? (row.checklistProcess.metricText || row.checklistProcess.metric) : 'Exempt (No slots)'}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {row.checklistProcess.applicable ? `${row.checklistProcess.score} / ${row.checklistProcess.max} pts` : 'Exempt (Not scored)'}
                          </div>
                        </td>

                        {/* Tasks */}
                        <td style={{ padding: '0.65rem 0.65rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.78rem' }}>
                            {row.taskProcess.applicable ? (row.taskProcess.metricText || row.taskProcess.metric) : 'Exempt (No tasks)'}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {row.taskProcess.applicable ? `${row.taskProcess.score} / ${row.taskProcess.max} pts` : 'Exempt (Not scored)'}
                          </div>
                        </td>

                        {/* Attendance */}
                        <td style={{ padding: '0.65rem 0.65rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.78rem' }}>
                            {row.attendanceProcess.metricText || row.attendanceProcess.metric}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: row.attendanceProcess.score >= 7 ? '#16a34a' : 'var(--text-secondary)', fontWeight: 600 }}>
                            {row.attendanceProcess.score} / {row.attendanceProcess.max} pts
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📋 TAB 3: DELEGATION TASKS DASHBOARD                                      */}
      {/* ========================================================================= */}
      {activeTab === 'delegation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Header Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '1rem' }}>
            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Tasks</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.3rem 0' }}>{delegation.total}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>In current scope</div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>In Progress / Pending</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#3b82f6', margin: '0.3rem 0' }}>{delegation.pending + delegation.inProgress}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Active execution</div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Completed</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', margin: '0.3rem 0' }}>{delegation.completed}</div>
              <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>
                {delegation.total > 0 ? `${Math.round((delegation.completed / delegation.total) * 100)}% Done` : '0%'}
              </div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: `4px solid ${delegation.overdue > 0 ? '#ef4444' : '#10b981'}` }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Overdue Tasks</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: delegation.overdue > 0 ? '#dc2626' : '#10b981', margin: '0.3rem 0' }}>{delegation.overdue}</div>
              <div style={{ fontSize: '0.72rem', color: delegation.overdue > 0 ? '#dc2626' : '#15803d', fontWeight: 600 }}>
                {delegation.overdue > 0 ? 'Action required' : 'All on time'}
              </div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Priority Split</div>
              <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.4rem' }}>
                <span style={{ color: '#dc2626', fontWeight: 700 }}>🔴 High: {delegation.priorityBreakdown?.high || 0}</span>
                <span style={{ color: '#d97706', fontWeight: 600 }}>🟡 Medium: {delegation.priorityBreakdown?.medium || 0}</span>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>🟢 Low: {delegation.priorityBreakdown?.low || 0}</span>
              </div>
            </div>
          </div>

          {/* Task List Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1.15rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--th-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Recent Delegated Tasks ({delegationTasksList.length})</h4>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Status & Deadline Tracking</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Filter tasks..."
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  style={{
                    padding: '0.35rem 0.65rem', fontSize: '0.78rem', borderRadius: '6px',
                    border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)'
                  }}
                />
                <button
                  onClick={() => onNavigateTab?.('delegation')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.75rem',
                    borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, backgroundColor: 'var(--accent-color)',
                    color: '#fff', border: 'none', cursor: 'pointer'
                  }}
                >
                  Open Task Manager <ArrowRight size={12} />
                </button>
              </div>
            </div>

            {delegationTasksList.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                No tasks found for this scope.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--th-bg)' }}>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Code</th>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Task Title</th>
                      <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Priority</th>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Assigned To</th>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Deadline</th>
                      <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delegationTasksList.map(task => (
                      <tr key={task.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{task.task_code || '—'}</td>
                        <td style={{ padding: '0.6rem 0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{task.title}</td>
                        <td style={{ textAlign: 'center', padding: '0.6rem 0.65rem' }}>
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '4px',
                            backgroundColor: task.priority === 'HIGH' || task.priority === 'URGENT' ? '#fee2e2' : task.priority === 'MEDIUM' ? '#fef3c7' : '#dcfce7',
                            color: task.priority === 'HIGH' || task.priority === 'URGENT' ? '#dc2626' : task.priority === 'MEDIUM' ? '#b45309' : '#15803d'
                          }}>
                            {task.priority}
                          </span>
                        </td>
                        <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>{task.assigned_to_name || task.assigned_to_email}</td>
                        <td style={{ padding: '0.6rem 0.85rem', whiteSpace: 'nowrap' }}>
                          {task.deadline ? new Date(task.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                          {task.is_overdue && <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: '0.4rem' }}>🚨 Overdue</span>}
                        </td>
                        <td style={{ textAlign: 'center', padding: '0.6rem 0.65rem' }}>
                          <span style={{
                            fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '12px',
                            backgroundColor: task.status === 'COMPLETED' ? '#dcfce7' : task.status === 'IN_PROGRESS' ? '#dbeafe' : '#f1f5f9',
                            color: task.status === 'COMPLETED' ? '#15803d' : task.status === 'IN_PROGRESS' ? '#2563eb' : '#475569'
                          }}>
                            {task.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ✅ TAB 4: DAILY CHECKLISTS DASHBOARD                                      */}
      {/* ========================================================================= */}
      {activeTab === 'checklist' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Header Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '1rem' }}>
            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Scheduled Slots</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.3rem 0' }}>
                {dashboardSummaries.checklistSummary?.totalSlots || checklists.totalSlots}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Daily slots today</div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #16a34a' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Completed</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#16a34a', margin: '0.3rem 0' }}>
                {dashboardSummaries.checklistSummary?.completed ?? checklists.completed}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>
                {dashboardSummaries.checklistSummary?.complianceRate || checklists.complianceRate}% Compliance
              </div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Pending Slots</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b', margin: '0.3rem 0' }}>
                {dashboardSummaries.checklistSummary?.pending ?? checklists.pending}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600 }}>Awaiting submission</div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Completed Late</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: (dashboardSummaries.checklistSummary?.late || checklists.completedLate) > 0 ? '#dc2626' : '#16a34a', margin: '0.3rem 0' }}>
                {dashboardSummaries.checklistSummary?.late || checklists.completedLate}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Past deadline cutoff</div>
            </div>
          </div>

          {/* Checklist Dual View Selector & Actions */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '0.85rem 1.15rem', borderBottom: '1px solid var(--border-light)',
              backgroundColor: 'var(--th-bg)', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem'
            }}>
              {/* Toggle: By Employee vs By Slots */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ display: 'flex', backgroundColor: 'var(--bg-primary)', padding: '0.18rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                  <button
                    onClick={() => setChecklistViewMode('BY_EMPLOYEE')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                      border: 'none', cursor: 'pointer',
                      backgroundColor: checklistViewMode === 'BY_EMPLOYEE' ? 'var(--accent-color)' : 'transparent',
                      color: checklistViewMode === 'BY_EMPLOYEE' ? '#fff' : 'var(--text-primary)',
                      transition: 'all 0.15s'
                    }}
                  >
                    <Users size={13} /> Team Status ({employeeChecklistMatrix.length})
                  </button>
                  <button
                    onClick={() => setChecklistViewMode('BY_SLOTS')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                      border: 'none', cursor: 'pointer',
                      backgroundColor: checklistViewMode === 'BY_SLOTS' ? 'var(--accent-color)' : 'transparent',
                      color: checklistViewMode === 'BY_SLOTS' ? '#fff' : 'var(--text-primary)',
                      transition: 'all 0.15s'
                    }}
                  >
                    <ClipboardList size={13} /> All Slots ({checklistItemsList.length})
                  </button>
                </div>
              </div>

              {/* Search & Direct Link */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder={checklistViewMode === 'BY_EMPLOYEE' ? "Search team member..." : "Filter checklist title..."}
                  value={checklistSearch}
                  onChange={(e) => setChecklistSearch(e.target.value)}
                  style={{
                    padding: '0.35rem 0.65rem', fontSize: '0.78rem', borderRadius: '6px',
                    border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
                    minWidth: '180px'
                  }}
                />
                <button
                  onClick={() => onNavigateTab?.('checklist')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.75rem',
                    borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, backgroundColor: '#10b981',
                    color: '#fff', border: 'none', cursor: 'pointer'
                  }}
                >
                  Open Checklist Module <ArrowRight size={12} />
                </button>
              </div>
            </div>

            {/* VIEW 1: Team Members Checklist Status Matrix */}
            {checklistViewMode === 'BY_EMPLOYEE' && (
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--th-bg)' }}>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Staff Member</th>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Department</th>
                      <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Assigned Slots</th>
                      <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Completed</th>
                      <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Pending</th>
                      <th style={{ textAlign: 'center', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem', width: '130px' }}>Compliance</th>
                      <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployeeChecklist.map((row, idx) => (
                      <tr
                        key={row.empEmail}
                        onClick={() => setSelectedEmployee(row.emp.user_id || row.empEmail)}
                        style={{
                          borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
                          backgroundColor: selectedEmployee === (row.emp.user_id || row.empEmail) ? 'var(--th-bg)' : 'transparent',
                          transition: 'background 0.15s'
                        }}
                      >
                        <td style={{ padding: '0.6rem 0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{
                              width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                              backgroundColor: COLORS[idx % COLORS.length], color: 'white',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700
                            }}>
                              {row.empName.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.empName}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{row.empEmail}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>{row.department}</td>
                        <td style={{ textAlign: 'center', padding: '0.6rem 0.65rem', fontWeight: 700 }}>{row.total}</td>
                        <td style={{ textAlign: 'center', padding: '0.6rem 0.65rem', fontWeight: 700, color: '#16a34a' }}>{row.completed}</td>
                        <td style={{ textAlign: 'center', padding: '0.6rem 0.65rem', fontWeight: 700, color: row.pending > 0 ? '#d97706' : '#16a34a' }}>
                          {row.pending > 0 ? row.pending : '0'}
                        </td>
                        <td style={{ padding: '0.6rem 0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${row.rate}%`, height: '100%', backgroundColor: row.rate === 100 ? '#10b981' : row.rate > 0 ? '#3b82f6' : '#f59e0b' }} />
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, minWidth: '32px' }}>{row.rate}%</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', padding: '0.6rem 0.65rem' }}>
                          <span style={{
                            fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '12px',
                            backgroundColor: row.statusBg, color: row.statusColor, whiteSpace: 'nowrap'
                          }}>
                            {row.statusLabel}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* VIEW 2: Scheduled Slots Details */}
            {checklistViewMode === 'BY_SLOTS' && (
              <div style={{ overflowX: 'auto', width: '100%' }}>
                {checklistItemsList.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    No checklist slots scheduled for today.
                  </div>
                ) : (
                  <table style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--th-bg)' }}>
                        <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Slot ID</th>
                        <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Checklist Title</th>
                        <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Department</th>
                        <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Assigned To</th>
                        <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Due Time</th>
                        <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checklistItemsList.map((item, idx) => (
                        <tr key={item.id + (item.slot_id || '') + idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--accent-color)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                            {item.slot_id || `Slot ${idx + 1}`}
                          </td>
                          <td style={{ padding: '0.6rem 0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {item.title || item.base_title || 'Daily Operational Checklist'}
                          </td>
                          <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>
                            {item.department || 'General'}
                          </td>
                          <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                            {item.assigned_type === 'ALL' ? '👥 All Team Staff' : (item.assigned_employee_email || 'General Staff')}
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.6rem 0.65rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            ⏰ {item.due_time || '18:00'}
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.6rem 0.65rem' }}>
                            <span style={{
                              fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '12px',
                              backgroundColor: item.status === 'COMPLETED' ? '#dcfce7' : item.status === 'PARTIAL' ? '#fef3c7' : '#fee2e2',
                              color: item.status === 'COMPLETED' ? '#15803d' : item.status === 'PARTIAL' ? '#b45309' : '#dc2626'
                            }}>
                              {item.status === 'COMPLETED' ? (item.isDelayed ? '✅ Done (Late)' : '✅ Completed') : '⏳ Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🏢 TAB 5: ATTENDANCE OPS DASHBOARD                                       */}
      {/* ========================================================================= */}
      {activeTab === 'attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Header Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '1rem' }}>
            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Approved Staff</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.3rem 0' }}>{attendanceStats.total}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Active team members</div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Effective Present</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', margin: '0.3rem 0' }}>{attendanceStats.effectivePresent}</div>
              <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>{attendanceStats.effectivePercent}% Presence Rate</div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #2563eb' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>⚡ Active on CRM</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2563eb', margin: '0.3rem 0' }}>{attendanceStats.crmActiveOnly}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Working without punch</div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Absent</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: attendanceStats.absent > 0 ? '#dc2626' : '#16a34a', margin: '0.3rem 0' }}>{attendanceStats.absent}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>No punch or activity</div>
            </div>
          </div>

          {/* Attendance List Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1.15rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--th-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Today's Team Attendance & Activity Status</h4>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Combines Web Terminal Punch with CRM Lead Activity</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <select
                  value={attendanceFilter}
                  onChange={(e) => setAttendanceFilter(e.target.value)}
                  style={{
                    padding: '0.35rem 0.65rem', fontSize: '0.78rem', borderRadius: '6px',
                    border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)'
                  }}
                >
                  <option value="ALL">All Staff ({attendanceStats.total})</option>
                  <option value="PRESENT">Punched Present ({attendanceStats.punched})</option>
                  <option value="CRM_ACTIVE">CRM Active Only ({attendanceStats.crmActiveOnly})</option>
                  <option value="ABSENT">Absent ({attendanceStats.absent})</option>
                </select>

                <button
                  onClick={() => onNavigateTab?.('attendance')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.75rem',
                    borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, backgroundColor: 'var(--accent-color)',
                    color: '#fff', border: 'none', cursor: 'pointer'
                  }}
                >
                  Open Attendance Module <ArrowRight size={12} />
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--th-bg)' }}>
                    <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Staff Member</th>
                    <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Code</th>
                    <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Department</th>
                    <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>In Time</th>
                    <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Status & Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.map(row => (
                    <tr key={row.email} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.6rem 0.85rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.empName}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{row.email}</div>
                      </td>
                      <td style={{ textAlign: 'center', padding: '0.6rem 0.65rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{row.empCode}</td>
                      <td style={{ padding: '0.6rem 0.85rem', color: 'var(--text-secondary)' }}>{row.department}</td>
                      <td style={{ textAlign: 'center', padding: '0.6rem 0.65rem', fontWeight: 600 }}>
                        {row.inTime || '—'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '0.6rem 0.65rem' }}>
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '12px',
                          backgroundColor: row.presenceStatus === 'PRESENT' ? '#dcfce7' : row.presenceStatus === 'CRM_ACTIVE' ? '#dbeafe' : '#fee2e2',
                          color: row.statusColor
                        }}>
                          {row.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🎯 TAB 6: LEAD DATA & PIPELINE DASHBOARD                                  */}
      {/* ========================================================================= */}
      {(activeTab === 'lead-data' || activeTab === 'pipeline') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Header Action Banner */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem',
            padding: '1rem 1.25rem', backgroundColor: 'var(--bg-surface)', borderRadius: '12px',
            border: '1px solid var(--border-light)'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={18} style={{ color: 'var(--accent-color)' }} />
                Lead Data & Pipeline Analytics
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Total lead distribution across CRM sales stages, outreach touchpoints, and caller allocations
              </div>
            </div>

            <button
              onClick={() => onNavigateTab?.('leads')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                padding: '0.5rem 1rem', borderRadius: '8px',
                backgroundColor: 'var(--accent-color)', color: '#fff',
                fontSize: '0.82rem', fontWeight: 600, border: 'none',
                cursor: 'pointer', transition: 'opacity 0.15s ease'
              }}
            >
              <span>Open Full Leads Database</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* Quick Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '0.85rem' }}>
            {[
              { label: 'Total Leads in CRM', value: kpis.total, color: '#3b82f6', icon: Database },
              { label: 'Fresh / New Leads', value: kpis.newLeads, color: '#06b6d4', icon: Zap },
              { label: 'In Active Pipeline', value: kpis.inPipeline, color: '#8b5cf6', icon: Target },
              { label: 'Follow-ups Pending', value: kpis.followUps, color: '#f59e0b', icon: Clock },
              { label: 'Deals Won / Converted', value: kpis.won, color: '#10b981', icon: CheckCircle2 },
              { label: 'WhatsApp Sent', value: loading ? '…' : metrics.whatsappStats.period, color: '#25D366', icon: MessageSquare }
            ].map(card => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="card" style={{ padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{card.label}</span>
                    <Icon size={14} style={{ color: card.color }} />
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: card.color }}>
                    {typeof card.value === 'number' ? card.value.toLocaleString('en-IN') : card.value}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stage Funnel Table & Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
            <div className="card" style={{ padding: '1.25rem', gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Sales Pipeline Stage Distribution</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{filteredLeadsSync.length.toLocaleString('en-IN')} Leads in View</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stageData} margin={{ top: 8, right: 8, left: -20, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                  <RechartsTooltip cursor={{ fill: 'var(--bg-primary)' }} contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '8px' }} />
                  <Bar dataKey="count" fill="var(--accent-color)" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="count" position="top" style={{ fill: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Outreach & Messaging Metrics</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ padding: '0.85rem', borderRadius: '8px', backgroundColor: 'var(--th-bg)', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>WhatsApp Messages Sent ({dateFilterLabel})</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981', margin: '0.2rem 0' }}>
                    {loading ? '…' : metrics.whatsappStats.period.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    Total All Time: {metrics.whatsappStats.total.toLocaleString('en-IN')}
                  </div>
                </div>

                <div style={{ padding: '0.85rem', borderRadius: '8px', backgroundColor: 'var(--th-bg)', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Pipeline Conversion Health</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#3b82f6', margin: '0.2rem 0' }}>
                    {kpis.total > 0 ? `${((kpis.won / kpis.total) * 100).toFixed(2)}%` : '0%'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    {kpis.won} Won out of {kpis.total.toLocaleString('en-IN')} total leads
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Representative / Telecaller Lead Allocation Table */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Sales Representative & Telecaller Lead Allocation</h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  Live breakdown of leads assigned and contacted per caller
                </div>
              </div>
              <button
                onClick={() => onNavigateTab?.('leads')}
                style={{
                  fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-color)',
                  background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem'
                }}
              >
                Go to Leads Table <ArrowRight size={12} />
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-light)', textAlign: 'left', backgroundColor: 'var(--th-bg)' }}>
                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Representative</th>
                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Department</th>
                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right' }}>Leads Assigned</th>
                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right' }}>Leads Touched / Called</th>
                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right' }}>Contact Rate</th>
                    <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>Calling Score</th>
                  </tr>
                </thead>
                <tbody>
                  {teamScorecardData
                    .filter(r => r.leadsAssigned > 0 || r.roleCategory === 'SALES_CALLER')
                    .slice(0, 15)
                    .map((row, idx) => {
                      const contactRate = row.leadsAssigned > 0 ? Math.round((row.leadsTouched / row.leadsAssigned) * 100) : 0;
                      return (
                        <tr key={row.empEmail || idx} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.15s' }}>
                          <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {row.empName}
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)' }}>
                            {row.department || 'Sales & Telecalling'}
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#3b82f6' }}>
                            📦 {row.leadsAssigned.toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                            📞 {row.leadsTouched.toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 700, color: contactRate >= 70 ? '#10b981' : contactRate >= 40 ? '#f59e0b' : '#ef4444' }}>
                            {contactRate}%
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                            <span style={{
                              padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                              backgroundColor: row.calling?.score >= 15 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: row.calling?.score >= 15 ? '#10b981' : '#ef4444'
                            }}>
                              {row.calling?.score ?? 0} / 25 pts
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  {teamScorecardData.filter(r => r.leadsAssigned > 0 || r.roleCategory === 'SALES_CALLER').length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No caller lead allocations found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🧑‍💼 TAB 7: RECRUITER & TALENT ACQUISITION HUB                             */}
      {/* ========================================================================= */}
      {activeTab === 'recruiter' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Header Action Banner */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem',
            padding: '1rem 1.25rem', backgroundColor: 'var(--bg-surface)', borderRadius: '12px',
            border: '1px solid var(--border-light)'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Briefcase size={18} style={{ color: 'var(--accent-color)' }} />
                Recruitment & Talent Acquisition Hub
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Live job requisitions, candidate pipeline tracking & multi-stage interview progress
              </div>
            </div>

            <button
              onClick={() => onNavigateTab?.('recruiter')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                padding: '0.5rem 1rem', borderRadius: '8px',
                backgroundColor: 'var(--accent-color)', color: '#fff',
                fontSize: '0.82rem', fontWeight: 600, border: 'none',
                cursor: 'pointer', transition: 'opacity 0.15s ease'
              }}
            >
              <span>Open Full Recruiter Module</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* Top KPI Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '1rem' }}>
            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Open Positions</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#3b82f6', margin: '0.3rem 0' }}>
                {dashboardSummaries.recruitmentSummary?.openPositions || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                {dashboardSummaries.recruitmentSummary?.positions?.reduce((a, b) => a + (b.openings || 1), 0) || 0} Total vacancies
              </div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Candidates</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#8b5cf6', margin: '0.3rem 0' }}>
                {dashboardSummaries.recruitmentSummary?.totalCandidates || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                {dashboardSummaries.recruitmentSummary?.newToday || 0} Added today (IST)
              </div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #6366f1' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>In Interview</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#6366f1', margin: '0.3rem 0' }}>
                {dashboardSummaries.recruitmentSummary?.inInterview || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                Stages S03 & Scheduling
              </div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Shortlisted</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', margin: '0.3rem 0' }}>
                {dashboardSummaries.recruitmentSummary?.shortlisted || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                Stage S07 Qualified
              </div>
            </div>

            <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #16a34a' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Offers & Joined</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#16a34a', margin: '0.3rem 0' }}>
                {dashboardSummaries.recruitmentSummary?.hired || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                LOI Accepted & Joined
              </div>
            </div>
          </div>

          {/* Active Positions Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '0.85rem 1.15rem', borderBottom: '1px solid var(--border-light)',
              backgroundColor: 'var(--th-bg)', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem'
            }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Briefcase size={15} style={{ color: 'var(--accent-color)' }} />
                  Active Job Positions ({dashboardSummaries.recruitmentSummary?.positions?.length || 0})
                </h4>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Current open requisitions and department headcount requirements
                </span>
              </div>

              <button
                onClick={() => onNavigateTab?.('recruiter')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-color)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0
                }}
              >
                <span>Manage in Recruiter</span>
                <ExternalLink size={12} />
              </button>
            </div>

            {dashboardSummaries.recruitmentSummary?.positions?.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                No job positions created yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--th-bg)' }}>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Job Title</th>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Department</th>
                      <th style={{ textAlign: 'center', padding: '0.55rem 0.75rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Openings</th>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Recruiter Assigned</th>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Salary Range</th>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Target Deadline</th>
                      <th style={{ textAlign: 'center', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboardSummaries.recruitmentSummary?.positions || []).map((pos, idx) => {
                      const isClosed = pos.status === 'CLOSED';
                      return (
                        <tr key={pos.id || idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '0.65rem 0.85rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pos.title}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{pos.id?.substring(0, 8)}</div>
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem' }}>
                            <span style={{
                              display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '4px',
                              backgroundColor: 'var(--th-bg)', fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-primary)'
                            }}>
                              {pos.department || 'General'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.65rem 0.75rem', fontWeight: 700 }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: '24px', height: '24px', borderRadius: '50%',
                              backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: '0.75rem', fontWeight: 700
                            }}>
                              {pos.openings || 1}
                            </span>
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                            {pos.recruiter_assigned || 'Unassigned'}
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.78rem' }}>
                            {pos.salary_min || pos.salary_max ? (
                              <span>
                                {pos.salary_min ? `₹${Number(pos.salary_min).toLocaleString('en-IN')}` : ''}
                                {pos.salary_min && pos.salary_max ? ' - ' : ''}
                                {pos.salary_max ? `₹${Number(pos.salary_max).toLocaleString('en-IN')}` : ''}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)' }}>Best in industry</span>
                            )}
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            {pos.deadline_date ? new Date(pos.deadline_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.65rem 0.85rem' }}>
                            <span style={{
                              display: 'inline-block', padding: '0.2rem 0.55rem', borderRadius: '12px',
                              fontSize: '0.72rem', fontWeight: 700,
                              backgroundColor: isClosed ? '#fee2e2' : '#dcfce7',
                              color: isClosed ? '#dc2626' : '#15803d'
                            }}>
                              {isClosed ? 'Closed' : 'Active Requisition'}
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

          {/* Candidates Pipeline Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '0.85rem 1.15rem', borderBottom: '1px solid var(--border-light)',
              backgroundColor: 'var(--th-bg)', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem'
            }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Users size={15} style={{ color: 'var(--accent-color)' }} />
                  Candidate Talent Pipeline ({filteredCandidatesList.length})
                </h4>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Screening, evaluation stages & hiring decisions
                </span>
              </div>

              {/* Filters & Search Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    placeholder="Search candidate, role, phone..."
                    value={recruiterSearch}
                    onChange={(e) => setRecruiterSearch(e.target.value)}
                    style={{
                      padding: '0.35rem 0.65rem 0.35rem 1.75rem', fontSize: '0.78rem', borderRadius: '6px',
                      border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
                      width: '200px'
                    }}
                  />
                  {recruiterSearch && (
                    <button
                      onClick={() => setRecruiterSearch('')}
                      style={{ position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem' }}
                    >
                      ×
                    </button>
                  )}
                </div>

                <select
                  value={recruiterFilter}
                  onChange={(e) => setRecruiterFilter(e.target.value)}
                  style={{
                    padding: '0.35rem 0.65rem', fontSize: '0.78rem', borderRadius: '6px',
                    border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)'
                  }}
                >
                  <option value="ALL">All Stages ({dashboardSummaries.recruitmentSummary?.candidates?.length || 0})</option>
                  <option value="INTERVIEW">In Interview ({dashboardSummaries.recruitmentSummary?.inInterview || 0})</option>
                  <option value="SHORTLISTED">Shortlisted ({dashboardSummaries.recruitmentSummary?.shortlisted || 0})</option>
                  <option value="HIRED">Offers & Joined ({dashboardSummaries.recruitmentSummary?.hired || 0})</option>
                  <option value="REJECTED">Dropped / Rejected ({dashboardSummaries.recruitmentSummary?.rejected || 0})</option>
                  <option value="S02">Stage S02 (Screening)</option>
                  <option value="S03">Stage S03 (Interview)</option>
                  <option value="S04">Stage S04 (Skill Test)</option>
                  <option value="S05">Stage S05 (ED Approval)</option>
                  <option value="S06">Stage S06 (Salary Neg.)</option>
                  <option value="S07">Stage S07 (Shortlisted)</option>
                  <option value="S08">Stage S08 (LOI Offered)</option>
                  <option value="S09">Stage S09 (Joined)</option>
                </select>
              </div>
            </div>

            {filteredCandidatesList.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {recruiterSearch || recruiterFilter !== 'ALL' ? 'No candidates match your search or filter.' : 'No candidates in the pipeline.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--th-bg)' }}>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Candidate</th>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Target Position</th>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Pipeline Stage</th>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Current Status</th>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Contact Info</th>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Applied Date</th>
                      <th style={{ textAlign: 'center', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCandidatesList.map((cand, idx) => {
                      const badge = getStageBadgeInfo(cand.current_stage, cand.candidate_status);
                      const isJoined = (cand.candidate_status || '').toLowerCase().includes('joined') || cand.current_stage === 'S09';
                      const isRejected = (cand.candidate_status || '').toLowerCase().includes('reject') || (cand.candidate_status || '').toLowerCase().includes('dropped');
                      return (
                        <tr key={cand.id || idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '0.65rem 0.85rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{cand.name}</div>
                            {cand.candidate_code && (
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                {cand.candidate_code}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                              {cand.recruitment_positions?.title || 'General Position'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              {cand.recruitment_positions?.department || '—'}
                            </div>
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem' }}>
                            <span style={{
                              display: 'inline-block', padding: '0.2rem 0.55rem', borderRadius: '12px',
                              fontSize: '0.72rem', fontWeight: 700,
                              backgroundColor: badge.bg, color: badge.color
                            }}>
                              {badge.label}
                            </span>
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem' }}>
                            <span style={{
                              display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '4px',
                              fontSize: '0.73rem', fontWeight: 600,
                              backgroundColor: isJoined ? '#dcfce7' : isRejected ? '#fee2e2' : 'var(--th-bg)',
                              color: isJoined ? '#15803d' : isRejected ? '#dc2626' : 'var(--text-primary)'
                            }}>
                              {cand.candidate_status || 'Under Review'}
                            </span>
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {cand.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Phone size={11} /> {cand.phone}</div>}
                            {cand.email && <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Mail size={11} /> {cand.email}</div>}
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {cand.created_at ? new Date(cand.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.65rem 0.85rem' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                              {cand.resume_url && (
                                <a
                                  href={cand.resume_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="View Resume"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    padding: '0.3rem 0.45rem', borderRadius: '6px',
                                    border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)',
                                    color: 'var(--accent-color)', textDecoration: 'none', fontSize: '0.72rem', fontWeight: 600
                                  }}
                                >
                                  <FileText size={12} style={{ marginRight: '0.2rem' }} />
                                  Resume
                                </a>
                              )}
                              <button
                                onClick={() => onNavigateTab?.('recruiter')}
                                title="Open in Recruiter module"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  padding: '0.3rem 0.55rem', borderRadius: '6px',
                                  border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)',
                                  color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600
                                }}
                              >
                                View
                                <ArrowRight size={11} style={{ marginLeft: '0.2rem' }} />
                              </button>
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
        </div>
      )}

    </div>
  );
}
