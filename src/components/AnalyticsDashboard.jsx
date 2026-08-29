'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList
} from 'recharts';
import { getDashboardMetrics, getUserAssignedWorkSummary } from '@/app/actions/analytics';
import {
  Activity, Loader2, CheckSquare, ListTodo, Users, Clock, AlertTriangle,
  CheckCircle2, TrendingUp, Calendar, ArrowRight, Target, Sparkles,
  ShieldAlert, RefreshCw, Layers, PhoneCall, ExternalLink, User, Phone, Mail, Building2, MapPin,
  CalendarClock
} from 'lucide-react';
import DateRangePicker, { computeDateRange } from '@/components/common/DateRangePicker';

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
  const [datePreset, setDatePreset] = useState('today');
  const [startDate, setStartDate] = useState(() => computeDateRange('today').startDate);
  const [endDate, setEndDate] = useState(() => computeDateRange('today').endDate);
  
  // Find current user's team member record
  const myTeamMember = useMemo(() => {
    if (!teamMembers || teamMembers.length === 0) return null;
    return teamMembers.find(t => 
      (userEmail && (t.email?.toLowerCase() === userEmail?.toLowerCase() || t.user_id === userEmail)) ||
      (userName && t.emp_name && t.emp_name.toLowerCase() === userName.toLowerCase()) ||
      (userId && t.user_id === userId)
    );
  }, [teamMembers, userEmail, userName, userId]);

  // Default to user's assigned scope or 'All'
  const [selectedEmployee, setSelectedEmployee] = useState(() => {
    return myTeamMember?.user_id || 'All';
  });

  const [metrics, setMetrics] = useState({ employeeActivity: [], whatsappStats: { period: 0, total: 0 } });
  const [loading, setLoading] = useState(true);

  // Assigned Work State
  const [assignedWork, setAssignedWork] = useState({
    delegation: { total: 0, pending: 0, inProgress: 0, submitted: 0, completed: 0, overdue: 0, recentTasks: [] },
    checklists: { totalSlots: 0, completed: 0, completedLate: 0, pending: 0, complianceRate: 0, isSunday: false, items: [] },
    effectiveEmail: ''
  });
  const [loadingAssignedWork, setLoadingAssignedWork] = useState(true);
  const [activeWorkTab, setActiveWorkTab] = useState('leads'); // 'leads' | 'delegation' | 'checklists'
  const [taskFilter, setTaskFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'OVERDUE' | 'COMPLETED'
  const [leadFilter, setLeadFilter] = useState('ACTION_NEEDED'); // 'ACTION_NEEDED' | 'OVERDUE_FOLLOWUPS' | 'TODAY_FOLLOWUPS' | 'FOLLOW_UPS' | 'NEW' | 'PIPELINE' | 'WON' | 'ALL'

  const dateFilterLabel = (() => {
    if (datePreset === 'today') return 'Today';
    if (datePreset === 'yesterday') return 'Yesterday';
    if (datePreset === 'this_week') return 'This Week';
    if (datePreset === 'last_week') return 'Last Week';
    if (datePreset === 'this_month') return 'This Month';
    if (datePreset === 'last_month') return 'Last Month';
    if (datePreset === 'all_time') return 'All Time';
    if (startDate && endDate) {
      if (startDate === endDate) return startDate;
      return `${startDate} to ${endDate}`;
    }
    return 'Selected Period';
  })();

  // Find target employee information
  const selectedEmployeeObj = useMemo(() => {
    if (selectedEmployee === 'All') return null;
    return teamMembers.find(t => 
      t.user_id === selectedEmployee || 
      t.email === selectedEmployee || 
      (t.email && t.email.split('@')[0] === selectedEmployee) ||
      t.emp_name === selectedEmployee
    );
  }, [selectedEmployee, teamMembers]);

  const effectiveTargetEmail = useMemo(() => {
    if (selectedEmployee === 'All') {
      return '';
    }
    return selectedEmployeeObj?.email || selectedEmployee;
  }, [selectedEmployee, selectedEmployeeObj]);

  const viewingLabel = useMemo(() => {
    if (selectedEmployee === 'All') {
      return 'All Team Members';
    }
    if (selectedEmployeeObj?.emp_name) {
      return `${selectedEmployeeObj.emp_name} (${selectedEmployeeObj.email || selectedEmployee})`;
    }
    return selectedEmployee;
  }, [selectedEmployee, selectedEmployeeObj]);

  const isMyWorkSelected = useMemo(() => {
    if (selectedEmployee === 'All') return false;
    if (myTeamMember && (selectedEmployee === myTeamMember.user_id || selectedEmployee === myTeamMember.email)) return true;
    if (userEmail && (selectedEmployee === userEmail || selectedEmployeeObj?.email === userEmail)) return true;
    return false;
  }, [selectedEmployee, myTeamMember, userEmail, selectedEmployeeObj]);

  // Load Lead Activity & WhatsApp Metrics
  useEffect(() => {
    async function loadMetrics() {
      setLoading(true);
      const filteredLeads = selectedEmployee === 'All' 
        ? leads 
        : leads.filter(l => {
            if (l.assigned_to === selectedEmployee) return true;
            if (selectedEmployeeObj) {
              if (l.assigned_to === selectedEmployeeObj.email) return true;
              if (l.assigned_to === selectedEmployeeObj.emp_name) return true;
              if (l.assigned_to === selectedEmployeeObj.user_id) return true;
            }
            return false;
          });
        
      const leadIds = filteredLeads.map(l => l.id);
      if (leadIds.length > 0) {
        let startTimestamp = null;
        let endTimestamp = null;
        if (startDate) startTimestamp = new Date(`${startDate}T00:00:00.000Z`).getTime();
        if (endDate) endTimestamp = new Date(`${endDate}T23:59:59.999Z`).getTime();

        const employeeActivityMap = {};
        filteredLeads.forEach(lead => {
          (lead.lead_notes || []).forEach(note => {
            const noteTime = new Date(note.created_at).getTime();
            const afterStart = !startTimestamp || noteTime >= startTimestamp;
            const beforeEnd = !endTimestamp || noteTime <= endTimestamp;
            if (afterStart && beforeEnd) {
              let empIdOrEmail = note.created_by || 'System/Unknown';
              if (empIdOrEmail === 'System' || empIdOrEmail === 'Agent' || empIdOrEmail === 'System/Unknown') {
                 empIdOrEmail = lead.assigned_to || empIdOrEmail;
              }
              let empName = empIdOrEmail;
              
              if (teamMembers && teamMembers.length > 0) {
                 const tm = teamMembers.find(t => 
                   t.user_id === empIdOrEmail || 
                   t.email === empIdOrEmail || 
                   (t.email && t.email.split('@')[0] === empIdOrEmail) ||
                   t.emp_name === empIdOrEmail
                 );
                 if (tm && tm.emp_name) empName = tm.emp_name;
              }

              if (!employeeActivityMap[empName]) {
                 employeeActivityMap[empName] = { updates: 0, uniqueLeads: new Set() };
              }
              employeeActivityMap[empName].updates += 1;
              employeeActivityMap[empName].uniqueLeads.add(lead.id);
            }
          });
        });

        const localEmployeeActivity = Object.keys(employeeActivityMap).map(emp => ({
          employee: emp,
          actions: employeeActivityMap[emp].updates,
          uniqueLeads: employeeActivityMap[emp].uniqueLeads.size
        })).sort((a, b) => b.uniqueLeads - a.uniqueLeads);

        const res = await getDashboardMetrics(leadIds, datePreset === 'today' ? 'Today' : (datePreset === 'this_week' || datePreset === 'last_week') ? 'Last 7 Days' : (datePreset === 'this_month' || datePreset === 'last_month') ? 'This Month' : 'All Time');
        if (res.success) {
          setMetrics({
            employeeActivity: localEmployeeActivity,
            whatsappStats: res.data.whatsappStats
          });
        }
      } else {
        setMetrics({ employeeActivity: [], whatsappStats: { period: 0, total: 0 } });
      }
      setLoading(false);
    }
    loadMetrics();
  }, [leads, startDate, endDate, datePreset, selectedEmployee, selectedEmployeeObj, teamMembers]);

  // Load Assigned Work Summary (Delegation Tasks & Checklists)
  const fetchAssignedWork = async () => {
    setLoadingAssignedWork(true);
    try {
      const isAll = selectedEmployee === 'All';
      const res = await getUserAssignedWorkSummary({
        userEmail: userEmail,
        targetEmail: effectiveTargetEmail,
        isAllSelected: isAll,
        targetDate: new Date()
      });
      if (res?.success) {
        setAssignedWork(res.data);
      }
    } catch (err) {
      console.warn('Error loading assigned work summary:', err);
    } finally {
      setLoadingAssignedWork(false);
    }
  };

  useEffect(() => {
    fetchAssignedWork();
  }, [userEmail, effectiveTargetEmail, selectedEmployee]);

  // Stage categorization helper
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

  // Helper for cleaning and formatting Lead Name and Company
  const formatLeadDisplayName = (lead) => {
    const company = lead.company || lead.business_name || lead.customer_name;
    const person = lead.contact_person || (lead.name && lead.name !== lead.company ? lead.name : null);
    
    if (company && person && person !== 'Unnamed Lead') {
      return { title: company, subtitle: person, hasPerson: true };
    }
    if (company) {
      return { title: company, subtitle: lead.city ? `${lead.city}${lead.state ? `, ${lead.state}` : ''}` : null, hasPerson: false };
    }
    if (person && person !== 'Unnamed Lead') {
      return { title: person, subtitle: lead.city ? `${lead.city}` : null, hasPerson: true };
    }
    return { title: lead.lead_ref_id || `Lead #${lead.id}`, subtitle: null, hasPerson: false };
  };

  // Helper for cleaning and badge-styling status
  const formatLeadStatusBadge = (status) => {
    if (!status || status === 'None' || status === 'null' || status.toLowerCase() === 'new' || status.toLowerCase() === 'pending') {
      return { label: 'New Lead', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
    }
    let raw = status;
    if (raw.includes('>')) {
      raw = raw.split('>').pop().trim();
    } else if (raw.includes(';')) {
      raw = raw.split(';')[1]?.trim() || raw;
    }
    
    const lower = raw.toLowerCase();
    if (lower.includes('reschedule') || lower.includes('follow')) {
      return { label: raw, icon: '⏰', bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
    }
    if (lower.includes('won') || lower.includes('converted') || lower.includes('order received') || lower.includes('closed')) {
      return { label: raw, icon: '🏆', bg: '#dcfce7', color: '#15803d', border: '#86efac' };
    }
    if (lower.includes('not connected') || lower.includes('no response') || lower.includes('busy') || lower.includes('switched off')) {
      return { label: raw, icon: '📞', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
    }
    if (lower.includes('lost') || lower.includes('not interested') || lower.includes('junk') || lower.includes('invalid') || lower.includes('dropped')) {
      return { label: raw, icon: '❌', bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' };
    }
    if (lower.includes('contact') || lower.includes('qualif') || lower.includes('sales') || lower.includes('demo') || lower.includes('quotation')) {
      return { label: raw, icon: '⚡', bg: '#ede9fe', color: '#6d28d9', border: '#ddd6fe' };
    }
    return { label: raw, icon: '📌', bg: '#f3f4f6', color: '#374151', border: '#e5e7eb' };
  };

  const getLeadContactPhone = (lead) => {
    return lead.phone || lead.mobile || lead.business_contact_1 || lead.phone_number || lead.contact_no || lead.business_contact_2 || '';
  };

  // Synchronous filtered leads for currently selected employee
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

  // Lead Stage Counts
  const stageCounts = filteredLeadsSync.reduce((acc, lead) => {
    const stage = getStageFromStatus(lead.status);
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});

  const stageData = Object.keys(stageCounts).sort().map(stage => ({
    name: stage.split('- ')[1] || stage,
    count: stageCounts[stage]
  }));

  // Revenue by Source
  const revenueBySource = filteredLeadsSync.reduce((acc, lead) => {
    if (lead.status !== 'Lost' && lead.deal_value) {
      acc[lead.source] = (acc[lead.source] || 0) + Number(lead.deal_value);
    }
    return acc;
  }, {});

  const revenueData = Object.keys(revenueBySource).map(source => ({
    name: source,
    value: revenueBySource[source]
  }));

  // Assigned Leads Statistics
  const assignedLeadStats = useMemo(() => {
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
      return stage === '01 - New Stage' || l.status === 'New' || l.status === 'Pending' || !l.status || l.status === 'None';
    }).length;
    const followUps = filteredLeadsSync.filter(l => {
      const stage = getStageFromStatus(l.status);
      return stage === '04 - Follow Up Stage' || (l.status && l.status.toLowerCase().includes('reschedule')) || (l.status && l.status.toLowerCase().includes('follow'));
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

  // Tabbed Filtered Leads List
  const displayedLeads = useMemo(() => {
    let list = filteredLeadsSync;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (leadFilter === 'ACTION_NEEDED') {
      list = list.filter(l => {
        const stage = getStageFromStatus(l.status);
        const isFollowUp = stage === '04 - Follow Up Stage' || (l.status && l.status.toLowerCase().includes('reschedule')) || (l.status && l.status.toLowerCase().includes('follow'));
        const isNew = stage === '01 - New Stage' || l.status === 'New' || l.status === 'Pending' || !l.status || l.status === 'None';
        return isFollowUp || isNew;
      });
    } else if (leadFilter === 'OVERDUE_FOLLOWUPS') {
      list = list.filter(l => {
        const fDateStr = l.follow_up_date || l.next_follow_up_date;
        if (!fDateStr) return false;
        const d = new Date(fDateStr);
        return !isNaN(d.getTime()) && d.toISOString().split('T')[0] < todayStr;
      });
    } else if (leadFilter === 'TODAY_FOLLOWUPS') {
      list = list.filter(l => {
        const fDateStr = l.follow_up_date || l.next_follow_up_date;
        if (!fDateStr) return false;
        const d = new Date(fDateStr);
        return !isNaN(d.getTime()) && d.toISOString().split('T')[0] === todayStr;
      });
    } else if (leadFilter === 'FOLLOW_UPS') {
      list = list.filter(l => {
        const stage = getStageFromStatus(l.status);
        return stage === '04 - Follow Up Stage' || (l.status && l.status.toLowerCase().includes('reschedule')) || (l.status && l.status.toLowerCase().includes('follow'));
      });
    } else if (leadFilter === 'NEW') {
      list = list.filter(l => {
        const stage = getStageFromStatus(l.status);
        return stage === '01 - New Stage' || l.status === 'New' || l.status === 'Pending' || !l.status || l.status === 'None';
      });
    } else if (leadFilter === 'PIPELINE') {
      list = list.filter(l => {
        const stage = getStageFromStatus(l.status);
        return ['02 - Contact Stage', '03 - Qualification Stage', '05 - Sales Process Stage', '06 - Conversion Stage'].includes(stage);
      });
    } else if (leadFilter === 'WON') {
      list = list.filter(l => {
        const stage = getStageFromStatus(l.status);
        return stage === '07 - Final Stage' && (l.status?.includes('Won') || l.status?.includes('Converted') || l.status?.includes('Closed') || l.status?.includes('Order Received'));
      });
    }
    return list;
  }, [filteredLeadsSync, leadFilter]);

  // Overall Health / Assigned Work Summary Stats
  const delegation = assignedWork.delegation || { total: 0, pending: 0, inProgress: 0, submitted: 0, completed: 0, overdue: 0, recentTasks: [] };
  const checklists = assignedWork.checklists || { totalSlots: 0, completed: 0, completedLate: 0, pending: 0, complianceRate: 0, isSunday: false, items: [] };

  // Weighted Work Health Score
  const overallCompletionScore = useMemo(() => {
    const hasTasks = delegation.total > 0;
    const taskScore = hasTasks ? Math.round((delegation.completed / delegation.total) * 100) : null;
    
    const hasChecklists = checklists.totalSlots > 0;
    const checklistScore = hasChecklists ? checklists.complianceRate : null;
    
    // For leads: % of assigned leads that are already handled / moved through pipeline vs pending fresh / follow-ups
    const totalLeads = assignedLeadStats.total;
    const pendingLeads = assignedLeadStats.actionNeeded;
    const leadActionScore = totalLeads > 0 
      ? Math.max(0, Math.min(100, Math.round(((totalLeads - pendingLeads) / totalLeads) * 100))) 
      : 100;

    if (hasTasks && hasChecklists) {
      return Math.round((taskScore * 0.4) + (checklistScore * 0.4) + (leadActionScore * 0.2));
    }
    if (hasTasks) {
      return Math.round((taskScore * 0.6) + (leadActionScore * 0.4));
    }
    if (hasChecklists) {
      return Math.round((checklistScore * 0.7) + (leadActionScore * 0.3));
    }
    return leadActionScore;
  }, [delegation, checklists, assignedLeadStats]);

  const totalPendingActionItems = delegation.pending + delegation.inProgress + checklists.pending + assignedLeadStats.actionNeeded;
  const totalOverdueAlerts = Number(delegation.overdue || 0) + Number(checklists.completedLate || 0) + Number(assignedLeadStats.overdueFollowups || 0);

  // Filtered Delegation Tasks for Table View
  const filteredTasks = useMemo(() => {
    const list = delegation.recentTasks || [];
    if (taskFilter === 'PENDING') {
      return list.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
    }
    if (taskFilter === 'OVERDUE') {
      return list.filter(t => t.is_overdue);
    }
    if (taskFilter === 'COMPLETED') {
      return list.filter(t => t.status === 'COMPLETED');
    }
    return list;
  }, [delegation.recentTasks, taskFilter]);

  // Priority styling helper
  const getPriorityBadge = (p) => {
    const priority = (p || 'MEDIUM').toUpperCase();
    if (priority === 'URGENT') return { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' };
    if (priority === 'HIGH') return { bg: '#ffedd5', color: '#c2410c', border: '#fdba74' };
    if (priority === 'LOW') return { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
    return { bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' };
  };

  const getStatusBadge = (s, isOverdue) => {
    if (s === 'COMPLETED') return { label: 'Completed', bg: '#dcfce7', color: '#15803d', border: '#86efac' };
    if (s === 'SUBMITTED') return { label: 'In Review', bg: '#fef3c7', color: '#b45309', border: '#fcd34d' };
    if (s === 'IN_PROGRESS') return { label: 'In Progress', bg: '#e0e7ff', color: '#4338ca', border: '#a5b4fc' };
    if (isOverdue) return { label: 'Overdue', bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' };
    return { label: 'Pending', bg: '#f3f4f6', color: '#4b5563', border: '#d1d5db' };
  };

  const formatDeadline = (dateStr) => {
    if (!dateStr) return 'No Deadline';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    
    const formatted = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    if (diffMs < 0) {
      const pastHours = Math.abs(diffHours);
      if (pastHours < 24) return `${formatted} (Overdue by ${pastHours}h)`;
      return `${formatted} (Overdue by ${Math.floor(pastHours / 24)}d)`;
    }
    if (diffHours <= 24) return `${formatted} (Due in ${diffHours}h)`;
    return formatted;
  };

  const formatFollowUpDue = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const targetStr = d.toISOString().split('T')[0];
    
    const formatted = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    if (targetStr < todayStr) {
      return { text: `🚨 Overdue (${formatted})`, color: '#dc2626', bg: '#fee2e2' };
    }
    if (targetStr === todayStr) {
      return { text: `📅 Today Due`, color: '#b45309', bg: '#fef3c7' };
    }
    return { text: `🗓️ ${formatted}`, color: '#0369a1', bg: '#e0f2fe' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Header and Filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <TrendingUp size={22} style={{ color: 'var(--accent-color)' }} /> Performance & Analytics Dashboard
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Work Execution Summary, Task Delegations, Daily Checklists & Pipeline Analytics
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          
          {/* Quick Scope Toggle: My Work vs All */}
          <div style={{ display: 'flex', backgroundColor: 'var(--th-bg)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            {myTeamMember && (
              <button
                onClick={() => setSelectedEmployee(myTeamMember.user_id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  border: 'none',
                  backgroundColor: isMyWorkSelected ? 'var(--accent-color)' : 'transparent',
                  color: isMyWorkSelected ? '#ffffff' : 'var(--text-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                <User size={14} />
                <span>My Assigned Work</span>
              </button>
            )}

            <button
              onClick={() => setSelectedEmployee('All')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                border: 'none',
                backgroundColor: selectedEmployee === 'All' ? 'var(--accent-color)' : 'transparent',
                color: selectedEmployee === 'All' ? '#ffffff' : 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <Users size={14} />
              <span>All Team Members</span>
            </button>
          </div>

          {/* Specific Employee Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--th-bg)', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <select 
              value={selectedEmployee} 
              onChange={(e) => setSelectedEmployee(e.target.value)}
              style={{ background: 'transparent', border: 'none', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', maxWidth: '200px' }}
            >
              <option value="All" style={{ background: 'var(--bg-surface)' }}>All Employees (Team Overview)</option>
              {teamMembers.filter(m => m.emp_name).map(m => (
                <option key={m.user_id} value={m.user_id} style={{ background: 'var(--bg-surface)' }}>
                  {m.emp_name} {myTeamMember?.user_id === m.user_id ? '(You)' : ''}
                </option>
              ))}
            </select>
          </div>

          <DateRangePicker
            preset={datePreset}
            startDate={startDate}
            endDate={endDate}
            allowAllTime={true}
            title="Select Performance Period"
            onChange={({ preset, startDate, endDate }) => {
              setDatePreset(preset);
              setStartDate(startDate);
              setEndDate(endDate);
            }}
          />

          <button
            onClick={() => fetchAssignedWork()}
            title="Refresh All Metrics"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <RefreshCw size={16} className={loadingAssignedWork ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🚀 SECTION: USER ASSIGNED WORK SUMMARY (यूजर को असाइन किए गए काम का सारांश) */}
      {/* ========================================================================= */}
      <div 
        style={{ 
          backgroundColor: 'var(--bg-surface)', 
          borderRadius: '14px', 
          border: '1.5px solid var(--border-light)', 
          padding: '1.5rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem'
        }}
      >
        {/* Section Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ padding: '0.4rem', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', display: 'flex' }}>
                <CheckSquare size={20} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                User Assigned Work & Task Execution Summary
              </h3>
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>Work summary for:</span>
              <strong style={{ color: 'var(--accent-color)', backgroundColor: 'var(--th-bg)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                {isMyWorkSelected ? `👤 Your Profile: ${viewingLabel}` : viewingLabel}
              </strong>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {Boolean(totalOverdueAlerts > 0) && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 700, color: '#dc2626', backgroundColor: '#fee2e2', padding: '0.35rem 0.75rem', borderRadius: '20px', border: '1px solid #fca5a5' }}>
                <AlertTriangle size={14} /> {totalOverdueAlerts} Overdue / Delayed Tasks
              </span>
            )}
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', backgroundColor: 'var(--th-bg)', padding: '0.35rem 0.75rem', borderRadius: '20px' }}>
              {totalPendingActionItems} Action Items Pending
            </span>
          </div>
        </div>

        {/* 4 Assigned Work Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '1.25rem' }}>
          
          {/* 1. Assigned Leads & Action Items Card */}
          <div 
            className="card" 
            style={{ 
              padding: '1.25rem', 
              borderRadius: '10px', 
              borderLeft: '4px solid #3b82f6', 
              backgroundColor: 'var(--bg-primary)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '0.75rem'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  🎯 Assigned Leads
                </span>
                <Target size={18} style={{ color: '#3b82f6' }} />
              </div>
              <div style={{ fontSize: '2.1rem', fontWeight: 800, margin: '0.4rem 0', color: 'var(--text-primary)' }}>
                {assignedLeadStats.total}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span style={{ color: '#d97706', fontWeight: 700 }}>⚡ {assignedLeadStats.actionNeeded} Needs Action</span>
                <span>•</span>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>🏆 {assignedLeadStats.won} Won</span>
              </div>
            </div>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('leads')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                  border: 'none',
                  padding: '0.35rem 0',
                  color: '#3b82f6',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderTop: '1px solid var(--border-light)',
                  marginTop: '0.5rem'
                }}
              >
                <span>Open Leads Database</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>

          {/* 2. Delegated Tasks Card */}
          <div 
            className="card" 
            style={{ 
              padding: '1.25rem', 
              borderRadius: '10px', 
              borderLeft: '4px solid #8b5cf6', 
              backgroundColor: 'var(--bg-primary)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '0.75rem'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  📋 Delegated Tasks
                </span>
                {delegation.overdue > 0 ? (
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#dc2626', backgroundColor: '#fee2e2', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                    🚨 {delegation.overdue} Overdue
                  </span>
                ) : (
                  <ListTodo size={18} style={{ color: '#8b5cf6' }} />
                )}
              </div>
              <div style={{ fontSize: '2.1rem', fontWeight: 800, margin: '0.4rem 0', color: 'var(--text-primary)' }}>
                {loadingAssignedWork ? <Loader2 size={24} className="animate-spin" /> : delegation.total}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 600 }}>⏳ {delegation.pending + delegation.inProgress} Pending</span>
                <span>•</span>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>✅ {delegation.completed} Done</span>
              </div>
            </div>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('delegation')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                  border: 'none',
                  padding: '0.35rem 0',
                  color: '#8b5cf6',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderTop: '1px solid var(--border-light)',
                  marginTop: '0.5rem'
                }}
              >
                <span>Open Task Manager</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>

          {/* 3. Daily Checklists Card */}
          <div 
            className="card" 
            style={{ 
              padding: '1.25rem', 
              borderRadius: '10px', 
              borderLeft: '4px solid #10b981', 
              backgroundColor: 'var(--bg-primary)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '0.75rem'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  ✅ Today's Checklists
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: checklists.totalSlots === 0 ? '#4b5563' : checklists.complianceRate >= 80 ? '#15803d' : '#b45309', backgroundColor: checklists.totalSlots === 0 ? 'var(--th-bg)' : checklists.complianceRate >= 80 ? '#dcfce7' : '#fef3c7', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                  {checklists.totalSlots === 0 ? '🌴 Sunday/Off' : `${checklists.complianceRate}% Score`}
                </span>
              </div>
              <div style={{ fontSize: '2.1rem', fontWeight: 800, margin: '0.4rem 0', color: 'var(--text-primary)' }}>
                {loadingAssignedWork ? (
                  <Loader2 size={24} className="animate-spin" />
                ) : checklists.totalSlots === 0 ? (
                  <span style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Off Duty</span>
                ) : (
                  `${checklists.completed} / ${checklists.totalSlots}`
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {checklists.totalSlots === 0 ? (
                  <span>No scheduled checklists for today</span>
                ) : (
                  <>
                    <span style={{ fontWeight: 600 }}>⏳ {checklists.pending} Pending</span>
                    {checklists.completedLate > 0 && (
                      <>
                        <span>•</span>
                        <span style={{ color: '#d97706', fontWeight: 600 }}>⏰ {checklists.completedLate} Late</span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('checklist')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                  border: 'none',
                  padding: '0.35rem 0',
                  color: '#10b981',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderTop: '1px solid var(--border-light)',
                  marginTop: '0.5rem'
                }}
              >
                <span>Open Checklist Module</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>

          {/* 4. Overall Work Health & Execution Index */}
          <div 
            className="card" 
            style={{ 
              padding: '1.25rem', 
              borderRadius: '10px', 
              borderLeft: `4px solid ${overallCompletionScore >= 75 ? '#10b981' : overallCompletionScore >= 50 ? '#f59e0b' : '#ef4444'}`, 
              backgroundColor: 'var(--bg-primary)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '0.75rem'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  ⚡ Work Health Index
                </span>
                <Sparkles size={18} style={{ color: overallCompletionScore >= 75 ? '#10b981' : '#f59e0b' }} />
              </div>
              <div style={{ fontSize: '2.1rem', fontWeight: 800, margin: '0.4rem 0', color: 'var(--text-primary)' }}>
                {overallCompletionScore}%
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden', margin: '0.4rem 0' }}>
                <div 
                  style={{ 
                    width: `${overallCompletionScore}%`, 
                    height: '100%', 
                    backgroundColor: overallCompletionScore >= 75 ? '#10b981' : overallCompletionScore >= 50 ? '#f59e0b' : '#ef4444',
                    transition: 'width 0.5s ease-in-out'
                  }} 
                />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{totalPendingActionItems} pending items</span>
                <strong style={{ color: overallCompletionScore >= 75 ? '#15803d' : overallCompletionScore >= 50 ? '#b45309' : '#dc2626' }}>
                  {overallCompletionScore >= 80 ? '🌟 Outstanding' : overallCompletionScore >= 50 ? '👍 On Track' : '⚠️ Action Needed'}
                </strong>
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
              Weighted index across Tasks & Follow-ups
            </div>
          </div>

        </div>

        {/* Interactive Detailed Work Breakdown Tabs */}
        <div style={{ marginTop: '0.5rem' }}>
          {/* Tab Navigation */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid var(--border-light)', paddingBottom: '0.25rem', overflowX: 'auto' }}>
            <button
              onClick={() => setActiveWorkTab('leads')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1.1rem',
                border: 'none',
                background: 'none',
                fontSize: '0.9rem',
                fontWeight: activeWorkTab === 'leads' ? 700 : 500,
                color: activeWorkTab === 'leads' ? 'var(--accent-color)' : 'var(--text-secondary)',
                borderBottom: activeWorkTab === 'leads' ? '2.5px solid var(--accent-color)' : '2.5px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <Target size={16} />
              <span>Assigned Leads & Follow-ups</span>
              <span style={{ fontSize: '0.75rem', backgroundColor: activeWorkTab === 'leads' ? 'var(--accent-color)' : 'var(--th-bg)', color: activeWorkTab === 'leads' ? '#fff' : 'var(--text-secondary)', padding: '0.1rem 0.45rem', borderRadius: '10px' }}>
                {filteredLeadsSync.length}
              </span>
            </button>

            <button
              onClick={() => setActiveWorkTab('delegation')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1.1rem',
                border: 'none',
                background: 'none',
                fontSize: '0.9rem',
                fontWeight: activeWorkTab === 'delegation' ? 700 : 500,
                color: activeWorkTab === 'delegation' ? 'var(--accent-color)' : 'var(--text-secondary)',
                borderBottom: activeWorkTab === 'delegation' ? '2.5px solid var(--accent-color)' : '2.5px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <ListTodo size={16} />
              <span>Assigned Delegation Tasks</span>
              <span style={{ fontSize: '0.75rem', backgroundColor: activeWorkTab === 'delegation' ? 'var(--accent-color)' : 'var(--th-bg)', color: activeWorkTab === 'delegation' ? '#fff' : 'var(--text-secondary)', padding: '0.1rem 0.45rem', borderRadius: '10px' }}>
                {delegation.total}
              </span>
            </button>

            <button
              onClick={() => setActiveWorkTab('checklists')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1.1rem',
                border: 'none',
                background: 'none',
                fontSize: '0.9rem',
                fontWeight: activeWorkTab === 'checklists' ? 700 : 500,
                color: activeWorkTab === 'checklists' ? 'var(--accent-color)' : 'var(--text-secondary)',
                borderBottom: activeWorkTab === 'checklists' ? '2.5px solid var(--accent-color)' : '2.5px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <CheckSquare size={16} />
              <span>Today's Checklists</span>
              <span style={{ fontSize: '0.75rem', backgroundColor: activeWorkTab === 'checklists' ? 'var(--accent-color)' : 'var(--th-bg)', color: activeWorkTab === 'checklists' ? '#fff' : 'var(--text-secondary)', padding: '0.1rem 0.45rem', borderRadius: '10px' }}>
                {checklists.totalSlots}
              </span>
            </button>
          </div>

          {/* TAB 1: ASSIGNED LEADS & FOLLOW-UPS */}
          {activeWorkTab === 'leads' && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                {/* Actionable Sub-filters */}
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {[
                    { id: 'ACTION_NEEDED', label: '⚡ Needs Action', count: assignedLeadStats.actionNeeded },
                    { id: 'OVERDUE_FOLLOWUPS', label: '🚨 Overdue Follow-ups', count: assignedLeadStats.overdueFollowups, alert: assignedLeadStats.overdueFollowups > 0 },
                    { id: 'TODAY_FOLLOWUPS', label: '📅 Today Due', count: assignedLeadStats.todayFollowups },
                    { id: 'FOLLOW_UPS', label: '📞 All Follow-ups', count: assignedLeadStats.followUps },
                    { id: 'NEW', label: '🆕 Fresh Leads', count: assignedLeadStats.newLeads },
                    { id: 'PIPELINE', label: '🔄 In Pipeline', count: assignedLeadStats.inPipeline },
                    { id: 'WON', label: '🏆 Won Deals', count: assignedLeadStats.won },
                    { id: 'ALL', label: '📑 All Leads', count: assignedLeadStats.total }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setLeadFilter(f.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.3rem 0.65rem',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        border: leadFilter === f.id ? '1px solid var(--accent-color)' : f.alert ? '1px solid #fca5a5' : '1px solid var(--border-light)',
                        backgroundColor: leadFilter === f.id ? 'var(--accent-color)' : f.alert ? '#fee2e2' : 'var(--bg-surface)',
                        color: leadFilter === f.id ? '#ffffff' : f.alert ? '#dc2626' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      <span>{f.label}</span>
                      <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>({f.count})</span>
                    </button>
                  ))}
                </div>

                {onNavigateTab && (
                  <button
                    onClick={() => onNavigateTab('leads')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-color)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <span>View all in Leads Database</span>
                    <ExternalLink size={13} />
                  </button>
                )}
              </div>

              {displayedLeads.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--th-bg)', borderRadius: '8px', fontSize: '0.88rem' }}>
                  No leads found for this filter in {viewingLabel}'s workload.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)' }}>
                        <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Lead / Company</th>
                        <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Current Stage</th>
                        <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Contact Info</th>
                        <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Follow-up Due / Schedule</th>
                        <th style={{ textAlign: 'center', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Status & Call Response</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedLeads.slice(0, 20).map(lead => {
                        const stage = getStageFromStatus(lead.status);
                        const displayObj = formatLeadDisplayName(lead);
                        const statusBadge = formatLeadStatusBadge(lead.status);
                        const phone = getLeadContactPhone(lead);
                        const followUpBadge = formatFollowUpDue(lead.follow_up_date || lead.next_follow_up_date);

                        return (
                          <tr key={lead.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-primary)' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Building2 size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                                <span>{displayObj.title}</span>
                              </div>
                              {displayObj.subtitle && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  {displayObj.hasPerson ? (
                                    <span>👤 {displayObj.subtitle}</span>
                                  ) : (
                                    <span>📍 {displayObj.subtitle}</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>
                                {stage.split('- ')[1] || stage}
                              </span>
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              {phone ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                  <Phone size={12} style={{ color: 'var(--accent-color)' }} />
                                  <span>{phone}</span>
                                </div>
                              ) : (
                                <div>-</div>
                              )}
                              {lead.email && (
                                <div style={{ fontSize: '0.72rem', marginTop: '0.15rem' }}>{lead.email}</div>
                              )}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                              {followUpBadge ? (
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '4px', backgroundColor: followUpBadge.bg, color: followUpBadge.color }}>
                                  {followUpBadge.text}
                                </span>
                              ) : lead.deal_value ? (
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>₹{Number(lead.deal_value).toLocaleString('en-IN')}</span>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)' }}>Not Scheduled</span>
                              )}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                              <span 
                                style={{ 
                                  fontSize: '0.75rem', 
                                  fontWeight: 700, 
                                  padding: '0.25rem 0.6rem', 
                                  borderRadius: '12px', 
                                  backgroundColor: statusBadge.bg,
                                  color: statusBadge.color,
                                  border: `1px solid ${statusBadge.border}`,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem'
                                }}
                              >
                                {statusBadge.icon && <span>{statusBadge.icon}</span>}
                                <span>{statusBadge.label}</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {displayedLeads.length > 20 && (
                    <div style={{ textAlign: 'center', padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-light)' }}>
                      Showing top 20 of {displayedLeads.length} leads in this view.{' '}
                      {onNavigateTab && (
                        <button
                          onClick={() => onNavigateTab('leads')}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                        >
                          Open complete Leads Database →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DELEGATION TASKS LIST */}
          {activeWorkTab === 'delegation' && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {['ALL', 'PENDING', 'OVERDUE', 'COMPLETED'].map((filterKey) => (
                    <button
                      key={filterKey}
                      onClick={() => setTaskFilter(filterKey)}
                      style={{
                        padding: '0.3rem 0.65rem',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        border: taskFilter === filterKey ? '1px solid var(--accent-color)' : '1px solid var(--border-light)',
                        backgroundColor: taskFilter === filterKey ? 'var(--accent-color)' : 'var(--bg-surface)',
                        color: taskFilter === filterKey ? '#ffffff' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      {filterKey === 'OVERDUE' ? '🚨 Overdue' : filterKey.charAt(0) + filterKey.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>

                {onNavigateTab && (
                  <button
                    onClick={() => onNavigateTab('delegation')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-color)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <span>View all in Task Manager</span>
                    <ExternalLink size={13} />
                  </button>
                )}
              </div>

              {loadingAssignedWork ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Loader2 size={24} className="animate-spin" />
                </div>
              ) : filteredTasks.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--th-bg)', borderRadius: '8px', fontSize: '0.88rem' }}>
                  No delegation tasks found matching this filter for {viewingLabel}.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)' }}>
                        <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Task Code & Title</th>
                        <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Priority</th>
                        <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Delegated By</th>
                        <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Deadline</th>
                        <th style={{ textAlign: 'center', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.map(t => {
                        const pStyle = getPriorityBadge(t.priority);
                        const sStyle = getStatusBadge(t.status, t.is_overdue);
                        return (
                          <tr key={t.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-primary)' }}>
                              <div style={{ fontWeight: 600 }}>{t.title}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{t.task_code} • {t.category}</div>
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '4px', backgroundColor: pStyle.bg, color: pStyle.color, border: `1px solid ${pStyle.border}` }}>
                                {t.priority}
                              </span>
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                              {t.delegated_by_name || t.delegated_by_email || 'Delegator'}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.82rem', color: t.is_overdue ? '#dc2626' : 'var(--text-primary)', fontWeight: t.is_overdue ? 700 : 400 }}>
                              {formatDeadline(t.deadline)}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '12px', backgroundColor: sStyle.bg, color: sStyle.color, border: `1px solid ${sStyle.border}` }}>
                                {sStyle.label}
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
          )}

          {/* TAB 3: TODAY'S CHECKLISTS */}
          {activeWorkTab === 'checklists' && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Today's scheduled checklist routine and compliance status for {viewingLabel}.
                </div>

                {onNavigateTab && (
                  <button
                    onClick={() => onNavigateTab('checklist')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-color)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <span>Execute in Checklist Module</span>
                    <ExternalLink size={13} />
                  </button>
                )}
              </div>

              {loadingAssignedWork ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Loader2 size={24} className="animate-spin" />
                </div>
              ) : checklists.items.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--th-bg)', borderRadius: '8px', fontSize: '0.88rem' }}>
                  {checklists.isSunday ? '🌴 Today is Sunday (No scheduled checklist routines).' : checklists.holidayInfo?.isHoliday ? `Today is a Company Holiday: ${checklists.holidayInfo.holidayName}` : 'No checklist templates assigned for today.'}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)' }}>
                        <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Checklist Template</th>
                        <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Frequency</th>
                        <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Target Due Time</th>
                        <th style={{ textAlign: 'center', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Execution Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checklists.items.map((item, idx) => {
                        const isDone = item.status === 'COMPLETED';
                        const isLate = item.isDelayed;
                        return (
                          <tr key={`${item.id || idx}_${item.slot_id}`} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              <div>{item.title}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{item.department}</div>
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: 'var(--th-bg)', color: 'var(--text-secondary)' }}>
                                {item.frequency}
                              </span>
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Clock size={13} style={{ color: 'var(--text-secondary)' }} />
                                {item.due_time || '18:00'}
                              </div>
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                              {isDone ? (
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '12px', backgroundColor: isLate ? '#fef3c7' : '#dcfce7', color: isLate ? '#b45309' : '#15803d', border: `1px solid ${isLate ? '#fde68a' : '#86efac'}` }}>
                                  {isLate ? '⚠️ Done Late' : '✅ Completed'}
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '12px', backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}>
                                  ⏳ Pending Today
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 PIPELINE & OVERALL PERFORMANCE CHARTS SECTION */}
      {/* ========================================================================= */}
      
      {/* Top Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1.5rem' }}>
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--chart-1, #3b82f6)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Leads In Scope</h3>
          <p style={{ fontSize: '2rem', fontWeight: 700, margin: '0.5rem 0' }}>{assignedLeadStats.total}</p>
        </div>
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--chart-2, #10b981)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Deals Won</h3>
          <p style={{ fontSize: '2rem', fontWeight: 700, margin: '0.5rem 0' }}>{assignedLeadStats.won}</p>
        </div>
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--chart-3, #f59e0b)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Follow-up & Rescheduled</h3>
          <p style={{ fontSize: '2rem', fontWeight: 700, margin: '0.5rem 0' }}>{assignedLeadStats.followUps}</p>
        </div>
        <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--chart-4, #8b5cf6)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>WhatsApp Sent ({dateFilterLabel})</h3>
          <div style={{ fontSize: '2rem', fontWeight: 700, margin: '0.5rem 0', display: 'flex', alignItems: 'center' }}>
            {loading ? <Loader2 size={24} className="animate-spin" /> : metrics.whatsappStats.period}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Pipeline Funnel */}
        <div className="card" style={{ padding: '1.5rem', minHeight: '350px', gridColumn: '1 / -1' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.5rem' }}>Leads by Stage</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stageData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)' }} />
              <RechartsTooltip cursor={{fill: 'var(--bg-primary)'}} contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Bar dataKey="count" fill="var(--accent-color)" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="count" position="top" style={{ fill: 'var(--text-primary)', fontSize: 12, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Employee Activity Column */}
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', backgroundColor: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={18} style={{ color: 'var(--accent-color)' }} /> Employee Activity Updates
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{dateFilterLabel}</span>
          </div>
          <div style={{ padding: '1rem', minHeight: '300px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: 'var(--text-secondary)' }}>
                <Loader2 size={32} className="animate-spin" />
              </div>
            ) : metrics.employeeActivity.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                No activity recorded for {dateFilterLabel.toLowerCase()}.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead style={{ backgroundColor: 'var(--th-bg)' }}>
                  <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
                    <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>Employee</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>Unique Leads</th>
                    <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>Updates</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.employeeActivity.map((act, i) => (
                    <tr key={act.employee} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: COLORS[i % COLORS.length], color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
                            {act.employee.substring(0, 2).toUpperCase()}
                          </div>
                          {act.employee}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {act.uniqueLeads}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 600, color: 'var(--accent-color)' }}>
                        {act.actions}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Revenue by Source */}
        <div className="card" style={{ padding: '1.5rem', minHeight: '350px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.5rem' }}>Potential Revenue by Source</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={revenueData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {revenueData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip formatter={(value) => `₹${value.toLocaleString('en-IN')}`} contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  );
}
