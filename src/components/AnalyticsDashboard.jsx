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
  ShieldAlert, RefreshCw, Layers, PhoneCall, ExternalLink
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
  
  // Default to 'All' or individual employee
  const [selectedEmployee, setSelectedEmployee] = useState('All');
  const [metrics, setMetrics] = useState({ employeeActivity: [], whatsappStats: { period: 0, total: 0 } });
  const [loading, setLoading] = useState(true);

  // Assigned Work State
  const [assignedWork, setAssignedWork] = useState({
    delegation: { total: 0, pending: 0, inProgress: 0, submitted: 0, completed: 0, overdue: 0, recentTasks: [] },
    checklists: { totalSlots: 0, completed: 0, completedLate: 0, pending: 0, complianceRate: 0, items: [] },
    effectiveEmail: ''
  });
  const [loadingAssignedWork, setLoadingAssignedWork] = useState(true);
  const [activeWorkTab, setActiveWorkTab] = useState('delegation'); // 'delegation' | 'checklists' | 'leads'
  const [taskFilter, setTaskFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'OVERDUE' | 'COMPLETED'

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
    const newLeads = filteredLeadsSync.filter(l => {
      const stage = getStageFromStatus(l.status);
      return stage === '01 - New Stage' || l.status === 'New' || l.status === 'Pending';
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
      return stage === '07 - Final Stage' && (l.status?.includes('Won') || l.status?.includes('Converted') || l.status?.includes('Closed'));
    }).length;
    return { total, newLeads, followUps, inPipeline, won };
  }, [filteredLeadsSync]);

  // Overall Health / Assigned Work Summary Stats
  const delegation = assignedWork.delegation || { total: 0, pending: 0, inProgress: 0, submitted: 0, completed: 0, overdue: 0, recentTasks: [] };
  const checklists = assignedWork.checklists || { totalSlots: 0, completed: 0, completedLate: 0, pending: 0, complianceRate: 0, items: [] };

  const totalAssignedWorkItems = delegation.total + checklists.totalSlots + assignedLeadStats.total;
  const totalCompletedWorkItems = delegation.completed + checklists.completed + assignedLeadStats.won;
  const overallCompletionScore = totalAssignedWorkItems > 0 
    ? Math.round((totalCompletedWorkItems / totalAssignedWorkItems) * 100) 
    : 0;

  const totalPendingActionItems = delegation.pending + delegation.inProgress + checklists.pending + assignedLeadStats.newLeads + assignedLeadStats.followUps;
  const totalOverdueAlerts = delegation.overdue + checklists.completedLate;

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Header and Filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <TrendingUp size={22} style={{ color: 'var(--accent-color)' }} /> Performance & Analytics Dashboard
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Comprehensive Work Execution, Task Delegations, Daily Checklists & Pipeline Analytics
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--th-bg)', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <Users size={16} style={{ color: 'var(--text-secondary)' }} />
            <select 
              value={selectedEmployee} 
              onChange={(e) => setSelectedEmployee(e.target.value)}
              style={{ background: 'transparent', border: 'none', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', maxWidth: '200px' }}
            >
              <option value="All" style={{ background: 'var(--bg-surface)' }}>All Employees</option>
              {teamMembers.filter(m => m.emp_name).map(m => (
                <option key={m.user_id} value={m.user_id} style={{ background: 'var(--bg-surface)' }}>{m.emp_name}</option>
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
            onClick={() => {
              fetchAssignedWork();
            }}
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
              <span>Viewing assigned workload for:</span>
              <strong style={{ color: 'var(--accent-color)', backgroundColor: 'var(--th-bg)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                {viewingLabel}
              </strong>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {totalOverdueAlerts > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 700, color: '#dc2626', backgroundColor: '#fee2e2', padding: '0.35rem 0.75rem', borderRadius: '20px', border: '1px solid #fca5a5' }}>
                <AlertTriangle size={14} /> {totalOverdueAlerts} Overdue / Delayed Tasks
              </span>
            )}
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', backgroundColor: 'var(--th-bg)', padding: '0.35rem 0.75rem', borderRadius: '20px' }}>
              {totalAssignedWorkItems} Total Work Items
            </span>
          </div>
        </div>

        {/* 4 Assigned Work Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '1.25rem' }}>
          
          {/* 1. Delegated Tasks Card */}
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

          {/* 2. Daily Checklists Card */}
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
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: checklists.complianceRate >= 80 ? '#15803d' : '#b45309', backgroundColor: checklists.complianceRate >= 80 ? '#dcfce7' : '#fef3c7', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                  {checklists.complianceRate}% Score
                </span>
              </div>
              <div style={{ fontSize: '2.1rem', fontWeight: 800, margin: '0.4rem 0', color: 'var(--text-primary)' }}>
                {loadingAssignedWork ? (
                  <Loader2 size={24} className="animate-spin" />
                ) : (
                  `${checklists.completed} / ${checklists.totalSlots}`
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 600 }}>⏳ {checklists.pending} Pending</span>
                {checklists.completedLate > 0 && (
                  <>
                    <span>•</span>
                    <span style={{ color: '#d97706', fontWeight: 600 }}>⏰ {checklists.completedLate} Late</span>
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

          {/* 3. Assigned Leads Card */}
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
                <span style={{ fontWeight: 600 }}>🆕 {assignedLeadStats.newLeads} New</span>
                <span>•</span>
                <span style={{ color: '#d97706', fontWeight: 600 }}>📞 {assignedLeadStats.followUps} Follow-ups</span>
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
              Calculated across Tasks, Checklists & Leads
            </div>
          </div>

        </div>

        {/* Interactive Detailed Work Breakdown Tabs */}
        <div style={{ marginTop: '0.5rem' }}>
          {/* Tab Navigation */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid var(--border-light)', paddingBottom: '0.25rem', overflowX: 'auto' }}>
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
          </div>

          {/* TAB 1: DELEGATION TASKS LIST */}
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
                  No delegation tasks found matching this filter.
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

          {/* TAB 2: TODAY'S CHECKLISTS */}
          {activeWorkTab === 'checklists' && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Today's scheduled checklist routine and compliance status.
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
                  {checklists.isSunday ? 'Today is Sunday (No scheduled checklists).' : checklists.holidayInfo?.isHoliday ? `Today is a Company Holiday: ${checklists.holidayInfo.holidayName}` : 'No checklist templates assigned for today.'}
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

          {/* TAB 3: ASSIGNED LEADS & FOLLOW-UPS */}
          {activeWorkTab === 'leads' && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Active Leads, Follow-ups and conversions assigned to {viewingLabel}.
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

              {filteredLeadsSync.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--th-bg)', borderRadius: '8px', fontSize: '0.88rem' }}>
                  No leads assigned to this employee.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--th-bg)', borderBottom: '1px solid var(--border-light)' }}>
                        <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Lead / Company</th>
                        <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Current Stage</th>
                        <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Contact Info</th>
                        <th style={{ textAlign: 'right', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Deal Value</th>
                        <th style={{ textAlign: 'center', padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeadsSync.slice(0, 15).map(lead => {
                        const stage = getStageFromStatus(lead.status);
                        const isWon = stage === '07 - Final Stage' && (lead.status?.includes('Won') || lead.status?.includes('Converted') || lead.status?.includes('Closed'));
                        const isFollowUp = stage === '04 - Follow Up Stage' || (lead.status && lead.status.includes('ReSchedule'));
                        return (
                          <tr key={lead.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-primary)' }}>
                              <div style={{ fontWeight: 600 }}>{lead.name || 'Unnamed Lead'}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{lead.company || 'Individual'}</div>
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>
                                {stage.split('- ')[1] || stage}
                              </span>
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              <div>{lead.phone || '-'}</div>
                              <div style={{ fontSize: '0.72rem' }}>{lead.email || ''}</div>
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {lead.deal_value ? `₹${Number(lead.deal_value).toLocaleString('en-IN')}` : '-'}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                              <span 
                                style={{ 
                                  fontSize: '0.72rem', 
                                  fontWeight: 700, 
                                  padding: '0.2rem 0.5rem', 
                                  borderRadius: '12px', 
                                  backgroundColor: isWon ? '#dcfce7' : isFollowUp ? '#fef3c7' : '#f1f5f9',
                                  color: isWon ? '#15803d' : isFollowUp ? '#b45309' : '#475569',
                                  border: `1px solid ${isWon ? '#86efac' : isFollowUp ? '#fde68a' : '#cbd5e1'}`
                                }}
                              >
                                {lead.status || 'Active'}
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
