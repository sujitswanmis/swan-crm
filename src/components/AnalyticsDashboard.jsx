'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList
} from 'recharts';
import { getDashboardMetrics, getUserAssignedWorkSummary } from '@/app/actions/analytics';
import {
  Activity, Loader2, Users, AlertTriangle, TrendingUp, ArrowRight,
  Target, RefreshCw, User, CheckSquare, CheckCircle2, CalendarClock
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
  const [datePreset, setDatePreset] = useState('today');
  const [startDate, setStartDate] = useState(() => computeDateRange('today').startDate);
  const [endDate, setEndDate] = useState(() => computeDateRange('today').endDate);

  const myTeamMember = useMemo(() => {
    if (!teamMembers || teamMembers.length === 0) return null;
    return teamMembers.find(t =>
      (userEmail && (t.email?.toLowerCase() === userEmail?.toLowerCase() || t.user_id === userEmail)) ||
      (userName && t.emp_name && t.emp_name.toLowerCase() === userName.toLowerCase()) ||
      (userId && t.user_id === userId)
    );
  }, [teamMembers, userEmail, userName, userId]);

  const formattedEmployees = useMemo(() => {
    return teamMembers.map(m => ({
      ...m,
      name: m.emp_name || m.name || m.user_id,
      emp_name: m.emp_name || m.name || m.user_id,
      email: m.email || m.user_id,
      user_id: m.user_id || m.email,
      department: m.department || m.emp_department || m.dept || 'Staff',
      designation: m.designation || m.role || 'Member'
    }));
  }, [teamMembers]);

  const [selectedEmployee, setSelectedEmployee] = useState('All');
  const [metrics, setMetrics] = useState({ employeeActivity: [], whatsappStats: { period: 0, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [loadingAssignedWork, setLoadingAssignedWork] = useState(true);
  const [assignedWork, setAssignedWork] = useState({
    delegation: { total: 0, pending: 0, inProgress: 0, submitted: 0, completed: 0, overdue: 0, recentTasks: [] },
    checklists: { totalSlots: 0, completed: 0, completedLate: 0, pending: 0, complianceRate: 0, isSunday: false, items: [] },
    effectiveEmail: ''
  });

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

  const revenueData = useMemo(() => {
    const bySource = filteredLeadsSync.reduce((acc, lead) => {
      if (lead.status !== 'Lost' && lead.deal_value) {
        acc[lead.source] = (acc[lead.source] || 0) + Number(lead.deal_value);
      }
      return acc;
    }, {});
    return Object.keys(bySource).map(source => ({ name: source, value: bySource[source] }));
  }, [filteredLeadsSync]);

  const delegation = assignedWork.delegation || { total: 0, pending: 0, inProgress: 0, submitted: 0, completed: 0, overdue: 0, recentTasks: [] };
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
              let empKey = note.created_by || lead.assigned_to || 'Unknown';
              let empName = empKey;
              const tm = teamMembers.find(t => t.user_id === empKey || t.email === empKey || (t.email && t.email.split('@')[0] === empKey) || t.emp_name === empKey);
              if (tm?.emp_name) empName = tm.emp_name;
              if (!employeeActivityMap[empName]) employeeActivityMap[empName] = { updates: 0, uniqueLeads: new Set() };
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
  }, [filteredLeadsSync, startDate, endDate, datePreset, teamMembers]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

      {/* ======== HEADER ======== */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: 'var(--bg-surface)', padding: '1rem 1.25rem',
        borderRadius: '12px', border: '1px solid var(--border-light)',
        flexWrap: 'wrap', gap: '0.85rem'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={20} style={{ color: 'var(--accent-color)' }} />
            Performance & Analytics Dashboard
          </h2>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Viewing: <strong style={{ color: 'var(--accent-color)' }}>{viewingLabel}</strong>
            {' · '}{dateFilterLabel}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* My Work / All Team quick toggle */}
          <div style={{ display: 'flex', backgroundColor: 'var(--th-bg)', padding: '0.18rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            {myTeamMember && (
              <button
                onClick={() => setSelectedEmployee(myTeamMember.user_id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600,
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
                padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600,
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
          <div style={{ minWidth: '210px', maxWidth: '280px' }}>
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
            onClick={fetchAssignedWork}
            title="Refresh"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0.45rem 0.65rem', borderRadius: '8px',
              border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)', cursor: 'pointer'
            }}
          >
            <RefreshCw size={15} className={loadingAssignedWork ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ======== 5 KPI CARDS ======== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 185px), 1fr))', gap: '1rem' }}>

        {/* KPI 1: Assigned Leads */}
        <div className="card" style={{ padding: '1.15rem', borderLeft: '4px solid #3b82f6', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>🎯 Assigned Leads</span>
            <Target size={15} style={{ color: '#3b82f6' }} />
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{kpis.total.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '0.73rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ color: '#d97706', fontWeight: 700 }}>⚡ {kpis.actionNeeded} Need Action</span>
            <span style={{ color: '#16a34a', fontWeight: 600 }}>🏆 {kpis.won} Won</span>
          </div>
          {onNavigateTab && (
            <button onClick={() => onNavigateTab('leads')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: '0.35rem 0 0', borderTop: '1px solid var(--border-light)', marginTop: 'auto' }}>
              Open Leads <ArrowRight size={11} />
            </button>
          )}
        </div>

        {/* KPI 2: Follow-ups */}
        <div className="card" style={{ padding: '1.15rem', borderLeft: `4px solid ${kpis.overdueFollowups > 0 ? '#ef4444' : '#f59e0b'}`, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>📞 Follow-ups</span>
            <CalendarClock size={15} style={{ color: kpis.overdueFollowups > 0 ? '#ef4444' : '#f59e0b' }} />
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{kpis.followUps.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: '0.73rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {kpis.overdueFollowups > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>🚨 {kpis.overdueFollowups} Overdue</span>}
            <span style={{ color: '#b45309', fontWeight: 600 }}>📅 {kpis.todayFollowups} Today</span>
          </div>
          {onNavigateTab && (
            <button onClick={() => onNavigateTab('leads')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: '#f59e0b', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: '0.35rem 0 0', borderTop: '1px solid var(--border-light)', marginTop: 'auto' }}>
              Open Leads <ArrowRight size={11} />
            </button>
          )}
        </div>

        {/* KPI 3: Deals Won */}
        <div className="card" style={{ padding: '1.15rem', borderLeft: '4px solid #10b981', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>🏆 Deals Won</span>
            <CheckCircle2 size={15} style={{ color: '#10b981' }} />
          </div>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{kpis.won}</div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>{kpis.inPipeline} in active pipeline</div>
          {onNavigateTab && (
            <button onClick={() => onNavigateTab('leads')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: '#10b981', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: '0.35rem 0 0', borderTop: '1px solid var(--border-light)', marginTop: 'auto' }}>
              Pipeline View <ArrowRight size={11} />
            </button>
          )}
        </div>

        {/* KPI 4: Delegated Tasks */}
        <div className="card" style={{ padding: '1.15rem', borderLeft: `4px solid ${delegation.overdue > 0 ? '#ef4444' : '#8b5cf6'}`, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
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
          {onNavigateTab && (
            <button onClick={() => onNavigateTab('delegation')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: '#8b5cf6', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: '0.35rem 0 0', borderTop: '1px solid var(--border-light)', marginTop: 'auto' }}>
              Task Manager <ArrowRight size={11} />
            </button>
          )}
        </div>

        {/* KPI 5: Work Health */}
        <div className="card" style={{
          padding: '1.15rem',
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

      {/* ======== QUICK ACTION ALERTS (only when urgent) ======== */}
      {(kpis.overdueFollowups > 0 || kpis.todayFollowups > 0 || delegation.overdue > 0 || (delegation.pending + delegation.inProgress) > 0 || (checklists.totalSlots > 0 && checklists.pending > 0)) && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center',
          padding: '0.85rem 1.1rem',
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
            <button onClick={() => onNavigateTab?.('delegation')} style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.35rem 0.8rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700,
              backgroundColor: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', cursor: 'pointer'
            }}>
              🚨 {delegation.overdue} Tasks Overdue → Task Manager
            </button>
          )}

          {(delegation.pending + delegation.inProgress) > 0 && delegation.overdue === 0 && (
            <button onClick={() => onNavigateTab?.('delegation')} style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.35rem 0.8rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700,
              backgroundColor: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe', cursor: 'pointer'
            }}>
              📋 {delegation.pending + delegation.inProgress} Tasks Pending → Task Manager
            </button>
          )}

          {checklists.totalSlots > 0 && checklists.pending > 0 && (
            <button onClick={() => onNavigateTab?.('checklist')} style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.35rem 0.8rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700,
              backgroundColor: '#dcfce7', color: '#15803d', border: '1px solid #86efac', cursor: 'pointer'
            }}>
              ✅ {checklists.pending} Checklists Pending → Open Checklist
            </button>
          )}
        </div>
      )}

      {/* ======== CHARTS + ACTIVITY ROW ======== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>

        {/* Leads by Stage Bar Chart — spans full width */}
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

        {/* Employee Activity — Top 10 */}
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '0.85rem 1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--th-bg)' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Activity size={15} style={{ color: 'var(--accent-color)' }} /> Employee Activity
            </h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{dateFilterLabel}</span>
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--th-bg)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem 1rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Employee</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Leads Touched</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 1rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem' }}>Updates</th>
                </tr>
              </thead>
              <tbody>
                {metrics.employeeActivity.slice(0, 10).map((act, i) => (
                  <tr key={act.employee} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '0.55rem 1rem', color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                          width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                          backgroundColor: COLORS[i % COLORS.length], color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700
                        }}>
                          {act.employee.substring(0, 2).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>{act.employee}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.55rem', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>{act.uniqueLeads}</td>
                    <td style={{ padding: '0.55rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--accent-color)' }}>{act.actions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Revenue by Source */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem' }}>Potential Revenue by Source</h3>
          {revenueData.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.83rem' }}>No deal value data available.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={revenueData} cx="50%" cy="50%" innerRadius={50} outerRadius={88} paddingAngle={4} dataKey="value">
                  {revenueData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value) => [`\u20B9${value.toLocaleString('en-IN')}`, 'Revenue']}
                  contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '8px' }}
                />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '0.73rem' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pipeline Summary Mini Card */}
        <div className="card" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Pipeline Summary</h3>
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
  );
}
