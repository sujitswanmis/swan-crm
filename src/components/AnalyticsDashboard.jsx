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
  Filter, Layers, MessageSquare, Zap
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

export default function AnalyticsDashboard({ 
  leads = [], 
  teamMembers = [],
  userEmail = '',
  userName = '',
  userId = '',
  userRole = '',
  onNavigateTab
}) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'scorecard' | 'delegation' | 'checklist' | 'attendance' | 'pipeline'
  const [datePreset, setDatePreset] = useState('today');
  const [startDate, setStartDate] = useState(() => computeDateRange('today').startDate);
  const [endDate, setEndDate] = useState(() => computeDateRange('today').endDate);

  // Search/filter state inside sub-tabs
  const [scorecardSearch, setScorecardSearch] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [checklistSearch, setChecklistSearch] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState('ALL'); // 'ALL' | 'PRESENT' | 'CRM_ACTIVE' | 'ABSENT' | 'LATE'

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
    recruitmentSummary: { openPositions: 0, totalApplications: 0, newToday: 0, shortlisted: 0, rejected: 0 }
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
        targetDate: new Date()
      });
      if (res?.success) setAssignedWork(res.data);
    } catch (err) {
      console.warn('Error loading assigned work:', err);
    } finally {
      setLoadingAssignedWork(false);
    }
  };

  useEffect(() => { fetchAssignedWork(); }, [userEmail, effectiveTargetEmail, selectedEmployee]);

  // Load attendance, checklist compliance, recruitment summaries
  const fetchDashboardSummaries = async () => {
    setLoadingSummaries(true);
    try {
      const res = await getDashboardSummaries({});
      if (res?.success) setDashboardSummaries(res.data);
    } catch (e) {
      console.warn('Dashboard summaries error:', e);
    } finally {
      setLoadingSummaries(false);
    }
  };

  useEffect(() => {
    fetchDashboardSummaries();
  }, []);

  // Compute CRM Active employees map (employees who made updates today/period)
  const crmActiveEmployeesMap = useMemo(() => {
    const map = new Map();
    metrics.employeeActivity.forEach(act => {
      map.set(act.employee.toLowerCase(), act);
    });
    return map;
  }, [metrics.employeeActivity]);

  // Comprehensive Team Scorecard & Leaderboard calculations
  const teamScorecardData = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    return formattedEmployees.map(emp => {
      const empEmail = (emp.email || '').toLowerCase();
      const empName = emp.emp_name || emp.name || empEmail;

      // Leads assigned to this rep
      const empLeads = leads.filter(l => {
        if (!l.assigned_to) return false;
        const a = l.assigned_to.toLowerCase();
        return a === empEmail || a === emp.user_id?.toLowerCase() || a === empName.toLowerCase();
      });

      // Overdue follow-ups for this rep
      let overdueFollowups = 0;
      let todayFollowups = 0;
      empLeads.forEach(l => {
        const fDate = l.follow_up_date || l.next_follow_up_date;
        if (fDate) {
          const d = new Date(fDate);
          if (!isNaN(d.getTime())) {
            const dStr = d.toISOString().split('T')[0];
            if (dStr < todayStr) overdueFollowups++;
            else if (dStr === todayStr) todayFollowups++;
          }
        }
      });

      // Activity stats from metrics
      const act = crmActiveEmployeesMap.get(empName.toLowerCase()) || 
                  crmActiveEmployeesMap.get(empEmail) || 
                  { actions: 0, uniqueLeads: 0 };

      // Checklists done vs pending for this employee
      const empChecklistSlots = (dashboardSummaries.checklistSummary?.items || []).filter(c => {
        if (!c.assigned_employee_email) return true; // all
        return c.assigned_employee_email.toLowerCase().includes(empEmail);
      });
      const checkDone = empChecklistSlots.filter(c => c.status === 'COMPLETED').length;
      const checkTotal = empChecklistSlots.length;

      // Delegated tasks
      const empTasks = (assignedWork.delegation?.recentTasks || []).filter(t => {
        return (t.assigned_to_email && t.assigned_to_email.toLowerCase() === empEmail) ||
               (t.assigned_to_name && t.assigned_to_name.toLowerCase() === empName.toLowerCase());
      });
      const tasksDone = empTasks.filter(t => t.status === 'COMPLETED').length;
      const tasksOverdue = empTasks.filter(t => t.is_overdue).length;

      // SCORING ENGINE (0-100)
      // 1. Activity (Max 35): 15 leads touched or 40 updates gives full points
      const actScore = Math.min(35, Math.round((act.uniqueLeads / 15) * 20 + (act.actions / 40) * 15));
      // 2. Follow-up Discipline (Max 35): 35 minus 4 pts per overdue follow-up
      const overdueDeduction = Math.min(35, overdueFollowups * 4);
      const followUpScore = Math.max(0, 35 - overdueDeduction);
      // 3. Checklist Compliance (Max 15)
      const checklistScore = checkTotal > 0 ? Math.round((checkDone / checkTotal) * 15) : 15;
      // 4. Task Execution (Max 15)
      const taskScore = empTasks.length > 0 ? Math.max(0, Math.round((tasksDone / empTasks.length) * 15 - tasksOverdue * 3)) : 15;

      const totalScore = Math.min(100, Math.max(0, actScore + followUpScore + checklistScore + taskScore));

      let tier = 'CRITICAL';
      let tierLabel = 'Critical / Lagging';
      let tierColor = '#dc2626';
      let tierBg = '#fee2e2';

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
      }

      return {
        emp,
        empName,
        empEmail,
        department: emp.department || 'General',
        designation: emp.designation || 'Staff',
        leadsAssigned: empLeads.length,
        leadsTouched: act.uniqueLeads,
        updatesCount: act.actions,
        overdueFollowups,
        todayFollowups,
        checkDone,
        checkTotal,
        tasksDone,
        tasksOverdue,
        totalScore,
        tier,
        tierLabel,
        tierColor,
        tierBg
      };
    }).sort((a, b) => b.totalScore - a.totalScore || b.updatesCount - a.updatesCount);
  }, [formattedEmployees, leads, crmActiveEmployeesMap, dashboardSummaries.checklistSummary, assignedWork.delegation]);

  // Filtered leaderboard
  const filteredScorecard = useMemo(() => {
    if (!scorecardSearch.trim()) return teamScorecardData;
    const q = scorecardSearch.toLowerCase();
    return teamScorecardData.filter(s =>
      s.empName.toLowerCase().includes(q) ||
      s.empEmail.toLowerCase().includes(q) ||
      s.department.toLowerCase().includes(q)
    );
  }, [teamScorecardData, scorecardSearch]);

  // Combined attendance records with CRM activity intelligence
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
          display: 'flex', gap: '0.4rem', borderTop: '1px solid var(--border-light)',
          paddingTop: '0.65rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch'
        }}>
          {[
            { id: 'overview', label: 'Executive Overview', icon: Layers, badge: null },
            { id: 'scorecard', label: 'Team Scorecard', icon: Award, badge: `${teamScorecardData.length} Reps` },
            { id: 'delegation', label: 'Delegation Tasks', icon: CheckSquare, badge: delegation.overdue > 0 ? `${delegation.overdue} Overdue` : `${delegation.total}` },
            { id: 'checklist', label: 'Daily Checklists', icon: ClipboardList, badge: `${dashboardSummaries.checklistSummary.complianceRate || checklists.complianceRate}%` },
            { id: 'attendance', label: 'Attendance Ops', icon: UserCheck, badge: `${attendanceStats.effectivePresent}/${attendanceStats.total}` },
            { id: 'pipeline', label: 'Pipeline & Outreach', icon: Target, badge: `${kpis.inPipeline} Active` },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
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
              <button onClick={() => setActiveTab('pipeline')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: '#10b981', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: '0.35rem 0 0', borderTop: '1px solid var(--border-light)', marginTop: 'auto' }}>
                Pipeline View <ArrowRight size={11} />
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
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
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Award size={20} style={{ color: '#f59e0b' }} /> Sales Executive Performance Scorecard & Leaderboard
              </h3>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Weighted evaluation (0-100%) based on Leads Touched, Follow-up Discipline, Task Completion, and Checklists.
              </p>
            </div>

            <div style={{ position: 'relative', width: '240px' }}>
              <input
                type="text"
                placeholder="Search rep or department..."
                value={scorecardSearch}
                onChange={(e) => setScorecardSearch(e.target.value)}
                style={{
                  width: '100%', padding: '0.45rem 0.75rem 0.45rem 2rem', fontSize: '0.8rem',
                  borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)'
                }}
              />
              <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            </div>
          </div>

          {/* Top 3 Podium Highlights */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '1rem' }}>
            {teamScorecardData.slice(0, 3).map((rep, idx) => (
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
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>{rep.empName}</h4>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{rep.department} · {rep.designation}</span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '12px',
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.73rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-light)' }}>
                  <div>🎯 Leads Touched: <strong>{rep.leadsTouched}</strong></div>
                  <div>⚡ Updates: <strong>{rep.updatesCount}</strong></div>
                  <div>🚨 Overdue: <strong style={{ color: rep.overdueFollowups > 0 ? '#dc2626' : '#16a34a' }}>{rep.overdueFollowups}</strong></div>
                  <div>✅ Checklist: <strong>{rep.checkDone}/{rep.checkTotal}</strong></div>
                </div>
              </div>
            ))}
          </div>

          {/* Full Leaderboard Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1.15rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--th-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Team Leaderboard Ranking ({filteredScorecard.length})</h4>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Click any row to filter dashboard</span>
            </div>

            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--th-bg)' }}>
                    <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', width: '50px' }}>Rank</th>
                    <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Executive</th>
                    <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Performance Score</th>
                    <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Leads Assigned</th>
                    <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Leads Touched</th>
                    <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Updates Today</th>
                    <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Overdue Follow-ups</th>
                    <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Status Badge</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScorecard.map((row, idx) => (
                    <tr
                      key={row.empEmail}
                      onClick={() => setSelectedEmployee(row.emp.user_id || row.empEmail)}
                      style={{
                        borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
                        backgroundColor: selectedEmployee === (row.emp.user_id || row.empEmail) ? 'var(--th-bg)' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                    >
                      <td style={{ textAlign: 'center', padding: '0.65rem', fontWeight: 800, color: idx < 3 ? '#f59e0b' : 'var(--text-secondary)' }}>
                        #{idx + 1}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem' }}>
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
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{row.department} · {row.designation}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', padding: '0.65rem' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: row.tierColor }}>{row.totalScore}%</span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '0.65rem', fontWeight: 600 }}>{row.leadsAssigned}</td>
                      <td style={{ textAlign: 'center', padding: '0.65rem', fontWeight: 700, color: row.leadsTouched > 0 ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
                        {row.leadsTouched}
                      </td>
                      <td style={{ textAlign: 'center', padding: '0.65rem', fontWeight: 700, color: row.updatesCount > 0 ? '#10b981' : 'var(--text-secondary)' }}>
                        {row.updatesCount}
                      </td>
                      <td style={{ textAlign: 'center', padding: '0.65rem', fontWeight: 700, color: row.overdueFollowups > 0 ? '#dc2626' : '#16a34a' }}>
                        {row.overdueFollowups > 0 ? `🚨 ${row.overdueFollowups}` : '✅ 0'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '0.65rem' }}>
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '12px',
                          backgroundColor: row.tierBg, color: row.tierColor, whiteSpace: 'nowrap'
                        }}>
                          {row.tierLabel}
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

          {/* Checklist Items Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.85rem 1.15rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--th-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Today's Scheduled Checklist Slots ({checklistItemsList.length})</h4>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Slots execution status</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Filter checklist..."
                  value={checklistSearch}
                  onChange={(e) => setChecklistSearch(e.target.value)}
                  style={{
                    padding: '0.35rem 0.65rem', fontSize: '0.78rem', borderRadius: '6px',
                    border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)'
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

            {checklistItemsList.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                No checklist slots scheduled for today.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--th-bg)' }}>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Slot ID</th>
                      <th style={{ textAlign: 'left', padding: '0.55rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Checklist Title</th>
                      <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Department</th>
                      <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Due Time</th>
                      <th style={{ textAlign: 'center', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklistItemsList.map(item => (
                      <tr key={item.id + (item.slot_id || '')} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.6rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{item.slot_id || 'SLOT'}</td>
                        <td style={{ padding: '0.6rem 0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</td>
                        <td style={{ textAlign: 'center', padding: '0.6rem 0.65rem', color: 'var(--text-secondary)' }}>{item.department || 'General'}</td>
                        <td style={{ textAlign: 'center', padding: '0.6rem 0.65rem', fontWeight: 600 }}>⏰ {item.due_time}</td>
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
      {/* 🎯 TAB 6: PIPELINE & OUTREACH DASHBOARD                                    */}
      {/* ========================================================================= */}
      {activeTab === 'pipeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Stage Funnel Table & Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
            <div className="card" style={{ padding: '1.25rem', gridColumn: 'span 2' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Sales Pipeline Stage Distribution</h3>
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
        </div>
      )}

    </div>
  );
}
