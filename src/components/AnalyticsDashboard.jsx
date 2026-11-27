'use client';

import './AnalyticsDashboard.css';
import MobileTableView, { useTableViewPreference } from '@/components/common/MobileTableView';
import StandardTablePagination from '@/components/common/StandardTablePagination';
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
import { ColumnResizer, useTableColumnResize } from '@/utils/tableColumnResize';

const PHASE31_TABLES = {
  overview: {
    id: 'AnalyticsDashboard-1',
    label: 'Employee activity',
    columns: [
      ['employee', 'Employee', 156],
      ['leads', 'Leads', 75, 'center'],
      ['updates', 'Updates', 82, 'right'],
    ],
  },
  scorecard: {
    id: 'AnalyticsDashboard-2',
    label: 'Performance leaderboard',
    columns: [
      ['rank', 'Rank', 76, 'center'],
      ['executive', 'Executive & Role', 204],
      ['score', 'Overall Score', 112, 'center'],
      ['leads', 'Leads Touched', 132, 'center'],
      ['recruiting', 'Recruiter (30p)', 158],
      ['followup', 'Follow-up Discipline (25p)', 172],
      ['checklists', 'Checklists (20p)', 128],
      ['tasks', 'Tasks (15p)', 126],
      ['attendance', 'Attendance (10p)', 138],
    ],
  },
  delegation: {
    id: 'AnalyticsDashboard-3',
    label: 'Recent delegated tasks',
    columns: [
      ['code', 'Code', 120], ['title', 'Task Title', 240],
      ['priority', 'Priority', 98, 'center'], ['assigned', 'Assigned To', 158],
      ['deadline', 'Deadline', 156], ['status', 'Status', 128, 'center'],
    ],
  },
  leads: {
    id: 'AnalyticsDashboard-7',
    label: 'Lead stages by representative',
    columns: [
      ['representative', 'Representative', 155], ['department', 'Department', 147],
      ['s1', 'S1 New', 72, 'center', '#3b82f6'], ['s2', 'S2 Contact', 86, 'center', '#06b6d4'],
      ['s3', 'S3 Qual', 76, 'center', '#8b5cf6'], ['s4', 'S4 Follow', 80, 'center', '#f59e0b'],
      ['s5', 'S5 Process', 92, 'center', '#ec4899'], ['s6', 'S6 Convert', 91, 'center', '#10b981'],
      ['s7', 'S7 Final', 76, 'center', '#6366f1'],
      ['assigned', 'Total Assigned', 112, 'right'], ['touched', 'Leads Touched', 112, 'right'],
      ['rate', 'Touch Rate %', 106, 'right'], ['outreach', 'Outreach Score', 114, 'center'],
    ],
  },
};
const TASK_STATUS_TONES = { COMPLETED: 'success', IN_PROGRESS: 'info', SUBMITTED: 'violet', REOPENED: 'warning' };

function phaseInk(color) {
  return `color-mix(in srgb, ${color} 30%, var(--spc-view-text))`;
}

function phaseAvatar(color) {
  return { color: phaseInk(color), backgroundColor: `color-mix(in srgb, ${color} 14%, var(--spc-view-surface))` };
}

function analyticsPageSize() {
  try {
    const stored = JSON.parse(localStorage.getItem('crmPageNavSettings') || '{}').defaultPageSize;
    if (stored === 'All') return 100000;
    const size = Number(stored);
    if (Number.isSafeInteger(size) && size > 0) return size;
  } catch {
    // Use the default when browser storage is unavailable.
  }
  return 15;
}

function AnalyticsPhaseTable({ table, rows, resetKey, empty, renderRow }) {
  const [pageSize, setPageSize] = useState(analyticsPageSize);
  const [paging, setPaging] = useState({ resetKey, page: 1 });
  const [view] = useTableViewPreference(table.id);
  const defaultWidths = useMemo(() => Object.fromEntries(table.columns.map(([key, , width]) => [key, width])), [table]);
  const sizing = useTableColumnResize(table.id + '-phase31-widths', defaultWidths);
  if (paging.resetKey !== resetKey) setPaging({ resetKey, page: 1 });
  const page = Math.min(paging.resetKey === resetKey ? paging.page : 1, Math.max(1, Math.ceil(rows.length / pageSize)));
  const tiles = view === 'tiles' && rows.length > 0;
  const start = tiles ? 0 : (page - 1) * pageSize;
  const shownRows = tiles ? rows : rows.slice(start, start + pageSize);

  useEffect(() => {
    let savedDefault = analyticsPageSize();
    const reloadPageSize = () => {
      const nextDefault = analyticsPageSize();
      if (nextDefault === savedDefault) return;
      savedDefault = nextDefault;
      setPageSize(nextDefault);
      setPaging(current => ({ ...current, page: 1 }));
    };
    window.addEventListener('crm_page_nav_updated', reloadPageSize);
    window.addEventListener('crm_config_updated', reloadPageSize);
    return () => {
      window.removeEventListener('crm_page_nav_updated', reloadPageSize);
      window.removeEventListener('crm_config_updated', reloadPageSize);
    };
  }, []);

  return (
    <>
      <div className="an-phase-table-scroll" role="region" aria-label={table.label} tabIndex={0}>
        <MobileTableView key={resetKey} id={table.id} view={view} hideToggle>
          <table aria-label={table.label} className="an-phase-table" style={{ minWidth: sizing.getTotalTableWidth() }}>
            <colgroup>{table.columns.map(([key]) => <col key={key} style={{ width: sizing.colWidths[key] }} />)}</colgroup>
            <thead>
              <tr>{table.columns.map(([key, label, , align, color]) => (
                <th key={key} scope="col" style={{ textAlign: align, color: color ? phaseInk(color) : undefined }}>
                  {label}
                  <ColumnResizer colKey={key} isResizing={sizing.isResizing(key)}
                    onResizeStart={sizing.handleResizeStart} onReset={sizing.resetColWidth} />
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {shownRows.length ? shownRows.map((row, index) => renderRow(row, start + index)) : (
                <tr><td colSpan={table.columns.length} className="an-report-empty">{empty}</td></tr>
              )}
            </tbody>
          </table>
        </MobileTableView>
      </div>
      {!tiles && (
        <StandardTablePagination className="an-phase-pagination" currentPage={page} totalRecords={rows.length} pageSize={pageSize}
          onPageChange={next => setPaging({ resetKey, page: next })}
          onPageSizeChange={size => { setPageSize(size); setPaging({ resetKey, page: 1 }); }} />
      )}
    </>
  );
}

function AnalyticsStageChart({ data, height }) {
  return (
    <div className="an-phase-chart">
      <ResponsiveContainer width="100%" height={height} minWidth={0}>
        <BarChart data={data} margin={{ top: 14, right: 12, left: 0, bottom: 8 }} accessibilityLayer>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--spc-view-border)" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} minTickGap={12}
            tickFormatter={name => name.replace(/\s+Stage$/i, '')} tick={{ fontSize: 11, fill: 'var(--an-report-muted)' }} />
          <YAxis width={42} axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: 'var(--an-report-muted)', fontSize: 11 }} />
          <RechartsTooltip cursor={{ fill: 'var(--spc-view-raised)' }}
            contentStyle={{ backgroundColor: 'var(--spc-view-surface)', border: '1px solid var(--spc-view-border)', color: 'var(--spc-view-text)', borderRadius: '8px' }}
            itemStyle={{ color: 'var(--spc-view-text)' }} />
          <Bar dataKey="count" name="Leads" fill="var(--an-report-accent)" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="count" position="top" style={{ fill: 'var(--spc-view-text)', fontSize: 11, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

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
    case 'S00': return { label: 'S00 Unassigned', bg: 'rgba(245, 158, 11, 0.14)', color: '#d97706' };
    case 'S01': return { label: 'S01 Requisition', bg: 'rgba(59, 130, 246, 0.14)', color: '#2563eb' };
    case 'S02': return { label: 'S02 Screening', bg: 'rgba(100, 116, 139, 0.14)', color: 'var(--text-secondary, #64748b)' };
    case 'S03': return { label: 'S03 Interview', bg: 'rgba(168, 85, 247, 0.14)', color: '#9333ea' };
    case 'S04': return { label: 'S04 Skill Test', bg: 'rgba(168, 85, 247, 0.14)', color: '#7e22ce' };
    case 'S05': return { label: 'S05 ED Approval', bg: 'rgba(6, 182, 212, 0.14)', color: '#0891b2' };
    case 'S06': return { label: 'S06 Salary Neg.', bg: 'rgba(245, 158, 11, 0.14)', color: '#d97706' };
    case 'S07': return { label: 'S07 Shortlisted', bg: 'rgba(16, 185, 129, 0.14)', color: '#16a34a' };
    case 'S08': return { label: 'S08 LOI Offered', bg: 'rgba(99, 102, 241, 0.14)', color: '#4f46e5' };
    case 'S09': return { label: 'S09 Joined/Onboard', bg: 'rgba(16, 185, 129, 0.22)', color: '#15803d' };
    default: return { label: stage || status || 'Applied', bg: 'var(--th-bg, rgba(100,116,139,0.1))', color: 'var(--text-primary)' };
  }
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDateCache = new Map();

export const fastToISTDate = (dateVal) => {
  if (!dateVal) return '';
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    if (!trimmed) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const cached = istDateCache.get(trimmed);
    if (cached !== undefined) return cached;

    let res = '';
    const ms = Date.parse(trimmed);
    if (!isNaN(ms)) {
      const ist = new Date(ms + IST_OFFSET_MS);
      const y = ist.getUTCFullYear();
      const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
      const d = String(ist.getUTCDate()).padStart(2, '0');
      res = `${y}-${m}-${d}`;
    }
    if (istDateCache.size < 50000) {
      istDateCache.set(trimmed, res);
    }
    return res;
  }
  const ms = dateVal instanceof Date ? dateVal.getTime() : Date.parse(dateVal);
  if (isNaN(ms)) return '';
  const ist = new Date(ms + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatTimeIST = (timeStr) => {
  if (!timeStr) return '—';
  try {
    if (typeof timeStr === 'string' && (timeStr.includes('T') || timeStr.includes('-'))) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      }
    }
    return timeStr;
  } catch (_e) {
    return timeStr;
  }
};

export default function AnalyticsDashboard({ 
  leads = [], 
  teamMembers = [],
  userEmail = '',
  userName = '',
  userId = '',
  userRole = '',
  moduleAccess = {},
  isSyncing = false,
  syncLoadedCount = 0,
  onNavigateTab,
  onSubTabChange,
  initialSubTab = '',
  tenantId = null,
  userCompany = '',
  adminCompanyFilter = 'All'
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
    onSubTabChange?.(canonical);
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
  const [leadBreakdownSearch, setLeadBreakdownSearch] = useState('');
  const [leadBreakdownFilter, setLeadBreakdownFilter] = useState('ALL'); // 'ALL' | 'WITH_LEADS' | 'TOP_PERFORMERS'

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

  const [selectedEmployeeEmails, setSelectedEmployeeEmails] = useState([]);
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

  const toISTDate = fastToISTDate;

  const isAllTime = useMemo(() => {
    return datePreset === 'all' || datePreset === 'all_time' || (!startDate && !endDate);
  }, [datePreset, startDate, endDate]);

  const dateFilterLabel = (() => {
    if (datePreset === 'today') return 'Today';
    if (datePreset === 'yesterday') return 'Yesterday';
    if (datePreset === 'this_week') return 'This Week';
    if (datePreset === 'last_week') return 'Last Week';
    if (datePreset === 'this_month') return 'This Month';
    if (datePreset === 'last_month') return 'Last Month';
    if (datePreset === 'all_time' || datePreset === 'all') return 'All Time';
    if (startDate && endDate) return startDate === endDate ? startDate : `${startDate} to ${endDate}`;
    return 'All Time';
  })();

  const isEmployeeMatch = (identifier, emp) => {
    if (!identifier || !emp) return false;
    const str = String(identifier).trim().toLowerCase();
    const empEmail = (emp.email || '').trim().toLowerCase();
    const empName = (emp.emp_name || emp.name || '').trim().toLowerCase();
    const empId = (emp.user_id || '').trim().toLowerCase();
    const empCode = (emp.emp_code || emp.emp_id || '').trim().toLowerCase();

    if (empEmail && (str === empEmail || str.includes(empEmail))) return true;
    if (empId && str === empId) return true;
    if (empName && (str === empName || str.includes(empName) || empName.includes(str))) return true;
    if (empCode && str.includes(empCode)) return true;
    if (empEmail && str.includes(empEmail.split('@')[0])) return true;
    return false;
  };

  // High-performance O(1) Employee Index & Fuzzy Lookup Cache
  const employeeLookup = useMemo(() => {
    const directMap = new Map();
    const matchCache = new Map();

    formattedEmployees.forEach(emp => {
      const email = (emp.email || '').trim().toLowerCase();
      const name = (emp.emp_name || emp.name || '').trim().toLowerCase();
      const id = (emp.user_id || '').trim().toLowerCase();
      const code = (emp.emp_code || emp.emp_id || '').trim().toLowerCase();

      if (email) directMap.set(email, emp);
      if (name) directMap.set(name, emp);
      if (id) directMap.set(id, emp);
      if (code) directMap.set(code, emp);
      if (email && email.includes('@')) {
        const username = email.split('@')[0];
        if (username) directMap.set(username, emp);
      }
    });

    const matchEmployee = (identifier) => {
      if (!identifier) return null;
      const str = String(identifier).trim().toLowerCase();
      if (!str) return null;
      if (matchCache.has(str)) return matchCache.get(str);

      // 1. Instant O(1) Map match
      let found = directMap.get(str);
      if (found) {
        matchCache.set(str, found);
        return found;
      }

      // 2. Fallback to substring matching across employees (cached on first encounter)
      for (let i = 0; i < formattedEmployees.length; i++) {
        const emp = formattedEmployees[i];
        if (isEmployeeMatch(str, emp)) {
          found = emp;
          break;
        }
      }
      matchCache.set(str, found || null);
      return found || null;
    };

    return { matchEmployee };
  }, [formattedEmployees]);

  const selectedEmployee = useMemo(() => {
    if (selectedEmployeeEmails.length === 0) return 'All';
    if (selectedEmployeeEmails.length === 1) return selectedEmployeeEmails[0];
    return selectedEmployeeEmails.join(',');
  }, [selectedEmployeeEmails]);

  const setSelectedEmployee = (val) => {
    if (!val || val === 'All' || val === 'ALL') {
      setSelectedEmployeeEmails([]);
    } else if (Array.isArray(val)) {
      setSelectedEmployeeEmails(val);
    } else {
      setSelectedEmployeeEmails([val]);
    }
  };

  const selectedEmployeeObjs = useMemo(() => {
    if (selectedEmployeeEmails.length === 0) return [];
    return formattedEmployees.filter(emp => {
      const email = (emp.email || '').toLowerCase().trim();
      const id = (emp.user_id || emp.id || '').toLowerCase().trim();
      const code = (emp.emp_code || emp.emp_id || '').toLowerCase().trim();
      const name = (emp.emp_name || emp.name || '').toLowerCase().trim();
      return selectedEmployeeEmails.some(sel => {
        const s = (sel || '').toLowerCase().trim();
        return s === email || (id && s === id) || (code && s === code) || (name && s === name);
      });
    });
  }, [selectedEmployeeEmails, formattedEmployees]);

  const selectedEmployeeObj = useMemo(() => {
    return selectedEmployeeObjs.length === 1 ? selectedEmployeeObjs[0] : null;
  }, [selectedEmployeeObjs]);

  const effectiveTargetEmail = useMemo(() => {
    if (selectedEmployeeEmails.length === 0) return '';
    return selectedEmployeeEmails.join(',');
  }, [selectedEmployeeEmails]);

  const isMyWorkSelected = useMemo(() => {
    if (selectedEmployeeEmails.length !== 1) return false;
    const sel = selectedEmployeeEmails[0].toLowerCase();
    if (myTeamMember && (sel === (myTeamMember.email || '').toLowerCase() || sel === (myTeamMember.user_id || '').toLowerCase())) return true;
    if (userEmail && sel === userEmail.toLowerCase()) return true;
    return false;
  }, [selectedEmployeeEmails, myTeamMember, userEmail]);

  const viewingLabel = useMemo(() => {
    if (selectedEmployeeEmails.length === 0) return 'All Team Members';
    if (selectedEmployeeEmails.length === 1) {
      const emp = selectedEmployeeObjs[0];
      return emp ? (emp.emp_name || emp.name || emp.email) : selectedEmployeeEmails[0];
    }
    const names = selectedEmployeeObjs.map(e => e.emp_name || e.name || e.email).filter(Boolean);
    if (names.length <= 2) return names.join(' & ');
    return `${names[0]}, ${names[1]} & ${names.length - 2} more (${names.length} Reps)`;
  }, [selectedEmployeeEmails, selectedEmployeeObjs]);

  const getStageFromStatus = (status) => {
    if (!status) return '01 - New Stage';
    const s = String(status || '').trim();
    if (s.startsWith('8;') || s.startsWith('08') || s.startsWith('8 -') || s.toLowerCase().includes('transfer to party')) return '08 - Transfer to Party';
    if (s.startsWith('1;') || s.startsWith('01') || s.startsWith('1 -') || s.toLowerCase().includes('new stage') || s === 'New' || s === 'Pending') return '01 - New Stage';
    if (s.startsWith('2;') || s.startsWith('02') || s.startsWith('2 -') || s.toLowerCase().includes('contact stage') || s.toLowerCase().includes('contacted')) return '02 - Contact Stage';
    if (s.startsWith('3;') || s.startsWith('03') || s.startsWith('3 -') || s.toLowerCase().includes('qualification stage') || s.toLowerCase().includes('qualified')) return '03 - Qualification Stage';
    if (s.startsWith('4;') || s.startsWith('04') || s.startsWith('4 -') || s.toLowerCase().includes('follow up stage') || s.toLowerCase().includes('follow-up') || s.toLowerCase().includes('reschedule')) return '04 - Follow Up Stage';
    if (s.startsWith('5;') || s.startsWith('05') || s.startsWith('5 -') || s.toLowerCase().includes('sales process') || s.toLowerCase().includes('quotation') || s.toLowerCase().includes('proposal')) return '05 - Sales Process Stage';
    if (s.startsWith('6;') || s.startsWith('06') || s.startsWith('6 -') || s.toLowerCase().includes('conversion stage') || s.toLowerCase().includes('negotiation')) return '06 - Conversion Stage';
    if (s.startsWith('7;') || s.startsWith('07') || s.startsWith('7 -') || s.toLowerCase().includes('final stage') || ['Converted', 'Order Received', 'Closed', 'Won', 'Lost'].some(k => s.toLowerCase().includes(k.toLowerCase()))) return '07 - Final Stage';
    const m = s.match(/^0?([1-8])/);
    if (m) {
      const num = parseInt(m[1], 10);
      const stageNames = {
        1: '01 - New Stage',
        2: '02 - Contact Stage',
        3: '03 - Qualification Stage',
        4: '04 - Follow Up Stage',
        5: '05 - Sales Process Stage',
        6: '06 - Conversion Stage',
        7: '07 - Final Stage',
        8: '08 - Transfer to Party'
      };
      if (stageNames[num]) return stageNames[num];
    }
    return '01 - New Stage';
  };

  const getStageNumber = (status) => {
    if (!status) return 1;
    const st = String(status).trim();
    if (st.startsWith('8;') || st.startsWith('08') || st.toLowerCase().includes('transfer to party')) return 8;
    if (st.startsWith('1;') || st.startsWith('01') || st.startsWith('1')) return 1;
    if (st.startsWith('2;') || st.startsWith('02') || st.startsWith('2')) return 2;
    if (st.startsWith('3;') || st.startsWith('03') || st.startsWith('3')) return 3;
    if (st.startsWith('4;') || st.startsWith('04') || st.startsWith('4')) return 4;
    if (st.startsWith('5;') || st.startsWith('05') || st.startsWith('5')) return 5;
    if (st.startsWith('6;') || st.startsWith('06') || st.startsWith('6')) return 6;
    if (st.startsWith('7;') || st.startsWith('07') || st.startsWith('7') || ['Converted', 'Order Received', 'Closed', 'Won', 'Lost'].some(k => st.toLowerCase().includes(k.toLowerCase()))) return 7;
    const m = st.match(/^0?([1-8])/);
    if (m) return parseInt(m[1], 10);
    return 1;
  };

  // Helper: check if a lead was created, followed up, or scheduled in the specified period (fast short-circuiting)
  const isLeadInPeriod = (lead, start, end, touchedLeadIdSet) => {
    if (!lead) return false;
    if (touchedLeadIdSet && touchedLeadIdSet.has(lead.id)) return true;

    if (lead.created_at) {
      const cDate = fastToISTDate(lead.created_at);
      if (cDate && (!start || cDate >= start) && (!end || cDate <= end)) return true;
    }
    if (lead.updated_at) {
      const uDate = fastToISTDate(lead.updated_at);
      if (uDate && (!start || uDate >= start) && (!end || uDate <= end)) return true;
    }
    if (lead.lead_date) {
      const lDate = fastToISTDate(lead.lead_date);
      if (lDate && (!start || lDate >= start) && (!end || lDate <= end)) return true;
    }
    const fStr = lead.follow_up_date || lead.next_follow_up_date;
    if (fStr) {
      const fDate = fastToISTDate(fStr);
      if (fDate && (!start || fDate >= start) && (!end || fDate <= end)) return true;
    }
    return false;
  };

  // High-performance single-pass Leads & Activity Engine (O(N) processing instead of O(N*M))
  const leadAnalyticsEngine = useMemo(() => {
    const leadMapById = new Map();
    const empAssignedLeadsMap = new Map();
    const touchedLeadSet = new Set();
    const actMap = new Map();

    formattedEmployees.forEach(emp => {
      const empEmail = (emp.email || '').toLowerCase();
      empAssignedLeadsMap.set(empEmail, []);
    });

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      leadMapById.set(lead.id, lead);

      // 1. Group assigned leads to employee in O(1)
      if (lead.assigned_to) {
        const assignedEmp = employeeLookup.matchEmployee(lead.assigned_to);
        if (assignedEmp && assignedEmp.email) {
          const list = empAssignedLeadsMap.get(assignedEmp.email.toLowerCase());
          if (list) list.push(lead);
        }
      }

      // 2. Note activity in period
      const notes = Array.isArray(lead.lead_notes) ? lead.lead_notes : [];
      for (let j = 0; j < notes.length; j++) {
        const note = notes[j];
        let noteInPeriod = false;
        if (isAllTime) {
          noteInPeriod = true;
        } else {
          const nDate = fastToISTDate(note.created_at);
          if (nDate && (!startDate || nDate >= startDate) && (!endDate || nDate <= endDate)) {
            noteInPeriod = true;
          }
        }

        if (noteInPeriod) {
          touchedLeadSet.add(lead.id);

          const empKey = note.created_by || lead.assigned_to || '';
          const tm = employeeLookup.matchEmployee(empKey);
          if (tm) {
            const empName = tm.emp_name || tm.name || tm.email;
            const normKey = empName.toLowerCase();
            let entry = actMap.get(normKey);
            if (!entry) {
              entry = {
                employee: empName,
                empCode: tm.emp_code || tm.emp_id || '',
                email: tm.email || '',
                actions: 0,
                uniqueLeads: 0,
                leadIdSet: new Set()
              };
              actMap.set(normKey, entry);
            }
            entry.actions += 1;
            entry.leadIdSet.add(lead.id);
          }
        }
      }
    }

    const activityList = [];
    const activeMap = new Map();
    actMap.forEach((val, key) => {
      val.uniqueLeads = val.leadIdSet.size;
      activityList.push(val);
      activeMap.set(key, val);
      if (val.email) activeMap.set(val.email.toLowerCase(), val);
    });

    activityList.sort((a, b) => b.uniqueLeads - a.uniqueLeads || b.actions - a.actions);

    return {
      leadMapById,
      empAssignedLeadsMap,
      periodTouchedLeadIds: touchedLeadSet,
      employeeActivityList: activityList,
      crmActiveEmployeesMap: activeMap
    };
  }, [leads, isAllTime, startDate, endDate, formattedEmployees, employeeLookup]);

  const { periodTouchedLeadIds, employeeActivityList, crmActiveEmployeesMap } = leadAnalyticsEngine;

  // Reactive filtered leads responding dynamically to both Employee(s) and Date Range
  const filteredLeadsSync = useMemo(() => {
    // 1. Employee filter (if one or multiple reps are selected)
    let baseLeads;
    if (selectedEmployeeEmails.length > 0) {
      baseLeads = [];
      const seenLeads = new Set();
      for (let i = 0; i < selectedEmployeeObjs.length; i++) {
        const emp = selectedEmployeeObjs[i];
        const assigned = leadAnalyticsEngine.empAssignedLeadsMap.get((emp.email || '').toLowerCase()) || [];
        for (let j = 0; j < assigned.length; j++) {
          const l = assigned[j];
          if (!seenLeads.has(l.id)) {
            seenLeads.add(l.id);
            baseLeads.push(l);
          }
        }
      }
    } else {
      baseLeads = leads;
    }

    // 2. All Time view -> return all base leads
    if (isAllTime) return baseLeads;

    // 3. Period-scoped view -> filter by active leads in [startDate, endDate]
    const filtered = [];
    for (let i = 0; i < baseLeads.length; i++) {
      const l = baseLeads[i];
      if (isLeadInPeriod(l, startDate, endDate, leadAnalyticsEngine.periodTouchedLeadIds)) {
        filtered.push(l);
      }
    }
    return filtered;
  }, [leads, selectedEmployeeEmails, selectedEmployeeObjs, isAllTime, startDate, endDate, leadAnalyticsEngine]);

  const kpis = useMemo(() => {
    const total = filteredLeadsSync.length;
    const todayIST = fastToISTDate(new Date());
    let overdueFollowups = 0;
    let todayFollowups = 0;
    let newLeads = 0;
    let followUps = 0;
    let inPipeline = 0;
    let won = 0;

    for (let i = 0; i < filteredLeadsSync.length; i++) {
      const l = filteredLeadsSync[i];
      const fDateStr = l.follow_up_date || l.next_follow_up_date;
      if (fDateStr) {
        const dateOnly = fastToISTDate(fDateStr);
        if (dateOnly) {
          if (dateOnly < todayIST) overdueFollowups++;
          else if (dateOnly === todayIST) todayFollowups++;
        }
      }

      const st = l.status || '';
      const stage = getStageFromStatus(st);
      if (stage === '01 - New Stage') {
        newLeads++;
      } else if (stage === '04 - Follow Up Stage' || (st && (st.toLowerCase().includes('reschedule') || st.toLowerCase().includes('follow')))) {
        followUps++;
      } else if (['02 - Contact Stage', '03 - Qualification Stage', '05 - Sales Process Stage', '06 - Conversion Stage'].includes(stage)) {
        inPipeline++;
      } else if (stage === '07 - Final Stage' && (st.includes('Won') || st.includes('Converted') || st.includes('Closed') || st.includes('Order Received'))) {
        won++;
      }
    }

    const actionNeeded = newLeads + followUps;
    return { total, newLeads, followUps, inPipeline, won, actionNeeded, overdueFollowups, todayFollowups };
  }, [filteredLeadsSync]);

  const stageData = useMemo(() => {
    const stageCounts = {};
    for (let i = 0; i < filteredLeadsSync.length; i++) {
      const stage = getStageFromStatus(filteredLeadsSync[i].status);
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    }
    return Object.keys(stageCounts).sort().map(stage => ({
      name: stage.split('- ')[1] || stage,
      count: stageCounts[stage]
    }));
  }, [filteredLeadsSync]);

  // Comprehensive Pipeline Stage & Sub-stage breakdown data
  const detailedStageBreakdown = useMemo(() => {
    const stageMap = {
      1: { fullStage: '01 - New Stage', shortName: 'New Stage', color: '#3b82f6', count: 0, subMap: {} },
      2: { fullStage: '02 - Contact Stage', shortName: 'Contact Stage', color: '#06b6d4', count: 0, subMap: {} },
      3: { fullStage: '03 - Qualification Stage', shortName: 'Qualification Stage', color: '#8b5cf6', count: 0, subMap: {} },
      4: { fullStage: '04 - Follow Up Stage', shortName: 'Follow Up Stage', color: '#f59e0b', count: 0, subMap: {} },
      5: { fullStage: '05 - Sales Process Stage', shortName: 'Sales Process Stage', color: '#ec4899', count: 0, subMap: {} },
      6: { fullStage: '06 - Conversion Stage', shortName: 'Conversion Stage', color: '#10b981', count: 0, subMap: {} },
      7: { fullStage: '07 - Final Stage', shortName: 'Final Stage', color: '#6366f1', count: 0, subMap: {} },
      8: { fullStage: '08 - Transfer to Party', shortName: 'Transfer to Party', color: '#0d9488', count: 0, subMap: {} }
    };

    for (let i = 0; i < filteredLeadsSync.length; i++) {
      const l = filteredLeadsSync[i];
      const num = getStageNumber(l.status);
      const target = stageMap[num] || stageMap[1];
      target.count++;

      let subName = 'General / Direct';
      const st = l.status || '';
      if (st) {
        if (st.includes('>')) {
          const parts = st.split('>');
          subName = parts[parts.length - 1].trim() || parts[0];
        } else if (st.includes(';')) {
          const parts = st.split(';');
          subName = parts[parts.length - 1].trim();
        } else {
          subName = st;
        }
      }
      target.subMap[subName] = (target.subMap[subName] || 0) + 1;
    }

    return Object.values(stageMap).map(item => {
      const substages = Object.keys(item.subMap).map(subLabel => ({
        label: subLabel,
        count: item.subMap[subLabel]
      })).sort((a, b) => b.count - a.count);

      return {
        ...item,
        substages
      };
    });
  }, [filteredLeadsSync]);

  // Lead Acquisition Source Breakdown
  const sourceBreakdown = useMemo(() => {
    const map = {};
    for (let i = 0; i < filteredLeadsSync.length; i++) {
      const l = filteredLeadsSync[i];
      const src = (l.source || l.source_name || 'Direct / Unspecified').trim();
      map[src] = (map[src] || 0) + 1;
    }
    return Object.keys(map)
      .map(name => ({ name, count: map[name] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
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

  // Load server-side metrics (e.g. WhatsApp stats)
  useEffect(() => {
    let isCancelled = false;
    async function loadMetrics() {
      setLoading(true);
      const totalLeadsCount = (filteredLeadsSync || []).length;
      const isGlobalQuery = totalLeadsCount > 500;
      const leadIds = isGlobalQuery ? [] : filteredLeadsSync.map(l => l.id);

      const periodLabel = isAllTime
        ? 'All Time'
        : (datePreset === 'today' ? 'Today' : (datePreset?.includes('week') ? 'Last 7 Days' : 'This Month'));

      try {
        const res = await getDashboardMetrics({
          leadIds,
          isGlobal: isGlobalQuery,
          dateFilter: periodLabel
        }, periodLabel);
        if (!isCancelled && res?.success && res?.data) {
          setMetrics(prev => ({
            ...prev,
            whatsappStats: res.data.whatsappStats || { period: 0, total: 0 }
          }));
        }
      } catch (err) {
        console.warn('Error loading dashboard metrics:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }
    loadMetrics();
    return () => { isCancelled = true; };
  }, [filteredLeadsSync.length, isAllTime, datePreset, startDate, endDate, selectedEmployee]);

  const fetchAssignedWork = async () => {
    setLoadingAssignedWork(true);
    try {
      const res = await getUserAssignedWorkSummary({
        userEmail,
        targetEmail: effectiveTargetEmail,
        isAllSelected: selectedEmployee === 'All',
        targetDate: startDate || new Date(),
        tenantId,
        userCompany,
        adminCompanyFilter
      });
      if (res?.success) setAssignedWork(res.data);
    } catch (err) {
      console.warn('Error loading assigned work:', err);
    } finally {
      setLoadingAssignedWork(false);
    }
  };

  useEffect(() => { 
    fetchAssignedWork(); 
  }, [userEmail, effectiveTargetEmail, selectedEmployee, startDate, tenantId, userCompany, adminCompanyFilter]);

  // Load attendance, checklist compliance, recruitment summaries
  const fetchDashboardSummaries = async () => {
    setLoadingSummaries(true);
    try {
      const res = await getDashboardSummaries({ 
        targetDate: startDate,
        startDate,
        endDate,
        tenantId,
        userCompany,
        adminCompanyFilter
      });
      if (res?.success) setDashboardSummaries(res.data);
    } catch (e) {
      console.warn('Dashboard summaries error:', e);
    } finally {
      setLoadingSummaries(false);
    }
  };

  useEffect(() => {
    fetchDashboardSummaries();
  }, [startDate, endDate, tenantId, userCompany, adminCompanyFilter]);

  // Working days in current selected period (Mon–Sat, excluding Sundays)
  const attendanceWorkingDays = useMemo(() => {
    if (!startDate || !endDate || startDate === endDate) return 1;
    let count = 0;
    const cur = new Date(`${startDate}T12:00:00+05:30`);
    const end = new Date(`${endDate}T12:00:00+05:30`);
    while (cur <= end) {
      if (cur.getDay() !== 0) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return Math.max(1, count);
  }, [startDate, endDate]);

  const isAttendanceRange = Boolean(startDate && endDate && startDate !== endDate);

  // Combined attendance records with CRM activity intelligence (defined before Scorecard so Scorecard can use attendance)
  const enrichedAttendanceRecords = useMemo(() => {
    const rawRecords = dashboardSummaries.attendanceSummary?.records || [];
    
    // Group records by employee email
    const empRecordsMap = new Map();
    const latestRecordMap = new Map();
    rawRecords.forEach(r => {
      const em = (r.email || '').toLowerCase().trim();
      if (!em) return;
      if (!empRecordsMap.has(em)) empRecordsMap.set(em, []);
      empRecordsMap.get(em).push(r);
      if (!latestRecordMap.has(em)) latestRecordMap.set(em, r);
    });

    return formattedEmployees.map(emp => {
      const email = (emp.email || '').toLowerCase();
      const userRecs = empRecordsMap.get(email) || [];
      const rawRec = latestRecordMap.get(email);
      const crmAct = crmActiveEmployeesMap.get(emp.emp_name?.toLowerCase()) || crmActiveEmployeesMap.get(email);
      const isCrmActive = Boolean(crmAct && crmAct.actions > 0);

      if (isAttendanceRange) {
        // Multi-day date range mode: aggregate period attendance performance
        const presentDays = userRecs.filter(r => ['PRESENT', 'LATE', 'HALF_DAY', 'REGULARIZED'].includes(r.status) || r.in_time).length;
        const lateDays = userRecs.filter(r => r.status === 'LATE').length;
        const halfDays = userRecs.filter(r => r.status === 'HALF_DAY').length;
        const absentDays = Math.max(0, attendanceWorkingDays - presentDays);
        const attendanceRate = attendanceWorkingDays > 0 ? Math.min(100, Math.round((presentDays / attendanceWorkingDays) * 100)) : 0;
        const inTime = rawRec?.in_time || null;

        let presenceStatus = 'ABSENT';
        let statusLabel = `No Punches Logged (0%)`;
        let statusColor = '#dc2626';

        if (attendanceRate >= 80) {
          presenceStatus = 'PRESENT';
          statusLabel = `Regular (${presentDays}/${attendanceWorkingDays}d · ${attendanceRate}%)`;
          statusColor = '#16a34a';
        } else if (attendanceRate >= 50) {
          presenceStatus = 'PRESENT';
          statusLabel = `Good (${presentDays}/${attendanceWorkingDays}d · ${attendanceRate}%)`;
          statusColor = '#2563eb';
        } else if (presentDays > 0) {
          presenceStatus = 'HALF_DAY';
          statusLabel = `Needs Attention (${presentDays}/${attendanceWorkingDays}d · ${attendanceRate}%)`;
          statusColor = '#d97706';
        } else if (isCrmActive) {
          presenceStatus = 'CRM_ACTIVE';
          statusLabel = `Active on CRM (${crmAct.actions} actions)`;
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
          presentDays,
          lateDays,
          halfDays,
          absentDays,
          attendanceRate,
          workingDays: attendanceWorkingDays,
          crmUpdates: crmAct?.actions || 0,
          crmLeadsTouched: crmAct?.uniqueLeads || 0
        };
      }

      // Single-day mode: punch terminal status for target day
      let presenceStatus = 'ABSENT';
      let statusLabel = 'Absent (No Punch)';
      let statusColor = '#dc2626';
      let inTime = null;

      if (rawRec && (['PRESENT', 'LATE', 'HALF_DAY', 'REGULARIZED'].includes(rawRec.status) || rawRec.in_time)) {
        presenceStatus = rawRec.status || 'PRESENT';
        statusLabel = rawRec.status === 'LATE' ? 'Late Punch' 
                    : rawRec.status === 'HALF_DAY' ? 'Half Day' 
                    : rawRec.status === 'REGULARIZED' ? 'Regularized' 
                    : 'Punched Present';
        statusColor = rawRec.status === 'LATE' ? '#d97706' 
                    : rawRec.status === 'HALF_DAY' ? '#f59e0b' 
                    : '#16a34a';
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
        presentDays: ['PRESENT', 'LATE', 'HALF_DAY', 'REGULARIZED'].includes(presenceStatus) ? 1 : 0,
        lateDays: presenceStatus === 'LATE' ? 1 : 0,
        halfDays: presenceStatus === 'HALF_DAY' ? 1 : 0,
        absentDays: presenceStatus === 'ABSENT' ? 1 : 0,
        attendanceRate: ['PRESENT', 'LATE', 'HALF_DAY', 'REGULARIZED'].includes(presenceStatus) ? 100 : 0,
        workingDays: 1,
        crmUpdates: crmAct?.actions || 0,
        crmLeadsTouched: crmAct?.uniqueLeads || 0
      };
    });
  }, [formattedEmployees, dashboardSummaries.attendanceSummary, crmActiveEmployeesMap, isAttendanceRange, attendanceWorkingDays]);

  const filteredAttendance = useMemo(() => {
    let list = enrichedAttendanceRecords;
    if (selectedEmployeeEmails.length > 0) {
      list = list.filter(r => selectedEmployeeObjs.some(emp => isEmployeeMatch(r.email, emp) || isEmployeeMatch(r.empName, emp)));
    }
    if (attendanceFilter === 'PRESENT') return list.filter(r => ['PRESENT', 'LATE', 'HALF_DAY', 'REGULARIZED'].includes(r.presenceStatus) || (r.presentDays && r.presentDays > 0));
    if (attendanceFilter === 'CRM_ACTIVE') return list.filter(r => r.presenceStatus === 'CRM_ACTIVE');
    if (attendanceFilter === 'ABSENT') return list.filter(r => r.presenceStatus === 'ABSENT' && (!r.presentDays || r.presentDays === 0));
    return list;
  }, [enrichedAttendanceRecords, attendanceFilter, selectedEmployeeEmails, selectedEmployeeObjs]);

  const attendanceStats = useMemo(() => {
    const total = enrichedAttendanceRecords.length;
    if (isAttendanceRange) {
      const activeWithPunches = enrichedAttendanceRecords.filter(r => (r.presentDays || 0) > 0).length;
      const crmActiveOnly = enrichedAttendanceRecords.filter(r => (r.presentDays || 0) === 0 && r.crmUpdates > 0).length;
      const effectivePresent = activeWithPunches + crmActiveOnly;
      const absent = total - effectivePresent;
      const totalPresentLogs = enrichedAttendanceRecords.reduce((sum, r) => sum + (r.presentDays || 0), 0);
      const totalExpectedLogs = total * attendanceWorkingDays;
      const effectivePercent = totalExpectedLogs > 0 ? Math.min(100, Math.round((totalPresentLogs / totalExpectedLogs) * 100)) : 0;
      return { total, punched: activeWithPunches, crmActiveOnly, effectivePresent, absent, effectivePercent, totalPresentLogs, attendanceWorkingDays };
    }
    const punched = enrichedAttendanceRecords.filter(r => ['PRESENT', 'LATE', 'HALF_DAY', 'REGULARIZED'].includes(r.presenceStatus)).length;
    const crmActiveOnly = enrichedAttendanceRecords.filter(r => r.presenceStatus === 'CRM_ACTIVE').length;
    const effectivePresent = punched + crmActiveOnly;
    const absent = enrichedAttendanceRecords.filter(r => r.presenceStatus === 'ABSENT').length;
    const effectivePercent = total > 0 ? Math.round((effectivePresent / total) * 100) : 0;
    return { total, punched, crmActiveOnly, effectivePresent, absent, effectivePercent, totalPresentLogs: punched, attendanceWorkingDays: 1 };
  }, [enrichedAttendanceRecords, isAttendanceRange, attendanceWorkingDays]);

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
    const todayIST = fastToISTDate(new Date());
    const { empAssignedLeadsMap, periodTouchedLeadIds, crmActiveEmployeesMap, leadMapById } = leadAnalyticsEngine;

    return formattedEmployees.map(emp => {
      const empEmail = (emp.email || '').toLowerCase();
      const empName = emp.emp_name || emp.name || empEmail;

      // Activity stats from period metrics
      const act = crmActiveEmployeesMap.get(empName.toLowerCase()) || 
                  crmActiveEmployeesMap.get(empEmail) || 
                  { actions: 0, uniqueLeads: 0, leadIdSet: new Set() };

      // Leads assigned to this rep (All-time full assigned portfolio) - O(1) Instant Lookup
      const empAllLeads = empAssignedLeadsMap.get(empEmail) || [];

      // Total Assigned MUST ALWAYS reflect the representative's full portfolio
      const leadsAssigned = empAllLeads.length;

      // Leads active/touched in the selected period for this rep:
      let periodEmpLeads;
      if (isAllTime) {
        periodEmpLeads = empAllLeads;
      } else {
        const periodLeadIdSet = new Set();
        const activeLeads = [];
        for (let i = 0; i < empAllLeads.length; i++) {
          const l = empAllLeads[i];
          if (isLeadInPeriod(l, startDate, endDate, periodTouchedLeadIds)) {
            periodLeadIdSet.add(l.id);
            activeLeads.push(l);
          }
        }

        // Also add any leads that this rep personally touched/noted in the period (even if not strictly assigned to them)
        // O(1) ID lookup via leadMapById instead of scanning 44,552 leads
        if (act.leadIdSet && act.leadIdSet.size > 0) {
          act.leadIdSet.forEach(id => {
            if (!periodLeadIdSet.has(id)) {
              const l = leadMapById.get(id);
              if (l) {
                periodLeadIdSet.add(id);
                activeLeads.push(l);
              }
            }
          });
        }

        periodEmpLeads = activeLeads;
      }

      // Assigned stage breakdown (S1 to S7): Full distribution of representative's assigned portfolio
      const assignedStageBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
      for (let i = 0; i < empAllLeads.length; i++) {
        const num = getStageNumber(empAllLeads[i].status);
        if (assignedStageBreakdown[num] !== undefined) assignedStageBreakdown[num]++;
        else assignedStageBreakdown[1]++;
      }

      // Stage breakdown (S1 to S7): Dynamically reacts to selected date filter
      const stageBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
      for (let i = 0; i < periodEmpLeads.length; i++) {
        const num = getStageNumber(periodEmpLeads[i].status);
        if (stageBreakdown[num] !== undefined) stageBreakdown[num]++;
        else stageBreakdown[1]++;
      }

      // Overdue follow-ups for this rep (evaluated strictly in IST)
      let overdueFollowups = 0;
      let todayFollowups = 0;
      for (let i = 0; i < empAllLeads.length; i++) {
        const l = empAllLeads[i];
        const fDate = l.follow_up_date || l.next_follow_up_date;
        if (fDate) {
          const dStr = fastToISTDate(fDate);
          if (dStr) {
            if (dStr < todayIST) overdueFollowups++;
            else if (dStr === todayIST) todayFollowups++;
          }
        }
      }

      // Calculate touched leads for this representative:
      let assignedTouchedCount = 0;
      if (isAllTime) {
        for (let i = 0; i < empAllLeads.length; i++) {
          const l = empAllLeads[i];
          const stNum = getStageNumber(l.status);
          if (stNum > 1 || l.follow_up_date || l.next_follow_up_date || (Array.isArray(l.lead_notes) && l.lead_notes.length > 0) || (act.leadIdSet && act.leadIdSet.has(l.id))) {
            assignedTouchedCount++;
          }
        }
      } else {
        for (let i = 0; i < empAllLeads.length; i++) {
          const l = empAllLeads[i];
          // Strictly within selected period: touched if rep made activity/note on it in period, or lead was updated in period
          if (isLeadInPeriod(l, startDate, endDate, periodTouchedLeadIds) || (act.leadIdSet && act.leadIdSet.has(l.id)) || periodTouchedLeadIds.has(l.id)) {
            assignedTouchedCount++;
          }
        }
      }

      const effectiveTouched = Math.max(assignedTouchedCount, periodEmpLeads.length, act.uniqueLeads || 0);
      const leadsTouched = effectiveTouched;
      const periodTotal = isAllTime ? leadsAssigned : Math.max(periodEmpLeads.length, leadsTouched);
      const contactRate = periodTotal > 0 ? Math.min(100, Math.round((leadsTouched / periodTotal) * 100)) : 0;

      // Outreach Score (Max 30 pts): Directly reflects Touch Rate %
      const outreachScore = periodTotal > 0 
        ? Math.min(30, Math.round((contactRate / 100) * 30))
        : 0;

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
      const roleCategory = getEmployeeRoleCategory(emp, leadsAssigned);
      const roleLabel = roleCategory === 'SALES' ? 'Sales Rep' : roleCategory === 'RECRUITER' ? 'Recruiter / HR' : 'Operations';
      const roleBadgeBg = roleCategory === 'SALES' ? 'rgba(59, 130, 246, 0.12)' : roleCategory === 'RECRUITER' ? 'rgba(168, 85, 247, 0.12)' : 'rgba(100, 116, 139, 0.12)';
      const roleBadgeColor = roleCategory === 'SALES' ? 'var(--accent-color, #2563eb)' : roleCategory === 'RECRUITER' ? '#a855f7' : 'var(--text-secondary, #64748b)';

      // ------------------------------------------------------------------
      // PROCESS 1A: CALLING & OUTREACH (Max 30 pts)
      // ------------------------------------------------------------------
      const isCallerApplicable = leadsAssigned > 0 || effectiveTouched > 0 || act.actions > 0 || roleCategory === 'SALES';
      const callingProcess = {
        name: 'Calling & Outreach',
        score: isCallerApplicable ? outreachScore : 0,
        max: 30,
        metricText: isCallerApplicable ? `${effectiveTouched} touched · ${contactRate}% touch rate` : 'Exempt (No leads)',
        applicable: isCallerApplicable
      };

      // ------------------------------------------------------------------
      // PROCESS 1B: RECRUITER & CANDIDATE PIPELINE (Max 30 pts)
      // ------------------------------------------------------------------
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
      const recruiterWorkCount = myCandidates.length;

      const isRecruiterApplicable = roleCategory === 'RECRUITER' || recruiterWorkCount > 0 || myPositions.length > 0;
      const recScore = Math.min(30, Math.round((recruiterWorkCount / 5) * 15 + (inInterview * 5) + (shortlisted * 5) + (hired * 10)));
      const recruiterProcess = {
        name: 'Recruiter Pipeline',
        score: isRecruiterApplicable ? recScore : 0,
        max: 30,
        metricText: isRecruiterApplicable 
          ? (recruiterWorkCount > 0 ? `${recruiterWorkCount} candidates · ${inInterview} in-interview · ${hired} hired` : '0 active candidates')
          : 'Exempt (Not a Recruiter)',
        applicable: isRecruiterApplicable
      };

      const primaryProcess = roleCategory === 'RECRUITER' ? recruiterProcess : callingProcess;

      // ------------------------------------------------------------------
      // PROCESS 2: FOLLOW-UP DISCIPLINE / REQUISITIONS (Max 25 pts)
      // ------------------------------------------------------------------
      let followupProcess = {
        name: roleCategory === 'RECRUITER' ? 'Requisition Mgmt' : 'Follow-up Discipline',
        score: 0,
        max: 25,
        metricText: roleCategory === 'RECRUITER' ? 'Openings tracked' : 'No leads assigned',
        applicable: roleCategory === 'RECRUITER' ? true : leadsAssigned > 0,
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
      } else if (leadsAssigned > 0) {
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
      [callingProcess, recruiterProcess, primaryProcess, followupProcess, checklistProcess, taskProcess, attendanceProcess].forEach(p => {
        p.earned = p.score;
        p.weight = p.max;
        p.metric = p.metricText;
      });

      // Dynamic normalization across applicable processes (coreProcess max 30 + followup 25 + checklist 20 + task 15 + attendance 10 = exactly 100 max points)
      const coreProcess = roleCategory === 'RECRUITER' ? recruiterProcess : callingProcess;
      const applicableList = [coreProcess, followupProcess, checklistProcess, taskProcess, attendanceProcess].filter(p => p.applicable);
      const earnedPoints = applicableList.reduce((acc, p) => acc + p.score, 0);
      const maxPoints = applicableList.reduce((acc, p) => acc + p.max, 0);

      const hasActiveWork = act.actions > 0 || act.uniqueLeads > 0 || checkDone > 0 || tasksDone > 0 || recruiterWorkCount > 0 || (attRecord?.presenceStatus && attRecord.presenceStatus !== 'ABSENT');

      let totalScore = 0;
      let tier = 'INACTIVE';
      let tierLabel = 'Shift Not Started';
      let tierColor = '#94a3b8';
      let tierBg = 'rgba(148, 163, 184, 0.12)';

      if (hasActiveWork && maxPoints > 0) {
        totalScore = Math.min(100, Math.round((earnedPoints / maxPoints) * 100));
        if (totalScore >= 80) {
          tier = 'STAR';
          tierLabel = 'Star Performer';
          tierColor = '#10b981';
          tierBg = 'rgba(16, 185, 129, 0.14)';
        } else if (totalScore >= 60) {
          tier = 'ON_TRACK';
          tierLabel = 'On Track';
          tierColor = 'var(--accent-color, #2563eb)';
          tierBg = 'rgba(59, 130, 246, 0.14)';
        } else if (totalScore >= 40) {
          tier = 'NEEDS_ATTENTION';
          tierLabel = 'Needs Attention';
          tierColor = '#f59e0b';
          tierBg = 'rgba(245, 158, 11, 0.14)';
        } else {
          tier = 'CRITICAL';
          tierLabel = 'Critical / Lagging';
          tierColor = '#ef4444';
          tierBg = 'rgba(239, 68, 68, 0.14)';
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
        leadsAssigned,
        leadsTouched,
        contactRate,
        outreachScore,
        stageBreakdown,
        assignedStageBreakdown,
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
        callingProcess,
        recruiterProcess,
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
  }, [formattedEmployees, isAllTime, startDate, endDate, leadAnalyticsEngine, dashboardSummaries.checklistSummary, dashboardSummaries.recruitmentSummary, assignedWork.delegation, attendanceRecordMap]);

  // Filtered leaderboard with Role/Department filter and selected employee(s) filter
  const filteredScorecard = useMemo(() => {
    let list = teamScorecardData;
    if (selectedEmployeeEmails.length > 0) {
      list = list.filter(s => selectedEmployeeObjs.some(emp => isEmployeeMatch(s.empEmail, emp) || isEmployeeMatch(s.empName, emp)));
    }
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
  }, [teamScorecardData, selectedEmployeeEmails, selectedEmployeeObjs, scorecardDeptFilter, scorecardSearch]);

  // Active Top 3 Podium Winners (Only reps with real logged performance)
  const activePodiumWinners = useMemo(() => {
    return filteredScorecard
      .filter(r => r.totalScore > 0 && r.hasActiveWork)
      .slice(0, 3);
  }, [filteredScorecard]);

  // Filtered Delegation tasks
  const delegationTasksList = useMemo(() => {
    let list = assignedWork.delegation?.recentTasks || [];
    if (selectedEmployeeEmails.length > 0) {
      list = list.filter(t => {
        const tEmail = (t.assigned_to_email || '').toLowerCase();
        const tName = (t.assigned_to_name || '').toLowerCase();
        return selectedEmployeeObjs.some(emp => {
          const empEmail = (emp.email || '').toLowerCase();
          const empName = (emp.emp_name || emp.name || '').toLowerCase();
          return (tEmail && tEmail === empEmail) || (tName && tName === empName);
        });
      });
    }
    if (!taskSearch.trim()) return list;
    const q = taskSearch.toLowerCase();
    return list.filter(t =>
      t.title?.toLowerCase().includes(q) ||
      t.task_code?.toLowerCase().includes(q) ||
      t.assigned_to_name?.toLowerCase().includes(q) ||
      t.delegated_by_name?.toLowerCase().includes(q)
    );
  }, [assignedWork.delegation, taskSearch, selectedEmployeeEmails, selectedEmployeeObjs]);

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
    const workingDays = dashboardSummaries.checklistSummary?.workingDays || attendanceWorkingDays || 1;

    return formattedEmployees.map(emp => {
      const email = (emp.email || '').toLowerCase().trim();
      // Slots assigned to this employee
      const assignedSlots = allItems.filter(c => {
        if (c.assigned_type === 'ALL' || !c.assigned_employee_email) return true;
        const emails = c.assigned_employee_email.toLowerCase().split(',').map(e => e.trim());
        return emails.includes(email);
      });

      const totalPerDay = assignedSlots.length;
      const total = totalPerDay * workingDays;
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
        totalPerDay,
        workingDays,
        total,
        completed,
        pending,
        rate,
        statusLabel,
        statusColor,
        statusBg
      };
    }).sort((a, b) => b.rate - a.rate || b.completed - a.completed);
  }, [formattedEmployees, dashboardSummaries.checklistSummary, attendanceWorkingDays]);

  const checklistAggregates = useMemo(() => {
    let assignedTotal = 0;
    let completedTotal = 0;
    let pendingTotal = 0;

    employeeChecklistMatrix.forEach(row => {
      assignedTotal += row.total;
      completedTotal += row.completed;
      pendingTotal += row.pending;
    });

    const compliance = assignedTotal > 0 ? Math.min(100, Math.round((completedTotal / assignedTotal) * 100)) : 0;
    const distinctSlots = dashboardSummaries.checklistSummary?.totalSlots || checklists.totalSlots || 0;
    const completedLate = dashboardSummaries.checklistSummary?.late || checklists.completedLate || 0;
    const workingDays = dashboardSummaries.checklistSummary?.workingDays || attendanceWorkingDays || 1;

    return {
      distinctSlots,
      assignedTotal,
      completedTotal,
      pendingTotal,
      compliance,
      completedLate,
      workingDays
    };
  }, [employeeChecklistMatrix, dashboardSummaries.checklistSummary, checklists, attendanceWorkingDays]);

  const filteredEmployeeChecklist = useMemo(() => {
    let list = employeeChecklistMatrix;
    if (selectedEmployeeEmails.length > 0) {
      list = list.filter(m => selectedEmployeeObjs.some(emp => isEmployeeMatch(m.empEmail, emp) || isEmployeeMatch(m.empName, emp)));
    }
    if (!checklistSearch.trim()) return list;
    const q = checklistSearch.toLowerCase();
    return list.filter(m =>
      m.empName.toLowerCase().includes(q) ||
      m.empEmail.toLowerCase().includes(q) ||
      m.department.toLowerCase().includes(q)
    );
  }, [employeeChecklistMatrix, selectedEmployeeEmails, selectedEmployeeObjs, checklistSearch]);

  // Filtered Recruitment Candidates
  const filteredCandidatesList = useMemo(() => {
    let list = dashboardSummaries.recruitmentSummary?.candidates || [];
    if (selectedEmployeeEmails.length > 0) {
      list = list.filter(c => selectedEmployeeObjs.some(emp => isRecruiterMatch(c.created_by, emp)));
    }
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
  }, [dashboardSummaries.recruitmentSummary?.candidates, selectedEmployeeEmails, selectedEmployeeObjs, recruiterFilter, recruiterSearch]);

  // Filtered Team Member Lead Matrix Data for Tab 6 (reflects selected employee(s))
  const filteredLeadMatrixData = useMemo(() => {
    return teamScorecardData.filter(r => {
      if (selectedEmployeeEmails.length > 0) {
        const isMatch = selectedEmployeeObjs.some(emp => isEmployeeMatch(r.empEmail, emp) || isEmployeeMatch(r.empName, emp));
        if (!isMatch) return false;
      }
      if (leadBreakdownFilter === 'WITH_LEADS' && r.leadsAssigned === 0) return false;
      if (leadBreakdownFilter === 'TOP_PERFORMERS') {
        const contactRate = r.contactRate !== undefined ? r.contactRate : (r.leadsAssigned > 0 ? (r.leadsTouched / r.leadsAssigned) * 100 : 0);
        if (contactRate < 50) return false;
      }
      if (leadBreakdownSearch.trim()) {
        const q = leadBreakdownSearch.toLowerCase();
        const matchName = r.empName?.toLowerCase().includes(q);
        const matchDept = r.department?.toLowerCase().includes(q);
        if (!matchName && !matchDept) return false;
      }
      return true;
    });
  }, [teamScorecardData, selectedEmployeeEmails, selectedEmployeeObjs, leadBreakdownFilter, leadBreakdownSearch]);

  const handleRefreshAll = () => {
    fetchAssignedWork();
    fetchDashboardSummaries();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('crm_trigger_delta_sync'));
    }
  };

  const phase31 = ['overview', 'scorecard', 'delegation', 'lead-data', 'pipeline'].includes(activeTab);
  const phaseScopeKey = phase31 ? JSON.stringify([tenantId, adminCompanyFilter, datePreset, startDate, endDate, selectedEmployeeEmails]) : '';
  const overviewActivitySource = employeeActivityList.length > 0 ? employeeActivityList : (metrics.employeeActivity || []);
  const overviewActivity = activeTab === 'overview' && selectedEmployeeEmails.length
    ? overviewActivitySource.filter(row => selectedEmployeeObjs.some(employee => isEmployeeMatch(row.email || row.employee, employee)))
    : overviewActivitySource;
  const phaseLoading = activeTab === 'scorecard' ? loadingSummaries || loadingAssignedWork
    : activeTab === 'delegation' ? loadingAssignedWork : loading;
  const legacyReportTheme = ['checklist', 'attendance', 'recruiter'].includes(activeTab);
  const useReportTheme = phase31 || legacyReportTheme;
  const reportLoading = legacyReportTheme && (loadingSummaries || (activeTab !== 'recruiter' && loadingAssignedWork));

  return (
    <div
      data-spc-module-theme={useReportTheme || undefined}
      data-analytics-report-theme={useReportTheme ? activeTab : undefined}
      data-analytics-phase31={phase31 ? activeTab : undefined}
      style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
    >

      {/* ========================================================================= */}
      {/* 🔝 FIXED / STICKY TOP CONTROL BAR + EXECUTIVE TABS                        */}
      {/* ========================================================================= */}
      <div className={phase31 ? 'an-phase-toolbar' : undefined} style={{
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
                  onClick={() => {
                    const myEmail = myTeamMember.email || userEmail;
                    if (myEmail) setSelectedEmployeeEmails([myEmail]);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                    border: isMyWorkSelected ? '1px solid var(--accent-color)' : '1px solid transparent',
                    backgroundColor: isMyWorkSelected ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                    color: isMyWorkSelected ? 'var(--accent-color)' : 'var(--text-primary)', cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <User size={13} /> My Work
                </button>
              )}
              <button
                onClick={() => setSelectedEmployeeEmails([])}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                  border: selectedEmployeeEmails.length === 0 ? '1px solid var(--accent-color)' : '1px solid transparent',
                  backgroundColor: selectedEmployeeEmails.length === 0 ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                  color: selectedEmployeeEmails.length === 0 ? 'var(--accent-color)' : 'var(--text-primary)', cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                <Users size={13} /> All Team
              </button>
            </div>

            {/* Searchable Employee Selector (Supports Single & Multi-Employee Selection) */}
            <div style={{ minWidth: '240px', maxWidth: '360px' }}>
              <SearchableEmployeeSelect
                employees={formattedEmployees}
                isMulti={true}
                selectedEmails={selectedEmployeeEmails}
                onMultiSelect={(selectedObjs, selectedEmailList) => {
                  setSelectedEmployeeEmails(selectedEmailList || []);
                }}
                placeholder="👥 All Team Members (Click to filter)"
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

            {/* Local DB / Delta Sync Status Badge */}
            {isSyncing ? (
              <span 
                title="Delta Sync in progress: Checking and merging recent changes..." 
                style={{ 
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem', 
                  fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-color, #3b82f6)', 
                  padding: '0.35rem 0.65rem', borderRadius: '8px', 
                  backgroundColor: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)' 
                }}
              >
                <RefreshCw size={12} className="animate-spin" />
                <span>Delta Syncing…</span>
              </span>
            ) : (
              <span 
                title="Analytics is fully synced with Local DB (IndexedDB) for instant 0ms analytics with zero network lag" 
                style={{ 
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem', 
                  fontSize: '0.72rem', fontWeight: 600, color: '#10b981', 
                  padding: '0.35rem 0.65rem', borderRadius: '8px', 
                  backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)' 
                }}
              >
                <Database size={12} />
                <span>Local DB Active</span>
              </span>
            )}

            <button
              onClick={handleRefreshAll}
              title={isSyncing ? "Syncing delta with database..." : "Refresh all metrics and sync delta"}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0.45rem 0.65rem', borderRadius: '8px',
                border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)', cursor: 'pointer'
              }}
            >
              <RefreshCw size={15} className={(loadingAssignedWork || loadingSummaries || isSyncing) ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 TAB 1: EXECUTIVE OVERVIEW (360° SUMMARY)                              */}
      {/* ========================================================================= */}
      {phase31 && phaseLoading && (
        <div className="an-report-loading" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Updating report…
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="an-phase-body">

          {/* 5 Top Core KPI Cards */}
          <div className="an-phase-kpis">
            {/* KPI 1: Assigned Leads */}
            <div className="card an-card-hover p-4 border-l-4 border-l-blue-500 flex flex-col gap-2 rounded-xl shadow-sm bg-[var(--bg-surface)]">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  {isAllTime ? '🎯 Assigned Leads' : `🎯 Leads Active (${dateFilterLabel})`}
                </span>
                <Target size={15} className="text-[var(--an-report-info)]" />
              </div>
              <div className="text-3xl font-extrabold text-[var(--text-primary)] leading-none">{kpis.total.toLocaleString('en-IN')}</div>
              <div className="text-xs flex gap-2 flex-wrap items-center">
                <span className="text-[var(--an-report-warning)] font-bold">⚡ {kpis.actionNeeded} Need Action</span>
                <span className="text-[var(--an-report-success)] font-semibold">🏆 {kpis.won} Won</span>
                {!isAllTime && <span className="text-[var(--text-secondary)] font-medium">({leads.length.toLocaleString('en-IN')} in CRM)</span>}
              </div>
              <button onClick={() => onNavigateTab?.('leads')} className="flex items-center gap-1.5 bg-transparent border-0 border-t border-[var(--border-light)] text-[var(--an-report-info)] text-xs font-semibold cursor-pointer pt-2 mt-auto hover:text-[var(--an-report-info)] transition-colors">
                Open Leads <ArrowRight size={11} />
              </button>
            </div>

            {/* KPI 2: Follow-ups */}
            <div className={`card an-card-hover p-4 border-l-4 ${kpis.overdueFollowups > 0 ? 'border-l-red-500' : 'border-l-amber-500'} flex flex-col gap-2 rounded-xl shadow-sm bg-[var(--bg-surface)]`}>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">📞 Follow-ups</span>
                <CalendarClock size={15} className={kpis.overdueFollowups > 0 ? 'text-[var(--an-report-danger)]' : 'text-[var(--an-report-warning)]'} />
              </div>
              <div className="text-3xl font-extrabold text-[var(--text-primary)] leading-none">{kpis.followUps.toLocaleString('en-IN')}</div>
              <div className="text-xs flex gap-2 flex-wrap items-center">
                {kpis.overdueFollowups > 0 && <span className="text-[var(--an-report-danger)] font-bold">🚨 {kpis.overdueFollowups} Overdue</span>}
                <span className="text-[var(--an-report-warning)] font-semibold">📅 {kpis.todayFollowups} Today</span>
              </div>
              <button onClick={() => onNavigateTab?.('leads')} className="flex items-center gap-1.5 bg-transparent border-0 border-t border-[var(--border-light)] text-[var(--an-report-warning)] text-xs font-semibold cursor-pointer pt-2 mt-auto hover:text-[var(--an-report-warning)] transition-colors">
                Open Leads <ArrowRight size={11} />
              </button>
            </div>

            {/* KPI 3: Deals Won */}
            <div className="card an-card-hover p-4 border-l-4 border-l-emerald-500 flex flex-col gap-2 rounded-xl shadow-sm bg-[var(--bg-surface)]">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">🏆 Deals Won</span>
                <CheckCircle2 size={15} className="text-[var(--an-report-success)]" />
              </div>
              <div className="text-3xl font-extrabold text-[var(--text-primary)] leading-none">{kpis.won}</div>
              <div className="text-xs text-[var(--text-secondary)]">{kpis.inPipeline} in active pipeline</div>
              <button onClick={() => setActiveTab('lead-data')} className="flex items-center gap-1.5 bg-transparent border-0 border-t border-[var(--border-light)] text-[var(--an-report-success)] text-xs font-semibold cursor-pointer pt-2 mt-auto hover:text-[var(--an-report-success)] transition-colors">
                Lead Data View <ArrowRight size={11} />
              </button>
            </div>

            {/* KPI 4: Delegated Tasks */}
            <div className={`card an-card-hover p-4 border-l-4 ${delegation.overdue > 0 ? 'border-l-red-500' : 'border-l-purple-500'} flex flex-col gap-2 rounded-xl shadow-sm bg-[var(--bg-surface)]`}>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">📋 Delegated Tasks</span>
                {loadingAssignedWork ? <Loader2 size={14} className="animate-spin text-[var(--an-report-violet)]" /> : <CheckSquare size={15} className="text-[var(--an-report-violet)]" />}
              </div>
              <div className="text-3xl font-extrabold text-[var(--text-primary)] leading-none">
                {loadingAssignedWork ? '—' : delegation.total}
              </div>
              <div className="text-xs flex gap-2 flex-wrap items-center">
                <span className={delegation.overdue > 0 ? 'text-[var(--an-report-danger)] font-bold' : 'text-[var(--text-secondary)] font-medium'}>
                  {delegation.overdue > 0 ? `🚨 ${delegation.overdue} Overdue` : `⏳ ${delegation.pending + delegation.inProgress} Pending`}
                </span>
                <span className="text-[var(--an-report-success)] font-semibold">✅ {delegation.completed} Done</span>
              </div>
              <button onClick={() => setActiveTab('delegation')} className="flex items-center gap-1.5 bg-transparent border-0 border-t border-[var(--border-light)] text-[var(--an-report-violet)] text-xs font-semibold cursor-pointer pt-2 mt-auto hover:text-[var(--an-report-violet)] transition-colors">
                Task Manager <ArrowRight size={11} />
              </button>
            </div>

            {/* KPI 5: Work Health */}
            <div className={`card an-card-hover p-4 border-l-4 ${workHealthScore >= 75 ? 'border-l-emerald-500' : workHealthScore >= 45 ? 'border-l-amber-500' : 'border-l-red-500'} flex flex-col gap-2 rounded-xl shadow-sm bg-[var(--bg-surface)]`}>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">⚡ Work Health</span>
              <div className="text-3xl font-extrabold text-[var(--text-primary)] leading-none">{workHealthScore}%</div>
              <div className="w-full h-1.5 bg-[var(--border-light)] rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 rounded-full ${workHealthScore >= 75 ? 'bg-emerald-500' : workHealthScore >= 45 ? 'bg-amber-500' : 'bg-red-500'}`} 
                  style={{ width: `${workHealthScore}%` }} 
                />
              </div>
              <div className={`text-xs font-bold ${workHealthScore >= 75 ? 'text-[var(--an-report-success)]' : workHealthScore >= 45 ? 'text-[var(--an-report-warning)]' : 'text-[var(--an-report-danger)]'}`}>
                {workHealthScore >= 80 ? '🌟 Outstanding' : workHealthScore >= 50 ? '👍 On Track' : '⚠️ Needs Attention'}
              </div>
            </div>
          </div>

          {/* Action Required Banner */}
          {(kpis.overdueFollowups > 0 || kpis.todayFollowups > 0 || delegation.overdue > 0 || (checklists.pending > 0)) && (
            <div className="flex flex-wrap gap-2.5 items-center px-4.5 py-3 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-light)] shadow-sm">
              <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider shrink-0">
                ⚡ Action Required
              </span>
              {kpis.overdueFollowups > 0 && (
                <button onClick={() => onNavigateTab?.('leads')} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[var(--an-report-danger-bg)] text-[var(--an-report-danger)] border border-red-500/30 hover:bg-[var(--an-report-danger-bg)] cursor-pointer transition-colors">
                  <AlertTriangle size={12} /> {kpis.overdueFollowups} Overdue Follow-ups → Open Leads
                </button>
              )}
              {kpis.todayFollowups > 0 && (
                <button onClick={() => onNavigateTab?.('leads')} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[var(--an-report-warning-bg)] text-[var(--an-report-warning)] border border-amber-500/30 hover:bg-[var(--an-report-warning-bg)] cursor-pointer transition-colors">
                  📅 {kpis.todayFollowups} Follow-ups Due Today → Open Leads
                </button>
              )}
              {delegation.overdue > 0 && (
                <button onClick={() => setActiveTab('delegation')} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[var(--an-report-danger-bg)] text-[var(--an-report-danger)] border border-red-500/30 hover:bg-[var(--an-report-danger-bg)] cursor-pointer transition-colors">
                  🚨 {delegation.overdue} Tasks Overdue → Task Manager
                </button>
              )}
              {checklists.pending > 0 && (
                <button onClick={() => setActiveTab('checklist')} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[var(--an-report-success-bg)] text-[var(--an-report-success)] border border-emerald-500/30 hover:bg-[var(--an-report-success-bg)] cursor-pointer transition-colors">
                  ✅ {checklists.pending} Checklists Pending → Open Checklist
                </button>
              )}
            </div>
          )}

          {/* Unified Compact Operations Pulse Banner */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-light)] shadow-sm">
            {/* Pulse 1: Attendance */}
            <div className="flex flex-col gap-1.5 md:border-r md:border-[var(--border-light)] md:pr-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                  <UserCheck size={14} className="text-[var(--an-report-info)]" /> Today&apos;s Attendance
                </span>
                <span className="text-xs text-[var(--an-report-info)] font-semibold cursor-pointer hover:underline" onClick={() => setActiveTab('attendance')}>
                  View Ops →
                </span>
              </div>
              <div className="text-xl font-extrabold text-[var(--text-primary)]">
                {attendanceStats.effectivePresent} / {attendanceStats.total} Staff Active
              </div>
              <div className="text-xs flex gap-2 flex-wrap items-center">
                <span className="text-[var(--an-report-success)] font-semibold">✅ {attendanceStats.punched} Punched</span>
                <span className="text-[var(--an-report-info)] font-semibold">⚡ {attendanceStats.crmActiveOnly} CRM Active</span>
                <span className="text-[var(--an-report-danger)] font-semibold">🚫 {attendanceStats.absent} Absent</span>
              </div>
            </div>

            {/* Pulse 2: Checklist */}
            <div className="flex flex-col gap-1.5 md:border-r md:border-[var(--border-light)] md:pr-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                  <ClipboardList size={14} className="text-[var(--an-report-success)]" /> Checklist Compliance
                </span>
                <span className="text-xs text-[var(--an-report-success)] font-semibold cursor-pointer hover:underline" onClick={() => setActiveTab('checklist')}>
                  View Ops →
                </span>
              </div>
              <div className="text-xl font-extrabold text-[var(--text-primary)]">
                {dashboardSummaries.checklistSummary?.complianceRate ?? checklists.complianceRate}% Completed
              </div>
              <div className="text-xs flex gap-2 flex-wrap items-center">
                <span className="text-[var(--an-report-success)] font-semibold">✅ {dashboardSummaries.checklistSummary?.completed ?? checklists.completed} Done</span>
                <span className="text-[var(--an-report-warning)] font-semibold">⏳ {dashboardSummaries.checklistSummary?.pending ?? checklists.pending} Pending</span>
                {(dashboardSummaries.checklistSummary?.late || checklists.completedLate) > 0 && (
                  <span className="text-[var(--an-report-danger)] font-semibold">⚠️ {dashboardSummaries.checklistSummary?.late || checklists.completedLate} Late</span>
                )}
              </div>
            </div>

            {/* Pulse 3: Team Scorecard Quick Preview */}
            <div className="flex flex-col gap-1.5 md:border-r md:border-[var(--border-light)] md:pr-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Award size={14} className="text-[var(--an-report-warning)]" /> Top Reps Scoreboard
                </span>
                <span className="text-xs text-[var(--an-report-warning)] font-semibold cursor-pointer hover:underline" onClick={() => setActiveTab('scorecard')}>
                  Full Scorecard →
                </span>
              </div>
              <div className="text-xl font-extrabold text-[var(--text-primary)] truncate">
                {teamScorecardData[0]?.empName || 'Team'} 🏆 #{1}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                Score: <strong className="text-[var(--an-report-success)]">{teamScorecardData[0]?.totalScore || 0}%</strong> · {teamScorecardData[0]?.updatesCount || 0} updates logged today
              </div>
            </div>

            {/* Pulse 4: Hiring & Recruiter Hub */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Briefcase size={14} className="text-[var(--an-report-violet)]" /> Recruiter Hub
                </span>
                <span className="text-xs text-[var(--an-report-violet)] font-semibold cursor-pointer hover:underline" onClick={() => setActiveTab('recruiter')}>
                  View Talent →
                </span>
              </div>
              <div className="text-xl font-extrabold text-[var(--text-primary)]">
                {dashboardSummaries.recruitmentSummary?.openPositions || 0} Open Positions
              </div>
              <div className="text-xs flex gap-2 flex-wrap items-center">
                <span className="text-[var(--an-report-violet)] font-semibold">👥 {dashboardSummaries.recruitmentSummary?.totalCandidates || 0} Pipeline</span>
                <span className="text-[var(--an-report-info)] font-semibold">🎯 {dashboardSummaries.recruitmentSummary?.inInterview || 0} Interview</span>
                <span className="text-[var(--an-report-success)] font-semibold">🎉 {dashboardSummaries.recruitmentSummary?.hired || 0} Hired</span>
              </div>
            </div>
          </div>

          {/* Visuals: Stage Funnel & Activity Pulse */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            {/* Left 2 Columns: Leads by Stage + Communication & Pipeline vertically grouped */}
            <div className="lg:col-span-2 flex flex-col gap-5">
              {/* Leads by Stage Funnel Chart */}
              <div className="card an-card-hover p-5 rounded-xl shadow-sm bg-[var(--bg-surface)] border border-[var(--border-light)]">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="m-0 text-sm font-bold text-[var(--text-primary)]">Leads by Stage</h3>
                  <span className="text-xs text-[var(--text-secondary)]">{kpis.total.toLocaleString('en-IN')} total in scope</span>
                </div>
                <AnalyticsStageChart data={stageData} height={240} />
              </div>

              {/* Pipeline & Outreach Summary Card */}
              <div className="card an-card-hover p-4.5 flex flex-col gap-3 rounded-xl shadow-sm bg-[var(--bg-surface)] border border-[var(--border-light)]">
                <div className="flex justify-between items-center">
                  <h3 className="m-0 text-sm font-bold text-[var(--text-primary)]">Communication & Pipeline Overview</h3>
                  <span className="text-xs text-[var(--text-secondary)]">{dateFilterLabel}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { label: 'Fresh / New Leads', value: kpis.newLeads, color: '#3b82f6' },
                    { label: 'In Active Pipeline', value: kpis.inPipeline, color: '#8b5cf6' },
                    { label: 'Follow-ups Pending', value: kpis.followUps, color: '#f59e0b' },
                    { label: `WhatsApp Sent (${dateFilterLabel})`, value: loading ? '…' : metrics.whatsappStats.period, color: '#10b981' },
                  ].map(item => (
                    <div key={item.label} className="p-3 rounded-lg bg-[var(--th-bg)] border border-[var(--border-light)]">
                      <div className="text-[11px] text-[var(--text-secondary)] font-semibold mb-1 truncate">{item.label}</div>
                      <div className="text-xl font-extrabold" style={{ color: phaseInk(item.color) }}>
                        {typeof item.value === 'number' ? item.value.toLocaleString('en-IN') : item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 1 Column: Employee Activity Table */}
            <div className="card an-card-hover p-0 overflow-hidden min-w-0 rounded-xl shadow-sm bg-[var(--bg-surface)] border border-[var(--border-light)]">
              <div className="px-4 py-3 flex justify-between items-center border-b border-[var(--border-light)] bg-[var(--th-bg)]">
                <h3 className="m-0 text-sm font-bold flex items-center gap-1.5 text-[var(--text-primary)] whitespace-nowrap">
                  <Activity size={15} className="text-[var(--accent-color)]" /> Employee Activity
                </h3>
                <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">{dateFilterLabel}</span>
              </div>
              {loading ? (
                <div className="p-8 text-center text-[var(--text-secondary)]">
                  <Loader2 size={22} className="animate-spin inline-block" />
                </div>
              ) : (
                <AnalyticsPhaseTable table={PHASE31_TABLES.overview}
                  rows={overviewActivity}
                  resetKey={phaseScopeKey} empty={`No activity recorded for ${dateFilterLabel.toLowerCase()}.`}
                  renderRow={(act, i) => (
                    <tr key={act.employee} className="border-b border-[var(--border-light)] hover:bg-[var(--th-bg)] transition-colors">
                      <td className="px-3 py-2 text-[var(--text-primary)] max-w-[160px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold" style={phaseAvatar(COLORS[i % COLORS.length])}>
                            {act.employee.substring(0, 2).toUpperCase()}
                          </div>
                          <span className="font-medium truncate" title={act.employee}>{act.employee}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center font-bold text-[var(--text-primary)] whitespace-nowrap min-w-[65px]">{act.uniqueLeads}</td>
                      <td className="px-3 py-2 text-right font-bold text-[var(--accent-color)] whitespace-nowrap min-w-[70px]">{act.actions}</td>
                    </tr>
                  )}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🏆 TAB 2: TEAM SCORECARD & LEADERBOARD (SCORING DASHBOARD)                */}
      {/* ========================================================================= */}
      {activeTab === 'scorecard' && (
        <div className="an-phase-body">
          {/* Header Banner */}
          <div className="flex justify-between items-center flex-wrap gap-4 bg-[var(--bg-surface)] p-4.5 rounded-xl border border-[var(--border-light)] shadow-sm">
            <div>
              <h3 className="m-0 text-lg font-bold flex items-center gap-2 text-[var(--text-primary)]">
                <Award size={22} className="text-[var(--an-report-warning)]" /> Team Performance Scorecard & Leaderboard
              </h3>
              <p className="mt-1 mb-0 text-xs text-[var(--text-secondary)]">
                Multi-process operational index (100 pts max) across Calling/Recruitment (30 pts), Follow-up Adherence (25 pts), Daily Checklists (20 pts), Delegation Tasks (15 pts), and Attendance (10 pts).
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Role filter buttons */}
              <div className="an-phase-filters flex gap-1.5 bg-[var(--bg-primary)] p-1 rounded-lg border border-[var(--border-light)]" role="group" aria-label="Filter scorecard by role">
                {[
                  { key: 'ALL', label: 'All Roles', count: teamScorecardData.length },
                  { key: 'SALES', label: '📞 Sales & Calls', count: teamScorecardData.filter(s => s.roleCategory === 'SALES').length },
                  { key: 'RECRUITER', label: '🧑‍💼 Recruiter & HR', count: teamScorecardData.filter(s => s.roleCategory === 'RECRUITER').length },
                  { key: 'OPERATIONS', label: '⚙️ Operations', count: teamScorecardData.filter(s => s.roleCategory === 'OPERATIONS').length }
                ].map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={scorecardDeptFilter === tab.key}
                    onClick={() => setScorecardDeptFilter(tab.key)}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-all duration-150 ${
                      scorecardDeptFilter === tab.key
                        ? 'bg-blue-500/10 text-[var(--accent-color,#2563eb)] font-bold border border-[var(--accent-color,#2563eb)]/30 shadow-xs'
                        : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
                    }`}
                  >
                    {tab.label} <span className="opacity-80 text-[11px]">({tab.count})</span>
                  </button>
                ))}
              </div>

              {/* Search Box */}
              <div className="relative w-56">
                <input
                  type="text"
                  aria-label="Search executive or department"
                  placeholder="Search executive or dept..."
                  value={scorecardSearch}
                  onChange={(e) => setScorecardSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border-light)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                />
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Top 3 Podium Highlights (Strictly Verified Active Performers) */}
          {activePodiumWinners.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activePodiumWinners.map((rep, idx) => (
                <div
                  key={rep.empEmail}
                  className="card an-card-hover p-4.5 cursor-pointer rounded-xl bg-[var(--bg-surface)] shadow-sm relative overflow-hidden transition-all"
                  onClick={() => setSelectedEmployeeEmails([rep.empEmail])}
                  style={{
                    borderTop: idx === 0 ? '4px solid #f59e0b' : idx === 1 ? '4px solid #94a3b8' : '4px solid #b45309'
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-sm shrink-0 ${
                        idx === 0 ? 'bg-[var(--an-report-warning-bg)] text-[var(--an-report-warning)] border border-amber-500/30' : idx === 1 ? 'bg-[var(--an-report-neutral-bg)] text-[var(--an-report-muted)] border border-slate-500/30' : 'bg-[var(--an-report-warning-bg)] text-[var(--an-report-warning)] border border-orange-500/30'
                      }`}>
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="m-0 text-sm font-bold text-[var(--text-primary)]">{rep.empName}</h4>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            rep.roleCategory === 'RECRUITER' ? 'bg-[var(--an-report-violet-bg)] text-[var(--an-report-violet)] border-purple-500/25' : rep.roleCategory === 'SALES' ? 'bg-[var(--an-report-info-bg)] text-[var(--an-report-info)] border-blue-500/25' : 'bg-[var(--an-report-neutral-bg)] text-[var(--an-report-muted)] border-slate-500/25'
                          }`}>
                            {rep.roleCategory === 'RECRUITER' ? 'Recruiter' : rep.roleCategory === 'SALES' ? 'Sales' : 'Ops'}
                          </span>
                        </div>
                        <span className="text-xs text-[var(--text-secondary)]">{rep.department} · {rep.designation}</span>
                      </div>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: rep.tierBg, color: phaseInk(rep.tierColor) }}>
                      {rep.tierLabel}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1.5 mt-3.5 mb-2">
                    <span className="text-3xl font-extrabold leading-none text-[var(--text-primary)]">{rep.totalScore}%</span>
                    <span className="text-xs text-[var(--text-secondary)]">Performance Index</span>
                  </div>

                  <div className="w-full h-1.5 bg-[var(--border-light)] rounded-full overflow-hidden mb-3">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${rep.totalScore}%`, backgroundColor: rep.tierColor }} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2.5 border-t border-[var(--border-light)]">
                    <div>
                      <span className="text-[10px] uppercase text-[var(--text-secondary)] block">{rep.primaryProcess.name}</span>
                      <strong className="text-[var(--text-primary)]">{rep.primaryProcess.metricText || rep.primaryProcess.metric || 'No Activity'}</strong>
                      <span className="text-[var(--text-secondary)] ml-1">({rep.primaryProcess.score}/{rep.primaryProcess.max}p)</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-[var(--text-secondary)] block">{rep.followupProcess.name}</span>
                      <strong className="text-[var(--text-primary)]">{rep.followupProcess.metricText || rep.followupProcess.metric}</strong>
                      <span className="text-[var(--text-secondary)] ml-1">({rep.followupProcess.score}/{rep.followupProcess.max}p)</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-[var(--text-secondary)] block">Checklists</span>
                      <strong className="text-[var(--text-primary)]">{rep.checklistProcess.applicable ? (rep.checklistProcess.metricText || rep.checklistProcess.metric) : 'Exempt'}</strong>
                      <span className="text-[var(--text-secondary)] ml-1">({rep.checklistProcess.score}/{rep.checklistProcess.max}p)</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-[var(--text-secondary)] block">Tasks</span>
                      <strong className="text-[var(--text-primary)]">{rep.taskProcess.applicable ? (rep.taskProcess.metricText || rep.taskProcess.metric) : 'Exempt'}</strong>
                      <span className="text-[var(--text-secondary)] ml-1">({rep.taskProcess.score}/{rep.taskProcess.max}p)</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] uppercase text-[var(--text-secondary)] block">Attendance</span>
                      <strong className="text-[var(--text-primary)]">{rep.attendanceProcess.metricText || rep.attendanceProcess.metric}</strong>
                      <span className="text-[var(--text-secondary)] ml-1">({rep.attendanceProcess.score}/{rep.attendanceProcess.max}p)</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card an-card-hover p-5 text-center bg-[var(--bg-surface)] border border-dashed border-[var(--border-light)] rounded-xl">
              <div className="inline-flex p-2.5 rounded-full bg-[var(--an-report-warning-bg)] text-[var(--an-report-warning)] mb-2">
                <Clock size={24} />
              </div>
              <h4 className="m-0 mb-1 text-sm font-bold text-[var(--text-primary)]">Live Shift In Progress — Scoring Active</h4>
              <p className="m-0 text-xs text-[var(--text-secondary)] max-w-lg mx-auto">
                Executives are actively clocking in, updating CRM leads, candidate pipelines, and fulfilling checklist slots. As operational actions are recorded today, top performers will automatically take the podium!
              </p>
            </div>
          )}

          {/* Full Leaderboard Table with Process Performance Breakdown */}
          <div className="card an-card-hover p-0 overflow-hidden rounded-xl border border-[var(--border-light)] bg-[var(--bg-surface)] shadow-sm">
            <div className="px-4.5 py-3 border-b border-[var(--border-light)] bg-[var(--th-bg)] flex justify-between items-center flex-wrap gap-2">
              <div>
                <h4 className="m-0 text-sm font-bold text-[var(--text-primary)]">
                  Process-Wise Performance Leaderboard ({filteredScorecard.length})
                </h4>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Transparent scoring breakdown: Calling/Leads (30p) + Recruiter (30p) + Follow-up/Requisitions (25p) + Checklists (20p) + Delegation (15p) + Attendance (10p)
                </div>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Click any executive row to filter dashboard</span>
            </div>

            <AnalyticsPhaseTable table={PHASE31_TABLES.scorecard} rows={filteredScorecard}
              resetKey={JSON.stringify([phaseScopeKey, scorecardDeptFilter, scorecardSearch])}
              empty={phaseLoading ? 'Loading team performance…' : 'No team members found matching the selected filter.'}
              renderRow={(row, idx) => {
                const isSelected = selectedEmployeeEmails.some(e => e.toLowerCase() === (row.empEmail || '').toLowerCase());
                return (
                  <tr
                    key={row.empEmail}
                    onClick={() => {
                      const target = (row.empEmail || '').toLowerCase();
                      if (selectedEmployeeEmails.length === 1 && selectedEmployeeEmails[0].toLowerCase() === target) {
                        setSelectedEmployeeEmails([]);
                      } else {
                        setSelectedEmployeeEmails([row.empEmail]);
                      }
                    }}
                    className={`border-b border-[var(--border-light)] cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? 'bg-[var(--table-row-selected,var(--th-filtered-bg))] border-l-[3px] border-l-[var(--accent-color)] active-row'
                        : `${idx % 2 === 0 ? 'bg-[var(--table-row-odd,var(--bg-surface))]' : 'bg-[var(--table-row-even,var(--bg-primary))]'} border-l-[3px] border-l-transparent hover:bg-[var(--th-bg)]`
                    }`}
                  >
                    {/* Rank */}
                    <td className={`text-center px-2 py-2.5 font-extrabold ${idx < 3 && row.totalScore > 0 ? 'text-[var(--an-report-warning)]' : 'text-[var(--text-secondary)]'}`}>
                      {row.totalScore > 0 ? `#${idx + 1}` : '—'}
                    </td>

                    {/* Executive & Role */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div
                        className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold"
                        style={phaseAvatar(COLORS[idx % COLORS.length])}
                        >
                          {row.empName.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-[var(--text-primary)]">{row.empName}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                              row.roleCategory === 'RECRUITER' ? 'bg-[var(--an-report-violet-bg)] text-[var(--an-report-violet)] border-purple-500/25' : row.roleCategory === 'SALES' ? 'bg-[var(--an-report-info-bg)] text-[var(--an-report-info)] border-blue-500/25' : 'bg-[var(--an-report-neutral-bg)] text-[var(--an-report-muted)] border-slate-500/25'
                            }`}>
                              {row.roleCategory === 'RECRUITER' ? 'Recruiter' : row.roleCategory === 'SALES' ? 'Sales' : 'Operations'}
                            </span>
                            {row.leadsAssigned > 0 && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[var(--th-bg)] text-[var(--text-secondary)]">
                                {row.leadsAssigned.toLocaleString('en-IN')} Leads
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)]">
                            {row.department} · {row.designation}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Overall Score */}
                    <td className="text-center px-2 py-2.5">
                      <div className="text-base font-extrabold leading-none" style={{ color: phaseInk(row.tierColor) }}>
                        {row.totalScore}%
                      </div>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-block mt-1"
                        style={{ backgroundColor: row.tierBg, color: phaseInk(row.tierColor) }}
                      >
                        {row.tierLabel}
                      </span>
                    </td>

                    {/* Leads Touched & Calling Score */}
                    <td className="text-center px-2.5 py-2.5">
                      <div className={`text-sm font-extrabold ${row.leadsTouched > 0 ? 'text-[var(--accent-color,#2563eb)]' : 'text-[var(--text-secondary)]'}`}>
                        {row.leadsTouched > 0 ? row.leadsTouched.toLocaleString('en-IN') : (row.updatesCount > 0 ? '0' : '—')}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        {row.callingProcess?.applicable
                          ? `${row.callingProcess.score} / 30 pts · ${row.leadsAssigned > 0 ? `${row.leadsAssigned.toLocaleString('en-IN')} assigned` : (row.updatesCount > 0 ? `${row.updatesCount} updates` : '0 assigned')}`
                          : 'Exempt (No leads)'}
                      </div>
                    </td>

                    {/* Recruiter & Hiring Pipeline (30p) */}
                    <td className="px-2.5 py-2.5">
                      <div className="font-semibold text-[var(--text-primary)] text-xs">
                        {row.recruiterProcess?.applicable ? (row.recruiterProcess.metricText || 'No Candidates') : 'Exempt (Not a Recruiter)'}
                      </div>
                      <div className={`text-[11px] font-semibold ${row.recruiterProcess?.applicable && row.recruiterProcess.score > 0 ? 'text-[var(--accent-color,#2563eb)]' : 'text-[var(--text-secondary)]'}`}>
                        {row.recruiterProcess?.applicable ? `${row.recruiterProcess.score} / ${row.recruiterProcess.max || 30} pts` : 'Exempt (Not scored)'}
                      </div>
                    </td>

                    {/* Follow-up / Requisitions */}
                    <td className="px-2.5 py-2.5">
                      <div className={`font-semibold text-xs ${row.overdueFollowups > 0 ? 'text-[var(--an-report-danger)]' : 'text-[var(--text-primary)]'}`}>
                        {row.followupProcess.metricText || row.followupProcess.metric}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] font-semibold">
                        {row.followupProcess.score} / {row.followupProcess.max} pts
                      </div>
                    </td>

                    {/* Checklists */}
                    <td className="px-2.5 py-2.5">
                      <div className="font-semibold text-[var(--text-primary)] text-xs">
                        {row.checklistProcess.applicable ? (row.checklistProcess.metricText || row.checklistProcess.metric) : 'Exempt (No slots)'}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] font-semibold">
                        {row.checklistProcess.applicable ? `${row.checklistProcess.score} / ${row.checklistProcess.max} pts` : 'Exempt (Not scored)'}
                      </div>
                    </td>

                    {/* Tasks */}
                    <td className="px-2.5 py-2.5">
                      <div className="font-semibold text-[var(--text-primary)] text-xs">
                        {row.taskProcess.applicable ? (row.taskProcess.metricText || row.taskProcess.metric) : 'Exempt (No tasks)'}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] font-semibold">
                        {row.taskProcess.applicable ? `${row.taskProcess.score} / ${row.taskProcess.max} pts` : 'Exempt (Not scored)'}
                      </div>
                    </td>

                    {/* Attendance */}
                    <td className="px-2.5 py-2.5">
                      <div className="font-semibold text-[var(--text-primary)] text-xs">
                        {row.attendanceProcess.metricText || row.attendanceProcess.metric}
                      </div>
                      <div className={`text-[11px] font-semibold ${row.attendanceProcess.score >= 7 ? 'text-[var(--an-report-success)]' : 'text-[var(--text-secondary)]'}`}>
                        {row.attendanceProcess.score} / {row.attendanceProcess.max} pts
                      </div>
                    </td>
                  </tr>
                );
              }}
            />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📋 TAB 3: DELEGATION TASKS DASHBOARD                                      */}
      {/* ========================================================================= */}
      {activeTab === 'delegation' && (
        <div className="an-phase-body">
          {/* Header Metric Cards */}
          <div className="an-phase-kpis">
            <div className="card an-card-hover p-4 border-l-4 border-l-purple-500 rounded-xl bg-[var(--bg-surface)] shadow-sm">
              <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Total Tasks</div>
              <div className="text-3xl font-extrabold text-[var(--text-primary)] my-1 leading-none">{delegation.total}</div>
              <div className="text-xs text-[var(--text-secondary)]">In current scope</div>
            </div>

            <div className="card an-card-hover p-4 border-l-4 border-l-blue-500 rounded-xl bg-[var(--bg-surface)] shadow-sm">
              <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">In Progress / Active</div>
              <div className="text-3xl font-extrabold text-[var(--an-report-info)] my-1 leading-none">
                {delegation.active !== undefined ? delegation.active : Math.max(0, delegation.total - delegation.completed)}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                {(delegation.inProgress || 0)} In-Progress · {(delegation.pending || 0)} Pending{(delegation.submitted ? ` · ${delegation.submitted} Review` : '')}{(delegation.reopened ? ` · ${delegation.reopened} Reopened` : '')}
              </div>
            </div>

            <div className="card an-card-hover p-4 border-l-4 border-l-emerald-500 rounded-xl bg-[var(--bg-surface)] shadow-sm">
              <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Completed</div>
              <div className="text-3xl font-extrabold text-[var(--an-report-success)] my-1 leading-none">{delegation.completed}</div>
              <div className="text-xs text-[var(--an-report-success)] font-semibold">
                {delegation.total > 0 ? `${Math.round((delegation.completed / delegation.total) * 100)}% Done` : '0%'}
              </div>
            </div>

            <div className={`card an-card-hover p-4 border-l-4 ${delegation.overdue > 0 ? 'border-l-red-500' : 'border-l-emerald-500'} rounded-xl bg-[var(--bg-surface)] shadow-sm`}>
              <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Overdue Tasks</div>
              <div className={`text-3xl font-extrabold my-1 leading-none ${delegation.overdue > 0 ? 'text-[var(--an-report-danger)]' : 'text-[var(--an-report-success)]'}`}>{delegation.overdue}</div>
              <div className={`text-xs font-semibold ${delegation.overdue > 0 ? 'text-[var(--an-report-danger)]' : 'text-[var(--an-report-success)]'}`}>
                {delegation.overdue > 0 ? 'Action required' : 'All on time'}
              </div>
            </div>

            <div className="card an-card-hover p-4 border-l-4 border-l-amber-500 rounded-xl bg-[var(--bg-surface)] shadow-sm">
              <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Priority Split</div>
              <div className="text-xs flex flex-col gap-1 mt-2">
                <span className="text-[var(--an-report-danger)] font-bold">🔴 High: {delegation.priorityBreakdown?.high || 0}</span>
                <span className="text-[var(--an-report-warning)] font-semibold">🟡 Medium: {delegation.priorityBreakdown?.medium || 0}</span>
                <span className="text-[var(--an-report-success)] font-semibold">🟢 Low: {delegation.priorityBreakdown?.low || 0}</span>
              </div>
            </div>
          </div>

          {/* Task List Table */}
          <div className="card an-card-hover p-0 overflow-hidden rounded-xl border border-[var(--border-light)] bg-[var(--bg-surface)] shadow-sm">
            <div className="px-4.5 py-3 border-b border-[var(--border-light)] bg-[var(--th-bg)] flex justify-between items-center flex-wrap gap-2">
              <div>
                <h4 className="m-0 text-sm font-bold text-[var(--text-primary)]">Recent Delegated Tasks ({delegationTasksList.length})</h4>
                <span className="text-xs text-[var(--text-secondary)]">Status & Deadline Tracking</span>
              </div>

              <div className="an-phase-filters flex items-center gap-2">
                <input
                  type="text"
                  aria-label="Filter tasks"
                  placeholder="Filter tasks..."
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border-light)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                />
                <button
                  onClick={() => onNavigateTab?.('delegation')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--an-report-info-bg)] text-[var(--accent-color,#2563eb)] border border-[var(--accent-color,#2563eb)]/30 cursor-pointer hover:bg-[var(--an-report-info-bg)] transition-colors shadow-xs"
                >
                  Open Task Manager <ArrowRight size={12} />
                </button>
              </div>
            </div>

            <AnalyticsPhaseTable table={PHASE31_TABLES.delegation} rows={delegationTasksList}
              resetKey={JSON.stringify([phaseScopeKey, taskSearch])}
              empty={loadingAssignedWork ? 'Loading tasks…' : 'No tasks found for this scope.'}
              renderRow={task => (
                <tr key={task.id} className="border-b border-[var(--border-light)] hover:bg-[var(--th-bg)] transition-colors">
                  <td className="px-3.5 py-2.5">
                    <div className="font-bold text-[var(--text-secondary)] text-xs">
                      {task.task_code || '—'}
                    </div>
                    {task.tenant_code && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--th-bg)] text-[var(--text-secondary)] mt-0.5 inline-block border border-[var(--border-light)]">
                        {task.tenant_code}
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 font-semibold text-[var(--text-primary)]">{task.title}</td>
                  <td className="text-center px-2.5 py-2.5">
                    <span className="an-report-status an-phase-badge"
                      data-an-tone={['HIGH', 'URGENT'].includes(task.priority) ? 'danger' : task.priority === 'MEDIUM' ? 'warning' : 'success'}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-[var(--text-secondary)]">{task.assigned_to_name || task.assigned_to_email}</td>
                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                    {task.deadline ? new Date(task.deadline).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    {task.is_overdue && <span className="an-report-status an-phase-badge ml-1.5" data-an-tone="danger">Overdue</span>}
                  </td>
                  <td className="text-center px-2.5 py-2.5">
                    <span className="an-report-status an-phase-badge" data-an-tone={TASK_STATUS_TONES[task.status]}>
                      {(task.status || '').replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              )}
            />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ✅ TAB 4: DAILY CHECKLISTS DASHBOARD                                      */}
      {/* ========================================================================= */}
      {reportLoading && (
        <div className="an-report-loading" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading report…
        </div>
      )}
      {activeTab === 'checklist' && (
        <div className="flex flex-col gap-5">
          {/* Header Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="card an-card-hover p-4 border-l-4 border-l-[var(--an-report-success)] rounded-xl bg-[var(--bg-surface)] shadow-sm">
              <div className="text-[11px] font-bold text-[var(--an-report-muted)] uppercase tracking-wider">Scheduled Slots</div>
              <div className="text-3xl font-extrabold text-[var(--text-primary)] my-1 leading-none">
                {checklistAggregates.assignedTotal}
              </div>
              <div className="text-xs text-[var(--an-report-muted)]">
                {checklistAggregates.distinctSlots} unique slot templates{checklistAggregates.workingDays > 1 ? ` · ${checklistAggregates.workingDays} working days` : ''}
              </div>
            </div>

            <div className="card an-card-hover p-4 border-l-4 border-l-[var(--an-report-success)] rounded-xl bg-[var(--bg-surface)] shadow-sm">
              <div className="text-[11px] font-bold text-[var(--an-report-muted)] uppercase tracking-wider">Completed</div>
              <div className="text-3xl font-extrabold text-[var(--an-report-success)] my-1 leading-none">
                {checklistAggregates.completedTotal}
              </div>
              <div className="text-xs text-[var(--an-report-success)] font-semibold">
                {checklistAggregates.compliance}% Compliance
              </div>
            </div>

            <div className="card an-card-hover p-4 border-l-4 border-l-[var(--an-report-warning)] rounded-xl bg-[var(--bg-surface)] shadow-sm">
              <div className="text-[11px] font-bold text-[var(--an-report-muted)] uppercase tracking-wider">Pending Slots</div>
              <div className="text-3xl font-extrabold text-[var(--an-report-warning)] my-1 leading-none">
                {checklistAggregates.pendingTotal}
              </div>
              <div className="text-xs text-[var(--an-report-warning)] font-semibold">Awaiting submission</div>
            </div>

            <div className="card an-card-hover p-4 border-l-4 border-l-[var(--an-report-danger)] rounded-xl bg-[var(--bg-surface)] shadow-sm">
              <div className="text-[11px] font-bold text-[var(--an-report-muted)] uppercase tracking-wider">Completed Late</div>
              <div className={`text-3xl font-extrabold my-1 leading-none ${checklistAggregates.completedLate > 0 ? 'text-[var(--an-report-danger)]' : 'text-[var(--an-report-success)]'}`}>
                {checklistAggregates.completedLate}
              </div>
              <div className="text-xs text-[var(--an-report-muted)]">Past deadline cutoff</div>
            </div>
          </div>

          {/* Checklist Dual View Selector & Actions */}
          <div className="card an-card-hover p-0 overflow-hidden rounded-xl border border-[var(--border-light)] bg-[var(--bg-surface)] shadow-sm">
            <div className="px-4.5 py-3 border-b border-[var(--border-light)] bg-[var(--th-bg)] flex justify-between items-center flex-wrap gap-2.5">
              {/* Toggle: By Employee vs By Slots */}
              <div className="flex items-center gap-2">
                <div className="flex bg-[var(--bg-primary)] p-1 rounded-lg border border-[var(--border-light)]">
                  <button
                    onClick={() => setChecklistViewMode('BY_EMPLOYEE')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all duration-150 ${
                      checklistViewMode === 'BY_EMPLOYEE'
                        ? 'bg-[var(--an-report-info-bg)] text-[var(--an-report-accent)] font-bold border border-[var(--accent-color,#2563eb)]/30 shadow-xs'
                        : 'bg-transparent text-[var(--text-primary)] hover:bg-[var(--th-bg)] border border-transparent'
                    }`}
                  >
                    <Users size={13} /> Team Status ({employeeChecklistMatrix.length})
                  </button>
                  <button
                    onClick={() => setChecklistViewMode('BY_SLOTS')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all duration-150 ${
                      checklistViewMode === 'BY_SLOTS'
                        ? 'bg-[var(--an-report-info-bg)] text-[var(--an-report-accent)] font-bold border border-[var(--accent-color,#2563eb)]/30 shadow-xs'
                        : 'bg-transparent text-[var(--text-primary)] hover:bg-[var(--th-bg)] border border-transparent'
                    }`}
                  >
                    <ClipboardList size={13} /> All Slots ({checklistItemsList.length})
                  </button>
                </div>
              </div>

              {/* Search & Direct Link */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={checklistViewMode === 'BY_EMPLOYEE' ? "Search team member..." : "Filter checklist title..."}
                  value={checklistSearch}
                  onChange={(e) => setChecklistSearch(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border-light)] bg-[var(--bg-primary)] text-[var(--text-primary)] min-w-[180px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                />
                <button
                  onClick={() => onNavigateTab?.('checklist')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--an-report-success-bg)] text-[var(--an-report-success)]  border border-[var(--an-report-success-line)] cursor-pointer hover:bg-[var(--an-report-success-bg)] transition-colors shadow-xs"
                >
                  Open Checklist Module <ArrowRight size={12} />
                </button>
              </div>
            </div>

            {/* VIEW 1: Team Members Checklist Status Matrix */}
            {checklistViewMode === 'BY_EMPLOYEE' && (
              <div className="overflow-auto max-h-[calc(100vh-280px)] an-report-table-scroll w-full relative">
                <MobileTableView id="AnalyticsDashboard-4" hideToggle><table className="w-full min-w-[760px] border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 z-10 bg-[var(--th-bg)]">
                    <tr className="bg-[var(--th-bg)]">
                      <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] text-[11px] font-semibold whitespace-nowrap">Staff Member</th>
                      <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] text-[11px] font-semibold whitespace-nowrap">Department</th>
                      <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3 py-2.5 text-[var(--an-report-muted)] text-[11px] font-semibold whitespace-nowrap">Assigned Slots</th>
                      <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3 py-2.5 text-[var(--an-report-muted)] text-[11px] font-semibold whitespace-nowrap">Completed</th>
                      <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3 py-2.5 text-[var(--an-report-muted)] text-[11px] font-semibold whitespace-nowrap">Pending</th>
                      <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3.5 py-2.5 text-[var(--an-report-muted)] text-[11px] font-semibold whitespace-nowrap min-w-[120px]">Compliance</th>
                      <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3 py-2.5 text-[var(--an-report-muted)] text-[11px] font-semibold whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!filteredEmployeeChecklist.length && !reportLoading && (
                      <tr><td colSpan={7} className="an-report-empty">No team members match the selected filters.</td></tr>
                    )}
                    {filteredEmployeeChecklist.map((row, idx) => (
                      <tr
                        key={row.empEmail}
                        onClick={() => {
                          const target = (row.empEmail || '').toLowerCase();
                          if (selectedEmployeeEmails.length === 1 && selectedEmployeeEmails[0].toLowerCase() === target) {
                            setSelectedEmployeeEmails([]);
                          } else {
                            setSelectedEmployeeEmails([row.empEmail]);
                          }
                        }}
                        className={`border-b border-[var(--border-light)] cursor-pointer transition-colors ${
                          selectedEmployeeEmails.some(e => e.toLowerCase() === (row.empEmail || '').toLowerCase())
                            ? 'bg-[var(--th-bg)]'
                            : 'hover:bg-[var(--th-bg)]'
                        }`}
                      >
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-7 h-7 rounded-full shrink-0 text-white flex items-center justify-center text-[10px] font-bold"
                              style={{ backgroundColor: `color-mix(in srgb, ${COLORS[idx % COLORS.length]} 37%, #171822)` }}
                            >
                              {row.empName.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-[var(--text-primary)]">{row.empName}</div>
                              <div className="text-[11px] text-[var(--an-report-muted)]">{row.empEmail}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-[var(--an-report-muted)]">{row.department}</td>
                        <td className="text-center px-2.5 py-2.5">
                          <div className="font-bold text-[var(--text-primary)]">{row.total}</div>
                          {row.workingDays > 1 && (
                            <div className="text-[10px] text-[var(--an-report-muted)]">{row.totalPerDay}/day</div>
                          )}
                        </td>
                        <td className="text-center px-2.5 py-2.5 font-bold text-[var(--an-report-success)]">{row.completed}</td>
                        <td className={`text-center px-2.5 py-2.5 font-bold ${row.pending > 0 ? 'text-[var(--an-report-warning)]' : 'text-[var(--an-report-success)]'}`}>
                          {row.pending > 0 ? row.pending : '0'}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-[var(--border-light)] rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${row.rate === 100 ? 'bg-[var(--an-report-success)]' : row.rate > 0 ? 'bg-[var(--an-report-info)]' : 'bg-[var(--an-report-warning)]'}`} style={{ width: `${row.rate}%` }} />
                            </div>
                            <span className="text-[11px] font-bold min-w-[32px]">{row.rate}%</span>
                          </div>
                        </td>
                        <td className="text-center px-2.5 py-2.5">
                          <span
                            className="an-report-status text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{ '--an-status-color': row.statusColor }}
                          >
                            {row.statusLabel}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></MobileTableView>
              </div>
            )}

            {/* VIEW 2: Scheduled Slots Details */}
            {checklistViewMode === 'BY_SLOTS' && (
              <div className="overflow-auto max-h-[calc(100vh-280px)] an-report-table-scroll w-full relative">
                {checklistItemsList.length === 0 ? (
                  <div className="p-8 text-center text-[var(--an-report-muted)] text-xs">
                    No checklist slots scheduled for today.
                  </div>
                ) : (
                  <MobileTableView id="AnalyticsDashboard-5" hideToggle><table className="w-full min-w-[760px] border-separate border-spacing-0 text-xs">
                    <thead className="sticky top-0 z-10 bg-[var(--th-bg)]">
                      <tr className="bg-[var(--th-bg)]">
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] text-[11px] font-semibold whitespace-nowrap">Slot ID</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] text-[11px] font-semibold whitespace-nowrap">Checklist Title</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] text-[11px] font-semibold whitespace-nowrap">Department</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] text-[11px] font-semibold whitespace-nowrap">Assigned To</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3 py-2.5 text-[var(--an-report-muted)] text-[11px] font-semibold whitespace-nowrap">Due Time</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3 py-2.5 text-[var(--an-report-muted)] text-[11px] font-semibold whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checklistItemsList.map((item, idx) => (
                        <tr key={item.id + (item.slot_id || '') + idx} className="border-b border-[var(--border-light)] hover:bg-[var(--th-bg)] transition-colors">
                          <td className="px-3.5 py-2.5 font-bold text-[var(--an-report-accent)] text-xs whitespace-nowrap">
                            {item.slot_id || `Slot ${idx + 1}`}
                          </td>
                          <td className="px-3.5 py-2.5 font-semibold text-[var(--text-primary)]">
                            {item.title || item.base_title || 'Daily Operational Checklist'}
                          </td>
                          <td className="px-3.5 py-2.5 text-[var(--an-report-muted)]">
                            {item.department || 'General'}
                          </td>
                          <td className="px-3.5 py-2.5 text-[var(--an-report-muted)] text-[11px]">
                            {item.assigned_type === 'ALL' ? '👥 All Team Staff' : (item.assigned_employee_email || 'General Staff')}
                          </td>
                          <td className="text-center px-2.5 py-2.5 font-semibold whitespace-nowrap">
                            ⏰ {item.due_time || '18:00'}
                          </td>
                          <td className="text-center px-2.5 py-2.5">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              item.status === 'COMPLETED' ? 'bg-[var(--an-report-success-bg)] text-[var(--an-report-success)]' : item.status === 'PARTIAL' ? 'bg-[var(--an-report-warning-bg)] text-[var(--an-report-warning)]' : 'bg-[var(--an-report-danger-bg)] text-[var(--an-report-danger)]'
                            }`}>
                              {item.status === 'COMPLETED' ? (item.isDelayed ? '✅ Done (Late)' : '✅ Completed') : '⏳ Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></MobileTableView>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🏢 TAB 5: ATTENDANCE OPS DASHBOARD                                       */}
      {/* ========================================================================= */}
      {/* 🎯 TAB 5: ATTENDANCE & TEAM ACTIVITY STATUS                               */}
      {/* ========================================================================= */}
      {activeTab === 'attendance' && (
        <div className="flex flex-col gap-5">
          {/* Header Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card an-card-hover p-4 border-l-4 border-[var(--an-report-info)] rounded-xl bg-[var(--bg-surface)] border-t border-r border-b border-[var(--border-light)] shadow-sm">
              <div className="text-[0.72rem] font-bold text-[var(--an-report-muted)] uppercase tracking-wider">Approved Staff</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] my-1">{attendanceStats.total}</div>
              <div className="text-xs text-[var(--an-report-muted)]">Active team members</div>
            </div>

            <div className="card an-card-hover p-4 border-l-4 border-[var(--an-report-success)] rounded-xl bg-[var(--bg-surface)] border-t border-r border-b border-[var(--border-light)] shadow-sm">
              <div className="text-[0.72rem] font-bold text-[var(--an-report-muted)] uppercase tracking-wider">
                {isAttendanceRange ? 'Period Presence Rate' : 'Effective Present'}
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[var(--an-report-success)] my-1">
                {isAttendanceRange ? `${attendanceStats.effectivePercent}%` : attendanceStats.effectivePresent}
              </div>
              <div className="text-xs text-[var(--an-report-success)]  font-semibold">
                {isAttendanceRange ? `${attendanceStats.totalPresentLogs || 0} Total Present Logs` : `${attendanceStats.effectivePercent}% Presence Rate`}
              </div>
            </div>

            <div className="card an-card-hover p-4 border-l-4 border-[var(--an-report-info)] rounded-xl bg-[var(--bg-surface)] border-t border-r border-b border-[var(--border-light)] shadow-sm">
              <div className="text-[0.72rem] font-bold text-[var(--an-report-muted)] uppercase tracking-wider">
                {isAttendanceRange ? 'Working Days in Period' : '⚡ Active on CRM'}
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[var(--an-report-info)]  my-1">
                {isAttendanceRange ? `${attendanceWorkingDays} Days` : attendanceStats.crmActiveOnly}
              </div>
              <div className="text-xs text-[var(--an-report-muted)]">
                {isAttendanceRange ? 'Mon–Sat in selected period' : 'Working without punch'}
              </div>
            </div>

            <div className="card an-card-hover p-4 border-l-4 border-[var(--an-report-danger)] rounded-xl bg-[var(--bg-surface)] border-t border-r border-b border-[var(--border-light)] shadow-sm">
              <div className="text-[0.72rem] font-bold text-[var(--an-report-muted)] uppercase tracking-wider">
                {isAttendanceRange ? 'Active Punched Staff' : 'Absent'}
              </div>
              <div className={`text-2xl sm:text-3xl font-extrabold my-1 ${isAttendanceRange ? 'text-[var(--an-report-success)] ' : (attendanceStats.absent > 0 ? 'text-[var(--an-report-danger)] ' : 'text-[var(--an-report-success)] ')}`}>
                {isAttendanceRange ? `${attendanceStats.punched} / ${attendanceStats.total}` : attendanceStats.absent}
              </div>
              <div className="text-xs text-[var(--an-report-muted)]">
                {isAttendanceRange ? `${attendanceStats.absent} Staff with zero punches` : 'No punch or activity'}
              </div>
            </div>
          </div>

          {/* Attendance List Table */}
          <div className="card p-0 overflow-hidden rounded-xl border border-[var(--border-light)] bg-[var(--bg-surface)] shadow-sm">
            <div className="px-4 py-3 border-b border-[var(--border-light)] bg-[var(--th-bg)] flex justify-between items-center flex-wrap gap-2.5">
              <div>
                <h4 className="m-0 text-sm font-bold text-[var(--text-primary)]">
                  {isAttendanceRange ? `Team Attendance & Working Days Summary (${dateFilterLabel})` : "Today's Team Attendance & Activity Status"}
                </h4>
                <span className="text-xs text-[var(--an-report-muted)]">
                  {isAttendanceRange ? `Aggregated punch logs across ${attendanceWorkingDays} working days in selected period` : "Combines Web Terminal Punch with CRM Lead Activity"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={attendanceFilter}
                  onChange={(e) => setAttendanceFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-md border border-[var(--border-light)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                >
                  <option value="ALL">All Staff ({attendanceStats.total})</option>
                  <option value="PRESENT">{isAttendanceRange ? `Active Staff (${attendanceStats.punched})` : `Punched Present (${attendanceStats.punched})`}</option>
                  <option value="CRM_ACTIVE">CRM Active Only ({attendanceStats.crmActiveOnly})</option>
                  <option value="ABSENT">{isAttendanceRange ? `Zero Punches (${attendanceStats.absent})` : `Absent (${attendanceStats.absent})`}</option>
                </select>

                <button
                  onClick={() => onNavigateTab?.('attendance')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--an-report-info-bg)] text-[var(--an-report-accent)] border border-[var(--accent-color,#2563eb)]/30 cursor-pointer hover:bg-[var(--an-report-info-bg)] transition-colors shadow-xs"
                >
                  <span>Open Attendance Module</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>

            <div className="overflow-auto max-h-[calc(100vh-280px)] an-report-table-scroll w-full relative">
              <MobileTableView id="AnalyticsDashboard-6" hideToggle>
                <table className="w-full min-w-[650px] border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)]">
                    <tr className="bg-[var(--th-bg)]">
                      <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] text-[0.72rem] font-semibold whitespace-nowrap">Staff Member</th>
                      <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3 py-2.5 text-[var(--an-report-muted)] text-[0.72rem] font-semibold whitespace-nowrap">Code</th>
                      <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] text-[0.72rem] font-semibold whitespace-nowrap">Department</th>
                      {isAttendanceRange ? (
                        <>
                          <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3 py-2.5 text-[var(--an-report-muted)] text-[0.72rem] font-semibold whitespace-nowrap">Present Days</th>
                          <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3 py-2.5 text-[var(--an-report-muted)] text-[0.72rem] font-semibold whitespace-nowrap">Late / Half Day</th>
                          <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3.5 py-2.5 text-[var(--an-report-muted)] text-[0.72rem] font-semibold whitespace-nowrap min-w-[120px]">Attendance Rate</th>
                          <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3 py-2.5 text-[var(--an-report-muted)] text-[0.72rem] font-semibold whitespace-nowrap">Status & Health</th>
                        </>
                      ) : (
                        <>
                          <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3 py-2.5 text-[var(--an-report-muted)] text-[0.72rem] font-semibold whitespace-nowrap">In Time</th>
                          <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3 py-2.5 text-[var(--an-report-muted)] text-[0.72rem] font-semibold whitespace-nowrap">Status & Source</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {!filteredAttendance.length && !reportLoading && (
                      <tr><td colSpan={isAttendanceRange ? 7 : 5} className="an-report-empty">No attendance records match the selected filters.</td></tr>
                    )}
                    {filteredAttendance.map(row => (
                      <tr key={row.email} className="border-b border-[var(--border-light)] hover:bg-[var(--th-bg)] transition-colors">
                        <td className="px-3.5 py-2.5">
                          <div className="font-semibold text-[var(--text-primary)]">{row.empName}</div>
                          <div className="text-[0.7rem] text-[var(--an-report-muted)]">{row.email}</div>
                        </td>
                        <td className="text-center px-3 py-2.5 font-semibold text-[var(--an-report-muted)]">{row.empCode}</td>
                        <td className="px-3.5 py-2.5 text-[var(--an-report-muted)]">{row.department}</td>
                        {isAttendanceRange ? (
                          <>
                            <td className="text-center px-3 py-2.5 font-bold text-[var(--text-primary)] whitespace-nowrap">
                              {row.presentDays || 0} / {attendanceWorkingDays}d
                            </td>
                            <td className="text-center px-3 py-2.5 whitespace-nowrap text-xs">
                              {row.lateDays > 0 && <span className="text-[var(--an-report-warning)] font-semibold mr-1">{row.lateDays} Late</span>}
                              {row.halfDays > 0 && <span className="text-[var(--an-report-warning)] font-semibold">{row.halfDays} Half</span>}
                              {(!row.lateDays && !row.halfDays) && <span className="text-[var(--an-report-muted)]">—</span>}
                            </td>
                            <td className="px-3.5 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-[var(--border-light)] rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${row.attendanceRate >= 80 ? 'bg-[var(--an-report-success)]' : row.attendanceRate >= 50 ? 'bg-[var(--an-report-info)]' : row.attendanceRate > 0 ? 'bg-[var(--an-report-warning)]' : 'bg-[var(--an-report-danger)]'}`}
                                    style={{ width: `${row.attendanceRate || 0}%` }}
                                  />
                                </div>
                                <span className="text-[11px] font-bold text-[var(--an-report-muted)] w-8 text-right">
                                  {row.attendanceRate || 0}%
                                </span>
                              </div>
                            </td>
                            <td className="text-center px-3 py-2.5">
                              <span
                                className="an-report-status inline-block text-[0.7rem] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap"
                                style={{ '--an-status-color': row.statusColor }}
                              >
                                {row.statusLabel}
                              </span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="text-center px-3 py-2.5 font-semibold text-[var(--text-primary)] whitespace-nowrap">
                              {formatTimeIST(row.inTime)}
                            </td>
                            <td className="text-center px-3 py-2.5">
                              <span
                                className="an-report-status inline-block text-[0.7rem] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap"
                                style={{ '--an-status-color': row.statusColor }}
                              >
                                {row.statusLabel}
                              </span>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </MobileTableView>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🎯 TAB 6: LEAD DATA & PIPELINE DASHBOARD                                  */}
      {/* ========================================================================= */}
      {(activeTab === 'lead-data' || activeTab === 'pipeline') && (
        <div className="an-phase-body">
          {/* Header Action Banner */}
          <div className="flex justify-between items-center flex-wrap gap-3.5 p-4.5 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-light)] shadow-sm">
            <div>
              <h3 className="m-0 text-base font-bold flex items-center gap-2 text-[var(--text-primary)]">
                <Database size={18} className="text-[var(--accent-color)]" />
                Lead Data & Pipeline Analytics
              </h3>
              <div className="text-xs text-[var(--text-secondary)] mt-1">
                Total lead distribution across CRM sales stages, outreach touchpoints, and caller allocations
              </div>
            </div>

            <button
              onClick={() => onNavigateTab?.('leads')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--an-report-info-bg)] text-[var(--accent-color,#2563eb)] border border-[var(--accent-color,#2563eb)]/30 text-xs font-bold cursor-pointer hover:bg-[var(--an-report-info-bg)] transition-colors shadow-xs"
            >
              <span>Open Full Leads Database</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* Quick Stats Grid */}
          <div className="an-phase-kpis">
            {[
              { label: isAllTime ? 'Total Leads in CRM' : `Leads Active (${dateFilterLabel})`, value: kpis.total, color: '#3b82f6', icon: Database },
              { label: isAllTime ? 'Fresh / New Leads' : 'New Leads Created', value: kpis.newLeads, color: '#06b6d4', icon: Zap },
              { label: 'In Active Pipeline', value: kpis.inPipeline, color: '#8b5cf6', icon: Target },
              { label: isAllTime ? 'Follow-ups Pending' : 'Follow-ups in Period', value: kpis.followUps, color: '#f59e0b', icon: Clock },
              { label: isAllTime ? 'Deals Won / Converted' : 'Deals Won in Period', value: kpis.won, color: '#10b981', icon: CheckCircle2 },
              { label: `WhatsApp Sent (${dateFilterLabel})`, value: loading ? '…' : metrics.whatsappStats.period, color: '#25D366', icon: MessageSquare }
            ].map(card => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="card an-card-hover p-3.5 flex flex-col gap-1.5 rounded-xl border border-[var(--border-light)] bg-[var(--bg-surface)] shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">{card.label}</span>
                    <Icon size={14} style={{ color: phaseInk(card.color) }} />
                  </div>
                  <div className="text-2xl font-extrabold" style={{ color: phaseInk(card.color) }}>
                    {typeof card.value === 'number' ? card.value.toLocaleString('en-IN') : card.value}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pipeline Stage & Sub-Stage Breakdown Interactive Grid */}
          <div className="card an-card-hover p-5 rounded-xl border border-[var(--border-light)] bg-[var(--bg-surface)] shadow-sm">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div>
                <h3 className="m-0 text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Layers size={18} className="text-[var(--accent-color)]" />
                  Pipeline Stage & Sub-Stage Breakdown
                </h3>
                <p className="mt-1 mb-0 text-xs text-[var(--text-secondary)]">
                  Click any stage card to jump directly to those filtered leads in the database.
                </p>
              </div>
              <span className="text-xs bg-[var(--th-bg)] px-2.5 py-1 rounded-lg border border-[var(--border-light)] text-[var(--text-secondary)] font-semibold">
                {filteredLeadsSync.length.toLocaleString('en-IN')} Total Filtered Leads
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-8 gap-3.5">
              {detailedStageBreakdown.map(item => (
                <div
                  key={item.fullStage}
                  onClick={() => onNavigateTab?.('leads', null, item.fullStage)}
                  className="an-card-hover bg-[var(--bg-surface)] p-3.5 rounded-xl border cursor-pointer transition-all duration-150 flex flex-col"
                  style={{
                    borderColor: `${item.color}33`,
                    borderLeftWidth: '4px',
                    borderLeftColor: item.color
                  }}
                >
                  <div className="text-[11px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">
                    {item.fullStage.split(' - ')[0]}
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)] mt-1 min-h-[2.25rem] leading-snug line-clamp-2" title={item.shortName}>
                    {item.shortName}
                  </div>
                  <div className="flex justify-between items-baseline mt-2 gap-2">
                    <span className="text-xl font-extrabold" style={{ color: phaseInk(item.color) }}>{item.count.toLocaleString('en-IN')}</span>
                    <span className="text-xs font-semibold flex items-center gap-1 shrink-0" style={{ color: phaseInk(item.color) }}>
                      View <ArrowRight size={11} />
                    </span>
                  </div>

                  {/* Sub-stages count breakdown list */}
                  {item.substages && item.substages.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-dashed border-[var(--border-light)] flex flex-col gap-1 max-h-28 overflow-y-auto">
                      {item.substages.slice(0, 4).map(sub => (
                        <div key={sub.label} className="flex justify-between items-center text-xs">
                          <span className="text-[var(--text-secondary)] truncate max-w-[75%]" title={sub.label}>
                            ↳ {sub.label}
                          </span>
                          <span className="font-bold bg-[var(--th-bg)] px-1.5 py-0.5 rounded text-[10px] border border-[var(--border-light)]" style={{ color: phaseInk(item.color) }}>
                            {sub.count}
                          </span>
                        </div>
                      ))}
                      {item.substages.length > 4 && (
                        <div className="text-[10px] text-[var(--text-secondary)] text-right italic">
                          +{item.substages.length - 4} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Stage Funnel Table & Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card an-card-hover p-5 lg:col-span-2 rounded-xl border border-[var(--border-light)] bg-[var(--bg-surface)] shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="m-0 text-sm font-bold text-[var(--text-primary)]">Sales Pipeline Stage Distribution</h3>
                <span className="text-xs text-[var(--text-secondary)]">{filteredLeadsSync.length.toLocaleString('en-IN')} Leads in View</span>
              </div>
              <AnalyticsStageChart data={stageData} height={260} />
            </div>

            <div className="card an-card-hover p-5 flex flex-col gap-3.5 rounded-xl border border-[var(--border-light)] bg-[var(--bg-surface)] shadow-sm">
              <h3 className="m-0 text-sm font-bold text-[var(--text-primary)]">Outreach & Messaging Metrics</h3>
              <div className="flex flex-col gap-2.5">
                <div className="p-3.5 rounded-lg bg-[var(--th-bg)] border border-[var(--border-light)]">
                  <div className="text-xs text-[var(--text-secondary)] font-semibold">WhatsApp Messages Sent ({dateFilterLabel})</div>
                  <div className="text-2xl font-extrabold text-[var(--an-report-success)] my-1">
                    {loading ? '…' : metrics.whatsappStats.period.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Total All Time: {metrics.whatsappStats.total.toLocaleString('en-IN')}
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-[var(--th-bg)] border border-[var(--border-light)]">
                  <div className="text-xs text-[var(--text-secondary)] font-semibold">Pipeline Conversion Health</div>
                  <div className="text-2xl font-extrabold text-[var(--an-report-info)] my-1">
                    {kpis.total > 0 ? `${((kpis.won / kpis.total) * 100).toFixed(2)}%` : '0%'}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {kpis.won} Won out of {kpis.total.toLocaleString('en-IN')} total leads
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Lead Source Breakdown Cards */}
          {sourceBreakdown.length > 0 && (
            <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <Filter size={16} style={{ color: 'var(--accent-color)' }} />
                    Lead Acquisition Sources Breakdown
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    Origin channel distribution across active leads
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {sourceBreakdown.length} Sources Tracked
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {sourceBreakdown.map((src) => {
                  const share = kpis.total > 0 ? Math.round((src.count / kpis.total) * 100) : 0;
                  return (
                    <div
                      key={src.name}
                      className="p-3 rounded-lg bg-[var(--th-bg)] border border-[var(--border-light)] flex flex-col gap-1"
                    >
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate" title={src.name}>
                        {src.name}
                      </div>
                      <div className="flex justify-between items-baseline mt-1">
                        <span className="text-lg font-extrabold text-[var(--accent-color)]">
                          {src.count.toLocaleString('en-IN')}
                        </span>
                        <span className="text-[11px] font-bold text-[var(--text-secondary)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-light)]">
                          {share}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Team Member Lead & Stage-Wise Breakdown Matrix (Stages 1 – 7) */}
          <div className="card an-card-hover p-5 flex flex-col gap-3.5 rounded-xl border border-[var(--border-light)] bg-[var(--bg-surface)] shadow-sm">
            <div className="flex justify-between items-center flex-wrap gap-2.5">
              <div>
                <h3 className="m-0 text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Users size={17} className="text-[var(--accent-color)]" />
                  Team Member Lead & Stage-Wise Breakdown Matrix
                </h3>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Live distribution of leads across Stages 1 to 7 and operational performance per representative
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
                  <input
                    type="text"
                    aria-label="Filter lead representatives"
                    placeholder="Filter representative..."
                    value={leadBreakdownSearch}
                    onChange={(e) => setLeadBreakdownSearch(e.target.value)}
                    className="pl-7 pr-2.5 py-1.5 rounded-lg border border-[var(--border-light)] bg-[var(--th-bg)] text-[var(--text-primary)] text-xs outline-none w-40 focus:ring-1 focus:ring-[var(--accent-color)]"
                  />
                </div>

                <div className="an-phase-filters inline-flex rounded-lg border border-[var(--border-light)] overflow-hidden" role="group" aria-label="Filter lead representatives by activity">
                  {[
                    { id: 'ALL', label: 'All Reps' },
                    { id: 'WITH_LEADS', label: 'With Leads' },
                    { id: 'TOP_PERFORMERS', label: 'Touch Rate >50%' }
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={leadBreakdownFilter === f.id}
                      onClick={() => setLeadBreakdownFilter(f.id)}
                      className={`px-2.5 py-1 text-xs font-bold border-0 cursor-pointer transition-colors ${
                        leadBreakdownFilter === f.id
                          ? 'bg-blue-500/15 text-[var(--accent-color,#2563eb)] shadow-xs'
                          : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => onNavigateTab?.('leads')}
                  className="text-xs font-semibold text-[var(--accent-color)] bg-transparent border-0 cursor-pointer flex items-center gap-1 hover:underline"
                >
                  Go to Leads Table <ArrowRight size={12} />
                </button>
              </div>
            </div>

            <AnalyticsPhaseTable table={PHASE31_TABLES.leads} rows={filteredLeadMatrixData}
              resetKey={JSON.stringify([phaseScopeKey, leadBreakdownFilter, leadBreakdownSearch])}
              empty={phaseLoading ? 'Loading lead activity…' : 'No representatives found matching the selected filter.'}
              renderRow={(row, idx) => {
                const contactRate = row.contactRate !== undefined ? row.contactRate : (row.leadsAssigned > 0 ? Math.round((row.leadsTouched / row.leadsAssigned) * 100) : 0);
                return (
                  <tr key={row.empEmail || idx} className="border-b border-[var(--border-light)] hover:bg-[var(--th-bg)] transition-colors">
                    <td className="px-3 py-2 font-semibold text-[var(--text-primary)] border-r border-[var(--border-light)]">
                      {row.empName}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)] border-r border-[var(--border-light)]">
                      {row.department || 'Sales & Telecalling'}
                    </td>
                    {[1, 2, 3, 4, 5, 6, 7].map(stNum => {
                      const count = row.assignedStageBreakdown?.[stNum] ?? row.stageBreakdown?.[stNum] ?? 0;
                      const colors = ['#3b82f6', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#6366f1'];
                      const colColor = colors[stNum - 1];
                      return (
                        <td
                          key={stNum}
                          className="px-2 py-2 text-center text-xs border-r border-[var(--border-light)]"
                          style={{
                            fontWeight: count > 0 ? 700 : 400,
                            color: count > 0 ? phaseInk(colColor) : 'var(--an-report-muted)',
                            backgroundColor: count > 0 ? `${colColor}0D` : 'transparent'
                          }}
                        >
                          {count > 0 ? count : '—'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-bold text-[var(--an-report-info)] border-r border-[var(--border-light)]">
                      📦 {row.leadsAssigned.toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-[var(--an-report-success)] border-r border-[var(--border-light)]">
                      🎯 {row.leadsAssigned > 0 ? row.leadsTouched.toLocaleString('en-IN') : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right font-bold border-r border-[var(--border-light)] ${contactRate >= 70 ? 'text-[var(--an-report-success)]' : contactRate >= 40 ? 'text-[var(--an-report-warning)]' : 'text-[var(--an-report-danger)]'}`}>
                      {row.leadsAssigned > 0 ? `${contactRate}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.leadsAssigned > 0 ? (
                        <span className="an-phase-badge an-report-status"
                          data-an-tone={(row.outreachScore ?? 0) >= 20 ? 'success' : (row.outreachScore ?? 0) >= 12 ? 'warning' : 'danger'}>
                          {row.outreachScore ?? 0} / 30 pts
                        </span>
                      ) : (
                        <span className="text-[var(--text-secondary)] text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              }}
            />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🧑‍💼 TAB 7: RECRUITER & TALENT ACQUISITION HUB                             */}
      {/* ========================================================================= */}
      {activeTab === 'recruiter' && (
        <div className="flex flex-col gap-5">
          {/* Header Action Banner */}
          <div className="flex justify-between items-center flex-wrap gap-3.5 p-4.5 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-light)] shadow-sm">
            <div>
              <h3 className="m-0 text-base font-bold flex items-center gap-2 text-[var(--text-primary)]">
                <Briefcase size={18} className="text-[var(--an-report-accent)]" />
                Recruitment & Talent Acquisition Hub
              </h3>
              <div className="text-xs text-[var(--an-report-muted)] mt-1">
                Live job requisitions, candidate pipeline tracking & multi-stage interview progress
              </div>
            </div>

            <button
              onClick={() => onNavigateTab?.('recruiter')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--an-report-info-bg)] text-[var(--an-report-accent)] border border-[var(--accent-color,#2563eb)]/30 text-xs font-bold cursor-pointer hover:bg-[var(--an-report-info-bg)] transition-colors shadow-xs"
            >
              <span>Open Full Recruiter Module</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* Top KPI Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5">
            <div className="card an-card-hover p-4 border-l-4 border-[var(--an-report-info)] rounded-xl bg-[var(--bg-surface)] border-t border-r border-b border-[var(--border-light)] shadow-sm">
              <div className="text-[0.72rem] font-bold text-[var(--an-report-muted)] uppercase tracking-wider">Open Positions</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[var(--an-report-info)] my-1">
                {dashboardSummaries.recruitmentSummary?.openPositions || 0}
              </div>
              <div className="text-xs text-[var(--an-report-muted)]">
                {dashboardSummaries.recruitmentSummary?.positions?.reduce((a, b) => a + (b.openings || 1), 0) || 0} Total vacancies
              </div>
            </div>

            <div className="card an-card-hover p-4 border-l-4 border-[var(--an-report-violet)] rounded-xl bg-[var(--bg-surface)] border-t border-r border-b border-[var(--border-light)] shadow-sm">
              <div className="text-[0.72rem] font-bold text-[var(--an-report-muted)] uppercase tracking-wider">Total Candidates</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[var(--an-report-violet)] my-1">
                {dashboardSummaries.recruitmentSummary?.totalCandidates || 0}
              </div>
              <div className="text-xs text-[var(--an-report-muted)]">
                {dashboardSummaries.recruitmentSummary?.newInPeriod ?? dashboardSummaries.recruitmentSummary?.newToday ?? 0} Added in period ({dateFilterLabel})
              </div>
            </div>

            <div className="card an-card-hover p-4 border-l-4 border-[var(--an-report-violet)] rounded-xl bg-[var(--bg-surface)] border-t border-r border-b border-[var(--border-light)] shadow-sm">
              <div className="text-[0.72rem] font-bold text-[var(--an-report-muted)] uppercase tracking-wider">In Interview</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[var(--an-report-violet)] my-1">
                {dashboardSummaries.recruitmentSummary?.inInterview || 0}
              </div>
              <div className="text-xs text-[var(--an-report-muted)]">
                Stages S03 & Scheduling
              </div>
            </div>

            <div className="card an-card-hover p-4 border-l-4 border-[var(--an-report-success)] rounded-xl bg-[var(--bg-surface)] border-t border-r border-b border-[var(--border-light)] shadow-sm">
              <div className="text-[0.72rem] font-bold text-[var(--an-report-muted)] uppercase tracking-wider">Shortlisted</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[var(--an-report-success)] my-1">
                {dashboardSummaries.recruitmentSummary?.shortlisted || 0}
              </div>
              <div className="text-xs text-[var(--an-report-muted)]">
                Stage S07 Qualified
              </div>
            </div>

            <div className="card an-card-hover p-4 border-l-4 border-[var(--an-report-success)] rounded-xl bg-[var(--bg-surface)] border-t border-r border-b border-[var(--border-light)] shadow-sm">
              <div className="text-[0.72rem] font-bold text-[var(--an-report-muted)] uppercase tracking-wider">Offers & Joined</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[var(--an-report-success)] my-1">
                {dashboardSummaries.recruitmentSummary?.hired || 0}
              </div>
              <div className="text-xs text-[var(--an-report-muted)]">
                LOI Accepted & Joined
              </div>
            </div>
          </div>

          {/* Active Positions Table */}
          <div className="card p-0 overflow-hidden rounded-xl border border-[var(--border-light)] bg-[var(--bg-surface)] shadow-sm">
            <div className="px-4 py-3 border-b border-[var(--border-light)] bg-[var(--th-bg)] flex justify-between items-center flex-wrap gap-2">
              <div>
                <h4 className="m-0 text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Briefcase size={15} className="text-[var(--an-report-accent)]" />
                  Active Job Positions ({dashboardSummaries.recruitmentSummary?.positions?.length || 0})
                </h4>
                <span className="text-xs text-[var(--an-report-muted)]">
                  Current open requisitions and department headcount requirements
                </span>
              </div>

              <button
                onClick={() => onNavigateTab?.('recruiter')}
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--an-report-accent)] bg-transparent border-0 cursor-pointer p-0 hover:underline"
              >
                <span>Manage in Recruiter</span>
                <ExternalLink size={12} />
              </button>
            </div>

            {dashboardSummaries.recruitmentSummary?.positions?.length === 0 ? (
              <div className="p-10 text-center text-xs text-[var(--an-report-muted)]">
                No job positions created yet.
              </div>
            ) : (
              <div className="overflow-auto max-h-[calc(100vh-280px)] an-report-table-scroll w-full relative">
                <MobileTableView id="AnalyticsDashboard-8" hideToggle>
                  <table className="w-full min-w-[760px] border-separate border-spacing-0 text-xs">
                    <thead className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)]">
                      <tr className="bg-[var(--th-bg)]">
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] font-semibold text-[0.72rem] whitespace-nowrap">Job Title</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] font-semibold text-[0.72rem] whitespace-nowrap">Department</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3 py-2.5 text-[var(--an-report-muted)] font-semibold text-[0.72rem] whitespace-nowrap">Openings</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] font-semibold text-[0.72rem] whitespace-nowrap">Recruiter Assigned</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] font-semibold text-[0.72rem] whitespace-nowrap">Salary Range</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] font-semibold text-[0.72rem] whitespace-nowrap">Target Deadline</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3.5 py-2.5 text-[var(--an-report-muted)] font-semibold text-[0.72rem] whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dashboardSummaries.recruitmentSummary?.positions || []).map((pos, idx) => {
                        const isClosed = pos.status === 'CLOSED';
                        return (
                          <tr key={pos.id || idx} className="border-b border-[var(--border-light)] hover:bg-[var(--th-bg)] transition-colors">
                            <td className="px-3.5 py-2.5">
                              <div className="font-bold text-[var(--text-primary)]">{pos.title}</div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <span className="text-[0.68rem] text-[var(--an-report-muted)] font-mono">
                                  {pos.id?.substring(0, 8) ? `POS-${pos.id.substring(0, 8).toUpperCase()}` : ''}
                                </span>
                                {pos.workspace_branch_code && (
                                  <span
                                    className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded bg-[var(--an-report-info-bg)] text-[var(--an-report-accent)]"
                                    title={`Tenant: ${pos.workspace_tenant_code || 'TNT00002'} | Branch: ${pos.workspace_branch_code}`}
                                  >
                                    {pos.workspace_branch_code} ({pos.workspace_company || 'NSMLR'})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5">
                              <span className="inline-block px-2 py-0.5 rounded bg-[var(--th-bg)] text-[0.73rem] font-semibold text-[var(--text-primary)]">
                                {pos.department || 'General'}
                              </span>
                            </td>
                            <td className="text-center px-3 py-2.5 font-bold">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--an-report-info-bg)] text-[var(--an-report-info)]  border border-[var(--an-report-info-line)] text-xs font-bold">
                                {pos.openings || 1}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 text-[var(--an-report-muted)] text-xs">
                              {pos.recruiter_assigned || 'Unassigned'}
                            </td>
                            <td className="px-3.5 py-2.5 text-xs">
                              {pos.salary_min || pos.salary_max ? (
                                <span>
                                  {pos.salary_min ? `₹${Number(pos.salary_min).toLocaleString('en-IN')}` : ''}
                                  {pos.salary_min && pos.salary_max ? ' - ' : ''}
                                  {pos.salary_max ? `₹${Number(pos.salary_max).toLocaleString('en-IN')}` : ''}
                                </span>
                              ) : (
                                <span className="text-[var(--an-report-muted)]">Best in industry</span>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5 text-xs text-[var(--an-report-muted)]">
                              {pos.deadline_date ? new Date(pos.deadline_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                            </td>
                            <td className="text-center px-3.5 py-2.5">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[0.72rem] font-bold whitespace-nowrap border ${
                                isClosed
                                  ? 'bg-[var(--an-report-danger-bg)] text-[var(--an-report-danger)]  border-[var(--an-report-danger-line)]'
                                  : 'bg-[var(--an-report-success-bg)] text-[var(--an-report-success)]  border-[var(--an-report-success-line)]'
                              }`}>
                                {isClosed ? 'Closed' : 'Active Requisition'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </MobileTableView>
              </div>
            )}
          </div>

          {/* Candidates Pipeline Table */}
          <div className="card p-0 overflow-hidden rounded-xl border border-[var(--border-light)] bg-[var(--bg-surface)] shadow-sm">
            <div className="px-4 py-3 border-b border-[var(--border-light)] bg-[var(--th-bg)] flex justify-between items-center flex-wrap gap-2.5">
              <div>
                <h4 className="m-0 text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Users size={15} className="text-[var(--an-report-accent)]" />
                  Candidate Talent Pipeline ({filteredCandidatesList.length})
                </h4>
                <span className="text-xs text-[var(--an-report-muted)]">
                  Screening, evaluation stages & hiring decisions
                </span>
              </div>

              {/* Filters & Search Toolbar */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--an-report-muted)]" />
                  <input
                    type="text"
                    placeholder="Search candidate, role, phone..."
                    value={recruiterSearch}
                    onChange={(e) => setRecruiterSearch(e.target.value)}
                    className="pl-7 pr-7 py-1.5 text-xs rounded-md border border-[var(--border-light)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent-color)] w-52"
                  />
                  {recruiterSearch && (
                    <button
                      onClick={() => setRecruiterSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-0 cursor-pointer text-[var(--an-report-muted)] text-xs hover:text-[var(--text-primary)]"
                    >
                      ×
                    </button>
                  )}
                </div>

                <select
                  value={recruiterFilter}
                  onChange={(e) => setRecruiterFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-md border border-[var(--border-light)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
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
              <div className="p-10 text-center text-xs text-[var(--an-report-muted)]">
                {recruiterSearch || recruiterFilter !== 'ALL' ? 'No candidates match your search or filter.' : 'No candidates in the pipeline.'}
              </div>
            ) : (
              <div className="overflow-auto max-h-[calc(100vh-280px)] an-report-table-scroll w-full relative">
                <MobileTableView id="AnalyticsDashboard-9" hideToggle>
                  <table className="w-full min-w-[850px] border-separate border-spacing-0 text-xs">
                    <thead className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)]">
                      <tr className="bg-[var(--th-bg)]">
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] font-semibold text-[0.72rem] whitespace-nowrap">Candidate</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] font-semibold text-[0.72rem] whitespace-nowrap">Target Position</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] font-semibold text-[0.72rem] whitespace-nowrap">Pipeline Stage</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] font-semibold text-[0.72rem] whitespace-nowrap">Current Status</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] font-semibold text-[0.72rem] whitespace-nowrap">Contact Info</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-left px-3.5 py-2.5 text-[var(--an-report-muted)] font-semibold text-[0.72rem] whitespace-nowrap">Applied Date</th>
                        <th className="sticky top-0 z-10 bg-[var(--th-bg)] shadow-[0_1px_0_var(--border-light)] text-center px-3.5 py-2.5 text-[var(--an-report-muted)] font-semibold text-[0.72rem] whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCandidatesList.map((cand, idx) => {
                        const badge = getStageBadgeInfo(cand.current_stage, cand.candidate_status);
                        const isJoined = (cand.candidate_status || '').toLowerCase().includes('joined') || cand.current_stage === 'S09';
                        const isRejected = (cand.candidate_status || '').toLowerCase().includes('reject') || (cand.candidate_status || '').toLowerCase().includes('dropped');
                        return (
                          <tr key={cand.id || idx} className="border-b border-[var(--border-light)] hover:bg-[var(--th-bg)] transition-colors">
                            <td className="px-3.5 py-2.5">
                              <div className="font-bold text-[var(--text-primary)]">{cand.name}</div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {cand.candidate_code && (
                                  <span className="text-[0.68rem] text-[var(--an-report-muted)] font-mono">
                                    {cand.candidate_code}
                                  </span>
                                )}
                                {cand.workspace_tenant_code && (
                                  <span
                                    className="text-[0.63rem] font-bold px-1 py-0.5 rounded bg-[var(--th-bg)] text-[var(--an-report-muted)]"
                                    title={`Tenant Code: ${cand.workspace_tenant_code}`}
                                  >
                                    {cand.workspace_tenant_code}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5">
                              <div className="font-semibold text-[var(--text-primary)] text-xs">
                                {cand.recruitment_positions?.title || 'General Position'}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <span className="text-[0.7rem] text-[var(--an-report-muted)]">
                                  {cand.recruitment_positions?.department || '—'}
                                </span>
                                {cand.workspace_branch_code && (
                                  <span
                                    className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded bg-[var(--an-report-violet-bg)] text-[var(--an-report-violet)] "
                                    title={`Branch: ${cand.workspace_branch_code} | Company: ${cand.workspace_company || 'NSMLR'}`}
                                  >
                                    {cand.workspace_branch_code} ({cand.workspace_company || 'NSMLR'})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5">
                              <span
                                className="an-report-status inline-block px-2.5 py-0.5 rounded-full text-[0.72rem] font-bold"
                                style={{ '--an-status-color': badge.color }}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5">
                              <span className={`inline-block px-2.5 py-0.5 rounded text-[0.73rem] font-semibold border ${
                                isJoined
                                  ? 'bg-[var(--an-report-success-bg)] text-[var(--an-report-success)]  border-[var(--an-report-success-line)]'
                                  : isRejected
                                    ? 'bg-[var(--an-report-danger-bg)] text-[var(--an-report-danger)]  border-[var(--an-report-danger-line)]'
                                    : 'bg-[var(--th-bg)] text-[var(--text-primary)] border-[var(--border-light)]'
                              }`}>
                                {cand.candidate_status || 'Under Review'}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 text-xs text-[var(--an-report-muted)]">
                              {cand.phone && <div className="flex items-center gap-1"><Phone size={11} /> {cand.phone}</div>}
                              {cand.email && <div className="flex items-center gap-1"><Mail size={11} /> {cand.email}</div>}
                            </td>
                            <td className="px-3.5 py-2.5 text-xs text-[var(--an-report-muted)]">
                              {cand.created_at ? new Date(cand.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                            </td>
                            <td className="text-center px-3.5 py-2.5">
                              <div className="inline-flex items-center gap-1.5">
                                {cand.resume_url && (
                                  <a
                                    href={cand.resume_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="View Resume"
                                    className="inline-flex items-center justify-center px-2 py-1 rounded-md border border-[var(--border-light)] bg-[var(--bg-surface)] text-[var(--an-report-accent)] no-underline text-xs font-semibold hover:opacity-80"
                                  >
                                    <FileText size={12} className="mr-1" />
                                    Resume
                                  </a>
                                )}
                                <button
                                  onClick={() => onNavigateTab?.('recruiter')}
                                  title="Open in Recruiter module"
                                  className="inline-flex items-center justify-center px-2 py-1 rounded-md border border-[var(--border-light)] bg-[var(--bg-primary)] text-[var(--text-primary)] cursor-pointer text-xs font-semibold hover:bg-[var(--th-bg)]"
                                >
                                  <span>View</span>
                                  <ArrowRight size={11} className="ml-1" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </MobileTableView>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
