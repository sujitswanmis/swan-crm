'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  Users, UserCheck, AlertCircle, Clock, CheckCircle2, TrendingUp, 
  PhoneCall, MessageSquare, Shield, Layers, ArrowRight, Sparkles, Filter, Calendar, X, ChevronDown, Check,
  Search, ArrowUpDown, Timer, Activity, Eye, ExternalLink, FileText, Building2, User
} from 'lucide-react';
import { getSubItemPermissions } from '@/utils/permissionUtils';
import DateRangePicker from '@/components/common/DateRangePicker';

const formatActionTimestamp = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
};

const formatActionDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
};

const STAGE_COLORS = {
  '01 - New Stage': '#3b82f6',
  '02 - Contact Stage': '#06b6d4',
  '03 - Qualification Stage': '#8b5cf6',
  '04 - Follow Up Stage': '#f59e0b',
  '05 - Sales Process Stage': '#ec4899',
  '06 - Conversion Stage': '#10b981',
  '07 - Final Stage': '#6366f1'
};

export const PIPELINE_STAGES = [
  { num: 1, name: 'Stage 1', label: 'New', fullName: '01 - New Stage', color: '#3b82f6', bg: '#eff6ff' },
  { num: 2, name: 'Stage 2', label: 'Contact', fullName: '02 - Contact Stage', color: '#06b6d4', bg: '#ecfeff' },
  { num: 3, name: 'Stage 3', label: 'Qualification', fullName: '03 - Qualification Stage', color: '#8b5cf6', bg: '#f5f3ff' },
  { num: 4, name: 'Stage 4', label: 'Follow Up', fullName: '04 - Follow Up Stage', color: '#f59e0b', bg: '#fffbeb' },
  { num: 5, name: 'Stage 5', label: 'Sales Process', fullName: '05 - Sales Process Stage', color: '#ec4899', bg: '#fdf2f8' },
  { num: 6, name: 'Stage 6', label: 'Conversion', fullName: '06 - Conversion Stage', color: '#10b981', bg: '#ecfdf5' },
  { num: 7, name: 'Stage 7', label: 'Final Stage', fullName: '07 - Final Stage', color: '#6366f1', bg: '#eef2ff' },
];

export const HOURLY_SLOTS = [
  { id: 'all', label: 'All Hours (Full Day)', shortLabel: 'All Hours', startHour: null, endHour: null },
  { id: 'h09_10', label: '09:00 AM - 10:00 AM', shortLabel: '09-10 AM', startHour: 9, endHour: 10 },
  { id: 'h10_11', label: '10:00 AM - 11:00 AM', shortLabel: '10-11 AM', startHour: 10, endHour: 11 },
  { id: 'h11_12', label: '11:00 AM - 12:00 PM', shortLabel: '11-12 PM', startHour: 11, endHour: 12 },
  { id: 'h12_13', label: '12:00 PM - 01:00 PM', shortLabel: '12-01 PM', startHour: 12, endHour: 13 },
  { id: 'h13_14', label: '01:00 PM - 02:00 PM', shortLabel: '01-02 PM', startHour: 13, endHour: 14 },
  { id: 'h14_15', label: '02:00 PM - 03:00 PM', shortLabel: '02-03 PM', startHour: 14, endHour: 15 },
  { id: 'h15_16', label: '03:00 PM - 04:00 PM', shortLabel: '03-04 PM', startHour: 15, endHour: 16 },
  { id: 'h16_17', label: '04:00 PM - 05:00 PM', shortLabel: '04-05 PM', startHour: 16, endHour: 17 },
  { id: 'h17_18', label: '05:00 PM - 06:00 PM', shortLabel: '05-06 PM', startHour: 17, endHour: 18 },
  { id: 'h18_19', label: '06:00 PM - 07:00 PM', shortLabel: '06-07 PM', startHour: 18, endHour: 19 },
  { id: 'h19_20', label: '07:00 PM - 08:00 PM', shortLabel: '07-08 PM', startHour: 19, endHour: 20 },
  { id: 'h_other', label: 'Other Hours (<9 AM / >8 PM)', shortLabel: 'Other', startHour: -1, endHour: -1 },
];

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b'];

// Helper function for local YYYY-MM-DD string formatting (prevents UTC timezone desync)
function getLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getLocalHour(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (!isNaN(d.getTime())) return d.getHours();
  if (typeof dateVal === 'string' && dateVal.includes(':')) {
    const parts = dateVal.split(' ');
    const timePart = parts.find(p => p.includes(':'));
    if (timePart) {
      const h = parseInt(timePart.split(':')[0], 10);
      if (!isNaN(h)) return h;
    }
  }
  return null;
}

function getSlotIdForHour(hour) {
  if (hour === null || hour === undefined) return 'h_other';
  if (hour >= 9 && hour <= 19) {
    const nextHour = hour + 1;
    const pad = (n) => String(n).padStart(2, '0');
    return `h${pad(hour)}_${pad(nextHour)}`;
  }
  return 'h_other';
}

// Helper function for precomputed date bounds (O(1) checks without Date allocations)
function getDateFilterBounds(filterType, customStart, customEnd) {
  if (!filterType || filterType === 'all') return { isAll: true };
  const now = new Date();
  const todayStr = getLocalDateStr(now);

  if (filterType === 'today') {
    return { isAll: false, start: todayStr, end: todayStr };
  }
  if (filterType === 'yesterday') {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yestStr = getLocalDateStr(yest);
    return { isAll: false, start: yestStr, end: yestStr };
  }
  if (filterType === 'this_week') {
    const currentDay = now.getDay();
    const distanceToMon = (currentDay + 6) % 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - distanceToMon);
    return { isAll: false, start: getLocalDateStr(mon), end: todayStr };
  }
  if (filterType === 'last_week') {
    const currentDay = now.getDay();
    const distanceToMon = (currentDay + 6) % 7;
    const thisMon = new Date(now);
    thisMon.setDate(now.getDate() - distanceToMon);
    const lastMon = new Date(thisMon);
    lastMon.setDate(thisMon.getDate() - 7);
    const lastSun = new Date(thisMon);
    lastSun.setDate(thisMon.getDate() - 1);
    return { isAll: false, start: getLocalDateStr(lastMon), end: getLocalDateStr(lastSun) };
  }
  if (filterType === 'this_month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return { isAll: false, start: getLocalDateStr(monthStart), end: todayStr };
  }
  if (filterType === 'last_month') {
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    return { isAll: false, start: getLocalDateStr(lastMonthStart), end: getLocalDateStr(lastMonthEnd) };
  }
  if (filterType === 'custom') {
    return { isAll: false, start: customStart || '0000-00-00', end: customEnd || '9999-99-99' };
  }
  return { isAll: true };
}

function checkDateWithinBounds(dateVal, bounds) {
  if (!bounds || bounds.isAll) return true;
  if (!dateVal) return false;
  let dStr = '';
  if (typeof dateVal === 'string') {
    if (dateVal.includes('T')) {
      dStr = getLocalDateStr(new Date(dateVal));
    } else if (dateVal.includes('/')) {
      const parts = dateVal.split(' ')[0].split('/');
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          dStr = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        } else if (parts[0].length === 4) {
          dStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
      }
    } else {
      dStr = dateVal.split(' ')[0];
    }
  } else {
    dStr = getLocalDateStr(new Date(dateVal));
  }
  return dStr >= bounds.start && dStr <= bounds.end;
}

function isLeadInDateBounds(lead, bounds) {
  if (bounds.isAll) return true;
  if (!lead) return false;
  if (lead.lead_date && checkDateWithinBounds(lead.lead_date, bounds)) return true;
  if (lead.created_at && checkDateWithinBounds(lead.created_at, bounds)) return true;
  if (lead.follow_up_date && checkDateWithinBounds(lead.follow_up_date, bounds)) return true;
  if (Array.isArray(lead.lead_notes) && lead.lead_notes.length > 0) {
    for (let i = 0; i < lead.lead_notes.length; i++) {
      if (checkDateWithinBounds(lead.lead_notes[i]?.created_at, bounds)) return true;
    }
  }
  return false;
}

// Extracts numerical employee ID (4 to 6 digits) from strings like "Nitya Verma - 50745" or "50745"
function extractEmpId(str) {
  if (!str) return null;
  const match = String(str).match(/\b(\d{4,6})\b/);
  return match ? match[1] : null;
}

// Maps lead status string to numeric stage 1 through 7
function getStageNumber(status) {
  if (!status) return 1;
  const st = String(status).trim();
  if (st.startsWith('1;') || st.startsWith('01') || st === 'New' || st === 'Pending') return 1;
  if (st.startsWith('2;') || st.startsWith('02')) return 2;
  if (st.startsWith('3;') || st.startsWith('03')) return 3;
  if (st.startsWith('4;') || st.startsWith('04')) return 4;
  if (st.startsWith('5;') || st.startsWith('05')) return 5;
  if (st.startsWith('6;') || st.startsWith('06')) return 6;
  if (st.startsWith('7;') || st.startsWith('07') || ['Converted', 'Order Received', 'Closed', 'Won', 'Lost'].some(k => st.toLowerCase().includes(k.toLowerCase()))) return 7;
  
  const match = st.match(/^0?([1-7])/);
  if (match) return parseInt(match[1], 10);
  return 1;
}

// Detects whether a lead note represents a stage or status update event
function isStageChangeNote(noteText) {
  if (!noteText || typeof noteText !== 'string') return false;
  const lower = noteText.toLowerCase();
  return (
    lower.includes('status changed') ||
    lower.includes('stage changed') ||
    lower.includes('status updated') ||
    lower.includes('stage updated') ||
    lower.includes('status changed to') ||
    lower.includes('status:') ||
    /(?:status|stage)\s+(?:changed|updated)/i.test(noteText)
  );
}

// Detects whether a lead note is an automated system log or lead assignment event (NOT a manual agent remark)
function isSystemLogOrAssignmentNote(noteText) {
  if (!noteText || typeof noteText !== 'string') return false;
  const lower = noteText.toLowerCase().trim();
  return (
    lower.startsWith('lead assigned to') ||
    lower.startsWith('assigned to') ||
    lower.startsWith('lead reassigned to') ||
    lower.startsWith('reassigned to') ||
    lower.startsWith('follow-up scheduled for') ||
    lower.includes('client registration form submitted') ||
    lower.includes('profile updated') ||
    lower.includes('client profile was updated') ||
    lower.includes('auto-assigned') ||
    lower.includes('bulk assigned') ||
    lower.includes('imported via') ||
    lower.includes('lead imported')
  );
}

export default function LeadDashboard({ 
  leads = [], 
  teamMembers = [], 
  userRole = '', 
  userId = '', 
  userName = '', 
  moduleAccess = {}, 
  defaultTab,
  onNavigateStage, 
  onOpenProfile 
}) {
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
  const isManager = Boolean(moduleAccess?.leads?.is_manager);
  const canViewAll = isAdmin || isManager;
  const canViewOverview = getSubItemPermissions(moduleAccess, userRole, 'leads', 'lead_dashboard').view;
  const canViewHourlyWork = getSubItemPermissions(moduleAccess, userRole, 'leads', 'hourly_work').view;

  // Filter States
  const [dateRangeFilter, setDateRangeFilter] = useState('all'); // 'all', 'today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Multi-Select Employee Filter Chips state
  const [selectedAgents, setSelectedAgents] = useState([]); // Array of user_ids
  const [agentSearch, setAgentSearch] = useState('');
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const agentDropdownRef = useRef(null);

  // View Tab: 'overview' | 'hourly' (Persisted in localStorage & URL query params)
  const [activeDashboardTab, setActiveDashboardTab] = useState(() => {
    if (defaultTab === 'hourly' && canViewHourlyWork) {
      return 'hourly';
    }
    if (defaultTab === 'overview' && canViewOverview) {
      return 'overview';
    }
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const stageParam = urlParams.get('stage');
        const subtabParam = urlParams.get('subtab') || urlParams.get('tab');
        if ((stageParam === 'hourly_work' || subtabParam === 'hourly') && canViewHourlyWork) {
          return 'hourly';
        }
        if (subtabParam === 'overview' && canViewOverview) {
          return 'overview';
        }
        const saved = localStorage.getItem('crm_lead_dashboard_subtab');
        if (saved === 'hourly' && canViewHourlyWork) {
          return 'hourly';
        }
        if (saved === 'overview' && canViewOverview) {
          return 'overview';
        }
      } catch (e) {
        // ignore
      }
    }
    return canViewOverview ? 'overview' : (canViewHourlyWork ? 'hourly' : 'overview');
  });

  // Sync when defaultTab prop changes from parent
  useEffect(() => {
    if (defaultTab === 'hourly' && canViewHourlyWork) {
      setActiveDashboardTab('hourly');
    } else if (defaultTab === 'overview' && canViewOverview) {
      setActiveDashboardTab('overview');
    }
  }, [defaultTab, canViewHourlyWork, canViewOverview]);

  // Sync activeDashboardTab with localStorage & URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('crm_lead_dashboard_subtab', activeDashboardTab);
        const url = new URL(window.location.href);
        const currentStage = url.searchParams.get('stage');
        if (currentStage === 'lead_dashboard' || currentStage === 'dashboard' || currentStage === 'hourly_work') {
          url.searchParams.set('subtab', activeDashboardTab);
          window.history.replaceState({}, '', url.toString());
        }
      } catch (e) {
        // ignore
      }
    }
  }, [activeDashboardTab]);

  // Fallback to overview if hourly access is not allowed
  useEffect(() => {
    if (!canViewHourlyWork && activeDashboardTab === 'hourly') {
      setActiveDashboardTab(canViewOverview ? 'overview' : 'none');
    }
    if (!canViewOverview && activeDashboardTab === 'overview' && canViewHourlyWork) {
      setActiveDashboardTab('hourly');
    }
  }, [canViewHourlyWork, canViewOverview, activeDashboardTab]);

  // Listen for external tab sync (e.g. from sidebar clicks or storage events)
  useEffect(() => {
    const handleSyncTab = () => {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const subtabParam = urlParams.get('subtab');
        const saved = localStorage.getItem('crm_lead_dashboard_subtab');
        const target = subtabParam || saved;
        if ((target === 'hourly' || target === 'overview') && target !== activeDashboardTab) {
          if (target === 'hourly' && !canViewHourlyWork) return;
          setActiveDashboardTab(target);
        }
      }
    };

    window.addEventListener('storage', handleSyncTab);
    window.addEventListener('popstate', handleSyncTab);
    return () => {
      window.removeEventListener('storage', handleSyncTab);
      window.removeEventListener('popstate', handleSyncTab);
    };
  }, [activeDashboardTab, canViewHourlyWork]);

  // Table search and sorting states for Team Lead Allocation & Action Summary
  const [tableSearch, setTableSearch] = useState('');
  const [tableSortKey, setTableSortKey] = useState('totalAssigned');
  const [tableSortDir, setTableSortDir] = useState('desc');

  // Hourly Work states
  const [selectedHourlySlot, setSelectedHourlySlot] = useState('all');
  const [hourlyViewMode, setHourlyViewMode] = useState('timeline'); // 'timeline' | 'table' | 'matrix'
  const [hourlyTableSearch, setHourlyTableSearch] = useState('');
  const [hourlyTableSortKey, setHourlyTableSortKey] = useState('totalActions');
  const [hourlyTableSortDir, setHourlyTableSortDir] = useState('desc');

  // Interactive Drilldown Popup state
  const [hourlyDrilldown, setHourlyDrilldown] = useState(null);
  const [drilldownSearch, setDrilldownSearch] = useState('');

  // Close drilldown on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && hourlyDrilldown) {
        setHourlyDrilldown(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hourlyDrilldown]);

  // Close employee dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target)) {
        setIsAgentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sorted Active Team Members (A-Z)
  const activeTeamMembers = useMemo(() => {
    return teamMembers
      .filter(m => m.emp_name && (m.emp_status === 'Active' || (!m.emp_status && m.role !== 'customer')))
      .sort((a, b) => (a.emp_name || '').localeCompare(b.emp_name || ''));
  }, [teamMembers]);

  // Pre-indexed member lookup map for O(1) matching
  const memberIndex = useMemo(() => {
    const lookupMap = new Map();
    const memberEntries = [];

    activeTeamMembers.forEach(member => {
      const id = member.user_id || member.id || member.emp_name;
      const entry = {
        id,
        name: member.emp_name,
        dept: member.emp_department || 'Sales',
        role: member.role || 'Member',
      };
      memberEntries.push(entry);

      const mId = String(member.user_id || member.id || '').trim().toLowerCase();
      const mName = String(member.emp_name || '').trim().toLowerCase();
      const mEmail = String(member.email || '').trim().toLowerCase();
      const mPrefix = mEmail ? mEmail.split('@')[0].toLowerCase() : '';
      const mEmpId = String(member.emp_id || member.emp_code || '').trim().toLowerCase();

      if (mId) lookupMap.set(mId, entry);
      if (mName) lookupMap.set(mName, entry);
      if (mEmail) lookupMap.set(mEmail, entry);
      if (mPrefix) lookupMap.set(mPrefix, entry);
      if (mEmpId) lookupMap.set(mEmpId, entry);

      const codeInName = extractEmpId(mName);
      if (codeInName) lookupMap.set(codeInName, entry);
      const codeInId = extractEmpId(mId);
      if (codeInId) lookupMap.set(codeInId, entry);
    });

    const findMember = (identifier) => {
      if (!identifier) return null;
      const str = String(identifier).trim().toLowerCase();
      if (lookupMap.has(str)) return lookupMap.get(str);
      const code = extractEmpId(str);
      if (code && lookupMap.has(code)) return lookupMap.get(code);

      // Check if identifier contains a name or partial match in memberEntries
      for (let i = 0; i < memberEntries.length; i++) {
        const e = memberEntries[i];
        const eName = (e.name || '').toLowerCase();
        if (eName && (eName.includes(str) || str.includes(eName))) {
          lookupMap.set(str, e);
          return e;
        }
      }

      // Check if it's an automated system string
      if (
        str === 'system' || 
        str.includes('webhook') || 
        str.includes('bot') || 
        str.includes('automation') ||
        str === 'null' ||
        str === 'undefined'
      ) {
        return null;
      }

      // Dynamic fallback member entry for admin / unlisted users (e.g. Sujit Gupta)
      const cleanName = String(identifier).trim();
      const dynamicEntry = {
        id: cleanName,
        name: cleanName,
        dept: 'Management',
        role: 'Admin'
      };
      lookupMap.set(str, dynamicEntry);
      return dynamicEntry;
    };

    return { memberEntries, findMember };
  }, [activeTeamMembers]);

  // Filtered Agent Options matching search input
  const filteredAgentOptions = useMemo(() => {
    if (!agentSearch.trim()) return activeTeamMembers;
    const term = agentSearch.toLowerCase();
    return activeTeamMembers.filter(m => 
      m.emp_name.toLowerCase().includes(term) ||
      (m.email && m.email.toLowerCase().includes(term)) ||
      (m.emp_department && m.emp_department.toLowerCase().includes(term))
    );
  }, [activeTeamMembers, agentSearch]);

  const toggleAgentSelection = (agentId) => {
    setSelectedAgents(prev => {
      if (prev.includes(agentId)) {
        return prev.filter(id => id !== agentId);
      } else {
        return [...prev, agentId];
      }
    });
  };

  const removeAgentChip = (agentId) => {
    setSelectedAgents(prev => prev.filter(id => id !== agentId));
  };

  const dateBounds = useMemo(() => {
    return getDateFilterBounds(dateRangeFilter, customStartDate, customEndDate);
  }, [dateRangeFilter, customStartDate, customEndDate]);

  // Filter leads based on user role, selected employee chips & calendar date range
  const relevantLeads = useMemo(() => {
    let result = leads;

    // 1. Role-based scoping
    if (!canViewAll) {
      const assignedSteps = moduleAccess?.leads?.assigned_steps || [];
      result = result.filter(lead => {
        const isMyLead = lead.assigned_to === userId;
        const isUnassignedInMyStep = (!lead.assigned_to || lead.assigned_to === '') && 
          assignedSteps.some(step => lead.status && lead.status.startsWith(step.split(' - ')[0].replace(/^0/, '')));
        return isMyLead || isUnassignedInMyStep;
      });
    }

    // 2. Multi-Select Employee Filter Chips (For Admin/Manager)
    if (canViewAll && selectedAgents.length > 0) {
      result = result.filter(l => l.assigned_to && selectedAgents.includes(l.assigned_to));
    }

    // 3. Extended Calendar Date Range Filter
    if (!dateBounds.isAll) {
      result = result.filter(l => isLeadInDateBounds(l, dateBounds));
    }

    return result;
  }, [leads, canViewAll, userId, moduleAccess, selectedAgents, dateBounds]);

  // Key KPI Metrics
  const metrics = useMemo(() => {
    const total = relevantLeads.length;
    const todayStr = getLocalDateStr(new Date());

    let unassigned = 0;
    let dueToday = 0;
    let overdue = 0;
    let newLeads = 0;
    let inProgress = 0;
    let conversion = 0;

    for (let i = 0; i < relevantLeads.length; i++) {
      const l = relevantLeads[i];
      if (!l.assigned_to) unassigned++;
      
      const fDate = l.follow_up_date ? l.follow_up_date.split('T')[0] : null;
      if (fDate) {
        if (fDate === todayStr) dueToday++;
        else if (fDate < todayStr && !['Won', 'Lost', 'Closed', '07 - Final Stage'].includes(l.status)) overdue++;
      }

      const st = l.status || '';
      if (!st || st.startsWith('01') || st === 'New') newLeads++;
      else if (st.startsWith('02') || st.startsWith('03') || st.startsWith('04') || st.startsWith('05')) inProgress++;
      else if (st.startsWith('06') || st.startsWith('07') || st === 'Won') conversion++;
    }

    const winRate = total > 0 ? ((conversion / total) * 100).toFixed(1) : 0;

    return { total, unassigned, dueToday, overdue, newLeads, inProgress, conversion, winRate };
  }, [relevantLeads]);

  // Stage & Sub-Stage Breakdown Data
  const stageData = useMemo(() => {
    const STAGE_NAMES = [
      '01 - New Stage',
      '02 - Contact Stage',
      '03 - Qualification Stage',
      '04 - Follow Up Stage',
      '05 - Sales Process Stage',
      '06 - Conversion Stage',
      '07 - Final Stage'
    ];

    const stageMap = {
      1: { fullStage: '01 - New Stage', count: 0, subMap: {} },
      2: { fullStage: '02 - Contact Stage', count: 0, subMap: {} },
      3: { fullStage: '03 - Qualification Stage', count: 0, subMap: {} },
      4: { fullStage: '04 - Follow Up Stage', count: 0, subMap: {} },
      5: { fullStage: '05 - Sales Process Stage', count: 0, subMap: {} },
      6: { fullStage: '06 - Conversion Stage', count: 0, subMap: {} },
      7: { fullStage: '07 - Final Stage', count: 0, subMap: {} },
    };

    relevantLeads.forEach(l => {
      const stNum = getStageNumber(l.status);
      const target = stageMap[stNum] || stageMap[1];
      target.count++;

      let subName = 'General / Direct';
      if (l.status) {
        if (l.status.includes('>')) {
          const parts = l.status.split('>');
          subName = parts[parts.length - 1].trim() || parts[0];
        } else if (l.status.includes(';')) {
          const parts = l.status.split(';');
          subName = parts[parts.length - 1].trim();
        } else {
          subName = l.status;
        }
      }
      target.subMap[subName] = (target.subMap[subName] || 0) + 1;
    });

    return STAGE_NAMES.map((fullStage, idx) => {
      const target = stageMap[idx + 1];
      const substages = Object.keys(target.subMap).map(subLabel => ({
        label: subLabel,
        count: target.subMap[subLabel]
      })).sort((a, b) => b.count - a.count);

      return {
        stage: fullStage,
        shortName: fullStage.split(' - ')[1] || fullStage,
        count: target.count,
        substages,
        color: STAGE_COLORS[fullStage] || '#3b82f6'
      };
    });
  }, [relevantLeads]);

  // Team Lead Allocation & Action Summary Matrix in a SINGLE O(N) pass
  const teamAllocationSummary = useMemo(() => {
    if (!canViewAll || !activeTeamMembers.length) return [];

    const { memberEntries, findMember } = memberIndex;

    const summaryMap = new Map();
    memberEntries.forEach(entry => {
      summaryMap.set(entry.id, {
        id: entry.id,
        name: entry.name,
        dept: entry.dept,
        role: entry.role,
        leadsCreated: 0,
        stageChanges: 0,
        notesAdded: 0,
        stage1: 0,
        stage2: 0,
        stage3: 0,
        stage4: 0,
        stage5: 0,
        stage6: 0,
        stage7: 0,
        totalAssigned: 0
      });
    });

    leads.forEach(lead => {
      // 1. Leads Created
      const creator = findMember(lead.created_by) || findMember(lead.entry_by) || findMember(lead.user_id);
      if (creator) {
        const leadDate = lead.created_at || lead.lead_date;
        if (checkDateWithinBounds(leadDate, dateBounds)) {
          let item = summaryMap.get(creator.id);
          if (!item) {
            item = {
              id: creator.id,
              name: creator.name,
              dept: creator.dept || 'Management',
              role: creator.role || 'Admin',
              leadsCreated: 0,
              stageChanges: 0,
              notesAdded: 0,
              stage1: 0,
              stage2: 0,
              stage3: 0,
              stage4: 0,
              stage5: 0,
              stage6: 0,
              stage7: 0,
              totalAssigned: 0
            };
            summaryMap.set(creator.id, item);
          }
          item.leadsCreated++;
        }
      }

      // 2. Assigned Leads & Stage breakdown
      const assignee = findMember(lead.assigned_to);
      if (assignee) {
        let item = summaryMap.get(assignee.id);
        if (!item) {
          item = {
            id: assignee.id,
            name: assignee.name,
            dept: assignee.dept || 'Management',
            role: assignee.role || 'Admin',
            leadsCreated: 0,
            stageChanges: 0,
            notesAdded: 0,
            stage1: 0,
            stage2: 0,
            stage3: 0,
            stage4: 0,
            stage5: 0,
            stage6: 0,
            stage7: 0,
            totalAssigned: 0
          };
          summaryMap.set(assignee.id, item);
        }
        item.totalAssigned++;
        const stNum = getStageNumber(lead.status);
        if (stNum >= 1 && stNum <= 7) {
          item[`stage${stNum}`]++;
        } else {
          item.stage1++;
        }
      }

      // 3. Notes & Stage Changes
      if (Array.isArray(lead.lead_notes) && lead.lead_notes.length > 0) {
        lead.lead_notes.forEach(note => {
          if (checkDateWithinBounds(note.created_at, dateBounds)) {
            const rawAuthor = note.created_by ? String(note.created_by).trim() : '';
            const isSystemLog = !rawAuthor || 
              rawAuthor.toLowerCase() === 'system' || 
              rawAuthor.toLowerCase().includes('webhook') || 
              rawAuthor.toLowerCase().includes('bot') || 
              rawAuthor.toLowerCase().includes('automation');

            const noteAuthor = !isSystemLog ? findMember(rawAuthor) : null;
            
            if (noteAuthor) {
              const isStageChange = isStageChangeNote(note.note_text);
              const isAssignmentLog = isSystemLogOrAssignmentNote(note.note_text);
              
              if (!isAssignmentLog) {
                let item = summaryMap.get(noteAuthor.id);
                if (!item) {
                  item = {
                    id: noteAuthor.id,
                    name: noteAuthor.name,
                    dept: noteAuthor.dept || 'Management',
                    role: noteAuthor.role || 'Admin',
                    leadsCreated: 0,
                    stageChanges: 0,
                    notesAdded: 0,
                    stage1: 0,
                    stage2: 0,
                    stage3: 0,
                    stage4: 0,
                    stage5: 0,
                    stage6: 0,
                    stage7: 0,
                    totalAssigned: 0
                  };
                  summaryMap.set(noteAuthor.id, item);
                }
                item.notesAdded++;
                if (isStageChange) {
                  item.stageChanges++;
                }
              }
            }
          }
        });
      }
    });

    return Array.from(summaryMap.values()).filter(
      emp => (emp.leadsCreated > 0 || emp.stageChanges > 0 || emp.notesAdded > 0 || emp.totalAssigned > 0)
    );
  }, [canViewAll, leads, activeTeamMembers, memberIndex, dateBounds]);

  const handleTableSort = (key) => {
    if (tableSortKey === key) {
      setTableSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setTableSortKey(key);
      setTableSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const filteredAndSortedTeamSummary = useMemo(() => {
    let result = [...teamAllocationSummary];

    // Search filter
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      result = result.filter(item => 
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.dept && item.dept.toLowerCase().includes(q))
      );
    }

    // Sorting
    result.sort((a, b) => {
      let valA = a[tableSortKey];
      let valB = b[tableSortKey];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
        return tableSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      return tableSortDir === 'asc' ? valA - valB : valB - valA;
    });

    return result;
  }, [teamAllocationSummary, tableSearch, tableSortKey, tableSortDir]);

  const teamSummaryTotals = useMemo(() => {
    const totals = {
      leadsCreated: 0,
      stageChanges: 0,
      notesAdded: 0,
      stage1: 0,
      stage2: 0,
      stage3: 0,
      stage4: 0,
      stage5: 0,
      stage6: 0,
      stage7: 0,
      totalAssigned: 0
    };

    filteredAndSortedTeamSummary.forEach(item => {
      totals.leadsCreated += item.leadsCreated;
      totals.stageChanges += item.stageChanges;
      totals.notesAdded += item.notesAdded;
      totals.stage1 += item.stage1;
      totals.stage2 += item.stage2;
      totals.stage3 += item.stage3;
      totals.stage4 += item.stage4;
      totals.stage5 += item.stage5;
      totals.stage6 += item.stage6;
      totals.stage7 += item.stage7;
      totals.totalAssigned += item.totalAssigned;
    });

    return totals;
  }, [filteredAndSortedTeamSummary]);

  // Source Distribution Data
  const sourceData = useMemo(() => {
    const map = {};
    relevantLeads.forEach(l => {
      const src = l.source || 'Direct / Other';
      map[src] = (map[src] || 0) + 1;
    });

    return Object.keys(map).map(src => ({ name: src, value: map[src] }))
      .sort((a, b) => b.value - a.value);
  }, [relevantLeads]);

  // Urgent Today's Action Queue
  const urgentQueue = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return relevantLeads
      .filter(l => l.follow_up_date && l.follow_up_date <= todayStr)
      .sort((a, b) => (a.follow_up_date || '').localeCompare(b.follow_up_date || ''))
      .slice(0, 8);
  }, [relevantLeads]);

  // Single-pass computation for Hourly Work matrix
  const hourlyWorkData = useMemo(() => {
    const { findMember } = memberIndex;

    const slotsMap = new Map();
    HOURLY_SLOTS.forEach(slot => {
      slotsMap.set(slot.id, new Map());
    });

    const getOrCreateSlotMember = (subMap, author, slotId, slotLabel) => {
      if (!subMap || !author) return null;
      let item = subMap.get(author.id);
      if (!item) {
        item = {
          id: author.id,
          name: author.name,
          dept: author.dept || 'Management',
          role: author.role || 'Admin',
          slotId: slotId,
          slotLabel: slotLabel,
          leadsWorkedSet: new Set(),
          leadsWorked: 0,
          leadsCreated: 0,
          stageChanges: 0,
          remarksAdded: 0,
          notesAdded: 0,
          stage1: 0,
          stage2: 0,
          stage3: 0,
          stage4: 0,
          stage5: 0,
          stage6: 0,
          stage7: 0,
          totalActions: 0,
          totalAssigned: 0
        };
        subMap.set(author.id, item);
      }
      return item;
    };

    leads.forEach(lead => {
      // 1. Leads Created
      const creator = findMember(lead.created_by) || findMember(lead.entry_by) || findMember(lead.user_id);
      const leadDate = lead.created_at || lead.lead_date;
      if (creator && checkDateWithinBounds(leadDate, dateBounds)) {
        const hour = getLocalHour(leadDate);
        const slotId = getSlotIdForHour(hour);

        const slotMembers = slotsMap.get(slotId);
        if (slotMembers) {
          const item = getOrCreateSlotMember(slotMembers, creator, slotId, slotId);
          if (item) {
            item.leadsCreated++;
            item.totalActions++;
            if (lead.id) item.leadsWorkedSet.add(lead.id);
          }
        }
        const allMembers = slotsMap.get('all');
        if (allMembers) {
          const item = getOrCreateSlotMember(allMembers, creator, 'all', 'All Hours');
          if (item) {
            item.leadsCreated++;
            item.totalActions++;
            if (lead.id) item.leadsWorkedSet.add(lead.id);
          }
        }
      }

      // 2. Assigned Leads & Stage breakdown
      const assignee = findMember(lead.assigned_to);
      if (assignee) {
        const stNum = getStageNumber(lead.status);
        const allMembers = slotsMap.get('all');
        if (allMembers) {
          const item = getOrCreateSlotMember(allMembers, assignee, 'all', 'All Hours');
          if (item) {
            item.totalAssigned++;
            if (stNum >= 1 && stNum <= 7) item[`stage${stNum}`]++;
            else item.stage1++;
          }
        }
      }

      // 3. Notes & Stage Changes
      if (Array.isArray(lead.lead_notes) && lead.lead_notes.length > 0) {
        lead.lead_notes.forEach(note => {
          if (checkDateWithinBounds(note.created_at, dateBounds)) {
            const rawAuthor = note.created_by ? String(note.created_by).trim() : '';
            const isSystemLog = !rawAuthor || 
              rawAuthor.toLowerCase() === 'system' || 
              rawAuthor.toLowerCase().includes('webhook') || 
              rawAuthor.toLowerCase().includes('bot') || 
              rawAuthor.toLowerCase().includes('automation');

            const noteAuthor = !isSystemLog ? findMember(rawAuthor) : null;
            
            if (noteAuthor) {
              const isStageChange = isStageChangeNote(note.note_text);
              const isAssignmentLog = isSystemLogOrAssignmentNote(note.note_text);

              // Skip assignment and system logs from employee actions
              if (!isAssignmentLog) {
                const hour = getLocalHour(note.created_at);
                const slotId = getSlotIdForHour(hour);
                const stNum = getStageNumber(lead.status);

                // Specific slot
                const slotMembers = slotsMap.get(slotId);
                if (slotMembers) {
                  const item = getOrCreateSlotMember(slotMembers, noteAuthor, slotId, slotId);
                  if (item) {
                    item.notesAdded++;
                    if (lead.id) item.leadsWorkedSet.add(lead.id);
                    if (isStageChange) {
                      item.stageChanges++;
                      if (stNum >= 1 && stNum <= 7) item[`stage${stNum}`]++;
                      else item.stage1++;
                    } else {
                      item.remarksAdded++;
                    }
                    item.totalActions = item.leadsCreated + item.stageChanges + item.remarksAdded;
                  }
                }

                // 'all' slot
                const allMembers = slotsMap.get('all');
                if (allMembers) {
                  const item = getOrCreateSlotMember(allMembers, noteAuthor, 'all', 'All Hours');
                  if (item) {
                    item.notesAdded++;
                    if (lead.id) item.leadsWorkedSet.add(lead.id);
                    if (isStageChange) {
                      item.stageChanges++;
                    } else {
                      item.remarksAdded++;
                    }
                    item.totalActions = item.leadsCreated + item.stageChanges + item.remarksAdded;
                  }
                }
              }
            }
          }
        });
      }
    });

    // Populate leadsWorked counts from Set size
    slotsMap.forEach(memberSubMap => {
      memberSubMap.forEach(item => {
        item.leadsWorked = item.leadsWorkedSet ? item.leadsWorkedSet.size : 0;
      });
    });

    // Chart Data for Hourly Trend
    const hourlyChartData = HOURLY_SLOTS.filter(s => s.id !== 'all').map(slot => {
      const memberSubMap = slotsMap.get(slot.id);
      let totalWorked = 0;
      let totalCreated = 0;
      let totalStageChanges = 0;
      let totalRemarks = 0;
      let totalActions = 0;

      if (memberSubMap) {
        memberSubMap.forEach(item => {
          totalWorked += item.leadsWorked;
          totalCreated += item.leadsCreated;
          totalStageChanges += item.stageChanges;
          totalRemarks += item.remarksAdded;
          totalActions += item.totalActions;
        });
      }

      return {
        slot: slot.shortLabel,
        fullName: slot.label,
        slotId: slot.id,
        leadsWorked: totalWorked,
        leadsCreated: totalCreated,
        stageChanges: totalStageChanges,
        notesAdded: totalRemarks,
        totalActions
      };
    });

    // Calculate total actions across all hours
    const totalDayActions = hourlyChartData.reduce((acc, curr) => acc + curr.totalActions, 0);

    return { slotsMap, hourlyChartData, totalDayActions };
  }, [leads, memberIndex, dateBounds]);

  // Grouped Timeline Slots (Hour by Hour)
  const timelineSlots = useMemo(() => {
    const slots = HOURLY_SLOTS.filter(s => s.id !== 'all');
    const targetSlots = selectedHourlySlot === 'all' 
      ? slots 
      : slots.filter(s => s.id === selectedHourlySlot);

    return targetSlots.map(slot => {
      const subMap = hourlyWorkData.slotsMap.get(slot.id);
      let employees = subMap ? Array.from(subMap.values()) : [];

      if (canViewAll && selectedAgents.length > 0) {
        employees = employees.filter(e => selectedAgents.includes(e.id));
      }

      if (hourlyTableSearch.trim()) {
        const q = hourlyTableSearch.toLowerCase().trim();
        employees = employees.filter(e => 
          (e.name && e.name.toLowerCase().includes(q)) ||
          (e.dept && e.dept.toLowerCase().includes(q))
        );
      }

      // Filter to only employees who had actions in this specific hour
      const activeEmployees = employees.filter(e => e.totalActions > 0 || e.leadsCreated > 0 || e.stageChanges > 0 || e.notesAdded > 0 || e.leadsWorked > 0);

      // Sort
      activeEmployees.sort((a, b) => {
        let valA = a[hourlyTableSortKey];
        let valB = b[hourlyTableSortKey];

        if (typeof valA === 'string') {
          valA = valA.toLowerCase();
          valB = (valB || '').toLowerCase();
          return hourlyTableSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
        return hourlyTableSortDir === 'asc' ? valA - valB : valB - valA;
      });

      const totals = {
        leadsWorked: 0,
        leadsCreated: 0,
        stageChanges: 0,
        remarksAdded: 0,
        notesAdded: 0,
        stage1: 0,
        stage2: 0,
        stage3: 0,
        stage4: 0,
        stage5: 0,
        stage6: 0,
        stage7: 0,
        totalActions: 0
      };

      activeEmployees.forEach(e => {
        totals.leadsWorked += e.leadsWorked;
        totals.leadsCreated += e.leadsCreated;
        totals.stageChanges += e.stageChanges;
        totals.remarksAdded += e.remarksAdded;
        totals.notesAdded += e.notesAdded;
        totals.stage1 += e.stage1;
        totals.stage2 += e.stage2;
        totals.stage3 += e.stage3;
        totals.stage4 += e.stage4;
        totals.stage5 += e.stage5;
        totals.stage6 += e.stage6;
        totals.stage7 += e.stage7;
        totals.totalActions += e.totalActions;
      });

      return {
        slot,
        activeEmployees,
        totals,
        hasActivity: activeEmployees.length > 0
      };
    });
  }, [hourlyWorkData, selectedHourlySlot, selectedAgents, canViewAll, hourlyTableSearch, hourlyTableSortKey, hourlyTableSortDir]);

  // Flat timeline rows with prominent Time Slot column
  const flatHourlyRows = useMemo(() => {
    const rows = [];
    timelineSlots.forEach(t => {
      t.activeEmployees.forEach(emp => {
        rows.push({
          ...emp,
          slotLabel: t.slot.label,
          slotShort: t.slot.shortLabel,
          slotId: t.slot.id,
          startHour: t.slot.startHour
        });
      });
    });

    if (hourlyTableSortKey === 'time') {
      rows.sort((a, b) => {
        const hA = a.startHour ?? 99;
        const hB = b.startHour ?? 99;
        return hourlyTableSortDir === 'asc' ? hA - hB : hB - hA;
      });
    }

    return rows;
  }, [timelineSlots, hourlyTableSortKey, hourlyTableSortDir]);

  // Employee x Hours Matrix Grid
  const employeeHourlyMatrix = useMemo(() => {
    const { memberEntries } = memberIndex;
    const slots = HOURLY_SLOTS.filter(s => s.id !== 'all');

    let list = memberEntries.map(member => {
      const row = {
        id: member.id,
        name: member.name,
        dept: member.dept,
        role: member.role,
        slots: {},
        totalActions: 0,
        totalWorked: 0,
        totalLeads: 0,
        totalStages: 0,
        totalRemarks: 0,
        totalNotes: 0
      };

      slots.forEach(slot => {
        const slotMap = hourlyWorkData.slotsMap.get(slot.id);
        const memberData = slotMap?.get(member.id);
        const actions = memberData ? memberData.totalActions : 0;
        row.slots[slot.id] = {
          actions,
          worked: memberData?.leadsWorked || 0,
          leads: memberData?.leadsCreated || 0,
          stages: memberData?.stageChanges || 0,
          remarks: memberData?.remarksAdded || 0,
          notes: memberData?.notesAdded || 0
        };
        row.totalActions += actions;
        row.totalWorked += (memberData?.leadsWorked || 0);
        row.totalLeads += (memberData?.leadsCreated || 0);
        row.totalStages += (memberData?.stageChanges || 0);
        row.totalRemarks += (memberData?.remarksAdded || 0);
        row.totalNotes += (memberData?.notesAdded || 0);
      });

      return row;
    });

    if (canViewAll && selectedAgents.length > 0) {
      list = list.filter(item => selectedAgents.includes(item.id));
    }

    if (hourlyTableSearch.trim()) {
      const q = hourlyTableSearch.toLowerCase().trim();
      list = list.filter(item => 
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.dept && item.dept.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => b.totalActions - a.totalActions);
    return list.filter(e => e.totalActions > 0 || e.totalWorked > 0);
  }, [memberIndex, hourlyWorkData, selectedAgents, canViewAll, hourlyTableSearch]);

  const activeHourlyTotals = useMemo(() => {
    const totals = {
      leadsWorked: 0,
      leadsCreated: 0,
      stageChanges: 0,
      remarksAdded: 0,
      notesAdded: 0,
      stage1: 0,
      stage2: 0,
      stage3: 0,
      stage4: 0,
      stage5: 0,
      stage6: 0,
      stage7: 0,
      totalActions: 0,
      totalAssigned: 0
    };

    flatHourlyRows.forEach(item => {
      totals.leadsWorked += (item.leadsWorked || 0);
      totals.leadsCreated += item.leadsCreated;
      totals.stageChanges += item.stageChanges;
      totals.remarksAdded += (item.remarksAdded || 0);
      totals.notesAdded += item.notesAdded;
      totals.stage1 += item.stage1;
      totals.stage2 += item.stage2;
      totals.stage3 += item.stage3;
      totals.stage4 += item.stage4;
      totals.stage5 += item.stage5;
      totals.stage6 += item.stage6;
      totals.stage7 += item.stage7;
      totals.totalActions += item.totalActions;
      totals.totalAssigned += item.totalAssigned;
    });

    return totals;
  }, [flatHourlyRows]);

  const handleHourlySort = (key) => {
    if (hourlyTableSortKey === key) {
      setHourlyTableSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setHourlyTableSortKey(key);
      setHourlyTableSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  // Helper to trigger interactive drilldown popup
  const openDrilldown = (member, slot, metricKey, metricLabel) => {
    setDrilldownSearch('');
    setHourlyDrilldown({
      member,
      slotId: slot.id,
      slotLabel: slot.label,
      metricKey,
      metricLabel
    });
  };

  // Extract detailed action logs for the open drilldown modal
  const drilldownItems = useMemo(() => {
    if (!hourlyDrilldown) return [];
    const { member, slotId, metricKey } = hourlyDrilldown;
    const { findMember } = memberIndex;

    const items = [];
    const processedActionKeys = new Set();
    const uniqueLeadsMap = new Map(); // Dedicated deduplication map for 'leadsWorked'

    leads.forEach(lead => {
      const creator = findMember(lead.created_by) || findMember(lead.entry_by) || findMember(lead.user_id);
      const leadDate = lead.created_at || lead.lead_date;
      const leadHour = getLocalHour(leadDate);
      const leadSlotId = getSlotIdForHour(leadHour);

      // 1. Lead Creation Action
      if (creator && creator.id === member.id && checkDateWithinBounds(leadDate, dateBounds)) {
        if (slotId === 'all' || slotId === leadSlotId) {
          const isTargetStage = metricKey.startsWith('stage') && getStageNumber(lead.status) === Number(metricKey.replace('stage', ''));
          const shouldInclude = 
            metricKey === 'all' || 
            metricKey === 'totalActions' || 
            metricKey === 'leadsWorked' || 
            metricKey === 'leadsCreated' ||
            isTargetStage;

          if (shouldInclude) {
            const actionKey = `create-${lead.id}-${leadDate}`;
            if (!processedActionKeys.has(actionKey)) {
              processedActionKeys.add(actionKey);
              const itemObj = {
                id: actionKey,
                type: 'create',
                typeLabel: 'Lead Created',
                typeBadgeColor: '#059669',
                lead,
                leadId: lead.lead_ref_id || lead.lead_id || lead.lead_no || (lead.id ? String(lead.id).slice(0, 8) : '—'),
                businessName: lead.company || lead.company_name || lead.business_name || lead.firm_name || '—',
                contactPerson: lead.name || lead.contact_person || lead.client_name || lead.customer_name || '—',
                phone: lead.phone || lead.mobile || '—',
                stage: lead.status || '01 - New Stage',
                stageNum: getStageNumber(lead.status),
                timestamp: leadDate,
                noteText: lead.notes || lead.remarks || 'New lead registered in CRM',
                author: creator.name
              };

              if (metricKey === 'leadsWorked') {
                const leadKey = lead.id || lead.lead_ref_id;
                if (leadKey && !uniqueLeadsMap.has(leadKey)) {
                  uniqueLeadsMap.set(leadKey, itemObj);
                }
              } else {
                items.push(itemObj);
              }
            }
          }
        }
      }

      // 2. Notes & Stage Changes
      if (Array.isArray(lead.lead_notes) && lead.lead_notes.length > 0) {
        lead.lead_notes.forEach((note, nIdx) => {
          if (checkDateWithinBounds(note.created_at, dateBounds)) {
            const rawAuthor = note.created_by ? String(note.created_by).trim() : '';
            const isSystemLog = !rawAuthor || 
              rawAuthor.toLowerCase() === 'system' || 
              rawAuthor.toLowerCase().includes('webhook') || 
              rawAuthor.toLowerCase().includes('bot') || 
              rawAuthor.toLowerCase().includes('automation');

            const noteAuthor = !isSystemLog ? findMember(rawAuthor) : null;

            if (noteAuthor && noteAuthor.id === member.id) {
              const noteHour = getLocalHour(note.created_at);
              const noteSlotId = getSlotIdForHour(noteHour);

              if (slotId === 'all' || slotId === noteSlotId) {
                const isStageChange = isStageChangeNote(note.note_text);
                const isAssignmentLog = isSystemLogOrAssignmentNote(note.note_text);

                // Exclude system assignment logs from employee drilldown
                if (isAssignmentLog) return;

                const stNum = getStageNumber(lead.status);

                let shouldInclude = false;
                if (metricKey === 'all' || metricKey === 'totalActions' || metricKey === 'leadsWorked') {
                  shouldInclude = true;
                } else if (metricKey === 'stageChanges' && isStageChange) {
                  shouldInclude = true;
                } else if (metricKey === 'remarksAdded' && !isStageChange) {
                  shouldInclude = true;
                } else if (metricKey.startsWith('stage')) {
                  const targetStNum = Number(metricKey.replace('stage', ''));
                  shouldInclude = (stNum === targetStNum);
                }

                if (shouldInclude) {
                  const actionKey = `note-${note.id || nIdx}-${note.created_at}`;
                  if (!processedActionKeys.has(actionKey)) {
                    processedActionKeys.add(actionKey);
                    const itemObj = {
                      id: actionKey,
                      type: isStageChange ? 'stage_change' : 'remark',
                      typeLabel: isStageChange ? 'Stage Change' : 'Remark Note',
                      typeBadgeColor: isStageChange ? '#7c3aed' : '#d97706',
                      lead,
                      leadId: lead.lead_ref_id || lead.lead_id || lead.lead_no || (lead.id ? String(lead.id).slice(0, 8) : '—'),
                      businessName: lead.company || lead.company_name || lead.business_name || lead.firm_name || '—',
                      contactPerson: lead.name || lead.contact_person || lead.client_name || lead.customer_name || '—',
                      phone: lead.phone || lead.mobile || '—',
                      stage: lead.status || '01 - New Stage',
                      stageNum: stNum,
                      timestamp: note.created_at,
                      noteText: note.note_text || '—',
                      author: noteAuthor.name
                    };

                    if (metricKey === 'leadsWorked') {
                      const leadKey = lead.id || lead.lead_ref_id;
                      if (leadKey) {
                        const existing = uniqueLeadsMap.get(leadKey);
                        if (!existing || new Date(note.created_at || 0) > new Date(existing.timestamp || 0)) {
                          uniqueLeadsMap.set(leadKey, itemObj);
                        }
                      }
                    } else {
                      items.push(itemObj);
                    }
                  }
                }
              }
            }
          }
        });
      }
    });

    const resultList = metricKey === 'leadsWorked' ? Array.from(uniqueLeadsMap.values()) : items;
    resultList.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    return resultList;
  }, [hourlyDrilldown, leads, memberIndex, dateBounds]);

  const filteredDrilldownItems = useMemo(() => {
    if (!drilldownSearch.trim()) return drilldownItems;
    const q = drilldownSearch.toLowerCase().trim();
    return drilldownItems.filter(item => 
      String(item.leadId).toLowerCase().includes(q) ||
      String(item.businessName).toLowerCase().includes(q) ||
      String(item.contactPerson).toLowerCase().includes(q) ||
      String(item.phone).toLowerCase().includes(q) ||
      String(item.stage).toLowerCase().includes(q) ||
      String(item.noteText).toLowerCase().includes(q)
    );
  }, [drilldownItems, drilldownSearch]);

  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', background: 'var(--bg-primary, #f8fafc)', minHeight: '100%' }}>
      
      {/* Top Header & Interactive Filter Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--bg-surface)', padding: '1.1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={22} style={{ color: 'var(--accent-color)' }} />
              {canViewAll ? 'Enterprise Lead Dashboard' : `${userName}'s Lead Performance Dashboard`}
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {canViewAll ? 'Role-based summary across all team leads, pipeline stages, & agent allocations.' : 'Personalized summary of your assigned leads, stage progress, & urgent follow-ups.'}
            </p>
          </div>

          {/* Filter Bar Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            
            {/* Multi-Select Employee Filter with Chips (Admin / Manager Only) */}
            {canViewAll && (
              <div ref={agentDropdownRef} style={{ position: 'relative', minWidth: '220px' }}>
                <div 
                  onClick={() => setIsAgentDropdownOpen(!isAgentDropdownOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'space-between',
                    padding: '0.45rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-surface)',
                    cursor: 'pointer',
                    fontSize: '0.83rem',
                    color: 'var(--text-primary)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Users size={16} style={{ color: 'var(--accent-color)' }} />
                    <span style={{ fontWeight: 500 }}>
                      {selectedAgents.length === 0 ? 'All Employees' : `${selectedAgents.length} Selected`}
                    </span>
                  </div>
                  <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />
                </div>

                {isAgentDropdownOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '105%',
                    left: 0,
                    minWidth: '280px',
                    maxHeight: '260px',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    background: 'var(--bg-surface, #ffffff)',
                    border: '1px solid var(--border-light, #e2e8f0)',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.18)',
                    zIndex: 9999,
                    padding: '0.5rem'
                  }}>
                    <input
                      type="text"
                      autoComplete="off"
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                      placeholder="Search employee..."
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.65rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        fontSize: '0.83rem',
                        outline: 'none',
                        marginBottom: '0.5rem',
                        background: 'var(--bg-primary)'
                      }}
                    />

                    <div
                      onClick={() => { setSelectedAgents([]); setIsAgentDropdownOpen(false); }}
                      style={{
                        padding: '0.45rem 0.65rem',
                        cursor: 'pointer',
                        fontSize: '0.83rem',
                        fontWeight: 600,
                        color: selectedAgents.length === 0 ? '#2563eb' : 'var(--text-primary)',
                        background: selectedAgents.length === 0 ? '#eff6ff' : 'transparent',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justify: 'space-between',
                        marginBottom: '0.25rem'
                      }}
                    >
                      <span>👥 All Employees</span>
                      {selectedAgents.length === 0 && <Check size={14} style={{ color: '#2563eb' }} />}
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.25rem' }}>
                      {filteredAgentOptions.length > 0 ? (
                        filteredAgentOptions.map((m) => {
                          const agentId = m.user_id || m.id;
                          const isSelected = selectedAgents.includes(agentId);
                          return (
                            <div
                              key={agentId}
                              onClick={() => toggleAgentSelection(agentId)}
                              style={{
                                padding: '0.45rem 0.65rem',
                                cursor: 'pointer',
                                fontSize: '0.83rem',
                                background: isSelected ? '#eef2ff' : 'transparent',
                                color: isSelected ? '#4338ca' : 'var(--text-primary)',
                                fontWeight: isSelected ? 600 : 400,
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '0.15rem'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'var(--bg-primary, #f8fafc)';
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.background = isSelected ? '#eef2ff' : 'transparent';
                              }}
                            >
                              <div>
                                <div>{m.emp_name}</div>
                                {m.emp_department && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{m.emp_department}</div>}
                              </div>
                              {isSelected && <Check size={14} style={{ color: '#4338ca' }} />}
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No matching employees</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Extended Calendar Date Range Selector */}
            <DateRangePicker
              preset={dateRangeFilter}
              startDate={customStartDate}
              endDate={customEndDate}
              allowAllTime={true}
              title="Select Analytics Date Range"
              onChange={({ preset, startDate, endDate }) => {
                setDateRangeFilter(preset);
                setCustomStartDate(startDate);
                setCustomEndDate(endDate);
              }}
            />

          </div>
        </div>

        {/* Selected Employee Filter Chips Row */}
        {canViewAll && selectedAgents.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px border-light' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Active Filters:</span>
            {selectedAgents.map(agentId => {
              const agent = activeTeamMembers.find(m => (m.user_id === agentId || m.id === agentId));
              return (
                <span
                  key={agentId}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '16px',
                    background: '#eff6ff',
                    color: '#2563eb',
                    border: '1px solid #bfdbfe',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}
                >
                  🏷️ {agent ? agent.emp_name : agentId}
                  <X 
                    size={13} 
                    onClick={() => removeAgentChip(agentId)}
                    style={{ cursor: 'pointer', color: '#1e40af' }}
                  />
                </span>
              );
            })}
            <button
              onClick={() => setSelectedAgents([])}
              style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: '0.2rem 0.4rem' }}
            >
              Clear Chips
            </button>
          </div>
        )}

        {/* Navigation Sub-Tabs: Overview vs Hourly Work */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
          {canViewOverview && (
            <button
              onClick={() => setActiveDashboardTab('overview')}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '8px',
                border: activeDashboardTab === 'overview' ? '1px solid var(--accent-color, #3b82f6)' : '1px solid var(--border-light)',
                background: activeDashboardTab === 'overview' ? 'var(--accent-color, #3b82f6)' : 'var(--bg-primary, #f8fafc)',
                color: activeDashboardTab === 'overview' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: activeDashboardTab === 'overview' ? 700 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.85rem',
                transition: 'all 0.15s ease'
              }}
            >
              <Sparkles size={15} />
              <span>Overview & Pipeline</span>
            </button>
          )}

          {canViewHourlyWork && (
            <button
              onClick={() => setActiveDashboardTab('hourly')}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '8px',
                border: activeDashboardTab === 'hourly' ? '1px solid var(--accent-color, #3b82f6)' : '1px solid var(--border-light)',
                background: activeDashboardTab === 'hourly' ? 'var(--accent-color, #3b82f6)' : 'var(--bg-primary, #f8fafc)',
                color: activeDashboardTab === 'hourly' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: activeDashboardTab === 'hourly' ? 700 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.85rem',
                transition: 'all 0.15s ease'
              }}
            >
              <Timer size={15} />
              <span>Hourly Work</span>
              {hourlyWorkData.totalDayActions > 0 && (
                <span style={{
                  background: activeDashboardTab === 'hourly' ? 'rgba(255,255,255,0.25)' : '#e0e7ff',
                  color: activeDashboardTab === 'hourly' ? '#ffffff' : '#3730a3',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.1rem 0.45rem',
                  borderRadius: '10px'
                }}>
                  {hourlyWorkData.totalDayActions}
                </span>
              )}
            </button>
          )}
        </div>

      </div>

      {!canViewOverview && !canViewHourlyWork && (
        <div className="card" style={{ padding: '3rem', margin: '2rem auto', maxWidth: '600px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <h3 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Access Denied</h3>
          <p>You do not have permission to view Lead Dashboard or Hourly Work.</p>
        </div>
      )}

      {/* Overview Tab Content */}
      {activeDashboardTab === 'overview' && canViewOverview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* KPI Cards Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
        
        {/* Total Leads */}
        <div style={{ background: 'var(--bg-surface)', padding: '1.1rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{canViewAll ? 'Total System Leads' : 'My Total Leads'}</span>
            <div style={{ width: 36, height: 36, borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
              <Users size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.4rem' }}>{metrics.total}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <TrendingUp size={12} style={{ color: '#10b981' }} /> {metrics.winRate}% Conversion Rate
          </div>
        </div>

        {/* Follow-ups Due Today */}
        <div style={{ background: 'var(--bg-surface)', padding: '1.1rem', borderRadius: '12px', border: metrics.dueToday > 0 ? '1px solid #fde68a' : '1px solid var(--border-light)', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Due Today</span>
            <div style={{ width: 36, height: 36, borderRadius: '8px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: metrics.dueToday > 0 ? '#d97706' : 'var(--text-primary)', marginTop: '0.4rem' }}>{metrics.dueToday}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>Requires action today</div>
        </div>

        {/* Overdue Follow-ups */}
        <div style={{ background: 'var(--bg-surface)', padding: '1.1rem', borderRadius: '12px', border: metrics.overdue > 0 ? '1px solid #fca5a5' : '1px solid var(--border-light)', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Overdue Follow-ups</span>
            <div style={{ width: 36, height: 36, borderRadius: '8px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
              <AlertCircle size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: metrics.overdue > 0 ? '#ef4444' : 'var(--text-primary)', marginTop: '0.4rem' }}>{metrics.overdue}</div>
          <div style={{ fontSize: '0.75rem', color: metrics.overdue > 0 ? '#dc2626' : 'var(--text-secondary)', marginTop: '0.3rem' }}>Pending past due date</div>
        </div>

        {/* Unassigned Leads / New Leads */}
        <div style={{ background: 'var(--bg-surface)', padding: '1.1rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{canViewAll ? 'Unassigned Leads' : 'New Stage Leads'}</span>
            <div style={{ width: 36, height: 36, borderRadius: '8px', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
              <UserCheck size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.4rem' }}>
            {canViewAll ? metrics.unassigned : metrics.newLeads}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
            {canViewAll ? 'Open for allocation' : 'Fresh incoming leads'}
          </div>
        </div>

        {/* Conversions / Won */}
        <div style={{ background: 'var(--bg-surface)', padding: '1.1rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Converted / Final</span>
            <div style={{ width: 36, height: 36, borderRadius: '8px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#059669', marginTop: '0.4rem' }}>{metrics.conversion}</div>
          <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.3rem', fontWeight: 600 }}>Successfully converted</div>
        </div>

      </div>

      {/* Stage Breakdown Interactive Grid */}
      <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={18} style={{ color: 'var(--accent-color)' }} />
              Pipeline Stage Breakdown
            </h3>
            <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Click any stage card to jump directly to those filtered leads.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.85rem' }}>
          {stageData.map(item => (
            <div
              key={item.stage}
              onClick={() => onNavigateStage && onNavigateStage(item.stage)}
              style={{
                background: 'var(--bg-primary, #f8fafc)',
                padding: '1rem 0.85rem',
                borderRadius: '10px',
                border: `1px solid ${item.color}33`,
                borderLeft: `4px solid ${item.color}`,
                cursor: 'pointer',
                transition: 'transform 0.15s, boxShadow 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {item.stage.split(' - ')[0]}
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.shortName}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.6rem' }}>
                <span style={{ fontSize: '1.4rem', fontWeight: 800, color: item.color }}>{item.count}</span>
                <span style={{ fontSize: '0.72rem', color: item.color, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  View <ArrowRight size={12} />
                </span>
              </div>

              {/* Sub-stages count breakdown list */}
              {item.substages && item.substages.length > 0 && (
                <div style={{ marginTop: '0.65rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-light)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {item.substages.map(sub => (
                    <div key={sub.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '78%' }} title={sub.label}>
                        ↳ {sub.label}
                      </span>
                      <span style={{ fontWeight: 700, color: item.color, background: 'var(--bg-surface)', padding: '0.08rem 0.38rem', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.72rem' }}>
                        {sub.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Middle Grid: Charts & Action Queue */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
        
        {/* Stage Distribution Bar Chart */}
        <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Stage Lead Counts
          </h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                <XAxis dataKey="shortName" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} interval={0} angle={-25} textAnchor="end" />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <RechartsTooltip 
                  contentStyle={{ background: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }} 
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lead Source Pie Chart */}
        <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Lead Source Distribution
          </h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {sourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Admin / Manager Team Performance & Stage Allocation Matrix */}
      {canViewAll && teamAllocationSummary.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Users size={18} style={{ color: 'var(--accent-color)' }} />
                  Team Lead Allocation & Action Summary
                </h3>
                <span style={{ fontSize: '0.72rem', background: dateRangeFilter === 'today' ? '#ecfdf5' : 'var(--bg-primary, #f8fafc)', color: dateRangeFilter === 'today' ? '#059669' : 'var(--text-secondary)', padding: '0.15rem 0.55rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontWeight: 600 }}>
                  Period: {dateRangeFilter === 'all' ? 'All Time' : dateRangeFilter === 'today' ? 'Today' : dateRangeFilter === 'yesterday' ? 'Yesterday' : dateRangeFilter === 'this_week' ? 'This Week' : dateRangeFilter === 'last_week' ? 'Last Week' : dateRangeFilter === 'this_month' ? 'This Month' : dateRangeFilter === 'last_month' ? 'Last Month' : 'Custom Range'}
                </span>
              </div>
              <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Overview of leads created, stage transitions, and pipeline stage breakdown across all team members.
              </p>
            </div>

            {/* In-table Search Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Search member..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  style={{
                    padding: '0.4rem 0.65rem 0.4rem 1.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary, #f8fafc)',
                    fontSize: '0.8rem',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    width: '170px'
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                {/* Primary Header Row */}
                <tr style={{ background: 'var(--bg-primary, #f8fafc)', borderBottom: '1px solid var(--border-light)' }}>
                  <th 
                    rowSpan={2}
                    onClick={() => handleTableSort('name')}
                    title="Click to sort by Employee Name"
                    style={{ 
                      padding: '0.75rem 1rem', 
                      fontWeight: 600, 
                      color: 'var(--text-secondary)', 
                      textAlign: 'left', 
                      cursor: 'pointer', 
                      verticalAlign: 'middle', 
                      borderRight: '1px solid var(--border-light)', 
                      minWidth: '180px',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>Employee Name</span>
                      <ArrowUpDown size={13} style={{ opacity: tableSortKey === 'name' ? 1 : 0.35, color: tableSortKey === 'name' ? 'var(--accent-color)' : 'inherit' }} />
                    </div>
                  </th>

                  <th 
                    rowSpan={2}
                    onClick={() => handleTableSort('leadsCreated')}
                    title="Click to sort by Leads Created"
                    style={{ 
                      padding: '0.75rem 0.75rem', 
                      fontWeight: 600, 
                      color: 'var(--text-secondary)', 
                      textAlign: 'center', 
                      cursor: 'pointer', 
                      verticalAlign: 'middle', 
                      borderRight: '1px solid var(--border-light)', 
                      minWidth: '110px',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                      <span>Leads Created</span>
                      <ArrowUpDown size={13} style={{ opacity: tableSortKey === 'leadsCreated' ? 1 : 0.35, color: tableSortKey === 'leadsCreated' ? 'var(--accent-color)' : 'inherit' }} />
                    </div>
                  </th>

                  <th 
                    rowSpan={2}
                    onClick={() => handleTableSort('stageChanges')}
                    title="Click to sort by Stage Changes"
                    style={{ 
                      padding: '0.75rem 0.75rem', 
                      fontWeight: 600, 
                      color: 'var(--text-secondary)', 
                      textAlign: 'center', 
                      cursor: 'pointer', 
                      verticalAlign: 'middle', 
                      borderRight: '1px solid var(--border-light)', 
                      minWidth: '110px',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                      <span>Stage Changes</span>
                      <ArrowUpDown size={13} style={{ opacity: tableSortKey === 'stageChanges' ? 1 : 0.35, color: tableSortKey === 'stageChanges' ? 'var(--accent-color)' : 'inherit' }} />
                    </div>
                  </th>

                  <th 
                    rowSpan={2}
                    onClick={() => handleTableSort('notesAdded')}
                    title="Click to sort by Notes Added"
                    style={{ 
                      padding: '0.75rem 0.75rem', 
                      fontWeight: 600, 
                      color: 'var(--text-secondary)', 
                      textAlign: 'center', 
                      cursor: 'pointer', 
                      verticalAlign: 'middle', 
                      borderRight: '1px solid var(--border-light)', 
                      minWidth: '95px',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                      <span>Notes</span>
                      <ArrowUpDown size={13} style={{ opacity: tableSortKey === 'notesAdded' ? 1 : 0.35, color: tableSortKey === 'notesAdded' ? 'var(--accent-color)' : 'inherit' }} />
                    </div>
                  </th>

                  {/* Stage Breakdown Spanning Header */}
                  <th 
                    colSpan={7}
                    style={{ 
                      padding: '0.55rem 0.75rem', 
                      fontWeight: 700, 
                      color: 'var(--text-primary)', 
                      textAlign: 'center', 
                      borderRight: '1px solid var(--border-light)',
                      borderBottom: '1px solid var(--border-light)',
                      background: 'rgba(59, 130, 246, 0.04)',
                      fontSize: '0.82rem',
                      letterSpacing: '0.3px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <Layers size={14} style={{ color: 'var(--accent-color)' }} />
                      <span>Stage Breakdown</span>
                      <span style={{ fontSize: '0.72rem', background: 'var(--bg-surface)', padding: '0.1rem 0.45rem', borderRadius: '10px', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        Stages 1 – 7
                      </span>
                    </div>
                  </th>

                  <th 
                    rowSpan={2}
                    onClick={() => handleTableSort('totalAssigned')}
                    title="Click to sort by Total Assigned Leads"
                    style={{ 
                      padding: '0.75rem 0.75rem', 
                      fontWeight: 600, 
                      color: 'var(--text-secondary)', 
                      textAlign: 'center', 
                      cursor: 'pointer', 
                      verticalAlign: 'middle', 
                      minWidth: '110px',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                      <span>Total Assigned</span>
                      <ArrowUpDown size={13} style={{ opacity: tableSortKey === 'totalAssigned' ? 1 : 0.35, color: tableSortKey === 'totalAssigned' ? 'var(--accent-color)' : 'inherit' }} />
                    </div>
                  </th>
                </tr>

                {/* Sub-Header Row: Individual Stage Columns 1 to 7 */}
                <tr style={{ background: 'var(--bg-primary, #f8fafc)', borderBottom: '1px solid var(--border-light)' }}>
                  {PIPELINE_STAGES.map(stage => {
                    const key = `stage${stage.num}`;
                    const isSorted = tableSortKey === key;
                    return (
                      <th
                        key={stage.num}
                        onClick={() => handleTableSort(key)}
                        title={`Sort by ${stage.fullName}`}
                        style={{
                          padding: '0.45rem 0.4rem',
                          textAlign: 'center',
                          cursor: 'pointer',
                          borderRight: '1px solid var(--border-light)',
                          minWidth: '85px',
                          background: isSorted ? `${stage.color}15` : 'transparent',
                          transition: 'background 0.15s',
                          userSelect: 'none'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
                          <span style={{ 
                            fontWeight: 700, 
                            color: stage.color, 
                            fontSize: '0.78rem',
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.2rem' 
                          }}>
                            {stage.name}
                            {isSorted && <span style={{ fontSize: '0.65rem' }}>{tableSortDir === 'asc' ? '▲' : '▼'}</span>}
                          </span>
                          <span style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            {stage.label}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {filteredAndSortedTeamSummary.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No matching team members found.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedTeamSummary.map((item, idx) => {
                    const initials = (item.name || 'U')
                      .split(' ')
                      .filter(Boolean)
                      .map(p => p[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase();

                    return (
                      <tr 
                        key={item.id || idx}
                        style={{ 
                          borderBottom: '1px solid var(--border-light)',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.015)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        {/* Employee Name & Dept */}
                        <td style={{ padding: '0.65rem 1rem', borderRight: '1px solid var(--border-light)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <div style={{
                              width: '30px',
                              height: '30px',
                              borderRadius: '8px',
                              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                              color: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                              flexShrink: 0
                            }}>
                              {initials}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.86rem' }}>
                                {item.name}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                                {item.dept}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Leads Created */}
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>
                          {item.leadsCreated > 0 ? (
                            <span style={{ 
                              padding: '0.2rem 0.6rem', 
                              borderRadius: '12px', 
                              background: '#ecfdf5', 
                              color: '#059669', 
                              fontSize: '0.82rem', 
                              fontWeight: 700,
                              display: 'inline-block'
                            }}>
                              {item.leadsCreated}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', opacity: 0.35, fontSize: '0.82rem' }}>0</span>
                          )}
                        </td>

                        {/* Stage Changes */}
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>
                          {item.stageChanges > 0 ? (
                            <span style={{ 
                              padding: '0.2rem 0.6rem', 
                              borderRadius: '12px', 
                              background: '#f5f3ff', 
                              color: '#7c3aed', 
                              fontSize: '0.82rem', 
                              fontWeight: 700,
                              display: 'inline-block'
                            }}>
                              {item.stageChanges}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', opacity: 0.35, fontSize: '0.82rem' }}>0</span>
                          )}
                        </td>

                        {/* Notes Added */}
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>
                          {item.notesAdded > 0 ? (
                            <span style={{ 
                              padding: '0.2rem 0.6rem', 
                              borderRadius: '12px', 
                              background: '#fffbeb', 
                              color: '#d97706', 
                              fontSize: '0.82rem', 
                              fontWeight: 700,
                              display: 'inline-block'
                            }}>
                              {item.notesAdded}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', opacity: 0.35, fontSize: '0.82rem' }}>0</span>
                          )}
                        </td>

                        {/* Stage Breakdown 1 to 7 */}
                        {PIPELINE_STAGES.map(stage => {
                          const count = item[`stage${stage.num}`] || 0;
                          return (
                            <td 
                              key={stage.num} 
                              style={{ 
                                padding: '0.55rem 0.4rem', 
                                textAlign: 'center', 
                                borderRight: '1px solid var(--border-light)' 
                              }}
                            >
                              {count > 0 ? (
                                <span 
                                  onClick={() => onNavigateStage && onNavigateStage(stage.fullName)}
                                  title={`View ${count} leads in ${stage.fullName}`}
                                  style={{ 
                                    padding: '0.2rem 0.55rem', 
                                    borderRadius: '10px', 
                                    background: stage.bg, 
                                    color: stage.color, 
                                    fontSize: '0.8rem', 
                                    fontWeight: 700,
                                    display: 'inline-block',
                                    cursor: onNavigateStage ? 'pointer' : 'default',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                    transition: 'transform 0.1s'
                                  }}
                                >
                                  {count}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)', opacity: 0.3, fontSize: '0.8rem' }}>-</span>
                              )}
                            </td>
                          );
                        })}

                        {/* Total Assigned */}
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                          <span style={{ 
                            padding: '0.2rem 0.65rem', 
                            borderRadius: '12px', 
                            background: '#eff6ff', 
                            color: '#2563eb', 
                            fontSize: '0.82rem', 
                            fontWeight: 700,
                            display: 'inline-block'
                          }}>
                            {item.totalAssigned}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Summary Totals Footer */}
              {filteredAndSortedTeamSummary.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--bg-primary, #f8fafc)', borderTop: '2px solid var(--border-light)', fontWeight: 700 }}>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', borderRight: '1px solid var(--border-light)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>Total (Team Summary)</span>
                        <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          ({filteredAndSortedTeamSummary.length})
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', color: '#059669', borderRight: '1px solid var(--border-light)', fontSize: '0.86rem' }}>
                      {teamSummaryTotals.leadsCreated}
                    </td>

                    <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', color: '#7c3aed', borderRight: '1px solid var(--border-light)', fontSize: '0.86rem' }}>
                      {teamSummaryTotals.stageChanges}
                    </td>

                    <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', color: '#d97706', borderRight: '1px solid var(--border-light)', fontSize: '0.86rem' }}>
                      {teamSummaryTotals.notesAdded}
                    </td>

                    {PIPELINE_STAGES.map(stage => (
                      <td 
                        key={stage.num} 
                        style={{ 
                          padding: '0.75rem 0.4rem', 
                          textAlign: 'center', 
                          color: stage.color, 
                          borderRight: '1px solid var(--border-light)',
                          fontSize: '0.86rem' 
                        }}
                      >
                        {teamSummaryTotals[`stage${stage.num}`]}
                      </td>
                    ))}

                    <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', color: '#2563eb', fontSize: '0.86rem' }}>
                      {teamSummaryTotals.totalAssigned}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Urgent Action Queue Widget */}
      {urgentQueue.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={18} style={{ color: '#d97706' }} />
                Today's Urgent Follow-up Queue ({urgentQueue.length})
              </h3>
              <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Leads requiring immediate follow-up or scheduled for today.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.85rem' }}>
            {urgentQueue.map(lead => (
              <div 
                key={lead.id} 
                style={{ padding: '0.85rem 1rem', background: 'var(--bg-primary, #f8fafc)', borderRadius: '10px', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{lead.company || lead.name || 'Unnamed Business'}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    {lead.phone || lead.email || 'No Contact'} • Stage: <strong style={{ color: 'var(--accent-color)' }}>{lead.status?.split(';')[0]}</strong>
                  </div>
                </div>

                <button
                  onClick={() => onOpenProfile && onOpenProfile(lead, 'history')}
                  style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', background: 'var(--accent-color, #2563eb)', color: '#ffffff', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  View Profile
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )}

      {/* Hourly Work Tab Content */}
      {activeDashboardTab === 'hourly' && canViewHourlyWork && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Hourly Time Slot Selection Bar */}
          <div style={{ background: 'var(--bg-surface)', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={18} style={{ color: 'var(--accent-color)' }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  Hourly Time Slots:
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  (Click any 1-hour window to inspect team activity in that exact time slot)
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', background: '#eff6ff', color: '#1e40af', padding: '0.2rem 0.65rem', borderRadius: '6px', fontWeight: 700 }}>
                Active Slot: {HOURLY_SLOTS.find(s => s.id === selectedHourlySlot)?.label || 'All Hours'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.35rem', scrollbarWidth: 'thin' }}>
              {HOURLY_SLOTS.map(slot => {
                const isSelected = selectedHourlySlot === slot.id;
                const slotActions = slot.id === 'all' 
                  ? hourlyWorkData.totalDayActions 
                  : (hourlyWorkData.hourlyChartData.find(c => c.slotId === slot.id)?.totalActions || 0);

                return (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedHourlySlot(slot.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: '0.45rem 0.8rem',
                      borderRadius: '8px',
                      border: isSelected ? '1px solid var(--accent-color, #3b82f6)' : '1px solid var(--border-light)',
                      background: isSelected ? 'var(--accent-color, #3b82f6)' : 'var(--bg-primary, #f8fafc)',
                      color: isSelected ? '#ffffff' : 'var(--text-primary)',
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>{slot.label}</span>
                    <span style={{
                      fontSize: '0.72rem',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '8px',
                      background: isSelected ? 'rgba(255,255,255,0.25)' : (slotActions > 0 ? '#e0e7ff' : '#f1f5f9'),
                      color: isSelected ? '#ffffff' : (slotActions > 0 ? '#3730a3' : '#94a3b8'),
                      fontWeight: 700
                    }}>
                      {slotActions}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hourly Action Distribution Trend Chart */}
          <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Activity size={18} style={{ color: 'var(--accent-color)' }} />
                  Hourly Team Productivity Trend
                </h3>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Total output volume distribution across hourly intervals (Leads Created, Stage Changes, Remarks Added).
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.78rem', fontWeight: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#3b82f6' }}></span>
                  <span>Leads Created</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#10b981' }}></span>
                  <span>Stage Changes</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#f59e0b' }}></span>
                  <span>Notes Added</span>
                </div>
              </div>
            </div>

            <div style={{ height: '220px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyWorkData.hourlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light, #e2e8f0)" />
                  <XAxis dataKey="slot" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <RechartsTooltip 
                    contentStyle={{ background: 'var(--bg-surface, #ffffff)', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Bar dataKey="leadsCreated" name="Leads Created" fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="stageChanges" name="Stage Changes" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="notesAdded" name="Notes Added" fill="#f59e0b" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Hourly Work View Container (Timeline, Table, Matrix) */}
          <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 6px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* Header with Title, View Mode Switcher, and Search */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={18} style={{ color: 'var(--accent-color)' }} />
                    Hourly Work — Time-Wise Employee Breakdown
                  </h3>
                  <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#1e40af', padding: '0.15rem 0.55rem', borderRadius: '8px', border: '1px solid #bfdbfe', fontWeight: 700 }}>
                    Slot: {HOURLY_SLOTS.find(s => s.id === selectedHourlySlot)?.label || 'All Hours'}
                  </span>
                </div>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Time ke anusar employee actions (Leads Created, Stage Changes, Notes) ki live reporting.
                </p>
              </div>

              {/* Controls: View Mode Buttons + Search */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                
                {/* View Mode Toggle Buttons */}
                <div style={{ display: 'flex', background: 'var(--bg-primary, #f8fafc)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                  <button
                    onClick={() => setHourlyViewMode('timeline')}
                    title="Hour-by-Hour Timeline View"
                    style={{
                      padding: '0.35rem 0.65rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: hourlyViewMode === 'timeline' ? 'var(--accent-color, #3b82f6)' : 'transparent',
                      color: hourlyViewMode === 'timeline' ? '#ffffff' : 'var(--text-secondary)',
                      fontSize: '0.76rem',
                      fontWeight: hourlyViewMode === 'timeline' ? 700 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <Clock size={13} />
                    <span>Timeline (Hour-by-Hour)</span>
                  </button>

                  <button
                    onClick={() => setHourlyViewMode('table')}
                    title="Unified Table with Time Column"
                    style={{
                      padding: '0.35rem 0.65rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: hourlyViewMode === 'table' ? 'var(--accent-color, #3b82f6)' : 'transparent',
                      color: hourlyViewMode === 'table' ? '#ffffff' : 'var(--text-secondary)',
                      fontSize: '0.76rem',
                      fontWeight: hourlyViewMode === 'table' ? 700 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <Layers size={13} />
                    <span>Table View</span>
                  </button>

                  <button
                    onClick={() => setHourlyViewMode('matrix')}
                    title="Employee × Hours Grid Matrix"
                    style={{
                      padding: '0.35rem 0.65rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: hourlyViewMode === 'matrix' ? 'var(--accent-color, #3b82f6)' : 'transparent',
                      color: hourlyViewMode === 'matrix' ? '#ffffff' : 'var(--text-secondary)',
                      fontSize: '0.76rem',
                      fontWeight: hourlyViewMode === 'matrix' ? 700 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <Activity size={13} />
                    <span>Matrix Grid</span>
                  </button>
                </div>

                {/* In-table Search Bar */}
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    placeholder="Search member..."
                    value={hourlyTableSearch}
                    onChange={(e) => setHourlyTableSearch(e.target.value)}
                    style={{
                      padding: '0.4rem 0.65rem 0.4rem 1.85rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-primary, #f8fafc)',
                      fontSize: '0.8rem',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      width: '160px'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* VIEW 1: TIMELINE (Hour by Hour Grouped Cards) */}
            {hourlyViewMode === 'timeline' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {timelineSlots.map(tSlot => {
                  return (
                    <div 
                      key={tSlot.slot.id} 
                      style={{ 
                        border: '1px solid var(--border-light)', 
                        borderRadius: '10px', 
                        overflow: 'hidden',
                        background: 'var(--bg-surface)'
                      }}
                    >
                      {/* Slot Header with Time Slot and summary stats */}
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        background: tSlot.hasActivity ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-primary, #f8fafc)', 
                        padding: '0.65rem 1rem', 
                        borderBottom: tSlot.hasActivity ? '1px solid var(--border-light)' : 'none',
                        flexWrap: 'wrap',
                        gap: '0.5rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <Clock size={16} style={{ color: tSlot.hasActivity ? 'var(--accent-color, #3b82f6)' : 'var(--text-secondary)' }} />
                          <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                            ⏰ {tSlot.slot.label}
                          </span>
                          <span style={{ 
                            fontSize: '0.72rem', 
                            background: tSlot.hasActivity ? '#dbeafe' : 'var(--border-light)', 
                            color: tSlot.hasActivity ? '#1e40af' : 'var(--text-secondary)', 
                            padding: '0.12rem 0.5rem', 
                            borderRadius: '10px', 
                            fontWeight: 600 
                          }}>
                            {tSlot.activeEmployees.length} Active Member{tSlot.activeEmployees.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {tSlot.hasActivity ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.78rem', fontWeight: 600 }}>
                            <span style={{ color: '#2563eb' }}>
                              Leads Worked: <strong>{tSlot.totals.leadsWorked}</strong>
                            </span>
                            <span style={{ color: '#059669' }}>
                              Created: <strong>{tSlot.totals.leadsCreated}</strong>
                            </span>
                            <span style={{ color: '#7c3aed' }}>
                              Stage Changes: <strong>{tSlot.totals.stageChanges}</strong>
                            </span>
                            <span style={{ color: '#d97706' }}>
                              Remarks: <strong>{tSlot.totals.remarksAdded}</strong>
                            </span>
                            <span style={{ color: '#1e40af', background: '#eff6ff', padding: '0.15rem 0.55rem', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                              Total Actions: <strong>{tSlot.totals.totalActions}</strong>
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            No team actions in this hour
                          </span>
                        )}
                      </div>

                      {/* Active Members Table for this Time Slot */}
                      {tSlot.hasActivity && (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-primary, #f8fafc)', borderBottom: '1px solid var(--border-light)' }}>
                                <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', borderRight: '1px solid var(--border-light)', minWidth: '170px' }}>
                                  Employee Name
                                </th>
                                <th style={{ padding: '0.6rem 0.65rem', textAlign: 'center', fontWeight: 700, color: '#2563eb', borderRight: '1px solid var(--border-light)', minWidth: '95px' }}>
                                  Leads Worked
                                </th>
                                <th style={{ padding: '0.6rem 0.65rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', borderRight: '1px solid var(--border-light)', minWidth: '95px' }}>
                                  Leads Created
                                </th>
                                <th style={{ padding: '0.6rem 0.65rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', borderRight: '1px solid var(--border-light)', minWidth: '95px' }}>
                                  Stage Changes
                                </th>
                                <th style={{ padding: '0.6rem 0.65rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', borderRight: '1px solid var(--border-light)', minWidth: '80px' }}>
                                  Remarks
                                </th>
                                {PIPELINE_STAGES.map(stg => (
                                  <th key={stg.num} style={{ padding: '0.45rem 0.35rem', textAlign: 'center', fontWeight: 600, color: stg.color, borderRight: '1px solid var(--border-light)', fontSize: '0.72rem', minWidth: '40px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                      <span>S{stg.num}</span>
                                      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{stg.label}</span>
                                    </div>
                                  </th>
                                ))}
                                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)', background: 'rgba(59, 130, 246, 0.05)', minWidth: '95px' }}>
                                  Total Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {tSlot.activeEmployees.map((emp, idx) => {
                                const isEven = idx % 2 === 0;
                                return (
                                  <tr 
                                    key={emp.id} 
                                    style={{ 
                                      background: isEven ? 'var(--bg-surface)' : 'var(--bg-primary, #f8fafc)',
                                      borderBottom: '1px solid var(--border-light)'
                                    }}
                                  >
                                    <td style={{ padding: '0.55rem 1rem', borderRight: '1px solid var(--border-light)' }}>
                                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{emp.name}</div>
                                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{emp.dept} • {emp.role}</div>
                                    </td>

                                    {/* Leads Worked Clickable Button */}
                                    <td style={{ padding: '0.55rem 0.65rem', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>
                                      {emp.leadsWorked > 0 ? (
                                        <button
                                          onClick={() => openDrilldown(emp, tSlot.slot, 'leadsWorked', 'Leads Worked')}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.35rem', fontWeight: 700, color: '#2563eb', textDecoration: 'underline', textUnderlineOffset: '2px', fontSize: '0.84rem' }}
                                          title="Click to view detailed Lead ID, Business Name, CP Name and Notes"
                                        >
                                          {emp.leadsWorked}
                                        </button>
                                      ) : (
                                        <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                      )}
                                    </td>

                                    {/* Leads Created Clickable Button */}
                                    <td style={{ padding: '0.55rem 0.65rem', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>
                                      {emp.leadsCreated > 0 ? (
                                        <button
                                          onClick={() => openDrilldown(emp, tSlot.slot, 'leadsCreated', 'Leads Created')}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.35rem', fontWeight: 700, color: '#059669', textDecoration: 'underline', textUnderlineOffset: '2px', fontSize: '0.84rem' }}
                                          title="Click to view Created Leads"
                                        >
                                          {emp.leadsCreated}
                                        </button>
                                      ) : (
                                        <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                      )}
                                    </td>

                                    {/* Stage Changes Clickable Button */}
                                    <td style={{ padding: '0.55rem 0.65rem', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>
                                      {emp.stageChanges > 0 ? (
                                        <button
                                          onClick={() => openDrilldown(emp, tSlot.slot, 'stageChanges', 'Stage Changes')}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.35rem', fontWeight: 700, color: '#7c3aed', textDecoration: 'underline', textUnderlineOffset: '2px', fontSize: '0.84rem' }}
                                          title="Click to view Stage Changes"
                                        >
                                          {emp.stageChanges}
                                        </button>
                                      ) : (
                                        <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                      )}
                                    </td>

                                    {/* Remarks Clickable Button */}
                                    <td style={{ padding: '0.55rem 0.65rem', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>
                                      {emp.remarksAdded > 0 ? (
                                        <button
                                          onClick={() => openDrilldown(emp, tSlot.slot, 'remarksAdded', 'Remarks')}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.35rem', fontWeight: 700, color: '#d97706', textDecoration: 'underline', textUnderlineOffset: '2px', fontSize: '0.84rem' }}
                                          title="Click to view Remarks / Notes"
                                        >
                                          {emp.remarksAdded}
                                        </button>
                                      ) : (
                                        <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                      )}
                                    </td>

                                    {/* Stages 1 to 7 Clickable Buttons */}
                                    {PIPELINE_STAGES.map(stage => {
                                      const cnt = emp[`stage${stage.num}`] || 0;
                                      return (
                                        <td key={stage.num} style={{ padding: '0.55rem 0.35rem', textAlign: 'center', borderRight: '1px solid var(--border-light)', background: cnt > 0 ? `${stage.color}08` : 'transparent' }}>
                                          {cnt > 0 ? (
                                            <button
                                              onClick={() => openDrilldown(emp, tSlot.slot, `stage${stage.num}`, stage.fullName)}
                                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.2rem', fontWeight: 700, color: stage.color, textDecoration: 'underline', textUnderlineOffset: '2px', fontSize: '0.82rem' }}
                                              title={`Click to view ${stage.fullName} leads`}
                                            >
                                              {cnt}
                                            </button>
                                          ) : (
                                            <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                          )}
                                        </td>
                                      );
                                    })}

                                    {/* Total Actions Clickable Button */}
                                    <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center', background: 'rgba(59, 130, 246, 0.03)' }}>
                                      <button
                                        onClick={() => openDrilldown(emp, tSlot.slot, 'all', 'All Actions')}
                                        style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '6px', cursor: 'pointer', padding: '0.2rem 0.55rem', fontWeight: 800, color: '#1e40af', fontSize: '0.84rem' }}
                                        title="Click to view detailed Action Logs popup"
                                      >
                                        {emp.totalActions}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{ background: 'var(--bg-primary, #f8fafc)', fontWeight: 700, borderTop: '1px solid var(--border-light)' }}>
                                <td style={{ padding: '0.55rem 1rem', borderRight: '1px solid var(--border-light)' }}>
                                  Sub-Total ({tSlot.slot.shortLabel})
                                </td>
                                <td style={{ padding: '0.55rem 0.65rem', textAlign: 'center', color: '#2563eb', borderRight: '1px solid var(--border-light)' }}>
                                  {tSlot.totals.leadsWorked}
                                </td>
                                <td style={{ padding: '0.55rem 0.65rem', textAlign: 'center', color: '#059669', borderRight: '1px solid var(--border-light)' }}>
                                  {tSlot.totals.leadsCreated}
                                </td>
                                <td style={{ padding: '0.55rem 0.65rem', textAlign: 'center', color: '#7c3aed', borderRight: '1px solid var(--border-light)' }}>
                                  {tSlot.totals.stageChanges}
                                </td>
                                <td style={{ padding: '0.55rem 0.65rem', textAlign: 'center', color: '#d97706', borderRight: '1px solid var(--border-light)' }}>
                                  {tSlot.totals.remarksAdded}
                                </td>
                                {PIPELINE_STAGES.map(stg => (
                                  <td key={stg.num} style={{ padding: '0.55rem 0.35rem', textAlign: 'center', color: stg.color, borderRight: '1px solid var(--border-light)' }}>
                                    {tSlot.totals[`stage${stg.num}`]}
                                  </td>
                                ))}
                                <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center', color: '#2563eb', background: 'rgba(59, 130, 246, 0.06)' }}>
                                  {tSlot.totals.totalActions}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* VIEW 2: UNIFIED TABLE (with prominent Time Slot column) */}
            {hourlyViewMode === 'table' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-primary, #f8fafc)', borderBottom: '1px solid var(--border-light)' }}>
                      <th 
                        rowSpan={2}
                        onClick={() => handleHourlySort('time')}
                        title="Click to sort by Time Slot"
                        style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--accent-color)', textAlign: 'left', cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', minWidth: '140px' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Clock size={14} />
                          <span>Time Slot</span>
                          <ArrowUpDown size={12} />
                        </div>
                      </th>

                      <th 
                        rowSpan={2}
                        onClick={() => handleHourlySort('name')}
                        style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', minWidth: '160px' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>Employee Name</span>
                          <ArrowUpDown size={12} />
                        </div>
                      </th>

                      <th 
                        rowSpan={2}
                        onClick={() => handleHourlySort('leadsWorked')}
                        style={{ padding: '0.75rem 0.65rem', fontWeight: 700, color: '#2563eb', textAlign: 'center', cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', minWidth: '95px' }}
                      >
                        Leads Worked
                      </th>

                      <th 
                        rowSpan={2}
                        onClick={() => handleHourlySort('leadsCreated')}
                        style={{ padding: '0.75rem 0.65rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center', cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', minWidth: '95px' }}
                      >
                        Leads Created
                      </th>

                      <th 
                        rowSpan={2}
                        onClick={() => handleHourlySort('stageChanges')}
                        style={{ padding: '0.75rem 0.65rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center', cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', minWidth: '95px' }}
                      >
                        Stage Changes
                      </th>

                      <th 
                        rowSpan={2}
                        onClick={() => handleHourlySort('remarksAdded')}
                        style={{ padding: '0.75rem 0.65rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center', cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', minWidth: '80px' }}
                      >
                        Remarks
                      </th>

                      <th 
                        colSpan={7}
                        style={{ padding: '0.55rem 0.75rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', borderRight: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)', background: 'rgba(59, 130, 246, 0.04)', fontSize: '0.82rem' }}
                      >
                        Stage Breakdown (Stages 1 – 7)
                      </th>

                      <th 
                        rowSpan={2}
                        onClick={() => handleHourlySort('totalActions')}
                        style={{ padding: '0.75rem 0.75rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', cursor: 'pointer', verticalAlign: 'middle', minWidth: '95px', background: 'rgba(59, 130, 246, 0.05)' }}
                      >
                        Total Actions
                      </th>
                    </tr>

                    <tr style={{ background: 'var(--bg-primary, #f8fafc)', borderBottom: '1px solid var(--border-light)' }}>
                      {PIPELINE_STAGES.map(stage => (
                        <th key={stage.num} style={{ padding: '0.45rem 0.35rem', fontWeight: 600, color: stage.color, textAlign: 'center', fontSize: '0.73rem', borderRight: '1px solid var(--border-light)', minWidth: '40px' }}>
                          <span>S{stage.num}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {flatHourlyRows.length === 0 ? (
                      <tr>
                        <td colSpan={14} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          No hourly activity found for the selected filter.
                        </td>
                      </tr>
                    ) : (
                      flatHourlyRows.map((row, idx) => {
                        const isEven = idx % 2 === 0;
                        const targetSlot = HOURLY_SLOTS.find(s => s.id === row.slotId) || { id: row.slotId, label: row.slotLabel };
                        return (
                          <tr key={`${row.slotId}-${row.id}`} style={{ background: isEven ? 'var(--bg-surface)' : 'var(--bg-primary, #f8fafc)', borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '0.65rem 0.85rem', borderRight: '1px solid var(--border-light)', fontWeight: 600, color: '#1e40af', background: 'rgba(59, 130, 246, 0.02)' }}>
                              ⏰ {row.slotShort}
                            </td>
                            <td style={{ padding: '0.65rem 1rem', borderRight: '1px solid var(--border-light)' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.name}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{row.dept}</div>
                            </td>

                            {/* Leads Worked */}
                            <td style={{ padding: '0.65rem 0.65rem', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>
                              {row.leadsWorked > 0 ? (
                                <button
                                  onClick={() => openDrilldown(row, targetSlot, 'leadsWorked', 'Leads Worked')}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.35rem', fontWeight: 700, color: '#2563eb', textDecoration: 'underline', fontSize: '0.84rem' }}
                                  title="Click to view detailed Lead ID, Business Name, CP Name and Notes"
                                >
                                  {row.leadsWorked}
                                </button>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)' }}>—</span>
                              )}
                            </td>

                            {/* Leads Created */}
                            <td style={{ padding: '0.65rem 0.65rem', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>
                              {row.leadsCreated > 0 ? (
                                <button
                                  onClick={() => openDrilldown(row, targetSlot, 'leadsCreated', 'Leads Created')}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.35rem', fontWeight: 700, color: '#059669', textDecoration: 'underline', fontSize: '0.84rem' }}
                                  title="Click to view Created Leads"
                                >
                                  {row.leadsCreated}
                                </button>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)' }}>—</span>
                              )}
                            </td>

                            {/* Stage Changes */}
                            <td style={{ padding: '0.65rem 0.65rem', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>
                              {row.stageChanges > 0 ? (
                                <button
                                  onClick={() => openDrilldown(row, targetSlot, 'stageChanges', 'Stage Changes')}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.35rem', fontWeight: 700, color: '#7c3aed', textDecoration: 'underline', fontSize: '0.84rem' }}
                                  title="Click to view Stage Changes"
                                >
                                  {row.stageChanges}
                                </button>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)' }}>—</span>
                              )}
                            </td>

                            {/* Remarks */}
                            <td style={{ padding: '0.65rem 0.65rem', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>
                              {row.remarksAdded > 0 ? (
                                <button
                                  onClick={() => openDrilldown(row, targetSlot, 'remarksAdded', 'Remarks')}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.35rem', fontWeight: 700, color: '#d97706', textDecoration: 'underline', fontSize: '0.84rem' }}
                                  title="Click to view Remarks / Notes"
                                >
                                  {row.remarksAdded}
                                </button>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)' }}>—</span>
                              )}
                            </td>

                            {/* Stages 1 to 7 */}
                            {PIPELINE_STAGES.map(stage => {
                              const cnt = row[`stage${stage.num}`] || 0;
                              return (
                                <td key={stage.num} style={{ padding: '0.65rem 0.35rem', textAlign: 'center', borderRight: '1px solid var(--border-light)' }}>
                                  {cnt > 0 ? (
                                    <button
                                      onClick={() => openDrilldown(row, targetSlot, `stage${stage.num}`, stage.fullName)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.2rem', fontWeight: 700, color: stage.color, textDecoration: 'underline', fontSize: '0.82rem' }}
                                      title={`Click to view ${stage.fullName} leads`}
                                    >
                                      {cnt}
                                    </button>
                                  ) : (
                                    <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                  )}
                                </td>
                              );
                            })}

                            {/* Total Actions */}
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', background: 'rgba(59, 130, 246, 0.04)' }}>
                              <button
                                onClick={() => openDrilldown(row, targetSlot, 'all', 'All Actions')}
                                style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '6px', cursor: 'pointer', padding: '0.2rem 0.55rem', fontWeight: 800, color: '#1e40af', fontSize: '0.84rem' }}
                                title="Click to view detailed Action Logs popup"
                              >
                                {row.totalActions}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>

                  {flatHourlyRows.length > 0 && (
                    <tfoot>
                      <tr style={{ background: 'var(--bg-primary, #f8fafc)', borderTop: '2px solid var(--border-light)', fontWeight: 700 }}>
                        <td colSpan={2} style={{ padding: '0.75rem 1rem', borderRight: '1px solid var(--border-light)' }}>
                          Total ({flatHourlyRows.length} Hourly Slots Logged)
                        </td>
                        <td style={{ padding: '0.75rem 0.65rem', textAlign: 'center', color: '#2563eb', borderRight: '1px solid var(--border-light)' }}>
                          {activeHourlyTotals.leadsWorked}
                        </td>
                        <td style={{ padding: '0.75rem 0.65rem', textAlign: 'center', color: '#059669', borderRight: '1px solid var(--border-light)' }}>
                          {activeHourlyTotals.leadsCreated}
                        </td>
                        <td style={{ padding: '0.75rem 0.65rem', textAlign: 'center', color: '#7c3aed', borderRight: '1px solid var(--border-light)' }}>
                          {activeHourlyTotals.stageChanges}
                        </td>
                        <td style={{ padding: '0.75rem 0.65rem', textAlign: 'center', color: '#d97706', borderRight: '1px solid var(--border-light)' }}>
                          {activeHourlyTotals.remarksAdded}
                        </td>
                        {PIPELINE_STAGES.map(stage => (
                          <td key={stage.num} style={{ padding: '0.75rem 0.35rem', textAlign: 'center', color: stage.color, borderRight: '1px solid var(--border-light)' }}>
                            {activeHourlyTotals[`stage${stage.num}`]}
                          </td>
                        ))}
                        <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', color: '#2563eb', background: 'rgba(59, 130, 246, 0.08)' }}>
                          {activeHourlyTotals.totalActions}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* VIEW 3: EMPLOYEE × HOURS MATRIX GRID */}
            {hourlyViewMode === 'matrix' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-primary, #f8fafc)', borderBottom: '1px solid var(--border-light)' }}>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', borderRight: '1px solid var(--border-light)', minWidth: '180px' }}>
                        Employee Name
                      </th>
                      {HOURLY_SLOTS.filter(s => s.id !== 'all').map(slot => (
                        <th key={slot.id} style={{ padding: '0.6rem 0.4rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', borderRight: '1px solid var(--border-light)', minWidth: '55px', fontSize: '0.74rem' }}>
                          <div>{slot.shortLabel.split(' ')[0]}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{slot.shortLabel.split(' ')[1]}</div>
                        </th>
                      ))}
                      <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontWeight: 700, color: '#2563eb', background: 'rgba(59, 130, 246, 0.06)', minWidth: '90px' }}>
                        Total Day Output
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {employeeHourlyMatrix.length === 0 ? (
                      <tr>
                        <td colSpan={14} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          No employee activity recorded in this date range.
                        </td>
                      </tr>
                    ) : (
                      employeeHourlyMatrix.map((emp, idx) => {
                        const isEven = idx % 2 === 0;
                        return (
                          <tr key={emp.id} style={{ background: isEven ? 'var(--bg-surface)' : 'var(--bg-primary, #f8fafc)', borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '0.6rem 1rem', borderRight: '1px solid var(--border-light)' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{emp.name}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{emp.dept}</div>
                            </td>

                            {HOURLY_SLOTS.filter(s => s.id !== 'all').map(slot => {
                              const cell = emp.slots[slot.id];
                              const cnt = cell?.actions || 0;
                              return (
                                <td 
                                  key={slot.id} 
                                  style={{ 
                                    padding: '0.6rem 0.4rem', 
                                    textAlign: 'center', 
                                    borderRight: '1px solid var(--border-light)',
                                    background: cnt >= 20 ? 'rgba(59, 130, 246, 0.18)' : cnt >= 10 ? 'rgba(59, 130, 246, 0.10)' : cnt > 0 ? 'rgba(59, 130, 246, 0.04)' : 'transparent'
                                  }}
                                >
                                  {cnt > 0 ? (
                                    <button
                                      onClick={() => openDrilldown(emp, slot, 'all', `${slot.label} Actions`)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.2rem', fontWeight: 700, color: '#1e40af', textDecoration: 'underline', fontSize: '0.8rem' }}
                                      title={`Click to inspect ${emp.name} at ${slot.label}`}
                                    >
                                      {cnt}
                                    </button>
                                  ) : (
                                    <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                  )}
                                </td>
                              );
                            })}

                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', background: 'rgba(59, 130, 246, 0.06)' }}>
                              <button
                                onClick={() => openDrilldown(emp, { id: 'all', label: 'Full Day' }, 'all', 'Full Day Output')}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.2rem', fontWeight: 800, color: '#2563eb', textDecoration: 'underline', fontSize: '0.85rem' }}
                                title={`Click to view all full day logs for ${emp.name}`}
                              >
                                {emp.totalActions}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Hourly Action Drilldown Report Modal */}
      {hourlyDrilldown && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem'
          }}
          onClick={() => setHourlyDrilldown(null)}
        >
          <div 
            style={{
              background: 'var(--bg-surface, #ffffff)',
              width: '100%',
              maxWidth: '960px',
              maxHeight: '90vh',
              borderRadius: '16px',
              border: '1px solid var(--border-light, #e2e8f0)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-light, #e2e8f0)',
              background: 'var(--bg-primary, #f8fafc)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <FileText size={20} style={{ color: '#2563eb' }} />
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Hourly Activity & Lead Breakdown Report
                  </h3>
                  <span style={{
                    fontSize: '0.75rem',
                    background: '#dbeafe',
                    color: '#1e40af',
                    padding: '0.15rem 0.55rem',
                    borderRadius: '12px',
                    fontWeight: 700
                  }}>
                    {hourlyDrilldown.metricLabel}
                  </span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span>👤 Employee: <strong style={{ color: 'var(--text-primary)' }}>{hourlyDrilldown.member.name}</strong> ({hourlyDrilldown.member.dept || 'Sales'} • {hourlyDrilldown.member.role || 'Agent'})</span>
                  <span>•</span>
                  <span>⏰ Time Slot: <strong style={{ color: '#2563eb' }}>{hourlyDrilldown.slotLabel}</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{
                  fontSize: '0.8rem',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  fontWeight: 700
                }}>
                  Total Logs: {filteredDrilldownItems.length}
                </span>
                <button
                  onClick={() => setHourlyDrilldown(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '0.35rem',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Close Report (Esc)"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Filter & Search Bar */}
            <div style={{
              padding: '0.85rem 1.5rem',
              borderBottom: '1px solid var(--border-light, #e2e8f0)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              background: 'var(--bg-surface)'
            }}>
              {/* Metric Quick Switcher */}
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {[
                  { key: 'all', label: 'All Actions' },
                  { key: 'leadsWorked', label: 'Leads Worked' },
                  { key: 'leadsCreated', label: 'Created' },
                  { key: 'stageChanges', label: 'Stage Changes' },
                  { key: 'remarksAdded', label: 'Remarks' },
                ].map(btn => {
                  const isActive = hourlyDrilldown.metricKey === btn.key;
                  return (
                    <button
                      key={btn.key}
                      onClick={() => setHourlyDrilldown(prev => ({ ...prev, metricKey: btn.key, metricLabel: btn.label }))}
                      style={{
                        padding: '0.3rem 0.65rem',
                        borderRadius: '6px',
                        border: isActive ? '1px solid #2563eb' : '1px solid var(--border-light)',
                        background: isActive ? '#eff6ff' : 'var(--bg-primary, #f8fafc)',
                        color: isActive ? '#1e40af' : 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        fontWeight: isActive ? 700 : 500,
                        cursor: 'pointer'
                      }}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>

              {/* In-Modal Search Box */}
              <div style={{ position: 'relative', width: '260px' }}>
                <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Search lead, CP, business, note..."
                  value={drilldownSearch}
                  onChange={(e) => setDrilldownSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem 0.65rem 0.4rem 1.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-primary, #f8fafc)',
                    fontSize: '0.8rem',
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Modal Table Content */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-primary, #f8fafc)', borderBottom: '1px solid var(--border-light)' }}>
                  <tr>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: 'var(--text-secondary)', width: '40px', fontWeight: 600 }}>#</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, minWidth: '100px' }}>Lead ID</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, minWidth: '160px' }}>Business Name</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, minWidth: '140px' }}>Contact Person (CP)</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600, minWidth: '130px' }}>Stage</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600, minWidth: '110px' }}>Time (Timestamp)</th>
                    <th style={{ padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, minWidth: '220px' }}>Action & Remarks / Note</th>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600, width: '90px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrilldownItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Matching Action Logs Found</div>
                        <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>No leads or notes recorded under this metric for this time slot.</div>
                      </td>
                    </tr>
                  ) : (
                    filteredDrilldownItems.map((item, idx) => {
                      const stageColor = STAGE_COLORS[item.stage] || '#3b82f6';
                      return (
                        <tr 
                          key={item.id}
                          style={{
                            borderBottom: '1px solid var(--border-light)',
                            background: idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-primary, #f8fafc)'
                          }}
                        >
                          {/* Index */}
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                            {idx + 1}
                          </td>

                          {/* Lead ID */}
                          <td style={{ padding: '0.65rem 0.85rem' }}>
                            <button
                              onClick={() => {
                                setHourlyDrilldown(null);
                                onOpenProfile && onOpenProfile(item.lead, 'history');
                              }}
                              style={{
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                color: '#1e40af',
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                              title="Click to open Lead Profile"
                            >
                              <span>#{String(item.leadId || '').replace(/^#/, '')}</span>
                              <ExternalLink size={11} />
                            </button>
                          </td>

                          {/* Business Name */}
                          <td style={{ padding: '0.65rem 0.85rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                              {item.businessName}
                            </div>
                          </td>

                          {/* Contact Person */}
                          <td style={{ padding: '0.65rem 0.85rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {item.contactPerson}
                            </div>
                            {item.phone && item.phone !== '—' && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                                📞 {item.phone}
                              </div>
                            )}
                          </td>

                          {/* Stage */}
                          <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: stageColor,
                              background: `${stageColor}15`,
                              border: `1px solid ${stageColor}30`,
                              whiteSpace: 'nowrap'
                            }}>
                              {item.stage?.split(';')[0] || item.stage}
                            </span>
                          </td>

                          {/* Timestamp */}
                          <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                            <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.8rem' }}>
                              ⏰ {formatActionTimestamp(item.timestamp)}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                              {formatActionDate(item.timestamp)}
                            </div>
                          </td>

                          {/* Action Type & Note Text */}
                          <td style={{ padding: '0.65rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                              <span style={{
                                fontSize: '0.68rem',
                                padding: '0.1rem 0.45rem',
                                borderRadius: '4px',
                                fontWeight: 700,
                                background: `${item.typeBadgeColor}15`,
                                color: item.typeBadgeColor,
                                border: `1px solid ${item.typeBadgeColor}30`
                              }}>
                                {item.typeLabel}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.35 }}>
                              {item.noteText}
                            </div>
                          </td>

                          {/* Action Button */}
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                            <button
                              onClick={() => {
                                setHourlyDrilldown(null);
                                onOpenProfile && onOpenProfile(item.lead, 'history');
                              }}
                              style={{
                                padding: '0.35rem 0.65rem',
                                borderRadius: '6px',
                                background: 'var(--accent-color, #2563eb)',
                                color: '#ffffff',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              <Eye size={12} />
                              <span>Profile</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '0.75rem 1.5rem',
              borderTop: '1px solid var(--border-light, #e2e8f0)',
              background: 'var(--bg-primary, #f8fafc)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)'
            }}>
              <span>Showing <strong>{filteredDrilldownItems.length}</strong> action log records for <strong>{hourlyDrilldown.member.name}</strong></span>
              <button
                onClick={() => setHourlyDrilldown(null)}
                style={{
                  padding: '0.4rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
