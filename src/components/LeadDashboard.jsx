'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  Users, UserCheck, AlertCircle, Clock, CheckCircle2, TrendingUp, 
  PhoneCall, MessageSquare, Shield, Layers, ArrowRight, Sparkles, Filter, Calendar, X, ChevronDown, Check,
  Search, ArrowUpDown
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

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b'];

// Helper function for local YYYY-MM-DD string formatting (prevents UTC timezone desync)
function getLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Helper function for precise date range evaluation across all lead dates & notes
function isLeadInDateRange(lead, filterType, customStart, customEnd) {
  if (filterType === 'all') return true;
  if (!lead) return false;

  const todayStr = getLocalDateStr(new Date());

  // Collect all dates associated with the lead (creation, lead_date, follow_up, notes)
  const leadDates = [];
  if (lead.lead_date) leadDates.push(lead.lead_date.split('T')[0]);
  if (lead.created_at) leadDates.push(lead.created_at.split('T')[0]);
  if (lead.follow_up_date) leadDates.push(lead.follow_up_date.split('T')[0]);
  if (Array.isArray(lead.lead_notes)) {
    lead.lead_notes.forEach(n => {
      if (n.created_at) leadDates.push(n.created_at.split('T')[0]);
    });
  }

  if (leadDates.length === 0) return false;

  const now = new Date();

  if (filterType === 'today') {
    return leadDates.some(d => d === todayStr);
  }

  if (filterType === 'yesterday') {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yestStr = getLocalDateStr(yest);
    return leadDates.some(d => d === yestStr);
  }

  if (filterType === 'this_week') {
    const currentDay = now.getDay();
    const distanceToMon = (currentDay + 6) % 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - distanceToMon);
    const monStr = getLocalDateStr(mon);
    return leadDates.some(d => d >= monStr && d <= todayStr);
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

    const lastMonStr = getLocalDateStr(lastMon);
    const lastSunStr = getLocalDateStr(lastSun);
    return leadDates.some(d => d >= lastMonStr && d <= lastSunStr);
  }

  if (filterType === 'this_month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = getLocalDateStr(monthStart);
    return leadDates.some(d => d >= monthStartStr && d <= todayStr);
  }

  if (filterType === 'last_month') {
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const startStr = getLocalDateStr(lastMonthStart);
    const endStr = getLocalDateStr(lastMonthEnd);
    return leadDates.some(d => d >= startStr && d <= endStr);
  }

  if (filterType === 'custom') {
    return leadDates.some(d => {
      if (customStart && d < customStart) return false;
      if (customEnd && d > customEnd) return false;
      return true;
    });
  }

  return true;
}

// Evaluates whether a single date timestamp falls within the selected date filter range
function isDateWithinFilter(dateVal, filterType, customStart, customEnd) {
  if (filterType === 'all') return true;
  if (!dateVal) return false;
  
  const dStr = typeof dateVal === 'string' ? dateVal.split('T')[0] : getLocalDateStr(new Date(dateVal));
  const todayStr = getLocalDateStr(new Date());
  const now = new Date();

  if (filterType === 'today') {
    return dStr === todayStr;
  }
  if (filterType === 'yesterday') {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    return dStr === getLocalDateStr(yest);
  }
  if (filterType === 'this_week') {
    const currentDay = now.getDay();
    const distanceToMon = (currentDay + 6) % 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - distanceToMon);
    const monStr = getLocalDateStr(mon);
    return dStr >= monStr && dStr <= todayStr;
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
    return dStr >= getLocalDateStr(lastMon) && dStr <= getLocalDateStr(lastSun);
  }
  if (filterType === 'this_month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return dStr >= getLocalDateStr(monthStart) && dStr <= todayStr;
  }
  if (filterType === 'last_month') {
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    return dStr >= getLocalDateStr(lastMonthStart) && dStr <= getLocalDateStr(lastMonthEnd);
  }
  if (filterType === 'custom') {
    if (customStart && dStr < customStart) return false;
    if (customEnd && dStr > customEnd) return false;
    return true;
  }
  return true;
}

// Extracts numerical employee ID (4 to 6 digits) from strings like "Nitya Verma - 50745" or "50745"
function extractEmpId(str) {
  if (!str) return null;
  const match = String(str).match(/\b(\d{4,6})\b/);
  return match ? match[1] : null;
}

// Matches an employee identifier against a team member object (supports name variations, emp IDs, emails, UUIDs)
function isMatchingEmployee(identifier, member) {
  if (!identifier || !member) return false;
  const idStr = String(identifier).trim().toLowerCase();
  const mId = String(member.user_id || member.id || '').trim().toLowerCase();
  const mName = String(member.emp_name || '').trim().toLowerCase();
  const mEmail = String(member.email || '').trim().toLowerCase();
  const mPrefix = mEmail ? mEmail.split('@')[0].toLowerCase() : '';
  const mEmpId = String(member.emp_id || member.emp_code || '').trim().toLowerCase();

  // 1. Direct ID / UUID match
  if (mId && idStr === mId) return true;

  // 2. Direct Name / Email / Prefix match
  if (mName && idStr === mName) return true;
  if (mEmail && idStr === mEmail) return true;
  if (mPrefix && idStr === mPrefix) return true;

  // 3. Employee Code / ID matching (e.g. "50745" matches "Nitya - 50745" and "Nitya Verma - 50745")
  const idCode = extractEmpId(idStr);
  const memberCode = mEmpId || extractEmpId(mName) || extractEmpId(mId);
  if (idCode && memberCode && idCode === memberCode) return true;

  // 4. Exact Employee ID match
  if (mEmpId && idStr === mEmpId) return true;

  return false;
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

  // Table search and sorting states for Team Lead Allocation & Action Summary
  const [tableSearch, setTableSearch] = useState('');
  const [tableSortKey, setTableSortKey] = useState('totalAssigned');
  const [tableSortDir, setTableSortDir] = useState('desc');

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
    if (dateRangeFilter !== 'all') {
      result = result.filter(l => isLeadInDateRange(l, dateRangeFilter, customStartDate, customEndDate));
    }

    return result;
  }, [leads, canViewAll, userId, moduleAccess, selectedAgents, dateRangeFilter, customStartDate, customEndDate]);

  // Key KPI Metrics
  const metrics = useMemo(() => {
    const total = relevantLeads.length;
    const todayStr = getLocalDateStr(new Date());

    const unassigned = relevantLeads.filter(l => !l.assigned_to).length;
    const dueToday = relevantLeads.filter(l => l.follow_up_date && l.follow_up_date.split('T')[0] === todayStr).length;
    
    const overdue = relevantLeads.filter(l => {
      if (!l.follow_up_date) return false;
      return l.follow_up_date < todayStr && !['Won', 'Lost', 'Closed', '07 - Final Stage'].includes(l.status);
    }).length;

    const newLeads = relevantLeads.filter(l => !l.status || l.status.startsWith('01') || l.status === 'New').length;
    const inProgress = relevantLeads.filter(l => l.status && (l.status.startsWith('02') || l.status.startsWith('03') || l.status.startsWith('04') || l.status.startsWith('05'))).length;
    const conversion = relevantLeads.filter(l => l.status && (l.status.startsWith('06') || l.status.startsWith('07') || l.status === 'Won')).length;

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

    return STAGE_NAMES.map(fullStage => {
      const code = fullStage.split(' - ')[0].replace(/^0/, '');
      
      const stageLeads = relevantLeads.filter(l => {
        if (!l.status) return code === '1';
        return l.status.startsWith(code + ';') || l.status.startsWith(fullStage.split(' - ')[0]) || l.status === fullStage;
      });

      // Compute sub-stage lead counts
      const subMap = {};
      stageLeads.forEach(l => {
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
        subMap[subName] = (subMap[subName] || 0) + 1;
      });

      const substages = Object.keys(subMap).map(subLabel => ({
        label: subLabel,
        count: subMap[subLabel]
      })).sort((a, b) => b.count - a.count);

      return {
        stage: fullStage,
        shortName: fullStage.split(' - ')[1] || fullStage,
        count: stageLeads.length,
        substages,
        color: STAGE_COLORS[fullStage] || '#3b82f6'
      };
    });
  }, [relevantLeads]);

  // Team Lead Allocation & Action Summary Matrix (Leads Created, Stage Changes, 7-Stage Breakdown, Total Assigned)
  const teamAllocationSummary = useMemo(() => {
    if (!canViewAll) return [];

    // Filter leads within active date range for created count and stage change activity
    const dateFilteredLeads = leads.filter(l => isLeadInDateRange(l, dateRangeFilter, customStartDate, customEndDate));

    return activeTeamMembers.map(member => {
      // 1. Leads Created by this member strictly within the active date range
      let leadsCreated = 0;
      leads.forEach(lead => {
        const isCreatedByMember = 
          isMatchingEmployee(lead.created_by, member) ||
          isMatchingEmployee(lead.entry_by, member) ||
          (lead.user_id && isMatchingEmployee(lead.user_id, member));
        
        if (isCreatedByMember) {
          const leadDate = lead.created_at || lead.lead_date;
          if (isDateWithinFilter(leadDate, dateRangeFilter, customStartDate, customEndDate)) {
            leadsCreated++;
          }
        }
      });

      // 2. Stage Changes performed by this member strictly within the active date range
      let stageChanges = 0;
      leads.forEach(lead => {
        (lead.lead_notes || []).forEach(note => {
          if (isStageChangeNote(note.note_text) && isDateWithinFilter(note.created_at, dateRangeFilter, customStartDate, customEndDate)) {
            const isNoteAuthor = isMatchingEmployee(note.created_by, member) ||
              ((note.created_by === 'System' || note.created_by === 'Agent' || !note.created_by) && isMatchingEmployee(lead.assigned_to, member));
            if (isNoteAuthor) {
              stageChanges++;
            }
          }
        });
      });

      // 3. Notes Added (total remarks/communication notes) by this member strictly within the active date range
      let notesAdded = 0;
      leads.forEach(lead => {
        (lead.lead_notes || []).forEach(note => {
          if (isDateWithinFilter(note.created_at, dateRangeFilter, customStartDate, customEndDate)) {
            const isNoteAuthor = isMatchingEmployee(note.created_by, member) ||
              ((note.created_by === 'System' || note.created_by === 'Agent' || !note.created_by) && isMatchingEmployee(lead.assigned_to, member));
            if (isNoteAuthor) {
              notesAdded++;
            }
          }
        });
      });

      // 4. Stage Breakdown (Distribution of assigned leads across all 7 stages in current scope)
      const memberAssignedLeads = relevantLeads.filter(lead => isMatchingEmployee(lead.assigned_to, member));

      const stages = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
      memberAssignedLeads.forEach(lead => {
        const stNum = getStageNumber(lead.status);
        if (stages[stNum] !== undefined) {
          stages[stNum]++;
        } else {
          stages[1]++;
        }
      });

      const totalAssigned = memberAssignedLeads.length;

      return {
        id: member.user_id || member.id || member.emp_name,
        name: member.emp_name,
        dept: member.emp_department || 'Sales',
        role: member.role || 'Member',
        leadsCreated,
        stageChanges,
        notesAdded,
        stage1: stages[1],
        stage2: stages[2],
        stage3: stages[3],
        stage4: stages[4],
        stage5: stages[5],
        stage6: stages[6],
        stage7: stages[7],
        totalAssigned
      };
    }).filter(emp => (emp.leadsCreated > 0 || emp.stageChanges > 0 || emp.notesAdded > 0 || emp.totalAssigned > 0));
  }, [canViewAll, leads, relevantLeads, activeTeamMembers, dateRangeFilter, customStartDate, customEndDate]);

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

      </div>

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
  );
}
