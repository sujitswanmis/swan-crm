'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  Users, UserCheck, AlertCircle, Clock, CheckCircle2, TrendingUp, 
  PhoneCall, MessageSquare, Shield, Layers, ArrowRight, Sparkles, Filter, Calendar, X, ChevronDown, Check,
  Search, ArrowUpDown, Timer, Activity
} from 'lucide-react';

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
  if (isNaN(d.getTime())) return null;
  return d.getHours();
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
  if (bounds.isAll) return true;
  if (!dateVal) return false;
  const dStr = typeof dateVal === 'string' ? dateVal.split('T')[0] : getLocalDateStr(new Date(dateVal));
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

export default function LeadDashboard({ 
  leads = [], 
  teamMembers = [], 
  userRole = '', 
  userId = '', 
  userName = '', 
  moduleAccess = {}, 
  onNavigateStage, 
  onOpenProfile 
}) {
  const isAdmin = userRole === 'admin' || userRole === 'Admin';
  const isManager = Boolean(moduleAccess?.leads?.is_manager);
  const canViewAll = isAdmin || isManager;

  // Filter States
  const [dateRangeFilter, setDateRangeFilter] = useState('all'); // 'all', 'today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Multi-Select Employee Filter Chips state
  const [selectedAgents, setSelectedAgents] = useState([]); // Array of user_ids
  const [agentSearch, setAgentSearch] = useState('');
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const agentDropdownRef = useRef(null);
  // View Tab: 'overview' | 'hourly'
  const [activeDashboardTab, setActiveDashboardTab] = useState('overview');

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
      return null;
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
          const item = summaryMap.get(creator.id);
          if (item) item.leadsCreated++;
        }
      }

      // 2. Assigned Leads & Stage breakdown
      const assignee = findMember(lead.assigned_to);
      if (assignee) {
        const item = summaryMap.get(assignee.id);
        if (item) {
          item.totalAssigned++;
          const stNum = getStageNumber(lead.status);
          if (stNum >= 1 && stNum <= 7) {
            item[`stage${stNum}`]++;
          } else {
            item.stage1++;
          }
        }
      }

      // 3. Notes & Stage Changes
      if (Array.isArray(lead.lead_notes) && lead.lead_notes.length > 0) {
        lead.lead_notes.forEach(note => {
          if (checkDateWithinBounds(note.created_at, dateBounds)) {
            const noteAuthor = findMember(note.created_by) || 
              ((note.created_by === 'System' || note.created_by === 'Agent' || !note.created_by) ? assignee : null);
            
            if (noteAuthor) {
              const item = summaryMap.get(noteAuthor.id);
              if (item) {
                item.notesAdded++;
                if (isStageChangeNote(note.note_text)) {
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
    const { memberEntries, findMember } = memberIndex;

    const slotsMap = new Map();
    HOURLY_SLOTS.forEach(slot => {
      const memberSubMap = new Map();
      memberEntries.forEach(entry => {
        memberSubMap.set(entry.id, {
          id: entry.id,
          name: entry.name,
          dept: entry.dept,
          role: entry.role,
          slotId: slot.id,
          slotLabel: slot.label,
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
          totalActions: 0,
          totalAssigned: 0
        });
      });
      slotsMap.set(slot.id, memberSubMap);
    });

    const getSlotIdForHour = (hour) => {
      if (hour === null || hour === undefined) return 'h_other';
      if (hour >= 9 && hour <= 19) {
        const nextHour = hour + 1;
        const pad = (n) => String(n).padStart(2, '0');
        const candidate = `h${pad(hour)}_${pad(nextHour)}`;
        if (slotsMap.has(candidate)) return candidate;
      }
      return 'h_other';
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
          const item = slotMembers.get(creator.id);
          if (item) {
            item.leadsCreated++;
            item.totalActions++;
          }
        }
        const allMembers = slotsMap.get('all');
        if (allMembers) {
          const item = allMembers.get(creator.id);
          if (item) {
            item.leadsCreated++;
            item.totalActions++;
          }
        }
      }

      // 2. Assigned Leads & Stage breakdown
      const assignee = findMember(lead.assigned_to);
      if (assignee) {
        const stNum = getStageNumber(lead.status);
        const allMembers = slotsMap.get('all');
        if (allMembers) {
          const item = allMembers.get(assignee.id);
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
            const noteAuthor = findMember(note.created_by) || 
              ((note.created_by === 'System' || note.created_by === 'Agent' || !note.created_by) ? assignee : null);
            
            if (noteAuthor) {
              const hour = getLocalHour(note.created_at);
              const slotId = getSlotIdForHour(hour);
              const isStageChange = isStageChangeNote(note.note_text);
              const stNum = getStageNumber(lead.status);

              // Specific slot
              const slotMembers = slotsMap.get(slotId);
              if (slotMembers) {
                const item = slotMembers.get(noteAuthor.id);
                if (item) {
                  item.notesAdded++;
                  item.totalActions++;
                  if (isStageChange) {
                    item.stageChanges++;
                    if (stNum >= 1 && stNum <= 7) item[`stage${stNum}`]++;
                    else item.stage1++;
                  }
                }
              }

              // 'all' slot
              const allMembers = slotsMap.get('all');
              if (allMembers) {
                const item = allMembers.get(noteAuthor.id);
                if (item) {
                  item.notesAdded++;
                  item.totalActions++;
                  if (isStageChange) {
                    item.stageChanges++;
                  }
                }
              }
            }
          }
        });
      }
    });

    // Chart Data for Hourly Trend
    const hourlyChartData = HOURLY_SLOTS.filter(s => s.id !== 'all').map(slot => {
      const memberSubMap = slotsMap.get(slot.id);
      let totalCreated = 0;
      let totalStageChanges = 0;
      let totalNotes = 0;
      let totalActions = 0;

      if (memberSubMap) {
        memberSubMap.forEach(item => {
          totalCreated += item.leadsCreated;
          totalStageChanges += item.stageChanges;
          totalNotes += item.notesAdded;
          totalActions += item.totalActions;
        });
      }

      return {
        slot: slot.shortLabel,
        fullName: slot.label,
        slotId: slot.id,
        leadsCreated: totalCreated,
        stageChanges: totalStageChanges,
        notesAdded: totalNotes,
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
      const activeEmployees = employees.filter(e => e.totalActions > 0 || e.leadsCreated > 0 || e.stageChanges > 0 || e.notesAdded > 0);

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
        totalActions: 0
      };

      activeEmployees.forEach(e => {
        totals.leadsCreated += e.leadsCreated;
        totals.stageChanges += e.stageChanges;
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
        totalLeads: 0,
        totalStages: 0,
        totalNotes: 0
      };

      slots.forEach(slot => {
        const slotMap = hourlyWorkData.slotsMap.get(slot.id);
        const memberData = slotMap?.get(member.id);
        const actions = memberData ? memberData.totalActions : 0;
        row.slots[slot.id] = {
          actions,
          leads: memberData?.leadsCreated || 0,
          stages: memberData?.stageChanges || 0,
          notes: memberData?.notesAdded || 0
        };
        row.totalActions += actions;
        row.totalLeads += (memberData?.leadsCreated || 0);
        row.totalStages += (memberData?.stageChanges || 0);
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
    return list.filter(e => e.totalActions > 0);
  }, [memberIndex, hourlyWorkData, selectedAgents, canViewAll, hourlyTableSearch]);

  const activeHourlyTotals = useMemo(() => {
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
      totalActions: 0,
      totalAssigned: 0
    };

    flatHourlyRows.forEach(item => {
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
              <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value)}
                style={{ padding: '0.45rem 0.7rem', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.83rem', outline: 'none', fontWeight: 500 }}
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="this_week">This Week</option>
                <option value="last_week">Last Week</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            {/* Custom Date Pickers */}
            {dateRangeFilter === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.82rem', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.82rem', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                />
              </div>
            )}

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
        </div>

      </div>

      {/* Overview Tab Content */}
      {activeDashboardTab === 'overview' && (
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
      {activeDashboardTab === 'hourly' && (
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
                            <span style={{ color: '#059669' }}>Leads: <strong>{tSlot.totals.leadsCreated}</strong></span>
                            <span style={{ color: '#7c3aed' }}>Stage Changes: <strong>{tSlot.totals.stageChanges}</strong></span>
                            <span style={{ color: '#d97706' }}>Notes: <strong>{tSlot.totals.notesAdded}</strong></span>
                            <span style={{ color: '#2563eb', background: '#eff6ff', padding: '0.15rem 0.55rem', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
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
                                <th style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', borderRight: '1px solid var(--border-light)', minWidth: '180px' }}>
                                  Employee Name
                                </th>
                                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', borderRight: '1px solid var(--border-light)', minWidth: '100px' }}>
                                  Leads Created
                                </th>
                                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', borderRight: '1px solid var(--border-light)', minWidth: '100px' }}>
                                  Stage Changes
                                </th>
                                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', borderRight: '1px solid var(--border-light)', minWidth: '90px' }}>
                                  Notes
                                </th>
                                {PIPELINE_STAGES.map(stg => (
                                  <th key={stg.num} style={{ padding: '0.45rem 0.35rem', textAlign: 'center', fontWeight: 600, color: stg.color, borderRight: '1px solid var(--border-light)', fontSize: '0.72rem', minWidth: '42px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                      <span>S{stg.num}</span>
                                      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{stg.label}</span>
                                    </div>
                                  </th>
                                ))}
                                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)', background: 'rgba(59, 130, 246, 0.05)', minWidth: '100px' }}>
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
                                    <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center', borderRight: '1px solid var(--border-light)', fontWeight: emp.leadsCreated > 0 ? 700 : 400, color: emp.leadsCreated > 0 ? '#059669' : 'var(--text-secondary)' }}>
                                      {emp.leadsCreated > 0 ? emp.leadsCreated : '—'}
                                    </td>
                                    <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center', borderRight: '1px solid var(--border-light)', fontWeight: emp.stageChanges > 0 ? 700 : 400, color: emp.stageChanges > 0 ? '#7c3aed' : 'var(--text-secondary)' }}>
                                      {emp.stageChanges > 0 ? emp.stageChanges : '—'}
                                    </td>
                                    <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center', borderRight: '1px solid var(--border-light)', fontWeight: emp.notesAdded > 0 ? 700 : 400, color: emp.notesAdded > 0 ? '#d97706' : 'var(--text-secondary)' }}>
                                      {emp.notesAdded > 0 ? emp.notesAdded : '—'}
                                    </td>
                                    {PIPELINE_STAGES.map(stg => {
                                      const cnt = emp[`stage${stg.num}`] || 0;
                                      return (
                                        <td key={stg.num} style={{ padding: '0.55rem 0.35rem', textAlign: 'center', borderRight: '1px solid var(--border-light)', fontWeight: cnt > 0 ? 600 : 400, color: cnt > 0 ? stg.color : 'var(--text-secondary)', background: cnt > 0 ? `${stg.color}08` : 'transparent' }}>
                                          {cnt > 0 ? cnt : '—'}
                                        </td>
                                      );
                                    })}
                                    <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center', fontWeight: 700, color: '#2563eb', background: 'rgba(59, 130, 246, 0.03)' }}>
                                      {emp.totalActions}
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
                                <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center', color: '#059669', borderRight: '1px solid var(--border-light)' }}>
                                  {tSlot.totals.leadsCreated}
                                </td>
                                <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center', color: '#7c3aed', borderRight: '1px solid var(--border-light)' }}>
                                  {tSlot.totals.stageChanges}
                                </td>
                                <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center', color: '#d97706', borderRight: '1px solid var(--border-light)' }}>
                                  {tSlot.totals.notesAdded}
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
                        style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--accent-color)', textAlign: 'left', cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', minWidth: '150px' }}
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
                        style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left', cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', minWidth: '170px' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>Employee Name</span>
                          <ArrowUpDown size={12} />
                        </div>
                      </th>

                      <th 
                        rowSpan={2}
                        onClick={() => handleHourlySort('leadsCreated')}
                        style={{ padding: '0.75rem 0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center', cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', minWidth: '100px' }}
                      >
                        Leads Created
                      </th>

                      <th 
                        rowSpan={2}
                        onClick={() => handleHourlySort('stageChanges')}
                        style={{ padding: '0.75rem 0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center', cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', minWidth: '100px' }}
                      >
                        Stage Changes
                      </th>

                      <th 
                        rowSpan={2}
                        onClick={() => handleHourlySort('notesAdded')}
                        style={{ padding: '0.75rem 0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center', cursor: 'pointer', verticalAlign: 'middle', borderRight: '1px solid var(--border-light)', minWidth: '90px' }}
                      >
                        Notes
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
                        style={{ padding: '0.75rem 0.75rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', cursor: 'pointer', verticalAlign: 'middle', minWidth: '105px', background: 'rgba(59, 130, 246, 0.05)' }}
                      >
                        Total Actions
                      </th>
                    </tr>

                    <tr style={{ background: 'var(--bg-primary, #f8fafc)', borderBottom: '1px solid var(--border-light)' }}>
                      {PIPELINE_STAGES.map(stage => (
                        <th key={stage.num} style={{ padding: '0.45rem 0.35rem', fontWeight: 600, color: stage.color, textAlign: 'center', fontSize: '0.73rem', borderRight: '1px solid var(--border-light)', minWidth: '45px' }}>
                          <span>S{stage.num}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {flatHourlyRows.length === 0 ? (
                      <tr>
                        <td colSpan={13} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          No hourly activity found for the selected filter.
                        </td>
                      </tr>
                    ) : (
                      flatHourlyRows.map((row, idx) => {
                        const isEven = idx % 2 === 0;
                        return (
                          <tr key={`${row.slotId}-${row.id}`} style={{ background: isEven ? 'var(--bg-surface)' : 'var(--bg-primary, #f8fafc)', borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '0.65rem 0.85rem', borderRight: '1px solid var(--border-light)', fontWeight: 600, color: '#1e40af', background: 'rgba(59, 130, 246, 0.02)' }}>
                              ⏰ {row.slotShort}
                            </td>
                            <td style={{ padding: '0.65rem 1rem', borderRight: '1px solid var(--border-light)' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.name}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{row.dept}</div>
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', borderRight: '1px solid var(--border-light)', fontWeight: row.leadsCreated > 0 ? 700 : 400, color: row.leadsCreated > 0 ? '#059669' : 'var(--text-secondary)' }}>
                              {row.leadsCreated > 0 ? row.leadsCreated : '—'}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', borderRight: '1px solid var(--border-light)', fontWeight: row.stageChanges > 0 ? 700 : 400, color: row.stageChanges > 0 ? '#7c3aed' : 'var(--text-secondary)' }}>
                              {row.stageChanges > 0 ? row.stageChanges : '—'}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', borderRight: '1px solid var(--border-light)', fontWeight: row.notesAdded > 0 ? 700 : 400, color: row.notesAdded > 0 ? '#d97706' : 'var(--text-secondary)' }}>
                              {row.notesAdded > 0 ? row.notesAdded : '—'}
                            </td>
                            {PIPELINE_STAGES.map(stage => {
                              const cnt = row[`stage${stage.num}`] || 0;
                              return (
                                <td key={stage.num} style={{ padding: '0.65rem 0.35rem', textAlign: 'center', borderRight: '1px solid var(--border-light)', color: cnt > 0 ? stage.color : 'var(--text-secondary)', fontWeight: cnt > 0 ? 600 : 400 }}>
                                  {cnt > 0 ? cnt : '—'}
                                </td>
                              );
                            })}
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontWeight: 700, color: '#2563eb', background: 'rgba(59, 130, 246, 0.04)' }}>
                              {row.totalActions}
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
                        <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', color: '#059669', borderRight: '1px solid var(--border-light)' }}>
                          {activeHourlyTotals.leadsCreated}
                        </td>
                        <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', color: '#7c3aed', borderRight: '1px solid var(--border-light)' }}>
                          {activeHourlyTotals.stageChanges}
                        </td>
                        <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', color: '#d97706', borderRight: '1px solid var(--border-light)' }}>
                          {activeHourlyTotals.notesAdded}
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
                                  title={`${emp.name} at ${slot.label}: ${cnt} actions (Leads: ${cell?.leads || 0}, Stages: ${cell?.stages || 0}, Notes: ${cell?.notes || 0})`}
                                  style={{ 
                                    padding: '0.6rem 0.4rem', 
                                    textAlign: 'center', 
                                    borderRight: '1px solid var(--border-light)',
                                    fontWeight: cnt > 0 ? 700 : 400,
                                    color: cnt > 0 ? '#1e40af' : 'var(--text-secondary)',
                                    background: cnt >= 20 ? 'rgba(59, 130, 246, 0.18)' : cnt >= 10 ? 'rgba(59, 130, 246, 0.10)' : cnt > 0 ? 'rgba(59, 130, 246, 0.04)' : 'transparent'
                                  }}
                                >
                                  {cnt > 0 ? cnt : '—'}
                                </td>
                              );
                            })}

                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 800, color: '#2563eb', background: 'rgba(59, 130, 246, 0.06)' }}>
                              {emp.totalActions}
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

    </div>
  );
}
